(function(){
'use strict';

var DATA = {"palette":[{"k":"W","name":"米白","hex":"#F3E9D6"},{"k":"S","name":"银灰","hex":"#B9BEC4"},{"k":"a","name":"水泥灰","hex":"#A8AEB8"},{"k":"d","name":"烟灰","hex":"#5A6472"},{"k":"K","name":"墨黑","hex":"#2A2E35"},{"k":"G","name":"石灰","hex":"#8A9099"},{"k":"B","name":"砖红","hex":"#C0503C"},{"k":"R","name":"屋顶红","hex":"#D9542B"},{"k":"O","name":"木棕","hex":"#A9713F"},{"k":"Y","name":"暖黄","hex":"#F0C24B"},{"k":"n","name":"草绿","hex":"#7FB069"},{"k":"N","name":"松绿","hex":"#3F7A52"},{"k":"T","name":"玻璃青","hex":"#4FA8C7"},{"k":"t","name":"天蓝","hex":"#9FD0E3"},{"k":"w","name":"水蓝","hex":"#5BC8E8"},{"k":"P","name":"樱粉","hex":"#E9A0B0"},{"k":"V","name":"暮紫","hex":"#6B5B95"}],"cats":[{"id":"res","name":"住宅","color":"#7FB069"},{"id":"com","name":"商业","color":"#4FA8C7"},{"id":"ind","name":"工业","color":"#E0A03C"},{"id":"power","name":"电力","color":"#F0C24B"},{"id":"water","name":"水利","color":"#5BC8E8"},{"id":"trash","name":"环卫","color":"#B98FD0"},{"id":"civ","name":"民生","color":"#E9A0B0"}],"titles":[{"pop":0,"name":"荒地"},{"pop":8,"name":"村落"},{"pop":24,"name":"小镇"},{"pop":60,"name":"街区"},{"pop":130,"name":"城区"},{"pop":260,"name":"都会"},{"pop":500,"name":"巨城"}],"buildings":[{"id":"house","name":"暖瓦小屋","cat":"res","cost":60,"popCap":4,"jobs":0,"income":0,"happy":1,"use":{"power":1,"water":1,"trash":1},"gen":{},"unlockPop":0,"desc":"第一盏为你点亮的窗。一屋四人，水电都得管上。","rows":[".....d.....",".....d.....","....RRR....","...RRRRR...","..RRRRRRR..",".RRRRRRRRR.","..WWWWWWW..","..WTWWWTW..","..WWWWWWW..","..WWOOOWW..",".GGGGGGGGG."]},{"id":"park","name":"街心树","cat":"civ","cost":30,"popCap":0,"jobs":0,"income":0,"happy":5,"use":{},"gen":{},"unlockPop":0,"desc":"不产能、不耗电，只负责让大家愿意住下来。","rows":["...........",".....n.....","....nnn....","...nnnnn...","..nNnnnNn..",".nnnnnnnnn.",".nNnnnnnNn.","..nnnnnnn..","...nnnnn...","....OOO....","..GGGGGGG.."]},{"id":"cafe","name":"转角咖啡","cat":"com","cost":90,"popCap":0,"jobs":3,"income":18,"happy":4,"use":{"power":2,"water":1,"trash":2},"gen":{},"unlockPop":4,"desc":"街角的香气，比租金更值钱。三个岗位，撑起一片人气。","rows":["...........","...........","..WYYYYYW..",".RWRWRWRWR.",".WRWRWRWRW.",".RWRWRWRWR.",".WWWWWWWWW.",".WTTWWWTTW.",".WTTWWWTTW.",".WWWOOOWWW.",".GGGGGGGGG."]},{"id":"watertower","name":"街角水塔","cat":"water","cost":80,"popCap":0,"jobs":0,"income":0,"happy":0,"use":{},"gen":{"water":7},"unlockPop":8,"desc":"先有水，才有人。供水 +7，够养一小片街区。","rows":["...........","....SSS....","...SSSSS...","...wwwww...","...wwwww...","...wwwww...","...SSSSS...","....SSS....","...SS.SS...","..SS...SS..",".GGGGGGGGG."]},{"id":"workshop","name":"手工工坊","cat":"ind","cost":150,"popCap":0,"jobs":6,"income":22,"happy":-1,"use":{"power":3,"water":1,"trash":3},"gen":{},"unlockPop":12,"desc":"六个岗位，一点烟。工业的味道从这里开始。","rows":["...........","...........","........d..",".......d...","aaaaaaaaaa.",".aaaaaaaa..","..WWWWWWW..","..WTTWTTW..","..WWWWWWW..","..WWOOOWW..",".GGGGGGGGG."]},{"id":"apartment","name":"豆荚公寓","cat":"res","cost":180,"popCap":12,"jobs":0,"income":0,"happy":0,"use":{"power":3,"water":3,"trash":3},"gen":{},"unlockPop":16,"desc":"三层小楼，十二户人家。占地省，胃口不小。","rows":[".............","...aaaaaaa...","..SSSSSSSSS..","...WWWWWWW...","...WKTWTKW...","..SSSSSSSSS..","...WWWWWWW...","...WKTWTKW...","..SSSSSSSSS..","...WWWWWWW...","...WKTOTKW...","..aaaaaaaaa..",".GGGGGGGGGGG."]},{"id":"windmill","name":"风力豆机","cat":"power","cost":140,"popCap":0,"jobs":0,"income":0,"happy":1,"use":{},"gen":{"power":8},"unlockPop":14,"desc":"干净的电，不排一点垃圾。发电 +8，居民还挺喜欢。","rows":["....SSS....","....SSS....","....SSS....","....SYS....","...SSaSS...","..SS.a.SS..",".SS..a..SS.","....aaa....","....aaa....","...aaaaa...","..GGGGGGG.."]},{"id":"market","name":"豆香市集","cat":"com","cost":220,"popCap":0,"jobs":6,"income":34,"happy":2,"use":{"power":3,"water":2,"trash":3},"gen":{},"unlockPop":28,"desc":"六个岗位，人来人往。没人气就赚不到钱。","rows":[".............",".............",".............",".R.R.R.R.R.R.",".RRRRRRRRRRR.",".RWYWYWYWYWR.",".W.W.W.W.W.W.",".W.W.W.W.W.W.",".OYTnYTYnTYO.",".OYnTnYnTnYO.",".WWWWWWWWWWW.",".GnGnGnGnGnG.",".GGGGGGGGGGG."]},{"id":"lighthouse","name":"临江灯塔","cat":"civ","cost":260,"popCap":0,"jobs":0,"income":0,"happy":3,"use":{"power":1},"gen":{},"unlockPop":34,"desc":"给晚归的人留一束光。城市有了它，就算有了地标。","rows":["...........","....YYY....",".YY.YYY.YY.","....SSS....","....BBB....","....WWW....","...BBBBB...","...WWWWW...","...BBBBB...","..aaaaaaa..",".GGGGGGGGG."]},{"id":"school","name":"巷口学堂","cat":"civ","cost":300,"popCap":0,"jobs":0,"income":0,"happy":6,"use":{"power":3,"water":2},"gen":{},"unlockPop":40,"desc":"读书声是城市最好的底噪。幸福 +6，水电照付。","rows":[".............",".....SSS.....","....aaaaa....","....aKYKa....","....aYYYa....","....aKYKa....","....aaaaa....",".BBBBBBBBBBB.",".BWKWKWKWKWB.",".BWWWWWWWWWB.",".BWKWKWKWKWB.",".BBBOOOOOBBB.",".GGGGGGGGGGG."]},{"id":"waterworks","name":"自来水厂","cat":"water","cost":200,"popCap":0,"jobs":0,"income":0,"happy":0,"use":{"power":2},"gen":{"water":20},"unlockPop":30,"desc":"供水 +20，自己也要吃 2 度电。城市越大越离不开它。","rows":[".............",".............",".....aaa.....","....wwwww....","...wwwwwww...","...wwwwwww...","....wwwww....","....aaaaa....",".aaaaaaaaaaa.",".aaaaaaaaaaa.",".aWKaaaaaKWa.",".aaaaaOaaaaa.",".GGGGGGGGGGG."]},{"id":"recycling","name":"回收中心","cat":"trash","cost":170,"popCap":0,"jobs":2,"income":6,"happy":-1,"use":{"power":1},"gen":{"trash":14},"unlockPop":12,"desc":"处理能力 +14。垃圾不清运，幸福掉得比谁都快。","rows":["...........","....nnn....","...nn.nn...","...n...n...","..n.....n..",".nnn...nnn.",".nnnnnnnnn.",".GGGGGGGGG.",".GBBBBBBBG.",".GBBOOOBBG.",".GGGGGGGGG."]},{"id":"factory","name":"豆荚工坊","cat":"ind","cost":300,"popCap":0,"jobs":14,"income":46,"happy":-5,"use":{"power":6,"water":3,"trash":6},"gen":{},"unlockPop":54,"desc":"十四个岗位，收益最高，也是全城最脏的地方。","rows":["..SSS...SSS..","...d.....d...","..ddd...ddd..","..ddd...ddd..",".aaaaaaaaaaa.",".BBBBBBBBBBB.",".BWKWKWKWKWB.",".BWWWWWWWWWB.",".BWKWKWKWKWB.",".BWWWWWWWWWB.",".BBBOOOOOBBB.",".aaaaaaaaaaa.",".GGGGGGGGGGG."]},{"id":"coalplant","name":"燃煤电厂","cat":"power","cost":320,"popCap":0,"jobs":3,"income":0,"happy":-7,"use":{},"gen":{"power":26},"unlockPop":40,"desc":"发电 +26，一口气压住全城用电。代价是幸福 −7。","rows":[".............",".....SSS.....","....SSSSS....","....aaaaa....",".....aaa.....",".....aaa.....","....aaaaa....","...aaaaaaa...","..aaaaaaaaa..",".aaaaaaaaaaa.",".ddddddddddd.",".dKdKdKdKdKd.",".GGGGGGGGGGG."]},{"id":"tower","name":"云端大厦","cat":"res","cost":600,"popCap":26,"jobs":0,"income":0,"happy":-3,"use":{"power":6,"water":5,"trash":5},"gen":{},"unlockPop":76,"desc":"二十六人挤一栋楼。抬头看不见顶，低头看不见树。","rows":[".......Y.......","......SYS......",".....TTTTT.....",".....TKTKT.....",".....TSTST.....","....TKTKTKT....","....TSTSTST....","...TKTKTKTKT...","...TSTSTSTST...","..TKTKTKTKTKT..","..TSTSTSTSTST..",".aaaaaaaaaaaaa.",".aWKaaaOaaaKWa.",".aaaaaaaaaaaaa.",".GGGGGGGGGGGGG."]}]};
var GRID_N = 6;
var SAVE_KEY = 'pcity_v2';
var START_COINS = 240;
var OFFLINE_CAP = 4 * 3600 * 1000;

// 市政基础管线：开局自带，撑得住前六栋楼，让新手先学会「盖房子」再学「铺管网」
var BASE_SUPPLY = { power: 6, water: 6, trash: 14 };
var JOBLESS_ALLOW = 8;     // 没有岗位也愿意住下的人数
var TRASH_RATE = 0.15;     // 积压速度系数
var TRASH_CAP = 200;

// 收入三段：保底 + 人口税 + 产业收益。三者的分工
//   BASE_INCOME   市政保底，保证「任何局面都有进账」，杜绝 0 收入死局
//   TAX_PER_HEAD  人口即税基 —— 住宅本身不产金币，住进来的人才交税
//   b.income      商业/工业/环卫的直接收益，商业还要再乘人气系数
var BASE_INCOME = 3;
var TAX_PER_HEAD = 1.5;
var COM_SUPPORT_HEAD = 8;  // 每家铺子需要 8 位居民才能撑到满收益

var PAL = {};
DATA.palette.forEach(function(p){ PAL[p.k] = p; });
var CATS = {};
DATA.cats.forEach(function(c){ CATS[c.id] = c; });

var LIST = DATA.buildings;
var BY_ID = {};
LIST.forEach(function(b){
  var n = b.rows.length, total = 0, seen = {}, colors = [];
  for (var y = 0; y < n; y++) {
    var row = b.rows[y];
    for (var x = 0; x < n; x++) {
      var ch = row.charAt(x);
      if (ch === '.') continue;
      total++;
      if (!seen[ch]) { seen[ch] = 1; colors.push(ch); }
    }
  }
  b.size = n; b.total = total; b.colors = colors;
  BY_ID[b.id] = b;
});
function u(b, k){ return (b.use && b.use[k]) || 0; }
function g(b, k){ return (b.gen && b.gen[k]) || 0; }

// ---------------------------------------------------------------- 工具
function $(id){ return document.getElementById(id); }
function clamp(v, a, b){ return v < a ? a : (v > b ? b : v); }
function fmt(n){
  n = Math.floor(n);
  return n >= 10000 ? (n / 10000).toFixed(1) + '万' : String(n);
}
function hex2rgb(h){
  return [parseInt(h.substr(1,2),16), parseInt(h.substr(3,2),16), parseInt(h.substr(5,2),16)];
}
function shade(h, k){
  var c = hex2rgb(h);
  return 'rgb(' + clamp(Math.round(c[0]*k),0,255) + ',' +
                  clamp(Math.round(c[1]*k),0,255) + ',' +
                  clamp(Math.round(c[2]*k),0,255) + ')';
}
function hexA(h, a){
  var c = hex2rgb(h);
  return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
}
function rrect(g2, x, y, w, h, r){
  g2.beginPath();
  g2.moveTo(x + r, y);
  g2.arcTo(x + w, y, x + w, y + h, r);
  g2.arcTo(x + w, y + h, x, y + h, r);
  g2.arcTo(x, y + h, x, y, r);
  g2.arcTo(x, y, x + w, y, r);
  g2.closePath();
}
function fitCanvas(cvs){
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  var w = cvs.clientWidth, h = cvs.clientHeight;
  if (w <= 0 || h <= 0) return null;
  if (cvs.width !== Math.round(w*dpr) || cvs.height !== Math.round(h*dpr)) {
    cvs.width = Math.round(w*dpr);
    cvs.height = Math.round(h*dpr);
  }
  var g2 = cvs.getContext('2d');
  g2.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { g: g2, w: w, h: h };
}

// ---------------------------------------------------------------- 状态
var S = {
  coins: START_COINS,
  grid: [],
  mastered: {},
  pop: 0,
  popPeak: 0,      // 历史最高人口：解锁看它，不回落
  backlog: 0,
  last: Date.now(),
  built: 0
};
(function initGrid(){
  for (var i = 0; i < GRID_N * GRID_N; i++) S.grid.push(null);
})();

// 解锁门槛看「历史最高人口」而不是当前人口。
// 否则会出现正反馈死循环：缺水 → 人口流失 → 水塔解锁不了 → 更缺水 → 人口归零。
// 图纸一旦解锁就永远解锁，玩家不会看到「昨天还能盖的楼今天盖不了」。
function peakPop(){
  if (S.pop > S.popPeak) S.popPeak = S.pop;
  return S.popPeak;
}

function load(){
  try {
    var raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return 0;
    var d = JSON.parse(raw);
    if (d && d.grid && d.grid.length === GRID_N * GRID_N) {
      S.grid = d.grid.map(function(v){ return BY_ID[v] ? v : null; });
      S.coins = typeof d.coins === 'number' ? d.coins : START_COINS;
      S.mastered = d.mastered || {};
      S.pop = typeof d.pop === 'number' ? d.pop : 0;
      S.popPeak = typeof d.popPeak === 'number' ? Math.max(d.popPeak, S.pop) : S.pop;
      S.backlog = typeof d.backlog === 'number' ? d.backlog : 0;
      S.built = d.built || 0;
      S.last = d.last || Date.now();
      return Date.now() - S.last;
    }
  } catch (e) {}
  return 0;
}
var saveTimer = 0;
function save(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function(){
    try {
      S.last = Date.now();
      localStorage.setItem(SAVE_KEY, JSON.stringify(S));
    } catch (e) {}
  }, 400);
}

// 重开一局：清档 + 就地回到开局状态。
// 刻意不走刷新页面 —— reload 会把星空、微尘、进度条全部重新抖一遍，
// 观感上像「崩了一次」而不是「重开一局」。
function resetGame(){
  // 必须先掐掉挂起的防抖写入：上一次操作排的 save() 还压在队列里，
  // 400ms 后它会把刚清掉的旧存档原样写回来。
  clearTimeout(saveTimer);
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}

  S.coins = START_COINS;
  S.grid.length = 0;
  for (var i = 0; i < GRID_N * GRID_N; i++) S.grid.push(null);
  S.mastered = {};
  S.pop = 0;
  S.popPeak = 0;
  S.backlog = 0;
  S.built = 0;
  S.last = Date.now();

  // 会话态一并归零：选中地块、落城动画、拼豆台、告警锁。
  // 告警锁不清的话，重开后缺口已经消失，玩家却再也收不到下一次的提示。
  selIdx = -1;
  spawn = null;
  alerts.power = alerts.water = alerts.trash = false;
  pendingCell = -1;
  BP_SEL = null;
  B = null;
  curColor = null;
  eraserOn = false;
  painting = false;
  ironing = 0;
  $('btnEraser').classList.remove('on');

  save();
  CUR = stats();
  updateHud(true);
}

// ---------------------------------------------------------------- 数值
function stats(){
  var popCap = 0, jobs = 0, comIncome = 0, bizIncome = 0, happySum = 0, count = 0;
  var useP = 0, useW = 0, useT = 0, genP = 0, genW = 0, genT = 0;
  var counts = { res:0, com:0, ind:0, power:0, water:0, trash:0, civ:0 };
  for (var i = 0; i < S.grid.length; i++) {
    var b = BY_ID[S.grid[i]];
    if (!b) continue;
    popCap += b.popCap; jobs += b.jobs; happySum += b.happy; count++;
    // 商业单独计：它要再乘一次人气系数，工业/环卫不受影响
    if (b.cat === 'com') comIncome += b.income; else bizIncome += b.income;
    useP += u(b,'power'); useW += u(b,'water'); useT += u(b,'trash');
    genP += g(b,'power'); genW += g(b,'water'); genT += g(b,'trash');
    counts[b.cat] = (counts[b.cat] || 0) + 1;
  }
  var supP = BASE_SUPPLY.power + genP;
  var supW = BASE_SUPPLY.water + genW;
  var supT = BASE_SUPPLY.trash + genT;
  var powRatio = useP > 0 ? clamp(supP / useP, 0, 1) : 1;
  var watRatio = useW > 0 ? clamp(supW / useW, 0, 1) : 1;

  var happy = 50 + happySum
    - (1 - powRatio) * 30
    - (1 - watRatio) * 25
    - Math.min(25, S.backlog * 0.5);
  happy = clamp(Math.round(happy), 0, 100);

  // 商业要靠人气：没居民光顾，铺子赚不到钱
  var comSupport = counts.com > 0
    ? clamp(S.pop / (counts.com * COM_SUPPORT_HEAD), 0.4, 1.3) : 1;
  // 人口即税基：按实际住进来的人算，空置的房子不产生税收
  var taxIncome = Math.min(S.pop, popCap) * TAX_PER_HEAD;
  // 水电取「最紧的那一项」而不是连乘 —— 连乘会让缺口叠加成 0.36 倍，
  // 城市一旦双缺就直接躺平，玩家感受不到「补救有用」。
  var supplyRatio = Math.min(powRatio, watRatio);
  var gross = BASE_INCOME + taxIncome + bizIncome + comIncome * comSupport;
  var rate = gross * supplyRatio * (0.6 + happy / 100 * 0.8);

  return {
    pop: S.pop, popCap: popCap, jobs: jobs, count: count,
    income: gross, taxIncome: taxIncome, comIncome: comIncome * comSupport,
    bizIncome: bizIncome, baseIncome: BASE_INCOME, comSupport: comSupport,
    counts: counts,
    useP: useP, useW: useW, useT: useT,
    supP: supP, supW: supW, supT: supT,
    powRatio: powRatio, watRatio: watRatio, supplyRatio: supplyRatio,
    happy: happy, rate: rate
  };
}
var CUR = null;   // 每帧刷新一次的统计快照

function popTarget(st){
  return Math.min(st.popCap, st.jobs + JOBLESS_ALLOW);
}
function tickPop(dt, st){
  // 缺水：人不再搬进来，并缓慢流失。但保留四成峰值当地板 ——
  // 城市可以萧条，不能归零，否则税基和解锁会一起崩掉，再也爬不出来。
  //
  // 注意这里只看水、不看电。缺电只让你少赚钱、掉幸福，不会赶人走 ——
  // 否则会形成正反馈死循环：缺电 → 人口停滞 → 电厂解锁不了 → 永远缺电。
  // 缺水、或民怨沸腾：人不再搬进来，并缓慢流失。
  // 幸福 < 30 也赶人走 —— 否则「全城工厂、幸福掉到个位数」这种功利玩法
  // 在经济上完全成立，公园学堂就成了摆设。
  var deficit = 1 - st.watRatio;
  if (st.happy < 30) deficit = Math.max(deficit, (30 - st.happy) / 30);
  if (deficit > 0.001) {
    var floor = Math.min(S.pop, peakPop() * 0.4);
    S.pop = Math.max(floor, S.pop - deficit * dt / 1000 * 0.15);
    return;
  }
  var target = popTarget(st);
  var k = 1 - Math.pow(0.5, dt / 2500);
  S.pop += (target - S.pop) * k;
  if (Math.abs(target - S.pop) < 0.05) S.pop = target;
  peakPop();
}
function tickTrash(dt, st){
  var net = st.useT - st.supT;
  S.backlog = clamp(S.backlog + net * dt / 1000 * TRASH_RATE, 0, TRASH_CAP);
}
function demands(st){
  var room = st.popCap - S.pop;
  var pull = st.jobs - S.pop * 0.8;   // 岗位拉力：>0 说明还有活等人来干
  var R;
  if (st.count === 0) {
    R = 30;                                   // 空城：先给个「缺住宅」的引导
  } else if (room <= 0.5) {
    // 住房住满了：房子就是人口增长的瓶颈，需求条必须跟 diagnose 的
    // 「住房住满了…多盖点住宅」同调。
    //
    // 这里原来给 -60（过剩），是反的 —— 房子明明住得满满当当，却显示
    // 红色「严重过剩」，玩家会理解成「住宅别建了」，结果卡在原地涨不动。
    // 「过剩」只在真有空房时才成立（见下一分支）。
    //
    // 岗位还富余 → 强烈需求，强度随岗位空缺浮动；
    // 岗位也满了 → 瓶颈在岗位，住宅不急着建，但也绝不能说「过剩」
    // （一间空房都没有，说过剩是睁眼说瞎话），给个中性偏正的值。
    R = pull > 0 ? clamp(Math.round(pull * 8) + 40, 60, 100) : 10;
  } else {
    // 有空房：岗位富余 → 想要更多住宅；岗位不足 → 空房没人住，才是真的过剩
    R = clamp(Math.round(pull * 8), -100, 100);
  }
  var C = clamp(Math.round((S.pop / 7 - st.counts.com) * 34), -100, 100);
  var I = clamp(Math.round((S.pop / 11 - st.counts.ind) * 34), -100, 100);
  return { R: R, C: C, I: I };
}
// 供需出问题时提醒一次，恢复后允许再提醒
var alerts = { power: false, water: false, trash: false };
function checkAlerts(st){
  if (st.count === 0) return;
  if (st.powRatio < 0.999 && !alerts.power) {
    alerts.power = true;
    sfx('warn');
    toast('电力不足，全城收益打折 —— 点「市政」看缺口');
  } else if (st.powRatio >= 0.999) alerts.power = false;

  if (st.watRatio < 0.999 && !alerts.water) {
    alerts.water = true;
    sfx('warn');
    toast('供水不足，人口停止迁入 —— 该建水塔了');
  } else if (st.watRatio >= 0.999) alerts.water = false;

  if (st.useT > st.supT && !alerts.trash) {
    alerts.trash = true;
    sfx('warn');
    toast('垃圾清运跟不上，正在积压 —— 幸福度会一路掉');
  } else if (st.useT <= st.supT) alerts.trash = false;
}
function titleOf(pop){
  var t = DATA.titles[0];
  for (var i = 0; i < DATA.titles.length; i++) {
    if (pop >= DATA.titles[i].pop) t = DATA.titles[i];
  }
  return t.name;
}
function moodOf(h){
  return h >= 80 ? '振奋' : (h >= 60 ? '舒心' : (h >= 40 ? '平静' : '低落'));
}

// ---------------------------------------------------------------- 拼豆绘制
function drawBead(g2, cx, cy, r, hex, iron){
  iron = iron || 0;
  var rr = r * (1 + iron * 0.12);
  var hole = r * 0.30 * (1 - iron * 0.92);
  var grad = g2.createLinearGradient(cx, cy - rr, cx, cy + rr);
  grad.addColorStop(0, shade(hex, 1.16 - iron * 0.10));
  grad.addColorStop(0.55, hex);
  grad.addColorStop(1, shade(hex, 0.80 + iron * 0.10));
  g2.beginPath();
  g2.arc(cx, cy, rr, 0, Math.PI * 2);
  g2.fillStyle = grad;
  g2.fill();
  g2.lineWidth = Math.max(0.8, r * 0.11);
  g2.strokeStyle = shade(hex, 0.60 + iron * 0.18);
  g2.stroke();
  if (hole > 0.5) {
    g2.beginPath();
    g2.arc(cx, cy, hole, 0, Math.PI * 2);
    g2.fillStyle = '#3E3630';
    g2.fill();
    g2.beginPath();
    g2.arc(cx, cy, hole, Math.PI * 0.06, Math.PI * 0.94);
    g2.lineWidth = Math.max(0.6, r * 0.09);
    g2.strokeStyle = 'rgba(255,255,255,0.22)';
    g2.stroke();
  }
  g2.beginPath();
  g2.arc(cx - rr * 0.30, cy - rr * 0.34, rr * 0.17, 0, Math.PI * 2);
  g2.fillStyle = 'rgba(255,255,255,' + (0.40 * (1 - iron * 0.65)) + ')';
  g2.fill();
}

var thumbCache = {};
function thumb(b, size){
  size = Math.round(size);
  var key = b.id + '@' + size;
  if (thumbCache[key]) return thumbCache[key];
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  var c = document.createElement('canvas');
  c.width = size * dpr; c.height = size * dpr;
  c.style.width = size + 'px'; c.style.height = size + 'px';
  var g2 = c.getContext('2d');
  g2.setTransform(dpr, 0, 0, dpr, 0, 0);
  var cell = size / b.size;
  for (var y = 0; y < b.size; y++) {
    for (var x = 0; x < b.size; x++) {
      var ch = b.rows[y].charAt(x);
      if (ch === '.') continue;
      drawBead(g2, x * cell + cell / 2, y * cell + cell / 2, cell * 0.47, PAL[ch].hex, 0.62);
    }
  }
  thumbCache[key] = c;
  return c;
}

// ---------------------------------------------------------------- 昼夜循环
// 一整天压成 DAY_MS（4 分钟）：挂机 1 分钟 ≈ 游戏 6 小时，肉眼能看见天色推移。
// 相位取绝对时间戳的模 —— 关掉再打开天色接着走，不需要额外存档字段。
// dayPhase: 0=午夜 · 0.25=日出 · 0.5=正午 · 0.75=日落
var DAY_MS = 240000;

// 天色关键帧：a/b/c 对应 CSS 渐变的三档（天顶 / 中天 / 地平）
// 关键帧之间的过渡是 smoothstep（见 skyAt），所以色温/亮度变化是连续的。
// 白天故意不拉到"亮天蓝"——HUD 文字会飘，6×6 沙盘台基也会被冲淡。
// 整张画面"夜空-晨曦-正午-黄昏"色温变化明显，但亮度始终让位给"沙盘"主体。
var SKY_KEYS = [
  { t: 0.00, a: '#0E1526', b: '#1A2440', c: '#2C3050' },  // 深夜
  { t: 0.18, a: '#1C1E38', b: '#38294C', c: '#5A3A4E' },  // 破晓前
  { t: 0.26, a: '#3C4A70', b: '#7E5A6E', c: '#C87A5E' },  // 日出
  { t: 0.36, a: '#1E3860', b: '#3A5A7E', c: '#7A8AA8' },  // 上午
  { t: 0.50, a: '#162C50', b: '#2E4A70', c: '#5E7C9E' },  // 正午
  { t: 0.66, a: '#1C3A60', b: '#4A6684', c: '#9A8060' },  // 午后
  { t: 0.76, a: '#3C3454', b: '#84505A', c: '#CE7A50' },  // 日落
  { t: 0.86, a: '#1E2440', b: '#33304E', c: '#4A3850' },  // 暮色
  { t: 1.00, a: '#0E1526', b: '#1A2440', c: '#2C3050' }   // 回到深夜
];

// 相位定格：截图 / 做宣传图时由外部设 window.dayPhaseFixed = 0–1，
// 用来把城市定格在指定的钟点。生产路径走 Date.now()。
// 注意：game.js 整体包在 IIFE 里，所以必须读 window 上的字段，不能在内部 var。
function dayPhase(){
  var f = window.dayPhaseFixed;
  return (typeof f === 'number' && f >= 0) ? f : (Date.now() % DAY_MS) / DAY_MS;
}

// 亮度 0=深夜 1=正午，日出/日落正好是 0.5
function dayLight(p){
  return clamp(Math.sin((p - 0.25) * Math.PI * 2) * 0.5 + 0.5, 0, 1);
}
function phaseName(p){
  if (p < 0.20) return '深夜';
  if (p < 0.28) return '破晓';
  if (p < 0.34) return '清晨';
  if (p < 0.46) return '上午';
  if (p < 0.56) return '正午';
  if (p < 0.68) return '午后';
  if (p < 0.78) return '黄昏';
  if (p < 0.88) return '入夜';
  return '夜晚';
}
function mixHex(h1, h2, k){
  var c1 = hex2rgb(h1), c2 = hex2rgb(h2);
  return 'rgb(' + Math.round(c1[0] + (c2[0] - c1[0]) * k) + ','
                + Math.round(c1[1] + (c2[1] - c1[1]) * k) + ','
                + Math.round(c1[2] + (c2[2] - c1[2]) * k) + ')';
}
function skyAt(p){
  for (var i = 0; i < SKY_KEYS.length - 1; i++) {
    var A = SKY_KEYS[i], B = SKY_KEYS[i + 1];
    if (p >= A.t && p <= B.t) {
      var k = (p - A.t) / (B.t - A.t);
      k = k * k * (3 - 2 * k);            // smoothstep，关键帧处不出折角
      return [mixHex(A.a, B.a, k), mixHex(A.b, B.b, k), mixHex(A.c, B.c, k)];
    }
  }
  var z = SKY_KEYS[0];
  return [z.a, z.b, z.c];
}

// 天体拱形轨迹：u=0 东边地平线，u=1 西边地平线
function skyArc(u, W, H){
  return { x: W * (0.10 + u * 0.80), y: H * (0.50 - Math.sin(u * Math.PI) * 0.40) };
}
function wrap01(v){ v = v % 1; return v < 0 ? v + 1 : v; }

// 天色写进 CSS 变量，让 HUD 上下与画布外的天空跟着一起变
var _skyTick = 0;
function syncSkyCss(p){
  if (++_skyTick % 5) return;             // 天色变化极慢，5 帧一更足够平滑
  // 无头 stub（smoke_test / simulate）没有 documentElement，静默跳过：
  // 天色只影响观感，缺了它游戏逻辑照常跑
  var root = document.documentElement;
  if (!root || !root.style) return;
  var cs = skyAt(p);
  var rs = root.style;
  rs.setProperty('--sky-1', cs[0]);
  rs.setProperty('--sky-2', cs[1]);
  rs.setProperty('--sky-3', cs[2]);
  rs.setProperty('--star-op', (0.55 * (1 - dayLight(p))).toFixed(3));
}

// ---------------------------------------------------------------- 城市渲染
var cvsCity = $('cityCanvas');
var cityGeo = { cell: 0, ox: 0, oy: 0 };
var selIdx = -1;
var spawn = null;
var cityT = 0;

function drawCity(){
  var f = fitCanvas(cvsCity);
  if (!f) return;
  var g2 = f.g, W = f.w, H = f.h;
  g2.clearRect(0, 0, W, H);

  // ---- 纵深：远山 + 日月 + 极光 + 星空（全在画布里画，填满原本 60% 的空黑）
  //      天空底色交给 CSS 的 .sky（syncSkyCss 每 5 帧写 CSS 变量），画布透明透出来
  var t = cityT / 1000;
  var p = dayPhase();
  var light = dayLight(p);
  var night = 1 - light;                  // 夜色浓度：星空 / 极光按它淡入淡出
  syncSkyCss(p);

  // 1) 远山（昼夜两副颜色之间插值）
  drawHorizon(g2, W, H, t, light);

  // 2) 极光：只在夜里出现
  drawAurora(g2, W, H, t, night);

  // 3) 星空：白天退场
  drawCityStars(g2, W, H, t, night);

  // 4) 太阳 / 月亮：错开半天，各走一条拱形轨迹
  drawCelestial(g2, W, H, p, t);

  // ---- 城市网格：和原来一样算 cell/原点
  var pad = 8;
  var cell = Math.floor(Math.min((W - pad * 2) / GRID_N, (H - pad * 2) / GRID_N));
  var bw = cell * GRID_N;
  var ox = Math.round((W - bw) / 2);
  var oy = Math.round((H - bw) / 2);
  cityGeo = { cell: cell, ox: ox, oy: oy, bw: bw };

  // 5) 沙盘台基：把网格当成一张小桌，光从桌面下往上泛
  drawCityBase(g2, ox, oy, bw, t);

  // 6) 网格背板（弱化描边，融入沙盘）
  g2.save();
  rrect(g2, ox - 6, oy - 6, bw + 12, bw + 12, 16);
  g2.fillStyle = 'rgba(12,17,26,0.42)';
  g2.fill();
  g2.strokeStyle = 'rgba(232,182,76,0.10)';
  g2.lineWidth = 1;
  g2.stroke();
  g2.restore();

  // 7) 格子（带轻微景深：上排格子比下排更冷暗，让视线沉到下方建筑）
  for (var i = 0; i < GRID_N * GRID_N; i++) {
    var cx = ox + (i % GRID_N) * cell;
    var cy = oy + Math.floor(i / GRID_N) * cell;
    drawPlot(g2, i, cx, cy, cell);
  }
}

// 远山：两层山脊，颜色在「夜（冷暗）」与「昼（亮灰蓝）」之间插值
function drawHorizon(g2, W, H, t, light){
  var baseY = H * 0.74;
  var far = mixHex('#141C2A', '#7E94AC', light);   // 远山：夜里近黑，白天雾蓝
  var near = mixHex('#1E283A', '#5C708A', light);  // 近山
  var step = Math.max(20, W / 22);
  g2.save();
  // 远山：更深更冷，靠后
  g2.fillStyle = far;
  g2.beginPath();
  g2.moveTo(0, H);
  g2.lineTo(0, baseY);
  for (var x = 0; x <= W; x += step) {
    var h1 = Math.sin(x * 0.013 + 1.2) * 18 + Math.sin(x * 0.04 + 2.7) * 6;
    g2.lineTo(x, baseY - 8 - h1);
  }
  g2.lineTo(W, H);
  g2.closePath();
  g2.fill();

  // 近山：稍亮、稍高、稍暖
  g2.fillStyle = near;
  g2.beginPath();
  g2.moveTo(0, H);
  g2.lineTo(0, baseY + 14);
  for (var x2 = 0; x2 <= W; x2 += step) {
    var h2 = Math.sin(x2 * 0.017 + 0.4) * 26 + Math.sin(x2 * 0.05 + 1.3) * 8;
    g2.lineTo(x2, baseY + 14 - 10 - h2);
  }
  g2.lineTo(W, H);
  g2.closePath();
  g2.fill();
  g2.restore();
}

// 日与月：错开半天，各沿 skyArc 走一条拱形；u>1 表示已落地平线下，不画
function drawCelestial(g2, W, H, p, t){
  var r = Math.min(W, H) * 0.082;
  // 太阳：dayPhase 0.25(东) → 0.75(西)
  var uS = wrap01(p - 0.25) / 0.5;
  if (uS <= 1.08) {
    var sp = skyArc(clamp(uS, 0, 1), W, H);
    drawSun(g2, sp.x, sp.y, r * 0.86, clamp((1.08 - uS) / 0.14, 0, 1));
  }
  // 月亮：dayPhase 0.75(东) → 0.25(西)，正好错开半天
  var uM = wrap01(p - 0.75) / 0.5;
  if (uM <= 1.08) {
    var mp = skyArc(clamp(uM, 0, 1), W, H);
    drawMoon(g2, mp.x, mp.y, r, clamp((1.08 - uM) / 0.14, 0, 1));
  }
}

// 月：金白软月，带两处月坑
function drawMoon(g2, cx, cy, r, a){
  if (a <= 0.01) return;
  g2.save();
  g2.globalAlpha = a;
  // 外晕（光圈）
  var halo = g2.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 3.4);
  halo.addColorStop(0, 'rgba(245,212,131,0.18)');
  halo.addColorStop(0.4, 'rgba(245,212,131,0.06)');
  halo.addColorStop(1, 'rgba(245,212,131,0)');
  g2.fillStyle = halo;
  g2.beginPath(); g2.arc(cx, cy, r * 3.4, 0, Math.PI * 2); g2.fill();
  // 月体
  var body = g2.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.2, cx, cy, r);
  body.addColorStop(0, '#FFF6E2');
  body.addColorStop(0.65, '#F0DCB0');
  body.addColorStop(1, 'rgba(220,180,110,0.85)');
  g2.fillStyle = body;
  g2.beginPath(); g2.arc(cx, cy, r, 0, Math.PI * 2); g2.fill();
  // 月面阴影坑
  g2.fillStyle = 'rgba(120,90,40,0.18)';
  g2.beginPath(); g2.arc(cx + r * 0.25, cy + r * 0.12, r * 0.18, 0, Math.PI * 2); g2.fill();
  g2.beginPath(); g2.arc(cx - r * 0.18, cy + r * 0.30, r * 0.12, 0, Math.PI * 2); g2.fill();
  g2.restore();
}

// 日：暖金圆盘 + 大范围柔光，不画光芒射线（保持克制）
function drawSun(g2, cx, cy, r, a){
  if (a <= 0.01) return;
  g2.save();
  g2.globalAlpha = a;
  var halo = g2.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 3.8);
  halo.addColorStop(0, 'rgba(255,214,140,0.26)');
  halo.addColorStop(0.32, 'rgba(255,190,110,0.09)');
  halo.addColorStop(1, 'rgba(255,180,90,0)');
  g2.fillStyle = halo;
  g2.beginPath(); g2.arc(cx, cy, r * 3.8, 0, Math.PI * 2); g2.fill();
  var body = g2.createRadialGradient(cx - r * 0.25, cy - r * 0.25, r * 0.2, cx, cy, r);
  body.addColorStop(0, '#FFFDF2');
  body.addColorStop(0.55, '#FFE79A');
  body.addColorStop(1, '#FFC766');
  g2.fillStyle = body;
  g2.beginPath(); g2.arc(cx, cy, r, 0, Math.PI * 2); g2.fill();
  g2.restore();
}

// 极光：上 1/3 三道流动光带，只在夜里出现（night 从 1 到 0 淡出）
function drawAurora(g2, W, H, t, night){
  if (night <= 0.02) return;
  g2.save();
  g2.globalCompositeOperation = 'screen';
  g2.globalAlpha = night;
  var bands = [
    { y: 0.10, a: 0.18, hue: '120,220,180' },
    { y: 0.16, a: 0.12, hue: '140,200,220' },
    { y: 0.22, a: 0.08, hue: '180,160,210' }
  ];
  for (var i = 0; i < bands.length; i++) {
    var b = bands[i];
    var by = H * b.y;
    var grad = g2.createLinearGradient(0, by, 0, by + H * 0.18);
    grad.addColorStop(0, 'rgba(' + b.hue + ',0)');
    grad.addColorStop(0.5, 'rgba(' + b.hue + ',' + b.a + ')');
    grad.addColorStop(1, 'rgba(' + b.hue + ',0)');
    g2.fillStyle = grad;
    g2.beginPath();
    g2.moveTo(0, by + H * 0.08);
    for (var x = 0; x <= W; x += 8) {
      var yy = by + Math.sin(x * 0.011 + t * 0.4 + i) * 8 + Math.sin(x * 0.024 + t * 0.7) * 4;
      g2.lineTo(x, yy);
    }
    g2.lineTo(W, by + H * 0.18);
    g2.lineTo(0, by + H * 0.18);
    g2.closePath();
    g2.fill();
  }
  g2.restore();
}

// 星空：50 颗随机亮度点 + 闪烁相位（用固定种子，画面静止也有微动）
var _cityStars = (function(){
  // 用 sin 算位置，避免每帧 random 抖动
  var arr = [];
  for (var i = 0; i < 56; i++) {
    arr.push({
      x: (Math.sin(i * 12.97) * 0.5 + 0.5),
      y: (Math.sin(i * 78.23 + 1.1) * 0.5 + 0.5) * 0.55,   // 只在上半空
      r: 0.6 + (Math.sin(i * 3.7) * 0.5 + 0.5) * 1.3,
      p: Math.sin(i * 2.31) * Math.PI,                     // 闪烁相位
      a: 0.25 + (Math.sin(i * 5.13) * 0.5 + 0.5) * 0.55
    });
  }
  return arr;
})();
function drawCityStars(g2, W, H, t, night){
  if (night <= 0.02) return;
  g2.save();
  g2.globalAlpha = night;
  for (var i = 0; i < _cityStars.length; i++) {
    var s = _cityStars[i];
    if (s.y > 0.55) continue;                             // 远山遮挡下半
    var a = s.a * (0.45 + 0.55 * Math.sin(t * 1.6 + s.p));
    if (a < 0.05) continue;
    g2.fillStyle = 'rgba(255,243,214,' + a + ')';
    g2.beginPath();
    g2.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
    g2.fill();
  }
  g2.restore();
}

// 沙盘台基：网格下方一道暖金光，暗示"灯光从桌下透上来"
function drawCityBase(g2, ox, oy, bw, t){
  var cx = ox + bw / 2;
  var top = oy - 12, bot = oy + bw + 26;
  // 上方一层冷反光（夜空打在台面上）
  var cool = g2.createLinearGradient(0, top, 0, oy);
  cool.addColorStop(0, 'rgba(80,120,180,0)');
  cool.addColorStop(1, 'rgba(80,120,180,0.10)');
  g2.fillStyle = cool;
  g2.fillRect(ox - 10, top, bw + 20, 12);
  // 下方一道大光晕（城市从台基底部散发暖光）
  var halo = g2.createRadialGradient(cx, bot, 0, cx, bot, bw * 0.78);
  halo.addColorStop(0, 'rgba(232,182,76,0.18)');
  halo.addColorStop(0.5, 'rgba(232,182,76,0.06)');
  halo.addColorStop(1, 'rgba(232,182,76,0)');
  g2.fillStyle = halo;
  g2.fillRect(0, bot - bw * 0.4, ox * 2 + bw, bw * 0.8);
}

function drawPlot(g2, i, x, y, cell){
  var id = S.grid[i];
  var isSel = (i === selIdx);
  var gsz = cell - 6;
  var gx = x + 3, gy = y + 3;

  g2.save();
  rrect(g2, gx, gy, gsz, gsz, Math.max(6, cell * 0.13));
  var gg = g2.createLinearGradient(gx, gy, gx, gy + gsz);
  if (id) { gg.addColorStop(0, '#3A4753'); gg.addColorStop(1, '#2B343F'); }
  else { gg.addColorStop(0, '#36443C'); gg.addColorStop(1, '#2A3730'); }
  g2.fillStyle = gg;
  g2.fill();
  g2.strokeStyle = isSel ? 'rgba(232,182,76,0.85)' : 'rgba(255,255,255,0.05)';
  g2.lineWidth = isSel ? 2 : 1;
  g2.stroke();
  g2.restore();

  if (!id) {
    // 空地：钉板暗示（3×3 浅色小珠点阵）+ 中央 1 颗更亮的「这里点一下」珠
    g2.save();
    var dotR = Math.max(0.9, cell * 0.045);
    var cols = 3, rows = 3;
    var step = gsz * 0.22;
    var ox0 = gx + gsz / 2 - step;
    var oy0 = gy + gsz / 2 - step;
    g2.fillStyle = 'rgba(255,255,255,0.18)';
    for (var ry = 0; ry < rows; ry++) {
      for (var rx = 0; rx < cols; rx++) {
        var dx = ox0 + rx * step;
        var dy = oy0 + ry * step;
        g2.beginPath();
        g2.arc(dx, dy, dotR, 0, Math.PI * 2);
        g2.fill();
      }
    }
    // 中央一颗略大的"按这里"——配合呼吸
    var pulse = 0.6 + 0.4 * Math.sin(cityT / 600);
    g2.fillStyle = 'rgba(245,212,131,' + (0.30 * pulse) + ')';
    g2.beginPath();
    g2.arc(gx + gsz / 2, gy + gsz / 2, dotR * 1.7, 0, Math.PI * 2);
    g2.fill();
    g2.fillStyle = 'rgba(245,212,131,' + (0.65 * pulse) + ')';
    g2.beginPath();
    g2.arc(gx + gsz / 2, gy + gsz / 2, dotR * 0.8, 0, Math.PI * 2);
    g2.fill();
    g2.restore();
    return;
  }

  var b = BY_ID[id];
  var size = Math.round(gsz * 0.90);

  var lift = 0, alpha = 1, scale = 1;
  if (spawn && spawn.i === i) {
    var p = clamp((Date.now() - spawn.t0) / 620, 0, 1);
    var e = 1 - Math.pow(1 - p, 3);
    lift = (1 - e) * cell * 0.55;
    scale = 0.62 + e * 0.38;
    alpha = clamp(p * 2.2, 0, 1);
  }

  // 停水停电：整城压暗
  if (CUR && (CUR.powRatio < 0.999 || CUR.watRatio < 0.999)) alpha *= 0.72;

  g2.save();
  g2.globalAlpha = 0.34 * alpha;
  g2.beginPath();
  g2.ellipse(gx + gsz / 2, gy + gsz * 0.86, gsz * 0.34 * scale, gsz * 0.11 * scale, 0, 0, Math.PI * 2);
  g2.fillStyle = '#0B0F16';
  g2.fill();
  g2.restore();

  g2.save();
  g2.globalAlpha = alpha;
  var img = thumb(b, size);
  var dw = size * scale, dh = size * scale;
  // 建筑位置固定：不做正弦浮动（落城动画的 lift 除外），避免整城"起起落落"
  var dy0 = gy + (gsz - dh) / 2 - gsz * 0.06 - lift;
  g2.drawImage(img, gx + (gsz - dw) / 2, dy0, dw, dh);
  g2.restore();

  // 光柱：建筑上方向上散开的暖光（剪影在画布上的"灯光"）
  // 亮度固定，不呼吸——只有落城瞬间的 lift/scale 会动
  g2.save();
  g2.globalCompositeOperation = 'screen';
  var col = (CATS[b.cat] && CATS[b.cat].color) || '#F5D483';
  var stemTop = dy0 - gsz * 0.18;
  var stemCx = gx + gsz / 2;
  var stemGrad = g2.createLinearGradient(stemCx, stemTop, stemCx, stemTop - gsz * 0.55);
  stemGrad.addColorStop(0, hexA(col, 0.19));
  stemGrad.addColorStop(0.4, hexA(col, 0.062));
  stemGrad.addColorStop(1, hexA(col, 0));
  g2.fillStyle = stemGrad;
  g2.beginPath();
  g2.moveTo(stemCx - gsz * 0.10, stemTop);
  g2.lineTo(stemCx + gsz * 0.10, stemTop);
  g2.lineTo(stemCx + gsz * 0.30, stemTop - gsz * 0.55);
  g2.lineTo(stemCx - gsz * 0.30, stemTop - gsz * 0.55);
  g2.closePath();
  g2.fill();
  g2.restore();

  if (spawn && spawn.i === i) {
    var q = clamp((Date.now() - spawn.t0) / 620, 0, 1);
    if (q >= 1) spawn = null;
    g2.save();
    g2.globalAlpha = (1 - q) * 0.6;
    g2.beginPath();
    g2.arc(gx + gsz / 2, gy + gsz / 2, gsz * (0.30 + q * 0.45), 0, Math.PI * 2);
    g2.strokeStyle = 'rgba(245,212,131,0.9)';
    g2.lineWidth = 2.5;
    g2.stroke();
    g2.restore();
  }

  // 类别角标
  var cat = CATS[b.cat];
  if (cat) {
    g2.save();
    g2.globalAlpha = 0.92;
    g2.beginPath();
    g2.arc(gx + 9, gy + 9, 6, 0, Math.PI * 2);
    g2.fillStyle = 'rgba(12,16,24,0.9)';
    g2.fill();
    g2.fillStyle = cat.color;
    g2.beginPath();
    g2.arc(gx + 9, gy + 9, 3.2, 0, Math.PI * 2);
    g2.fill();
    g2.restore();
  }

  // 收益气泡
  if (b.income > 0) {
    g2.save();
    var bx = gx + gsz - 6, by = gy + 8;
    g2.globalAlpha = 0.9;
    g2.beginPath();
    g2.arc(bx, by, 8, 0, Math.PI * 2);
    g2.fillStyle = 'rgba(12,16,24,0.85)';
    g2.fill();
    g2.strokeStyle = 'rgba(232,182,76,0.5)';
    g2.lineWidth = 1;
    g2.stroke();
    g2.fillStyle = '#F5D483';
    g2.font = '700 9px sans-serif';
    g2.textAlign = 'center';
    g2.textBaseline = 'middle';
    g2.fillText('+' + b.income, bx, by + 0.5);
    g2.restore();
  }

  // 停摆警示
  if (CUR && (CUR.powRatio < 0.999 || CUR.watRatio < 0.999)) {
    g2.save();
    g2.translate(gx + gsz / 2, gy + gsz - 11);
    g2.beginPath();
    g2.moveTo(0, -7); g2.lineTo(7, 5); g2.lineTo(-7, 5);
    g2.closePath();
    g2.fillStyle = '#D6544B';
    g2.fill();
    g2.fillStyle = '#FFF';
    g2.font = '800 9px sans-serif';
    g2.textAlign = 'center';
    g2.textBaseline = 'middle';
    g2.fillText('!', 0, 2);
    g2.restore();
  }
}

// ---------------------------------------------------------------- HUD
var hudTick = 0;
// 数值变了才写 DOM，并在变化时让整张卡片弹一下（CSS .bump）
function setChip(id, txt){
  var el = $(id);
  if (!el || el.textContent === txt) return;
  el.textContent = txt;
  var card = el.parentNode;
  if (!card || card.classList.contains('bump')) return;
  card.classList.add('bump');
  setTimeout(function(){ card.classList.remove('bump'); }, 430);
}
function setBar(el, v){
  var pct = clamp(Math.abs(v), 0, 100) / 2;
  el.style.width = pct + '%';
  if (v >= 0) { el.style.left = '50%'; el.style.right = 'auto'; el.className = 'fill pos'; }
  else { el.style.left = 'auto'; el.style.right = '50%'; el.className = 'fill neg'; }
}
function updateHud(force){
  var now = Date.now();
  if (!force && now - hudTick < 180) return;
  hudTick = now;
  var st = stats();
  setChip('vCoins', fmt(S.coins));
  setChip('vPop', fmt(st.pop));
  setChip('vHappy', String(st.happy));
  $('cityName').textContent = titleOf(st.pop);
  var ph = dayPhase();
  var phTxt = phaseName(ph);
  // 副标题只放右侧三个 chip 装不下的东西：时段 / 岗位 / 收入速率。
  // 「人口 X/Y」和心情词原本也挤在这一行，可右边 chip 已经有「人口」「幸福」，
  // 同一个数字在一行里出现两次是纯噪音；更实际的问题是手机上一行放不下会折行，
  // 把 HUD 顶高、挤掉主屏空间。
  // 容量（/Y）不在这里补：数据页写着「人口 X / Y · 空 N」，住满则由诊断栏和
  // 需求条负责喊话 —— 副标题不承担这些，它的活是「一眼扫过、不折行」。
  $('citySub').textContent = phTxt + ' · 岗位 ' + st.jobs + ' · ' + fmt(st.rate) + '/分';
  $('citySub').dataset.ph = phTxt;
  var d = demands(st);
  setBar($('dR'), d.R);
  setBar($('dC'), d.C);
  setBar($('dI'), d.I);
  if ($('utilView').classList.contains('show')) refreshUtil(st);
}

// ---------------------------------------------------------------- 浮层与提示
var toastTimer = 0;
function toast(msg){
  var el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ el.classList.remove('show'); }, 1900);
}
function modal(title, bodyHtml, btns){
  $('mdTitle').textContent = title;
  $('mdBody').innerHTML = bodyHtml;
  var box = $('mdBtns');
  box.innerHTML = '';
  btns.forEach(function(btn, k){
    var el = document.createElement('button');
    el.textContent = btn.label;
    // 最后一个按钮默认是高亮「主操作」；但「破坏性操作」要显式声明 kind:'danger'
    // ——它会拿到 ghost（红底红描边）样式，且**不**挤掉主按钮位置（取消仍是金黄高亮）。
    if (btn.kind === 'danger') el.className = 'ghost';
    else if (k === btns.length - 1) el.className = 'main';
    el.onclick = function(){
      hideModal();
      if (btn.fn) btn.fn();
    };
    box.appendChild(el);
  });
  $('modal').classList.add('show'); sfx('open');
}
function hideModal(){ $('modal').classList.remove('show'); sfx('shut'); }
function showOverlay(el){ el.classList.add('show'); sfx('open'); }
function hideOverlay(el){ el.classList.remove('show'); sfx('shut'); }

// ====================================================================== 音频
// 全部用 Web Audio 实时合成，不引入任何音频文件 —— 本工具的硬约束是零外部资源、
// 零 CDN，zip 要压在 2MB 内，而一段够听的 base64 循环就得上百 KB。
// 合成还白拿一个好处：音高能跟着游戏状态走（豆子越接近完成，音越高）。
//
// 三条全局约定：
//   1. AudioContext 只在首次用户手势后才创建，之前所有 sfx 静默返回，不排队不报错
//   2. 音频图为 SFX / BGM 两条支路汇到 master，静音只动 master，避免切出咔哒声
//   3. 包络端点一律用 0.0001 而不是 0 —— exponentialRamp 遇 0 会直接抛异常
var DEFAULT_SOUND = true;    // 想让 BGM 默认静音，把这里改成 false
var SND_KEY = 'pcity_snd';   // 独立存档键：重置城市不该连音量偏好一起清掉
var AUD = null, G_MASTER = null, G_SFX = null, G_BGM = null;
var soundOn = true;
var bgmOn = false;           // BGM 是否在播（与 soundOn 分开：切后台只暂停 BGM 本身）

(function initSoundPref(){
  try {
    var v = localStorage.getItem(SND_KEY);
    soundOn = (v === null) ? DEFAULT_SOUND : (v === '1');
  } catch (e) { soundOn = DEFAULT_SOUND; }
})();

function audReady(){ return !!AUD; }
function mtof(n){ return 440 * Math.pow(2, (n - 69) / 12); }

function audInit(){
  if (AUD) return;
  var Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return;                 // 宿主不支持音频时整条链路静默降级
  try { AUD = new Ctor(); } catch (e) { AUD = null; return; }
  G_MASTER = AUD.createGain();
  G_MASTER.gain.value = soundOn ? 1 : 0;
  G_MASTER.connect(AUD.destination);
  G_SFX = AUD.createGain(); G_SFX.gain.value = 0.9; G_SFX.connect(G_MASTER);
  G_BGM = AUD.createGain(); G_BGM.gain.value = 0.0001; G_BGM.connect(G_MASTER);
}
// 浏览器要求音频必须由用户手势启动。挂在 document 捕获阶段，
// 保证任何一次点击都能解锁，不必给每个按钮单独埋点。
function audUnlock(){
  audInit();
  if (!audReady()) return;
  // 每次点击都会走到这里，只在真的被挂起时才 resume，别白调
  if (AUD.state === 'suspended' && AUD.resume) AUD.resume();
  if (soundOn && !bgmOn) bgmStart();
}

// 一个音符 = 振荡器 + 增益包络，播完靠 stop() 自动回收，节点不堆积。
function tone(o){
  if (!audReady() || !soundOn) return;
  var t0 = (o.at != null) ? o.at : AUD.currentTime + (o.delay || 0);
  var dur = o.dur, atk = (o.atk == null) ? 0.006 : o.atk;
  var peak = Math.max(0.0002, o.gain == null ? 0.18 : o.gain);
  var osc = AUD.createOscillator();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.f, t0);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t0 + dur);
  var g = AUD.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(o.bus || G_SFX);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}
// 噪声：过带通滤波再包络。熨烫的嘶声、拆除的碎裂声都靠它。
function noise(o){
  if (!audReady() || !soundOn) return;
  var t0 = (o.at != null) ? o.at : AUD.currentTime + (o.delay || 0);
  var dur = o.dur;
  var len = Math.max(1, Math.floor(AUD.sampleRate * dur));
  var buf = AUD.createBuffer(1, len, AUD.sampleRate);
  var ch = buf.getChannelData(0);
  for (var i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
  var src = AUD.createBufferSource();
  src.buffer = buf;
  var bp = AUD.createBiquadFilter();
  bp.type = o.type || 'bandpass';
  bp.frequency.setValueAtTime(o.f, t0);
  if (o.f2) bp.frequency.exponentialRampToValueAtTime(o.f2, t0 + dur);
  bp.Q.value = (o.q == null) ? 1 : o.q;
  var g = AUD.createGain();
  var peak = Math.max(0.0002, o.gain == null ? 0.1 : o.gain);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + (o.atk == null ? 0.01 : o.atk));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(bp); bp.connect(g); g.connect(G_SFX);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

// 音色分工：三角波偏木/塑料，正弦偏铃/水，方波只在金币这类需要一点
// 金属摩擦的地方用一下，且音量压到最低。
var lastBead = 0;
var SFX = {
  // 放豆：音高随进度升 —— 手上能直接听出「快拼完了」，不用一直看百分比
  bead: function(pct){
    var now = Date.now();
    if (now - lastBead < 28) return;    // 拖动连点时限流，否则一秒几十声糊成噪音
    lastBead = now;
    var f = 520 + (pct || 0) * 4.4;
    tone({ type:'triangle', f:f, f2:f * 0.7, dur:0.085, gain:0.15, atk:0.002 });
    noise({ f:2700, q:1.4, dur:0.028, gain:0.045 });
  },
  erase: function(){
    var now = Date.now();
    if (now - lastBead < 28) return;
    lastBead = now;
    tone({ type:'sine', f:300, f2:165, dur:0.11, gain:0.13 });
    noise({ f:850, q:0.7, dur:0.055, gain:0.055 });
  },
  pick:   function(){ tone({ type:'sine', f:680, dur:0.05, gain:0.07 }); },
  open:   function(){ tone({ type:'sine', f:392, f2:523.25, dur:0.1, gain:0.075 }); },
  shut:   function(){ tone({ type:'sine', f:392, f2:294, dur:0.1, gain:0.055 }); },
  // 拼满：D 大三和弦上行
  done: function(){
    [587.33, 739.99, 880, 1174.66].forEach(function(f, i){
      tone({ type:'triangle', f:f, dur:0.5, gain:0.12, delay:i * 0.075, atk:0.004 });
    });
  },
  // 熨烫：由低到高的嘶声，下面垫一层暖和弦，别做成刺耳的「叮」
  iron: function(){
    noise({ f:420, f2:3400, q:0.7, dur:0.85, gain:0.1, atk:0.15 });
    tone({ type:'sine', f:146.83, dur:1.0, gain:0.09, atk:0.18 });
    tone({ type:'sine', f:220, dur:1.0, gain:0.06, atk:0.18 });
  },
  // 落成：比 done 更宽更低 —— 是「盖好了」不是「拼好了」
  build: function(){
    [293.66, 440, 587.33].forEach(function(f, i){
      tone({ type:'triangle', f:f, dur:0.7, gain:0.1, delay:i * 0.03, atk:0.012 });
    });
  },
  coin: function(){
    tone({ type:'square', f:987.77, dur:0.06, gain:0.05 });
    tone({ type:'square', f:1318.51, dur:0.18, gain:0.045, delay:0.055 });
  },
  deny: function(){ tone({ type:'sine', f:196, f2:128, dur:0.16, gain:0.13 }); },
  // 告警：两声下行，中低音区，能打断手上的动作但不刺耳
  warn: function(){
    tone({ type:'triangle', f:392, dur:0.16, gain:0.09 });
    tone({ type:'triangle', f:311.13, dur:0.3, gain:0.09, delay:0.17 });
  },
  demolish: function(){
    noise({ f:1400, f2:180, q:0.6, dur:0.34, gain:0.11 });
    tone({ type:'sine', f:150, f2:80, dur:0.3, gain:0.12 });
    tone({ type:'square', f:987.77, dur:0.06, gain:0.05, delay:0.3 });
    tone({ type:'square', f:1318.51, dur:0.18, gain:0.045, delay:0.355 });
  }
};
function sfx(name, arg){
  if (!audReady()) return;
  var f = SFX[name];
  if (f) f(arg);
}

// ---------------------------------------------------------------- BGM
// D 大调 I–vi–IV–V，四小节一循环（约 13 秒）。走「稀疏」路线：低音一小节一个
// 长音、铺底和弦慢起慢落、琶音只落在四分音符上。注意力应该在拼豆上，
// 音乐只负责填满留白，不负责抓耳朵。
var BPM = 72;
var STEP = 60 / BPM / 2;                  // 八分音符 ≈ 0.417s
var LOOP = 32;                            // 4 小节 × 8 步
var CHORDS = [
  { bass: 38, pad: [50, 57, 66], arp: [74, 78, 81, 76] },   // D
  { bass: 35, pad: [47, 54, 62], arp: [71, 74, 78, 81] },   // Bm
  { bass: 43, pad: [43, 50, 59], arp: [67, 71, 74, 81] },   // G
  { bass: 45, pad: [45, 52, 61], arp: [69, 73, 76, 78] }    // A
];
var bgmStep = 0, bgmNext = 0, bgmTimer = 0;

function bgmAt(step, t){
  var bar = (step / 8) | 0, s = step % 8, c = CHORDS[bar], i;
  if (s === 0) {
    tone({ type:'sine', f:mtof(c.bass), dur: STEP * 7.6, gain:0.15, atk:0.3, at:t, bus:G_BGM });
    for (i = 0; i < c.pad.length; i++)
      tone({ type:'triangle', f:mtof(c.pad[i]), dur: STEP * 7.2, gain:0.04, atk:0.7, at:t, bus:G_BGM });
  }
  if (s % 2 === 0)
    tone({ type:'sine', f:mtof(c.arp[s / 2]), dur:0.85, gain:0.075, atk:0.005, at:t, bus:G_BGM });
  // 第 2、4 小节的弱拍上点一颗高音，避免四小节听起来一模一样
  if ((bar === 1 || bar === 3) && s === 5)
    tone({ type:'sine', f:mtof(c.arp[3] + 12), dur:1.1, gain:0.032, atk:0.01, at:t, bus:G_BGM });
}
// 提前量调度：每次把未来 0.5 秒内的音符排好，避免依赖 setInterval 的抖动。
function bgmSchedule(){
  if (!audReady() || !soundOn || !bgmOn || AUD.state !== 'running') return;
  var t = AUD.currentTime;
  // 切后台再回来时时间线会落后一大截。不重新对齐的话，积压的几百个音符会
  // 被一次性排进去 —— 听起来是一声巨响。
  if (bgmNext < t - 0.25) bgmNext = t + 0.05;
  while (bgmNext < t + 0.5) {
    bgmAt(bgmStep, bgmNext);
    bgmNext += STEP;
    bgmStep = (bgmStep + 1) % LOOP;
  }
}
function bgmStart(){
  if (!audReady() || bgmOn) return;
  bgmOn = true;
  bgmStep = 0;
  bgmNext = AUD.currentTime + 0.1;
  // 2.5 秒淡入：玩家可能是从信息流里点进来的，音乐不该「砸」出来
  G_BGM.gain.cancelScheduledValues(AUD.currentTime);
  G_BGM.gain.setValueAtTime(0.0001, AUD.currentTime);
  G_BGM.gain.linearRampToValueAtTime(0.6, AUD.currentTime + 2.5);
  clearInterval(bgmTimer);
  bgmTimer = setInterval(bgmSchedule, 120);
  bgmSchedule();
}
function bgmStop(){
  if (!audReady() || !bgmOn) return;
  bgmOn = false;
  clearInterval(bgmTimer); bgmTimer = 0;
  G_BGM.gain.cancelScheduledValues(AUD.currentTime);
  G_BGM.gain.setValueAtTime(G_BGM.gain.value, AUD.currentTime);
  G_BGM.gain.linearRampToValueAtTime(0.0001, AUD.currentTime + 0.5);
}
function setSound(on){
  soundOn = !!on;
  try { localStorage.setItem(SND_KEY, soundOn ? '1' : '0'); } catch (e) {}
  $('btnSound').classList.toggle('muted', !soundOn);
  if (!audReady()) return;
  // 主增益走 0.35s 斜坡，避免开关瞬间「啪」一声爆音
  G_MASTER.gain.cancelScheduledValues(AUD.currentTime);
  G_MASTER.gain.setValueAtTime(G_MASTER.gain.value, AUD.currentTime);
  G_MASTER.gain.linearRampToValueAtTime(soundOn ? 1 : 0, AUD.currentTime + 0.35);
  if (soundOn) bgmStart(); else bgmStop();
}

// ---------------------------------------------------------------- 市政面板
// 结构只建一次、之后只改数值。原来每帧重建 innerHTML 有三个坏处：
//   1. CSS 过渡被重置，进度条直接跳到终值，看不出变化过程
//   2. 反复解析 HTML，白烧 CPU
//   3. 面板里的节点随时被换掉，做不了 hover / 点击这类交互
var UT = null;

function mkEl(tag, cls, txt){
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
}
function put(node, txt){
  if (node && node.textContent !== txt) node.textContent = txt;
}
function putW(node, pct){
  if (!node) return;
  var w = clamp(pct, 0, 100) + '%';
  if (node.style.width !== w) node.style.width = w;
}
function putCls(node, cls){
  if (node && node.className !== cls) node.className = cls;
}

// 一行键值：标签左、数值右。层次靠字号与字色的对比、靠右端对齐建立，
// 不靠卡片边框 —— 卡片复制 N 份是「仪表盘味」最重的做法。
function statRow(label){
  var row = mkEl('div', 'urow');
  row.appendChild(mkEl('span', 'urow-k', label));
  var v = mkEl('b', 'urow-v');
  var n = mkEl('i', 'urow-n');
  row.appendChild(v);
  row.appendChild(n);
  return { root: row, val: v, note: n };
}

// 一行资源：名称 + 用量/供给 + 余缺，下面一条细线表示满足度。
// 类别色只染这一条细线，不铺左边条、不做发光 —— 一处就够，多了就成装饰。
function resRow(label, color){
  var row = mkEl('div', 'ures');
  row.style.setProperty('--c', color);
  var h = mkEl('div', 'ures-h');
  h.appendChild(mkEl('span', 'ures-n', label));
  var v = mkEl('b', 'ures-v');
  h.appendChild(v);
  var bar = mkEl('div', 'mbar');
  var fill = mkEl('span');
  bar.appendChild(fill);
  row.appendChild(h);
  row.appendChild(bar);
  return { root: row, val: v, bar: bar, fill: fill };
}
function updateRes(c, use, sup, unit){
  var short = use > sup;
  var gap = (use - sup) * (short ? 1 : -1);
  var pct = use > 0 ? clamp(sup / use * 100, 0, 100) : 100;
  put(c.val, use + ' / ' + sup + '　' + (short ? '缺 ' : '余 ') + gap +
    (unit ? ' ' + unit : ''));
  putCls(c.val, 'ures-v' + (short ? ' bad' : ''));
  putW(c.fill, pct);
  putCls(c.bar, 'mbar' + (short ? ' short' : ''));
}

// 一条发展需求：类别名（用类别色着色，不用色块徽章）+ 强度描述 + 双向条
function demRow(tagCls, name){
  var row = mkEl('div', 'udm');
  var h = mkEl('div', 'udm-h');
  h.appendChild(mkEl('b', 'tagt ' + tagCls, name));
  h.appendChild(mkEl('span'));
  var bar = mkEl('div', 'bar');
  var fill = mkEl('span', 'fill pos');
  bar.appendChild(fill);
  row.appendChild(h);
  row.appendChild(bar);
  return { root: row, state: h.lastChild, fill: fill };
}
function updateDem(r, v){
  var a = Math.abs(v);
  var hot = a >= 60 ? '强烈需求' : (a >= 30 ? '需求旺盛' : (a >= 5 ? '略有需求' : '供需平衡'));
  var cold = a >= 60 ? '严重过剩' : (a >= 30 ? '明显过剩' : (a >= 5 ? '略有过剩' : '供需平衡'));
  put(r.state, v >= 0 ? hot : cold);
  putCls(r.state, v >= 0 ? (a >= 30 ? 'up' : '') : (a >= 30 ? 'down' : ''));
  var w = clamp(a, 0, 100) / 2 + '%';
  if (r.fill.style.width !== w) r.fill.style.width = w;
  if (v >= 0) {
    if (r.fill.style.left !== '50%') r.fill.style.left = '50%';
    if (r.fill.style.right !== 'auto') r.fill.style.right = 'auto';
    putCls(r.fill, 'fill pos');
  } else {
    if (r.fill.style.left !== 'auto') r.fill.style.left = 'auto';
    if (r.fill.style.right !== '50%') r.fill.style.right = '50%';
    putCls(r.fill, 'fill neg');
  }
}

// 一句话诊断：告诉玩家现在最该干什么
function diagnose(st, d){
  if (st.count === 0) return { t:'先拼一座暖瓦小屋，把人引进来', k:'' };
  if (st.useP > st.supP) return { t:'电力缺口 ' + (st.useP - st.supP) + ' 度，全城收益打折', k:'bad' };
  if (st.useW > st.supW) return { t:'供水缺口 ' + (st.useW - st.supW) + ' 吨，人口不再迁入', k:'bad' };
  if (S.backlog > 20) return { t:'垃圾积压 ' + fmt(S.backlog) + '，幸福度一路下滑', k:'bad' };
  // 住房满了、但岗位还富余 —— 房子是唯一瓶颈，盖住宅立刻能涨人口，值得喊。
  // 如果岗位同时也满了，盖住宅是白花钱：popTarget 卡在 jobs+JOBLESS_ALLOW，
  // 容量再大人口也不动。这时候该喊的是下一条「岗位不够」，所以这里加条件让开，
  // 免得玩家照着做、投了钱却看不到人口涨。
  if (st.popCap > 0 && st.pop >= st.popCap - 0.5 && st.pop < st.jobs + JOBLESS_ALLOW - 0.5)
    return { t:'住房住满了，人口涨不动，多盖点住宅', k:'warn' };
  if (st.pop >= st.jobs + JOBLESS_ALLOW - 0.5)
    return { t:'岗位不够，人来了也没活干，多盖商业或工业', k:'warn' };
  if (d.R >= 30) return { t:'住宅需求旺盛，正是扩张的时候', k:'ok' };
  if (d.C >= 30) return { t:'居民想逛逛了，商业区该开张了', k:'ok' };
  if (d.I >= 30) return { t:'工业需求旺盛，厂区可以安排上了', k:'ok' };
  return { t:'城市运转良好，继续扩张吧', k:'ok' };
}

function buildUtil(){
  var box = $('utilBody');
  if (!box) return;
  box.innerHTML = '';
  UT = { st: {}, res: {}, dem: {} };

  // —— 城市概况 ——
  var hero = mkEl('div', 'uhero');
  var top = mkEl('div', 'uhero-top');
  var left = mkEl('div');
  left.appendChild(mkEl('div', 'uhero-title'));
  left.appendChild(mkEl('div', 'uhero-sub'));
  top.appendChild(left);
  top.appendChild(mkEl('div', 'uhero-rate'));
  var hbar = mkEl('div', 'uhero-bar');
  hbar.appendChild(mkEl('span'));
  hero.appendChild(top);
  hero.appendChild(hbar);
  var diag = mkEl('div', 'udiag');
  hero.appendChild(diag);
  box.appendChild(hero);
  UT.hTitle = left.firstChild;
  UT.hSub = left.lastChild;
  UT.hRate = top.lastChild;
  UT.hBar = hbar.firstChild;
  UT.hDiag = diag;

  // —— 数据：四行键值，靠右端对齐成列 ——
  box.appendChild(mkEl('div', 'mtitle', '数据'));
  var statsBox = mkEl('div', 'ustats');
  UT.st = {};
  UT.st.pop = statRow('现有人口');
  UT.st.job = statRow('就业岗位');
  UT.st.happy = statRow('幸福度');
  UT.st.rate = statRow('收益');
  [UT.st.pop, UT.st.job, UT.st.happy, UT.st.rate].forEach(function(r){
    statsBox.appendChild(r.root);
  });
  box.appendChild(statsBox);

  // —— 市政：四行资源，每行一条细线 ——
  box.appendChild(mkEl('div', 'mtitle', '市政'));
  var cards = mkEl('div', 'ucards');
  UT.res.power = resRow('电力', '#F0C24B');
  UT.res.water = resRow('供水', '#5BC8E8');
  UT.res.trash = resRow('环卫', '#B98FD0');
  UT.res.backlog = resRow('垃圾积压', '#8E7FA8');
  [UT.res.power, UT.res.water, UT.res.trash, UT.res.backlog].forEach(function(c){
    cards.appendChild(c.root);
  });
  box.appendChild(cards);

  box.appendChild(mkEl('div', 'mtitle', '发展需求'));
  var dem = mkEl('div', 'udemand');
  UT.dem.R = demRow('res', '住宅');
  UT.dem.C = demRow('com', '商业');
  UT.dem.I = demRow('ind', '工业');
  [UT.dem.R, UT.dem.C, UT.dem.I].forEach(function(r){ dem.appendChild(r.root); });
  box.appendChild(dem);

  box.appendChild(mkEl('div', 'mtitle', '提示'));
  box.appendChild(mkEl('div', 'mtip box',
    '基础管线自带 电 ' + BASE_SUPPLY.power + ' / 水 ' + BASE_SUPPLY.water +
    ' / 环卫 ' + BASE_SUPPLY.trash + '，规模一大就得自己建厂。' +
    '缺电缺水时全城收益打折、人口停止迁入；垃圾清运跟不上就会积压，幸福度一路掉。'));
}

function updateUtil(st){
  if (!UT) return;
  var d = demands(st);

  put(UT.hTitle, titleOf(st.pop));
  put(UT.hSub, '人口 ' + fmt(st.pop) + ' / ' + st.popCap + ' · 建筑 ' + st.count + ' 栋');
  put(UT.hRate, st.rate < 1 ? '暂无收益' : '+' + fmt(st.rate) + ' /分');
  putW(UT.hBar, st.popCap > 0 ? st.pop / st.popCap * 100 : 0);
  var dg = diagnose(st, d);
  put(UT.hDiag, dg.t);
  putCls(UT.hDiag, 'udiag' + (dg.k ? ' ' + dg.k : ''));

  // 副信息合并进同一行的右端，不再另起一行小字 —— 四行四注释会把面板撑成说明书
  put(UT.st.pop.val, fmt(st.pop) + ' / ' + st.popCap);
  put(UT.st.pop.note, st.popCap === 0 ? '无住房'
    : (st.pop >= st.popCap - 0.5 ? '已住满'
       : '空 ' + Math.max(0, Math.ceil(st.popCap - st.pop))));
  put(UT.st.job.val, String(st.jobs));
  put(UT.st.job.note, st.count === 0 ? '还没有产业'
    : (st.jobs >= Math.floor(st.pop) ? '人人有活干'
       : Math.max(0, Math.floor(st.pop) - st.jobs) + ' 人待业'));
  put(UT.st.happy.val, String(st.happy));
  put(UT.st.happy.note, moodOf(st.happy));
  put(UT.st.rate.val, fmt(st.rate));
  put(UT.st.rate.note, st.rate < 1 ? '还没有进账'
    : (st.powRatio < 0.999 || st.watRatio < 0.999 ? '停摆打折中' : '满负荷运转'));

  updateRes(UT.res.power, st.useP, st.supP, '度');
  updateRes(UT.res.water, st.useW, st.supW, '吨');
  updateRes(UT.res.trash, st.useT, st.supT, '车');

  var over = S.backlog > 20;
  // 与其他三行保持同一格式（用量 / 容量 + 状态），否则这一行会显得缺一块
  put(UT.res.backlog.val, fmt(S.backlog) + ' / ' + TRASH_CAP + '　' +
    (S.backlog < 1 ? '暂未积压' : (over ? '清运跟不上' : '消化中')));
  putCls(UT.res.backlog.val, 'ures-v' + (over ? ' bad' : ''));
  putW(UT.res.backlog.fill, clamp(S.backlog / TRASH_CAP * 100, 0, 100));
  putCls(UT.res.backlog.bar, 'mbar' + (over ? ' short' : ''));

  updateDem(UT.dem.R, d.R);
  updateDem(UT.dem.C, d.C);
  updateDem(UT.dem.I, d.I);
}

function refreshUtil(st){
  if (!UT) buildUtil();
  updateUtil(st || stats());
}
function openUtil(){
  refreshUtil(stats());
  showOverlay($('utilView'));
}

// ---------------------------------------------------------------- 蓝图 / 数据 / 玩法
var pendingCell = -1;
var bpTab = 'auto';   // 'auto' 推荐 / 'all' 全部 / 具体类别 id
var BP_SEL = null;    // 当前选中的图纸
var BP_LIST = [];     // 当前类目下的图纸列表（已排序）

// 按当前供需与 RCI 缺口，挑出一个「现在最该盖」的类别
function recommendCat(st, d){
  if (st.useW > st.supW) return 'water';
  if (st.useP > st.supP) return 'power';
  if (st.useT > st.supT || S.backlog > 20) return 'trash';
  var cands = [
    { cat:'res', w: d.R * 0.8 },
    { cat:'com', w: d.C * 0.8 },
    { cat:'ind', w: d.I * 0.8 }
  ];
  var best = null;
  cands.forEach(function(c){
    if (c.w <= 0.5) return;
    if (!CATS[c.cat]) return;
    if (!best || c.w > best.w) best = c;
  });
  return best ? best.cat : null;
}
// 已解锁的排前面，其余按造价升序；同造价按解锁人口
function catSort(st){
  return function(a, b){
    var ua = peakPop() >= a.unlockPop ? 0 : 1;
    var ub = peakPop() >= b.unlockPop ? 0 : 1;
    if (ua !== ub) return ua - ub;
    if (a.cost !== b.cost) return a.cost - b.cost;
    return a.unlockPop - b.unlockPop;
  };
}
function catList(catId, st){
  return LIST.filter(function(b){ return b.cat === catId; }).sort(catSort(st));
}

// 计算当前 bpTab 下要展示的图纸列表（strip 用）。
// 推荐模式下，没有推荐就给空。
function bpCurrentList(st, rec){
  if (bpTab === 'auto') return rec ? catList(rec, st) : [];
  if (bpTab === 'all') return LIST.slice().sort(catSort(st));
  return catList(bpTab, st);
}

// —— 顶部类目 tabs ——
function renderBpTabs(st, rec){
  var box = $('bpTabs');
  if (!box) return;
  box.innerHTML = '';
  var defs = [{ id:'auto', name:'推荐', color: rec ? CATS[rec].color : null }];
  defs.push({ id:'all', name:'全部', color:null });
  DATA.cats.forEach(function(c){ defs.push({ id:c.id, name:c.name, color:c.color }); });

  defs.forEach(function(t){
    var n;
    if (t.id === 'all') n = LIST.length;
    else if (t.id === 'auto') {
      n = rec ? catList(rec, st).filter(function(b){ return peakPop() >= b.unlockPop; }).length : 0;
    } else n = catList(t.id, st).length;

    var el = document.createElement('button');
    el.className = 'tab' + (bpTab === t.id ? ' on' : '');
    el.innerHTML = (t.color ? '<i style="background:' + t.color + '"></i>' : '') +
                   t.name + '<b>' + n + '</b>';
    el.onclick = function(){ bpTab = t.id; sfx('pick'); renderBlueprint(); };
    box.appendChild(el);
  });
}

// —— 大特征卡 ——
function renderBpFeature(b){
  if (!b) return;
  var box = $('bpFeature');
  if (!box) return;
  // smoke_test.js 的 DOM stub 不解析 innerHTML，必须用 appendChild 逐个建。
  // 真实浏览器下 innerHTML='' 会清空 DOM；stub 下也只清 children / firstChild。
  box.innerHTML = '';
  var cat = CATS[b.cat] || { name:'', color:'#888888' };
  var unlocked = peakPop() >= b.unlockPop;
  var mastered = !!S.mastered[b.id];

  var feat = mkEl('div', 'bp-feat');
  feat.setAttribute('data-no', 'BLUEPRINT · NO.' + (LIST.indexOf(b) + 1));
  if (!unlocked) feat.style.opacity = '0.5';
  if (mastered) feat.style.borderColor = 'rgba(232,182,76,0.35)';

  var main = mkEl('div', 'bp-feat-main');

  var thumbWrap = mkEl('div', 'bp-feat-thumb');
  thumbWrap.style.background = 'radial-gradient(circle at 50% 64%, ' +
    hexA(cat.color, 0.30) + ', rgba(255,255,255,0.04) 72%)';
  thumbWrap.appendChild(thumb(b, 96));
  main.appendChild(thumbWrap);

  var body = mkEl('div', 'bp-feat-body');
  body.appendChild(mkEl('div', 'bp-feat-name', b.name));
  var catEl = mkEl('div', 'bp-feat-cat');
  var dot = mkEl('i'); dot.style.background = cat.color; catEl.appendChild(dot);
  catEl.appendChild(mkEl('span', null, cat.name));
  body.appendChild(catEl);
  body.appendChild(mkEl('div', 'bp-feat-desc', b.desc));
  main.appendChild(body);
  feat.appendChild(main);

  // 属性两列。优先显示最关键的 6 项
  var rows = [];
  rows.push({ l:'造价', v:b.cost + ' 金币', c:'' });
  if (b.popCap) rows.push({ l:'住房', v:'+' + b.popCap + ' · 税 +' + Math.round(b.popCap * TAX_PER_HEAD), c:'p' });
  if (b.jobs) rows.push({ l:'岗位', v:'+' + b.jobs, c:'p' });
  if (b.income) rows.push({ l:'收益', v:'+' + b.income + ' / 分', c:'p' });
  if (b.happy) rows.push({ l:'幸福', v:(b.happy > 0 ? '+' : '') + b.happy, c: b.happy > 0 ? 'p' : 'n' });
  if (u(b,'power')) rows.push({ l:'耗电', v:String(u(b,'power')), c:'n' });
  if (u(b,'water')) rows.push({ l:'耗水', v:String(u(b,'water')), c:'n' });
  if (u(b,'trash')) rows.push({ l:'垃圾', v:String(u(b,'trash')), c:'n' });
  if (g(b,'power')) rows.push({ l:'发电', v:'+' + g(b,'power'), c:'s' });
  if (g(b,'water')) rows.push({ l:'供水', v:'+' + g(b,'water'), c:'s' });
  if (g(b,'trash')) rows.push({ l:'清运', v:'+' + g(b,'trash'), c:'s' });
  if (rows.length > 6) rows = rows.slice(0, 6);

  var stats = mkEl('div', 'bp-feat-stats');
  rows.forEach(function(r){
    var it = mkEl('i', r.c);
    it.appendChild(mkEl('em', null, r.l));
    it.appendChild(mkEl('b', null, r.v));
    stats.appendChild(it);
  });
  feat.appendChild(stats);

  box.appendChild(feat);
}

// —— 缩略图条 ——
function renderBpStrip(arr){
  var wrap = $('bpStrip');
  var label = $('bpStripLabel');
  if (!wrap) return;
  wrap.innerHTML = '';

  if (!arr.length) {
    label.textContent = '本类图纸';
    wrap.innerHTML = '<div class="bp-empty">本类暂无图纸</div>';
    return;
  }

  // 根据当前 tab 给 strip 标签写一句说明
  if (bpTab === 'auto') label.textContent = '推荐类目 · ' + arr.length + ' 张';
  else if (bpTab === 'all') label.textContent = '全部 · ' + arr.length + ' 张';
  else label.textContent = (CATS[bpTab] ? CATS[bpTab].name : '') + ' · ' + arr.length + ' 张';

  // 自动选第一张作为 BP_SEL。如果 BP_SEL 还在当前列表里，保持它。
  if (!BP_SEL || arr.indexOf(BP_SEL) < 0) BP_SEL = arr[0];

  arr.forEach(function(b){
    var unlocked = peakPop() >= b.unlockPop;
    var mastered = !!S.mastered[b.id];
    var on = (b === BP_SEL);

    var item = document.createElement('div');
    item.className = 'bp-strip-item' + (on ? ' on' : '') + (unlocked ? '' : ' locked');

    var pic = document.createElement('div');
    pic.className = 'pic';
    var cat = CATS[b.cat] || { color:'#888' };
    pic.style.background = 'radial-gradient(circle at 50% 64%, ' + hexA(cat.color, 0.18) +
                           ', rgba(255,255,255,0.04) 72%)';
    pic.appendChild(thumb(b, 44));

    // 角标：已掌握 / 拼豆数 / 缺金币
    var badge = document.createElement('span');
    if (!unlocked) { badge.className = 'badge'; badge.textContent = 'N·' + b.unlockPop; }
    else if (mastered) { badge.className = 'badge go'; badge.textContent = '已'; }
    else { badge.className = 'badge'; badge.textContent = b.total; }
    pic.appendChild(badge);
    item.appendChild(pic);

    var nm = document.createElement('div');
    nm.className = 'nm';
    nm.textContent = b.name;
    item.appendChild(nm);

    item.onclick = function(){
      BP_SEL = b;
      // strip 选中态变化 + feature 卡切换 + dock 切换
      var kids = wrap.children || [];
      for (var i = 0; i < kids.length; i++) {
        var x = kids[i];
        var on = (x === item);
        var cls = x.className;
        // 切换 on 类名
        if (on) {
          if (cls.indexOf(' on') < 0) x.className = cls + ' on';
        } else {
          x.className = cls.replace(' on', '');
        }
      }
      renderBpFeature(b);
      renderBpDock(b);
    };

    wrap.appendChild(item);
  });
}

// —— 底部 dock ——
function renderBpDock(b){
  var nm = $('bpDockName');
  var mt = $('bpDockMeta');
  var cta = $('bpDockCta');
  if (!nm || !mt || !cta) return;
  if (!b) {
    nm.textContent = '—';
    mt.textContent = '请先选一栋';
    cta.textContent = '选择建筑';
    cta.className = 'bp-dock-cta gray';
    cta.onclick = null;
    return;
  }
  nm.textContent = b.name;
  var unlocked = peakPop() >= b.unlockPop;
  var mastered = !!S.mastered[b.id];
  if (!unlocked) {
    mt.innerHTML = '人口达到 <b>' + b.unlockPop + '</b> 后解锁';
    cta.textContent = '尚未解锁';
    cta.className = 'bp-dock-cta gray';
  } else if (!mastered) {
    mt.innerHTML = '<b>' + b.total + '</b> 颗豆 · 首次须亲手拼';
    cta.textContent = '去拼豆台';
    cta.className = 'bp-dock-cta blue';
  } else if (S.coins < b.cost) {
    mt.innerHTML = '已掌握 · 还差 <b>' + Math.ceil(b.cost - S.coins) + '</b> 金币';
    cta.textContent = '金币不足';
    cta.className = 'bp-dock-cta gray';
  } else {
    mt.innerHTML = '已掌握 · 造价 <b>' + b.cost + '</b> 金币';
    cta.textContent = '直接建造';
    cta.className = 'bp-dock-cta';
  }
  cta.onclick = pickBlueprint;
}

function renderBlueprint(){
  var box = $('blueprintView');
  if (!box) return;
  var st = stats();
  var d = demands(st);
  var rec = recommendCat(st, d);

  renderBpTabs(st, rec);

  // 推荐但没推荐类别：空态
  if (bpTab === 'auto' && !rec) {
    BP_SEL = null;
    $('bpFeature').innerHTML = '';
    $('bpStrip').innerHTML = '<div class="bp-empty">现在没有急着要补的缺口。<br>点「全部」挑一张顺眼的拼，<br>或者先盖住宅把人招进来。</div>';
    $('bpStripLabel').textContent = '本类图纸';
    renderBpDock(null);
    return;
  }

  var arr = bpCurrentList(st, rec);
  BP_LIST = arr;
  renderBpFeature(BP_SEL && arr.indexOf(BP_SEL) >= 0 ? BP_SEL : (arr[0] || null));
  renderBpStrip(arr);
  renderBpDock(BP_SEL);
}

function openBlueprint(cellIdx){
  pendingCell = (cellIdx === undefined ? -1 : cellIdx);
  BP_SEL = null;
  renderBlueprint();
  showOverlay($('blueprintView'));
}

function pickBlueprint(){
  var b = BP_SEL;
  if (!b) return;
  if (peakPop() < b.unlockPop) { toast('人口达到 ' + b.unlockPop + ' 才解锁这张图纸'); return; }
  if (!S.mastered[b.id]) { hideOverlay($('blueprintView')); openBuilder(b); return; }
  if (S.coins < b.cost) { toast('金币不够，再攒 ' + Math.ceil(b.cost - S.coins) + ' 枚'); return; }
  hideOverlay($('blueprintView'));
  placeBuilding(b, true);
}

function placeBuilding(b, pay){
  var idx = pendingCell;
  if (idx < 0) {
    idx = S.grid.indexOf(null);
    if (idx < 0) { sfx('deny'); toast('没有空地了，先拆一栋吧'); return; }
  }
  if (S.grid[idx]) { sfx('deny'); toast('这块地已经有建筑了'); return; }
  if (pay) {
    if (S.coins < b.cost) { sfx('deny'); toast('金币不够'); return; }
    S.coins -= b.cost;
  }
  S.grid[idx] = b.id;
  S.built++;
  S.mastered[b.id] = true;
  spawn = { i: idx, t0: Date.now() };
  sfx('build');
  save();
  updateHud(true);
  hideHint();
  var extra = [];
  if (b.popCap) extra.push('住房 +' + b.popCap + '，住满后税收 +' + Math.round(b.popCap * TAX_PER_HEAD));
  if (b.jobs) extra.push('岗位 +' + b.jobs);
  if (b.income) extra.push('收益 +' + b.income);
  if (g(b,'power')) extra.push('发电 +' + g(b,'power'));
  if (g(b,'water')) extra.push('供水 +' + g(b,'water'));
  if (g(b,'trash')) extra.push('清运 +' + g(b,'trash'));
  toast('「' + b.name + '」落成！' + (extra.length ? extra.join('，') : '幸福 ' + b.happy));
}

// ====================================================================== 数据页
function renderRing(svg, val){
  // 0-100 -> 0-360 度；空心圆环，背景灰、前面随值变色
  var r = 48, cx = 60, cy = 60, w = 9;
  var pct = clamp(val, 0, 100) / 100;
  var color = pct >= 0.6 ? '#5DBE8A' : (pct >= 0.4 ? '#E8B64C' : '#D6544B');
  var C = 2 * Math.PI * r;
  var html = '';
  // 背景圆
  html += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" ' +
          'stroke="rgba(255,255,255,0.08)" stroke-width="' + w + '"/>';
  // 前景弧：从顶端起算。stroke-dasharray 控长度，stroke-dashoffset 反着控制
  // 旋转 -90° 让起点在 12 点钟
  html += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" ' +
          'stroke="' + color + '" stroke-width="' + w + '" stroke-linecap="round" ' +
          'stroke-dasharray="' + C + '" stroke-dashoffset="' + (C * (1 - pct)) + '" ' +
          'transform="rotate(-90 ' + cx + ' ' + cy + ')"/>';
  // 中央数字
  html += '<text x="' + cx + '" y="' + (cy + 1) + '" text-anchor="middle" dominant-baseline="middle" ' +
          'font-size="26" font-weight="800" fill="#F2F5FA" font-family="inherit">' +
          Math.round(val) + '</text>';
  html += '<text x="' + cx + '" y="' + (cy + 18) + '" text-anchor="middle" dominant-baseline="middle" ' +
          'font-size="9" font-weight="800" letter-spacing="1" fill="#6E7A8D" font-family="inherit">/ 100</text>';
  svg.innerHTML = html;
}

function renderDataUtils(st){
  var box = $('dpUtils');
  if (!box) return;
  // 第一次：建结构。stub 不解析 innerHTML，所以用 appendChild 逐个塞
  if (!box.children.length) {
    var rows = [
      { k:'电力', c:'#F0C24B' },
      { k:'供水', c:'#5BC8E8' },
      { k:'环卫', c:'#B98FD0' },
      { k:'垃圾积压', c:'#8E7FA8' }
    ];
    rows.forEach(function(r){
      var row = mkEl('div', 'dp-util');
      var h = mkEl('div', 'dp-util-h');
      h.appendChild(mkEl('b', null, r.k));
      h.appendChild(mkEl('span'));
      var bar = mkEl('div', 'dp-util-bar');
      bar.appendChild(mkEl('span'));
      row.appendChild(h);
      row.appendChild(bar);
      // 颜色变量给 bar 内的 fill
      bar.style.setProperty('--c', r.c);
      box.appendChild(row);
    });
  }
  var kids = box.children;
  // 电力 / 供水 / 环卫 三行
  var usage = [
    { use:st.useP, sup:st.supP, unit:'度' },
    { use:st.useW, sup:st.supW, unit:'吨' },
    { use:st.useT, sup:st.supT, unit:'车' }
  ];
  for (var i = 0; i < 3; i++) {
    var u = usage[i];
    var dom = kids[i];
    var short = u.use > u.sup;
    var gap = (u.use - u.sup) * (short ? 1 : -1);
    var pct = u.use > 0 ? clamp(u.sup / u.use * 100, 0, 100) : 100;
    var sp = dom.firstChild.lastChild;
    sp.textContent = u.use + ' / ' + u.sup + (short ? ' · 缺 ' + gap : ' · 余 ' + gap) + ' ' + u.unit;
    sp.className = short ? 'bad' : '';
    var bar = dom.lastChild;
    bar.firstChild.style.width = pct + '%';
    bar.className = 'dp-util-bar' + (short ? ' bad' : '');
  }
  // 积压行
  var bkDom = kids[3];
  var over = S.backlog > 20;
  var pct = clamp(S.backlog / TRASH_CAP * 100, 0, 100);
  bkDom.firstChild.lastChild.textContent = fmt(S.backlog) + ' / ' + TRASH_CAP +
    (over ? ' · 清运跟不上' : ' · 消化中');
  bkDom.firstChild.lastChild.className = over ? 'bad' : '';
  bkDom.lastChild.firstChild.style.width = pct + '%';
  bkDom.lastChild.className = 'dp-util-bar' + (over ? ' bad' : '');
}

function renderDataInc(st){
  var stack = $('dpIncStack');
  var legend = $('dpIncLegend');
  if (!stack || !legend) return;
  // 收入三分：保底 / 人口税 / 产业
  var b = st.baseIncome, t = st.taxIncome, z = st.bizIncome + st.comIncome;
  var gross = Math.max(1, b + t + z);
  var total = b + t + z;
  var bp = Math.max(b / gross * 100, 0);
  var tp = t / gross * 100;
  var zp = z / gross * 100;
  // stub 不解析 innerHTML → 用 appendChild
  stack.innerHTML = '';
  var segs = [
    { cls:'b', w:bp },
    { cls:'t', w:tp },
    { cls:'z', w:zp }
  ];
  segs.forEach(function(s){
    var el = mkEl('i', s.cls);
    el.style.width = s.w + '%';
    stack.appendChild(el);
  });
  legend.innerHTML = '';
  var legItems = [
    { cls:'b', label:'市政保底', val:fmt(b) },
    { cls:'t', label:'人口税',   val:fmt(t) },
    { cls:'z', label:'产业收益', val:fmt(z) }
  ];
  legItems.forEach(function(li){
    var it = mkEl('i');
    var dot = mkEl('span', 'dot ' + li.cls);
    it.appendChild(dot);
    it.appendChild(mkEl('span', null, li.label + ' '));
    var bv = mkEl('b', null, li.val);
    it.appendChild(bv);
    legend.appendChild(it);
  });
  $('dpIncTotal').textContent = total > 0 ? '+' + fmt(st.rate) + ' / 分' : '暂无进账';
}

function renderDataUnlock(st){
  var box = $('dpUnlock');
  if (!box) return;
  // 找下一张未解锁的
  var next = null;
  for (var i = 0; i < LIST.length; i++) {
    if (peakPop() < LIST[i].unlockPop) { next = LIST[i]; break; }
  }
  // stub 不解析 innerHTML，每次重建
  while (box.firstChild && box.removeChild) box.removeChild(box.firstChild);
  if (!box.firstChild) box.innerHTML = '';   // 双保险：清 stub 的 children
  if (!next) {
    var row = mkEl('div', 'dp-unlock-body');
    row.appendChild(mkEl('div', 'dp-unlock-name', '全部图纸已解锁'));
    var hint = mkEl('div', 'dp-unlock-hint');
    hint.innerHTML = '继续扩张，把城市推到 <b>' + fmt(peakPop()) + '</b> 人口';
    row.appendChild(hint);
    box.appendChild(row);
    return;
  }
  var need = Math.ceil(next.unlockPop - peakPop());
  var pct = clamp(peakPop() / next.unlockPop * 100, 0, 100);

  var pic = mkEl('div', 'pic');
  pic.appendChild(thumb(next, 48));

  var body = mkEl('div', 'dp-unlock-body');
  body.appendChild(mkEl('div', 'dp-unlock-name', next.name));
  var hint = mkEl('div', 'dp-unlock-hint');
  hint.innerHTML = '还差 <b>' + need + '</b> 人口（' + fmt(peakPop()) + ' / ' + next.unlockPop + '）';
  body.appendChild(hint);
  var bar = mkEl('div', 'dp-unlock-bar');
  var fill = mkEl('span');
  fill.style.width = pct + '%';
  bar.appendChild(fill);
  body.appendChild(bar);

  box.appendChild(pic);
  box.appendChild(body);
}

function renderDataCat(st){
  var bar = $('dpCatBar');
  var legend = $('dpCatLegend');
  if (!bar || !legend) return;
  // 类别构成 = 按当前类目统计建筑数。0 类别不显示
  var counts = {};
  var total = 0;
  S.grid.forEach(function(id){
    if (!id) return;
    var b = BY_ID[id];
    if (!b) return;
    counts[b.cat] = (counts[b.cat] || 0) + 1;
    total++;
  });
  bar.innerHTML = '';
  legend.innerHTML = '';
  if (total === 0) {
    bar.innerHTML = '<i style="width:100%;background:rgba(255,255,255,0.06)"></i>';
    legend.innerHTML = '<i>还没有建筑</i>';
    return;
  }
  DATA.cats.forEach(function(c){
    var n = counts[c.id] || 0;
    if (n === 0) return;
    var pct = n / total * 100;
    var seg = document.createElement('i');
    seg.style.width = pct + '%';
    seg.style.background = c.color;
    bar.appendChild(seg);
    legend.innerHTML += '<i><span class="dot" style="background:' + c.color + '"></span>' +
                        c.name + ' <b>' + n + '</b></i>';
  });
  // 尾巴可能不是 100%（JS 浮点），加个透明的占位
  var sum = 0;
  for (var i = 0; i < bar.children.length; i++) {
    sum += parseFloat(bar.children[i].style.width);
  }
  if (sum < 99.5) {
    var filler = document.createElement('i');
    filler.style.width = (100 - sum) + '%';
    filler.style.background = 'rgba(255,255,255,0.04)';
    bar.appendChild(filler);
  }
}

function renderData(){
  var box = $('dataView');
  if (!box) return;
  var st = stats();
  $('dpCityName').textContent = titleOf(st.pop);
  $('dpCitySub').textContent = '人口 ' + fmt(st.pop) + ' / ' + st.popCap + ' · 建筑 ' + st.count + ' 栋';
  $('dpRate').textContent = st.rate < 1 ? '暂无进账' : '+' + fmt(st.rate) + ' / 分';

  renderRing($('dpRing'), st.happy);
  $('dpHappyVal').textContent = st.happy;
  $('dpHappyMood').textContent = moodOf(st.happy);

  renderDataInc(st);
  renderDataUtils(st);
  renderDataUnlock(st);
  renderDataCat(st);

  // 底栏顺手带一句诊断：看完数据就知道下一步该干嘛，不用再回市政页
  var dg = diagnose(st, demands(st));
  var note = $('dpFootNote');
  if (note) { note.textContent = dg.t; note.className = 'ov-foot-note ' + dg.k; }
}
function openData(){ renderData(); showOverlay($('dataView')); }

// ====================================================================== 玩法页
var HELP_SECTIONS = [
  { n:'一', title:'拼一座楼',
    sum:'选一栋楼，把每颗豆子按图纸填到钉板上。',
    body:'点城市里的<em>空地块</em>，从蓝图挑一栋，第一次盖某栋楼必须<em>亲手拼完</em>。钉板上有淡淡的底稿，对准颜色一颗颗点。'},
  { n:'二', title:'看着它落进城里',
    sum:'拼到 100% 自动熨烫，豆子融成一片。',
    body:'拼满会自动进入<em>熨烫动画</em>，豆与豆之间融成一片 —— 这栋楼就算「落成」了。以后再盖这栋楼，<em>花金币直接盖</em>，不用再拼。'},
  { n:'三', title:'三种需求互相推',
    sum:'住宅 / 商业 / 工业 缺一就卡。',
    body:'顶栏三条是<em>住宅 · 商业 · 工业</em>需求：商业和工业提供<em>岗位</em>，岗位把人吸进来；人多了又要更多商店工厂。' +
         '先盖商业工业拉岗位，再补住宅装人 —— 反过来先堆住宅，需求条会变成红色「住宅过剩」。'},
  { n:'四', title:'钱从三处来',
    sum:'保底 + 人口税 + 产业收益，缺一就瘸。',
    body:'<em>市政保底</em>保证不饿死；<em>人口税</em>靠住宅本身不收税、住进来的人才交，所以光盖房没用、得把人装满；' +
         '<em>产业收益</em>靠商业工业直接来钱，但铺子要靠人气，没人逛就打折。'},
  { n:'五', title:'水 · 电 · 垃圾各管一头',
    sum:'每栋楼都吃水电、造垃圾。',
    body:'开局自带<em>电 6 / 水 6 / 环卫 14</em>，够撑前 6 栋。<em>缺水</em>人口停止迁入，<em>缺电</em>全城收益打折，' +
         '<em>垃圾</em>清运跟不上就积压，一路掉幸福度。规模一过 6 栋必须自己建厂。'},
  { n:'六', title:'幸福是总闸门',
    sum:'幸福 0–100 决定 0.6× ~ 1.4× 收入系数。',
    body:'工厂和电厂来钱快但<em>扣幸福</em>，公园学堂不赚钱但<em>把人留下</em>。一个全是工厂的城市，看似账上有钱，幸福掉到个位数时收入就崩了。'}
];
function renderHelp(){
  var box = $('helpBody');
  if (!box) return;
  if (box.children.length) return; // 内容是静态的，渲染一次即可
  HELP_SECTIONS.forEach(function(s){
    var sec = mkEl('div', 'hp');
    var h = mkEl('div', 'hp-h');
    h.appendChild(mkEl('span', 'hp-num', s.n));
    h.appendChild(mkEl('span', 'hp-title', s.title));
    sec.appendChild(h);
    sec.appendChild(mkEl('div', 'hp-sum', s.sum));
    var body = mkEl('div', 'hp-body');
    body.innerHTML = s.body;   // hp-body 内允许 <em>/<code>，stub 不影响文本断言
    sec.appendChild(body);
    box.appendChild(sec);
  });
}
function openHelp(){ renderHelp(); showOverlay($('helpView')); }

// ---------------------------------------------------------------- 点击城市
function usageLine(b){
  var parts = [];
  if (u(b,'power')) parts.push('电 ' + u(b,'power'));
  if (u(b,'water')) parts.push('水 ' + u(b,'water'));
  if (u(b,'trash')) parts.push('垃圾 ' + u(b,'trash'));
  return parts.length ? parts.join(' / ') : '不耗资源';
}
function supplyLine(b){
  var parts = [];
  if (g(b,'power')) parts.push('发电 +' + g(b,'power'));
  if (g(b,'water')) parts.push('供水 +' + g(b,'water'));
  if (g(b,'trash')) parts.push('清运 +' + g(b,'trash'));
  return parts.length ? parts.join('，') : '无';
}
function cityTap(clientX, clientY){
  var r = cvsCity.getBoundingClientRect();
  var x = clientX - r.left - cityGeo.ox;
  var y = clientY - r.top - cityGeo.oy;
  if (cityGeo.cell <= 0) return;
  var gx = Math.floor(x / cityGeo.cell);
  var gy = Math.floor(y / cityGeo.cell);
  if (gx < 0 || gy < 0 || gx >= GRID_N || gy >= GRID_N) return;
  var idx = gy * GRID_N + gx;
  selIdx = idx;
  var id = S.grid[idx];
  if (!id) { openBlueprint(idx); return; }
  var b = BY_ID[id];
  var st = stats();
  var body =
    '<div class="row"><span>类别</span><b style="color:' + (CATS[b.cat] ? CATS[b.cat].color : '#fff') + '">' +
      (CATS[b.cat] ? CATS[b.cat].name : '—') + '</b></div>' +
    (b.popCap ? '<div class="row"><span>住房容量</span><b>+' + b.popCap + '</b></div>' : '') +
    (b.jobs ? '<div class="row"><span>就业岗位</span><b>+' + b.jobs + '</b></div>' : '') +
    (b.popCap ? '<div class="row"><span>人口税基</span><b>住满 +' + Math.round(b.popCap * TAX_PER_HEAD) + ' / 分</b></div>' : '') +
    (b.income ? '<div class="row"><span>名义收益</span><b>' + b.income + ' / 分' +
      (b.cat === 'com' ? '（人气 ×' + st.comSupport.toFixed(2) + '）' : '') + '</b></div>' : '') +
    '<div class="row"><span>消耗</span><b>' + usageLine(b) + '</b></div>' +
    '<div class="row"><span>产出</span><b>' + supplyLine(b) + '</b></div>' +
    '<div class="row"><span>幸福影响</span><b>' + (b.happy > 0 ? '+' : '') + b.happy + '</b></div>' +
    '<div class="row"><span>全城幸福</span><b>' + st.happy + ' · ' + moodOf(st.happy) + '</b></div>' +
    '<div class="row"><span>实际进账</span><b>' + fmt(st.rate) + ' / 分</b></div>' +
    '<div style="margin-top:8px">' + b.desc + '</div>';
  modal(b.name, body,
    [{ label: '拆除（返还 ' + Math.floor(b.cost * 0.5) + '）', fn: function(){
        S.grid[idx] = null;
        S.coins += Math.floor(b.cost * 0.5);
        selIdx = -1;
        sfx('demolish');   // 碎裂声 + 稍后一记金币声，返还这件事本身要有回音
        save(); updateHud(true);
        toast('已拆除，返还 ' + Math.floor(b.cost * 0.5) + ' 金币');
      } },
     { label: '关闭' }]);
}
var downPos = null;
cvsCity.addEventListener('pointerdown', function(e){ downPos = { x: e.clientX, y: e.clientY }; });
cvsCity.addEventListener('pointerup', function(e){
  if (!downPos) return;
  var d = Math.abs(e.clientX - downPos.x) + Math.abs(e.clientY - downPos.y);
  downPos = null;
  if (d > 12) return;
  cityTap(e.clientX, e.clientY);
});

// ---------------------------------------------------------------- 拼豆台
var cvsBoard = $('boardCanvas');
var B = null;
var curColor = null;
var eraserOn = false;
var painting = false;
var ironing = 0;
var ironStart = 0;

function openBuilder(b){
  B = { b: b, n: b.size, grid: [], cell: 0, pad: 0 };
  for (var i = 0; i < b.size * b.size; i++) B.grid.push(null);
  curColor = b.colors[0];
  eraserOn = false;
  ironing = 0;
  $('btnEraser').classList.remove('on');
  $('bvName').textContent = b.name;
  $('bvMeta').textContent = b.size + '×' + b.size + ' · ' + b.total + ' 颗 · ' + b.colors.length + ' 色';
  renderPalette();
  showOverlay($('buildView'));
  requestAnimationFrame(function(){ layoutBoard(); });
  updatePct();
}
function layoutBoard(){
  var stage = cvsBoard.parentNode;
  var W = stage.clientWidth, H = stage.clientHeight;
  if (W <= 0 || H <= 0) return;
  var n = B.n;
  var cell = Math.floor(Math.min(W, H) / (n + 0.9));
  var pad = Math.max(10, Math.round(cell * 0.42));
  B.cell = cell; B.pad = pad;
  var size = cell * n + pad * 2;
  cvsBoard.style.width = size + 'px';
  cvsBoard.style.height = size + 'px';
}
function renderPalette(){
  var box = $('palette');
  box.innerHTML = '';
  B.b.colors.forEach(function(k){
    var el = document.createElement('div');
    el.className = 'bead' + (k === curColor && !eraserOn ? ' sel' : '');
    el.style.background = 'radial-gradient(circle at 34% 30%, ' + shade(PAL[k].hex, 1.25) +
      ', ' + PAL[k].hex + ' 58%, ' + shade(PAL[k].hex, 0.72) + ')';
    el.dataset.k = k;
    var cnt = document.createElement('span');
    cnt.className = 'cnt';
    el.appendChild(cnt);
    el.onclick = function(){
      curColor = k;
      eraserOn = false;
      $('btnEraser').classList.remove('on');
      sfx('pick');
      renderPalette();
    };
    box.appendChild(el);
  });
  updatePaletteCount();
}
function updatePaletteCount(){
  var need = {}, have = {};
  var b = B.b;
  for (var i = 0; i < b.size * b.size; i++) {
    var ch = b.rows[Math.floor(i / b.size)].charAt(i % b.size);
    if (ch === '.') continue;
    need[ch] = (need[ch] || 0) + 1;
    if (B.grid[i] === ch) have[ch] = (have[ch] || 0) + 1;
  }
  var nodes = $('palette').children;
  for (var j = 0; j < nodes.length; j++) {
    var k = nodes[j].dataset.k;
    if (!k) continue;
    var h = have[k] || 0, nd = need[k] || 0;
    nodes[j].firstChild.textContent = h + '/' + nd;
    nodes[j].classList.toggle('done', h >= nd && nd > 0);
  }
}
function targetAt(x, y){ return B.b.rows[y].charAt(x); }
function updatePct(){
  var correct = 0;
  for (var i = 0; i < B.n * B.n; i++) {
    var t = targetAt(i % B.n, Math.floor(i / B.n));
    if (t !== '.' && B.grid[i] === t) correct++;
  }
  var pct = Math.floor(correct / B.b.total * 100);
  $('bvPct').textContent = pct + '%';
  return { correct: correct, pct: pct };
}
function boardPos(e){
  var r = cvsBoard.getBoundingClientRect();
  var x = e.clientX - r.left - B.pad;
  var y = e.clientY - r.top - B.pad;
  if (B.cell <= 0) return null;
  var gx = Math.floor(x / B.cell), gy = Math.floor(y / B.cell);
  if (gx < 0 || gy < 0 || gx >= B.n || gy >= B.n) return null;
  return { i: gy * B.n + gx, x: gx, y: gy };
}
function putBead(pos){
  if (ironing > 0) return;
  var val = eraserOn ? null : curColor;
  if (B.grid[pos.i] === val) return;
  B.grid[pos.i] = val;
  updatePaletteCount();
  var r = updatePct();
  sfx(eraserOn ? 'erase' : 'bead', r.pct);
  if (r.correct === B.b.total) checkDone();
}
function checkDone(){
  var extra = 0;
  for (var i = 0; i < B.n * B.n; i++) {
    var t = targetAt(i % B.n, Math.floor(i / B.n));
    if (t === '.' && B.grid[i]) extra++;
  }
  if (extra > 0) {
    sfx('deny');
    toast('还有 ' + extra + ' 颗多余的豆，用橡皮清掉');
    return;
  }
  sfx('done');     // 完成琶音与熨烫嘶声叠在一起起：先「拼好了」，再「融成一片」
  sfx('iron');
  ironing = 0.0001;
  ironStart = Date.now();
}
cvsBoard.addEventListener('pointerdown', function(e){
  var p = boardPos(e);
  if (!p) return;
  painting = true;
  putBead(p);
});
cvsBoard.addEventListener('pointermove', function(e){
  if (!painting) return;
  var p = boardPos(e);
  if (p) putBead(p);
});
window.addEventListener('pointerup', function(){ painting = false; });
window.addEventListener('pointercancel', function(){ painting = false; });

function drawBoard(){
  if (!B) return;
  var f = fitCanvas(cvsBoard);
  if (!f) return;
  var g2 = f.g;
  var n = B.n, cell = B.cell, pad = B.pad;
  var size = cell * n + pad * 2;
  g2.clearRect(0, 0, size, size);

  g2.save();
  rrect(g2, 0, 0, size, size, Math.max(10, pad * 0.7));
  var wg = g2.createLinearGradient(0, 0, size, size);
  wg.addColorStop(0, '#6B4A2E');
  wg.addColorStop(0.5, '#4E3520');
  wg.addColorStop(1, '#3A2718');
  g2.fillStyle = wg;
  g2.fill();
  g2.restore();

  g2.save();
  rrect(g2, pad - 6, pad - 6, cell * n + 12, cell * n + 12, Math.max(6, pad * 0.4));
  var bg = g2.createLinearGradient(0, pad - 6, 0, pad + cell * n + 6);
  bg.addColorStop(0, '#232A36');
  bg.addColorStop(1, '#161C26');
  g2.fillStyle = bg;
  g2.fill();
  g2.strokeStyle = 'rgba(0,0,0,0.45)';
  g2.lineWidth = 2;
  g2.stroke();
  g2.restore();

  g2.save();
  for (var y = 0; y < n; y++) {
    for (var x = 0; x < n; x++) {
      var cx = pad + x * cell + cell / 2;
      var cy = pad + y * cell + cell / 2;
      var t = targetAt(x, y);
      g2.beginPath();
      g2.arc(cx, cy, cell * 0.07, 0, Math.PI * 2);
      g2.fillStyle = 'rgba(255,255,255,0.05)';
      g2.fill();
      if (t !== '.' && !B.grid[y * n + x]) {
        g2.save();
        g2.globalAlpha = 0.22;
        rrect(g2, pad + x * cell + cell * 0.14, pad + y * cell + cell * 0.14,
          cell * 0.72, cell * 0.72, cell * 0.2);
        g2.fillStyle = PAL[t].hex;
        g2.fill();
        g2.restore();
      }
    }
  }
  g2.restore();

  for (var i = 0; i < n * n; i++) {
    var v = B.grid[i];
    if (!v) continue;
    var gx = i % n, gy = Math.floor(i / n);
    drawBead(g2, pad + gx * cell + cell / 2, pad + gy * cell + cell / 2,
      cell * 0.44, PAL[v].hex, ironing);
  }

  if (ironing > 0) {
    g2.save();
    g2.globalAlpha = ironing * 0.5;
    var ig = g2.createLinearGradient(pad, pad, pad + cell * n, pad + cell * n);
    ig.addColorStop(0, 'rgba(255,255,255,0)');
    ig.addColorStop(0.5, 'rgba(255,255,255,0.55)');
    ig.addColorStop(1, 'rgba(255,255,255,0)');
    rrect(g2, pad - 6, pad - 6, cell * n + 12, cell * n + 12, 6);
    g2.fillStyle = ig;
    g2.fill();
    g2.restore();
  }
}
function afterIron(){
  if (!B) return;
  var b = B.b;
  ironing = 0;
  hideOverlay($('buildView'));
  B = null;
  placeBuilding(b, false);
}

// ---------------------------------------------------------------- 背景微尘
var cvsDust = $('dust');
var dust = [];
(function initDust(){
  for (var i = 0; i < 34; i++) {
    dust.push({
      x: Math.random(), y: Math.random(),
      r: 0.6 + Math.random() * 1.6,
      s: 0.15 + Math.random() * 0.5,
      a: 0.15 + Math.random() * 0.45,
      p: Math.random() * Math.PI * 2
    });
  }
})();
function drawDust(){
  var f = fitCanvas(cvsDust);
  if (!f) return;
  var g2 = f.g;
  g2.clearRect(0, 0, f.w, f.h);
  var t = cityT / 1000;
  for (var i = 0; i < dust.length; i++) {
    var d = dust[i];
    var y = (d.y - t * d.s * 0.02) % 1;
    if (y < 0) y += 1;
    var x = d.x + Math.sin(t * 0.35 + d.p) * 0.02;
    g2.beginPath();
    g2.arc(x * f.w, y * f.h, d.r, 0, Math.PI * 2);
    g2.fillStyle = 'rgba(245,212,131,' + d.a * (0.5 + 0.5 * Math.sin(t + d.p)) + ')';
    g2.fill();
  }
}

// ---------------------------------------------------------------- 主循环
var lastFrame = 0;
function loop(ts){
  var now = Date.now();
  if (!lastFrame) lastFrame = now;
  var dt = Math.min(now - lastFrame, 1000);
  lastFrame = now;
  cityT = ts || now;

  var st = stats();
  CUR = st;
  tickPop(dt, st);
  tickTrash(dt, st);
  checkAlerts(st);
  if (st.rate > 0) {
    S.coins += st.rate * dt / 60000;
    S.last = now;
  }
  if (B && ironing > 0) {
    ironing = clamp((now - ironStart) / 900, 0.0001, 1);
    if (now - ironStart > 1500) afterIron();
  }

  drawCity();
  drawBoard();
  drawDust();
  updateHud(false);
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- 按钮
$('btnBlueprint').onclick = function(){ openBlueprint(-1); };
$('bpClose').onclick = function(){ hideOverlay($('blueprintView')); };
$('btnUtil').onclick = openUtil;
$('utilClose').onclick = function(){ hideOverlay($('utilView')); };
$('btnData').onclick = openData;
$('dataClose').onclick = function(){ hideOverlay($('dataView')); };
$('btnReset').onclick = function(){
  // 按钮顺序沿用「拆除 / 关闭」的既有约定：破坏性操作在左、用朴素样式，
  // 右侧最后一个按钮才是高亮的「取消」，避免误触。
  modal('重置城市',
    '城市回到<b>开局状态</b>：所有建筑拆除，人口归零，金币回到 ' + START_COINS + '，' +
    '已经拼过的图纸也要<b>重新拼一遍</b>。<br>' +
    '<span style="color:#6E7A8D">这一步不可撤销。</span>',
    [{ label: '确认重置', kind: 'danger', fn: function(){
        resetGame();
        hideOverlay($('dataView'));   // 关掉面板，让玩家直接看见空城
        toast('城市已重置，重新开始吧');
      } },
     { label: '取消' }]);
};
$('btnHelp').onclick = openHelp;
$('helpClose').onclick = function(){ hideOverlay($('helpView')); };
$('bvBack').onclick = function(){
  if (ironing > 0) return;
  hideOverlay($('buildView'));
  B = null;
};
$('btnEraser').onclick = function(){
  eraserOn = !eraserOn;
  $('btnEraser').classList.toggle('on', eraserOn);
  sfx('pick');
  renderPalette();
};
$('btnHint').onclick = function(){
  if (!B || ironing > 0) return;
  for (var i = 0; i < B.n * B.n; i++) {
    var t = targetAt(i % B.n, Math.floor(i / B.n));
    if (t !== '.' && B.grid[i] !== t) {
      B.grid[i] = t;
      updatePaletteCount();
      var r = updatePct();
      sfx('bead', r.pct);
      if (r.correct === B.b.total) checkDone();
      return;
    }
  }
  sfx('deny');
  toast('没有可提示的位置了');
};
$('btnClear').onclick = function(){
  if (!B || ironing > 0) return;
  for (var i = 0; i < B.grid.length; i++) B.grid[i] = null;
  updatePaletteCount();
  updatePct();
  sfx('erase');
};
function hideHint(){
  var h = $('hintText');
  if (h && !h.classList.contains('gone')) h.classList.add('gone');
}

// ---------------------------------------------------------------- 启动
var offline = load();
if (offline > 60000) {
  var st0 = stats();
  var capped = Math.min(offline, OFFLINE_CAP);
  var earn = st0.rate * capped / 60000;
  tickPop(capped, st0);
  tickTrash(capped, st0);
  if (earn >= 1) {
    S.coins += earn;
    var mins = Math.floor(capped / 60000);
    setTimeout(function(){
      modal('离线收租',
        '你离开了 <b>' + (mins >= 60 ? Math.floor(mins / 60) + ' 小时 ' + (mins % 60) + ' 分' : mins + ' 分钟') +
        '</b>。<br>城市替你赚了 <b style="color:#F5D483">' + fmt(earn) + '</b> 枚金币。' +
        (offline > OFFLINE_CAP ? '<br><span style="color:#6E7A8D">（离线收益最多结算 4 小时）</span>' : ''),
        [{ label: '收下' }]);
    }, 500);
  }
}
S.last = Date.now();

$('btnSound').classList.toggle('muted', !soundOn);
$('btnSound').onclick = function(){
  setSound(!soundOn);
  if (soundOn) sfx('pick');   // 开的时候给一声确认，关的时候本来就该安静
};
// 捕获阶段挂在 document 上：任何一次点击都能解锁音频，不必给每个按钮单独埋点
document.addEventListener('pointerdown', audUnlock, true);

window.addEventListener('resize', function(){ if (B) layoutBoard(); });
document.addEventListener('visibilitychange', function(){
  if (document.hidden) {
    save();
    // 挂起整个 AudioContext：后台还在跑振荡器是白烧电，且部分宿主会被系统掐掉
    if (audReady() && AUD.suspend) AUD.suspend();
  } else {
    S.last = Date.now();
    if (audReady() && AUD.resume) AUD.resume();
    bgmSchedule();
  }
});
window.addEventListener('beforeunload', save);

CUR = stats();
updateHud(true);
save();
requestAnimationFrame(loop);
})();
