#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""有头(GPU)录制 demo 竖屏视频——缓解无头 SwiftShader 软渲染导致的动画掉帧/地球贴图丢失。
   demo-video-recorder 的 record_demo.py 强制 headless+swiftshader，这里给出一条走真实 GPU 的录法。
   用法: python record_headful.py --www <项目根> --out xiaohongshu/age-of-sail-3d-demo.mp4 --css <覆写css> --duration 60
"""
import argparse, glob, os, shutil, subprocess, sys, threading, time

def find_ffmpeg():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        p = shutil.which("ffmpeg")
        return p or sys.exit("pip install imageio-ffmpeg")

def find_chromium():
    base = os.environ.get("LOCALAPPDATA", "")
    root = os.path.join(base, "ms-playwright")
    if os.path.isdir(root):
        for name in sorted(os.listdir(root), reverse=True):
            for sub in ("chrome-win64", "chrome-win"):
                cand = os.path.join(root, name, sub, "chrome.exe")
                if os.path.isfile(cand):
                    return cand
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        return p.chromium.executable_path

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--www"); ap.add_argument("--url"); ap.add_argument("--port", type=int, default=8137)
    ap.add_argument("--out", required=True); ap.add_argument("--css")
    ap.add_argument("--warm", type=int, default=2); ap.add_argument("--duration", type=int, default=60)
    ap.add_argument("--trim-head", type=float, default=0.5)
    args = ap.parse_args()

    ff = find_ffmpeg(); chrom = find_chromium()
    server = None
    if args.www:
        import http.server
        os.chdir(args.www)
        # 单线程 HTTPServer 会串行处理预加载的几十张图，导致个别预加载被浏览器放弃(onerror→回退色板)，故用并发版
        server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), http.server.SimpleHTTPRequestHandler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        time.sleep(1)
        url = args.url or "http://127.0.0.1:%d/index.html?demo&warm=%d" % (args.port, args.warm)
    else:
        url = args.url

    css = ""
    if args.css and os.path.isfile(args.css):
        with open(args.css, encoding="utf-8") as f:
            css = f.read()

    out_dir = os.path.dirname(os.path.abspath(args.out))
    tmp = os.path.join(out_dir, "_rec_tmp"); os.makedirs(tmp, exist_ok=True)

    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=False,            # 有头：走真实 GPU，而非 SwiftShader
            executable_path=chrom,
        )
        # 手机调试模拟：隐藏桌面滚动条（真机上移动端浏览器不渲染此类滚动条）
        dev_id = "Galaxy S5" if hasattr(p, "devices") and p.devices.get("Galaxy S5") else None
        if dev_id:
            dev = dict(p.devices[dev_id])
            dev.pop("default_browser_type", None)   # 已显式指定 chromium launch
            dev["viewport"] = {"width": 360, "height": 640}
            dev["device_scale_factor"] = 3
            ctx = browser.new_context(**dev, record_video_dir=tmp)
        else:
            ctx = browser.new_context(
                viewport={"width": 360, "height": 640},
                screen={"width": 360, "height": 640},
                device_scale_factor=3,
                is_mobile=True,
                has_touch=True,
                user_agent="Mozilla/5.0 (Linux; Android 8.1.0; SM-G960F Build/M1AJQ; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/61.0.3163.100 Mobile Safari/537.36",
                record_video_dir=tmp,
            )
        page = ctx.new_page()
        page.on("pageerror", lambda e: print("PAGEERROR:", e))
        page.goto(url, wait_until="load")
        if css:
            page.add_style_tag(content=css)
        print("录制中:", url, "时长", args.duration, "s")
        time.sleep(args.duration)
        ctx.close(); browser.close()

    if server: server.shutdown()
    webms = glob.glob(os.path.join(tmp, "*.webm"))
    st = sys.exit if not webms else None
    if not webms:
        print("未生成 webm，录制失败"); sys.exit(1)
    webm = sorted(webms, key=os.path.getmtime)[-1]
    vf = "scale=1080:1920:flags=lanczos,unsharp=5:5:0.8"
    cmd = [ff, "-y", "-i", webm]
    if args.trim_head > 0:
        cmd += ["-ss", "%.3f" % args.trim_head]
    cmd += ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "25", "-crf", "18",
            "-preset", "medium", "-vf", vf, "-movflags", "+faststart", args.out]
    subprocess.run(cmd, check=True)
    print("写入:", args.out)

if __name__ == "__main__":
    main()