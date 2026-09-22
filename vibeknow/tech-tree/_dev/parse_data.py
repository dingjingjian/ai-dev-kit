# -*- coding: utf-8 -*-
"""从 data.js 解析 ERAS / TECHS / IMG_STYLE。

data.js 是唯一真源，本模块只做解析、不含任何条目数据，供 check_data.py /
gen_image_prompts.py 共用，避免「数据维护一遍、校验与清单各写一遍」。

用法：
    from parse_data import load
    eras, techs, style = load()
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data.js"


def _block(src, start_marker, end_marker="\n];"):
    i = src.index(start_marker)
    j = src.index(end_marker, i)
    return src[i:j]


def _field(chunk, name):
    m = re.search(r'\b%s:"((?:[^"\\]|\\.)*)"' % name, chunk)
    return m.group(1) if m else ""


def _raw_array(chunk, name):
    """取出 name:[ ... ] 里的原文，用括号配平扫描，能正确处理嵌套数组。"""
    key = name + ":["
    if key not in chunk:
        return ""
    i = chunk.index(key) + len(key)
    depth, j = 1, i
    while j < len(chunk) and depth:
        c = chunk[j]
        if c == "[":
            depth += 1
        elif c == "]":
            depth -= 1
        j += 1
    return chunk[i:j - 1]


def _strings(chunk, name):
    return re.findall(r'"((?:[^"\\]|\\.)*)"', _raw_array(chunk, name))


def _pairs(chunk, name):
    return re.findall(r'\["((?:[^"\\]|\\.)*)","((?:[^"\\]|\\.)*)"\]', _raw_array(chunk, name))


def _unescape(s):
    return s.replace('\\"', '"').replace("\\\\", "\\")


def load():
    """返回 (eras, techs, style)。"""
    js = DATA.read_text(encoding="utf-8")

    style_m = re.search(r'var IMG_STYLE = "((?:[^"\\]|\\.)*)";', js)
    if not style_m:
        raise SystemExit("未在 data.js 中找到 IMG_STYLE")
    style = style_m.group(1)

    eras = []
    for chunk in re.split(r'\n(?=  \{key:")', _block(js, "var ERAS = [")):
        if 'key:"' not in chunk:
            continue
        eras.append({
            "key": _field(chunk, "key"),
            "zh": _field(chunk, "zh"),
            "en": _field(chunk, "en"),
            "span": _field(chunk, "span"),
            "note": _field(chunk, "note"),
            "accent": _field(chunk, "accent"),
            "icon": _field(chunk, "icon"),
        })

    techs = []
    for chunk in re.split(r'\n(?=  \{id:")', _block(js, "var TECHS = [")):
        if 'id:"' not in chunk:
            continue
        techs.append({
            "id": _field(chunk, "id"),
            "era": _field(chunk, "era"),
            "name": _field(chunk, "name"),
            "en": _field(chunk, "en"),
            "year": _field(chunk, "year"),
            "roots": _strings(chunk, "roots"),
            "tag": _field(chunk, "tag"),
            "intro": _field(chunk, "intro"),
            "specs": _pairs(chunk, "specs"),
            "feats": _strings(chunk, "feats"),
            "subject": _unescape(_field(chunk, "subject")),
        })
    return eras, techs, style


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    e, t, s = load()
    print(json.dumps({"eras": e, "techs": t, "style": s}, ensure_ascii=False, indent=2))
