#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
核对需求条：直接读 DOM 文本（住宅/商业/工业 的状态词 + 条的方向和宽度），
不靠眼睛看截图 —— 截图只能定性，数值要对得上才算修对。

用法：python _dev/dump_demand.py
"""
import asyncio, functools, http.server, socketserver, threading, os, json, time
from playwright.async_api import async_playwright

BASE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.dirname(BASE)
PORT = 8733
URL = f"http://127.0.0.1:{PORT}/index.html"
GRID_N = 6


def serve():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=PROJ)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), h) as s:
        s.serve_forever()


def save(grid, coins=900, pop=0, backlog=0):
    built = [b for b in grid if b]
    return {
        "grid": grid, "coins": coins, "mastered": {b: True for b in built},
        "pop": pop, "popPeak": pop, "backlog": backlog,
        "built": len(built), "last": time.time() * 1000,
    }


def grid(*pairs):
    g = [None] * (GRID_N * GRID_N)
    for i, b in pairs:
        g[i] = b
    return g


CASES = [
    # 住房住满 + 岗位富余 → 该是绿色「强烈需求」
    ("housefull", grid((0, "house"), (1, "workshop")), 900, 4),
    # 有空房 + 无岗位 → 该是红色「过剩」
    ("houseslack", grid(*[(i, "house") for i in range(3)]), 900, 6),
    # 既有场景：住满(cap12)但 jobs 5 → 岗位不足，住满分支给中性正值
    ("busy", grid((0, "house"), (1, "house"), (2, "cafe"), (3, "windmill"),
                  (4, "watertower"), (5, "recycling"), (6, "park"), (7, "house")),
     900, 12),
    # 极端值：三位数人口 + 五位数金币 —— chip 撑到最宽、hud-left 被压到最窄，
    # 副标题最容易在这里折行。这是精简后真正要过的关。
    # 注意人口上限由 popTarget = min(popCap, jobs+8) 决定：光堆住宅没用，
    # 必须配够岗位，否则人口会自己掉回个位数，这个场景就白造了。
    ("extreme",
     grid(*[(i, "factory") for i in range(30)],
          *[(i, "tower") for i in range(30, 36)]), 99999, 156),
]

# 折行是宽度敏感的，只测一档等于没测。360 是最小主流安卓宽度，必须覆盖。
WIDTHS = [390, 360]


async def main():
    threading.Thread(target=serve, daemon=True).start()
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='msedge', headless=True)
        for name, g, coins, pop in CASES:
            for W in WIDTHS:
                ctx = await b.new_context(viewport={"width": W, "height": 844},
                                          device_scale_factor=2)
                page = await ctx.new_page()
                await page.add_init_script(
                    "localStorage.setItem('pcity_v2', %s);"
                    % json.dumps(json.dumps(save(g, coins, pop))))
                await page.goto(URL)
                await page.wait_for_timeout(900)

                # 首页三条 + 副标题折行检测
                top = await page.evaluate("""() => {
                  const g = id => {
                    const el = document.getElementById(id);
                    return el ? {cls: el.className, w: el.style.width} : null;
                  };
                  // Range 对折行的文本每行返回一个 rect，>1 即折行。
                  // 别用 scrollHeight 比对：block 元素高度由内容撑开，看不出折没折。
                  const subEl = document.getElementById('citySub');
                  const rg = document.createRange();
                  rg.selectNodeContents(subEl);
                  const rects = [...rg.getClientRects()];
                  // hud-left 的内容可用宽度：副标题能不能一行放下，全看这个数
                  const hl = document.querySelector('.hud-left');
                  const cs = hl ? getComputedStyle(hl) : null;
                  const avail = hl ? Math.round(hl.clientWidth
                    - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) : 0;
                  return {R: g('dR'), C: g('dC'), I: g('dI'),
                          sub: subEl.textContent,
                          subLines: rects.length,
                          subW: rects.length ? Math.round(Math.max(...rects.map(r => r.width))) : 0,
                          avail: avail,
                          hudH: Math.round(document.getElementById('hud').getBoundingClientRect().height)};
                }""")
                slack = top["avail"] - top["subW"]
                flag = "" if top["subLines"] <= 1 else "   ← 折行了！"
                head = f"{name:<11}" if W == WIDTHS[0] else f"{'':<11}"
                print(f"{head}@{W}px 「{top['sub']}」 行数={top['subLines']} "
                      f"{top['subW']}/{top['avail']}px 余量={slack}px "
                      f"HUD高={top['hudH']}px{flag}")

                # 市政面板三条（带文字）—— 不随宽度变化，只在第一档跑一次
                if W == WIDTHS[0]:
                    await page.evaluate("document.getElementById('btnUtil').click();")
                    await page.wait_for_timeout(400)
                    util = await page.evaluate("""() => {
                      return [...document.querySelectorAll('.udm')].map(r => {
                        const t = r.querySelector('.tagt');
                        const s = r.querySelector('.udm-h span');
                        const f = r.querySelector('.fill');
                        return {name: t ? t.textContent : '?',
                                state: s ? s.textContent : '?',
                                dir: f ? (f.className.indexOf('pos') >= 0 ? '需求' : '过剩') : '?',
                                w: f ? f.style.width : '?'};
                      });
                    }""")
                    for k in ('R', 'C', 'I'):
                        v = top[k]
                        d = '需求' if 'pos' in v['cls'] else '过剩'
                        print(f"{'':<11}   首页 {k}: {d} {v['w']}")
                    for u in util:
                        print(f"{'':<11}   面板 {u['name']}: {u['state']} · {u['dir']} {u['w']}")
                await ctx.close()
        await b.close()

asyncio.run(main())