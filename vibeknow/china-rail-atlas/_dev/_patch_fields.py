# -*- coding: utf-8 -*-
"""一次性修补脚本：按条目 id 整行重写指定字段。用完即删。"""
import io
import re

MAIN = r"C:\Users\dingj\Documents\git\ai-dev-kit\vibeknow\china-rail-atlas\main.js"

PATCH = [
    ("station-01", "tag",
     '   tag:"中东铁路上的百年老站，俄式立面原址复刻",'),
    ("station-10", "zh",
     '   zh:"一个体量极长、几乎没有弧线的站房，屋顶是一条极长的水平线并挑出很深的屋檐，'
     '立面由密集的竖向金属构件与通高玻璃交替排列，整体构图极为规整，'
     '通体冷灰色调的金属与玻璃材料。",'),
]

ID_RE = re.compile(r'\{id:"([a-z]+-\d+)"')


def bounds_of(src):
    starts = [(m.group(1), m.start()) for m in ID_RE.finditer(src)]
    out = []
    for i, (iid, st) in enumerate(starts):
        end = starts[i + 1][1] if i + 1 < len(starts) else len(src)
        out.append((iid, st, end))
    return out


def main():
    src = io.open(MAIN, encoding="utf-8").read()
    for iid, field, newline in PATCH:
        done = False
        for it_id, st, en in bounds_of(src):
            if it_id != iid:
                continue
            lines = src[st:en].split("\n")
            hit = False
            for k, ln in enumerate(lines):
                if ln.lstrip().startswith(field + ":"):
                    lines[k] = newline
                    hit = True
                    break
            if not hit:
                raise SystemExit("条目 %s 里没找到字段 %s" % (iid, field))
            src = src[:st] + "\n".join(lines) + src[en:]
            done = True
            break
        if not done:
            raise SystemExit("没找到条目 %s" % iid)
        print("已重写 %s.%s" % (iid, field))
    io.open(MAIN, "w", encoding="utf-8", newline="").write(src)


if __name__ == "__main__":
    main()
