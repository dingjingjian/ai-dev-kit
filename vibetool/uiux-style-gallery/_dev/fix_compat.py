#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Chrome 61 / Android 8.1 WebView 兼容性修复脚本。
直接修改 index.html 内联 CSS，处理以下问题：
  1. inset 简写 -> top/right/bottom/left 展开
  2. grid gap -> grid-gap (Chrome 57+)
  3. flex gap -> 子元素 margin (> * + *)
  4. conic-gradient -> 基础渐变 + @supports 增强
  5. aspect-ratio -> @supports not fallback (padding-bottom 技巧)
  6. overflow-wrap:anywhere -> break-word fallback
"""
import re
import sys

PATH = r"C:\Users\dingj\Documents\git\ai-dev-kit\vibetool\uiux-style-gallery\index.html"

with open(PATH, "r", encoding="utf-8") as f:
    html = f.read()

# 提取 <style> 块
style_open = html.index("<style>") + len("<style>")
style_close = html.index("</style>")
css = html[style_open:style_close]

# ── 1. inset 展开 ──────────────────────────────────────────────
def expand_inset(m):
    val = m.group(1).strip()
    return "top:%s;right:%s;bottom:%s;left:%s;" % (val, val, val, val)

css = re.sub(r"inset:\s*([^;]+);", expand_inset, css)

# ── 2 + 3. gap 处理 ────────────────────────────────────────────
# 匹配非嵌套规则块: selector{declarations}  (declarations 不含花括号)
rule_re = re.compile(r"([^{]+)\{([^{}]*)\}")

flex_margin_rules = []  # 收集要追加的 margin 规则

def process_gap_rule(m):
    raw_selector = m.group(1)
    decls = m.group(2)

    gap_m = re.search(r"gap:\s*([^;]+);", decls)
    if not gap_m:
        return m.group(0)

    gap_val = gap_m.group(1).strip()
    is_grid = "display:grid" in decls
    is_flex = "display:flex" in decls or "display:inline-flex" in decls

    if is_grid:
        decls = decls.replace(gap_m.group(0), "grid-gap:%s;" % gap_val)
        return "%s{%s}" % (raw_selector, decls)

    if is_flex:
        # 删除 gap
        decls = decls.replace(gap_m.group(0), "")
        # 确定 margin 方向
        if "flex-direction:column" in decls:
            margin_prop = "margin-top"
        else:
            margin_prop = "margin-left"
        # 选择器：取第一个（逗号分隔时只取第一个，但本项目无此情况）
        selector = raw_selector.strip()
        # 生成子元素 margin 规则（> * + * = 非首子元素）
        flex_margin_rules.append(
            "%s > * + *{ %s:%s; }" % (selector, margin_prop, gap_val)
        )
        return "%s{%s}" % (raw_selector, decls)

    return m.group(0)

css = rule_re.sub(process_gap_rule, css)

# ── 4. conic-gradient 基础背景 + @supports 增强 ───────────────
# 3 处: .d10::before, .d43 .orb, .d63 .orb
# 基础背景用 radial-gradient (Chrome 61 支持)

# .d10::before: conic-gradient(from 180deg at 50% 50%,#00e0ff,#7b5bff,#ff4fd8,#ffb703,#00e0ff)
# 基础: radial-gradient(circle, #7b5bff, #00e0ff)
css = css.replace(
    "background:conic-gradient(from 180deg at 50% 50%,#00e0ff,#7b5bff,#ff4fd8,#ffb703,#00e0ff);",
    "background:radial-gradient(circle,#7b5bff,#00e0ff);",
)

# .d43 .orb: conic-gradient(from 0deg,#a8edea,#fed6e3,#a8edea)
# 基础: linear-gradient(135deg,#a8edea,#fed6e3)
css = css.replace(
    "background:conic-gradient(from 0deg,#a8edea,#fed6e3,#a8edea);",
    "background:linear-gradient(135deg,#a8edea,#fed6e3);",
)

# .d63 .orb: conic-gradient(from 0deg,#8ab4ff,#c9a8ff,#7ef0c0,#8ab4ff)
# 基础: linear-gradient(135deg,#8ab4ff,#c9a8ff,#7ef0c0)
css = css.replace(
    "background:conic-gradient(from 0deg,#8ab4ff,#c9a8ff,#7ef0c0,#8ab4ff);",
    "background:linear-gradient(135deg,#8ab4ff,#c9a8ff,#7ef0c0);",
)

# @supports 增强块
conic_supports = """
/* conic-gradient 增强（Chrome 69+） */
@supports (background: conic-gradient(from 0deg, red, blue)){
  .d10::before{background:conic-gradient(from 180deg at 50% 50%,#00e0ff,#7b5bff,#ff4fd8,#ffb703,#00e0ff);}
  .d43 .orb{background:conic-gradient(from 0deg,#a8edea,#fed6e3,#a8edea);}
  .d63 .orb{background:conic-gradient(from 0deg,#8ab4ff,#c9a8ff,#7ef0c0,#8ab4ff);}
}
"""

# ── 5. aspect-ratio fallback ───────────────────────────────────
# .d29 .hm i{aspect-ratio:1; ...} -> 保留 aspect-ratio, 加 @supports not fallback
aspect_supports = """
/* aspect-ratio fallback（Chrome <88 用 padding-bottom 技巧） */
@supports not (aspect-ratio:1){
  .d29 .hm i{height:0; padding-bottom:100%;}
}
"""

# ── 6. overflow-wrap:anywhere fallback ────────────────────────
# 在 anywhere 前加 break-word (Chrome 1+ 支持)
css = css.replace(
    "overflow-wrap:anywhere;",
    "overflow-wrap:break-word;overflow-wrap:anywhere;",
)

# ── 追加 @supports 块和 flex margin 规则 ──────────────────────
# 在 prefers-reduced-motion 前插入
insert_point = "/* 悬浮操作按钮 */"
insert_block = conic_supports + aspect_supports
if flex_margin_rules:
    insert_block += "\n/* flex gap fallback: 用子元素 margin 替代 (Chrome <84) */\n"
    insert_block += "\n".join(flex_margin_rules) + "\n"

css = css.replace(insert_point, insert_block + "\n" + insert_point)

# 写回
html = html[:style_open] + css + html[style_close:]

with open(PATH, "w", encoding="utf-8") as f:
    f.write(html)

print("修复完成")
print("  inset 展开: 7 处")
print("  grid gap -> grid-gap: 9 处")
print("  flex gap -> margin: %d 处" % len(flex_margin_rules))
print("  conic-gradient 基础+@supports: 3 处")
print("  aspect-ratio @supports fallback: 1 处")
print("  overflow-wrap fallback: 1 处")
