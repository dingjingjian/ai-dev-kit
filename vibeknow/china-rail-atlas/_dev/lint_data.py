# -*- coding: utf-8 -*-
"""文本体检：扫 main.js 的数据文案行，抓两类会直接印到页面上的脏字符。

两类问题肉眼几乎看不出来，却会随页面发到用户眼前，所以交给机器：
  1) 其它文字系统的字符（谚文 / 假名 / 西里尔 / 天城文 / 泰米尔 / 泰卢固……）
     ——按 Unicode 区块判断：只允许 ASCII + CJK 汉字 + 中文标点 + 全角与箭头符号。
  2) 中文文案里混进来的英文单词（面板上读作「半英半中」的错句）
     ——型号（含数字，如 25G / YW25G / HXD3D）与白名单内的专名放行。

用法：
    python _dev/lint_data.py          默认检查两类，有问题退出码 1
    python _dev/lint_data.py --words 额外打印文案行里的英文串，便于人工确认
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAIN = os.path.join(ROOT, "main.js")

# 会读到字段值的三个正则：字符串字段逐个取值，数组字段整段取值
# （kind 与 era 常写在同一行，所以按字段取值而不是按行取值）
STR_FIELD_RE = re.compile(r'\b(kind|era|tag|intro|zh)\s*:\s*"((?:[^"\\]|\\.)*)"')
ARR_FIELD_RE = re.compile(r'\b(specs|feats)\s*:\s*(\[.*\]),?\s*$')
HAN_RE = re.compile(r"[\u4e00-\u9fff]")
# 含数字，才能把 HXD3D 这样的型号整体命中，而不是被数字截断成 HXD
WORD_RE = re.compile(r"[A-Za-z][A-Za-z0-9'\u2019\-]{2,}")

# 中文文案里允许出现的拉丁文：人名与少数专名
ALLOW = {"Claude", "Kinder", "Transrapid", "EMU", "CRH"}
# 型号：必须含数字，如 25G / YW25G / HXD3D
MODEL_RE = re.compile(r"^[A-Z]*\d[A-Z0-9]*$", re.I)
# 轴式：Bo-Bo / Co-Co
AXLE_RE = re.compile(r"^[BC]o(-[BC]o)*$")
# 单位与速记写法，检查前先摘掉
UNIT_RE = re.compile(r"[A-Za-z]+\s*/\s*[A-Za-z]+|\bkm\b|\bkW\b|\bkV\b|\bkV\b", re.I)


def foreign_char(ch):
    """其它文字系统的字符，返回区块标记；属于允许集合则返回 None。"""
    o = ord(ch)
    if o < 128:
        return None
    ok_ranges = [
        (0x00A0, 0x00FF),   # Latin-1 补充（× 等常用符号）
        (0x2000, 0x206F),   # 通用标点
        (0x2190, 0x21FF),   # 箭头
        (0x2460, 0x24FF),   # 带圈字符
        (0x3000, 0x303F),   # 中文标点
        (0x3400, 0x4DBF),   # 扩展 A
        (0x4E00, 0x9FFF),   # 汉字
        (0xFF00, 0xFFEF),   # 全角
    ]
    for lo, hi in ok_ranges:
        if lo <= o <= hi:
            return None
    return "U+%04X" % o


def bad_words(text):
    out = []
    cleaned = UNIT_RE.sub(" ", text)
    for w in WORD_RE.findall(cleaned):
        if MODEL_RE.match(w) or AXLE_RE.match(w) or w in ALLOW:
            continue
        out.append(w)
    return out


def main():
    show_words = "--words" in sys.argv
    lines = io.open(MAIN, encoding="utf-8").read().split("\n")
    bad_char, words = [], []
    def field_values(line):
        """取出该行里所有会出现在页面上的字段值。"""
        vals = [(m.group(1), m.group(2)) for m in STR_FIELD_RE.finditer(line)]
        m = ARR_FIELD_RE.search(line)
        if m:
            vals.append((m.group(1), m.group(2)))
        return vals

    for i, ln in enumerate(lines, 1):
        vals = field_values(ln)
        if not vals:
            continue
        seen = set()
        for ch in ln:
            mark = foreign_char(ch)
            if mark and mark not in seen:
                seen.add(mark)
                bad_char.append((i, mark, ch, ln.strip()[:60]))
        for _, value in vals:
            if not HAN_RE.search(value):
                continue
            w = bad_words(value)
            if w:
                words.append((i, " ".join(w), value[:60]))

    print("=== 混入的其它文字系统：%d 处 ===" % len(bad_char))
    for i, mark, ch, prev in bad_char:
        print("  行 %d [%s %r] %s" % (i, mark, ch, prev))
    print("=== 中文文案里的孤立英文串：%d 处 ===" % len(words))
    for i, w, prev in words:
        print("  行 %d [%s] %s" % (i, w, prev))
    if show_words:
        print("（--words：以上全量输出）")
    if bad_char or words:
        sys.exit(1)
    print("OK：文案干净")


if __name__ == "__main__":
    main()
