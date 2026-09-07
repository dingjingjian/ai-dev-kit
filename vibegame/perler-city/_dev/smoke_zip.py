#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
分发包冒烟：把 perler-city.zip 解到临时目录，用真实浏览器打开跑一遍。

为什么要单独验这一遍：smoke_test 跑的是源码目录，而小红书小工具最终上传的是 zip。
解压路径、相对引用、文件层级但凡有一处不对，源码跑得再欢也没用 ——
「能构建」不等于「分发出去还能跑」。

用法：python _dev/smoke_zip.py
"""
import asyncio, functools, http.server, socketserver, threading, os, shutil, sys, zipfile, tempfile
from playwright.async_api import async_playwright

BASE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.dirname(BASE)
ZIP = os.path.join(PROJ, "perler-city.zip")
PORT = 8734

fails = 0


def ok(cond, name, extra=""):
    global fails
    print(f"  [{'✓' if cond else '✗'}] {name}" + ("" if cond else f"  ← {extra}"))
    if not cond:
        fails += 1


def serve(root):
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=root)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), h) as s:
        s.serve_forever()


async def main():
    if not os.path.exists(ZIP):
        print("找不到 zip，请先跑 build_zip.py")
        sys.exit(1)

    tmp = tempfile.mkdtemp(prefix="pcity_zip_")
    with zipfile.ZipFile(ZIP) as z:
        z.extractall(tmp)
    names = sorted(os.listdir(tmp))
    print(f"解压到：{tmp}")
    print(f"内容：{names}\n")

    ok(names == ["index.html", "main.js"], "zip 根只有两个文件、无多余层级", names)

    threading.Thread(target=serve, args=(tmp,), daemon=True).start()
    url = f"http://127.0.0.1:{PORT}/index.html"

    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True)
        ctx = await b.new_context(viewport={"width": 390, "height": 844},
                                  device_scale_factor=2,
                                  is_mobile=True, has_touch=True)
        page = await ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append("JS异常: " + str(e)))
        # favicon 404 是浏览器默认行为，跟代码无关（小红书宿主里同样会请求），
        # 混进来会让「无报错」这条断言永远红，这里只看真正的脚本异常
        page.on("console", lambda m: errs.append("console: " + m.text)
                if m.type == "error" and "favicon" not in m.text
                and "Failed to load resource" not in m.text else None)
        await page.goto(url)
        await page.wait_for_timeout(1500)

        ok(len(errs) == 0, "页面无 JS 报错 / console error", " | ".join(errs[:3]))

        info = await page.evaluate("""() => {
          const t = id => { const e = document.getElementById(id); return e ? e.textContent : null; };
          const cv = document.getElementById('cityCanvas');
          const g = cv && cv.getContext('2d');
          // 画布真的画了东西吗：取中心一块，看有没有非透明像素
          let painted = false;
          try {
            const d = g.getImageData(cv.width/2 - 20, cv.height/2 - 20, 40, 40).data;
            for (let i = 3; i < d.length; i += 4) if (d[i] > 0) { painted = true; break; }
          } catch (e) { painted = false; }
          return {
            coins: t('vCoins'), pop: t('vPop'), happy: t('vHappy'),
            name: t('cityName'), sub: t('citySub'),
            cw: cv ? cv.width : 0, ch: cv ? cv.height : 0,
            painted: painted,
            dR: document.getElementById('dR') ? document.getElementById('dR').className : null,
            docs: document.scripts.length,
            inline: [...document.scripts].filter(s => s.textContent.trim()).length
          };
        }""")

        ok(info["docs"] >= 1 and info["inline"] == 0,
           "脚本外置生效（无内联 script）", f"scripts={info['docs']} inline={info['inline']}")
        ok(info["coins"] is not None and info["pop"] is not None,
           "HUD 数据已渲染", f"coins={info['coins']} pop={info['pop']}")
        ok(info["cw"] > 0 and info["ch"] > 0,
           "主画布已按容器尺寸初始化", f"{info['cw']}x{info['ch']}")
        ok(info["painted"], "画布真的画上了内容（非空白）", "中心区域全透明")
        ok(info["dR"] is not None, "供需条已渲染", str(info["dR"]))

        # 交互：点主屏中央格子 → 应打开蓝图
        box = await page.locator("#cityCanvas").bounding_box()
        await page.touchscreen.tap(box["x"] + box["width"] / 2,
                                   box["y"] + box["height"] / 2)
        await page.wait_for_timeout(700)
        opened = await page.evaluate("""() => {
          const el = document.getElementById('blueprintView');
          return el ? el.classList.contains('show') : null;
        }""")
        ok(opened is True, "点空地能打开蓝图（交互可用）",
           "元素不存在" if opened is None else "未打开")

        print(f"\n  HUD：{info['name']} · {info['sub']}")
        await b.close()

    shutil.rmtree(tmp, ignore_errors=True)
    print("\n" + ("全部通过 ✅" if fails == 0 else f"失败 {fails} 项 ❌"))
    sys.exit(1 if fails else 0)

asyncio.run(main())