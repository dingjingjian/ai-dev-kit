(function(){
  'use strict';

  var UNITS=window.UNITS||[];
  var FACTIONS=window.FACTIONS||[];
  var CUSTOM_FACTION=window.CUSTOM_FACTION||{key:'custom',name:'自选军团',units:[],unitIdx:[]};

  /* ===== 索引：阵营的 units 是 id 数组，启动期换成 UNITS 下标数组 ===== */
  var UINDEX={};
  UNITS.forEach(function(u,i){UINDEX[u.id]=i;});
  var BAD_IDS=[];
  FACTIONS.forEach(function(f){
    f.unitIdx=[];
    for(var i=0;i<f.units.length;i++){
      var k=UINDEX[f.units[i]];
      if(k==null){BAD_IDS.push(f.key+':'+f.units[i]);continue;}
      f.unitIdx.push(k);
    }
  });
  if(BAD_IDS.length&&window.console)console.warn('[units] 未找到的兵种 id：',BAD_IDS);
  CUSTOM_FACTION.unitIdx=[];

  /* ===== DOM 引用 ===== */
  var gearColEl=document.getElementById('gearCol');

  var routeListEl=document.getElementById('routeList');
  var gateTitleEl=document.getElementById('gateTitle');
  var gateSubtitleEl=document.getElementById('gateSubtitle');
  var gateRouteNameEl=document.getElementById('gateRouteName');
  var tourCrumbEl=document.getElementById('tourCrumb');
  var tourBodyEl=document.getElementById('tourBody');
  var tourImgEl=document.getElementById('tourImg');
  var tourNameEl=document.getElementById('tourName');
  var tourLocEl=document.getElementById('tourLoc');
  var tourIntroEl=document.getElementById('tourIntro');
  var tourTraitsEl=document.getElementById('tourTraits');
  var tourPaddockEl=document.getElementById('tourPaddock');
  var tourTaglineEl=document.getElementById('tourTagline');
  var tourDataEl=document.getElementById('tourData');
  var tcPrevBtn=document.getElementById('tcPrev');
  var tcNextBtn=document.getElementById('tcNext');
  var tcQuitBtn=document.getElementById('tcQuit');
  var summaryBodyEl=document.getElementById('summaryBody');
  var sumCountEl=document.getElementById('sumCount');
  var sumKindEl=document.getElementById('sumKind');
  var sumRegionEl=document.getElementById('sumRegion');
  var sumBriefEl=document.getElementById('sumBrief');
  var sumBarsEl=document.getElementById('sumBars');
  var sumDishesEl=document.getElementById('sumDishes');
  var scBackBtn=document.getElementById('scBack');
  var scAgainBtn=document.getElementById('scAgain');

  var bdBackBtn=document.getElementById('bdBack');
  var bdTitleEl=document.getElementById('builderTtl');
  var bdPickedEl=document.getElementById('bdPicked');
  var bdPoolEl=document.getElementById('bdPool');
  var bdStartBtn=document.getElementById('bdStart');
  var bdRandomBtn=document.getElementById('bdRandom');
  var builderBodyEl=document.getElementById('builderBody');
  var hintEl=document.getElementById('hint');
  var bgmBtnEl=document.getElementById('bgmBtn');

  /* ================= 常量 =================
   * STATS_DIMS 的顺序与 UNITS[].stats 一一对应，**不可随意调换**。 */
  var STATS_DIMS=['近战','护甲','士气','机动','远程','冲锋'];
  var KIND_LABEL={inf:'重装步兵',spear:'长矛步兵',light:'轻步兵与散兵',missile:'远程投射',
    cavalry:'冲击骑兵',cavalry_missile:'弓骑兵',beast:'战象·战车·战犬'};
  var KIND_ORDER=['inf','spear','light','missile','cavalry','cavalry_missile','beast'];
  var TIER_LABEL={levy:'征召',regular:'正规',elite:'精锐',special:'特殊'};
  var STORE_KEY='rtw3d.customLegion';
  var ROMAN=['','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];

  /* ================= 状态 ================= */
  var st={page:'factions',faction:null,reviewIdx:0,sel:0,custom:[]};

  /* ================= 自动播放演示模式（?demo / ?demo=macedon / ?loop）=================
   * 用途：小红书宣传片实机录制。全程零手动操作——
   * 阵营页停留数秒后自动选阵营 → 凯旋门自动播放（自带 7.1s）→ 检阅页每队定时自动前进
   * → 军团志停留后结束（带 ?loop 则回到阵营页循环重播）。 */
  var QP=(location.search?new URLSearchParams(location.search):new URLSearchParams(''));
  var DEMO=QP.has('demo');
  var DEMO_LOOP=QP.has('loop');
  var DEMO_FACTION=(QP.get('demo')||'rome');
  var DEMO_FACTION_MS=3000;    // 阵营选择页停留
  var DEMO_REVIEW_MS=3400;     // 每队停留
  var DEMO_SUMMARY_MS=5200;    // 军团志页停留
  /* ?warm=N（秒）：演示开始前先静置 N 秒，给软件渲染下的着色器 / 地球组件预热。 */
  var DEMO_WARM_MS=Math.max(0,(parseInt(QP.get('warm'),10)||0))*1000;
  var demoTimers=[];
  function demoAfter(ms,fn){var id=setTimeout(fn,ms);demoTimers.push(id);return id;}
  function demoClear(){for(var i=0;i<demoTimers.length;i++)clearTimeout(demoTimers[i]);demoTimers=[];}
  function demoSmoothScroll(el,to,duration,cb){
    if(!el)return cb&&cb();
    var start=el.scrollTop,t0=null;
    function step(t){
      if(!t0)t0=t;
      var p=Math.min(1,(t-t0)/Math.max(1,duration));
      p=p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2;
      el.scrollTop=start+(to-start)*p;
      if(p<1)requestAnimationFrame(step);
      else if(cb)cb();
    }
    requestAnimationFrame(step);
  }
  function startDemo(){
    var sec=document.querySelector('.route-section');
    if(sec){
      demoAfter(500,function(){
        var max=Math.max(0,sec.scrollHeight-sec.clientHeight);
        if(max>0){
          demoSmoothScroll(sec,max,1200,function(){
            demoAfter(200,function(){demoSmoothScroll(sec,0,700);});
          });
        }
      });
    }
    demoAfter(DEMO_FACTION_MS,function(){
      if(st.page!=='factions')return;
      var idx=0;
      for(var i=0;i<FACTIONS.length;i++){if(FACTIONS[i].key===DEMO_FACTION){idx=i;break;}}
      enterGate(FACTIONS[idx]);
    });
  }
  function demoReviewStep(){
    demoAfter(DEMO_REVIEW_MS,function(){
      if(st.page!=='review')return;
      reviewNext();
      if(st.page==='review')demoReviewStep();
    });
  }
  function demoEnd(){
    demoClear();
    if(DEMO_LOOP){backToFactions();demoAfter(1600,startDemo);}
  }

  /* ================= 自选军团存档（localStorage，失败即静默降级）================= */
  function loadCustom(){
    try{
      var raw=window.localStorage.getItem(STORE_KEY);
      if(!raw)return [];
      var arr=JSON.parse(raw);
      if(!arr||typeof arr.length!=='number')return [];
      var out=[];
      for(var i=0;i<arr.length;i++){
        var v=parseInt(arr[i],10);
        if(!isNaN(v)&&v>=0&&v<UNITS.length&&out.indexOf(v)<0)out.push(v);
      }
      return out;
    }catch(e){return [];}
  }
  function saveCustom(){
    try{window.localStorage.setItem(STORE_KEY,JSON.stringify(st.custom));}catch(e){}
  }

  /* 当前阵营对象：预设 8 个，或玩家自选那支 */
  function curFaction(){return st.faction||FACTIONS[0];}

  /* ================= 工具函数 ================= */
  function fmtN(v){return String(v).replace(/\B(?=(\d{3})+(?!\d))/g,',');}
  function roman(n){return ROMAN[n]||String(n);}
  function menOf(u){return (u&&typeof u.men==='number')?u.men:0;}

  /* ================= 颜色与兵种图（图可缺，回退色卡）================= */
  function hex2rgb(h){h=String(h).replace('#','');return [parseInt(h.substr(0,2),16),parseInt(h.substr(2,2),16),parseInt(h.substr(4,2),16)];}
  function rgb2hex(r){function f(v){v=Math.max(0,Math.min(255,Math.round(v)));return ('0'+v.toString(16)).slice(-2);}return '#'+f(r[0])+f(r[1])+f(r[2]);}
  function lighten(h,a){var r=hex2rgb(h);return rgb2hex([r[0]+(255-r[0])*a,r[1]+(255-r[1])*a,r[2]+(255-r[2])*a]);}
  function darken(h,a){var r=hex2rgb(h);return rgb2hex([r[0]*(1-a),r[1]*(1-a),r[2]*(1-a)]);}
  function plateGrad(c){return 'radial-gradient(circle at 32% 26%,'+lighten(c,.3)+','+c+' 56%,'+darken(c,.36)+' 100%)';}

  /* 兵种图只有**一套**：写实，路径写在 units.js 的 img 字段里。
     兵牌那套（`assets/units/card/<id>.webp`）2026-09-22 **整组退役**：
     画风不合要求、效果也不行，罗马也不再特殊 —— 48 支一律走写实，缺图退色卡。 */
  var IMG_OK={};   /* id -> undefined 未探测 / null 加载中 / true 已载入 / false 缺失 */
  function preloadImages(){
    UNITS.forEach(function(u){
      if(!u.img||IMG_OK[u.id]!==undefined)return;
      IMG_OK[u.id]=null;
      var im=new Image();
      im.onload=function(){IMG_OK[u.id]=true;repaintImg(u);};
      im.onerror=function(){IMG_OK[u.id]=false;};
      im.src=u.img;
    });
  }
  preloadImages();

  function thumbStyle(u){
    /* contain 而非 cover：写实是 1:1 方图，遇到非方形图位也只留深色边，绝不裁头脚 */
    if(u.img&&IMG_OK[u.id]===true)
      return "background-image:url('"+u.img+"');background-size:contain;background-repeat:no-repeat;background-position:center";
    return 'background:'+plateGrad(u.color||'#8a3a2a');
  }
  function repaintImg(u){
    if(st.page==='review'&&UNITS[st.sel]===u)tourImgEl.setAttribute('style',thumbStyle(u));
  }

  /* ================= 装备拆解（检阅页右列）=================
   * 数据源：assets/gear.js 的 GEAR（受控词表）与 KIT（兵种 -> 槽位引用）。
   * 三条口径：
   *   ① 空槽不渲染 —— 一件没有就不占位。
   *   ② 说明固定两行（CSS 的 -webkit-line-clamp:2），行高一致，48 个兵种横比时槽位对得齐。
   *   ③ 图缺了退成槽位名文字，不留空框（GEAR_OK 三态缓存，与兵种图同一套口径）。
   * 只探测当前这一屏用到的那几件（按 URL 缓存），不预载全部 52 张。 */
  var GEAR_OK={};            /* gearId -> true 已载入 / false 缺失 / undefined 未探测 */
  var SLOT_LABEL={};(function(){for(var i=0;i<GEAR_SLOTS.length;i++)SLOT_LABEL[GEAR_SLOTS[i][0]]=GEAR_SLOTS[i][1];})();
  function gearImgOf(id){return './assets/gear/'+id+'.webp';}
  /* 按槽位顺序取出这个兵种的装备；空槽与词表里查不到的 id 都不进列表 */
  function gearItems(u){
    var kit=(u&&KIT[u.id])||{},out=[],i,sk,id,g;
    for(i=0;i<GEAR_SLOTS.length;i++){
      sk=GEAR_SLOTS[i][0];id=kit[sk];
      if(!id)continue;
      g=GEAR[id];
      if(!g)continue;
      out.push({slot:sk,label:SLOT_LABEL[sk],id:id,name:g.name,note:g.note});
    }
    return out;
  }
  function probeGear(items){
    for(var i=0;i<items.length;i++){
      (function(it){
        if(GEAR_OK[it.id]!==undefined)return;
        GEAR_OK[it.id]=null;
        var im=new Image();
        im.onload=function(){GEAR_OK[it.id]=true;repaintGear();};
        im.onerror=function(){GEAR_OK[it.id]=false;};
        im.src=gearImgOf(it.id);
      })(items[i]);
    }
  }
  /* 图到位后把那一格从「槽位名文字」换成图；只改 class 与背景，不重排 */
  function repaintGear(){
    if(st.page!=='review'||!gearColEl)return;
    var u=UNITS[st.sel];if(!u)return;
    var items=gearItems(u),cells=gearColEl.querySelectorAll('.gear-ic');
    for(var i=0;i<cells.length&&i<items.length;i++){
      if(GEAR_OK[items[i].id]===true){
        cells[i].className='gear-ic has-img';
        cells[i].style.backgroundImage='url("'+gearImgOf(items[i].id)+'")';
      }
    }
  }
  function renderGear(u){
    if(!gearColEl)return;
    var items=gearItems(u),h='',i,it,ok;
    h+='<div class="gear-ttl">装备拆解 · '+items.length+' 件</div>';
    for(i=0;i<items.length;i++){
      it=items[i];ok=(GEAR_OK[it.id]===true);
      h+='<div class="gear-i">'+
           '<span class="gear-ic'+(ok?' has-img':'')+'"'+
             (ok?' style="background-image:url(\''+gearImgOf(it.id)+'\')"':'')+'>'+
             '<i>'+it.label+'</i></span>'+
           '<span class="gear-tx">'+
             '<span class="gear-nm">'+it.name+'</span>'+
             '<span class="gear-no">'+it.note+'</span>'+
           '</span>'+
         '</div>';
    }
    gearColEl.innerHTML=h;
    probeGear(items);
  }

  /* ================= 阵营选择页渲染 ================= */
  /* 一张阵营军牌：主题色来自阵营对象，横幅缺图自动回退大理石与渐变 */
  function factionCardHTML(f,ride,extra){
    var n=f.unitIdx.length,kinds={},regs={},i,dots='',theme=
      '--rc-dark:'+f.dark+';--rc-mid:'+f.mid+';--rc-light:'+f.light+
      ';--rc-accent:'+f.accent+';--rc-accent-2:'+f.accent2;
    for(i=0;i<n;i++){var u=UNITS[f.unitIdx[i]];kinds[u.kind]=1;regs[u.region]=1;}
    for(i=0;i<5;i++)dots+='<i'+(i<f.might?' class="on"':'')+'></i>';
    return '<button class="route-card'+(extra||'')+'" data-ride="'+ride+'">'+
      '<div class="route-card-bg" style="'+theme+';--rc-banner:url(\'./assets/tex/faction-'+f.key+'.webp\')"></div>'+
      '<div class="route-card-inner" style="'+theme+'">'+
        '<div class="route-card-head">'+
          '<div class="route-name">'+f.name+'</div>'+
          '<div class="route-latin">'+f.latin+'</div>'+
        '</div>'+
        '<div class="route-desc">'+f.desc+'</div>'+
        '<div class="route-meta">'+
          '<span class="route-stat"><b>'+n+'</b>个兵种</span>'+
          '<span class="route-stat"><b>'+Object.keys(kinds).length+'</b>种类型</span>'+
          '<span class="route-stat"><b>'+Object.keys(regs).length+'</b>个征召行省</span>'+
          (f.custom?'':'<span class="route-stat">实力 <span class="route-intensity">'+dots+'</span></span>')+
        '</div>'+
      '</div>'+
    '</button>';
  }
  function renderFactions(){
    var html='',i;
    for(i=0;i<FACTIONS.length;i++)html+=factionCardHTML(FACTIONS[i],i,'');
    CUSTOM_FACTION.unitIdx=st.custom;
    CUSTOM_FACTION.desc=st.custom.length
      ?'自己跨阵营抽调的一支军团，按「我的军团」里的顺序逐队检阅。'
      :'还没有编制。进名录挑选兵种，按自己的顺序编成一支军团——怎么搭配，你说了算。';
    html+=factionCardHTML(CUSTOM_FACTION,'custom',' is-custom');
    routeListEl.innerHTML=html;
  }
  routeListEl.addEventListener('click',function(e){
    var btn=e.target;
    while(btn&&btn!==routeListEl&&btn.tagName!=='BUTTON')btn=btn.parentNode;
    if(!btn||btn===routeListEl||btn.tagName!=='BUTTON')return;
    var ride=btn.getAttribute('data-ride');
    if(ride==='custom'){enterBuilder();return;}
    var idx=parseInt(ride,10);
    if(isNaN(idx))return;
    enterGate(FACTIONS[idx]);
  });

  /* ================= 自选军团页 =================
   * 从 48 个兵种里挑，按挑选顺序编成一支军团；存档在本机 localStorage。
   * 编完后走与预设阵营完全相同的「凯旋门 → 检阅 → 军团志」流程。 */
  function closestAttr(el,attr,root){
    while(el&&el!==root){
      if(el.getAttribute&&el.getAttribute(attr)!==null)return el;
      el=el.parentNode;
    }
    return null;
  }
  function customFactionObj(){
    CUSTOM_FACTION.unitIdx=st.custom.slice();
    return CUSTOM_FACTION;
  }
  function renderPicked(){
    var h='',i;
    if(!st.custom.length){
      h='<div class="bd-picked-empty">还没选兵种 · 从下面的名录里点「＋」加入</div>';
    }else{
      for(i=0;i<st.custom.length;i++){
        var u=UNITS[st.custom[i]];
        h+='<div class="bd-chip">'+
          '<span class="bd-seq">'+('0'+(i+1)).slice(-2)+'</span>'+
          '<span class="bd-dot" style="background:'+(u.color||'#8a3a2a')+'"></span>'+
          '<span class="bd-nm">'+u.name+'</span>'+
          '<span class="bd-era">'+KIND_LABEL[u.kind]+'</span>'+
          '<button class="bd-mini" data-mv="'+i+'" data-dir="-1"'+(i===0?' disabled':'')+' title="上移">↑</button>'+
          '<button class="bd-mini" data-mv="'+i+'" data-dir="1"'+(i===st.custom.length-1?' disabled':'')+' title="下移">↓</button>'+
          '<button class="bd-mini bd-del" data-del="'+i+'" title="移出编制">×</button>'+
        '</div>';
      }
    }
    bdPickedEl.innerHTML=h;
    bdTitleEl.textContent='自选军团 · 自行编排（已选 '+st.custom.length+' 队）';
    bdStartBtn.disabled=!st.custom.length;
  }
  function renderPool(){
    var h='',g,i;
    for(g=0;g<KIND_ORDER.length;g++){
      var kind=KIND_ORDER[g],rows='';
      for(i=0;i<UNITS.length;i++){
        var u=UNITS[i];
        if(u.kind!==kind)continue;
        var on=st.custom.indexOf(i)>=0;
        var fac='';
        for(var k=0;k<FACTIONS.length;k++)if(FACTIONS[k].key===u.faction){fac=FACTIONS[k].name;break;}
        rows+='<button class="bd-item'+(on?' picked':'')+'" data-add="'+i+'"'+(on?' disabled':'')+'>'+
          '<span class="bd-thumb" style="'+thumbStyle(u)+'"></span>'+
          '<span class="bd-info">'+
            '<span class="bd-nm2">'+u.name+'</span>'+
            '<span class="bd-sub">'+fac+' · '+u.region+' · 编制 '+menOf(u)+' 人 · 近战 '+((u.stats&&u.stats[0])||0)+'/5</span>'+
          '</span>'+
          '<span class="bd-add">'+(on?'✓':'＋')+'</span>'+
        '</button>';
      }
      if(rows)h+='<div class="bd-era-group"><div class="bd-era-head">'+KIND_LABEL[kind]+'</div>'+rows+'</div>';
    }
    bdPoolEl.innerHTML=h;
  }
  function renderBuilder(){renderPicked();renderPool();}
  function enterBuilder(){
    st.page='builder';
    document.body.className='mode-builder';
    document.body.setAttribute('data-faction','custom');
    renderBuilder();
    builderBodyEl.scrollTop=0;
    toast('点「＋」把兵种加进编制 · 顺序即检阅顺序');
  }
  function exitBuilder(){
    hideToast();
    st.page='factions';
    document.body.className='mode-factions';
    document.body.removeAttribute('data-faction');
    renderFactions();
  }
  bdPoolEl.addEventListener('click',function(e){
    var b=closestAttr(e.target,'data-add',bdPoolEl);
    if(!b||b.disabled)return;
    var i=parseInt(b.getAttribute('data-add'),10);
    if(isNaN(i)||i<0||i>=UNITS.length||st.custom.indexOf(i)>=0)return;
    st.custom.push(i);saveCustom();renderBuilder();
  });
  bdPickedEl.addEventListener('click',function(e){
    var del=closestAttr(e.target,'data-del',bdPickedEl);
    if(del){
      var d=parseInt(del.getAttribute('data-del'),10);
      if(!isNaN(d)){st.custom.splice(d,1);saveCustom();renderBuilder();}
      return;
    }
    var mv=closestAttr(e.target,'data-mv',bdPickedEl);
    if(!mv||mv.disabled)return;
    var k=parseInt(mv.getAttribute('data-mv'),10),dir=parseInt(mv.getAttribute('data-dir'),10);
    var j=k+(dir<0?-1:1);
    if(isNaN(k)||j<0||j>=st.custom.length)return;
    var tmp=st.custom[k];st.custom[k]=st.custom[j];st.custom[j]=tmp;
    saveCustom();renderBuilder();
  });
  bdRandomBtn.addEventListener('click',function(){
    var pool=[],i;
    for(i=0;i<UNITS.length;i++)pool.push(i);
    for(i=pool.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=pool[i];pool[i]=pool[j];pool[j]=t;}
    st.custom=pool.slice(0,8).sort(function(a,b){return a-b;});
    saveCustom();renderBuilder();
    toast('已随机编定 8 队 · 可继续调整顺序');
  });
  bdStartBtn.addEventListener('click',function(){
    if(!st.custom.length)return;
    enterGate(customFactionObj());
  });
  bdBackBtn.addEventListener('click',exitBuilder);

  /* ================= 过渡页（即将检阅） =================
   * 主素材是**按阵营取的一张过渡画面**：⑨ assets/tex/gate-<key>.webp，整段就是 7.1s
   * 的缓慢推近（.gate-shot 的 shotPush 动画），播完即进检阅页。
   * 取哪张图由 setGateArt() 写进 CSS 自定义属性 --gate-art，两层链一并定在 CSS 里：
   *   ⑨ gate-<key> → 该阵营横幅 ⑧
   * 前一层 404 就露出下一层，JS 不参与判定 —— 没有「素材加载 / 起播失败」这类会卡住的
   * 状态分支，页面永远停在这 7.1s 上，不存在提前或在原地卡死的可能。
   * （旧的「通用凯旋门」③⑤⑥ 已整组退役：图里画进了现代相机，且只会在信箱边里露出来。） */
  var GATE_MS=7100;
  var gateTimer=null;
  var GATE_ELS='.gate-shot,.gate-caption,.gate-title,.gate-subtitle,.gate-route-name';
  function resetGateAnim(){
    var els=document.querySelectorAll(GATE_ELS);
    for(var i=0;i<els.length;i++){
      els[i].style.animation='none';
      void els[i].offsetWidth;
      els[i].style.animation='';
    }
  }
  /* 字幕节奏按整段时长排：CSS 里那组延迟是照 7.1s 写的，
     整段淡出始终落在结束前 0.9s。 */
  function setGateTiming(ms){
    var d={'.gate-title':ms*.14,'.gate-subtitle':ms*.21,'.gate-route-name':ms*.29};
    for(var k in d){
      var e1=document.querySelector(k);
      if(e1)e1.style.animationDelay=d[k]+'ms';
    }
    var cap=document.querySelector('.gate-caption');
    if(cap)cap.style.animationDelay=Math.max(0,ms-900)+'ms';
  }
  /* 按阵营写过渡画面：专属图在前、该阵营横幅在后。
     横幅是**零成本的顶替**（9 个阵营天然各不相同），所以专属图还没出画时，
     这一页也已经「每阵营一张不同的图」；⑨ 落位后自动接管，不用改代码。
     两层都没有（理论上不会）就退页面底色 —— 字幕与 7.1s 计时都在这支 JS 里，流程照常。 */
  function gateArtChain(key){
    return ['./assets/tex/gate-'+key+'.webp','./assets/tex/faction-'+key+'.webp'];
  }
  function setGateArt(key){
    var stage=document.querySelector('.gate-stage');
    if(!stage)return;
    var css=gateArtChain(key).map(function(u){return "url('"+u+"')";}).join(',');
    stage.style.setProperty('--gate-art',css);
  }
  function leaveGate(){
    if(gateTimer){clearTimeout(gateTimer);gateTimer=null;}
  }
  function enterGate(faction){
    hideToast();
    st.faction=faction;
    st.page='gate';
    document.body.className='mode-gate';
    document.body.setAttribute('data-faction',faction.key);
    /* 这一页写的是**你选中的这个阵营**，不是 app 的名字：
       标题＝阵营名，副标题＝它的拉丁名。「SPQR · LEGIONVM CODEX」是罗马专属的国号与书名，
       只留给罗马那一档，别的阵营挂上它就是张冠李戴。
       底下那行改成队数——阵营名已经在标题上了，再写一遍是重复。 */
    gateTitleEl.textContent=faction.name;
    gateSubtitleEl.textContent=(faction.key==='rome')
      ? 'SPQR · LEGIONVM CODEX'
      : (faction.latin||'');
    gateRouteNameEl.textContent='即将检阅 · '+faction.unitIdx.length+' 队';
    setGateArt(faction.key);
    if(gateTimer)clearTimeout(gateTimer);
    resetGateAnim();
    setGateTiming(GATE_MS);
    gateTimer=setTimeout(enterReview,GATE_MS);
  }

  /* ================= 检阅页 ================= */
  function enterReview(){
    leaveGate();
    var f=st.faction;
    if(!f||!f.unitIdx.length){quitReview();return;}
    st.reviewIdx=0;
    st.sel=f.unitIdx[0];
    st.page='review';
    document.body.className='mode-review';
    document.body.setAttribute('data-faction',f.key);
    showReviewUnit();
    if(DEMO)demoReviewStep();
    toast('检阅开始 · 逐队看过它的装备与战力');
  }
  function showReviewUnit(){
    var f=curFaction();
    var idx=f.unitIdx[st.reviewIdx];
    st.sel=idx;
    var u=UNITS[idx];
    var seq=st.reviewIdx+1;
    var s=u.stats||[0,0,0,0,0,0];
    tourImgEl.setAttribute('style',thumbStyle(u));
    tourNameEl.textContent=u.name;
    tourPaddockEl.textContent=TIER_LABEL[u.tier]||'正规';
    tourLocEl.textContent=u.region+' · '+u.city;
    tourIntroEl.textContent=u.intro;
    tourTraitsEl.innerHTML=(u.traits||[]).map(function(t){return '<span class="tour-trait">'+t+'</span>';}).join('');
    tourTaglineEl.innerHTML=(u.tags||[]).join('<i>·</i>');
    tourDataEl.innerHTML='编制 <em>'+fmtN(menOf(u))+'</em> 人<i>|</i>近战 <em>'+s[0]+'/5</em><i>|</i>护甲 <em>'+s[1]+'/5</em>';
    tourCrumbEl.textContent=f.name+' · '+(KIND_LABEL[u.kind]||'')+' · 第 '+seq+' / '+f.unitIdx.length+' 队';
    tcPrevBtn.disabled=(st.reviewIdx===0);
    tcNextBtn.textContent=(seq>=f.unitIdx.length)?'军团志 ›':'下一队 ›';
    renderGear(u);
    tourBodyEl.scrollTop=0;
  }
  function reviewNext(){
    var f=curFaction();
    if(st.reviewIdx+1>=f.unitIdx.length){showSummary();return;}
    st.reviewIdx++;
    showReviewUnit();
  }
  function reviewPrev(){
    if(st.reviewIdx<=0)return;
    st.reviewIdx--;
    showReviewUnit();
  }
  function quitReview(){
    hideToast();
    leaveGate();
    st.page='factions';
    st.faction=null;
    document.body.className='mode-factions';
    document.body.removeAttribute('data-faction');
    renderFactions();
  }
  tcPrevBtn.addEventListener('click',reviewPrev);
  tcNextBtn.addEventListener('click',reviewNext);
  tcQuitBtn.addEventListener('click',quitReview);
  /* 兵种图只有一套（写实），没有风格开关，也没有第二套可切 */

  /* ================= 军团志（总结页）================= */
  /* 六维战力雷达图（内联 SVG，零依赖） */
  var RADAR={n:6,cx:136,cy:124,r:80,pad:18};
  function radarXY(ratio,k){
    var a=-Math.PI/2+k*2*Math.PI/RADAR.n;
    return [RADAR.cx+RADAR.r*ratio*Math.cos(a),RADAR.cy+RADAR.r*ratio*Math.sin(a)];
  }
  function radarPoints(ratios){
    var t=[];
    for(var k=0;k<RADAR.n;k++){var q=radarXY(ratios[k],k);t.push(q[0].toFixed(1)+','+q[1].toFixed(1));}
    return t.join(' ');
  }
  function statsRadar(avg,peak){
    var rings=[.2,.4,.6,.8,1],face=[],i,a,s='';
    for(i=0;i<RADAR.n;i++)face.push(Math.max(0,Math.min(1,avg[i]/5)));
    s='<svg class="radar" viewBox="0 0 280 250" role="img" aria-label="六维战力图谱">';
    for(i=0;i<rings.length;i++){
      var even=[rings[i],rings[i],rings[i],rings[i],rings[i],rings[i]];
      s+='<polygon class="grid'+(i===rings.length-1?' edge':'')+'" points="'+radarPoints(even)+'"/>';
    }
    for(i=0;i<RADAR.n;i++){
      var e=radarXY(1,i);
      s+='<line class="axis" x1="'+RADAR.cx+'" y1="'+RADAR.cy+'" x2="'+e[0].toFixed(1)+'" y2="'+e[1].toFixed(1)+'"/>';
    }
    s+='<polygon class="face" points="'+radarPoints(face)+'"/>';
    for(i=0;i<RADAR.n;i++){
      var p=radarXY(face[i],i);
      s+='<circle class="dot" cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="3.2"/>';
    }
    for(i=0;i<RADAR.n;i++){
      a=-Math.PI/2+i*2*Math.PI/RADAR.n;
      var ca=Math.cos(a),sa=Math.sin(a);
      var lx=RADAR.cx+(RADAR.r+RADAR.pad)*ca;
      var ly=RADAR.cy+(RADAR.r+RADAR.pad)*sa+4;
      if(sa<-0.25)ly-=7; else if(sa>0.25)ly+=7;
      var anchor=ca>0.25?'start':(ca<-0.25?'end':'middle');
      s+='<text class="lab'+(i===peak?' peak':'')+'" x="'+lx.toFixed(1)+'" y="'+ly.toFixed(1)+'" text-anchor="'+anchor+'">'+
         STATS_DIMS[i]+'<tspan class="val" dx="5">'+avg[i].toFixed(1)+'</tspan></text>';
    }
    return s+'</svg>';
  }
  /* 检阅简报：一句自然话 */
  function renderBrief(order){
    var n=order.length;
    if(!n){sumBriefEl.innerHTML='';return;}
    var total=0,max=-1,min=Infinity,maxU=null,minU=null,i,u,m;
    for(i=0;i<n;i++){
      u=UNITS[order[i]];m=menOf(u);total+=m;
      if(m>max){max=m;maxU=u;}
      if(m<min){min=m;minU=u;}
    }
    var s='本次检阅共 <b>'+n+'</b> 队，编制合计约 <b>'+fmtN(total)+'</b> 人。';
    if(n>1){
      s+='其中编制最多的是'+maxU.name+'（<b>'+fmtN(max)+'</b> 人），最少的是'+minU.name+'（<b>'+fmtN(min)+'</b> 人）。';
    }else{
      s+='这队'+maxU.name+'编制 <b>'+fmtN(max)+'</b> 人。';
    }
    sumBriefEl.innerHTML=s;
  }
  function showSummary(){
    var f=curFaction();
    var order=f.unitIdx;
    st.page='summary';
    document.body.className='mode-summary';
    document.body.removeAttribute('data-faction');
    var n=order.length,i,k;
    var avg=[0,0,0,0,0,0];
    for(i=0;i<n;i++){
      var u=UNITS[order[i]];
      for(k=0;k<6;k++)avg[k]+=(u.stats?u.stats[k]:0);
    }
    for(k=0;k<6;k++)avg[k]=avg[k]/Math.max(1,n);
    var peak=-1,pv=-1;
    for(k=0;k<6;k++){if(avg[k]>pv){pv=avg[k];peak=k;}}
    sumBarsEl.innerHTML=statsRadar(avg,peak);
    renderBrief(order);
    var dh='';
    for(i=0;i<n;i++){
      var d=UNITS[order[i]],t=d.stats||[0,0,0,0,0,0];
      var ord=[0,1,2,3,4,5].sort(function(a,b){return t[b]-t[a];}).slice(0,2);
      var tp=ord.map(function(j){return STATS_DIMS[j]+t[j];}).join(' · ');
      dh+='<div class="sum-dish">'+
        '<span class="sum-dnum">'+roman(i+1)+'</span>'+
        '<span class="sum-dot" style="background:'+(d.color||'#8a3a2a')+'"></span>'+
        '<span class="sum-dname">'+d.name+'</span>'+
        '<span class="sum-dmeta">'+d.region+' · '+d.city+'</span>'+
        '<span class="sum-dtags">'+tp+'</span>'+
      '</div>';
    }
    sumDishesEl.innerHTML=dh;
    sumCountEl.textContent=n;
    var kinds={},regs={};
    for(i=0;i<n;i++){var g=UNITS[order[i]];kinds[g.kind]=1;regs[g.region]=1;}
    sumKindEl.textContent=Object.keys(kinds).length;
    sumRegionEl.textContent=Object.keys(regs).length;
    summaryBodyEl.scrollTop=0;
    if(DEMO){
      demoAfter(600,function(){
        var max=Math.max(0,summaryBodyEl.scrollHeight-summaryBodyEl.clientHeight);
        if(max>0){
          demoSmoothScroll(summaryBodyEl,max,2000,function(){
            demoAfter(1200,function(){demoSmoothScroll(summaryBodyEl,0,900);});
          });
        }
      });
      demoAfter(DEMO_SUMMARY_MS,demoEnd);
    }
  }
  function backToFactions(){
    hideToast();
    if(gateTimer){clearTimeout(gateTimer);gateTimer=null;}
    st.page='factions';
    st.faction=null;
    document.body.className='mode-factions';
    document.body.removeAttribute('data-faction');
    renderFactions();
  }
  scBackBtn.addEventListener('click',backToFactions);
  scAgainBtn.addEventListener('click',function(){
    if(!st.faction)return;
    enterGate(st.faction);
  });

  /* ================= 键盘 ================= */
  window.addEventListener('keydown',function(e){
    if(DEMO)return;
    if(e.key==='Escape'){
      if(st.page==='builder')exitBuilder();
      else if(st.page!=='factions')backToFactions();
    }else if(st.page==='review'){
      if(e.key==='ArrowLeft')reviewPrev();
      else if(e.key==='ArrowRight')reviewNext();
    }
  });

  /* ================= 提示 ================= */
  var toastT=null;
  var TOAST_MS=3600;
  function toast(msg){
    if(DEMO)return;
    hintEl.textContent=msg;hintEl.classList.add('show');
    clearTimeout(toastT);toastT=setTimeout(function(){hintEl.classList.remove('show');},TOAST_MS);
  }
  function hideToast(){clearTimeout(toastT);hintEl.classList.remove('show');}

  /* ================= 背景音乐（音频藏在 assets/audio/bgm.js 的 base64 里）=================
   * 为什么不是 <audio src="./assets/audio/bgm.mp3">：容器上传白名单只有
   *   jpg / css / gif / svg / png / js / jpeg / json / html / woff2 / webp / woff
   * —— **不含任何音频扩展名**（mp3 会被上传页直接打回）；容器 CSP 又明确
   * 「<audio> / <video> 只允许包内媒体文件，禁 data:/blob: 媒体源」。两条叠加＝
   * 「包内音频文件」这条官方路在容器里根本不存在。所以音频以 base64 藏在 bgm.js 里，运行时：
   *   ① atob → ArrayBuffer → AudioContext.decodeAudioData() 解成 PCM；
   *   ② 用 Web Audio 播 —— 全程**不产生任何 URL**，不触碰 CSP 的资源加载规则；
   *   ③ 循环靠"这一遍的尾巴与下一遍的开头交叠淡入淡出"（见 bgmLoopTick）；
   *   ④ 音量走 GainNode 包络，不做 setInterval 调 volume；
   *   ⑤ 偏好存 localStorage（键 rtw3d.bgm）：没存过＝偏好开启，手动关掉才记成静音；
   *      但**按钮显示的是"此刻有没有在响"**，与偏好分开 —— 见 bgmPaint；
   *   ⑥ 切后台（visibilitychange）停声并挂起音频上下文，回前台续上。
   * 解码成功才给 <html> 挂 has-bgm 把开关显出来；没有数据 / 解码失败＝开关隐藏，五页照常。
   * 开 / 关两枚图标是 index.html 里的内联 SVG，由按钮的 .on 换显。 */
  var BGM_KEY='rtw3d.bgm',BGM_VOL=0.42,BGM_XFADE=4,BGM_TICK_MS=500;
  var AC=window.AudioContext||window.webkitAudioContext;
  var bgmCtx=null,bgmBuf=null,bgmMaster=null;
  var bgmPasses=[],bgmNextAt=0,bgmLoopT=null,bgmStopT=null,bgmFirstPass=true;
  var bgmReady=false,bgmWant=true,bgmUnlocked=false,bgmPlaying=false,bgmHidePaused=false;
  try{if(window.localStorage.getItem(BGM_KEY)==='0')bgmWant=false;}catch(e){}
  /* 按钮画的是**此刻有没有在出声**（bgmPlaying），不是"用户想不想听"（bgmWant）。 */
  function bgmPaint(){
    if(!bgmBtnEl)return;
    bgmBtnEl.className='bgm-btn'+(bgmPlaying?' on':'');
    bgmBtnEl.setAttribute('aria-pressed',bgmPlaying?'true':'false');
  }
  /* 一遍接一遍地排"带交叠的循环"：每遍长 D 秒，上一遍在最后 X 秒线性淡出，
     同时下一遍从 0 秒线性淡入 —— 两者在 [D-X, D] 完全重叠、增益和恒为 1，
     所以接缝听不出来。于是每遍的推进步长 L = D - X，下一遍晚 L 秒开始。
     第一遍不走这条 5s 淡入（那只是给接缝用的），改成 1.2s 起势。 */
  function bgmLoopTick(){
    if(!bgmPlaying||!bgmCtx||!bgmBuf||!bgmMaster)return;
    var D=bgmBuf.duration;
    var X=Math.min(BGM_XFADE,D*0.15);
    var L=D-X;
    var now=bgmCtx.currentTime;
    if(bgmNextAt<now+0.05)bgmNextAt=now+0.08;
    while(bgmNextAt<now+1.2){
      var at=bgmNextAt;
      var src=bgmCtx.createBufferSource();
      var g=bgmCtx.createGain();
      src.buffer=bgmBuf;
      src.connect(g);g.connect(bgmMaster);
      var fin=bgmFirstPass?Math.min(X,1.2):X;
      bgmFirstPass=false;
      g.gain.setValueAtTime(0,at);
      g.gain.linearRampToValueAtTime(1,at+fin);
      g.gain.setValueAtTime(1,at+L);
      g.gain.linearRampToValueAtTime(0,at+D);
      src.start(at);
      src.stop(at+D+0.05);
      bgmPasses.push({src:src,endsAt:at+D});
      bgmNextAt=at+L;
    }
    for(var i=bgmPasses.length-1;i>=0;i--){
      if(bgmPasses[i].endsAt<now-0.5){
        try{bgmPasses[i].src.disconnect();}catch(e){}
        bgmPasses.splice(i,1);
      }
    }
  }
  function bgmStopPasses(){
    if(bgmStopT){clearTimeout(bgmStopT);bgmStopT=null;}
    if(bgmLoopT){clearInterval(bgmLoopT);bgmLoopT=null;}
    for(var i=0;i<bgmPasses.length;i++){
      try{bgmPasses[i].src.stop();}catch(e){}
      try{bgmPasses[i].src.disconnect();}catch(e){}
    }
    bgmPasses=[];
  }
  function bgmPlay(){
    if(!bgmReady||bgmPlaying||!bgmCtx||!bgmMaster)return;
    bgmPlaying=true;
    bgmFirstPass=true;
    if(bgmStopT){clearTimeout(bgmStopT);bgmStopT=null;}
    try{if(bgmCtx.state==='suspended'&&bgmCtx.resume)bgmCtx.resume();}catch(e){}
    var t=bgmCtx.currentTime;
    try{
      bgmMaster.gain.cancelScheduledValues(t);
      bgmMaster.gain.setValueAtTime(0,t);
      bgmMaster.gain.linearRampToValueAtTime(BGM_VOL,t+0.9);
    }catch(e){bgmMaster.gain.value=BGM_VOL;}
    bgmNextAt=t+0.08;
    bgmLoopTick();
    if(bgmLoopT)clearInterval(bgmLoopT);
    bgmLoopT=setInterval(bgmLoopTick,BGM_TICK_MS);
    bgmPaint();
  }
  function bgmPause(ms){
    if(!bgmPlaying||!bgmCtx||!bgmMaster)return;
    bgmPlaying=false;
    var t=bgmCtx.currentTime,to=(ms==null?600:ms)/1000;
    try{
      bgmMaster.gain.cancelScheduledValues(t);
      bgmMaster.gain.setValueAtTime(bgmMaster.gain.value,t);
      bgmMaster.gain.linearRampToValueAtTime(0,t+to);
    }catch(e){}
    if(bgmLoopT){clearInterval(bgmLoopT);bgmLoopT=null;}
    if(bgmStopT)clearTimeout(bgmStopT);
    bgmStopT=setTimeout(bgmStopPasses,to*1000+80);
    bgmPaint();
  }
  function bgmSet(want){
    bgmWant=!!want;
    try{window.localStorage.setItem(BGM_KEY,bgmWant?'1':'0');}catch(e){}
    if(bgmWant)bgmPlay();else bgmPause(500);
    bgmPaint();
  }
  /* 首次用户手势之前不许出声。开关自己那一下不算解锁手势 —— 交给开关的 handler 处理。 */
  function bgmUnlock(e){
    if(bgmBtnEl&&e&&e.target&&(e.target===bgmBtnEl||bgmBtnEl.contains(e.target)))return;
    bgmUnlocked=true;
    if(bgmWant)bgmPlay();
    document.removeEventListener('pointerdown',bgmUnlock,true);
    document.removeEventListener('click',bgmUnlock,true);
    document.removeEventListener('keydown',bgmUnlock,true);
  }
  function bgmBytes(){
    var s=window.RTW3D_BGM||'';
    if(!s)return null;
    try{
      var bin=window.atob(s),n=bin.length,ab=new ArrayBuffer(n),u=new Uint8Array(ab);
      for(var i=0;i<n;i++)u[i]=bin.charCodeAt(i);
      return ab;
    }catch(e){return null;}
  }
  function bgmDecode(){
    if(bgmReady||!AC)return;
    var ab=bgmBytes();
    if(!ab)return;
    if(!bgmCtx){try{bgmCtx=new AC();}catch(e){bgmCtx=null;}}
    if(!bgmCtx)return;
    var settled=false;
    function ok(buf){
      if(settled)return;settled=true;
      bgmBuf=buf;
      bgmMaster=bgmCtx.createGain();
      bgmMaster.gain.value=0;
      bgmMaster.connect(bgmCtx.destination);
      bgmReady=true;
      document.documentElement.className+=' has-bgm';
      if(bgmUnlocked&&bgmWant)bgmPlay();
    }
    function bad(){if(settled)return;settled=true;bgmBuf=null;}
    try{
      var pr=bgmCtx.decodeAudioData(ab,ok,bad);
      if(pr&&pr.then)pr.then(ok,bad);
    }catch(e){bad();}
  }
  if(DEMO)document.documentElement.className+=' is-demo';
  if(bgmBtnEl){
    bgmBtnEl.addEventListener('click',function(){
      bgmUnlocked=true;
      bgmSet(!bgmPlaying);
    });
  }
  document.addEventListener('pointerdown',bgmUnlock,true);
  document.addEventListener('click',bgmUnlock,true);
  document.addEventListener('keydown',bgmUnlock,true);
  document.addEventListener('visibilitychange',function(){
    if(document.hidden){
      if(bgmPlaying){
        bgmHidePaused=true;
        bgmPause(0);
        if(bgmCtx&&bgmCtx.suspend)setTimeout(function(){try{bgmCtx.suspend();}catch(e){}},150);
      }
    }else if(bgmHidePaused){
      bgmHidePaused=false;
      if(bgmWant&&bgmUnlocked)bgmPlay();
    }
  });
  bgmPaint();
  /* 首屏之后才解码；解出来才把开关显出来 */
  setTimeout(bgmDecode,900);

  /* ================= 启动 ================= */
  st.custom=loadCustom();
  renderFactions();
  document.body.className='mode-factions';
  toast('选一个阵营 · 逐队检阅它的兵种与装备');
  setTimeout(function(){document.getElementById('loader').classList.add('hide');},520);
  if(DEMO)demoAfter(DEMO_WARM_MS,startDemo);

  /* logo 图到位才显示 logo 块（挂在 <html> 上，不会被页面切换的 body.className 覆盖） */
  (function(){
    try{
      var im=new Image();
      im.onload=function(){document.documentElement.className+=' has-logo';};
      im.src='./assets/tex/logo.webp';
    }catch(e){}
  })();

  /* 首屏若图未就绪，等预检结束后统一重绘：2.6s 还没回来的按缺图处理，退色卡 */
  setTimeout(function(){
    for(var i=0;i<UNITS.length;i++)if(UNITS[i].img&&IMG_OK[UNITS[i].id]===null)IMG_OK[UNITS[i].id]=false;
    if(st.page==='review')repaintImg(UNITS[st.sel]);
  },2600);
})();
