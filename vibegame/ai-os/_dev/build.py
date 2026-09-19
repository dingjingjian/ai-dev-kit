# -*- coding: utf-8 -*-
"""ai-os v2 唯一真源构建脚本。

产出：
  ../index.html  —— 入口（内联 CSS，引用 ./main.js）
  ../main.js     —— 应用逻辑（ES2017 / Chrome 61 基线）

「应用商店」的项目清单在构建期从仓库根 TRACKS.md 派生后注入 main.js（见 store_apps()）。

规范真源见 ../DESIGN.md。容器/兼容细则见仓库 .skill/minitool-zip-builder/。
运行：python build.py
"""
import io
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, ".."))
# 仓库根（ai-os/_dev -> ai-os -> vibegame -> <repo>）：TRACKS.md 在这里
TRACKS = os.path.normpath(os.path.join(HERE, "..", "..", "..", "TRACKS.md"))


def cam_shots():
    """相机取景素材清单：扫描 ./assets/cam/*.webp（由 _dev/make_cam_photos.py 派生）。

    构建时扫描而不是把 90 个文件名抄进源码：清单与实际随包文件天然一致，
    新增/删除素材只重跑派生脚本即可，不会有「JS 里列了却没打包」的漏网图片。
    """
    d = os.path.join(OUT, "assets", "cam")
    if not os.path.isdir(d):
        raise SystemExit("缺少相机素材目录：%s\n请先运行：python _dev/make_cam_photos.py" % d)
    files = sorted(n for n in os.listdir(d) if n.endswith(".webp"))
    if len(files) < 3:
        raise SystemExit("相机素材不足（%d 张）：%s\n请先运行：python _dev/make_cam_photos.py"
                         % (len(files), d))
    return ["./assets/cam/" + n for n in files]


def store_state(status):
    """把 TRACKS.md 的「物料状态」原文折成商店语言：返回 (短标签, 语气色)。

    原文是写给维护者看的（混着验收记录、包体体积、投稿口径），原样上屏就成了
    「文档」而不是「商店」；卡片只留一个短标签，语气色走站内语义色：
      ok = 已上架（已有成品/已发布）· warn = 开发中（待落地/未做/缺物料）· dim = 内部自用。
    原文仍随数据注入（s 字段）供构建门禁与自检对拍，但不上屏。
    """
    if any(k in status for k in ("已发布", "完整", "可玩", "已打包")):
        return "已上架", "ok"
    if "自用" in status:
        return "内部自用", "dim"
    if any(k in status for k in ("待", "未", "缺")):
        return "开发中", "warn"
    return "已收录", "dim"


def store_tagline(desc):
    """把 TRACKS.md 的「一句话定位」压成商店副标题（tag）。

    定位是写给仓库索引看的，常带技术括注与实现说明 —— ai-os 那条甚至点名了
    `vibeknow/moon-3d` 这类上游路径，原样进商店就又变成「文档」。这里只砍掉
    第一个「（」或「：」之后的部分（都是括注/定义式展开），保留「它是什么」；
    长度交给卡片的一行省略号。完整定位仍随数据注入（t 字段）备查，不上屏。
    """
    cut = len(desc)
    for sep in ("（", "："):
        i = desc.find(sep)
        if i > 0 and i < cut:
            cut = i
    return desc[:cut].strip()


def store_apps():
    """「应用商店」的项目清单：构建期解析仓库根 TRACKS.md（分类索引的唯一真源）。

    TRACKS.md 是全仓项目分类的唯一真源，商店里逐个介绍这些已开发的小工具，
    清单必须由它派生而不是手抄一份 —— 手抄件会在「新增项目 / 改定位 / 改物料状态」
    时与上游分叉，且不会有人记得回来同步。只读解析，不改动上游文件；
    跳过 `.skill/` 开头的行（那是技能，不是应用），其余按四大分类原样分组。
    每项：n 名称（上屏）/ tag 商店副标题（上屏，由 store_tagline() 折出）/
    st 上架短标签 + tone 语气色（上屏，由 store_state() 折出）/
    d 目录与 t 定位原文、s 物料状态原文（**不上屏**，只供构建门禁与自检对拍）。
    返回 [{tag, name, items:[...]}]，注入 main.js 的 __STORE_DATA__。
    """
    if not os.path.isfile(TRACKS):
        raise SystemExit("找不到仓库根 %s\n它是「应用商店」的数据真源，请勿删除或改名。" % TRACKS)
    # 分类标题形如：## #vibetool　实用工具（14）
    head_re = re.compile(r"^##\s*#([a-z]+)[\s\u3000]*(.+?)\s*[（(]\d+[）)]\s*$")
    groups, cur = [], None
    with io.open(TRACKS, encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            m = head_re.match(line)
            if m:
                cur = {"tag": m.group(1), "name": m.group(2).strip(), "items": []}
                groups.append(cur)
                continue
            if cur is None or not line.startswith("|"):
                continue
            cells = [c.strip() for c in line.strip("|").split("|")]
            if len(cells) < 4:
                continue
            name, path, desc, status = cells[0], cells[1].strip("`"), cells[2], cells[3]
            # 表头 / 分隔行（目录列不是 `xxx/`）、技能目录，一律不算应用
            if not path.endswith("/") or path.startswith(".skill/"):
                continue
            label, tone = store_state(status)
            cur["items"].append({"n": name, "d": path, "t": desc, "s": status,
                                 "st": label, "tone": tone, "tag": store_tagline(desc)})
    groups = [g for g in groups if g["items"]]
    if not groups:
        raise SystemExit("未能从 %s 解析出任何项目，请检查分类标题与表格格式。" % TRACKS)
    return groups

# ---------------------------------------------------------------------------
# CSS（Chrome 61 基线层 + @supports 增强层；不维护两套样式表）
# ---------------------------------------------------------------------------
CSS = r"""
/* ============ 安全区 / 净空（DESIGN.md §2） ============ */
:root{
  --top-gap:50px;
  --safe-top:calc(var(--top-gap) + var(--safe-area-inset-top, env(safe-area-inset-top, 0px)));
  --safe-bottom:var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px));
  --safe-l:0px;
  --safe-r:0px;

  /* 语义色（DESIGN.md §4.5） */
  --accent:#6C4CF1;
  --ok:#1FA971;
  --warn:#E8A13C;
  --danger:#E05252;
  --combo:#F08A24;

  /* 质感 token（DESIGN.md §4.6）：圆角三档 / 双层投影 / 内高光 / 颗粒 */
  --r-lg:24px;
  --r-md:18px;
  --r-sm:12px;
  --sh-1:0 1px 2px rgba(16,16,32,.06);
  --sh-2:0 10px 28px rgba(16,16,32,.10);
  --hl:inset 0 1px 0 rgba(255,255,255,.55);
  --hair:rgba(255,255,255,.6);
  --grain:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='0.045'/%3E%3C/svg%3E");
}
body[data-mode="dark"]{
  --sh-1:0 1px 2px rgba(0,0,0,.4);
  --sh-2:0 10px 28px rgba(0,0,0,.45);
  --hl:inset 0 1px 0 rgba(255,255,255,.08);
  --hair:rgba(255,255,255,.10);
}
/* 宿主内嵌：小红书自带按钮（返回 / 分享 / 更多）只位于**顶部导航行**，
 * 纵向由 --safe-top 预留带让开即可；容器在内容区与底部 Dock **没有**侧边按钮，
 * 故左右净空一律为 0 —— 不再让内容区 / Dock / 页脚内缩。
 * （历史教训：把 48/92 套到所有贴边栏，会让主屏半行组件被拆成两行、
 *  Dock 图标被压扁挤到一起、每个应用页左右各留出大片空白，与纯浏览器渲染严重不一致。） */
body.in-app{ --safe-l:0px; --safe-r:0px;
  /* 宿主顶栏（返回 / 分享 / 更多）就压在这条预留带里：纯 50px 时几乎被它占满，
   * 带子下方只剩十几像素，看起来像「顶部没留白、内容顶到宿主顶栏上」。
   * in-app 加大到 70px —— 宿主顶栏之下仍留出明显空白。
   * 注意必须在 body 上**重新声明 --safe-top**：自定义属性在声明它的元素上求值，
   * 只覆盖 --top-gap 不会让 :root 上的 --safe-top 重算。 */
  --top-gap:70px;
  --safe-top:calc(var(--top-gap) + var(--safe-area-inset-top, env(safe-area-inset-top, 0px)));
}
/* 宿主带真实状态栏 + 顶部导航条（返回 / 分享 / 更多）：in-app 时隐藏自绘状态栏。
 * 不自绘的原因：宿主已画一层真实状态栏，本应用再画一层会在屏幕上叠出「两层状态栏」，
 * 且自绘状态栏与宿主顶部按钮同处一行、互相挤占。
 * 用 visibility 而非 display —— 保住 --safe-top 预留带高度，宿主顶栏按钮与内容区之间仍有留白。
 * 纯浏览器 / PC 模拟器无宿主状态栏时照常显示（真机观感靠它）。 */
/* 高度同样给普通值兜底：即使 --safe-top 链失效，in-app 也要保住 70px 预留带。 */
body.in-app .statusbar{ visibility:hidden; height:70px; height:var(--safe-top); }

/* ============ 主题 token（默认浅色，DESIGN.md §4.2） ============ */
:root{
  --ink:#1C1B1F;
  --ink-dim:#63626B;
  --card:#FFFFFF;
  --line:rgba(0,0,0,.08);
  --surface:#FFFFFF;
  --surface-glass:rgba(255,255,255,.72);
  --nav:#F7F7FB;
  --nav-glass:rgba(247,247,251,.80);
  /* 应用页整屏底色：主屏才见壁纸，进入应用后状态栏区 + 内容区 + 底部导航统一铺该底色 */
  --app-bg:#F3F3F7;
  --app-nav:#FBFBFD;
  --app-nav-glass:rgba(251,251,253,.92);
  /* 扫雷面格（日历日格）：未开口=抬起块（双色渐变），已开口=凹陷平底 */
  --cell-hi:#F7F7FB;
  --cell:#E7E7EF;
  --cell-rev:#F1F1F6;
}
body[data-mode="dark"]{
  --ink:#F2F1F7;
  --ink-dim:#A6A4B2;
  --card:#1F1F28;
  --line:rgba(255,255,255,.10);
  --surface:#1B1B22;
  --surface-glass:rgba(27,27,34,.72);
  --nav:#14141A;
  --nav-glass:rgba(20,20,26,.80);
  --app-bg:#121216;
  --app-nav:#15151A;
  --app-nav-glass:rgba(21,21,26,.92);
  --cell-hi:#33333E;
  --cell:#2A2A34;
  --cell-rev:#191920;
}

/* 壁纸（颗粒 + 多层 mesh + 底部暗角，避免平涂塑料感） */
body[data-wall="light-mesh"]{
  --wall:
    var(--grain),
    radial-gradient(circle at 10% 6%, rgba(108,76,241,.20), transparent 44%),
    radial-gradient(circle at 90% 16%, rgba(64,150,255,.18), transparent 48%),
    radial-gradient(circle at 72% 96%, rgba(180,140,255,.14), transparent 52%),
    linear-gradient(180deg,#EEF2FF 0%,#F5F3FF 100%);
  --status-ink:#23222A;
}
body[data-wall="light-solid"]{
  --wall:
    var(--grain),
    linear-gradient(180deg,#F5F7FC 0%,#EDEFF5 100%);
  --status-ink:#23222A;
}
body[data-wall="dark-mesh"]{
  --wall:
    var(--grain),
    radial-gradient(circle at 14% 8%, rgba(108,76,241,.34), transparent 46%),
    radial-gradient(circle at 86% 20%, rgba(46,127,232,.26), transparent 48%),
    radial-gradient(circle at 62% 96%, rgba(240,138,36,.16), transparent 52%),
    linear-gradient(180deg,#1A1C30 0%,#0D0E17 100%);
  --status-ink:#F2F1F7;
}
body[data-wall="dark-solid"]{
  --wall:
    var(--grain),
    linear-gradient(180deg,#14141B 0%,#0C0C11 100%);
  --status-ink:#F2F1F7;
}

/* ============ 基础重置 ============ */
*{ box-sizing:border-box; margin:0; padding:0; -webkit-tap-highlight-color:transparent; }
html,body{ height:100%; }
body{
  font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
  color:var(--ink);
  background:var(--wall);
  display:flex; flex-direction:column;
  overflow:hidden;
  -webkit-user-select:none; user-select:none;
  -webkit-touch-callout:none;
  touch-action:manipulation;
}
button{ font-family:inherit; border:none; outline:none; background:none; color:inherit; cursor:pointer; }
svg{ display:block; }

/* ============ 状态栏：真机布局（时间左 / 状态图标右），纯展示无交互（§4.1） ============
 * 左右内容位于净空之内（padding 含 --safe-l/--safe-r），不会压到宿主自带按钮；
 * 净空与顶部带内依然禁止任何可交互元素。 */
.statusbar{
  flex:0 0 auto;
  /* 基线普通值在前、变量在后（css-compatibility.md §4）：--safe-top 是链式
   * calc(var() env()) 自定义属性，一旦其中任一段失效，height 会整条 computed-value
   * 失效并回退成 auto（≈24px）——预留带就塌了，内容顶到宿主顶栏上。前置 50px 兜底。 */
  height:50px;
  height:var(--safe-top);
  display:flex; align-items:flex-end; justify-content:space-between;
  padding-left:calc(14px + var(--safe-l));
  padding-right:calc(14px + var(--safe-r));
  padding-bottom:7px;
  color:var(--status-ink);
}
.sb-left, .sb-right{ display:flex; align-items:center; }
.sb-time{ font-size:14px; font-weight:600; letter-spacing:.2px; }
.sb-signal{ display:flex; align-items:flex-end; }
.sb-signal i{ width:3px; background:currentColor; border-radius:1px; margin-left:2px; }
.sb-signal i:nth-child(1){ height:5px; }
.sb-signal i:nth-child(2){ height:7px; }
.sb-signal i:nth-child(3){ height:9px; }
.sb-signal i:nth-child(4){ height:11px; opacity:.35; }
.sb-wifi{ margin-left:7px; }
.sb-wifi svg{ width:15px; height:15px; fill:currentColor; }
.sb-batt{ display:flex; align-items:center; margin-left:7px; }
.sb-batt-shell{
  width:22px; height:11px; border:1px solid currentColor; border-radius:3px;
  position:relative; opacity:.9;
}
.sb-batt-shell:after{
  content:""; position:absolute; top:3px; right:-4px; width:2px; height:5px;
  background:currentColor; border-radius:0 1px 1px 0;
}
.sb-batt-fill{ position:absolute; top:1px; left:1px; bottom:1px; width:87%; background:currentColor; border-radius:1px; }
.sb-batt-txt{ font-size:11px; margin-left:5px; opacity:.85; }

/* ============ 视图容器 ============ */
#viewRoot{ position:relative; flex:1 1 auto; min-height:0; overflow:hidden; }
.view{
  position:absolute; top:0; left:0; right:0; bottom:0;
  display:flex; flex-direction:column;
  transition:opacity .2s ease, transform .26s cubic-bezier(.2,.75,.25,1);
}
.view.hidden{ display:none; }
.view.entering{ opacity:0; transform:scale(.965); }

/* ============ 应用页整屏底色（DESIGN.md §4.2） ============
 * 主屏（.home）透明，透出 body 壁纸；进入任意应用后 body 带 on-app，
 * 状态栏区与内容区一起铺 --app-bg，底部导航换 --app-nav，壁纸完全让位。 */
body.on-app .statusbar{ background:var(--app-bg); color:var(--ink); }
body.on-app #viewRoot{ background:var(--app-bg); }
body.on-app{ --nav:var(--app-nav); --nav-glass:var(--app-nav-glass); }

/* ============ 主屏（§4.3） ============ */
.home-body{
  flex:1 1 auto; min-height:0;
  display:flex; flex-direction:column;
  overflow-y:auto;
  -webkit-overflow-scrolling:touch;
  overscroll-behavior-y:contain;
}
.widgets{
  flex:0 0 auto;
  padding:6px 14px 0 14px;
}
.w-row{ display:flex; }
.w-half{ flex:1 1 0; min-width:0; }
.w-half + .w-half{ margin-left:10px; }
.widget{
  background:var(--surface);
  border:1px solid var(--hair);
  border-radius:var(--r-lg);
  padding:12px 14px;
  margin-bottom:10px;
  box-shadow:var(--sh-1), var(--sh-2), var(--hl);
}
@supports ((-webkit-backdrop-filter:blur(14px)) or (backdrop-filter:blur(14px))){
  .widget{ background:var(--surface-glass); -webkit-backdrop-filter:blur(14px); backdrop-filter:blur(14px); }
}
button.widget{ width:100%; text-align:left; }
button.widget:active{ opacity:.8; }

/* 时钟组件：主视觉渐变卡（顶部高光纹理 + 内发丝），左时间+副行，右会走的模拟小表盘 */
.w-clock{ display:flex; align-items:center; justify-content:space-between; }
.widget.w-clock{
  background:
    radial-gradient(140% 100% at 0% 0%, rgba(255,255,255,.24), rgba(255,255,255,0) 46%),
    linear-gradient(135deg,#6C4CF1 0%,#4A2FD0 100%);
  border-color:rgba(255,255,255,.28);
  box-shadow:var(--sh-2), inset 0 1px 0 rgba(255,255,255,.30);
  padding:20px 18px;
}
.w-clock-main{ display:block; min-width:0; }
.w-clock-time{
  font-size:46px; font-weight:800; letter-spacing:-1px; line-height:1; color:#fff;
  font-variant-numeric:tabular-nums;
}
.w-clock-sub{
  display:block; font-size:11px; letter-spacing:.3px; color:rgba(255,255,255,.75); margin-top:9px;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.w-analog{
  flex:0 0 auto; width:64px; height:64px; border-radius:50%;
  border:2px solid #fff; position:relative; opacity:.6; margin-left:12px;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.22);
}
.w-analog i{
  position:absolute; left:50%; bottom:50%;
  transform-origin:50% 100%;
  background:#fff; border-radius:2px;
}
.w-analog .w-hh{ width:4px; height:18px; margin-left:-2px; }
.w-analog .w-mh{ width:3px; height:24px; margin-left:-1.5px; }
.w-analog:after{
  content:""; position:absolute; left:50%; top:50%;
  width:10px; height:10px; margin-left:-5px; margin-top:-5px;
  border-radius:50%; background:#FFD666;
}

/* 天气组件：浅冷渐变卡 + glyph 圆 chip（一眼假的设定数据），与钱包深冷卡同族 */
.widget.w-weather{
  background:
    radial-gradient(140% 100% at 0% 0%, rgba(255,255,255,.45), rgba(255,255,255,0) 50%),
    linear-gradient(135deg,#E8F1FE 0%,#DDE7FB 100%);
  border-color:rgba(255,255,255,.55);
  box-shadow:var(--sh-2), inset 0 1px 0 rgba(255,255,255,.55);
}
body[data-mode="dark"] .widget.w-weather{
  background:
    radial-gradient(140% 100% at 0% 0%, rgba(255,255,255,.08), rgba(255,255,255,0) 50%),
    linear-gradient(135deg,#2A3548 0%,#1F2838 100%);
  border-color:rgba(255,255,255,.10);
}
.w-city{ font-size:12px; color:var(--ink-dim); }
.w-wrow2{ display:flex; align-items:center; margin-top:4px; }
.w-temp{ font-size:28px; font-weight:700; line-height:1.1; color:var(--ink); font-variant-numeric:tabular-nums; }
.w-glyphchip{
  flex:0 0 auto; width:26px; height:26px; border-radius:50%;
  background:rgba(70,127,232,.16);
  display:flex; align-items:center; justify-content:center;
  margin-left:8px;
}
.w-glyphchip svg{ width:14px; height:14px; fill:#2E7FE8; }
.w-hl{ display:block; font-size:11px; color:var(--ink-dim); margin-top:8px; }
.w-src{ font-size:10px; color:var(--ink-dim); opacity:.85; margin-top:5px; }

/* 钱包组件：银行卡质感深色卡（顶部sheen+内发丝），假余额，默认打码、点按显示 */
.widget.w-wallet{
  background:
    radial-gradient(150% 110% at 0% 0%, rgba(255,255,255,.14), rgba(255,255,255,0) 44%),
    linear-gradient(135deg,#2E3440 0%,#171A21 100%);
  border-color:rgba(255,255,255,.14);
  box-shadow:var(--sh-2), inset 0 1px 0 rgba(255,255,255,.16);
}
.w-wtop{ display:flex; align-items:center; justify-content:space-between; }
.w-bank{ font-size:11px; color:rgba(255,255,255,.65); }
.w-chip{
  flex:0 0 auto; width:26px; height:19px; border-radius:4px;
  background:linear-gradient(135deg,#E6C65C,#C9A227);
  position:relative;
}
.w-chip:after{
  content:""; position:absolute; left:3px; right:3px; top:8px; height:2px;
  background:rgba(0,0,0,.28); border-radius:1px;
}
.w-bal-lbl{ font-size:10px; color:rgba(255,255,255,.6); margin-top:4px; }
.w-bal{ font-size:25px; font-weight:800; line-height:1.1; color:#fff; letter-spacing:.2px; white-space:nowrap; font-variant-numeric:tabular-nums; }
.w-wrow{ display:flex; align-items:center; justify-content:space-between; margin-top:12px; }
.w-spend{ font-size:10px; color:rgba(255,255,255,.6); }
.w-cardno{ font-size:10px; color:rgba(255,255,255,.6); letter-spacing:1px; }

.home-grid{
  flex:0 0 auto;
  display:grid;
  grid-template-columns:repeat(4,1fr);
  grid-gap:22px 14px;
  align-content:start;
  padding:16px 14px 10px 14px;
}
.app-tile{
  display:flex; flex-direction:column; align-items:center;
  transition:transform .16s ease;
}
.app-tile:active{ transform:scale(.94); }
.app-icon{
  width:62px; height:62px; border-radius:23%;
  display:flex; align-items:center; justify-content:center;
  /* 双层投影：环境 + 中性主光（真机图标不用彩色光晕）；内高光/内底影给厚度 */
  box-shadow:
    var(--sh-1),
    0 6px 14px rgba(20,20,40,.18),
    inset 0 1px 0 rgba(255,255,255,.35),
    inset 0 -1px 0 rgba(0,0,0,.10);
}
.app-icon svg{ width:30px; height:30px; fill:#fff; }
.app-name{ margin-top:8px; font-size:12px; font-weight:400; letter-spacing:.2px; color:var(--ink); }
body[data-mode="dark"] .app-icon{
  box-shadow:
    var(--sh-1),
    0 6px 14px rgba(0,0,0,.52),
    inset 0 1px 0 rgba(255,255,255,.20),
    inset 0 -1px 0 rgba(0,0,0,.28);
}

.dock{
  flex:0 0 auto;
  margin-left:calc(14px + var(--safe-l));
  margin-right:calc(14px + var(--safe-r));
  /* 与底部金刚键栏之间必须有明确留白：容器视口比纯浏览器矮，主屏内容把剩余空间吃满时，
   * 只剩这条外边距 —— 10px 时 Dock 看起来是"贴在"金刚键栏上。 */
  margin-bottom:24px;
  display:flex; justify-content:space-between; align-items:center;
  background:var(--surface);
  border:1px solid var(--hair);
  border-radius:28px;
  padding:12px 22px;
  box-shadow:var(--sh-2), var(--hl);
}
@supports ((-webkit-backdrop-filter:blur(14px)) or (backdrop-filter:blur(14px))){
  .dock{ background:var(--surface-glass); -webkit-backdrop-filter:blur(14px); backdrop-filter:blur(14px); }
}
/* Dock 图标与主屏同尺寸（真机 Dock 不缩小图标、不带标签） */
.dock .app-icon{ width:62px; height:62px; }
.dock .app-icon svg{ width:30px; height:30px; }
.dock .app-tile:active .app-icon{ opacity:.75; }

/* ============ 应用页三段式骨架（§4.4） ============ */
.phead{
  flex:0 0 auto; height:54px;
  display:flex; align-items:center; justify-content:center;
  padding-left:calc(8px + var(--safe-l));
  padding-right:calc(8px + var(--safe-r));
}
.phead h1{ font-size:18px; font-weight:600; color:var(--ink); }
.pbody{
  flex:1 1 auto; min-height:0;
  overflow-y:auto;
  -webkit-overflow-scrolling:touch;
  overscroll-behavior-y:contain;
  padding:8px calc(16px + var(--safe-r)) 16px calc(16px + var(--safe-l));
}
.pfoot{
  /* 页内操作区左右内缩量：绝对定位的覆盖层（计算器判定按钮）复用同一组变量对齐，
     不写死 left:0/right:0（那会贴到屏幕边上）。 */
  --foot-px-l:calc(16px + var(--safe-l));
  --foot-px-r:calc(16px + var(--safe-r));
  flex:0 0 auto;
  padding:10px var(--foot-px-r) 12px var(--foot-px-l);
}

.card{
  background:var(--card);
  border:1px solid var(--line);
  border-radius:var(--r-md);
  padding:6px 16px;
  margin-bottom:12px;
}
.card-title{ font-size:13px; color:var(--ink-dim); padding:12px 0 4px 0; }

.row{ display:flex; align-items:center; padding:15px 2px; border-bottom:1px solid var(--line); transition:background-color .14s ease; }
.row:last-child{ border-bottom:none; }
.row:active{ background-color:rgba(120,120,140,.10); }
.row .lbl{ flex:1 1 auto; min-width:0; font-size:15px; color:var(--ink); }
.row .val{ font-size:13px; color:var(--ink-dim); margin-right:8px; }
.about-desc{ padding:13px 2px 2px 2px; font-size:13px; line-height:1.5; color:var(--ink-dim); margin-top:8px; }

/* 开关 */
.switch{
  flex:0 0 auto; width:46px; height:27px; border-radius:14px;
  background:rgba(120,120,130,.30); border:1px solid var(--line); position:relative;
  transition:background .18s ease;
}
.switch:after{
  content:""; position:absolute; top:2px; left:2px; width:23px; height:23px;
  border-radius:50%; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.25);
  transition:left .18s ease;
}
.switch.on{ background:var(--accent); }
.switch.on:after{ left:21px; }

/* 壁纸选择 */
.walls{ display:flex; padding:6px 2px 12px 2px; }
.wall-item{ display:flex; flex-direction:column; align-items:center; margin-right:14px; }
.wall-swatch{
  width:56px; height:92px; border-radius:var(--r-sm);
  border:2px solid transparent;
  box-shadow:0 2px 6px rgba(0,0,0,.15);
}
.wall-swatch.sel{ border-color:var(--accent); box-shadow:0 0 0 2px var(--accent), 0 2px 8px rgba(108,76,241,.3); }
.wall-name{ font-size:11px; color:var(--ink-dim); margin-top:7px; }
/* 设置项点击后的恶搞提示（行内 toast，贴 pbody 底部始终可见） */
.set-toast{
  position:sticky; bottom:8px; z-index:5;
  margin:0 2px; padding:0 14px; border-radius:var(--r-md);
  background:var(--accent); color:#fff; font-size:13px; line-height:1.5;
  box-shadow:0 4px 14px rgba(108,76,241,.30);
  max-height:0; opacity:0; overflow:hidden;
  transition:max-height .22s ease, opacity .22s ease, padding .22s ease;
}
.set-toast.show{ max-height:80px; opacity:1; padding:11px 14px; }
/* 设置项行尾箭头 */
.row .arrow{ font-size:15px; color:var(--ink-dim); margin-right:2px; }

/* 占位应用页 */
.ph-wrap{
  flex:1 1 auto; min-height:0;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  padding:0 calc(16px + var(--safe-r)) 0 calc(16px + var(--safe-l));
  text-align:center;
}
.ph-icon{
  width:84px; height:84px; border-radius:26%;
  display:flex; align-items:center; justify-content:center;
  box-shadow:0 10px 24px rgba(20,20,40,.20);
}
.ph-icon svg{ width:44px; height:44px; fill:#fff; }
.ph-name{ margin-top:14px; font-size:20px; font-weight:600; color:var(--ink); }
.ph-slogan{ margin-top:6px; font-size:13px; color:var(--ink-dim); }
.chip{
  display:inline-block; margin-top:16px;
  font-size:12px; color:var(--accent);
  border:1px solid var(--accent); border-radius:999px;
  padding:5px 12px;
}
.ph-chips{ display:flex; flex-wrap:wrap; justify-content:center; margin-top:16px; }
.ph-chips .chip{ margin:0 4px 8px 4px; }
.ph-tip{ margin-top:14px; font-size:13px; line-height:1.5; color:var(--ink-dim); max-width:260px; }
.pfoot-hint{ font-size:12px; color:var(--ink-dim); text-align:center; }

/* ============ 应用商店（§4.12） ============ */
/* 顶部固定带（店头 + 分类筛选）：内容区仍是全页唯一滚动区 */
.store-bar{
  flex:0 0 auto;
  padding:8px calc(16px + var(--safe-r)) 10px calc(16px + var(--safe-l));
}
/* 店头：品牌渐变横幅（与主屏时钟组件同一套「主视觉渐变卡」语言，§4.3.1）+ 购物袋水印 */
.store-hero{
  position:relative; overflow:hidden;
  border-radius:var(--r-lg); padding:15px 18px; color:#fff;
  background-image:
    radial-gradient(120% 90% at 20% 0%, rgba(255,255,255,.28), rgba(255,255,255,0) 55%),
    linear-gradient(135deg,#7C5CFF 0%,#4A56D6 100%);
  box-shadow:var(--sh-2);
}
.store-hero-art{ position:absolute; right:-8px; bottom:-18px; opacity:.15; }
.store-hero-art svg{ width:100px; height:100px; fill:#fff; }
.store-hero-top{ position:relative; display:flex; align-items:baseline; }
.store-hero-k{ font-size:11px; letter-spacing:.3px; color:rgba(255,255,255,.78); }
.store-hero-v{ margin:0 5px; font-size:34px; font-weight:800; letter-spacing:-1px; font-variant-numeric:tabular-nums; }
.store-hero-u{ font-size:13px; font-weight:600; color:rgba(255,255,255,.85); }
.store-hero-d{ position:relative; margin-top:5px; font-size:11.5px; letter-spacing:.2px; color:rgba(255,255,255,.82); }
/* 分类筛选：等分满宽（与难度选择 / 键盘同一套控件语言，§4.4），不是散在左侧的小胶囊。
 * 列数由 JS 按「分类数 + 1」内联写入 repeat(N,1fr)；这里的 5 列只是兜底值。 */
.store-tabs{ display:grid; grid-template-columns:repeat(5,1fr); grid-gap:6px; margin-top:10px; }
.store-tab{
  height:38px; border-radius:var(--r-sm);
  font-size:12px; font-weight:600; color:var(--ink); white-space:nowrap;
  background:var(--card); border:1px solid var(--line);
  box-shadow:var(--sh-1);
  transition:transform .16s ease;
}
.store-tab:active{ transform:scale(.96); }
.store-tab.sel{
  color:#fff; border-color:transparent;
  background:linear-gradient(135deg,#8F7BF7,#6A4CE0);
  box-shadow:var(--sh-1), inset 0 1px 0 rgba(255,255,255,.30);
}
/* 货架 */
.store-list{ padding-top:2px; }
.store-sec.hidden{ display:none; }
.store-sec-h{ display:flex; align-items:center; padding:14px 2px 8px 2px; }
.store-sec-dot{ flex:0 0 auto; width:10px; height:10px; border-radius:3px; margin-right:8px; box-shadow:var(--sh-1); }
.store-sec-t{ font-size:14px; font-weight:600; color:var(--ink); letter-spacing:.2px; }
.store-sec-n{ margin-left:auto; font-size:11px; color:var(--ink-dim); }
/* 货架卡：招牌图标 + 名称 + 一句副标题 + 上架标签（一行一卡，静态不展开） */
.store-card{
  background:var(--card); border:1px solid var(--line); border-radius:var(--r-md);
  padding:11px 14px; margin-bottom:9px;
  box-shadow:var(--sh-1), var(--hl);
}
.store-head{ display:flex; align-items:center; }
/* 招牌图标：与主屏图标同一套质感（squircle 23% + 中性投影 + 内高光/内底影，§4.6） */
.store-mini{
  flex:0 0 auto; width:46px; height:46px; border-radius:23%;
  display:flex; align-items:center; justify-content:center;
  color:#fff; font-size:19px; font-weight:700;
  box-shadow:
    var(--sh-1),
    0 4px 10px rgba(20,20,40,.14),
    inset 0 1px 0 rgba(255,255,255,.35),
    inset 0 -1px 0 rgba(0,0,0,.10);
}
body[data-mode="dark"] .store-mini{
  box-shadow:
    var(--sh-1),
    0 4px 10px rgba(0,0,0,.45),
    inset 0 1px 0 rgba(255,255,255,.20),
    inset 0 -1px 0 rgba(0,0,0,.28);
}
.store-title{ flex:1 1 auto; min-width:0; margin-left:12px; }
.store-name{ font-size:15.5px; font-weight:600; color:var(--ink); }
/* 副标题：商店口径的一句短句，恒定单行省略号（副标题不该长成一段话） */
.store-desc{
  margin-top:3px; font-size:12.5px; line-height:1.5; color:var(--ink-dim);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.store-tags{ margin-top:6px; display:flex; }
/* 上架状态标签：语气色走站内语义色（ok / warn / 中性），本机那枚是 accent */
.store-chip{
  display:inline-block; font-size:11px; line-height:1.6;
  border-radius:999px; padding:2px 9px;
  color:var(--ink-dim); background:rgba(120,120,140,.14);
}
.store-chip.ok{ color:var(--ok); background:rgba(31,169,113,.12); }
.store-chip.warn{ color:var(--warn); background:rgba(232,161,60,.16); }
.store-chip.self{ color:var(--accent); background:rgba(108,76,241,.12); margin-left:6px; }
.store-empty{ padding:28px 0; text-align:center; font-size:13px; color:var(--ink-dim); }

/* ============ 游戏页组件（§4.7 二期a） ============ */
.gstats{
  display:flex; align-items:center;
  background:var(--card);
  border:1px solid var(--line);
  border-radius:var(--r-md);
  padding:12px 14px;
  margin-bottom:12px;
  box-shadow:var(--sh-1), var(--hl);
}
.gstat-main{ flex:0 0 auto; min-width:0; }
.gstat-main .k{ font-size:10px; color:var(--ink-dim); letter-spacing:.3px; }
.gstat-main .v{
  font-size:26px; font-weight:800; color:var(--ink); margin-top:2px; line-height:1.1;
  font-variant-numeric:tabular-nums;
}
.gstat-main .v.accent{ color:var(--accent); }
.gstat-main .v.combo{ color:var(--combo); }
.gstat-sub{
  flex:1 1 auto; min-width:0; display:flex; flex-wrap:wrap;
  justify-content:flex-end; align-items:baseline; margin-left:14px;
}
.gstat-sub .si{ display:inline-flex; align-items:baseline; font-size:11px; color:var(--ink-dim); margin-left:12px; white-space:nowrap; }
.gstat-sub .si b{ font-weight:700; color:var(--ink); margin-left:4px; font-variant-numeric:tabular-nums; }
.gstat-sub .si b.accent{ color:var(--accent); }
.gstat-sub .si b.combo{ color:var(--combo); }

/* 计算器：判定玩法 */
/* 显示卡是弹性项：宽松屏吃掉剩余高度（内容贴底），小屏允许被压缩（min-height:0） */
.calc-display{
  background:var(--card);
  border:1px solid var(--line);
  border-radius:var(--r-md);
  padding:18px 20px;
  margin-bottom:12px;
  text-align:right;
  min-height:0;
  overflow:hidden;
  box-shadow:var(--sh-1), var(--hl);
  transition:border-color .25s ease;
}
/* 计算器页：固定不滚动（真机计算器观感）。显示卡不参与压缩（表达式/大数不裁切、
 * 按键不跳动），空间不足全部由键盘行高消化。 */
.pbody.calc-body{ overflow:hidden; flex-shrink:0; }
/* 极限兜底：键盘压缩有下限（见 .pfoot.calc-foot 的 min-height），净高真的装不下时
 * （横屏 / 被压扁的容器）整页可纵向滚动 —— 这是「=」键可达的最后一道保险。
 * 正常净高下内容装得下，不出现滚动条（设计口径见 DESIGN.md §4.4）。 */
.view-calc{ overflow-y:auto; -webkit-overflow-scrolling:touch; overscroll-behavior-y:contain; }
/* 净高不足的小屏：指标条与显示卡紧凑化，把高度让给键盘（行高不小于 ~40px） */
@media (max-height:700px){
  .calc-body .gstats{ padding:8px 12px; margin-bottom:8px; }
  .calc-body .calc-display{ padding:12px 18px; }
  .calc-body .calc-shown{ font-size:32px; }
}
/* 极矮净高：固定件（页头 / 指标条 / 显示卡 / 提示行 / 页脚内边距 / 键距）一起收紧，
 * 省下的高度全给键盘。阈值按「容器内净高」取：容器视口比纯浏览器矮约 120px
 * （宿主顶栏 + 金刚键栏），故 660px 视口 ≈ 容器内 540px 净高。 */
@media (max-height:660px){
  .view-calc .phead{ height:42px; }
  .view-calc .phead h1{ font-size:16px; }
  .calc-body .gstats{ padding:4px 10px; margin-bottom:6px; }
  .calc-body .gstat-main .v{ font-size:20px; }
  .calc-body .gstat-sub .si{ font-size:10px; margin-left:8px; }
  .calc-body .calc-display{ padding:8px 14px; margin-bottom:8px; }
  .calc-body .calc-expr{ font-size:11px; line-height:14px; min-height:14px; }
  .calc-body .calc-shown{ font-size:26px; margin-top:4px; }
  .calc-body .calc-feedback{ margin-top:6px; font-size:12px; line-height:16px; min-height:16px; }
  .calc-body .calc-feedback.ask{ font-size:13px; }
  /* 只收纵向内边距：左右仍是 --foot-px-l/-r，判定覆盖层与键盘同宽对齐的约定不变 */
  .pfoot.calc-foot{ padding:6px var(--foot-px-r) 8px var(--foot-px-l); }
  .keypad{ grid-gap:6px; }
  .key{ font-size:18px; }
  .key.eq{ font-size:19px; }
}
.calc-expr{ font-size:13px; line-height:18px; min-height:18px; color:var(--ink-dim); letter-spacing:.3px; }
.calc-shown{
  font-size:40px; font-weight:800; color:var(--ink); margin-top:6px;
  font-variant-numeric:tabular-nums; letter-spacing:-1px;
}
.calc-quiz{ font-size:12px; color:var(--ink-dim); margin-top:8px; }
.judge-row{ display:flex; }
.judge-btn{
  flex:1 1 0; height:52px; border-radius:var(--r-md);
  font-size:17px; font-weight:700; color:#fff;
  box-shadow:var(--sh-1), inset 0 1px 0 rgba(255,255,255,.30);
  transition:transform .16s ease, opacity .16s ease;
}
.judge-btn + .judge-btn{ margin-left:10px; }
.judge-btn:active{ transform:scale(.96); }
.judge-ok{ background:linear-gradient(135deg,#2BB673,#1FA971); }
.judge-no{ background:linear-gradient(135deg,#E86A6A,#E05252); }
/* 计算器页脚：键盘纵向可压缩（小屏唯一让高度的部件）；判定时「对/错」覆盖在键盘原位，
 * 页脚高度全程不变 —— 按 = 前后页面不跳动。
 * 压缩下限 202px = 键盘行高下限 180 + 页脚内边距 22（紧凑档内边距更小，行高反而略高）：
 * 到此为止不再压缩，装不下时由 .view-calc 的整页滚动兜底 —— 绝不能把键盘压成 0 高度
 * 溢出屏外（回归：矮屏 / 横屏下计算器「=」键看不见也点不到）。 */
.pfoot.calc-foot{
  position:relative;
  display:flex; flex-direction:column;
  flex:0 1 auto; min-height:202px;
}
/* 覆盖层左右按页脚内缩量内收，与键盘同宽（绝不贴屏边） */
.calc-judge{ position:absolute; left:var(--foot-px-l); right:var(--foot-px-r); top:50%; transform:translateY(-50%); }

/* 闹钟：守时玩法 */
.alarm-display{
  background:var(--card);
  border:1px solid var(--line);
  border-radius:var(--r-md);
  padding:20px 18px;
  margin-bottom:12px;
  text-align:center;
  box-shadow:var(--sh-1), var(--hl);
}
/* 模拟表盘：当前时间用时钟呈现（复用主屏 .w-analog 的指针语言，放大 + 配色适配白卡） */
.a-clock{
  width:120px; height:120px; border-radius:50%;
  border:2px solid var(--line); position:relative; margin:0 auto 6px auto;
  box-shadow:var(--sh-1), inset 0 0 0 1px rgba(0,0,0,.04);
}
.a-clock i{
  position:absolute; left:50%; bottom:50%;
  transform-origin:50% 100%;
  background:var(--ink); border-radius:2px;
}
.a-clock .a-hh{ width:5px; height:32px; margin-left:-2.5px; }
.a-clock .a-mh{ width:3px; height:44px; margin-left:-1.5px; }
.a-clock:after{
  content:""; position:absolute; left:50%; top:50%;
  width:8px; height:8px; margin-left:-4px; margin-top:-4px;
  border-radius:50%; background:var(--accent);
}
.alarm-now{
  font-size:15px; font-weight:600; color:var(--ink-dim); text-align:center;
  font-variant-numeric:tabular-nums; margin-bottom:4px;
}
.alarm-row{ display:flex; align-items:baseline; justify-content:center; margin-top:10px; }
.alarm-row .k{ font-size:12px; color:var(--ink-dim); margin-right:10px; }
.alarm-row .v{
  font-size:22px; font-weight:700; color:var(--ink);
  font-variant-numeric:tabular-nums;
}
.alarm-cd{
  font-size:40px; font-weight:800; color:var(--accent); margin-top:8px;
  font-variant-numeric:tabular-nums; letter-spacing:-1px; transition:color .2s ease;
}
.alarm-result{ font-size:13px; color:var(--ink-dim); margin-top:8px; min-height:18px; }
.ring-btn{
  display:block; width:100%; height:54px; border-radius:var(--r-md);
  font-size:18px; font-weight:700; color:#fff;
  background:linear-gradient(135deg,#8F7BF7,#6A4CE0);
  box-shadow:var(--sh-1), 0 8px 18px rgba(106,76,224,.32), inset 0 1px 0 rgba(255,255,255,.30);
  transition:transform .16s ease;
}
.ring-btn:active{ transform:scale(.97); }
/* 闹钟「再来一次」：复用响铃按钮的全宽盒子语言，绿色渐变区分语义（积极重试） */
.alarm-retry{
  background:linear-gradient(135deg,#2BB673,#1FA971);
  box-shadow:var(--sh-1), 0 8px 18px rgba(43,182,115,.32), inset 0 1px 0 rgba(255,255,255,.30);
}

/* 日历：扫雷玩法（未开口=抬起的日期块，已开口=凹陷平底，表头=浅底日期条） */
.ms-card{
  background:var(--card);
  border:1px solid var(--line);
  border-radius:var(--r-md);
  padding:10px;
  margin:auto 0; /* 上下 auto：在剩余空间里垂直居中，消除中段空洞（见 fitBoard） */
  box-shadow:var(--sh-1), var(--hl);
}
.ms-week{
  display:grid; grid-template-columns:repeat(7,1fr); grid-gap:6px;
  padding:6px 0;
  margin:0 auto 8px auto; /* 与棋盘同宽居中（见 fitBoard） */
  border-radius:10px;
  background:rgba(120,120,140,.10);
}
.ms-week span{ text-align:center; font-size:11px; font-weight:600; color:var(--ink-dim); }
/* 六/日只做中性加重，不占用语义色（DESIGN §4.5：accent 只给得分，不随意着色） */
.ms-week span:nth-child(6), .ms-week span:nth-child(7){ color:var(--ink); }
.ms-grid{ display:grid; grid-template-columns:repeat(7,1fr); grid-gap:6px; margin:0 auto; }
.ms-cell{
  position:relative; padding-top:100%;
  border-radius:23%; /* 与主屏图标同一套圆角（squircle 观感），随格子大小自适应 */
  background:linear-gradient(180deg,var(--cell-hi) 0%,var(--cell) 100%);
  /* 外发丝环 + 环境影 + 顶部内高光 = 抬起可点；box-shadow 不占布局，格子仍是正方形 */
  box-shadow:0 0 0 1px var(--line), var(--sh-1), var(--hl);
  transition:transform .12s ease, box-shadow .12s ease;
}
.ms-cell:active{ transform:scale(.92); box-shadow:0 0 0 1px var(--line); }
.ms-cell > i{
  position:absolute; top:0; left:0; right:0; bottom:0;
  display:flex; align-items:center; justify-content:center;
  font-style:normal;
  font-size:15px; font-weight:700; color:var(--ink);
  font-variant-numeric:tabular-nums;
}
.ms-cell .dnum{
  position:absolute; top:3px; left:5px;
  font-size:10px; font-weight:500; color:var(--ink-dim);
}
.ms-cell.rev{
  background:var(--cell-rev);
  box-shadow:inset 0 1px 3px rgba(16,16,32,.06);
}
body[data-mode="dark"] .ms-cell.rev{ box-shadow:inset 0 1px 3px rgba(0,0,0,.45); }
.ms-cell.flag > i svg{ width:14px; height:14px; fill:var(--accent); }
.ms-cell.boom{
  background:rgba(224,82,82,.20);
  box-shadow:inset 0 0 0 1px rgba(224,82,82,.55), 0 0 0 1px rgba(224,82,82,.35);
}
.ms-cell.mine > i svg{ width:14px; height:14px; fill:var(--danger); }
.ms-n1{ color:#2E7FE8; } .ms-n2{ color:#1FA971; } .ms-n3{ color:#F08A24; }
.ms-n4{ color:#6A4CE0; } .ms-n5{ color:#E05252; } .ms-n6{ color:#2E9EC4; }
/* AI 通知条：沿用站内通知条形态（卡面 + 发丝描边 + --r-md，同 .sms-banner），不另造一套 */
.ms-banner{
  font-size:13px; line-height:18px; color:var(--ink); text-align:center;
  background:var(--card); border:1px solid var(--line);
  border-radius:var(--r-md);
  padding:8px 12px; margin-bottom:10px;
}
/* 净高不足的小屏：指标条/通知条/星期条/状态条紧凑化，把高度还给棋盘 */
@media (max-height:700px){
  .cal-body .gstats{ padding:8px 12px; margin-bottom:8px; }
  .cal-body .ms-banner{ padding:4px 10px; margin-bottom:8px; }
  .cal-body .ms-week{ padding:3px 0; margin-bottom:6px; }
  .cal-body .ms-meta{ padding:5px 10px; margin-bottom:8px; }
  .cal-body .flag-mini{ height:30px; }
  .ms-foot .diff-btn{ height:42px; } /* 难度按钮在页脚（.pbody 之外），不能用 .cal-body 限定 */
}
/* 难度选择：与键盘（.key）/判定按钮（.judge-btn）同一套控件语言 ——
   等分满宽 + --r-md + 双层投影，选中态复用主 CTA 渐变；不再是散在左边的三个小胶囊 */
.ms-foot{ display:grid; grid-template-columns:repeat(3,1fr); grid-gap:8px; }
.diff-btn{
  height:48px; border-radius:var(--r-md);
  font-size:14px; font-weight:600; color:var(--ink);
  background:var(--card); border:1px solid var(--line);
  box-shadow:var(--sh-1), var(--hl);
  transition:transform .16s ease;
}
.diff-btn:active{ transform:scale(.96); }
.diff-btn.sel{
  color:#fff; border-color:transparent;
  background:linear-gradient(135deg,#8F7BF7,#6A4CE0);
  box-shadow:var(--sh-1), inset 0 1px 0 rgba(255,255,255,.30);
}
.flag-toggle{
  margin-left:auto;
  height:40px; padding:0 14px; border-radius:var(--r-sm);
  font-size:13px; font-weight:600; color:var(--ink);
  background:var(--card); border:1px solid var(--line);
  transition:transform .16s ease;
}
.flag-toggle:active{ transform:scale(.95); }
.flag-toggle.on{
  color:#fff; border-color:transparent;
  background:linear-gradient(135deg,#F5A623,#F08A24);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.30);
}

/* 计算器键盘（v1 还原：用户自己按表达式）
 * 行高上限 64px（宽松屏与 v1 一致），空间不足时随页脚一起被压缩 —— 键盘永远贴底、
 * 整页不产生滚动。按键高度由行高决定（height:auto + 网格拉伸），不再写死 64px。
 * 压缩下限由页脚给出（.calc-foot 的 min-height）：行高最多压到 ≈28px/行，
 * 再矮就整页滚动 —— 网格行被压到 0 时行距仍在，内容会溢出页脚、「=」会被推出屏外。 */
.keypad{
  display:grid; grid-template-columns:repeat(4,1fr); grid-gap:10px;
  grid-auto-rows:minmax(0,64px);
  flex:1 1 auto; min-height:0;
}
.key{
  height:auto; min-height:0; border-radius:var(--r-md);
  font-size:21px; font-weight:600; color:var(--ink);
  background:var(--card); border:1px solid var(--line);
  box-shadow:var(--sh-1), var(--hl);
  transition:transform .12s ease;
}
.key:active{ transform:scale(.93); }
.key.op{ color:#F5854E; font-weight:700; }
.key.clr{ color:var(--danger); }
.key.eq{
  font-size:22px;
  color:#fff; border-color:transparent;
  background:linear-gradient(135deg,#8F7BF7,#6A4CE0);
  box-shadow:var(--sh-1), inset 0 1px 0 rgba(255,255,255,.30);
}
/* 判定阶段：键盘原位保留占位（不可见、不可点），避免页脚塌陷导致整页跳动 */
.keypad.keys-hidden{ visibility:hidden; }
/* 计算器提示：这是「怎么玩 / 现在要做什么」的关键指令，必须一眼看清。
 * 行高恒定（20px）—— 四个状态切换不改变高度，键盘位置不跳动。 */
.calc-feedback{
  margin-top:10px;
  font-size:14px; line-height:20px; min-height:20px;
  text-align:center; color:var(--ink);
}
.calc-feedback.ask{ font-size:15px; font-weight:700; color:var(--accent); }
.calc-feedback.ok{ font-weight:700; color:var(--ok); }
.calc-feedback.no{ font-weight:700; color:var(--danger); }
.hidden-row{ display:none; }

/* 扫雷第二行：用时 / 剩余雷 / 标旗（v1 还原） */
.ms-meta{
  display:flex; align-items:center;
  background:var(--card); border:1px solid var(--line);
  border-radius:var(--r-md); padding:8px 12px; margin-bottom:10px;
  box-shadow:var(--sh-1), var(--hl);
}
.ms-meta .grp{ display:flex; align-items:center; }
.ms-meta .grp + .grp{ margin-left:16px; }
.ms-meta .k{ font-size:12px; color:var(--ink-dim); margin-right:6px; }
.ms-meta .v{ font-size:15px; font-weight:700; color:var(--ink); font-variant-numeric:tabular-nums; }
.flag-mini{
  margin-left:auto; height:34px; padding:0 12px; border-radius:var(--r-sm);
  font-size:12px; font-weight:600; color:var(--ink);
  background:rgba(120,120,140,.14); border:1px solid var(--line);
  transition:transform .16s ease;
}
.flag-mini:active{ transform:scale(.95); }
.flag-mini.on{
  color:#fff; border-color:transparent;
  background:linear-gradient(135deg,#F5A623,#F08A24);
}

/* 闹钟响铃按钮状态（v1 还原：只在响铃窗口内可按） */
.ring-btn:disabled{ opacity:.4; box-shadow:var(--sh-1); }
.ring-btn.ringing{ animation:ringpulse .5s ease-in-out infinite alternate; }
@keyframes ringpulse{
  from{ box-shadow:var(--sh-1), 0 8px 18px rgba(106,76,224,.32), inset 0 1px 0 rgba(255,255,255,.30); }
  to{ box-shadow:var(--sh-1), 0 8px 28px rgba(224,82,82,.55), inset 0 1px 0 rgba(255,255,255,.30); }
}

/* ============ 二期b 组件：聊天/选项/日程/拨号/短信/相机/统计（v1 还原） ============ */
/* overflow-wrap：用户可能发出长串不可断行内容（URL / 连续英文数字），
 * 默认只在空格断行会把气泡撑破、文字溢出卡面，这里允许必要时断词。 */
.bub{ max-width:80%; padding:10px 12px; border-radius:14px; font-size:14px; line-height:1.45; margin-bottom:10px; overflow-wrap:break-word; }
.bub.ai{ background:var(--card); border:1px solid var(--line); border-top-left-radius:4px; color:var(--ink); }
.bub.me{ background:linear-gradient(135deg,#8F7BF7,#6A4CE0); color:#fff; margin-left:auto; border-top-right-radius:4px; }
.typing i{ display:inline-block; width:5px; height:5px; border-radius:50%; background:var(--ink-dim); margin-right:4px; animation:blink 1s ease-in-out infinite alternate; }
.typing i:nth-child(2){ animation-delay:.2s; } .typing i:nth-child(3){ animation-delay:.4s; }
@keyframes blink{ from{opacity:.25} to{opacity:.9} }
.opt-grid{ display:grid; grid-template-columns:1fr 1fr; grid-gap:10px; }
.opt{
  min-height:46px; border-radius:var(--r-sm); padding:4px 8px;
  background:var(--card); border:1px solid var(--line);
  font-size:14px; color:var(--ink); box-shadow:var(--sh-1);
  transition:transform .12s ease;
}
.opt:active{ transform:scale(.96); }
/* 日程（v1 还原）：难度选择/选项/结算动作全部下移页脚（同日历/助手/闹钟，统一页脚操作区语言），记忆列表上卡面 */
/* 记忆列表：原来是一排浮在页面上的裸文字，按站内做法收进卡面 */
.sched-list{
  background:var(--card); border:1px solid var(--line);
  border-radius:var(--r-md); padding:0 14px;
  box-shadow:var(--sh-1), var(--hl);
}
.sitem{
  display:flex; align-items:center; padding:13px 0;
  border-bottom:1px solid var(--line); font-size:15px; color:var(--ink);
}
.sitem:last-child{ border-bottom:none; }
.sitem .t{ /* 时间胶囊（accent 语义 = 时间/重点，同 .chip 形态） */
  flex:0 0 auto; margin-right:12px; padding:3px 8px;
  font-size:13px; font-weight:700; color:var(--accent);
  background:rgba(108,76,241,.10); border-radius:8px;
  font-variant-numeric:tabular-nums;
}
.sitem .e{ flex:1 1 auto; min-width:0; }
/* 阶段标题：800 字重是英雄数字专用（§4.6），标题取 700/19px */
.recall-q{ text-align:center; font-size:19px; font-weight:700; margin:0 0 12px 0; color:var(--ink); }
.recall-sub{ text-align:center; font-size:12px; color:var(--ink-dim); margin-bottom:10px; }
.recall-cd{ /* 记忆倒计时：accent 描边胶囊（同 .chip） */
  align-self:center; margin:0 auto 12px auto; padding:5px 13px;
  border:1px solid var(--accent); border-radius:999px;
  font-size:13px; font-weight:600; color:var(--accent);
}
/* 阶段容器：内容在剩余空间里垂直居中（auto 外边距；溢出时自动归零，交内容区滚动），消除中段空洞 */
.sched-stage{ display:flex; flex-direction:column; flex:1 1 auto; min-height:0; }
.sched-block{ display:flex; flex-direction:column; margin:auto 0; }
/* 结算动作：等分满宽两枚（主 CTA 渐变 + 次级卡面），与键盘/判定按钮同一套控件语言 */
.act-grid{ display:grid; grid-template-columns:1fr 1fr; grid-gap:10px; }
.act-btn{
  width:100%; height:52px; border-radius:var(--r-md);
  font-size:16px; font-weight:700; transition:transform .16s ease;
}
.act-btn:active{ transform:scale(.97); }
.act-btn.primary{
  color:#fff; border:1px solid transparent;
  background:linear-gradient(135deg,#8F7BF7,#6A4CE0);
  box-shadow:var(--sh-1), inset 0 1px 0 rgba(255,255,255,.30);
}
.act-btn.ghost{
  color:var(--ink); background:var(--card); border:1px solid var(--line);
  box-shadow:var(--sh-1), var(--hl);
}
.act-btn.danger{
  color:#fff; border:1px solid transparent;
  background:linear-gradient(135deg,#E86A6A,#E05252);
  box-shadow:var(--sh-1), inset 0 1px 0 rgba(255,255,255,.30);
}
/* 净高不足的小屏：难度卡/标题/倒计时/列表行紧凑化，让记忆列表尽量一屏看全 */
@media (max-height:700px){
  .recall-q{ font-size:17px; margin-bottom:8px; }
  .recall-cd{ margin-bottom:8px; padding:3px 11px; font-size:12px; }
  .sched-list{ padding:0 12px; }
  .sitem{ padding:6px 0; font-size:14px; }
  .act-btn{ height:46px; }
}
.dial-display{ text-align:center; font-size:30px; font-weight:600; min-height:40px; letter-spacing:2px; color:var(--ink); margin:10px 0 2px 0; font-variant-numeric:tabular-nums; }
.dial-status{ text-align:center; font-size:13px; color:var(--ink-dim); min-height:18px; }
.call-timer{ text-align:center; font-size:36px; font-weight:800; color:var(--ok); font-variant-numeric:tabular-nums; margin-top:10px; }
.call-ended-msg{ font-size:13px; color:var(--ink-dim); text-align:center; line-height:1.6; margin-top:12px; }
/* 空文案不占位（否则 idle 与通话态都白留 12px 外边距，居中会被顶偏） */
.call-ended-msg:empty{ display:none; }
.dial-pad{ display:grid; grid-template-columns:repeat(3,1fr); grid-gap:4px; justify-items:center; }
.dkey{
  width:48px; height:48px; border-radius:50%;
  background:var(--card); border:1px solid var(--line);
  font-size:19px; font-weight:600; color:var(--ink);
  box-shadow:var(--sh-1), var(--hl);
  transition:transform .12s ease;
  display:flex; flex-direction:column; align-items:center; justify-content:center; line-height:1;
}
.dkey .dkey-sub{ font-size:7px; font-weight:500; color:var(--ink-dim); letter-spacing:1px; margin-top:1px; }
.dkey:active{ transform:scale(.92); }
/* 操作行：三等分格，通讯录左 / 拨打居中 / 删除右 */
.dial-actions{ display:grid; grid-template-columns:1fr 1fr 1fr; align-items:center; justify-items:center; margin-top:6px; }
.dial-del{
  width:40px; height:40px; border-radius:50%;
  display:flex; align-items:center; justify-content:center;
  font-size:18px; color:var(--ink); background:rgba(120,120,140,.16);
  transition:transform .12s ease;
}
.dial-del:active{ transform:scale(.92); }
.call-btn{
  width:50px; height:50px; border-radius:50%;
  display:flex; align-items:center; justify-content:center;
  background:linear-gradient(135deg,#34C46F,#1E9E50);
  box-shadow:var(--sh-1), 0 4px 12px rgba(30,158,80,.28), inset 0 1px 0 rgba(255,255,255,.3);
  transition:transform .12s ease;
}
.call-btn:active{ transform:scale(.94); }
.call-btn svg{ width:22px; height:22px; fill:#fff; }
.call-btn.hangup{ background:linear-gradient(135deg,#E86A6A,#E05252); box-shadow:var(--sh-1), 0 4px 12px rgba(224,82,82,.28); }
/* 挂断用 Material call_end（宽扁 ∩ 形），同 viewBox 下比绿色听筒「显小」，
 * 单独放大一档，让两枚圆钮的图元视觉重量持平。 */
.call-btn.hangup svg{ width:24px; height:24px; }
.dial-del svg{ width:18px; height:18px; fill:var(--ink); }
.hist-row{ display:flex; align-items:center; width:100%; padding:10px 2px; border-bottom:1px solid var(--line); font-size:13px; color:var(--ink); text-align:left; }
.hist-row:last-child{ border-bottom:none; }
.hist-row .hist-ico{ flex:0 0 auto; width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:rgba(120,120,140,.14); margin-right:10px; }
.hist-row .hist-ico svg{ width:15px; height:15px; fill:var(--ink-dim); }
.hist-row .ht{ margin-left:auto; font-size:11px; color:var(--ink-dim); }
/* 电话页版式：内容区整页不滚（overflow:hidden），高度全部交给「最近通话」列表，
 * 全程只有这一条滚动条 —— 杜绝 .pbody 与内层列表嵌套产生的多重滚动条。 */
.pbody.phone-body{ overflow:hidden; display:flex; flex-direction:column; }
.phone-top{ flex:0 0 auto; display:flex; flex-direction:column; }
.hist-card{ flex:1 1 auto; min-height:0; display:flex; flex-direction:column; overflow:hidden; }
.hist-scroll{ flex:1 1 auto; min-height:0; overflow-y:auto; -webkit-overflow-scrolling:touch; overscroll-behavior-y:contain; }
/* 通话中（拨打 / 接通 / 已结束）：隐藏拨号键盘与通话记录，
 * 号码·状态·计时在内容区剩余空间里垂直居中（真机通话页观感）。
 * 两侧按钮用 visibility（而非 display）隐藏，保住三列网格，
 * 挂断键继续落在中列、与 idle 态同一位置，不左右跳。 */
.phone-view.in-call .phone-top{ flex:1 1 auto; min-height:0; justify-content:center; }
.phone-view.in-call .hist-card{ display:none; }
.phone-view.in-call .dial-pad{ display:none; }
.phone-view.in-call .dial-del{ visibility:hidden; }
/* 通话结束（ended）：拨号行整行换成满宽「完成」主 CTA */
.phone-done{ display:none; }
.phone-view.is-ended .phone-done{ display:block; }
.phone-view.is-ended .dial-actions{ display:none; }
/* 通讯录全屏视图 */
.contacts-view{ position:absolute; top:0; left:0; right:0; bottom:0; z-index:30; background:var(--app-bg); display:flex; flex-direction:column; }
.contacts-head{ flex:0 0 auto; height:54px; display:flex; align-items:center; padding-left:calc(10px + var(--safe-l)); padding-right:calc(16px + var(--safe-r)); }
.contacts-back{ width:34px; height:34px; display:flex; align-items:center; justify-content:center; font-size:22px; color:var(--ink); margin-right:10px; }
.contacts-head h1{ font-size:18px; font-weight:600; color:var(--ink); }
.contacts-list{ overflow-y:auto; flex:1 1 auto; min-height:0; padding:4px calc(16px + var(--safe-r)) 16px calc(16px + var(--safe-l)); }
.contact-row{ display:flex; align-items:center; width:100%; padding:12px 4px; border-bottom:1px solid var(--line); text-align:left; }
.contact-row:last-child{ border-bottom:none; }
.contact-row:active{ background:rgba(120,120,140,.08); }
.contact-ava{ flex:0 0 auto; width:40px; height:40px; border-radius:50%; background:linear-gradient(135deg,#8F7BF7,#6A4CE0); color:#fff; display:flex; align-items:center; justify-content:center; font-size:16px; font-weight:700; margin-right:12px; }
.contact-name{ font-size:15px; font-weight:600; color:var(--ink); }
.contact-num{ font-size:12px; color:var(--ink-dim); margin-top:2px; }
.sms-banner{
  font-size:12px; color:var(--ink-dim); text-align:center;
  background:var(--card); border:1px solid var(--line);
  border-radius:var(--r-md); padding:9px; margin-bottom:10px;
}
.conv-row{ display:flex; align-items:center; width:100%; padding:12px 4px; border-bottom:1px solid var(--line); text-align:left; }
.conv-row:last-child{ border-bottom:none; }
.conv-ava{
  flex:0 0 auto; width:38px; height:38px; border-radius:50%;
  background:linear-gradient(135deg,#9D4EDD,#FF6B35);
  color:#fff; display:flex; align-items:center; justify-content:center;
  font-size:15px; font-weight:700; margin-right:10px;
}
.conv-mid{ flex:1 1 auto; min-width:0; }
/* 会话行「名称 + 摘要」必须各自成块：两者若留在行内（inline），
 * ①text-overflow:ellipsis / overflow:hidden 对行内盒无效 → 摘要不截断，长短信直接横向冲出屏幕；
 * ②两段行内文字排在同一条行盒里 → 摘要紧跟名字、换行后压到右侧时间戳上。
 * 故显式 display:block 并各自补隐藏+省略号，摘要恒定单行截断。 */
.conv-name{ display:block; font-size:14px; font-weight:600; color:var(--ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.conv-prev{ display:block; font-size:12px; color:var(--ink-dim); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.conv-time{ flex:0 0 auto; font-size:11px; color:var(--ink-dim); margin-left:8px; }
.conv-unread{ flex:0 0 auto; width:8px; height:8px; border-radius:50%; background:var(--accent); margin-left:6px; }
.sms-input-row{ display:flex; align-items:center; }
.sms-input{
  flex:1 1 auto; min-width:0; height:46px; border-radius:var(--r-md);
  border:1px solid var(--line); background:var(--card);
  padding:0 12px; font-size:14px; color:var(--ink); outline:none;
}
.sms-send{
  flex:0 0 auto; margin-left:8px; height:46px; padding:0 16px;
  border-radius:var(--r-md); color:#fff; font-size:14px; font-weight:700;
  background:linear-gradient(135deg,#8F7BF7,#6A4CE0);
  box-shadow:var(--sh-1), inset 0 1px 0 rgba(255,255,255,.3);
}
.cam-view{ position:relative; flex:1 1 auto; min-height:0; border-radius:var(--r-lg); overflow:hidden; box-shadow:var(--sh-2); background:#141419; }
/* 取景画面：素材图铺满卡片（cover 裁切，不拉伸变形） */
.cam-shot{ position:absolute; top:0; left:0; right:0; bottom:0; width:100%; height:100%; object-fit:cover; }
.cam-hud{
  position:absolute; left:10px; bottom:10px;
  background:rgba(0,0,0,.35); color:#fff; font-size:11px;
  padding:4px 8px; border-radius:8px; font-variant-numeric:tabular-nums;
  transition:background .2s ease;
}
.cam-hud.hot{ background:rgba(224,82,82,.72); }
.cam-badge{ position:absolute; right:10px; bottom:10px; background:rgba(0,0,0,.35); color:#fff; font-size:11px; padding:4px 8px; border-radius:8px; }
.cam-flash{ position:absolute; top:0; left:0; right:0; bottom:0; background:#fff; opacity:0; pointer-events:none; transition:opacity .15s ease; }
.cam-flash.on{ opacity:.9; }
.cam-side{
  width:46px; height:46px; border-radius:50%;
  display:flex; align-items:center; justify-content:center;
  font-size:18px; color:var(--ink); background:rgba(120,120,140,.16);
  transition:transform .12s ease, opacity .12s ease;
}
.cam-side:active{ transform:scale(.92); }
.cam-shutter{
  width:66px; height:66px; border-radius:50%;
  background:#fff; border:4px solid rgba(255,255,255,.55);
  box-shadow:var(--sh-2), inset 0 0 0 2px rgba(20,20,40,.08), inset 0 2px 4px rgba(255,255,255,.7);
  transition:transform .12s ease, background .2s ease, border-color .2s ease;
}
.cam-shutter:active{ transform:scale(.9); }
/* 过热封锁：快门转灰（提示「按不动」是机制不是卡死） */
.cam-shutter.blocked{ background:rgba(255,255,255,.40); border-color:rgba(255,255,255,.25); }
.cam-foot{ display:grid; grid-template-columns:1fr auto 1fr; align-items:center; }
.radar-wrap{ text-align:center; }
.score-big{ text-align:center; font-size:40px; font-weight:800; color:var(--accent); font-variant-numeric:tabular-nums; line-height:1.1; margin-bottom:4px; }
.score-cap{ text-align:center; font-size:12px; color:var(--ink-dim); margin-bottom:8px; }
.st-cards{ display:grid; grid-template-columns:1fr 1fr; grid-gap:10px; margin-bottom:12px; }
.st-card{ background:var(--card); border:1px solid var(--line); border-radius:var(--r-md); padding:12px; box-shadow:var(--sh-1), var(--hl); }
.st-card .k{ font-size:11px; color:var(--ink-dim); }
.st-card .v{ font-size:22px; font-weight:800; color:var(--ink); margin-top:4px; font-variant-numeric:tabular-nums; }
.rec-row{ display:flex; align-items:center; padding:10px 2px; border-bottom:1px solid var(--line); }
.rec-row:last-child{ border-bottom:none; }
.rec-mini{ flex:0 0 auto; width:30px; height:30px; border-radius:24%; display:flex; align-items:center; justify-content:center; margin-right:10px; box-shadow:var(--sh-1); }
.rec-mini svg{ width:16px; height:16px; fill:#fff; }
.rec-name{ flex:1 1 auto; min-width:0; font-size:14px; font-weight:600; color:var(--ink); }
.rec-val{ font-size:12px; color:var(--ink-dim); margin-right:8px; }
.rec-reset{ font-size:12px; font-weight:600; color:var(--danger); background:rgba(224,82,82,.10); border:none; border-radius:var(--r-sm); padding:5px 10px; transition:transform .12s ease; }
.rec-reset:active{ transform:scale(.94); }
.modal-mask{ position:absolute; top:0; left:0; right:0; bottom:0; z-index:40; background:rgba(10,10,16,.5); display:flex; align-items:center; justify-content:center; }
.modal{ width:280px; background:var(--card); border:1px solid var(--line); border-radius:var(--r-lg); padding:18px; text-align:center; box-shadow:var(--sh-2); }
.modal h3{ font-size:16px; color:var(--ink); }
.modal p{ font-size:13px; color:var(--ink-dim); margin-top:6px; }
.modal-row{ display:flex; margin-top:14px; }
.modal-btn{ flex:1 1 0; height:40px; border-radius:var(--r-sm); font-size:14px; font-weight:600; }
.modal-btn + .modal-btn{ margin-left:10px; }
.modal-cancel{ background:rgba(120,120,140,.14); color:var(--ink); }
.modal-ok{ background:linear-gradient(135deg,#E86A6A,#E05252); color:#fff; }

/* ============ 月球天气（§4.9） ============
 * 入口是主屏天气小组件（§4.3.1），不占主屏图标网格与 Dock；整页只有天气。
 * 月球用 Canvas 2D 逐像素渲染球面（见 buildWeather），不引入 WebGL / Three.js ——
 * 两者都会撞上 §5 兼容门禁（禁用能力零命中、无外部资源）。 */
.wx-stage{
  position:relative;
  height:236px;
  border-radius:var(--r-lg);
  overflow:hidden;
  margin-bottom:12px;
  background:
    radial-gradient(120% 92% at 50% 118%, rgba(108,76,241,.30), rgba(108,76,241,0) 62%),
    radial-gradient(circle at 20% 14%, rgba(88,128,208,.22), transparent 46%),
    linear-gradient(180deg,#0B0F1E 0%,#131A2E 62%,#1B2237 100%);
  border:1px solid rgba(255,255,255,.10);
  box-shadow:var(--sh-2), inset 0 1px 0 rgba(255,255,255,.10);
  touch-action:none; /* 拖动旋转不与内容区滚动抢手势 */
}
.wx-stage canvas{ position:absolute; top:0; left:0; display:block; }
/* 无 WebGL / 上下文丢失时的降级提示：观测台不留白，读数照常 */
.wx-fallback{
  position:absolute; top:0; left:0; right:0; bottom:0;
  display:flex; align-items:center; justify-content:center;
  padding:0 26px; text-align:center;
  font-size:12px; line-height:1.6; color:rgba(255,255,255,.72);
}
.wx-hud{
  position:absolute; top:11px; left:13px; right:13px;
  display:flex; align-items:flex-start; justify-content:space-between;
  pointer-events:none;
}
.wx-loc{ font-size:11px; color:rgba(255,255,255,.62); letter-spacing:.4px; }
.wx-loc-name{ font-size:15px; font-weight:600; color:#fff; margin-top:3px; letter-spacing:.3px; }
.wx-chip{
  flex:0 0 auto; padding:4px 10px; border-radius:999px;
  background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.18);
  font-size:11px; color:#EAF1FB; font-variant-numeric:tabular-nums;
}
.wx-tip{
  position:absolute; left:0; right:0; bottom:9px; text-align:center;
  font-size:11px; color:rgba(255,255,255,.62); pointer-events:none;
  /* 满月时盘面很亮，提示行压在月面上必须靠投影才读得清 */
  text-shadow:0 1px 3px rgba(0,0,0,.65);
}
/* 天气读数：主卡（大温度 + glyph chip）+ 两列数据格 */
.wx-hero{
  display:flex; align-items:center;
  background:var(--card); border:1px solid var(--line);
  border-radius:var(--r-md); padding:14px 16px; margin-bottom:12px;
  box-shadow:var(--sh-1), var(--hl);
}
.wx-hero .h-main{ flex:1 1 auto; min-width:0; }
.wx-hero .h-temp{
  font-size:38px; font-weight:800; line-height:1; color:var(--ink);
  letter-spacing:-1px; font-variant-numeric:tabular-nums;
}
.wx-hero .h-cond{ font-size:13px; color:var(--ink-dim); margin-top:8px; }
.wx-glyph{
  flex:0 0 auto; width:52px; height:52px; border-radius:50%; margin-left:12px;
  background:rgba(70,127,232,.14);
  display:flex; align-items:center; justify-content:center;
}
.wx-glyph svg{ width:26px; height:26px; fill:#2E7FE8; }
.wx-grid{ display:grid; grid-template-columns:1fr 1fr; grid-gap:10px; }
.wx-item{
  background:var(--card); border:1px solid var(--line);
  border-radius:var(--r-md); padding:10px 12px;
  box-shadow:var(--sh-1), var(--hl);
}
.wx-item .k{ font-size:11px; color:var(--ink-dim); }
.wx-item .v{ font-size:15px; font-weight:700; color:var(--ink); margin-top:4px; font-variant-numeric:tabular-nums; }
.wx-src{ font-size:11px; color:var(--ink-dim); opacity:.85; text-align:center; margin:14px 0 2px 0; }

/* 净高不足的小屏：观测台降高，保证读数一屏看全 */
@media (max-height:700px){
  .wx-stage{ height:194px; }
  .wx-hero .h-temp{ font-size:32px; }
}

/* ============ 多任务轮播（§3） ============ */
/* 遮罩只铺内容区（不含状态栏与底部金刚键）：金刚键在多任务下必须仍可按（DESIGN §3） */
.recents{
  position:absolute; top:0; left:0; right:0; bottom:0;
  z-index:30;
  background:rgba(10,10,16,.55);
  display:flex; flex-direction:column; justify-content:center; align-items:stretch;
  -webkit-backdrop-filter:blur(18px); backdrop-filter:blur(18px);
}
.recents.hidden{ display:none; }
.recents-track{
  display:flex; align-items:center;
  overflow-x:auto;
  padding:0 calc(24px + var(--safe-l));
  -webkit-overflow-scrolling:touch;
}
.rc-card{
  flex:0 0 auto; width:190px; height:290px;
  margin-right:16px;
  border-radius:18px; background:var(--card);
  border:1px solid var(--line);
  display:flex; flex-direction:column;
  overflow:hidden;
  box-shadow:0 16px 36px rgba(0,0,0,.34), 0 2px 6px rgba(0,0,0,.18);
}
.rc-head{ display:flex; align-items:center; padding:10px 10px 8px 10px; }
.rc-head .app-icon{ width:30px; height:30px; border-radius:24%; box-shadow:none; }
.rc-head .app-icon svg{ width:17px; height:17px; }
.rc-name{ flex:1 1 auto; min-width:0; margin-left:8px; font-size:13px; font-weight:600; color:var(--ink); }
.rc-close{ width:26px; height:26px; display:flex; align-items:center; justify-content:center; color:var(--ink-dim); }
.rc-close svg{ width:14px; height:14px; fill:currentColor; }
/* 卡片缩略：应用主题色标题条 + 骨架内容（不截图，成本低但不再是一块空色） */
.rc-body{
  flex:1 1 auto; min-height:0; margin:0 10px 10px 10px; border-radius:12px;
  background:var(--card); border:1px solid var(--line);
  overflow:hidden; display:flex; flex-direction:column;
}
.rc-bar{ flex:0 0 auto; height:34px; }
.rc-mini{ flex:1 1 auto; min-height:0; padding:12px 12px 4px 12px; }
.rc-sk{ display:block; height:9px; border-radius:5px; background:rgba(120,120,140,.20); margin-bottom:9px; }
.rc-sk.blk{ height:56px; border-radius:10px; }
.rc-sk.w90{ width:90%; }
.rc-sk.w70{ width:70%; }
.rc-sk.w50{ width:50%; }
.rc-empty{ flex:1 1 auto; display:flex; align-items:center; justify-content:center; color:#fff; font-size:14px; opacity:.85; }
/* 一键清理工具栏：卡片轨道下方居中；pointer-events:none 让空白处点击穿透到遮罩 */
.rc-toolbar{
  flex:0 0 auto;
  display:flex; justify-content:center;
  margin-top:20px;
  pointer-events:none;
}
.rc-clear{
  pointer-events:auto;
  height:38px; padding:0 18px;
  border-radius:19px;
  background:#5A5A6E;
  color:#fff; font-size:13px; font-weight:600; letter-spacing:.2px;
  display:inline-flex; align-items:center; /* flex 间距用 margin（Chrome 61 基线，不用 gap） */
  box-shadow:0 4px 12px rgba(0,0,0,.30), 0 1px 2px rgba(0,0,0,.20);
}
.rc-clear svg{ width:14px; height:14px; margin-right:6px; fill:none; stroke:currentColor; }

/* ============ 底部三大金刚键（§3） ============ */
.sysnav{
  flex:0 0 auto;
  display:flex; justify-content:space-around; align-items:center;
  /* 基线 52px（普通值在前）；安全区必须加在 52px **之外**，不能靠 padding 吃掉固定高度。
   * box-sizing:border-box 下 height:52px + padding-bottom:safe 会把内容盒压成 52-safe，
   * 48px 的键居中后向上溢出 —— 容器/真机一注入底部安全区，金刚键就"被挤到栏顶、
   * 上方没有任何空间"（纯浏览器 --safe-bottom=0 时看不出来）。 */
  height:52px;
  padding-bottom:var(--safe-bottom);
  height:calc(52px + var(--safe-bottom));
  background:var(--nav);
  border-top:1px solid var(--line);
  box-shadow:var(--hl);
}
@supports ((-webkit-backdrop-filter:blur(14px)) or (backdrop-filter:blur(14px))){
  .sysnav{ background:var(--nav-glass); -webkit-backdrop-filter:blur(14px); backdrop-filter:blur(14px); }
}
.syskey{
  width:72px; height:48px;
  display:flex; align-items:center; justify-content:center;
  color:var(--ink); transition:transform .12s ease, opacity .12s ease;
}
.syskey:active{ opacity:.55; transform:scale(.9); }
.syskey svg{ width:20px; height:20px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }

/* ============ 开机启动屏（§4.10） ============
 * 打开应用时全屏覆盖，约 1.8s 开机动画后淡出进入主屏；不可跳过。
 * JS 就绪前默认显示（HTML 默认无 .done），避免白屏。 */
#bootScreen{
  position:fixed; top:0; left:0; right:0; bottom:0; z-index:9999;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  background:
    var(--grain),
    radial-gradient(circle at 18% 12%, rgba(108,76,241,.30), transparent 46%),
    radial-gradient(circle at 84% 18%, rgba(64,150,255,.22), transparent 48%),
    radial-gradient(circle at 70% 92%, rgba(180,140,255,.16), transparent 52%),
    linear-gradient(180deg,#1A1C30 0%,#0D0E17 100%);
  color:#F2F1F7;
  opacity:1; transition:opacity .42s ease;
}
#bootScreen.done{ opacity:0; }
.boot-logo{
  width:88px; height:88px; border-radius:24%;
  object-fit:cover;
  box-shadow:0 12px 32px rgba(108,76,241,.45);
}
.boot-title{ margin-top:22px; font-size:20px; font-weight:600; letter-spacing:.5px; color:#fff; }
.boot-bar{
  margin-top:30px; width:180px; height:4px; border-radius:2px;
  background:rgba(255,255,255,.16); overflow:hidden;
}
.boot-bar-fill{ height:100%; width:0%; border-radius:2px; background:linear-gradient(90deg,#6C4CF1,#8E7BFF); }
.boot-tip{ margin-top:14px; font-size:12px; color:rgba(242,241,247,.72); letter-spacing:.3px; min-height:16px; }
.boot-foot{ position:absolute; bottom:calc(28px + var(--safe-bottom)); left:0; right:0; text-align:center; font-size:11px; color:rgba(242,241,247,.5); letter-spacing:.3px; }
"""

# ---------------------------------------------------------------------------
# HTML 头尾
# ---------------------------------------------------------------------------
HTML_HEAD = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<title>人工智能OS</title>
<style>
"""

HTML_TAIL = r"""</style>
</head>
<body data-mode="light" data-wall="light-mesh">

  <!-- 开机启动屏：约 1.8s 开机动画，不可跳过；JS 就绪前默认显示，避免白屏 -->
  <div id="bootScreen">
    <img class="boot-logo" src="./assets/avatar.png" alt="人工智能Ding🥕">
    <div class="boot-title">人工智能OS</div>
    <div class="boot-bar"><div class="boot-bar-fill" id="bootFill"></div></div>
    <div class="boot-tip" id="bootTip">正在启动...</div>
    <div class="boot-foot">Designed by 人工智能Ding🥕</div>
  </div>

  <!-- 状态栏：真机布局，时间居左、状态图标居右；纯展示无交互，
       左右内容收在净空内（padding 含 --safe-l/--safe-r） -->
  <header class="statusbar">
    <div class="sb-left">
      <span class="sb-time" id="sbTime">--:--</span>
    </div>
    <div class="sb-right">
      <span class="sb-signal"><i></i><i></i><i></i><i></i></span>
      <span class="sb-wifi"><svg viewBox="0 0 24 24"><path d="M12 21l4.2-5.2a6.6 6.6 0 0 0-8.4 0L12 21zm-6.4-7.9l1.9 2.3a9.4 9.4 0 0 1 9 0l1.9-2.3a12.4 12.4 0 0 0-12.8 0zM2 9.7l1.9 2.3a15.2 15.2 0 0 1 16.2 0L22 9.7a18.2 18.2 0 0 0-20 0z"/></svg></span>
      <span class="sb-batt">
        <span class="sb-batt-shell"><span class="sb-batt-fill"></span></span>
        <span class="sb-batt-txt">87%</span>
      </span>
    </div>
  </header>

  <!-- 视图容器：主屏 / 各应用 / 多任务 -->
  <div id="viewRoot"></div>

  <!-- 底部三大金刚键：返回 / 主页 / 多任务 -->
  <nav class="sysnav">
    <button class="syskey" id="keyBack" data-sfx="back" aria-label="返回"><svg viewBox="0 0 24 24"><path d="M16 5 L8 12 L16 19"/></svg></button>
    <button class="syskey" id="keyHome" data-sfx="nav" aria-label="主页"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/></svg></button>
    <button class="syskey" id="keyRecents" data-sfx="nav" aria-label="多任务"><svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg></button>
  </nav>

<!-- Three.js 走本地 ./assets/three.min.js（与 vibeknow/earth-3d 同一套引入方式，零 CDN） -->
<script src="./assets/three.min.js"></script>
<script src="./main.js"></script>
</body>
</html>
"""

# ---------------------------------------------------------------------------
# JS（ES2017 / Chrome 61 基线；不使用 ?./??/object spread/flat 等超基线语法）
# ---------------------------------------------------------------------------
JS = r"""
/*! ai-os v2 —— 外壳 / 导航 / 设置（DESIGN.md §3 §4） */
(function (global) {
  'use strict';

  /* ---------- 图标 glyph（内联 SVG，不引图标字体） ---------- */
  var GLYPH = {
    calc: '<svg viewBox="0 0 24 24"><path d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 3v3h10V5H7zm2 6v2h2v-2H9zm4 0v2h2v-2h-2zm-4 4v2h2v-2H9zm4 0v2h2v-2h-2zm-4 4v2h2v-2H9zm4 0v2h2v-2h-2z"/></svg>',
    bot: '<svg viewBox="0 0 24 24"><path d="M12 2a2 2 0 0 1 2 2v1h3a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h3V4a2 2 0 0 1 2-2zM9 11a1.6 1.6 0 1 0 0 3.2A1.6 1.6 0 0 0 9 11zm6 0a1.6 1.6 0 1 0 0 3.2A1.6 1.6 0 0 0 15 11z"/></svg>',
    cal: '<svg viewBox="0 0 24 24"><path d="M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7zM5 10h14v10H5V10zm2 2v2h2v-2H7zm4 0v2h2v-2h-2zm4 0v2h2v-2h-2z"/></svg>',
    list: '<svg viewBox="0 0 24 24"><path d="M4 4h16v3H4V4zm0 6h16v3H4v-3zm0 6h10v3H4v-3zm12 1.5l1.8 1.8 3.2-3.2 1.4 1.4-4.6 4.6-3.2-3.2 1.4-1.4z"/></svg>',
    alarm: '<svg viewBox="0 0 24 24"><path d="M12 4a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm1 4v5.1l3.5 2.1-1 1.7-4.5-2.7V8h2zM4.6 1.9l3.2 2.8-1.3 1.5-3.2-2.8 1.3-1.5zm14.8 0l1.3 1.5-3.2 2.8-1.3-1.5 3.2-2.8z"/></svg>',
    chart: '<svg viewBox="0 0 24 24"><path d="M4 20h16v2H4v-2zm2-8h3v7H6v-7zm5-6h3v13h-3V6zm5 4h3v9h-3v-9z"/></svg>',
    phone: '<svg viewBox="0 0 24 24"><path d="M6.6 10.8c1.5 2.9 3.8 5.2 6.7 6.7l2.2-2.2c.3-.3.7-.4 1-.2 1.2.4 2.4.6 3.7.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.7.1.3 0 .7-.2 1l-2.3 2.1z"/></svg>',
    sms: '<svg viewBox="0 0 24 24"><path d="M4 3h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H9l-5 4V5a2 2 0 0 1 2-2zm3 5h10v2H7V8zm0 4h7v2H7v-2z"/></svg>',
    camera: '<svg viewBox="0 0 24 24"><path d="M9 3L7.5 5H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2.5L15 3H9zm3 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>',
    moon: '<svg viewBox="0 0 24 24"><path d="M20.6 14.6A9 9 0 1 1 9.4 3.4a7.2 7.2 0 0 0 11.2 11.2z"/></svg>',
    /* 购物袋：袋身（圆角矩形）+ 提手（弧线）—— 手绘简单几何，不写复杂单 path */
    bag: '<svg viewBox="0 0 24 24"><path d="M5.4 7.6h13.2a1.6 1.6 0 0 1 1.6 1.7l-.9 10a2 2 0 0 1-2 1.8H6.7a2 2 0 0 1-2-1.8l-.9-10a1.6 1.6 0 0 1 1.6-1.7z"/><path d="M8.8 7.6V6.1a3.2 3.2 0 0 1 6.4 0v1.5" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><g fill="#fff"><rect x="10.5" y="1.5" width="3" height="4.6" rx="1.3"/><rect x="10.5" y="1.5" width="3" height="4.6" rx="1.3" transform="rotate(45 12 12)"/><rect x="10.5" y="1.5" width="3" height="4.6" rx="1.3" transform="rotate(90 12 12)"/><rect x="10.5" y="1.5" width="3" height="4.6" rx="1.3" transform="rotate(135 12 12)"/><rect x="10.5" y="1.5" width="3" height="4.6" rx="1.3" transform="rotate(180 12 12)"/><rect x="10.5" y="1.5" width="3" height="4.6" rx="1.3" transform="rotate(225 12 12)"/><rect x="10.5" y="1.5" width="3" height="4.6" rx="1.3" transform="rotate(270 12 12)"/><rect x="10.5" y="1.5" width="3" height="4.6" rx="1.3" transform="rotate(315 12 12)"/></g><circle cx="12" cy="12" r="5.4" fill="none" stroke="#fff" stroke-width="2.9"/></svg>'
  };

  /* ---------- 应用清单 ---------- */
  var APPS = [
    { id: 'calc',      name: '计算器',   slogan: '它会算，只是偶尔不对', g: 'calc',  c: ['#6C7CF5', '#4A56D6'], deg: 135 },
    { id: 'assistant', name: '助手',     slogan: '它不会答，你得替它答', g: 'bot',   c: ['#4FC3F7', '#2E7FE8'], deg: 120 },
    { id: 'calendar',  name: '日历',     slogan: '它排的不是期，是雷',   g: 'cal',   c: ['#FFB84C', '#F08A1E'], deg: 150 },
    { id: 'schedule',  name: '日程',     slogan: '它记不住，得你帮它记', g: 'list',  c: ['#3ECF8E', '#17A06B'], deg: 135 },
    { id: 'alarm',     name: '闹钟',     slogan: '它不会响，得你帮它响', g: 'alarm', c: ['#8F7BF7', '#6A4CE0'], deg: 120 },
    { id: 'stats',     name: '统计',     slogan: '它不会分析，但你会',   g: 'chart', c: ['#4FD0E5', '#2E9EC4'], deg: 150 },
    /* 应用商店的色相取青柠绿（黄绿，hue≈92）—— 主屏其余图标里没有这个色区，
     * 与日程/电话的春绿、统计/助手的青蓝都拉得开（DESIGN §4.3 色相不重复）。 */
    { id: 'store',     name: '应用商店', slogan: '整条工具街都在这儿',   g: 'bag',   c: ['#8ED04A', '#5C9E1C'], deg: 135 }
  ];
  var DOCK = [
    { id: 'phone',    name: '电话', slogan: '拨一个不存在的号码', g: 'phone',  c: ['#34C46F', '#1E9E50'], deg: 135 },
    { id: 'sms',      name: '短信', slogan: '收件箱永远干净',     g: 'sms',    c: ['#3F8FEA', '#2456C8'], deg: 120 },
    { id: 'camera',   name: '相机', slogan: '只拍得到取景框',     g: 'camera', c: ['#F06AA8', '#D2387A'], deg: 150 },
    { id: 'settings', name: '设置', slogan: '壁纸、外观与关于本机', g: 'gear',  c: ['#8E8E96', '#5C5C66'], deg: 135 }
  ];

  /* 月球天气：唯一入口是主屏天气小组件（§4.3.1），故不进 APPS / DOCK ——
   * 主屏图标网格与 Dock 保持 7 + 4，只在多任务轮播里以卡片形态出现。 */
  var WEATHER_APP = { id: 'weather', name: '月球天气', slogan: '数据来源：AI 编的，别当真',
                      g: 'moon', c: ['#8FA6D8', '#3A4A7A'], deg: 135 };

  /* ---------- 应用商店数据（§4.12） ----------
   * 由 _dev/build.py 在构建期解析仓库根 TRACKS.md 后注入（占位符 __STORE_DATA__）——
   * 与小工具包体无关，全部在包内，运行时不读任何外部文件；手抄清单会与 TRACKS.md 分叉，
   * 故这里只声明、不维护内容。结构：[{tag, name, items:[{n 名称, d 目录, t 定位, s 状态}]}] */
  var STORE_GROUPS = __STORE_DATA__;
  /* 货架图标色板：8 组身份色按序轮转，同分类相邻两张卡片必不同色 —— 商店里的图标是
   * 「每个应用自己的招牌色」（与主屏图标同一性质），属身份色而非 §4.5 的语义色，
   * 故可以多色并列；色值直接复用主屏那套，商店与桌面看起来是同一个世界的应用。 */
  var STORE_ICON_PALETTE = [
    ['#6C7CF5', '#4A56D6'], ['#4FC3F7', '#2E7FE8'], ['#FFB84C', '#F08A1E'], ['#3ECF8E', '#17A06B'],
    ['#8F7BF7', '#6A4CE0'], ['#4FD0E5', '#2E9EC4'], ['#F06AA8', '#D2387A'], ['#FF8A5B', '#E05A2B']
  ];
  /* 分类的视觉标识（色相：实用工具蓝 / 互动游戏紫 / 数字艺术玫红 / 人文知识青绿）；
   * 名字取 TRACKS.md 的分类名，颜色是 UI 决策，故只在这里定。 */
  var STORE_CAT = {
    vibetool: ['#4A8DF0', '#2A5FD0'],
    vibegame: ['#8F7BF7', '#6A4CE0'],
    vibeart:  ['#F0688F', '#C93A66'],
    vibeknow: ['#2FBFA8', '#12897C']
  };
  var STORE_CAT_FALLBACK = ['#8E8E96', '#5C5C66'];

  function storeCatColor(tag) { return STORE_CAT[tag] || STORE_CAT_FALLBACK; }

  function findApp(id) {
    var i;
    for (i = 0; i < APPS.length; i++) { if (APPS[i].id === id) { return APPS[i]; } }
    for (i = 0; i < DOCK.length; i++) { if (DOCK[i].id === id) { return DOCK[i]; } }
    if (id === WEATHER_APP.id) { return WEATHER_APP; }
    return null;
  }

  /* ---------- 存储层（小红书容器 §2.4 数据存储 / §3.6 版本判断 / §3.7 Storage） ----------
   * 统一存储契约（与 offwork-heatmap / mood-diary 同构，三处改动请同步）：
   *   1) 双通道：容器 Storage（客户端 ≥ 9.46.0 且已注入 setStorage / getStorage）+ localStorage 镜像；
   *   2) 写：镜像通道同步先行、容器异步跟上，任一成功即算成功，两条都失败才回报失败（§3.7 要求）；
   *   3) 读：容器优先，缺失 / 失败退回镜像；容器有而镜像没有则回填，两侧互为兜底；
   *   4) 启动：并发水合（每个 key 各自 800ms 超时，整体不拖长开机），两侧缺哪边补哪边；
   *   5) 端能力一律 success / fail 回调 + 800ms 超时兜底（旧容器上 Promise 版不可靠，也不能挂住调用方）；
   *   6) 版本号：buildVersion 抹掉末 3 位，同步取值 → 异步兜底，取不到按「不支持」处理，取值过程绝不抛错；
   *   7) 通道可见：关于本机显示当前数据通道，容器写入失败也在那里如实说明。
   * 容器 API 是异步的，故启动时一次性水合进内存缓存（storeCache），此后读写全同步。 */
  var STORE_PREFIX = 'aios_';
  var STORAGE_MIN_CLIENT_VERSION = 9460;   /* 客户端 9.46.0（buildVersion 末 3 位为编译序号，需忽略） */
  var XHS_CALL_TIMEOUT = 800;              /* 端能力超时即当失败，由镜像通道兜住 */
  var STORE_KEYS = ['mode', 'wall', 'wmask', 'sound', 'stats', 'phone_records', 'sms_messages'];

  var storeCache = {};        /* 短 key -> 字符串值 */
  var storeBackend = 'local'; /* 'xhs' = 容器 Storage，'local' = localStorage 降级 */
  var storeHealthy = true;    /* 容器通道写入是否一直成功（失败则「关于本机」如实说明） */
  var storeUsage = null;      /* { currentSize, limitSize }，单位 KB（getStorageInfo） */

  function miniToolApi() {
    try {
      var xhs = global.xhs;
      return (xhs && xhs.miniTool) || null;
    } catch (e) { return null; }
  }

  /* 9462004 -> 9.46.2 -> 9462：末 3 位编译序号必须先抹掉 */
  function readBuildVersion(launchOptions) {
    var env = launchOptions && launchOptions.miniToolEnv;
    return Number(env && env.buildVersion) || 0;
  }
  function getClientVersion(buildVersion) { return Math.floor(buildVersion / 1000); }

  /* 版本号：先同步取（逐级判空），取不到再异步兜底；两条路都失败按「不支持」处理 */
  function getBuildVersion(cb) {
    var sync = 0;
    try { sync = readBuildVersion(global.xhs && global.xhs.launchOptions); } catch (e) { sync = 0; }
    if (sync) { cb(sync); return; }
    var api = miniToolApi();
    if (!api || typeof api.getLaunchOptions !== 'function') { cb(0); return; }
    var done = false;
    function finish(v) { if (done) { return; } done = true; cb(v); }
    try {
      var ret = api.getLaunchOptions();
      if (ret && typeof ret.then === 'function') {
        ret.then(function (lo) { finish(readBuildVersion(lo)); }, function () { finish(0); });
      } else {
        finish(readBuildVersion(ret));
      }
    } catch (e) { finish(0); }
  }

  /* 容器端能力统一走 success/fail 回调（Promise 版在旧容器上不可靠），并加超时兜底：
   * 容器异常时宁可退回降级通道，也不能把启动流程挂住。
   * 写入失败以 false 记（§3.7：调用方必须处理「写失败」）。 */
  function xhsCall(apiName, payload, cb) {
    var api = miniToolApi();
    if (!api || typeof api[apiName] !== 'function') { cb(false, null); return; }
    var done = false;
    var timer = global.setTimeout(function () { finish(false, null); }, XHS_CALL_TIMEOUT);
    function finish(ok, res) {
      if (done) { return; }
      done = true;
      global.clearTimeout(timer);
      cb(ok, res);
    }
    payload.success = function (res) { finish(res !== false, res); };
    payload.fail = function () { finish(false, null); };
    try { api[apiName](payload); } catch (e) { finish(false, null); }
  }

  /* 镜像通道（localStorage）：浏览器自带存储不保证可用/持续有效（§2.4），读写一律吞异常。
   * lsSet 返回是否真的写进去——两条通道都失败才算写失败。 */
  function lsGet(key) {
    try { return global.localStorage.getItem(STORE_PREFIX + key); } catch (e) { return null; }
  }
  function lsSet(key, val) {
    try { global.localStorage.setItem(STORE_PREFIX + key, val); return true; } catch (e) { return false; }
  }

  /* 启动水合：容器 Storage 优先、localStorage 兜底，两侧缺哪边补哪边（升级/降级一致性）。
   * 容器不可用或版本不足时只用镜像通道，流程照常继续。
   * 全部 key 的 getStorage 并发发起（各自 800ms 超时），整体最坏也就 ~800ms，不拖长开机。 */
  function hydrateStore(cb) {
    var i, lv;
    for (i = 0; i < STORE_KEYS.length; i++) {
      lv = lsGet(STORE_KEYS[i]);
      if (lv !== null) { storeCache[STORE_KEYS[i]] = lv; }
    }
    getBuildVersion(function (bv) {
      var api = miniToolApi();
      var usable = getClientVersion(bv) >= STORAGE_MIN_CLIENT_VERSION && api &&
                   typeof api.getStorage === 'function' && typeof api.setStorage === 'function';
      if (!usable) { storeBackend = 'local'; cb(); return; }
      storeBackend = 'xhs';
      var toLocal = [], toXhs = [], pending = STORE_KEYS.length;
      function settled() {
        pending--;
        if (pending === 0) { flush(); }
      }
      function readOne(key) {
        xhsCall('getStorage', { key: STORE_PREFIX + key }, function (got, res) {
          var data = (got && res) ? res.data : null;
          if (data !== undefined && data !== null) {
            storeCache[key] = (typeof data === 'string') ? data : JSON.stringify(data);
            if (lsGet(key) === null) { toLocal.push(key); }     /* 容器有、镜像没有：补下去 */
          } else if (storeCache[key] !== undefined) {
            toXhs.push(key);                                    /* 镜像有、容器没有：迁上来 */
          }
          settled();
        });
      }
      for (i = 0; i < STORE_KEYS.length; i++) { readOne(STORE_KEYS[i]); }
      function flush() {
        var n;
        for (n = 0; n < toLocal.length; n++) { lsSet(toLocal[n], storeCache[toLocal[n]]); }
        var j = 0;
        (function step() {
          if (j >= toXhs.length) { usage(); return; }
          var key = toXhs[j];
          j++;
          xhsCall('setStorage', { key: STORE_PREFIX + key, data: storeCache[key] }, function (ok) {
            if (!ok) { storeHealthy = false; }
            step();
          });
        })();
      }
      function usage() {
        xhsCall('getStorageInfo', {}, function (got, res) {
          if (got && res && typeof res.currentSize !== 'undefined') {
            storeUsage = { currentSize: res.currentSize, limitSize: res.limitSize };
          }
          cb();
        });
      }
    });
  }

  /* 写入：内存 + 镜像通道 + 容器通道。镜像先行（同步、可靠），容器写失败由镜像兜住，
   * 并记下来供「关于本机」如实说明；返回镜像通道是否写成功。 */
  function store(key, val) {
    var s = String(val);
    storeCache[key] = s;
    var localOk = lsSet(key, s);
    if (storeBackend === 'xhs') {
      xhsCall('setStorage', { key: STORE_PREFIX + key, data: s }, function (ok) {
        if (!ok) { storeHealthy = false; syncSettingsUI(); }
      });
    }
    return localOk;
  }
  /* 读取：走内存缓存（启动水合已完成），无值返回默认值 */
  function read(key, dft) {
    var v = storeCache[key];
    return (v === undefined || v === null) ? dft : v;
  }

  /* 关于本机「存储方式」：只报当前通道（与用量），不标「降级」——是哪个通道就写哪个；
   * 只有容器通道**写入失败**时才额外说明已回落（§5 要求如实，且那是真的出了状况）。 */
  function storeSummary() {
    if (storeBackend !== 'xhs') { return 'localStorage'; }
    if (!storeHealthy) { return '容器 Storage 写入失败 · 已回落 localStorage'; }
    if (storeUsage && typeof storeUsage.currentSize !== 'undefined') {
      return '容器 Storage · ' + storeUsage.currentSize + ' / ' + (storeUsage.limitSize || 10240) + ' KB';
    }
    return '容器 Storage';
  }

  /* ---------- 系统音效（DESIGN.md §4.11）：Web Audio 实时合成，零音频文件 ----------
   * 「统一」的含义：全系统只有一张音效表 + 一条总线 + 一个开关，音效名是**系统语义**
   * （tap / open / ok / wrong / shot …），不是「某个页面的音」——同一语义在任何应用里
   * 听起来一致；新页面要出声只需标一个名字，不必自己再搭一套。
   * 三条约束决定了写法（与 air-tycoon / solar-voyager 同一条红线）：
   *   1) 不引音频文件、不联网：全部用振荡器 + 噪声实时合成；
   *   2) 每处点击都要出声，所以声音必须极短、极干 —— 长尾会在连点里攒成噪音；
   *   3) 环境无 Web Audio（或自动播放策略挡住）时**整层静音降级**：不抛错、不阻塞交互。
   * 触发方式：文档级 click 委托 —— 可交互元素默认发 tap，个别元素用 data-sfx 指定语义，
   * data-sfx="none" 表示该处由应用自己发（判定对错 / 快门 / 挂断…），避免两个声音叠在一起。 */
  var SFX_VOL = 0.8;        /* 总线音量：整体一处可调 */
  var sfxOn = true;         /* 由 aios_sound 回填（缺省开）；设置页「声音与触感」可切 */
  var sfxArmed = false;     /* 首个用户手势前不建 AudioContext（自动播放策略会拦住它，
                               控制台还会留一条 warning）：第一声天然在第一次点击之后 */
  var sfxDead = false;      /* 环境无 Web Audio：整层静音，其余交互照常 */
  var sfxCtx = null, sfxBus = null, sfxNoiseBuf = null;
  var sfxLastAt = {}, sfxPlays = { total: 0 };

  function sfxArm() { sfxArmed = true; }

  function sfxCtxGet() {
    if (sfxDead || !sfxArmed) { return null; }
    try {
      if (!sfxCtx) {
        var C = global.AudioContext || global.webkitAudioContext;
        if (!C) { sfxDead = true; return null; }
        sfxCtx = new C();
        sfxBus = sfxCtx.createGain();
        sfxBus.gain.value = SFX_VOL;
        sfxBus.connect(sfxCtx.destination);
      }
      /* 首次手势里 resume；没放行也不管，下一次点击还会再试 */
      if (sfxCtx.state === 'suspended') {
        var pr = sfxCtx.resume();
        if (pr && pr.catch) { pr.catch(function () {}); }
      }
      return sfxCtx;
    } catch (e) { sfxDead = true; return null; }
  }

  /* 白噪声只生成一次、循环使用：每次现算几万采样会让连点变大时在低端机上卡顿 */
  function sfxNoise(a) {
    if (sfxNoiseBuf && sfxNoiseBuf.sampleRate === a.sampleRate) { return sfxNoiseBuf; }
    var len = Math.floor(a.sampleRate * 1.2), i;
    sfxNoiseBuf = a.createBuffer(1, len, a.sampleRate);
    var d = sfxNoiseBuf.getChannelData(0);
    for (i = 0; i < len; i++) { d[i] = Math.random() * 2 - 1; }
    return sfxNoiseBuf;
  }

  /* 单音：起音 → 指数衰减，可选滑音 / 滤波 / 失谐副振荡器
   * opt: { type, vol, atk, to, cutoff, filter, detune, delay } */
  function sfxTone(freq, dur, opt) {
    var a = sfxCtxGet(); if (!a) { return; }
    opt = opt || {};
    try {
      var t = a.currentTime + (opt.delay || 0);
      var v = Math.max(0.0002, opt.vol == null ? 0.05 : opt.vol);
      var atk = Math.min(opt.atk == null ? 0.005 : opt.atk, dur * 0.5);
      dur = Math.max(dur || 0.1, atk + 0.03);
      var g = a.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + atk);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      var tail = g;
      if (opt.cutoff) {
        var f = a.createBiquadFilter();
        f.type = opt.filter || 'lowpass';
        f.frequency.value = opt.cutoff;
        g.connect(f); tail = f;
      }
      tail.connect(sfxBus);
      /* 失谐副振荡器把单薄的「嘟」撑成有厚度的音色 */
      var n = opt.detune ? 2 : 1, i;
      for (i = 0; i < n; i++) {
        var o = a.createOscillator();
        o.type = opt.type || 'sine';
        o.frequency.setValueAtTime(Math.max(20, freq), t);
        if (opt.to) { o.frequency.exponentialRampToValueAtTime(Math.max(20, opt.to), t + dur); }
        if (i) { o.detune.value = opt.detune; }
        o.connect(g);
        o.start(t); o.stop(t + dur + 0.03);
      }
    } catch (e) { /* 单音失效不影响交互 */ }
  }

  /* 噪声音：快门、撞击、翻页的沙沙
   * opt: { vol, atk, filter, cutoff, to, q, delay } */
  function sfxHiss(dur, opt) {
    var a = sfxCtxGet(); if (!a) { return; }
    opt = opt || {};
    try {
      var t = a.currentTime + (opt.delay || 0);
      var v = Math.max(0.0002, opt.vol == null ? 0.1 : opt.vol);
      var atk = Math.min(opt.atk == null ? 0.004 : opt.atk, dur * 0.6);
      var src = a.createBufferSource();
      src.buffer = sfxNoise(a);
      src.loop = true;                                   /* 循环噪声，靠包络裁出长度 */
      var f = a.createBiquadFilter();
      f.type = opt.filter || 'lowpass';
      f.frequency.setValueAtTime(opt.cutoff || 900, t);
      if (opt.to) { f.frequency.exponentialRampToValueAtTime(Math.max(60, opt.to), t + dur); }
      if (opt.q != null) { f.Q.value = opt.q; }
      var g = a.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + atk);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(sfxBus);
      src.start(t); src.stop(t + dur + 0.03);
    } catch (e) { /* 忽略 */ }
  }

  /* 一串音：给打开 / 返回 / 判定 / 胜利这类「有方向」的提示。
   * 排程走 AudioContext 时钟而不是 setTimeout —— 切页面时不会留下漏到下一屏的残音。 */
  function sfxSeq(notes, o) {
    o = o || {};
    var step = o.step || 0.1, dur = o.dur || 0.24, d0 = o.delay || 0, i;
    for (i = 0; i < notes.length; i++) {
      sfxTone(notes[i], dur, {
        type: o.type, vol: o.vol, atk: o.atk, to: o.to,
        cutoff: o.cutoff, filter: o.filter, detune: o.detune,
        delay: d0 + i * step
      });
    }
  }

  /* 音效表：名字即系统语义，音量与时值在这里定死，页面只挑名字。
   * 连点型（tap / key / flip）一律 50ms 以内且不带尾巴；一次性大事（win / boom）才给琶音。 */
  var SFX_TABLE = {
    /* —— 系统 / 导航 —— */
    tap: function () {                       /* 通用点击：木质的「嗒」 */
      sfxTone(660, 0.05, { type: 'triangle', vol: 0.05, to: 430, atk: 0.002 });
      sfxHiss(0.026, { vol: 0.045, filter: 'highpass', cutoff: 2600 });
    },
    nav: function () {                       /* 金刚键：比 tap 低一档，更像硬件键 */
      sfxTone(300, 0.09, { type: 'sine', vol: 0.055, to: 220, atk: 0.004 });
      sfxHiss(0.03, { vol: 0.028, filter: 'highpass', cutoff: 1800 });
    },
    back: function () { sfxSeq([440, 330], { type: 'sine', vol: 0.05, dur: 0.1, step: 0.055 }); },
    open: function () { sfxSeq([520, 780], { type: 'sine', vol: 0.055, dur: 0.12, step: 0.07 }); },
    on: function () { sfxSeq([660, 990], { type: 'sine', vol: 0.05, dur: 0.13, step: 0.07 }); },
    off: function () { sfxSeq([520, 340], { type: 'sine', vol: 0.048, dur: 0.12, step: 0.065 }); },
    /* —— 输入 —— */
    key: function () { sfxTone(1250, 0.04, { type: 'square', vol: 0.028, to: 900, atk: 0.002 }); },
    tick: function () { sfxTone(1180, 0.09, { type: 'triangle', vol: 0.04, to: 1500, atk: 0.003 }); },
    eq: function () { sfxSeq([740, 1110], { type: 'sine', vol: 0.05, dur: 0.1, step: 0.05 }); },
    /* —— 判定 —— */
    ok: function () { sfxSeq([659, 988], { type: 'sine', vol: 0.055, dur: 0.16, step: 0.075 }); },
    wrong: function () { sfxSeq([330, 233], { type: 'triangle', vol: 0.055, dur: 0.2, step: 0.085 }); },
    deny: function () {                      /* 无效输入 / 被拒 / 危险操作 */
      sfxTone(210, 0.14, { type: 'sawtooth', vol: 0.05, to: 150, cutoff: 800 });
      sfxTone(160, 0.11, { type: 'square', vol: 0.026, to: 120, delay: 0.03 });
    },
    win: function () { sfxSeq([523, 659, 784, 1047], { type: 'sine', vol: 0.055, dur: 0.26, step: 0.1 }); },
    lose: function () { sfxSeq([392, 294, 220], { type: 'triangle', vol: 0.055, dur: 0.3, step: 0.12 }); },
    boom: function () {                      /* 踩雷 / 炸掉：全场最响的一声 */
      sfxHiss(0.5, { vol: 0.2, cutoff: 900, to: 200 });
      sfxTone(110, 0.42, { type: 'sawtooth', vol: 0.09, to: 45, cutoff: 600 });
    },
    /* —— 格子 / 小游戏 —— */
    flip: function () { sfxTone(880, 0.045, { type: 'triangle', vol: 0.035, to: 620, atk: 0.002 }); },
    flag: function () { sfxTone(1480, 0.05, { type: 'square', vol: 0.03, to: 1180, atk: 0.002 }); },
    alarm: function () {                     /* 响铃窗口：两声方波，不悦耳是故意的 */
      sfxTone(880, 0.1, { type: 'square', vol: 0.045, cutoff: 2200 });
      sfxTone(880, 0.1, { type: 'square', vol: 0.045, cutoff: 2200, delay: 0.16 });
    },
    over: function () {                      /* 过热告警：下行两声 */
      sfxTone(660, 0.14, { type: 'square', vol: 0.045, cutoff: 1600 });
      sfxTone(520, 0.16, { type: 'square', vol: 0.045, cutoff: 1400, delay: 0.14 });
    },
    shot: function () {                      /* 快门：一记短噪声「咔」+ 低频闷响 */
      sfxHiss(0.05, { vol: 0.13, filter: 'highpass', cutoff: 2400 });
      sfxTone(180, 0.06, { type: 'square', vol: 0.045, to: 110, cutoff: 900 });
    },
    /* —— 通讯 —— */
    sent: function () { sfxSeq([880, 1320], { type: 'sine', vol: 0.05, dur: 0.09, step: 0.045 }); },
    msg: function () { sfxSeq([988, 1319], { type: 'triangle', vol: 0.05, dur: 0.14, step: 0.07 }); },
    call: function () { sfxSeq([440, 440], { type: 'sine', vol: 0.05, dur: 0.12, step: 0.18 }); },
    connect: function () { sfxSeq([587, 880], { type: 'sine', vol: 0.05, dur: 0.16, step: 0.08 }); },
    hangup: function () { sfxSeq([440, 294], { type: 'square', vol: 0.04, dur: 0.12, step: 0.07 }); }
  };

  /* 播放：同一音效 30ms 内只发一次（属性变更与冒泡双触发、连点都靠它去重）。
   * 环境无 Web Audio、或还没等到首个用户手势时静音降级，但计数照记 —— 自检据此断言
   * 「该出声的地方确实调用过」，而不依赖无头环境真的能听见。 */
  function sfxPlay(name) {
    if (!sfxOn) { return false; }
    var fn = SFX_TABLE[name];
    if (!fn) { return false; }
    var now = Date.now();
    if (sfxLastAt[name] && now - sfxLastAt[name] < 30) { return false; }
    sfxLastAt[name] = now;
    sfxPlays.total += 1;
    sfxPlays[name] = (sfxPlays[name] || 0) + 1;
    try { fn(); } catch (e) { /* 单个音效失效不影响交互 */ }
    return true;
  }

  function sfxLoad() { sfxOn = read('sound', '1') !== '0'; }

  /* 开关（设置页「声音与触感」）：镜像 + 容器双通道落盘，切完即时生效 */
  function sfxSetEnabled(v) {
    sfxOn = !!v;
    store('sound', sfxOn ? '1' : '0');
    syncSettingsUI();
  }

  /* 从点击目标找音效名：先看 data-sfx，再退回「任何 <button> 发 tap」。
   * 走到最近的 BUTTON 就停，故 data-sfx 必须标在最内层的可交互元素上。 */
  function sfxSoundFor(node) {
    var n = node;
    while (n && n.nodeType === 1) {
      var v = n.getAttribute ? n.getAttribute('data-sfx') : null;
      if (v) { return v; }
      if (n.tagName === 'BUTTON') { return 'tap'; }
      n = n.parentNode;
    }
    return '';
  }

  /* 全系统音效的唯一入口：一次 click 委托 + 首个手势打点 */
  function sfxBind() {
    document.addEventListener('pointerdown', sfxArm, true);
    document.addEventListener('keydown', sfxArm, true);
    document.addEventListener('click', function (ev) {
      sfxArm();                                   /* 程序化 click 没有 pointerdown，这里兜底 */
      var s = sfxSoundFor(ev.target);
      if (s && s !== 'none') { sfxPlay(s); }
    }, false);
  }

  /* ---------- 主题 ---------- */
  var WALLS = ['light-mesh', 'light-solid', 'dark-mesh', 'dark-solid'];
  /* swatch 预览与实际壁纸同色系（不是另一套配色，避免"选了跟看到的不一样"） */
  var WALL_PREVIEW = {
    'light-mesh': 'radial-gradient(circle at 22% 12%, rgba(108,76,241,.38), transparent 55%),' +
                  'radial-gradient(circle at 84% 26%, rgba(64,150,255,.32), transparent 55%),' +
                  'linear-gradient(180deg,#EEF2FF 0%,#F5F3FF 100%)',
    'light-solid': 'linear-gradient(180deg,#F5F7FC 0%,#EDEFF5 100%)',
    'dark-mesh': 'radial-gradient(circle at 22% 12%, rgba(108,76,241,.60), transparent 55%),' +
                 'radial-gradient(circle at 84% 26%, rgba(46,127,232,.50), transparent 55%),' +
                 'linear-gradient(180deg,#1A1C30 0%,#0D0E17 100%)',
    'dark-solid': 'linear-gradient(180deg,#14141B 0%,#0C0C11 100%)'
  };
  var WALL_NAME = { 'light-mesh':'渐变', 'light-solid':'纯色', 'dark-mesh':'夜色渐变', 'dark-solid':'夜色纯色' };
  /* 主题值来自存储：启动水合完成后由 loadTheme() 回填，水合前先用默认值 */
  var theme = { mode: 'light', wall: 'light-mesh' };

  function loadTheme() {
    theme.mode = read('mode', 'light');
    theme.wall = read('wall', 'light-mesh');
    if (WALLS.indexOf(theme.wall) < 0) { theme.wall = 'light-mesh'; }
    if (theme.mode !== 'dark') { theme.mode = 'light'; }
  }

  function applyTheme() {
    document.body.setAttribute('data-mode', theme.mode);
    document.body.setAttribute('data-wall', theme.wall);
    store('mode', theme.mode);
    store('wall', theme.wall);
    syncSettingsUI();
  }

  /* ---------- 视图栈 ---------- */
  var viewRoot = document.getElementById('viewRoot');
  var stack = [];            // 最近任务（栈顶=最近使用），主页键不清空
  var current = 'home';      // 'home' 或应用 id
  var views = {};            // id -> element
  var homeView = null;
  var recentsEl = null;
  var weatherView = null;    // 月球天气视图（首次进入时构建；AIOS.weatherState 读取它的快照）

  /* 文本转义：应用商店的名称 / 定位 / 状态是从 TRACKS.md 解析出来的外部文本，
   * 一律转义后再进 innerHTML，免得文中的 & < > 被当成标签解析。 */
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (html !== undefined) { n.innerHTML = html; }
    return n;
  }

  /* 图标质感配方：顶部高光 + 主渐变；投影为中性（真机不用同色光晕，见 DESIGN §4.6）。
   * 主屏图标与商店货架图标共用同一套配方，不各写一遍。 */
  function iconPaint(node, cols, deg) {
    node.style.backgroundImage =
      'radial-gradient(120% 90% at 22% 0%, rgba(255,255,255,.30), rgba(255,255,255,0) 55%),' +
      'linear-gradient(' + (deg || 135) + 'deg,' + cols[0] + ',' + cols[1] + ')';
  }

  function iconNode(app, extra) {
    var n = el('div', 'app-icon' + (extra ? ' ' + extra : ''));
    iconPaint(n, app.c, app.deg);
    n.innerHTML = GLYPH[app.g];
    return n;
  }

  /* ---------- 主屏 ---------- */
  var WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  var WALLET_BAL = '￥ -99,999';
  var WALLET_MASKED = '￥ -****';

  function buildWidgets() {
    var wrap = el('div', 'widgets');

    // 时钟组件：主视觉渐变卡；点击进入闹钟
    var clock = el('button', 'widget w-clock');
    clock.setAttribute('aria-label', '时钟组件，打开闹钟');
    clock.setAttribute('data-sfx', 'open');
    clock.id = 'wClock';
    var main = el('span', 'w-clock-main');
    main.appendChild(el('span', 'w-clock-time', '--:--'));
    main.appendChild(el('span', 'w-clock-sub', ''));
    clock.appendChild(main);
    var analog = el('span', 'w-analog');
    analog.innerHTML = '<i class="w-hh"></i><i class="w-mh"></i>';
    clock.appendChild(analog);
    clock.addEventListener('click', function () { openApp('alarm'); });
    wrap.appendChild(clock);

    var row = el('div', 'w-row');

    // 天气组件：一眼假的设定数据（恶搞内核）；点击进入「月球天气」应用（§4.3.1 / §4.9）
    var weather = el('button', 'widget w-half w-weather');
    weather.setAttribute('aria-label', '天气组件，打开月球天气');
    weather.setAttribute('data-sfx', 'open');
    weather.id = 'wWeather';
    weather.appendChild(el('div', 'w-city', '月球 · 静海'));
    var wrow2 = el('div', 'w-wrow2');
    wrow2.appendChild(el('span', 'w-temp', '-173°'));
    wrow2.appendChild(el('span', 'w-glyphchip', GLYPH.moon));
    weather.appendChild(wrow2);
    weather.appendChild(el('span', 'w-hl', '晴 · 流星雨概率 40%'));
    weather.appendChild(el('div', 'w-src', '数据来源：AI 编的，别当真'));
    weather.addEventListener('click', function () { openApp('weather'); });
    row.appendChild(weather);

    // 钱包组件：银行卡质感，假余额，默认打码，点按显示/隐藏（状态持久化）
    var wallet = el('button', 'widget w-half w-wallet');
    wallet.setAttribute('aria-label', '钱包组件，点按显示或隐藏余额');
    wallet.setAttribute('data-sfx', 'tap');
    var masked = read('wmask', '1') === '1';   /* 默认打码：首次进入也只显示 ￥ -****（DESIGN §4.3.1） */
    var wtop = el('div', 'w-wtop');
    wtop.appendChild(el('span', 'w-bank', '灵光银行 · 数字卡'));
    wtop.appendChild(el('span', 'w-chip'));
    wallet.appendChild(wtop);
    wallet.appendChild(el('div', 'w-bal-lbl', '余额（透支中）'));
    var bal = el('div', 'w-bal', masked ? WALLET_MASKED : WALLET_BAL);
    wallet.appendChild(bal);
    var wrow = el('div', 'w-wrow');
    wrow.appendChild(el('span', 'w-spend', '今日支出 ￥9,999'));
    wrow.appendChild(el('span', 'w-cardno', '**** 2333'));
    wallet.appendChild(wrow);
    wallet.addEventListener('click', function () {
      masked = !masked;
      store('wmask', masked ? '1' : '0');
      bal.textContent = masked ? WALLET_MASKED : WALLET_BAL;
    });
    row.appendChild(wallet);

    wrap.appendChild(row);
    return wrap;
  }

  function buildHome() {
    homeView = el('div', 'view home');
    var body = el('div', 'home-body');
    body.appendChild(buildWidgets());

    var grid = el('div', 'home-grid');
    APPS.forEach(function (app) {
      var tile = el('button', 'app-tile');
      tile.setAttribute('aria-label', app.name);
      tile.setAttribute('data-sfx', 'open');
      tile.appendChild(iconNode(app));
      tile.appendChild(el('span', 'app-name', app.name));
      tile.addEventListener('click', function () { openApp(app.id); });
      grid.appendChild(tile);
    });
    body.appendChild(grid);
    homeView.appendChild(body);

    var dock = el('div', 'dock');
    DOCK.forEach(function (app) {
      var tile = el('button', 'app-tile');
      tile.setAttribute('aria-label', app.name);
      tile.setAttribute('data-sfx', 'open');
      tile.appendChild(iconNode(app));
      tile.addEventListener('click', function () { openApp(app.id); });
      dock.appendChild(tile);
    });
    homeView.appendChild(dock);
    viewRoot.appendChild(homeView);
  }

  /* ---------- 设置页 ---------- */
  function buildSettings() {
    var app = findApp('settings');
    var v = el('div', 'view hidden');
    v.appendChild(el('div', 'phead', '<h1>设置</h1>'));

    var body = el('div', 'pbody');

    var cardWall = el('div', 'card');
    cardWall.appendChild(el('div', 'card-title', '壁纸'));
    var walls = el('div', 'walls');
    WALLS.forEach(function (w) {
      var item = el('div', 'wall-item');
      var s = el('button', 'wall-swatch');
      s.style.background = WALL_PREVIEW[w];
      s.setAttribute('data-wall', w);
      s.addEventListener('click', function () {
        theme.wall = w;
        // 深色壁纸自动切深色组件，浅色壁纸自动切浅色，保持可读
        theme.mode = (w.indexOf('dark') === 0) ? 'dark' : 'light';
        applyTheme();
      });
      item.appendChild(s);
      item.appendChild(el('div', 'wall-name', WALL_NAME[w]));
      walls.appendChild(item);
    });
    cardWall.appendChild(walls);
    body.appendChild(cardWall);

    var cardLook = el('div', 'card');
    cardLook.appendChild(el('div', 'card-title', '外观'));
    var rowDark = el('div', 'row');
    rowDark.appendChild(el('span', 'lbl', '深色模式'));
    var sw = el('button', 'switch');
    sw.id = 'swDark';
    sw.addEventListener('click', function () {
      theme.mode = (theme.mode === 'dark') ? 'light' : 'dark';
      applyTheme();
    });
    rowDark.appendChild(sw);
    cardLook.appendChild(rowDark);
    body.appendChild(cardLook);

    /* 通用 / 声音与触感（v1 还原）：点击弹恶搞提示，文案取自 v1 */
    var SET_TIPS = {
      wifi: "连上了，但没完全连上。就像 AI 的智商，看起来在线，实际……嗯。",
      bluetooth: "蓝牙？不存在的，这是红牙。因为连上就火大！",
      notifications: "通知？这里只有惊吓，没有通知。准备好被吓一跳吧！",
      sounds: "声音？这个 AI 只会心跳声，咚咚咚，像不像你的初恋？",
      haptics: "触感？这个功能会让手机抖一抖，就像紧张时的你一样。"
    };
    var toast = el('div', 'set-toast');
    var toastTimer = null;
    function showTip(msg) {
      toast.textContent = msg;
      toast.classList.add('show');
      if (toastTimer) { global.clearTimeout(toastTimer); }
      toastTimer = global.setTimeout(function () { toast.classList.remove('show'); }, 2800);
    }
    function tipRow(label, key) {
      var r = el('div', 'row');
      r.setAttribute('data-sfx', 'tap');   /* 行是 div：通用点击音靠 data-sfx 标出来 */
      r.appendChild(el('span', 'lbl', label));
      r.appendChild(el('span', 'arrow', '›'));
      r.addEventListener('click', function () { showTip(SET_TIPS[key]); });
      return r;
    }
    var cardGen = el('div', 'card');
    cardGen.appendChild(el('div', 'card-title', '通用'));
    cardGen.appendChild(tipRow('Wi-Fi', 'wifi'));
    cardGen.appendChild(tipRow('蓝牙', 'bluetooth'));
    cardGen.appendChild(tipRow('通知', 'notifications'));
    body.appendChild(cardGen);

    var cardSound = el('div', 'card');
    cardSound.appendChild(el('div', 'card-title', '声音与触感'));
    /* 「声音」行 = 音效总开关（原「系统音效」行与 v1 的「声音」吐槽行合并成这一行：
     * 吐槽行本来就只是弹个提示，与开关同义，两行并一行才像真机的设置项）。
     * 真的能关（aios_sound 持久化），关掉后全系统安静 —— 切换音自己发（on / off），
     * 故标 data-sfx="none" 不叠通用 tap；开启时仍复用 v1 的「声音」吐槽文案。 */
    var rowSfx = el('div', 'row');
    rowSfx.appendChild(el('span', 'lbl', '声音'));
    var swSound = el('button', 'switch');
    swSound.id = 'swSound';
    swSound.setAttribute('data-sfx', 'none');
    swSound.setAttribute('aria-label', '声音开关（控制系统音效）');
    swSound.addEventListener('click', function () {
      var next = !sfxOn;
      if (!next) { sfxPlay('off'); }        /* 关：先把确认音发出去，再静音 */
      sfxSetEnabled(next);
      if (next) { sfxPlay('on'); }
      showTip(next ? SET_TIPS.sounds : '已静音。世界清净了，AI 也清净了。');
    });
    rowSfx.appendChild(swSound);
    cardSound.appendChild(rowSfx);
    cardSound.appendChild(tipRow('触感', 'haptics'));
    body.appendChild(cardSound);

    var cardAbout = el('div', 'card');
    cardAbout.appendChild(el('div', 'card-title', '关于本机'));
    /* 设备三行：机型（FakePhone 18 NoDuo）+ 系统（人工智能 OS v2.0，版本号仍取 v1 数据）
     * + 引擎型号（只写「AI引擎」，不再缀版本/吐槽）；「存储方式」只报当前通道名，
     * 不在行内标注「降级」（对照 §5：容器写入失败时 storeSummary() 自己如实说明） */
    cardAbout.appendChild(el('div', 'row', '<span class="lbl">设备名称</span><span class="val">FakePhone 18 NoDuo</span>'));
    cardAbout.appendChild(el('div', 'row', '<span class="lbl">系统版本</span><span class="val">人工智能 OS ' + ABOUT_TXT.version + '</span>'));
    cardAbout.appendChild(el('div', 'row', '<span class="lbl">型号</span><span class="val">AI引擎</span>'));
    cardAbout.appendChild(el('div', 'row', '<span class="lbl">存储方式</span><span class="val" id="storeVal">' + storeSummary() + '</span>'));
    cardAbout.appendChild(el('div', 'row', '<span class="lbl">出品方</span><span class="val">' + ABOUT_TXT.title + '</span>'));
    body.appendChild(cardAbout);
    body.appendChild(toast);

    v.appendChild(body);

    views.settings = v;
    viewRoot.appendChild(v);
    /* 设置页是懒构建的，而 syncSettingsUI 只在主题/音效变化时才被调用 ——
     * 不在这里同步一次，深色开关与音效开关首次上屏时都会显示成「关」。 */
    syncSettingsUI();
  }

  function syncSettingsUI() {
    var sw = document.getElementById('swDark');
    if (sw) {
      if (theme.mode === 'dark') { sw.classList.add('on'); } else { sw.classList.remove('on'); }
    }
    var swS = document.getElementById('swSound');
    if (swS) {
      if (sfxOn) { swS.classList.add('on'); } else { swS.classList.remove('on'); }
    }
    var i, nodes = document.querySelectorAll('.wall-swatch');
    for (i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute('data-wall') === theme.wall) { nodes[i].classList.add('sel'); }
      else { nodes[i].classList.remove('sel'); }
    }
    /* 数据通道：容器写入失败时会回调到这里，行内文案随之改成「已回落 localStorage」 */
    var sv = document.getElementById('storeVal');
    if (sv) { sv.textContent = storeSummary(); }
  }

  /* ---------- 占位应用页（游戏二期接入，DESIGN.md §7） ---------- */
  function buildPlaceholder(app) {
    var v = el('div', 'view hidden');
    v.appendChild(el('div', 'phead', '<h1>' + app.name + '</h1>'));
    var wrap = el('div', 'ph-wrap');
    wrap.appendChild(iconNode(app, 'ph-icon'));
    wrap.appendChild(el('div', 'ph-name', app.name));
    wrap.appendChild(el('div', 'ph-slogan', app.slogan));
    var chips = el('div', 'ph-chips');
    chips.appendChild(el('span', 'chip', '玩法二期接入'));
    chips.appendChild(el('span', 'chip', '试试 ▢ 看多任务'));
    chips.appendChild(el('span', 'chip', '○ 随时回主屏'));
    wrap.appendChild(chips);
    wrap.appendChild(el('div', 'ph-tip', '这是一台模拟的人工智能 OS，各应用玩法将陆续接入。'));
    v.appendChild(wrap);
    v.appendChild(el('div', 'pfoot', '<div class="pfoot-hint">用底部 ◁ 返回 · ○ 回主屏 · ▢ 看多任务</div>'));
    return v;
  }

  /* ---------- 共享统计存储（统计应用二期b 消费，localStorage aios_stats） ---------- */
  function statsLoad() {
    var s = null;
    try { s = JSON.parse(read('stats', '{}')); } catch (e) { s = null; }
    return (s && typeof s === 'object') ? s : {};
  }
  function statsSave(s) { store('stats', JSON.stringify(s)); }
  /* 读取某游戏的持久统计并补默认值（v1 行为：分数/最高分等跨会话累计） */
  function statGet(game, dft) {
    var s = statsLoad();
    var g = s[game];
    var o = {};
    var k;
    for (k in dft) { if (Object.prototype.hasOwnProperty.call(dft, k)) { o[k] = dft[k]; } }
    if (g && typeof g === 'object') {
      for (k in g) {
        if (Object.prototype.hasOwnProperty.call(g, k) && g[k] !== null && g[k] !== undefined) { o[k] = g[k]; }
      }
    }
    return o;
  }
  function statPut(game, obj) {
    var s = statsLoad();
    s[game] = obj;
    statsSave(s);
  }
  function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }

  /* ---------- 计算器（v1 还原）：用户按表达式，机器 50% 概率算错，玩家判对错 ---------- */
  /* 解析器：递归下降，支持 + - * / 与一元负号、小数；除零/非法返回 null（v1 z0 移植） */
  function calcParse(src) {
    try {
      if (!/^[\d\s+\-*/.]+$/.test(src)) { return null; }
      var p = 0, L = src.length;
      function ws() { while (p < L && src.charAt(p) === ' ') { p += 1; } }
      function num() {
        ws();
        var s = p;
        while (p < L && /[\d.]/.test(src.charAt(p))) { p += 1; }
        if (s === p) { throw 0; }
        return parseFloat(src.slice(s, p));
      }
      function unary() {
        ws();
        if (src.charAt(p) === '-') { p += 1; return -unary(); }
        if (src.charAt(p) === '+') { p += 1; return unary(); }
        return num();
      }
      function term() {
        var v = unary();
        ws();
        while (p < L && (src.charAt(p) === '*' || src.charAt(p) === '/')) {
          var o = src.charAt(p); p += 1;
          var r = unary();
          if (o === '*') { v *= r; } else { if (r === 0) { throw 0; } v /= r; }
          ws();
        }
        return v;
      }
      function expr() {
        var v = term();
        ws();
        while (p < L && (src.charAt(p) === '+' || src.charAt(p) === '-')) {
          var o = src.charAt(p); p += 1;
          var r = term();
          if (o === '+') { v += r; } else { v -= r; }
          ws();
        }
        return v;
      }
      var u = expr();
      ws();
      if (p < L) { throw 0; }
      if (typeof u !== 'number' || !isFinite(u)) { return null; }
      return isInt(u) ? u : Math.round(u * 1e4) / 1e4;
    } catch (e) { return null; }
  }
  /* 错误注入（v1 R0 移植）：±1~2 / 换一位数字 / 交换相邻数字 / 量级偏移，偏差超限兜底小偏移 */
  function calcCorrupt(h) {
    if (h === 0) { return Math.random() > 0.5 ? 1 : -1; }
    var u = Math.abs(h), f = h < 0 ? -1 : 1;
    var strategies = [
      function () { return h + (Math.random() > 0.5 ? 1 : -1) * (Math.floor(Math.random() * 2) + 1); },
      function () {
        var D = Math.abs(h).toString();
        if (D.length <= 1) { return h + f * 10; }
        var pos = Math.floor(Math.random() * D.length);
        var z = parseInt(D.charAt(pos), 10);
        var F = (z + (Math.random() > 0.5 ? 1 : -1) + 10) % 10;
        if (F === z) { F = (z + 1) % 10; }
        var K = D.slice(0, pos) + String(F) + D.slice(pos + 1);
        return f * parseFloat(K);
      },
      function () {
        var D = Math.abs(h).toString();
        if (D.length <= 1) { return h + f * 10; }
        var pos = Math.floor(Math.random() * (D.length - 1));
        var z = D.split('');
        var t = z[pos]; z[pos] = z[pos + 1]; z[pos + 1] = t;
        return f * parseFloat(z.join(''));
      },
      function () {
        return u > 10 ? h - f * (Math.floor(Math.random() * 10) + 1) : h + f * (Math.floor(Math.random() * 5) + 1);
      }
    ];
    var N = strategies[Math.floor(Math.random() * 4)]();
    var j = Math.max(u * 0.3, 5);
    if (Math.abs(N - h) > j || isNaN(N) || N === h) { N = h + f * (Math.floor(Math.random() * 5) + 1); }
    if (!isInt(N)) { N = Math.round(N * 100) / 100; }
    if (isNaN(N) || Math.abs(N - h) < 0.001) { N = h + (Math.random() > 0.5 ? 1 : -1) * (Math.floor(Math.random() * 5) + 1); }
    return N;
  }
  function calcFmt(n) {
    return isInt(n) ? String(n) : n.toFixed(4).replace(/\.?0+$/, '');
  }

  function buildCalc() {
    /* view-calc：计算器页专属修饰 —— 净高不足时允许整页滚动（见 CSS，键盘行高下限的兜底） */
    var v = el('div', 'view view-calc hidden');
    v.appendChild(el('div', 'phead', '<h1>计算器</h1>'));
    var body = el('div', 'pbody calc-body');
    var stats = el('div', 'gstats');
    stats.innerHTML =
      '<div class="gstat-main"><div class="k">分数</div><div class="v accent" data-f="score">0</div></div>' +
      '<div class="gstat-sub">' +
        '<span class="si">最高<b data-f="best">0</b></span>' +
        '<span class="si">准确率<b data-f="acc">0%</b></span>' +
        '<span class="si">连击<b class="combo" data-f="streak">0</b></span>' +
        '<span class="si">轮次<b data-f="rounds">0</b></span>' +
      '</div>';
    body.appendChild(stats);
    var disp = el('div', 'calc-display');
    disp.appendChild(el('div', 'calc-expr', ''));
    disp.appendChild(el('div', 'calc-shown', '0'));
    body.appendChild(disp);
    body.appendChild(el('div', 'calc-feedback', '按出你的算式，按 = 看 AI 的结果'));
    /* 内容撑满：显示卡吃掉剩余高度、算式与结果贴其底（真机计算器布局），消除中段空洞 */
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    disp.style.flex = '1 1 auto';
    disp.style.display = 'flex';
    disp.style.flexDirection = 'column';
    disp.style.justifyContent = 'flex-end';
    v.appendChild(body);
    var foot = el('div', 'pfoot calc-foot');
    var keypad = el('div', 'keypad');
    var judgeRow = el('div', 'judge-row calc-judge hidden-row');
    var bOk = el('button', 'judge-btn judge-ok', '对');
    var bNo = el('button', 'judge-btn judge-no', '错');
    /* 判定音由 judge() 自己发（对 / 错），这里不再叠通用点击音 */
    bOk.setAttribute('data-sfx', 'none');
    bNo.setAttribute('data-sfx', 'none');
    judgeRow.appendChild(bOk);
    judgeRow.appendChild(bNo);
    foot.appendChild(keypad);
    foot.appendChild(judgeRow);
    v.appendChild(foot);

    var S = statGet('calc', { score: 0, highScore: 0, streak: 0, rounds: 0, accuracy: 0 });
    var expr = '';
    var display = '0';
    var judging = false;
    var saved = null; /* {shown, correct} */
    var errored = false; /* Error 态：下次输入整体清空重来（v1 需手动按 C） */

    var fbNode = body.querySelector('.calc-feedback');
    var GUIDE = '按出你的算式，按 = 看 AI 的结果';
    /* 提示四态：默认引导（常驻可见，不被按键清空）/ ask「该你判了」/ ok 判对 / no 判错 —— 字重与配色见 CSS */
    function say(txt, state) {
      fbNode.textContent = txt;
      fbNode.className = 'calc-feedback' + (state ? ' ' + state : '');
    }

    function setStat(f, val) {
      var n = stats.querySelector('[data-f="' + f + '"]');
      if (n) { n.textContent = val; }
    }
    function refresh() {
      setStat('score', S.score);
      setStat('best', S.highScore);
      setStat('streak', S.streak);
      setStat('rounds', S.rounds);
      setStat('acc', Math.round(S.accuracy * 100) + '%');
    }
    function paint() {
      disp.children[0].textContent = expr === '' ? '' : expr;
      disp.children[1].textContent = display;
    }
    function press(k) {
      if (judging) { return; }
      say(GUIDE, '');
      /* Error 态下再输入（或按 C）：整体清空，从干净状态重新开始 —— 坏表达式不再接着往后长 */
      if (errored || k === 'C') {
        expr = '';
        display = '0';
        errored = false;
        disp.style.borderColor = '';
        if (k === 'C') { paint(); return; }
      }
      if (k === '=') {
        var t = calcParse(expr);
        if (t === null) {
          errored = true;
          display = 'Error';
          disp.style.borderColor = 'rgba(224,82,82,.7)';
          sfxPlay('deny');
          say('表达式无效，AI 拒绝背锅', 'no');
          paint();
          return;
        }
        sfxPlay('eq');
        var wrong = Math.random() < 0.5;
        var shown = wrong ? calcCorrupt(t) : t;
        saved = { shown: shown, correct: t };
        display = calcFmt(shown);
        judging = true;
        keypad.classList.add('keys-hidden');
        judgeRow.classList.remove('hidden-row');
        say('这个结果对吗？', 'ask');
        paint();
        return;
      }
      expr += k;
      display = display === '0' ? k : display + k;
      paint();
    }
    function judge(saysOk) {
      if (!judging || !saved) { return; }
      var displayCorrect = Math.abs(saved.shown - saved.correct) < 1e-4;
      var right = (saysOk === displayCorrect);
      S.rounds += 1;
      var gain = 0;
      if (right) {
        S.streak += 1;
        gain = 10;
        if (S.streak >= 3) { gain += 5; }
        S.score += gain;
        if (S.streak > (S.maxStreak || 0)) { S.maxStreak = S.streak; }
      } else {
        S.streak = 0;
        S.score = Math.max(0, S.score - 5);
        gain = -5;
      }
      S.accuracy = (S.accuracy * (S.rounds - 1) + (right ? 1 : 0)) / S.rounds;
      S.highScore = Math.max(S.highScore, S.score);
      statPut('calc', S);
      refresh();
      sfxPlay(right ? 'ok' : 'wrong');
      say(right
        ? ('✓ 判断正确 +' + gain + (S.streak >= 3 ? '（' + S.streak + ' 连击奖励）' : ''))
        : '✗ 判断错误 -5，AI 露出无辜脸', right ? 'ok' : 'no');
      disp.style.borderColor = right ? 'rgba(31,169,113,.7)' : 'rgba(224,82,82,.7)';
      judging = false;
      saved = null;
      global.setTimeout(function () {
        expr = '';
        display = '0';
        judging = false;
        judgeRow.classList.add('hidden-row');
        keypad.classList.remove('keys-hidden');
        disp.style.borderColor = '';
        say(GUIDE, '');
        paint();
      }, right ? 1200 : 1600);
    }
    var KEYS = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', 'C', '0', '.', '+', '='];
    KEYS.forEach(function (k) {
      var cls = 'key';
      if (k === '=') { cls += ' eq'; }
      else if (k === 'C') { cls += ' clr'; }
      else if ('÷×−+'.indexOf(k) >= 0) { cls += ' op'; }
      var b = el('button', cls, k);
      b.setAttribute('data-sfx', k === '=' ? 'none' : 'key');   /* = 的提交音由 press() 发 */
      if (k === '=') { b.style.gridColumnSpan = '4'; b.style.gridColumn = '1 / span 4'; }
      b.addEventListener('click', function () {
        var map = { '÷': '/', '×': '*', '−': '-' };
        press(Object.prototype.hasOwnProperty.call(map, k) ? map[k] : k);
      });
      keypad.appendChild(b);
    });
    bOk.addEventListener('click', function () { judge(true); });
    bNo.addEventListener('click', function () { judge(false); });
    paint();
    refresh();
    return v;
  }

  /* ---------- 闹钟（v1 还原）：目标对齐到 :00/:30，响铃窗口 ±500ms，错过自动判晚 ---------- */
  var alarmState = { target: 0, ringing: false, result: null, done: false };
  var alarmBeepAt = 0;   /* 响铃窗口内的补声节流（真闹钟不会只叫一次） */
  var alarmView = null;
  var alarmFinish = null;
  function alarmNextTarget(d, retry) {
    var f = d.getSeconds();
    var b = new Date(d.getTime());
    b.setMilliseconds(0);
    if (f < 5) {
      b.setSeconds(0);
      if (retry) { b.setSeconds(30); }
      return b;
    }
    if (f >= 30 && f < 35) {
      b.setSeconds(30);
      if (retry) { b.setSeconds(0); b.setMinutes(b.getMinutes() + 1); }
      return b;
    }
    if (f < 30) { b.setSeconds(30); }
    else { b.setSeconds(0); b.setMinutes(b.getMinutes() + 1); }
    return b;
  }
  function alarmHMS(d) {
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  function buildAlarm() {
    var v = el('div', 'view hidden');
    v.appendChild(el('div', 'phead', '<h1>闹钟</h1>'));
    var body = el('div', 'pbody');
    var stats = el('div', 'gstats');
    stats.innerHTML =
      '<div class="gstat-main"><div class="k">准时次数</div><div class="v accent" data-f="ontime">0</div></div>' +
      '<div class="gstat-sub">' +
        '<span class="si">尝试<b data-f="tries">0</b></span>' +
        '<span class="si">准时率<b data-f="rate">0%</b></span>' +
      '</div>';
    body.appendChild(stats);
    var disp = el('div', 'alarm-display');
    disp.innerHTML =
      '<div class="a-clock" data-f="clock"><i class="a-hh"></i><i class="a-mh"></i></div>' +
      '<div class="alarm-now" data-f="now">--:--:--</div>' +
      '<div class="alarm-row"><span class="k">目标时间</span><span class="v" data-f="target">--:--:--</span></div>' +
      '<div class="alarm-cd" data-f="cd">--:--</div>' +
      '<div class="alarm-result" data-f="res">闹钟将在设定时间响铃，响了就按下去</div>';
    body.appendChild(disp);
    body.style.display = 'flex'; body.style.flexDirection = 'column';
    disp.style.marginTop = 'auto'; disp.style.marginBottom = 'auto';
    v.appendChild(body);
    var foot = el('div', 'pfoot');
    var ring = el('button', 'ring-btn', '响铃');
    ring.setAttribute('data-sfx', 'none');   /* 结果音由 finish() 发（准时 / 晚了），不叠点击音 */
    var retryBtn = el('button', 'ring-btn alarm-retry', '再来一次');
    retryBtn.style.display = 'none';
    foot.appendChild(ring);
    foot.appendChild(retryBtn);
    v.appendChild(foot);

    var S = statGet('alarm', { onTime: 0, attempts: 0 });
    function setStat(f, val) {
      var n = stats.querySelector('[data-f="' + f + '"]');
      if (n) { n.textContent = val; }
    }
    function refresh() {
      setStat('ontime', S.onTime);
      setStat('tries', S.attempts);
      setStat('rate', (S.attempts ? Math.round(S.onTime * 100 / S.attempts) : 0) + '%');
    }
    function setTarget(retry) {
      alarmState.target = alarmNextTarget(new Date(), retry).getTime();
      alarmState.ringing = false;
      alarmState.result = null;
      alarmState.done = false;
      disp.querySelector('[data-f="target"]').textContent = alarmHMS(new Date(alarmState.target));
      disp.querySelector('[data-f="res"]').textContent = '闹钟将在设定时间响铃，响了就按下去';
      ring.style.display = '';
      retryBtn.style.display = 'none';
      ring.disabled = true;
      ring.classList.remove('ringing');
    }
    function finish(onTime, msg) {
      S.attempts += 1;
      if (onTime) { S.onTime += 1; }
      statPut('alarm', S);
      refresh();
      sfxPlay(onTime ? 'ok' : 'lose');   /* 无论手动按下还是错过窗口自动判晚，都给结果音 */
      alarmState.result = onTime ? 'onTime' : 'late';
      alarmState.ringing = false;
      alarmState.done = true;
      ring.disabled = true;
      ring.classList.remove('ringing');
      disp.querySelector('[data-f="res"]').textContent = msg;
      ring.style.display = 'none';
      retryBtn.style.display = '';
    }
    ring.addEventListener('click', function () {
      if (!alarmState.ringing || alarmState.done) { return; }
      var delta = Date.now() - alarmState.target;
      var on = delta >= -500 && delta <= 500;
      finish(on, on ? ALARM_TXT.onTime : ('偏差 ' + (Math.abs(delta) / 1000).toFixed(1) + ' 秒，' + ALARM_TXT.late));
    });
    retryBtn.addEventListener('click', function () { setTarget(true); });
    alarmView = disp;
    alarmFinish = finish; /* 暴露给模块级心跳（错过窗口自动判晚） */
    /* 视图缓存复用：每次重新进入都发一个新鲜目标（否则旧窗口早已错过） */
    v.onShow = function () { setTarget(false); };
    setTarget(false);
    refresh();
    return v;
  }
  /* 100ms 心跳（v1 同款精度）：刷新时钟/倒计时、开/关响铃窗口、错过窗口自动判晚 */
  function alarmTick() {
    if (!alarmView || current !== 'alarm' || alarmState.target === 0) { return; }
    var now = Date.now();
    var nowNode = alarmView.querySelector('[data-f="now"]');
    if (nowNode) { nowNode.textContent = alarmHMS(new Date(now)); }
    var clock = alarmView.querySelector('[data-f="clock"]');
    if (clock) {
      var d = new Date(now);
      var hh = clock.querySelector('.a-hh');
      var mh = clock.querySelector('.a-mh');
      if (hh) { hh.style.transform = 'rotate(' + ((d.getHours() % 12) * 30 + d.getMinutes() * 0.5) + 'deg)'; }
      if (mh) { mh.style.transform = 'rotate(' + (d.getMinutes() * 6) + 'deg)'; }
    }
    var cd = alarmView.querySelector('[data-f="cd"]');
    var rem = Math.max(0, Math.ceil((alarmState.target - now) / 1000));
    if (cd) {
      cd.textContent = pad(Math.floor(rem / 60)) + ':' + pad(rem % 60);
      cd.style.color = (rem <= 5 && rem > 0) ? 'var(--warn)' : 'var(--accent)';
    }
    if (alarmState.done) { return; }
    var delta = now - alarmState.target;
    var inWin = delta >= -500 && delta <= 500;
    var ringBtn = document.querySelector('.ring-btn');
    if (inWin) {
      if (!alarmState.ringing) {
        alarmState.ringing = true;
        if (ringBtn) { ringBtn.disabled = false; ringBtn.classList.add('ringing'); }
      }
    } else if (delta > 500) {
      /* 窗口已过仍未按：自动记一次「晚了」（v1 行为）。
         判定用 delta 而不是 alarmState.ringing —— 否则「目标设下时窗口就已过去」
         （如 :00.6 打开闹钟，目标对齐到已过的 :00）两条分支都不命中：按钮永远按不动、
         也不会自动判晚，玩家卡死。 */
      if (alarmFinish) { alarmFinish(false, ALARM_TXT.late); }
    }
    /* 窗口内每秒补一声：响铃是持续事件，一次提示音在嘈杂环境里听不见 */
    if (alarmState.ringing) {
      if (!alarmBeepAt || now - alarmBeepAt >= 1000) { alarmBeepAt = now; sfxPlay('alarm'); }
    } else { alarmBeepAt = 0; }
  }

  /* ---------- 日历·扫雷（v1 还原）：7 列 × 5/5/6 行，5/8/12 雷，首点 3×3 安全 ---------- */
  var MS_CFG = {
    easy: { rows: 5, mines: 5, base: 20, name: '简单' },
    medium: { rows: 5, mines: 8, base: 35, name: '中等' },
    hard: { rows: 6, mines: 12, base: 55, name: '困难' }
  };
  var calView = null;
  function buildCal() {
    var COLS = 7;
    var v = el('div', 'view hidden');
    v.appendChild(el('div', 'phead', '<h1>日历</h1>'));
    var body = el('div', 'pbody cal-body');
    /* 纵向 flex：棋盘卡 margin 上下 auto，在剩余空间里垂直居中（消除中段空洞） */
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    var stats = el('div', 'gstats');
    stats.innerHTML =
      '<div class="gstat-main"><div class="k">分数</div><div class="v accent" data-f="score">0</div></div>' +
      '<div class="gstat-sub">' +
        '<span class="si">最高<b data-f="best">0</b></span>' +
        '<span class="si">胜率<b data-f="win">0%</b></span>' +
        '<span class="si">最快<b class="combo" data-f="fast">--:--</b></span>' +
      '</div>';
    body.appendChild(stats);
    var banner = el('div', 'ms-banner', '');
    body.appendChild(banner);
    var meta = el('div', 'ms-meta');
    meta.innerHTML =
      '<div class="grp"><span class="k">用时</span><span class="v" data-f="time">00:00</span></div>' +
      '<div class="grp"><span class="k">剩余雷</span><span class="v" data-f="mines">8</span></div>';
    var flagMini = el('button', 'flag-mini', '标旗模式');
    meta.appendChild(flagMini);
    body.appendChild(meta);
    var card = el('div', 'ms-card');
    var week = el('div', 'ms-week',
      '<span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span>');
    card.appendChild(week);
    var grid = el('div', 'ms-grid');
    card.appendChild(grid);
    body.appendChild(card);
    v.appendChild(body);
    var foot = el('div', 'pfoot');
    var frow = el('div', 'ms-foot');
    foot.appendChild(frow);
    v.appendChild(foot);
    var MS_GAP = 6; /* 与 .ms-week / .ms-grid 的 grid-gap 保持一致 */

    var S = statGet('cal', { score: 0, highScore: 0, winRate: 0, rounds: 0, fastest: 999 });
    var diff = 'medium';
    var flagMode = false;
    var state = 'ready'; /* ready | playing | won | lost */
    var startTs = 0;
    var board = [];
    var cells = [];
    var flags = 0;
    var pressTimer = null;
    var N = 0;

    function cfg() { return MS_CFG[diff]; }
    function setStat(f, val) {
      var n = v.querySelector('[data-f="' + f + '"]');
      if (n) { n.textContent = val; }
    }
    function mmss(s) { return pad(Math.floor(s / 60)) + ':' + pad(s % 60); }
    function refresh() {
      setStat('score', S.score);
      setStat('best', S.highScore);
      setStat('win', Math.round(S.winRate * 100) + '%');
      setStat('fast', S.fastest < 999 ? mmss(S.fastest) : '--:--');
      setStat('mines', cfg().mines - flags);
    }
    /* 日历整屏摆下（真机日历观感，不上下翻页）：格子是正方形（padding-top:100%），
       所以缩棋盘宽度即等比缩高度。棋盘可用高度可直接算出（内容区高 − 其余各行占高），
       一次到位、不依赖滚动溢出量。只缩不放：宽屏保持自然尺寸。列宽/表头共用同一宽度，
       保证星期表头与列对齐。 */
    function outerH(node) { /* 元素占高（含上下外边距；卡片用 auto 外边距，故不参与相加） */
      var s = getComputedStyle(node);
      return node.offsetHeight + parseFloat(s.marginTop) + parseFloat(s.marginBottom);
    }
    function fitBoard() {
      if (body.clientHeight <= 0) { return; } /* 视图尚未上屏（display:none）不测量 */
      week.style.width = '';
      grid.style.width = '';
      var rows = cfg().rows;
      var natCol = Math.floor((grid.offsetWidth - 6 * MS_GAP) / 7); /* 自然列宽 = 正方形边长 */
      var bs = getComputedStyle(body);
      var used = outerH(stats) + outerH(banner) + outerH(meta)
               + (card.offsetHeight - grid.offsetHeight) /* 卡片边框/内边距/星期条：与棋盘高无关 */
               + parseFloat(bs.paddingTop) + parseFloat(bs.paddingBottom);
      var col = Math.floor((body.clientHeight - used - (rows - 1) * MS_GAP) / rows);
      if (col >= natCol) { return; } /* 装得下：保持自然正方形尺寸 */
      if (col < 14) { col = 14; } /* 兜底：极小屏不再缩，避免格子消失 */
      var w = 7 * col + 6 * MS_GAP;
      week.style.width = w + 'px';
      grid.style.width = w + 'px';
    }
    function paint(idx) {
      var b = board[idx];
      var cell = cells[idx];
      var inner = cell.children[0];
      cell.classList.remove('flag');
      cell.classList.remove('mine');
      if (b.flagged) {
        cell.classList.add('flag');
        inner.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 2h2v20H6V2zm4 1h8l-2 3 2 3h-8V3z"/></svg>';
        return;
      }
      if (!b.opened) {
        inner.innerHTML = '<span class="dnum">' + (idx + 1) + '</span>';
        return;
      }
      cell.classList.add('rev');
      if (b.mine) {
        cell.classList.add('mine');
        inner.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm-1-5h2v3h-2V1zm0 19h2v3h-2v-3zM1 11h3v2H1v-2zm19 0h3v2h-3v-2zM4.2 4.2l1.4-1.4 2.1 2.1-1.4 1.4L4.2 4.2zm12.1 12.1l1.4-1.4 2.1 2.1-1.4 1.4-2.1-2.1zM19.8 4.2l-2.1 2.1-1.4-1.4 2.1-2.1 1.4 1.4zM7.7 16.3l-2.1 2.1-1.4-1.4 2.1-2.1 1.4 1.4z"/></svg>';
        return;
      }
      if (b.adj > 0) {
        inner.innerHTML = '<b class="ms-n' + Math.min(b.adj, 6) + '">' + b.adj + '</b>';
      } else {
        inner.innerHTML = '';
      }
    }
    function reset() {
      var rows = cfg().rows;
      N = rows * COLS;
      state = 'ready';
      startTs = 0;
      flags = 0;
      board = [];
      cells = [];
      var i;
      for (i = 0; i < N; i++) { board.push({ mine: false, opened: false, flagged: false, adj: 0 }); }
      grid.innerHTML = '';
      for (i = 0; i < N; i++) {
        (function (idx) {
          var c = el('button', 'ms-cell');
          c.setAttribute('data-sfx', 'none');   /* 开格 / 插旗 / 踩雷的音各不相同，由动作自己发 */
          c.appendChild(el('i'));
          bindCell(c, idx);
          grid.appendChild(c);
          cells[idx] = c;
          paint(idx);
        })(i);
      }
      banner.textContent = (N === 42 ? CAL_TXT.headerHard : CAL_TXT.header) + ' · 点任意日期开始排雷';
      setStat('time', '00:00');
      refresh();
      fitBoard(); /* 行数随难度变化 + 提示文案可能折行，重新核算棋盘宽度 */
    }
    function flood(idx) {
      var rows = cfg().rows;
      var stack = [idx];
      while (stack.length) {
        var i = stack.pop();
        var b = board[i];
        if (b.opened || b.flagged || b.mine) { continue; }
        b.opened = true;
        paint(i);
        if (b.adj === 0) {
          var r = Math.floor(i / COLS), c = i % COLS, dr, dc;
          for (dr = -1; dr <= 1; dr++) {
            for (dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) { continue; }
              var rr = r + dr, cc = c + dc;
              if (rr < 0 || cc < 0 || rr >= rows || cc >= COLS) { continue; }
              stack.push(rr * COLS + cc);
            }
          }
        }
      }
    }
    function allSafeOpened() {
      var i;
      for (i = 0; i < N; i++) {
        if (!board[i].mine && !board[i].opened) { return false; }
      }
      return true;
    }
    function win() {
      state = 'won';
      sfxPlay('win');
      var secs = Math.round((Date.now() - startTs) / 1000);
      var gain = cfg().base + (secs < 60 ? 10 : 0);
      S.score += gain;
      S.highScore = Math.max(S.highScore, S.score);
      S.winRate = (S.winRate * S.rounds + 1) / (S.rounds + 1);
      S.rounds += 1;
      S.fastest = Math.min(S.fastest, secs);
      statPut('cal', S);
      refresh();
      banner.textContent = CAL_TXT.winTitle + '（+' + gain + '，用时 ' + secs + ' 秒' + (secs < 60 ? '，提速奖励 +10' : '') + '）· ' + CAL_TXT.winMessage;
      fitBoard(); /* 结算文案更长可能折行：重新核算棋盘宽度 */

    }
    function lose(boomIdx) {
      state = 'lost';
      var i;
      for (i = 0; i < N; i++) {
        var b = board[i];
        if (b.mine || (b.flagged && !b.mine)) { b.opened = true; paint(i); }
      }
      if (boomIdx >= 0) { cells[boomIdx].classList.add('boom'); }
      S.winRate = (S.winRate * S.rounds) / (S.rounds + 1);
      S.rounds += 1;
      statPut('cal', S);
      refresh();
      banner.textContent = CAL_TXT.loseTitle + ' · ' + CAL_TXT.loseMessage;
      fitBoard();

    }
    function toggleFlag(idx) {
      if (state === 'won' || state === 'lost') { return; }
      var b = board[idx];
      if (b.opened) { return; }
      sfxPlay('flag');
      b.flagged = !b.flagged;
      flags += b.flagged ? 1 : -1;
      paint(idx);
      refresh();
    }
    function reveal(idx) {
      if (state === 'won' || state === 'lost') { return; }
      var b = board[idx];
      if (b.opened || b.flagged) { return; }
      if (state === 'ready') {
        /* 首点布雷：避开首点 3×3（v1 规则），并预计算邻雷数 */
        var rows = cfg().rows;
        var placed = 0;
        while (placed < cfg().mines) {
          var i = Math.floor(Math.random() * N);
          var r0 = Math.floor(idx / COLS), c0 = idx % COLS;
          var rr = Math.floor(i / COLS), cc = i % COLS;
          if (board[i].mine || (Math.abs(rr - r0) <= 1 && Math.abs(cc - c0) <= 1)) { continue; }
          board[i].mine = true;
          placed += 1;
        }
        var r, c, dr, dc;
        for (r = 0; r < rows; r++) {
          for (c = 0; c < COLS; c++) {
            var n = 0;
            for (dr = -1; dr <= 1; dr++) {
              for (dc = -1; dc <= 1; dc++) {
                var ar = r + dr, ac = c + dc;
                if (ar < 0 || ac < 0 || ar >= rows || ac >= COLS) { continue; }
                if (board[ar * COLS + ac].mine) { n += 1; }
              }
            }
            board[r * COLS + c].adj = n;
          }
        }
        state = 'playing';
        startTs = Date.now();
      }
      if (b.mine) {
        b.opened = true;
        paint(idx);
        sfxPlay('boom');
        lose(idx);
        return;
      }
      sfxPlay('flip');
      flood(idx);
      if (allSafeOpened()) { win(); }
    }
    function bindCell(c, idx) {
      c.addEventListener('click', function () {
        if (pressTimer) { return; } /* 长按已处理 */
        if (flagMode) { toggleFlag(idx); } else { reveal(idx); }
      });
      c.addEventListener('contextmenu', function (ev) {
        ev.preventDefault();
        toggleFlag(idx);
      });
      c.addEventListener('pointerdown', function () {
        pressTimer = global.setTimeout(function () {
          pressTimer = null;
          toggleFlag(idx);
        }, 400);
      });
      function cancel() {
        if (pressTimer) { global.clearTimeout(pressTimer); pressTimer = null; }
      }
      c.addEventListener('pointerup', cancel);
      c.addEventListener('pointerleave', cancel);
      c.addEventListener('pointercancel', cancel);
    }

    ['easy', 'medium', 'hard'].forEach(function (d) {
      var b = el('button', 'diff-btn' + (d === 'medium' ? ' sel' : ''), MS_CFG[d].name);
      b.addEventListener('click', function () {
        diff = d;
        var j, btns = frow.querySelectorAll('.diff-btn');
        for (j = 0; j < btns.length; j++) { btns[j].classList.remove('sel'); }
        b.classList.add('sel');
        reset();
      });
      frow.appendChild(b);
    });
    flagMini.addEventListener('click', function () {
      flagMode = !flagMode;
      if (flagMode) { flagMini.classList.add('on'); flagMini.textContent = '🚩 标旗中'; }
      else { flagMini.classList.remove('on'); flagMini.textContent = '标旗模式'; }
    });

    calView = { tick: function () {
      if (state === 'playing') {
        var s = Math.min(999, Math.round((Date.now() - startTs) / 1000));
        setStat('time', mmss(s));
      }
    } };
    /* 进入本页时可见尺寸才有效（视图缓存复用，尺寸可能已变），以及旋屏后重算 */
    v.onShow = fitBoard;
    global.addEventListener('resize', function () {
      if (current === 'calendar') { fitBoard(); }
    });
    reset();
    return v;
  }

  /* ---------- v1 数据还原（从 archive/v1 构建产物提取，恶搞文案为产品设定） ---------- */
  var QUIZ = [{q:"中国的首都是？",options:["北京","上海","广州","深圳"],a:0},{q:"太阳从哪个方向升起？",options:["东","西","南","北"],a:0},{q:"水的化学式是？",options:["H2O","CO2","O2","NaCl"],a:0},{q:"世界上最大的海洋是？",options:["太平洋","大西洋","印度洋","北冰洋"],a:0},{q:"一年有几个季节？",options:["4","3","5","6"],a:0},{q:"人体最大的器官是？",options:["皮肤","肝脏","心脏","大脑"],a:0},{q:"中国最长的河流是？",options:["长江","黄河","珠江","黑龙江"],a:0},{q:"蜜蜂蜇人后会怎样？",options:["死亡","继续活着","变成蜜蜂人","飞走"],a:0},{q:"彩虹有几种颜色？",options:["7","6","5","8"],a:0},{q:"月球绕着哪个星球转？",options:["地球","太阳","火星","金星"],a:0},{q:"人类有多少颗牙齿？",options:["32","28","30","36"],a:0},{q:"哪个国家被称为樱花之国？",options:["日本","韩国","中国","泰国"],a:0},{q:"光速大约是多少？",options:["30万公里/秒","15万公里/秒","50万公里/秒","100万公里/秒"],a:0},{q:"人体血液是什么颜色？",options:["红色","蓝色","绿色","黄色"],a:0},{q:"哪个行星被称为红色星球？",options:["火星","金星","木星","土星"],a:0},{q:"中国有多少个自治区？",options:["5","4","6","7"],a:0},{q:"企鹅生活在哪个洲？",options:["南极洲","北极洲","非洲","亚洲"],a:0},{q:"哪个动物被称为沙漠之舟？",options:["骆驼","马","驴","骡子"],a:0},{q:"人体最硬的部位是？",options:["牙齿","骨头","指甲","软骨"],a:0},{q:"哪个季节白天最长？",options:["夏","春","秋","冬"],a:0},{q:"中国最高的山峰是？",options:["珠穆朗玛峰","乔戈里峰","干城章嘉峰","洛子峰"],a:0},{q:"哪个国家发明了造纸术？",options:["中国","埃及","希腊","印度"],a:0},{q:"人如果不喝水能活几天？",options:["3-5天","1天","10天","半个月"],a:0},{q:"哪个水果被称为水果之王？",options:["榴莲","苹果","香蕉","橙子"],a:0},{q:"地球的自转方向是？",options:["自西向东","自东向西","自南向北","自北向南"],a:0},{q:"哪个季节下雪？",options:["冬","夏","春","秋"],a:0},{q:"人体最大的肌肉是？",options:["臀大肌","胸肌","腹肌","肱二头肌"],a:0},{q:"哪个城市是中国的金融中心？",options:["上海","北京","深圳","广州"],a:0},{q:"蜘蛛有几条腿？",options:["8","6","10","4"],a:0},{q:"哪个星球离地球最近？",options:["金星","火星","水星","木星"],a:0},{q:"中国有多少个直辖市？",options:["4","3","5","6"],a:0},{q:"哪个动物跑得最快？",options:["猎豹","狮子","老虎","豹"],a:0},{q:"人体有多少块骨头？",options:["206","208","200","210"],a:0},{q:"哪个季节叶子会变黄落下？",options:["秋","春","夏","冬"],a:0},{q:"中国最长的城墙是？",options:["长城","南京城墙","西安城墙","平遥古城"],a:0},{q:"哪个国家有千岛之国之称？",options:["印尼","日本","菲律宾","马来西亚"],a:0},{q:"人眨眼一次大约多长时间？",options:["0.3秒","1秒","0.1秒","5秒"],a:0},{q:"哪个行星最大？",options:["木星","土星","天王星","海王星"],a:0},{q:"中国最大的沙漠是？",options:["塔克拉玛干","库页林","巴丹吉林","鸣沙山"],a:0},{q:"哪个动物被称为国宝？",options:["熊猫","金丝猴","白鳍豚","扬子鳄"],a:0},{q:"人体最大的淋巴器官是？",options:["脾脏","肝脏","肾脏","心脏"],a:0},{q:"哪个季节白天最短？",options:["冬","夏","春","秋"],a:0},{q:"中国最大的淡水湖是？",options:["鄱阳湖","洞庭湖","太湖","洪泽湖"],a:0},{q:"哪个国家有玫瑰之国之称？",options:["保加利亚","法国","土耳其","意大利"],a:0},{q:"人一生大约心跳多少次？",options:["25亿次","10亿次","50亿次","1亿次"],a:0},{q:"地球的年龄大约是？",options:["46亿年","10亿年","100亿年","1亿年"],a:0},{q:"哪个城市被称为东方之珠？",options:["香港","上海","东京","新加坡"],a:0},{q:"人体最长的骨头是？",options:["股骨","胫骨","肱骨","尺骨"],a:0},{q:"哪个季节是播种的季节？",options:["春","夏","秋","冬"],a:0},{q:"中国最大的岛屿是？",options:["台湾岛","海南岛","崇明岛","舟山岛"],a:0},{q:"哪个动物记忆力最好？",options:["大象","海豚","黑猩猩","狗"],a:0},{q:"人体最小的细胞是？",options:["血小板","红细胞","白细胞","卵细胞"],a:0},{q:"哪个行星有美丽的光环？",options:["土星","木星","天王星","海王星"],a:0},{q:"中国最热的城市是？",options:["吐鲁番","重庆","武汉","南京"],a:0},{q:"哪个动物是群居动物？",options:["狼","老虎","豹","熊"],a:0},{q:"人每天需要睡多少小时？",options:["7-8小时","5小时","10小时","12小时"],a:0},{q:"哪个季节容易发生洪涝？",options:["夏","春","秋","冬"],a:0},{q:"中国最冷的城市是？",options:["漠河","哈尔滨","长春","沈阳"],a:0},{q:"哪个国家有足球王国之称？",options:["巴西","阿根廷","德国","意大利"],a:0},{q:"人体最大的腺体是？",options:["肝脏","胰腺","甲状腺","唾液腺"],a:0},{q:"哪个行星被称为启明星？",options:["金星","木星","水星","火星"],a:0},{q:"中国最大的盆地是？",options:["塔里木盆地","准噶尔盆地","柴达木盆地","四川盆地"],a:0},{q:"哪个动物跑得最慢？",options:["树懒","蜗牛","乌龟","海马"],a:0},{q:"人一年大约呼吸多少次？",options:["2000万次","500万次","5000万次","1亿次"],a:0},{q:"哪个季节是收获的季节？",options:["秋","春","夏","冬"],a:0},{q:"中国最长的铁路是？",options:["京九铁路","京沪铁路","陇海铁路","浙赣铁路"],a:0},{q:"哪个国家有枫叶之国之称？",options:["加拿大","美国","俄罗斯","芬兰"],a:0},{q:"人体最大的免疫器官是？",options:["脾脏","胸腺","淋巴结","骨髓"],a:0},{q:"哪个行星自转最快？",options:["木星","土星","天王星","海王星"],a:0},{q:"中国最大的草原是？",options:["内蒙古草原","新疆草原","青海草原","西藏草原"],a:0},{q:"哪个动物视力最好？",options:["鹰","猫","狗","鱼"],a:0},{q:"人一生大约吃多少食物？",options:["60吨","30吨","100吨","10吨"],a:0},{q:"哪个季节最容易感冒？",options:["冬春","夏","秋","冬"],a:0},{q:"中国最大的瀑布是？",options:["黄果树瀑布","壶口瀑布","吊水楼瀑布","诺日朗瀑布"],a:0},{q:"哪个国家有运河之国之称？",options:["荷兰","巴拿马","埃及","泰国"],a:0},{q:"人体最细的血管是？",options:["毛细血管","动脉","静脉","淋巴管"],a:0},{q:"哪个行星卫星最多？",options:["土星","木星","天王星","海王星"],a:0},{q:"中国最大的林区是？",options:["东北林区","西南林区","东南林区","西北林区"],a:0},{q:"哪个动物嗅觉最灵敏？",options:["狗","猪","猫","马"],a:0},{q:"人一生大约喝多少水？",options:["60吨","30吨","100吨","10吨"],a:0}];
  var AI_GREET = ["你好，我是人工智能助手。有什么可以帮您的？算了，还是我先考您一个问题吧。","欢迎使用人工智能助手！虽然我不太智能，但还是想问您几个问题。","您好！我是 AI 助手——虽然名字里有人工智能，但智商嘛...咱们走着瞧。","你好呀！让我来考考你的常识水平吧，别担心，我会让你一点的...才怪。"];
  var AI_RIGHT = ["居然答对了，这不在我的预测模型里。","哼，运气不错而已。","好吧，这题让你蒙对了。","勉强及格吧，不值得骄傲。","哼，算你厉害。","哟，可以嘛小看您了。","恭喜你，答对了！虽然我很不想承认。","这个...我确实没料到你會對。"];
  var AI_WRONG = ["答错了。正确答案是 {answer}——别担心，我的知识库也是猜的。","错！正确答案是 {answer}。我的 CPU 烧坏了。","这个答案...只能说你在第五层。正确答案是 {answer}。","哈哈，你掉进我的陷阱了！正确答案是 {answer}。","答错了吧？正确答案是 {answer}。我要是人类，估计也答不对。","这个问题的难度对我 AI 来说太低了，对你来说刚刚好。正确答案是 {answer}。","恭喜你成功避开了所有正确答案！正确答案是 {answer}。","我的训练数据里没有这道题...才怪。正确答案是 {answer}。"];
  var SCHED_POOL = ["9:00 晨会汇报","10:30 客户拜访","11:45 午餐约会","14:00 项目评审","15:30 技术培训","16:45 整理文档","17:30 下班打卡","19:00 健身房锻炼","20:30 看电影","22:00 准备睡觉"];
  var SCHED_DISTRACT = ["开会讨论项目进度","提交季度报告","客户电话会议","团队聚餐","健身锻炼","采购生活用品","银行办理业务","汽车保养","牙齿检查","取快递","缴纳水电费","参加朋友婚礼","公司年会","产品发布会","技术培训","加班写代码","整理文件柜","公司团建","面试候选人","供应商洽谈","市场调研","整理办公桌","参加展会","客户拜访","写工作总结"];
  var SCHED_DIFF = {easy:{count:3,time:10},medium:{count:5,time:8},hard:{count:8,time:5}};
  var SMS_SEED = [{id:1,sender:"助手",content:"经 AI 深度分析，您今天应该……喝水。这项建议价值 ¥0.02",time:"09:00"},{id:2,sender:"未知号码",content:"恭喜您被选中为人工智能体验官！请回复'退订'（反正我们也不会真的退）",time:"10:30"},{id:3,sender:"日程",content:"提醒：您有一个'呼吸'的日程，建议准时参加",time:"11:00"},{id:4,sender:"闹钟",content:"您设置的闹钟已响过，但我们选择没听见",time:"14:00"},{id:5,sender:"系统通知",content:"您的手机电量 1%，建议立即充电——或者接受命运",time:"16:30"}];
  var SMS_REPLY = ["收到，正在思考……思考进度：0.0001%","您的消息已读，但 AI 表示不想回。","我已通知我的程序员，他会考虑的...大概。","消息已收到，排队处理中...前面还有 9999+ 条。","抱歉，我现在忙着发呆，稍后回复。"];
  var CALL_TXT = {callEnded1:"通话结束——对方说了一句听不懂的话就挂了，人工智能翻译模块正在加载中……（预计加载时间：∞）",callEnded2:"恭喜！对方居然听懂了——但您说的什么来着？",dialing:"正在拨打...",connected:"对方已接听",ended:"通话结束"};
  var ALARM_TXT = {onTime:"你比我准时",late:"你和我一样睡过啦？",retry:"再来一次"};
  var CAL_TXT = {header:"本月由 AI 重新排期，共 35 天",headerHard:"本月由 AI 重新排期，共 42 天",loseTitle:"踩中了 AI 埋的加班雷",loseMessage:"本月白干。",winTitle:"本月平安度过",winMessage:"AI 的加班阴谋破产。",restart:"重新排期",nextMonth:"下一月"};
  var ABOUT_TXT = {title:"人工智能Ding🥕",description:"本机名为人工智能，实则全靠人工。AI 负责假装工作，你负责替它干活。",version:"v2.0"};
  /* 相机取景素材（美食 / 猫咪 / 恐龙三套，由 _dev/make_cam_photos.py 派生，
   * 清单在构建时由 _dev/build.py 扫描 ./assets/cam/ 生成，保证与随包文件一致） */
  var CAM_SHOTS = __CAM_SHOTS__;
  var RADAR_LABELS = ["计算力","知识量","记忆力","排雷力","守时度","连击力"];

  /* ---------- 助手（v1 还原）：聊天问答，它不会答你得替它答 ---------- */
  function buildAssistant() {
    var v = el('div', 'view hidden');
    v.appendChild(el('div', 'phead', '<h1>助手</h1>'));
    var body = el('div', 'pbody');
    var stats = el('div', 'gstats');
    stats.innerHTML =
      '<div class="gstat-main"><div class="k">分数</div><div class="v accent" data-f="score">0</div></div>' +
      '<div class="gstat-sub">' +
        '<span class="si">最高<b data-f="best">0</b></span>' +
        '<span class="si">准确率<b data-f="acc">0%</b></span>' +
        '<span class="si">连击<b class="combo" data-f="streak">0</b></span>' +
        '<span class="si">轮次<b data-f="rounds">0</b></span>' +
      '</div>';
    body.appendChild(stats);
    var chat = el('div');
    chat.style.flex = '1 1 auto'; chat.style.minHeight = '0';
    chat.style.display = 'flex'; chat.style.flexDirection = 'column';
    body.style.display = 'flex'; body.style.flexDirection = 'column';
    body.appendChild(chat);
    v.appendChild(body);
    var foot = el('div', 'pfoot');
    var opts = el('div', 'opt-grid');
    foot.appendChild(opts);
    v.appendChild(foot);

    var S = statGet('assistant', { score: 0, highScore: 0, streak: 0, maxStreak: 0, rounds: 0, accuracy: 0, used: [] });
    if (!S.used || !S.used.length) { S.used = []; }
    var cur = null;
    var busy = true;

    function setStat(f, val) { var n = v.querySelector('[data-f="' + f + '"]'); if (n) { n.textContent = val; } }
    function refresh() {
      setStat('score', S.score); setStat('best', S.highScore);
      setStat('streak', S.streak); setStat('rounds', S.rounds);
      setStat('acc', Math.round(S.accuracy * 100) + '%');
    }
    /* 滚到底。注意页脚（选项区）高度会变：选项上屏 → 页脚变高 → 内容区变矮，
       之前滚到的"底部"会被挤下去；故布局变化后必须再贴一次底，并在下一拍补一次。 */
    function scrollBottom() {
      body.scrollTop = body.scrollHeight;
      global.setTimeout(function () { body.scrollTop = body.scrollHeight; }, 0);
    }
    function addBub(who, text) { chat.appendChild(el('div', 'bub ' + who, text)); scrollBottom(); }
    function aiSay(text, after) {
      var t = el('div', 'bub ai typing', '<i></i><i></i><i></i>');
      chat.appendChild(t); scrollBottom();
      global.setTimeout(function () {
        chat.removeChild(t);
        addBub('ai', text);
        sfxPlay('msg');   /* 气泡落屏 = 收到一条消息，与短信同一条音 */
        if (after) { global.setTimeout(after, 900); }
      }, 1500);
    }
    function nextQ() {
      var avail = [], i;
      for (i = 0; i < QUIZ.length; i++) { if (S.used.indexOf(i) < 0) { avail.push(i); } }
      if (!avail.length) {
        S.used = []; statPut('assistant', S);
        for (i = 0; i < QUIZ.length; i++) { avail.push(i); }
      }
      var qi = avail[Math.floor(Math.random() * avail.length)];
      cur = { idx: qi, q: QUIZ[qi] };
      aiSay(cur.q.q, function () {
        opts.innerHTML = '';
        cur.q.options.forEach(function (txt, k) {
          var b = el('button', 'opt', txt);
          b.setAttribute('aria-label', '选项 ' + txt);
          b.addEventListener('click', function () { answer(k); });
          opts.appendChild(b);
        });
        busy = false;
        scrollBottom(); /* 选项上屏后页脚变高、内容区变矮：必须重新贴底，否则最新一条被截 */
      });
    }
    function answer(k) {
      if (!cur || busy) { return; }
      busy = true;
      opts.innerHTML = '';
      var right = k === cur.q.a;
      sfxPlay(right ? 'ok' : 'wrong');
      addBub('me', cur.q.options[k]);
      S.rounds += 1;
      if (right) {
        S.streak += 1; S.score += 10;
        if (S.streak >= 3) { S.score += 5; }
        if (S.streak > S.maxStreak) { S.maxStreak = S.streak; }
      } else {
        S.streak = 0; S.score = Math.max(0, S.score - 5);
      }
      S.accuracy = (S.accuracy * (S.rounds - 1) + (right ? 1 : 0)) / S.rounds;
      S.highScore = Math.max(S.highScore, S.score);
      S.used.push(cur.idx);
      statPut('assistant', S);
      refresh();
      var msg = right
        ? AI_RIGHT[Math.floor(Math.random() * AI_RIGHT.length)]
        : AI_WRONG[Math.floor(Math.random() * AI_WRONG.length)].replace('{answer}', cur.q.options[cur.q.a]);
      global.setTimeout(function () {
        aiSay(msg, function () { cur = null; nextQ(); });
      }, 500);
    }
    aiSay(AI_GREET[Math.floor(Math.random() * AI_GREET.length)], nextQ);
    refresh();
    return v;
  }

  /* ---------- 日程（v1 还原）：记忆倒计时 + 逐条四选一 ---------- */
  function buildSchedule() {
    var v = el('div', 'view hidden');
    v.appendChild(el('div', 'phead', '<h1>日程</h1>'));
    var body = el('div', 'pbody');
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    var stats = el('div', 'gstats');
    stats.innerHTML =
      '<div class="gstat-main"><div class="k">分数</div><div class="v accent" data-f="score">0</div></div>' +
      '<div class="gstat-sub">' +
        '<span class="si">最高<b data-f="best">0</b></span>' +
        '<span class="si">准确率<b data-f="acc">0%</b></span>' +
        '<span class="si">轮次<b data-f="rounds">0</b></span>' +
      '</div>';
    body.appendChild(stats);
    var stage = el('div', 'sched-stage');
    body.appendChild(stage);
    v.appendChild(body);
    var foot = el('div', 'pfoot');
    v.appendChild(foot);

    var S = statGet('schedule', { score: 0, highScore: 0, accuracy: 0, rounds: 0 });
    var items = []; var pos = 0; var correct = 0; var secs = 0; var timer = null; var curDiff = 'medium';

    function setStat(f, val) { var n = v.querySelector('[data-f="' + f + '"]'); if (n) { n.textContent = val; } }
    function refresh() {
      setStat('score', S.score); setStat('best', S.highScore);
      setStat('acc', Math.round(S.accuracy * 100) + '%'); setStat('rounds', S.rounds);
    }
    function pick(diff) {
      var cfg = SCHED_DIFF[diff];
      return SCHED_POOL.slice().sort(function () { return Math.random() - 0.5; }).slice(0, cfg.count)
        .sort(function (a, b) {
          var A = a.split(' ')[0].split(':'), B = b.split(' ')[0].split(':');
          return (+A[0] * 60 + +A[1]) - (+B[0] * 60 + +B[1]);
        })
        .map(function (r) { var p = r.split(' '); return { time: p[0], event: p.slice(1).join(' ') }; });
    }
    function optionsFor(item) {
      var others = items.filter(function (x) { return x.event !== item.event; }).map(function (x) { return x.event; });
      var pool = SCHED_DISTRACT.filter(function (x) { return x !== item.event; });
      var all = others.concat(pool).sort(function () { return Math.random() - 0.5; });
      return [item.event].concat(all.slice(0, 3)).sort(function () { return Math.random() - 0.5; });
    }
    function showSelect() {
      stage.innerHTML = '';
      var box = el('div', 'sched-block');
      box.appendChild(el('div', 'recall-q', '选择难度'));
      box.appendChild(el('div', 'recall-sub', '记住日程 → 回忆考验，看看你比 AI 强多少'));
      stage.appendChild(box);
      foot.innerHTML = '';
      var frow = el('div', 'ms-foot');
      [['easy', '简单'], ['medium', '中等'], ['hard', '困难']].forEach(function (d) {
        var b = el('button', 'diff-btn' + (curDiff === d[0] ? ' sel' : ''), d[1]);
        b.addEventListener('click', function () { curDiff = d[0]; start(d[0]); });
        frow.appendChild(b);
      });
      foot.appendChild(frow);
    }
    function start(d) {
      items = pick(d); pos = 0; correct = 0; secs = SCHED_DIFF[d].time;
      stage.innerHTML = '';
      var box = el('div', 'sched-block');
      box.appendChild(el('div', 'recall-q', '记住以下日程'));
      var cd = el('div', 'recall-cd', secs + ' 秒后开始考验你');
      box.appendChild(cd);
      var list = el('div', 'sched-list');
      items.forEach(function (it) {
        list.appendChild(el('div', 'sitem', '<span class="t">' + it.time + '</span><span class="e">' + it.event + '</span>'));
      });
      box.appendChild(list);
      stage.appendChild(box);
      foot.innerHTML = '<div class="pfoot-hint">AI 排的日程，AI 自己都记不住</div>';
      if (timer) { clearInterval(timer); }
      timer = global.setInterval(function () {
        secs -= 1;
        cd.textContent = secs + ' 秒后开始考验你';
        if (secs <= 0) { clearInterval(timer); sfxPlay('tick'); showRecall(); }
      }, 1000);
    }
    function showRecall() {
      var it = items[pos];
      stage.innerHTML = '';
      var box = el('div', 'sched-block');
      box.appendChild(el('div', 'recall-sub', (pos + 1) + ' / ' + items.length));
      box.appendChild(el('div', 'recall-q', it.time + ' 做什么？'));
      stage.appendChild(box);
      foot.innerHTML = '';
      var grid = el('div', 'opt-grid');
      optionsFor(it).forEach(function (txt) {
        var b = el('button', 'opt', txt);
        b.addEventListener('click', function () {
          sfxPlay(txt === it.event ? 'ok' : 'wrong');
          if (txt === it.event) { correct += 1; }
          pos += 1;
          if (pos < items.length) { showRecall(); } else { finish(); }
        });
        grid.appendChild(b);
      });
      foot.appendChild(grid);
    }
    function finish() {
      var gain = correct * 5 + (correct === items.length ? 10 : 0);
      if (correct === items.length) { sfxPlay('win'); }
      S.score += gain;
      S.highScore = Math.max(S.highScore, S.score);
      S.accuracy = (S.accuracy * S.rounds + correct / items.length) / (S.rounds + 1);
      S.rounds += 1;
      statPut('schedule', S);
      refresh();
      stage.innerHTML = '';
      var box = el('div', 'sched-block');
      box.appendChild(el('div', 'recall-q', '记住 ' + correct + ' / ' + items.length + ' 条'));
      box.appendChild(el('div', 'recall-sub', '本局 +' + gain + (correct === items.length ? '（全对奖励 +10）' : '')));
      stage.appendChild(box);
      foot.innerHTML = '';
      var act = el('div', 'act-grid');
      var again = el('button', 'act-btn primary', '再来一次');
      again.addEventListener('click', function () { start(curDiff); });
      var back = el('button', 'act-btn ghost', '换难度');
      back.addEventListener('click', showSelect);
      act.appendChild(again); act.appendChild(back);
      foot.appendChild(act);
    }
    showSelect();
    refresh();
    return v;
  }

  /* ---------- 电话（v1 还原）：拨号盘 + 通话状态机 + 通话记录 ---------- */
  function buildPhone() {
    var v = el('div', 'view phone-view hidden');
    v.appendChild(el('div', 'phead', '<h1>电话</h1>'));
    var body = el('div', 'pbody phone-body');
    /* 顶部读数区：拨号回显 / 状态 / 通话计时 / 结束文案。
     * idle 时贴在内容区顶部；通话中整块在剩余空间里垂直居中。 */
    var top = el('div', 'phone-top');
    var disp = el('div', 'dial-display', '请输入号码');
    var status = el('div', 'dial-status', '');
    var timerEl = el('div', 'call-timer', '');
    timerEl.style.display = 'none';
    var endMsg = el('div', 'call-ended-msg', '');
    top.appendChild(disp); top.appendChild(status); top.appendChild(timerEl); top.appendChild(endMsg);
    body.appendChild(top);
    /* 最近通话卡：卡面内嵌独立的滚动容器（全页唯一滚动条） */
    var histCard = el('div', 'card hist-card');
    histCard.appendChild(el('div', 'card-title', '最近通话'));
    var hist = el('div', 'hist-scroll');
    histCard.appendChild(hist);
    body.appendChild(histCard);
    v.appendChild(body);
    var foot = el('div', 'pfoot');
    var pad = el('div', 'dial-pad');
    var actRow = el('div', 'dial-actions');
    var contactsBtn = el('button', 'dial-del', '<svg viewBox="0 0 24 24"><path d="M12 12c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4zm0 2c-4 0-8 2-8 6v2h16v-2c0-4-4-6-8-6z"/></svg>');
    var callBtn = el('button', 'call-btn', '<svg viewBox="0 0 24 24"><path d="M6.6 10.8c1.5 2.9 3.8 5.2 6.7 6.7l2.2-2.2c.3-.3.7-.4 1-.2 1.2.4 2.4.6 3.7.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.7.1.3 0 .7-.2 1l-2.3 2.1z"/></svg>');
    var delBtn = el('button', 'dial-del', '⌫');
    delBtn.setAttribute('data-sfx', 'key');
    callBtn.setAttribute('data-sfx', 'none');   /* 呼叫 / 挂断的音由通话状态机发 */
    actRow.appendChild(contactsBtn); actRow.appendChild(callBtn); actRow.appendChild(delBtn);
    /* 通话结束态：拨号行整行让位给满宽「完成」主 CTA（同日程/日历结算动作的控件语言），
     * 不再把两个字塞进 50px 圆钮里（那既挤又和红色挂断语义打架）。 */
    var doneRow = el('div', 'phone-done');
    var doneBtn = el('button', 'act-btn primary', '完成');
    doneRow.appendChild(doneBtn);
    foot.appendChild(pad); foot.appendChild(actRow); foot.appendChild(doneRow);
    v.appendChild(foot);
    /* 通讯录全屏视图 */
    var CONTACTS = [
      { name: 'AI 助理', num: '10086' },
      { name: '妈妈', num: '13800138000' },
      { name: '老板', num: '13911112222' },
      { name: '外卖小哥', num: '15600001111' },
      { name: '前女友', num: '18888888888' },
      { name: '快递员', num: '13333334444' },
      { name: '客服小美', num: '4001234567' },
      { name: '自己', num: '10000' }
    ];
    var contactsView = el('div', 'contacts-view');
    contactsView.style.display = 'none';
    var cHead = el('div', 'contacts-head');
    var cBack = el('button', 'contacts-back', '‹');
    cHead.appendChild(cBack);
    cHead.appendChild(el('span', '', '<h1 style="font-size:18px;font-weight:600;color:var(--ink);">通讯录</h1>'));
    contactsView.appendChild(cHead);
    var contactsList = el('div', 'contacts-list');
    CONTACTS.forEach(function (c) {
      var row = el('button', 'contact-row');
      /* 点联系人 = 拨号：与 startCall 同一条音，30ms 去重会吃掉重复的那次 */
      row.setAttribute('data-sfx', 'call');
      row.innerHTML = '<span class="contact-ava">' + c.name.charAt(0) + '</span>' +
        '<div><div class="contact-name">' + c.name + '</div><div class="contact-num">' + fmt(c.num) + '</div></div>';
      row.addEventListener('click', function () {
        contactsView.style.display = 'none';
        if (inCall) { return; }
        num = c.num; paintNum(); startCall();
      });
      contactsList.appendChild(row);
    });
    contactsView.appendChild(contactsList);
    v.appendChild(contactsView);

    var num = ''; var inCall = false; var phase = 'idle'; var secs = 0;
    var tDial = null, tDur = null, tEnd = null;
    var records = (function () {
      try { var r = JSON.parse(read('phone_records', '[]')); return Array.isArray(r) ? r : []; } catch (e) { return []; }
    })();

    function pad2(n) { return n < 10 ? '0' + n : '' + n; }
    function fmt(n) {
      if (n.length <= 3) { return n; }
      if (n.length <= 7) { return n.slice(0, 3) + '-' + n.slice(3); }
      return n.slice(0, 3) + '-' + n.slice(3, 7) + '-' + n.slice(7);
    }
    function paintNum() { disp.textContent = num ? fmt(num) : '请输入号码'; disp.style.color = num ? 'var(--ink)' : 'var(--ink-dim)'; }
    function paintHist() {
      hist.innerHTML = '';
      if (!records.length) { hist.appendChild(el('div', 'conv-prev', '还没有通话记录')); return; }
      var hIco = '<svg viewBox="0 0 24 24"><path d="M6.6 10.8c1.5 2.9 3.8 5.2 6.7 6.7l2.2-2.2c.3-.3.7-.4 1-.2 1.2.4 2.4.6 3.7.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.7.1.3 0 .7-.2 1l-2.3 2.1z"/></svg>';
      records.forEach(function (r) {
        var b = el('button', 'hist-row');
        b.setAttribute('data-sfx', 'call');
        b.innerHTML = '<span class="hist-ico">' + hIco + '</span><span>' + fmt(r.number) + '</span><span class="ht">' + r.time + '</span>';
        b.addEventListener('click', function () { if (!inCall) { num = r.number; paintNum(); startCall(); } });
        hist.appendChild(b);
      });
    }
    function clearCallTimers() {
      if (tDial) { clearTimeout(tDial); tDial = null; }
      if (tEnd) { clearTimeout(tEnd); tEnd = null; }
      if (tDur) { clearInterval(tDur); tDur = null; }
    }
    function phoneIcon() { return '<svg viewBox="0 0 24 24"><path d="M6.6 10.8c1.5 2.9 3.8 5.2 6.7 6.7l2.2-2.2c.3-.3.7-.4 1-.2 1.2.4 2.4.6 3.7.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.7.1.3 0 .7-.2 1l-2.3 2.1z"/></svg>'; }
    /* 挂断：Material call_end（听筒朝下的 ∩ 形），与上方的 .call（Material call）同一套图标语言。
     * 原来给一条本来就已经「朝下」的听筒路径又叠了 rotate(135°)，被转成一块斜着的碎块。 */
    function hangupIcon() { return '<svg viewBox="0 0 24 24"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.7l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg>'; }
    /* 通话态开关：拨号后收起键盘与通话记录（CSS 侧 .phone-view.in-call 联动） */
    function setCallMode(on) {
      if (on) { v.classList.add('in-call'); } else { v.classList.remove('in-call'); }
    }
    function connect() {
      phase = 'connected';
      sfxPlay('connect');
      status.textContent = CALL_TXT.connected;
      timerEl.style.display = '';
      secs = 0; timerEl.textContent = '00:00';
      tDur = window.setInterval(function () {
        secs += 1;
        timerEl.textContent = pad2(Math.floor(secs / 60)) + ':' + pad2(secs % 60);
      }, 1000);
      tEnd = global.setTimeout(function () { endCall(false); }, 5000 + Math.random() * 10000);
    }
    function endCall(manual) {
      clearCallTimers();
      sfxPlay('hangup');   /* 手动挂断与自动掉线同一条音 */
      if (manual) { resetCallUi(); return; }
      phase = 'ended';
      timerEl.style.display = 'none';
      status.textContent = CALL_TXT.ended;
      endMsg.textContent = Math.random() < 0.2 ? CALL_TXT.callEnded2 : CALL_TXT.callEnded1;
      var d = new Date();
      records.unshift({ number: num, time: pad2(d.getHours()) + ':' + pad2(d.getMinutes()) });
      records = records.slice(0, 5);
      try { store('phone_records', JSON.stringify(records)); } catch (e) { /* 忽略 */ }
      paintHist();
      v.classList.add('is-ended');
    }
    function resetCallUi() {
      inCall = false; phase = 'idle';
      status.textContent = ''; endMsg.textContent = '';
      timerEl.style.display = 'none';
      paintNum();
      callBtn.classList.remove('hangup');
      callBtn.innerHTML = phoneIcon();
      v.classList.remove('is-ended');
      setCallMode(false);
    }
    function startCall() {
      if (!num || inCall) { return; }
      inCall = true; phase = 'dialing';
      sfxPlay('call');
      endMsg.textContent = '';
      timerEl.style.display = 'none';
      status.textContent = CALL_TXT.dialing;
      disp.textContent = fmt(num);
      callBtn.classList.add('hangup');
      callBtn.innerHTML = hangupIcon();
      v.classList.remove('is-ended');
      setCallMode(true);
      tDial = global.setTimeout(connect, 3000 + Math.random() * 5000);
    }
    var KEY_SUB = { '2': 'ABC', '3': 'DEF', '4': 'GHI', '5': 'JKL', '6': 'MNO', '7': 'PQRS', '8': 'TUV', '9': 'WXYZ' };
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].forEach(function (k) {
      var b = el('button', 'dkey');
      b.setAttribute('data-sfx', 'key');
      if (KEY_SUB[k]) { b.innerHTML = k + '<span class="dkey-sub">' + KEY_SUB[k] + '</span>'; }
      else { b.textContent = k; }
      b.addEventListener('click', function () {
        if (inCall) { return; }
        if (num.length < 11) { num += k; paintNum(); }
      });
      pad.appendChild(b);
    });
    delBtn.addEventListener('click', function () {
      if (inCall) { return; }
      num = num.slice(0, -1); paintNum();
    });
    contactsBtn.addEventListener('click', function () {
      if (inCall) { return; }
      contactsView.style.display = '';
    });
    cBack.addEventListener('click', function () { contactsView.style.display = 'none'; });
    callBtn.addEventListener('click', function () { if (!inCall) { startCall(); return; } endCall(true); });
    doneBtn.addEventListener('click', function () { resetCallUi(); });
    v.onShow = function () { clearCallTimers(); contactsView.style.display = 'none'; setCallMode(false); if (inCall) { resetCallUi(); } };
    paintHist();
    return v;
  }

  /* ---------- 短信（v1 还原）：种子收件箱 + AI 敷衍回复 ---------- */
  function buildSms() {
    var v = el('div', 'view hidden');
    var phead = el('div', 'phead', '<h1>短信</h1>');
    v.appendChild(phead);
    var body = el('div', 'pbody');
    var list = el('div');
    body.appendChild(list);
    var chat = el('div');
    chat.style.display = 'none';
    body.appendChild(chat);
    v.appendChild(body);
    var foot = el('div', 'pfoot');
    var inputRow = el('div', 'sms-input-row');
    inputRow.style.display = 'none';
    var input = el('input', 'sms-input');
    input.placeholder = '回复这条重要消息…';
    var send = el('button', 'sms-send', '发送');
    send.setAttribute('data-sfx', 'none');   /* 发送音由 doSend 发，不叠点击音 */
    inputRow.appendChild(input); inputRow.appendChild(send);
    foot.appendChild(inputRow);
    v.appendChild(foot);

    var msgs = (function () {
      try {
        var m = JSON.parse(read('sms_messages', 'null'));
        if (Array.isArray(m) && m.length) {
          for (var i = 0; i < m.length; i++) { if (!m[i].conv) { m[i].conv = m[i].sender; } }
          return m;
        }
      } catch (e) { /* 忽略 */ }
      var seed = SMS_SEED.map(function (x, i) {
        var o = {}, k;
        for (k in x) { if (Object.prototype.hasOwnProperty.call(x, k)) { o[k] = x[k]; } }
        o.read = false; o.isReply = false; o.conv = x.sender;
        return o;
      });
      try { store('sms_messages', JSON.stringify(seed)); } catch (e) { /* 忽略 */ }
      return seed;
    })();
    var openConv = null;

    function save() { try { store('sms_messages', JSON.stringify(msgs)); } catch (e) { /* 忽略 */ } }
    function paintList() {
      openConv = null;
      phead.querySelector('h1').textContent = '短信';
      chat.style.display = 'none';
      list.style.display = '';
      inputRow.style.display = 'none';
      list.innerHTML = '';
      list.appendChild(el('div', 'sms-banner', "AI 已为您智能分类——全部分到'不重要'文件夹"));
      msgs.filter(function (m) { return !m.isReply && m.sender !== '我'; }).forEach(function (m) {
        var b = el('button', 'conv-row');
        b.innerHTML = '<span class="conv-ava">' + m.sender.charAt(0) + '</span>' +
          '<span class="conv-mid"><span class="conv-name">' + m.sender + '</span>' +
          '<span class="conv-prev">' + m.content + '</span></span>' +
          '<span class="conv-time">' + m.time + '</span>' +
          (m.read ? '' : '<span class="conv-unread"></span>');
        b.addEventListener('click', function () { openChat(m.sender); });
        list.appendChild(b);
      });
    }
    function openChat(sender) {
      openConv = sender;
      phead.querySelector('h1').textContent = sender;
      list.style.display = 'none';
      chat.style.display = '';
      inputRow.style.display = '';
      msgs.forEach(function (m) { if (m.conv === sender) { m.read = true; } });
      save();
      paintChat();
    }
    function paintChat() {
      chat.innerHTML = '';
      msgs.forEach(function (m) {
        if (m.conv === openConv) {
          chat.appendChild(el('div', 'bub ' + (m.sender === '我' ? 'me' : 'ai'), m.content));
        }
      });
      body.scrollTop = body.scrollHeight;
    }
    function doSend() {
      var text = (input.value || '').trim();
      if (!text || !openConv) { return; }
      input.value = '';
      var d = new Date();
      var now = (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
      msgs.push({ id: Date.now(), sender: '我', content: text, time: now, read: true, isReply: false, conv: openConv });
      save(); paintChat();
      sfxPlay('sent');
      var t = el('div', 'bub ai typing', '<i></i><i></i><i></i>');
      chat.appendChild(t); body.scrollTop = body.scrollHeight;
      global.setTimeout(function () {
        if (t.parentNode) { t.parentNode.removeChild(t); }
        var reply = SMS_REPLY[Math.floor(Math.random() * SMS_REPLY.length)];
        msgs.push({ id: Date.now() + 1, sender: openConv, content: reply, time: now, read: true, isReply: true, conv: openConv });
        save(); paintChat();
        sfxPlay('msg');
      }, 2000);
    }
    send.addEventListener('click', doSend);
    input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { doSend(); } });
    v.onShow = paintList;
    paintList();
    return v;
  }

  /* ---------- 相机（取景素材化 · 拍完即换 · 镜头温控）：模拟取景 + 闪光灯 ----------
   * **取景画面为素材图**：三套本地图（美食 / 猫咪 / 恐龙）由 _dev/make_cam_photos.py
   * 从 `vibeknow/world-food-3d`、`cat-globe-3d`、`jurassic-park-3d` 派生为
   * `./assets/cam/*.webp` 随包分发；取景框每 3s 随机换一张（不与上一张重复），
   * 按快门**立刻换了下一张**（无预览页、无「重拍 / 保存」，不再停留定格），
   * 每次快门重置 3s 计时。仍是纯模拟，不申请摄像头采集权限（v1 即如此）。
   * **镜头温控**：温度由「拍照频率」推得 —— 每按一次 +1.5℃，静置按 0.5℃/s 回落到
   * 基准 36℃；≥43.5℃ 转红警示，≥45℃ 快门封锁（变灰 + 徽标提示），凉下来才能继续拍。 */
  function buildCamera() {
    var v = el('div', 'view hidden');
    v.appendChild(el('div', 'phead', '<h1>相机</h1>'));
    var body = el('div', 'pbody');
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.overflow = 'hidden';
    var view = el('div', 'cam-view');
    var shot = el('img', 'cam-shot');
    shot.alt = '';
    var hud = el('div', 'cam-hud', '');
    var badge = el('div', 'cam-badge', 'AI OS 相机');
    var flash = el('div', 'cam-flash');
    view.appendChild(shot); view.appendChild(hud); view.appendChild(badge); view.appendChild(flash);
    body.appendChild(view);
    v.appendChild(body);
    var foot = el('div', 'pfoot');
    var frow = el('div', 'cam-foot');
    var leftBox = el('div');                        // 空占位：保住三列网格，快门恒居中
    var rightBox = el('div');
    rightBox.style.display = 'flex'; rightBox.style.justifyContent = 'flex-end'; rightBox.style.alignItems = 'center';
    var shutter = el('button', 'cam-shutter', '');
    shutter.setAttribute('data-sfx', 'none');   /* 快门 / 封锁的音由温控逻辑发 */
    var flashBtn = el('button', 'cam-side', '⚡');
    rightBox.appendChild(flashBtn);
    var mid = el('div');
    mid.style.display = 'flex'; mid.style.justifyContent = 'center'; mid.style.alignItems = 'center';
    mid.appendChild(shutter);
    frow.appendChild(leftBox); frow.appendChild(mid); frow.appendChild(rightBox);
    foot.appendChild(frow);
    v.appendChild(foot);

    var flashOn = true;
    var liveShot = null; var shotIdx = -1;
    function pickShot() {
      var i = Math.floor(Math.random() * CAM_SHOTS.length);
      if (CAM_SHOTS.length > 1 && i === shotIdx) { i = (i + 1) % CAM_SHOTS.length; }
      shotIdx = i;
      return CAM_SHOTS[i];
    }
    var decoded = {}; var decodedKeys = [];
    /* 新图解码完再换 src：未就绪时保持上一张，取景框不会闪白 / 留空。
     * 只保留最近 12 张的引用（其余交给 GC）：取景框每 3s 换一张，
     * 长时间挂着相机会把 90 张全解码进内存，手机上没必要。 */
    function showShot(src) {
      if (shot.getAttribute('src') === src) { return; }
      var img = decoded[src];
      if (!img) {
        img = new Image(); decoded[src] = img; decodedKeys.push(src);
        img.src = src;
        while (decodedKeys.length > 12) { delete decoded[decodedKeys.shift()]; }
      }
      function apply() { if (img.naturalWidth > 0) { shot.setAttribute('src', src); } }
      if (img.complete) { apply(); } else { img.addEventListener('load', apply); }
    }
    function paintScene() { showShot(liveShot); }

    /* --- 镜头温控（唯一数据源：拍照频率） --- */
    var TEMP_BASE = 36.0, TEMP_HEAT = 1.5, TEMP_COOL = 0.5;
    var TEMP_WARN = 43.5, TEMP_STOP = 45.0, TEMP_CAP = TEMP_BASE + 10;
    var temp = TEMP_BASE; var tempTs = Date.now(); var stopped = false;
    /* 散热按真实时间差结算，与定时器节拍漂移无关（闲时也照常结算） */
    function coolTemp() {
      var dt = (Date.now() - tempTs) / 1000;
      if (dt <= 0) { return; }
      tempTs = Date.now();
      temp = temp - TEMP_COOL * dt;
      if (temp < TEMP_BASE) { temp = TEMP_BASE; }
    }
    function paintTemp() {
      var warn = temp >= TEMP_WARN; var stop = temp >= TEMP_STOP;
      hud.textContent = (warn ? '镜头过热 ' : '镜头温度 ') + temp.toFixed(1) + '℃';
      if (warn) { hud.classList.add('hot'); } else { hud.classList.remove('hot'); }
      if (stop) { shutter.classList.add('blocked'); } else { shutter.classList.remove('blocked'); }
      if (stop && !stopped) { hint('镜头过热，先别拍'); sfxPlay('over'); }   /* 刚跨过封锁线时提示一次 */
      stopped = stop;
    }
    var BADGE = 'AI OS 相机';
    function hint(msg) {
      badge.textContent = msg;
      global.setTimeout(function () { badge.textContent = BADGE; }, 1400);
    }

    /* --- 3s 自动换景：每次快门重置计时（刚拍完的那张不会被立刻顶掉） --- */
    var rotTimer = null;
    function scheduleRotate() {
      if (rotTimer) { global.clearTimeout(rotTimer); }
      rotTimer = global.setTimeout(function () {
        if (current === 'camera') { liveShot = pickShot(); paintScene(); }
        scheduleRotate();
      }, 3000);
    }
    global.setInterval(function () {
      coolTemp();
      if (current === 'camera') { paintTemp(); }
    }, 500);

    flashBtn.addEventListener('click', function () {
      flashOn = !flashOn;
      flashBtn.style.opacity = flashOn ? '1' : '.4';
    });
    shutter.addEventListener('click', function () {
      coolTemp();
      if (temp >= TEMP_STOP) { paintTemp(); hint('太烫了，凉一下再拍'); sfxPlay('deny'); return; }
      if (flashOn) {
        flash.classList.add('on');
        global.setTimeout(function () { flash.classList.remove('on'); }, 150);
      }
      sfxPlay('shot');
      temp = Math.min(TEMP_CAP, temp + TEMP_HEAT);   // 拍一张就升温
      paintTemp();
      liveShot = pickShot();                          // 拍完立刻换下一张
      paintScene();
      scheduleRotate();
    });
    v.onShow = function () { coolTemp(); paintTemp(); paintScene(); };
    liveShot = pickShot();
    paintTemp();
    scheduleRotate();
    paintScene();
    return v;
  }

  /* ---------- 统计（v1 还原）：六维雷达 + 汇总卡 + 分游戏重置 ---------- */
  function buildStats() {
    var v = el('div', 'view hidden');
    v.appendChild(el('div', 'phead', '<h1>数据统计</h1>'));
    var body = el('div', 'pbody');
    body.appendChild(el('div', 'score-cap', '综合评分'));
    var big = el('div', 'score-big', '0');
    body.appendChild(big);
    var canvas = el('canvas', '');
    canvas.style.width = '280px'; canvas.style.height = '280px';
    canvas.style.margin = '6px auto 12px auto'; canvas.style.display = 'block';
    body.appendChild(canvas);
    var cards = el('div', 'st-cards');
    cards.innerHTML =
      '<div class="st-card"><div class="k">最高总分</div><div class="v" data-f="maxScore">0</div></div>' +
      '<div class="st-card"><div class="k">总游戏轮次</div><div class="v" data-f="allRounds">0</div></div>' +
      '<div class="st-card"><div class="k">平均准确率</div><div class="v" data-f="avgAcc">0%</div></div>' +
      '<div class="st-card"><div class="k">闹钟准时</div><div class="v" data-f="alarmOt">0/0</div></div>';
    body.appendChild(cards);
    var recCard = el('div', 'card');
    recCard.appendChild(el('div', 'card-title', '游戏记录'));
    var recs = el('div');
    recCard.appendChild(recs);
    body.appendChild(recCard);
    var resetAll = el('button', 'act-btn danger', '重置全部数据');
    resetAll.style.marginTop = '14px';
    body.appendChild(resetAll);
    v.appendChild(body);
    var modalHost = el('div', 'modal-mask');
    modalHost.style.display = 'none';
    v.appendChild(modalHost);

    var GAMES = [
      { key: 'calc', name: '计算器', g: 'calc' },
      { key: 'assistant', name: '助手', g: 'bot' },
      { key: 'schedule', name: '日程', g: 'list' },
      { key: 'cal', name: '日历', g: 'cal' },
      { key: 'alarm', name: '闹钟', g: 'alarm' }
    ];
    var DEFAULTS = {
      calc: { score: 0, highScore: 0, streak: 0, maxStreak: 0, rounds: 0, accuracy: 0 },
      assistant: { score: 0, highScore: 0, streak: 0, maxStreak: 0, rounds: 0, accuracy: 0, used: [] },
      schedule: { score: 0, highScore: 0, accuracy: 0, rounds: 0 },
      cal: { score: 0, highScore: 0, winRate: 0, rounds: 0, fastest: 999 },
      alarm: { onTime: 0, attempts: 0 }
    };
    var pending = null;

    function loadAll() {
      return {
        calc: statGet('calc', DEFAULTS.calc),
        assistant: statGet('assistant', DEFAULTS.assistant),
        schedule: statGet('schedule', DEFAULTS.schedule),
        cal: statGet('cal', DEFAULTS.cal),
        alarm: statGet('alarm', DEFAULTS.alarm)
      };
    }
    function dims(a) {
      var comboPool = [];
      if (a.calc.rounds > 0) { comboPool.push((a.calc.maxStreak || 0) / a.calc.rounds); }
      if (a.assistant.rounds > 0) { comboPool.push((a.assistant.maxStreak || 0) / a.assistant.rounds); }
      var combo = comboPool.length ? comboPool.reduce(function (x, y) { return x + y; }, 0) / comboPool.length * 100 : 0;
      return [
        (a.calc.accuracy || 0) * 100,
        (a.assistant.accuracy || 0) * 100,
        (a.schedule.accuracy || 0) * 100,
        (a.cal.winRate || 0) * 100,
        (a.alarm.attempts > 0 ? a.alarm.onTime / a.alarm.attempts : 0) * 100,
        combo
      ];
    }
    function drawRadar(F) {
      var ctx = canvas.getContext('2d');
      if (!ctx) { return; }
      var dpr = window.devicePixelRatio || 1;
      canvas.width = 280 * dpr; canvas.height = 280 * dpr;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, 280, 280);
      var U = 140, B = 130, R = 95;
      var i, lv, a2;
      ctx.strokeStyle = 'rgba(120,120,140,.25)'; ctx.lineWidth = 1;
      for (lv = 1; lv <= 5; lv++) {
        ctx.beginPath();
        for (i = 0; i <= 6; i++) {
          a2 = Math.PI * 2 * i / 6 - Math.PI / 2;
          var rr = R * lv / 5;
          var x = U + rr * Math.cos(a2), y = B + rr * Math.sin(a2);
          if (i === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
        }
        ctx.closePath(); ctx.stroke();
      }
      for (i = 0; i < 6; i++) {
        a2 = Math.PI * 2 * i / 6 - Math.PI / 2;
        ctx.beginPath(); ctx.moveTo(U, B);
        ctx.lineTo(U + R * Math.cos(a2), B + R * Math.sin(a2)); ctx.stroke();
      }
      ctx.beginPath();
      var pts = [];
      for (i = 0; i < 6; i++) {
        var val = Math.max(0.04, F[i] / 100);
        a2 = Math.PI * 2 * i / 6 - Math.PI / 2;
        var pr = R * val;
        pts.push({ x: U + pr * Math.cos(a2), y: B + pr * Math.sin(a2) });
        if (i === 0) { ctx.moveTo(pts[i].x, pts[i].y); } else { ctx.lineTo(pts[i].x, pts[i].y); }
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(108,76,241,.22)'; ctx.fill();
      ctx.strokeStyle = 'rgba(108,76,241,.85)'; ctx.lineWidth = 2; ctx.stroke();
      var ink = 'var(--ink)';
      for (i = 0; i < 6; i++) {
        ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#6C4CF1'; ctx.fill();
        a2 = Math.PI * 2 * i / 6 - Math.PI / 2;
        var lx = U + (R + 26) * Math.cos(a2), ly = B + (R + 26) * Math.sin(a2);
        ctx.font = 'bold 12px sans-serif';
        ctx.fillStyle = theme.mode === 'dark' ? '#F2F1F7' : '#1C1B1F';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(RADAR_LABELS[i], lx, ly);
        ctx.fillStyle = '#F08A24';
        ctx.fillText(Math.round(F[i]) + '%', lx, ly + 18);
      }
    }
    function render() {
      var a = loadAll();
      var F = dims(a);
      big.textContent = Math.round(F.reduce(function (x, y) { return x + y; }, 0) / 6);
      var maxScore = (a.calc.highScore || 0) + (a.assistant.highScore || 0) + (a.schedule.highScore || 0) + (a.cal.highScore || 0);
      var allRounds = (a.calc.rounds || 0) + (a.assistant.rounds || 0) + (a.schedule.rounds || 0) + (a.cal.rounds || 0);
      var accs = [a.calc.accuracy || 0, a.assistant.accuracy || 0, a.schedule.accuracy || 0, a.cal.winRate || 0];
      v.querySelector('[data-f="maxScore"]').textContent = maxScore;
      v.querySelector('[data-f="allRounds"]').textContent = allRounds;
      v.querySelector('[data-f="avgAcc"]').textContent = Math.round(accs.reduce(function (x, y) { return x + y; }, 0) / accs.length * 100) + '%';
      v.querySelector('[data-f="alarmOt"]').textContent = (a.alarm.onTime || 0) + '/' + (a.alarm.attempts || 0);
      drawRadar(F);
      recs.innerHTML = '';
      GAMES.forEach(function (gm) {
        var st = a[gm.key];
        var row = el('div', 'rec-row');
        var mini = el('div', 'rec-mini');
        var app = findApp(gm.key === 'cal' ? 'calendar' : gm.key);
        mini.style.background = 'linear-gradient(135deg,' + app.c[0] + ',' + app.c[1] + ')';
        mini.innerHTML = GLYPH[gm.g];
        row.appendChild(mini);
        row.appendChild(el('span', 'rec-name', gm.name));
        row.appendChild(el('span', 'rec-val', '分数 ' + ((gm.key === 'alarm' ? (st.onTime || 0) : (st.score || 0))) + ' · 轮次 ' + ((st.rounds || st.attempts) || 0)));
        var rb = el('button', 'rec-reset', '重置');
        rb.addEventListener('click', function () { askReset(gm.key, gm.name); });
        row.appendChild(rb);
        recs.appendChild(row);
      });
    }
    function askReset(key, name) {
      pending = key;
      modalHost.style.display = 'flex';
      modalHost.innerHTML = '';
      var m = el('div', 'modal');
      m.appendChild(el('h3', '', '确认重置'));
      m.appendChild(el('p', '', name + ' 的分数与轮次将清零，不可恢复。'));
      var row = el('div', 'modal-row');
      var cancel = el('button', 'modal-btn modal-cancel', '取消');
      var ok = el('button', 'modal-btn modal-ok', '重置');
      ok.setAttribute('data-sfx', 'none');   /* 破坏性确认：走 deny 的「重」音，不用普通点击音 */
      cancel.addEventListener('click', function () { modalHost.style.display = 'none'; pending = null; });
      ok.addEventListener('click', function () {
        sfxPlay('deny');
        if (pending === 'all') {
          var k2;
          for (k2 in DEFAULTS) { if (Object.prototype.hasOwnProperty.call(DEFAULTS, k2)) { statPut(k2, DEFAULTS[k2]); } }
        } else if (pending) {
          statPut(pending, DEFAULTS[pending]);
        }
        modalHost.style.display = 'none'; pending = null;
        render();
      });
      row.appendChild(cancel); row.appendChild(ok);
      m.appendChild(row);
      modalHost.appendChild(m);
    }
    resetAll.addEventListener('click', function () { askReset('all', '全部游戏'); });
    v.onShow = render;
    render();
    return v;
  }

  /* ---------- 月球天气（§4.9）：由主屏天气小组件点进来的应用 ----------
   * **直接采用 vibeknow/moon-3d 的 Three.js 渲染方式**（本地 ./assets/three.min.js，
   * 与 vibeknow/earth-3d 同一套引入方式，零 CDN）：
   *  - WebGLRenderer + sRGB 输出 + ACESFilmic 色调映射（曝光 1.1）→ Scene / PerspectiveCamera
   *  - 月球：SphereGeometry(R,64,64) + MeshStandardMaterial(月面贴图, roughness .95)
   *  - 光照：AmbientLight(0x223044, 0.4) + DirectionalLight(0xffffff, 2.4)；**太阳方位角由
   *    当前真实月相推出**（0° 新月 / 180° 满月），不设滑块
   *  - 背景：程序化星空天球（CanvasTexture）+ 近层星点 Points + 两层加法辉光 Sprite
   *  - 相机：球坐标 theta/phi/radius，拖动旋转、滚轮/双指缩放；**不自转**（只由手势驱动）
   *  渲染循环只在视图可见时跑（隐藏即停帧），月相每分钟对一次表。
   * 3D 失败（无 WebGL）时页面不留白：观测台显示降级提示，天气读数照常可用。 */

  /* 真实月相：以 2000-01-06 18:14 UTC 那次新月为基准，按平均朔望月推月龄、照亮比例与日照角。
   * 未做中心差修正，相对真实朔望误差在半天以内 —— 一台「月面天气站」够用，且不引天文库、不联网。 */
  var WX_SYNODIC = 29.530588853;   /* 朔望月（天） */
  var WX_REF_NEW = 947182440000;   /* 2000-01-06T18:14:00Z 的新月 */
  function wxMoonAge(now) {
    var age = ((now - WX_REF_NEW) / 86400000) % WX_SYNODIC;
    return age < 0 ? age + WX_SYNODIC : age;
  }
  /* 观测建议：月相不同可见时段不同（真天文常识，用站内语气说） */
  function wxSight(frac) {
    if (frac < 0.04 || frac > 0.96) { return '不可见 · 宜观星'; }
    if (frac < 0.30) { return '傍晚西边低空'; }
    if (frac < 0.45) { return '入夜后西半天空'; }
    if (frac <= 0.55) { return '整夜可见 · 宜观月'; }
    if (frac < 0.72) { return '后半夜东边升起'; }
    return '凌晨东边低空';
  }
  function wxPhaseName(deg) {
    var d = ((deg % 360) + 360) % 360;
    if (d < 8 || d > 352) { return '新月'; }
    if (d < 82) { return '蛾眉月'; }
    if (d < 98) { return '上弦月'; }
    if (d < 172) { return '盈凸月'; }
    if (d < 188) { return '满月'; }
    if (d < 262) { return '亏凸月'; }
    if (d < 278) { return '下弦月'; }
    return '残月';
  }

  /* 纹理工厂（沿用 moon-3d 的三个 CanvasTexture 生成器）：
   *  sky = 星空天球贴图（星云色斑 + 银河带 + 星点），plain = 4×4 占位色，radial = 辉光径向渐变 */
  function wxStarfieldTex() {
    var w = 2048, h = 1024;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var x = c.getContext('2d');
    var i, px, py, r, g, b, t, d, hue;
    var bg = x.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#04050c');
    bg.addColorStop(0.5, '#080a1a');
    bg.addColorStop(1, '#04050c');
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    x.save(); x.translate(w / 2, h / 2); x.rotate(-0.4); x.translate(-w / 2, -h / 2);
    for (i = 0; i < 22; i++) {
      px = Math.random() * w; py = h / 2 + (Math.random() - 0.5) * h * 0.28; r = 100 + Math.random() * 220;
      g = x.createRadialGradient(px, py, 0, px, py, r);
      hue = Math.random();
      var c1 = hue < 0.4 ? 'rgba(150,120,220,' : (hue < 0.7 ? 'rgba(90,130,210,' : 'rgba(200,120,150,');
      g.addColorStop(0, c1 + (0.04 + Math.random() * 0.05) + ')');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    }
    for (i = 0; i < 3600; i++) {
      px = Math.random() * w; py = h / 2 + (Math.random() - 0.5) * h * 0.3;
      d = Math.abs(py - h / 2) / (h * 0.15); b = (1 - d * d) * (0.3 + Math.random() * 0.6);
      if (b <= 0) { continue; }
      x.fillStyle = 'rgba(255,255,255,' + b + ')'; x.fillRect(px, py, 1, 1);
    }
    x.restore();
    for (i = 0; i < 3800; i++) {
      px = Math.random() * w; py = Math.random() * h; b = 0.15 + Math.random() * 0.5;
      x.fillStyle = 'rgba(255,255,255,' + b + ')'; x.fillRect(px, py, 1, 1);
    }
    for (i = 0; i < 200; i++) {
      px = Math.random() * w; py = Math.random() * h; b = 0.82 + Math.random() * 0.18;
      x.fillStyle = 'rgba(255,255,255,' + b + ')'; x.fillRect(px, py, 1, 1);
    }
    t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }
  function wxPlainTex(col) {
    var c = document.createElement('canvas');
    c.width = c.height = 4;
    var x = c.getContext('2d');
    x.fillStyle = col; x.fillRect(0, 0, 4, 4);
    return new THREE.CanvasTexture(c);
  }
  function wxRadialTex(c0, c1, c2) {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var x = c.getContext('2d');
    var g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, c0); g.addColorStop(0.4, c1); g.addColorStop(1, c2);
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  function buildWeather() {
    var v = el('div', 'view hidden');
    v.appendChild(el('div', 'phead', '<h1>月球天气</h1>'));
    var body = el('div', 'pbody');
    var i;

    /* ---- 观测台：Three.js 画布（拖动旋转 / 滚轮·双指缩放） ---- */
    var stage = el('div', 'wx-stage');
    var moonCv = el('canvas', 'wx-moon');
    stage.appendChild(moonCv);
    var hud = el('div', 'wx-hud');
    var hudL = el('div', 'wx-hud-l');
    hudL.appendChild(el('div', 'wx-loc', '观测站 · 静海基地'));
    hudL.appendChild(el('div', 'wx-loc-name', '月球 · 静海'));
    hud.appendChild(hudL);
    var hudChip = el('div', 'wx-chip', '');
    hud.appendChild(hudChip);
    stage.appendChild(hud);
    stage.appendChild(el('div', 'wx-tip', '拖动旋转 · 滚轮/双指缩放'));
    body.appendChild(stage);

    /* ---- 观测状态：相机球坐标（拖动改 theta/phi，缩放改 radius）；月相由时间给 ---- */
    var MOON_R = 5;                       /* 月球半径（场景单位，同 moon-3d） */
    var R_MIN = 8, R_MAX = 60;            /* 相机半径范围（同 moon-3d） */
    var theta = 0, phi = Math.PI / 2, radius = 18;
    var autoSpin = false;                 /* **不做自动自转**：月面只由手势驱动 */
    var spinY = 0, spinMul = 0;
    var phaseDeg = 180;
    var dprCap = Math.min(global.devicePixelRatio || 1, 1.5);   /* 同 moon-3d：像素比封顶 1.5 */
    var sw = 0, sh = 0, dirty = true;
    var scene = null, camera = null, renderer = null, moon = null, sky = null;
    var sunLight = null, glowA = null, glowB = null, starsPts = null;
    var glOK = false;

    /* ---- 天气读数（与主屏天气组件同源；前四格月相按时相算） ---- */
    var hero = el('div', 'wx-hero');
    var hMain = el('div', 'h-main');
    hMain.appendChild(el('div', 'h-temp', '-173°'));
    hMain.appendChild(el('div', 'h-cond', '晴 · 流星雨概率 40%'));
    hero.appendChild(hMain);
    hero.appendChild(el('div', 'wx-glyph', GLYPH.moon));
    body.appendChild(hero);

    /* 12 格读数：动态项留引用（dyn），供 wxApplyPhase 回填 */
    var dyn = {};
    var CELLS = [
      ['phase', '月相'], ['age', '月龄'], ['lit', '照亮比例'], ['sight', '观测建议'],
      ['-', '月面温度', '-173°C'], ['-', '昼面温度', '+127°C'],
      ['-', '太阳风', '420 km/s'], ['-', '大气压', '3×10⁻¹⁵ bar'],
      ['-', '辐射剂量', '1.4 mSv/日'], ['-', '月尘静电', '轻微'],
      ['-', '能见度', '极佳 · 无雾霾'], ['-', '紫外线指数', '爆表']
    ];
    var grid = el('div', 'wx-grid');
    for (i = 0; i < CELLS.length; i++) {
      var cell = el('div', 'wx-item');
      cell.appendChild(el('div', 'k', CELLS[i][1]));
      var cellV = el('div', 'v', CELLS[i][2] || '--');
      cell.appendChild(cellV);
      grid.appendChild(cell);
      if (CELLS[i][0] !== '-') { cellV.setAttribute('data-f', CELLS[i][0]); dyn[CELLS[i][0]] = cellV; }
    }
    body.appendChild(grid);
    body.appendChild(el('div', 'wx-src', '数据来源：AI 编的，别当真'));

    /* ---- Three.js 观测场景：搭建方式与光照口径直接沿用 moon-3d ---- */
    (function initGL() {
      if (typeof THREE === 'undefined') { glOK = false; }
      else {
        try {
          renderer = new THREE.WebGLRenderer({ canvas: moonCv, antialias: true,
                                               powerPreference: 'high-performance' });
          glOK = true;
        } catch (e) { glOK = false; }
      }
      if (!glOK) {
        // 无 WebGL：观测台不留白，给一句降级提示，天气读数照常
        stage.setAttribute('data-gl', 'fail');
        stage.appendChild(el('div', 'wx-fallback', '本机不支持 3D 观测（无 WebGL），天气读数照常'));
        return;
      }
      stage.setAttribute('data-gl', 'ok');
      renderer.setPixelRatio(dprCap);
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);

      // 星空天球（程序化 CanvasTexture，零外部资源）
      sky = new THREE.Mesh(new THREE.SphereGeometry(2500, 48, 32),
        new THREE.MeshBasicMaterial({ map: wxStarfieldTex(), side: THREE.BackSide, depthWrite: false }));
      scene.add(sky);

      // 光照：冷色环境光（暗面不纯黑）+ 太阳平行光（方位角由真实月相给）
      scene.add(new THREE.AmbientLight(0x223044, 0.4));
      sunLight = new THREE.DirectionalLight(0xffffff, 2.4);
      sunLight.position.set(0, 0, MOON_R * 3);
      scene.add(sunLight);

      // 月球本体：先顶着素色球，贴图到货再换（避免首帧空白）
      var moonMat = new THREE.MeshStandardMaterial({
        map: wxPlainTex('#b8b8b8'), roughness: 0.95, metalness: 0
      });
      moon = new THREE.Mesh(new THREE.SphereGeometry(MOON_R, 64, 64), moonMat);
      scene.add(moon);

      // 两层加法辉光（同 moon-3d 的月光感）
      glowA = new THREE.Sprite(new THREE.SpriteMaterial({
        map: wxRadialTex('rgba(200,220,255,.28)', 'rgba(160,190,240,.1)', 'rgba(140,170,230,0)'),
        blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
      }));
      glowA.scale.set(MOON_R * 4.5, MOON_R * 4.5, 1);
      scene.add(glowA);
      glowB = new THREE.Sprite(new THREE.SpriteMaterial({
        map: wxRadialTex('rgba(180,210,255,.12)', 'rgba(140,180,230,.04)', 'rgba(120,160,220,0)'),
        blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
      }));
      glowB.scale.set(MOON_R * 8, MOON_R * 8, 1);
      scene.add(glowB);

      // 近层星点（BufferGeometry + Points，同 moon-3d）
      starsPts = (function () {
        var n = 2600, geo = new THREE.BufferGeometry();
        var pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
        var k, u, v, s, R, b, t;
        for (k = 0; k < n; k++) {
          u = Math.random() * 2 - 1; v = Math.random() * 6.2832; s = Math.sqrt(1 - u * u);
          R = 800 + Math.random() * 600;
          pos[k * 3] = R * s * Math.cos(v); pos[k * 3 + 1] = R * u; pos[k * 3 + 2] = R * s * Math.sin(v);
          b = 0.25 + Math.random() * 0.75; t = Math.random();
          if (t < 0.15) { col[k * 3] = b * 0.8; col[k * 3 + 1] = b * 0.85; col[k * 3 + 2] = b; }
          else if (t < 0.25) { col[k * 3] = b; col[k * 3 + 1] = b * 0.85; col[k * 3 + 2] = b * 0.7; }
          else { col[k * 3] = b; col[k * 3 + 1] = b; col[k * 3 + 2] = b; }
        }
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        var pts = new THREE.Points(geo, new THREE.PointsMaterial({
          size: 0.6, sizeAttenuation: true, vertexColors: true, transparent: true,
          opacity: 0.9, depthWrite: false
        }));
        scene.add(pts);
        return pts;
      })();

      // 月面贴图：本地 assets/moon.jpg（与 earth-3d / moon-3d 同款加载方式）
      var maxA = renderer.capabilities.getMaxAnisotropy();
      var ldr = new THREE.TextureLoader();
      ldr.load('./assets/moon.jpg', function (t) {
        t.encoding = THREE.sRGBEncoding;
        t.anisotropy = maxA;
        moonMat.map = t;
        moonMat.needsUpdate = true;
        stage.setAttribute('data-tex', 'ok');
        dirty = true;
        wxKick();
      }, undefined, function () {
        // file:// 直开时浏览器按跨源拦下本地贴图：留素色球 + 标注原因，不假装成功
        stage.setAttribute('data-tex', 'fail');
        stage.setAttribute('data-texhint', '1');
      });
    })();

    /* 画布尺寸跟随观测台：只改 renderer 尺寸与相机 aspect（不再有离屏逐像素缓冲） */
    function wxResize() {
      var w = stage.clientWidth, h = stage.clientHeight;
      if (!w || !h) { return false; }
      sw = w; sh = h;
      if (!glOK || !renderer) { return true; }
      renderer.setPixelRatio(dprCap);
      renderer.setSize(w, h, false);
      moonCv.style.width = w + 'px';
      moonCv.style.height = h + 'px';
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      dirty = true;
      return true;
    }

    /* 相机球坐标 → 位置（同 moon-3d 的 camPos：theta 绕 Y、phi 自 +Y 起算） */
    function wxCamPos() {
      var sp = Math.sin(phi);
      camera.position.set(radius * sp * Math.sin(theta), radius * Math.cos(phi),
                          radius * sp * Math.cos(theta));
      camera.lookAt(0, 0, 0);
    }

    /* 画一帧：旋转只由手势给（不自转）；两层辉光跟着月球；WebGL 不可用时不画 */
    function wxDraw() {
      if (!glOK || !renderer) { return; }
      moon.rotation.y = spinY;
      wxCamPos();
      glowA.position.copy(moon.position);
      glowB.position.copy(moon.position);
      renderer.render(scene, camera);
    }

    /* 月龄 → 太阳方位角、照亮比例与读数：0° 新月 / 90° 上弦 / 180° 满月 / 270° 下弦。
     * 与 moon-3d 的 setPhase 同一套几何：把平行光摆在 XZ 平面的 (sin a, 0, -cos a)·d 上，
     * a=180° 时光从相机方向照过去即满月；theta/phi 不变时看到的就是真实相位。 */
    function wxApplyPhase(age) {
      var frac = age / WX_SYNODIC;
      var a = frac * 6.283185307;
      phaseDeg = frac * 360;
      var lit = Math.round((1 - Math.cos(a)) / 2 * 100);
      var nm = wxPhaseName(phaseDeg);
      if (glOK && sunLight) {
        var d = MOON_R * 4;
        sunLight.position.set(Math.sin(a) * d, 0, -Math.cos(a) * d);
      }
      dyn.phase.textContent = nm;
      dyn.age.textContent = age.toFixed(1) + ' 天';
      dyn.lit.textContent = lit + '%';
      dyn.sight.textContent = wxSight(frac);
      hudChip.textContent = nm + ' · 照亮 ' + lit + '%';
      dirty = true;
    }

    /* ---- 手势：单指旋转 / 双指·滚轮缩放（不自转：松手就停）
     * 与 moon-3d 同款约定：第二指落下即让位给缩放，避免两根手指轮流改同一组角度而抖动。 */
    var dragId = null, lastX = 0, lastY = 0, pinchD = 0;
    function tdist(ts) {
      var dx = ts[0].clientX - ts[1].clientX, dy = ts[0].clientY - ts[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }
    stage.addEventListener('pointerdown', function (e) {
      if (dragId !== null) { dragId = null; pinchD = 0; return; }
      dragId = e.pointerId;
      lastX = e.clientX; lastY = e.clientY;
      try { stage.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    });
    // 与 moon-3d 同款手感：横向拖改 theta（相机绕 Y），纵向拖改 phi（俯仰，限位 0.1~π-0.1）
    stage.addEventListener('pointermove', function (e) {
      if (e.pointerId !== dragId) { return; }
      theta -= (e.clientX - lastX) * 0.005;
      phi -= (e.clientY - lastY) * 0.005;
      if (phi < 0.1) { phi = 0.1; }
      if (phi > 3.041592653589793) { phi = 3.041592653589793; }
      lastX = e.clientX; lastY = e.clientY;
      dirty = true;
    });
    function wxEndDrag(e) {
      if (e.pointerId === dragId) { dragId = null; }
    }
    stage.addEventListener('pointerup', wxEndDrag);
    stage.addEventListener('pointercancel', wxEndDrag);
    // 缩放改的是相机半径（moon-3d 同款：滚轮下滚拉远、上滚拉近），夹在 R_MIN~R_MAX
    stage.addEventListener('wheel', function (e) {
      e.preventDefault();
      radius *= 1 + (e.deltaY > 0 ? 0.08 : -0.08);
      if (radius < R_MIN) { radius = R_MIN; }
      if (radius > R_MAX) { radius = R_MAX; }
      dirty = true;
    }, { passive: false });
    stage.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) { pinchD = tdist(e.touches); }
    }, { passive: true });
    stage.addEventListener('touchmove', function (e) {
      if (e.touches.length !== 2) { return; }
      e.preventDefault();
      var d = tdist(e.touches);
      // 两指几乎重合时 d→0，pinch/d 会炸成天文数字把镜头甩飞：12px 以内只更新基线
      if (pinchD > 12 && d > 12) {
        radius *= pinchD / d;
        if (radius < R_MIN) { radius = R_MIN; }
        if (radius > R_MAX) { radius = R_MAX; }
        dirty = true;
      }
      pinchD = d;
    }, { passive: false });
    stage.addEventListener('touchend', function (e) {
      if (e.touches.length < 2) { pinchD = 0; }
    }, { passive: true });
    stage.addEventListener('touchcancel', function () { pinchD = 0; }, { passive: true });

    /* ---- 心跳：每分钟对一次表（月相按时间走），其余只在 dirty 时重绘 ----
     * 视图隐藏即停帧（onShow / 缩放 / 贴图到货再踢一脚），不做无谓的常驻动画循环。 */
    var lastPhaseAt = 0, rafId = 0;
    function wxKick() {
      if (!rafId) { rafId = global.requestAnimationFrame(wxTick); }
    }
    function wxTick(ts) {
      rafId = 0;
      if (v.classList.contains('hidden')) { return; }
      if (!sw || !sh) { if (!wxResize()) { wxKick(); return; } }
      if (!lastPhaseAt || ts - lastPhaseAt > 60000) {
        lastPhaseAt = ts;
        wxApplyPhase(wxMoonAge(Date.now()));
      }
      if (dirty) { wxDraw(); dirty = false; }
      wxKick();
    }
    global.addEventListener('resize', function () { sw = 0; dirty = true; wxKick(); });
    // WebGL 上下文丢失：不白屏 —— 换降级提示，天气读数不受影响
    moonCv.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      glOK = false;
      stage.setAttribute('data-gl', 'fail');
      stage.appendChild(el('div', 'wx-fallback', '3D 观测已中断（图形上下文丢失），天气读数照常'));
      dirty = false;
    }, false);

    v.appendChild(body);
    weatherView = v;
    // 供自检读取的观测状态（与 AIOS.storeBackend 同类：只读快照，不做写操作）
    v.state = function () {
      return { gl: glOK, tex: stage.getAttribute('data-tex'), phase: phaseDeg,
               theta: theta, phi: phi, radius: radius, spin: spinY };
    };
    v.onShow = function () { sw = 0; dirty = true; wxKick(); };
    wxApplyPhase(wxMoonAge(Date.now()));
    wxResize();
    wxKick();
    return v;
  }

  /* ---------- 应用商店（§4.12）：介绍 ai-dev-kit 里已开发的小工具 ----------
   * 数据是构建期注入的 STORE_GROUPS（TRACKS.md 派生），这里只负责呈现。
   * 呈现一律用「商店语言」，不是「文档语言」：
   *   卡片 = 招牌图标 + 名称 + 一句副标题（tag）+ 上架标签（st / tone）；
   *   目录（d）、定位原文（t）、物料状态原文（s）**都不上屏** —— 那是给维护者看的。
   * 一行一卡、不再做展开：副标题本身就是商店口径的短句，完整定位在仓库索引里查。 */
  function storeCard(it, idx) {
    var card = el('div', 'store-card');
    var head = el('div', 'store-head');

    /* 招牌图标：沿用主屏图标的中性投影 + 内高光，颜色取货架色板按序轮转（同分类相邻不同色） */
    var mini = el('div', 'store-mini', esc(it.n.charAt(0)));
    iconPaint(mini, STORE_ICON_PALETTE[idx % STORE_ICON_PALETTE.length], 135);
    head.appendChild(mini);

    var title = el('div', 'store-title');
    title.appendChild(el('div', 'store-name', esc(it.n)));
    title.appendChild(el('div', 'store-desc', esc(it.tag)));
    /* 本机（ai-os 自己）在清单里也有一行：按商店的说法标「已安装」——你正用着它 */
    var self = (it.d === 'vibegame/ai-os/') ? '<span class="store-chip self">已安装</span>' : '';
    title.appendChild(el('div', 'store-tags',
      '<span class="store-chip ' + esc(it.tone) + '">' + esc(it.st) + '</span>' + self));
    head.appendChild(title);

    card.appendChild(head);
    return card;
  }

  function buildStore() {
    var v = el('div', 'view hidden');
    v.appendChild(el('div', 'phead', '<h1>应用商店</h1>'));

    var total = 0;
    STORE_GROUPS.forEach(function (g) { total += g.items.length; });

    /* 顶部固定带（概览 + 分类筛选）：不随列表滚走 —— 30 多个项目翻到中后段还要能切分类，
     * 否则只能一路滚回顶部。内容区仍是全页唯一滚动区（§4.4）。 */
    var bar = el('div', 'store-bar');
    /* 店头：品牌渐变横幅（与主屏时钟组件同一套「主视觉渐变卡」语言，§4.3.1）+ 购物袋水印 */
    var hero = el('div', 'store-hero');
    hero.appendChild(el('div', 'store-hero-art', GLYPH.bag));
    hero.appendChild(el('div', 'store-hero-top',
      '<span class="store-hero-k">已收录</span>' +
      '<span class="store-hero-v">' + total + '</span><span class="store-hero-u">款</span>'));
    hero.appendChild(el('div', 'store-hero-d',
      '人工智能Ding🥕 出品 · ' + STORE_GROUPS.length + ' 个分类'));
    bar.appendChild(hero);

    var list = el('div', 'pbody store-list');
    var empty = el('div', 'store-empty', '没有可展示的项目。');
    empty.style.display = 'none';
    var tabs = el('div', 'store-tabs');

    function pick(tag) {
      var i, shown = 0, btns = tabs.children, secs = list.children;
      for (i = 0; i < btns.length; i++) {
        if (btns[i].getAttribute('data-cat') === tag) { btns[i].classList.add('sel'); }
        else { btns[i].classList.remove('sel'); }
      }
      for (i = 0; i < secs.length; i++) {
        if (secs[i].getAttribute('data-cat') === null) { continue; }
        if (tag === 'all' || secs[i].getAttribute('data-cat') === tag) {
          secs[i].classList.remove('hidden'); shown++;
        } else { secs[i].classList.add('hidden'); }
      }
      empty.style.display = shown ? 'none' : 'block';
    }

    var tabsData = [{ tag: 'all', label: '全部' }];
    STORE_GROUPS.forEach(function (g) { tabsData.push({ tag: g.tag, label: g.name }); });
    /* 筛选格数跟着分类数走 —— TRACKS.md 增删分类时不必回来改代码；
     * CSS 里的 repeat(5,1fr) 只是基线兜底（本行内联样式覆盖它）。 */
    tabs.style.gridTemplateColumns = 'repeat(' + tabsData.length + ',1fr)';
    tabsData.forEach(function (t) {
      var btn = el('button', 'store-tab', esc(t.label));
      btn.setAttribute('data-cat', t.tag);
      btn.setAttribute('data-sfx', 'tap');
      btn.setAttribute('aria-label', '筛选：' + t.label);
      btn.addEventListener('click', function () { pick(t.tag); });
      tabs.appendChild(btn);
    });
    bar.appendChild(tabs);
    v.appendChild(bar);

    STORE_GROUPS.forEach(function (g) {
      var sec = el('div', 'store-sec');
      sec.setAttribute('data-cat', g.tag);
      var col = storeCatColor(g.tag);
      var h = el('div', 'store-sec-h');
      var dot = el('span', 'store-sec-dot');
      dot.style.backgroundImage = 'linear-gradient(135deg,' + col[0] + ',' + col[1] + ')';
      h.appendChild(dot);
      h.appendChild(el('span', 'store-sec-t', esc(g.name)));
      h.appendChild(el('span', 'store-sec-n', g.items.length + ' 款'));
      sec.appendChild(h);
      g.items.forEach(function (it, i) { sec.appendChild(storeCard(it, i)); });
      list.appendChild(sec);
    });
    list.appendChild(empty);
    v.appendChild(list);
    pick('all');
    return v;
  }

  var BUILDERS = { calc: buildCalc, alarm: buildAlarm, calendar: buildCal, assistant: buildAssistant, schedule: buildSchedule, phone: buildPhone, sms: buildSms, camera: buildCamera, stats: buildStats, weather: buildWeather, store: buildStore };

  /* ---------- 打开 / 关闭 / 导航 ---------- */
  /* isApp=true 进入应用态：body 带 on-app，状态栏区/内容区/底部导航一起铺应用底色（DESIGN §4.2） */
  function showOnly(node, isApp) {
    var i, kids = viewRoot.children;
    for (i = 0; i < kids.length; i++) {
      if (kids[i] === node || kids[i] === recentsEl) { continue; }
      kids[i].classList.add('hidden');
    }
    if (isApp) { document.body.classList.add('on-app'); }
    else { document.body.classList.remove('on-app'); }
    if (node) {
      node.classList.remove('hidden');
      node.classList.add('entering');
      void node.offsetWidth;
      node.classList.remove('entering');
    }
  }

  function openApp(id) {
    closeRecents();
    if (!views[id]) {
      if (id === 'settings') { buildSettings(); }
      else if (BUILDERS[id]) { views[id] = BUILDERS[id](); viewRoot.appendChild(views[id]); }
      else { views[id] = buildPlaceholder(findApp(id)); viewRoot.appendChild(views[id]); }
    }
    var idx = stack.indexOf(id);
    if (idx >= 0) { stack.splice(idx, 1); }
    stack.push(id);
    current = id;
    showOnly(views[id], true);
    if (views[id].onShow) { views[id].onShow(); }
  }

  function goHome() {
    closeRecents();
    current = 'home';
    showOnly(homeView, false);
  }

  function goBack() {
    if (recentsEl && !recentsEl.classList.contains('hidden')) { closeRecents(); return; }
    if (current === 'home') { return; }
    var i = stack.indexOf(current);
    if (i >= 0) { stack.splice(i, 1); }
    current = stack.length ? stack[stack.length - 1] : 'home';
    showOnly(current === 'home' ? homeView : views[current], current !== 'home');
  }

  /* ---------- 多任务 ---------- */
  function buildRecents() {
    recentsEl = el('div', 'recents hidden');
    recentsEl.setAttribute('data-sfx', 'back');   /* 点空白处 = 收起多任务 */
    // 点击遮罩空白处关闭面板。判定用「不在卡片内即关闭」，而非白名单 target：
    // 白名单（recentsEl / .recents-track）漏掉了空态 —— 清空全部任务后 renderRecents()
    // 只塞一个 .rc-empty，它是 flex:1 1 auto、撑满整个遮罩，点哪儿命中的都是它，
    // 于是面板永远关不掉。卡片有自己的 click（恢复应用）、清理按钮已 stopPropagation，
    // 故只需排除卡片与按钮两种目标。
    recentsEl.addEventListener('click', function (ev) {
      var t = ev.target;
      if (t && t.closest && (t.closest('.rc-card') || t.closest('.rc-clear'))) { return; }
      closeRecents();
    });
    viewRoot.appendChild(recentsEl);
  }

  function renderRecents() {
    recentsEl.innerHTML = '';
    if (stack.length === 0) {
      recentsEl.appendChild(el('div', 'rc-empty', '暂无最近应用'));
      return;
    }
    // 一键清理工具栏（仅有任务时显示，置于卡片轨道下方居中）
    var toolbar = el('div', 'rc-toolbar');
    var clearBtn = el('button', 'rc-clear', '<svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V5h6v2M7 7l1 12h8l1-12" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>一键清理');
    clearBtn.setAttribute('data-sfx', 'back');
    clearBtn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      stack.length = 0;
      current = 'home';
      closeRecents();
      showOnly(homeView, false);
    });
    toolbar.appendChild(clearBtn);
    var track = el('div', 'recents-track');
    // 最近优先：从栈顶往栈底排
    var order = stack.slice().reverse();
    order.forEach(function (id) {
      var app = findApp(id);
      var card = el('div', 'rc-card');
      card.setAttribute('data-sfx', 'open');       /* 点卡 = 恢复应用 */
      var head = el('div', 'rc-head');
      head.appendChild(iconNode(app));
      head.appendChild(el('span', 'rc-name', app.name));
      var close = el('button', 'rc-close', '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" fill="none"/></svg>');
      close.setAttribute('data-sfx', 'back');
      close.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var i = stack.indexOf(id);
        if (i >= 0) { stack.splice(i, 1); }
        if (current === id) {
          // 关掉的是当前应用：切到新的栈顶或主屏，并收起轮播
          current = stack.length ? stack[stack.length - 1] : 'home';
          closeRecents();
          showOnly(current === 'home' ? homeView : views[current], current !== 'home');
        } else if (stack.length === 0) {
          renderRecents();
        } else {
          renderRecents();
        }
      });
      head.appendChild(close);
      card.appendChild(head);
      var bodyPrev = el('div', 'rc-body');
      var rcBar = el('div', 'rc-bar');
      rcBar.style.background = 'linear-gradient(135deg,' + app.c[0] + ',' + app.c[1] + ')';
      bodyPrev.appendChild(rcBar);
      bodyPrev.appendChild(el('div', 'rc-mini',
        '<span class="rc-sk blk"></span><span class="rc-sk w90"></span>' +
        '<span class="rc-sk w70"></span><span class="rc-sk w50"></span>'));
      card.appendChild(bodyPrev);
      card.addEventListener('click', function () {
        var i = stack.indexOf(id);
        if (i >= 0) { stack.splice(i, 1); }
        stack.push(id);
        closeRecents();
        showOnly(views[id], true);
      });
      track.appendChild(card);
    });
    recentsEl.appendChild(track);
    recentsEl.appendChild(toolbar);
  }

  function openRecents() {
    renderRecents();
    recentsEl.classList.remove('hidden');
  }
  function closeRecents() {
    if (recentsEl) { recentsEl.classList.add('hidden'); }
  }

  /* ---------- 状态栏 / 时钟组件 ---------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function tick() {
    var d = new Date();
    var hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
    var t = document.getElementById('sbTime');
    if (t) { t.textContent = hm; }
    var wc = document.getElementById('wClock');
    if (wc) {
      var timeNode = wc.querySelector('.w-clock-time');
      if (timeNode) { timeNode.textContent = hm; }
      var sub = wc.querySelector('.w-clock-sub');
      if (sub) {
        sub.textContent = (d.getMonth() + 1) + '月' + d.getDate() + '日 星期' + WEEK[d.getDay()] + ' · 本地时间，大概准';
      }
      var analog = wc.querySelector('.w-analog');
      if (analog) {
        var hh = analog.querySelector('.w-hh');
        var mh = analog.querySelector('.w-mh');
        if (hh) { hh.style.transform = 'rotate(' + ((d.getHours() % 12) * 30 + d.getMinutes() * 0.5) + 'deg)'; }
        if (mh) { mh.style.transform = 'rotate(' + (d.getMinutes() * 6) + 'deg)'; }
      }
    }
  }

  /* ---------- 宿主 in-app 检测 ---------- */
  function detectInApp() {
    var inApp = false;
    try {
      if (global.xhs && global.xhs.miniTool) { inApp = true; }
      if (global.location && global.location.search.indexOf('inapp=1') >= 0) { inApp = true; }
    } catch (e) { /* 忽略 */ }
    if (inApp) { document.body.classList.add('in-app'); }
  }

  /* ---------- 开机启动屏 ---------- */
  function runBoot(onDone) {
    var screen = document.getElementById('bootScreen');
    var fill = document.getElementById('bootFill');
    var tip = document.getElementById('bootTip');
    if (!screen || !fill || !tip) { onDone(); return; }
    var TIPS = ['正在启动...', '正在加载模块...', '正在校准 AI 假装引擎...', '即将进入系统...'];
    var DURATION = 1800;
    var start = 0;
    function step(ts) {
      if (!start) { start = ts; }
      var p = (ts - start) / DURATION;
      if (p > 1) { p = 1; }
      fill.style.width = (p * 100) + '%';
      var ti = Math.floor(p * TIPS.length);
      if (ti >= TIPS.length) { ti = TIPS.length - 1; }
      tip.textContent = TIPS[ti];
      if (p < 1) { global.requestAnimationFrame(step); return; }
      screen.classList.add('done');
      var removed = false;
      function finish() {
        if (removed) { return; }
        removed = true;
        screen.removeEventListener('transitionend', finish);
        if (screen.parentNode) { screen.parentNode.removeChild(screen); }
        onDone();
      }
      screen.addEventListener('transitionend', finish);
      global.setTimeout(finish, 460);
    }
    global.requestAnimationFrame(step);
  }

  /* ---------- 启动 ---------- */
  /* 存储水合与开机动画并行：容器端能力慢也不会拖长开机时间。
   * 主题必须等水合完成再套用，否则默认值会把已保存的壁纸/深色设置盖掉。 */
  function init() {
    detectInApp();
    var pending = 2;
    function ready() {
      pending--;
      if (pending === 0) { startUI(); }
    }
    hydrateStore(function () { loadTheme(); sfxLoad(); applyTheme(); ready(); });
    runBoot(ready);
  }

  function startUI() {
    buildHome();
    buildRecents();
    sfxBind();   /* 系统音效的唯一入口：装好 click 委托，此后所有交互自动出声 */
    tick();
    global.setInterval(tick, 1000);
    // 游戏心跳 100ms（v1 同款精度）：闹钟响铃窗口 + 日历用时（仅当前视图写 DOM）
    global.setInterval(function () {
      alarmTick();
      if (calView) { calView.tick(); }
    }, 100);
    document.getElementById('keyBack').addEventListener('click', goBack);
    document.getElementById('keyHome').addEventListener('click', goHome);
    document.getElementById('keyRecents').addEventListener('click', function () {
      if (recentsEl.classList.contains('hidden')) { openRecents(); } else { closeRecents(); }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.AIOS = { openApp: openApp, goHome: goHome, goBack: goBack, theme: theme,
                  /* 月球天气的观测状态快照（自检用；只读，不提供任何写入口） */
                  weatherState: function () { return weatherView ? weatherView.state() : null; },
                  storeBackend: function () { return storeBackend; },
                  storeSummary: storeSummary,
                  hydrateStore: hydrateStore,
                  /* 应用商店数据快照（自检用；只读副本，改不动注入的那份） */
                  storeGroups: function () {
                    var out = [];
                    STORE_GROUPS.forEach(function (g) {
                      var items = [];
                      g.items.forEach(function (it) {
                        items.push({ name: it.n, dir: it.d, desc: it.t, status: it.s,
                                     label: it.st, tone: it.tone, tag: it.tag });
                      });
                      out.push({ tag: g.tag, name: g.name, items: items });
                    });
                    return out;
                  },
                  /* 系统音效接缝（自检用；只读 —— 开关只能从设置页切）：
                   * names 是音效词表，stats 给出上下文状态与各音效触发次数。 */
                  soundEnabled: function () { return sfxOn; },
                  soundNames: function () { return Object.keys(SFX_TABLE); },
                  soundStats: function () {
                    return { ctx: sfxCtx ? sfxCtx.state : 'none', dead: sfxDead,
                             armed: sfxArmed, plays: sfxPlays };
                  } };
})(window);
"""


def main():
    shots = cam_shots()
    store = store_apps()
    index_path = os.path.join(OUT, "index.html")
    js_path = os.path.join(OUT, "main.js")
    with io.open(index_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(HTML_HEAD)
        f.write(CSS.strip("\n"))
        f.write("\n")
        f.write(HTML_TAIL.strip("\n"))
        f.write("\n")
    # ensure_ascii=False：中文原样写进 main.js，别让项目定位变成 \uXXXX 转义
    js = JS.replace("__CAM_SHOTS__", json.dumps(shots))
    js = js.replace("__STORE_DATA__", json.dumps(store, ensure_ascii=False))
    with io.open(js_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(js.strip("\n"))
        f.write("\n")
    print("built:", index_path)
    print("built:", js_path, "（月球天气的 Three.js 与月面贴图在 ./assets/，由 build_zip.py 一并打包）")
    print("built: 相机取景素材 %d 张（./assets/cam/，由 _dev/make_cam_photos.py 派生）" % len(shots))
    print("built: 应用商店 %d 个分类 / %d 个项目（构建期由仓库根 TRACKS.md 派生）"
          % (len(store), sum(len(g["items"]) for g in store)))


if __name__ == "__main__":
    main()
