# -*- coding: utf-8 -*-
"""
拼豆城市 · 构建脚本（唯一真源入口）
------------------------------------
源码放在 _dev/src/：
    index.template.html   页面外壳（HTML + CSS）
    game.js               游戏逻辑（含 __DATA__ 占位，构建时注入数据）
数据放在 _dev/data/buildings.json。

运行后产出根目录 index.html + main.js。
**禁止直接改根目录产物** —— 一律改 _dev/ 下的源码后重跑 `python _dev/build.py`。

产物约束（小红书小工具）：
  - 脚本外置（index.html 只留 <script src="./main.js">）
  - 经典脚本，无 import/export
  - 零外部资源、零 CDN、零 UA 判定
  - 安全区用 var(--safe-area-inset-*, env(...)) 组合
"""
import json
import re
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
ROOT = BASE.parent
SRC = BASE / "src"
sys.stdout.reconfigure(encoding="utf-8")

DATA = json.loads((BASE / "data" / "buildings.json").read_text(encoding="utf-8"))
HTML = (SRC / "index.template.html").read_text(encoding="utf-8")
JS = (SRC / "game.js").read_text(encoding="utf-8")

# ---------------------------------------------------------------- 数据校验
PAL_KEYS = {p["k"] for p in DATA["palette"]}
CAT_KEYS = {c["id"] for c in DATA["cats"]}
IDS = set()
ERRS = []

for c in DATA["cats"]:
    if not re.match(r"^#[0-9A-Fa-f]{6}$", c.get("color", "")):
        ERRS.append("类别 %s 的 color 不是 6 位十六进制" % c["id"])

for b in DATA["buildings"]:
    bid = b.get("id", "?")
    rows = b.get("rows", [])
    n = len(rows)
    if bid in IDS:
        ERRS.append("建筑 id 重复：%s" % bid)
    IDS.add(bid)
    if b.get("cat") not in CAT_KEYS:
        ERRS.append("%s 的 cat '%s' 不在 cats 表中" % (bid, b.get("cat")))
    if not rows:
        ERRS.append("%s 没有图纸" % bid)
    for i, r in enumerate(rows):
        if len(r) != n:
            ERRS.append("%s 第 %d 行宽度 %d != 行数 %d" % (bid, i, len(r), n))
        for ch in r:
            if ch != "." and ch not in PAL_KEYS:
                ERRS.append("%s 使用了未定义的色号 '%s'" % (bid, ch))
    if not any(ch != "." for r in rows for ch in r):
        ERRS.append("%s 图纸为空" % bid)
    # 资源型建筑必须有产出，耗电耗水的建筑得让人一眼看出代价
    if not isinstance(b.get("cost"), int) or b["cost"] <= 0:
        ERRS.append("%s 缺少合法造价" % bid)
    for k in ("popCap", "jobs", "income", "happy", "unlockPop"):
        if not isinstance(b.get(k), int):
            ERRS.append("%s 缺少整数字段 %s" % (bid, k))
    for key in ("use", "gen"):
        d = b.get(key) or {}
        for k in d:
            if k not in ("power", "water", "trash"):
                ERRS.append("%s 的 %s 含未知资源 '%s'" % (bid, key, k))

# 每个类别至少有一张图纸，否则分组标题会出现空组
for c in DATA["cats"]:
    if not any(b.get("cat") == c["id"] for b in DATA["buildings"]):
        ERRS.append("类别 %s 没有任何建筑" % c["id"])

for t in DATA["titles"]:
    if not isinstance(t.get("pop"), int):
        ERRS.append("称号配置缺少 pop：%s" % t)

if ERRS:
    sys.exit("数据校验未通过：\n  - " + "\n  - ".join(ERRS))
print("数据校验通过：%d 张图纸 / %d 色 / %d 类" % (len(DATA["buildings"]), len(PAL_KEYS), len(CAT_KEYS)))

DATA_JSON = json.dumps(DATA, ensure_ascii=False, separators=(",", ":"))

# ---------------------------------------------------------------- 产物校验
# 元素 id 校验：自动识别「以 id 为首个参数」的取元素函数，避免新增封装后漏校验。
#   1) 函数体里直接用了 getElementById 的，算直接取元素（如 $）
#   2) 函数体里调用了已知取元素函数、且把它自己的首参传下去的，算间接封装（如 setChip 内部调 $(id)）
# 闭包求到第 2 步不动为止，这样以后加 helper 无需改本文件。
def _fn_bodies(js):
    out = []
    for m in re.finditer(r"function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)", js):
        params = m.group(2).strip()
        if not params:
            continue
        first = params.split(",")[0].strip()
        i = js.find("{", m.end())
        if i < 0:
            continue
        depth, j = 0, i
        while j < len(js):
            if js[j] == "{":
                depth += 1
            elif js[j] == "}":
                depth -= 1
                if depth == 0:
                    break
            j += 1
        out.append((m.group(1), first, js[i:j + 1]))
    return out


FN_DEFS = _fn_bodies(JS)
ID_GETTERS = [n for n, _p, b in FN_DEFS if "getElementById(" in b]
_changed = True
while _changed:
    _changed = False
    for _n, _p, _b in FN_DEFS:
        if _n in ID_GETTERS:
            continue
        if any(re.search(r"(?<![\w.])%s\(\s*%s\s*[,)]" % (re.escape(g), re.escape(_p)), _b)
               for g in ID_GETTERS):
            ID_GETTERS.append(_n)
            _changed = True

if not ID_GETTERS:
    sys.exit("未能识别出任何取元素函数，请检查 game.js 是否改动了 $ 的定义")

_getter_pat = r"(?<![\w.])(?:%s)\(\s*'([A-Za-z0-9_]+)'" % "|".join(re.escape(g) for g in ID_GETTERS)
ids_used = set(re.findall(_getter_pat, JS))
ids_decl = set(re.findall(r'id="([A-Za-z0-9_]+)"', HTML))
missing = sorted(ids_used - ids_decl)
if missing:
    sys.exit("JS 引用了 HTML 中不存在的元素 id：%s" % ", ".join(missing))
unused = sorted(ids_decl - ids_used)

for m in re.findall(r'https?://[^\s"\')]+', HTML):
    if "www.w3.org" not in m:
        sys.exit("HTML 含外部资源引用：%s" % m)

if re.search(r"<script(?![^>]*\bsrc=)[^>]*>", HTML, re.I):
    sys.exit("HTML 含内联 <script>")
if '<script src="./main.js"></script>' not in HTML:
    sys.exit("HTML 未以 <script src=\"./main.js\"> 引入脚本")
if re.search(r"^\s*(import|export)\s", JS, re.M):
    sys.exit("game.js 含 import/export，宿主可能不支持")
if "var(--safe-area-inset-top, env(safe-area-inset-top, 0px))" not in HTML:
    sys.exit("缺少安全区变量组合")
if "__DATA__" not in JS:
    sys.exit("game.js 缺少 __DATA__ 占位符")

# ---------------------------------------------------------------- 输出
JS_OUT = JS.replace("__DATA__", DATA_JSON)

(ROOT / "index.html").write_text(HTML, encoding="utf-8")
(ROOT / "main.js").write_text(JS_OUT, encoding="utf-8")

print("已生成 index.html  %.1f KB" % ((ROOT / "index.html").stat().st_size / 1024))
print("已生成 main.js     %.1f KB" % ((ROOT / "main.js").stat().st_size / 1024))
print("元素 id 校验通过（%d 个引用 / 取元素函数：%s）" % (len(ids_used), ", ".join(sorted(ID_GETTERS))))
if unused:
    print("提示：HTML 中声明但 JS 未直接引用的 id（靠 CSS 或间接使用属正常）：%s" % ", ".join(unused))
