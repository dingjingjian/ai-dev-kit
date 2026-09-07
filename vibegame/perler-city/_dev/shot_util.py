# -*- coding: utf-8 -*-
"""
视觉校验：用系统 Edge 渲染真实页面并截图（channel='msedge'，不下载 Chromium）。
自带静态服务器，不需要另外开端口。

用法：python _dev/shot_util.py
产物：_dev/shots/*.png
"""
import asyncio
import functools
import http.server
import json
import socketserver
import threading
import sys
import time
from pathlib import Path

from playwright.async_api import async_playwright

BASE = Path(__file__).resolve().parent
ROOT = BASE.parent
OUT = BASE / "shots"
PORT = 8731
URL = f"http://127.0.0.1:{PORT}/index.html"

GRID_N = 6
EMPTY = [None] * (GRID_N * GRID_N)


def save(grid, coins=900, pop=0, backlog=0):
    built = [b for b in grid if b]
    return {
        "grid": grid,
        "coins": coins,
        "mastered": {b: True for b in built},
        "pop": pop,
        "popPeak": pop,
        "backlog": backlog,
        "built": len(built),
        "last": time.time() * 1000,
    }


def grid(*pairs):
    g = list(EMPTY)
    for i, b in pairs:
        g[i] = b
    return g


# name, grid, coins, pop, backlog, 点击序列（页面里要打开的东西）
CASES = [
    # 空城：验证保底收入，以及「先拼一座暖瓦小屋」的诊断
    ("empty", grid(), 240, 0, 0, ["#btnUtil"]),
    # 运转良好：住商工 + 管网齐备，看三段收入与「余 N」状态
    ("busy",
     grid((0, "house"), (1, "house"), (2, "cafe"), (3, "windmill"),
          (4, "watertower"), (5, "recycling"), (6, "park"), (7, "house")),
     900, 12, 0, ["#btnUtil"]),
    # 全面告急：8 栋小屋，电水双超、垃圾压过清运
    ("shortage",
     grid(*[(i, "house") for i in range(8)]),
     300, 8, 46, ["#btnUtil"]),
    # 住宅详情：验证「人口税基」这一行（这一版新增，住宅不再是纯支出）
    ("detail-house",
     grid((0, "house"), (1, "house"), (2, "cafe")),
     600, 8, 0, ["__tap0__"]),
    # 城市数据：幸福环 + 收入三段拆分（保底 / 人口税 / 产业）+ 市政余量条
    ("data-view",
     grid((0, "house"), (1, "house"), (2, "cafe"), (3, "windmill"),
          (4, "watertower"), (5, "recycling"), (6, "park"), (7, "market")),
     1200, 14, 0, ["#btnData"]),
    # 空城数据：解锁进度与类目构成在低人口下的表现
    ("data-empty", grid(), 240, 0, 0, ["#btnData"]),
    # 玩法图鉴：六节汉字序号排版
    ("help-view", grid(), 240, 0, 0, ["#btnHelp"]),
    # 蓝图：主卡 + 缩略图条 + 底部 dock CTA（关闭也收在这一行）
    ("blueprint", grid((0, "house")), 900, 4, 0, ["#btnBlueprint"]),
    # 主屏底栏：图标 + 文字的纵向排列，不点任何东西
    ("dock-main",
     grid((0, "house"), (1, "house"), (2, "cafe"), (3, "windmill"),
          (4, "watertower"), (5, "recycling"), (6, "park"), (7, "market")),
     900, 12, 0, []),
    # 住房住满（cap 4 = pop 4，工坊 jobs 6 富余）：住宅是唯一瓶颈，
    # 需求条必须是绿色「强烈需求」——曾经这里显示红色「严重过剩」，
    # 玩家读到「过剩」会以为别建了，被卡在原地涨不动。
    ("housefull", grid((0, "house"), (1, "workshop")), 900, 4, 0, []),
    # 对照：3 栋小屋 cap 12 只住了 6 人，且一个岗位都没有 →
    # 这才有资格说「过剩」（真有空房没人住），住宅条该显示红色。
    ("houseslack", grid(*[(i, "house") for i in range(3)]), 900, 6, 0, []),
    # 拼豆台：底部四键（返回 / 橡皮 / 提示 / 清空）
    ("builder", grid((0, "house")), 900, 4, 0, ["#btnBlueprint", "#bpDockCta"]),
]


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), handler) as httpd:
        httpd.serve_forever()


async def run_case(browser, name, g, coins, pop, backlog, clicks):
    ctx = await browser.new_context(
        viewport={"width": 390, "height": 844},
        device_scale_factor=2, is_mobile=True, has_touch=True,
    )
    page = await ctx.new_page()
    await page.add_init_script(
        "localStorage.setItem('pcity_v2', %s);"
        % json.dumps(json.dumps(save(g, coins, pop, backlog)))
    )
    await page.goto(URL)
    await page.wait_for_timeout(800)
    for c in clicks:
        if c == "__tap0__":
            # 点第 0 格（左上）打开建筑详情。移动端 viewport 走的是 pointer 事件，
            # 用 mouse.click 不会触发，playwright 的 touchscreen.tap 才行
            box = await page.locator("#cityCanvas").bounding_box()
            cell = box["width"] / GRID_N
            await page.touchscreen.tap(box["x"] + cell / 2, box["y"] + cell / 2)
        else:
            await page.click(c)
        await page.wait_for_timeout(800)
    await page.wait_for_timeout(400)
    await page.screenshot(path=str(OUT / f"{name}.png"))
    print("已截图 %s.png" % name)
    await ctx.close()


async def dump_panel(browser, width=390, btn="#btnUtil", body_id="utilBody",
                     view_id="utilView", title="市政面板"):
    """把某个浮层渲染成缩进文本 + 盒模型，用于核对排版。

    截图只能人眼看，改排版时更可靠的是这份结构清单：能看出层次顺序、
    每行的实际宽高、有没有横向溢出、数值列有没有对齐。
    """
    ctx = await browser.new_context(
        viewport={"width": width, "height": 844},
        device_scale_factor=2, is_mobile=True, has_touch=True,
    )
    page = await ctx.new_page()
    await page.add_init_script(
        "localStorage.setItem('pcity_v2', %s);"
        % json.dumps(json.dumps(save(
            grid((0, "house"), (1, "house"), (2, "cafe"), (3, "windmill"),
                 (4, "watertower"), (5, "recycling"), (6, "park"), (7, "market")),
            1200, 14, 0)))
    )
    await page.goto(URL)
    await page.wait_for_timeout(800)
    await page.click(btn)
    await page.wait_for_timeout(600)

    data = await page.evaluate("""([bodyId, viewId]) => {
      const body = document.getElementById(bodyId);
      const rows = [];
      const walk = (n, d) => {
        const cls = String(n.className || '');
        const r = n.getBoundingClientRect();
        const own = [...n.childNodes]
          .filter(x => x.nodeType === 3)
          .map(x => x.textContent.replace(/\\s+/g, ' ').trim()).join('');
        if (cls || own) rows.push({
          d, cls, own, x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height)
        });
        [...n.children].forEach(c => walk(c, d + 1));
      };
      walk(body, 0);
      const sc = document.querySelector('#' + viewId + ' .ov-scroll');
      return {
        rows,
        bodyW: body.clientWidth, bodyScrollW: body.scrollWidth,
        ovW: sc ? sc.clientWidth : 0, ovScrollW: sc ? sc.scrollWidth : 0
      };
    }""", [body_id, view_id])

    print("\n=== %s 结构 dump（viewport %d）===" % (title, width))
    for r in data["rows"]:
        pad = "  " * r["d"]
        tag = ("." + r["cls"]) if r["cls"] else ""
        txt = r["own"]
        print("%s%-14s %-28s  x=%-4d w=%-4d h=%-3d"
              % (pad, tag, txt[:28], r["x"], r["w"], r["h"]))
    flag = "⚠ 横向溢出" if data["ovScrollW"] > data["ovW"] else "✅ 无横向溢出"
    print("面板宽 %d / 内容宽 %d　浮层宽 %d / 内容宽 %d　%s"
          % (data["bodyW"], data["bodyScrollW"], data["ovW"], data["ovScrollW"], flag))
    await ctx.close()


async def main():
    OUT.mkdir(exist_ok=True)
    threading.Thread(target=serve, daemon=True).start()
    time.sleep(0.6)
    dump = "--dump" in sys.argv
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="msedge")
        if dump:
            for w in (390, 360):   # 最窄屏最容易暴露数值列挤爆
                await dump_panel(browser, w)
                await dump_panel(browser, w, "#btnData", "dataScroll",
                                 "dataView", "数据页")
                await dump_panel(browser, w, "#btnBlueprint", "bpScroll",
                                 "blueprintView", "蓝图页")
            await browser.close()
            return
        for name, g, coins, pop, backlog, clicks in CASES:
            await run_case(browser, name, g, coins, pop, backlog, clicks)

        # 窄屏 360：验证蓝图浮层的类别标签换行、底部 dock 不被挤出屏幕
        ctx = await browser.new_context(
            viewport={"width": 360, "height": 780},
            device_scale_factor=2, is_mobile=True, has_touch=True,
        )
        page = await ctx.new_page()
        await page.add_init_script(
            "localStorage.setItem('pcity_v2', %s);"
            % json.dumps(json.dumps(save(grid((0, "house")), 900, 4, 0)))
        )
        await page.goto(URL)
        await page.wait_for_timeout(400)
        await page.click("#btnBlueprint")
        await page.wait_for_timeout(500)
        await page.screenshot(path=str(OUT / "blueprint-narrow.png"))
        print("已截图 blueprint-narrow.png")
        # 同宽再看一眼数据页的环形与堆叠条
        await page.click("#bpClose")
        await page.wait_for_timeout(400)
        await page.click("#btnData")
        await page.wait_for_timeout(500)
        await page.screenshot(path=str(OUT / "data-narrow.png"))
        print("已截图 data-narrow.png")
        await ctx.close()
        await browser.close()


asyncio.run(main())
