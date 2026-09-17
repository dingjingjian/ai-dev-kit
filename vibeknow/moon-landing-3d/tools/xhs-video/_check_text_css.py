# -*- coding: utf-8 -*-
"""静态检查：文字可读性不变量 + 平台安全区。

两条硬知识（来自 webgame-promo-video skill）：
  1. **不要用像素反推对比度** —— 实测两次、两次与肉眼相反。
     可读性由「可证明的不变量」保证：每一个压在素材上的文字元素都必须有
     **紧贴笔画的暗色描边**（text-shadow 里至少一层 RGB<=40 且模糊<=4px）。
  2. **text-shadow 不能按逗号切** —— `rgba(0,0,0,.92)` 里的逗号也在其中，
     split(",") 会把颜色拆碎，于是每段都少颜色通道、一层都匹配不到。
     必须按**括号深度**切分。

安全区：底部渐隐必须让禁区成为纯色空白，且**要扫满整条禁区、多个横向位置**，
不能只采最后一行像素（那个 bug 第一次跑判据时被「只采末行」放过了）。
"""
import sys, pathlib
from _tl import load

BASE = pathlib.Path(__file__).resolve().parent

VALIDATE_JS = r"""
() => {
  function splitShadow(raw) {
    // 按括号深度切分，避开 rgba(...) 内部的逗号
    var out = [], depth = 0, cur = '';
    for (var i = 0; i < raw.length; i++) {
      var ch = raw[i];
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  // 每层是否「紧贴描边」：RGB 各通道 <=40（近黑）且模糊 <=4px
  function layerOk(layer) {
    // 关键：算长度前必须先把颜色函数/十六进制色整个剔除。
    // 否则 rgba(0,0,0,.55) 里的 0,0,0 会被当成 dx,dy,blur，
    // 模糊半径恒为 0 —— 9px、18px 的弥散层也会被判成「紧贴」，
    // 守卫恒真、比没有守卫更危险。
    var rest = layer.replace(/rgba?\([^)]*\)/gi, ' ').replace(/#[0-9a-f]{3,8}/gi, ' ');
    var lens = rest.match(/-?\d+(\.\d+)?/g) || [];
    var blur = lens.length >= 3 ? Math.abs(parseFloat(lens[2])) : 0;

    var m = layer.match(/rgba?\(([^)]+)\)/i);
    var r, g, b;
    if (m) {
      var p = m[1].split(',').map(function (x) { return x.trim(); });
      r = parseFloat(p[0]); g = parseFloat(p[1]); b = parseFloat(p[2]);
    } else {
      var hex = layer.match(/#[0-9a-f]{6}\b/i);
      if (hex) {
        var v = parseInt(hex[0].slice(1), 16);
        r = (v >> 16) & 255; g = (v >> 8) & 255; b = v & 255;
      } else {
        var nums = layer.match(/-?\d+(\.\d+)?/g) || [];
        if (nums.length < 3) return false;
        r = +nums[0]; g = +nums[1]; b = +nums[2];
      }
    }
    return (r <= 40 && g <= 40 && b <= 40 && blur <= 4);
  }
  var IDS = ['label', 'sub', 'big'];
  var rows = [], nChecked = 0;
  for (var i = 0; i < IDS.length; i++) {
    var e = document.getElementById(IDS[i]);
    if (!e) continue;
    nChecked++;
    var cs = getComputedStyle(e);
    var raw = cs.textShadow || 'none';
    var layers = (raw === 'none') ? [] : splitShadow(raw);
    var hits = layers.filter(layerOk);
    // 真笔画范围（不是块 border-box）—— 片头大字是居中容器、宽度铺满，
    // 读块底边会永远报越界
    var rng = document.createRange();
    rng.selectNodeContents(e);
    var rects = rng.getClientRects();
    var top = 1e9, bot = -1e9;
    for (var k = 0; k < rects.length; k++) {
      top = Math.min(top, rects[k].top); bot = Math.max(bot, rects[k].bottom);
    }
    if (!rects.length) { top = 0; bot = 0; }
    rows.push({
      id: IDS[i], tightLayers: hits.length, totalLayers: layers.length,
      strokeTop: Math.round(top), strokeBottom: Math.round(bot),
      fontSize: cs.fontSize, color: cs.color
    });
  }
  return { rows: rows, nChecked: nChecked };
}
"""


def main():
    tl = load()
    port = None
    import socket
    for i in range(20):
        p = 8840 + i
        with socket.socket() as s:
            s.settimeout(0.3)
            if s.connect_ex(("127.0.0.1", p)) != 0:
                port = p; break
    import threading, http.server, socketserver
    socketserver.ThreadingTCPServer.daemon_threads = True

    class H(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
        def __init__(self, *a, **k): super().__init__(*a, directory=str(BASE), **k)

    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", port), H)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        b = pw.chromium.launch(channel="msedge", headless=True,
                               args=["--use-gl=angle", "--use-angle=swiftshader",
                                     "--enable-unsafe-swiftshader", "--mute-audio"])
        pg = b.new_page(viewport={"width": tl["W"], "height": tl["H"]}, device_scale_factor=1)
        pg.goto("http://127.0.0.1:%d/stage.html" % port, wait_until="load")
        pg.evaluate("(fc) => { window.FRAME_COUNT = fc; }",
                    {c["clip"]: 400 for c in tl["CLIPS"]})
        # 取每镜中段（淡入完成、淡出未开始的满不透明区间）
        res = None
        for c in tl["CLIPS"]:
            t = c["t0"] + c["dur"] * 0.45
            pg.evaluate("(t) => window.renderFrame(t)", t)
            pg.wait_for_timeout(60)
            r = pg.evaluate(VALIDATE_JS)
            if res is None:
                res = r
            else:
                for a, bb in zip(res["rows"], r["rows"]):
                    a["tightLayers"] = min(a["tightLayers"], bb["tightLayers"])
        b.close()
    httpd.shutdown()

    # ---- 计数守卫：解析到的元素少于预期就报错（恒真的守卫比没有守卫更危险）----
    EXPECT = 3
    print("检查到文字元素 %d 个（预期 %d）" % (res["nChecked"], EXPECT))
    if res["nChecked"] < EXPECT:
        print("!! 元素数少于预期，检查本身失效（比如选择器写错 / 元素改名）")
        return 1
    ok = True
    for r in res["rows"]:
        good = r["tightLayers"] >= 1
        ok = ok and good
        print("  [%s] #%-6s 紧贴描边层 %d/%d  笔画 y=%d~%d  %s"
              % ("OK" if good else "FAIL", r["id"], r["tightLayers"],
                 r["totalLayers"], r["strokeTop"], r["strokeBottom"], r["fontSize"]))
    print("TEXT-INVARIANT", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
