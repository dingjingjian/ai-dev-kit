# -*- coding: utf-8 -*-
"""结构审计（ai-dev-kit）

按仓库根《CONVENTIONS.md》第九节的 R1–R10 规则检查全部项目结构，
支持 --check（列不合规）与 --plan（出改造清单）。

用法（cwd 需在 ai-dev-kit 根目录，或任意子目录——脚本自行定位仓库根）：
    python tools/audit_structure.py            # 列出全部不合规项
    python tools/audit_structure.py --plan     # 输出建议的改造清单（含具体文件）
    python tools/audit_structure.py --json     # 机器可读输出
    python tools/audit_structure.py --only R3,R4   # 只跑指定规则

退出码：0 = 全部通过；1 = 存在不合规项。
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

TRACKS = ['vibetool', 'vibegame', 'vibeart', 'vibeknow']
NON_TRACKS = ['vibecoding-gallery']          # 非赛道但仍是工程对象
REQUIRED_README_HEAD = '分类'
SKIP_DIRS = {'node_modules', '.git', '__pycache__', 'dist'}

# 项目根不允许出现的构建脚本（应移入 tools/ 或 tests/）
ROOT_SCRIPT_STEMS = ('build', 'pack', 'verify', 'smoke', 'check', 'zip', 'runtime-test')
ROOT_SCRIPT_EXT = ('.mjs', '.js', '.py', '.sh', '.ps1')

# 过程痕迹：目录名 / 文件名模式
TRACE_DIRS = {'_shots', '.shots', '.playwright-cli', '_dev'}
# 只匹配「独立词首」的 shot-（`shot-1-intro.png`），不匹配 `screenshot-`（s**hot-** 误伤）
TRACE_FILE_RE = ('_preview_', '_shot', '_dbg', '_probe', '_render.txt', '_log.txt')
TRACE_FILE_RE_SHOT = re.compile(r'(^|[-_/])shot-\d')


def git(*args):
    """在仓库根执行 git，返回 stdout（失败返回空串）。"""
    try:
        r = subprocess.run(['git'] + list(args), cwd=str(ROOT),
                           capture_output=True, text=True, encoding='utf-8', errors='replace')
        return r.stdout if r.returncode == 0 else ''
    except Exception:
        return ''


def projects():
    """返回 [(相对路径, 绝对路径)]。

    四分类下的每个一级子目录是一个项目；非赛道目录自身是一个项目
    （不再向下钻，避免把 vibecoding-gallery/_dev 之类当成独立项目）。
    """
    out = []
    for track in TRACKS:
        tp = ROOT / track
        if not tp.is_dir():
            continue
        for p in sorted(tp.iterdir()):
            if p.is_dir() and p.name not in SKIP_DIRS:
                out.append((p.relative_to(ROOT).as_posix(), p))
    for nt in NON_TRACKS:
        np = ROOT / nt
        if np.is_dir():
            out.append((nt, np))
    return out


def walk(proj):
    """遍历项目内文件（跳过依赖与缓存）。"""
    for dp, dns, fns in __import__('os').walk(proj):
        dns[:] = [d for d in dns if d not in SKIP_DIRS]
        yield Path(dp), dns, fns


def tracked_set():
    """被 git 跟踪的文件集合（相对路径，正斜杠）。"""
    s = git('ls-files')
    return set(l for l in s.splitlines() if l.strip())


class Report:
    def __init__(self):
        self.issues = []      # (rule, project, path, message, hint)

    def add(self, rule, project, path, message, hint=''):
        self.issues.append({'rule': rule, 'project': project,
                            'path': path, 'message': message, 'hint': hint})

    def count(self, rule):
        return sum(1 for i in self.issues if i['rule'] == rule)


# ---------------------------------------------------------------------------
# 规则
# ---------------------------------------------------------------------------
def r1_naming(rep, proj_rel, proj, tracked):
    """R1 命名合规。"""
    import re
    name = proj.name
    if not re.fullmatch(r'[a-z0-9][a-z0-9._-]*', name):
        rep.add('R1', proj_rel, name, '项目目录名不合规（应小写连字符）',
                'git mv 到小写连字符名，同步 TRACKS.md 与 README')


def r2_required(rep, proj_rel, proj, tracked):
    """R2 必需件齐备。"""
    if not (proj / 'README.md').is_file():
        rep.add('R2', proj_rel, 'README.md', '缺少 README.md', '补 README，首行写分类行')
    else:
        txt = (proj / 'README.md').read_text(encoding='utf-8', errors='replace')
        head = '\n'.join(txt.splitlines()[:8])
        if REQUIRED_README_HEAD not in head:
            rep.add('R2', proj_rel, 'README.md', '首行缺分类行',
                    '按 CONVENTIONS.md 第二节补 `> **分类**：...`')
    has_html = (proj / 'index.html').is_file()
    # 后台/脚本类项目（无 index.html）不强制入口与构建配置
    if has_html:
        if not (proj / 'build.config.json').is_file():
            rep.add('R2', proj_rel, 'build.config.json', '缺少构建配置',
                    '按 CONVENTIONS.md 第四节补 build.config.json')


def r3_no_copies(rep, proj_rel, proj, tracked):
    """R3 无 .skill 副本、无入库 zip。"""
    if (proj / '.skill').is_dir():
        rep.add('R3', proj_rel, '.skill/', '项目内存在 .skill 副本',
                '技能真源只在仓库级 .skill/；副本 git rm 出库')
    for p in proj.glob('*.zip'):
        rel = p.relative_to(ROOT).as_posix()
        if rel in tracked:
            rep.add('R3', proj_rel, p.name, 'zip 被 git 跟踪（与源码必然分叉）',
                    'git rm --cached，保留磁盘文件')


def r4_no_dev(rep, proj_rel, proj, tracked):
    """R4 无 _dev/；无项目根散落构建脚本。

    例外：`_dev/xiaohongshu/` 是 AGENTS.md 认可的构建期小红书素材目录
    （见 perler-city），仅此子目录允许保留。
    """
    dev = proj / '_dev'
    if dev.is_dir():
        leftover = [c.name for c in dev.iterdir() if c.name != 'xiaohongshu']
        if leftover:
            rep.add('R4', proj_rel, '_dev/', '存在 _dev/（应拆入 tools/ 与 tests/）',
                    '生成/处理脚本 → tools/；验证脚本 → tests/；仅 _dev/xiaohongshu/ 可留')
    for p in proj.iterdir():
        if not p.is_file():
            continue
        if p.suffix.lower() not in ROOT_SCRIPT_EXT:
            continue
        stem = p.stem.lower()
        if any(k in stem for k in ROOT_SCRIPT_STEMS):
            # 项目根只允许 build.config.json 这类配置，脚本一律进 tools/ tests/
            rep.add('R4', proj_rel, p.name, '构建/校验脚本散落在项目根',
                    '移入 tools/ 或 tests/，改用统一入口 node ../tools/build.mjs')


def r5_no_shots(rep, proj_rel, proj, tracked):
    """R5 无被跟踪的截图/播放痕迹目录。

    只查**过程痕迹**目录（`_shots/` `.shots/` `.playwright-cli/` `docs/shots/`）。
    **交付物料**性质的截图目录明确放行 —— 它们本就该入库：
      · `reference/<博主-工具>/screenshots/` —— reference/README.md 规定落位（封面 + 交互图）
      · `xiaohongshu/screenshots/` —— 小红书发布配图（.gitignore 注释「交付物料，须入库」）
      · `screenshots/`（无下划线，项目根）—— README 物料表引用的成品截图（如 ai-calculator）
    """
    for d in ('_shots', '.shots', '.playwright-cli', 'docs/shots'):
        dpath = proj / d
        if not dpath.is_dir():
            continue
        hits = [t for t in tracked if t.startswith(proj_rel + '/' + d + '/')]
        if hits:
            rep.add('R5', proj_rel, d + '/', '被 git 跟踪的截图痕迹 %d 个' % len(hits),
                    'git rm -r --cached 出库，并在根 .gitignore 补规则')


def r6_no_trace(rep, proj_rel, proj, tracked):
    """R6 无被跟踪的过程痕迹（预览图 / 日志 / _*.txt）。"""
    hits = []
    for t in tracked:
        if not t.startswith(proj_rel + '/'):
            continue
        name = t.rsplit('/', 1)[-1]
        if name.endswith('.log') or (name.startswith('_') and name.endswith('.txt')):
            hits.append(t)
            continue
        if not name.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
            continue
        # 显式痕迹词，或「词首 shot-<数字>」命名（排除 screenshot-* 的误伤）
        if any(k in name for k in TRACE_FILE_RE) or TRACE_FILE_RE_SHOT.search(name):
            hits.append(t)
    if len(hits) > 0:
        rep.add('R6', proj_rel, '(过程痕迹)', '被 git 跟踪的过程痕迹 %d 个' % len(hits),
                '示例：' + ', '.join(h.rsplit('/', 1)[-1] for h in hits[:4]))


def r7_config_valid(rep, proj_rel, proj, tracked):
    """R7 build.config.json 的路径真实存在。"""
    cfgp = proj / 'build.config.json'
    if not cfgp.is_file():
        return
    try:
        cfg = json.loads(cfgp.read_text(encoding='utf-8'))
    except Exception as e:
        rep.add('R7', proj_rel, 'build.config.json', '解析失败：%s' % e, '修正 JSON 语法')
        return
    entry = cfg.get('entry', 'index.html')
    if not (proj / entry).is_file():
        rep.add('R7', proj_rel, 'build.config.json', 'entry 指向的文件不存在：%s' % entry,
                '修正 entry 字段')
    for inc in cfg.get('include', []):
        if not (proj / inc).exists():
            rep.add('R7', proj_rel, 'build.config.json', 'include 指向的路径不存在：%s' % inc,
                    '修正 include 字段或补上该路径')
    smoke = cfg.get('smoke')
    if smoke and not (proj / smoke).is_file():
        rep.add('R7', proj_rel, 'build.config.json', 'smoke 指向的脚本不存在：%s' % smoke,
                '修正 smoke 字段')


def r8_verify(rep, proj_rel, proj, tracked):
    """R8 有 tests/ 或在 README 声明无自动验证。"""
    if (proj / 'tests').is_dir():
        return
    readme = proj / 'README.md'
    txt = readme.read_text(encoding='utf-8', errors='replace') if readme.is_file() else ''
    if '无自动验证' in txt or '无自动化验证' in txt:
        return
    rep.add('R8', proj_rel, 'tests/', '既无 tests/ 也未声明「无自动验证」',
            '补 tests/ 冒烟脚本，或在 README 写明无自动验证及原因')


def r9_ignore(rep, proj_rel, proj, tracked):
    """R9 dist/ 与 zip 确实被 .gitignore 覆盖。"""
    for d in ('dist',):
        dp = proj / d
        if not dp.is_dir():
            continue
        hits = [t for t in tracked if t.startswith(proj_rel + '/' + d + '/')]
        if hits:
            rep.add('R9', proj_rel, d + '/', 'dist 内容被 git 跟踪 %d 个' % len(hits),
                    'git rm -r --cached 出库')


def r10_readme_length(rep, proj_rel, proj, tracked):
    """R10 README 未超长。"""
    readme = proj / 'README.md'
    if not readme.is_file():
        return
    n = len(readme.read_text(encoding='utf-8', errors='replace').splitlines())
    if n > 200:
        rep.add('R10', proj_rel, 'README.md', 'README 达 %d 行（上限 200）' % n,
                '把玩法/数值/设计细节拆到 DESIGN.md')


# R11：文档引用的脚本路径须真实存在（防止改造后文档「路径漂移」）
# 已知的「叙述性/运行时生成」引用不入警，白名单见 DOC_REF_WHITELIST。
DOC_REF_WHITELIST = (
    # 历史叙述：明确描述「曾如此 / 已删除」的句子
    '已删除', '原', '原来', '早先', '历史', '曾',
)
DOC_REF_BANNED_STEMS = ('build_zip.py', 'pack.mjs', '_dev/')


def r11_doc_script_refs(rep, proj_rel, proj, tracked):
    """R11 项目文档不引用已废弃脚本（_dev/ / build_zip.py / pack.mjs）。

    只扫项目内 .md（README / DESIGN / 设定文档 / docs/），检查两类问题：
      1) 出现已废弃路径字面量（_dev/、build_zip.py、pack.mjs）；
      2) `tools/xxx` / `tests/xxx` 形式的引用在项目内不存在（排除指向仓库根中央入口
         tools/build.mjs 的情形）。
    """
    for md in proj.rglob('*.md'):
        rel = md.relative_to(ROOT).as_posix()
        if any(part in SKIP_DIRS for part in md.parts):
            continue
        try:
            text = md.read_text(encoding='utf-8', errors='replace')
        except Exception:
            continue
        # (1) 废弃字面量
        for stem in DOC_REF_BANNED_STEMS:
            if stem in text:
                rep.add('R11', proj_rel, rel, '文档引用了已废弃的 `%s`' % stem,
                        '改写为 tools/ + tests/ 的新路径，打包用 `node tools/build.mjs --pack`')
                break
        # (2) tools//tests/ 路径存在性（逐行判定，跳过「已删除 / 历史」等叙述行）
        lines = text.splitlines()
        for lineno, line in enumerate(lines, 1):
            if any(k in line for k in ('已删除', '已下线', '已废弃', '原 `', '早先', '历史遗留', '曾')):
                continue
            for m in re.finditer(r'`((?:tools|tests)/[A-Za-z0-9_.\-/]+)`', line):
                ref = m.group(1).rstrip('/')
                if ref.endswith(('.py', '.js', '.mjs', '.sh', '.ps1')):
                    if not (proj / ref).exists() and not (proj / ref).is_dir():
                        # tools/build.mjs 特指仓库根中央入口，允许
                        if ref == 'tools/build.mjs':
                            continue
                        rep.add('R11', proj_rel, '%s:%d' % (rel, lineno),
                                '文档引用的 `%s` 在项目内不存在' % ref,
                                '修正路径或改为实际存在的脚本')


def r12_pack_cmd_depth(rep, proj_rel, proj, tracked):
    """R12 统一入口的调用路径必须与「项目到仓库根」的层数严格匹配。

    统一入口在**仓库根** `tools/build.mjs`。项目位于 `<分类>/<项目>/`（层数=2，
    如 `vibegame/defcon/`），故正确相对路径是 `../../tools/build.mjs`；
    仓库根一层的项目（`vibecoding-gallery/`，层数=1）用 `../tools/build.mjs`。
    常见漂移：写成 `node tools/build.mjs`（指项目内不存在处），或
    `node ../tools/build.mjs`（少一级，指到 `<分类>/tools/`，同样不存在）。
    """
    depth = len(proj_rel.split('/'))          # 项目相对仓库根的层数（vibegame/x → 2）
    want = '../' * depth                       # 从项目根回到仓库根所需层数
    expect = 'node ' + want + 'tools/build.mjs'
    for md in proj.rglob('*.md'):
        rel = md.relative_to(ROOT).as_posix()
        try:
            text = md.read_text(encoding='utf-8', errors='replace')
        except Exception:
            continue
        rel_parts = md.relative_to(proj).parts
        in_subdir = len(rel_parts) > 1
        for lineno, line in enumerate(text.splitlines(), 1):
            if any(k in line for k in ('已删除', '已下线', '已废弃', '早先', '历史遗留')):
                continue
            for m in re.finditer(r'node\s+((?:\.\./)*)tools/build\.mjs', line):
                if m.group(1) != want:
                    rep.add('R12', proj_rel, '%s:%d' % (rel, lineno),
                            '统一入口相对路径 `../` 层数不符（应为 `%s`）' % expect,
                            '项目位于第 %d 层，回仓库根须 %s' % (depth, want))
            # 子目录文档（docs/ assets/ tools/ tests/ 等）还须显式标注执行目录
            if in_subdir and ('node ' + want + 'tools/build.mjs') in line \
                    and '项目根' not in line:
                rep.add('R12', proj_rel, '%s:%d' % (rel, lineno),
                        '子目录文档未标明「在项目根」执行',
                        '补「（在项目根）」提示，避免读者在子目录误跑')


RULES = {
    'R1': r1_naming, 'R2': r2_required, 'R3': r3_no_copies, 'R4': r4_no_dev,
    'R5': r5_no_shots, 'R6': r6_no_trace, 'R7': r7_config_valid, 'R8': r8_verify,
    'R9': r9_ignore, 'R10': r10_readme_length, 'R11': r11_doc_script_refs,
    'R12': r12_pack_cmd_depth,
}

TITLES = {
    'R1': '项目命名', 'R2': '必需件齐备', 'R3': '无副本/无入库 zip', 'R4': '无 _dev 与根散落脚本',
    'R5': '无截图痕迹', 'R6': '无过程痕迹', 'R7': '构建配置有效', 'R8': '有验证或已声明',
    'R9': '产物被忽略', 'R10': 'README 未超长', 'R11': '文档引用真实存在',
    'R12': '构建命令路径与层级匹配',
}


def main():
    only = None
    args = sys.argv[1:]
    for i, a in enumerate(args):
        if a == '--only' and i + 1 < len(args):
            only = set(args[i + 1].split(','))
    as_json = '--json' in args
    plan = '--plan' in args

    tracked = tracked_set()
    projs = projects()
    rep = Report()

    for proj_rel, proj in projs:
        for rid, fn in RULES.items():
            if only and rid not in only:
                continue
            fn(rep, proj_rel, proj, tracked)

    if as_json:
        print(json.dumps({'projects': len(projs), 'issues': rep.issues},
                         ensure_ascii=False, indent=2))
        return 0 if not rep.issues else 1

    print('结构审计 · 扫描 %d 个项目' % len(projs))

    if not rep.issues:
        print('\n全部通过，无不合规项。')
        return 0

    # 按规则汇总
    print('\n── 不合规汇总 ' + '─' * 46)
    for rid in RULES:
        n = rep.count(rid)
        if not n:
            continue
        mark = '✗' if n else '✓'
        print('  %s %-4s %-24s %d 处' % (mark, rid, TITLES[rid], n))
    print('  ' + '─' * 58)
    print('  合计 %d 处不合规，涉及 %d 个项目'
          % (len(rep.issues), len(set(i['project'] for i in rep.issues))))

    if plan:
        print('\n── 改造清单 ' + '─' * 48)
        by_proj = {}
        for i in rep.issues:
            by_proj.setdefault(i['project'], []).append(i)
        for proj_rel in sorted(by_proj):
            print('\n  %s/' % proj_rel)
            for i in sorted(by_proj[proj_rel], key=lambda x: (x['rule'], x['path'])):
                print('    [%s] %-30s %s' % (i['rule'], i['path'], i['message']))
                if i['hint']:
                    print('         → %s' % i['hint'])
    else:
        print('\n用 --plan 查看逐项改造清单。')

    return 1


if __name__ == '__main__':
    sys.exit(main())
