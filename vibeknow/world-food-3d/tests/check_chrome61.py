# -*- coding: utf-8 -*-
"""world-food-3d Chrome 61 兼容性静态扫描

判据唯一来源：工作区 `.skill/minitool-zip-builder/references/`
  · css-compatibility.md §2「Chrome 61 不可作为唯一实现的能力」表
  · js-compatibility.md      （ES2017 语法基线 + Web API 能力检测要求）
  · device-capabilities.md   （容器禁用能力清单）

⚠ 扫的是**最终 zip 内的产物**，不是源码 —— 规范明确要求「兼容性以最终 zip 为准」。

为什么必须静态扫、不能只靠实机：浏览器对不认识的 CSS 是**静默丢弃**，不抛异常。
在现代 Edge 上跑一遍全部通过，完全不能说明 Chrome 61 上可用 —— 现代内核会把
`clamp()`、`min()`、`gap` 全部正确应用，实机上什么异常也看不到。
这一层的唯一可靠手段就是「按禁忌清单逐条静态核对」。

运行：python tests/check_chrome61.py
"""
import pathlib
import re
import sys
import zipfile

# Windows 控制台默认 GBK，打不出 ✓/✗ 会直接抛 UnicodeEncodeError
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = pathlib.Path(__file__).resolve().parent.parent
ZIP = ROOT / "world-food-3d.zip"
DIST = ROOT / "dist"

pass_n = fail_n = warn_n = 0
failures, warnings = [], []


def ok(cond, name, detail=""):
    global pass_n, fail_n
    if cond:
        pass_n += 1
        print("  ✓ %s" % name)
    else:
        fail_n += 1
        failures.append(name + ("  → " + str(detail) if detail else ""))
        print("  ✗ %s  %s" % (name, detail))


def warn(cond, name, detail=""):
    """非硬红线，但需人工确认的项。"""
    global warn_n
    if not cond:
        warn_n += 1
        warnings.append(name + ("  → " + str(detail) if detail else ""))
        print("  ! %s  %s" % (name, detail))


def strip_css_comments(s):
    return re.sub(r'/\*[\s\S]*?\*/', ' ', s)


def strip_js_strings_and_comments(s):
    """剥掉 JS 的注释与字符串字面量 —— 否则注释里的示例写法会全变成误报。

    ⚠ 必须处理模板字符串（反引号）。three.min.js 里大量使用，若不处理，
       反引号内的引号会打乱剥离状态机，凭空造出 `||=` 这类"假语法"——
       第一版就是这么误报了 8 处逻辑赋值。模板串里的 ${} 插值是代码，保留。"""
    out, i, n = [], 0, len(s)
    in_str = None      # '"' / "'" / '`'
    while i < n:
        c, d = s[i], s[i + 1] if i + 1 < n else ''

        if in_str == '`':
            if c == '\\':
                i += 2
                continue
            if c == '`':
                in_str = None
            elif c == '$' and d == '{':
                # 插值是真的代码：跳到配对的 } 之后，按普通代码继续扫
                depth, j = 1, i + 2
                while j < n and depth:
                    if s[j] in '"\'`':                 # 先跳过插值里的字符串
                        q, j = s[j], j + 1
                        while j < n and s[j] != q:
                            j += 2 if s[j] == '\\' else 1
                        j += 1
                        continue
                    if s[j] == '{':
                        depth += 1
                    elif s[j] == '}':
                        depth -= 1
                    j += 1
                i = j
                continue
            i += 1
            continue

        if in_str:
            if c == '\\':
                i += 2
                continue
            if c == in_str:
                in_str = None
            i += 1
            continue

        if c in '"\'`':
            in_str = c
            i += 1
            continue
        if c == '/' and d == '*':
            e = s.find('*/', i + 2)
            i = n if e < 0 else e + 2
            continue
        if c == '/' and d == '/':
            e = s.find('\n', i)
            i = n if e < 0 else e
            continue
        out.append(c)
        i += 1
    return ''.join(out)


def strip_js_comments(s):
    """只剥注释、不动字符串 —— 给压缩过的 vendor 用。

    three.min.js 里正则字面量与除法运算符纠缠不清，简易剥离器无法可靠分辨
    正则和字符串，会把状态机带跑偏、凭空拼出 `||=` 这种"假语法"（第一版就是
    这样误报了 8 处）。压缩文件本身几乎没有注释，只剥注释足够准确。"""
    out, i, n = [], 0, len(s)
    while i < n:
        c, d = s[i], s[i + 1] if i + 1 < n else ''
        if c == '/' and d == '*':
            e = s.find('*/', i + 2)
            i = n if e < 0 else e + 2
            continue
        if c == '/' and d == '/':
            e = s.find('\n', i)
            i = n if e < 0 else e
            continue
        out.append(c)
        i += 1
    return ''.join(out)


def supports_ranges(css):
    """返回所有 @supports 块的 [start, end) 区间（按花括号配对）。"""
    out = []
    for m in re.finditer(r'@supports[^{]*\{', css):
        depth, i, n = 1, m.end(), len(css)
        while i < n and depth:
            if css[i] == '{':
                depth += 1
            elif css[i] == '}':
                depth -= 1
            i += 1
        out.append((m.start(), i))
    return out


def load():
    """返回 [(name, text)]；优先扫 zip，退回 dist。"""
    if ZIP.exists():
        with zipfile.ZipFile(ZIP) as z:
            return [(n, z.read(n).decode("utf-8", "ignore")) for n in z.namelist()]
    if DIST.exists():
        print("  ! 未找到 zip，改扫 dist/（交付前请先跑 tools/build_zip.py）")
        return [(str(p.relative_to(DIST)).replace("\\", "/"),
                 p.read_text(encoding="utf-8", errors="ignore"))
                for p in DIST.rglob("*") if p.is_file()]
    print("先跑 tools/build_zip.py 生成 dist/ 与 zip")
    return None


def main():
    files = load()
    if files is None:
        return 1
    text = {n: t for n, t in files}
    html = text.get("index.html", "")
    # ⚠ 内联 <script> 也是产物的一部分（flex gap 的行为检测就写在里面），
    #    只扫 .js 文件会漏掉它 —— 第一版就漏了，判成"脚本没写开关"。
    inline_js = "\n".join(re.findall(r'<script[^>]*>([\s\S]*?)</script>', html))
    own = [n for n in text if n.endswith(".js") and "three.min" not in n]
    vendor = [n for n in text if n.endswith(".js") and "three.min" in n]
    own_raw = "\n".join(text[n] for n in own) + "\n" + inline_js   # 未剥离：查"有没有用到某 API"
    own_js = strip_js_strings_and_comments(own_raw)                # 剥离后：查语法
    page_js = own_js + "\n" + "\n".join(
        strip_js_strings_and_comments(t) for n, t in files if n.endswith(".js"))

    style_blocks = re.findall(r'<style[^>]*>([\s\S]*?)</style>', html)
    css_raw = "\n".join(style_blocks) + "\n".join(
        t for n, t in files if n.endswith(".css"))
    css = strip_css_comments(css_raw)
    css_nospace = css.replace(" ", "")

    # ── ① CSS 禁忌清单 ──
    print("\n── ① CSS：Chrome 61 不可作为唯一实现的能力 " + "─" * 22)
    ok(len(style_blocks) > 0, "解析到内联样式块 %d 个" % len(style_blocks))

    bans = [
        (r'(?<![\w-])inset\s*:', 'inset 简写（用 top/right/bottom/left）'),
        (r'margin-inline(-start|-end)?\s*:', 'margin-inline 逻辑属性'),
        (r'margin-block(-start|-end)?\s*:', 'margin-block 逻辑属性'),
        (r'padding-inline(-start|-end)?\s*:', 'padding-inline 逻辑属性'),
        (r'padding-block(-start|-end)?\s*:', 'padding-block 逻辑属性'),
        (r'overflow\s*:\s*clip', 'overflow: clip（用 hidden）'),
        (r':focus-visible', ':focus-visible（需 :focus 兜底）'),
        (r':has\s*\(', ':has() 选择器'),
        (r'@container', 'Container Queries'),
        (r'subgrid', 'Subgrid'),
        (r'@layer', 'Cascade Layers'),
        (r'@property', '@property'),
        (r'aspect-ratio\s*:', 'aspect-ratio'),
        (r'color-mix\s*\(', 'color-mix()'),
        (r'\bokl(ch|ab)\s*\(', 'oklch/oklab 颜色'),
        (r'text-wrap\s*:', 'text-wrap 现代排版属性'),
        (r'\b100dvh\b|\bdvh\b|\bsvh\b|\blvh\b', 'dvh/svh/lvh 动态视口单位'),
    ]
    for pat, label in bans:
        hits = re.findall(pat, css)
        ok(not hits, "未使用 %s" % label, ("出现 %d 次" % len(hits)) if hits else "")

    for fn in ("clamp", "min", "max"):
        hits = re.findall(r'(?<![\w-])%s\s*\(' % fn, css)
        ok(not hits, "未使用 CSS %s() 函数" % fn,
           ("出现 %d 次" % len(hits)) if hits else "")

    # ── ② Flex gap 必须走行为检测 ──
    print("\n── ② Flex gap：行为检测而非语法检测 " + "─" * 28)
    gap_decl = re.findall(r'(?<!grid-)(?<![\w-])(?:row-|column-)?gap\s*:', css)
    if gap_decl:
        ok("supports-flex-gap" in css, "使用 gap 时配套了 .supports-flex-gap 增强层")
        ok("supports-flex-gap" in own_raw, "页面脚本会写入 supports-flex-gap 开关")
        ok("scrollHeight" in page_js and "rowGap" in page_js,
           "gap 走布局行为检测（建 flex 容器量 scrollHeight），不是语法检测")
        ok(not re.search(r"CSS\.supports\(\s*['\"]gap", page_js),
           "未把 CSS.supports('gap') 当 Flex gap 检测")
        ok(not re.search(r'@supports\s*\(\s*gap', css),
           "未把 @supports (gap:…) 当 Flex gap 检测")
        n_ml = len(re.findall(r'margin-left\s*:', css))
        ok(n_ml >= len(gap_decl),
           "gap 配了子项 margin 基线（%d 处 gap / %d 处 margin-left）"
           % (len(gap_decl), n_ml))
    else:
        ok(True, "未使用 Flex gap")

    # ── ③ 安全区与视口 ──
    print("\n── ③ 安全区 / 视口 " + "─" * 42)
    ok("viewport-fit=cover" in html, "viewport meta 含 viewport-fit=cover")
    env_uses = [m.start() for m in re.finditer(r'env\(', css)]
    ok(len(env_uses) > 0, "实测 env() 出现 %d 次（用于安全区）" % len(env_uses),
       "未找到 env()" if not env_uses else "")
    ranges = supports_ranges(css)
    outside = [css[max(0, p - 40):p + 16] for p in env_uses
               if not any(a <= p < b for a, b in ranges)]
    ok(not outside, "所有 env() 都包在 @supports 里（Chrome 61 整块跳过）", outside[:2])
    ok("--sat:0px" in css_nospace, ":root 里 --sat 有 0px 基线（不是只有 env 版本）")
    ok("--sattop:8px" in css_nospace, ":root 里 --sattop 有 8px 基线")
    ok("--sab:0px" in css_nospace, ":root 里 --sab 有 0px 基线")

    # ── ④ JS 语法基线（ES2017）──
    print("\n── ④ JS：ES2017 语法基线 " + "─" * 38)
    ok(len(own) >= 2, "扫到自有 JS %d 个（%s）" % (len(own), "、".join(own)))

    es_ban = [
        (r'\?\?=', '逻辑赋值 ??='),
        (r'\|\|=', '逻辑赋值 ||='),
        (r'&&=', '逻辑赋值 &&='),
        (r'\?\?', '空值合并 ??'),
        (r'\?\.[A-Za-z_$[(]', '可选链 ?.'),
        (r'(?<![\w.])\d+_[\d_]*(?=\W)', '数字分隔符 1_000'),
        (r'\.replaceAll\s*\(', 'String.replaceAll()'),
        (r'Object\.hasOwn\s*\(', 'Object.hasOwn()'),
        (r'structuredClone\s*\(', 'structuredClone()'),
        (r'for\s+await', '异步迭代 for await'),
        (r'static\s*\{', 'class static block'),
        (r'\bBigInt\b', 'BigInt'),
    ]
    for pat, label in es_ban:
        hits = re.findall(pat, own_js)
        ok(not hits, "自有脚本未使用 %s" % label, ("%d 处" % len(hits)) if hits else "")

    # vendor（three.min.js）：语法不兼容会在解析阶段直接失败，无法运行时兜底，
    # 故硬语法项同样要扫；`.at(` 是 three 自己的方法名，UMD 尾部的 globalThis 豁免。
    ok(len(vendor) == 1, "vendor 脚本单独成项：%s" % "、".join(vendor))
    if vendor:
        v = strip_js_comments(text[vendor[0]])
        for pat, label in es_ban:
            hits = re.findall(pat, v)
            ok(not hits, "vendor(three.min.js) 未使用 %s" % label,
               ("%d 处" % len(hits)) if hits else "")
        # UMD 尾部 `t = typeof globalThis!=="undefined" ? globalThis : t||self`：
        # Chrome 61 里 window/self 一定存在 → 走右分支，globalThis 永不被求值 → 安全。
        # 判据：要么紧跟 typeof，要么处在三元分支上（前后是 ? / :）。
        bad = []
        for m in re.finditer(r'\bglobalThis\b', v):
            pre = v[max(0, m.start() - 8):m.start()]
            before = v[max(0, m.start() - 3):m.start()]
            after = v[m.end():m.end() + 3]
            if 'typeof ' in pre:
                continue
            if re.search(r'[?:]\s*$', before) or re.match(r'\s*[?:,);]', after):
                continue
            bad.append(m.group(0))
        ok(not bad, "vendor 的 globalThis 仅出现在 UMD 三元兜底里", bad[:2])

    # ── ⑤ 运行时 API 与容器禁用能力 ──
    print("\n── ⑤ 运行时 API / 容器禁用能力 " + "─" * 34)
    for pat, label in [
        (r'\bResizeObserver\b', 'ResizeObserver'),
        (r'\bIntersectionObserver\b', 'IntersectionObserver'),
        (r'\.flatMap\s*\(', 'Array.flatMap'),
        (r'\.fromEntries\s*\(', 'Object.fromEntries'),
        (r'\.matchAll\s*\(', 'String.matchAll'),
    ]:
        hits = re.findall(pat, own_js)
        if not hits:
            ok(True, "未使用 %s" % label)
            continue
        guard = re.search(
            r'(typeof\s+%s|["\']%s["\']\s+in\s+|(?:window|global|self)\.%s\s*(?:\|\||&&|\?|\)))'
            % (label, label, label), own_js)
        ok(bool(guard), "%s 使用前做了能力检测" % label, "未找到 typeof/in/逻辑语境 检测")

    for pat, label in [
        (r'\bfetch\s*\(', 'fetch'),
        (r'XMLHttpRequest', 'XMLHttpRequest'),
        (r'new\s+Worker\s*\(', 'Web Worker'),
        (r'navigator\.serviceWorker', 'Service Worker'),
        (r'\beval\s*\(', 'eval'),
        (r'new\s+Function\s*\(', 'new Function'),
        (r'localStorage|sessionStorage', '存储 API（容器内不稳定）'),
        (r'navigator\.geolocation', 'Geolocation'),
    ]:
        hits = re.findall(pat, own_js)
        ok(not hits, "自有脚本未使用 %s" % label, ("%d 处" % len(hits)) if hits else "")

    # ── ⑥ 3D 降级路径 ──
    print("\n── ⑥ 3D 降级：球挂了不能连累整页 " + "─" * 30)
    ok("globe-down" in css, "CSS 里有 .globe-down 降级层样式")
    ok("globeDown" in html, "地球槽内挂了降级块 #globeDown")
    ok("globeDown" in own_raw, "脚本会点亮降级块")
    ok(re.search(r"getContext\(\s*['\"]webgl", own_raw) is not None,
       "WebGL 走 getContext 能力检测")
    ok(re.search(r"typeof\s+THREE\s*!==\s*['\"]undefined", own_raw) is not None,
       "THREE 加载失败也走同一条降级路径")
    ok(re.search(r'try\{.*?G=\(function\(\)', own_js, re.S) is not None,
       "建场景整段包在 try/catch 里（异常也不炸页面）")
    ok(not re.search(r"getElementById\('fallback'\)", own_raw),
       "不再有全屏「无法启动 3D 场景」遮罩（旧写法把整页判死）")

    # ── ⑦ 触摸可用性 ──
    print("\n── ⑦ 触摸端可用性 " + "─" * 42)
    ok("touchstart" in own_raw or "pointerdown" in own_raw,
       "核心交互用触摸 / 指针事件，不依赖鼠标事件")
    ok("user-scalable=no" in html, "viewport 禁用缩放")
    hover_n = len(re.findall(r':hover', css))
    warn(hover_n <= 12, "「:hover 规则数」（%d 条）已核，关键操作不依赖悬停" % hover_n)
    ok(":focus{" in css_nospace or ":focus," in css_nospace,
       "焦点样式有 :focus 基线（不只依赖 :focus-visible）")

    print("\n" + "=" * 68)
    print("Chrome 61 静态兼容：通过 %d，警告 %d，失败 %d" % (pass_n, warn_n, fail_n))
    if warnings:
        print("\n警告项（需人工确认）：")
        for w in warnings:
            print("  ! " + w)
    if failures:
        print("\n失败项：")
        for f in failures:
            print("  ✗ " + f)
    print("=" * 68)
    return 1 if fail_n else 0


if __name__ == "__main__":
    sys.exit(main())
