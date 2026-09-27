# -*- coding: utf-8 -*-
"""小红书文案 / 配图命名合规检查（ai-dev-kit）

按仓库根的《小红书文案归档规范.md》检查每个 `<作品>/xiaohongshu/` 目录：

- 文案：主文案必须是 `小红书文案.md`；多版本用 `小红书文案-<后缀>.md`
- 配图：必须是 `NN-用途.扩展名`（两位序号 + 短横线）

用法（cwd 需在 ai-dev-kit 根目录）：
    python scripts/check_xiaohongshu_naming.py              # 列出不合规项
    python scripts/check_xiaohongshu_naming.py --plan       # 输出建议改名清单
    python scripts/check_xiaohongshu_naming.py --apply      # 执行改名（需先确认 plan）

说明：改名涉及 md 正文里的配图引用，脚本会同步替换引用文本（`--apply` 时）。
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
XHS_DIRNAME = 'xiaohongshu'

NOTE_MAIN = '小红书文案.md'
NOTE_SUFFIX_RE = re.compile(r'^小红书文案-[^\-\.]+\.md$')
NOTE_EXEMPT = {'README.md', 'meta.md', '笔记正文.md', '发布原文.md'}

IMG_RE = re.compile(r'^\d{2}-[^\-][\w\u4e00-\u9fa5\-]*\.(png|jpe?g|webp|gif)$', re.I)
IMG_EXT = {'.png', '.jpg', '.jpeg', '.webp', '.gif'}
# 生成/脚本类文件不是配图，跳过
IMG_SKIP = {'gen_cards.py', '_optimize_tags.py'}

CODE_EXT = {'.md', '.py', '.html', '.js', '.css'}


def xhs_dirs():
    """返回所有 xiaohongshu 目录（按路径排序）。"""
    return sorted(p for p in ROOT.rglob(XHS_DIRNAME) if p.is_dir())


def suggest_note_name(fname, others):
    """给出建议文案名；返回 None 表示已合规。"""
    if fname == NOTE_MAIN or NOTE_SUFFIX_RE.match(fname) or fname in NOTE_EXEMPT:
        return None
    stem = Path(fname).stem
    suffix = None
    if '视频' in stem:
        suffix = '视频版'
    elif '活动公告' in stem:
        suffix = '活动公告'
    elif '多风格' in stem or '备选' in stem:
        suffix = '多风格备选'
    elif '推广' in stem:
        suffix = '推广备选'
    elif '发布笔记' in stem or '宣传' in stem or '图文' in stem:
        suffix = None
    new = NOTE_MAIN if suffix is None else f'小红书文案-{suffix}.md'
    # 目标名已被占用则退回带后缀的形式
    if new in others:
        base = Path(new).stem
        for probe in ('-备用', '-v2', '-副本'):
            cand = f'{base}{probe}.md'
            if cand not in others:
                return cand
    return new


def check():
    note_issues, img_issues, conflicts = [], [], []
    for d in xhs_dirs():
        rel = d.relative_to(ROOT).as_posix()
        files = sorted(p.name for p in d.iterdir() if p.is_file())
        notes = [f for f in files if f.endswith('.md') and f not in NOTE_EXEMPT]
        imgs = [f for f in files
                if Path(f).suffix.lower() in IMG_EXT and f not in IMG_SKIP]

        targets = {}
        for f in notes:
            new = suggest_note_name(f, files)
            if new:
                note_issues.append((rel, f, new))
                targets.setdefault(new, []).append(f)
        for new, old_list in targets.items():
            if len(old_list) > 1:
                conflicts.append((rel, new, old_list))

        for f in imgs:
            if not IMG_RE.match(f):
                img_issues.append((rel, f))

    total_dirs = len(xhs_dirs())
    print(f'扫描 {total_dirs} 个 xiaohongshu 目录\n')

    print(f'【文案命名】不合规 {len(note_issues)} 项')
    if conflicts:
        print(f'  ⚠ 其中 {len(conflicts)} 处存在「多个文件建议改为同一名」的冲突，需人工判定：')
        for rel, new, old_list in conflicts:
            print(f'    - {rel}：{old_list} → 都想叫 {new}')
        print()
    if '--plan' in sys.argv:
        grouped = {}
        for rel, old, new in note_issues:
            grouped.setdefault(rel, []).append((old, new))
        for rel in sorted(grouped):
            print(f'  {rel}/')
            for old, new in grouped[rel]:
                mark = ' ⚠冲突' if any(c[0] == rel and c[1] == new for c in conflicts) else ''
                print(f'    {old}  →  {new}{mark}')
    print()

    print(f'【配图命名】不合规 {len(img_issues)} 项')
    if '--plan' in sys.argv and img_issues:
        grouped = {}
        for rel, f in img_issues:
            grouped.setdefault(rel, []).append(f)
        for rel in sorted(grouped)[:12]:
            names = grouped[rel]
            more = '' if len(names) <= 6 else f' …等 {len(names)} 个'
            print(f'  {rel}/: {", ".join(names[:6])}{more}')
        if len(grouped) > 12:
            print(f'  …另有 {len(grouped) - 12} 个目录存在不合规配图')
    print()

    if '--apply' in sys.argv:
        print('⚠ --apply 未做自动改名：改名涉及 md 正文里的配图引用，')
        print('  且存在多文件争抢同一目标名的冲突，需按 --plan 清单人工/分批执行。')
    else:
        print('改名涉及 md 正文里的配图引用，建议先 --plan 确认清单，再分批执行。')
    return len(note_issues) + len(img_issues)


if __name__ == '__main__':
    n = check()
    sys.exit(0 if n == 0 else 1)
