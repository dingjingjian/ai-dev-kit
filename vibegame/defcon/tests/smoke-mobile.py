# -*- coding: utf-8 -*-
"""
defcon 竖屏移动端冒烟
用 Python Playwright + Edge，按 390x844 竖屏跑 file://（默认）与 http://（可选参数）两条通道。
为什么存在：Node 版 playwright 本机不可用，tests/smoke-browser.js 跑不了；
而竖屏重构后必须真机验证（横向溢出、抽屉遮挡、两段式发射、bloom、像素体检），不能靠无头 stub。

运行：
  python tests/smoke-mobile.py                     # 只跑 file://
  python tests/smoke-mobile.py http://127.0.0.1:8732/index.html
断言流：阵营弹窗 → 选阵营 → 抽屉开合 → 事件卡选项 → 拉满开战 →
        选目标（不发射）→ 确认发射 → 齐射 ×3 → 落地白闪/危机拉满 → 像素体检（过曝/黑屏）。
"""
import asyncio, pathlib, sys
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
VW, VH = 390, 844


async def run(pw, url, label):
    browser = await pw.chromium.launch(executable_path=EDGE)
    ctx = await browser.new_context(viewport={"width": VW, "height": VH},
                                    device_scale_factor=2, is_mobile=True,
                                    has_touch=True)
    page = await ctx.new_page()
    errs, fails = [], []
    page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errs.append("PAGEERROR: " + str(e)))
    page.on("requestfailed", lambda r: fails.append(r.url.split("/")[-1]))

    await page.goto(url, wait_until="load")
    await page.wait_for_timeout(3000)

    out = {"label": label}

    out["setup"] = await page.evaluate("""() => {
        const s = document.getElementById('setup');
        return { shown: s.classList.contains('show'),
                 picks: document.getElementById('pickList').children.length,
                 gameNull: !(window.DC && window.DC.game) };
    }""")
    await page.click("#pickList .pick:nth-child(4)")
    await page.wait_for_timeout(1500)

    out["probe"] = await page.evaluate("""() => {
        const g = id => document.getElementById(id);
        const cv = g('stage');
        return {
          renderOk: !!(window.DC && window.DC.render && window.DC.render.ok),
          texOk: !!(window.DC && window.DC.render && window.DC.render.texOk),
          phase: window.DC && window.DC.game ? window.DC.game.state.phase : null,
          faction: window.DC && window.DC.game ? window.DC.game.state.playerFaction : null,
          cityRows: g('cList').children.length,
          legendRows: document.querySelectorAll('#legend .lrow').length,
          drawerOpen: g('drawer').classList.contains('open'),
          fallback: g('fallback').classList.contains('show'),
          bloomOk: window.DC.render.bloomOk,
          cvCss: [cv.clientWidth, cv.clientHeight],
          cvBuf: [cv.width, cv.height],
          appOverflow: g('app').scrollWidth - g('app').clientWidth
        };
    }""")

    # 布局体检：竖屏下 HUD 不能重叠、不能溢出
    out["layout"] = await page.evaluate("""() => {
        const r = id => { const b = document.getElementById(id).getBoundingClientRect();
                          return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
        return { app: r('app'), top: r('top'), sheet: r('sheet'), warbar: r('warbar'),
                 card: r('card'), drawer: r('drawer') };
    }""")

    # 抽屉：开 → 关
    await page.click("#drawerBtn")
    await page.wait_for_timeout(350)
    out["drawerOpened"] = await page.evaluate(
        "() => document.getElementById('drawer').classList.contains('open')")
    out["drawerBox"] = await page.evaluate(
        "() => { const b = document.getElementById('drawer').getBoundingClientRect();"
        "return [Math.round(b.left), Math.round(b.top), Math.round(b.width)]; }")
    await page.click("#drawerClose")
    await page.wait_for_timeout(350)
    out["drawerClosed"] = await page.evaluate(
        "() => !document.getElementById('drawer').classList.contains('open')")

    # 危机博弈 → 点选项
    await page.evaluate("() => { window.DC.game.state.t = window.DC.CONFIG.briefingSeconds - 0.3; }")
    await page.wait_for_timeout(1200)
    out["card"] = await page.evaluate("""() => {
        const g = id => document.getElementById(id);
        return { phase: window.DC.game.state.phase,
                 cardShown: g('card').classList.contains('show'),
                 opts: g('cOpts').children.length,
                 sheetNone: g('sheet').classList.contains('none') };
    }""")
    await page.click("#cOpts .opt:nth-child(2)")
    await page.screenshot(path=str(ROOT / "docs/screenshot-mobile-crisis.png"))
    out["picked"] = await page.evaluate("""() => {
        const st = window.DC.game.state;
        const sel = document.querySelectorAll('#cOpts .opt.sel');
        return { choice: st.choices[st.playerFaction], selCount: sel.length,
                 idx: sel.length ? +sel[0].getAttribute('data-opt') : -1 };
    }""")

    # 拉满 → 进入热核战争
    await page.click("#cMax")
    await page.wait_for_timeout(900)
    out["warPre"] = await page.evaluate("""() => {
        const st = window.DC.game.state;
        return { phase: st.phase, crisis: Math.round(st.crisis), defcon: st.defcon,
                 ammo: window.DC.sim.totalMissiles(st, st.playerFaction),
                 launched: st.stats[st.playerFaction].launched,
                 warbarShown: document.getElementById('warbar').classList.contains('show'),
                 cardShown: document.getElementById('card').classList.contains('show'),
                 fireDisabled: document.getElementById('fireBtn').disabled,
                 alarmOn: document.getElementById('alarm').classList.contains('on'),
                 d1: document.getElementById('defcon').classList.contains('d1') };
    }""")

    # 两段式发射：先选（抽屉里点敌方城市）→ 再按发射
    await page.click("#drawerBtn")
    await page.wait_for_timeout(300)
    await page.screenshot(path=str(ROOT / "docs/screenshot-mobile-drawer.png"))
    await page.click("#cList .crow.tgt")
    await page.wait_for_timeout(400)
    out["afterSelect"] = await page.evaluate("""() => {
        const st = window.DC.game.state;
        return { pending: window.DC.ui.getPending(),
                 launched: st.stats[st.playerFaction].launched,
                 fireDisabled: document.getElementById('fireBtn').disabled,
                 drawerOpen: document.getElementById('drawer').classList.contains('open'),
                 sheetBox: (() => { const b = document.getElementById('sheet').getBoundingClientRect();
                            return [Math.round(b.top), Math.round(b.height)]; })(),
                 tgtText: document.getElementById('tgtPick').querySelector('.tn').textContent,
                 tgtEmpty: document.getElementById('tgtPick').classList.contains('empty') };
    }""")
    await page.click("#fireBtn")
    await page.wait_for_timeout(500)
    out["afterFire"] = await page.evaluate("""() => {
        const st = window.DC.game.state;
        return { launched: st.stats[st.playerFaction].launched,
                 ammo: window.DC.sim.totalMissiles(st, st.playerFaction),
                 pending: window.DC.ui.getPending(),
                 fireDisabled: document.getElementById('fireBtn').disabled };
    }""")

    # 齐射 ×3
    await page.click("#salvoBtn")
    out["salvo"] = await page.evaluate(
        "() => [window.DC.ui.getSalvo(), document.getElementById('salvoBtn').textContent]")
    await page.evaluate("""() => { const st = window.DC.game.state;
        const c = window.DC.sim.enemyCities(st, st.playerFaction)[0];
        window.DC.ui.selectTarget(c.id); }""")
    await page.wait_for_timeout(200)
    await page.click("#fireBtn")
    await page.wait_for_timeout(400)
    out["afterSalvo"] = await page.evaluate(
        "() => window.DC.game.state.stats[window.DC.game.state.playerFaction].launched")

    # 拦截弹演出：导弹飞行途中轮询「正在演出的拦截弹」数量，取峰值并抓一帧
    out["intPeak"] = 0
    for _ in range(60):
        v = await page.evaluate("() => window.DC.render.intActive")
        out["intPeak"] = max(out["intPeak"], v)
        if v > 0:
            await page.screenshot(path=str(ROOT / "docs/screenshot-mobile-intercept.png"))
            break
        await page.wait_for_timeout(400)

    # 等导弹落地，看白闪 / 震动 / 危机值拉满
    await page.wait_for_timeout(40000)
    out["impact"] = await page.evaluate("""() => {
        const st = window.DC.game.state;
        let launched = 0, intercepted = 0;
        Object.keys(st.stats).forEach(k => { launched += st.stats[k].launched; intercepted += st.stats[k].intercepts; });
        return { phase: st.phase, impacts: st.impacts, launched: launched, intercepted: intercepted,
                 crisis: Math.round(st.crisis), over: document.getElementById('over').classList.contains('show'),
                 flashOn: document.getElementById('flash').classList.contains('on'),
                 alarmOn: document.getElementById('alarm').classList.contains('on') };
    }""")
    out["overBox"] = await page.evaluate(
        "() => { const b = document.getElementById('over').getBoundingClientRect();"
        "return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; }"
        if await page.evaluate("() => document.getElementById('over').classList.contains('show')") else "() => null")

    # 像素体检：bloom 开启后画面不能过曝也不能黑屏（在渲染同一任务内 readPixels）
    out["pixels"] = await page.evaluate("""() => {
        const cv = document.getElementById('stage');
        const gl = cv.getContext('webgl2') || cv.getContext('webgl');
        if (!gl) return { err: 'no gl' };
        window.DC.render.frame(window.DC.game.state, 0);
        const w = cv.width, h = cv.height;
        const buf = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        let white = 0, sum = 0, black = 0;
        const n = w * h;
        for (let i = 0; i < n; i++) {
            const r = buf[i*4], g = buf[i*4+1], b = buf[i*4+2];
            if (r > 240 && g > 240 && b > 240) white++;
            if (r + g + b < 12) black++;
            sum += r * 0.299 + g * 0.587 + b * 0.114;
        }
        return { w: w, h: h, whiteFrac: +(white/n).toFixed(4),
                 blackFrac: +(black/n).toFixed(3), meanLum: +(sum/n).toFixed(1),
                 bloomOk: window.DC.render.bloomOk };
    }""")

    await page.screenshot(path=str(ROOT / ("docs/screenshot-mobile-" + label + ".png")))
    await browser.close()

    ALLOW = ["earth.jpg", "favicon", "VALIDATE_STATUS false"]
    real = [e for e in errs if not any(a in e for a in ALLOW)]
    out["errors"] = real
    out["reqFails"] = [f for f in fails if "earth.jpg" not in f and "favicon" not in f]
    return out


async def main():
    async with async_playwright() as pw:
        cases = [
            ("file", "file:///" + str(ROOT / "index.html").replace("\\", "/")),
        ]
        for extra in sys.argv[1:]:                       # 追加通道：http://127.0.0.1:8732/index.html
            cases.append(("http" + str(len(cases)), extra))
        for label, url in cases:
            r = await run(pw, url, label)
            print("\n==== " + r["label"] + " ====")
            for k in ["setup", "probe", "layout", "card", "picked", "warPre",
                      "afterSelect", "afterFire", "salvo", "impact", "pixels", "intPeak", "overBox"]:
                print("  " + k + ": " + str(r.get(k)))
            print("  drawer: open=" + str(r.get("drawerOpened")) +
                  " closed=" + str(r.get("drawerClosed")) + " box=" + str(r.get("drawerBox")))
            print("  salvoLaunched: " + str(r.get("afterSalvo")))
            print("  控制台错误: " + (str(r["errors"]) if r["errors"] else "无"))
            print("  资源失败: " + (str(r["reqFails"]) if r["reqFails"] else "无"))


asyncio.run(main())
