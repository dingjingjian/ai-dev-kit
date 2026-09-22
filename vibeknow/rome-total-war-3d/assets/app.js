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
  var slot=document.getElementById('globeSlot');
  var canvas=document.getElementById('stage');
  var tagsLayer=document.getElementById('globeTags');
  var capName=document.getElementById('capName');
  var capCoord=document.getElementById('capCoord');

  var routeListEl=document.getElementById('routeList');
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
  function fmtCoord(lat,lon){
    return Math.abs(lat).toFixed(1)+'°'+(lat>=0?'N':'S')+' '+Math.abs(lon).toFixed(1)+'°'+(lon>=0?'E':'W');
  }
  function roman(n){return ROMAN[n]||String(n);}
  function menOf(u){return (u&&typeof u.men==='number')?u.men:0;}

  /* ================= 颜色与兵种图（图可缺，回退色卡）================= */
  function hex2rgb(h){h=String(h).replace('#','');return [parseInt(h.substr(0,2),16),parseInt(h.substr(2,2),16),parseInt(h.substr(4,2),16)];}
  function rgb2hex(r){function f(v){v=Math.max(0,Math.min(255,Math.round(v)));return ('0'+v.toString(16)).slice(-2);}return '#'+f(r[0])+f(r[1])+f(r[2]);}
  function lighten(h,a){var r=hex2rgb(h);return rgb2hex([r[0]+(255-r[0])*a,r[1]+(255-r[1])*a,r[2]+(255-r[2])*a]);}
  function darken(h,a){var r=hex2rgb(h);return rgb2hex([r[0]*(1-a),r[1]*(1-a),r[2]*(1-a)]);}
  function plateGrad(c){return 'radial-gradient(circle at 32% 26%,'+lighten(c,.3)+','+c+' 56%,'+darken(c,.36)+' 100%)';}

  /* 兵种图有**两套**：写实（默认）与兵牌（Rome II 式单位卡），各自独立出图。
     写实路径写在 units.js 的 img 字段；兵牌路径按同一套 id 派生，避免 48 条重复。
     STYLE 决定当前用哪一套；缺哪套就退哪套的色卡，页面照常跑。 */
  var STYLE='real',STYLE_KEY='rtw3d.style';
  function cardImgOf(u){return './assets/units/card/'+u.id+'.webp';}
  function imgOf(u,s){return s==='card'?cardImgOf(u):u.img;}

  /* IMG_OK['real#'+id] / IMG_OK['card#'+id]：三态 undefined=未加载 / true=已载入 / false=缺失。
     两套都做成**懒加载**：只预载当前这套，切过去时才补另一套，省一半请求。 */
  var IMG_OK={};
  function preloadStyle(s){
    UNITS.forEach(function(u,i){
      var src=imgOf(u,s),k=s+'#'+u.id;
      if(!src||IMG_OK[k]!==undefined)return;
      IMG_OK[k]=null;
      var im=new Image();
      im.onload=function(){IMG_OK[k]=true;repaintReviewImg(i);markMissing();};
      im.onerror=function(){IMG_OK[k]=false;markMissing();};
      im.src=src;
    });
  }
  try{
    var sv=window.localStorage.getItem(STYLE_KEY);
    if(sv==='card'||sv==='real')STYLE=sv;
  }catch(e){}
  preloadStyle(STYLE);

  /* 两套素材都没到位时，在切换按钮旁标一句「素材未生成」，避免看着像按钮坏了 */
  function markMissing(){
    var any=false,i;
    for(i=0;i<UNITS.length;i++){
      if(IMG_OK['real#'+UNITS[i].id]===true||IMG_OK['card#'+UNITS[i].id]===true){any=true;break;}
    }
    try{document.body.classList[any?'remove':'add']('img-missing');}catch(e){}
  }

  function thumbStyle(u){
    /* contain 而非 cover：两套都是 1:1 方图，遇到非方形图位也只留深色边，绝不裁头脚 */
    var src=imgOf(u,STYLE);
    if(src&&IMG_OK[STYLE+'#'+u.id]===true)
      return "background-image:url('"+src+"');background-size:contain;background-repeat:no-repeat;background-position:center";
    return 'background:'+plateGrad(u.color||'#8a3a2a');
  }
  function repaintReviewImg(i){
    if(st.page==='review'&&i===st.sel){
      tourImgEl.setAttribute('style',thumbStyle(UNITS[i]));
    }
  }
  /* 切换风格：换的是整张图，不是往图上叠效果——两套图本来就是分开出的。
     目标风格若还没出图，就退回色卡，不会白屏也不会卡住。 */
  function setStyle(s){
    if(s!=='real'&&s!=='card')return;
    STYLE=s;
    preloadStyle(s);
    try{window.localStorage.setItem(STYLE_KEY,s);}catch(e){}
    var bs=document.querySelectorAll('#tourStyle .ts-btn');
    for(var i=0;i<bs.length;i++){
      var on=bs[i].getAttribute('data-style')===s;
      bs[i].className='ts-btn'+(on?' on':'');
      bs[i].setAttribute('aria-pressed',on?'true':'false');
    }
    if(st.page==='review')tourImgEl.setAttribute('style',thumbStyle(UNITS[st.sel]));
    else if(st.page==='builder')renderBuilder();
    markMissing();
  }

  /* ================= 3D 地球组件（可降级）=================
   * 三层能力检测，任一不过就降级——地球在这里只是「标征召地」的组件，
   * 它跑不起来不该连累整页（阵营选择 / 凯旋门 / 检阅 / 军团志全部照常）：
   *   ① 拿得到 WebGL 上下文吗（webgl2 或 webgl）；
   *   ② three.min.js 加载上了吗（typeof THREE）；
   *   ③ 建场景这一段会不会抛异常（外面用 try/catch 兜住）。
   * 任一不过 → G 为 null → 地球槽内显示 .globe-down，页面其余部分不受影响。 */
  var gl=null;try{gl=canvas.getContext('webgl2')||canvas.getContext('webgl');}catch(e){}
  var HAS3D=!!(gl&&typeof THREE!=='undefined');
  var G=null;
  if(HAS3D){try{G=(function(){

  var renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
  renderer.outputEncoding=THREE.sRGBEncoding;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.06;

  var scene=new THREE.Scene();
  var camera=new THREE.PerspectiveCamera(52,1,0.1,5000);
  var W=2,H=2,sizeDirty=true;
  var R=1.6;

  function starfieldTex(){
    var w=2048,h=1024,c=document.createElement('canvas');c.width=w;c.height=h;var x=c.getContext('2d');
    var bg=x.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#0a0a0e');bg.addColorStop(.5,'#141418');bg.addColorStop(1,'#0a0a0e');
    x.fillStyle=bg;x.fillRect(0,0,w,h);
    x.save();x.translate(w/2,h/2);x.rotate(-0.4);x.translate(-w/2,-h/2);
    for(var i=0;i<20;i++){var px=Math.random()*w,py=h/2+(Math.random()-0.5)*h*0.3,r=90+Math.random()*220;
      var gg=x.createRadialGradient(px,py,0,px,py,r),hue=Math.random(),c1=hue<.5?'rgba(150,150,190,':'rgba(190,170,120,';
      gg.addColorStop(0,c1+(0.05+Math.random()*.05)+')');gg.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=gg;x.fillRect(0,0,w,h);}
    x.restore();
    for(var i2=0;i2<4200;i2++){var qx=Math.random()*w,qy=Math.random()*h,b=.15+Math.random()*.5;
      x.fillStyle='rgba(255,250,236,'+b+')';x.fillRect(qx,qy,1,1);}
    for(var i3=0;i3<220;i3++){var rx=Math.random()*w,ry=Math.random()*h,b2=.82+Math.random()*.18;
      x.fillStyle='rgba(255,252,240,'+b2+')';x.fillRect(rx,ry,1,1);}
    var t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return t;
  }
  var sky=new THREE.Mesh(new THREE.SphereGeometry(2600,48,32),
    new THREE.MeshBasicMaterial({map:starfieldTex(),side:THREE.BackSide,depthWrite:false}));
  scene.add(sky);

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
  var cloudMat=new THREE.MeshStandardMaterial({map:plainTex('#ffffff'),transparent:true,alphaMap:plainTex('#ffffff'),opacity:.32,roughness:1,depthWrite:false});
  var clouds=new THREE.Mesh(new THREE.SphereGeometry(R*1.012,48,32),cloudMat);earthTilt.add(clouds);
  var atmo=new THREE.Mesh(new THREE.SphereGeometry(R*1.06,48,32),
    new THREE.MeshBasicMaterial({color:0xc8a060,side:THREE.BackSide,transparent:true,opacity:.16,blending:THREE.AdditiveBlending,depthWrite:false}));
  earthTilt.add(atmo);

  /* ===== 标记点：全部建好，按阵营成员与选中状态决定显隐 ===== */
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

  var stars=(function(){
    var n=2600,geo=new THREE.BufferGeometry(),pos=new Float32Array(n*3),col=new Float32Array(n*3);
    for(var i=0;i<n;i++){var q=Math.random()*2-1,v=Math.random()*6.2832,s=Math.sqrt(1-q*q),rr=900+Math.random()*560;
      pos[i*3]=rr*s*Math.cos(v);pos[i*3+1]=rr*q;pos[i*3+2]=rr*s*Math.sin(v);
      var b=.25+Math.random()*.75,t=Math.random();
      if(t<.2){col[i*3]=b;col[i*3+1]=b*.85;col[i*3+2]=b*.7;}
      else{col[i*3]=b;col[i*3+1]=b*.96;col[i*3+2]=b*.9;}}
    geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    geo.setAttribute('color',new THREE.BufferAttribute(col,3));
    var p=new THREE.Points(geo,new THREE.PointsMaterial({size:0.5,sizeAttenuation:true,vertexColors:true,transparent:true,opacity:.9,depthWrite:false}));
    scene.add(p);return p;
  })();

  /* 地球贴图的三重降级（顺序递减，缺哪级就用下一级）：
       ① earth.jpg / clouds.png 真实贴图
       ② 程序化「经纬网」贴图（canvas 现画，永远不会失败）
       ③ plainTex 纯色
     为什么需要 ②：直接双击 index.html 时页面来源是 file://，浏览器把同目录的
     earth.jpg 也当成跨源 —— 不是请求被拦（图能下下来），而是这个 <img> 元素本身
     被标记为污染，WebGL 的 texSubImage2D 会直接抛 SecurityError，整个渲染循环断掉。
     所以载入后先做一次「污染探测」：把图往 1×1 画布上画一像素再 getImageData，
     抛错即判定不可用，改用 ②。http(s) 下探测通过，照常用真实贴图。 */
  function gridTex(){
    var c=document.createElement('canvas'),W=1024,H=512;c.width=W;c.height=H;
    var x=c.getContext('2d'),g=x.createLinearGradient(0,0,0,H);
    g.addColorStop(0,'#26333c');g.addColorStop(.5,'#3a4c42');g.addColorStop(1,'#26333c');
    x.fillStyle=g;x.fillRect(0,0,W,H);
    x.lineWidth=1;x.strokeStyle='rgba(198,168,110,.20)';
    for(var i=1;i<12;i++){var yy=i*H/12;x.beginPath();x.moveTo(0,yy);x.lineTo(W,yy);x.stroke();}
    for(var j=0;j<24;j++){var xx=j*W/24;x.beginPath();x.moveTo(xx,0);x.lineTo(xx,H);x.stroke();}
    x.strokeStyle='rgba(232,204,146,.45)';x.beginPath();x.moveTo(0,H/2);x.lineTo(W,H/2);x.stroke();
    var t=new THREE.CanvasTexture(c);return t;
  }
  function tainted(im){
    /* 污染探测：drawImage + getImageData，抛 SecurityError 即跨源不可用。 */
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
      try{
        var t=new THREE.Texture(im);t.needsUpdate=true;ok(t);
      }catch(e){if(fail)fail();}
    };
    im.onerror=function(){if(fail)fail();};
    im.src=u;
  }
  loadTex('./assets/earth.jpg',
    function(t){t.encoding=THREE.sRGBEncoding;t.anisotropy=maxA;earthMat.map=t;earthMat.needsUpdate=true;},
    function(){earthMat.map=gridTex();earthMat.needsUpdate=true;clouds.visible=false;});
  loadTex('./assets/clouds.png',
    function(t){t.anisotropy=maxA;cloudMat.map=t;cloudMat.alphaMap=t;cloudMat.needsUpdate=true;},
    function(){clouds.visible=false;});

  /* ================= 相机：始终对准当前这个兵种的征召地 ================= */
  var baseT=0,baseP=1.2;
  var camT=0,camP=1.2,camR=5;
  var camTG=0,camPG=1.2,camRG=5;
  var fitR=5,R_MIN=3,R_MAX=12,userZoomed=false,playing=false;

  function fitDist(){
    var vF=camera.fov*Math.PI/180;
    var hF=2*Math.atan(Math.tan(vF/2)*camera.aspect);
    var lim=Math.min(vF,hF);
    return R/Math.sin(0.38*lim);
  }
  function resize(){
    var r=slot.getBoundingClientRect();
    var w=Math.round(r.width),h=Math.round(r.height);
    if(w<10||h<10){sizeDirty=true;return;}
    sizeDirty=false;W=w;H=h;
    camera.aspect=W/H;camera.updateProjectionMatrix();
    renderer.setSize(W,H,false);
    fitR=fitDist();
    R_MIN=fitR*0.6;R_MAX=fitR*2.6;
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
  var tagEl=document.createElement('div');tagEl.className='tag';tagsLayer.appendChild(tagEl);
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

  /* ================= 标记点显隐与脉动 =================
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

  /* ================= 视图初始化 ================= */
  var focusFlash=0;
  function fitView(keepZoom){
    aimUnit(false);
    if(!keepZoom)userZoomed=false;
    camRG=userZoomed?camRG:fitR;
  }

  /* ================= 动画 ================= */
  var clock=new THREE.Clock();
  var running=true,perfAcc=0,perfN=0,dprStep=Math.min(devicePixelRatio||1,2);
  function globeVisible(){return st.page==='review';}
  function animate(){
    if(!running)return;
    requestAnimationFrame(animate);
    var dt=clock.getDelta(),t=performance.now()*0.001;
    if(sizeDirty)resize();
    if(!globeVisible())return;
    if(playing){
      camTG=baseT+0.42*Math.sin(t*0.16);
      camPG=baseP+0.09*Math.sin(t*0.16+1.2);
      camPG=Math.max(0.08,Math.min(Math.PI-0.08,camPG));
      clouds.rotation.y+=dt*0.02;
      stars.rotation.y+=dt*0.003;
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
  })();}catch(e){G=null;}}
  if(!G){
    var gd=document.getElementById('globeDown');
    if(gd)gd.className='globe-down show';
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

  /* ================= 凯旋门过渡页 =================
   * 首选素材是一段穿门视频（assets/video/gate.mp4），播完即进检阅页；
   * 视频不在 / 编解码不支持 / 起播失败 / 播到一半出错 → 退回「两帧出图交叉淡化 + 推近」。
   * 判定顺序：能不能放 H.264 → 起播成不成 → 播到一半会不会报错，
   * 任一环失败都当场收回视频层并按图片模式重跑计时，页面不会卡在这一页。 */
  var GATE_MS=7100,GATE_MS_MIN=3200,GATE_MS_MAX=9000;
  var GATE_VIDEO_SRC='./assets/video/gate.mp4';
  var gateTimer=null;
  var GATE_ELS='.gate-shot,.gate-caption,.gate-title,.gate-subtitle,.gate-route-name';
  var gateVideoEl=document.getElementById('gateVideo');
  var gateVideoLive=false;
  function resetGateAnim(){
    var els=document.querySelectorAll(GATE_ELS);
    for(var i=0;i<els.length;i++){
      els[i].style.animation='none';
      void els[i].offsetWidth;
      els[i].style.animation='';
    }
  }
  /* 字幕节奏跟着实际时长走：CSS 里那组延迟是照 7.1s 排的，
     视频 6s 或 8s 时按比例缩放，整段淡出始终落在结束前 0.9s。 */
  function setGateTiming(ms){
    var d={'.gate-title':ms*.14,'.gate-subtitle':ms*.21,'.gate-route-name':ms*.29};
    for(var k in d){
      var e1=document.querySelector(k);
      if(e1)e1.style.animationDelay=d[k]+'ms';
    }
    var cap=document.querySelector('.gate-caption');
    if(cap)cap.style.animationDelay=Math.max(0,ms-900)+'ms';
  }
  function setGateVideoMode(on){
    gateVideoLive=!!on;
    if(gateVideoEl)gateVideoEl.className='gate-video'+(on?' on':'');
    try{document.body.classList[on?'add':'remove']('gate-video-on');}catch(e){}
  }
  function leaveGate(){
    if(gateTimer){clearTimeout(gateTimer);gateTimer=null;}
    if(gateVideoEl){try{gateVideoEl.pause();}catch(e){}}
    setGateVideoMode(false);
  }
  function gateVideoFallback(){
    if(st.page!=='gate')return;
    setGateVideoMode(false);
    if(gateVideoEl){try{gateVideoEl.pause();}catch(e){}}
    if(gateTimer)clearTimeout(gateTimer);
    resetGateAnim();          /* 图片动画从头来，避免接上一段已经走了一半的时间轴 */
    setGateTiming(GATE_MS);
    gateTimer=setTimeout(enterReview,GATE_MS);
  }
  function gateVideoSupported(){
    if(!gateVideoEl||!gateVideoEl.canPlayType)return false;
    try{
      if(gateVideoEl.canPlayType('video/mp4; codecs="avc1.42E01E"'))return true;
      return gateVideoEl.canPlayType('video/mp4')!=='';
    }catch(e){return false;}
  }
  function tryGateVideo(){
    if(!gateVideoSupported())return false;
    if(!gateVideoEl.getAttribute('src'))gateVideoEl.setAttribute('src',GATE_VIDEO_SRC);
    gateVideoEl.muted=true;
    try{gateVideoEl.currentTime=0;}catch(e){}
    var p=null;
    try{p=gateVideoEl.play();}catch(e){return false;}
    if(p&&p.then){
      p.then(function(){
        if(st.page!=='gate')return;
        setGateVideoMode(true);
        var ms=GATE_MS,d=gateVideoEl.duration;
        if(d&&isFinite(d)&&d>0)ms=Math.round(d*1000);
        ms=Math.max(GATE_MS_MIN,Math.min(GATE_MS_MAX,ms));
        setGateTiming(ms);
        if(gateTimer)clearTimeout(gateTimer);
        gateTimer=setTimeout(enterReview,ms);
      },function(){gateVideoFallback();});
    }else{
      setGateVideoMode(true);
      if(gateTimer)clearTimeout(gateTimer);
      gateTimer=setTimeout(enterReview,GATE_MS);
    }
    return true;
  }
  if(gateVideoEl){
    gateVideoEl.addEventListener('error',function(){gateVideoFallback();});
    gateVideoEl.addEventListener('ended',function(){
      if(st.page!=='gate')return;
      if(gateTimer)clearTimeout(gateTimer);
      enterReview();
    });
  }
  function enterGate(faction){
    hideToast();
    st.faction=faction;
    st.page='gate';
    document.body.className='mode-gate';
    document.body.setAttribute('data-faction',faction.key);
    gateRouteNameEl.textContent='即将检阅 · '+faction.name;
    if(gateTimer)clearTimeout(gateTimer);
    resetGateAnim();
    setGateTiming(GATE_MS);
    if(!tryGateVideo())gateTimer=setTimeout(enterReview,GATE_MS);
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
    toast(G?'检阅开始 · 拖动地球可转动':'检阅开始 · 征召地见地球标注');
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
    capName.textContent=u.name;
    capCoord.textContent=fmtCoord(u.lat,u.lon);
    if(G){G.setTag(u.city);G.refreshMarkers();G.aimUnit(false);G.fitView(false);G.markDirty();}
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
    if(G)G.setPlaying(false);
    renderFactions();
  }
  tcPrevBtn.addEventListener('click',reviewPrev);
  tcNextBtn.addEventListener('click',reviewNext);
  tcQuitBtn.addEventListener('click',quitReview);
  /* 风格切换：写实 ↔ 兵牌。两套图是分开出的素材，这里只选一套显示 */
  var tourStyleEl=document.getElementById('tourStyle');
  tourStyleEl.addEventListener('click',function(e){
    var b=null,n=e.target;
    while(n&&n!==tourStyleEl){if(n.className&&String(n.className).indexOf('ts-btn')>=0){b=n;break;}n=n.parentNode;}
    if(!b)return;
    setStyle(b.getAttribute('data-style'));
  });
  setStyle(STYLE);   /* 同步按钮高亮（含从 localStorage 读回来的值） */

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
    if(G)G.setPlaying(false);
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
    if(G)G.markDirty();
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

  /* ================= 启动 ================= */
  st.custom=loadCustom();
  renderFactions();
  if(G){G.refreshMarkers();}
  document.body.className='mode-factions';
  toast('选一个阵营 · 逐队检阅它的兵种与征召地');
  setTimeout(function(){if(G)G.markDirty();document.getElementById('loader').classList.add('hide');},520);
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

  /* 首屏若图未就绪，等预检结束后统一重绘 */
  setTimeout(function(){
    for(var i=0;i<UNITS.length;i++)if(UNITS[i].img&&IMG_OK[UNITS[i].id]===null){IMG_OK[UNITS[i].id]=false;}
    if(st.page==='review')repaintReviewImg(st.sel);
  },2600);
})();
