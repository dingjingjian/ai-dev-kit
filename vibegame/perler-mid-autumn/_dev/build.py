# -*- coding: utf-8 -*-
"""中秋拼豆坊 构建脚本（唯一真源）。

用法：python _dev/build.py
产出：../index.html + ../main.js（脚本必须外置为经典脚本，容器 CSP 禁止内联）
修复一律改本文件后重新生成，不要直接改 index.html / main.js。
"""
import json, os

BASE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(BASE, 'patterns.json'), 'r', encoding='utf-8') as f:
    PATTERNS_JSON = f.read()

HTML_TEMPLATE = r'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<title>中秋拼豆坊 · 月下拼豆</title>
<style>
:root{
  --paper:#F3EDE0; --ink:#2B2B2B;
  --red:#C8362B; --red-deep:#9E2620;
  --gold:#D4AF37; --gold-soft:#E6C65C; --gold-deep:#A6821E;
  --moon:#FFD45E; --moon-soft:#FBF6E9;
  --bg-1:#0c1120; --bg-2:#151c30; --bg-3:#1d2540;
  --panel:#181f33; --panel-2:#252e49;
  --text:#F2EBDD; --text-dim:#AEB6CC;
  --glass:rgba(30,38,60,0.78);
  --border-gold:rgba(212,175,55,0.28);
  --shadow:rgba(0,0,0,0.45);
  --ease:cubic-bezier(.2,.7,.3,1); --ease-back:cubic-bezier(.2,1.4,.4,1);
  /* 安全区：PC 模拟器注入 --safe-area-inset-* 变量，真机走 env()，两者都要兼容 */
  --safe-top:var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
  --safe-bottom:var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px));
  --safe-l:0px;
  --safe-r:0px;
}
body.in-app{
  --safe-top:calc(var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) + 40px);
  --safe-l:48px;
  --safe-r:92px;
}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
html,body{height:100%;}
body{
  font-family:"KaiTi","STKaiti","Kaiti SC","楷体","Songti SC","STSong","SimSun","Microsoft YaHei",serif;
  color:var(--text);
  display:flex;flex-direction:column;
  height:100vh;height:100dvh;
  overflow:hidden;
  -webkit-user-select:none;user-select:none;
  touch-action:manipulation;
  background:var(--bg-1);
  padding-top:var(--safe-top);
}
button{font-family:inherit;cursor:pointer;border:none;outline:none;background:none;color:inherit;}
input{font-family:inherit;}
canvas{display:block;}
/* 夜空底色 + 月晕 + 星尘 */
#bgCanvas{position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;}
.bg-noise{
  position:fixed;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:0;
  background:
    radial-gradient(circle at 84% 7%, rgba(255,212,94,0.18), transparent 24%),
    radial-gradient(circle at 10% 92%, rgba(38,64,122,0.40), transparent 46%),
    radial-gradient(circle at 50% 50%, rgba(127,166,201,0.05), transparent 60%),
    linear-gradient(165deg, #131a2c 0%, #090d18 100%);
}
.bg-noise::after{
  content:"";position:absolute;top:0;left:0;right:0;bottom:0;
  background:url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E");
  opacity:0.5;
}
.corner-decor{
  position:fixed;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:1;
  background:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cpath d='M10,110 Q30,30 110,10' fill='none' stroke='rgba(212,175,55,0.18)' stroke-width='1.5'/%3E%3Cpath d='M20,110 Q35,35 110,20' fill='none' stroke='rgba(212,175,55,0.10)' stroke-width='1'/%3E%3C/svg%3E") left top no-repeat,
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cpath d='M110,110 Q90,30 10,10' fill='none' stroke='rgba(212,175,55,0.18)' stroke-width='1.5'/%3E%3Cpath d='M100,110 Q85,35 10,20' fill='none' stroke='rgba(212,175,55,0.10)' stroke-width='1'/%3E%3C/svg%3E") right top no-repeat,
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cpath d='M10,10 Q30,90 110,110' fill='none' stroke='rgba(212,175,55,0.18)' stroke-width='1.5'/%3E%3Cpath d='M20,10 Q35,85 110,100' fill='none' stroke='rgba(212,175,55,0.10)' stroke-width='1'/%3E%3C/svg%3E") left bottom no-repeat,
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cpath d='M110,10 Q90,90 10,110' fill='none' stroke='rgba(212,175,55,0.18)' stroke-width='1.5'/%3E%3Cpath d='M100,10 Q85,85 10,100' fill='none' stroke='rgba(212,175,55,0.10)' stroke-width='1'/%3E%3C/svg%3E") right bottom no-repeat;
  background-size:120px 120px;
}

/* 顶栏 */
.topbar{
  flex-shrink:0;min-height:48px;display:flex;align-items:center;
  padding:6px calc(12px + var(--safe-r)) 6px calc(12px + var(--safe-l));
  background:linear-gradient(180deg, rgba(28,35,56,0.95), rgba(18,24,42,0.95));
  border-bottom:1px solid var(--border-gold);
  box-shadow:0 2px 14px rgba(0,0,0,0.35);
  z-index:10;
}
/* flex 间距用 margin 实现（安卓 9 以前的老 WebView 不支持 flex gap） */
.topbar>*:not(:first-child){margin-left:10px;}
/* 顶部只放信息与视觉记录，不放任何可点按钮 */
#refThumb{
  width:34px;height:34px;border-radius:8px;flex-shrink:0;
  background:#101627;
  box-shadow:0 0 0 1px rgba(212,175,55,0.45), 0 2px 7px rgba(0,0,0,0.45);
  transition:opacity .25s var(--ease), filter .25s var(--ease);
}
/* 挑战模式下只留轮廓，不给答案 */
#refThumb.masked{opacity:.24;filter:blur(1.7px) grayscale(.45);}
.topbar .rec{flex-shrink:0;display:flex;align-items:center;}
.topbar .rec .col{margin-left:9px;text-align:right;line-height:1.15;}
.topbar .rec .t{font-size:16px;font-weight:bold;color:var(--gold);font-variant-numeric:tabular-nums;}
.topbar .rec .s{font-size:10px;color:var(--gold-soft);letter-spacing:2px;}
.seal{
  width:34px;height:34px;border-radius:7px;flex-shrink:0;
  background:linear-gradient(145deg,var(--red),var(--red-deep));
  color:#fff;font-size:22px;font-weight:bold;
  display:flex;align-items:center;justify-content:center;
  box-shadow:0 2px 8px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.18);
  text-shadow:0 1px 2px rgba(0,0,0,0.3);
}
.title{flex:1;min-width:0;}
.title .main{font-size:17px;font-weight:bold;letter-spacing:2px;
  background:linear-gradient(90deg,var(--gold-soft),#fff6d4,var(--gold-soft));
  -webkit-background-clip:text;background-clip:text;color:transparent;
  animation:shine 4s linear infinite;
  background-size:200% 100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
@keyframes shine{0%{background-position:200% 0;}100%{background-position:-200% 0;}}
.title .sub{font-size:10px;color:var(--text-dim);letter-spacing:1px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.progress-ring{width:38px;height:38px;flex-shrink:0;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.5));}
.progress-ring circle.bg{fill:none;stroke:rgba(255,255,255,0.08);stroke-width:4;}
.progress-ring circle.fg{fill:none;stroke:var(--moon);stroke-width:4;stroke-linecap:round;
  transform:rotate(-90deg);transform-origin:50% 50%;
  transition:stroke-dashoffset .35s var(--ease);
}
.icon-btn{
  width:32px;height:32px;border-radius:50%;flex-shrink:0;
  background:rgba(255,255,255,0.07);color:var(--text-dim);
  display:flex;align-items:center;justify-content:center;transition:all .18s var(--ease);
}
.icon-btn svg{width:19px;height:19px;fill:currentColor;}
.icon-btn.on{background:linear-gradient(145deg,var(--gold-soft),var(--gold));color:#1a120a;}
/* 顶栏下拉菜单 */
.menu{
  position:absolute;bottom:calc(100% + 8px);right:calc(10px + var(--safe-r));width:210px;border-radius:13px;
  background:linear-gradient(180deg,var(--panel-2),var(--panel));
  border:1px solid var(--border-gold);
  box-shadow:0 -8px 30px rgba(0,0,0,0.55), 0 10px 34px rgba(0,0,0,0.45);
  overflow:hidden;opacity:0;transform:translateY(10px) scale(.97);pointer-events:none;
  transition:opacity .18s var(--ease),transform .18s var(--ease);z-index:70;
}
.menu.show{opacity:1;transform:none;pointer-events:auto;}
.menu-item{
  width:100%;display:flex;align-items:center;justify-content:space-between;
  padding:12px 14px;color:var(--text);font-size:14px;letter-spacing:1px;
  border-bottom:1px solid rgba(212,175,55,0.12);transition:background .15s;
}
.menu-item:last-child{border-bottom:none;}
.menu-item b{font-size:12px;color:var(--gold-soft);font-weight:normal;}
.menu-item:active{background:rgba(212,175,55,0.14);}

.stage{
  flex:1;position:relative;display:flex;align-items:center;justify-content:center;
  min-height:0;padding:12px;z-index:5;
}
/* 边框统一由 canvas 内部绘制，这里只保留外阴影，避免双描边与内阴影压暗边缘 */
#board{
  border-radius:16px;
  box-shadow:0 14px 40px rgba(0,0,0,0.55), 0 0 60px rgba(255,212,94,0.08);
  touch-action:none;
}

/* 色板 */
.palette-wrap{
  flex-shrink:0;z-index:10;
  background:linear-gradient(180deg, rgba(18,24,40,0.92), rgba(24,31,51,0.95));
  border-top:1px solid var(--border-gold);
}
/* 色板区只放珠子，不放任何标题文字 */
.palette{
  display:flex;flex-wrap:wrap;align-content:flex-start;
  padding:10px 2px 1px 14px;
  max-height:112px;overflow-y:auto;overflow-x:hidden;
  scrollbar-width:thin;
}
.palette::-webkit-scrollbar{width:3px;}
.palette::-webkit-scrollbar-thumb{background:rgba(212,175,55,0.25);border-radius:2px;}
.swab{flex-shrink:0;width:38px;height:38px;margin:0 12px 9px 0;border-radius:50%;position:relative;transition:transform .18s var(--ease-back),box-shadow .2s;
  box-shadow:0 3px 8px rgba(0,0,0,0.45), inset 0 2px 4px rgba(255,255,255,0.38), inset 0 -3px 6px rgba(0,0,0,0.4);
}
.swab::after{content:"";position:absolute;top:0;left:0;right:0;bottom:0;border-radius:50%;box-shadow:inset 0 0 8px rgba(0,0,0,0.25);}
.swab.sel{transform:scale(1.15);box-shadow:0 0 0 3px var(--moon), 0 5px 14px rgba(0,0,0,0.5);}
.swab .hole{position:absolute;top:0;left:0;right:0;bottom:0;border-radius:50%;box-shadow:inset 0 1px 2px rgba(0,0,0,0.55);}
.swab .hole::before{content:"";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:26%;height:26%;border-radius:50%;
  background:radial-gradient(circle at 30% 30%, rgba(255,255,255,0.15), rgba(0,0,0,0.4));
  box-shadow:inset 0 1px 2px rgba(0,0,0,0.5);
}
.swab .cnt{position:absolute;bottom:-2px;right:-2px;min-width:16px;height:16px;padding:0 3px;border-radius:8px;background:var(--panel-2);color:var(--gold-soft);font-size:9px;font-weight:bold;display:flex;align-items:center;justify-content:center;border:1px solid var(--border-gold);}

/* 工具条 */
.toolbar{
  flex-shrink:0;
  /* 旧 WebView 无 grid：先用 flex 兜底，支持 grid 的浏览器覆盖为 grid 布局 */
  display:flex;flex-wrap:wrap;justify-content:space-between;
  display:grid;grid-template-columns:repeat(6,1fr);
  grid-gap:6px;gap:6px;padding:8px 10px;
  padding-bottom:calc(8px + var(--safe-bottom));
  background:linear-gradient(180deg, rgba(24,31,51,0.95), rgba(18,24,40,0.98));
  border-top:1px solid var(--border-gold);
  z-index:20;position:relative;
}
.tool{
  flex:1 1 15%;min-width:0;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  height:50px;border-radius:12px;color:var(--text-dim);
  background:rgba(255,255,255,0.04);
  border:1px solid transparent;
  transition:all .18s var(--ease);
}
.tool svg{width:21px;height:21px;margin-bottom:3px;fill:currentColor;}
.tool span{font-size:10px;letter-spacing:1px;white-space:nowrap;}
.tool.on{color:#1a120a;background:linear-gradient(145deg,var(--gold-soft),var(--gold));border-color:transparent;font-weight:bold;box-shadow:0 2px 8px rgba(212,175,55,0.35);}
.tool.on svg{fill:#1a120a;}
@keyframes nudge{0%,100%{transform:translateX(0);}25%{transform:translateX(-3px);}75%{transform:translateX(3px);}}
.tool.confirm{
  color:#fff;background:linear-gradient(145deg,#D8483C,var(--red-deep));
  border-color:transparent;font-weight:bold;
  box-shadow:0 3px 12px rgba(200,54,42,0.5);
  animation:nudge .26s var(--ease) 2;
}
.tool.confirm svg{fill:#fff;}


/* Toast / Stamp */
.toast{
  position:fixed;left:50%;bottom:92px;transform:translateX(-50%) translateY(10px);
  background:rgba(10,14,26,0.94);color:var(--gold-soft);
  padding:10px 20px;border-radius:22px;font-size:13px;letter-spacing:1px;
  border:1px solid rgba(212,175,55,0.35);
  opacity:0;pointer-events:none;transition:opacity .25s, transform .25s;
  z-index:200;white-space:nowrap;box-shadow:0 6px 20px rgba(0,0,0,0.45);
}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0);}
.stamp{
  position:fixed;left:50%;top:38%;transform:translate(-50%,-50%) scale(0.3) rotate(-16deg);
  width:130px;height:130px;border-radius:16px;
  background:linear-gradient(145deg,var(--red),var(--red-deep));
  color:#fff;font-size:68px;font-weight:bold;
  display:flex;align-items:center;justify-content:center;
  box-shadow:0 0 0 5px rgba(255,255,255,0.12), 0 14px 50px rgba(0,0,0,0.65), inset 0 0 20px rgba(0,0,0,0.25);
  opacity:0;pointer-events:none;z-index:50;
  transition:opacity .4s, transform .6s var(--ease-back);
}
.stamp.show{opacity:1;transform:translate(-50%,-50%) scale(1) rotate(-8deg);}
#petals{position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:45;}

/* 面板遮罩（需高于 #homeView 的 z-index:90，否则图纸页弹窗会被首页盖住） */
.sheet, .modal{
  position:fixed;top:0;left:0;width:100%;height:100%;z-index:120;background:rgba(4,6,12,0.78);
  opacity:0;pointer-events:none;transition:opacity .25s;
  display:flex;align-items:flex-end;justify-content:center;
}
.sheet.show, .modal.show{opacity:1;pointer-events:auto;}
.sheet-panel{
  width:100%;max-height:78vh;border-radius:18px 18px 0 0;
  background:linear-gradient(180deg, var(--panel-2), var(--panel));
  border-top:1px solid var(--border-gold);
  transform:translateY(100%);transition:transform .3s var(--ease);
  padding:16px 16px calc(16px + var(--safe-bottom));
  overflow:auto;
}
.sheet.show .sheet-panel{transform:translateY(0);}
.sheet-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;}
.sheet-title{font-size:18px;font-weight:bold;color:var(--gold-soft);letter-spacing:1px;}
.sheet-close{width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.08);color:var(--text);font-size:20px;display:flex;align-items:center;justify-content:center;}

.modal{align-items:center;padding:16px;}
.modal-card{
  width:100%;max-width:360px;border-radius:18px;
  background:linear-gradient(180deg, var(--panel-2), var(--panel));
  border:1px solid var(--border-gold);
  box-shadow:0 14px 50px rgba(0,0,0,0.55);
  transform:scale(0.92);transition:transform .25s var(--ease-back);
  padding:22px;text-align:center;
}
.modal.show .modal-card{transform:scale(1);}
.modal-card h2{font-size:22px;color:var(--gold-soft);margin-bottom:6px;letter-spacing:2px;}
.modal-card p{font-size:13px;color:var(--text-dim);line-height:1.6;margin-bottom:14px;}
.modal-stars{font-size:24px;color:var(--moon);margin-bottom:10px;letter-spacing:3px;}
.modal-stats{display:flex;justify-content:center;margin-bottom:16px;font-size:13px;color:var(--text-dim);}
.modal-stats>*+*{margin-left:20px;}
.modal-stats b{display:block;font-size:18px;color:var(--moon);}
.modal-btns{display:flex;}
.modal-btns button+button{margin-left:10px;}
.modal-btns button{flex:1;height:42px;border-radius:10px;background:linear-gradient(145deg,var(--gold-soft),var(--gold));color:#1a120a;font-weight:bold;font-size:14px;letter-spacing:1px;}
.modal-btns button.secondary{background:rgba(255,255,255,0.08);color:var(--text);border:1px solid var(--border-gold);}

/* 完成画廊 */
.gallery-grid{display:flex;flex-wrap:wrap;display:grid;grid-template-columns:repeat(3,1fr);grid-gap:10px;gap:10px;}
.gal-item{flex:0 0 calc(33.333% - 7px);border-radius:10px;background:#131a2c;height:0;padding-bottom:100%;position:relative;}
.gal-item canvas{position:absolute;top:5%;left:5%;width:90%;height:90%;border-radius:6px;}
.gal-item .name{position:absolute;bottom:4px;left:4px;right:4px;text-align:center;font-size:9px;color:var(--text-dim);background:rgba(0,0,0,0.55);border-radius:4px;}

/* 猜灯谜 */
.rd-lanterns{display:flex;justify-content:center;margin-bottom:14px;}
.rd-lanterns svg{width:22px;height:22px;margin:0 3px;fill:rgba(255,255,255,0.16);transition:fill .3s;}
.rd-lanterns svg.lit{fill:var(--moon);filter:drop-shadow(0 0 5px rgba(255,212,94,0.6));}
.rd-q{font-size:15px;line-height:1.7;color:var(--text);background:rgba(255,255,255,0.05);
  border:1px solid var(--border-gold);border-radius:12px;padding:13px 14px;margin-bottom:13px;letter-spacing:1px;}
.rd-opts{display:flex;flex-wrap:wrap;}
.rd-opt{flex:0 0 calc(50% - 5px);margin:0 5px 9px 0;height:42px;border-radius:10px;
  background:rgba(255,255,255,0.06);border:1px solid rgba(212,175,55,0.18);
  color:var(--text);font-size:14px;letter-spacing:1px;transition:all .16s var(--ease);}
.rd-opt:nth-child(2n){margin-right:0;}
.rd-opt:active{background:rgba(240,194,75,0.16);}
.rd-opt.ok{color:#1a120a;background:linear-gradient(145deg,var(--gold-soft),var(--gold));border-color:transparent;font-weight:bold;}
@keyframes rdshake{0%,100%{transform:translateX(0);}25%{transform:translateX(-5px);}75%{transform:translateX(5px);}}
.rd-opt.bad{color:#fff;background:linear-gradient(145deg,#D8483C,var(--red-deep));border-color:transparent;animation:rdshake .3s var(--ease);}
.rd-note{font-size:13px;color:var(--text-dim);line-height:1.7;min-height:20px;}
.rd-note b{color:var(--gold-soft);display:block;margin-bottom:4px;}
.rd-btn{margin-top:12px;width:100%;height:40px;border-radius:10px;
  background:linear-gradient(145deg,var(--gold-soft),var(--gold));color:#1a120a;font-weight:bold;font-size:14px;letter-spacing:1px;}
.rd-lock,.rd-done{text-align:center;padding:16px 4px 6px;}
.rd-lock .rd-big,.rd-done .rd-big{font-size:20px;color:var(--gold-soft);letter-spacing:3px;margin-bottom:10px;}
.rd-lock p,.rd-done p{font-size:13px;color:var(--text-dim);line-height:1.7;}


/* 视图容器：首页=图纸库，游戏页=拼豆台 */
#playView{flex:1;min-height:0;display:flex;flex-direction:column;}
#homeView{
  position:fixed;top:0;left:0;width:100%;height:100%;z-index:90;
  background:linear-gradient(180deg,#131a2c 0%,#0a0e1a 100%);
  display:flex;flex-direction:column;
  transition:opacity .3s var(--ease),transform .3s var(--ease);
}
#homeView.hide{opacity:0;pointer-events:none;transform:translateY(-16px);}
.home-head{
  flex-shrink:0;
  padding:calc(14px + var(--safe-top)) calc(14px + var(--safe-r)) 13px calc(14px + var(--safe-l));
  display:flex;align-items:center;
  border-bottom:1px solid var(--border-gold);
  background:linear-gradient(180deg,rgba(30,38,62,0.96),rgba(20,26,44,0.9));
}
.home-head>*:not(:first-child){margin-left:12px;}
.home-seal{
  width:46px;height:46px;border-radius:10px;flex-shrink:0;
  background:linear-gradient(145deg,var(--moon),var(--gold-deep));
  color:#221a08;font-size:26px;font-weight:bold;
  display:flex;align-items:center;justify-content:center;
  box-shadow:0 3px 12px rgba(240,194,75,0.28),inset 0 0 0 1px rgba(255,255,255,0.30);
}
.home-title{flex:1;min-width:0;}
.home-title .m{font-size:21px;font-weight:bold;letter-spacing:3px;
  background:linear-gradient(90deg,var(--gold-soft),#fff6d4,var(--gold-soft));
  -webkit-background-clip:text;background-clip:text;color:transparent;
  background-size:200% 100%;animation:shine 4s linear infinite;}
.home-title .s{font-size:11px;color:var(--text-dim);letter-spacing:2px;margin-top:3px;}
.home-stat{flex-shrink:0;text-align:right;font-size:10px;color:var(--text-dim);letter-spacing:1px;}
.home-stat b{display:block;font-size:17px;color:var(--moon);font-variant-numeric:tabular-nums;line-height:1.2;}
/* 灯谜横幅：心意速递之外的第二条活动线入口 */
.riddle-banner{
  flex-shrink:0;margin:10px calc(14px + var(--safe-r)) 0 calc(14px + var(--safe-l));
  display:flex;align-items:center;
  padding:9px 13px;border-radius:12px;
  background:linear-gradient(90deg,rgba(200,54,42,0.20),rgba(240,194,75,0.10));
  border:1px solid rgba(240,194,75,0.32);
  transition:transform .16s var(--ease);
}
.riddle-banner:active{transform:scale(.98);}
.riddle-banner svg{width:22px;height:22px;flex-shrink:0;fill:var(--moon);
  filter:drop-shadow(0 0 4px rgba(240,194,75,0.45));}
.riddle-banner .rb-t{margin-left:10px;font-size:14px;font-weight:bold;letter-spacing:2px;color:var(--gold-soft);}
.riddle-banner .rb-s{margin-left:auto;font-size:11px;color:var(--text-dim);letter-spacing:1px;}
.lib-tabs{flex-shrink:0;display:flex;padding:10px calc(12px + var(--safe-r)) 10px calc(12px + var(--safe-l));overflow-x:auto;scrollbar-width:none;}
.lib-tabs::-webkit-scrollbar{display:none;}
.lib-tab{
  flex-shrink:0;height:30px;padding:0 14px;margin-right:8px;border-radius:15px;font-size:13px;
  color:var(--text-dim);background:rgba(255,255,255,0.05);
  border:1px solid rgba(212,175,55,0.18);white-space:nowrap;transition:all .18s var(--ease);
}
.lib-tab.sel{color:#1a120a;background:linear-gradient(145deg,var(--gold-soft),var(--gold));border-color:transparent;font-weight:bold;}
.lib-body{flex:1;overflow-y:auto;padding:2px calc(12px + var(--safe-r)) calc(18px + var(--safe-bottom)) calc(12px + var(--safe-l));}
.lib-grid{display:flex;flex-wrap:wrap;display:grid;grid-template-columns:repeat(2,1fr);grid-gap:12px;gap:12px;}
.lib-card{
  flex:0 0 calc(50% - 6px);min-width:0;
  border-radius:14px;background:var(--panel);border:1px solid rgba(212,175,55,0.15);
  overflow:hidden;display:flex;flex-direction:column;transition:transform .2s var(--ease);
}
.lib-card:active{transform:scale(.97);}
.lib-card.cur{border-color:var(--moon);box-shadow:0 0 0 1px var(--moon),0 4px 14px rgba(240,194,75,0.22);}
/* aspect-ratio（Chrome 88+）老 WebView 不支持，用 padding-bottom 撑出正方形 */
.lib-thumb{width:100%;height:0;padding-bottom:100%;background:#101627;position:relative;}
.lib-thumb canvas{position:absolute;top:7%;left:7%;width:86%;height:86%;border-radius:8px;}
.lib-badge{position:absolute;top:6px;right:6px;padding:2px 7px;border-radius:9px;font-size:9px;letter-spacing:1px;background:var(--moon);color:#221a08;font-weight:bold;}
.lib-info{padding:8px 9px 10px;display:flex;flex-direction:column;}
.lib-info>*+*{margin-top:2px;}
.lib-name{font-size:14px;font-weight:bold;color:var(--text);letter-spacing:1px;}
.lib-meta{font-size:10px;color:var(--text-dim);letter-spacing:.5px;}
.lib-lore{font-size:10px;color:var(--gold-soft);opacity:.9;line-height:1.45;margin-top:3px;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.lib-empty{grid-column:1/-1;text-align:center;color:var(--text-dim);padding:34px 0;font-size:13px;}

/* 首页卡片「导图纸」按钮（左上角，不与右上角星级徽章冲突） */
.lib-card{position:relative;}
.lib-export{
  position:absolute;top:6px;left:6px;height:24px;padding:0 10px;border-radius:12px;
  font-size:10px;letter-spacing:1px;color:var(--gold-soft);
  background:rgba(20,14,8,0.72);border:1px solid var(--border-gold);
  transition:all .18s var(--ease);
}
.lib-export:active{background:rgba(212,175,55,0.4);color:#1a120a;}

/* 导出图纸面板（首页卡片也能直接打开，层级须压过 #homeView 的 90）
   图纸区占满剩余高度，画布等比 contain 缩放 —— 整张图纸一眼看全，无需上下滚动。 */
#sheetExport{z-index:95;}
.exp-panel{height:90vh;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;}
.exp-scroll{
  flex:1 1 auto;min-height:0;overflow:auto;-webkit-overflow-scrolling:touch;
  display:flex;align-items:center;justify-content:center;
  border-radius:10px;background:#F7F2E7;padding:8px;
}
#exportCanvas{display:block;margin:auto;max-width:100%;max-height:100%;width:auto;height:auto;cursor:zoom-in;transition:opacity .2s var(--ease);}
#exportCanvas.zoomed{max-width:none;max-height:none;height:100%;width:auto;cursor:zoom-out;}
.exp-tip{font-size:11px;color:var(--text-dim);letter-spacing:1px;margin-top:8px;text-align:center;}
.exp-btns{display:flex;margin-top:10px;}
.exp-btns button{flex:1;height:44px;border-radius:10px;font-weight:bold;font-size:14px;letter-spacing:1px;
  background:linear-gradient(145deg,var(--gold-soft),var(--gold));color:#1a120a;}
.exp-btns button.secondary{background:rgba(255,255,255,0.08);color:var(--text);border:1px solid var(--border-gold);}
.exp-btns button+button{margin-left:10px;}

/* 打印：只输出图纸画布本身（导出 PNG / 打印存 PDF 皆可用） */
@media print{
  html,body{height:auto!important;overflow:visible!important;background:#fff!important;padding-top:0!important;}
  #bgCanvas,.bg-noise,.corner-decor,#playView,#homeView,.toast,.stamp,#petals,
  .modal,#sheetGallery,#sheetExport .sheet-head,.exp-btns,.exp-tip{display:none!important;}
  #sheetExport{position:static!important;display:block!important;opacity:1!important;pointer-events:auto!important;background:#fff!important;}
  #sheetExport .sheet-panel{transform:none!important;height:auto!important;max-height:none!important;display:block!important;overflow:visible!important;background:#fff!important;border:none!important;box-shadow:none!important;padding:0!important;}
  .exp-scroll{display:block!important;overflow:visible!important;flex:none!important;height:auto!important;max-height:none!important;padding:0!important;border-radius:0!important;background:#fff!important;}
  #exportCanvas{width:100%!important;height:auto!important;max-height:none!important;max-width:100%!important;}
}</style>
</head>
<body>
  <canvas id="bgCanvas"></canvas>
  <div class="bg-noise"></div>
  <div class="corner-decor"></div>

  <div id="playView">
  <div class="topbar">
    <canvas id="refThumb" width="72" height="72"></canvas>
    <div class="title">
      <div class="main" id="patName">明月</div>
      <div class="sub" id="patMeta">赏月 · 13×13 · 113 豆</div>
    </div>
    <div class="rec">
      <svg class="progress-ring" viewBox="0 0 42 42"><circle class="bg" cx="21" cy="21" r="17"/><circle class="fg" id="pctRing" cx="21" cy="21" r="17" stroke-dasharray="106.8" stroke-dashoffset="106.8"/></svg>
      <div class="col">
        <div class="t" id="timer">00:00</div>
        <div class="s" id="stars">☆☆☆</div>
      </div>
    </div>
  </div>

  <div class="stage">
    <canvas id="board"></canvas>
  </div>

  <div class="palette-wrap">
    <div class="palette" id="palette"></div>
  </div>

  <div class="toolbar" id="toolbar">
    <button class="tool" data-tool="home"><svg viewBox="0 0 24 24"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/></svg><span>图纸</span></button>
    <button class="tool on" data-tool="pen"><svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg><span>画笔</span></button>
    <button class="tool" data-tool="erase"><svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-6 14.5c-1.5 0-2.9-.6-3.9-1.6L5.5 13c-.5-.5-.5-1.3 0-1.8l6.8-6.8c.5-.5 1.3-.5 1.8 0l4.6 4.6c.5.5.5 1.3 0 1.8l-6.8 6.8c-1 1-2.4 1.6-3.9 1.6z"/></svg><span>橡皮</span></button>
    <button class="tool" data-tool="hint"><svg viewBox="0 0 24 24"><path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6A4.997 4.997 0 0 1 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z"/></svg><span>提示</span></button>
    <button class="tool" data-tool="clear"><svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg><span>清空</span></button>
    <button class="tool" data-tool="more"><svg viewBox="0 0 24 24"><path d="M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg><span>更多</span></button>
    <div class="menu" id="moreMenu">
      <button class="menu-item" data-act="riddle"><span>猜灯谜</span><b id="menuRiddle">0/8 盏</b></button>
      <button class="menu-item" data-act="mode"><span>模式</span><b id="modeLabel">临摹</b></button>
      <button class="menu-item" data-act="export"><span>导出图纸</span><b>线下拼 ›</b></button>
      <button class="menu-item" data-act="gallery"><span>我的画廊</span><b id="galCount">0 幅</b></button>
      <button class="menu-item" data-act="sfx"><span>音效</span><b id="sfxLabel">开</b></button>
      <button class="menu-item" data-act="bgm"><span>背景音乐</span><b id="bgmLabel">开</b></button>
      <button class="menu-item" data-act="info"><span>玩法说明</span><b>›</b></button>
    </div>
  </div>
  </div><!-- /playView -->

  <div id="homeView">
    <div class="home-head">
      <div class="home-seal">月</div>
      <div class="home-title">
        <div class="m">中秋拼豆坊</div>
        <div class="s">十六幅月夜纹样 · 拼满即团圆</div>
      </div>
      <div class="home-stat">已拼成<b id="homeDone">0</b><span id="homeTotal">共 16 幅</span></div>
    </div>
    <button class="riddle-banner" id="riddleBanner">
      <svg viewBox="0 0 24 24"><path d="M8 2h8v2H8zM7 5h10c2.8 0 5 3.1 5 7s-2.2 7-5 7H7c-2.8 0-5-3.1-5-7s2.2-7 5-7zm4 2v10h2V7h-2zM10 20h4v2h-4z"/></svg>
      <span class="rb-t">猜灯谜</span>
      <span class="rb-s" id="rbState">已点亮 0/8 盏</span>
    </button>
    <div class="lib-tabs" id="libTabs"></div>
    <div class="lib-body"><div class="lib-grid" id="libGrid"></div></div>
  </div>

  <div class="toast" id="toast"></div>
  <div class="stamp" id="stamp">圆</div>
  <canvas id="petals"></canvas>

  <div class="sheet" id="sheetGallery">
    <div class="sheet-panel">
      <div class="sheet-head"><div class="sheet-title">我的画廊</div><button class="sheet-close" data-close>✕</button></div>
      <div class="gallery-grid" id="galleryGrid"></div>
    </div>
  </div>

  <div class="sheet" id="sheetRiddle">
    <div class="sheet-panel">
      <div class="sheet-head"><div class="sheet-title">猜灯谜 · 点亮中秋</div><button class="sheet-close" data-close>✕</button></div>
      <div id="riddleBody"></div>
    </div>
  </div>

  <div class="sheet" id="sheetExport">
    <div class="sheet-panel exp-panel">
      <div class="sheet-head"><div class="sheet-title" id="expTitle">拼豆图纸</div><button class="sheet-close" data-close>✕</button></div>
      <div class="exp-scroll"><canvas id="exportCanvas"></canvas></div>
      <div class="exp-tip" id="expTip">整张图纸已完整显示 · 点图纸可放大看色号</div>
      <div class="exp-btns">
        <button id="expPng">保存图片</button>
        <button class="secondary" id="expPrint">打印 / 存 PDF</button>
      </div>
    </div>
  </div>

  <div class="modal" id="winModal">
    <div class="modal-card">
      <h2>月圆拼成！</h2>
      <div class="modal-stars" id="winStars">★★★</div>
      <p id="winLore">中秋佳作，收入画廊。</p>
      <div class="modal-stats"><div>用时<br><b id="winTime">00:00</b></div><div>步数<br><b id="winMoves">0</b></div><div>失误<br><b id="winMistakes">0</b></div></div>
      <div class="modal-btns">
        <button id="winReplay">重玩</button>
        <button class="secondary" id="winExport">存图纸</button>
        <button id="winNext">下一幅</button>
      </div>
    </div>
  </div>

<script src="./main.js"></script>
</body>
</html>'''

# 小工具容器 CSP 的 script-src 不含 unsafe-inline，脚本必须外置为经典脚本，
# 由 index.html 用 <script src="./main.js"> 引入（勿改回内联，勿用 type="module"）。
JS_TEMPLATE = r'''(function(){
"use strict";
const PATTERNS = __PATTERNS_JSON__;

// 中秋色卡。硬约束：任意两色 RGB 欧氏距离 >= 60，否则逐格填豆时认不出（由 _dev/_check.py 体检）。
const PALETTE = [
  {code:'w',name:'月白',hex:'#FBF6E9'},{code:'e',name:'银灰',hex:'#9C9686'},
  {code:'k',name:'墨黑',hex:'#1C1A1E'},{code:'m',name:'栗棕',hex:'#63351A'},
  {code:'o',name:'赭石',hex:'#C8944E'},{code:'r',name:'朱砂',hex:'#D13B2E'},
  {code:'v',name:'绛紫',hex:'#7A2450'},{code:'p',name:'胭脂',hex:'#D9627F'},
  {code:'l',name:'藕荷',hex:'#E7B7C6'},{code:'y',name:'月黄',hex:'#FFD45E'},
  {code:'d',name:'描金',hex:'#A87A1E'},{code:'g',name:'豆绿',hex:'#8AB84E'},
  {code:'n',name:'松绿',hex:'#2E6B45'},{code:'t',name:'青碧',hex:'#35AD9C'},
  {code:'b',name:'夜蓝',hex:'#2E4FA6'},{code:'c',name:'天青',hex:'#8FB8DC'}
];
const PAL = {}; PALETTE.forEach(p=>PAL[p.code]=p.hex);
const MODES = {copy:'临摹',challenge:'挑战'};

// ==================== 中秋灯谜（拼成一幅图点亮一盏） ====================
const RIDDLES = [
  {id:'r1',q:'有时落在山腰，有时挂在树梢；有时像面圆镜，有时像把镰刀。（打一天体）',
   opts:['月亮','太阳','星星','云彩'],a:0,note:'阴晴圆缺都休说，且喜人间好时节。'},
  {id:'r2',q:'圆圆像个盘，甜甜馅里藏；中秋桌上摆，一家分着尝。（打一食品）',
   opts:['汤圆','月饼','烧饼','年糕'],a:1,note:'小饼如嚼月，中有酥与饴。'},
  {id:'r3',q:'耳朵长长尾巴短，红眼白毛爱捣药；嫦娥身边常相伴。（打一动物）',
   opts:['白猫','松鼠','玉兔','小鸡'],a:2,note:'白兔捣药秋复春，嫦娥孤栖与谁邻。'},
  {id:'r4',q:'八月开花香十里，金黄小粒藏叶底；吴刚挥斧砍不倒。（打一花木）',
   opts:['桂花','梅花','荷花','菊花'],a:0,note:'桂子月中落，天香云外飘。'},
  {id:'r5',q:'红红身子高高挂，肚里点灯照万家；中秋夜里满街走。（打一物）',
   opts:['蜡烛','烟花','对联','灯笼'],a:3,note:'一夜鱼龙舞，灯明照岁寒。'},
  {id:'r6',q:'一位仙女住月宫，偷吃灵药上青天；从此人间盼团圆。（打一神话人物）',
   opts:['织女','嫦娥','七仙女','龙女'],a:1,note:'嫦娥应悔偷灵药，碧海青天夜夜心。'},
  {id:'r7',q:'黄皮疙瘩大肚皮，剥开月牙一瓣瓣；中秋摆上求平安。（打一水果）',
   opts:['柚子','橘子','西瓜','苹果'],a:0,note:'柚子谐音「佑子」，中秋供果，护佑平安。'},
  {id:'r8',q:'八月十五月儿明，合家欢聚在堂前。（打一成语）',
   opts:['花好月圆','心想事成','年年有余','岁岁平安'],a:0,note:'但愿人长久，千里共婵娟。'}
];

// ==================== 音效引擎：Web Audio 程序化合成（零外部文件）====================
// 音色全部实时合成：木鱼/梆子（放豆）、编钟（通关）、古筝拨弦（背景音乐）、带通噪声（擦除/熨烫）
const SFX=(function(){
  let ctx=null, master=null, sfxBus=null, bgmBus=null, noiseBuf=null, reverb=null, wet=null;
  let on=true, bgmOn=true, unlocked=false;
  let bgmTimer=null, bgmBar=0, bgmBeat=0, lastPlace=0;
  // A 羽调式：羽 A - 宫 C - 商 D - 角 E - 徵 G，跨三个八度。
  // 选羽调式而非宫调式，是因为羽调式色彩清冷幽远，更贴合月夜；主音 A 落在低音区做根音。
  const PENTA=[220.00,261.63,293.66,329.63,392.00,440.00,523.25,587.33,659.25,783.99,880.00,1046.50];

  function ensure(){
    if(ctx) return ctx;
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC) return null;
    try{ ctx=new AC(); }catch(e){ return null; }
    master=ctx.createGain(); master.gain.value=on?0.85:0; master.connect(ctx.destination);
    sfxBus=ctx.createGain(); sfxBus.gain.value=0.95; sfxBus.connect(master);
    bgmBus=ctx.createGain(); bgmBus.gain.value=0.42; bgmBus.connect(master);
    // ConvolverNode 在部分老 WebView 上不存在：缺失时静默降级为无混响干声，不能因此抛错
    try{
      if(ctx.createConvolver){
        reverb=makeReverb(2.6,0.72);
        wet=ctx.createGain(); wet.gain.value=0.30; reverb.connect(wet); wet.connect(master);
      }
    }catch(e){ reverb=null; wet=null; }
    return ctx;
  }
  function live(){ return on && ctx; }
  // 程序化混响：噪声脉冲响应 + 一阶低通，尾巴越拖越暗，模拟月下空庭余韵（零外部 IR 文件）
  function makeReverb(sec,decay){
    const rate=ctx.sampleRate, len=Math.max(1,Math.floor(rate*sec));
    const buf=ctx.createBuffer(2,len,rate);
    for(let ch=0;ch<2;ch++){
      const d=buf.getChannelData(ch);
      let lp=0;
      for(let i=0;i<len;i++){
        lp+=((Math.random()*2-1)-lp)*0.36;
        d[i]=lp*Math.pow(1-i/len,decay);
      }
    }
    const cv=ctx.createConvolver(); cv.buffer=buf; return cv;
  }
  function noise(){
    if(!noiseBuf){
      const len=Math.floor(ctx.sampleRate*1.2);
      noiseBuf=ctx.createBuffer(1,len,ctx.sampleRate);
      const d=noiseBuf.getChannelData(0);
      for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
    }
    return noiseBuf;
  }

  // --- 基础音色 ---
  // 古筝拨弦：三角波主体 + 泛音，低通随时间收敛模拟弦振衰减
  function pluck(freq,t,dur,amp,dest,rev){
    const o=ctx.createOscillator(); o.type='triangle'; o.frequency.value=freq;
    const o2=ctx.createOscillator(); o2.type='sine'; o2.frequency.value=freq*2.01;
    const f=ctx.createBiquadFilter(); f.type='lowpass';
    f.frequency.setValueAtTime(Math.min(12000,freq*7),t);
    f.frequency.exponentialRampToValueAtTime(Math.max(120,freq*1.4),t+dur);
    const g=ctx.createGain(), g2=ctx.createGain();
    g.gain.setValueAtTime(0.0001,t);
    g.gain.linearRampToValueAtTime(amp,t+0.006);
    g.gain.exponentialRampToValueAtTime(0.0004,t+dur);
    g2.gain.setValueAtTime(0.0001,t);
    g2.gain.linearRampToValueAtTime(amp*0.28,t+0.004);
    g2.gain.exponentialRampToValueAtTime(0.0004,t+dur*0.45);
    o.connect(f); f.connect(g); g.connect(dest);
    o2.connect(g2); g2.connect(dest);
    if(rev&&reverb){ const rg=ctx.createGain(); rg.gain.value=rev; g.connect(rg); g2.connect(rg); rg.connect(reverb); }
    o.start(t); o.stop(t+dur+0.05);
    o2.start(t); o2.stop(t+dur+0.05);
  }
  // 木鱼/梆子：噪声瞬态 + 木质共鸣，用于放豆
  function mallet(freq,t,amp,dest){
    const src=ctx.createBufferSource(); src.buffer=noise(); src.loop=true;
    const bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=freq*2.4; bp.Q.value=1.5;
    const ng=ctx.createGain();
    ng.gain.setValueAtTime(amp*0.55,t);
    ng.gain.exponentialRampToValueAtTime(0.0004,t+0.035);
    src.connect(bp); bp.connect(ng); ng.connect(dest);
    src.start(t,Math.random()*0.9); src.stop(t+0.06);
    const o=ctx.createOscillator(); o.type='triangle';
    o.frequency.setValueAtTime(freq,t);
    o.frequency.exponentialRampToValueAtTime(freq*0.8,t+0.07);
    const g=ctx.createGain();
    g.gain.setValueAtTime(0.0001,t);
    g.gain.linearRampToValueAtTime(amp,t+0.003);
    g.gain.exponentialRampToValueAtTime(0.0004,t+0.12);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t+0.18);
  }
  // 编钟/铃：非谐泛音叠加 + 长衰减
  function bell(freq,t,dur,amp,dest){
    [[1,1],[2.0,0.45],[2.76,0.28],[5.4,0.13]].forEach(function(p){
      const o=ctx.createOscillator(); o.type='sine'; o.frequency.value=freq*p[0];
      const g=ctx.createGain();
      g.gain.setValueAtTime(0.0001,t);
      g.gain.linearRampToValueAtTime(amp*p[1],t+0.007);
      g.gain.exponentialRampToValueAtTime(0.0003,t+dur*(1-0.14*Math.log2(p[0]+1)));
      o.connect(g); g.connect(dest);
      o.start(t); o.stop(t+dur+0.1);
    });
  }
  // 带通噪声扫频：擦除 / 熨烫
  function sweep(t,dur,f0,f1,amp,dest,q){
    const src=ctx.createBufferSource(); src.buffer=noise(); src.loop=true;
    const bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.Q.value=q||1.1;
    bp.frequency.setValueAtTime(f0,t);
    bp.frequency.exponentialRampToValueAtTime(f1,t+dur);
    const g=ctx.createGain();
    g.gain.setValueAtTime(0.0001,t);
    g.gain.linearRampToValueAtTime(amp,t+Math.min(0.05,dur*0.25));
    g.gain.exponentialRampToValueAtTime(0.0004,t+dur);
    src.connect(bp); bp.connect(g); g.connect(dest);
    src.start(t,Math.random()*0.5); src.stop(t+dur+0.05);
  }

  // --- 背景音乐：固定乐句循环（慢板 52BPM，8 拍一句）---
  // 纯随机游走没有主题、听着像试音；改成「起承转合」四条乐句循环，才是一首曲子。
  // 值 = PENTA 索引，-1 = 留白（留白比填满更空灵，也更省 CPU）。
  const BEAT=60/52;
  const MEL=[
    [5,7,6,5, 4,-1,3,-1],   // 起：主音上行后回落
    [7,8,7,6, 5, 4,-1,-1],  // 承：攀到高音再下行
    [5,6,5,3, 4, 5,-1,-1],  // 转：中段徘徊
    [8,-1,7,6, 5,-1,4,-1]   // 合：收束回主音
  ];
  const BASS=[0,-1,-1,-1, 2,-1,-1,-1];   // 低音只在 1、5 拍落点，撑住调性
  function bgmTick(){
    bgmTimer=null;
    if(!on||!bgmOn||!ctx) return;
    const t=ctx.currentTime+0.03;
    const phr=MEL[bgmBar%MEL.length];
    const mi=phr[bgmBeat];
    if(mi>=0){
      pluck(PENTA[mi],t,2.2,0.115,bgmBus,0.5);
      // 邻音装饰：模拟古筝「按滑」，概率触发，避免每句完全一样
      if(Math.random()<0.16) pluck(PENTA[Math.min(PENTA.length-1,mi+2)],t+0.14,1.1,0.055,bgmBus,0.4);
    }
    const bi=BASS[bgmBeat];
    if(bi>=0) pluck(PENTA[bi]/2,t,3.4,0.085,bgmBus,0.25);   // 低八度衬底
    // 每 4 句一次远处风铃般的高音，打破循环的机械感
    if(bgmBar%4===3&&bgmBeat===0) pluck(PENTA[10],t+0.3,2.6,0.05,bgmBus,0.85);
    bgmBeat=(bgmBeat+1)%8; if(bgmBeat===0) bgmBar++;
    bgmTimer=setTimeout(bgmTick,BEAT*1000);
  }
  function stopBgm(){ if(bgmTimer){ clearTimeout(bgmTimer); bgmTimer=null; } }

  const api={
    unlock:function(){
      const c=ensure(); if(!c) return;
      if(c.state==='suspended') c.resume();
      if(!unlocked){ unlocked=true; if(on&&bgmOn&&!bgmTimer) bgmTick(); }
    },
    isOn:function(){ return on; },
    isBgmOn:function(){ return bgmOn; },
    setOn:function(v){
      on=v;
      if(master&&ctx) master.gain.setTargetAtTime(v?0.85:0,ctx.currentTime,0.02);
      if(!v) stopBgm();
      else if(bgmOn&&unlocked&&!bgmTimer) bgmTick();
    },
    setBgm:function(v){
      bgmOn=v;
      if(!v) stopBgm();
      else if(on&&unlocked&&!bgmTimer) bgmTick();
    },
    load:function(){
      try{
        var a=JSON.parse(localStorage.getItem('pma_audio')||'null');
        if(a){ on=a.s!==0; bgmOn=a.b!==0; }
      }catch(e){}
      api.syncLabels();
    },
    save:function(){
      try{ localStorage.setItem('pma_audio',JSON.stringify({s:on?1:0,b:bgmOn?1:0})); }catch(e){}
    },
    syncLabels:function(){
      const a=document.getElementById('sfxLabel'), b=document.getElementById('bgmLabel');
      if(a) a.textContent=on?'开':'关';
      if(b) b.textContent=bgmOn?'开':'关';
    },
    // --- 交互音效 ---
    click:function(){ if(!live())return; pluck(880,ctx.currentTime+0.01,0.26,0.09,sfxBus); },
    select:function(){ if(!live())return; const t=ctx.currentTime+0.01;
      pluck(659.25,t,0.5,0.15,sfxBus); pluck(987.77,t+0.045,0.4,0.09,sfxBus); },
    place:function(){
      if(!live())return;
      const now=performance.now();
      if(now-lastPlace<55) return;          // 拖动连续填豆时节流，避免糊成一片
      lastPlace=now;
      mallet([523.25,587.33,659.25,783.99][(Math.random()*4)|0],ctx.currentTime+0.005,0.22,sfxBus);
    },
    erase:function(){ if(!live())return; sweep(ctx.currentTime+0.005,0.17,1800,420,0.13,sfxBus,1.4); },
    hint:function(){ if(!live())return; const t=ctx.currentTime+0.01;
      bell(783.99,t,1.1,0.15,sfxBus); bell(1046.5,t+0.12,1.3,0.12,sfxBus); },
    clear:function(){ if(!live())return; const t=ctx.currentTime+0.01;
      sweep(t,0.5,900,180,0.15,sfxBus,1.2); pluck(196,t+0.1,0.7,0.09,sfxBus); },
    iron:function(){ if(!live())return; sweep(ctx.currentTime+0.01,1.5,300,1400,0.075,sfxBus,0.8); },
    win:function(){
      if(!live())return;
      const t=ctx.currentTime+0.02;
      [392.00,440.00,523.25,587.33,659.25].forEach(function(f,i){ bell(f,t+i*0.115,1.9,0.19,sfxBus); });
      pluck(130.81,t,2.6,0.15,sfxBus);
      pluck(196.00,t+0.24,2.4,0.12,sfxBus);
    },
    error:function(){ if(!live())return; const t=ctx.currentTime+0.01;
      pluck(174.61,t,0.34,0.13,sfxBus); pluck(164.81,t+0.09,0.4,0.10,sfxBus); }
  };
  return api;
})();


function hexToRgb(h){h=h.replace('#','');return{r:parseInt(h.slice(0,2),16),g:parseInt(h.slice(2,4),16),b:parseInt(h.slice(4,6),16)};}
function clamp(v){return v<0?0:v>255?255:v|0;}
// padStart（Chrome 57+）在安卓 9 以前的老 WebView 上不存在，用自实现代替
function pad2(s){s=String(s);return s.length<2?'0'+s:s;}
function rgbToHex(r,g,b){return '#'+[r,g,b].map(x=>pad2(clamp(x).toString(16))).join('');}
function adjust(hex,f){const c=hexToRgb(hex);return rgbToHex(c.r+f*255,c.g+f*255,c.b+f*255);}
function lighten(hex,f){return adjust(hex,f);}
function darken(hex,f){return adjust(hex,-f);}

let n=0, target=[], state=[], curColor=null, tool='pen', mode='copy';
let showRef=true, celebrated=false;
let startTime=0, timerId=null, elapsed=0, moves=0, mistakes=0, hints=0;
let cell=0, boardPx=0, dpr=1, pad=8, sprites={};
let curPattern=0, usedColors=[], records={}, progress={}, lastRestored=false;
let painting=false, ironT=0, ironAnim=null, atHome=true;

const board=document.getElementById('board');
const ctx=board.getContext('2d');
const refThumb=document.getElementById('refThumb');
const pctRing=document.getElementById('pctRing');
const timerEl=document.getElementById('timer');
const starsEl=document.getElementById('stars');
const patNameEl=document.getElementById('patName');
const patMetaEl=document.getElementById('patMeta');
const paletteEl=document.getElementById('palette');
const toastEl=document.getElementById('toast');
const stamp=document.getElementById('stamp');
const petals=document.getElementById('petals');
const winModal=document.getElementById('winModal');
const modeLabel=document.getElementById('modeLabel');

function roundRect(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}

// 拼豆=短塑料管。正视图为「外圈圆环+中心圆孔」，绝非球体。
// 要点：孔径≈外径一半；哑光塑料（线性渐变，低对比）；外缘管壁压暗；孔洞有厚度；高光只落在环面上。
function drawBeadSprite(g,s,hex){
  const cx=s/2, cy=s/2;
  const R=s*0.40;      // 珠体外半径
  const RH=s*0.23;     // 中心孔半径（真实拼豆孔径约占外径 57%）
  g.clearRect(0,0,s,s);

  // 1) 底部软阴影（立在钉板上）
  const sh=g.createRadialGradient(cx,cy+R*0.18,0,cx,cy+R*0.18,R*0.90);
  sh.addColorStop(0,'rgba(0,0,0,0.26)');
  sh.addColorStop(0.50,'rgba(0,0,0,0.09)');
  sh.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=sh;
  g.beginPath();g.ellipse(cx,cy+R*0.32,R*0.90,R*0.40,0,0,Math.PI*2);g.fill();

  // 2) 珠体：外圆挖去中心孔
  g.save();
  g.beginPath();
  g.arc(cx,cy,R,0,Math.PI*2);
  g.arc(cx,cy,RH,0,Math.PI*2,true);
  g.clip();

  // 哑光塑料受光：上下轻微渐变，对比更低更平
  const lg=g.createLinearGradient(cx,cy-R,cx,cy+R);
  lg.addColorStop(0, lighten(hex,0.08));
  lg.addColorStop(0.42, hex);
  lg.addColorStop(1, darken(hex,0.08));
  g.fillStyle=lg; g.fillRect(cx-R,cy-R,R*2,R*2);

  // 管壁厚度：外缘轻微压暗
  const wall=g.createRadialGradient(cx,cy,R*0.74,cx,cy,R);
  wall.addColorStop(0,'rgba(0,0,0,0)');
  wall.addColorStop(1,'rgba(0,0,0,0.16)');
  g.fillStyle=wall; g.fillRect(cx-R,cy-R,R*2,R*2);
  g.restore();

  // 3) 孔洞：露出钉板/钉柱的暖灰色，孔壁下侧受光、上侧背光
  g.fillStyle='rgba(74,66,58,0.96)';
  g.beginPath();g.arc(cx,cy,RH,0,Math.PI*2);g.fill();
  g.fillStyle='rgba(255,255,255,0.12)';
  g.beginPath();g.ellipse(cx,cy+RH*0.34,RH*0.52,RH*0.20,0,0.22*Math.PI,0.78*Math.PI);g.fill();
  g.fillStyle='rgba(0,0,0,0.22)';
  g.beginPath();g.ellipse(cx,cy-RH*0.30,RH*0.50,RH*0.16,0,1.20*Math.PI,1.80*Math.PI);g.fill();

  // 4) 环面高光：左上小椭圆，不进入孔内
  g.fillStyle='rgba(255,255,255,0.22)';
  g.beginPath();
  g.ellipse(cx-R*0.22, cy-R*0.30, R*0.10, R*0.055, -0.55, 0, Math.PI*2);
  g.fill();
}

function buildSprites(){
  const s=Math.max(10,Math.round(cell*dpr));
  sprites={};
  PALETTE.forEach(p=>{
    const cv=document.createElement('canvas');cv.width=cv.height=s;
    drawBeadSprite(cv.getContext('2d'),s,p.hex);
    sprites[p.code]=cv;
  });
}

function computeLayout(){
  const stage=document.querySelector('.stage');
  const cs=getComputedStyle(stage);
  const padX=parseFloat(cs.paddingLeft)||0, padY=parseFloat(cs.paddingTop)||0;
  // clientWidth/Height 含 padding，减去后才是画布可用区，避免画布顶到 stage 边缘
  const availW=stage.clientWidth-padX*2, availH=stage.clientHeight-padY*2;
  const avail=Math.max(n*4,Math.floor(Math.min(availW,availH)));
  // 棋盘四周留出内边距，使最外圈拼豆不会压到木框上
  cell=Math.max(4,Math.floor(avail/(n+1.1)));
  pad=Math.max(12,Math.round(cell*0.42));
  boardPx=cell*n+pad*2;
  // 若仍超出可用区，回退一档
  if(boardPx>avail){
    cell=Math.max(4,cell-1);
    pad=Math.max(12,Math.round(cell*0.42));
    boardPx=cell*n+pad*2;
  }
  dpr=Math.min(window.devicePixelRatio||1,2.5);
  board.width=board.height=Math.round(boardPx*dpr);
  board.style.width=board.style.height=boardPx+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  buildSprites();
  render();
}

function drawBoardBg(){
  const r=16; // 与 CSS border-radius 保持一致，避免描边错位
  // 外框
  ctx.fillStyle='#2a2016';roundRect(ctx,0,0,boardPx,boardPx,r);ctx.fill();
  const fg=ctx.createLinearGradient(0,0,boardPx,boardPx);
  fg.addColorStop(0,'#3d2e20');fg.addColorStop(0.5,'#2a2016');fg.addColorStop(1,'#1f160f');
  ctx.fillStyle=fg;roundRect(ctx,2,2,boardPx-4,boardPx-4,r-2);ctx.fill();
  // 钉板面：从 pad-4 起，完整包住格子区（pad … pad+cell*n），四角留木框
  const i0=Math.max(4,pad-6), i1=boardPx-i0*2;
  const bg=ctx.createRadialGradient(boardPx/2,boardPx/2,boardPx*0.15,boardPx/2,boardPx/2,boardPx*0.65);
  bg.addColorStop(0,'#272019');bg.addColorStop(1,'#1b140e');
  ctx.fillStyle=bg;roundRect(ctx,i0,i0,i1,i1,r-5);ctx.fill();
  // 板面高光
  const sg=ctx.createRadialGradient(boardPx*0.35,boardPx*0.25,boardPx*0.05,boardPx*0.45,boardPx*0.45,boardPx*0.55);
  sg.addColorStop(0,'rgba(255,235,200,0.05)');sg.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=sg;roundRect(ctx,i0,i0,i1,i1,r-5);ctx.fill();
  ctx.lineWidth=1.5;ctx.strokeStyle='rgba(212,175,55,0.22)';
  roundRect(ctx,i0+1,i0+1,i1-2,i1-2,r-6);ctx.stroke();
}

function drawPeg(i,j){
  const cx=pad+i*cell+cell/2,cy=pad+j*cell+cell/2,pr=cell*0.19;
  // 孔影
  ctx.fillStyle='rgba(0,0,0,0.5)';
  ctx.beginPath();ctx.ellipse(cx,cy+pr*0.25,pr*0.92,pr*0.72,0,0,Math.PI*2);ctx.fill();
  // 钉柱
  const pg=ctx.createLinearGradient(cx-pr,cy-pr,cx+pr,cy+pr);
  pg.addColorStop(0,'#554a3d');pg.addColorStop(0.5,'#2d241a');pg.addColorStop(1,'#17120d');
  ctx.fillStyle=pg;
  ctx.beginPath();ctx.ellipse(cx,cy,pr*0.9,pr*0.7,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='rgba(255,235,200,0.13)';
  ctx.beginPath();ctx.ellipse(cx,cy-pr*0.1,pr*0.45,pr*0.3,0,0,Math.PI*2);ctx.fill();
}

function drawBeadAt(i,j,code,t=0){
  if(t>0){ drawFusedBead(i,j,code,t); return; }
  const sp=sprites[code]; if(!sp)return;
  ctx.drawImage(sp,pad+i*cell,pad+j*cell,cell,cell);
}

// 熨烫：孔闭合 → 珠子压扁扩散（缝隙消失）→ 表面对比降低变平滑 → 整片出光泽
function drawFusedBead(i,j,code,t){
  const cx=pad+i*cell+cell/2, cy=pad+j*cell+cell/2;
  const hex=PAL[code];
  const grow=Math.min(1,t/0.62);                 // 压扁扩散进度
  const flat=Math.min(1,t/0.82);                 // 表面平滑进度
  const R=cell*(0.40+0.14*grow);               // 0.40→0.54，相邻相接并略重叠
  const RH=cell*0.23*(1-grow);                 // 孔闭合

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx,cy,R,0,Math.PI*2);
  if(RH>0.4) ctx.arc(cx,cy,RH,0,Math.PI*2,true);
  ctx.clip();
  const lg=ctx.createLinearGradient(cx,cy-R,cx,cy+R);
  const lf=Math.max(0.01,0.08-0.10*flat);
  const df=Math.max(0.01,0.08-0.10*flat);
  lg.addColorStop(0, lighten(hex,lf));
  lg.addColorStop(0.42, hex);
  lg.addColorStop(1, darken(hex,df));
  ctx.fillStyle=lg;
  ctx.fillRect(cx-R,cy-R,R*2,R*2);
  // 管壁暗边随熨烫逐渐消失
  if(t<0.90){
    const wa=0.16*(1-t);
    const wall=ctx.createRadialGradient(cx,cy,R*0.74,cx,cy,R);
    wall.addColorStop(0,'rgba(0,0,0,0)');
    wall.addColorStop(1,'rgba(0,0,0,'+wa+')');
    ctx.fillStyle=wall;
    ctx.fillRect(cx-R,cy-R,R*2,R*2);
  }
  ctx.restore();

  // 残留孔洞：露出钉柱色，随熨烫淡出
  if(RH>0.4){
    ctx.fillStyle='rgba(74,66,58,'+(0.96*(1-grow))+')';
    ctx.beginPath();ctx.arc(cx,cy,RH,0,Math.PI*2);ctx.fill();
  }
  // 表面高光：熨烫前期保留，后期完全溶入整片光泽
  const hiA=Math.max(0,0.22-0.22*flat);
  if(hiA>0.01){
    ctx.fillStyle='rgba(255,255,255,'+hiA+')';
    ctx.beginPath();
    ctx.ellipse(cx-R*0.20, cy-R*0.28, R*(0.10+0.08*flat), R*(0.055+0.04*flat), -0.55, 0, Math.PI*2);
    ctx.fill();
  }
}

// 熨烫后期：整片作品表面的柔和反光（模拟熔融塑料的光泽，而非颗颗发光）
function drawIronSheen(t){
  if(t<0.45)return;
  const a=(t-0.45)/0.55;
  const i0=Math.max(4,pad-6), i1=boardPx-i0*2;
  ctx.save();
  ctx.beginPath();roundRect(ctx,i0,i0,i1,i1,10);ctx.clip();
  // 熨烫片的光泽：柔和、连续、偏暖，不像颗颗独立的高光
  const sg=ctx.createLinearGradient(pad,pad,pad+cell*n,pad+cell*n);
  sg.addColorStop(0,   'rgba(255,250,235,'+(0.16*a)+')');
  sg.addColorStop(0.28,'rgba(255,250,235,'+(0.04*a)+')');
  sg.addColorStop(0.52,'rgba(255,250,235,'+(0.18*a)+')');
  sg.addColorStop(0.76,'rgba(255,250,235,'+(0.03*a)+')');
  sg.addColorStop(1,   'rgba(255,250,235,0)');
  ctx.fillStyle=sg;
  ctx.fillRect(i0,i0,i1,i1);
  ctx.restore();
}

// 提示高亮：脉动光环 + 外扩波 + 内部辉光 + 四角准星（由 hint() 里的 rAF 持续重绘驱动）
function drawHint(){
  if(!hintCells.length)return;
  const phase=(Date.now()%1100)/1100;
  const pulse=0.5+0.5*Math.sin(phase*Math.PI*2);   // 0..1
  const r0=cell*0.42, r1=r0+cell*0.26*pulse;
  ctx.save();
  for(const hc of hintCells){
    const i=hc%n,j=hc/n|0;
    const cx=pad+i*cell+cell/2, cy=pad+j*cell+cell/2;
    // 1) 向外扩散的波
    ctx.globalAlpha=0.5*(1-pulse);
    ctx.strokeStyle=varGold; ctx.lineWidth=Math.max(2,cell*0.09);
    ctx.beginPath();ctx.arc(cx,cy,r1,0,Math.PI*2);ctx.stroke();
    // 2) 主环
    ctx.globalAlpha=0.6+0.4*pulse;
    ctx.lineWidth=Math.max(2.5,cell*0.13);
    ctx.beginPath();ctx.arc(cx,cy,r0,0,Math.PI*2);ctx.stroke();
    // 3) 内部辉光
    ctx.globalAlpha=1;
    const gg=ctx.createRadialGradient(cx,cy,0,cx,cy,r0);
    gg.addColorStop(0,'rgba(235,205,110,'+(0.28+0.26*pulse)+')');
    gg.addColorStop(0.65,'rgba(235,205,110,'+(0.10+0.10*pulse)+')');
    gg.addColorStop(1,'rgba(235,205,110,0)');
    ctx.fillStyle=gg;
    ctx.beginPath();ctx.arc(cx,cy,r0,0,Math.PI*2);ctx.fill();
    // 4) 四角准星，指向明确
    ctx.globalAlpha=0.55+0.45*pulse;
    ctx.strokeStyle=varGold; ctx.lineWidth=Math.max(2,cell*0.10);
    const R=cell*0.66, L=cell*0.22;
    for(let k=0;k<4;k++){
      const ang=k*Math.PI/2+Math.PI/4;
      const ux=Math.cos(ang),uy=Math.sin(ang);
      ctx.beginPath();
      ctx.moveTo(cx+ux*(R-L),cy+uy*(R-L));
      ctx.lineTo(cx+ux*R,cy+uy*R);
      ctx.stroke();
    }
  }
  ctx.restore();
}

let varGold='#D4AF37';
function render(){
  ctx.clearRect(0,0,boardPx,boardPx);
  drawBoardBg();
  // 1) 所有格子先画钉。拼豆是穿在钉上的短管，孔洞会透出钉柱顶部。
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    drawPeg(i,j);
  }
  // 2) 参照色块半透明叠在钉子之上
  if(showRef){
    ctx.globalAlpha=0.30;
    for(let j=0;j<n;j++)for(let i=0;i<n;i++){
      const k=j*n+i;
      if(target[k] && !state[k]) drawBeadAt(i,j,target[k]);
    }
    ctx.globalAlpha=1;
  }
  // 3) 已放的豆画在最上层
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const c=state[j*n+i];
    if(c) drawBeadAt(i,j,c,ironT);
  }
  drawIronSheen(ironT);
  drawHint();
}

function renderRefThumb(){
  const sz=refThumb.width,c=sz/n,g=refThumb.getContext('2d');
  g.clearRect(0,0,sz,sz);g.fillStyle='#101627';g.fillRect(0,0,sz,sz);
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const code=target[j*n+i]; if(!code)continue;
    g.fillStyle=PAL[code];g.beginPath();g.arc(i*c+c/2,j*c+c/2,c*0.46,0,Math.PI*2);g.fill();
  }
}

function selectPattern(i){
  curPattern=i;
  const p=PATTERNS[i];
  n=p.n;
  target=new Array(n*n).fill(null);
  for(let j=0;j<n;j++)for(let ii=0;ii<n;ii++){
    const ch=p.grid[j][ii];
    if(ch!=='.') target[j*n+ii]=ch;
  }
  // 恢复该图纸的独立进度（每幅图各自保存，切走再回来不丢）
  lastRestored=false;
  const saved=progress[p.id];
  const st=saved?unpackState(saved.g,n):null;
  if(st){
    state=st; elapsed=saved.t||0; moves=saved.m||0; mistakes=saved.k||0;
    lastRestored=state.some(c=>c!=null);
    // 防御：旧存档可能停留在完成态，直接清掉重来，避免一进来就弹庆祝
    if(isSolved()){
      state=new Array(n*n).fill(null); elapsed=0; moves=0; mistakes=0;
      lastRestored=false;
      clearProgress(p.id);
    }
  }else{
    state=new Array(n*n).fill(null); elapsed=0; moves=0; mistakes=0;
  }
  celebrated=false; ironT=0; stopHint(); hints=0;
  startTime=Date.now()-elapsed*1000; stopTimer();
  let beads=0; for(let k=0;k<n*n;k++) if(target[k]) beads++;
  patNameEl.textContent=p.name;
  timerEl.textContent=formatTime(elapsed);
  // 过滤色板
  usedColors=[];
  const counts={};
  target.forEach(c=>{if(c){counts[c]=(counts[c]||0)+1;}});
  usedColors=Object.keys(counts).sort((a,b)=>counts[b]-counts[a]);
  patMetaEl.textContent=p.cat+' · '+n+'×'+n+' · '+beads+' 豆 · '+usedColors.length+' 色';
  const first=usedColors[0];
  if(first) selectColor(first);
  renderPalette();
  renderRefThumb();
  computeLayout();
  updatePct();
}

function renderPalette(){
  paletteEl.innerHTML='';
  usedColors.forEach(code=>{
    const info=PALETTE.find(p=>p.code===code);
    const btn=document.createElement('button');
    btn.className='swab';btn.dataset.code=code;btn.title=info.name;
    btn.style.background='linear-gradient(145deg,'+lighten(info.hex,0.35)+','+info.hex+')';
    btn.innerHTML='<span class="hole"></span><span class="cnt">0/'+(countsInTarget(code))+'</span>';
    if(code===curColor) btn.classList.add('sel');
    btn.addEventListener('click',()=>selectColor(code));
    paletteEl.appendChild(btn);
  });
  updateMaterialCounts();
}

function countsInTarget(code){let c=0; target.forEach(x=>{if(x===code)c++}); return c;}
function countsInState(code){let c=0; state.forEach(x=>{if(x===code)c++}); return c;}

function updateMaterialCounts(){
  paletteEl.querySelectorAll('.swab').forEach(b=>{
    const code=b.dataset.code;
    const el=b.querySelector('.cnt');
    if(el)el.textContent=countsInState(code)+'/'+countsInTarget(code);
  });
}

function selectColor(code){
  curColor=code; tool='pen';
  SFX.select();
  setTool('pen');
  paletteEl.querySelectorAll('.swab').forEach(b=>b.classList.toggle('sel',b.dataset.code===code));
}

function setTool(t){
  tool=t;
  document.querySelectorAll('.tool').forEach(el=>el.classList.toggle('on',el.dataset.tool===t));
}

function setMode(m){
  mode=m; modeLabel.textContent=MODES[m];
  showRef=(mode!=='challenge');
  syncThumb();
  render();
}

function cellFromEvent(e){
  const r=board.getBoundingClientRect();
  const i=Math.floor((e.clientX-r.left-pad)/cell),j=Math.floor((e.clientY-r.top-pad)/cell);
  if(i<0||i>=n||j<0||j>=n)return null;
  return j*n+i;
}

function applyAt(e){
  if(celebrated)return;              // 拼成后锁盘，不能再加/擦豆
  const idx=cellFromEvent(e); if(idx==null)return;
  if(tool==='pen'){
    if(state[idx]!==curColor){state[idx]=curColor;moves++;SFX.place();render();updateMaterialCounts();updatePct();}
  }else if(tool==='erase'){
    if(state[idx]!=null){state[idx]=null;moves++;SFX.erase();render();updateMaterialCounts();updatePct();}
  }
}

function applyPointer(e){
  if(celebrated)return;              // 拼成后不再进入绘制状态
  painting=true;
  if(e.pointerId!=null){try{board.setPointerCapture(e.pointerId);}catch(_){}}
  applyAt(e);}
function onBoardMove(e){if(painting)applyAt(e);}
function endPaint(){
  if(!painting)return;
  painting=false;
  if(celebrated){render();return;}   // 已完成：不重算进度、不回写存档
  updatePct();saveProgress();
}
// Pointer Events（Chrome 55+）始终绑定；安卓 9 以前未升级的老 WebView 不支持时，
// 再补 Touch/Mouse 兜底监听，保证棋盘可拖动填豆（两套监听不会同时生效）。
board.addEventListener('pointerdown',applyPointer);
board.addEventListener('pointermove',onBoardMove);
board.addEventListener('pointerup',endPaint);
board.addEventListener('pointercancel',endPaint);
if(!window.PointerEvent){
  board.addEventListener('mousedown',applyPointer);
  board.addEventListener('mousemove',onBoardMove);
  document.addEventListener('mouseup',endPaint);
  board.addEventListener('touchstart',function(e){if(e.touches.length)applyPointer(e.touches[0]);},{passive:true});
  board.addEventListener('touchmove',function(e){if(painting&&e.touches.length){applyAt(e.touches[0]);e.preventDefault();}},{passive:false});
  board.addEventListener('touchend',endPaint);
  board.addEventListener('touchcancel',endPaint);
}

function updatePct(){
  let tot=0,ok=0;
  for(let k=0;k<n*n;k++){if(target[k]!=null){tot++;if(state[k]===target[k])ok++;}}
  const pct=tot?Math.round(ok/tot*100):0;
  const circum=106.8;
  pctRing.style.strokeDashoffset=String(circum-pct/100*circum);
  if(pct>=100&&tot>0&&!celebrated) celebrate();
  updateStars();
}

function formatTime(sec){
  const m=Math.floor(sec/60),s=sec%60;
  return pad2(m)+':'+pad2(s);
}
function startTimer(){if(timerId)clearInterval(timerId);timerId=setInterval(()=>{elapsed=Math.floor((Date.now()-startTime)/1000);timerEl.textContent=formatTime(elapsed);updateStars();},1000);}
function stopTimer(){clearInterval(timerId);timerId=null;}

function starCount(){
  const total=target.filter(x=>x!=null).length;
  if(!total)return 0;
  const timeScore=Math.max(0,1-elapsed/(total*18+60));
  const errorScore=Math.max(0,1-(mistakes*1.5)/total);
  const score=timeScore*0.4+errorScore*0.6;
  return score>0.78?3:score>0.45?2:1;
}
function updateStars(){
  if(!PATTERNS[curPattern])return;
  const s=starCount();
  starsEl.textContent=s?('★'.repeat(s)+(3-s?'☆'.repeat(3-s):'')):'☆☆☆';
}

function celebrate(){
  if(celebrated)return; celebrated=true; stopTimer();
  stopHint();                       // 完成时清掉提示，避免两个 rAF 打架
  saveCompletion();
  ironT=0;
  SFX.iron();
  let start=performance.now();
  ironAnim=requestAnimationFrame(function frame(now){
    const t=(now-start)/1600;
    ironT=Math.min(1,t);
    render();
    if(t<1) requestAnimationFrame(frame);
    else{
      stamp.classList.add('show');
      setTimeout(()=>stamp.classList.remove('show'),2400);
      spawnPetals();
      SFX.win();
      showToast('月圆拼成！中秋快乐 ✦');
      openWin();
    }
  });
}

function spawnPetals(){
  // 桂花飘落：金黄小瓣，与背景星尘同色系
  const c=petals,d=Math.min(window.devicePixelRatio||1,2);
  c.width=window.innerWidth*d;c.height=window.innerHeight*d;
  c.style.width=window.innerWidth+'px';c.style.height=window.innerHeight+'px';
  const g=c.getContext('2d');g.setTransform(d,0,0,d,0,0);
  const W=window.innerWidth,H=window.innerHeight;
  const cols=['#FFD45E','#E6C65C','#FBF6E9','#A87A1E'];
  const ps=[];
  for(let i=0;i<40;i++)ps.push({x:Math.random()*W,y:Math.random()*-H,vy:1.2+Math.random()*2.0,vr:(Math.random()-0.5)*0.18,ph:Math.random()*6,sz:5+Math.random()*7,col:cols[(Math.random()*cols.length)|0]});
  const start=performance.now();
  function frame(now){
    const el=now-start;g.clearRect(0,0,W,H);
    for(const p of ps){p.y+=p.vy;p.x+=Math.sin(el/600+p.ph)*0.6;p.rot=(p.rot||0)+p.vr;
      g.save();g.translate(p.x,p.y);g.rotate(p.rot);g.fillStyle=p.col;g.globalAlpha=0.9;
      g.beginPath();g.ellipse(0,0,p.sz,p.sz*0.55,0,0,Math.PI*2);g.fill();g.restore();
      if(p.y>H+20){p.y=-20;p.x=Math.random()*W;}}
    if(el<3000)requestAnimationFrame(frame);else g.clearRect(0,0,W,H);
  }
  requestAnimationFrame(frame);
}

let toastTimer=null;
function showToast(msg,ms){
  toastEl.textContent=msg;toastEl.classList.add('show');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove('show'),ms||1800);
}

let hintCells=[],hintTimer=null,hintRAF=null;
function stopHint(){
  if(hintTimer){clearTimeout(hintTimer);hintTimer=null;}
  if(hintRAF){cancelAnimationFrame(hintRAF);hintRAF=null;}
  hintCells=[];
}
function hint(){
  if(celebrated){showToast('已经拼好啦，不能再提示');return;}
  const extra=[],wrong=[],wrongCur=[],needCur=[],needOther=[];
  for(let k=0;k<n*n;k++){
    if(state[k]!=null && target[k]==null){extra.push(k);}          // 拼多了：豆放在图案之外
    else if(state[k]!=null && state[k]!==target[k]){
      wrong.push(k);                                              // 放错色：图案内但颜色不对
      if(state[k]===curColor) wrongCur.push(k);
    }else if(target[k]!=null && state[k]==null){
      if(target[k]===curColor) needCur.push(k);                   // 当前颜色还缺的位置
      else needOther.push(k);                                     // 其他颜色还缺的位置
    }
  }
  let cells,msg;
  if(extra.length){                                               // 1) 拼多了 → 指出图案外的多余豆
    cells=extra;
    msg='有 '+extra.length+' 颗豆拼多了（图案外），已高亮，用橡皮擦掉';
  }else if(needCur.length){                                       // 2) 当前颜色还缺 → 高亮所有可放位置
    cells=needCur;
    msg='高亮了「'+PALETTE.find(p=>p.code===curColor).name+'」还可放的 '+needCur.length+' 处';
  }else if(wrongCur.length){                                      // 3) 当前颜色放错了位置
    cells=wrongCur;
    msg='「'+PALETTE.find(p=>p.code===curColor).name+'」有 '+wrongCur.length+' 处放错了，已高亮';
  }else if(wrong.length){                                         // 4) 当前颜色没问题但有其他放错
    cells=wrong;
    msg='当前颜色没问题；另有 '+wrong.length+' 处放错了，已高亮';
  }else if(needOther.length){                                     // 5) 当前颜色全部拼对 → 指出剩余待拼
    cells=needOther;
    msg='当前颜色已全部拼对，剩余 '+needOther.length+' 处待拼已高亮';
  }else{
    showToast('已经完美啦');return;
  }
  stopHint();
  hintCells=cells;
  hints++; mistakes++; // 提示计一次失误参考
  SFX.hint();
  // render() 不是常驻循环，这里必须自己跑 rAF，否则脉动只画一帧静止画面
  (function loop(){
    if(!hintCells.length){hintRAF=null;return;}
    render();
    hintRAF=requestAnimationFrame(loop);
  })();
  hintTimer=setTimeout(()=>{stopHint();render();},3200);
  saveProgress();
  showToast(msg);
}

function clearBoard(){
  state=new Array(n*n).fill(null); moves=0; mistakes=0; elapsed=0; startTime=Date.now();
  celebrated=false; ironT=0; stopHint();   // 解锁画盘，清掉熨烫态与提示
  render();updateMaterialCounts();updatePct();
  clearProgress(PATTERNS[curPattern].id);
  SFX.clear();
  showToast('已清空');
}

// 清空需二次确认
let clearArmed=false,clearTimer=null;
function requestClear(btn){
  if(clearArmed){
    clearArmed=false;clearTimeout(clearTimer);
    btn.classList.remove('confirm');
    if(btn.querySelector('span'))btn.querySelector('span').textContent='清空';
    clearBoard();
    return;
  }
  clearArmed=true;
  btn.classList.add('confirm');
  if(btn.querySelector('span'))btn.querySelector('span').textContent='再点确认';
  showToast('再点一次「清空」确认擦掉全部');
  clearTimer=setTimeout(()=>{
    clearArmed=false;btn.classList.remove('confirm');
    if(btn.querySelector('span'))btn.querySelector('span').textContent='清空';
  },3000);
}

// 参照缩略图为纯展示：临摹清晰，挑战模式虚化只留轮廓（不再提供手动开关）
function syncThumb(){refThumb.classList.toggle('masked',!showRef);}

// 目标格全部填对 → 完成态
function isSolved(){
  let has=false;
  for(let k=0;k<n*n;k++){
    if(target[k]==null)continue;
    has=true;
    if(state[k]!==target[k])return false;
  }
  return has;
}

// 每幅图纸的独立进度：pma_progress = {图纸id:{g:压缩棋盘,t:已用时,m:步数,k:失误}}
function loadProgress(){
  try{progress=JSON.parse(localStorage.getItem('pma_progress')||'{}')||{};}catch(e){progress={};}
}
function packState(){return state.map(c=>c||'.').join('');}
function unpackState(s,nn){
  if(!s||s.length!==nn*nn)return null;
  const a=new Array(nn*nn).fill(null);
  for(let i=0;i<nn*nn;i++){const ch=s[i];if(ch!=='.')a[i]=ch;}
  return a;
}
function saveProgress(){
  if(!PATTERNS[curPattern])return;
  if(celebrated)return;              // 已完成不回写进度，避免下次进来直接判完成
  const id=PATTERNS[curPattern].id;
  if(state.some(c=>c!=null)) progress[id]={g:packState(),t:elapsed,m:moves,k:mistakes};
  else delete progress[id];
  try{localStorage.setItem('pma_progress',JSON.stringify(progress));}catch(e){}
}
function clearProgress(id){
  if(!(id in progress))return;
  delete progress[id];
  try{localStorage.setItem('pma_progress',JSON.stringify(progress));}catch(e){}
}

// 本地存档：pma_records = {图纸id:{t用时秒,s星级,m步数}}
function loadRecords(){
  records={};
  try{
    const raw=JSON.parse(localStorage.getItem('pma_records')||'null');
    if(raw&&typeof raw==='object'&&!Array.isArray(raw)) records=raw;
  }catch(e){records={};}
  updateGalCount();
}
function updateGalCount(){
  const n=Object.keys(records).length;
  const a=document.getElementById('galCount');
  if(a)a.textContent=n+' 幅';
}
function saveCompletion(){
  const id=PATTERNS[curPattern].id;
  const cur={t:elapsed,s:starCount(),m:moves};
  const prev=records[id];
  if(!prev||cur.s>prev.s||(cur.s===prev.s&&(!prev.t||cur.t<prev.t))) records[id]=cur;
  try{localStorage.setItem('pma_records',JSON.stringify(records));}catch(e){}
  clearProgress(id); // 拼完即清空该图进度，下次从头开始
  updateGalCount();
  syncRiddle();      // 新完成一幅 → 可能解锁下一盏灯谜
}
function isCompleted(id){return !!records[id];}

// ==================== 猜灯谜：拼成一幅点亮一盏 ====================
let riddleState={solved:[]};
function loadRiddle(){
  try{
    const r=JSON.parse(localStorage.getItem('pma_riddle')||'null');
    if(r&&Array.isArray(r.solved)){
      riddleState.solved=r.solved.filter(id=>RIDDLES.some(x=>x.id===id));
    }
  }catch(e){}
  syncRiddle();
}
function saveRiddle(){
  try{localStorage.setItem('pma_riddle',JSON.stringify(riddleState));}catch(e){}
}
// 同步「已点亮 N/8 盏」两处入口文案
function syncRiddle(){
  const lit=riddleState.solved.length, total=RIDDLES.length;
  const a=document.getElementById('rbState');
  const b=document.getElementById('menuRiddle');
  if(a)a.textContent='已点亮 '+lit+'/'+total+' 盏';
  if(b)b.textContent=lit+'/'+total+' 盏';
}
const LANTERN_SVG='<svg viewBox="0 0 24 24"><path d="M8 2h8v2H8zM7 5h10c2.8 0 5 3.1 5 7s-2.2 7-5 7H7c-2.8 0-5-3.1-5-7s2.2-7 5-7zm4 2v10h2V7h-2zM10 20h4v2h-4z"/></svg>';
function renderRiddleSheet(){
  const body=document.getElementById('riddleBody');
  const solved=riddleState.solved.length;
  syncRiddle();
  if(solved>=RIDDLES.length){
    body.innerHTML='<div class="rd-done"><div class="rd-big">灯火已全亮</div>'+
      '<p>八盏灯谜全部猜中，<br>愿你人月两团圆，中秋快乐。</p></div>';
    return;
  }
  const r=RIDDLES[solved];
  const unlocked=Object.keys(records).length;
  if(solved>=unlocked){
    body.innerHTML='<div class="rd-lock"><div class="rd-big">灯笼还暗着</div>'+
      '<p>拼成一幅图案，即可点亮第 '+(solved+1)+' 盏灯谜。<br>已完成 '+unlocked+' 幅，还差一幅。</p>'+
      '<button class="rd-btn" id="rdGo">去拼豆</button></div>';
    const b=document.getElementById('rdGo');
    if(b)b.addEventListener('click',function(){
      document.getElementById('sheetRiddle').classList.remove('show');
      showHome();
    });
    return;
  }
  let lanterns='';
  RIDDLES.forEach(function(x,i){
    lanterns+=LANTERN_SVG.replace('<svg','<svg class="'+(i<solved?'lit':'')+'"');
  });
  body.innerHTML='<div class="rd-lanterns">'+lanterns+'</div>'+
    '<div class="rd-q">'+(solved+1)+'. '+r.q+'</div>'+
    '<div class="rd-opts">'+r.opts.map((o,i)=>'<button class="rd-opt" data-i="'+i+'">'+String.fromCharCode(65+i)+' · '+o+'</button>').join('')+'</div>'+
    '<div class="rd-note" id="rdNote"></div>';
  body.querySelectorAll('.rd-opt').forEach(function(btn){
    btn.addEventListener('click',function(){
      const i=+btn.dataset.i;
      if(i===r.a){
        btn.classList.add('ok');
        riddleState.solved.push(r.id); saveRiddle(); syncRiddle();
        SFX.win();
        spawnPetals();
        document.getElementById('rdNote').innerHTML='<b>猜中啦，第 '+(solved+1)+' 盏灯点亮！</b>'+r.note+
          (solved+1<RIDDLES.length?'<button class="rd-btn" id="rdNext">下一盏</button>':'');
        const nb=document.getElementById('rdNext');
        if(nb)nb.addEventListener('click',renderRiddleSheet);
      }else{
        btn.classList.add('bad'); SFX.error();
        setTimeout(function(){btn.classList.remove('bad');},600);
      }
    });
  });
}
function openRiddle(){
  renderRiddleSheet();
  document.getElementById('sheetRiddle').classList.add('show');
}

// 图纸库全屏页
let libFilter='全部';
function renderLibrary(){
  const cats=['全部'];
  PATTERNS.forEach(p=>{if(cats.indexOf(p.cat)<0)cats.push(p.cat);});
  const tabs=document.getElementById('libTabs');
  tabs.innerHTML='';
  cats.forEach(c=>{
    const b=document.createElement('button');
    b.className='lib-tab'+(c===libFilter?' sel':'');
    b.textContent=c;
    b.addEventListener('click',()=>{libFilter=c;renderLibrary();});
    tabs.appendChild(b);
  });
  const hd=document.getElementById('homeDone'),ht=document.getElementById('homeTotal');
  if(hd)hd.textContent=Object.keys(records).length;
  if(ht)ht.textContent='共 '+PATTERNS.length+' 幅';
  const grid=document.getElementById('libGrid');
  grid.innerHTML='';
  const list=PATTERNS.filter(p=>libFilter==='全部'||p.cat===libFilter);
  list.forEach(p=>{
    const idx=PATTERNS.indexOf(p);
    const card=document.createElement('button');
    card.className='lib-card'+(idx===curPattern?' cur':'');
    const tw=document.createElement('div');tw.className='lib-thumb';
    const cv=document.createElement('canvas');cv.width=120;cv.height=120;
    const c=cv.getContext('2d');const sc=120/p.n;
    for(let j=0;j<p.n;j++)for(let i=0;i<p.n;i++){
      const code=p.grid[j][i];if(code==='.')continue;
      c.fillStyle=PAL[code];c.beginPath();c.arc(i*sc+sc/2,j*sc+sc/2,sc*0.46,0,Math.PI*2);c.fill();
    }
    tw.appendChild(cv);
    const rec=records[p.id];
    if(rec){
      const badge=document.createElement('div');badge.className='lib-badge';
      badge.textContent=rec.s>0?('★'.repeat(rec.s)):'已完成';
      tw.appendChild(badge);
    }
    let beads=0;const cols={};
    for(let j=0;j<p.n;j++)for(let i=0;i<p.n;i++){
      const ch=p.grid[j][i];if(ch!=='.'){beads++;cols[ch]=1;}
    }
    const colCount=Object.keys(cols).length;
    // 未完成的显示已拼进度
    let progTxt='';
    if(!rec){
      const pv=progress[p.id], pst=pv?unpackState(pv.g,p.n):null;
      if(pst){
        let tot=0,ok=0;
        for(let j=0;j<p.n;j++)for(let i=0;i<p.n;i++){
          const ch=p.grid[j][i]; if(ch==='.')continue;
          tot++; if(pst[j*p.n+i]===ch)ok++;
        }
        if(tot&&ok)progTxt=' · 已拼 '+Math.round(ok/tot*100)+'%';
      }
    }
    const timeStr=(rec&&rec.t)?(' · 上次 '+formatTime(rec.t)):'';
    const info=document.createElement('div');info.className='lib-info';
    info.innerHTML='<div class="lib-name">'+p.name+'</div>'+
      '<div class="lib-meta">'+p.cat+' · '+p.n+'×'+p.n+' · '+beads+' 豆 · '+colCount+' 色'+timeStr+progTxt+'</div>'+
      '<div class="lib-lore">'+p.lore+'</div>';
    card.appendChild(tw);card.appendChild(info);
    const ex=document.createElement('button');ex.className='lib-export';ex.textContent='导图纸';
    ex.addEventListener('click',function(e){e.stopPropagation();SFX.click();openExport(idx);});
    card.appendChild(ex);
    card.addEventListener('click',()=>{SFX.click();openPattern(idx);});
    grid.appendChild(card);
  });
  if(!list.length)grid.innerHTML='<div class="lib-empty">该分类暂无图纸</div>';
}

// 视图切换：首页（图纸库）↔ 拼豆台
function showHome(){
  atHome=true; stopTimer(); saveProgress();
  document.getElementById('homeView').classList.remove('hide');
  renderLibrary();
}
function showPlay(){
  atHome=false;
  document.getElementById('homeView').classList.add('hide');
  computeLayout();
}
function openPattern(i){
  selectPattern(i);   // 内部已按存档恢复棋盘/用时/步数，并同步 startTime
  startTimer();
  showPlay();
  showToast(lastRestored?'已恢复上次进度，继续拼':'照参照图选色珠，点棋盘填豆');
}

function openWin(){
  document.getElementById('winTime').textContent=formatTime(elapsed);
  document.getElementById('winMoves').textContent=moves;
  document.getElementById('winMistakes').textContent=mistakes;
  document.getElementById('winStars').textContent=starsEl.textContent;
  document.getElementById('winLore').textContent=PATTERNS[curPattern].lore;
  winModal.classList.add('show');
}
function closeWin(){winModal.classList.remove('show');}
function nextPattern(){closeWin();let i=curPattern+1;if(i>=PATTERNS.length)i=0;openPattern(i);}

function renderGallerySheet(){
  const grid=document.getElementById('galleryGrid');grid.innerHTML='';
  PATTERNS.filter(p=>isCompleted(p.id)).forEach(p=>{
    const item=document.createElement('div');item.className='gal-item';
    const cv=document.createElement('canvas');cv.width=80;cv.height=80;
    const c=cv.getContext('2d');const sc=80/p.n;
    c.fillStyle='#101627';c.fillRect(0,0,80,80);
    for(let j=0;j<p.n;j++)for(let i=0;i<p.n;i++){const code=p.grid[j][i];if(code==='.')continue;c.fillStyle=PAL[code];c.beginPath();c.arc(i*sc+sc/2,j*sc+sc/2,sc*0.46,0,Math.PI*2);c.fill();}
    item.appendChild(cv);
    const name=document.createElement('div');name.className='name';name.textContent=p.name;item.appendChild(name);
    item.addEventListener('click',()=>{document.getElementById('sheetGallery').classList.remove('show');openPattern(PATTERNS.indexOf(p));});
    grid.appendChild(item);
  });
  if(grid.children.length===0)grid.innerHTML='<div style="grid-column:1/-1;text-align:center;color:var(--text-dim);padding:20px 0;">暂无完成作品，快去拼一幅吧</div>';
}

// ==================== 导出图纸（线下制作拼豆用）====================
// 生成一张可直接打印 / 保存的图纸：编号网格 + 每 5 行列坐标 + 色号图例与用料清单。
// 单一真源是 exportCanvas 画布：保存 PNG 与打印（存 PDF）共用同一张图。
let exportIdx=-1;

function beadTextColor(hex){
  // 深色豆上写浅字、浅色豆上写深字
  const c=hexToRgb(hex);
  return (0.299*c.r+0.587*c.g+0.114*c.b)>150?'#3A3128':'#F2EBDD';
}

function openExport(idx){
  if(typeof idx==='number') exportIdx=idx;
  if(exportIdx<0||exportIdx>=PATTERNS.length) exportIdx=curPattern;
  renderExportSheet();
  document.getElementById('sheetExport').classList.add('show');
}

function renderExportSheet(){
  const p=PATTERNS[exportIdx];
  const cv=document.getElementById('exportCanvas');
  const g=cv.getContext('2d');
  // 统计
  let beads=0;const used={};
  for(let j=0;j<p.n;j++)for(let i=0;i<p.n;i++){
    const ch=p.grid[j][i];
    if(ch!=='.'){beads++;used[ch]=(used[ch]||0)+1;}
  }
  const codes=Object.keys(used);
  const PALNAME={};PALETTE.forEach(function(x){PALNAME[x.code]=x.name;});
  // 布局（逻辑坐标，2x 输出保证打印清晰）
  const cell=26,pad=26,numW=32,headH=82,legendRowH=40,footH=46;
  const legendRows=Math.ceil(codes.length/2)||1;
  const W=pad*2+numW+cell*p.n;
  const H=headH+cell*p.n+26+legendRows*legendRowH+footH;
  const X0=pad+numW,Y0=headH,GW=cell*p.n;
  const SC=2;
  cv.width=W*SC;cv.height=H*SC;
  g.setTransform(SC,0,0,SC,0,0);
  // 底色
  g.fillStyle='#F7F2E7';g.fillRect(0,0,W,H);
  // 标题区
  g.fillStyle='#2B241A';g.textAlign='left';g.textBaseline='alphabetic';
  g.font='bold 27px "KaiTi","STKaiti","Kaiti SC",serif';
  g.fillText('中秋拼豆坊 · '+p.name,X0,36);
  g.fillStyle='#7A6A50';g.font='15px "KaiTi","STKaiti","Kaiti SC",serif';
  g.fillText(p.cat+' · '+p.n+'×'+p.n+' · 共 '+beads+' 豆 · '+codes.length+' 色 · 线下拼豆图纸',X0,62);
  // 右上角小印
  g.strokeStyle='rgba(200,54,42,0.75)';g.lineWidth=2;
  g.strokeRect(W-pad-60,14,50,50);
  g.fillStyle='rgba(200,54,42,0.85)';g.font='bold 29px "KaiTi","STKaiti",serif';
  g.textAlign='center';g.textBaseline='middle';
  g.fillText(p.name.slice(0,1),W-pad-35,40);
  g.textAlign='left';g.textBaseline='alphabetic';
  // 网格底
  g.fillStyle='#FFFFFF';g.fillRect(X0,Y0,GW,GW);
  // 淡格线
  g.strokeStyle='rgba(70,58,44,0.16)';g.lineWidth=1;
  for(let i=0;i<=p.n;i++){
    g.beginPath();g.moveTo(X0+i*cell+0.5,Y0);g.lineTo(X0+i*cell+0.5,Y0+GW);g.stroke();
    g.beginPath();g.moveTo(X0,Y0+i*cell+0.5);g.lineTo(X0+GW,Y0+i*cell+0.5);g.stroke();
  }
  // 每 5 行列粗线
  g.strokeStyle='rgba(70,58,44,0.5)';g.lineWidth=1.6;
  for(let i=5;i<p.n;i+=5){
    g.beginPath();g.moveTo(X0+i*cell,Y0);g.lineTo(X0+i*cell,Y0+GW);g.stroke();
    g.beginPath();g.moveTo(X0,Y0+i*cell);g.lineTo(X0+GW,Y0+i*cell);g.stroke();
  }
  // 网格外框
  g.strokeStyle='#4A3E30';g.lineWidth=2;g.strokeRect(X0,Y0,GW,GW);
  // 豆：色圆 + 色号字母
  g.textAlign='center';g.textBaseline='middle';
  for(let j=0;j<p.n;j++)for(let i=0;i<p.n;i++){
    const ch=p.grid[j][i];
    if(ch==='.') continue;
    const cx=X0+i*cell+cell/2,cy=Y0+j*cell+cell/2;
    g.fillStyle=PAL[ch];
    g.beginPath();g.arc(cx,cy,cell*0.42,0,Math.PI*2);g.fill();
    g.fillStyle=beadTextColor(PAL[ch]);
    g.font='bold '+Math.round(cell*0.42)+'px Consolas,monospace';
    g.fillText(ch.toUpperCase(),cx,cy+0.5);
  }
  // 行列号（每 5，从 5 起算）
  g.fillStyle='#7A6A50';g.font='12px Consolas,monospace';g.textAlign='center';g.textBaseline='middle';
  for(let i=5;i<=p.n;i+=5){
    g.fillText(String(i),X0+i*cell-cell/2,Y0-14);
    g.fillText(String(i),X0-numW/2,Y0+i*cell-cell/2);
  }
  g.fillText('列 →',X0+GW-18,Y0-14);
  // 图例（两列：色样 + 色号/色名/数量）
  const ly=Y0+GW+22,lx0=X0,cw=GW/2;
  g.textAlign='left';
  codes.forEach(function(code,i){
    const col=i%2,row=(i/2)|0;
    const x=lx0+col*cw,y=ly+row*legendRowH;
    g.fillStyle=PAL[code];
    g.beginPath();g.arc(x+13,y+14,12,0,Math.PI*2);g.fill();
    g.strokeStyle='rgba(70,58,44,0.55)';g.lineWidth=1;g.stroke();
    g.fillStyle='#2B241A';g.font='bold 16px "KaiTi","STKaiti",serif';
    g.fillText(code.toUpperCase()+' '+PALNAME[code],x+32,y+9);
    g.fillStyle='#7A6A50';g.font='14px Consolas,monospace';
    g.fillText('× '+used[code],x+32,y+28);
  });
  // 页脚
  g.fillStyle='#7A6A50';g.font='13px "KaiTi","STKaiti",serif';
  g.fillText('照色号逐格放豆 · 拼完对照复核再熨烫 · 中秋拼豆坊',X0,H-18);
  document.getElementById('expTitle').textContent='拼豆图纸 · '+p.name;
  // 换图默认回到全景视图
  cv.classList.remove('zoomed');
  const tip=document.getElementById('expTip');
  if(tip) tip.textContent='整张图纸已完整显示 · 点图纸可放大看色号';
}

// 容器能力探测：小红书小工具注入 window.xhs.miniTool（见容器能力清单 §3）
function miniTool(){ return (window.xhs&&window.xhs.miniTool)||null; }
function inXhsContainer(){ return !!miniTool(); }

// 导出按钮状态反馈（保存是异步的，进度与结果必须看得见）
let expBtnTimer=null;
function expIdleLabel(){
  const b=document.getElementById('expPng');
  return (b&&b.dataset.idle)||'保存图片';
}
function expBtn(text,busy){
  const b=document.getElementById('expPng');
  if(!b) return;
  b.textContent=text;
  b.disabled=!!busy;
  b.style.opacity=busy?'0.6':'1';
  b.style.pointerEvents=busy?'none':'auto';
}
function expBtnFlash(text,ms){
  expBtn(text,false);
  clearTimeout(expBtnTimer);
  expBtnTimer=setTimeout(function(){expBtn(expIdleLabel(),false);},ms||2400);
}
function expBeep(ok){
  try{ if(ok){SFX.select&&SFX.select();}else{SFX.click&&SFX.click();} }catch(e){}
}

// 降级路径：普通浏览器（无容器 SDK）仍走 a[download]
function saveByDownload(cv,name){
  try{
    if(!cv.toBlob){ showToast('当前环境不支持导出图片',2600); return; }
    cv.toBlob(function(b){
      if(!b){showToast('当前环境不支持导出图片',2600);return;}
      const a=document.createElement('a');
      a.href=URL.createObjectURL(b);a.download=name;
      document.body.appendChild(a);a.click();document.body.removeChild(a);
      setTimeout(function(){URL.revokeObjectURL(a.href);},2000);
      expBeep(true);expBtnFlash('已保存 ✓');
      showToast('图纸已保存：'+name,2600);
    },'image/png');
  }catch(e){ expBeep(false);showToast('导出失败，可改用打印存 PDF',2600); }
}

function saveExportPng(){
  const p=PATTERNS[exportIdx];
  const cv=document.getElementById('exportCanvas');
  const sdk=miniTool();
  const idleName='拼豆图纸_'+p.name+'.png';
  // 小红书容器禁用 a[download] / blob 下载，必须走端能力 saveImageToPhotosAlbum
  if(sdk&&sdk.saveImageToPhotosAlbum){
    SFX.click&&SFX.click();
    expBtn('生成中…',true);
    showToast('正在生成图纸…',1200);
    let dataUrl='';
    try{ dataUrl=cv.toDataURL('image/png'); }catch(e){}
    if(!dataUrl||dataUrl.length<100){ expBtn(expIdleLabel(),false); saveByDownload(cv,idleName); return; }
    // 兜底：容器回调若不上行，按钮不能一直卡在「生成中…」
    let settled=false;
    const guard=setTimeout(function(){
      if(settled)return;settled=true;
      expBtn(expIdleLabel(),false);
      showToast('已提交保存，请到相册查看',2600);
    },8000);
    const ok=function(){
      if(settled)return;settled=true;clearTimeout(guard);
      expBeep(true);expBtnFlash('已保存到相册 ✓');
      showToast('图纸已保存到相册 ✦',2600);
    };
    const bad=function(err){
      if(settled)return;settled=true;clearTimeout(guard);
      expBeep(false);expBtn(expIdleLabel(),false);
      console.log('export fail',err&&err.errMsg);
      showToast('保存失败，可截图留档或重试',2800);
    };
    const doSave=function(path){
      sdk.saveImageToPhotosAlbum({ filePath:path, success:ok, fail:bad });
    };
    // 大图先 writeTempFile 换 filePath，避免超长 base64 上行
    if(sdk.writeTempFile){
      sdk.writeTempFile({
        data:dataUrl,
        success:function(res){ doSave((res&&res.filePath)||dataUrl); },
        fail:function(){ doSave(dataUrl); }
      });
    }else{
      doSave(dataUrl);
    }
    return;
  }
  saveByDownload(cv,idleName);
}

// 背景粒子：星尘缓浮 + 明暗闪烁（夜空）
function initBg(){
  const c=document.getElementById('bgCanvas'),g=c.getContext('2d');
  const d=Math.min(window.devicePixelRatio||1,1.5);
  let W,H,ps=[];
  function resize(){
    W=window.innerWidth;H=window.innerHeight;c.width=W*d;c.height=H*d;c.style.width=W+'px';c.style.height=H+'px';g.setTransform(d,0,0,d,0,0);ps=[];
    for(let i=0;i<42;i++)ps.push({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-0.5)*0.16,vy:(Math.random()-0.5)*0.12,sz:0.8+Math.random()*1.8,al:0.15+Math.random()*0.4,sp:0.4+Math.random()*1.4,ph:Math.random()*6});
  }
  resize();
  function frame(now){
    g.clearRect(0,0,W,H);
    for(const p of ps){p.x+=p.vx;p.y+=p.vy;if(p.x<0)p.x+=W;if(p.x>W)p.x-=W;if(p.y<0)p.y+=H;if(p.y>H)p.y-=H;
      const a=p.al*(0.55+0.45*Math.sin(now/1000*p.sp+p.ph));
      g.fillStyle='rgba(255,244,214,'+a+')';
      g.beginPath();g.arc(p.x,p.y,p.sz,0,Math.PI*2);g.fill();}
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.addEventListener('resize',resize);
}

// 事件绑定
function bindTools(){
  document.querySelectorAll('.tool').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const t=btn.dataset.tool;
      SFX.click();
      if(t==='clear') requestClear(btn);
      else if(t==='hint') hint();
      else if(t==='home') showHome();
      else if(t==='more'){
        const menu=document.getElementById('moreMenu');
        const on=menu.classList.toggle('show');
        btn.classList.toggle('on',on);
      }
      else setTool(t);
    });
  });
  syncThumb();
  // 底栏「更多」菜单（顶部已无可点按钮）
  const menu=document.getElementById('moreMenu'),btnMore=document.querySelector('[data-tool=more]');
  function closeMenu(){menu.classList.remove('show');if(btnMore)btnMore.classList.remove('on');}
  menu.querySelectorAll('.menu-item').forEach(item=>{
    item.addEventListener('click',()=>{
      const a=item.dataset.act; closeMenu();
      if(a==='sfx'){SFX.setOn(!SFX.isOn());SFX.save();SFX.syncLabels();if(SFX.isOn())SFX.select();}
      else if(a==='bgm'){SFX.setBgm(!SFX.isBgmOn());SFX.save();SFX.syncLabels();if(SFX.isBgmOn())SFX.select();}
      else SFX.click();
      if(a==='riddle'){openRiddle();}
      else if(a==='mode'){const keys=Object.keys(MODES),i=keys.indexOf(mode);setMode(keys[(i+1)%keys.length]);}
      else if(a==='gallery'){renderGallerySheet();document.getElementById('sheetGallery').classList.add('show');}
      else if(a==='export') openExport();
      else if(a==='info') showToast('选色珠点棋盘填豆；进度自动保存，拼满 100% 即点亮一盏灯谜。');
    });
  });
  document.addEventListener('click',e=>{
    if(!menu.contains(e.target)&&!(btnMore&&btnMore.contains(e.target))) closeMenu();
  });
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('.sheet').classList.remove('show')));
  document.getElementById('winReplay').addEventListener('click',()=>{closeWin();clearBoard();startTime=Date.now();elapsed=0;startTimer();});
  document.getElementById('winNext').addEventListener('click',nextPattern);
  document.getElementById('winExport').addEventListener('click',()=>{closeWin();openExport();});
  document.getElementById('expPng').addEventListener('click',saveExportPng);
  document.getElementById('expPrint').addEventListener('click',()=>{SFX.click();window.print();});
  // 点图纸在「全景 / 放大看色号」间切换（默认全景，一屏看全不滚动）
  const expCanvas=document.getElementById('exportCanvas'),expScroll=document.querySelector('.exp-scroll');
  expCanvas.addEventListener('click',function(){
    SFX.click();
    const z=expCanvas.classList.toggle('zoomed');
    document.getElementById('expTip').textContent=z?'已放大 · 拖动查看 · 再点一下回到全景':'整张图纸已完整显示 · 点图纸可放大看色号';
    if(!z){expScroll.scrollTop=0;expScroll.scrollLeft=0;}
  });
  // 小红书容器内：无打印能力，隐藏「打印 / 存 PDF」，主按钮改文案为「存到相册」
  var sb=document.getElementById('expPng');
  if(sb) sb.dataset.idle=sb.textContent;                  // 记下默认文案，供按钮态复位
  if(inXhsContainer()){
    var pb=document.getElementById('expPrint'); if(pb) pb.style.display='none';
    if(sb){ sb.dataset.idle='存到相册'; sb.textContent='存到相册'; }
  }
  document.getElementById('riddleBanner').addEventListener('click',()=>{SFX.click();openRiddle();});
  document.getElementById('riddleBanner').addEventListener('click',()=>{SFX.click();openRiddle();});
  winModal.addEventListener('click',e=>{if(e.target===winModal)closeWin();});
}

// 小工具容器的导航栏 / 外壳由容器统一控制，包内不自行避让。
// 仅当显式携带 ?inapp=1（嵌入宿主 App WebView 场景）时才额外让出安全区。
function applySafeArea(){
  try{
    const q=new URLSearchParams(location.search);
    if(q.get('inapp')==='1'){
      document.body.classList.add('in-app');
    }
  }catch(e){}
}

function init(){
  applySafeArea();
  SFX.load();
  // 移动端 AudioContext 必须在用户手势内解锁
  ['pointerdown','touchstart','keydown'].forEach(function(ev){
    window.addEventListener(ev,function(){SFX.unlock();},{once:true,passive:true});
  });
  loadRecords();
  loadProgress();
  loadRiddle();
  bindTools();
  initBg();
  selectPattern(0);
  showHome();
  let rz=null;
  window.addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(computeLayout,120);});
  window.addEventListener('orientationchange',()=>setTimeout(computeLayout,280));
}

init();
})();
'''

html = HTML_TEMPLATE.replace('__PATTERNS_JSON__', PATTERNS_JSON)
js = JS_TEMPLATE.replace('__PATTERNS_JSON__', PATTERNS_JSON)

out_html = os.path.join(BASE, '..', 'index.html')
with open(out_html, 'w', encoding='utf-8') as f:
    f.write(html)

out_js = os.path.join(BASE, '..', 'main.js')
with open(out_js, 'w', encoding='utf-8') as f:
    f.write(js)

print('generated', os.path.normpath(out_html), 'chars', len(html))
print('generated', os.path.normpath(out_js), 'chars', len(js))
