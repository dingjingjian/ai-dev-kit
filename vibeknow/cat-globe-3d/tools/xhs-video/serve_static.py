# -*- coding: utf-8 -*-
"""多线程静态服务 —— 录屏专用。

为什么不用 `python -m http.server`：单线程会把并发请求排队，页面同时拉几十张
猫咪图 + 1MB 贴图时，排在后面的请求会明显变慢，录出来的开头全是占位爪印。
这里固定用 ThreadingTCPServer，且禁掉请求日志（否则几千行 GET 会淹掉真错误）。

用法：
    python serve_static.py [端口] [根目录]
默认端口 8177，根目录为项目根（本文件所在目录的上两级）。
"""
import http.server
import os
import socketserver
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))


def make_server(root=ROOT, port=8177):
    class H(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=root, **kw)

        def log_message(self, *a):
            pass

    socketserver.ThreadingTCPServer.daemon_threads = True
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    return socketserver.ThreadingTCPServer(("127.0.0.1", port), H)


def pick_port(start=8177, tries=30):
    import socket
    for i in range(tries):
        p = start + i
        with socket.socket() as s:
            s.settimeout(0.3)
            if s.connect_ex(("127.0.0.1", p)) != 0:
                return p
    raise RuntimeError("端口全被占用")


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else pick_port()
    root = sys.argv[2] if len(sys.argv) > 2 else ROOT
    srv = make_server(root, port)
    print("serving %s -> http://127.0.0.1:%d" % (root, port), flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
