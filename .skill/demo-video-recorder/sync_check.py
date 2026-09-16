#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""校验 demo-video-recorder 的副本是否与真源一致。

真源 = 本技能目录（`.skill/demo-video-recorder/`，已入库）。另有两类副本：

  1. 技能副本 —— 与真源**同构**（SKILL.md / record_demo.py / caption/ 全套）
     - 用户级：`~/.workbuddy/skills/demo-video-recorder/`（供 Skill 自动加载）
     - 工作区级：`<repo>/.workbuddy/skills/demo-video-recorder/`
  2. 项目实例 —— **扁平**布局（`caption/x.py` → `x.py`），只有引擎三支
     - `<repo>/**/tools/xhs-video/`

   为什么是扁平的：项目里直接在 `tools/xhs-video/` 下 `python build_captioned.py`，
   脚本以 cwd 为 `sys.path` 首项去 `import caption_render`，所以 .py 必须与主脚本同目录。
   两处布局不同，是历史约定，不是笔误。

用法：
    python sync_check.py           # 只校验；有漂移 → 打印差异并非零退出
    python sync_check.py --sync    # 以本技能目录为准，覆盖全部已存在的副本
    python sync_check.py -v        # 连一致的项也打印

为什么需要它：引擎曾出现「技能模板与项目源码静默分叉」——改了项目里的
caption_render.py 却忘了同步技能模板，下次复用技能时拿到的还是旧引擎。

行尾说明：本仓库 core.autocrlf=true，且 Python 文本模式写文件会把 \n 变成 \r\n，
所以同一份脚本在不同副本里行尾可能不同。指纹先做行尾归一，**行尾差异不算漂移**，
只作为提示打印（判据是「内容是否一致」，不是「字节是否一致」）。
"""
from __future__ import annotations

import argparse
import hashlib
import shutil
import sys
from pathlib import Path

try:  # Windows 控制台默认可能是 GBK，中文输出会炸
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

SKILL_ROOT = Path(__file__).resolve().parent
REPO_ROOT = SKILL_ROOT.parents[1]          # .skill/<name>/ → 仓库根

# 技能副本：真源相对路径 → 副本相对路径（同构，1:1）
SKILL_MAP = {
    "SKILL.md": "SKILL.md",
    "record_demo.py": "record_demo.py",
    "caption/caption_render.py": "caption/caption_render.py",
    "caption/build_captioned.py": "caption/build_captioned.py",
    "caption/make_preview.py": "caption/make_preview.py",
    "caption/caption_config.example.json": "caption/caption_config.example.json",
}

# 项目实例：只同步引擎三支，且要拍平（caption/x.py → x.py）
INSTANCE_MAP = {
    "caption/caption_render.py": "caption_render.py",
    "caption/build_captioned.py": "build_captioned.py",
    "caption/make_preview.py": "make_preview.py",
}


def digest(path: Path) -> str:
    """内容指纹：行尾归一后再算，避免 CRLF/LF 差异被误判为漂移。"""
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()[:12]


def raw_digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:12]


def skill_mirrors() -> list[Path]:
    out = []
    home = Path.home() / ".workbuddy" / "skills" / "demo-video-recorder"
    if home.is_dir():
        out.append(home)
    ws = REPO_ROOT / ".workbuddy" / "skills" / "demo-video-recorder"
    if ws.is_dir():
        out.append(ws)
    return out


def project_instances() -> list[Path]:
    return [d for d in sorted(REPO_ROOT.glob("**/tools/xhs-video"))
            if d.is_dir() and "node_modules" not in d.parts]


def targets() -> list[tuple[str, Path, dict[str, str]]]:
    out: list[tuple[str, Path, dict[str, str]]] = []
    for m in skill_mirrors():
        out.append(("技能副本", m, SKILL_MAP))
    for m in project_instances():
        out.append(("项目实例", m, INSTANCE_MAP))
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="demo-video-recorder 副本一致性校验")
    ap.add_argument("--sync", action="store_true",
                    help="以真源覆盖副本（不校验，直接同步）")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args()

    print("真源: %s" % SKILL_ROOT)
    tgts = targets()
    if not tgts:
        print("（未找到任何副本，无需同步）")
        return 0

    if args.sync:
        n = 0
        for label, mirror, mapping in tgts:
            for rel_src, rel_dst in mapping.items():
                src, dst = SKILL_ROOT / rel_src, mirror / rel_dst
                if not src.exists():
                    print("  WARN 真源缺 %s，跳过" % rel_src)
                    continue
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dst)
                n += 1
                print("  ->   %s: %s" % (label, rel_dst))
        print("已同步 %d 个文件（%d 处副本）" % (n, len(tgts)))
        return 0

    drift: list[str] = []
    eol_only: list[str] = []
    for label, mirror, mapping in tgts:
        print("检查 %s: %s" % (label, mirror))
        for rel_src, rel_dst in mapping.items():
            src, dst = SKILL_ROOT / rel_src, mirror / rel_dst
            if not src.exists():
                drift.append("%s: 真源缺 %s" % (label, rel_src))
                continue
            if not dst.exists():
                drift.append("%s: 缺文件 %s" % (label, rel_dst))
                continue
            a, b = digest(src), digest(dst)
            if a != b:
                drift.append("%s: %s 与真源 %s 内容不同（%s / %s）"
                             % (label, rel_dst, rel_src, a, b))
            elif raw_digest(src) != raw_digest(dst):
                eol_only.append("%s: %s 仅行尾不同（内容一致）" % (label, rel_dst))
            elif args.verbose:
                print("  ok   %s: %s" % (label, rel_dst))

    if eol_only:
        print("\n仅行尾不同（内容一致，不算漂移）：")
        for e in eol_only:
            print("  ~  " + e)
        print("  提示：本仓库 core.autocrlf=true，且 Python 文本模式写文件会把 \\n 变 \\r\\n；"
              "想统一行尾就用 newline=\"\" 重写该文件。")

    if drift:
        print("\n发现 %d 处漂移：" % len(drift))
        for d in drift:
            print("  !  " + d)
        print("\n跑 `python sync_check.py --sync` 以真源覆盖；"
              "若副本才是你要的那版，先把它拷回真源再同步。")
        return 1

    if eol_only:
        print("\n内容全部一致（%d 处副本，另有 %d 处仅行尾不同）" % (len(tgts), len(eol_only)))
    else:
        print("\n全部一致（%d 处副本）" % len(tgts))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
