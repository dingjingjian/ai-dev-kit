# -*- coding: utf-8 -*-
"""
probe-city-marks.py —— 城市标记三态专项探针（虚线圆 / 竞对双环 / 我的实盘）
为「未开通城市用空心虚线圆 + 竞对标记加强」这轮改动做像素级验收。

为什么不能只靠 smoke-render.py：它开局即截图，此刻玩家 0 条航线、竞对也未必开线，
「仅竞对通航」这一档（紫罗兰双环）根本没机会出现。这里直接注入 state，
把三档城市摆进同一屏，一次看全：
  · 我的城（实心盘 + 橙黄实线环 + 客机）
  · 仅竞对通航（紫实线环 + 外圈更大的紫虚线圆）
  · 无人通航（只有一圈冰青虚线圆）

用法：
  <venv>/python tools/probe-city-marks.py
输出：docs/shots/probe-marks-{wide,zoom}.png + 注入读数
"""
import asyncio
import json
import pathlib
import sys

from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
VW, VH = 390, 844
SHOT = ROOT / "docs" / "shots"
URL = (ROOT / "index.html").as_uri()

VIEW = {"lat": 33.0, "lon": 118.0}   # 东亚（基地北京就在附近，样本最密）


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            executable_path=EDGE,
            headless=True,
            args=["--use-gl=angle", "--use-angle=swiftshader",
                  "--enable-unsafe-swiftshader", "--mute-audio"],
        )
        page = await browser.new_page(viewport={"width": VW, "height": VH},
                                      device_scale_factor=2)
        errs = []
        page.on("pageerror", lambda e: errs.append("pageerror: %s" % e))
        page.on("console", lambda m: errs.append("console.error: %s" % m.text)
                if m.type == "error" else None)
        await page.goto(URL)
        await page.wait_for_selector("#uSelectList .al-card", timeout=20000)
        await page.click("#uSelectList .al-card")     # 两步式：先选卡
        await page.click("#uSelGo")                   # 再「确认开航」
        await page.wait_for_timeout(4000)

        # 关掉可能弹出的突发事件模态（会盖住地图、暂停推进）
        await page.evaluate(
            "() => document.getElementById('uModal').classList.remove('show')")

        # ── 注入三档城市与航线 ──
        info = await page.evaluate("""() => {
            const AT = window.AT, st = AT.game.state;
            const ids = st.cities.map(c => c.id);
            // 我的两条线（挂 1 架飞机让它飞起来）
            st.routes.push({ key: AT.routeKey('C02', 'C04'), a: 'C02', b: 'C04',
                             perDay: 3, type: 'cNB1' });
            // 竞对三条线：塞给第一家活着的竞对
            const rv = st.rivals.find(r => r.alive);
            const hub = rv.homeCityId;
            const pool = ids.filter(id => id !== hub).slice(0, 8);
            for (let k = 0; k < 3; k++) {
                rv.routes.push({ key: AT.routeKey(hub, pool[k]), a: hub, b: pool[k] });
            }
            st.planes[0].routeKey = AT.routeKey('C02', 'C04');
            const tag = (id) => {
                const mine = st.routes.some(r => r.a === id || r.b === id);
                const riv = rv.routes.some(r => r.a === id || r.b === id);
                return mine ? 'mine' : (riv ? 'rival' : 'none');
            };
            const near = st.cities
                .map(c => ({ id: c.id, name: c.name, lat: c.lat, lon: c.lon,
                             tag: tag(c.id) }))
                .filter(c => c.lon > 95 && c.lon < 150 && c.lat > 15 && c.lat < 50);
            return { hub: hub, rival: rv.name, near: near,
                     mineRoutes: st.routes.length, rivalRoutes: rv.routes.length };
        }""")

        # ── 相机：先转到位，再滚轮拉近，等缓动收敛后截图 ──
        await page.evaluate(
            """([lat, lon]) => window.AT.render.flyTo(lat, lon)""",
            [VIEW["lat"], VIEW["lon"]])
        await page.wait_for_timeout(2600)
        await page.screenshot(path=str(SHOT / "probe-marks-wide.png"))

        # 滚轮缩放：wheel 事件每次 ×0.92，7.4 → ~1.9 约需 16 次
        await page.evaluate("""() => {
            const cv = document.getElementById('stage');
            for (let i = 0; i < 16; i++) {
                cv.dispatchEvent(new WheelEvent('wheel',
                    { deltaY: -120, cancelable: true, bubbles: true }));
            }
        }""")
        await page.wait_for_timeout(2600)
        await page.evaluate(
            "() => document.getElementById('uModal').classList.remove('show')")
        await page.screenshot(path=str(SHOT / "probe-marks-zoom.png"))

        counts = await page.evaluate("""() => ({
            routes: window.AT.game.state.routes.length,
            rivalRoutes: window.AT.game.state.rivals[0].routes.length,
            phase: window.AT.game.state.phase,
            cam: window.AT.render.camTarget
        })""")
        await browser.close()

    print("注入读数: %s" % json.dumps(info, ensure_ascii=False))
    print("当前读数: %s" % json.dumps(counts, ensure_ascii=False))
    print("页面错误: %s" % (errs if errs else "（无）"))
    ok = (not errs and counts["routes"] >= 1 and counts["rivalRoutes"] >= 3
          and counts["cam"]["radius"] < 3.2)
    print("结论: %s" % ("OK" if ok else "FAIL"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
