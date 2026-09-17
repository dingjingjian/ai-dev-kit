# -*- coding: utf-8 -*-
"""演示流程探针：跑一遍 ?demo，抓时间轴 + 抽帧，录正式片之前先看清楚画面。

用法：
    python probe_demo.py                 # 默认 ?demo&warm=2，按 SHOTS 时刻抽帧
    python probe_demo.py --shots 3,9,20  # 自定义抽帧时刻（秒）
    python probe_demo.py --pick 7,22,0   # 换演示心动的小猫
    python probe_demo.py --live          # 只跑流程打印时间轴，不抽帧

产物在 `_probe/`：`tXXs.png` 抽帧 + `timeline.txt` 时间轴（页面 console 的 DEMO 打点）。
"""
import argparse
import os
import sys
import threading
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import serve_static  # noqa: E402
from record_demo import find_chromium  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
DEFAULT_SHOTS = [2, 5, 9, 13, 18, 24, 30, 36, 42]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shots", default=",".join(str(x) for x in DEFAULT_SHOTS))
    ap.add_argument("--pick", default="7,22,0,18,23")
    ap.add_argument("--warm", type=int, default=2)
    ap.add_argument("--total", type=int, default=46)
    ap.add_argument("--live", action="store_true")
    args = ap.parse_args()

    shots = [float(x) for x in args.shots.split(",") if x.strip()]
    port = serve_static.pick_port()
    srv = serve_static.make_server(ROOT, port)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    time.sleep(0.5)

    url = ("http://127.0.0.1:%d/index.html?demo&warm=%d&pick=%s"
           % (port, args.warm, args.pick))
    out = os.path.join(HERE, "_probe")
    os.makedirs(out, exist_ok=True)

    from playwright.sync_api import sync_playwright
    marks = []
    with sync_playwright() as p:
        b = p.chromium.launch(
            headless=True, executable_path=find_chromium(),
            args=["--use-gl=angle", "--use-angle=swiftshader",
                  "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        ctx = b.new_context(viewport={"width": 360, "height": 640},
                            device_scale_factor=3)
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: print("PAGEERROR:", e))
        pg.on("console", lambda m: (print("  console:", m.text),
                                    marks.append(m.text))
              if m.text.startswith("DEMO ") else None)
        t0 = time.time()
        pg.goto(url, wait_until="load")
        if not args.live:
            for s in shots:
                dt = s - (time.time() - t0)
                if dt > 0:
                    time.sleep(dt)
                f = os.path.join(out, "t%05.1fs.png" % s)
                pg.screenshot(path=f)
                print("shot", s, "->", os.path.basename(f))
        else:
            time.sleep(args.total)
        ctx.close()
        b.close()
    srv.shutdown()

    with open(os.path.join(out, "timeline.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(marks))
    print("时间轴已写入 _probe/timeline.txt")


if __name__ == "__main__":
    main()
