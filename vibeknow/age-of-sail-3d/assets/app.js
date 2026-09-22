(function(){
  'use strict';

  var SHIPS=window.SHIPS||[];

  /* ===== DOM 引用 ===== */
  var slot=document.getElementById('globeSlot');
  var canvas=document.getElementById('stage');
  var tagsLayer=document.getElementById('globeTags');
  var capName=document.getElementById('capName');
  var capCoord=document.getElementById('capCoord');

  var routeListEl=document.getElementById('routeList');
  var departTitleEl=document.getElementById('departTitle');
  var departRouteNameEl=document.getElementById('departRouteName');
  var voyageCrumbEl=document.getElementById('voyageCrumb');
  var voyageBodyEl=document.getElementById('voyageBody');
  var voyageImgEl=document.getElementById('voyageImg');
  var voyageNameEl=document.getElementById('voyageName');
  var voyageYardEl=document.getElementById('voyageYard');
  var voyageIntroEl=document.getElementById('voyageIntro');
  var voyageTraitsEl=document.getElementById('voyageTraits');
  var voyageClassEl=document.getElementById('voyageClass');
  var voyageTaglineEl=document.getElementById('voyageTagline');
  var voyageDataEl=document.getElementById('voyageData');
  var voyageNoEl=document.getElementById('voyageNo');
  var voyageYearEl=document.getElementById('voyageYear');
  var voyageTonsEl=document.getElementById('voyageTons');
  var voyageBarFillEl=document.getElementById('voyageBarFill');
  var vcPrevBtn=document.getElementById('vcPrev');
  var vcNextBtn=document.getElementById('vcNext');
  var vcQuitBtn=document.getElementById('vcQuit');
  var logBodyEl=document.getElementById('logBody');
  var logCountEl=document.getElementById('logCount');
  var logFamEl=document.getElementById('logFam');
  var logCountryEl=document.getElementById('logCountry');
  var logBriefEl=document.getElementById('logBrief');
  var logBarsEl=document.getElementById('logBars');
  var logShipsEl=document.getElementById('logShips');
  var lcBackBtn=document.getElementById('lcBack');
  var lcAgainBtn=document.getElementById('lcAgain');

  var bdBackBtn=document.getElementById('bdBack');
  var bdTitleEl=document.getElementById('builderTtl');
  var bdPickedEl=document.getElementById('bdPicked');
  var bdPoolEl=document.getElementById('bdPool');
  var bdStartBtn=document.getElementById('bdStart');
  var bdRandomBtn=document.getElementById('bdRandom');
  var builderBodyEl=document.getElementById('builderBody');
  var hintEl=document.getElementById('hint');

  /* ================= 舰队数据 =================
   * 每支舰队精选若干帆船，按检阅顺序排列（顺序即「海图上的停靠点序号」）。
   * 配色与 index.html 的 body[data-route] 一致，同时作为舰队卡片的内联主题。 */
  var ROUTES=[
    {key:'merchant',name:'商船舰队',badge:'贸易',intensity:2,
     desc:'沿舱容递增走一遭：从阿拉伯海的轻快船到西班牙大帆船，看清每一档载重背后的船身代价。',
     ships:[20,1,2,24,14,15,16,17],
     dark:'#1a1206',mid:'#3d2a0c',light:'#8a6a1a',accent:'#c9a227',accent2:'#e0bc4a'},
    {key:'warship',name:'战舰舰队',badge:'海战',intensity:5,
     desc:'从单列炮的加莱桨帆船，到三层炮甲板的战列舰，一路看炮位怎么长满整条舷侧。',
     ships:[7,29,8,4,28,17,9,5],
     dark:'#200806',mid:'#4a120c',light:'#8a2a1a',accent:'#c0392b',accent2:'#e05a45'},
    {key:'explorer',name:'探险舰队',badge:'远洋',intensity:3,
     desc:'轻船身、深吃风、能逆风返航——这支舰队里全是把海岸线推远的船，从独桅三角帆船到卡拉维尔。',
     ships:[18,6,12,13,3,23,26,11],
     dark:'#04121a',mid:'#0d2c3d',light:'#205a75',accent:'#2f8fb0',accent2:'#57b8d4'},
    {key:'lineage',name:'巡礼舰队',badge:'通史',intensity:2,
     desc:'八艘按年代依次编入：柯克船 → 卡拉维尔 → 卡拉克 → 拿屋 → 盖伦 → 大帆船 → 护航舰 → 战列舰，一趟巡礼看尽三百年船型更替。',
     ships:[0,12,14,15,16,17,4,5],
     dark:'#0a1410',mid:'#16301f',light:'#2f5a3a',accent:'#5a9a6a',accent2:'#7fc08a'},
    {key:'east',name:'东方舰队',badge:'季风',intensity:3,
     desc:'从阿拉伯海缝合船板的季风帆船，到明清的火器水军：硬帆、铁甲与龟背——看欧洲之外的另一半海洋。',
     ships:[18,19,25,21,27,28,22,29],
     dark:'#150a1e',mid:'#3a1245',light:'#6a2a80',accent:'#8f4ab0',accent2:'#b98ad6'}
  ];

  /* 自选舰队：船长自己组建的一支舰队，同样进航海/日志全流程 */
  var CUSTOM_ROUTE={key:'custom',name:'自选舰队',badge:'自定义',intensity:3,custom:true,
    desc:'船长自己组建的一支舰队：点名录编入舰队，按编入顺序依次检阅。',
    ships:[],
    dark:'#1a0c06',mid:'#4a220c',light:'#8a4a1a',accent:'#cc6a2a',accent2:'#e08a4a'};

  /* ================= 常量 ================= */
  var FAMILY_LABEL={northsea:'北海系',mediterranean:'地中海系',atlantic:'大西洋系',indian:'印度洋系',eastasia:'东亚系'};
  var FAMILY_ORDER=['northsea','mediterranean','atlantic','indian','eastasia'];
  var CLASS_LABEL={small:'小型船',medium:'中型船',large:'大型船'};
  var CLASS_EN={small:'SMALL',medium:'MEDIUM',large:'LARGE'};
  var STATS_DIMS=['载重','火力','航速','耐久','机动','稀有'];
  var STORE_KEY='aos3d.customRoute';

  /* ================= 状态 ================= */
  var st={page:'routes',route:null,routeIdx:-1,voyageIdx:0,sel:0,custom:[]};

  /* ================= 自动播放演示模式（?demo / ?demo=warship / ?loop）=================
   * 用途：小红书宣传片实机录制 + app 内「观演模式」。全程零手动操作——
   * 组建舰队页停留数秒后自动选一支舰队 → 出港自动播放（自带 7.1s）→ 航海页每站定时自动前进
   * → 航海日志停留后结束（带 ?loop 则回到组建舰队页循环重播）。
   * 相机滑行由相机自带的 glide 完成，无需手拖；键盘在演示模式被禁用，纯播放。
   * 录制铁律：按手机逻辑尺寸（9:16）录，ffmpeg lanczos 放大，禁止 CSS zoom / transform:scale。 */
  var QP=(location.search?new URLSearchParams(location.search):new URLSearchParams(''));
  var DEMO=QP.has('demo');
  var DEMO_LOOP=QP.has('loop');
  var DEMO_ROUTE=(QP.get('demo')||'merchant');
  var DEMO_ROUTE_MS=5400;    // 组建舰队页停留
  var DEMO_VOYAGE_MS=3400;   // 每站停留（含船档卡阅读 + 相机滑行，滑行最长 2.6s）
  var DEMO_LOG_MS=5200;      // 航海日志页停留
  /* ?warm=N（秒）：演示开始前先静置 N 秒。软件渲染（SwiftShader）下给着色器/
     地球组件预热时间，避免开头第一波动作掉帧；录制宣传片时用 ?demo&warm=3 */
  var DEMO_WARM_MS=Math.max(0,(parseInt(QP.get('warm'),10)||0))*1000;
  var demoTimers=[];
  function demoAfter(ms,fn){var id=setTimeout(fn,ms);demoTimers.push(id);return id;}
  function demoClear(){for(var i=0;i<demoTimers.length;i++)clearTimeout(demoTimers[i]);demoTimers=[];}
  /* 演示模式下平滑滚动元素到指定位置（用于组建舰队页/日志页一屏放不下时，
     让录屏能带出完整内容而不是只卡顶部） */
  function demoSmoothScroll(el, to, duration, cb){
    if(!el)return cb&&cb();
    var start=el.scrollTop, t0=null;
    function step(t){
      if(!t0)t0=t;
      var p=Math.min(1,(t-t0)/Math.max(1,duration));
      p=p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2; // easeInOutQuad
      el.scrollTop=start+(to-start)*p;
      if(p<1)requestAnimationFrame(step);
      else if(cb)cb();
    }
    requestAnimationFrame(step);
  }
  function startDemo(){
    // 组建舰队页一屏放不下，演示时先向下扫一眼再回顶，再起锚出港
    var routeSec=document.querySelector('.route-section');
    if(routeSec){
      demoAfter(500,function(){
        var max=Math.max(0,routeSec.scrollHeight-routeSec.clientHeight);
        if(max>0){
          demoSmoothScroll(routeSec, max, 2400, function(){
            demoAfter(260,function(){demoSmoothScroll(routeSec, 0, 1100);});
          });
        }
      });
    }
    demoAfter(DEMO_ROUTE_MS,function(){
      if(st.page!=='routes')return;
      var idx=0;
      for(var i=0;i<ROUTES.length;i++){if(ROUTES[i].key===DEMO_ROUTE){idx=i;break;}}
      enterDepart(ROUTES[idx]);
    });
  }
  function demoVoyageStep(){
    demoAfter(DEMO_VOYAGE_MS,function(){
      if(st.page!=='voyage')return;
      voyageNext();               // 前进一站；末站会自动跳到日志页
      if(st.page==='voyage')demoVoyageStep();
      /* page==='log' 时由 showLog 里的 demoEnd 接管 */
    });
  }
  function demoEnd(){
    demoClear();
    if(DEMO_LOOP){backToRoutes();demoAfter(1600,startDemo);}
  }

  /* ================= 自选舰队存档（localStorage，失败即静默降级）================= */
  function loadCustom(){
    try{
      var raw=window.localStorage.getItem(STORE_KEY);
      if(!raw)return [];
      var arr=JSON.parse(raw);
      if(!arr||typeof arr.length!=='number')return [];
      var out=[];
      for(var i=0;i<arr.length;i++){
        var v=parseInt(arr[i],10);
        if(!isNaN(v)&&v>=0&&v<SHIPS.length&&out.indexOf(v)<0)out.push(v);
      }
      return out;
    }catch(e){return [];}
  }
  function saveCustom(){
    try{window.localStorage.setItem(STORE_KEY,JSON.stringify(st.custom));}catch(e){}
  }

  /* 当前舰队对象：预设 5 支，或船长自选那支 */
  function curRoute(){return st.route||ROUTES[0];}

  /* ================= 工具函数 ================= */
  function tonsOf(f){return (f&&typeof f.tons==='number')?f.tons:0;}
  function fmtL(v){return String(v).replace(/\B(?=(\d{3})+(?!\d))/g,',');}
  function fmtCoord(lat,lon){
    return Math.abs(lat).toFixed(1)+'°'+(lat>=0?'N':'S')+' '+Math.abs(lon).toFixed(1)+'°'+(lon>=0?'E':'W');
  }

  /* ================= 颜色与帆船图（图可缺，回退色卡）================= */
  function hex2rgb(h){h=String(h).replace('#','');return [parseInt(h.substr(0,2),16),parseInt(h.substr(2,2),16),parseInt(h.substr(4,2),16)];}
  function rgb2hex(r){function f(v){v=Math.max(0,Math.min(255,Math.round(v)));return ('0'+v.toString(16)).slice(-2);}return '#'+f(r[0])+f(r[1])+f(r[2]);}
  function lighten(h,a){var r=hex2rgb(h);return rgb2hex([r[0]+(255-r[0])*a,r[1]+(255-r[1])*a,r[2]+(255-r[2])*a]);}
  function darken(h,a){var r=hex2rgb(h);return rgb2hex([r[0]*(1-a),r[1]*(1-a),r[2]*(1-a)]);}
  function plateGrad(c){return 'radial-gradient(circle at 32% 26%,'+lighten(c,.3)+','+c+' 56%,'+darken(c,.36)+' 100%)';}
  var IMG_OK={};
  SHIPS.forEach(function(f,i){
    if(!f.img){IMG_OK[f.name]=false;return;}
    IMG_OK[f.name]=null;
    var im=new Image();
    im.onload=function(){IMG_OK[f.name]=true;repaintVoyageImg(i);};
    im.onerror=function(){IMG_OK[f.name]=false;};
    im.src=f.img;
  });
  function thumbStyle(f){
    /* contain 而非 cover：帆船图是 1:1 方图，遇到非方形图位（矮屏被挤扁的画框）
       也只留深色边，绝不裁掉桅顶与龙骨；方形图位（航海页方画框 / 名录 38×38 缩略图）
       与 cover 等效，不会出现留白 */
    if(f.img&&IMG_OK[f.name]===true)
      return "background-image:url('"+f.img+"');background-size:contain;background-repeat:no-repeat;background-position:center";
    return 'background:'+plateGrad(f.color||'#8a6b3a');
  }
  function repaintVoyageImg(i){
    if(st.page==='voyage'&&i===st.sel){
      voyageImgEl.setAttribute('style',thumbStyle(SHIPS[i]));
    }
    shipSharePaint();      /* 原图到货／失败都会走到这里，顺手刷新分享按钮 */
  }

  /* ================= 3D 地球组件（可降级）=================
   * 三层能力检测，任一不过就降级——地球在这里只是「标建造地」的组件，
   * 它跑不起来不该连累整页（组建舰队 / 出港 / 航海 / 日志全部照常）：
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
  renderer.toneMappingExposure=1.08;

  var scene=new THREE.Scene();
  var camera=new THREE.PerspectiveCamera(52,1,0.1,5000);
  var W=2,H=2,sizeDirty=true;
  var R=1.6;

  function starfieldTex(){
    var w=2048,h=1024,c=document.createElement('canvas');c.width=w;c.height=h;var x=c.getContext('2d');
    var bg=x.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#03080e');bg.addColorStop(.5,'#0a1a2c');bg.addColorStop(1,'#03080e');
    x.fillStyle=bg;x.fillRect(0,0,w,h);
    x.save();x.translate(w/2,h/2);x.rotate(-0.4);x.translate(-w/2,-h/2);
    for(var i=0;i<22;i++){var px=Math.random()*w,py=h/2+(Math.random()-0.5)*h*0.3,r=90+Math.random()*220;
      var gg=x.createRadialGradient(px,py,0,px,py,r),hue=Math.random(),c1=hue<.45?'rgba(140,180,220,':(hue<.75?'rgba(120,160,200,':'rgba(176,150,96,');
      gg.addColorStop(0,c1+(0.05+Math.random()*.06)+')');gg.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=gg;x.fillRect(0,0,w,h);}
    x.restore();
    for(var i2=0;i2<4200;i2++){var qx=Math.random()*w,qy=Math.random()*h,b=.15+Math.random()*.5;
      x.fillStyle='rgba(226,236,255,'+b+')';x.fillRect(qx,qy,1,1);}
    for(var i3=0;i3<220;i3++){var rx=Math.random()*w,ry=Math.random()*h,b2=.82+Math.random()*.18;
      x.fillStyle='rgba(255,244,214,'+b2+')';x.fillRect(rx,ry,1,1);}
    var t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return t;
  }
  var sky=new THREE.Mesh(new THREE.SphereGeometry(2600,48,32),
    new THREE.MeshBasicMaterial({map:starfieldTex(),side:THREE.BackSide,depthWrite:false}));
  scene.add(sky);

  var ambient=new THREE.AmbientLight(0x9ab0c8,0.5);scene.add(ambient);
  var lampLight=new THREE.PointLight(0xffd0a0,1.15,0,1.3);lampLight.position.set(18,7,14);scene.add(lampLight);
  var fillLight=new THREE.PointLight(0x4a6a7a,0.8,0,1.3);fillLight.position.set(-16,-6,-12);scene.add(fillLight);
  var candleLight=new THREE.PointLight(0xb0894a,0.7,300,1.6);candleLight.position.set(-26,-30,18);scene.add(candleLight);

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
  var earthMat=new THREE.MeshStandardMaterial({map:plainTex('#2a4a6a'),color:0xffffff,roughness:.82,metalness:.06});
  var earthMesh=new THREE.Mesh(new THREE.SphereGeometry(R,64,44),earthMat);earthGroup.add(earthMesh);
  var cloudMat=new THREE.MeshStandardMaterial({map:plainTex('#ffffff'),transparent:true,alphaMap:plainTex('#ffffff'),opacity:.14,roughness:1,depthWrite:false});
  var clouds=new THREE.Mesh(new THREE.SphereGeometry(R*1.012,48,32),cloudMat);earthTilt.add(clouds);
  var atmo=new THREE.Mesh(new THREE.SphereGeometry(R*1.06,48,32),
    new THREE.MeshBasicMaterial({color:0x6a9ac0,side:THREE.BackSide,transparent:true,opacity:.1,blending:THREE.AdditiveBlending,depthWrite:false}));
  earthTilt.add(atmo);

  /* ===== 标记点：全部建好，按舰队成员与选中状态决定显隐 ===== */
  var markerGroup=new THREE.Group();earthGroup.add(markerGroup);
  var glowTex=radialTex('rgba(255,220,180,.95)','rgba(255,150,60,.45)','rgba(255,100,30,0)');
  var ringTex=radialTex('rgba(255,200,140,.7)','rgba(255,150,60,.25)','rgba(255,100,30,0)');
  var markers=[];
  (function buildMarkers(){
    for(var i=0;i<SHIPS.length;i++){
      var f=SHIPS[i];
      var grp=new THREE.Group();
      grp.position.copy(ll2v(f.lat,f.lon,R*1.012));
      grp.lookAt(0,0,0);grp.rotateX(Math.PI);
      var col=new THREE.Color(f.color);
      var dot=new THREE.Mesh(new THREE.SphereGeometry(0.052,14,14),new THREE.MeshBasicMaterial({color:col}));
      var glow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,depthTest:false,color:col}));
      glow.scale.set(0.46,0.46,1);
      var ring=new THREE.Sprite(new THREE.SpriteMaterial({map:ringTex,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,depthTest:false,color:col,opacity:.8}));
      ring.scale.set(0.72,0.72,1);
      grp.add(dot);grp.add(glow);grp.add(ring);
      markerGroup.add(grp);
      markers.push({ship:f,grp:grp,dot:dot,glow:glow,ring:ring,dim:false,visible:false});
    }
  })();

  var stars=(function(){
    var n=2600,geo=new THREE.BufferGeometry(),pos=new Float32Array(n*3),col=new Float32Array(n*3);
    for(var i=0;i<n;i++){var u=Math.random()*2-1,v=Math.random()*6.2832,s=Math.sqrt(1-u*u),rr=900+Math.random()*560;
      pos[i*3]=rr*s*Math.cos(v);pos[i*3+1]=rr*u;pos[i*3+2]=rr*s*Math.sin(v);
      var b=.25+Math.random()*.75,t=Math.random();
      if(t<.2){col[i*3]=b;col[i*3+1]=b*.9;col[i*3+2]=b*.75;}
      else{col[i*3]=b*.95;col[i*3+1]=b;col[i*3+2]=b;}}
    geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    geo.setAttribute('color',new THREE.BufferAttribute(col,3));
    var p=new THREE.Points(geo,new THREE.PointsMaterial({size:0.5,sizeAttenuation:true,vertexColors:true,transparent:true,opacity:.9,depthWrite:false}));
    scene.add(p);return p;
  })();

  var texLoader=new THREE.TextureLoader();texLoader.setCrossOrigin('anonymous');
  var maxA=renderer.capabilities.getMaxAnisotropy();
  function loadTex(u,ok){texLoader.load(u,ok,undefined,function(){});}
  loadTex('./assets/earth.jpg',function(t){t.encoding=THREE.sRGBEncoding;t.anisotropy=maxA;earthMat.map=t;earthMat.needsUpdate=true;});
  loadTex('./assets/clouds.png',function(t){t.anisotropy=maxA;cloudMat.map=t;cloudMat.alphaMap=t;cloudMat.needsUpdate=true;});

  /* ================= 相机：始终对准当前这艘船的建造地 =================
   * camT/camP = 相机当前球坐标；baseT/baseP = 当前这艘建造地的目标坐标。
   * 换船不再"摆头"：由 glide 按两点角距离定时长，整段平滑滑行过去（见 animate）。
   * 滑行途中手一按就取消，让位给拖动。 */
  var baseT=0,baseP=1.2;
  var camT=0,camP=1.2,camR=5;
  var camRG=5;
  var fitR=5,R_MIN=3,R_MAX=12,userZoomed=false,playing=false;
  var glide=null;
  function angDelta(a,b){var d=b-a;return ((d+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;}
  /* 从当前视点滑到 (t1,p1)：时长随角距离增长（0.7–2.6s），取最短角路径（不绕地球背面） */
  function glideTo(t1,p1){
    var dT=angDelta(camT,t1),dP=p1-camP;
    var dist=Math.sqrt(dT*dT+dP*dP);
    if(dist<0.0025){glide=null;camT=t1;camP=p1;return;}
    glide={t0:performance.now(),dur:Math.min(2600,700+dist*1700),T0:camT,P0:camP,T1:camT+dT,P1:p1};
  }

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
  function aimShip(instant){
    var f=SHIPS[st.sel];if(!f)return;
    var local=ll2v(f.lat,f.lon,1);
    var e=earthGroup.rotation.y,cs=Math.cos(e),sn=Math.sin(e);
    var wx=local.x*cs+local.z*sn,wy=local.y,wz=-local.x*sn+local.z*cs;
    baseP=Math.acos(Math.max(-1,Math.min(1,wy)));
    baseT=Math.atan2(wx,wz);
    if(instant){glide=null;camT=baseT;camP=baseP;}
    else glideTo(baseT,baseP);
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
  function tdist(t){return Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);}
  canvas.addEventListener('pointerdown',function(e){
    pointers[e.pointerId]={x:e.clientX,y:e.clientY};
    glide=null;                       /* 手一按就接管：滑行立即让位给拖动 */
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
    camRG*=1+Math.sign(e.deltaY)*0.08;
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

  /* ================= 建造地标签：只标当前这艘 ================= */
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
   * 航海页：舰队里全部帆船的建造地标出，当前这艘高亮脉动，同舰队其余压暗作上下文。
   * 其余页面：标记点全隐（地球也不渲染）。 */
  function refreshMarkers(){
    var routeShips=st.route?st.route.ships:[];
    for(var i=0;i<markers.length;i++){
      var m=markers[i];
      var inRoute=routeShips.indexOf(i)>=0;
      var sel=(i===st.sel);
      m.visible=inRoute;
      m.dim=inRoute&&!sel;
      m.grp.visible=m.visible;
      m.glow.visible=sel;m.ring.visible=sel;
      m.dot.scale.setScalar(sel?1:0.66);
      m.dot.material.color.set(sel?'#ffffff':m.dim?'#c8dcec':'#ffffff');
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
    aimShip(false);
    if(!keepZoom)userZoomed=false;
    camRG=userZoomed?camRG:fitR;
  }

  /* ================= 动画 ================= */
  var clock=new THREE.Clock();
  var running=true,perfAcc=0,perfN=0,dprStep=Math.min(devicePixelRatio||1,2);
  function globeVisible(){return st.page==='voyage';}
  function animate(){
    if(!running)return;
    requestAnimationFrame(animate);
    var dt=clock.getDelta(),t=performance.now()*0.001;
    if(sizeDirty)resize();
    if(!globeVisible())return;
    if(playing){
      /* 航海页只让云层与星空缓慢自转。相机**不再摆动** ——
         旧「公园走路」式左右摆头（0.42rad 正弦）已删除，
         相机改成一站一站整段平滑滑行，见下面的 glide。 */
      clouds.rotation.y+=dt*0.02;
      stars.rotation.y+=dt*0.003;
    }
    if(focusFlash>0)focusFlash=Math.max(0,focusFlash-dt*0.55);
    if(glide){
      var gp=Math.min(1,(performance.now()-glide.t0)/glide.dur);
      var ge=gp<.5?4*gp*gp*gp:1-Math.pow(-2*gp+2,3)/2;   /* easeInOutCubic：起步收尾都软 */
      camT=glide.T0+(glide.T1-glide.T0)*ge;
      camP=glide.P0+(glide.P1-glide.P0)*ge;
      if(gp>=1)glide=null;
    }else{
      /* 拖动 / 归位：跟手收敛到目标。
         必须按**最短角路径**收敛：glide 的终点是 camT + 最短角差，与 baseT
         只差 2π 的整数倍（数值不等但方位等价）；直接 (baseT-camT) 会读成
         ±2π 的偏差，滑行到位后又多绕一圈才停。 */
      camT+=angDelta(camT,baseT)*0.14;camP+=(baseP-camP)*0.14;
    }
    camP=Math.max(0.08,Math.min(Math.PI-0.08,camP));
    camR+=(camRG-camR)*0.1;
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
    aimShip:aimShip,
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

  /* ================= 组建舰队页渲染 ================= */
  /* 牌右缘的水印印记：预设舰队 = 罗盘玫瑰；自选舰队 = 船长火漆印（桅帆纹）。
     两枚都是内联 SVG，随舰队主题色上色，不依赖任何图片。 */
  function cardSeal(isCustom){
    if(isCustom){
      return '<svg class="route-compass wax" viewBox="0 0 100 100" aria-hidden="true">'+
        '<circle cx="50" cy="50" r="37"/><circle cx="50" cy="50" r="31"/>'+
        '<path d="M50 22 L50 70"/>'+
        '<path d="M53 28 L70 63 L53 63 Z"/>'+
        '<path d="M30 70 L70 70 L63 79 L37 79 Z"/>'+
      '</svg>';
    }
    return '<svg class="route-compass" viewBox="0 0 100 100" aria-hidden="true">'+
      '<circle cx="50" cy="50" r="46"/><circle cx="50" cy="50" r="38"/>'+
      '<path class="long" d="M50 6 L56 50 L50 94 L44 50 Z"/>'+
      '<path class="long" d="M50 6 L56 50 L50 94 L44 50 Z" transform="rotate(90 50 50)"/>'+
      '<path class="short" d="M50 26 L55 50 L50 74 L45 50 Z" transform="rotate(45 50 50)"/>'+
      '<path class="short" d="M50 26 L55 50 L50 74 L45 50 Z" transform="rotate(135 50 50)"/>'+
    '</svg>';
  }
  /* 一张舰队告示牌：主题色来自舰队对象，横幅缺图自动回退纸纹与渐变 */
  function routeCardHTML(r,ride,tab,cta,extra){
    var n=r.ships.length,fams={},cns={},i,dots='',theme=
      '--rc-dark:'+r.dark+';--rc-mid:'+r.mid+';--rc-light:'+r.light+
      ';--rc-accent:'+r.accent+';--rc-accent-2:'+r.accent2;
    for(i=0;i<n;i++){var f=SHIPS[r.ships[i]];fams[f.family]=1;cns[f.country]=1;}
    for(i=0;i<5;i++)dots+='<i'+(i<r.intensity?' class="on"':'')+'></i>';
    return '<button class="route-card'+(extra||'')+'" data-ride="'+ride+'">'+
      '<div class="route-card-bg" style="'+theme+';--rc-banner:url(\'./assets/tex/route-'+r.key+'.webp\')"></div>'+
      '<div class="route-card-inner" style="'+theme+'">'+
        cardSeal(!!r.custom)+
        '<span class="route-tab">'+tab+'</span>'+
        '<div class="route-card-head">'+
          '<div class="route-name">'+r.name+'</div>'+
          '<div class="route-badge">'+r.badge+'</div>'+
        '</div>'+
        '<div class="route-desc">'+r.desc+'</div>'+
        '<div class="route-meta">'+
          '<span class="route-stat"><b>'+n+'</b>艘帆船</span>'+
          '<span class="route-stat"><b>'+Object.keys(fams).length+'</b>个海域</span>'+
          '<span class="route-stat"><b>'+Object.keys(cns).length+'</b>个建造国</span>'+
          (r.custom?'':'<span class="route-stat">强度 <span class="route-intensity">'+dots+'</span></span>')+
        '</div>'+
        '<div class="route-cta">'+cta+'</div>'+
      '</div>'+
    '</button>';
  }
  function renderRoutes(){
    var html='',i;
    for(i=0;i<ROUTES.length;i++)html+=routeCardHTML(ROUTES[i],i,'LOG-'+('0'+(i+1)).slice(-2),'起锚出港','');
    CUSTOM_ROUTE.ships=st.custom;
    CUSTOM_ROUTE.desc=st.custom.length
      ?'船长自己组建的一支舰队：按「我的舰队」里的顺序，一艘一艘检阅。'
      :'还没有舰队。进名录挑船，按自己的顺序组建一支横穿海域的舰队——先看哪艘，你说了算。';
    html+=routeCardHTML(CUSTOM_ROUTE,'custom','MY LINE',st.custom.length?'起锚出港':'去挑船',' is-custom');
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
    enterDepart(ROUTES[idx]);
  });

  /* ================= 自选舰队页 =================
   * 从 30 艘帆船里挑，按挑选顺序组建一支舰队；存档在本机 localStorage。
   * 组完后走与预设舰队完全相同的「出港 → 航海 → 日志」流程。 */
  function closestAttr(el,attr,root){
    while(el&&el!==root){
      if(el.getAttribute&&el.getAttribute(attr)!==null)return el;
      el=el.parentNode;
    }
    return null;
  }
  function customRouteObj(){
    CUSTOM_ROUTE.ships=st.custom.slice();
    return CUSTOM_ROUTE;
  }
  function renderPicked(){
    var h='',i;
    if(!st.custom.length){
      h='<div class="bd-picked-empty">还没选船 · 从下面的名录里点「＋」编入舰队</div>';
    }else{
      for(i=0;i<st.custom.length;i++){
        var f=SHIPS[st.custom[i]];
        h+='<div class="bd-chip">'+
          '<span class="bd-seq">'+('0'+(i+1)).slice(-2)+'</span>'+
          '<span class="bd-dot" style="background:'+(f.color||'#8a6b3a')+'"></span>'+
          '<span class="bd-nm">'+f.name+'</span>'+
          '<span class="bd-era">'+FAMILY_LABEL[f.family]+'</span>'+
          '<button class="bd-mini" data-mv="'+i+'" data-dir="-1"'+(i===0?' disabled':'')+' title="上移">↑</button>'+
          '<button class="bd-mini" data-mv="'+i+'" data-dir="1"'+(i===st.custom.length-1?' disabled':'')+' title="下移">↓</button>'+
          '<button class="bd-mini bd-del" data-del="'+i+'" title="解除编队">×</button>'+
        '</div>';
      }
    }
    bdPickedEl.innerHTML=h;
    bdTitleEl.textContent='自选舰队 · 船长编成（已编入 '+st.custom.length+' 艘）';
    bdStartBtn.disabled=!st.custom.length;
  }
  function renderPool(){
    var h='',g,i;
    for(g=0;g<FAMILY_ORDER.length;g++){
      var fam=FAMILY_ORDER[g],rows='';
      for(i=0;i<SHIPS.length;i++){
        var f=SHIPS[i];
        if(f.family!==fam)continue;
        var on=st.custom.indexOf(i)>=0;
        rows+='<button class="bd-item'+(on?' picked':'')+'" data-add="'+i+'"'+(on?' disabled':'')+'>'+
          '<span class="bd-thumb" style="'+thumbStyle(f)+'"></span>'+
          '<span class="bd-info">'+
            '<span class="bd-nm2">'+f.name+'</span>'+
            '<span class="bd-sub">'+f.country+' · '+f.yard+' · '+CLASS_LABEL[f.cls]+' · 排水量 '+tonsOf(f)+' 吨 · 火力 '+((f.stats&&f.stats[1])||0)+'/5</span>'+
          '</span>'+
          '<span class="bd-add">'+(on?'✓':'＋')+'</span>'+
        '</button>';
      }
      if(rows)h+='<div class="bd-era-group"><div class="bd-era-head">'+FAMILY_LABEL[fam]+'</div>'+rows+'</div>';
    }
    bdPoolEl.innerHTML=h;
  }
  function renderBuilder(){renderPicked();renderPool();}
  function enterBuilder(){
    st.page='builder';
    document.body.className='mode-builder';
    document.body.setAttribute('data-route','custom');
    renderBuilder();
    builderBodyEl.scrollTop=0;
    toast('点「＋」把帆船编入舰队 · 顺序即检阅顺序');
  }
  function exitBuilder(){
    hideToast();
    st.page='routes';
    document.body.className='mode-routes';
    document.body.removeAttribute('data-route');
    renderRoutes();
  }
  bdPoolEl.addEventListener('click',function(e){
    var b=closestAttr(e.target,'data-add',bdPoolEl);
    if(!b||b.disabled)return;
    var i=parseInt(b.getAttribute('data-add'),10);
    if(isNaN(i)||i<0||i>=SHIPS.length||st.custom.indexOf(i)>=0)return;
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
    for(i=0;i<SHIPS.length;i++)pool.push(i);
    for(i=pool.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=pool[i];pool[i]=pool[j];pool[j]=t;}
    st.custom=pool.slice(0,8).sort(function(a,b){return a-b;});
    saveCustom();renderBuilder();
    toast('已随机编入 8 艘 · 可继续调整顺序');
  });
  bdStartBtn.addEventListener('click',function(){
    if(!st.custom.length)return;
    enterDepart(customRouteObj());
  });
  bdBackBtn.addEventListener('click',exitBuilder);

  /* ================= 出港过渡页 · 起锚扬帆 =================
   * 两帧 AI 出图交叉淡化（.depart-shot.closed → .depart-shot.open）+ 细微推近，
   * 出港过程全在两张图里，这里只负责重置动画、写入舰队名，切换走完进航海页。 */
  var DEPART_MS=7100;
  var departTimer=null;
  var DEPART_ELS='.depart-bg,.depart-shot,.depart-caption,.depart-title,.depart-subtitle,.depart-route-name';
  function resetDepartAnim(){
    var els=document.querySelectorAll(DEPART_ELS);
    for(var i=0;i<els.length;i++){
      els[i].style.animation='none';
      void els[i].offsetWidth;
      els[i].style.animation='';
    }
  }
  function enterDepart(route){
    hideToast();
    st.route=route;
    st.page='depart';
    document.body.className='mode-depart';
    document.body.setAttribute('data-route',route.key);
    departTitleEl.textContent='欢迎登船';
    departRouteNameEl.textContent='即将启航 · '+route.name;
    resetDepartAnim();
    if(departTimer)clearTimeout(departTimer);
    departTimer=setTimeout(enterVoyage,DEPART_MS);
  }

  /* ================= 航海页（舰队沿岸航行）================= */
  function enterVoyage(){
    var r=st.route;
    if(!r||!r.ships.length){quitVoyage();return;}
    st.voyageIdx=0;
    st.sel=r.ships[0];
    st.page='voyage';
    document.body.className='mode-voyage';
    document.body.setAttribute('data-route',r.key);
    if(G)G.setPlaying(true);
    showVoyageShip();
    if(DEMO)demoVoyageStep();
    toast(G?'舰队已离港 · 拖动地球可转动':'舰队已离港 · 建造地见地球标注');
  }
  function showVoyageShip(){
    var r=curRoute();
    var idx=r.ships[st.voyageIdx];
    st.sel=idx;
    var f=SHIPS[idx];
    var seq=('0'+(st.voyageIdx+1)).slice(-2);
    var fp=(f.stats&&f.stats[1])||0;
    voyageImgEl.setAttribute('style',thumbStyle(f));
    voyageNameEl.textContent=f.name;
    voyageClassEl.textContent=CLASS_LABEL[f.cls]||'帆船';
    voyageYardEl.textContent=FAMILY_LABEL[f.family]+' · '+f.country+' · '+f.yard;
    voyageIntroEl.textContent=f.intro;
    voyageTraitsEl.innerHTML=f.traits.map(function(t){return '<span class="voyage-trait">'+t+'</span>';}).join('');
    voyageTaglineEl.innerHTML=f.tags.join('<i>·</i>');
    voyageDataEl.innerHTML='排水量 <em>'+tonsOf(f)+' 吨</em><i>|</i>火力 <em>'+fp+'/5</em>';
    voyageNoEl.textContent='图鉴 NO.'+seq+' · '+(CLASS_EN[f.cls]||'SHIP');
    voyageYearEl.textContent='AD '+f.year;
    voyageTonsEl.textContent='排水量 '+tonsOf(f)+' 吨';
    voyageCrumbEl.textContent=r.name+' · '+FAMILY_LABEL[f.family]+' · 第 '+(st.voyageIdx+1)+' / '+r.ships.length+' 艘';
    if(voyageBarFillEl)voyageBarFillEl.style.width=(((st.voyageIdx+1)/r.ships.length)*100).toFixed(1)+'%';
    vcPrevBtn.disabled=(st.voyageIdx===0);
    vcNextBtn.textContent=(st.voyageIdx+1>=r.ships.length)?'航海日志 ›':'下一艘 ›';
    capName.textContent=f.name;
    capCoord.textContent=fmtCoord(f.lat,f.lon);
    if(G){G.setTag(f.yard);G.refreshMarkers();G.aimShip(false);G.fitView(false);G.markDirty();}
    voyageBodyEl.scrollTop=0;
    lensRecenter();
    shipSharePaint();      /* 换船了，分享按钮跟着这艘船有没有原图显隐 */
  }
  function voyageNext(){
    var r=curRoute();
    if(st.voyageIdx+1>=r.ships.length){showLog();return;}
    st.voyageIdx++;
    showVoyageShip();
  }
  function voyagePrev(){
    if(st.voyageIdx<=0)return;
    st.voyageIdx--;
    showVoyageShip();
  }
  function quitVoyage(){
    hideToast();
    lensClose();
    st.page='routes';
    st.route=null;
    document.body.className='mode-routes';
    document.body.removeAttribute('data-route');
    if(G)G.setPlaying(false);
    renderRoutes();
  }
  vcPrevBtn.addEventListener('click',voyagePrev);
  vcNextBtn.addEventListener('click',voyageNext);
  vcQuitBtn.addEventListener('click',quitVoyage);
  /* ================= 望远镜：放大看船体细节 =================
   * 点「望远镜」把船图整层放大（默认 2.6 倍）并罩一圈黄铜镜筒 + 分划十字：
   * 拖动平移、滚轮微调倍率（1.8–3.6），Esc 或再点一次收起。
   * 只有船图那一层在缩放（--lens-* 自定义属性驱动 transform），
   * 纸色暗角 / 角标是同一方块里的兄弟层，原地不动 ——
   * 读起来就是「透过镜筒看船」，而不是整块画面被拉大。
   * 海图做旧效果（暗角/角标/图片滤镜）**默认常开**，不再提供开关。 */
  var LENS_DEF=2.6,LENS_MIN=1.8,LENS_MAX=3.6;
  var LENS={z:LENS_DEF,x:50,y:50};
  var lensBtn=document.getElementById('voyageLens');
  var voyageFrameEl=document.querySelector('.voyage-frame');
  var lensOn=false,lensDrag=null,lensLiveT=null;
  function lensPaint(){
    if(!voyageFrameEl)return;
    voyageFrameEl.style.setProperty('--lens-z',(lensOn?LENS.z:1).toFixed(2));
    voyageFrameEl.style.setProperty('--lens-x',LENS.x.toFixed(1)+'%');
    voyageFrameEl.style.setProperty('--lens-y',LENS.y.toFixed(1)+'%');
  }
  function lensSet(on){
    lensOn=!!on;
    if(lensOn){LENS.z=LENS_DEF;LENS.x=50;LENS.y=50;}
    document.body.classList[lensOn?'add':'remove']('lens-on');
    lensBtn.textContent=lensOn?'收起望远镜':'望远镜';
    lensBtn.setAttribute('aria-pressed',lensOn?'true':'false');
    lensPaint();
  }
  function lensClose(){if(lensOn)lensSet(false);}
  /* 换船时把镜筒拉回画面中心（倍率保留，接着看下一艘） */
  function lensRecenter(){if(!lensOn)return;LENS.x=50;LENS.y=50;lensPaint();}
  /* 滚轮调倍率期间临时关掉 transition，否则每一格都要走完一次 .34s 缓动 */
  function lensLive(){
    if(!voyageFrameEl)return;
    voyageFrameEl.classList.add('lens-live');
    if(lensLiveT)clearTimeout(lensLiveT);
    lensLiveT=setTimeout(function(){voyageFrameEl.classList.remove('lens-live');},170);
  }
  lensBtn.addEventListener('click',function(){lensSet(!lensOn);});
  if(voyageFrameEl){
    voyageFrameEl.addEventListener('pointerdown',function(e){
      if(!lensOn||e.target===lensBtn)return;
      lensDrag={id:e.pointerId,x:e.clientX,y:e.clientY,ox:LENS.x,oy:LENS.y};
      voyageFrameEl.classList.add('lens-drag');
      try{voyageFrameEl.setPointerCapture(e.pointerId);}catch(_){}
      if(e.preventDefault)e.preventDefault();
    });
    voyageFrameEl.addEventListener('pointermove',function(e){
      if(!lensDrag||e.pointerId!==lensDrag.id)return;
      var r=voyageFrameEl.getBoundingClientRect();
      if(r.width<10)return;
      /* 图放大 z 倍后，屏幕拖动 1px 对应原点位移 1/(宽*z)：向右拖＝原点左移 */
      var k=100/(r.width*LENS.z);
      LENS.x=Math.max(0,Math.min(100,lensDrag.ox-(e.clientX-lensDrag.x)*k));
      LENS.y=Math.max(0,Math.min(100,lensDrag.oy-(e.clientY-lensDrag.y)*k));
      lensPaint();
    });
    function lensDragEnd(e){
      if(!lensDrag||(e&&e.pointerId!==lensDrag.id))return;
      lensDrag=null;voyageFrameEl.classList.remove('lens-drag');
      try{voyageFrameEl.releasePointerCapture(e.pointerId);}catch(_){}
    }
    voyageFrameEl.addEventListener('pointerup',lensDragEnd);
    voyageFrameEl.addEventListener('pointercancel',lensDragEnd);
    voyageFrameEl.addEventListener('wheel',function(e){
      if(!lensOn)return;
      e.preventDefault();
      LENS.z=Math.max(LENS_MIN,Math.min(LENS_MAX,LENS.z*(1+(e.deltaY>0?-0.12:0.12))));
      lensLive();lensPaint();
    },{passive:false});
  }

  /* ================= 航海日志（总结页）================= */
  /* 六维性能图谱（内联 SVG，零依赖） */
  var RADAR={n:6,cx:136,cy:124,r:80,pad:18,ring:88};
  function radarXY(ratio,k){
    var a=-Math.PI/2+k*2*Math.PI/RADAR.n;
    return [RADAR.cx+RADAR.r*ratio*Math.cos(a),RADAR.cy+RADAR.r*ratio*Math.sin(a)];
  }
  function radarPoints(ratios){
    var t=[];
    for(var k=0;k<RADAR.n;k++){var q=radarXY(ratios[k],k);t.push(q[0].toFixed(1)+','+q[1].toFixed(1));}
    return t.join(' ');
  }
  /* 图谱画在一枚罗盘玫瑰上：外圈双环 + 32 道分度刻线 + 中心星芒，
     数据多边形与六轴照旧压在罗盘盘面上 */
  function roseStar(S,long,shrt){
    return '<g class="rose-star">'+
      '<path d="'+long+'"/><path d="'+long+'" transform="rotate(90 '+S.cx+' '+S.cy+')"/>'+
      '<path d="'+shrt+'" transform="rotate(45 '+S.cx+' '+S.cy+')"/>'+
      '<path d="'+shrt+'" transform="rotate(135 '+S.cx+' '+S.cy+')"/></g>';
  }
  function statsRadar(avg,peak){
    var rings=[.2,.4,.6,.8,1],face=[],i,a,s='';
    for(i=0;i<RADAR.n;i++)face.push(Math.max(0,Math.min(1,avg[i]/5)));
    s='<svg class="radar" viewBox="0 0 280 250" role="img" aria-label="六维性能图谱">';
    /* 罗盘外圈：双环 + 32 道分度刻线（每 90° 为主刻度） */
    s+='<circle class="rose-ring" cx="'+RADAR.cx+'" cy="'+RADAR.cy+'" r="'+RADAR.ring+'"/>'+
       '<circle class="rose-ring inner" cx="'+RADAR.cx+'" cy="'+RADAR.cy+'" r="'+(RADAR.ring-6)+'"/>';
    for(i=0;i<32;i++){
      a=-Math.PI/2+i*Math.PI*2/32;
      var major=(i%8===0),r0=RADAR.ring-1,r1=RADAR.ring-(major?10:5);
      s+='<line class="rose-tick'+(major?' major':'')+'" x1="'+(RADAR.cx+r0*Math.cos(a)).toFixed(1)+'" y1="'+(RADAR.cy+r0*Math.sin(a)).toFixed(1)+
         '" x2="'+(RADAR.cx+r1*Math.cos(a)).toFixed(1)+'" y2="'+(RADAR.cy+r1*Math.sin(a)).toFixed(1)+'"/>';
    }
    /* 中心罗盘玫瑰：四长四短的星芒 */
    var L=RADAR.r,Ls=RADAR.r*.72,W=6,Ws=4,sx=RADAR.cx,sy=RADAR.cy;
    s+=roseStar(RADAR,
      'M'+sx+' '+(sy-L)+' L'+(sx+W)+' '+sy+' L'+sx+' '+(sy+L)+' L'+(sx-W)+' '+sy+' Z',
      'M'+sx+' '+(sy-Ls)+' L'+(sx+Ws)+' '+sy+' L'+sx+' '+(sy+Ls)+' L'+(sx-Ws)+' '+sy+' Z');
    /* 盘面上的五圈多边形网格 */
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
    /* 盘心轴钉 */
    s+='<circle class="rose-core" cx="'+RADAR.cx+'" cy="'+RADAR.cy+'" r="2.6"/>';
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
  /* 航程简报：一句自然话，取代定评句与合计条形图 */
  function renderBrief(order){
    var n=order.length;
    if(!n){logBriefEl.innerHTML='';return;}
    var total=0,max=-1,min=Infinity,maxF=null,minF=null,i,f,k;
    for(i=0;i<n;i++){
      f=SHIPS[order[i]];k=tonsOf(f);total+=k;
      if(k>max){max=k;maxF=f;}
      if(k<min){min=k;minF=f;}
    }
    var s='本次航程共检阅 <b>'+n+'</b> 艘帆船。';
    if(n>1){
      s+='满载排水量合计约 <b>'+fmtL(total)+'</b> 吨，'+
        '其中'+maxF.name+'最大（<b>'+max+'</b> 吨，'+maxF.country+'·'+maxF.yard+'），'+
        minF.name+'最小（<b>'+min+'</b> 吨，'+minF.country+'·'+minF.yard+'）。';
    }else{
      s+='这艘'+maxF.name+'的满载排水量约 <b>'+max+'</b> 吨，建造于'+maxF.country+'·'+maxF.yard+'。';
    }
    logBriefEl.innerHTML=s;
  }
  function showLog(){
    var r=curRoute();
    var order=r.ships;
    lensClose();
    st.page='log';
    document.body.className='mode-log';
    document.body.removeAttribute('data-route');
    if(G)G.setPlaying(false);
    var n=order.length,i,k;
    var avg=[0,0,0,0,0,0];
    for(i=0;i<n;i++){
      var f=SHIPS[order[i]];
      for(k=0;k<6;k++)avg[k]+=(f.stats?f.stats[k]:0);
    }
    for(k=0;k<6;k++)avg[k]=avg[k]/Math.max(1,n);
    var peak=-1,pv=-1;
    for(k=0;k<6;k++){if(avg[k]>pv){pv=avg[k];peak=k;}}
    logBarsEl.innerHTML=statsRadar(avg,peak);
    renderBrief(order);
    var dh='';
    for(i=0;i<n;i++){
      var d=SHIPS[order[i]],t=d.stats||[0,0,0,0,0,0];
      var ord=[0,1,2,3,4,5].sort(function(a,b){return t[b]-t[a];}).slice(0,2);
      var tp=ord.map(function(j){return STATS_DIMS[j]+t[j];}).join(' · ');
      dh+='<div class="sum-ship">'+
        '<span class="sum-dot" style="background:'+(d.color||'#8a6b3a')+'"></span>'+
        '<span class="sum-dname">'+d.name+'</span>'+
        '<span class="sum-dmeta">'+d.country+' · '+d.yard+' · AD '+d.year+'</span>'+
        '<span class="sum-dtags">'+tp+'</span>'+
      '</div>';
    }
    logShipsEl.innerHTML=dh;
    logCountEl.textContent=n;
    var fams={},cns={};
    for(i=0;i<n;i++){var g=SHIPS[order[i]];fams[g.family]=1;cns[g.country]=1;}
    logFamEl.textContent=Object.keys(fams).length;
    logCountryEl.textContent=Object.keys(cns).length;
    logBodyEl.scrollTop=0;
    if(G)G.markDirty();
    if(DEMO){
      // 日志页内容也常超出一屏，演示时自动下滑到底再回顶，录屏能看到全部舰队名册
      demoAfter(600,function(){
        var max=Math.max(0,logBodyEl.scrollHeight-logBodyEl.clientHeight);
        if(max>0){
          demoSmoothScroll(logBodyEl, max, 2000, function(){
            demoAfter(1200,function(){demoSmoothScroll(logBodyEl, 0, 900);});
          });
        }
      });
      demoAfter(DEMO_LOG_MS,demoEnd);
    }
  }
  /* 回港口（各页统一的「回组建舰队」出口） */
  function backToRoutes(){
    hideToast();
    if(departTimer){clearTimeout(departTimer);departTimer=null;}
    st.page='routes';
    st.route=null;
    document.body.className='mode-routes';
    document.body.removeAttribute('data-route');
    if(G)G.setPlaying(false);
    renderRoutes();
  }
  lcBackBtn.addEventListener('click',backToRoutes);
  lcAgainBtn.addEventListener('click',function(){
    if(!st.route)return;
    enterDepart(st.route);
  });

  /* ================= 键盘 ================= */
  window.addEventListener('keydown',function(e){
    if(DEMO)return; /* 演示模式纯播放，不接受键盘 */
    if(e.key==='Escape'){
      if(lensOn&&st.page==='voyage')lensClose();   /* 先收望远镜，再谈退出这一页 */
      else if(st.page==='builder')exitBuilder();
      else if(st.page!=='routes')backToRoutes();
    }else if(st.page==='voyage'){
      if(e.key==='ArrowLeft')voyagePrev();
      else if(e.key==='ArrowRight')voyageNext();
    }
  });

  /* ================= 提示 ================= */
  var toastT=null;
  var TOAST_MS=3600;
  function toast(msg){
    if(DEMO)return; /* 演示模式纯净播放，不弹提示 */
    hintEl.textContent=msg;hintEl.classList.add('show');
    clearTimeout(toastT);toastT=setTimeout(function(){hintEl.classList.remove('show');},TOAST_MS);
  }
  function hideToast(){clearTimeout(toastT);hintEl.classList.remove('show');}

  /* ================= 背景音乐（音频藏在 assets/audio/bgm.js 的 base64 里）=================
   * 为什么不是 <audio src="./assets/audio/bgm.mp3">：容器上传白名单只有
   *   jpg / css / gif / svg / png / js / jpeg / json / html / woff2 / webp / woff
   * —— **不含任何音频扩展名**（mp3 会被上传页直接打回）；而容器 CSP 又明确
   * 「<audio> / <video> 只允许包内媒体文件，禁 data:/blob: 媒体源」。
   * 两条叠加＝「包内音频文件」这条官方路在容器里根本不存在。
   * 所以音频以 base64 字符串形式藏在 bgm.js（白名单类型，由 tools/make-bgm.mjs 生成）里，运行时：
   *   ① atob → ArrayBuffer → AudioContext.decodeAudioData() 解成 PCM；
   *   ② 用 Web Audio 播 —— 全程**不产生任何 URL**，因此不触碰 CSP 的资源加载规则；
   *   ③ 循环不是 loop 整段音频，而是 loop 曲子内部一个**小节对齐的完整乐句**
   *      （BGM_A / BGM_B / BGM_X），尾巴与下一遍开头交叠淡入淡出，见 bgmLoopTick；
   *   ④ 音量走 GainNode 包络，不做 setInterval 调 volume。
   *   ⑤ 偏好存 localStorage（键 aos3d.bgm）：没存过＝偏好开启，用户手动关掉才记成静音；
   *      但**按钮显示的是"此刻有没有在响"**，与偏好分开 —— 见 bgmPaint；
   *   ⑥ 切到后台（visibilitychange）停声并挂起音频上下文，回前台的续上。
   * 解码成功才给 <html> 挂 has-bgm 把开关显出来；没有数据 / 解码失败＝开关隐藏，五页照常。
   * 源曲目 assets/audio/bgm.mp3 是构建输入、**不打进 zip**（见 pack.mjs 的 excludes）。
   * 开 / 关两枚图标是 index.html 里的内联 SVG，由按钮的 .on 换显。 */
  var bgmBtn=document.getElementById('bgmBtn');
  var BGM_KEY='aos3d.bgm',BGM_VOL=0.42,BGM_TICK_MS=500;
  /* 循环体是**曲子内部一个完整乐句**，不是整段音频。由 tools/analyze-bgm.mjs 分析得出：
     184.6 BPM · 4/4 · 小节线每 1.300s（置信度 3.0）；19.54s 与 97.56s 都落在小节线上、
     相差整 60 小节，织体相似度 0.991，**波形互相关 0.554 且最佳时移仅 −1ms** ——
     也就是说这两处本来就是同一段音乐的重复，交叠时两遍同相，接缝几乎听不出来。
     作为对照：把整段首尾相接（曲头 0s 对裁剪点 101.15s）相似度只有 0.730、波形 0.069，
     那正是"接缝上撞出一个强拍"的来源。交叠取整 1 小节。 */
  var BGM_A=19.54,BGM_B=97.56,BGM_X=1.300;
  var AC=window.AudioContext||window.webkitAudioContext;
  var bgmCtx=null,bgmBuf=null,bgmMaster=null;
  var bgmPasses=[],bgmNextAt=0,bgmLoopT=null,bgmStopT=null;
  var bgmReady=false,bgmWant=true,bgmUnlocked=false,bgmPlaying=false,bgmHidePaused=false;
  try{if(window.localStorage.getItem(BGM_KEY)==='0')bgmWant=false;}catch(e){}
  /* 按钮画的是**此刻有没有在出声**（bgmPlaying），不是"用户想不想听"（bgmWant）：
     autoplay 策略决定首屏必然还没声音，这时若显示成"已开启"就是在骗人 ——
     亮起的铜牌只属于真正在响的那一刻。bgmWant 只负责记住偏好、
     并决定"用户第一次点按之后"要不要自动起播。 */
  function bgmPaint(){
    if(!bgmBtn)return;
    bgmBtn.className='bgm-btn'+(bgmPlaying?' on':'');
    bgmBtn.setAttribute('aria-pressed',bgmPlaying?'true':'false');
  }
  /* 一遍接一遍地排"带交叠的循环"：每遍播 [a, b] 这一段乐句，长 D 秒；
     上一遍在最后 X 秒线性淡出、下一遍从 0 秒线性淡入，两者在 [D-X, D] 完全重叠、
     增益和恒为 1。接缝落在乐句首尾——同一小节线、同一拍位，所以听不出断点。
     步长 L = D - X，下一遍晚 L 秒开始。
     （两段内容高度相似时线性叠加才是对的：增益和恒为 1 不会凸起；
       若换成等功率 sqrt 曲线，这种相似内容反而会在交叠中点 +3dB。） */
  function bgmLoopTick(){
    if(!bgmPlaying||!bgmCtx||!bgmBuf||!bgmMaster)return;
    var a=BGM_A,b=Math.min(BGM_B,bgmBuf.duration);
    if(b-a<8){a=0;b=bgmBuf.duration;}      /* 兜底：数据比乐句还短就退回整段循环 */
    var D=b-a;
    var X=Math.min(BGM_X,D*0.25);
    var L=D-X;
    var now=bgmCtx.currentTime;
    if(bgmNextAt<now+0.05)bgmNextAt=now+0.08;
    while(bgmNextAt<now+1.2){
      var at=bgmNextAt;
      var src=bgmCtx.createBufferSource();
      var g=bgmCtx.createGain();
      src.buffer=bgmBuf;
      src.connect(g);g.connect(bgmMaster);
      g.gain.setValueAtTime(0,at);
      g.gain.linearRampToValueAtTime(1,at+X);
      g.gain.setValueAtTime(1,at+L);
      g.gain.linearRampToValueAtTime(0,at+D);
      src.start(at,a);                     /* 从乐句开头起播，不是从 0s */
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
    if(bgmStopT){clearTimeout(bgmStopT);bgmStopT=null;}   /* 取消"渐出后停声"的待执行动作 */
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
    bgmPaint();                      /* 起播了才点亮铜牌 */
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
    bgmPaint();                      /* 停声了就把铜牌熄掉 */
  }
  /* 记的是"用户想不想要"，不只是"此刻响不响"：关掉＝写进存档，下次进来仍是静音 */
  function bgmSet(want){
    bgmWant=!!want;
    try{window.localStorage.setItem(BGM_KEY,bgmWant?'1':'0');}catch(e){}
    if(bgmWant)bgmPlay();else bgmPause(500);
    bgmPaint();
  }
  /* 首次用户手势之前不许出声：听最外层捕获阶段的 pointerdown / click / keydown。
     开关自己那一下不算解锁手势 —— 统一交给开关的 handler 处理，否则捕获阶段先把
     音乐打开、紧接着开关又按"正在响"把它关掉，自相矛盾。 */
  function bgmUnlock(e){
    if(bgmBtn&&e&&e.target&&(e.target===bgmBtn||bgmBtn.contains(e.target)))return;
    bgmUnlocked=true;
    if(bgmWant)bgmPlay();
    document.removeEventListener('pointerdown',bgmUnlock,true);
    document.removeEventListener('click',bgmUnlock,true);
    document.removeEventListener('keydown',bgmUnlock,true);
  }
  /* base64 → ArrayBuffer（1MB 量级，安排在首屏之后做，不挤首屏） */
  function bgmBytes(){
    var s=window.AOS3D_BGM||'';
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
      var pr=bgmCtx.decodeAudioData(ab,ok,bad);   /* 回调与 Promise 两套都兜，settled 防重复 */
      if(pr&&pr.then)pr.then(ok,bad);
    }catch(e){bad();}
  }
  if(bgmBtn){
    bgmBtn.addEventListener('click',function(){
      bgmUnlocked=true;              /* 点开关本身就是用户手势，必定算解锁 */
      bgmSet(!bgmPlaying);           /* 没在响 → 开；正在响 → 关（与按钮显示的状态一致） */
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
  /* 首屏之后才解码；解出来才把开关显出来（没数据 / 解不出＝开关保持隐藏） */
  setTimeout(bgmDecode,900);

  /* ================= 笔记分享（端能力 postNote，容器文档 §3.3）=================
   * 容器里网页不能直接发笔记，只能**唤起 App 的笔记发布页**并带上内容与媒体：
   *   window.xhs.miniTool.postNote({ title, content, pageType, mediaInfo })
   * 其中 mediaInfo 必填、且图片 / 视频 / 实况三种资源至少传一种 —— 所以这里先把这一趟
   * 航海日志画成一张卡片（Canvas 2D，1080×1440），再走文档给的组合路径：
   *   canvas.toDataURL('image/png')
   *     → writeTempFile({ data }) 换成本地 filePath     （§3.5：大 base64 先落文件再传）
   *     → postNote({ pageType:'photo_publish', mediaInfo:{ image_resources:[{url:filePath}] } })
   * 客户端没有 writeTempFile 时，把完整 data:uri 直接交给 postNote（§3.3 允许 base64）。
   *
   * 卡片**只用 Canvas 图元与文字绘制，不 drawImage 任何图片**：在 file:// 来源下画本地图片
   * 会把画布标记为"被污染"，toDataURL 会直接抛 SecurityError —— 图鉴里的 webp 一律不参与绘制。
   *
   * 能力检测而非 UA 判断：拿不到 postNote 就整块隐藏（桌面直接开 index.html、以及 ?demo
   * 录屏都不会出现这个按钮），五页流程照常。
   *
   * 结果语义（文档明说）：postNote 成功**只代表发布页被唤起并由用户点了发布，不代表过审** ——
   * 所以这里只当"已唤起"提示，不据此做任何强一致的状态变更。 */
  var XHS=(window.xhs&&window.xhs.miniTool)||null;
  var CAN_SHARE=!!(XHS&&typeof XHS.postNote==='function');
  var lcShareBtn=document.getElementById('lcShare');
  var shareBusy=false;
  var CARD_W=1080,CARD_H=1440;
  var CARD_FONT='Georgia,"Songti SC","Noto Serif SC","STSong","SimSun",serif';

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
      if(line&&x.measureText(line+ch).width>maxW){out.push(line);line=ch;}
      else line+=ch;
    }
    if(line)out.push(line);
    return out;
  }
  /* 一枚菱形航点（海图上的标记；日志页名册的「色点」也是它） */
  function diamondPath(x,cx,cy,s){
    x.beginPath();
    x.moveTo(cx,cy-s);x.lineTo(cx+s,cy);x.lineTo(cx,cy+s);x.lineTo(cx-s,cy);
    x.closePath();
  }
  /* 一截麻绳（日志页 .sec 标题右侧那根斜向绳股）：分段标题的分隔线 */
  function ropeDivider(x,x0,x1,y){
    x.save();
    x.strokeStyle='rgba(176,137,74,.55)';x.lineWidth=6;
    for(var px=x0;px<x1;px+=11){
      x.beginPath();x.moveTo(px,y+2.5);x.lineTo(px+6,y-2.5);x.stroke();
    }
    x.restore();
  }
  /* 居中排一段多色文字（日志页「本次检阅 N 艘帆船」那行，数字是酒红加粗的） */
  function centerSegs(x,segs,y,px){
    var total=0,i;
    for(i=0;i<segs.length;i++){
      x.font=(segs[i][1]?'800 ':'')+px+'px '+CARD_FONT;
      total+=x.measureText(segs[i][0]).width;
    }
    var sx=CARD_W/2-total/2;
    x.textAlign='left';
    for(i=0;i<segs.length;i++){
      x.font=(segs[i][1]?'800 ':'')+px+'px '+CARD_FONT;
      x.fillStyle=segs[i][1]?'#e05a45':'#d8b06a';
      x.fillText(segs[i][0],sx,y);
      sx+=x.measureText(segs[i][0]).width;
    }
    x.textAlign='center';
  }
  /* 六维罗盘雷达：跟航海日志页那副图谱同一副样子（黄铜罗盘外圈 + 酒红数据面） */
  function radarChart(x,cx,cy,r,avg,peak){
    var n=6,i,k,a;
    function px(ratio,idx){
      var an=-Math.PI/2+idx*Math.PI*2/n;
      return [cx+r*ratio*Math.cos(an),cy+r*ratio*Math.sin(an)];
    }
    /* 罗盘外圈：双环 + 32 道分度（每 90° 为主刻度） */
    x.strokeStyle='rgba(176,137,74,.9)';x.lineWidth=2;
    x.beginPath();x.arc(cx,cy,r*1.2,0,Math.PI*2);x.stroke();
    x.strokeStyle='rgba(176,137,74,.45)';x.lineWidth=1.5;
    x.beginPath();x.arc(cx,cy,r*1.12,0,Math.PI*2);x.stroke();
    for(i=0;i<32;i++){
      a=-Math.PI/2+i*Math.PI*2/32;
      var major=(i%8===0),r0=r*1.2,r1=r0-(major?r*0.13:r*0.065);
      x.beginPath();
      x.moveTo(cx+r0*Math.cos(a),cy+r0*Math.sin(a));
      x.lineTo(cx+r1*Math.cos(a),cy+r1*Math.sin(a));
      x.stroke();
    }
    /* 盘心星芒 */
    x.fillStyle='rgba(176,137,74,.16)';
    for(i=0;i<4;i++){
      x.save();x.translate(cx,cy);x.rotate(i*Math.PI/2-Math.PI/2);
      x.beginPath();
      x.moveTo(0,-r);x.lineTo(r*0.06,0);x.lineTo(0,r);x.lineTo(-r*0.06,0);
      x.closePath();x.fill();
      x.restore();
    }
    /* 盘面上的五圈多边形网格 + 六条轴 */
    var rings=[.2,.4,.6,.8,1];
    for(i=0;i<rings.length;i++){
      x.beginPath();
      for(k=0;k<n;k++){var q=px(rings[i],k);if(k===0)x.moveTo(q[0],q[1]);else x.lineTo(q[0],q[1]);}
      x.closePath();
      x.strokeStyle=(i===rings.length-1)?'rgba(176,137,74,.8)':'rgba(176,137,74,.3)';
      x.lineWidth=(i===rings.length-1)?1.6:1;
      x.stroke();
    }
    x.strokeStyle='rgba(176,137,74,.32)';x.lineWidth=1;
    for(k=0;k<n;k++){var e=px(1,k);x.beginPath();x.moveTo(cx,cy);x.lineTo(e[0],e[1]);x.stroke();}
    /* 数据面：酒红填充 + 描边 + 六个顶点 + 盘心轴钉（.radar 的 face / dot / rose-core） */
    x.beginPath();
    for(k=0;k<n;k++){
      var d=px(Math.max(.04,Math.min(1,avg[k]/5)),k);
      if(k===0)x.moveTo(d[0],d[1]);else x.lineTo(d[0],d[1]);
    }
    x.closePath();
    x.fillStyle='rgba(154,47,36,.20)';x.fill();
    x.strokeStyle='#9a2f24';x.lineWidth=3;x.stroke();
    for(k=0;k<n;k++){
      var dp=px(Math.max(.04,Math.min(1,avg[k]/5)),k);
      x.fillStyle='#9a2f24';x.beginPath();x.arc(dp[0],dp[1],5.5,0,Math.PI*2);x.fill();
    }
    x.fillStyle='rgba(176,137,74,.75)';
    x.beginPath();x.arc(cx,cy,5,0,Math.PI*2);x.fill();
    /* 标签：维度名（峰值那一维标酒红）+ 值（小一号、更暗），与日志页同一口径 */
    var fs=Math.round(r*0.2);
    for(k=0;k<n;k++){
      a=-Math.PI/2+k*Math.PI*2/n;
      var lx=cx+(r*1.2+46)*Math.cos(a),ly=cy+(r*1.2+46)*Math.sin(a)+fs*0.36;
      var name=STATS_DIMS[k],val=avg[k].toFixed(1);
      x.font='700 '+fs+'px '+CARD_FONT;
      var wN=x.measureText(name).width,wV=x.measureText(val).width;
      var sx=lx-(wN+8+wV)/2;
      x.textAlign='left';
      x.fillStyle=(k===peak)?'#e05a45':'#a89e88';
      x.fillText(name,sx,ly);
      x.fillStyle='#7d7666';
      x.fillText(val,sx+wN+8,ly);
    }
    x.textAlign='left';
  }
  /* 把这一趟航海日志画成一张卡片 —— 版式与配色照航海日志页复刻：
     深海底径向渐变 + 上下两条橡木仪表台 + 酒红分段标题带麻绳分隔 + 罗盘雷达 + 名册行。 */
  function drawLogCard(){
    var r=st.route||ROUTES[0];
    var order=r.ships,n=order.length,i,k;
    var cv=document.createElement('canvas');
    cv.width=CARD_W;cv.height=CARD_H;
    var x=cv.getContext('2d');

    /* ── 页面底：与 .page-log 同一道深海径向渐变 ── */
    var bg=x.createRadialGradient(CARD_W/2,CARD_H*0.08,0,CARD_W/2,CARD_H*0.08,CARD_H*0.98);
    bg.addColorStop(0,'#15395c');bg.addColorStop(.42,'#0a1e33');bg.addColorStop(.8,'#061220');bg.addColorStop(1,'#03080e');
    x.fillStyle=bg;x.fillRect(0,0,CARD_W,CARD_H);

    /* ── 上下两条橡木仪表台（.log-bar / .log-controls）── */
    var gTop=x.createLinearGradient(0,0,0,96);
    gTop.addColorStop(0,'rgba(36,20,9,.97)');gTop.addColorStop(1,'rgba(36,20,9,.4)');
    x.fillStyle=gTop;x.fillRect(0,0,CARD_W,96);
    x.strokeStyle='rgba(176,137,74,.32)';x.lineWidth=2;
    x.beginPath();x.moveTo(0,96);x.lineTo(CARD_W,96);x.stroke();
    x.textAlign='center';x.fillStyle='#d8b06a';x.font='700 30px '+CARD_FONT;
    x.fillText('航海日志',CARD_W/2,62);
    var gBot=x.createLinearGradient(0,1332,0,1440);
    gBot.addColorStop(0,'rgba(36,20,9,.4)');gBot.addColorStop(1,'rgba(36,20,9,.97)');
    x.fillStyle=gBot;x.fillRect(0,1332,CARD_W,108);
    x.strokeStyle='rgba(176,137,74,.32)';x.lineWidth=2;
    x.beginPath();x.moveTo(0,1332);x.lineTo(CARD_W,1332);x.stroke();
    x.fillStyle='#d8b06a';x.font='26px '+CARD_FONT;
    x.fillText('大航海时代 · 帆船图鉴',CARD_W/2,1396);

    /* ── 标题 / 统计 / 简报（.log-ttl / .log-sub / .log-brief）── */
    x.fillStyle='#f2e8d2';x.font='800 52px '+CARD_FONT;
    x.fillText('航程完毕',CARD_W/2,168);
    var fams={},cns={};
    for(i=0;i<n;i++){var f=SHIPS[order[i]];fams[f.family]=1;cns[f.country]=1;}
    centerSegs(x,[['本次检阅 ',0],[String(n),1],[' 艘帆船 · 覆盖 ',0],
      [String(Object.keys(fams).length),1],[' 个海域 ',0],
      [String(Object.keys(cns).length),1],[' 个建造国',0]],214,30);
    var brief=(logBriefEl&&logBriefEl.textContent)||'';
    if(brief){
      x.fillStyle='#a89e88';x.font='29px '+CARD_FONT;
      var lines=wrapLines(x,brief,840);
      for(i=0;i<lines.length&&i<3;i++)x.fillText(lines[i],CARD_W/2,264+i*44);
    }

    /* ── 分段标题：酒红小标题 + 麻绳分隔 + 右侧小注（.sec / .sec::after / .secnote）── */
    function secTitle(title,note,y){
      x.textAlign='left';x.fillStyle='#e05a45';x.font='800 34px '+CARD_FONT;
      x.fillText(title,60,y);
      var w=x.measureText(title).width;
      x.textAlign='right';x.font='26px '+CARD_FONT;x.fillStyle='#7d7666';
      var wn=x.measureText(note).width;
      x.fillText(note,CARD_W-60,y);
      x.textAlign='left';
      ropeDivider(x,60+w+26,CARD_W-60-wn-26,y-11);
    }

    /* ── 性能图谱：画在罗盘玫瑰上的六维图谱（与日志页同一副）── */
    var avg=[0,0,0,0,0,0],peak=0,pv=-1;
    for(i=0;i<n;i++){var g=SHIPS[order[i]];for(k=0;k<6;k++)avg[k]+=(g.stats?g.stats[k]:0);}
    for(k=0;k<6;k++){avg[k]=avg[k]/Math.max(1,n);if(avg[k]>pv){pv=avg[k];peak=k;}}
    secTitle('性能图谱','六维 · 本次均值 · 满分 5',440);
    radarChart(x,CARD_W/2,676,122,avg,peak);

    /* ── 舰队名册 ── */
    secTitle('舰队名册','各艘最突出的两维',942);
    x.textAlign='center';

    /* ── 名册行：色点 + 船名 + 建造国·建造地·年代 + 该艘最突出的两维（.sum-ship）── */
    for(i=0;i<n&&i<8;i++){
      var s2=SHIPS[order[i]],yy=972+i*44,cy=yy+22;
      x.fillStyle=s2.color||'#8a6b3a';
      diamondPath(x,78,cy,11);x.fill();
      x.textAlign='left';x.fillStyle='#f2e8d2';x.font='800 34px '+CARD_FONT;
      x.fillText(fitLine(x,s2.name,320),110,cy+12);
      x.fillStyle='#7d7666';x.font='25px '+CARD_FONT;
      x.fillText(fitLine(x,s2.country+' · '+s2.yard+' · AD '+s2.year,340),440,cy+10);
      var t=s2.stats||[0,0,0,0,0,0];
      var ord2=[0,1,2,3,4,5].sort(function(a,b){return t[b]-t[a];}).slice(0,2);
      var tp=ord2.map(function(j){return STATS_DIMS[j]+t[j];}).join(' · ');
      x.textAlign='right';x.fillStyle='#e05a45';x.font='24px '+CARD_FONT;
      x.fillText(tp,CARD_W-60,cy+10);
      x.textAlign='left';
      x.strokeStyle='rgba(176,137,74,.30)';x.lineWidth=1;
      x.setLineDash([3,6]);
      x.beginPath();x.moveTo(60,yy+42);x.lineTo(CARD_W-60,yy+42);x.stroke();
      x.setLineDash([]);
    }
    x.textAlign='center';
    return cv;
  }

  function shareLog(){
    if(!CAN_SHARE||shareBusy)return;
    var r=st.route;
    if(!r||!r.ships.length){toast('先出海检阅一支舰队，再来分享');return;}
    shareBusy=true;
    if(lcShareBtn)lcShareBtn.disabled=true;
    var dataURL;
    try{
      /* 用 JPEG 而不是 PNG：这张卡片铺满渐变与淡网格，PNG 压不动（实测 1080×1440 要约 1.8MB 二进制、
       * base64 后 2.4MB），而 JPEG q=0.92 只有它的几分之一，文字在这个尺寸下依然清晰。
       * writeTempFile 的白名单里 jpeg 是支持的。 */
      dataURL=drawLogCard().toDataURL('image/jpeg',0.92);
    }catch(e){
      shareBusy=false;if(lcShareBtn)lcShareBtn.disabled=false;
      toast('分享图生成失败，换一台设备再试');
      return;
    }
    var order=r.ships,n=order.length,i,total=0,fams={},cns={};
    for(i=0;i<n;i++){var f=SHIPS[order[i]];fams[f.family]=1;cns[f.country]=1;total+=tonsOf(f);}
    var brief=(logBriefEl&&logBriefEl.textContent)||'';
    var payload={
      title:('大航海时代 · '+r.name).slice(0,20),
      content:(brief?brief+'\n\n':'')+
        '由「大航海时代 · 帆船图鉴」生成：'+n+' 艘帆船 · '+Object.keys(fams).length+' 个海域 · '+
        Object.keys(cns).length+' 个建造国 · 满载排水量合计约 '+fmtL(total)+' 吨。',
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
      if(lcShareBtn)lcShareBtn.disabled=false;
    });
  }
  if(CAN_SHARE){
    document.documentElement.className+=' has-share';
    if(lcShareBtn)lcShareBtn.addEventListener('click',shareLog);
  }

  /* ================= 详情页分享：直接分享船的原图 =================
   * 与航海日志页那张「照日志页复刻」的卡片不同，这里**把船图原文件直接交出去**：
   *   XHR 取 ./assets/ships/<slug>.webp → FileReader 读成 data:image/webp;base64,…
   *   → writeTempFile 换成本地 filePath → postNote
   * 刻意不走 canvas.drawImage + toDataURL：① file:// 来源下画本地图片会把画布标记成
   * "被污染"，toDataURL 直接抛 SecurityError；② 即便导得出来，重绘也等于重编码一遍，
   * 分享出去的就不是原图了。XHR + FileReader 拿到的是**逐字节的原图**，格式仍是 webp。
   * 笔记正文＝该船的科普介绍（intro）+ 一段紧凑资料；标题＝船名 · 建造国。
   * 没有原图就不给按钮（与「缺图回退色卡」同一口径），不做占位分享。 */
  var shipShareBtn=document.getElementById('shipShareBtn');
  var shipShareBusy=false;

  /* 原图是否可用：与航海页大图共用同一份预检结果 IMG_OK，不另开一次探测 */
  function shipSharePaint(){
    if(!shipShareBtn)return;
    var r=st.route,ok=false;
    if(CAN_SHARE&&r&&st.page==='voyage'){
      var f=SHIPS[r.ships[st.voyageIdx]];
      ok=!!(f&&f.img&&IMG_OK[f.name]===true);
    }
    shipShareBtn.className='ship-share-btn'+(ok?'':' off');
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
  /* 笔记正文：科普介绍（intro）+ 一段紧凑资料 */
  function shipNote(f){
    var s=f.stats||[0,0,0,0,0,0],dims=[],i;
    for(i=0;i<STATS_DIMS.length;i++)dims.push(STATS_DIMS[i]+s[i]);
    return f.intro+'\n\n'+
      f.country+' · '+f.yard+' · AD '+f.year+
      '\n排水量约 '+tonsOf(f)+' 吨 · '+(CLASS_LABEL[f.cls]||'帆船')+
      '\n六维：'+dims.join(' · ')+
      '\n特征：'+(f.traits||[]).join(' · ')+'\n\n'+
      '—— 大航海时代 · 帆船图鉴（小红书小工具）';
  }
  function shareShip(){
    if(!CAN_SHARE||shipShareBusy||st.page!=='voyage')return;
    var r=st.route;
    if(!r)return;
    var f=SHIPS[r.ships[st.voyageIdx]];
    if(!f||!f.img||IMG_OK[f.name]!==true){toast('这艘船的原图还没出');return;}
    shipShareBusy=true;
    if(shipShareBtn)shipShareBtn.disabled=true;
    imgDataURI(f.img).then(function(dataURL){
      var payload={
        title:(f.name+' · '+f.country).slice(0,20),
        content:shipNote(f).slice(0,1000),
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
      toast(err&&err.stage==='img'?'读取船图失败，稍后再试'
        :'唤起发布页失败：'+((err&&err.errMsg)||'未知原因'));
    }).then(function(){
      shipShareBusy=false;
      if(shipShareBtn)shipShareBtn.disabled=false;
    });
  }
  if(shipShareBtn)shipShareBtn.addEventListener('click',shareShip);

  /* ================= 启动 ================= */
  if(DEMO)document.documentElement.className+=' is-demo';  /* 录屏时不留音乐开关 */
  st.custom=loadCustom();
  renderRoutes();
  if(G){G.refreshMarkers();}
  document.body.className='mode-routes';
  toast('组建一支舰队 · 沿岸驶过一整个时代');
  setTimeout(function(){if(G)G.markDirty();document.getElementById('loader').classList.add('hide');},520);
  if(G)G.start();
  if(DEMO)demoAfter(DEMO_WARM_MS,startDemo);

  /* 徽标图到位才显示徽标块（挂在 <html> 上，不会被页面切换的 body.className 覆盖）；
     没图就整块隐藏，不留任何 CSS 画的替代图形 */
  (function(){
    try{
      var im=new Image();
      im.onload=function(){document.documentElement.className+=' has-logo';};
      im.src='./assets/tex/logo.webp';
    }catch(e){}
  })();

  /* 首屏港口图到位才撤掉海图兜底层（经纬网 + 罗盘玫瑰水印），免得那层压在做好的出图上。
     轮播第一张（北海）没出图时，退到所有轮播层共用的第二层竖版港图再判一次。 */
  (function(){
    try{
      var hit=function(){document.documentElement.className+=' has-hero-img';};
      var im2=new Image();
      im2.onload=hit;
      im2.onerror=function(){
        try{var im3=new Image();im3.onload=hit;im3.src='./assets/tex/port-docked-portrait.webp';}catch(e){}
      };
      im2.src='./assets/tex/hero-northsea.webp';
    }catch(e){}
  })();

  /* 出港页两张竖版港图都到位，才撤掉 crisp 层的 harbor 兜底层。
     原因：竖版主图用 contain（不裁船首尾），在"竖屏但宽高比 > 1:2"的视口里
     按高度撑满后会左右留空档；而 16:9 的 harbor 是满宽的，不撤掉就会从空档里
     露出一张横图，观感像两张图拼在一起。缺任一张则保留兜底，画面不空。 */
  (function(){
    try{
      var n=0, ok=function(){if(++n===2)document.documentElement.className+=' has-depart-portrait';};
      var im4=new Image(); im4.onload=ok; im4.src='./assets/tex/port-docked-portrait.webp';
      var im5=new Image(); im5.onload=ok; im5.src='./assets/tex/port-sail-portrait.webp';
    }catch(e){}
  })();

  /* 首屏若图未就绪，等预检结束后统一重绘 */
  setTimeout(function(){
    for(var i=0;i<SHIPS.length;i++)if(SHIPS[i].img&&IMG_OK[SHIPS[i].name]===null){IMG_OK[SHIPS[i].name]=false;}
    if(st.page==='voyage')repaintVoyageImg(st.sel);
  },2600);
})();
