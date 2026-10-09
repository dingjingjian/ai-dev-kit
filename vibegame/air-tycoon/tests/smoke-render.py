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
        像素体检（非纯黑、非过曝）→ 截图三视口 →
        UI 操作链（面板/买机/开线/事件/季报/终局）→
        昼夜·夜景定量探针（另开一页：日面/夜面/东亚灯火面 + 四组 A/B 对照）→
        灯火可读性（标记叠在灯火上还剩多少对比度与彩度；含同机位复现的「改前」配方）。
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


SPHERE_RR = 0.55          # 取样半径 = 0.55R（见 sphere_lum 的口径说明）


def sphere_lum(path):
    """球面本体在 0.55R 圆内的平均亮度 —— 昼夜对比的唯一读数。

    口径（标定时定下的，改口径会让历史读数不可比）：
      · 球心恒在**屏幕正中** —— 相机 lookAt(0,0,0)、球心在原点，投影必落中心；
        早先误取 0.42H 当过球心，采样框偏上、把大片星空算了进去，读数全是噪声。
      · R_px = 0.2828 × H —— 由 R=1.6 / 相机 7.4 / fov 52° 推出。
      · 只取 0.55R 内 —— 避开球体边缘那圈大气辉光（它在 0.95~1.05R 一带最亮，
        会把「夜面有多黑」这件事整个淹掉）。
    """
    from PIL import Image
    im = Image.open(path).convert("RGB")
    W, H = im.size
    px = im.load()
    cx, cy = W // 2, H // 2
    rs = (0.2828 * H * SPHERE_RR) ** 2
    n, lsum = 0, 0.0
    for y in range(0, H, 2):
        dy = y - cy
        for x in range(0, W, 2):
            dx = x - cx
            if dx * dx + dy * dy > rs:
                continue
            r, g, b = px[x, y]
            lsum += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0
            n += 1
    return lsum / max(1, n)


def light_delta(on_path, off_path):
    """同一机位「开夜灯 / 关夜灯」两张图的差值 —— 夜灯机制是否真的改变了输出。

    为什么要这个而不是直接数「暖色像素占多少」：
      · 暖色阈值口径（亮度 > X 且 R−B > Y）在白天陆地上也会亮起（陆地本来就偏暖），
        测不出「夜里的灯」。实测白天球面 warm 占比 0.006，比夜面还高。
      · 灯火核心会被 sRGB 压向白色，R−B 随亮度反而收窄，阈值一高就漏。
    所以改成配对差分：只看「关灯后变暗」的那些像素，问两件事 ——
      dInner  它们平均亮了多少（夜灯真的在发光）
      dWarm   它们平均变暖了多少（R−B 增量）
    ⚠ dWarm 的判据在 2026-10-09 反转了：灯火从暖金改低彩度冷白之后，
      「光是暖的」不再是要断言的性质，反而「光**不**改变色相」才是。
      故断言从 dWarm > 0.02 改成 |dWarm| 小且不偏暖（见 main 的夜景验收表）。
    """
    from PIL import Image
    on = Image.open(on_path).convert("RGB")
    off = Image.open(off_path).convert("RGB")
    if on.size != off.size:
        raise ValueError("配对图尺寸不一致，无法逐像素比对：%s vs %s" % (on.size, off.size))
    W, H = on.size
    pon, poff = on.load(), off.load()
    cx, cy = W // 2, H // 2
    rs = (0.2828 * H * SPHERE_RR) ** 2
    n = lit = 0
    d_inner = 0.0
    rb_on = rb_off = 0.0
    for y in range(0, H, 2):
        dy = y - cy
        for x in range(0, W, 2):
            dx = x - cx
            if dx * dx + dy * dy > rs:
                continue
            r0, g0, b0 = pon[x, y]
            r1, g1, b1 = poff[x, y]
            l0 = (0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0) / 255.0
            l1 = (0.2126 * r1 + 0.7152 * g1 + 0.0722 * b1) / 255.0
            n += 1
            d_inner += l0 - l1
            if l0 - l1 > 0.03:                     # 「关灯后明显变暗」= 被夜灯照亮的像素
                lit += 1
                rb_on += (r0 - b0) / 255.0
                rb_off += (r1 - b1) / 255.0
    n = max(1, n)
    return {"dInner": d_inner / n,
            "dWarm": ((rb_on - rb_off) / lit) if lit else 0.0,
            "litFrac": lit / n}


def info_layer_ab(on_path, off_path):
    """信息层（城市点/航线/客机）在「灯火打开」后还剩多少对比度与彩度 —— 灯火可读性 A/B。

    为什么只有同机位开灯/关灯对照才回答得了「看不清」（用户 2026-10-09 报：
    夜晚的灯光和机场颜色接近，导致看不清）：
      · 两张图只差灯火那一层，且灯火是加性混合 —— 信息层在两图里**逐像素相同**，
        所以标记任何衰减都只能归因于「背景被灯火抬高了」，归因是干净的。
      · 只看「夜里的灯多亮」测不出这件事：要问的是「标记还读不读得出来」。

    口径：
      · 信息层像素 = **关灯图**里「够亮（亮度 > 0.35）且局部凸显（比 15px 盒式模糊
        高 0.10）」的点。为什么要「局部凸显」这一条：东亚夜面同时压着日面与冰盖，
        满屏都是亮而平滑的地表，只按亮度筛会把它们全算成标记。
      · 标记对比度 = 标记亮度 − **它周围的背景亮度**。背景用 15px 盒式模糊近似
        （核半径远大于点核，故标记自身被摊薄成固定比例，两图一致）。
        于是「灯火吃掉多少对比度」＝ 开灯图的背景抬高了 blur_on − blur_off：
            contraOff = lum_off − blur_off      关灯时的对比度（干净底）
            contraOn  = lum_off − blur_on       同一像素在灯火背景上的对比度
        用 lum_off 而不是 lum_on 是刻意的：标记自身贡献两图相同，取差值更干净。
      · 彩度用 |R−B|（信息层的归属色都是饱和色；灯火是低彩度冷白，几乎不贡献 |R−B|）。
      · hotFrac / hotFracOff = 开灯 / 关灯两张图里亮度 > 0.97 的像素占比 ——
        8bit 缓冲截断出来的「纯白斑」。两者都返回是为了让断言可以问
        「灯火**新造**了多少白斑」，而不是跟一个不可复核的绝对阈值比
        （关灯图里本来就有日面与冰盖，实测占 0.04%）。
    """
    from PIL import Image, ImageFilter
    on = Image.open(on_path).convert("RGB")
    off = Image.open(off_path).convert("RGB")
    if on.size != off.size:
        raise ValueError("配对图尺寸不一致，无法逐像素比对：%s vs %s" % (on.size, off.size))
    W, H = on.size
    pon, poff = on.load(), off.load()
    blur_on = on.convert("L").filter(ImageFilter.BoxBlur(15)).load()
    blur_off = off.convert("L").filter(ImageFilter.BoxBlur(15)).load()
    cx, cy = W // 2, H // 2
    rs = (0.2828 * H * SPHERE_RR) ** 2

    def lum(p, x, y):
        r, g, b = p[x, y]
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0

    n = hot = hot_off = m = 0
    con_on = con_off = chr_on = chr_off = 0.0
    for y in range(0, H, 2):
        dy = y - cy
        for x in range(0, W, 2):
            dx = x - cx
            if dx * dx + dy * dy > rs:
                continue
            n += 1
            if lum(pon, x, y) > 0.97:
                hot += 1
            if lum(poff, x, y) > 0.97:
                hot_off += 1
            lf = lum(poff, x, y)
            if lf > 0.35 and lf - blur_off[x, y] / 255.0 > 0.10:
                m += 1
                con_off += lf - blur_off[x, y] / 255.0
                con_on += lf - blur_on[x, y] / 255.0
                r0, b0 = pon[x, y][0], pon[x, y][2]
                r1, b1 = poff[x, y][0], poff[x, y][2]
                chr_on += abs(r0 - b0) / 255.0
                chr_off += abs(r1 - b1) / 255.0
    n = max(1, n)
    m = max(1, m)
    return {"nInfo": m, "infoFrac": m / n, "hotFrac": hot / n, "hotFracOff": hot_off / n,
            "contraOn": con_on / m, "contraOff": con_off / m,
            "chromaOn": chr_on / m, "chromaOff": chr_off / m}


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
    await page.wait_for_timeout(1200)

    out = {}

    # ── 0. 开局选航司（用户 2026-09-29）──
    # ⚠ 这是新增的**必经入口**：不点卡则游戏永不开始（gameRunning 恒 false）。
    #   故先断言覆盖层与六家航司都渲染出来，再点第一张进入游戏。
    #   第一张是中国国际航空（2026-09-30 起，基地北京 C02）。
    out["select"] = await page.evaluate("""() => {
        const w = document.getElementById('uSelect');
        const b = document.getElementById('uSelectList');
        return {
          shown: !!(w && w.classList.contains('show')),
          cards: b ? b.querySelectorAll('.al-card').length : 0,
          names: b ? Array.prototype.map.call(b.querySelectorAll('.al-name'),
                                             function (e) { return e.textContent.trim(); }) : [],
          gameRunning: !!(window.AT && window.AT.game && window.AT.game.running)
        };
    }""")
    # 2026-09-30 起选航司改为两步式：点宫格只换预览，点「确认开航」才建局
    await page.click("#uSelectList .al-card")
    await page.click("#uSelGo")
    await page.wait_for_timeout(4000)
    out["selectAfter"] = await page.evaluate("""() => ({
        shown: document.getElementById('uSelect').classList.contains('show'),
        running: !!(window.AT && window.AT.game && window.AT.game.running),
        airline: window.AT.game.state ? window.AT.game.state.airlineName : null,
        homeCity: window.AT.game.state ? window.AT.game.state.homeCityId : null
    })""")

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
    # ⚠ 阶段依赖：面板操作需要 operating 阶段。简报阶段已删（2026-10-08），
    #   建局即 operating，无需任何等待或推进。
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
    # ⚠ 这里有个容易写错的断言：直接点最高档（6 班；2026-10-08 删 12/20 死档后这就是最高）并要求 perDay 变大是**错**的。
    #   本作的槽位是刻意做成反直觉的：枢纽城市拥挤度高 → 单线时刻上限被压得很低
    #   （slotBase=42、slotCrowdExp=0.85，再乘城市等级修正），
    #   上海—东京这类干线开局可能只允许每架 3 班/日。
    #   于是「玩家点 6 班」→ sim 正确地夹回 3 并给出 reason —— 链路是通的，
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
    # 面板不得侵犯顶栏（顶部仪表带通栏，底边含安全区）。实机曾用 max-height:72% 撞到 HUD。
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


async def probe_night(pw):
    """昼夜 / 夜景定量探针 —— 另开一页独立跑，不复用 run() 那条操作链的页面。

    为什么要独立开页（两条都是「读数不可比」的坑）：
      · run() 跑到最后停在「终局面板盖住地图」，采样框里根本不是球面；
      · 开局 1.2s 内相机还在做 radius 12→7.4 的推近，屏幕上球径不符
        sphere_lum 的 R_px = 0.2828×H 口径，亮度会被算错。
    独立页里等相机停稳再拍，读数才和标定值可比。

    观察点从页面里取（render.sunLL），不在这里另抄一份太阳方向 —— 与主光/夜壳同源。

    ⚠ 2026-10-09：太阳方向改由**本机真实时间**驱动（src/solar.js），所以本探针
      在开局后**立刻把时钟锁到「改前那个固定机位」**（直射点 25.1°N/128.7°E，
      即历史常量 SUN_DIR=[4,3,5]）。不锁的话，下面每一条门槛都会变成日期的函数：
      同一个断言今天绿、明天红，读数也没法和 README 里那张标定表对照 —— 那等于
      把上一轮好不容易建立的定量口径全部作废。锁定后本探针与历次读数严格可比。
      真实时间驱动的**正确性**由两处独立覆盖：
        · tests/headless.js 的「太阳位置层」（纯函数，16 条）
        · 本文件的 sunPlan 断言（校验五处消费点真的同源，见下）
    """
    browser = await pw.chromium.launch(
        executable_path=EDGE,
        args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
    )
    ctx = await browser.new_context(viewport={"width": VW, "height": VH},
                                    device_scale_factor=2, is_mobile=True, has_touch=True)
    page = await ctx.new_page()
    errs = []
    page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errs.append("PAGEERROR: " + str(e)))

    res = {"errors": errs}
    try:
        await page.goto((ROOT / "index.html").as_uri(), wait_until="load")
        await page.wait_for_timeout(1200)
        await page.click("#uSelectList .al-card")
        await page.click("#uSelGo")
        # ⚠ 采集「真实时间开局」必须在**点击开始之后**：渲染层是 createGame → boot
        #   才初始化的（applySunAt 在 render.init 里跑）。在点击前取会读到尚未
        #   初始化的回退值 [4,3,5]，看起来「真实时间没生效」——其实只是取早了。
        await page.wait_for_timeout(1200)
        res["sunReal"] = await page.evaluate("() => window.AT.render.sunPlan")
        res["sunFallback"] = await page.evaluate(
            "() => window.AT.solar && window.AT.solar.FALLBACK_SUN_DIR")
        res["sunNow"] = await page.evaluate("() => new Date().toString()")
        # 锁到「改前那个固定机位」，让下面所有标定读数与 README 那张表严格可比
        res["sunLocked"] = await page.evaluate(
            "() => window.AT.render.setSunDir(window.AT.solar.FALLBACK_SUN_DIR)")
        # 等推近停稳（radius 12→7.4，阻尼 0.12/帧 ≈ 1s）+ 夜景贴图解码上屏
        await page.wait_for_timeout(3600)

        async def clear_modal():
            """事件卡弹出的那一帧会盖住地图，采样前先把它点掉；返回是否点掉过。"""
            got = await page.evaluate("""() => {
                const m = document.getElementById('uModal');
                if (!m || !m.classList.contains('show')) return false;
                const o = document.querySelector('#uModalBody [data-act]');
                if (o) o.click();
                return true;
            }""")
            if got:
                await page.wait_for_timeout(700)
            return got

        async def shoot(fname):
            if await clear_modal():
                res["modalDismissed"] += 1
            p = SHOT / fname
            await page.screenshot(path=str(p))
            return p

        async def fly(ll):
            """转过去并等阻尼收敛；返回「真的转过去了」—— 否则下面的读数可能是同一面。"""
            await page.evaluate("ll => window.AT.render.flyTo(ll.lat, ll.lon)", ll)
            await page.wait_for_timeout(1800)
            return await page.evaluate("""ll => {
                const R = window.AT.render;
                const v = window.AT.geo.ll2v(ll.lat, ll.lon, 1);
                let d = R.camTarget.theta - Math.atan2(v.x, v.z);
                while (d > Math.PI) d -= Math.PI * 2;
                while (d < -Math.PI) d += Math.PI * 2;
                return Math.abs(d) < 0.02;
            }""", ll)

        res["modalDismissed"] = 0
        res["nightOk"] = await page.evaluate(
            "() => !!(window.AT && window.AT.render && window.AT.render.nightOk)")
        res["gain"] = await page.evaluate("() => window.AT.render.nightGain")
        res["dim"] = await page.evaluate("() => window.AT.render.nightDim")
        res["bloom"] = await page.evaluate("() => window.AT.render.bloomStrength")
        res["lightPlan"] = await page.evaluate("() => window.AT.render.lightPlan")
        res["nightPlan"] = await page.evaluate("() => window.AT.render.nightPlan")
        res["gridProbe"] = await page.evaluate("() => window.AT.render.gridNightProbe")
        sun = await page.evaluate("() => window.AT.render.sunLL")
        res["sunLL"] = sun
        # 锁定机位后的太阳快照：主光/补光/两个夜壳 uSun 应当与 dir 完全同源。
        # 这一份 JSON 是「五处消费点没漏更新」的唯一证据 —— 只读 SUN_DIR 断言不了
        # 另外四处（它们各持一份 position / uniform 实例，漏更新不报错）。
        res["sunLockedPlan"] = await page.evaluate("() => window.AT.render.sunPlan")
        # 相机要真的停在 R=7.4 上，否则球径口径不成立
        res["settledR"] = await page.evaluate("() => window.AT.render.camTarget.radius")

        # 开局主场视角（推近已停稳）—— 这张最接近玩家第一眼
        res["homeInner"] = sphere_lum(await shoot("smoke-11-night-home.png"))
        # 同一机位的「改前」：开局视角是玩家第一眼看到的画面，
        # 留一组同机位对照比任何描述都能说明这次改动做了什么。
        await page.evaluate("v => window.AT.render.setNightDim(v)", 0)
        await page.evaluate("v => window.AT.render.setNightGain(v)", 0)
        await page.wait_for_timeout(600)
        res["homeBeforeInner"] = sphere_lum(await shoot("smoke-19-home-before.png"))
        await page.evaluate("v => window.AT.render.setNightDim(v)", res["dim"])
        await page.evaluate("v => window.AT.render.setNightGain(v)", res["gain"])
        await page.wait_for_timeout(600)

        antilat = -sun["lat"]
        antilon = ((sun["lon"] + 180 + 540) % 360) - 180
        anti = {"lat": antilat, "lon": antilon}
        res["antiLL"] = anti

        res["dayArrived"] = await fly(sun)
        res["dayInner"] = sphere_lum(await shoot("smoke-12-day-face.png"))
        res["nightArrived"] = await fly(anti)
        res["nightInner"] = sphere_lum(await shoot("smoke-13-night-face.png"))
        res["ratio"] = res["nightInner"] / res["dayInner"]

        # ── 机制有效性 A/B（一）：夜面压暗壳 ──
        # 为什么非要做这组对照：
        #   单看「夜面 inner < 0.16」无法区分「夜壳真的在压暗」与「这里本来就黑」。
        #   三盏灯的参数扫描早就证明过亮度不是被光强调出来的（见 render.js 注释），
        #   所以必须做「同机位、只翻开关」的对照，机制才算被断言覆盖。
        await page.evaluate("v => window.AT.render.setNightDim(v)", 0)
        await page.wait_for_timeout(600)
        res["noDimInner"] = sphere_lum(await shoot("smoke-15-night-nodim.png"))
        await page.evaluate("v => window.AT.render.setNightDim(v)", res["dim"])
        await page.wait_for_timeout(600)
        # 还原后必须回到原读数 —— 否则说明 setter 有粘滞，A/B 结论也不可信
        res["restoreInner"] = sphere_lum(await shoot("smoke-17-night-restore.png"))

        # 「改前」的复现机位：两个壳都关掉 == 这次改动之前的样子。
        # 有了它，README 里那句「改前 0.207」就不是一句不可复核的历史读数。
        await page.evaluate("v => window.AT.render.setNightDim(v)", 0)
        await page.evaluate("v => window.AT.render.setNightGain(v)", 0)
        await page.wait_for_timeout(600)
        res["beforeInner"] = sphere_lum(await shoot("smoke-18-night-before.png"))
        await page.evaluate("v => window.AT.render.setNightDim(v)", res["dim"])
        await page.evaluate("v => window.AT.render.setNightGain(v)", res["gain"])
        await page.wait_for_timeout(400)

        # ── 机制有效性 A/B（二）：夜面城市灯火 ──
        # ⚠ 观察点必须挑**灯火密集**的夜面。反日点落在澳洲中部荒漠，
        #   那里开灯关灯的 inner 只差 0.002，拿它验灯火等于没验。
        #   东亚夜面（中国东部 + 朝鲜半岛 + 日本）是全场最密的灯火带。
        #   这一面同样是夜面（距反日点约 61°，未过 90° 晨昏线），所以它「该黑」
        #   的判据仍然成立，只是多了「黑底上亮起一片暖金」这一层。
        lights = {"lat": 32.0, "lon": 122.0}
        res["lightsArrived"] = await fly(lights)
        on_png = await shoot("smoke-14-lights-face.png")
        res["lightsInner"] = sphere_lum(on_png)
        await page.evaluate("v => window.AT.render.setNightGain(v)", 0)
        await page.wait_for_timeout(600)
        off_png = await shoot("smoke-16-lights-off.png")
        res["lightDelta"] = light_delta(on_png, off_png)
        # 灯火可读性 A/B：同上两张图，但问的是「标记还读不读得出来」
        # （灯火把标记从背景里吃掉多少对比度与彩度 —— 用户报的就是这件事）
        res["infoAB"] = info_layer_ab(on_png, off_png)
        await page.evaluate("v => window.AT.render.setNightGain(v)", res["gain"])

        # ── 全链路 A/B：把「改前」那条配方（暖金 tint + 软膝不接）在同一机位复现 ──
        # 为什么不能只写绝对阈值就断言「灯火不再偏暖、不再有纯白斑」：
        #   ① Δ(R−B) 里混着夜面底色的蓝 —— 底色 R−B ≈ −0.11（很蓝），于是**任何**
        #      亮度抬高都会让 R−B 上升。实测冷白 tint 下 Δ(R−B) 仍是 +0.04，
        #      单看数字分不清「灯火是暖的」与「底色是蓝的」。
        #   ② 「有纯白斑」同样受日面/冰盖干扰（关灯图里就有 0.04%）。
        # 同机位换配方才把这两个量隔离出来：kneeK = 0 时软膝退化为恒等，
        # 配合旧暖金 tint 就是本次改动**之前**的渲染配方。
        # 关灯图复用上面那张：tint 与软膝只影响灯火那一层，背景逐像素不变。
        await page.evaluate("v => window.AT.render.setNightKneeK(v)", 0)
        await page.evaluate("h => window.AT.render.setNightTint(h)", 0xfff2e0)
        await page.wait_for_timeout(600)
        old_png = await shoot("smoke-20-recipe-before.png")
        res["infoBefore"] = info_layer_ab(old_png, off_png)
        res["lightDeltaBefore"] = light_delta(old_png, off_png)
        await page.evaluate("v => window.AT.render.setNightKneeK(v)",
                            (res["nightPlan"] or {}).get("kneeK"))
        await page.evaluate("h => window.AT.render.setNightTint(h)", (res["nightPlan"] or {}).get("tint"))
    finally:
        await browser.close()
    return res


async def main():
    SHOT.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as pw:
        out = await run(pw)
        try:
            out["night"] = await probe_night(pw)
        except Exception as ex:                       # 探针自身崩了也不该吞掉整轮结果
            out["night"] = {"errors": ["PROBE CRASH: " + repr(ex)]}

    print("=" * 62)
    print("air-tycoon 渲染层实机冒烟")
    print("=" * 62)
    for k in ("select", "selectAfter", "core", "render", "pixels", "after", "click", "chain"):
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

    ng = out.get("night") or {}
    print("\n[昼夜 / 夜景]")
    for kk in ("nightOk", "gain", "dim", "bloom", "settledR", "modalDismissed",
               "homeBeforeInner", "homeInner", "dayInner", "nightInner", "ratio",
               "noDimInner", "restoreInner", "beforeInner", "lightsInner"):
        vv = ng.get(kk)
        if isinstance(vv, float):
            print("   " + kk.ljust(18) + " = %.4f" % vv)
        else:
            print("   " + kk.ljust(18) + " = " + str(vv))
    for kk in ("sunLL", "antiLL", "lightPlan", "nightPlan", "gridProbe", "lightDelta",
               "lightDeltaBefore", "infoAB", "infoBefore", "sunReal", "sunLockedPlan"):
        print("   " + kk.ljust(18) + " = " + str(ng.get(kk)))
    print("   " + "转到位".ljust(16) + " = day:%s night:%s lights:%s" % (
        ng.get("dayArrived"), ng.get("nightArrived"), ng.get("lightsArrived")))
    for e in ng.get("errors") or []:
        print("   ! " + e)

    print("\n截图 → " + str(SHOT))

    c = out["core"]
    ch = out.get("chain", {})
    sel = out.get("select") or {}
    sela = out.get("selectAfter") or {}
    # 渲染层红线
    base_ok = (c["hasAT"] and c["renderOk"] and c["gameRunning"]
               and not c["fallbackShown"] and c["appOverflow"] <= 0
               and not out["errors"])
    # 开局选航司红线（本次新增的必经入口）
    sel_ok = bool(sel.get("shown") and sel.get("cards") == 6
                  and not sel.get("gameRunning")
                  and not sela.get("shown") and sela.get("running") and sela.get("airline"))
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

    print("\n[开局选航司验收]")
    print("   " + ("✓" if sel_ok else "✗") +
          " 覆盖层显示 6 家航司 → 点选后收起并开局")

    # ── 昼夜 / 夜景验收 ──
    # 门槛数字都是标定实测值留了余量后的取值，括号里是实测：
    #   day   > 0.35 (实测 0.403) 日面不许被压暗 —— 压暗壳必须只作用于夜面
    #   night < 0.16 (实测 0.118) 夜面必须真的黑下来（改前 0.207）
    #   ratio < 0.45 (实测 0.293) 昼夜对比要拉得开（改前 0.515）
    #   dInner> 0.012(实测 0.018) 夜灯真的在往夜面上打光
    #        ⚠ 2026-10-09 由 0.02 下调：这一项量的是「城市标记背后被灯火提亮了多少」，
    #          本轮把灯火扩散半径从 260px 收到 80px、并加了陆地门（公海溢光 −87%），
    #          标记背后那层雾本来就该变薄 —— 这个聚合量因此必然下降。
    #          它仍远高于「关灯＝0」的基线（gain=0 时该层输出恒 0，dInner≈0），
    #          「灯层真的在工作」这一点没变弱，变的是雾的厚度。
    #   ceil  < 1                软膝渐近上界（数学上不可能被 8bit 缓冲截断成纯白）
    #   ia.*                     灯火可读性 A/B（见 info_layer_ab）—— 用户报的「看不清」
    #   ib.*                     同一机位复现的「改前」配方（暖金 tint + 软膝不接）
    ld = ng.get("lightDelta") or {}
    ldb = ng.get("lightDeltaBefore") or {}
    ia = ng.get("infoAB") or {}
    ib = ng.get("infoBefore") or {}
    np_ = ng.get("nightPlan") or {}
    tint = np_.get("tint") or 0
    tintR, tintB = (tint >> 16) & 255, tint & 255

    # ── 太阳方向：真实时间驱动 + 五处消费点同源（2026-10-09）──────────────
    # 两组分开断言，因为它们回答的是不同问题：
    #   sunReal    —— 「真实时间真的改动了太阳吗」（机制生效）
    #   sunLockedPlan —— 「锁回固定机位后，主光/补光/两个夜壳/uSun 是否同一份」
    sp = ng.get("sunLockedPlan") or {}
    sr = ng.get("sunReal") or {}

    def _vclose(a, b, tol=1e-6):
        if not a or not b or len(a) != 3 or len(b) != 3:
            return False
        return all(abs(a[i] - b[i]) <= tol for i in range(3))

    def _vneg(a, b, tol=1e-6):
        if not a or not b or len(a) != 3 or len(b) != 3:
            return False
        return all(abs(a[i] + b[i]) <= tol for i in range(3))

    sd = sp.get("dir")
    # 真实时间那一组：方向必须是单位向量
    sr_len = 0.0
    if sr.get("dir"):
        sr_len = sum(c * c for c in sr["dir"]) ** 0.5

    def _ratio(d, k_on, k_off):
        off = d.get(k_off) or 0
        return (d.get(k_on) or 0) / off if off else 9

    night_checks = [
        ("夜景贴图已加载", ng.get("nightOk")),
        # ── 太阳方向（2026-10-09：真实时间驱动）──
        ("真实时间的太阳是单位向量", abs(sr_len - 1) < 1e-6),
        ("真实时间已经应用过（sunAppliedAt 非空）", bool(sr.get("appliedAt"))),
        # ⚠ 这条是「机制真的生效」的核心判据：真实时间算出的方向必须**不同于**
        #   回退常量。若 solar.js 被短路（或 applySunAt 没跑），方向会停在回退值，
        #   画面依旧「有个太阳」、所有夜景读数也照样全绿 —— 只有这条会红。
        #   注意：理论上真实值与回退值可能恰好接近（都在东亚上空的正午），
        #   那种情况这里会误报。但两者相差 180°（回退 = 25.1N/128.7E，
        #   真实正午也只落在本机经度基准 0°），实测远大于阈值。
        ("真实时间真的挪动了太阳（≠ 回退常量）",
         sd is None or not _vclose(sr.get("dir"), sp.get("dir"), 1e-3)),
        ("真实时间的方向也在五处同源（key/rim/两壳）",
         _vclose(sr.get("key"), sr.get("dir")) and _vneg(sr.get("rim"), sr.get("dir")) and
         _vclose(sr.get("dimUSun"), sr.get("dir")) and _vclose(sr.get("nightUSun"), sr.get("dir"))),
        ("锁定时钟成功（setSunDir 返回 true）", ng.get("sunLocked") is True),
        ("太阳方向是单位向量", sd is not None and abs(sum(c * c for c in sd) ** 0.5 - 1) < 1e-6),
        ("主光位置与 SUN_DIR 同源", _vclose(sp.get("key"), sd)),
        ("补光方向 = −SUN_DIR（恒在太阳对面）", _vneg(sp.get("rim"), sd)),
        ("压暗壳 uSun 与 SUN_DIR 同源", _vclose(sp.get("dimUSun"), sd)),
        ("灯火壳 uSun 与 SUN_DIR 同源", _vclose(sp.get("nightUSun"), sd)),
        ("夜灯增益非零", (ng.get("gain") or 0) > 0),
        ("压暗系数非零", (ng.get("dim") or 0) > 0),
        ("相机停在 R=7.4", abs((ng.get("settledR") or 0) - 7.4) < 0.01),
        ("日面转到位", ng.get("dayArrived")),
        ("夜面转到位", ng.get("nightArrived")),
        ("东亚夜面转到位", ng.get("lightsArrived")),
        ("日面足够亮 >0.35", (ng.get("dayInner") or 0) > 0.35),
        ("夜面足够黑 <0.16", (ng.get("nightInner") or 9) < 0.16),
        ("昼夜比 <0.45", (ng.get("ratio") or 9) < 0.45),
        ("夜壳真的在压暗 (去掉后变亮 >0.05)",
         (ng.get("noDimInner") or 0) - (ng.get("nightInner") or 0) > 0.05),
        ("压暗系数可还原 (差 <0.01)",
         abs((ng.get("restoreInner") or 9) - (ng.get("nightInner") or 0)) < 0.01),
        ("两壳合起来才有效果 (改前机位更亮 >0.06)",
         (ng.get("beforeInner") or 0) - (ng.get("nightInner") or 0) > 0.06),
        ("开局视角也确实压暗了 (>0.02)",
         (ng.get("homeBeforeInner") or 0) - (ng.get("homeInner") or 0) > 0.02),
        ("夜灯真的在发光 (Δ>0.012)", (ld.get("dInner") or 0) > 0.012),
        # ↓ 下面七条是 2026-10-09 新增的「灯火可读性」红线（用户报：灯光与机场颜色撞车）
        ("灯火色相是冷白 (B > R)", tintB > tintR),
        ("灯火彩度足够低 (max-min < 40/255)", (tintB - tintR) <= 40),
        ("软膝上界 <1 (不可能截断成纯白)", (np_.get("ceil") or 9) < 1.0),
        # 反例自证：这条 A/B 如果没有信号，下面那条「消掉白斑」的断言就是空的
        # （实测改前 0.21%，若它掉到 0.1% 以下说明 A/B 没接上）
        ("改前配方确实有纯白斑 (>0.1%)",
         ((ib.get("hotFrac") or 0) - (ib.get("hotFracOff") or 0)) > 0.001),
        ("信息层仍有足够对比度 (开灯后 >0.15)", (ia.get("contraOn") or 0) > 0.15),
        ("灯火没吃掉标记对比度 (保留 >0.6)",
         _ratio(ia, "contraOn", "contraOff") > 0.6),
        ("灯火没洗掉标记彩度 (保留 >0.6)",
         _ratio(ia, "chromaOn", "chromaOff") > 0.6),
        # 用**差值**而不是比例：实测改后仍有 0.05% 的 >0.97 像素，
        # 那是「标记叠在灯火上」时标记自身的亮核被截断（关灯基线为 0），
        # 不是灯火造出来的白雾 —— 所以判据是「改前比改后多造了多少白斑」。
        ("软膝真的消掉了纯白斑 (改前 − 改后 >0.1%)",
         ((ib.get("hotFrac") or 0) - (ib.get("hotFracOff") or 0)) -
         ((ia.get("hotFrac") or 0) - (ia.get("hotFracOff") or 0)) > 0.001),
        ("改后标记可读性优于改前 (彩度保留更高)",
         _ratio(ia, "chromaOn", "chromaOff") > _ratio(ib, "chromaOn", "chromaOff")),
        ("改后灯火更不偏暖 (ΔR−B 更小)",
         (ld.get("dWarm") or 0) < (ldb.get("dWarm") or 0) - 0.005),
        # ↓ 经纬网：读的是烘进顶点色、真正送进 GPU 的那份数据（不是常量）
        ("经纬网条数 = 17 (5 纬 + 12 经)",
         ((ng.get("gridProbe") or {}).get("lines")) == 17),
        ("经纬网夜面按晨昏线压暗了 (≈GRID_NIGHT)",
         ((ng.get("gridProbe") or {}).get("nightMul") or 9) < 0.35),
        ("经纬网阳面未被压暗 (≈1)",
         ((ng.get("gridProbe") or {}).get("dayMul") or 0) > 0.98),
        ("探针页无报错", not (ng.get("errors") or [])),
    ]
    print("\n[昼夜 / 夜景验收]")
    all_night = True
    for name, v in night_checks:
        if not v:
            all_night = False
        print("   " + ("✓" if v else "✗") + " " + name)

    ok = base_ok and all_ui and sel_ok and all_night
    print("\n结论：" + ("通过 ✅" if ok else "有问题 ❌"))
    if not base_ok:
        print("   （渲染层未达标）")
    if not all_ui:
        print("   （UI 操作链有断点，见上表 ✗ 项）")
    if not sel_ok:
        print("   （开局选航司入口有问题）")
    if not all_night:
        print("   （昼夜/夜景未达标，见上表 ✗ 项）")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
