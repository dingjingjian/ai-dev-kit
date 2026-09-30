# -*- coding: utf-8 -*-
"""小红书素材：生成 36 格全满城市的实拍截图（主视角 + 拼豆台 + 蓝图）。"""
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
PORT = 8733
URL = f"http://127.0.0.1:{PORT}/index.html"

GRID_N = 6
EMPTY = [None] * (GRID_N * GRID_N)

# 36 格全满，混搭出一座热闹的城市
FULL = [
    "house", "cafe", "house", "park", "house", "cafe",
    "apartment", "workshop", "house", "apartment", "market", "house",
    "windmill", "house", "tower", "park", "house", "watertower",
    "house", "market", "house", "lighthouse", "house", "recycling",
    "apartment", "factory", "house", "coalplant", "house", "waterworks",
    "tower", "park", "house", "recycling", "house", "school",
]


def save(grid, coins=5000, pop=200, backlog=0):
    built = [b for b in grid if b]
    return {
        "grid": grid,
        "coins": coins,
        "mastered": {b: True for b in set(built)},
        "pop": pop,
        "popPeak": 260,
        "backlog": backlog,
        "built": len(built),
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
        ctx = await browser.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=2, is_mobile=True, has_touch=True,
        )
        page = await ctx.new_page()
        await page.add_init_script(
            "localStorage.setItem('pcity_v2', %s);"
            % json.dumps(json.dumps(save(FULL)))
        )
        await page.goto(URL)
        await page.wait_for_timeout(1200)
        await page.screenshot(path=str(OUT / "city-full.png"))
        print("已截图 city-full.png")
        await ctx.close()

        # 拼豆台：挑一张有辨识度的图纸（云端大厦）
        ctx = await browser.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=2, is_mobile=True, has_touch=True,
        )
        page = await ctx.new_page()
        await page.add_init_script(
            "localStorage.setItem('pcity_v2', %s);"
            % json.dumps(json.dumps(save(FULL)))
        )
        await page.goto(URL)
        await page.wait_for_timeout(800)
        await page.click("#btnBlueprint")
        await page.wait_for_timeout(500)
        # 进入拼豆台（默认选中转角咖啡）
        await page.click("#bpDockCta")
        await page.wait_for_timeout(800)
        await page.screenshot(path=str(OUT / "builder-full.png"))
        print("已截图 builder-full.png")
        await ctx.close()
        await browser.close()


asyncio.run(main())
