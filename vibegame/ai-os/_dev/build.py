# -*- coding: utf-8 -*-
"""ai-os v2 唯一真源构建脚本。

产出：
  ../index.html  —— 入口（内联 CSS，引用 ./main.js）
  ../main.js     —— 应用逻辑（ES2017 / Chrome 61 基线）

规范真源见 ../DESIGN.md。容器/兼容细则见仓库 .skill/minitool-zip-builder/。
运行：python build.py
"""
import io
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, ".."))

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
/* 宿主内嵌：左右给小红书自带按钮预留净空 */
body.in-app{ --safe-l:48px; --safe-r:92px; }

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

/* 钱包组件：银行卡质感深色卡（顶部sheen+内发丝），假余额，点按打码 */
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
  margin-bottom:10px;
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
/* 宿主内嵌：左右净空（48/92）吃掉宽度，Dock 若仍 4×62 必溢出 ——
 * 改为按格等分、图标用比例盒等比缩放（padding-top:100% 造正方形，Chrome 61 可用）。 */
body.in-app .dock{ padding:10px 12px; }
body.in-app .dock .app-tile{ flex:1 1 0; min-width:0; }
body.in-app .dock .app-icon{ position:relative; width:100%; height:0; padding-top:100%; }
body.in-app .dock .app-icon svg{
  position:absolute; left:50%; top:50%;
  width:52%; height:52%; transform:translate(-50%,-50%);
}
/* 半行组件（天气/钱包）在净空下会窄到放不下余额，改为竖排整行 */
body.in-app .w-row{ display:block; }
body.in-app .w-half + .w-half{ margin-left:0; }

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
.switch.on{ background:var(--ok); }
.switch.on:after{ left:21px; }

/* 壁纸选择 */
.walls{ display:flex; padding:6px 2px 12px 2px; }
.wall-swatch{
  width:56px; height:92px; border-radius:var(--r-sm);
  margin-right:12px; border:2px solid transparent;
  box-shadow:0 2px 6px rgba(0,0,0,.15);
}
.wall-swatch.sel{ border-color:var(--accent); box-shadow:0 0 0 2px var(--accent), 0 2px 8px rgba(108,76,241,.3); }

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
/* 净高不足的小屏：指标条与显示卡紧凑化，把高度让给键盘（行高不小于 ~40px） */
@media (max-height:700px){
  .calc-body .gstats{ padding:8px 12px; margin-bottom:8px; }
  .calc-body .calc-display{ padding:12px 18px; }
  .calc-body .calc-shown{ font-size:32px; }
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
 * 页脚高度全程不变 —— 按 = 前后页面不跳动。 */
.pfoot.calc-foot{
  position:relative;
  display:flex; flex-direction:column;
  flex:0 1 auto; min-height:0;
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
 * 整页不产生滚动。按键高度由行高决定（height:auto + 网格拉伸），不再写死 64px。 */
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
.bub{ max-width:80%; padding:10px 12px; border-radius:14px; font-size:14px; line-height:1.45; margin-bottom:10px; }
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
.dial-display{ text-align:center; font-size:28px; font-weight:700; min-height:36px; letter-spacing:1px; color:var(--ink); margin:8px 0 2px 0; }
.dial-status{ text-align:center; font-size:13px; color:var(--ink-dim); min-height:18px; }
.call-timer{ text-align:center; font-size:36px; font-weight:800; color:var(--ok); font-variant-numeric:tabular-nums; margin-top:10px; }
.call-ended-msg{ font-size:13px; color:var(--ink-dim); text-align:center; line-height:1.6; margin-top:12px; }
.dial-pad{ display:grid; grid-template-columns:repeat(3,1fr); grid-gap:12px; justify-items:center; }
.dkey{
  width:58px; height:58px; border-radius:50%;
  background:var(--card); border:1px solid var(--line);
  font-size:22px; font-weight:600; color:var(--ink);
  box-shadow:var(--sh-1), var(--hl);
  transition:transform .12s ease;
}
.dkey:active{ transform:scale(.92); }
.call-btn{
  width:64px; height:64px; border-radius:50%; margin:10px auto 0 auto;
  display:flex; align-items:center; justify-content:center;
  background:linear-gradient(135deg,#34C46F,#1E9E50);
  box-shadow:var(--sh-1), 0 8px 18px rgba(30,158,80,.35), inset 0 1px 0 rgba(255,255,255,.3);
}
.call-btn svg{ width:26px; height:26px; fill:#fff; }
.call-btn.hangup{ background:linear-gradient(135deg,#E86A6A,#E05252); box-shadow:var(--sh-1), 0 8px 18px rgba(224,82,82,.35); }
.hist-row{ display:flex; align-items:center; width:100%; padding:10px 2px; border-bottom:1px solid var(--line); font-size:13px; color:var(--ink); text-align:left; }
.hist-row:last-child{ border-bottom:none; }
.hist-row .ht{ margin-left:auto; font-size:11px; color:var(--ink-dim); }
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
.conv-name{ font-size:14px; font-weight:600; color:var(--ink); }
.conv-prev{ font-size:12px; color:var(--ink-dim); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
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
.cam-view{ position:relative; flex:1 1 auto; min-height:0; border-radius:var(--r-lg); overflow:hidden; box-shadow:var(--sh-2); }
.cam-el{ position:absolute; transform:translate(-50%,-50%); }
.cam-el.circle{ border-radius:50%; opacity:.6; }
.cam-el.glyph{ line-height:1; opacity:.85; }
.cam-hud{
  position:absolute; left:10px; bottom:10px;
  background:rgba(0,0,0,.35); color:#fff; font-size:11px;
  padding:4px 8px; border-radius:8px; font-variant-numeric:tabular-nums;
}
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
  transition:transform .12s ease;
}
.cam-shutter:active{ transform:scale(.9); }
.cam-top-btn{ padding:8px 14px; border-radius:999px; font-size:13px; font-weight:600; color:#fff; background:rgba(120,120,140,.35); }
.cam-top-btn.save{ background:linear-gradient(135deg,#FF6B35,#FF4D6D); }
.cam-foot{ display:flex; align-items:center; justify-content:space-between; }
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

/* ============ 多任务轮播（§3） ============ */
/* 遮罩只铺内容区（不含状态栏与底部金刚键）：金刚键在多任务下必须仍可按（DESIGN §3） */
.recents{
  position:absolute; top:0; left:0; right:0; bottom:0;
  z-index:30;
  background:rgba(10,10,16,.55);
  display:flex; align-items:center;
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

/* ============ 底部三大金刚键（§3） ============ */
.sysnav{
  flex:0 0 auto;
  display:flex; justify-content:space-around; align-items:center;
  height:52px;
  padding-bottom:var(--safe-bottom);
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
    <button class="syskey" id="keyBack" aria-label="返回"><svg viewBox="0 0 24 24"><path d="M16 5 L8 12 L16 19"/></svg></button>
    <button class="syskey" id="keyHome" aria-label="主页"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/></svg></button>
    <button class="syskey" id="keyRecents" aria-label="多任务"><svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg></button>
  </nav>

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
    gear: '<svg viewBox="0 0 24 24"><g fill="#fff"><rect x="10.5" y="1.5" width="3" height="4.6" rx="1.3"/><rect x="10.5" y="1.5" width="3" height="4.6" rx="1.3" transform="rotate(45 12 12)"/><rect x="10.5" y="1.5" width="3" height="4.6" rx="1.3" transform="rotate(90 12 12)"/><rect x="10.5" y="1.5" width="3" height="4.6" rx="1.3" transform="rotate(135 12 12)"/><rect x="10.5" y="1.5" width="3" height="4.6" rx="1.3" transform="rotate(180 12 12)"/><rect x="10.5" y="1.5" width="3" height="4.6" rx="1.3" transform="rotate(225 12 12)"/><rect x="10.5" y="1.5" width="3" height="4.6" rx="1.3" transform="rotate(270 12 12)"/><rect x="10.5" y="1.5" width="3" height="4.6" rx="1.3" transform="rotate(315 12 12)"/></g><circle cx="12" cy="12" r="5.4" fill="none" stroke="#fff" stroke-width="2.9"/></svg>'
  };

  /* ---------- 应用清单 ---------- */
  var APPS = [
    { id: 'calc',      name: '计算器', slogan: '它会算，只是偶尔不对', g: 'calc',  c: ['#6C7CF5', '#4A56D6'], deg: 135 },
    { id: 'assistant', name: '助手',   slogan: '它不会答，你得替它答', g: 'bot',   c: ['#4FC3F7', '#2E7FE8'], deg: 120 },
    { id: 'calendar',  name: '日历',   slogan: '它排的不是期，是雷',   g: 'cal',   c: ['#FFB84C', '#F08A1E'], deg: 150 },
    { id: 'schedule',  name: '日程',   slogan: '它记不住，得你帮它记', g: 'list',  c: ['#3ECF8E', '#17A06B'], deg: 135 },
    { id: 'alarm',     name: '闹钟',   slogan: '它不会响，得你帮它响', g: 'alarm', c: ['#8F7BF7', '#6A4CE0'], deg: 120 },
    { id: 'stats',     name: '统计',   slogan: '它不会分析，但你会',   g: 'chart', c: ['#4FD0E5', '#2E9EC4'], deg: 150 }
  ];
  var DOCK = [
    { id: 'phone',    name: '电话', slogan: '拨一个不存在的号码', g: 'phone',  c: ['#34C46F', '#1E9E50'], deg: 135 },
    { id: 'sms',      name: '短信', slogan: '收件箱永远干净',     g: 'sms',    c: ['#3F8FEA', '#2456C8'], deg: 120 },
    { id: 'camera',   name: '相机', slogan: '只拍得到取景框',     g: 'camera', c: ['#F06AA8', '#D2387A'], deg: 150 },
    { id: 'settings', name: '设置', slogan: '壁纸、外观与关于本机', g: 'gear',  c: ['#8E8E96', '#5C5C66'], deg: 135 }
  ];

  function findApp(id) {
    var i;
    for (i = 0; i < APPS.length; i++) { if (APPS[i].id === id) { return APPS[i]; } }
    for (i = 0; i < DOCK.length; i++) { if (DOCK[i].id === id) { return DOCK[i]; } }
    return null;
  }

  /* ---------- 存储（localStorage，前缀 aios_） ---------- */
  function store(key, val) {
    try { global.localStorage.setItem('aios_' + key, val); } catch (e) { /* 忽略 */ }
  }
  function read(key, dft) {
    try {
      var v = global.localStorage.getItem('aios_' + key);
      return v === null ? dft : v;
    } catch (e) { return dft; }
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
  var theme = {
    mode: read('mode', 'light'),
    wall: read('wall', 'light-mesh')
  };
  if (WALLS.indexOf(theme.wall) < 0) { theme.wall = 'light-mesh'; }

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

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (html !== undefined) { n.innerHTML = html; }
    return n;
  }

  function iconNode(app, extra) {
    var n = el('div', 'app-icon' + (extra ? ' ' + extra : ''));
    // 顶部高光 + 主题渐变；投影为中性（真机不用同色光晕，见 DESIGN §4.6）
    n.style.backgroundImage =
      'radial-gradient(120% 90% at 22% 0%, rgba(255,255,255,.30), rgba(255,255,255,0) 55%),' +
      'linear-gradient(' + (app.deg || 135) + 'deg,' + app.c[0] + ',' + app.c[1] + ')';
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

    // 天气组件：一眼假的设定数据（恶搞内核），纯展示不可点
    var weather = el('div', 'widget w-half w-weather');
    weather.appendChild(el('div', 'w-city', '月球 · 静海'));
    var wrow2 = el('div', 'w-wrow2');
    wrow2.appendChild(el('span', 'w-temp', '-173°'));
    wrow2.appendChild(el('span', 'w-glyphchip',
      '<svg viewBox="0 0 24 24"><path d="M20.6 14.6A9 9 0 1 1 9.4 3.4a7.2 7.2 0 0 0 11.2 11.2z"/></svg>'));
    weather.appendChild(wrow2);
    weather.appendChild(el('span', 'w-hl', '晴 · 流星雨概率 40%'));
    weather.appendChild(el('div', 'w-src', '数据来源：AI 编的，别当真'));
    row.appendChild(weather);

    // 钱包组件：银行卡质感，假余额，点按打码/还原（状态持久化）
    var wallet = el('button', 'widget w-half w-wallet');
    wallet.setAttribute('aria-label', '钱包组件，点按打码或还原余额');
    var masked = read('wmask', '0') === '1';
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
      var s = el('button', 'wall-swatch');
      s.style.background = WALL_PREVIEW[w];
      s.setAttribute('data-wall', w);
      s.addEventListener('click', function () {
        theme.wall = w;
        // 深色壁纸自动切深色组件，浅色壁纸自动切浅色，保持可读
        theme.mode = (w.indexOf('dark') === 0) ? 'dark' : 'light';
        applyTheme();
      });
      walls.appendChild(s);
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

    var cardAbout = el('div', 'card');
    cardAbout.appendChild(el('div', 'card-title', '关于本机'));
    cardAbout.appendChild(el('div', 'row', '<span class="lbl">设备名称</span><span class="val">人工智能 OS</span>'));
    cardAbout.appendChild(el('div', 'row', '<span class="lbl">系统版本</span><span class="val">v2.0</span>'));
    cardAbout.appendChild(el('div', 'row', '<span class="lbl">型号</span><span class="val">AI-1（模拟）</span>'));
    cardAbout.appendChild(el('div', 'row', '<span class="lbl">出品</span><span class="val">' + ABOUT_TXT.title + '</span>'));
    cardAbout.appendChild(el('div', 'row about-desc', ABOUT_TXT.description));
    body.appendChild(cardAbout);

    v.appendChild(body);
    v.appendChild(el('div', 'pfoot', '<div class="pfoot-hint">壁纸与外观选择会保存在本机</div>'));

    views.settings = v;
    viewRoot.appendChild(v);
  }

  function syncSettingsUI() {
    var sw = document.getElementById('swDark');
    if (sw) {
      if (theme.mode === 'dark') { sw.classList.add('on'); } else { sw.classList.remove('on'); }
    }
    var i, nodes = document.querySelectorAll('.wall-swatch');
    for (i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute('data-wall') === theme.wall) { nodes[i].classList.add('sel'); }
      else { nodes[i].classList.remove('sel'); }
    }
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
    var v = el('div', 'view hidden');
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
          say('表达式无效，AI 拒绝背锅', 'no');
          paint();
          return;
        }
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
      '<div class="alarm-result" data-f="res">闹钟将在整 30 秒响，响的时候按下去</div>';
    body.appendChild(disp);
    body.style.display = 'flex'; body.style.flexDirection = 'column';
    disp.style.marginTop = 'auto'; disp.style.marginBottom = 'auto';
    v.appendChild(body);
    var foot = el('div', 'pfoot');
    var ring = el('button', 'ring-btn', '响铃');
    var retryBtn = el('button', 'judge-btn judge-ok', '再来一次');
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
      disp.querySelector('[data-f="res"]').textContent = '闹钟将在整 30 秒响，响的时候按下去';
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
        lose(idx);
        return;
      }
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
  var ABOUT_TXT = {title:"人工智能科技 出品",description:"本产品名为人工智能，实则全靠人工。AI 负责假装工作，你负责干实事。",version:"v1.0"};
  var CAM_GRAD = ["linear-gradient(135deg, #667eea 0%, #764ba2 100%)","linear-gradient(135deg, #f093fb 0%, #f5576c 100%)","linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)","linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)","linear-gradient(135deg, #fa709a 0%, #fee140 100%)","linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)","linear-gradient(135deg, #d299c2 0%, #fef9d7 100%)","linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)","linear-gradient(135deg, #cd9cf2 0%, #f6f3ff 100%)","linear-gradient(135deg, #fddb92 0%, #d1fdff 100%)"];
  var CAM_COLORS = ["#fff","#ffd700","#ff6b6b","#4ecdc4","#45b7d1","#96ceb4","#ffeaa7","#dfe6e9"];
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
        if (secs <= 0) { clearInterval(timer); showRecall(); }
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
    var v = el('div', 'view hidden');
    v.appendChild(el('div', 'phead', '<h1>电话</h1>'));
    var body = el('div', 'pbody');
    var disp = el('div', 'dial-display', '请输入号码');
    var status = el('div', 'dial-status', '');
    var timerEl = el('div', 'call-timer', '');
    timerEl.style.display = 'none';
    var endMsg = el('div', 'call-ended-msg', '');
    body.appendChild(disp); body.appendChild(status); body.appendChild(timerEl); body.appendChild(endMsg);
    var histCard = el('div', 'card');
    histCard.appendChild(el('div', 'card-title', '最近通话'));
    var hist = el('div');
    histCard.appendChild(hist);
    histCard.style.flex = '1 1 auto'; histCard.style.overflowY = 'auto';
    body.style.display = 'flex'; body.style.flexDirection = 'column';
    body.appendChild(histCard);
    v.appendChild(body);
    var foot = el('div', 'pfoot');
    var pad = el('div', 'dial-pad');
    var actRow = el('div', 'cam-foot');
    actRow.style.marginTop = '10px';
    var delBtn = el('button', 'cam-side', '⌫');
    var callBtn = el('button', 'call-btn', '<svg viewBox="0 0 24 24"><path d="M6.6 10.8c1.5 2.9 3.8 5.2 6.7 6.7l2.2-2.2c.3-.3.7-.4 1-.2 1.2.4 2.4.6 3.7.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.7.1.3 0 .7-.2 1l-2.3 2.1z"/></svg>');
    var ghost = el('span', '', '');
    actRow.appendChild(delBtn); actRow.appendChild(callBtn); actRow.appendChild(ghost);
    foot.appendChild(pad); foot.appendChild(actRow);
    v.appendChild(foot);

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
      records.forEach(function (r) {
        var b = el('button', 'hist-row');
        b.innerHTML = '<span>' + fmt(r.number) + '</span><span class="ht">' + r.time + '</span>';
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
    function hangupIcon() { return '<svg viewBox="0 0 24 24"><path d="M12 9c-1.6 0-3.1.2-4.5.7v3.1c0 .4-.2.7-.5.9-.9.5-1.8 1.1-2.6 1.9-.4.4-1 .4-1.4 0L1 14.1c-.4-.4-.4-1 0-1.4C3.4 10.3 7.4 8.7 12 8.7s8.6 1.6 11 4c.4.4.4 1 0 1.4l-2 2c-.4.4-1 .4-1.4 0-.8-.8-1.7-1.4-2.6-1.9-.3-.2-.5-.5-.5-.9V9.7C15.1 9.2 13.6 9 12 9z" transform="rotate(135 12 12)"/></svg>'; }
    function connect() {
      phase = 'connected';
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
      callBtn.innerHTML = '<span style="color:#fff;font-size:14px;font-weight:700;">完成</span>';
    }
    function resetCallUi() {
      inCall = false; phase = 'idle';
      status.textContent = ''; endMsg.textContent = '';
      timerEl.style.display = 'none';
      disp.textContent = num ? fmt(num) : '请输入号码';
      callBtn.classList.remove('hangup');
      callBtn.innerHTML = phoneIcon();
    }
    function startCall() {
      if (!num || inCall) { return; }
      inCall = true; phase = 'dialing';
      endMsg.textContent = '';
      timerEl.style.display = 'none';
      status.textContent = CALL_TXT.dialing;
      disp.textContent = fmt(num);
      callBtn.classList.add('hangup');
      callBtn.innerHTML = hangupIcon();
      tDial = global.setTimeout(connect, 3000 + Math.random() * 5000);
    }
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].forEach(function (k) {
      var b = el('button', 'dkey', k);
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
    callBtn.addEventListener('click', function () {
      if (!inCall) { startCall(); return; }
      if (phase === 'ended') { resetCallUi(); return; }
      endCall(true);
    });
    v.onShow = function () { clearCallTimers(); if (inCall) { resetCallUi(); } };
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
      var t = el('div', 'bub ai typing', '<i></i><i></i><i></i>');
      chat.appendChild(t); body.scrollTop = body.scrollHeight;
      global.setTimeout(function () {
        if (t.parentNode) { t.parentNode.removeChild(t); }
        var reply = SMS_REPLY[Math.floor(Math.random() * SMS_REPLY.length)];
        msgs.push({ id: Date.now() + 1, sender: openConv, content: reply, time: now, read: true, isReply: true, conv: openConv });
        save(); paintChat();
      }, 2000);
    }
    send.addEventListener('click', doSend);
    input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { doSend(); } });
    v.onShow = paintList;
    paintList();
    return v;
  }

  /* ---------- 相机（v1 还原）：纯模拟取景 + 闪光灯 + 重拍/保存 ---------- */
  function buildCamera() {
    var v = el('div', 'view hidden');
    v.appendChild(el('div', 'phead', '<h1>相机</h1>'));
    var body = el('div', 'pbody');
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.overflow = 'hidden';
    var view = el('div', 'cam-view');
    var hud = el('div', 'cam-hud', '');
    var badge = el('div', 'cam-badge', 'AI OS 相机');
    var flash = el('div', 'cam-flash');
    view.appendChild(hud); view.appendChild(badge); view.appendChild(flash);
    body.appendChild(view);
    v.appendChild(body);
    var foot = el('div', 'pfoot');
    var frow = el('div', 'cam-foot');
    var cancelBtn = el('button', 'cam-top-btn', '重拍');
    cancelBtn.style.display = 'none';
    var saveBtn = el('button', 'cam-top-btn save', '保存');
    saveBtn.style.display = 'none';
    var leftBox = el('div'); leftBox.appendChild(cancelBtn);
    var rightBox = el('div'); rightBox.appendChild(saveBtn);
    var shutter = el('button', 'cam-shutter', '');
    var flashBtn = el('button', 'cam-side', '⚡');
    flashBtn.style.marginRight = '14px';
    var mid = el('div');
    mid.style.display = 'flex'; mid.style.alignItems = 'center';
    mid.appendChild(flashBtn); mid.appendChild(shutter);
    frow.appendChild(leftBox); frow.appendChild(mid); frow.appendChild(rightBox);
    foot.appendChild(frow);
    v.appendChild(foot);

    var flashOn = true; var photo = null; var preview = false;
    var liveScene = genScene();
    function genScene() {
      var types = ['circle', 'star', 'heart'];
      var els = [];
      var n = Math.floor(Math.random() * 5) + 3;
      for (var i = 0; i < n; i++) {
        els.push({
          type: types[Math.floor(Math.random() * types.length)],
          x: Math.random() * 80 + 10, y: Math.random() * 80 + 10,
          size: Math.random() * 30 + 20,
          color: CAM_COLORS[Math.floor(Math.random() * CAM_COLORS.length)]
        });
      }
      return { gradient: CAM_GRAD[Math.floor(Math.random() * CAM_GRAD.length)], elements: els };
    }
    function paintScene() {
      var olds = view.querySelectorAll('.cam-el');
      for (i2 = 0; i2 < olds.length; i2++) { olds[i2].parentNode.removeChild(olds[i2]); }
      var sc = preview ? photo : liveScene;
      view.style.background = sc.gradient;
      sc.elements.forEach(function (e) {
        var n2 = el('div', 'cam-el ' + (e.type === 'circle' ? 'circle' : 'glyph'));
        n2.style.left = e.x + '%'; n2.style.top = e.y + '%';
        if (e.type === 'circle') {
          n2.style.width = e.size + 'px'; n2.style.height = e.size + 'px'; n2.style.background = e.color;
        } else {
          n2.style.fontSize = e.size + 'px'; n2.style.color = e.color;
          n2.textContent = e.type === 'star' ? '★' : '♥';
        }
        view.insertBefore(n2, hud);
      });
    }
    var i2;
    function rndTemp() { return Math.round((Math.random() * 6 + 36) * 10) / 10; }
    hud.textContent = '镜头温度 ' + rndTemp() + '℃';
    global.setInterval(function () {
      if (preview || current !== 'camera') { return; }
      liveScene = genScene();
      hud.textContent = '镜头温度 ' + rndTemp() + '℃';
      paintScene();
    }, 3000);
    flashBtn.addEventListener('click', function () {
      flashOn = !flashOn;
      flashBtn.style.opacity = flashOn ? '1' : '.4';
    });
    shutter.addEventListener('click', function () {
      if (preview) { return; }
      if (flashOn) {
        flash.classList.add('on');
        global.setTimeout(function () { flash.classList.remove('on'); }, 150);
      }
      global.setTimeout(function () {
        photo = genScene(); preview = true;
        cancelBtn.style.display = ''; saveBtn.style.display = '';
        shutter.style.visibility = 'hidden';
        paintScene();
      }, 300);
    });
    cancelBtn.addEventListener('click', function () {
      preview = false; photo = null;
      cancelBtn.style.display = 'none'; saveBtn.style.display = 'none';
      shutter.style.visibility = '';
      liveScene = genScene(); paintScene();
    });
    saveBtn.addEventListener('click', function () {
      saveBtn.textContent = '已保存 ✓';
      global.setTimeout(function () {
        saveBtn.textContent = '保存';
        cancelBtn.click();
      }, 1500);
    });
    v.onShow = paintScene;
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
    v.appendChild(body);
    var foot = el('div', 'pfoot');
    var resetAll = el('button', 'act-btn danger', '重置全部数据');
    foot.appendChild(resetAll);
    v.appendChild(foot);
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
      cancel.addEventListener('click', function () { modalHost.style.display = 'none'; pending = null; });
      ok.addEventListener('click', function () {
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

  var BUILDERS = { calc: buildCalc, alarm: buildAlarm, calendar: buildCal, assistant: buildAssistant, schedule: buildSchedule, phone: buildPhone, sms: buildSms, camera: buildCamera, stats: buildStats };

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
    viewRoot.appendChild(recentsEl);
  }

  function renderRecents() {
    recentsEl.innerHTML = '';
    if (stack.length === 0) {
      recentsEl.appendChild(el('div', 'rc-empty', '暂无最近应用'));
      return;
    }
    var track = el('div', 'recents-track');
    // 最近优先：从栈顶往栈底排
    var order = stack.slice().reverse();
    order.forEach(function (id) {
      var app = findApp(id);
      var card = el('div', 'rc-card');
      var head = el('div', 'rc-head');
      head.appendChild(iconNode(app));
      head.appendChild(el('span', 'rc-name', app.name));
      var close = el('button', 'rc-close', '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" fill="none"/></svg>');
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

  /* ---------- 启动 ---------- */
  function init() {
    detectInApp();
    buildHome();
    buildRecents();
    applyTheme();
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

  global.AIOS = { openApp: openApp, goHome: goHome, goBack: goBack, theme: theme };
})(window);
"""


def main():
    index_path = os.path.join(OUT, "index.html")
    js_path = os.path.join(OUT, "main.js")
    with io.open(index_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(HTML_HEAD)
        f.write(CSS.strip("\n"))
        f.write("\n")
        f.write(HTML_TAIL.strip("\n"))
        f.write("\n")
    with io.open(js_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(JS.strip("\n"))
        f.write("\n")
    print("built:", index_path)
    print("built:", js_path)


if __name__ == "__main__":
    main()
