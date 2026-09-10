# -*- coding: utf-8 -*-
"""
defcon 提交包同步与打包（不进提交包）

约定（见 README「打包」与 .workbuddy/memory/2026-09-10.md）：
  dist/ 是提交包的**内容根**，zip 打的是 dist 的「内容」而不是目录本身 ——
  index.html 必须在 zip 根目录，否则容器找不到入口。

dist/index.html 与源 index.html 的唯一差异：
  去掉 `data-page-node-id` 属性（MasterGo/Figma D2C 工具留下的产物标记，提交包不需要）。
  这一步以前靠手工维护，漏过；所以固定在这里做，不要再手改 dist。

其余文件（src/*.js、assets/*）逐字节复制。

用法：
  python tools/build_dist.py          # 同步 dist + 重打 defcon.zip + 列出产物体积
  python tools/build_dist.py --check  # 只校验 dist 是否与源一致，不写盘
"""
import hashlib
import pathlib
import re
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
ZIP = ROOT / "defcon.zip"
NODE_ID = re.compile(r' data-page-node-id="[^"]*"')

# 需要进包的东西。顺序固定，保证 zip 里的条目顺序可复现。
COPY_DIRS = ["src", "assets"]                  # 逐字节复制


def build():
    """返回 {相对路径: 期望字节}，不落盘。"""
    out = {}
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    # newline="\n"：dist 里的 index.html 一直是 LF，与源文件的 CRLF 不同；
    # 统一成 LF，避免每次同步都产生一堆无意义的行尾 diff。
    out["index.html"] = NODE_ID.sub("", html).encode("utf-8")
    for d in COPY_DIRS:
        for p in sorted((ROOT / d).rglob("*")):
            if p.is_file():
                out[p.relative_to(ROOT).as_posix()] = p.read_bytes()
    return out


def sync(files, check_only=False):
    changed, missing = [], []
    for rel, data in files.items():
        target = DIST / rel
        if not target.exists():
            missing.append(rel)
        elif hashlib.md5(target.read_bytes()).hexdigest() != hashlib.md5(data).hexdigest():
            changed.append(rel)
        if check_only:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)

    # dist 里有、源里已经没有的孤儿文件也要报出来（改名后最容易漏）
    orphans = []
    if DIST.exists():
        for p in sorted(DIST.rglob("*")):
            if p.is_file() and p.relative_to(DIST).as_posix() not in files:
                orphans.append(p.relative_to(DIST).as_posix())
    return changed, missing, orphans


def pack(files):
    """打包 dist 的内容。条目顺序固定，时间戳归零 —— 同样的源产出同样的 zip。"""
    with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for rel in sorted(files):
            info = zipfile.ZipInfo(rel, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, files[rel])
    return ZIP.stat().st_size


def main():
    check_only = "--check" in sys.argv
    files = build()
    changed, missing, orphans = sync(files, check_only)

    print("本次将同步 %d 个文件" % len(files))
    for rel in sorted(files):
        print("  %-24s %8.1f KB" % (rel, len(files[rel]) / 1024))
    if changed:
        print("\n内容有变化：%s" % ", ".join(changed))
    if missing:
        print("\ndist 缺少：%s" % ", ".join(missing))
    if orphans:
        print("\ndist 里的孤儿文件（源已无此文件，手工确认后删除）：%s" % ", ".join(orphans))

    if check_only:
        ok = not (changed or missing)
        print("\n%s" % ("dist 已与源一致 ✓" if ok else "dist 与源不一致 ✗（去掉 --check 重新生成）"))
        return 0 if ok else 1

    size = pack(files)
    print("\n已重打 %s：%d 项，%.1f KB（上限 10 MiB）" % (ZIP.name, len(files), size / 1024))
    return 0


if __name__ == "__main__":
    sys.exit(main())
