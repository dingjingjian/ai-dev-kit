#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
录制带 ?demo 自动播放的网页为小红书竖屏 mp4（9:16, 1080x1920）。

铁律（详见 SKILL.md）：
  - 按手机逻辑尺寸(360x640)录制，ffmpeg lanczos 放大；禁止 CSS zoom/scale
  - 不设 record_video_size（否则只显示顶部+四周灰边）
  - 注入 CSS 用 add_style_tag（在 goto load 之后），别用 add_init_script
  - SwiftShader 下关全屏模糊 + ?warm 预热防掉帧
  - 浏览器版本错配时用 executable_path 指本地已装 chromium
"""
import argparse, glob, os, subprocess, sys, time, shutil, threading

def find_ffmpeg():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        p = shutil.which("ffmpeg")
        if p:
            return p
    raise SystemExit("未找到 ffmpeg：请 pip install imageio-ffmpeg 或安装 ffmpeg")

def find_chromium():
    # Playwright 期望版本常与本地不符 -> 直接搜本地已装 chromium 二进制
    base = os.environ.get("LOCALAPPDATA", "")
    root = os.path.join(base, "ms-playwright")
    if os.path.isdir(root):
        for name in sorted(os.listdir(root), reverse=True):
            for sub in ("chrome-win64", "chrome-win"):
                cand = os.path.join(root, name, sub, "chrome.exe")
                if os.path.isfile(cand):
                    return cand
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            return p.chromium.executable_path
    except Exception:
        pass
    raise SystemExit("未找到 chromium：请安装 playwright 浏览器或显式 --chromium")

DEFAULT_CSS = """
/* 录制专用覆盖：仅录制时注入，不改真实 app */
.gate-bg{filter:none !important;}                                   /* 关全屏模糊，防 SwiftShader 掉帧 */
.tour-frame{height:30vh !important;max-height:600px !important;}     /* 放大监控方块 */
.tour-card{max-width:600px !important;}                             /* 同层容器放宽保持平衡 */
"""

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--www", help="要伺服的目录（自动起 http.server）")
    ap.add_argument("--port", type=int, default=8137)
    ap.add_argument("--url", help="完整录制 URL（与 --www 二选一；含 ?demo 等参数）")
    ap.add_argument("--out", required=True, help="输出 mp4 路径")
    ap.add_argument("--css", help="录制专用 CSS 覆盖文件路径（可选，默认内置 jurassic 版）")
    ap.add_argument("--warm", type=int, default=2, help="演示前预热秒数（对应 ?warm=）")
    ap.add_argument("--duration", type=int, default=60, help="录制总时长（秒）")
    ap.add_argument("--chromium", help="显式指定 chromium 可执行文件路径")
    ap.add_argument("--fps", type=int, default=25)
    ap.add_argument("--crf", type=int, default=18)
    ap.add_argument("--check", action="store_true", help="只检测并列出二进制路径后退出")
    args = ap.parse_args()

    ff = find_ffmpeg()
    chrom = args.chromium or find_chromium()
    if args.check:
        print("ffmpeg  :", ff)
        print("chromium:", chrom)
        return

    from playwright.sync_api import sync_playwright

    server = None
    if args.www:
        import http.server
        os.chdir(args.www)
        srv = http.server.HTTPServer(("127.0.0.1", args.port), http.server.SimpleHTTPRequestHandler)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        time.sleep(1)
        url = args.url or "http://127.0.0.1:%d/index.html?demo&warm=%d" % (args.port, args.warm)
        server = srv
    else:
        url = args.url
    if not url:
        raise SystemExit("必须提供 --url 或 --www")

    css = DEFAULT_CSS
    if args.css and os.path.isfile(args.css):
        with open(args.css, encoding="utf-8") as f:
            css = f.read()

    out_dir = os.path.dirname(os.path.abspath(args.out))
    tmp = os.path.join(out_dir, "_rec_tmp")
    os.makedirs(tmp, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            executable_path=chrom,
            args=["--use-gl=angle", "--use-angle=swiftshader",
                  "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
        )
        ctx = browser.new_context(
            viewport={"width": 360, "height": 640},
            device_scale_factor=3,
            record_video_dir=tmp,
        )
        page = ctx.new_page()
        page.on("pageerror", lambda e: print("PAGEERROR:", e))
        page.goto(url, wait_until="load")
        # 关键：load 之后注入，避免 document.head 未就绪报错
        page.add_style_tag(content=css)
        print("录制中:", url, "时长", args.duration, "s")
        time.sleep(args.duration)
        ctx.close()
        browser.close()

    webms = glob.glob(os.path.join(tmp, "*.webm"))
    if not webms:
        raise SystemExit("未生成 webm，录制失败")
    webm = sorted(webms, key=os.path.getmtime)[-1]

    vf = "scale=1080:1920:flags=lanczos,unsharp=5:5:0.8"
    cmd = [ff, "-y", "-i", webm, "-c:v", "libx264", "-pix_fmt", "yuv420p",
           "-r", str(args.fps), "-crf", str(args.crf), "-preset", "medium",
           "-vf", vf, "-movflags", "+faststart", args.out]
    subprocess.run(cmd, check=True)

    for f in webms:
        try:
            os.remove(f)
        except OSError:
            pass
    try:
        os.rmdir(tmp)
    except OSError:
        pass
    if server:
        server.shutdown()
    print("完成 ->", args.out)

if __name__ == "__main__":
    main()
