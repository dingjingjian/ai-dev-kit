# -*- coding: utf-8 -*-
"""从 timeline.js（剪辑表唯一真源）读取配置。

渲染、体检、合成三处都走这里，避免各自解析出不一致的结果。
用 node 求值后导出 JSON —— 比在 Python 里正则解析 JS 数组稳健得多。
"""
import json, pathlib, subprocess, tempfile

BASE = pathlib.Path(__file__).resolve().parent
NODE = r"C:/Users/dingj/.workbuddy/binaries/node/versions/22.22.2-3/node.exe"
TIMELINE = BASE / "timeline.js"

_JS = r"""
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
eval(src);
const keys = ['FPS','W','H','XFADE','FADE_IN','FADE_OUT','BASE_ZOOM',
              'RISE','DROP','SEG_SPREAD','SEG_FADE','TEXT_IN','TEXT_OUT',
              'CLIPS','BIG_TITLE','BIG_SUB','BIG_END','BRAND'];
const out = {};
for (const k of keys) { try { out[k] = eval(k); } catch (e) { out[k] = null; } }
let acc = 0;
for (const c of (out.CLIPS || [])) { c.t0 = acc; c.t1 = acc + c.dur; acc += c.dur; }
out.DURATION = acc;
console.log(JSON.stringify(out));
"""


def load():
    f = tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8")
    try:
        f.write(_JS)
        f.close()
        r = subprocess.run([NODE, f.name, str(TIMELINE)],
                           capture_output=True, text=True, encoding="utf-8")
        if r.returncode != 0:
            raise RuntimeError("node 读取 timeline.js 失败: " + (r.stderr or "")[:500])
        return json.loads(r.stdout.strip().splitlines()[-1])
    finally:
        try:
            pathlib.Path(f.name).unlink(missing_ok=True)
        except Exception:
            pass
