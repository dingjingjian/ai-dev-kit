# -*- coding: utf-8 -*-
"""把真实游戏截图嵌入 3:4 海报模板，用系统 Edge 渲染成高清 PNG。"""
import asyncio
import functools
import http.server
import socketserver
import threading
import time
from pathlib import Path

from playwright.async_api import async_playwright

BASE = Path(__file__).resolve().parent
ROOT = BASE.parent.parent
PORT = 8734


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), handler) as httpd:
        httpd.serve_forever()


async def render(browser, poster, out, width=900, height=1200):
    ctx = await browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=2)
    page = await ctx.new_page()
    await page.goto(f"http://127.0.0.1:{PORT}/_dev/rednote/{poster}")
    await page.wait_for_timeout(900)
    await page.screenshot(path=str(out))
    print("已生成", out)
    await ctx.close()


async def main():
    threading.Thread(target=serve, daemon=True).start()
    time.sleep(0.6)
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="msedge")
        await render(browser, "poster-cover-art.html", BASE / "cover-main.png")
        await browser.close()


asyncio.run(main())
