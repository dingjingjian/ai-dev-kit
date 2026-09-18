(function(){
"use strict";

/* ============ 色板角色与渐变 ============
   这里写的是"角色基色"，并非渲染时看到的最终颜色：
   渲染前由下方「主题引擎」按当前主题 + 该图取色起点映射，图表 option() 只管引用角色。 */
var C = {
  blue:"#4C7DFF", mint:"#22C7A5", amber:"#FF9F45", coral:"#F76B8A", violet:"#8B6BF2",
  deep:"#3A63D8", link:"#C9D0DC", grid:"#EDF2FA", text:"#8A8F99"
};
function rgba(hex, a){
  var n = parseInt(hex.slice(1), 16);
  return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
}
function vGrad(c1, c2){
  return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
    {offset:0, color:c1}, {offset:1, color:c2}
  ]);
}
function hGrad(c1, c2){
  return new echarts.graphic.LinearGradient(0, 0, 1, 0, [
    {offset:0, color:c1}, {offset:1, color:c2}
  ]);
}
function barGrad(hex){ return vGrad(rgba(hex, 0.6), hex); }          /* 柱：上浅下实 */
function areaGrad(hex){ return vGrad(rgba(hex, 0.34), rgba(hex, 0)); } /* 面积：上实下透 */

/* ============ 主题引擎 ============
   C 里的颜色是"角色基色"（c0~c4 / deep / grid / text / link …），不是最终颜色：
   每个图表渲染前会经 chartOption() 按「当前主题 + 该图取色起点」映射成真实颜色，
   所以 30 个 option() 里只写基色，换主题不用改动任何图表数据。
   rot（取色起点）让同主题下不同图表的配色错开，避免所有详情页色板一模一样。 */
var THEME_KEY = "cg_theme";

var BASE_ROLE = {
  "#4C7DFF":"c0", "#22C7A5":"c1", "#FF9F45":"c2", "#F76B8A":"c3", "#8B6BF2":"c4",
  "#8FB0FF":"c0l", "#3A63D8":"deep",
  "#C9D0DC":"link", "#DCE3F1":"link", "#EDF2FA":"grid",
  "#E1E8F6":"softLine", "#E8EEF9":"softLine2", "#F2F5FF":"rampStart",
  "#E6E8EB":"track", "#8A8F99":"axisText",
  "#FFFFFF":"plotBg", "#ffffff":"plotBg", "#fff":"plotBg"
};
/* rgba(...) 形式的颜色（渐变色标）要反查回基色，这里预建 rgb 三元组索引 */
var BASE_RGB = {};
(function(){
  for(var hex in BASE_ROLE){
    if(hex.length !== 7){ continue; }
    var n = parseInt(hex.slice(1), 16);
    BASE_RGB[((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255)] = hex;
  }
})();

/* 浅色主题的页面 token 基线；各主题只在 ui 里覆盖自己关心的几项 */
var UI_LIGHT = {
  bg:"#f5f5f7", top:"rgba(245,245,247,.86)", card:"#ffffff", ink:"#1d1d1f", ink2:"#6e6e73", ink3:"#a1a1a6",
  line:"#e6e6eb", line2:"#f0f0f3", accent:"#0071e3", accentSoft:"#eaf3ff",
  plot1:"#fbfcff", plot2:"#f3f6fc", plotGrid:"rgba(76,125,255,.06)", plotBg:"#ffffff",
  chip:"rgba(29,29,31,.05)", pillOn:"#ffffff",
  codeBg:"#1d1d1f", codeFg:"#e8e8ed", codeLine:"rgba(255,255,255,.07)",
  toastBg:"rgba(29,29,31,.92)", toastFg:"#ffffff", fabBg:"rgba(29,29,31,.9)", fabFg:"#ffffff",
  link:"#C9D0DC", grid:"#EDF2FA", axisText:"#8A8F99", track:"#E6E8EB",
  softLine:"#E1E8F6", softLine2:"#E8EEF9", rampStart:"#F2F5FF",
  goodBg:"#f0f9f1", goodLine:"#dbeee0", goodHead:"#1a7a35", goodText:"#2c5a3a",
  badBg:"#fdf1f1", badLine:"#f6dcdc", badHead:"#a81a1a", badText:"#5a2d2d"
};
/* 深色主题基线：图表文字、网格、描边全部换成暗底可读的值 */
var UI_DARK = {
  bg:"#111114", top:"rgba(17,17,20,.86)", card:"#1a1a20", ink:"#f0f0f4", ink2:"#a2a2ac", ink3:"#74747e",
  line:"#2b2b33", line2:"#232329", accent:"#6EA8FF", accentSoft:"rgba(110,168,255,.16)",
  plot1:"#1d1d26", plot2:"#16161d", plotGrid:"rgba(255,255,255,.045)", plotBg:"#1b1b23",
  chip:"rgba(255,255,255,.08)", pillOn:"#111114",
  codeBg:"#0c0c11", codeFg:"#dcdce4", codeLine:"rgba(255,255,255,.09)",
  toastBg:"rgba(240,240,244,.94)", toastFg:"#111114", fabBg:"rgba(240,240,244,.92)", fabFg:"#111114",
  link:"#3a3a46", grid:"rgba(255,255,255,.10)", axisText:"#9a9aa6", track:"#2e2e3a",
  softLine:"rgba(255,255,255,.12)", softLine2:"rgba(255,255,255,.08)", rampStart:"#24242f",
  goodBg:"rgba(46,196,113,.12)", goodLine:"rgba(46,196,113,.28)", goodHead:"#5edb92", goodText:"#b6e8c9",
  badBg:"rgba(240,90,110,.12)", badLine:"rgba(240,90,110,.28)", badHead:"#ff8b9c", badText:"#f2c2c9"
};

/* ramp 顺序固定为【主色 / 绿 / 黄橙 / 红粉 / 辅色】：
   仪表盘（低中高）与 K 线（涨跌）依赖色位语义，各主题都按这个顺序排，
   这样这两类图即使不参与取色起点偏移，也始终是"绿=好、红=险"。 */
var THEMES = [
  {
    key:"azure", name:"晴空蓝",
    ramp:[
      {c:"#4C7DFF", deep:"#3A63D8", light:"#8FB0FF", n:"蓝"},
      {c:"#22C7A5", deep:"#159B80", light:"#6FDDC6", n:"薄荷"},
      {c:"#FF9F45", deep:"#E27D1C", light:"#FFC189", n:"琥珀"},
      {c:"#F76B8A", deep:"#D9486B", light:"#FBA3B7", n:"珊瑚"},
      {c:"#8B6BF2", deep:"#6E4BD8", light:"#B4A0F7", n:"紫罗兰"}
    ],
    ui:{accent:"#0071e3", accentSoft:"#eaf3ff", plot1:"#fbfcff", plot2:"#f3f6fc", plotGrid:"rgba(76,125,255,.06)"}
  },
  {
    key:"ocean", name:"深海青",
    ramp:[
      {c:"#0E9BAE", deep:"#0A7585", light:"#6FD3E0", n:"海青"},
      {c:"#2FBF71", deep:"#1C8F52", light:"#86DEA9", n:"翠绿"},
      {c:"#F2B33D", deep:"#C98A17", light:"#F8D48D", n:"沙金"},
      {c:"#EF5B6B", deep:"#C63A4B", light:"#F79CA6", n:"朱砂"},
      {c:"#2F8BF5", deep:"#1B68C9", light:"#8FBDF9", n:"钴蓝"}
    ],
    ui:{accent:"#0E8FA8", accentSoft:"#e2f6f9", plot1:"#faffff", plot2:"#eff8fa", plotGrid:"rgba(14,155,174,.07)"}
  },
  {
    key:"wisteria", name:"墨玉紫",
    ramp:[
      {c:"#7C5CFF", deep:"#5B3DD8", light:"#B4A0FF", n:"紫"},
      {c:"#16B98A", deep:"#0E8F69", light:"#6EDCBB", n:"青绿"},
      {c:"#F5A524", deep:"#C97F0B", light:"#FBCC7E", n:"姜黄"},
      {c:"#F0517A", deep:"#C63059", light:"#FA9BB4", n:"玫红"},
      {c:"#2F8BF5", deep:"#1B68C9", light:"#8FBDF9", n:"宝蓝"}
    ],
    ui:{accent:"#6D4AE6", accentSoft:"#f0ebff", plot1:"#fdfcff", plot2:"#f5f2fd", plotGrid:"rgba(124,92,255,.07)"}
  },
  {
    key:"dusk", name:"暮光橙",
    ramp:[
      {c:"#FF7A45", deep:"#DC5522", light:"#FFB08C", n:"橘"},
      {c:"#2FB98A", deep:"#1B8E66", light:"#83DDBB", n:"松绿"},
      {c:"#F7C948", deep:"#C99A16", light:"#FCE29A", n:"柠檬"},
      {c:"#E0457B", deep:"#B92659", light:"#F392B4", n:"莓红"},
      {c:"#6C7BFF", deep:"#4A57D8", light:"#A9B2FF", n:"雾蓝"}
    ],
    ui:{accent:"#E2622C", accentSoft:"#fff0e8", plot1:"#fffdfa", plot2:"#fdf4ec", plotGrid:"rgba(255,122,69,.08)"}
  },
  {
    key:"night", name:"暗夜石墨", dark:true,
    ramp:[
      {c:"#6EA8FF", deep:"#3E7BE0", light:"#A8CBFF", n:"夜蓝"},
      {c:"#34D399", deep:"#1BA574", light:"#84E7C2", n:"萤绿"},
      {c:"#FBBF24", deep:"#D1990B", light:"#FDDC8A", n:"琥珀"},
      {c:"#FB7185", deep:"#DC4358", light:"#FDABB6", n:"绯红"},
      {c:"#A78BFA", deep:"#7C5CE0", light:"#CBBBFD", n:"雾紫"}
    ],
    ui:{accent:"#6EA8FF", accentSoft:"rgba(110,168,255,.16)"}
  }
];

function mergeUI(base, over){
  var o = {}, k;
  for(k in base){ o[k] = base[k]; }
  if(over){ for(k in over){ o[k] = over[k]; } }
  return o;
}
THEMES.forEach(function(t){ t._ui = mergeUI(t.dark ? UI_DARK : UI_LIGHT, t.ui); });

var CUR_THEME = THEMES[0];

/* 角色 → 真实颜色。rot 为该图在主题色环上的起点；
   deep / c0l 始终跟随 c0，保证"主色 + 其深色/浅色"始终成对。 */
function roleColor(role, rot){
  var ramp = CUR_THEME.ramp, len = ramp.length, i = rot % len;
  if(role === "deep"){ return ramp[i].deep; }
  if(role === "c0l"){ return ramp[i].light; }
  if(role.charAt(0) === "c" && role.length === 2){
    return ramp[(parseInt(role.slice(1), 10) + i) % len].c;
  }
  return CUR_THEME._ui[role] || null;
}

function toThemed(v, rot){
  var role = BASE_ROLE[v];
  if(role){ return roleColor(role, rot) || v; }
  var m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)$/.exec(v);
  if(m){
    var base = BASE_RGB[m[1] + "," + m[2] + "," + m[3]];
    if(base){
      var hex = roleColor(BASE_ROLE[base], rot);
      if(hex && hex.charAt(0) === "#"){
        var n = parseInt(hex.slice(1), 16);
        return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + (m[4] === undefined ? 1 : m[4]) + ")";
      }
    }
  }
  return v;
}

var COLOR_KEYS = {color:1, color0:1, borderColor:1, borderColor0:1, backgroundColor:1, shadowColor:1};

/* 就地重着色：option 每次渲染都是新对象（渐变色标也是新的），可以安全原地改写 */
function recolor(node, rot){
  if(node === null || node === undefined || typeof node !== "object"){ return node; }
  var i, v;
  if(node instanceof Array){
    for(i = 0; i < node.length; i++){
      v = node[i];
      if(typeof v === "string"){ node[i] = BASE_ROLE[v] ? toThemed(v, rot) : v; }
      else if(v !== null && typeof v === "object"){ recolor(v, rot); }
    }
    return node;
  }
  if(node.colorStops instanceof Array){                 /* echarts 渐变对象 */
    for(i = 0; i < node.colorStops.length; i++){
      var stop = node.colorStops[i];
      if(stop && typeof stop.color === "string"){ stop.color = toThemed(stop.color, rot); }
    }
    return node;
  }
  for(var k in node){
    if(!Object.prototype.hasOwnProperty.call(node, k)){ continue; }
    v = node[k];
    if(typeof v === "string"){
      if(BASE_ROLE[v]){ node[k] = toThemed(v, rot); }
      else if(COLOR_KEYS[k] && v.indexOf("rgba(") === 0){ node[k] = toThemed(v, rot); }
    } else if(v !== null && typeof v === "object"){
      recolor(v, rot);
    }
  }
  return node;
}

/* 深色主题下补足坐标轴 / 图例 / 图注文字色；浅色主题沿用 ECharts 默认 */
function themeChrome(opt){
  if(!CUR_THEME.dark){ return opt; }
  var ui = CUR_THEME._ui, text = ui.axisText;
  opt.textStyle = opt.textStyle || {color:text};
  var axes = [];
  if(opt.xAxis){ axes = axes.concat(opt.xAxis); }
  if(opt.yAxis){ axes = axes.concat(opt.yAxis); }
  if(opt.singleAxis){ axes = axes.concat(opt.singleAxis); }
  if(opt.radiusAxis){ axes = axes.concat(opt.radiusAxis); }
  if(opt.angleAxis){ axes = axes.concat(opt.angleAxis); }
  if(opt.parallelAxis){ axes = axes.concat(opt.parallelAxis); }
  for(var i = 0; i < axes.length; i++){
    var ax = axes[i];
    if(!ax || typeof ax !== "object"){ continue; }
    if(ax.axisLabel){ ax.axisLabel.color = text; }
    if(ax.nameTextStyle){ ax.nameTextStyle.color = text; }
  }
  if(opt.legend && opt.legend.textStyle === undefined){ opt.legend.textStyle = {color:text}; }
  if(opt.visualMap && opt.visualMap.textStyle === undefined){ opt.visualMap.textStyle = {color:text}; }
  return opt;
}

/* 顶层色板：给没有显式指定颜色的系列用（饼图 / 圆环 / 漏斗 / 旭日 / 矩形树 / 河流 / 桑基 / 关系图…），
   否则这些图会退回 ECharts 内置色板，换主题时纹丝不动。 */
function themedPalette(rot){
  var ramp = CUR_THEME.ramp, out = [], len = ramp.length;
  for(var i = 0; i < len; i++){ out.push(ramp[(rot + i) % len].c); }
  return out;
}

function chartOption(chart, mode){
  var rot = chart._rot || 0;
  var opt = chart.option(mode);
  recolor(opt, rot);
  opt.color = themedPalette(rot);
  return themeChrome(opt);
}

/* 把当前主题写进 CSS 变量（inline style 覆盖 index.html :root 里的初始值） */
function applyUI(){
  var ui = CUR_THEME._ui, ramp = CUR_THEME.ramp, root = document.documentElement;
  var map = {
    "--bg":ui.bg, "--top-bg":ui.top, "--card":ui.card, "--ink":ui.ink, "--ink-2":ui.ink2, "--ink-3":ui.ink3,
    "--line":ui.line, "--line-2":ui.line2, "--accent":ui.accent, "--accent-soft":ui.accentSoft,
    "--plot-1":ui.plot1, "--plot-2":ui.plot2, "--plot-grid":ui.plotGrid,
    "--chip-bg":ui.chip, "--pill-on":ui.pillOn,
    "--code-bg":ui.codeBg, "--code-fg":ui.codeFg, "--code-line":ui.codeLine,
    "--toast-bg":ui.toastBg, "--toast-fg":ui.toastFg, "--fab-bg":ui.fabBg, "--fab-fg":ui.fabFg,
    "--good-bg":ui.goodBg, "--good-line":ui.goodLine, "--good-h":ui.goodHead, "--good-p":ui.goodText,
    "--bad-bg":ui.badBg, "--bad-line":ui.badLine, "--bad-h":ui.badHead, "--bad-p":ui.badText,
    "--dot-a":ramp[0].c, "--dot-b":ramp[4].c, "--dot-c":ramp[2].c, "--dot-d":ramp[1].c
  };
  for(var k in map){ root.style.setProperty(k, map[k]); }
  var meta = document.querySelector('meta[name="theme-color"]');
  if(meta){ meta.setAttribute("content", ui.bg); }
}

/* ============ 数据 helper ============ */
function rw(n, base, vol, seed){
  var a = [], v = base, s = seed || 1;
  function rnd(){ s = (s * 9301 + 49297) % 233280; return s / 233280; }
  for(var i = 0; i < n; i++){ v += (rnd() - 0.5) * vol * 2; a.push(Math.round(v * 10) / 10); }
  return a;
}
var MON = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
var WK = ["周一","周二","周三","周四","周五","周六","周日"];
var HR = ["00","03","06","09","12","15","18","21"];

/* ============ 图表定义 ============
   每个图表含：
   id, cat, name, en, desc, intro, prompt, goodFor, badFor,
   option(mode) -> echarts option  (mode: "thumb" | "full")
   颜色不在数据里写死，统一由「主题引擎」在渲染时映射。
   prompt 是英文提示词，只写「要表达的内容 + 视觉风格 + 何时不适用」，
   不点名图表库、不写任何 API 与配置项，技术方案交给 AI 自己选。
*/
var CHARTS = [

/* ===================== 基础统计图 basic ===================== */
{
  id:1, cat:"basic", name:"柱状图", en:"Bar",
  desc:"用柱高比较离散类别的数值大小",
  intro:"最基础的统计图。用等宽矩形的长度比较各离散类别的数值，配合坐标轴可直观读出大小关系。适合类别不多、需要精确比较的场景，是报表与仪表板的首选。",
  prompt:"Visualize two products' monthly sales across a full year as a grouped bar chart.\nUse: two contrasting accent colors with a legend, rounded bar tops, moderate bar width, light dashed horizontal gridlines, no axis lines or tick marks, and value labels above the bars when the differences matter.\nKeep it clean, airy and businesslike. Avoid it when there are more than a dozen categories or the labels are long — horizontal bars read better there.",
  goodFor:"类别比较、月度/季度报表、排名、投票统计",
  badFor:"连续趋势、占比构成、大规模高密度数据",
  option:function(m){
    var t = m === "thumb";
    return {
      grid:{left:t?8:48,right:t?8:16,top:t?8:24,bottom:t?8:32},
      legend:t?undefined:{top:0,data:["产品A","产品B"]},
      tooltip:t?undefined:{},
      xAxis:{type:"category",data:MON,axisLabel:{show:!t},axisTick:{show:!t},axisLine:{show:!t},splitLine:{show:false}},
      yAxis:{type:"value",axisLabel:{show:!t},axisTick:{show:false},axisLine:{show:false},splitLine:{show:!t&&{lineStyle:{type:"dashed",color:C.grid}}}},
      series:[
        {name:"产品A",type:"bar",data:rw(12,60,18,7),barWidth:t?"60%":"40%",itemStyle:{borderRadius:[4,4,0,0],color:barGrad(C.blue)},color:"#4C7DFF"},
        {name:"产品B",type:"bar",data:rw(12,40,14,3),barWidth:t?"60%":"40%",itemStyle:{borderRadius:[4,4,0,0],color:barGrad(C.mint)},color:"#22C7A5"}
      ]
    };
  }
},
{
  id:2, cat:"basic", name:"条形图", en:"Horizontal Bar",
  desc:"横向柱状，类别名长时更友好",
  intro:"柱状图的横向变体：类别轴在 Y 方向，数值轴在 X 方向。当类别名称较长或类别数较多时，横向排布更易阅读标签，避免文字旋转。",
  prompt:"Rank eight cities by a single metric with a horizontal bar chart.\nUse: values sorted from largest to smallest, one accent color with a soft horizontal gradient, value labels at the end of each bar, no axis lines or ticks, minimal gridlines, and enough left padding that long category names never rotate.\nKeep it clean and ranking-focused. Avoid it for time trends, or when there are fewer than four categories.",
  goodFor:"长类别名、排行榜、人口结构、问卷选项",
  badFor:"时间序列趋势、需要纵向比较的场景",
  option:function(m){
    var t = m === "thumb";
    var cats = ["北京","上海","广州","深圳","成都","杭州","武汉","西安"];
    return {
      grid:{left:t?8:48,right:t?16:32,top:t?8:16,bottom:t?8:24},
      tooltip:t?undefined:{},
      xAxis:{type:"value",axisLabel:{show:!t},axisTick:{show:false},axisLine:{show:false},splitLine:{show:!t&&{lineStyle:{type:"dashed",color:C.grid}}}},
      yAxis:{type:"category",data:cats,axisLabel:{show:!t},axisTick:{show:!t},axisLine:{show:!t},splitLine:{show:false}},
      series:[{type:"bar",data:rw(8,50,20,11),barWidth:t?"60%":"55%",itemStyle:{borderRadius:[0,4,4,0],color:hGrad("#4C7DFF","#8FB0FF")},color:"#4C7DFF",label:t?undefined:{show:true,position:"right"}}]
    };
  }
},
{
  id:3, cat:"basic", name:"折线图", en:"Line",
  desc:"用线段连接数据点展示连续趋势",
  intro:"用线段按顺序连接各数据点，展示数据随连续变量（时间、距离等）的变化趋势。是时间序列与连续数据的首选，能直观看出上升、下降、波动与拐点。",
  prompt:"Show an actual-versus-target trend over twelve months as a line chart.\nUse: two smooth lines in distinct colors, circular markers with a white ring, a dashed line for the target series, a shared hover tooltip, light dashed horizontal gridlines and no axis lines.\nKeep it calm and easy to read. Avoid it when the x-axis holds unordered categories such as product names.",
  goodFor:"时间序列、股价走势、温度变化、监控指标",
  badFor:"离散类别比较、占比构成、无序数据",
  option:function(m){
    var t = m === "thumb";
    return {
      grid:{left:t?8:48,right:t?8:16,top:t?8:24,bottom:t?8:32},
      legend:t?undefined:{top:0,data:["实际","目标"]},
      tooltip:t?undefined:{trigger:"axis"},
      xAxis:{type:"category",data:MON,boundaryGap:false,axisLabel:{show:!t},axisTick:{show:!t},axisLine:{show:!t},splitLine:{show:false}},
      yAxis:{type:"value",axisLabel:{show:!t},axisTick:{show:false},axisLine:{show:false},splitLine:{show:!t&&{lineStyle:{type:"dashed",color:C.grid}}}},
      series:[
        {name:"实际",type:"line",data:rw(12,80,22,5),smooth:!t,symbol:t?"none":"circle",symbolSize:t?0:7,color:"#4C7DFF",lineStyle:{width:t?2.4:2.8},itemStyle:{borderColor:"#fff",borderWidth:2}},
        {name:"目标",type:"line",data:rw(12,85,8,9),smooth:!t,symbol:t?"none":"circle",symbolSize:t?0:7,color:"#22C7A5",lineStyle:{width:t?2.4:2.8,type:"dashed"},itemStyle:{borderColor:"#fff",borderWidth:2}}
      ]
    };
  }
},
{
  id:4, cat:"basic", name:"面积图", en:"Area",
  desc:"折线下方填充，强调累积与体量",
  intro:"在折线图基础上对线下区域填充颜色，强调数据的累积量与体量感。单系列时突出总规模，多系列堆叠时展示构成与总量随时间的变化。",
  prompt:"Show how traffic sources shift across a year with a stacked area chart.\nUse: three smooth stacked bands in distinct colors, vertical gradients that fade from solid to transparent, no point markers, a legend on top, a hover tooltip revealing the monthly breakdown, and a baseline that starts at zero.\nKeep it soft and layered. Avoid it when exact per-band values matter, or when the data mixes positives and negatives.",
  goodFor:"流量趋势、累积量、堆叠构成随时间变化",
  badFor:"精确读数、负值交替的数据",
  option:function(m){
    var t = m === "thumb";
    return {
      grid:{left:t?8:48,right:t?8:16,top:t?8:24,bottom:t?8:32},
      legend:t?undefined:{top:0,data:["搜索","直接","广告"]},
      tooltip:t?undefined:{trigger:"axis"},
      xAxis:{type:"category",data:MON,boundaryGap:false,axisLabel:{show:!t},axisTick:{show:!t},axisLine:{show:!t},splitLine:{show:false}},
      yAxis:{type:"value",axisLabel:{show:!t},axisTick:{show:false},axisLine:{show:false},splitLine:{show:!t&&{lineStyle:{type:"dashed",color:C.grid}}}},
      series:[
        {name:"搜索",type:"line",stack:"总",data:rw(12,30,10,5),areaStyle:{color:areaGrad(C.blue)},smooth:!t,symbol:"none",color:"#4C7DFF"},
        {name:"直接",type:"line",stack:"总",data:rw(12,25,8,7),areaStyle:{color:areaGrad(C.mint)},smooth:!t,symbol:"none",color:"#22C7A5"},
        {name:"广告",type:"line",stack:"总",data:rw(12,20,6,3),areaStyle:{color:areaGrad(C.amber)},smooth:!t,symbol:"none",color:"#FF9F45"}
      ]
    };
  }
},
{
  id:5, cat:"basic", name:"饼图", en:"Pie",
  desc:"用扇形角度展示各部分占比",
  intro:"用圆形中各扇形的圆心角比例展示各部分占整体的百分比。直观展示构成，但精确比较不如柱状图，且类别过多时难以辨认。",
  prompt:"Show the share of four traffic channels as a pie chart.\nUse: four to six slices sorted by size, labels combining the name and the percentage, thin white gaps between slices, a centered legend below, and a restrained palette.\nKeep it simple and legible. Avoid it beyond six categories, or when precise comparison of values matters.",
  goodFor:"占比构成、预算分配、来源分布（≤6 类）",
  badFor:"精确数值比较、类别过多、时间趋势",
  option:function(m){
    var t = m === "thumb";
    return {
      tooltip:t?undefined:{},
      legend:t?undefined:{bottom:0,left:"center",data:["搜索","直接","广告","其他"]},
      series:[{
        type:"pie",
        radius:t?"76%":"62%",
        center:["50%","52%"],
        data:[
          {value:1048,name:"搜索"},
          {value:735,name:"直接"},
          {value:580,name:"广告"},
          {value:484,name:"其他"}
        ],
        label:t?{show:false}:{formatter:"{b}\n{d}%"},
        labelLine:t?{show:false}:{},
        itemStyle:{borderColor:"#fff",borderWidth:2}
      }]
    };
  }
},
{
  id:6, cat:"basic", name:"圆环图", en:"Doughnut",
  desc:"中空饼图，中心可放汇总数值",
  intro:"饼图的中空变体，中心留白可放置总数值或标题。视觉上比实心饼更轻盈，且中心信息位适合展示 KPI 汇总，是仪表板常用元素。",
  prompt:"Show a single completion rate as a doughnut chart with the headline number in the middle.\nUse: a thick ring split into the completed portion in an accent color and the remainder in muted grey, the total in large centered type with a small caption for the unit, and a legend below.\nKeep it focused and dashboard-friendly. Avoid it when more than a few categories need comparing.",
  goodFor:"占比 + 汇总 KPI、仪表板卡片、完成率",
  badFor:"类别过多、需要精确比较",
  option:function(m){
    var t = m === "thumb";
    return {
      tooltip:t?undefined:{},
      legend:t?undefined:{bottom:0,left:"center",data:["已完成","待办"]},
      series:[{
        type:"pie",
        radius:t?["48%","78%"]:["48%","70%"],
        center:["50%","52%"],
        data:[
          {value:68,name:"已完成"},
          {value:32,name:"待办"}
        ],
        label:t?{show:false}:{formatter:"{b}\n{d}%"},
        labelLine:t?{show:false}:{},
        itemStyle:{borderColor:"#fff",borderWidth:3},
        color:["#4C7DFF","#E6E8EB"]
      }]
    };
  }
},
{
  id:7, cat:"basic", name:"雷达图", en:"Radar",
  desc:"多维度数值的星形对比",
  intro:"以中心向外辐射的坐标轴展示多个维度的数值，用多边形围合形成「星形」。适合对比个体在多维度上的表现，如能力评估、产品参数对比。",
  prompt:"Compare this quarter against last quarter across six dimensions with a radar chart.\nUse: a light polygonal grid with no filled sector backgrounds, one translucent polygon per period in a distinct color, quiet labels at each axis, a legend naming each shape, and consistent axis scaling.\nKeep it airy and analytical. Avoid it beyond eight dimensions, or when exact values must be read off.",
  goodFor:"能力评估、产品参数对比、多维画像",
  badFor:"维度过多（>8）、精确读数、时间趋势",
  option:function(m){
    var t = m === "thumb";
    return {
      tooltip:t?undefined:{},
      legend:t?undefined:{bottom:0,data:["本季","上季"]},
      radar:{
        indicator:[
          {name:"销售",max:100},{name:"管理",max:100},
          {name:"技术",max:100},{name:"客服",max:100},
          {name:"研发",max:100},{name:"市场",max:100}
        ],
        radius:t?"70%":"62%",
        axisName:{show:!t,color:C.text},
        splitLine:{show:true,lineStyle:{color:"#E1E8F6"}},
        splitArea:{show:false},
        axisLine:{show:true,lineStyle:{color:"#E8EEF9"}}
      },
      series:[{
        type:"radar",
        data:[
          {value:[82,70,85,60,75,80],name:"本季",areaStyle:{opacity:0.3},color:"#4C7DFF"},
          {value:[60,65,70,55,60,68],name:"上季",areaStyle:{opacity:0.2},color:"#22C7A5"}
        ]
      }]
    };
  }
},
{
  id:8, cat:"basic", name:"散点图", en:"Scatter",
  desc:"用点展示两个变量的关系",
  intro:"在直角坐标系中用点展示两个数值变量的观测，点的分布揭示相关性、聚集与离群。是探索性数据分析的基本工具。",
  prompt:"Explore the relationship between two numeric variables with a scatter plot.\nUse: roughly forty points at a consistent size with slight transparency so overlaps read as density, one accent color, hover tooltips showing both values, and light dashed gridlines on both axes.\nKeep it clean and analytical. Avoid it unless both axes are continuous — categories or dates belong in bar or line charts.",
  goodFor:"相关性分析、聚类观察、离群点、分布探索",
  badFor:"类别比较、时间序列、占比构成",
  option:function(m){
    var t = m === "thumb";
    var d = [], s = 3;
    function rnd(){ s = (s * 9301 + 49297) % 233280; return s / 233280; }
    for(var i = 0; i < 40; i++){ var x = rnd() * 100; d.push([x, x * 0.6 + 20 + (rnd() - 0.5) * 30]); }
    return {
      grid:{left:t?8:48,right:t?8:16,top:t?8:16,bottom:t?8:32},
      tooltip:t?undefined:{},
      xAxis:{type:"value",axisLabel:{show:!t},axisTick:{show:!t},axisLine:{show:!t},splitLine:{show:!t&&{lineStyle:{type:"dashed",color:C.grid}}},min:0,max:100},
      yAxis:{type:"value",axisLabel:{show:!t},axisTick:{show:false},axisLine:{show:false},splitLine:{show:!t&&{lineStyle:{type:"dashed",color:C.grid}}},min:0,max:100},
      series:[{type:"scatter",data:d,symbolSize:t?7:10,color:"#4C7DFF"}]
    };
  }
},
{
  id:9, cat:"basic", name:"气泡图", en:"Bubble",
  desc:"散点 + 点大小编码第三维",
  intro:"在散点图基础上用点的大小编码第三个数值变量，实现三维数据的平面展示。常用于展示「数量 × 单价 × 销量」等三维关系。",
  prompt:"Show three variables at once as a bubble chart.\nUse: x and y position for two measures and bubble size for a third, one accent color with transparency so overlapping bubbles deepen, hover tooltips listing all three values, and a short caption explaining the size scale.\nKeep it exploratory and uncluttered. Avoid it when the third variable varies by less than roughly a factor of two.",
  goodFor:"三维关系、市场规模对比、GDP×人口×寿命",
  badFor:"精确读第三维、点过多重叠严重",
  option:function(m){
    var t = m === "thumb";
    var d = [], s = 5;
    function rnd(){ s = (s * 9301 + 49297) % 233280; return s / 233280; }
    for(var i = 0; i < 20; i++){ d.push([Math.round(rnd() * 100), Math.round(rnd() * 100), Math.round(rnd() * 40 + 5)]); }
    return {
      grid:{left:t?8:48,right:t?8:16,top:t?8:16,bottom:t?8:32},
      tooltip:t?undefined:{formatter:function(p){return p.value[2];}},
      xAxis:{type:"value",axisLabel:{show:!t},axisTick:{show:!t},axisLine:{show:!t},splitLine:{show:!t&&{lineStyle:{type:"dashed",color:C.grid}}},min:0,max:100},
      yAxis:{type:"value",axisLabel:{show:!t},axisTick:{show:false},axisLine:{show:false},splitLine:{show:!t&&{lineStyle:{type:"dashed",color:C.grid}}},min:0,max:100},
      series:[{type:"scatter",data:d,symbolSize:function(d){return d[2];},color:"#4C7DFF",opacity:0.7}]
    };
  }
},
{
  id:10, cat:"basic", name:"漏斗图", en:"Funnel",
  desc:"展示流程各阶段的转化递减",
  intro:"用上宽下窄的梯形展示流程各阶段数量递减，直观反映转化率与流失点。是销售漏斗、注册流程、营销转化的标配。",
  prompt:"Show a five-stage conversion funnel from impressions through clicks and visits to purchase.\nUse: descending trapezoids sorted by value with thin gaps between stages, stage names written inside the shape, a color progression from darkest at the top to lightest at the bottom to imply decay, and generous margins all round.\nKeep it clean and conversion-focused. Avoid it when the values do not decrease monotonically.",
  goodFor:"销售漏斗、注册转化、营销链路、流失分析",
  badFor:"非递减数据、并列对比、时间趋势",
  option:function(m){
    var t = m === "thumb";
    return {
      tooltip:t?undefined:{},
      legend:t?undefined:{bottom:0,data:["展现","点击","访问","咨询","成交"]},
      series:[{
        type:"funnel",
        left:t?"8%":"10%",right:t?"8%":"10%",top:t?"8%":t?8:32,bottom:t?"8%":"16%",
        width:t?"84%":"80%",
        sort:"descending",
        gap:2,
        label:t?{show:false}:{show:true,position:"inside"},
        data:[
          {value:60,name:"展现"},{value:40,name:"点击"},
          {value:20,name:"访问"},{value:8,name:"咨询"},{value:2,name:"成交"}
        ]
      }]
    };
  }
},
{
  id:11, cat:"basic", name:"仪表盘", en:"Gauge",
  desc:"用指针展示当前值在区间位置",
  intro:"用指针在刻度环上的位置展示当前数值相对于区间的位置，常用于 KPI 达成率、性能指标、评分。视觉聚焦单一关键数值。",
  prompt:"Show a single KPI — a 72% achievement rate — on a gauge.\nUse: a needle on a semicircular scale from 0 to 100, a warning band that shifts from red through amber to green, the percentage in large type near the center, and a sparse tick scale.\nKeep it bold and dashboard-friendly. Avoid it for comparing several metrics at once, and normalize the value if it falls outside the range.",
  goodFor:"KPI 达成率、性能指标、评分、健康度",
  badFor:"多指标对比、时间趋势、分布",
  option:function(m){
    var t = m === "thumb";
    return {
      series:[{
        type:"gauge",
        radius:t?"90%":"78%",
        center:["50%","55%"],
        min:0,max:100,
        splitNumber:5,
        axisLine:{lineStyle:{width:t?9:14,color:[[0.3,"#F76B8A"],[0.7,"#FF9F45"],[1,"#22C7A5"]]}},
        pointer:{width:t?3:5,length:t?"60%":"70%",itemStyle:{color:C.blue}},
        axisTick:{show:false},axisLabel:{show:!t},splitLine:{show:true,lineStyle:{color:"#E8EEF9"}},
        detail:{show:!t,formatter:"{value}%",fontSize:20,offsetCenter:[0,"40%"]},
        data:[{value:72}]
      }]
    };
  }
},

/* ===================== 数据可视化进阶 advanced ===================== */
{
  id:12, cat:"advanced", name:"K 线图", en:"Candlestick",
  desc:"用蜡烛体展示开盘收盘最高最低",
  intro:"用矩形实体展示开盘与收盘价，用细线展示最高与最低价，红涨绿跌（或红跌绿涨）。是金融行情分析的标准图表，一根 K 线含四个价格信息。",
  prompt:"Show twenty trading days of price action as a candlestick chart.\nUse: candle bodies for the open and close with thin wicks for the high and low, one color for up days and a contrasting one for down days (red-up and green-down for Chinese audiences), a moving-average line overlaid to show trend, and a price axis scaled tightly to the data.\nKeep it dense but precise. Avoid it for anything other than financial time series.",
  goodFor:"股价行情、期货外汇、加密货币、K 线技术分析",
  badFor:"非金融数据、单值时间序列、占比",
  option:function(m){
    var t = m === "thumb";
    var d = [], s = 9, v = 100;
    function rnd(){ s = (s * 9301 + 49297) % 233280; return s / 233280; }
    for(var i = 0; i < 20; i++){
      var o = v, c = v + (rnd() - 0.45) * 10;
      var l = Math.min(o, c) - rnd() * 4, h = Math.max(o, c) + rnd() * 4;
      d.push([+o.toFixed(1),+c.toFixed(1),+l.toFixed(1),+h.toFixed(1)]); v = c;
    }
    return {
      grid:{left:t?8:48,right:t?8:16,top:t?8:16,bottom:t?8:24},
      tooltip:t?undefined:{trigger:"axis"},
      xAxis:{type:"category",data:d.map(function(_,i){return i+1;}),axisLabel:{show:!t},axisTick:{show:!t},axisLine:{show:!t},splitLine:{show:false}},
      yAxis:{type:"value",scale:true,axisLabel:{show:!t},axisTick:{show:false},axisLine:{show:false},splitLine:{show:!t&&{lineStyle:{type:"dashed",color:C.grid}}}},
      series:[{type:"candlestick",data:d,itemStyle:{color:"#F76B8A",color0:"#22C7A5",borderColor:"#F76B8A",borderColor0:"#22C7A5"}}]
    };
  }
},
{
  id:13, cat:"advanced", name:"热力图", en:"Heatmap",
  desc:"用颜色深浅展示二维矩阵数值",
  intro:"在二维网格中用颜色深浅编码单元格数值，直观展示二维分布与密集区。适合展示「时间 × 类别」「行 × 列」的密度与强度。",
  prompt:"Show user activity density across the week with a heatmap.\nUse: a seven-by-eight grid of weekday and time-of-day cells, cell color encoding intensity along a light-to-deep ramp, thin light borders between cells, a horizontal legend at the bottom, and hover tooltips.\nKeep it dense and clean. Avoid it when precise values must be read off the chart.",
  goodFor:"用户活跃热力、相关性矩阵、时空密度",
  badFor:"精确读数、单维趋势、占比",
  option:function(m){
    var t = m === "thumb";
    var d = [], s = 13;
    function rnd(){ s = (s * 9301 + 49297) % 233280; return s / 233280; }
    for(var i = 0; i < 7; i++) for(var j = 0; j < 8; j++) d.push([j, i, Math.round(rnd() * 100)]);
    return {
      tooltip:t?undefined:{},
      grid:{left:t?8:48,right:t?8:16,top:t?8:16,bottom:t?8:24},
      xAxis:{type:"category",data:HR,axisLabel:{show:!t},axisTick:{show:!t},axisLine:{show:!t},splitLine:{show:!t},boundaryGap:true},
      yAxis:{type:"category",data:WK,axisLabel:{show:!t},axisTick:{show:!t},axisLine:{show:!t},splitLine:{show:!t}},
      visualMap:{min:0,max:100,show:!t,orient:"horizontal",left:"center",bottom:0,inRange:{color:["#F2F5FF","#4C7DFF","#3A63D8"]}},
      series:[{type:"heatmap",data:d,label:t?{show:false}:{show:true},itemStyle:{borderColor:"#fff",borderWidth:1}}]
    };
  }
},
{
  id:14, cat:"advanced", name:"箱线图", en:"Boxplot",
  desc:"展示分布的五数概括与离群点",
  intro:"用箱体展示四分位距（Q1–Q3），用须线展示上下边缘，离群点单独标出。一图展示分布的中心、离散与偏态，是多组数据分布对比的首选。",
  prompt:"Compare the distributions of five groups with a boxplot.\nUse: boxes for the interquartile range and whiskers for the extremes, a heavier median line, an accent-filled box with a darker border and a little transparency, and outlier dots scattered slightly above the whiskers.\nKeep it statistical and unadorned. Avoid it for a single group, or when only averages matter.",
  goodFor:"多组分布对比、实验数据、薪资分布、A/B 测试",
  badFor:"单值展示、时间趋势、占比",
  option:function(m){
    var t = m === "thumb";
    var cats = ["A","B","C","D","E"];
    var d = [
      [30,45,55,65,90],[20,40,50,60,85],[35,50,60,70,95],[25,38,48,58,80],[40,55,65,75,100]
    ];
    return {
      grid:{left:t?8:48,right:t?8:16,top:t?8:16,bottom:t?8:24},
      tooltip:t?undefined:{trigger:"axis"},
      xAxis:{type:"category",data:cats,axisLabel:{show:!t},axisTick:{show:!t},axisLine:{show:!t},splitLine:{show:false}},
      yAxis:{type:"value",axisLabel:{show:!t},axisTick:{show:false},axisLine:{show:false},splitLine:{show:!t&&{lineStyle:{type:"dashed",color:C.grid}}}},
      series:[{type:"boxplot",data:d,itemStyle:{color:"#4C7DFF",borderColor:"#3A63D8"}}]
    };
  }
},
{
  id:15, cat:"advanced", name:"平行坐标", en:"Parallel",
  desc:"多维数据的平行轴连线展示",
  intro:"将各维度作为平行的纵轴，每个数据点用一条折线穿过各轴对应位置。适合展示高维数据的分布与聚类，是多维探索分析的工具。",
  prompt:"Explore thirty samples across four parallel axes to reveal clusters.\nUse: one thin translucent line per sample so overlapping traces build up density, evenly spaced vertical axes with quiet labels, a single line color with optional color-coding by one dimension, and generous side padding.\nKeep it airy and exploratory. Avoid it beyond about ten dimensions, or when exact values must be read off.",
  goodFor:"高维数据探索、聚类观察、多维对比",
  badFor:"维度过多（>10）、精确读数、占比",
  option:function(m){
    var t = m === "thumb";
    var d = [], s = 17;
    function rnd(){ s = (s * 9301 + 49297) % 233280; return s / 233280; }
    for(var i = 0; i < 30; i++){
      d.push([Math.round(rnd() * 100), Math.round(rnd() * 100), Math.round(rnd() * 100), Math.round(rnd() * 100)]);
    }
    return {
      parallelAxis:[
        {dim:0,name:t?"":"维度A",nameTextStyle:{show:!t},axisLabel:{show:!t}},{dim:1,name:t?"":"维度B",nameTextStyle:{show:!t},axisLabel:{show:!t}},
        {dim:2,name:t?"":"维度C",nameTextStyle:{show:!t},axisLabel:{show:!t}},{dim:3,name:t?"":"维度D",nameTextStyle:{show:!t},axisLabel:{show:!t}}
      ],
      parallel:{left:t?8:48,right:t?8:16,top:t?8:24,bottom:t?8:24,axisExpandable:!t},
      tooltip:t?undefined:{},
      series:[{type:"parallel",data:d,lineStyle:{color:"#4C7DFF",opacity:0.4,width:1}}]
    };
  }
},
{
  id:16, cat:"advanced", name:"主题河流图", en:"ThemeRiver",
  desc:"用河流形状展示主题随时间演变",
  intro:"用围绕时间轴的色带展示各主题随时间的数量演变，色带宽度即该时刻该主题的量。形状如河流，适合展示话题热度随时间的迁移。",
  prompt:"Show how three topics rise and fall over a year as a theme river.\nUse: smooth stacked bands flowing left to right along a time axis, a distinct hue per topic, labels only where a band is wide enough to hold them, and hover highlighting that lifts one band with a soft glow.\nKeep it organic and flowing. Avoid it beyond five or six topics, or when precise comparison is needed.",
  goodFor:"话题热度演变、多主题时间对比、舆情",
  badFor:"精确读数、占比、非时间数据",
  option:function(m){
    var t = m === "thumb";
    var d = [], s = 19;
    function rnd(){ s = (s * 9301 + 49297) % 233280; return s / 233280; }
    var themes = ["科技","财经","体育"];
    for(var i = 1; i <= 12; i++) for(var k = 0; k < 3; k++) d.push([i + "月", Math.round(rnd() * 30 + 5), themes[k]]);
    return {
      tooltip:t?undefined:{},
      singleAxis:{type:"category",axisLabel:{show:!t},axisTick:{show:!t},axisLine:{show:!t}},
      series:[{type:"themeRiver",data:d,label:t?{show:false}:{show:true},emphasis:{itemStyle:{shadowBlur:10}}}]
    };
  }
},
{
  id:17, cat:"advanced", name:"桑基图", en:"Sankey",
  desc:"用流宽展示节点间的流量转移",
  intro:"用节点间的色带宽度展示流量大小，色带流向即转移路径。适合展示能量流、资金流、用户路径、资源分配等「从哪到哪多少」的关系。",
  prompt:"Show an e-commerce user journey as a flow diagram, from landing through browsing to purchase or drop-off.\nUse: a left-to-right layout with stages kept in a consistent order, node bars sized to volume, ribbon links with a soft gradient and gentle curves, and labels beside each node.\nKeep it clean and process-oriented. Avoid it when the flow contains cycles, or when exact values need comparing.",
  goodFor:"资金流、能量流、用户路径、资源分配",
  badFor:"精确读数、时间趋势、占比构成",
  option:function(m){
    var t = m === "thumb";
    return {
      tooltip:t?undefined:{},
      series:[{
        type:"sankey",
        left:t?38:48,right:t?38:16,top:t?8:16,bottom:t?8:16,
        nodeWidth:t?5:16,nodeGap:t?4:10,
        label:{show:true,fontSize:t?9:12,color:C.text},
        data:[
          {name:"访问"},{name:"购物"},{name:"退出"},
          {name:"加购"},{name:"直接买"},{name:"支付"},{name:"放弃"}
        ],
        links:[
          {source:"访问",target:"购物",value:60},
          {source:"访问",target:"退出",value:40},
          {source:"购物",target:"加购",value:35},
          {source:"购物",target:"直接买",value:25},
          {source:"加购",target:"支付",value:20},
          {source:"加购",target:"放弃",value:15},
          {source:"直接买",target:"支付",value:20},
          {source:"直接买",target:"放弃",value:5}
        ],
        lineStyle:{color:"gradient",curveness:0.5,opacity:0.45}
      }]
    };
  }
},
{
  id:18, cat:"advanced", name:"极坐标柱状", en:"Polar Bar",
  desc:"在极坐标系下用径向长度展示数值",
  intro:"把柱状图搬到极坐标系：类别沿圆周分布，数值用径向长度展示。形成「玫瑰」或「风玫瑰」形态，兼具美感与周期性展示能力。",
  prompt:"Show wind frequency by direction as a polar rose chart.\nUse: eight evenly spaced spokes around a circle, petals growing outward from the center with rounded tips and a soft radial gradient, light angular gridlines, and the dominant direction picked out in the strongest accent color while the rest stay muted.\nKeep it decorative yet readable. Avoid it for non-cyclical categories, whose order readers will misread.",
  goodFor:"风向风频、周期性数据、角度分布",
  badFor:"精确数值比较、非周期类别",
  option:function(m){
    var t = m === "thumb";
    var dirs = ["N","NE","E","SE","S","SW","W","NW"];
    return {
      tooltip:t?undefined:{},
      polar:{radius:t?"92%":"70%"},
      angleAxis:{type:"category",data:dirs,axisLabel:{show:!t},axisTick:{show:!t},axisLine:{show:!t},splitLine:{show:!t}},
      radiusAxis:{axisLabel:{show:!t},axisTick:{show:!t},axisLine:{show:!t},splitLine:{show:!t&&{lineStyle:{type:"dashed",color:C.grid}}}},
      series:[{type:"bar",data:rw(8,30,15,21),coordinateSystem:"polar",itemStyle:{color:barGrad(C.blue),borderRadius:4}}]
    };
  }
},
{
  id:19, cat:"advanced", name:"日历热力", en:"Calendar",
  desc:"按日历展示全年每日数值强度",
  intro:"用日历网格展示一年（或多月）每日的数值，颜色深浅编码数值大小。GitHub 贡献图即此形态，适合展示长期每日活跃度。",
  prompt:"Show a year of daily activity as a calendar heatmap, GitHub-contribution style.\nUse: small rounded day cells laid out by week, color intensity along a light-to-deep ramp capped near the 95th percentile so outliers never wash out the year, month and weekday labels, a horizontal legend, and a quiet background.\nKeep it calm and glanceable. Avoid it for data that is not recorded daily.",
  goodFor:"每日活跃、贡献图、打卡记录、长期习惯",
  badFor:"精确读数、非按日数据、实时数据",
  option:function(m){
    var t = m === "thumb";
    var d = [], s = 23;
    function rnd(){ s = (s * 9301 + 49297) % 233280; return s / 233280; }
    for(var i = 0; i < 120; i++){
      var day = "2026-" + (1 + Math.floor(i / 30)) + "-" + (1 + (i % 28));
      d.push([day, Math.round(rnd() * 30)]);
    }
    return {
      tooltip:t?undefined:{},
      visualMap:{min:0,max:30,show:!t,orient:"horizontal",left:"center",bottom:0,inRange:{color:["#F2F5FF","#4C7DFF","#3A63D8"]}},
      calendar:{
        left:t?8:40,right:t?8:16,top:t?8:24,bottom:t?8:32,
        range:["2026-01-01","2026-04-30"],
        cellSize:t?["auto","auto"]:["auto","auto"],
        itemStyle:{borderWidth:1,borderColor:"#fff"},
        yearLabel:{show:!t},monthLabel:{show:!t},dayLabel:{show:!t}
      },
      series:[{type:"heatmap",coordinateSystem:"calendar",data:d}]
    };
  }
},

/* ===================== 层级与关系 hierarchy ===================== */
{
  id:20, cat:"hierarchy", name:"树图", en:"Tree",
  desc:"用连线展示层级树状结构",
  intro:"用节点与连线展示层级包含关系，支持正交（横向/纵向）与径向布局。适合组织架构、文件目录、分类体系、决策树。",
  prompt:"Show a three-level organization hierarchy as a tree diagram.\nUse: a left-to-right layout, small hollow circular nodes, gentle curved connectors in light grey, parent labels to the left and leaf labels to the right, and branches that can be collapsed.\nKeep it tidy and structured. Avoid it for non-hierarchical or cyclic relationships.",
  goodFor:"组织架构、文件目录、分类体系、决策树",
  badFor:"非层级关系、大规模网络、时间数据",
  option:function(m){
    var t = m === "thumb";
    return {
      tooltip:t?undefined:{},
      series:[{
        type:"tree",
        left:t?26:48,right:t?44:80,top:t?6:16,bottom:t?6:16,
        layout:"orthogonal",orient:"LR",
        symbol:"emptyCircle",symbolSize:t?5:7,
        label:{show:true,position:"left",verticalAlign:"middle",align:"right",fontSize:t?9:12,color:C.text},
        leaves:{label:{show:true,position:"right",verticalAlign:"middle",align:"left",fontSize:t?9:12,color:C.text}},
        lineStyle:{curveness:0.5,color:"#DCE3F1"},
        data:[{
          name:"根",
          children:[
            {name:"分支A",children:[{name:"叶A1"},{name:"叶A2"}]},
            {name:"分支B",children:[{name:"叶B1"},{name:"叶B2"},{name:"叶B3"}]},
            {name:"分支C",children:[{name:"叶C1"}]}
          ]
        }]
      }]
    };
  }
},
{
  id:21, cat:"hierarchy", name:"旭日图", en:"Sunburst",
  desc:"用同心环展示多层级占比",
  intro:"用同心圆环展示多层级占比：内圈为父类，外圈为子类，扇形角度即占比。是饼图的多层扩展，适合展示分层占比结构。",
  prompt:"Show a three-level share breakdown as a sunburst chart.\nUse: concentric rings where the inner ring holds parent categories and the outer ring their parts, slice angle proportional to value, labels following the arc, and same-hue shading within each parent branch around a hollow center.\nKeep it colorful and radial. Avoid it beyond three levels or eight categories per level.",
  goodFor:"分层占比、分类下钻、预算分解",
  badFor:"非层级数据、精确读数、时间趋势",
  option:function(m){
    var t = m === "thumb";
    return {
      tooltip:t?undefined:{},
      series:[{
        type:"sunburst",
        radius:t?["10%","92%"]:["15%","90%"],
        center:["50%","52%"],
        label:{show:!t,rotate:"tangential"},
        data:[
          {name:"A",value:40,children:[{name:"A1",value:15},{name:"A2",value:25}]},
          {name:"B",value:35,children:[{name:"B1",value:20},{name:"B2",value:15}]},
          {name:"C",value:25,children:[{name:"C1",value:10},{name:"C2",value:15}]}
        ]
      }]
    };
  }
},
{
  id:22, cat:"hierarchy", name:"关系图", en:"Graph",
  desc:"用节点连线展示网络拓扑关系",
  intro:"用节点与连线展示实体间的网络关系，支持力导向、固定布局、环形等。适合社交网络、知识图谱、依赖关系、拓扑图。",
  prompt:"Show a small network of one central hub linked to five others as a node-link diagram.\nUse: circles sized by importance, thin light connectors with arrowheads for direction, labels beside the nodes, a gentle automatic layout, and drag-and-zoom interaction.\nKeep it clean and legible. Avoid it for hierarchical or time-based data.",
  goodFor:"社交网络、知识图谱、依赖关系、拓扑",
  badFor:"层级树、时间趋势、占比",
  option:function(m){
    var t = m === "thumb";
    return {
      tooltip:t?undefined:{},
      series:[{
        type:"graph",
        layout:"force",
        roam:!t,
        force:{repulsion:t?40:120,edgeLength:60},
        symbolSize:t?9:18,
        label:{show:true,position:"right",fontSize:t?9:13,color:C.text},
        edgeSymbol:["none","arrow"],edgeSymbolSize:[0,8],
        data:[
          {name:"中心"},
          {name:"A"},{name:"B"},{name:"C"},{name:"D"},{name:"E"}
        ],
        links:[
          {source:"中心",target:"A"},{source:"中心",target:"B"},
          {source:"中心",target:"C"},{source:"中心",target:"D"},
          {source:"中心",target:"E"},{source:"A",target:"B"},
          {source:"C",target:"D"}
        ],
        lineStyle:{color:C.link,curveness:0}
      }]
    };
  }
},
{
  id:23, cat:"hierarchy", name:"矩形树图", en:"Treemap",
  desc:"用嵌套矩形展示层级占比",
  intro:"用嵌套矩形展示多层级占比：矩形面积即数值大小，外层包含内层。比旭日图更易精确比较面积，适合展示分层占比与下钻。",
  prompt:"Show nested proportions as a treemap.\nUse: rectangles whose area matches value, nested groups separated by white gaps, in-tile labels with higher-level group titles on top, same-hue shading within a group, and drill-down with a breadcrumb.\nKeep it dense and comparative. Avoid it for flat data with only a few items, and keep numeric labels visible where areas are close in size.",
  goodFor:"分层占比、磁盘占用、预算分解、下钻",
  badFor:"非层级数据、时间趋势、精确数值",
  option:function(m){
    var t = m === "thumb";
    return {
      tooltip:t?undefined:{},
      series:[{
        type:"treemap",
        left:t?4:8,right:t?4:8,top:t?4:8,bottom:t?4:8,
        label:{show:true,formatter:"{b}",fontSize:t?9:12},
        upperLabel:{show:!t},
        itemStyle:{borderColor:"#fff",borderWidth:2,gapWidth:2},
        data:[
          {name:"A",value:40,children:[{name:"A1",value:25},{name:"A2",value:15}]},
          {name:"B",value:35,children:[{name:"B1",value:20},{name:"B2",value:15}]},
          {name:"C",value:25,children:[{name:"C1",value:15},{name:"C2",value:10}]}
        ]
      }]
    };
  }
},
{
  id:24, cat:"hierarchy", name:"力导向图", en:"Force Graph",
  desc:"物理模拟自动布局的网络图",
  intro:"关系图的力导向布局：节点间斥力、连线引力，模拟物理平衡自动排布。适合节点数较多、无固定位置的网络关系探索。",
  prompt:"Show twelve interconnected entities as a force-directed network.\nUse: nodes sized by connectivity and colored by group, thin semi-transparent curved links, labels hidden until hover once the graph gets busy, and a physics layout the user can drag and zoom.\nKeep it organic and exploratory. Avoid it above roughly 150 nodes, where the animation starts to stutter.",
  goodFor:"社交网络、引用网络、聚类探索、关系发现",
  badFor:"固定拓扑、层级树、精确位置",
  option:function(m){
    var t = m === "thumb";
    var nodes = [], links = [], s = 29;
    function rnd(){ s = (s * 9301 + 49297) % 233280; return s / 233280; }
    for(var i = 0; i < 12; i++) nodes.push({name:"N"+i,symbolSize:t?7:(10+rnd()*10),category:i%3});
    for(var k = 0; k < 18; k++){
      var a = Math.floor(rnd() * 12), b = Math.floor(rnd() * 12);
      if(a !== b) links.push({source:"N"+a,target:"N"+b});
    }
    return {
      tooltip:t?undefined:{},
      series:[{
        type:"graph",layout:"force",roam:!t,
        force:{repulsion:t?30:80,edgeLength:50,gravity:0.1},
        label:{show:!t,fontSize:9},
        categories:[{name:"类A"},{name:"类B"},{name:"类C"}],
        data:nodes,links:links,
        lineStyle:{opacity:0.5,curveness:0.1}
      }]
    };
  }
},

/* ===================== 多维与组合 multi ===================== */
{
  id:25, cat:"multi", name:"双轴折柱组合", en:"Bar + Line",
  desc:"柱状与折线共用 X 轴双 Y 轴",
  intro:"柱状图与折线图共用 X 轴，分别用左右两个 Y 轴展示不同量纲。适合展示「销量 × 增长率」「收入 × 利润率」等量纲不同的双指标。",
  prompt:"Show sales volume and growth rate together on a dual-axis chart.\nUse: bars for the absolute figures read against the left axis and a smooth line with markers for the percentage read against the right, a legend on top, matching gridline counts on both axes so the two scales stay aligned, and light dashed gridlines.\nKeep it clear and decision-oriented. Avoid it when both metrics share the same unit, which would mislead readers into comparing them directly.",
  goodFor:"销量×增长率、收入×利润率、量纲不同的双指标",
  badFor:"量纲相同可直接比较、单指标",
  option:function(m){
    var t = m === "thumb";
    return {
      grid:{left:t?8:48,right:t?8:48,top:t?8:24,bottom:t?8:32},
      legend:t?undefined:{top:0,data:["销量","增长率"]},
      tooltip:t?undefined:{trigger:"axis"},
      xAxis:{type:"category",data:MON,axisLabel:{show:!t},axisTick:{show:!t},axisLine:{show:!t},splitLine:{show:false}},
      yAxis:[
        {type:"value",axisLabel:{show:!t},axisTick:{show:false},axisLine:{show:false},splitLine:{show:!t&&{lineStyle:{type:"dashed",color:C.grid}}}},
        {type:"value",axisLabel:{show:!t,formatter:"{value}%"},axisTick:{show:false},axisLine:{show:false},splitLine:{show:false}}
      ],
      series:[
        {name:"销量",type:"bar",data:rw(12,60,18,5),barWidth:t?"60%":"45%",itemStyle:{borderRadius:[4,4,0,0],color:barGrad(C.blue)},color:"#4C7DFF"},
        {name:"增长率",type:"line",yAxisIndex:1,data:rw(12,15,8,7),smooth:!t,symbol:t?"none":"circle",color:"#F76B8A",lineStyle:{width:2.5}}
      ]
    };
  }
},
{
  id:26, cat:"multi", name:"多维雷达", en:"Multi Radar",
  desc:"多个体在多维度上的星形对比",
  intro:"在雷达图上叠加多个体的多维度数值，用不同颜色的星形围合对比。适合多产品、多候选人、多方案的多维综合评估对比。",
  prompt:"Compare three products across five attributes on a radar chart.\nUse: a shared light polygonal grid, one translucent polygon per product with a matching legend entry, a consistent scale for every axis so the shapes stay comparable, and a legend at the bottom.\nKeep it balanced and easy to scan. Avoid it with more than three overlapping shapes, and normalize the scores to the same range first.",
  goodFor:"多产品对比、多候选人评估、多方案选型",
  badFor:"维度过多、精确读数、时间趋势",
  option:function(m){
    var t = m === "thumb";
    return {
      tooltip:t?undefined:{},
      legend:t?undefined:{bottom:0,data:["产品X","产品Y","产品Z"]},
      radar:{
        indicator:[
          {name:"性能",max:100},{name:"价格",max:100},{name:"外观",max:100},
          {name:"续航",max:100},{name:"售后",max:100}
        ],
        radius:t?"70%":"62%",
        axisName:{show:!t,color:C.text},splitLine:{show:true,lineStyle:{color:"#E1E8F6"}},splitArea:{show:false},axisLine:{show:true,lineStyle:{color:"#E8EEF9"}}
      },
      series:[{
        type:"radar",
        data:[
          {value:[85,60,75,80,70],name:"产品X",areaStyle:{opacity:0.2},color:"#4C7DFF"},
          {value:[70,80,85,65,75],name:"产品Y",areaStyle:{opacity:0.2},color:"#22C7A5"},
          {value:[60,90,70,85,80],name:"产品Z",areaStyle:{opacity:0.2},color:"#FF9F45"}
        ]
      }]
    };
  }
},
{
  id:27, cat:"multi", name:"散点色阶", en:"Scatter + Color",
  desc:"散点用颜色编码第三维分类",
  intro:"在散点图上用颜色编码第三个变量（类别或数值段），实现三维数据的平面展示。比气泡图更易读，适合展示「X × Y × 类别」关系。",
  prompt:"Show three clusters of data points with a color-coded scatter plot.\nUse: one series per category in a distinct accent color with a clickable legend, consistent point size and slight transparency, light dashed gridlines on both axes, and hover tooltips.\nKeep it light and analytical. Avoid it beyond six categories unless the point shapes differ too.",
  goodFor:"三维关系、分类散点、聚类可视化",
  badFor:"精确读第三维、点过多重叠",
  option:function(m){
    var t = m === "thumb";
    function gen(seed, cx, cy){
      var d = [], s = seed;
      function rnd(){ s = (s * 9301 + 49297) % 233280; return s / 233280; }
      for(var i = 0; i < 15; i++) d.push([+(cx + (rnd() - 0.5) * 30).toFixed(1), +(cy + (rnd() - 0.5) * 30).toFixed(1)]);
      return d;
    }
    return {
      grid:{left:t?8:48,right:t?8:16,top:t?8:16,bottom:t?8:32},
      legend:t?undefined:{bottom:0,data:["类A","类B","类C"]},
      tooltip:t?undefined:{},
      xAxis:{type:"value",axisLabel:{show:!t},axisTick:{show:!t},axisLine:{show:!t},splitLine:{show:!t&&{lineStyle:{type:"dashed",color:C.grid}}},min:0,max:100},
      yAxis:{type:"value",axisLabel:{show:!t},axisTick:{show:false},axisLine:{show:false},splitLine:{show:!t&&{lineStyle:{type:"dashed",color:C.grid}}},min:0,max:100},
      series:[
        {name:"类A",type:"scatter",data:gen(31,30,30),symbolSize:t?7:9,color:"#4C7DFF"},
        {name:"类B",type:"scatter",data:gen(37,70,40),symbolSize:t?7:9,color:"#22C7A5"},
        {name:"类C",type:"scatter",data:gen(41,50,75),symbolSize:t?7:9,color:"#FF9F45"}
      ]
    };
  }
},
{
  id:28, cat:"multi", name:"堆叠柱状", en:"Stacked Bar",
  desc:"多系列柱状堆叠展示构成与总量",
  intro:"把多个柱状系列在同一类别上堆叠，既展示各部分构成又展示总量。适合展示「收入构成」「人口年龄分布」等分项与汇总并存的数据。",
  prompt:"Show monthly revenue composition across four channels as a stacked bar chart.\nUse: four stacked segments in a related hue family from light to dark, rounded corners on the top segment only, a legend on top, light dashed gridlines, and a hover tooltip that lists each part together with its share of the total.\nKeep it clean and corporate. Avoid it when each component needs exact comparison, or when values turn negative.",
  goodFor:"收入构成、人口分布、分项汇总并存",
  badFor:"精确比较各分项、负值交替",
  option:function(m){
    var t = m === "thumb";
    return {
      grid:{left:t?8:48,right:t?8:16,top:t?8:24,bottom:t?8:32},
      legend:t?undefined:{top:0,data:["直接","搜索","广告","社交"]},
      tooltip:t?undefined:{trigger:"axis"},
      xAxis:{type:"category",data:MON,axisLabel:{show:!t},axisTick:{show:!t},axisLine:{show:!t},splitLine:{show:false}},
      yAxis:{type:"value",axisLabel:{show:!t},axisTick:{show:false},axisLine:{show:false},splitLine:{show:!t&&{lineStyle:{type:"dashed",color:C.grid}}}},
      series:[
        {name:"直接",type:"bar",stack:"总",data:rw(12,20,6,5),itemStyle:{borderRadius:[0,0,0,0]},color:"#4C7DFF"},
        {name:"搜索",type:"bar",stack:"总",data:rw(12,30,8,7),color:"#22C7A5"},
        {name:"广告",type:"bar",stack:"总",data:rw(12,15,5,3),color:"#FF9F45"},
        {name:"社交",type:"bar",stack:"总",data:rw(12,10,4,9),itemStyle:{borderRadius:[4,4,0,0]},color:"#F76B8A"}
      ]
    };
  }
},
{
  id:29, cat:"multi", name:"堆叠面积", en:"Stacked Area",
  desc:"多系列面积堆叠展示流量构成",
  intro:"把多个折线面积系列堆叠，展示各部分随时间变化的同时反映总量变化。是流量来源、收入构成随时间演变的首选。",
  prompt:"Show how visits split across mobile, desktop and tablet over a year as a stacked area chart.\nUse: three smooth bands stacked from the darkest color at the bottom to the lightest on top, subtle vertical gradients, no point markers, a legend on top, and a hover tooltip listing each series with its share.\nKeep it soft and trend-focused. Avoid it when exact per-series values matter, or when the data includes negatives.",
  goodFor:"流量来源演变、收入构成趋势、堆叠趋势",
  badFor:"精确读各分项、负值交替",
  option:function(m){
    var t = m === "thumb";
    return {
      grid:{left:t?8:48,right:t?8:16,top:t?8:24,bottom:t?8:32},
      legend:t?undefined:{top:0,data:["移动","PC","平板"]},
      tooltip:t?undefined:{trigger:"axis"},
      xAxis:{type:"category",data:MON,boundaryGap:false,axisLabel:{show:!t},axisTick:{show:!t},axisLine:{show:!t},splitLine:{show:false}},
      yAxis:{type:"value",axisLabel:{show:!t},axisTick:{show:false},axisLine:{show:false},splitLine:{show:!t&&{lineStyle:{type:"dashed",color:C.grid}}}},
      series:[
        {name:"移动",type:"line",stack:"总",data:rw(12,40,12,5),areaStyle:{color:areaGrad(C.blue)},smooth:!t,symbol:"none",color:"#4C7DFF"},
        {name:"PC",type:"line",stack:"总",data:rw(12,25,8,7),areaStyle:{color:areaGrad(C.mint)},smooth:!t,symbol:"none",color:"#22C7A5"},
        {name:"平板",type:"line",stack:"总",data:rw(12,10,4,3),areaStyle:{color:areaGrad(C.amber)},smooth:!t,symbol:"none",color:"#FF9F45"}
      ]
    };
  }
},
{
  id:30, cat:"multi", name:"多图组合", en:"Grid Combo",
  desc:"多子图并列展示关联指标",
  intro:"用 grid 数组定义多个子坐标系，在同一画布并列多个相关图表。适合仪表板把关联指标组合展示，节省空间且便于对照。",
  prompt:"Show two related mini charts side by side in one canvas: a bar chart of six monthly sales on the left and a line chart of four channel trends on the right.\nUse: a shared visual language — the same type sizes, gridline color and spacing — with enough gap between the panels that axis labels never collide.\nKeep it dashboard-like and compact. Avoid it beyond three panels; split into separate charts instead.",
  goodFor:"仪表板组合、关联指标对照、空间紧凑展示",
  badFor:"单一焦点、全屏单图",
  option:function(m){
    var t = m === "thumb";
    return {
      tooltip:t?undefined:{},
      grid:[
        {left:t?"6%":"8%",right:t?"52%":"52%",top:t?"8%":"12%",bottom:t?"12%":"18%"},
        {left:t?"54%":"56%",right:t?"6%":"8%",top:t?"8%":"12%",bottom:t?"12%":"18%"}
      ],
      xAxis:[
        {type:"category",data:MON.slice(0,6),axisLabel:{show:!t},axisTick:{show:!t},axisLine:{show:!t},splitLine:{show:false},gridIndex:0},
        {type:"category",data:["A","B","C","D"],axisLabel:{show:!t},axisTick:{show:!t},axisLine:{show:!t},splitLine:{show:false},gridIndex:1}
      ],
      yAxis:[
        {type:"value",axisLabel:{show:!t},axisTick:{show:false},axisLine:{show:false},splitLine:{show:!t&&{lineStyle:{type:"dashed",color:C.grid}}},gridIndex:0},
        {type:"value",axisLabel:{show:!t},axisTick:{show:false},axisLine:{show:false},splitLine:{show:!t&&{lineStyle:{type:"dashed",color:C.grid}}},gridIndex:1}
      ],
      series:[
        {type:"bar",data:rw(6,50,15,5),xAxisIndex:0,yAxisIndex:0,itemStyle:{borderRadius:[4,4,0,0],color:barGrad(C.blue)},color:"#4C7DFF"},
        {type:"line",data:rw(4,40,12,7),xAxisIndex:1,yAxisIndex:1,smooth:!t,symbol:t?"none":"circle",color:"#F76B8A"}
      ]
    };
  }
}
];

/* 取色起点：第 i 张图从主题色环的第 (i % 5) 色开始取，
   同主题下不同图表的配色因此彼此错开，不会张张一样。
   仪表盘（红=差 / 黄=中 / 绿=好）与 K 线（红涨绿跌）的颜色含语义，固定从第 1 色起，不参与偏移。 */
var SEMANTIC_CHARTS = {11:1, 12:1};
CHARTS.forEach(function(s, i){ s._rot = SEMANTIC_CHARTS[s.id] ? 0 : i % 5; });

/* 分类：zh 用于列表分组标题，short 用于顶部分类 tab */
var CATS = [
  {key:"basic", zh:"基础统计图", short:"基础", en:"Basic"},
  {key:"advanced", zh:"数据可视化进阶", short:"进阶", en:"Advanced"},
  {key:"hierarchy", zh:"层级与关系", short:"层级", en:"Hierarchy"},
  {key:"multi", zh:"多维与组合", short:"组合", en:"Multi"}
];

/* ============ 渲染 ============ */
var app = document.getElementById("app");
var tabs = document.getElementById("tabs");
var titleEl = document.getElementById("title");
var toastEl = document.getElementById("toast");
var fabTop = document.getElementById("fabTop");
var fabBack = document.getElementById("fabBack");
var activeCat = "all";
var activeCharts = [];

var ICON_CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
var ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>';
var ICON_CHECK = '<svg class="tc-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';

function disposeCharts(){
  for(var i = 0; i < activeCharts.length; i++){
    try { activeCharts[i].dispose(); } catch(e) {}
  }
  activeCharts = [];
}

function renderChartInto(dom, chart, mode){
  var inst = echarts.init(dom, null, {renderer:"canvas"});
  inst.setOption(chartOption(chart, mode));
  activeCharts.push(inst);
  return inst;
}

function showToast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(function(){ toastEl.classList.remove("show"); }, 1800);
}

function renderTabs(){
  tabs.innerHTML = "";
  var all = document.createElement("button");
  all.className = "tab" + (activeCat === "all" ? " active" : "");
  all.textContent = "全部";
  all.addEventListener("click", function(){ activeCat = "all"; renderTabs(); renderList(); });
  tabs.appendChild(all);
  CATS.forEach(function(c){
    var b = document.createElement("button");
    b.className = "tab" + (activeCat === c.key ? " active" : "");
    b.textContent = c.short;                       /* 短名 + 自动换行：窄屏不再横向滚动，全部可点 */
    b.title = c.zh;
    b.setAttribute("aria-label", c.zh);
    b.addEventListener("click", function(){ activeCat = c.key; renderTabs(); renderList(); });
    tabs.appendChild(b);
  });
}

function renderList(){
  disposeCharts();
  titleEl.textContent = "图表图鉴";
  fabBack.classList.remove("show");
  tabs.style.display = "flex";
  app.innerHTML = "";
  var wrap = document.createElement("div");
  wrap.className = "list";

  CATS.forEach(function(c){
    if(activeCat !== "all" && activeCat !== c.key) return;
    var list = CHARTS.filter(function(s){ return s.cat === c.key; });
    if(!list.length) return;

    var sec = document.createElement("section");
    sec.className = "section";
    var head = document.createElement("div");
    head.className = "section-head";
    head.innerHTML = '<h2>' + c.zh + '</h2><span class="en">' + c.en + '</span><span class="cnt">' + list.length + ' 种</span>';
    sec.appendChild(head);

    var grid = document.createElement("div");
    grid.className = "grid";
    list.forEach(function(s){
      var card = document.createElement("div");
      card.className = "card";
      card.innerHTML =
        '<div class="demo"><i class="preview-bg"></i><div class="chart-pad"><div class="chart-thumb"></div></div></div>' +
        '<div class="card-info">' +
          '<div class="card-head"><span class="name">' + s.name + '</span>' + ICON_CHEV + '</div>' +
          '<div class="desc">' + s.desc + '</div>' +
        '</div>';
      card.addEventListener("click", function(){ location.hash = "#/c/" + s.id; });
      grid.appendChild(card);
      var thumbDom = card.querySelector(".chart-thumb");
      requestAnimationFrame(function(){
        if(thumbDom.offsetWidth > 0 && thumbDom.offsetHeight > 0){
          renderChartInto(thumbDom, s, "thumb");
        }
      });
    });
    sec.appendChild(grid);
    wrap.appendChild(sec);
  });
  app.appendChild(wrap);
  window.scrollTo(0, 0);
}

function renderDetail(id){
  disposeCharts();
  var s = null;
  for(var i = 0; i < CHARTS.length; i++){ if(CHARTS[i].id === id){ s = CHARTS[i]; break; } }
  if(!s){ location.hash = "#/"; return; }

  var catZh = "";
  for(var j = 0; j < CATS.length; j++){ if(CATS[j].key === s.cat){ catZh = CATS[j].zh; break; } }

  titleEl.textContent = s.name;
  fabBack.classList.add("show");
  tabs.style.display = "none";
  app.innerHTML = "";

  var d = document.createElement("div");
  d.className = "detail";

  var hero = document.createElement("div");
  hero.className = "hero";
  hero.innerHTML = '<i class="preview-bg"></i><div class="chart-pad"><div class="chart-thumb" id="heroChart"></div></div>';
  d.appendChild(hero);

  var catBadge = document.createElement("div");
  catBadge.className = "cat-badge";
  catBadge.textContent = catZh;
  d.appendChild(catBadge);

  var h2 = document.createElement("h2");
  h2.textContent = s.name;
  d.appendChild(h2);

  var en = document.createElement("div");
  en.className = "en-name";
  en.textContent = s.en;
  d.appendChild(en);

  var intro = document.createElement("div");
  intro.className = "block";
  intro.innerHTML = '<h3 class="h3-a">图表介绍</h3><p>' + s.intro + '</p>';
  d.appendChild(intro);

  /* 主题配色：块内直接点选切换（不弹窗、不跳页），点了立即整站生效并记住选择 */
  var ramp = CUR_THEME.ramp, off = s._rot || 0;
  var themeBlock = document.createElement("div");
  themeBlock.className = "block";
  var themeHtml = '<h3 class="h3-c">主题配色</h3>' +
    '<p class="hint mb">点选主题即可整站换色：页面色调与全部 30 张图表同步，选择自动记住</p>' +
    '<div class="theme-grid">';
  THEMES.forEach(function(t){
    var dots = "";
    for(var di = 0; di < t.ramp.length; di++){ dots += '<i class="tc-dot" style="background:' + t.ramp[di].c + '"></i>'; }
    themeHtml += '<button class="theme-card' + (t.key === CUR_THEME.key ? ' active' : '') + '" data-key="' + t.key + '">' +
      '<span class="tc-head"><span class="tc-name">' + t.name + '</span>' +
      (t.dark ? '<em class="tc-dark">暗色</em>' : '') + ICON_CHECK + '</span>' +
      '<span class="tc-dots">' + dots + '</span>' +
    '</button>';
  });
  themeHtml += '</div><p class="swatch-title">本页图表用色</p><div class="swatches">';
  for(var ci = 0; ci < ramp.length; ci++){
    var tone = ramp[(ci + off) % ramp.length];
    themeHtml += '<div class="swatch"><div class="chip" style="background:' + tone.c + '"></div>' +
      '<div class="cname">' + tone.n + '</div><div class="hex">' + tone.c + '</div></div>';
  }
  themeHtml += '</div>';
  themeBlock.innerHTML = themeHtml;
  d.appendChild(themeBlock);
  var cards = themeBlock.querySelectorAll(".theme-card");
  for(var bi = 0; bi < cards.length; bi++){ cards[bi].addEventListener("click", onThemePick); }

  var promptBlock = document.createElement("div");
  promptBlock.className = "block";
  promptBlock.innerHTML =
    '<h3 class="h3-b">AI 提示词</h3>' +
    '<p class="hint">提示词只描述「内容 + 风格」，不限定技术栈，由 AI 自选方案；点按可全选，长按文字手动复制后粘贴给 AI</p>' +
    '<div class="prompt-box"><pre>' + escapeHtml(s.prompt) + '</pre></div>' +
    '<button class="copy-btn" id="copyBtn">' + ICON_COPY + '复制提示词</button>';
  d.appendChild(promptBlock);

  var sceneBlock = document.createElement("div");
  sceneBlock.className = "block";
  sceneBlock.innerHTML =
    '<h3 class="h3-d">适用场景</h3>' +
    '<div class="scene">' +
      '<div class="col good"><h4>✓ 适用</h4><p>' + s.goodFor + '</p></div>' +
      '<div class="col bad"><h4>✗ 不适用</h4><p>' + s.badFor + '</p></div>' +
    '</div>';
  d.appendChild(sceneBlock);

  app.appendChild(d);

  var heroDom = document.getElementById("heroChart");
  requestAnimationFrame(function(){
    if(heroDom.offsetWidth > 0){ renderChartInto(heroDom, s, "full"); }
  });

  var copyBtn = document.getElementById("copyBtn");
  if(copyBtn){
    copyBtn.addEventListener("click", function(){ copyText(s.prompt, copyBtn); });
  }

  window.scrollTo(0, 0);
}

function escapeHtml(str){
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function copyText(text, btn){
  var box = btn && btn.closest ? btn.closest(".block") : null;
  var pre = box ? box.querySelector(".prompt-box pre") : null;
  if(pre){
    var range = document.createRange();
    range.selectNodeContents(pre);
    var sel = window.getSelection();
    if(sel){ sel.removeAllRanges(); sel.addRange(range); }
  }
  showToast("已选中提示词，请长按文字手动复制");
}

function route(){
  disposeCharts();
  var h = location.hash || "#/";
  var m = h.match(/^#\/c\/(\d+)$/);
  if(m){ renderDetail(parseInt(m[1], 10)); }
  else { activeCat = "all"; renderTabs(); renderList(); }
}

/* ============ 主题切换 ============ */
function onThemePick(){ setTheme(this.getAttribute("data-key")); }

function setTheme(key){
  var t = null;
  for(var i = 0; i < THEMES.length; i++){ if(THEMES[i].key === key){ t = THEMES[i]; break; } }
  if(!t || t === CUR_THEME){ return; }
  CUR_THEME = t;
  applyUI();
  try { localStorage.setItem(THEME_KEY, t.key); } catch(e) {}
  refreshView();
}

/* 换主题后重绘当前页：保留滚动位置，列表页不重置已选分类；
   详情页重绘时会重新生成主题卡片，选中态随之更新，无需额外同步。 */
function refreshView(){
  var y = window.pageYOffset || document.documentElement.scrollTop || 0;
  var m = (location.hash || "").match(/^#\/c\/(\d+)$/);
  if(m){ renderDetail(parseInt(m[1], 10)); }
  else { renderTabs(); renderList(); }
  window.scrollTo(0, y);
}

fabBack.addEventListener("click", function(){ location.hash = "#/"; });
fabTop.addEventListener("click", function(){
  try { window.scrollTo({top:0, behavior:"smooth"}); } catch(e){ window.scrollTo(0, 0); }
});

var scrollTicking = false;
window.addEventListener("scroll", function(){
  if(scrollTicking) return;
  scrollTicking = true;
  window.requestAnimationFrame(function(){
    scrollTicking = false;
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    if(y > 400){ fabTop.classList.add("show"); } else { fabTop.classList.remove("show"); }
  });
}, {passive:true});

window.addEventListener("resize", function(){
  for(var i = 0; i < activeCharts.length; i++){ try { activeCharts[i].resize(); } catch(e) {} }
});

/* 启动：先恢复上次主题（无存储权限时静默用默认主题），再渲染路由 */
var savedTheme = null;
try { savedTheme = localStorage.getItem(THEME_KEY); } catch(e) {}
for(var ti = 0; ti < THEMES.length; ti++){
  if(THEMES[ti].key === savedTheme){ CUR_THEME = THEMES[ti]; break; }
}
applyUI();

window.addEventListener("hashchange", route);
route();

})();
