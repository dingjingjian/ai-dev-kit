# -*- coding: utf-8 -*-
"""把 应用清单.xlsx(小红书小工具发布清单) 与 ai-dev-kit 仓库项目做关联，
产出：①  enriched xlsx（增加关联项目/分类/小红书物料/物料状态/备注 + 可点击链接）
       ②  单文件 HTML 报告（明细表 + 使用人数排行 + 物料缺口）。
数据真源：应用清单.xlsx 的单元格 + TRACKS.md 的目录/分类/物料状态。
"""
import zipfile, re, html, os
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

SRC = r"C:\Users\ASUS\Downloads\应用清单.xlsx"
WS  = r"C:\Users\ASUS\Documents\git\ai-dev-kit"
OUT_XLSX = os.path.join(WS, "应用清单-关联项目.xlsx")
OUT_HTML = os.path.join(WS, "应用清单关联报告.html")

# ---------- 1. 读取原表 ----------
z = zipfile.ZipFile(SRC)
ss_xml = z.read("xl/sharedStrings.xml").decode("utf-8")
strings = []
for m in re.finditer(r'<si>(.*?)</si>', ss_xml, re.S):
    strings.append(html.unescape(''.join(re.findall(r'<t[^>]*>(.*?)</t>', m.group(1), re.S))))
sheet = z.read("xl/worksheets/sheet2.xml").decode("utf-8")
rows = re.findall(r'<row[^>]*r="(\d+)"[^>]*>(.*?)</row>', sheet, re.S)
def col_letter(ref): return re.match(r'([A-Z]+)', ref).group(1)
table = []
for rnum, body in rows:
    cells = re.findall(r'<c r="([A-Z]+\d+)"([^>]*)>(.*?)</c>', body, re.S)
    rd = {}
    for ref, attrs, cdata in cells:
        t = re.search(r't="(\w+)"', attrs)
        v = re.search(r'<v>(.*?)</v>', cdata)
        val = ''
        if v:
            val = strings[int(v.group(1))] if (t and t.group(1) == 's') else v.group(1)
        rd[col_letter(ref)] = val
    table.append(rd)
cols = ['A','B','C','D','E','F','G']
records = []
for row in table[1:]:  # skip header
    if not row.get('A'):
        continue
    records.append({
        'idx': row.get('A',''), 'name': row.get('B',''), 'desc': row.get('C',''),
        'users': row.get('D',''), 'ver': row.get('E',''), 'status': row.get('F',''),
        'history': row.get('G',''),
    })

# ---------- 2. 关联映射（来自 TRACKS.md 真源）----------
# key = 应用名称
MAP = {
    "口袋地球":            ("vibeknow/earth-3d",            "vibeknow", "完整（zip + 物料）", ""),
    "拼豆设计神器":        ("vibetool/perler-bead-designer", "vibetool", "已发布", ""),
    "火箭发射·逐梦星空":   ("vibeknow/rocket-launch",        "vibeknow", "已发布", "2D 火箭发射演示"),
    "人工智能OS":          ("vibegame/ai-os",               "vibegame", "已发布", ""),
    "分子空间构型可视化":  ("vibeknow/molecule",            "vibeknow", "已打包·缺笔记", "TRACKS 标注缺笔记"),
    "初高中函数可视化":    ("vibeknow/function-visualization","vibeknow","已发布", ""),
    "坐上火车去旅行":      (None,                           "未关联",   "—", "仓库内未找到对应项目（外部/未入库）"),
    "人工智能计算器":      ("vibegame/ai-calculator",       "vibegame", "已发布", ""),
    "全球交通工具图鉴":    ("vibeknow/vehicle-atlas",       "vibeknow", "框架就绪·配图待生成", ""),
    "人工智能OS 2.0":      ("vibegame/ai-os",               "vibegame", "已发布", "与「人工智能OS」同目录，v2 迭代"),
    "寰宇小馆·世界美食":   ("vibeknow/world-food-3d",       "vibeknow", "已发布","「寰宇小馆」"),
    "中秋拼豆坊":          ("vibegame/perler-mid-autumn",   "vibegame", "已发布", ""),
    "国风拼豆坊":          ("vibegame/perler-bead-game",    "vibegame", "完整（zip + 图）","「拼豆游戏」国风纹样"),
    "十二生肖拼豆坊":      ("vibegame/perler-zodiac",       "vibegame", "完整（zip + 导出闭环冒烟过）",""),
    "核战危机DEFCON":      ("vibegame/defcon",              "vibegame", "已发布", ""),
    "口袋登月":            ("vibeknow/moon-landing-3d",     "vibeknow", "已发布", "「奔月」3D 登月模拟器"),
    "口袋火箭":            ("vibeknow/rocket-launch-3d",    "vibeknow", "完整（zip + 物料）","「掌心里的航天梦」"),
    "口袋太阳系":          ("vibeknow/solar-system-3d",     "vibeknow", "完整（zip + 物料）","「太阳系 3D」"),
    "设计风格图鉴":        ("vibetool/uiux-style-gallery",  "vibetool", "完整（zip + 笔记）","67 种 UI/UX 风格"),
    "心情日记":            ("vibetool/mood-diary",          "vibetool", "已发布", ""),
    "今天我准时下班了吗？":("vibetool/offwork-heatmap",     "vibetool", "已发布", "「准时下班热力图」"),
    "Chart可视化图鉴":     ("vibetool/echarts-gallery",     "vibetool", "已发布", "30 种图表速查"),
    "为了小猫我飞遍全球":  ("vibeknow/cat-globe-3d",        "vibeknow", "已发布", ""),
    "恐龙地球":            ("vibeknow/jurassic-park-3d",    "vibeknow", "已打包（zip + 物料）",""),
    "拼豆城市":            ("vibegame/perler-city",         "vibegame", "完整（zip + 海报）",""),
    "星航者：太阳系漫游":  ("vibegame/solar-voyager",       "vibegame", "已发布", ""),
    "大航海时代 · 帆船图鉴":("vibeknow/age-of-sail-3d",      "vibeknow", "代码完成·待出图", "TRACKS 标注代码完成·待出图"),
}

def has_xhs(d):
    return d is not None and os.path.isdir(os.path.join(WS, d, "xiaohongshu"))

for r in records:
    m = MAP.get(r['name'])
    if m:
        d, cat, mat, note = m
    else:
        d, cat, mat, note = None, "未关联", "—", "未匹配到仓库项目"
    r['dir'] = d
    r['cat'] = cat
    r['mat'] = mat
    r['note'] = note
    r['xhs'] = has_xhs(d)
    try:
        r['users_n'] = int(r['users'])
    except ValueError:
        r['users_n'] = None

# ---------- 3. 写 enriched xlsx ----------
wb = Workbook()
ws = wb.active
ws.title = "发布清单-关联项目"
headers = ["序号","应用名称","应用描述","使用人数","版本号","发布状态","历史版本",
           "关联项目目录","分类","小红书物料","物料状态","备注"]
ws.append(headers)
hdr_fill = PatternFill("solid", fgColor="1F4E78")
hdr_font = Font(bold=True, color="FFFFFF")
thin = Side(style="thin", color="D0D0D0")
border = Border(left=thin, right=thin, top=thin, bottom=thin)
for c in range(1, len(headers)+1):
    cell = ws.cell(1, c); cell.fill = hdr_fill; cell.font = hdr_font
    cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    cell.border = border

cat_fill = {"vibetool":"E2EFDA","vibegame":"FCE4D6","vibeknow":"DDEBF7","未关联":"F2F2F2"}
for r in records:
    row = [r['idx'], r['name'], r['desc'], r['users'], r['ver'], r['status'], r['history'],
           r['dir'] or "—", r['cat'], ("有 ✓" if r['xhs'] else "无 ✗"), r['mat'], r['note']]
    ws.append(row)
    rr = ws.max_row
    for c in range(1, len(headers)+1):
        ws.cell(rr, c).border = border
        ws.cell(rr, c).alignment = Alignment(vertical="center", wrap_text=(c in (3,12)))
    # 分类底色
    ws.cell(rr, 9).fill = PatternFill("solid", fgColor=cat_fill.get(r['cat'],"FFFFFF"))
    # 关联目录超链接
    if r['dir']:
        link = "file:///" + os.path.join(WS, r['dir']).replace("\\","/")
        ws.cell(rr, 8).hyperlink = link
        ws.cell(rr, 8).font = Font(color="0563C1", underline="single")
    # 小红书物料超链接
    if r['xhs']:
        xlink = "file:///" + os.path.join(WS, r['dir'], "xiaohongshu").replace("\\","/")
        ws.cell(rr, 10).hyperlink = xlink
        ws.cell(rr, 10).font = Font(color="0563C1", underline="single")
    # 缺物料标红
    if not r['xhs']:
        ws.cell(rr, 10).font = Font(color="C00000", bold=True)

widths = [6,22,30,10,9,10,9,30,10,12,26,34]
for i, w in enumerate(widths, 1):
    ws.column_dimensions[get_column_letter(i)].width = w
ws.freeze_panes = "A2"
ws.auto_filter.ref = f"A1:{get_column_letter(len(headers))}{ws.max_row}"
wb.save(OUT_XLSX)
print("XLSX ->", OUT_XLSX)

# ---------- 4. 统计 ----------
cat_count = {}
for r in records:
    cat_count[r['cat']] = cat_count.get(r['cat'], 0) + 1
gaps = [r for r in records if not r['xhs']]
ranked = sorted([r for r in records if r['users_n'] is not None], key=lambda x: x['users_n'], reverse=True)

# ---------- 5. 单文件 HTML 报告 ----------
def esc(s): return html.escape(str(s))
maxu = max(r['users_n'] for r in ranked) if ranked else 1
bars = []
for r in ranked:
    w = 100.0 * r['users_n'] / maxu
    bars.append(f"""<div class="bar-row">
      <span class="bar-name">{esc(r['name'])}</span>
      <span class="bar-track"><span class="bar-fill" style="width:{w:.1f}%"></span></span>
      <span class="bar-val">{r['users_n']:,}</span></div>""")

rows_html = "".join(
    f"""<tr class="cat-{esc(r['cat'])}">
      <td>{esc(r['idx'])}</td><td class="nm">{esc(r['name'])}</td>
      <td>{esc(r['desc'])}</td><td class="num">{esc(r['users'])}</td>
      <td>{esc(r['ver'])}</td><td>{esc(r['status'])}</td><td>{esc(r['history'])}</td>
      <td>{('<a href="file:///'+os.path.join(WS,r['dir']).replace(chr(92),'/')+'">'+esc(r['dir'])+'</a>') if r['dir'] else '—'}</td>
      <td class="cat">{esc(r['cat'])}</td>
      <td class="{'ok' if r['xhs'] else 'no'}">{'有 ✓' if r['xhs'] else '无 ✗'}</td>
      <td>{esc(r['mat'])}</td><td>{esc(r['note'])}</td></tr>"""
    for r in records)

gap_html = "".join(
    f"""<li><b>{esc(r['name'])}</b> — 分类 {esc(r['cat'])}，{('关联 '+esc(r['dir'])) if r['dir'] else '未关联项目'}；{esc(r['note'])}</li>"""
    for r in gaps)

cat_badge = "".join(f"<span class='badge cat-{c}'>{c}: {n}</span>" for c,n in cat_count.items())

HTML = f"""<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>小红书小工具发布清单 · 项目关联报告</title>
<style>
*{{box-sizing:border-box}} body{{font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;margin:0;background:#f5f6f8;color:#1f2329;line-height:1.5}}
.wrap{{max-width:1180px;margin:0 auto;padding:28px 20px 60px}}
h1{{font-size:24px;margin:0 0 4px}} .sub{{color:#6b7280;font-size:13px;margin-bottom:18px}}
.kpis{{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px}}
.kpi{{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px 18px;min-width:130px}}
.kpi .v{{font-size:26px;font-weight:700}} .kpi .l{{font-size:12px;color:#6b7280}}
.badges{{margin:6px 0 22px}} .badge{{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;margin-right:6px;font-weight:600}}
.badge.cat-vibetool{{background:#e2efda;color:#2e6b1f}} .badge.cat-vibegame{{background:#fce4d6;color:#b45309}}
.badge.cat-vibeknow{{background:#ddebf7;color:#1f5fa8}} .badge.cat-未关联{{background:#f2f2f2;color:#666}}
.card{{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:18px 20px;margin-bottom:22px}}
.card h2{{font-size:17px;margin:0 0 14px}}
table{{width:100%;border-collapse:collapse;font-size:13px}}
th,td{{border-bottom:1px solid #eee;padding:8px 9px;text-align:left;vertical-align:top}}
th{{background:#f0f2f5;position:sticky;top:0;font-weight:600}}
td.nm{{font-weight:600}} td.num{{text-align:right;font-variant-numeric:tabular-nums}}
.cat-vibetool{{background:#f7fcf4}} .cat-vibegame{{background:#fff8f3}} .cat-vibeknow{{background:#f6fafe}}
td.ok{{color:#1a7f37;font-weight:600}} td.no{{color:#c00000;font-weight:700}}
td.cat{{font-weight:600}}
a{{color:#0563c1;text-decoration:none}} a:hover{{text-decoration:underline}}
.bars{{margin-top:4px}} .bar-row{{display:flex;align-items:center;gap:10px;margin:5px 0;font-size:13px}}
.bar-name{{width:170px;flex:none;text-align:right;color:#374151}} .bar-track{{flex:1;background:#eef0f3;border-radius:6px;height:16px;overflow:hidden}}
.bar-fill{{display:block;height:100%;background:linear-gradient(90deg,#4f8cff,#1f4e78)}} .bar-val{{width:64px;flex:none;font-variant-numeric:tabular-nums;color:#374151}}
.note{{font-size:12px;color:#6b7280;margin-top:8px}}
ul.gaps li{{margin:6px 0;font-size:13.5px}}
footer{{color:#9aa0a6;font-size:12px;margin-top:30px;text-align:center}}
</style></head><body><div class="wrap">
<h1>小红书小工具发布清单 · 项目关联报告</h1>
<div class="sub">数据真源：<code>应用清单.xlsx</code>（26 个已发布工具）+ 仓库 <code>TRACKS.md</code>（目录/分类/物料状态）。生成时间自动。</div>
<div class="kpis">
  <div class="kpi"><div class="v">{len(records)}</div><div class="l">已发布工具</div></div>
  <div class="kpi"><div class="v">{sum(1 for r in records if r['dir'])}</div><div class="l">已关联仓库项目</div></div>
  <div class="kpi"><div class="v">{sum(1 for r in records if r['xhs'])}</div><div class="l">已有小红书物料</div></div>
  <div class="kpi"><div class="v" style="color:#c00000">{len(gaps)}</div><div class="l">物料缺口</div></div>
</div>
<div class="badges">{cat_badge}</div>

<div class="card"><h2>使用人数排行（Top，含「无数据」除外）</h2>
<div class="bars">{''.join(bars)}</div>
<div class="note">注：「全球交通工具图鉴」在原表中为「无数据」，未计入排行。</div>
</div>

<div class="card"><h2>物料缺口（笔记可挂载对应的小工具 — 以下尚未就绪）</h2>
<ul class="gaps">{gap_html}</ul>
<div class="note">提示：其中「坐上火车去旅行」在仓库内未找到对应源码，可能为外部/未入库工具；其余 3 个已在仓库但缺小红书物料目录，可优先补笔记。</div>
</div>

<div class="card"><h2>明细总表（含关联项目 / 分类 / 物料状态）</h2>
<div style="overflow:auto;max-height:620px">
<table><thead><tr>
<th>序号</th><th>应用名称</th><th>应用描述</th><th>使用人数</th><th>版本号</th><th>发布状态</th><th>历史版本</th>
<th>关联项目目录</th><th>分类</th><th>小红书物料</th><th>物料状态</th><th>备注</th>
</tr></thead><tbody>{rows_html}</tbody></table>
</div>
<div class="note">点击「关联项目目录」「小红书物料」可在资源管理器中打开对应路径（需在本机打开此文件）。</div>
</div>
<footer>由 WorkBuddy 生成 · 真源：应用清单.xlsx + TRACKS.md</footer>
</div></body></html>"""

with open(OUT_HTML, "w", encoding="utf-8") as f:
    f.write(HTML)
print("HTML ->", OUT_HTML)
print("统计：", cat_count, "缺口:", [r['name'] for r in gaps])
