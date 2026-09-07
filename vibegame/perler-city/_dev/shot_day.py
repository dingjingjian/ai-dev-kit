# -*- coding: utf-8 -*-
"""
昼夜循环视觉校验：把 dayPhase 定格在 8 个钟点，各截一张主屏。
产物：_dev/shots/day-<名称>.png

用法：python _dev/shot_day.py
"""
import asyncio
import functools
import http.server
import json
import socketserver
import threading
import time
from pathlib import Path

from playwright.async_api import async_playwright

BASE = Path(__file__).resolve().parent
ROOT = BASE.parent
OUT = BASE / "shots"
PORT = 8732
URL = f"http://127.0.0.1:{PORT}/index.html"

GRID_N = 6
# dayPhase: 0=午夜 0.25=日出 0.5=正午 0.75=日落
PHASES = [
    ("midnight", 0.00),
    ("dawn",     0.22),
    ("sunrise",  0.28),
    ("morning",  0.38),
    ("noon",     0.50),
    ("evening",  0.68),
    ("sunset",   0.76),
    ("night",    0.88),
]

# 一座中等规模的城市，能同时看见建筑、空地、光柱
GRID = ["house", "house", "cafe", "windmill",
        "watertower", "recycling", "park", "market"]


def save():
    g = [None] * (GRID_N * GRID_N)
    for i, b in enumerate(GRID):
        g[i] = b
    return {
        "grid": g,
        "coins": 900,
        "mastered": {b: True for b in GRID},
        "pop": 12, "popPeak": 12, "backlog": 0, "built": len(GRID),
        "last": time.time() * 1000,
    }


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), handler) as httpd:
        httpd.serve_forever()


async def main():
    OUT.mkdir(exist_ok=True)
    threading.Thread(target=serve, daemon=True).start()
    time.sleep(0.6)

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="msedge")
        for name, ph in PHASES:
            ctx = await browser.new_context(
                viewport={"width": 390, "height": 844},
                device_scale_factor=2, is_mobile=True, has_touch=True,
            )
            page = await ctx.new_page()
            await page.add_init_script(
                "localStorage.setItem('pcity_v2', %s);"
                % json.dumps(json.dumps(save()))
            )
            await page.goto(URL)
            # 定格相位，然后推几帧让 canvas 与 CSS 变量都吃上这个值
            await page.evaluate("window.dayPhaseFixed = %f;" % ph)
            await page.wait_for_timeout(700)
            await page.screenshot(path=str(OUT / f"day-{name}.png"))
            print("已截图 day-%-9s phase=%.2f" % (name, ph))
            await ctx.close()
        await browser.close()


asyncio.run(main())
