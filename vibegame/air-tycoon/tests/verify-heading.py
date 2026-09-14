# -*- coding: utf-8 -*-
"""
verify-heading.py —— 「飞机倒着飞」实机验证（端到端，读真实渲染产物）

为什么需要独立一支（而不是靠 probe-heading.js 或像素体检）：
  · probe-heading.js 是**离线复算**：用真实 three.js 重演 render.js 的公式，
    能证明公式对，但不能证明「画面上真的按这个公式来了」。
  · 像素体检只知道「有亮点」，不知道亮点朝向。
  本脚本直接读渲染层**真实的实例矩阵** —— 也就是这一帧真正画出去的东西 ——
  解出「机头在世界空间指哪」，与「这一段时间飞机往哪移动」点乘，dot < 0 即倒飞。

为什么要**在页面内**按 rAF 节奏采样（而不是 Python 侧定时抓）：
  Python 侧 `page.evaluate` 往返一次约几十毫秒，而退化帧（机头正对相机）只持续
  很短时间，慢采样抓不到相邻两帧，也就测不出姿态抖动。
  故把采样器与统计都装进页面，Python 只负责取回聚合结果。

两个判据：
  ① 倒飞：机头屏幕方向 · 位移方向 < 0
  ② 退化帧姿态抖动：机头屏幕长度趋零时姿态本应「保持」，若相邻帧角度剧烈跳变，
     说明 atan2 在吃噪声（视觉上是「随机抽搐」）

运行：
  <venv>/python tests/verify-heading.py
"""
import asyncio, math, pathlib, sys
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
VW, VH = 390, 844
OUT = ROOT / "docs" / "shots" / "heading"

# 局面：越过 briefing、开三条航线（给钱 → 买机 → 开线 → 全部派飞）
SETUP = r"""
() => {
  const st = window.AT.game.state;
  const S = window.AT.sim;
  const log = [];
  st.cash = 5e9; st.debt = 0;
  let guard = 0;
  while (st.phase === 'briefing' && guard++ < 40) S.advance(st, 1);
  log.push('phase → ' + st.phase);
  const tryRoute = (a, b, ty) => {
    for (let k = 0; k < 3; k++) { const r = S.buyPlane(st, ty); if (!r || !r.ok) break; }
    const open = S.openRoute(st, a, b, ty);
    log.push('openRoute ' + a + '-' + b + ' ' + ty + ' → '
             + (open && open.ok ? 'ok' : (open && open.fail) || 'no-ok-field'));
  };
  tryRoute('C01', 'C03', 'cRJ1');
  tryRoute('C09', 'C13', 'cNB1');
  tryRoute('C17', 'C09', 'cWB1');
  st.planes.forEach(pl => { pl.onGround = 0; });
  return { log: log, phase: st.phase, routes: st.routes.length, planes: st.planes.length };
}
"""

# 采样器 + 记录器：全部在页面内跑
INSTALL = r"""
() => {
  const THREE = window.THREE;
  const scene = window.AT.render.scene;
  const camera = window.AT.render.camera;
  let mesh = null;
  scene.traverse(o => {
    if (!mesh && o.isInstancedMesh && o.geometry && o.geometry.type === 'PlaneGeometry') mesh = o;
  });
  if (!mesh) return { err: 'no-plane-mesh' };

  const m = new THREE.Matrix4(), p = new THREE.Vector3(), n = new THREE.Vector3();
  const cvs = document.getElementById('stage');
  const W = cvs.clientWidth, H = cvs.clientHeight;

  window.__samplePlanes = () => {
    camera.updateMatrixWorld();
    const out = [];
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m);
      if (new THREE.Vector3().setFromMatrixColumn(m, 0).length() < 1e-6) continue;  // 隐藏槽位
      p.setFromMatrixPosition(m);
      n.setFromMatrixColumn(m, 1).normalize();        // 局部 +Y = 机头
      const a = p.clone().project(camera);
      const b = p.clone().add(n.clone().multiplyScalar(0.02)).project(camera);
      /* 可见性：必须同时满足 ① NDC z < 1 ② 位于相机所在半球。
       * ⚠ 只判 z<1 不够 —— 球背面（远侧）的飞机投影会翻号，算出来的
       *   「机头屏幕向量」趋近零向量（实测出现过 0.00px），
       *   把它当退化样本会让判据量到噪声。**远侧飞机本来就不该参与判定。** */
      const wp = p.clone();
      const nearSide = (wp.x * camera.position.x + wp.y * camera.position.y
                        + wp.z * camera.position.z) > 0;
      out.push({
        i: i,
        sx: (a.x + 1) / 2 * W, sy: (1 - a.y) / 2 * H,
        nx: (b.x - a.x) * W, ny: -(b.y - a.y) * H,    // 机头屏幕向量（px）
        vis: a.z < 1 && nearSide,
        far: !nearSide
      });
    }
    return out;
  };

  /* 按 rAF 节奏录一整个往返周期，只回传聚合量（不传原始帧，避免几 MB JSON）。 */
  window.__record = (seconds) => new Promise(resolve => {
    const MIN_MOVE = 0.6;     // 位移小于此值(px) → 方向不可信，不计入倒飞判定
    const MIN_NOSE = 1.5;     // 机头屏幕长度小于此值(px) → 朝向不可测
    const prev = {};          // i -> 上一帧样本
    const st = {
      frames: 0, t0: performance.now(),
      judged: 0, back: 0, degen: 0, turns: 0,
      jitN: 0, jitSum: 0, jitMax: 0, jitEx: [], farFrames: 0,
      backEx: [], noseMin: 1e9, noseMed: []
    };
    const tick = () => {
      const fr = window.__samplePlanes();
      st.frames++;
      const fi = st.frames;
      for (const q of fr) {
        if (!q.vis) { if (q.far) st.farFrames++; delete prev[q.i]; continue; }
        const L = Math.hypot(q.nx, q.ny);
        if (L < st.noseMin) st.noseMin = L;
        st.noseMed.push(L);
        const degen = L < MIN_NOSE;
        const ang = Math.atan2(q.ny, q.nx);
        const pv = prev[q.i];
        if (pv) {
          const dx = q.sx - pv.sx, dy = q.sy - pv.sy;
          const sp = Math.hypot(dx, dy);
          if (sp >= MIN_MOVE) {
            /* 掉头 = 相邻两段的**位移**方向相反（不是位移 vs 机头）。
             * 用错了会把「飞机朝向与位移相反」也计成掉头，且真掉头反被漏掉。 */
            if (pv.pdx !== undefined && pv.pdx * dx + pv.pdy * dy < 0) st.turns++;
            /* 倒飞判定只在「前后两帧机头都测得出」时做 —— 否则量的是噪声 */
            if (!degen && pv.degen === false) {
              const hx = (q.nx + pv.nx) / 2, hy = (q.ny + pv.ny) / 2;
              const hl = Math.hypot(hx, hy);
              if (hl >= MIN_NOSE) {
                st.judged++;
                const dot = (hx * dx + hy * dy) / (hl * sp);
                if (dot < 0) {
                  st.back++;
                  if (st.backEx.length < 5)
                    st.backEx.push('实例' + q.i + ' dot=' + dot.toFixed(2)
                      + ' 位移(' + dx.toFixed(1) + ',' + dy.toFixed(1) + ')');
                }
              }
            }
          }
          /* 退化帧姿态抖动：相邻两帧都不可测时，角度本应保持（实现里沿用上一帧）。
           * 若没做退化保护，atan2 吃噪声 → 这两帧之间角度剧烈跳变。 */
          if (degen && pv.degen && fi - pv.fi === 1) {
            const d = Math.abs((ang - pv.ang + Math.PI) % (2 * Math.PI) - Math.PI);
            st.jitN++; st.jitSum += d;
            if (d > st.jitMax) st.jitMax = d;
            if (d > 0.5 && st.jitEx.length < 5)
              st.jitEx.push('实例' + q.i + ' Δ' + (d * 180 / Math.PI).toFixed(0) + '°');
          }
        }
        if (degen) st.degen++;
        prev[q.i] = { sx: q.sx, sy: q.sy, nx: q.nx, ny: q.ny, degen: degen, ang: ang, fi: fi,
                       pdx: pv ? q.sx - pv.sx : undefined, pdy: pv ? q.sy - pv.sy : undefined };
      }
      if ((performance.now() - st.t0) / 1000 >= seconds) {
        const med = st.noseMed.slice().sort((a, b) => a - b);
        st.noseMedP50 = med.length ? med[Math.floor(med.length / 2)] : 0;
        st.noseMedP95 = med.length ? med[Math.floor(med.length * 0.95)] : 0;
        st.fps = st.frames / ((performance.now() - st.t0) / 1000);
        delete st.noseMed;
        resolve(st);
      } else {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });
  return { ok: true, count: mesh.count, W: W, H: H };
}
"""


async def run(pw):
    OUT.mkdir(parents=True, exist_ok=True)
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

    await page.goto((ROOT / "index.html").as_uri(), wait_until="load")
    await page.wait_for_timeout(4000)

    inst = await page.evaluate(INSTALL)
    print("采样器:", inst)
    if inst.get("err"):
        print("✗ 找不到飞机 InstancedMesh —— 渲染层结构可能已变，本脚本失效")
        await browser.close()
        return 2

    setup = await page.evaluate(SETUP)
    print("局面:", setup["log"])
    print("阶段 %s · 航线 %d 条 · 机队 %d 架"
          % (setup["phase"], setup["routes"], setup["planes"]))
    if setup["routes"] == 0:
        print("✗ 没开成航线 —— 没飞机在飞，验证无意义")
        await browser.close()
        return 4
    await page.wait_for_timeout(1200)

    # PLANE_PERIOD = 14s，最慢 speed ≈ 0.6 → 周期 ≈ 23s。录 36s 确保覆盖去程+回程。
    SECONDS = 36
    print("录制 %ds（覆盖完整往返周期）…" % SECONDS)
    st = await page.evaluate("(s) => window.__record(s)", SECONDS)

    deg = math.degrees
    print("\n采集 %d 帧 @ %.1f fps" % (st["frames"], st["fps"]))
    print("机头屏幕长度：中位 %.2fpx · p95 %.2fpx · 最小 %.2fpx"
          % (st["noseMedP50"], st["noseMedP95"], st["noseMin"]))
    print("判定样本 %d · 倒飞 %d" % (st["judged"], st["back"]))
    print("不可测帧 %d（机头正对/背对相机）" % st["degen"])
    print("已排除的远侧（球背面）样本 %d 个" % st.get("farFrames", 0))
    print("掉头次数 %d（>0 说明去程与回程都验到了）" % st["turns"])
    print("退化帧姿态抖动：%d 次相邻帧对比 · 平均 %.1f° · 最大 %.1f°"
          % (st["jitN"], deg(st["jitSum"] / st["jitN"]) if st["jitN"] else 0.0,
             deg(st["jitMax"])))
    if st["backEx"]:
        print("倒飞明细：" + " | ".join(st["backEx"]))
    if st["jitEx"]:
        print("抖动明细：" + " | ".join(st["jitEx"]))

    # 截图前先关掉挡在球体前面的模态（季报等）。
    # ⚠ 录制 36s 必然跨过季度结算，季报模态会盖住整块球面 ——
    #   不关掉的话裁图截到的是弹窗文字，看不到飞机。
    for _ in range(6):
        closed = await page.evaluate("""() => {
            const b = document.querySelector('[data-act=\"close-report\"]')
                   || document.querySelector('[data-act=\"restart\"]');
            if (b) { b.click(); return true; }
            return false;
        }""")
        if not closed:
            break
        await page.wait_for_timeout(400)
    await page.wait_for_timeout(600)
    await page.screenshot(path=str(OUT / "full.png"))
    cur = await page.evaluate("() => window.__samplePlanes()")
    for q in cur[:8]:
        if not q["vis"]:
            continue
        pad = 26
        x, y = max(0, q["sx"] - pad), max(0, q["sy"] - pad)
        w = min(VW - x, pad * 2)
        h = min(VH - y, pad * 2)
        if w > 8 and h > 8:
            await page.screenshot(path=str(OUT / ("plane-%d.png" % q["i"])),
                                  clip={"x": x, "y": y, "width": w, "height": h})
    print("\n截图: docs/shots/heading/（full.png + plane-N.png 放大裁图）")
    if errs:
        print("页面报错 %d 条：" % len(errs))
        for e in errs[:5]:
            print("   " + e)

    await browser.close()

    print("\n" + "=" * 64)
    rc = 0
    if st["judged"] == 0:
        print("✗ 无效：没有可判定样本 —— 飞机可能没在飞")
        rc = 3
    elif st["back"]:
        print("✗ 检出倒飞 %d / %d 判定样本" % (st["back"], st["judged"]))
        rc = 1
    elif st["turns"] == 0:
        print("✗ 覆盖不足：采样窗内没有掉头，只验到单程")
        rc = 5
    else:
        print("✓ 实机 0 倒飞（%d 个判定样本，机头方向与位移方向全部同向）" % st["judged"])
        print("✓ 覆盖充分（掉头 %d 次，去程与回程都验到）" % st["turns"])
        if st["jitN"] and deg(st["jitMax"]) > 25:
            print("✗ 退化帧姿态抖动过大（最大 %.0f°）—— 退化保护失效" % deg(st["jitMax"]))
            rc = 6
        elif st["jitN"]:
            print("✓ 退化帧姿态稳定（最大帧间变化 %.0f°）" % deg(st["jitMax"]))
        else:
            print("· 本轮未抓到相邻的退化帧（退化窗口很短），抖动未测")
        print("=" * 64)
    return rc


async def _main():
    async with async_playwright() as pw:
        return await run(pw)


if __name__ == "__main__":
    sys.exit(asyncio.run(_main()))
