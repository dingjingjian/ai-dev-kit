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
  var globeSlotEl=document.getElementById('globeSlot');
  var globeCanvasEl=document.getElementById('stage');
  var globeTagsEl=document.getElementById('globeTags');

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
  var scShareBtn=document.getElementById('scShare');

  var bdBackBtn=document.getElementById('bdBack');
  var bdTitleEl=document.getElementById('builderTtl');
  var bdPickedEl=document.getElementById('bdPicked');
  var bdPoolEl=document.getElementById('bdPool');
  var bdStartBtn=document.getElementById('bdStart');
  var bdRandomBtn=document.getElementById('bdRandom');
  var builderBodyEl=document.getElementById('builderBody');
  var hintEl=document.getElementById('hint');
  var bgmBtnEl=document.getElementById('bgmBtn');
  var unitShareBtn=document.getElementById('unitShareBtn');

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
    unitSharePaint();      /* 原图到货／失败都会走到这里，顺手刷新分享按钮 */
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
    /* 槽位整段包一层 .gear-list：渐变底只铺在**横线之下**这一段，标题行不带底 */
    h+='<div class="gear-list">';
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
    h+='</div>';
    gearColEl.innerHTML=h;
    probeGear(items);
  }

  /* ================= 3D 地球组件（可降级）=================
   * 三层能力检测，任一不过就降级——地球在这里只是「标征召地」的组件，
   * 它跑不起来不该连累整页（阵营选择 / 过渡 / 检阅 / 军团志全部照常）：
   *   ① 拿得到 WebGL 上下文吗（webgl2 或 webgl）；
   *   ② three.min.js 加载上了吗（typeof THREE）；
   *   ③ 建场景这一段会不会抛异常（外面用 try/catch 兜住）。
   * 任一不过 → G 为 null → 地球槽内显示 .globe-down，页面其余部分不受影响。
   *
   * 画面口径：只有一个地球 —— 没有星空球、没有星星点云、没有云层，
   * 画布是透明底（alpha:true），背景由槽自己的暗青铜渐变提供。 */
  /* WebGL 预算：初始 DPR 上限取 1.5（小工具规范默认档），掉帧时 animate() 逐级降到 1 */
  var DPR_CAP=Math.min(devicePixelRatio||1,1.5);
  var G=null;
  (function(){
    var canvas=globeCanvasEl,slot=globeSlotEl,tagsLayer=globeTagsEl;
    if(!canvas||!slot)return;
    var gl=null;try{gl=canvas.getContext('webgl2')||canvas.getContext('webgl');}catch(e){}
    var HAS3D=!!(gl&&typeof THREE!=='undefined');
    if(!HAS3D)return;
    try{G=(function(){

    var renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
    /* DPR 上限 1.5（小工具 WebGL 预算的默认档），掉帧时 animate() 还会继续往下调 */
    renderer.setPixelRatio(DPR_CAP);
    renderer.outputEncoding=THREE.sRGBEncoding;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.06;
    /* 透明底：槽的暗青铜渐变透上来当背景，地球之外不再画任何东西 */
    renderer.setClearColor(0x000000,0);

    var scene=new THREE.Scene();
    var camera=new THREE.PerspectiveCamera(52,1,0.1,5000);
    var W=2,H=2,sizeDirty=true;
    var R=1.6;

    var ambient=new THREE.AmbientLight(0x4a4638,1.0);scene.add(ambient);
    var lampLight=new THREE.PointLight(0xffe0b0,2.2,0,1.3);lampLight.position.set(18,7,14);scene.add(lampLight);
    var fillLight=new THREE.PointLight(0x5a5a6a,0.8,0,1.3);fillLight.position.set(-16,-6,-12);scene.add(fillLight);
    var candleLight=new THREE.PointLight(0xffa860,0.6,300,1.6);candleLight.position.set(-26,-30,18);scene.add(candleLight);

    function radialTex(c0,c1,c2){
      var c=document.createElement('canvas');c.width=c.height=128;var x=c.getContext('2d'),g=x.createRadialGradient(64,64,0,64,64,64);
      g.addColorStop(0,c0);g.addColorStop(.4,c1);g.addColorStop(1,c2);x.fillStyle=g;x.fillRect(0,0,128,128);
      return new THREE.CanvasTexture(c);
    }
    function plainTex(col){var c=document.createElement('canvas');c.width=c.height=4;var x=c.getContext('2d');x.fillStyle=col;x.fillRect(0,0,4,4);return new THREE.CanvasTexture(c);}

    function ll2v(lat,lon,r){
      var th=(90-lat)*Math.PI/180,p=(lon+180)/360*Math.PI*2;
      return new THREE.Vector3(-r*Math.cos(p)*Math.sin(th),r*Math.cos(th),r*Math.sin(p)*Math.sin(th));
    }

    var earthTilt=new THREE.Group();earthTilt.rotation.z=23.5*Math.PI/180;scene.add(earthTilt);
    var earthGroup=new THREE.Group();earthTilt.add(earthGroup);
    var earthMat=new THREE.MeshStandardMaterial({map:plainTex('#2a4a3a'),color:0xd8ccae,roughness:.85,metalness:.05});
    var earthMesh=new THREE.Mesh(new THREE.SphereGeometry(R,64,44),earthMat);earthGroup.add(earthMesh);
    var atmo=new THREE.Mesh(new THREE.SphereGeometry(R*1.06,48,32),
      new THREE.MeshBasicMaterial({color:0xc8a060,side:THREE.BackSide,transparent:true,opacity:.16,blending:THREE.AdditiveBlending,depthWrite:false}));
    earthTilt.add(atmo);

    /* ===== 标记点：48 个全建好，按阵营成员与选中状态决定显隐 ===== */
    var markerGroup=new THREE.Group();earthGroup.add(markerGroup);
    var glowTex=radialTex('rgba(255,236,200,.95)','rgba(255,180,90,.45)','rgba(230,120,40,0)');
    var ringTex=radialTex('rgba(255,220,160,.7)','rgba(255,180,90,.25)','rgba(230,120,40,0)');
    var markers=[];
    (function buildMarkers(){
      for(var i=0;i<UNITS.length;i++){
        var u=UNITS[i];
        var grp=new THREE.Group();
        grp.position.copy(ll2v(u.lat,u.lon,R*1.012));
        grp.lookAt(0,0,0);grp.rotateX(Math.PI);
        var col=new THREE.Color(u.color);
        var dot=new THREE.Mesh(new THREE.SphereGeometry(0.052,14,14),new THREE.MeshBasicMaterial({color:col}));
        var glow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,depthTest:false,color:col}));
        glow.scale.set(0.46,0.46,1);
        var ring=new THREE.Sprite(new THREE.SpriteMaterial({map:ringTex,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,depthTest:false,color:col,opacity:.8}));
        ring.scale.set(0.72,0.72,1);
        grp.add(dot);grp.add(glow);grp.add(ring);
        markerGroup.add(grp);
        markers.push({unit:u,grp:grp,dot:dot,glow:glow,ring:ring,dim:false,visible:false});
      }
    })();

    /* 地球贴图的降级（顺序递减，缺哪级就用下一级）：
         ① earth.jpg 真实贴图
         ② 程序化「经纬网」贴图（canvas 现画，永远不会失败）
         ③ plainTex 纯色（构造时已挂上）
       为什么需要 ②：直接双击 index.html 时页面来源是 file://，浏览器把同目录的
       earth.jpg 也当成跨源 —— 不是请求被拦（图能下下来），而是这个 <img> 元素本身
       被标记为污染，WebGL 的 texSubImage2D 会直接抛 SecurityError，整个渲染循环断掉。
       所以载入后先做一次「污染探测」：把图往 1×1 画布上画一像素再 getImageData，
       抛错即判定不可用，改用 ②。http(s) 下探测通过，照常用真实贴图。 */
    function gridTex(){
      var c=document.createElement('canvas'),W2=1024,H2=512;c.width=W2;c.height=H2;
      var x=c.getContext('2d'),g=x.createLinearGradient(0,0,0,H2);
      g.addColorStop(0,'#26333c');g.addColorStop(.5,'#3a4c42');g.addColorStop(1,'#26333c');
      x.fillStyle=g;x.fillRect(0,0,W2,H2);
      x.lineWidth=1;x.strokeStyle='rgba(198,168,110,.20)';
      for(var i=1;i<12;i++){var yy=i*H2/12;x.beginPath();x.moveTo(0,yy);x.lineTo(W2,yy);x.stroke();}
      for(var j=0;j<24;j++){var xx=j*W2/24;x.beginPath();x.moveTo(xx,0);x.lineTo(xx,H2);x.stroke();}
      x.strokeStyle='rgba(232,204,146,.45)';x.beginPath();x.moveTo(0,H2/2);x.lineTo(W2,H2/2);x.stroke();
      return new THREE.CanvasTexture(c);
    }
    function tainted(im){
      try{
        var c=document.createElement('canvas');c.width=c.height=1;
        var g=c.getContext('2d');g.drawImage(im,0,0,1,1);g.getImageData(0,0,1,1);
        return false;
      }catch(e){return true;}
    }
    var maxA=renderer.capabilities.getMaxAnisotropy();
    function loadTex(u,ok,fail){
      var im=new Image();
      im.onload=function(){
        if(tainted(im)){if(fail)fail();return;}
        try{var t=new THREE.Texture(im);t.needsUpdate=true;ok(t);}catch(e){if(fail)fail();}
      };
      im.onerror=function(){if(fail)fail();};
      im.src=u;
    }
    loadTex('./assets/earth.jpg',
      function(t){t.encoding=THREE.sRGBEncoding;t.anisotropy=maxA;earthMat.map=t;earthMat.needsUpdate=true;},
      function(){earthMat.map=gridTex();earthMat.needsUpdate=true;});

    /* ================= 相机：始终对准当前这个兵种的征召地 ================= */
    var baseT=0,baseP=1.2;
    var camT=0,camP=1.2,camR=5;
    var camTG=0,camPG=1.2,camRG=5;
    var fitR=5,R_MIN=3,R_MAX=12,userZoomed=false,playing=false;

    /* ================= 取景 =================
     * 画布从顶栏下沿铺到页面底部（见 CSS 的 .globe-slot），所以：
     *   · 放大时**下沿碰不到球**（画布一直到底），只有**上沿可能被顶栏压住** —— 这是允许的；
     *   · 上沿的"截断线"就是顶栏本身，不再像窄带那样在离顶栏 26px 的地方先切一刀。
     * 默认的大小 / 位置仍按 --globem 那条虚拟带子算（球在带子里居中），
     * 靠相机俯仰把球心抬到 cyFit —— 用相机空间的俯仰而非世界偏移，拖动转动时球心不漂。
     * 缩放就是单纯改距离（R_MIN…R_MAX），没有任何随缩放的位移。 */
    var FIT_K=0.42;          /* 本体视半径 / 带子短边半视野；0.44 起光晕要贴边了 */
    var BAND=218,TOPOFF=26;  /* 与 CSS 的 --globem / --globe-top 对应（读不到就用这组兜底） */
    var HALO=1.06;           /* 大气光晕壳的半径倍数 */
    var ZOOM_IN_MAX=2.6;     /* 最多放大到默认视图的多少倍（再大由"下沿不截断"兜底） */
    var BOTTOM_PAD=12;       /* 光晕下沿与画布底之间至少留这么多，保证下沿永远不截断 */
    var rpFit=90,cyFit=135;  /* 默认像素半径 / 球心像素位置，resize 里按实际尺寸算 */
    function readCssPx(name,fallback){
      try{
        var v=parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
        return isFinite(v)&&v>0?v:fallback;
      }catch(e){return fallback;}
    }
    function distForRadius(rpx){
      var tv=Math.tan(camera.fov*Math.PI/360);
      return R/Math.sin(Math.atan(rpx*tv/(H/2)));
    }
    function resize(){
      var r=slot.getBoundingClientRect();
      var w=Math.round(r.width),h=Math.round(r.height);
      if(w<10||h<10){sizeDirty=true;return;}
      sizeDirty=false;W=w;H=h;
      camera.aspect=W/H;camera.updateProjectionMatrix();
      renderer.setSize(W,H,false);
      BAND=readCssPx('--globem',218);TOPOFF=readCssPx('--globe-top',26);
      var vF=camera.fov*Math.PI/180,tv=Math.tan(vF/2);
      /* 虚拟带子里的视半径（短边 = min(垂直视野, 带子的水平视野)） */
      var limB=Math.min(vF,2*Math.atan(tv*W/BAND));
      rpFit=(BAND/2)*Math.tan(FIT_K*limB)/tv;
      cyFit=TOPOFF+BAND/2;
      fitR=distForRadius(rpFit);
      /* 放大下限（= 能放多大）：两条线取更保守的那条 ——
         ① 倍率上限 ZOOM_IN_MAX（别把球怼到脸上）；
         ② "光晕下沿不超出画布底"反解出来的距离 —— 这条保证**下沿永远不截断**，
            画布越矮它越先起作用（矮屏自动少放大一点）。 */
      var rBottom=(H-cyFit-BOTTOM_PAD)/HALO;
      var dBottom=distForRadius(Math.max(8,rBottom));
      R_MIN=Math.max(dBottom,fitR/ZOOM_IN_MAX,R*1.05);
      if(R_MIN>fitR)R_MIN=fitR;   /* 极端矮画布：至少保住默认视图，不允许放大 */
      R_MAX=fitR*2.6;
      if(!userZoomed)camRG=fitR;
      camR=Math.min(R_MAX,Math.max(R_MIN,camR));
    }
    function aimUnit(instant){
      var u=UNITS[st.sel];if(!u)return;
      var local=ll2v(u.lat,u.lon,1);
      var e=earthGroup.rotation.y,cs=Math.cos(e),sn=Math.sin(e);
      var wx=local.x*cs+local.z*sn,wy=local.y,wz=-local.x*sn+local.z*cs;
      baseP=Math.acos(Math.max(-1,Math.min(1,wy)));
      baseT=Math.atan2(wx,wz);
      if(instant){camT=baseT;camP=baseP;camTG=baseT;camPG=baseP;}
    }
    function camPos(){
      var sp=Math.sin(camP);
      camera.position.set(camR*sp*Math.sin(camT),camR*Math.cos(camP),camR*sp*Math.cos(camT));
      camera.lookAt(0,0,0);
      /* 俯仰：把球心从画布正中抬到 cyFit（= 虚拟带子的中心，也就是默认位置）。
         这个俯仰是**固定值**，不随缩放变化 —— 缩放只是改距离，球心不漂。 */
      var tv=Math.tan(camera.fov*Math.PI/360);
      camera.rotateX(-Math.atan((H/2-cyFit)/(H/2)*tv));
    }

    /* ================= 手势：拖动转动、滚轮 / 双指缩放 ================= */
    var pointers={},dragId=null,pinch=0,lx=0,ly=0;
    function pCount(){var n=0,k;for(k in pointers)if(pointers[k])n++;return n;}
    function stopDrag(){dragId=null;}
    function tdist(t){return(Math.hypot||function(a,b){return Math.sqrt(a*a+b*b);})(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);}
    canvas.addEventListener('pointerdown',function(e){
      pointers[e.pointerId]={x:e.clientX,y:e.clientY};
      if(pCount()>1){stopDrag();return;}
      dragId=e.pointerId;lx=e.clientX;ly=e.clientY;
      try{canvas.setPointerCapture(e.pointerId);}catch(_){}
    });
    function onPointerEnd(e){
      delete pointers[e.pointerId];
      if(dragId===e.pointerId)stopDrag();
      try{canvas.releasePointerCapture(e.pointerId);}catch(_){}
      if(pCount()===1){for(var id in pointers)if(pointers[id]){dragId=Number(id);lx=pointers[id].x;ly=pointers[id].y;break;}}
    }
    canvas.addEventListener('pointerup',onPointerEnd);
    canvas.addEventListener('pointercancel',onPointerEnd);
    canvas.addEventListener('pointermove',function(e){
      var p=pointers[e.pointerId];if(!p)return;
      var nx=e.clientX,ny=e.clientY;
      p.x=nx;p.y=ny;
      if(e.pointerId!==dragId||pCount()>1)return;
      baseT-=(nx-lx)*0.006;baseP-=(ny-ly)*0.006;
      baseP=Math.max(0.08,Math.min(Math.PI-0.08,baseP));
      lx=nx;ly=ny;
    });
    canvas.addEventListener('wheel',function(e){
      e.preventDefault();
      camRG*=1+(e.deltaY>0?1:-1)*0.08;
      camRG=Math.max(R_MIN,Math.min(R_MAX,camRG));
      userZoomed=true;
    },{passive:false});
    canvas.addEventListener('touchstart',function(e){if(e.touches.length===2){stopDrag();pinch=tdist(e.touches);}},{passive:true});
    canvas.addEventListener('touchend',function(e){if(e.touches.length<2)pinch=0;},{passive:true});
    canvas.addEventListener('touchcancel',function(){pinch=0;},{passive:true});
    canvas.addEventListener('touchmove',function(e){
      if(e.touches.length!==2)return;e.preventDefault();
      var d=tdist(e.touches);
      if(pinch>12&&d>12){camRG*=pinch/d;camRG=Math.max(R_MIN,Math.min(R_MAX,camRG));userZoomed=true;}
      pinch=d;
    },{passive:false});

    /* ================= 征召地标签：只标当前这个兵种 ================= */
    var tagEl=document.createElement('div');tagEl.className='tag';
    if(tagsLayer)tagsLayer.appendChild(tagEl);
    var _v=new THREE.Vector3(),_n=new THREE.Vector3(),_d=new THREE.Vector3();
    function updateTag(){
      var m=markers[st.sel];
      if(!m||!m.visible){tagEl.style.opacity='0';return;}
      _v.setFromMatrixPosition(m.grp.matrixWorld);_v.project(camera);
      m.grp.getWorldPosition(_n);
      _d.copy(camera.position).sub(_n).normalize();_n.normalize();
      var front=(_v.z<1)&&(_n.dot(_d)>=0.2);
      m.glow.visible=front;m.ring.visible=front;
      if(!front){tagEl.style.opacity='0';return;}
      tagEl.style.left=((_v.x*0.5+0.5)*W).toFixed(1)+'px';
      tagEl.style.top=((-_v.y*0.5+0.5)*H).toFixed(1)+'px';
      tagEl.style.opacity='1';
    }

    /* ================= 标记点显隐与脉动
     * 检阅页：该阵营全部兵种的征召地标出，当前这队高亮脉动，同阵营其余压暗作上下文。 */
    function refreshMarkers(){
      var list=st.faction?st.faction.unitIdx:[];
      for(var i=0;i<markers.length;i++){
        var m=markers[i];
        var inF=list.indexOf(i)>=0;
        var sel=(i===st.sel);
        m.visible=inF;
        m.dim=inF&&!sel;
        m.grp.visible=m.visible;
        m.glow.visible=sel;m.ring.visible=sel;
        m.dot.scale.setScalar(sel?1:0.66);
        m.dot.material.color.set(sel?'#ffffff':'#f0e6cc');
        m.dot.visible=m.visible;
      }
    }
    function pulseMarkers(t){
      var m=markers[st.sel];
      if(!m||!m.visible)return;
      var p=0.5+0.5*Math.sin(t*2.6);
      var f=1+focusFlash*1.6;
      var g=0.46*(1+0.3*p)*f,r=0.72*(1+0.36*p)*f;
      m.glow.scale.set(g,g,1);m.ring.scale.set(r,r,1);
    }

    var focusFlash=0;
    function fitView(keepZoom){
      aimUnit(false);
      if(!keepZoom)userZoomed=false;
      camRG=userZoomed?camRG:fitR;
    }

    /* ================= 动画 ================= */
    var SWAY_T=0,SWAY_P=0;   /* 待机漂移幅度（弧度，见 animate）：0 = 标记点钉在正中 */
    var clock=new THREE.Clock();
    var running=true,perfAcc=0,perfN=0,dprStep=DPR_CAP;
    function globeVisible(){return st.page==='review';}
    function animate(){
      if(!running)return;
      requestAnimationFrame(animate);
      var dt=clock.getDelta(),t=performance.now()*0.001;
      if(sizeDirty)resize();
      if(!globeVisible())return;
      /* 定位点要**常驻画面正中**：相机始终锁在当前兵种的经纬度上（camTG/camPG = baseT/baseP），
         所以这里不做「待机自转 / 漂移」—— 那会把标记点晃出中心。
         想加回漂移就给 SWAY_T / SWAY_P 一个非零弧度（原来分别是 0.42 / 0.09）。 */
      if(playing){
        camTG=baseT+SWAY_T*Math.sin(t*0.16);
        camPG=baseP+SWAY_P*Math.sin(t*0.16+1.2);
        camPG=Math.max(0.08,Math.min(Math.PI-0.08,camPG));
      }else{
        camTG=baseT;camPG=baseP;
      }
      if(focusFlash>0)focusFlash=Math.max(0,focusFlash-dt*0.55);
      camT+=(camTG-camT)*0.09;camP+=(camPG-camP)*0.09;camR+=(camRG-camR)*0.1;
      camPos();
      lampLight.position.copy(camera.position);lampLight.position.y+=3;
      renderer.render(scene,camera);
      pulseMarkers(t);
      updateTag();
      perfAcc+=dt;perfN++;
      if(perfN>=30){
        var avg=perfAcc/perfN;perfAcc=0;perfN=0;
        if(avg>0.045&&dprStep>1){dprStep=Math.max(1,dprStep-0.25);renderer.setPixelRatio(dprStep);resize();}
      }
    }
    window.addEventListener('resize',function(){sizeDirty=true;resize();});
    window.addEventListener('orientationchange',function(){setTimeout(function(){sizeDirty=true;resize();},220);});
    document.addEventListener('visibilitychange',function(){
      if(document.hidden){running=false;}
      else if(!running){running=true;clock.getDelta();animate();}
    });
    canvas.addEventListener('webglcontextlost',function(e){
      e.preventDefault();running=false;
      var gd=document.getElementById('globeDown');
      if(gd)gd.className='globe-down show';
    },false);

    return {
      resize:resize,
      markDirty:function(){sizeDirty=true;},
      aimUnit:aimUnit,
      fitView:fitView,
      refreshMarkers:refreshMarkers,
      setTag:function(t){tagEl.textContent=t;},
      setPlaying:function(v){playing=v;},
      start:animate
    };
    })();}catch(e){G=null;}
    if(!G){
      var gd=document.getElementById('globeDown');
      if(gd)gd.className='globe-down show';
    }
  })();

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
   * （旧的「通用凯旋门」③⑤⑥ 已整组退役：图里画进了现代相机，且只会在信箱边里露出来。）
   *
   * ⚠️ 这一页的图**必须先就绪再进页**（2026-09-22 修）：⑨ 是整屏主素材、也是整包里最重的一批，
   * 原先点阵营才把 --gate-art 写上去，浏览器得先下载 ⑨ 才能画，于是画面链下一层的
   * 该阵营横幅 ⑧ 先顶上来，图到了再换：用户看到的就是「先显示别的图，再切到过渡图」。
   * 现在 warmGateArt() 启动期就把九张灌进缓存，enterGate() 再等到该阵营那张就绪
   * （最多 GATE_WAIT_MS）才换页 + 起播 —— 换页那一刻 ⑨ 已在缓存里，全程只有一张图。
   * 就绪判定只决定「什么时候进页」，画面链本身仍是 ⑨ → ⑧，缺图照旧退横幅。 */
  var GATE_MS=7100;
  /* 图没进缓存时最多等这么久；等不到就按缺图照常起播 —— 流程不能被一张图卡住。 */
  var GATE_WAIT_MS=2000;
  var gateTimer=null,gateWaitT=null,gateToken=0;
  var GATE_ELS='.gate-shot,.gate-caption,.gate-title,.gate-subtitle,.gate-route-name';
  /* ⑨ 九张过渡画面是这一页的整屏主素材，也是整包里最重的一批图。
     启动期就把字节灌进缓存 —— 否则点阵营那一刻才开始下载，浏览器只能先拿画面链的
     下一层（该阵营横幅 ⑧）顶上，图到了再换成 ⑨：用户看到的就是
     「先显示别的图，再切到过渡图」那一下闪。
     gateProbes 只在请求在飞时留一份强引用（防 GC 掐掉回调），读完即摘，不留解码位图。 */
  var GATE_OK={};        /* key -> undefined 未探 / null 在飞 / true 已就绪 / false 缺失 */
  var gateProbes=[];
  function gateArtUrl(key){return './assets/tex/gate-'+key+'.webp';}
  function gateAsk(key,cb){
    if(GATE_OK[key]===true||GATE_OK[key]===false){cb(GATE_OK[key]);return;}
    var im=new Image();
    gateProbes.push(im);
    function done(ok){
      GATE_OK[key]=ok;
      for(var i=0;i<gateProbes.length;i++){
        if(gateProbes[i]===im){gateProbes.splice(i,1);break;}
      }
      cb(ok);
    }
    im.onload=function(){done(true);};
    im.onerror=function(){done(false);};
    im.src=gateArtUrl(key);
  }
  function warmGateArt(){
    var keys=[],i;
    for(i=0;i<FACTIONS.length;i++)keys.push(FACTIONS[i].key);
    keys.push(CUSTOM_FACTION.key);
    for(i=0;i<keys.length;i++){
      (function(k){
        if(GATE_OK[k]!==undefined)return;
        GATE_OK[k]=null;
        gateAsk(k,function(){});
      })(keys[i]);
    }
  }
  warmGateArt();
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
    if(gateWaitT){clearTimeout(gateWaitT);gateWaitT=null;}
    gateToken++;   /* 作废仍在等图的这一次进场 */
  }
  function enterGate(faction){
    hideToast();
    st.faction=faction;
    st.page='gate';
    if(gateTimer){clearTimeout(gateTimer);gateTimer=null;}
    if(gateWaitT){clearTimeout(gateWaitT);gateWaitT=null;}
    var token=++gateToken;
    var key=faction.key;
    var started=false;
    /* 换页 + 起播：只在图就绪（或确认缺图 / 等超时）之后跑，且一次进场只跑一次。
       图没到之前**根本不进这一页** —— 于是「⑧ 先顶上来、⑨ 再替换上去」那一下没有了。 */
    function play(){
      if(started||token!==gateToken)return;
      started=true;
      if(gateWaitT){clearTimeout(gateWaitT);gateWaitT=null;}
      document.body.className='mode-gate';
      document.body.setAttribute('data-faction',key);
      /* 这一页写的是**你选中的这个阵营**，不是 app 的名字：
         标题＝阵营名，副标题＝它的拉丁名。「SPQR · LEGIONVM CODEX」是罗马专属的国号与书名，
         只留给罗马那一档，别的阵营挂上它就是张冠李戴。
         底下那行改成队数——阵营名已经在标题上了，再写一遍是重复。 */
      gateTitleEl.textContent=faction.name;
      gateSubtitleEl.textContent=(key==='rome')
        ? 'SPQR · LEGIONVM CODEX'
        : (faction.latin||'');
      gateRouteNameEl.textContent='即将检阅 · '+faction.unitIdx.length+' 队';
      setGateArt(key);
      resetGateAnim();
      setGateTiming(GATE_MS);
      gateTimer=setTimeout(enterReview,GATE_MS);
    }
    /* 先挂封顶计时器、再问图：图已在缓存里时 gateAsk 会**同步**回调，
       play() 顺手把这个计时器清掉；两种时序都不会留下野计时器。 */
    gateWaitT=setTimeout(play,GATE_WAIT_MS);
    gateAsk(key,play);
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
    if(G)G.setPlaying(true);
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
    if(G){G.setTag(u.city);G.refreshMarkers();G.aimUnit(false);G.fitView(false);G.markDirty();}
    unitSharePaint();      /* 换了一队，分享按钮跟着这支兵种有没有原图显隐 */
    /* 底边对齐：内容超高时把滚动位置压到最底，档案卡整张完整露出（要看图再往上滚）。
       没超高时 scrollHeight === clientHeight，这行等价于 0。 */
    tourBodyEl.scrollTop=tourBodyEl.scrollHeight;
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
    if(G)G.setPlaying(false);
    renderFactions();
  }
  tcPrevBtn.addEventListener('click',reviewPrev);
  tcNextBtn.addEventListener('click',reviewNext);
  tcQuitBtn.addEventListener('click',quitReview);
  /* 兵种图只有一套（写实），没有风格开关，也没有第二套可切 */

  /* ================= 军团志（总结页）================= */
  /* 六维战力雷达图（内联 SVG，零依赖）
   * 双层口径：实线 = 编制均值（这支军团整体水平），虚线 = 各维最强一队的峰值（上限）。
   * 只画峰值会让 8 个阵营几乎都顶到满六边形、失去区分度，所以峰值只作副信息：
   * 只出一条虚线轮廓 + 空心顶点，轴上标签只标均值，不写峰值的数值。 */
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
  function statsRadar(avg,peak,pk){
    var rings=[.2,.4,.6,.8,1],face=[],pkf=[],i,a,s='';
    pk=pk||[];
    for(i=0;i<RADAR.n;i++){
      face.push(Math.max(0,Math.min(1,(avg[i]||0)/5)));
      pkf.push(Math.max(0,Math.min(1,(pk[i]||0)/5)));
    }
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
    s+='<polygon class="peakline" points="'+radarPoints(pkf)+'"/>';
    for(i=0;i<RADAR.n;i++){
      var p=radarXY(face[i],i);
      s+='<circle class="dot" cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="3.2"/>';
    }
    for(i=0;i<RADAR.n;i++){
      var q=radarXY(pkf[i],i);
      s+='<circle class="pkdot" cx="'+q[0].toFixed(1)+'" cy="'+q[1].toFixed(1)+'" r="2.1"/>';
    }
    for(i=0;i<RADAR.n;i++){
      a=-Math.PI/2+i*2*Math.PI/RADAR.n;
      var ca=Math.cos(a),sa=Math.sin(a);
      var lx=RADAR.cx+(RADAR.r+RADAR.pad)*ca;
      var ly=RADAR.cy+(RADAR.r+RADAR.pad)*sa+4;
      if(sa<-0.25)ly-=7; else if(sa>0.25)ly+=7;
      var anchor=ca>0.25?'start':(ca<-0.25?'end':'middle');
      s+='<text class="lab'+(i===peak?' peak':'')+'" x="'+lx.toFixed(1)+'" y="'+ly.toFixed(1)+'" text-anchor="'+anchor+'">'+
         STATS_DIMS[i]+'<tspan class="val" dx="5">'+(avg[i]||0).toFixed(1)+'</tspan></text>';
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
    if(G)G.setPlaying(false);
    /* 阵营主题色要一直留到这一页：雷达图的数据层与简报里的数字都取 --f-accent*，
       颜色一致靠的就是 <body data-faction>。回阵营页时才摘掉（backToFactions / quitReview）。 */
    document.body.setAttribute('data-faction',f.key);
    var n=order.length,i,k;
    var avg=[0,0,0,0,0,0],pk=[0,0,0,0,0,0];
    for(i=0;i<n;i++){
      var u=UNITS[order[i]];
      for(k=0;k<6;k++){
        var sv=u.stats?u.stats[k]:0;
        avg[k]+=sv;
        if(sv>pk[k])pk[k]=sv;
      }
    }
    for(k=0;k<6;k++)avg[k]=avg[k]/Math.max(1,n);
    var peak=-1,pv=-1;
    for(k=0;k<6;k++){if(avg[k]>pv){pv=avg[k];peak=k;}}
    sumBarsEl.innerHTML=statsRadar(avg,peak,pk);
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
    /* 走 leaveGate() 而不是只清 gateTimer：它还会作废「等图进场」那一次挂起
       （否则中途退出后，图一到又会把页面拽回过渡页）。 */
    leaveGate();
    st.page='factions';
    st.faction=null;
    document.body.className='mode-factions';
    document.body.removeAttribute('data-faction');
    if(G)G.setPlaying(false);
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

  /* ================= 笔记分享（端能力 postNote，容器文档 §3.3）=================
   * 容器里网页不能直接发笔记，只能**唤起 App 的笔记发布页**并带上内容与媒体：
   *   window.xhs.miniTool.postNote({ title, content, pageType, mediaInfo })
   * 其中 mediaInfo 必填、且图片 / 视频 / 实况三种资源至少传一种。两处入口：
   *   ① 检阅页「分享这个兵种」—— 把该兵种的**原图原文件**直接交出去（逐字节，不重绘）；
   *   ② 军团志底栏「分享」—— 把这一轮检阅的军团志画成一张卡片（Canvas 2D，1080×1440）。
   * 两处都先换成本地 filePath 再发（§3.5：大 base64 先落文件）：
   *   writeTempFile({ data }) → postNote({ pageType:'photo_publish', mediaInfo:{ image_resources:[{url:filePath}] } })
   * 客户端没有 writeTempFile 时，把完整 data:uri 直接交给 postNote（§3.3 允许 base64）。
   *
   * 卡片**只用 Canvas 图元与文字绘制，不 drawImage 任何图片**：在 file:// 来源下画本地图片
   * 会把画布标记为"被污染"、toDataURL 直接抛 SecurityError —— 装备与兵种 webp 一律不参与绘制。
   *
   * 能力检测而非 UA 判断：拿不到 postNote 就整块隐藏（桌面直接开 index.html、以及 ?demo
   * 录屏都不会出现这个按钮），五页流程照常。
   *
   * 结果语义（文档明说）：postNote 成功**只代表发布页被唤起并由用户点了发布，不代表过审** ——
   * 所以这里只当"已唤起"提示，不据此做任何强一致的状态变更。 */
  var XHS=(window.xhs&&window.xhs.miniTool)||null;
  var CAN_SHARE=!!(XHS&&typeof XHS.postNote==='function');
  var shareBusy=false,unitShareBusy=false;
  var CARD_W=1080,CARD_H=1440;
  var CARD_FONT='Georgia,"Songti SC","Noto Serif SC","STSong","SimSun",serif';
  var CARD_SANS='-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif';
  /* 卡片要"照军团志页复刻"，而这一页的数据层取的是**当前阵营色**（--f-accent*），
     所以颜色从 body 的实测样式里读，读不到才退默认的罗马红。 */
  function cssVarColor(name,fallback){
    try{
      var v=getComputedStyle(document.body).getPropertyValue(name);
      if(v){v=v.replace(/^\s+|\s+$/g,'');}
      if(v&&v.charAt(0)==='#')return v;
    }catch(e){}
    return fallback;
  }
  function factionNameOf(u){
    for(var i=0;i<FACTIONS.length;i++)if(FACTIONS[i].key===u.faction)return FACTIONS[i].name;
    return '';
  }
  /* 单行按宽度截断加省略号（调用前先设好 x.font） */
  function fitLine(x,s,maxW){
    if(x.measureText(s).width<=maxW)return s;
    while(s.length>1&&x.measureText(s+'…').width>maxW)s=s.slice(0,-1);
    return s+'…';
  }
  /* 逐字折行（中英混排够用；分享图不是排版引擎，不追求避头尾） */
  function wrapLines(x,s,maxW){
    var out=[],line='',i,ch;
    for(i=0;i<s.length;i++){
      ch=s.charAt(i);
      if(ch==='\n'){out.push(line);line='';continue;}
      if(line&&x.measureText(line+ch).width>maxW){
        /* 别让行首落一个收尾标点（，。、）」…）：宁可这一行稍微超宽 */
        if('，。、；：）」』】》!,.;:)]}'.indexOf(ch)>=0){out.push(line+ch);line='';}
        else{out.push(line);line=ch;}
      }
      else line+=ch;
    }
    if(line)out.push(line);
    return out;
  }
  /* 居中排一段多色文字（军团志「本次检阅 N 个兵种」那行，数字取阵营强调色加粗） */
  function centerSegs(x,segs,y,px,accent){
    var total=0,i;
    for(i=0;i<segs.length;i++){
      x.font=(segs[i][1]?'800 ':'')+px+'px '+CARD_FONT;
      total+=x.measureText(segs[i][0]).width;
    }
    var sx=CARD_W/2-total/2;
    x.textAlign='left';
    for(i=0;i<segs.length;i++){
      x.font=(segs[i][1]?'800 ':'')+px+'px '+CARD_FONT;
      x.fillStyle=segs[i][1]?accent:'#e3c268';
      x.fillText(segs[i][0],sx,y);
      sx+=x.measureText(segs[i][0]).width;
    }
    x.textAlign='center';
  }
  /* 一截金线（军团志 .sec 标题右侧那根 dotted 分隔，这里按 .sec::after 的口径画点线） */
  function dottedDivider(x,x0,x1,y){
    x.save();
    x.strokeStyle='rgba(201,161,59,.45)';x.lineWidth=2;
    x.setLineDash([2,7]);
    x.beginPath();x.moveTo(x0,y);x.lineTo(x1,y);x.stroke();
    x.setLineDash([]);
    x.restore();
  }
  /* 六维战力雷达：与军团志页那副同一口径 —— 网格 / 轴是全站金线，
     数据层（面 + 顶点 + 峰值虚线）取当前阵营色；实线＝编制均值、虚线＝尖兵峰值。 */
  function radarChart(x,cx,cy,r,avg,peak,pk,accent,accent2){
    var n=6,i,k,a;
    function px(ratio,idx){
      var an=-Math.PI/2+idx*Math.PI*2/n;
      return [cx+r*ratio*Math.cos(an),cy+r*ratio*Math.sin(an)];
    }
    var rings=[.2,.4,.6,.8,1];
    for(i=0;i<rings.length;i++){
      x.beginPath();
      for(k=0;k<n;k++){var q=px(rings[i],k);if(k===0)x.moveTo(q[0],q[1]);else x.lineTo(q[0],q[1]);}
      x.closePath();
      x.strokeStyle=(i===rings.length-1)?'#c9a13b':'rgba(201,161,59,.28)';
      x.lineWidth=(i===rings.length-1)?1.6:1.3;
      x.stroke();
    }
    x.strokeStyle='rgba(201,161,59,.28)';x.lineWidth=1.3;
    for(k=0;k<n;k++){var e=px(1,k);x.beginPath();x.moveTo(cx,cy);x.lineTo(e[0],e[1]);x.stroke();}
    /* 数据面：阵营色填充 + 描边（均值实线） */
    x.beginPath();
    for(k=0;k<n;k++){
      var d=px(Math.max(.03,Math.min(1,(avg[k]||0)/5)),k);
      if(k===0)x.moveTo(d[0],d[1]);else x.lineTo(d[0],d[1]);
    }
    x.closePath();
    x.globalAlpha=.22;x.fillStyle=accent;x.fill();x.globalAlpha=1;
    x.strokeStyle=accent;x.lineWidth=2.4;x.lineJoin='round';x.stroke();
    /* 峰值层：各维最强一队连成的虚线，压在均值面**之上**（与页面 SVG 的图层顺序一致：
       face → peakline → dot → pkdot）；它是副信息，用细虚线 + 空心顶点，不抢实线均值。 */
    x.beginPath();
    for(k=0;k<n;k++){
      var p=px(Math.max(.03,Math.min(1,(pk[k]||0)/5)),k);
      if(k===0)x.moveTo(p[0],p[1]);else x.lineTo(p[0],p[1]);
    }
    x.closePath();
    x.strokeStyle=accent2;x.lineWidth=1.7;
    x.save();x.setLineDash([5,4]);x.globalAlpha=.9;x.stroke();x.restore();
    for(k=0;k<n;k++){
      var dp=px(Math.max(.03,Math.min(1,(avg[k]||0)/5)),k);
      x.fillStyle=accent2;x.beginPath();x.arc(dp[0],dp[1],5.5,0,Math.PI*2);x.fill();
    }
    for(k=0;k<n;k++){
      var pkp=px(Math.max(.03,Math.min(1,(pk[k]||0)/5)),k);
      x.strokeStyle=accent2;x.lineWidth=1.4;x.globalAlpha=.9;
      x.beginPath();x.arc(pkp[0],pkp[1],3,0,Math.PI*2);x.stroke();
      x.globalAlpha=1;
    }
    /* 标签：维度名（峰值那一维取阵营强调色）+ 均值（小一号、更暗），与页面同一口径 */
    var fs=26;
    for(k=0;k<n;k++){
      a=-Math.PI/2+k*Math.PI*2/n;
      var lx=cx+(r+34)*Math.cos(a),ly=cy+(r+34)*Math.sin(a)+fs*0.36;
      var name=STATS_DIMS[k],val=(avg[k]||0).toFixed(1);
      x.font='700 '+fs+'px '+CARD_FONT;
      var wN=x.measureText(name).width,wV=x.measureText(val).width;
      var sx=lx-(wN+8+wV)/2;
      x.textAlign='left';
      x.fillStyle=(k===peak)?accent2:'#8a8175';
      x.fillText(name,sx,ly);
      x.fillStyle='#b3aa9c';
      x.fillText(val,sx+wN+8,ly);
    }
    x.textAlign='left';
  }
  /* 把这一轮检阅的军团志画成一张卡片 —— 版式与配色照军团志页复刻：
     暗青铜径向底 + 上下两条压金仪表台 + 金色分段标题 + 六维雷达 + 兵种档案行。 */
  function drawSummaryCard(){
    var f=curFaction();
    var order=f.unitIdx,n=order.length,i,k;
    var accent=cssVarColor('--f-accent','#d0433a');
    var accent2=cssVarColor('--f-accent-2','#ea6b58');
    var cv=document.createElement('canvas');
    cv.width=CARD_W;cv.height=CARD_H;
    var x=cv.getContext('2d');

    /* ── 页面底：与 .page-summary 同一道暗青铜径向渐变 ── */
    var bg=x.createRadialGradient(CARD_W/2,CARD_H*0.10,0,CARD_W/2,CARD_H*0.10,CARD_H*0.98);
    bg.addColorStop(0,'#2c2823');bg.addColorStop(.6,'#141210');bg.addColorStop(1,'#0b0a09');
    x.fillStyle=bg;x.fillRect(0,0,CARD_W,CARD_H);

    /* ── 上下两条仪表台（.summary-bar / .summary-controls）── */
    var gTop=x.createLinearGradient(0,0,0,120);
    gTop.addColorStop(0,'rgba(8,7,6,.97)');gTop.addColorStop(1,'rgba(8,7,6,0)');
    x.fillStyle=gTop;x.fillRect(0,0,CARD_W,120);
    x.strokeStyle='rgba(201,161,59,.20)';x.lineWidth=2;
    x.beginPath();x.moveTo(0,120);x.lineTo(CARD_W,120);x.stroke();
    x.textAlign='center';x.fillStyle='#e3c268';x.font='700 30px '+CARD_FONT;
    x.fillText('军团志',CARD_W/2,74);
    var gBot=x.createLinearGradient(0,1332,0,1440);
    gBot.addColorStop(0,'#2c2823');gBot.addColorStop(.42,'#141210');gBot.addColorStop(1,'#0b0a09');
    x.fillStyle=gBot;x.fillRect(0,1332,CARD_W,108);
    x.strokeStyle='#c9a13b';x.lineWidth=3;
    x.beginPath();x.moveTo(0,1332);x.lineTo(CARD_W,1332);x.stroke();
    x.fillStyle='#e3c268';x.font='26px '+CARD_FONT;
    x.fillText('罗马军团图鉴',CARD_W/2,1396);

    /* ── 标题 / 统计 / 简报（.summary-ttl / .summary-sub / .summary-brief）── */
    x.textAlign='center';x.fillStyle='#f3ede1';x.font='800 52px '+CARD_FONT;
    x.fillText('检阅完毕',CARD_W/2,182);
    var kinds={},regs={},total=0;
    for(i=0;i<n;i++){var u0=UNITS[order[i]];kinds[u0.kind]=1;regs[u0.region]=1;total+=menOf(u0);}
    centerSegs(x,[['本次检阅 ',0],[String(n),1],[' 个兵种 · 覆盖 ',0],
      [String(Object.keys(kinds).length),1],[' 种兵种类型 ',0],
      [String(Object.keys(regs).length),1],[' 个征召行省',0]],228,30,accent2);
    var brief=(sumBriefEl&&sumBriefEl.textContent)||'';
    if(brief){
      x.fillStyle='#b3aa9c';x.font='27px '+CARD_FONT;
      var lines=wrapLines(x,brief,900);
      for(i=0;i<lines.length&&i<3;i++)x.fillText(lines[i],CARD_W/2,286+i*44);
    }

    /* ── 分段标题：金色小标题 + 点线分隔 + 右侧小注（.sec / .sec::after / .secnote）── */
    function secTitle(title,note,y){
      x.textAlign='left';x.fillStyle='#e3c268';x.font='800 34px '+CARD_FONT;
      x.fillText(title,60,y);
      var w=x.measureText(title).width;
      x.textAlign='right';x.font='26px '+CARD_FONT;x.fillStyle='#8a8175';
      var wn=x.measureText(note).width;
      x.fillText(note,CARD_W-60,y);
      x.textAlign='left';
      dottedDivider(x,60+w+26,CARD_W-60-wn-26,y-11);
    }

    /* ── 战力图谱：六维均值（实线）+ 尖兵峰值（虚线）── */
    var avg=[0,0,0,0,0,0],pk=[0,0,0,0,0,0],peak=0,pv=-1;
    for(i=0;i<n;i++){
      var st0=UNITS[order[i]].stats||[0,0,0,0,0,0];
      for(k=0;k<6;k++){avg[k]+=st0[k];if(st0[k]>pk[k])pk[k]=st0[k];}
    }
    for(k=0;k<6;k++){avg[k]=avg[k]/Math.max(1,n);if(avg[k]>pv){pv=avg[k];peak=k;}}
    secTitle('战力图谱','六维 · 实线均值 / 虚线峰值 · 满分 5',446);
    radarChart(x,CARD_W/2,690,126,avg,peak,pk,accent,accent2);
    /* 图例（.radar-legend）：实线均值 + 虚线峰值，居中排 */
    var lgY=900;
    x.font='24px '+CARD_FONT;x.textAlign='left';
    var t1='编制均值',t2='尖兵峰值';
    var w1=x.measureText(t1).width,w2=x.measureText(t2).width;
    var totalW=46+8+w1+30+46+8+w2;
    var sx=CARD_W/2-totalW/2,cy2=lgY-8;
    x.strokeStyle=accent;x.lineWidth=3;
    x.beginPath();x.moveTo(sx,cy2);x.lineTo(sx+46,cy2);x.stroke();
    x.fillStyle='#8a8175';x.fillText(t1,sx+54,lgY);
    sx+=54+w1+30;
    x.save();x.strokeStyle=accent2;x.lineWidth=2.4;x.setLineDash([5,4]);
    x.beginPath();x.moveTo(sx,cy2);x.lineTo(sx+46,cy2);x.stroke();x.restore();
    x.fillStyle='#8a8175';x.fillText(t2,sx+54,lgY);

    /* ── 兵种档案：编号 + 色点 + 名称 + 征召地 + 该队最突出的两维（.sum-dish）── */
    secTitle('兵种档案','各队最突出的两维',960);
    for(i=0;i<n&&i<8;i++){
      var d2=UNITS[order[i]],yy=990+i*42,cyy=yy+21;
      x.textAlign='left';x.fillStyle='#e3c268';x.globalAlpha=.8;
      x.font='700 22px '+CARD_SANS;
      x.fillText(roman(i+1),60,cyy+8);
      x.globalAlpha=1;
      x.fillStyle=d2.color||'#8a3a2a';
      x.beginPath();x.arc(132,cyy,10,0,Math.PI*2);x.fill();
      x.fillStyle='#f3ede1';x.font='800 34px '+CARD_FONT;
      x.fillText(fitLine(x,d2.name,300),154,cyy+12);
      x.fillStyle='#8a8175';x.font='25px '+CARD_FONT;
      x.fillText(fitLine(x,d2.region+' · '+d2.city,340),466,cyy+10);
      var t=d2.stats||[0,0,0,0,0,0];
      var ord=[0,1,2,3,4,5].sort(function(a,b){return t[b]-t[a];}).slice(0,2);
      var tp=ord.map(function(j){return STATS_DIMS[j]+t[j];}).join(' · ');
      x.textAlign='right';x.fillStyle='#e3c268';x.font='24px '+CARD_FONT;
      x.fillText(tp,CARD_W-60,cyy+10);
      x.textAlign='left';
      x.strokeStyle='rgba(201,161,59,.28)';x.lineWidth=1.4;
      x.save();x.setLineDash([3,6]);
      x.beginPath();x.moveTo(60,yy+42);x.lineTo(CARD_W-60,yy+42);x.stroke();
      x.restore();
    }
    if(n>8){
      x.textAlign='center';x.fillStyle='#8a8175';x.font='24px '+CARD_FONT;
      x.fillText('…另有 '+(n-8)+' 队未列出，全部档案见军团志页',CARD_W/2,990+8*42+12);
    }
    x.textAlign='center';
    return cv;
  }

  function shareSummary(){
    if(!CAN_SHARE||shareBusy)return;
    var f=st.faction;
    if(!f||!f.unitIdx.length){toast('先检阅一支军团，再来分享');return;}
    shareBusy=true;
    if(scShareBtn)scShareBtn.disabled=true;
    var dataURL;
    try{
      /* 用 JPEG 而不是 PNG：这张卡片铺满渐变与点线，PNG 压不动，
       * 而 JPEG q=0.92 只有它的几分之一，文字在这个尺寸下依然清晰
       * （writeTempFile 的白名单里 jpeg 是支持的）。 */
      dataURL=drawSummaryCard().toDataURL('image/jpeg',0.92);
    }catch(e){
      shareBusy=false;if(scShareBtn)scShareBtn.disabled=false;
      toast('分享图生成失败，换一台设备再试');
      return;
    }
    var order=f.unitIdx,n=order.length,i,total=0,kinds={},regs={};
    for(i=0;i<n;i++){
      var u=UNITS[order[i]];
      total+=menOf(u);kinds[u.kind]=1;regs[u.region]=1;
    }
    var brief=(sumBriefEl&&sumBriefEl.textContent)||'';
    var payload={
      title:(f.name+' · 军团志').slice(0,20),
      content:(brief?brief+'\n\n':'')+
        '由「罗马军团图鉴」生成：'+n+' 队 · 覆盖 '+
        Object.keys(kinds).length+' 种兵种类型 · '+Object.keys(regs).length+
        ' 个征召行省 · 编制合计约 '+fmtN(total)+' 人。',
      pageType:'photo_publish'
    };
    payload.content=payload.content.slice(0,1000);
    var step=(XHS.writeTempFile&&typeof XHS.writeTempFile==='function')
      ?XHS.writeTempFile({data:dataURL})
      :null;
    Promise.resolve(step).then(function(res){
      payload.mediaInfo={image_resources:[{url:(res&&res.filePath)||dataURL}]};
      return XHS.postNote(payload);
    }).then(function(){
      toast('已唤起发布页 · 在那边补完正文就能发');
    }).catch(function(err){
      toast('唤起发布页失败：'+((err&&err.errMsg)||'未知原因'));
    }).then(function(){
      shareBusy=false;
      if(scShareBtn)scShareBtn.disabled=false;
    });
  }

  /* ================= 检阅页分享：直接分享这个兵种的原图 =================
   * 与军团志那张「照页面复刻」的卡片不同，这里**把兵种图原文件直接交出去**：
   *   XHR 取 ./assets/units/<id>.webp → FileReader 读成 data:image/webp;base64,…
   *   → writeTempFile 换成本地 filePath → postNote
   * 刻意不走 canvas.drawImage + toDataURL：① file:// 来源下画本地图片会把画布标记成
   * "被污染"、toDataURL 直接抛 SecurityError；② 即便导得出来，重绘也等于重编码一遍，
   * 分享出去的就不是原图了。XHR + FileReader 拿到的是**逐字节的原图**，格式仍是 webp。
   * 笔记正文＝该兵种的介绍（intro）+ 一段紧凑资料；标题＝兵种名 · 所属阵营。
   * 没有原图就不给按钮（与「缺图回退色卡」同一口径），不做占位分享。 */
  /* 原图是否可用：与检阅页大图共用同一份预检结果 IMG_OK，不另开一次探测 */
  function unitSharePaint(){
    if(!unitShareBtn)return;
    var ok=false;
    if(CAN_SHARE&&!DEMO&&st.page==='review'){
      var u=UNITS[st.sel];
      ok=!!(u&&u.img&&IMG_OK[u.id]===true);
    }
    unitShareBtn.className='unit-share-btn'+(ok?'':' off');
  }
  /* 原图 → data:uri：取二进制再交给 FileReader，不经过画布 */
  function imgDataURI(url){
    return new Promise(function(resolve,reject){
      var xhr=new XMLHttpRequest();
      xhr.open('GET',url,true);
      xhr.responseType='blob';
      xhr.onload=function(){
        /* file:// 下 status 为 0，也算拿到内容 */
        if((xhr.status>=200&&xhr.status<300)||xhr.status===0){
          var fr=new FileReader();
          fr.onload=function(){resolve(fr.result);};
          fr.onerror=function(){reject({stage:'img'});};
          fr.readAsDataURL(xhr.response);
        }else reject({stage:'img'});
      };
      xhr.onerror=function(){reject({stage:'img'});};
      xhr.send();
    });
  }
  /* 笔记正文：介绍（intro）+ 一段紧凑资料 */
  function unitNote(u){
    var s=u.stats||[0,0,0,0,0,0],dims=[],i;
    for(i=0;i<STATS_DIMS.length;i++)dims.push(STATS_DIMS[i]+s[i]);
    var fac=factionNameOf(u);
    return u.intro+'\n\n'+
      (fac?fac+' · ':'')+u.region+' · '+u.city+
      '\n'+(KIND_LABEL[u.kind]||'兵种')+' · '+(TIER_LABEL[u.tier]||'正规')+
      ' · 编制约 '+fmtN(menOf(u))+' 人'+
      '\n六维：'+dims.join(' · ')+
      '\n特征：'+(u.traits||[]).join(' · ')+'\n\n'+
      '—— 罗马军团图鉴（小红书小工具）';
  }
  function shareUnit(){
    if(!CAN_SHARE||unitShareBusy||DEMO||st.page!=='review')return;
    var u=UNITS[st.sel];
    if(!u||!u.img||IMG_OK[u.id]!==true){toast('这支兵种的原图还没到');return;}
    unitShareBusy=true;
    if(unitShareBtn)unitShareBtn.disabled=true;
    imgDataURI(u.img).then(function(dataURL){
      var payload={
        title:(u.name+(factionNameOf(u)?' · '+factionNameOf(u):'')).slice(0,20),
        content:unitNote(u).slice(0,1000),
        pageType:'photo_publish'
      };
      var step=(XHS.writeTempFile&&typeof XHS.writeTempFile==='function')
        ?XHS.writeTempFile({data:dataURL})
        :null;
      return Promise.resolve(step).then(function(res){
        payload.mediaInfo={image_resources:[{url:(res&&res.filePath)||dataURL}]};
        return XHS.postNote(payload);
      });
    }).then(function(){
      toast('已唤起发布页 · 在那边补完正文就能发');
    }).catch(function(err){
      toast(err&&err.stage==='img'?'读取兵种图失败，稍后再试'
        :'唤起发布页失败：'+((err&&err.errMsg)||'未知原因'));
    }).then(function(){
      unitShareBusy=false;
      if(unitShareBtn)unitShareBtn.disabled=false;
    });
  }
  /* 演示录屏一律不出分享入口：除能力检测外再挡一道 DEMO，不依赖 CSS 的优先级。 */
  if(CAN_SHARE&&!DEMO){
    document.documentElement.className+=' has-share';
    if(scShareBtn)scShareBtn.addEventListener('click',shareSummary);
    if(unitShareBtn)unitShareBtn.addEventListener('click',shareUnit);
  }
  unitSharePaint();

  /* ================= 启动 ================= */
  st.custom=loadCustom();
  renderFactions();
  document.body.className='mode-factions';
  toast('选一个阵营 · 逐队检阅它的兵种与装备');
  setTimeout(function(){
    document.getElementById('loader').classList.add('hide');
    /* 遮罩撤了，地球槽才第一次拿到真实尺寸：标脏让它下一帧重算画布 */
    if(G)G.markDirty();
  },520);
  if(G)G.start();
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
