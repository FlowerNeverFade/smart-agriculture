#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AgriLoop web-ui 本地静态服务器（禁用浏览器缓存）
用法: python scripts/serve-webui.py [port]   默认端口 3000
说明: 相比 `python -m http.server`，本脚本对所有响应附加
      Cache-Control: no-cache, no-store 头，前端改动后刷新即生效，
      避免浏览器用 Last-Modified 缓存旧 JS/CSS。
"""
import http.server
import os
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
WEB_UI_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "apps", "web-ui"))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_UI_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

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
    with ThreadingServer(("127.0.0.1", PORT), NoCacheHandler) as httpd:
        print("AgriLoop web-ui serving %s at http://127.0.0.1:%d (no-cache, threaded)" % (WEB_UI_DIR, PORT))
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nserver stopped")
