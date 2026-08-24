#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AgriLoop web-ui 本地静态服务器（禁用浏览器缓存 + API 反向代理）

用法:
  python scripts/serve-webui.py [port]          默认 5173
  AGRILOOP_API_ORIGIN=http://127.0.0.1:8080 \\
    python scripts/serve-webui.py 5173

说明:
  - 静态资源从 apps/web-ui 提供，并附加 Cache-Control: no-cache
  - /api 与 /actuator 转发到后端（默认 http://127.0.0.1:8080）
  - 不要用 `python -m http.server`：它不支持 POST，登录会报 501
"""
from __future__ import annotations

import http.client
import http.server
import os
import sys
import urllib.error
import urllib.request
from urllib.parse import urlsplit

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
WEB_UI_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "apps", "web-ui"))
API_ORIGIN = os.environ.get("AGRILOOP_API_ORIGIN", "http://127.0.0.1:8080").rstrip("/")
PROXY_PREFIXES = ("/api", "/actuator")


class NoCacheProxyHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_UI_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("[web-ui] %s %s\n" % (self.address_string(), fmt % args))

    def do_GET(self):
        if self._should_proxy():
            self._proxy()
            return
        super().do_GET()

    def do_HEAD(self):
        if self._should_proxy():
            self._proxy()
            return
        super().do_HEAD()

    def do_POST(self):
        self._proxy_or_501()

    def do_PUT(self):
        self._proxy_or_501()

    def do_PATCH(self):
        self._proxy_or_501()

    def do_DELETE(self):
        self._proxy_or_501()

    def do_OPTIONS(self):
        if self._should_proxy():
            self._proxy()
            return
        self.send_response(204)
        self.send_header("Allow", "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS")
        self.end_headers()

    def _should_proxy(self) -> bool:
        path = urlsplit(self.path).path
        return any(path == prefix or path.startswith(prefix + "/") for prefix in PROXY_PREFIXES)

    def _proxy_or_501(self):
        if self._should_proxy():
            self._proxy()
            return
        self.send_error(501, "Unsupported method (%r)" % self.command)

    def _proxy(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        body = self.rfile.read(length) if length > 0 else None
        target = API_ORIGIN + self.path
        request = urllib.request.Request(target, data=body, method=self.command)

        hop_by_hop = {
            "connection",
            "keep-alive",
            "proxy-authenticate",
            "proxy-authorization",
            "te",
            "trailers",
            "transfer-encoding",
            "upgrade",
            "host",
            "content-length",
        }
        for key, value in self.headers.items():
            if key.lower() in hop_by_hop:
                continue
            request.add_header(key, value)

        try:
            with urllib.request.urlopen(request, timeout=60) as upstream:
                payload = upstream.read()
                self.send_response(upstream.getcode())
                for key, value in upstream.headers.items():
                    if key.lower() in hop_by_hop or key.lower() == "content-length":
                        continue
                    self.send_header(key, value)
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(payload)
        except urllib.error.HTTPError as err:
            payload = err.read()
            self.send_response(err.code)
            for key, value in err.headers.items():
                if key.lower() in hop_by_hop or key.lower() == "content-length":
                    continue
                self.send_header(key, value)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(payload)
        except (urllib.error.URLError, TimeoutError, ConnectionError, http.client.HTTPException) as err:
            message = ("后端不可达 (%s)。请确认 api-service 已在 %s 运行。\n" % (err, API_ORIGIN)).encode("utf-8")
            self.send_response(502)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(message)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(message)


class ThreadingServer(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 64


if __name__ == "__main__":
    with ThreadingServer(("127.0.0.1", PORT), NoCacheProxyHandler) as httpd:
        print(
            "AgriLoop web-ui serving %s at http://127.0.0.1:%d"
            % (WEB_UI_DIR, PORT)
        )
        print("Proxy /api /actuator -> %s (no-cache, threaded)" % API_ORIGIN)
        print("Do NOT use: python3 -m http.server  (no POST / no API proxy / drops parallel JS)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nserver stopped")
