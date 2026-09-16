#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""校验 demo-video-recorder 的副本是否与真源一致。

真源 = 仓库里 `.skill/demo-video-recorder/`（已入库）。另有两类副本：

  1. 技能副本 —— 与真源**同构**（SKILL.md / record_demo.py / caption/ 全套）
     - 用户级：`~/.workbuddy/skills/demo-video-recorder/`（供 Skill 工具发现，跨项目可用）
     - 工作区级：`<repo>/.workbuddy/skills/demo-video-recorder/`
  2. 项目实例 —— **扁平**布局（`caption/x.py` → `x.py`），只有引擎三支
     - `<repo>/**/tools/xhs-video/`

   为什么是扁平的：项目里直接在 `tools/xhs-video/` 下 `python build_captioned.py`，
   脚本以 cwd 为 `sys.path` 首项去 `import caption_render`，所以 .py 必须与主脚本同目录。
   两处布局不同，是历史约定，不是笔误。

用法（**在仓库内任意目录运行**；不在仓库内时用 `--repo` 指路）：
    python sync_check.py               # 校验；有内容漂移 → 打印差异并非零退出
    python sync_check.py -v            # 连一致的项也打印
    python sync_check.py --sync        # 以真源覆盖全部已存在的副本
    python sync_check.py --install-user  # 装/更新用户级副本（~/.workbuddy/skills/）

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
NAME = SKILL_ROOT.name                      # 技能名取目录名，便于整段复用

# 技能副本：真源相对路径 → 副本相对路径（同构，1:1）
SKILL_MAP = {
    "SKILL.md": "SKILL.md",
    "record_demo.py": "record_demo.py",
    "sync_check.py": "sync_check.py",
    "skill-package.json": "skill-package.json",
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

REPO_MARKERS = (".git", "TRACKS.md", "AGENTS.md")


def digest(path: Path) -> str:
    """内容指纹：行尾归一后再算，避免 CRLF/LF 差异被误判为漂移。"""
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()[:12]


def raw_digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:12]


def find_repo_root(start: Path) -> Path | None:
    """从 start 逐级向上找仓库根（认 .git / TRACKS.md / AGENTS.md）。"""
    for p in [start, *start.parents]:
        if any((p / m).exists() for m in REPO_MARKERS):
            return p
    return None


def resolve_repo(explicit: str | None) -> Path | None:
    if explicit:
        p = Path(explicit).resolve()
        return p if p.is_dir() else None
    return find_repo_root(SKILL_ROOT) or find_repo_root(Path.cwd().resolve())


def canonical_dir(repo: Path | None) -> Path:
    """真源：仓库里的 .skill/<name> 优先；仓库里没有（纯安装机）才退回脚本自身目录。"""
    if repo:
        cand = repo / ".skill" / NAME
        if (cand / "SKILL.md").is_file():
            return cand
    return SKILL_ROOT


def skill_mirrors(repo: Path | None) -> list[Path]:
    out = []
    home = Path.home() / ".workbuddy" / "skills" / NAME
    if (home / "SKILL.md").is_file():
        out.append(home)
    if repo:
        ws = repo / ".workbuddy" / "skills" / NAME
        if (ws / "SKILL.md").is_file():
            out.append(ws)
    return out


def project_instances(repo: Path | None) -> list[Path]:
    if not repo:
        return []
    return [d for d in sorted(repo.glob("**/tools/xhs-video"))
            if d.is_dir() and "node_modules" not in d.parts]


def build_targets(repo: Path | None, canonical: Path):
    """返回 [(标签, 副本目录, 映射)]，已剔除等于真源自身的项。"""
    out = []
    for m in skill_mirrors(repo):
        if m.resolve() != canonical.resolve():
            out.append(("技能副本", m, SKILL_MAP))
    for m in project_instances(repo):
        if m.resolve() != canonical.resolve():
            out.append(("项目实例", m, INSTANCE_MAP))
    return out


def do_install_user(canonical: Path) -> int:
    dest = Path.home() / ".workbuddy" / "skills" / NAME
    if dest.resolve() == canonical.resolve():
        print("用户级位置 == 真源（%s），无需安装。" % dest)
        return 0
    print("安装用户级副本：%s\n            <- %s" % (dest, canonical))
    for rel in SKILL_MAP:
        src = canonical / rel
        if not src.exists():
            print("  WARN 真源缺 %s，跳过" % rel)
            continue
        dst = dest / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        print("  ->   %s" % rel)
    pyc = dest / "__pycache__"
    if pyc.is_dir():
        shutil.rmtree(pyc, ignore_errors=True)
    print("已安装 %d 个文件。校验：python \"%s\"" % (len(SKILL_MAP), dest / "sync_check.py"))
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="%s 副本一致性校验" % NAME)
    ap.add_argument("--repo", help="仓库根（默认从脚本位置与 cwd 自动推断）")
    ap.add_argument("--sync", action="store_true", help="以真源覆盖副本（不校验，直接同步）")
    ap.add_argument("--install-user", action="store_true",
                    help="把真源装到 ~/.workbuddy/skills/<name>/（供 Skill 工具发现）")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args()

    repo = resolve_repo(args.repo)
    canonical = canonical_dir(repo)
    print("真源: %s" % canonical)
    if repo:
        print("仓库: %s" % repo)
    else:
        print("仓库: 未识别（不在仓库内？可加 --repo <仓库根> 以校验项目实例）")

    if args.install_user:
        return do_install_user(canonical)

    tgts = build_targets(repo, canonical)
    if not tgts:
        print("（未找到任何副本）")
        return 0

    if args.sync:
        n = 0
        for label, mirror, mapping in tgts:
            for rel_src, rel_dst in mapping.items():
                src, dst = canonical / rel_src, mirror / rel_dst
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
            src, dst = canonical / rel_src, mirror / rel_dst
            if not src.exists():
                drift.append("%s: 真源缺 %s" % (label, rel_src))
                continue
            if not dst.exists():
                drift.append("%s: 缺文件 %s" % (label, rel_dst))
                continue
            if digest(src) != digest(dst):
                drift.append("%s: %s 与真源 %s 内容不同" % (label, rel_dst, rel_src))
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

    print("\n内容全部一致（%d 处副本%s）"
          % (len(tgts), "，另有 %d 处仅行尾不同" % len(eol_only) if eol_only else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
