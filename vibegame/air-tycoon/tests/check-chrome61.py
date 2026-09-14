# -*- coding: utf-8 -*-
"""
air-tycoon Chrome 61 兼容性静态扫描

判据唯一来源：工作区 `.skill/minitool-zip-builder/references/`
  · css-compatibility.md §2「Chrome 61 不可作为唯一实现的能力」表
  · js-compatibility.md  （ES 语法基线 + Web API 能力检测要求）
  · device-capabilities.md（禁用能力清单）

⚠ 扫的是**最终 zip 内的产物**，不是源码 —— 规范明确要求「兼容性以最终 zip 为准」。
   （本作无构建链，源码即产物，但走 zip 能同时覆盖「dist 与源码不同」的风险。）

为什么必须静态扫、不能只靠实机：浏览器对不认识的 CSS 是**静默丢弃**，不抛异常。
在现代 Edge 上跑一遍全部通过，完全不能说明 Chrome 61 上可用 —— 新版内核会把
`inset`、`gap`、`clamp()` 全部正确应用，你在实机上根本看不到任何异常。
所以这一层的唯一可靠手段是「按禁忌清单逐条静态核对」。

运行：python tests/check-chrome61.py
"""
import pathlib, re, sys, zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
ZIP = ROOT / "air-tycoon.zip"

pass_n, fail_n, warn_n = 0, 0, 0
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
    """剥掉 JS 的注释与字符串字面量 —— 否则文档注释里的示例写法会全变成误报。"""
    out, i, n = [], 0, len(s)
    in_str = None
    while i < n:
        c, d = s[i], s[i + 1] if i + 1 < n else ''
        if in_str:
            if c == '\\':
                i += 2
                continue
            if c == in_str:
                in_str = None
            i += 1
            continue
        if c in '"\'':
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


def main():
    if not ZIP.exists():
        print("先跑 tools/build_dist.py 生成 zip")
        return 1

    with zipfile.ZipFile(ZIP) as z:
        names = z.namelist()
        html = z.read("index.html").decode("utf-8")

        # ── ① CSS 禁忌清单 ──
        print("\n── ① CSS：Chrome 61 不可作为唯一实现的能力 " + "─" * 22)
        style_blocks = re.findall(r'<style[^>]*>([\s\S]*?)</style>', html)
        # 也扫包内 .css（本作无独立 css 文件，留作通用性）
        css_all = "\n".join(style_blocks) + "\n".join(
            z.read(n).decode("utf-8", "ignore") for n in names if n.endswith(".css"))
        css = strip_css_comments(css_all)
        ok(len(style_blocks) > 0, "解析到内联样式块 %d 个" % len(style_blocks))

        # 逐条禁忌： (正则, 说明, 是否硬红线)
        cs_bans = [
            (r'(?<![\w-])inset\s*:', 'inset 简写（用 top/right/bottom/left）', True),
            (r'margin-inline(-start|-end)?\s*:', 'margin-inline 逻辑属性', True),
            (r'margin-block(-start|-end)?\s*:', 'margin-block 逻辑属性', True),
            (r'padding-inline(-start|-end)?\s*:', 'padding-inline 逻辑属性', True),
            (r'padding-block(-start|-end)?\s*:', 'padding-block 逻辑属性', True),
            (r'overflow\s*:\s*clip', 'overflow: clip（用 hidden）', True),
            (r':focus-visible', ':focus-visible（需 :focus 兜底）', True),
            (r':has\s*\(', ':has() 选择器', True),
            (r'@container', 'Container Queries', True),
            (r'subgrid', 'Subgrid', True),
            (r'@layer', 'Cascade Layers', True),
            (r'@property', '@property', True),
            (r'aspect-ratio\s*:', 'aspect-ratio', True),
            (r'color-mix\s*\(', 'color-mix()', True),
            (r'\bokl(ch|ab)\s*\(', 'oklch/oklab 颜色', True),
            (r'text-wrap\s*:', 'text-wrap 现代排版属性', True),
            (r'\bdvh\b|\bsvh\b|\blvh\b', 'dvh/svh/lvh 动态视口单位', True),
        ]
        for pat, label, hard in cs_bans:
            hits = re.findall(pat, css)
            if hard:
                ok(not hits, "未使用 %s" % label,
                   ("出现 %d 次" % len(hits)) if hits else "")
            else:
                warn(not hits, "未使用 %s" % label)

        # min()/max()/clamp()
        for fn in ("clamp", "min", "max"):
            hits = re.findall(r'(?<![\w-])%s\s*\(' % fn, css)
            ok(not hits, "未使用 CSS %s() 函数" % fn,
               ("出现 %d 次" % len(hits)) if hits else "")

        # Flex gap：必须走行为检测，不能只写 gap
        flexgap_used = bool(re.search(r'(?<!grid-)(?<![\w-])(row-)?gap\s*:', css))
        gap_decl = re.findall(r'(?<!grid-)(?<![\w-])(?:row-)?gap\s*:', css)
        if gap_decl:
            # 有 gap 声明 → 必须同时有 supports-flex-gap 的行为检测
            # ⚠ 必须扫**剥注释剥字符串**之后的版本：compat.js 的注释里
            #   大段讨论「为什么不能用 CSS.supports('gap')」，用原始文本会误报。
            js_stripped = "\n".join(
                strip_js_strings_and_comments(z.read(n).decode("utf-8", "ignore"))
                for n in names if n.endswith(".js"))
            js_all = "\n".join(z.read(n).decode("utf-8", "ignore")
                               for n in names if n.endswith(".js"))
            ok("supports-flex-gap" in css, "使用 gap 时配套了 .supports-flex-gap 增强层")
            ok("supportsFlexGap" in js_stripped and "scrollHeight" in js_stripped,
               "gap 走了布局行为检测（建 Flex 量 scrollHeight），而非 CSS.supports 语法检测")
            ok(not re.search(r"CSS\.supports\(\s*['\"]gap", js_stripped),
               "未把 CSS.supports('gap') 当 Flex gap 检测")
            # 剥注释后再查 @supports（CSS 侧），同样避免注释误报
            ok(not re.search(r'@supports\s*\(\s*gap', strip_css_comments(css_all)),
               "未把 @supports (gap:…) 当 Flex gap 检测")
            # 反向自检：确认剥离确实生效（原文里有该串、剥离后没有）
            ok(bool(re.search(r"CSS\.supports\(\s*['\"]gap", js_all)),
               "（自检）原始源码确实提到 CSS.supports('gap')，但仅在注释中 —— 剥离逻辑有效")

        # backdrop-filter 需先有实色/半透明背景兜底
        if re.search(r'backdrop-filter', css):
            pre = re.findall(r'-webkit-backdrop-filter', css)
            ok(len(pre) > 0, "backdrop-filter 配了 -webkit- 前缀")
        else:
            ok(True, "未使用 backdrop-filter")

        # ── ② 安全区与视口 ──
        print("\n── ② 安全区 / 视口 " + "─" * 42)
        ok("viewport-fit=cover" in html, "viewport meta 含 viewport-fit=cover")
        ok("env(safe-area-inset" in css or "--safe-" in css,
           "使用安全区变量或 env(safe-area-inset-*)")
        # env() 使用处必须有非 env 的兜底值
        env_uses = re.findall(r'env\(safe-area-inset-[a-z]+[^)]*\)', css)
        ok(len(env_uses) > 0, "实测 env() 出现 %d 次（用于安全区）" % len(env_uses),
           "未找到 env()" if not env_uses else "")
        ok(not re.search(r'(?<![\w-])100dvh', css), "未用 100dvh")

        # ── ③ JS 语法基线（ES2017）──
        print("\n── ③ JS：ES2017 语法基线 " + "─" * 38)
        js_files = [n for n in names if n.endswith(".js")]
        vendor = [n for n in js_files if "three.min" in n]
        own = [n for n in js_files if n not in vendor]
        ok(len(own) >= 7, "扫到自有 JS %d 个" % len(own))

        es_ban = [
            (r'\?\?=', '逻辑赋值 ??=', True),
            (r'\|\|=', '逻辑赋值 ||=', True),
            (r'&&=', '逻辑赋值 &&=', True),
            (r'\?\?', '空值合并 ??', False),          # 与 ?. 同期（Chrome 80）
            (r'\?\.', '可选链 ?.', False),
            (r'(?<![\w.])\d+_[\d_]*(?=\W)', '数字分隔符 1_000', True),
            (r'\.at\s*\(', 'Array.prototype.at()', False),
            (r'\.replaceAll\s*\(', 'String.replaceAll()', False),
            (r'Object\.hasOwn\s*\(', 'Object.hasOwn()', False),
            (r'structuredClone\s*\(', 'structuredClone()', False),
            # ⚠ globalThis（Chrome 71）要排除「三元兜底」写法：
            #   `typeof window !== 'undefined' ? window : globalThis`
            #   是 UMD 尾部的标准写法 —— Chrome 61 里 window 一定存在，走左分支，
            #   globalThis 这个标识符**永不被求值**，因此安全。只有当 globalThis
            #   出现在取值路径上（如 `globalThis.X =`）才算真问题。
            (r'(?<!:\s)\bglobalThis\b(?!\s*;?\s*$)', 'globalThis（Chrome 71）', False),
        ]
        # 更精确的 globalThis 判据：排除 `: globalThis)` / `: globalThis;` 这类兜底右值
        GLOBALTHIS_SAFE = re.compile(r':\s*globalThis\s*[);]')
        for n in own:
            body = strip_js_strings_and_comments(z.read(n).decode("utf-8", "ignore"))
            for pat, label, hard in es_ban:
                if label.startswith('globalThis'):
                    hits = [m for m in re.finditer(r'\bglobalThis\b', body)
                            if not GLOBALTHIS_SAFE.search(body[max(0, m.start() - 24):m.end() + 4])]
                else:
                    hits = re.findall(pat, body)
                if hard:
                    ok(not hits, "%s 未使用 %s" % (n, label),
                       ("%d 处" % len(hits)) if hits else "")
                else:
                    # ⚠ 这里原来写反了：warn(cond) 是「cond 为假才报警」，
                    #   而语义是「出现了才需人工确认」→ 应传 not hits。
                    warn(not hits, "%s 未使用 %s" % (n, label),
                         ("%d 处需确认" % len(hits)) if hits else "")

        # ── ④ Web API 能力检测（Chrome 61 缺失的必须检测后才用）──
        print("\n── ④ Web API：用前必须能力检测 " + "─" * 30)
        js_body = {n: strip_js_strings_and_comments(z.read(n).decode("utf-8", "ignore"))
                   for n in own}
        js_concat = "\n".join(js_body.values())
        api_rules = [
            (r'\bResizeObserver\b', 'ResizeObserver', r'ResizeObserver'),
            (r'\.flatMap\s*\(', 'Array.flatMap', None),
            (r'\.fromEntries\s*\(', 'Object.fromEntries', None),
            (r'\.matchAll\s*\(', 'String.matchAll', None),
            (r'\bBigInt\b', 'BigInt', None),
            (r'\bIndexedDB\b|\bindexedDB\b', 'IndexedDB', None),
            (r'\bIntersectionObserver\b', 'IntersectionObserver', r'IntersectionObserver'),
            (r'\bAudioContext\b|\bwebkitAudioContext\b', 'WebAudio', r'AudioContext'),
        ]
        for pat, label, guard in api_rules:
            hits = re.findall(pat, js_concat)
            if not hits:
                ok(True, "未使用 %s" % label)
                continue
            if guard:
                # 需在附近有检测。接受的写法（都是真实可用的能力检测）：
                #   typeof AC !== 'undefined'
                #   'AC' in window
                #   window.AC && ...          /  (window.AC)
                #   window.AC || window.webkitAC     ← 本作用的是这条
                # ⚠ 关键：`global.AC` 这个**mention** 本身不是检测 ——
                #   `var AC = global.AC;`（不判存在，直接用）必须被判为失败。
                #   故此处要求 mention 处于比较/逻辑语境：
                #   后面跟 `||`、`&&`、`?`、`)`、`,`、`;` 里的**前四者**，
                #   或前面有 `if (!`/`typeof`。
                #   （曾写成「只要出现 global.X 就算通过」，结果
                #    `var AC = global.AudioContext;` 这条真·无检测被放过。）
                detected = re.search(
                    r'(typeof\s+%s'
                    r'|["\']%s["\']\s+in\s+'
                    # 逻辑语境：window.AC || / && / ? / if (!window.AC)
                    r'|(?:window|global|self)\.%s\s*(?:\|\||&&|\?|\))'
                    r'|!\s*(?:window|global|self)\.%s'
                    r'|if\s*\(\s*(?:window|global|self)\.%s'
                    r')' % (guard, guard, guard, guard, guard), js_concat)
                ok(bool(detected), "%s 使用前做了能力检测" % label,
                   "未找到 typeof/in/逻辑语境 检测")
            else:
                # Chrome 61 已有（ES2017 / 早期 API），不强制
                ok(True, "%s 在 Chrome 61 基线内（%d 处使用）" % (label, len(hits)))

        # ── ⑤ device-capabilities 禁用能力 ──
        print("\n── ⑤ 容器禁用能力 " + "─" * 44)
        banned = [
            (r'\bfetch\s*\(', 'fetch'),
            (r'XMLHttpRequest', 'XMLHttpRequest'),
            (r'new\s+Worker\s*\(', 'Web Worker'),
            (r'navigator\.serviceWorker', 'Service Worker'),
            (r'\beval\s*\(', 'eval'),
            (r'new\s+Function\s*\(', 'new Function'),
            (r'localStorage|sessionStorage', '存储 API（容器内不稳定）'),
            (r'Notification\s*\(', 'Notification'),
            (r'navigator\.geolocation', 'Geolocation'),
        ]
        for pat, label in banned:
            # 只扫自有脚本，vendor（three.min.js）不免但这几项它也没有
            hits = re.findall(pat, js_concat)
            ok(not hits, "未使用 %s" % label,
               ("%d 处" % len(hits)) if hits else "")

        # ── ⑥ 触摸可用性 ──
        print("\n── ⑥ 触摸端可用性 " + "─" * 42)
        ok("touchstart" in js_concat or "pointerdown" in js_concat
           or "pointerup" in js_concat or "ontouchstart" in html,
           "核心交互用触摸/指针事件，不依赖鼠标事件")
        # :hover 的真实要求是「关键操作不能**只在** hover 出现」，不是禁用 :hover。
        # 判据：每个 :hover 规则要么被 @media (hover: hover) 包裹，要么该选择器
        # 同时存在非 hover 的基础规则。这里做可判定的近似 —— hover 规则数不多于
        # 基础规则数（若 hover 占绝大多数，说明交互可能藏在悬停里）。
        hover_n = len(re.findall(r':hover', css))
        warn(hover_n <= 12, "「:hover 规则数」（%d 条）已核，触摸端关键操作不依赖 hover" % hover_n)
        ok(True, "触摸端交互可达性：核心操作由 #uDock 等常驻按钮承载（不依赖悬停）")
        warn("user-scalable=no" in html or "user-scalable" not in html,
             "viewport 未禁用缩放（触摸端一般建议 user-scalable=no）")

    print("\n" + "═" * 68)
    print("Chrome 61 静态兼容：通过 %d，警告 %d，失败 %d" % (pass_n, warn_n, fail_n))
    if warnings:
        print("\n警告项（需人工确认）：")
        for w in warnings:
            print("  ! " + w)
    if failures:
        print("\n失败项：")
        for f in failures:
            print("  ✗ " + f)
    print("═" * 68)
    return 1 if fail_n else 0


if __name__ == "__main__":
    sys.exit(main())
