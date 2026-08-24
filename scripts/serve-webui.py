#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AgriLoop web-ui 本地静态服务器（开发资源智能缓存）
用法: python scripts/serve-webui.py [port]   默认端口 3000
说明: HTML/JS/CSS 每次刷新都会向服务器校验，保证代码改动及时生效；
      图片、字体和 vendor 依赖短期复用，避免重复刷新时重新传输大资源。
"""
import http.server
import json
import os
import socketserver
import sys
from urllib.parse import urlsplit

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
WEB_UI_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "apps", "web-ui"))


ASSET_EXTENSIONS = {".avif", ".gif", ".ico", ".jpg", ".jpeg", ".png", ".svg", ".webp", ".woff", ".woff2"}


class DevelopmentCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_UI_DIR, **kwargs)

    def end_headers(self):
        path = urlsplit(self.path).path.lower()
        extension = os.path.splitext(path)[1]
        if path.startswith("/vendor/") or extension in ASSET_EXTENSIONS:
            # 文件名稳定但未全部带内容哈希，因此只缓存一天，不使用 immutable。
            self.send_header("Cache-Control", "public, max-age=86400")
        else:
            # no-cache 允许浏览器保留副本并通过 Last-Modified 获取 304；
            # 与 no-store 相比既能看见代码更新，也不会无条件重复下载。
            self.send_header("Cache-Control", "no-cache, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        super().end_headers()

    def do_POST(self):
        """Return a machine-readable offline response for the static-only mode.

        Without this handler SimpleHTTPRequestHandler emits an HTML 501 page.
        The frontend cannot distinguish that page from a broken form submit,
        so demo login never gets a chance to use its intentional offline path.
        A 503 JSON response is treated as a backend-unavailable condition by
        ApiService while ordinary static assets continue to be served locally.
        """
        if urlsplit(self.path).path.startswith("/api/"):
            payload = json.dumps({
                "error": {
                    "code": "BACKEND_OFFLINE",
                    "message": "本地只启动了 Web 界面，后端服务尚未启动"
                }
            }, ensure_ascii=False).encode("utf-8")
            self.send_response(503)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(payload)
            return
        self.send_error(405, "POST 仅支持 /api/ 路径")

    def log_message(self, fmt, *args):
        sys.stderr.write("[web-ui] %s %s\n" % (self.address_string(), fmt % args))


# 多线程 + 大连接队列：
# 浏览器无缓存时会并行请求 7+ 个资源，单线程 TCPServer 的默认 backlog(5)
# 会拒绝超出队列的连接，浏览器被迫重试导致首次加载明显变慢（main 分支
# 资源少恰好不触发，yyx 分支会触发）。改用多线程服务器后所有连接并行处理。
class ThreadingServer(http.server.ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 64


if __name__ == "__main__":
    with ThreadingServer(("127.0.0.1", PORT), DevelopmentCacheHandler) as httpd:
        print("AgriLoop web-ui serving %s at http://127.0.0.1:%d (smart-cache, threaded)" % (WEB_UI_DIR, PORT))
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nserver stopped")
