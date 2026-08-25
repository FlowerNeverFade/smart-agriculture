#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AgriLoop web-ui 本地静态服务器（开发资源智能缓存）
用法: python scripts/serve-webui.py [port]   默认端口 3000
说明: HTML/JS/CSS 每次刷新都会向服务器校验，保证代码改动及时生效；
      图片、字体和 vendor 依赖短期复用，避免重复刷新时重新传输大资源。
"""
import http.server
import os
import socketserver
import sys
import urllib.error
import urllib.request
from urllib.parse import urlsplit

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
WEB_UI_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "apps", "web-ui"))
API_UPSTREAM = os.environ.get("AGRILOOP_API_URL", "http://127.0.0.1:8080").rstrip("/")


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

    def log_message(self, fmt, *args):
        sys.stderr.write("[web-ui] %s %s\n" % (self.address_string(), fmt % args))

    def _is_api_request(self):
        path = urlsplit(self.path).path
        return path.startswith("/api/") or path.startswith("/actuator/")

    def _proxy_to_api(self):
        content_length = int(self.headers.get("Content-Length", "0") or 0)
        body = self.rfile.read(content_length) if content_length else None
        headers = {
            name: value
            for name, value in self.headers.items()
            if name.lower() in {"accept", "authorization", "content-type", "last-event-id"}
        }
        request = urllib.request.Request(
            API_UPSTREAM + self.path,
            data=body,
            headers=headers,
            method=self.command,
        )

        try:
            response = urllib.request.urlopen(request, timeout=65)
        except urllib.error.HTTPError as error:
            response = error
        except urllib.error.URLError as error:
            payload = ('{"success":false,"error":{"code":"API_PROXY_UNAVAILABLE",'
                       '"message":"Local API service is unavailable"}}').encode("utf-8")
            self.send_response(502)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            self.log_error("API proxy unavailable: %s", error)
            return

        self.send_response(response.status)
        excluded = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
                    "te", "trailers", "transfer-encoding", "upgrade"}
        for name, value in response.headers.items():
            if name.lower() not in excluded:
                self.send_header(name, value)
        self.end_headers()

        try:
            while True:
                chunk = response.read(64 * 1024)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            # Browser closed an SSE or long-running request; the proxy thread can end quietly.
            pass
        finally:
            response.close()

    def do_GET(self):
        if self._is_api_request():
            self._proxy_to_api()
        else:
            super().do_GET()

    def do_POST(self):
        if self._is_api_request():
            self._proxy_to_api()
        else:
            self.send_error(405, "POST is only supported for API routes")

    def do_PUT(self):
        if self._is_api_request():
            self._proxy_to_api()
        else:
            self.send_error(405, "PUT is only supported for API routes")

    def do_PATCH(self):
        if self._is_api_request():
            self._proxy_to_api()
        else:
            self.send_error(405, "PATCH is only supported for API routes")

    def do_DELETE(self):
        if self._is_api_request():
            self._proxy_to_api()
        else:
            self.send_error(405, "DELETE is only supported for API routes")

    def do_OPTIONS(self):
        if self._is_api_request():
            self._proxy_to_api()
        else:
            self.send_response(204)
            self.end_headers()


# 多线程 + 大连接队列：
# 浏览器无缓存时会并行请求 7+ 个资源，单线程 TCPServer 的默认 backlog(5)
# 会拒绝超出队列的连接，浏览器被迫重试导致首次加载明显变慢（main 分支
# 资源少恰好不触发，yyx 分支会触发）。改用多线程服务器后所有连接并行处理。
class ThreadingServer(http.server.ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 64


if __name__ == "__main__":
    with ThreadingServer(("127.0.0.1", PORT), DevelopmentCacheHandler) as httpd:
        print("AgriLoop web-ui serving %s at http://127.0.0.1:%d (smart-cache, threaded, API -> %s)" % (WEB_UI_DIR, PORT, API_UPSTREAM))
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nserver stopped")
