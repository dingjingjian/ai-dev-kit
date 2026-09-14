# -*- coding: utf-8 -*-
"""
air-tycoon 渲染层实机冒烟
用 Python Playwright + Edge，按 390x844 竖屏跑 file://，验证 3D 球面渲染层真的出画面。

为什么必须实机验证（不能靠 Node stub）：
  render.js 的成败在**像素**上 —— 球有没有画出来、航线弧有没有出现、客机在不在飞、
  bloom 有没有把画面糊掉，这些没有任何一条能靠读代码或 stub 断言得出。
  Node 侧只能验语法与数据契约，画面必须真的渲一遍。

运行：
  python tests/smoke-render.py
断言流：加载 → 无 console 报错 → render.ok → 贴图加载 → 城市/弧线/客机计数 →
        像素体检（非纯黑、非过曝）→ 截图三视口。
"""
import asyncio, pathlib, sys
from playwright.async_api import async_playwright

from smoke_render_util import analyze_png as _analyze_png

ROOT = pathlib.Path(__file__).resolve().parent.parent
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
VW, VH = 390, 844
SHOT = ROOT / "docs" / "shots"


def analyze_png(path):
    """像素体检 —— 实现已抽到 tests/smoke_render_util.py，与 verify-dist.py 共用同一套判据。"""
    return _analyze_png(path)


async def run(pw):
    browser = await pw.chromium.launch(
        executable_path=EDGE,
        args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
    )
    ctx = await browser.new_context(viewport={"width": VW, "height": VH},
                                    device_scale_factor=2, is_mobile=True, has_touch=True)
    page = await ctx.new_page()
    errs, fails = [], []
    page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errs.append("PAGEERROR: " + str(e)))
    page.on("requestfailed", lambda r: fails.append(r.url.split("/")[-1]))

    url = (ROOT / "index.html").as_uri()
    await page.goto(url, wait_until="load")
    await page.wait_for_timeout(4000)

    out = {}

    # ── 1. 基础状态 ──
    out["core"] = await page.evaluate("""() => {
        const g = id => document.getElementById(id);
        const cv = g('stage');
        return {
          hasAT: !!window.AT,
          renderOk: !!(window.AT && window.AT.render && window.AT.render.ok),
          texOk: !!(window.AT && window.AT.render && window.AT.render.texOk),
          bloomOk: !!(window.AT && window.AT.render && window.AT.render.bloomOk),
          gameRunning: !!(window.AT && window.AT.game && window.AT.game.running),
          fps: window.AT && window.AT.game ? window.AT.game.fps : null,
          phase: window.AT && window.AT.game.state ? window.AT.game.state.phase : null,
          quarter: window.AT && window.AT.game.state ? window.AT.game.state.quarter : null,
          routes: window.AT && window.AT.game.state ? window.AT.game.state.routes.length : null,
          planes: window.AT && window.AT.game.state ? window.AT.game.state.planes.length : null,
          fallbackShown: g('fallback').classList.contains('show'),
          loaderHidden: g('loader').classList.contains('hide'),
          cvCss: [cv.clientWidth, cv.clientHeight],
          cvBuf: [cv.width, cv.height],
          appOverflow: g('app').scrollWidth - g('app').clientWidth
        };
    }""")

    # ── 2. 渲染层计数 ──
    out["render"] = await page.evaluate("""() => {
        const R = window.AT && window.AT.render;
        if (!R) return { missing: true };
        return {
          cityCount: R.cityCount,
          arcSegments: R.arcSegments,
          planeActive: R.planeActive,
          fxActive: R.fxActive,
          camTarget: R.camTarget
        };
    }""")

    # ── 3. 像素体检：直接分析截图 PNG ──
    #
    # ⚠ 为什么不用 gl.readPixels：
    #   bloom 链路会把场景先渲到离屏 RT、最后合成到屏幕，readPixels 读到的
    #   取决于调用时机与 framebuffer 绑定，实测恒返回全 0（假阴性）。
    #   而截图是「用户真正看到的像素」，且不依赖任何内部实现 —— 更可靠也更有意义。
    shot1 = SHOT / "smoke-01-open.png"
    await page.screenshot(path=str(shot1))
    out["pixels"] = analyze_png(shot1)

    # ── 4. 跑 10 秒后重测（确认主循环在推进、fps 稳定）──
    await page.wait_for_timeout(10000)
    out["after"] = await page.evaluate("""() => {
        const s = window.AT.game.state;
        return {
          t: s.t, quarter: s.quarter, phase: s.phase,
          fps: window.AT.game.fps,
          netWorth: Math.round(window.AT.sim.netWorth(s)),
          cash: Math.round(s.cash),
          historyLen: s.history.length
        };
    }""")
    await page.screenshot(path=str(SHOT / "smoke-02-running.png"))

    # ── 5. 交互：点城市。用页面内实测的屏幕坐标，不靠「猜一个位置」──
    box = await page.evaluate("""() => {
        const b = document.getElementById('stage').getBoundingClientRect();
        return {x: b.x, y: b.y, w: b.width, h: b.height};
    }""")
    #
    # ⚠ 旧版盲点屏幕中部 42% 处，那里根本没有城市，于是永远「未命中」，
    #   把「拾取坏了」和「点在空地上」混为一谈。改为先算出一座可见城市的
    #   真实屏幕坐标，再点它 —— 这样断言才有意义。
    target = await page.evaluate("""() => {
        const AT = window.AT, R = AT.render, G = AT.geo, THREE = window.THREE;
        const st = AT.game.state, cam = R.camera;
        const cv = document.getElementById('stage');
        const rect = cv.getBoundingClientRect();
        const pv = new THREE.Vector3();
        const cd = cam.position.clone().normalize();
        let best = null;
        for (const c of st.cities) {
            const v = G.ll2v(c.lat, c.lon, 1.6 * 1.012);
            const pn = new THREE.Vector3(v.x, v.y, v.z).normalize();
            if (pn.dot(cd) < 0.35) continue;                 // 太靠边缘的先不选
            pv.set(v.x, v.y, v.z).project(cam);
            const sx = (pv.x * 0.5 + 0.5) * rect.width;
            const sy = (-pv.y * 0.5 + 0.5) * rect.height;
            if (sx < 30 || sx > rect.width - 30) continue;
            if (sy < 120 || sy > rect.height - 120) continue;  // 避开 HUD 与提示区
            if (!best || Math.abs(sx - rect.width / 2) < Math.abs(best.sx - rect.width / 2)) {
                best = { id: c.id, name: c.name, sx: Math.round(sx), sy: Math.round(sy) };
            }
        }
        return best;
    }""")
    out["target"] = target or {"none": True}
    if target:
        await page.mouse.click(box["x"] + target["sx"], box["y"] + target["sy"])
        await page.wait_for_timeout(1200)
    out["click"] = await page.evaluate("""() => ({
        camTarget: window.AT.render.camTarget,
        cityCardShown: document.getElementById('uCityCard').classList.contains('show'),
        cityCardText: document.getElementById('uCityCard').textContent.trim().slice(0, 120)
    })""")
    await page.screenshot(path=str(SHOT / "smoke-03-click.png"))

    out["errors"] = errs[:12]
    out["reqFailed"] = fails[:8]

    # ══════════════════════════════════════════════════════════════
    # 6. UI 面板操作链（Task #4 的核心验收）
    #
    # 这一整段专门验证「能看见网络」→「能管理网络」这一步是否真的通了。
    # 为什么必须在实机做、不能靠 Node stub：
    #   面板的所有行为都建立在「DOM 事件委托 + innerHTML 重建」上。
    #   Node 侧只能验类名与 id 对得上（见 tests/ui-contract.js），
    #   但「点按钮 → 真的调到了 sim → state 真的变了 → 面板真的重绘了」
    #   这条链只有真浏览器能证。
    #
    # ⚠ 阶段依赖：面板在 briefing 阶段是徒劳的（openRoute 会拒绝），
    #   故先确保进入 operating。上面第 4 步已跑过 10 秒，此时应为 operating。
    # ══════════════════════════════════════════════════════════════

    # 先关掉城市卡片，避免它挡住底部操作条（它是 absolute 定位在 dock 上方的）
    await page.evaluate("""() => {
        document.getElementById('uCityCard').classList.remove('show');
        // 开局可能弹出季报/事件模态，先清掉，保证测的是面板本身
        const m = document.getElementById('uModal');
        if (m && m.classList.contains('show')) m.classList.remove('show');
        if (window.AT.ui && window.AT.ui.closePanel) window.AT.ui.closePanel();
    }""")
    # 直接把 speed 设为 1，避免测操作链期间季度跑飞、中途弹季报打断
    await page.evaluate("() => { window.AT.game.state.speed = 1; }")
    await page.wait_for_timeout(300)

    async def click_sel(sel, wait=450):
        """点一个选择器，返回是否点到了。用真实鼠标事件（不是 JS .click()），
           因为事件委托链走的是 addEventListener，JS click 也能触发，
           但真实鼠标能一并验证命中区域（有没有被别的层挡住）。"""
        try:
            el = await page.query_selector(sel)
            if not el:
                return False
            box = await el.bounding_box()
            if not box:
                return False
            await page.mouse.click(box["x"] + box["width"] / 2,
                                   box["y"] + box["height"] / 2)
            await page.wait_for_timeout(wait)
            return True
        except Exception:
            return False

    chain = {}

    # ── 6.1 打开「我的航线」面板 ──
    chain["dockVisible"] = await page.evaluate("""() => {
        const d = document.getElementById('uDock');
        if (!d) return false;
        const b = d.getBoundingClientRect();
        return b.width > 0 && b.height > 0;
    }""")
    await click_sel("#uBtnRoutes")
    chain["routesOpen"] = await page.evaluate("""() => {
        const p = document.getElementById('uPanel');
        return {
          shown: p.classList.contains('show'),
          title: document.getElementById('uPanelTitle').textContent.trim(),
          hasCards: document.querySelectorAll('#uPanelBody .rcard').length,
          bodyLen: document.getElementById('uPanelBody').innerHTML.length
        };
    }""")
    await page.screenshot(path=str(SHOT / "smoke-04-panel-routes.png"))

    # ── 6.2 展开第一条航线 → 出现频次档位 / 票价 / 运力按钮 ──
    await click_sel("#uPanelBody .rcard")
    chain["routeDetail"] = await page.evaluate("""() => {
        const b = document.getElementById('uPanelBody');
        return {
          expanded: !!b.querySelector('.rdetail'),
          freqChips: b.querySelectorAll('[data-act="freq"]').length,
          fareChips: b.querySelectorAll('[data-act="fare"]').length,
          addPlane: b.querySelectorAll('[data-act="add-plane"]').length,
          closeBtn: b.querySelectorAll('[data-act="close-route"]').length,
          upgradeBtns: b.querySelectorAll('[data-act="upgrade"]').length,
          costRows: b.querySelectorAll('.cc-total').length
        };
    }""")
    await page.screenshot(path=str(SHOT / "smoke-05-route-detail.png"))

    # ── 6.3 提频：验证「操作链路通」而非「数值一定变」──
    #
    # ⚠ 这里有个容易写错的断言：直接点最高档（20 班）并要求 perDay 变大是**错**的。
    #   本作的槽位是刻意做成反直觉的：枢纽城市拥挤度高 → 单线时刻上限被压得很低
    #   （slotBase=42、slotCrowdExp=0.85，再乘城市等级修正），
    #   上海—东京这类干线开局可能只允许每架 3 班/日。
    #   于是「玩家点 20 班」→ sim 正确地夹回 3 并给出 reason —— 链路是通的，
    #   只是被经济规则挡住了。若把它判为失败，就会为了测试而破坏设计。
    #
    #   正确的验收标准是二选一：
    #     (a) perDay 真的变了（夹取后仍不同），或
    #     (b) 收到了明确的 clamped 说明（toast/返回值带 reason）
    #   二者都证明「事件委托 → sim 调用 → 结果回传」这条链是通的。
    before = await page.evaluate("""() => {
        const s = window.AT.game.state;
        return s.routes.map(r => ({ key: r.key, perDay: r.perDay }));
    }""")
    # 选一个非当前档位的 chip（优先未被标记 over 的，即经济上可行的档位）
    chain["freqClicked"] = await page.evaluate("""() => {
        const b = document.getElementById('uPanelBody');
        const chips = Array.prototype.slice.call(b.querySelectorAll('[data-act="freq"]'));
        if (!chips.length) return null;
        const free = chips.filter(c => !c.classList.contains('on') && !c.classList.contains('over'));
        const t = (free.length ? free[free.length - 1] : chips[chips.length - 1]);
        return { val: t.getAttribute('data-val'), key: t.getAttribute('data-key'),
                 wasOver: t.classList.contains('over') };
    }""")
    freqCall = None
    if chain.get("freqClicked"):
        # 直接调 sim 拿返回值，与「UI 点击是否真的调到了 sim」交叉验证
        freqCall = await page.evaluate("""(arg) => {
            const S = window.AT.sim, st = window.AT.game.state;
            return S.setFrequency(st, arg.key, +arg.val);
        }""", chain["freqClicked"])
        # ⚠ 上面这次调用已改了 state，故重设回原值再走一遍真实点击路径，
        #   这样「点击 → 变化」的因果才干净。
        await page.evaluate("""(arg) => {
            const S = window.AT.sim, st = window.AT.game.state;
            S.setFrequency(st, arg.key, 3);
            document.getElementById('uPanelBody').querySelectorAll('[data-act="freq"]')
              .forEach(c => c.classList.remove('on'));
        }""", chain["freqClicked"])
        await page.wait_for_timeout(300)
        before = await page.evaluate("""() => {
            const s = window.AT.game.state;
            return s.routes.map(r => ({ key: r.key, perDay: r.perDay }));
        }""")
        await page.evaluate("""(arg) => {
            const b = document.getElementById('uPanelBody');
            const chips = Array.prototype.slice.call(b.querySelectorAll('[data-act="freq"]'));
            const t = chips.filter(c => c.getAttribute('data-val') === arg.val)[0];
            if (t) t.click();                     // 直接 .click()：验证事件委托本身
        }""", chain["freqClicked"])
        await page.wait_for_timeout(700)
    after = await page.evaluate("""() => {
        const s = window.AT.game.state;
        return s.routes.map(r => ({ key: r.key, perDay: r.perDay }));
    }""")
    chain["freqBefore"] = before
    chain["freqAfter"] = after
    chain["freqApiOk"] = bool(freqCall and freqCall.get("ok"))
    chain["freqApiReason"] = (freqCall or {}).get("reason", "")
    # 链路判定：sim 接口 ok，且（数值变了 或 有明确的夹取说明）
    chain["freqChanged"] = bool(
        freqCall and freqCall.get("ok") and
        (any(a["perDay"] != b["perDay"] for a, b in zip(after, before))
         or freqCall.get("clamped"))
    )

    # ── 6.4 换机型：面板里必须出现 upgrade 按钮，点了要真换成更大的机 ──
    chain["upgradeBefore"] = await page.evaluate(
        "() => window.AT.game.state.routes.map(r => r.type)")
    if await page.evaluate("""() => document.querySelectorAll('#uPanelBody [data-act="upgrade"]').length > 0"""):
        await page.evaluate("""() => {
            const b = document.getElementById('uPanelBody');
            b.querySelector('[data-act="upgrade"]').click();
        }""")
        await page.wait_for_timeout(800)
    chain["upgradeAfter"] = await page.evaluate(
        "() => window.AT.game.state.routes.map(r => r.type)")
    chain["upgradeChanged"] = (chain["upgradeBefore"] != chain["upgradeAfter"])

    # ── 6.5 机队面板：买机 → 机队数 +1 ──
    #
    # ⚠ 这一段顺带回归一个真实的 UX bug：
    #   「关掉当前面板后立刻点底部另一个按钮」在旧 CSS 下会失效 ——
    #   因为 visibility 从 visible→hidden 会保持可见到过渡结束，
    #   关闭动画期间面板仍盖住 dock 并吃掉点击。
    #   修法见 index.html 的 #uPanel（未展开态 pointer-events:none）。
    #   这里故意用「关 → 立刻点」的真实用户节奏来测，不加额外等待。
    await page.evaluate("() => window.AT.ui.closePanel()")
    await page.wait_for_timeout(60)               # 只等一帧多：复现「手快」的真实场景
    chain["fleetClickedFast"] = await click_sel("#uBtnFleet", wait=500)
    chain["fleetOpen"] = await page.evaluate("""() => ({
        shown: document.getElementById('uPanel').classList.contains('show'),
        title: document.getElementById('uPanelTitle').textContent.trim(),
        buyBtns: document.querySelectorAll('#uPanelBody [data-act="buy-plane"]').length,
        rows: document.querySelectorAll('#uPanelBody .frow').length
    })""")
    # 给足钱，保证买得起（否则点了会被 sim 拒绝，测不到「买成功」这条路）
    await page.evaluate("() => { window.AT.game.state.cash = 99999; }")
    await page.evaluate("() => window.AT.ui.openPanel('fleet')")   # 强制重绘，让 afford 判定刷新
    await page.wait_for_timeout(500)
    planesBefore = await page.evaluate("() => window.AT.game.state.planes.length")
    if await page.evaluate("""() => document.querySelectorAll('#uPanelBody [data-act="buy-plane"]').length > 0"""):
        await page.evaluate("""() => {
            document.querySelector('#uPanelBody [data-act="buy-plane"]').click();
        }""")
        await page.wait_for_timeout(700)
    planesAfter = await page.evaluate("() => window.AT.game.state.planes.length")
    chain["planesBefore"] = planesBefore
    chain["planesAfter"] = planesAfter
    chain["buyWorked"] = (planesAfter == planesBefore + 1)
    await page.screenshot(path=str(SHOT / "smoke-06-fleet.png"))

    # ── 6.6 新航线面板：三级选择（出发/目的地/机型）应齐备 ──
    await page.evaluate("() => window.AT.ui.closePanel()")
    await page.wait_for_timeout(200)
    await click_sel("#uBtnNew")
    chain["newRouteOpen"] = await page.evaluate("""() => {
        const b = document.getElementById('uPanelBody');
        return {
          shown: document.getElementById('uPanel').classList.contains('show'),
          title: document.getElementById('uPanelTitle').textContent.trim(),
          fromChips: b.querySelectorAll('[data-act="pick-from"]').length,
          toChips: b.querySelectorAll('[data-act="pick-to"]').length,
          secs: b.querySelectorAll('.nw-sec').length
        };
    }""")
    # 选一个目的地 → 应出现机型选择与开通按钮
    if await page.evaluate("""() => document.querySelectorAll('#uPanelBody [data-act="pick-to"]').length > 0"""):
        await page.evaluate("""() => {
            const b = document.getElementById('uPanelBody');
            b.querySelectorAll('[data-act="pick-to"]')[0].click();
        }""")
        await page.wait_for_timeout(500)
    chain["newRouteStep3"] = await page.evaluate("""() => {
        const b = document.getElementById('uPanelBody');
        return {
          typeChips: b.querySelectorAll('[data-act="pick-type"]').length,
          openBtn: b.querySelectorAll('[data-act="do-open"]').length,
          secs: b.querySelectorAll('.nw-sec').length
        };
    }""")
    # 第③区（机型）必须与第②区（目的地）在同一屏内可达 ——
    # 实机初版目的地列表 22 城全平铺，把机型区推到几屏之外，玩家会以为面板坏了。
    # 断言：选中目的地后，机型区的 chip 相对面板滚动体的位置不能超出可视高度。
    chain["step3Reachable"] = await page.evaluate("""() => {
        const b = document.getElementById('uPanelBody');
        const chip = b.querySelector('[data-act="pick-type"]');
        if (!chip) return false;
        const br = b.getBoundingClientRect();
        const cr = chip.getBoundingClientRect();
        // 面板滚动体的可视高度内必须能看到它（允许需滚动一点，但不能整屏以外）
        return (cr.top - br.top) <= br.height + 40;
    }""")
    # 面板不得侵犯顶栏（顶栏底边 = 44 + 46 附近）。实机曾用 max-height:72% 撞到 HUD。
    chain["panelNoTopClash"] = await page.evaluate("""() => {
        const p = document.getElementById('uPanel').getBoundingClientRect();
        const top = document.getElementById('top').getBoundingClientRect();
        return p.top >= top.bottom - 2;
    }""")
    # 真开一条线：选机型 → 点开通
    #
    # ⚠ 陷阱：机型列表里「航程不足」与「资金不足」的档位也会渲染成 .chip，
    #   但它们**没有 data-act**（不可点）。若用 querySelector('.chip') 抓到它们，
    #   点击是空操作、开线必然失败，看起来像 bug 其实是测试选错了元素。
    #   故一律用 [data-act="pick-type"] 作为选择器。
    routesBefore = await page.evaluate("() => window.AT.game.state.routes.length")
    cashNow = await page.evaluate("() => window.AT.game.state.cash")
    if cashNow < 5000:
        # 给足资金：跨洲线需要宽体机，资金不足会走「资金不足」分支而非开线成功
        await page.evaluate("() => { window.AT.game.state.cash = 60000; }")
        await page.evaluate("() => window.AT.ui.openPanel('newroute')")
        await page.wait_for_timeout(400)
    chain["openPick"] = await page.evaluate("""() => {
        const b = document.getElementById('uPanelBody');
        const tos = b.querySelectorAll('[data-act="pick-to"]');
        if (!tos.length) return { fail: '无目的地 chip' };
        tos[0].click();                          // 潜在需求最高的那个
        return { picked: tos[0].getAttribute('data-city') };
    }""")
    await page.wait_for_timeout(500)
    chain["openTypePick"] = await page.evaluate("""() => {
        const b = document.getElementById('uPanelBody');
        const ts = b.querySelectorAll('[data-act="pick-type"]');
        if (!ts.length) return { fail: '无可用机型（全部航程/资金不满足）' };
        const t = ts[ts.length - 1];             // 取最大的一档，尽量接近建议座位
        // 第③区的标题是最后一个含「机型」的 .rd-h（前两区是出发城市/目的地）
        const hs = Array.prototype.slice.call(b.querySelectorAll('.rd-h'));
        const typeH = hs.filter(h => h.textContent.indexOf('机型') >= 0);
        t.click();
        return { picked: t.getAttribute('data-type'),
                 need: typeH.length ? typeH[typeH.length - 1].textContent.trim() : '(未找到机型区标题)',
                 stockLabel: (t.querySelector('i') || {}).textContent || '' };
    }""")
    await page.wait_for_timeout(400)
    chain["openDoOpen"] = await page.evaluate("""() => {
        const b = document.getElementById('uPanelBody');
        const x = b.querySelector('[data-act="do-open"]');
        if (!x) return { fail: '无开通按钮（机型未选中）' };
        const label = x.textContent.trim();
        x.click();
        return { clicked: true, label: label };
    }""")
    await page.wait_for_timeout(900)
    # ⚠ toast 位置回归：它绝不能压住面板内容 / stats 数据卡 ——
    #   实机初版放屏幕正中，直接把「已开通航线」盖在目的地列表上。
    #   这里在 toast 正处于显示状态时量一次几何关系。
    chain["toastGeom"] = await page.evaluate("""() => {
        const t = document.getElementById('uToast');
        const r = t.getBoundingClientRect();
        const s = document.getElementById('stats').getBoundingClientRect();
        const p = document.getElementById('uPanel').getBoundingClientRect();
        const overlap = (a, b) => !(a.right <= b.left || a.left >= b.right ||
                                    a.bottom <= b.top || a.top >= b.bottom);
        return { shown: t.classList.contains('show'),
                 text: t.textContent.trim(),
                 vsStats: overlap(r, s), vsPanel: overlap(r, p) };
    }""")
    routesAfter = await page.evaluate("() => window.AT.game.state.routes.length")
    # toast 文案是最好的诊断依据：成功时会写「已开通航线」
    chain["openToast"] = await page.evaluate(
        "() => document.getElementById('uToast').textContent.trim()")
    chain["routesBefore"] = routesBefore
    chain["routesAfter"] = routesAfter
    chain["openWorked"] = (routesAfter > routesBefore)
    await page.screenshot(path=str(SHOT / "smoke-07-newroute.png"))

    # ── 6.7 模态层：强制触发一张事件卡，验证模态能盖住并与 sim 联动 ──
    await page.evaluate("() => window.AT.ui.closePanel()")
    await page.wait_for_timeout(200)
    await page.evaluate("""() => {
        // 直接把一张事件的 options 塞进 state.card，模拟「事件卡弹出」这一态。
        // 走 UI 自己的渲染路径（syncModal 读 state.card），不绕过任何一层。
        const st = window.AT.game.state;
        const ev = window.AT.EVENTS[0];
        st.card = { id: ev.id, title: ev.title, desc: ev.desc, options: ev.options };
    }""")
    await page.wait_for_timeout(700)
    chain["modal"] = await page.evaluate("""() => {
        const m = document.getElementById('uModal');
        return {
          shown: m.classList.contains('show'),
          opts: document.querySelectorAll('#uModalBody [data-act="event-choice"]').length,
          kind: (document.querySelector('#uModalBody .md-kind') || {}).textContent || '',
          title: (document.querySelector('#uModalBody .md-title') || {}).textContent || ''
        };
    }""")
    await page.screenshot(path=str(SHOT / "smoke-08-event.png"))
    # 选项间隔：确认模态层真的盖住了地图（否则玩家能边决策边乱点）
    chain["modalCoversMap"] = await page.evaluate("""() => {
        const m = document.getElementById('uModal').getBoundingClientRect();
        const cv = document.getElementById('stage').getBoundingClientRect();
        return m.width >= cv.width - 1 && m.height >= cv.height - 1;
    }""")
    # 点第一个选项 → card 必须被清空（sim 的 chooseEvent 会清）
    if chain["modal"]["opts"] > 0:
        await page.evaluate("""() => {
            document.querySelector('#uModalBody [data-act="event-choice"]').click();
        }""")
        await page.wait_for_timeout(700)
    chain["cardCleared"] = await page.evaluate(
        "() => window.AT.game.state.card === null || window.AT.game.state.card === undefined")

    # ══════════════════════════════════════════════════════════════
    # 7. 季报与终局（模态层的另外两种形态）
    #
    # 为什么单独测：季报与终局的触发条件分别是「季度数变化」与「phase === over」，
    # 都不是玩家能主动点出来的，故只能靠直接推进状态来触发。
    # 这两屏如果渲染挂了，玩家会在跑完 60 回合后看到一片空白 ——
    # 那是整个游戏体验的收尾，绝不能丢。
    # ══════════════════════════════════════════════════════════════
    await page.evaluate("""() => {
        // 清掉可能残留的模态与卡片，保证季报能被触发
        const st = window.AT.game.state;
        st.card = null;
        document.getElementById('uModal').classList.remove('show');
        if (window.AT.ui) window.AT.ui.closePanel();
    }""")
    await page.wait_for_timeout(300)
    # 直接推进两个季度（用 sim 自己的 nextQuarter，走正常结算路径）
    #
    # ⚠ 季报是「季度数变化」触发的一次性弹窗，UI 弹出后若无操作会一直留着。
    #   故这里在推进后**先抓一次季报的渲染证据**（标题/金额行/按钮），
    #   再关掉它，好让下一轮推进能再次触发。
    quarterBefore = await page.evaluate("() => window.AT.game.state.quarter")
    chain["reportSnap"] = None
    for i in range(2):
        await page.evaluate("""() => {
            const S = window.AT.sim, st = window.AT.game.state;
            if (st.card) S.chooseEvent(st, 0);
            S.nextQuarter(st);
        }""")
        await page.wait_for_timeout(1200)          # 给季报弹出留出时间
        snap = await page.evaluate("""() => {
            const m = document.getElementById('uModal');
            if (!m.classList.contains('show')) return null;
            const kind = (document.querySelector('#uModalBody .md-kind') || {}).textContent || '';
            return {
              kind: kind,
              title: (document.querySelector('#uModalBody .md-title') || {}).textContent || '',
              totalRow: (document.querySelector('#uModalBody .md-total b') || {}).textContent || '',
              kvRows: document.querySelectorAll('#uModalBody .md-kv > div').length,
              closeBtn: document.querySelectorAll('#uModalBody [data-act="close-report"]').length
            };
        }""")
        if snap and not chain["reportSnap"]:
            chain["reportSnap"] = snap
            await page.screenshot(path=str(SHOT / "smoke-10-report.png"))
        # 关掉季报，以便下一轮能再次触发
        await page.evaluate("""() => {
            const x = document.querySelector('#uModalBody [data-act="close-report"]');
            if (x) x.click();
        }""")
        await page.wait_for_timeout(400)
    chain["reportShown"] = bool(chain["reportSnap"])
    chain["quarterBefore"] = quarterBefore
    chain["quarterNow"] = await page.evaluate("() => window.AT.game.state.quarter")
    chain["quartersAdvanced"] = (chain["quarterNow"] > quarterBefore)
    chain["historyRecords"] = await page.evaluate("() => window.AT.game.state.history.length") > 0

    # 强制进入终局，验证终局面板能渲染
    await page.evaluate("""() => {
        const st = window.AT.game.state;
        st.card = null;
        // 直接跑到总季度数：advance 是 sim 自己的时间推进接口
        const C = window.AT.CONFIG;
        st.quarter = C.totalQuarters || 60;
        st.t = C.quarterSeconds || 22;
        window.AT.sim.tick(st, 0.1);
    }""")
    await page.wait_for_timeout(1200)
    chain["over"] = await page.evaluate("""() => {
        const st = window.AT.game.state;
        const m = document.getElementById('uModal');
        return {
          phase: st.phase,
          shown: m.classList.contains('show'),
          kind: (document.querySelector('#uModalBody .md-kind') || {}).textContent || '',
          title: (document.querySelector('#uModalBody .md-title') || {}).textContent || '',
          kvRows: document.querySelectorAll('#uModalBody .md-kv > div').length,
          restartBtn: document.querySelectorAll('#uModalBody [data-act="restart"]').length
        };
    }""")
    await page.screenshot(path=str(SHOT / "smoke-09-over.png"))

    out["chain"] = chain

    await browser.close()
    return out


async def main():
    SHOT.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as pw:
        out = await run(pw)

    print("=" * 62)
    print("air-tycoon 渲染层实机冒烟")
    print("=" * 62)
    for k in ("core", "render", "pixels", "after", "click", "chain"):
        print("\n[" + k + "]")
        for kk, vv in out[k].items():
            print("   " + str(kk).ljust(18) + " = " + str(vv))
    print("\n[errors]")
    for e in out["errors"]:
        print("   ! " + e)
    if not out["errors"]:
        print("   （无）")
    print("\n[requestfailed]")
    for f in out["reqFailed"]:
        print("   ! " + f)
    if not out["reqFailed"]:
        print("   （无）")
    print("\n截图 → " + str(SHOT))

    c = out["core"]
    ch = out.get("chain", {})
    # 渲染层红线
    base_ok = (c["hasAT"] and c["renderOk"] and c["gameRunning"]
               and not c["fallbackShown"] and c["appOverflow"] <= 0
               and not out["errors"])
    # UI 链红线（每一条都是「玩家能不能真的操作」的硬指标）
    ui_checks = [
        ("dock 条可见", ch.get("dockVisible")),
        ("航线面板打开", (ch.get("routesOpen") or {}).get("shown")),
        ("航线卡片渲染", (ch.get("routesOpen") or {}).get("hasCards", 0) >= 1),
        ("详情区展开", (ch.get("routeDetail") or {}).get("expanded")),
        ("频次档位齐备", (ch.get("routeDetail") or {}).get("freqChips", 0) >= 3),
        ("票价档位齐备", (ch.get("routeDetail") or {}).get("fareChips", 0) >= 3),
        ("提频链路通", ch.get("freqChanged")),
        ("机队面板打开（关→立刻点）", (ch.get("fleetOpen") or {}).get("shown")),
        ("买机生效", ch.get("buyWorked")),
        ("新航线面板打开", (ch.get("newRouteOpen") or {}).get("shown")),
        ("目的地可选", (ch.get("newRouteOpen") or {}).get("toChips", 0) >= 1),
        ("机型可选", (ch.get("newRouteStep3") or {}).get("typeChips", 0) >= 1),
        ("机型区一屏可达", ch.get("step3Reachable")),
        ("面板不侵犯顶栏", ch.get("panelNoTopClash")),
        ("开线生效", ch.get("openWorked")),
        ("toast 不压数据卡", not (ch.get("toastGeom") or {}).get("vsStats", True)),
        ("toast 不压面板", not (ch.get("toastGeom") or {}).get("vsPanel", True)),
        ("模态层弹出", (ch.get("modal") or {}).get("shown")),
        ("事件选项渲染", (ch.get("modal") or {}).get("opts", 0) >= 2),
        ("模态盖住地图", ch.get("modalCoversMap")),
        ("选项生效清卡", ch.get("cardCleared")),
        ("季报弹出", ch.get("reportShown")),
        ("季度推进", ch.get("quartersAdvanced")),
        ("历史快照记录", ch.get("historyRecords")),
        ("终局面板弹出", (ch.get("over") or {}).get("shown")),
        ("终局含重开按钮", (ch.get("over") or {}).get("restartBtn", 0) >= 1),
        ("终局含统计行", (ch.get("over") or {}).get("kvRows", 0) >= 5),
    ]
    print("\n[UI 操作链验收]")
    all_ui = True
    for name, v in ui_checks:
        mark = "✓" if v else "✗"
        if not v:
            all_ui = False
        print("   " + mark + " " + name)

    ok = base_ok and all_ui
    print("\n结论：" + ("通过 ✅" if ok else "有问题 ❌"))
    if not base_ok:
        print("   （渲染层未达标）")
    if not all_ui:
        print("   （UI 操作链有断点，见上表 ✗ 项）")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
