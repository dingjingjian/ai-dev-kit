(function(){
  'use strict';

  var DINOS=window.DINOS||[];

  /* ===== DOM 引用 ===== */
  var slot=document.getElementById('globeSlot');
  var canvas=document.getElementById('stage');
  var tagsLayer=document.getElementById('globeTags');
  var capName=document.getElementById('capName');
  var capCoord=document.getElementById('capCoord');

  var routeListEl=document.getElementById('routeList');
  var gateTitleEl=document.getElementById('gateTitle');
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
  var tourCamEl=document.getElementById('tourCam');
  var tourTcEl=document.getElementById('tourTc');
  var tcPrevBtn=document.getElementById('tcPrev');
  var tcNextBtn=document.getElementById('tcNext');
  var tcQuitBtn=document.getElementById('tcQuit');
  var summaryBodyEl=document.getElementById('summaryBody');
  var sumCountEl=document.getElementById('sumCount');
  var sumContEl=document.getElementById('sumCont');
  var sumCountryEl=document.getElementById('sumCountry');
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

  /* ================= 路线数据 =================
   * 每条路线精选若干恐龙，按游览车行进顺序排列（顺序即「围栏停靠序号」）。
   * 配色与 index.html 的 body[data-route] 一致，同时作为路线卡片的内联主题。 */
  var ROUTES=[
    {key:'predator',name:'掠食者之旅',badge:'高危',intensity:5,
     desc:'跨越三亿年，追踪史上最可怕的猎食者——从三叠纪的埃雷拉龙到白垩纪的霸王龙与南方巨兽龙。',
     dinos:[3,7,11,15,17,24,25,26],
     dark:'#2a0e06',mid:'#5c1f0e',light:'#9a3c1e',accent:'#e0453a',accent2:'#f06449'},
    {key:'giants',name:'巨兽之旅',badge:'震撼',intensity:3,
     desc:'与史上最庞大的生命同行——蜥脚巨龙与重甲角龙，感受大地的震颤。',
     dinos:[5,6,9,10,20,21,23,25],
     dark:'#08150f',mid:'#1a3626',light:'#3d6b45',accent:'#6b9a4a',accent2:'#8ab860'},
    {key:'time',name:'时空之旅',badge:'通史',intensity:2,
     desc:'从二叠纪到新生代，十五只恐龙串起恐龙的完整兴衰史——一部会行走的地球编年史。',
     dinos:[0,1,2,3,5,7,8,9,10,15,16,17,20,28,29],
     dark:'#0a1520',mid:'#1d3450',light:'#3a5a80',accent:'#4a9ab0',accent2:'#6ab8d0'},
    {key:'bizarre',name:'奇异物种之旅',badge:'怪诞',intensity:4,
     desc:'帆背、厚颅、四翼、镰爪——大自然最不羁的想象力，都在这条路上。',
     dinos:[0,8,20,22,19,18,27,23,13,14],
     dark:'#180a20',mid:'#2e1438',light:'#5a2e6a',accent:'#c080d0',accent2:'#d8a0e0'}
  ];

  /* 自选路线：玩家在自选页拼出来的路线，同样进游览/总结全流程 */
  var CUSTOM_ROUTE={key:'custom',name:'自选路线',badge:'自定义',intensity:3,custom:true,
    desc:'自己排的一条路：点名录加入恐龙，按加入顺序停靠围栏。',
    dinos:[],
    dark:'#171205',mid:'#3a2c0a',light:'#8a6a1a',accent:'#c99a1e',accent2:'#e0b429'};

  /* ================= 常量 ================= */
  var ERA_LABEL={paleozoic:'古生代',triassic:'三叠纪',jurassic:'侏罗纪',cretaceous:'白垩纪',cenozoic:'新生代'};
  var STATS_DIMS=['体型','威胁','速度','智力','防御','稀有'];
  var STORE_KEY='jp3d.customRoute';

  /* ================= 状态 ================= */
  var st={page:'routes',route:null,routeIdx:-1,tourIdx:0,sel:0,custom:[]};

  /* ================= 自选路线存档（localStorage，失败即静默降级）================= */
  function loadCustom(){
    try{
      var raw=window.localStorage.getItem(STORE_KEY);
      if(!raw)return [];
      var arr=JSON.parse(raw);
      if(!arr||typeof arr.length!=='number')return [];
      var out=[];
      for(var i=0;i<arr.length;i++){
        var v=parseInt(arr[i],10);
        if(!isNaN(v)&&v>=0&&v<DINOS.length&&out.indexOf(v)<0)out.push(v);
      }
      return out;
    }catch(e){return [];}
  }
  function saveCustom(){
    try{window.localStorage.setItem(STORE_KEY,JSON.stringify(st.custom));}catch(e){}
  }

  /* 当前路线对象：预设 4 条，或玩家自选那条 */
  function curRoute(){return st.route||ROUTES[0];}

  /* ================= 工具函数 ================= */
  function lengthOf(f){return (f&&typeof f.length==='number')?f.length:0;}
  function fmtL(v){return String(v).replace(/\B(?=(\d{3})+(?!\d))/g,',');}
  function fmtCoord(lat,lon){
    return Math.abs(lat).toFixed(1)+'°'+(lat>=0?'N':'S')+' '+Math.abs(lon).toFixed(1)+'°'+(lon>=0?'E':'W');
  }

  /* ================= 颜色与恐龙图（图可缺，回退色卡）================= */
  function hex2rgb(h){h=String(h).replace('#','');return [parseInt(h.substr(0,2),16),parseInt(h.substr(2,2),16),parseInt(h.substr(4,2),16)];}
  function rgb2hex(r){function f(v){v=Math.max(0,Math.min(255,Math.round(v)));return ('0'+v.toString(16)).slice(-2);}return '#'+f(r[0])+f(r[1])+f(r[2]);}
  function lighten(h,a){var r=hex2rgb(h);return rgb2hex([r[0]+(255-r[0])*a,r[1]+(255-r[1])*a,r[2]+(255-r[2])*a]);}
  function darken(h,a){var r=hex2rgb(h);return rgb2hex([r[0]*(1-a),r[1]*(1-a),r[2]*(1-a)]);}
  function plateGrad(c){return 'radial-gradient(circle at 32% 26%,'+lighten(c,.3)+','+c+' 56%,'+darken(c,.36)+' 100%)';}
  var IMG_OK={};
  DINOS.forEach(function(f,i){
    if(!f.img){IMG_OK[f.name]=false;return;}
    IMG_OK[f.name]=null;
    var im=new Image();
    im.onload=function(){IMG_OK[f.name]=true;repaintTourImg(i);};
    im.onerror=function(){IMG_OK[f.name]=false;};
    im.src=f.img;
  });
  function thumbStyle(f){
    if(f.img&&IMG_OK[f.name]===true)
      return "background-image:url('"+f.img+"');background-size:cover;background-position:center";
    return 'background:'+plateGrad(f.color||'#a52a1f');
  }
  function repaintTourImg(i){
    if(st.page==='tour'&&i===st.sel){
      tourImgEl.setAttribute('style',thumbStyle(DINOS[i]));
    }
  }

  /* ================= 3D 地球组件（可降级）=================
   * 三层能力检测，任一不过就降级——地球在这里只是「标化石发现地」的组件，
   * 它跑不起来不该连累整页（路线选择 / 大门 / 游览 / 总结全部照常）：
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
    var bg=x.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#0a1208');bg.addColorStop(.5,'#161f0e');bg.addColorStop(1,'#0a1208');
    x.fillStyle=bg;x.fillRect(0,0,w,h);
    x.save();x.translate(w/2,h/2);x.rotate(-0.4);x.translate(-w/2,-h/2);
    for(var i=0;i<22;i++){var px=Math.random()*w,py=h/2+(Math.random()-0.5)*h*0.3,r=90+Math.random()*220;
      var gg=x.createRadialGradient(px,py,0,px,py,r),hue=Math.random(),c1=hue<.45?'rgba(180,200,140,':(hue<.75?'rgba(160,180,120,':'rgba(176,150,96,');
      gg.addColorStop(0,c1+(0.05+Math.random()*.06)+')');gg.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=gg;x.fillRect(0,0,w,h);}
    x.restore();
    for(var i2=0;i2<4200;i2++){var qx=Math.random()*w,qy=Math.random()*h,b=.15+Math.random()*.5;
      x.fillStyle='rgba(255,236,200,'+b+')';x.fillRect(qx,qy,1,1);}
    for(var i3=0;i3<220;i3++){var rx=Math.random()*w,ry=Math.random()*h,b2=.82+Math.random()*.18;
      x.fillStyle='rgba(255,244,214,'+b2+')';x.fillRect(rx,ry,1,1);}
    var t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return t;
  }
  var sky=new THREE.Mesh(new THREE.SphereGeometry(2600,48,32),
    new THREE.MeshBasicMaterial({map:starfieldTex(),side:THREE.BackSide,depthWrite:false}));
  scene.add(sky);

  var ambient=new THREE.AmbientLight(0x4a5a3a,1.0);scene.add(ambient);
  var lampLight=new THREE.PointLight(0xffd8a8,2.2,0,1.3);lampLight.position.set(18,7,14);scene.add(lampLight);
  var fillLight=new THREE.PointLight(0x6a7a4a,0.8,0,1.3);fillLight.position.set(-16,-6,-12);scene.add(fillLight);
  var candleLight=new THREE.PointLight(0xff9a52,0.7,300,1.6);candleLight.position.set(-26,-30,18);scene.add(candleLight);

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
  var earthMat=new THREE.MeshStandardMaterial({map:plainTex('#2a5a3a'),color:0xc4b894,roughness:.82,metalness:.06});
  var earthMesh=new THREE.Mesh(new THREE.SphereGeometry(R,64,44),earthMat);earthGroup.add(earthMesh);
  var cloudMat=new THREE.MeshStandardMaterial({map:plainTex('#ffffff'),transparent:true,alphaMap:plainTex('#ffffff'),opacity:.34,roughness:1,depthWrite:false});
  var clouds=new THREE.Mesh(new THREE.SphereGeometry(R*1.012,48,32),cloudMat);earthTilt.add(clouds);
  var atmo=new THREE.Mesh(new THREE.SphereGeometry(R*1.06,48,32),
    new THREE.MeshBasicMaterial({color:0x88a050,side:THREE.BackSide,transparent:true,opacity:.18,blending:THREE.AdditiveBlending,depthWrite:false}));
  earthTilt.add(atmo);

  /* ===== 标记点：全部建好，按路线成员与选中状态决定显隐 ===== */
  var markerGroup=new THREE.Group();earthGroup.add(markerGroup);
  var glowTex=radialTex('rgba(255,220,180,.95)','rgba(255,140,60,.45)','rgba(255,100,30,0)');
  var ringTex=radialTex('rgba(255,200,140,.7)','rgba(255,140,60,.25)','rgba(255,100,30,0)');
  var markers=[];
  (function buildMarkers(){
    for(var i=0;i<DINOS.length;i++){
      var f=DINOS[i];
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
      markers.push({food:f,grp:grp,dot:dot,glow:glow,ring:ring,dim:false,visible:false});
    }
  })();

  var stars=(function(){
    var n=2600,geo=new THREE.BufferGeometry(),pos=new Float32Array(n*3),col=new Float32Array(n*3);
    for(var i=0;i<n;i++){var u=Math.random()*2-1,v=Math.random()*6.2832,s=Math.sqrt(1-u*u),rr=900+Math.random()*560;
      pos[i*3]=rr*s*Math.cos(v);pos[i*3+1]=rr*u;pos[i*3+2]=rr*s*Math.sin(v);
      var b=.25+Math.random()*.75,t=Math.random();
      if(t<.2){col[i*3]=b;col[i*3+1]=b*.85;col[i*3+2]=b*.7;}
      else{col[i*3]=b;col[i*3+1]=b*.96;col[i*3+2]=b*.9;}}
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

  /* ================= 相机：始终对准当前这只恐龙的化石发现地 ================= */
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
  function aimDino(instant){
    var f=DINOS[st.sel];if(!f)return;
    var local=ll2v(f.lat,f.lon,1);
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
  function tdist(t){return Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);}
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

  /* ================= 化石发现地标签：只标当前这只 ================= */
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
   * 游览页：路线上全部恐龙的化石发现地标出，当前这只高亮脉动，同路线其余压暗作上下文。
   * 其余页面：标记点全隐（地球也不渲染）。 */
  function refreshMarkers(){
    var routeDinos=st.route?st.route.dinos:[];
    for(var i=0;i<markers.length;i++){
      var m=markers[i];
      var inRoute=routeDinos.indexOf(i)>=0;
      var sel=(i===st.sel);
      m.visible=inRoute;
      m.dim=inRoute&&!sel;
      m.grp.visible=m.visible;
      m.glow.visible=sel;m.ring.visible=sel;
      m.dot.scale.setScalar(sel?1:0.66);
      m.dot.material.color.set(sel?'#ffffff':m.dim?'#d0e0b0':'#ffffff');
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
    aimDino(false);
    if(!keepZoom)userZoomed=false;
    camRG=userZoomed?camRG:fitR;
  }

  /* ================= 动画 ================= */
  var clock=new THREE.Clock();
  var running=true,perfAcc=0,perfN=0,dprStep=Math.min(devicePixelRatio||1,2);
  function globeVisible(){return st.page==='tour';}
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
    aimDino:aimDino,
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

  /* ================= 路线选择页渲染 ================= */
  /* 一张路线导览牌：主题色来自路线对象，横幅缺图自动回退木纹与渐变 */
  function routeCardHTML(r,ride,tab,cta,extra){
    var n=r.dinos.length,eras={},cns={},i,dots='',theme=
      '--rc-dark:'+r.dark+';--rc-mid:'+r.mid+';--rc-light:'+r.light+
      ';--rc-accent:'+r.accent+';--rc-accent-2:'+r.accent2;
    for(i=0;i<n;i++){var f=DINOS[r.dinos[i]];eras[f.era]=1;cns[f.country]=1;}
    for(i=0;i<5;i++)dots+='<i'+(i<r.intensity?' class="on"':'')+'></i>';
    return '<button class="route-card'+(extra||'')+'" data-ride="'+ride+'">'+
      '<div class="route-card-bg" style="'+theme+';--rc-banner:url(\'./assets/tex/route-'+r.key+'.webp\')"></div>'+
      '<div class="route-card-inner" style="'+theme+'">'+
        '<span class="route-tab">'+tab+'</span>'+
        '<div class="route-card-head">'+
          '<div class="route-name">'+r.name+'</div>'+
          '<div class="route-badge">'+r.badge+'</div>'+
        '</div>'+
        '<div class="route-desc">'+r.desc+'</div>'+
        '<div class="route-meta">'+
          '<span class="route-stat"><b>'+n+'</b>只恐龙</span>'+
          '<span class="route-stat"><b>'+Object.keys(eras).length+'</b>个年代</span>'+
          '<span class="route-stat"><b>'+Object.keys(cns).length+'</b>个化石发现国</span>'+
          (r.custom?'':'<span class="route-stat">刺激度 <span class="route-intensity">'+dots+'</span></span>')+
        '</div>'+
        '<div class="route-cta">'+cta+'</div>'+
      '</div>'+
    '</button>';
  }
  function renderRoutes(){
    var html='',i;
    for(i=0;i<ROUTES.length;i++)html+=routeCardHTML(ROUTES[i],i,'TAB-'+('0'+(i+1)).slice(-2),'开始游览','');
    CUSTOM_ROUTE.dinos=st.custom;
    CUSTOM_ROUTE.desc=st.custom.length
      ?'自己排的一条路：按「我的路线」里的顺序，一站一站停靠围栏。'
      :'还没有路线。进名录挑选恐龙，按自己的顺序排一条穿过全岛的线——想怎么看，你说了算。';
    html+=routeCardHTML(CUSTOM_ROUTE,'custom','MY LINE',st.custom.length?'开始游览':'去挑选恐龙',' is-custom');
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
    enterGate(ROUTES[idx]);
  });

  /* ================= 自选路线页 =================
   * 从 30 只恐龙里挑，按挑选顺序排出一条路线；存档在本机 localStorage。
   * 排完后走与预设路线完全相同的「大门 → 游览 → 总结」流程。 */
  function closestAttr(el,attr,root){
    while(el&&el!==root){
      if(el.getAttribute&&el.getAttribute(attr)!==null)return el;
      el=el.parentNode;
    }
    return null;
  }
  function customRouteObj(){
    CUSTOM_ROUTE.dinos=st.custom.slice();
    return CUSTOM_ROUTE;
  }
  function renderPicked(){
    var h='',i;
    if(!st.custom.length){
      h='<div class="bd-picked-empty">还没选恐龙 · 从下面的名录里点「＋」加入</div>';
    }else{
      for(i=0;i<st.custom.length;i++){
        var f=DINOS[st.custom[i]];
        h+='<div class="bd-chip">'+
          '<span class="bd-seq">'+('0'+(i+1)).slice(-2)+'</span>'+
          '<span class="bd-dot" style="background:'+(f.color||'#a52a1f')+'"></span>'+
          '<span class="bd-nm">'+f.name+'</span>'+
          '<span class="bd-era">'+ERA_LABEL[f.era]+'</span>'+
          '<button class="bd-mini" data-mv="'+i+'" data-dir="-1"'+(i===0?' disabled':'')+' title="上移">↑</button>'+
          '<button class="bd-mini" data-mv="'+i+'" data-dir="1"'+(i===st.custom.length-1?' disabled':'')+' title="下移">↓</button>'+
          '<button class="bd-mini bd-del" data-del="'+i+'" title="移出路线">×</button>'+
        '</div>';
      }
    }
    bdPickedEl.innerHTML=h;
    bdTitleEl.textContent='自选路线 · 自由探索（已选 '+st.custom.length+' 只）';
    bdStartBtn.disabled=!st.custom.length;
  }
  function renderPool(){
    var order=['paleozoic','triassic','jurassic','cretaceous','cenozoic'];
    var h='',g,i;
    for(g=0;g<order.length;g++){
      var era=order[g],rows='';
      for(i=0;i<DINOS.length;i++){
        var f=DINOS[i];
        if(f.era!==era)continue;
        var on=st.custom.indexOf(i)>=0;
        rows+='<button class="bd-item'+(on?' picked':'')+'" data-add="'+i+'"'+(on?' disabled':'')+'>'+
          '<span class="bd-thumb" style="'+thumbStyle(f)+'"></span>'+
          '<span class="bd-info">'+
            '<span class="bd-nm2">'+f.name+'</span>'+
            '<span class="bd-sub">'+f.country+' · '+f.city+' · 体长 '+lengthOf(f)+' 米 · 威胁 '+((f.stats&&f.stats[1])||0)+'/5</span>'+
          '</span>'+
          '<span class="bd-add">'+(on?'✓':'＋')+'</span>'+
        '</button>';
      }
      if(rows)h+='<div class="bd-era-group"><div class="bd-era-head">'+ERA_LABEL[era]+'</div>'+rows+'</div>';
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
    toast('点「＋」把恐龙加进路线 · 顺序即停靠顺序');
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
    if(isNaN(i)||i<0||i>=DINOS.length||st.custom.indexOf(i)>=0)return;
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
    for(i=0;i<DINOS.length;i++)pool.push(i);
    for(i=pool.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=pool[i];pool[i]=pool[j];pool[j]=t;}
    st.custom=pool.slice(0,8).sort(function(a,b){return a-b;});
    saveCustom();renderBuilder();
    toast('已随机排定 8 只 · 可继续调整顺序');
  });
  bdStartBtn.addEventListener('click',function(){
    if(!st.custom.length)return;
    enterGate(customRouteObj());
  });
  bdBackBtn.addEventListener('click',exitBuilder);

  /* ================= 大门过渡页 · 经典公园大门 =================
   * 两帧 AI 出图交叉淡化（.gate-shot.closed → .gate-shot.open）+ 细微推近，
   * 开门过程全在两张图里，这里只负责重置动画、写入路线名，切换走完进游览页。 */
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
  function enterGate(route){
    hideToast();
    st.route=route;
    st.page='gate';
    document.body.className='mode-gate';
    document.body.setAttribute('data-route',route.key);
    gateTitleEl.textContent='欢迎来到侏罗纪公园';
    gateRouteNameEl.textContent='即将开启 · '+route.name;
    resetGateAnim();
    if(gateTimer)clearTimeout(gateTimer);
    gateTimer=setTimeout(enterTour,GATE_MS);
  }

  /* ================= 游览页（游览车视角）================= */
  /* 监控画面角上的走时（只在游览页跑，其它页直接返回） */
  var recStart=0;
  function pad2(n){return (n<10?'0':'')+n;}
  function tickRec(){
    if(st.page!=='tour'||!tourTcEl)return;
    var s=Math.floor((Date.now()-recStart)/1000);
    tourTcEl.textContent=pad2(Math.floor(s/3600))+':'+pad2(Math.floor(s/60)%60)+':'+pad2(s%60);
  }
  setInterval(tickRec,500);

  function enterTour(){
    var r=st.route;
    if(!r||!r.dinos.length){quitTour();return;}
    recStart=Date.now();
    tickRec();
    st.tourIdx=0;
    st.sel=r.dinos[0];
    st.page='tour';
    document.body.className='mode-tour';
    document.body.setAttribute('data-route',r.key);
    if(G)G.setPlaying(true);
    showTourDino();
    toast(G?'游览车已进园 · 拖动地球可转动':'游览车已进园 · 化石发现地见地球标注');
  }
  function showTourDino(){
    var r=curRoute();
    var idx=r.dinos[st.tourIdx];
    st.sel=idx;
    var f=DINOS[idx];
    var seq=('0'+(st.tourIdx+1)).slice(-2);
    var threat=(f.stats&&f.stats[1])||0;
    tourImgEl.setAttribute('style',thumbStyle(f));
    tourNameEl.textContent=f.name;
    tourPaddockEl.textContent='PADDOCK-'+seq;
    tourLocEl.textContent=ERA_LABEL[f.era]+' · '+f.country+' · '+f.city;
    tourIntroEl.textContent=f.intro;
    tourTraitsEl.innerHTML=f.traits.map(function(t){return '<span class="tour-trait">'+t+'</span>';}).join('');
    tourTaglineEl.innerHTML=f.tags.join('<i>·</i>');
    tourDataEl.innerHTML='体长 <em>'+lengthOf(f)+' 米</em><i>|</i>威胁 <em>'+threat+'/5</em>';
    tourCamEl.textContent='CAM '+seq;
    tourCrumbEl.textContent=r.name+' · '+ERA_LABEL[f.era]+' · 第 '+(st.tourIdx+1)+' / '+r.dinos.length+' 站';
    tcPrevBtn.disabled=(st.tourIdx===0);
    tcNextBtn.textContent=(st.tourIdx+1>=r.dinos.length)?'游览总结 ›':'下一站 ›';
    capName.textContent=f.name;
    capCoord.textContent=fmtCoord(f.lat,f.lon);
    if(G){G.setTag(f.city);G.refreshMarkers();G.aimDino(false);G.fitView(false);G.markDirty();}
    tourBodyEl.scrollTop=0;
  }
  function tourNext(){
    var r=curRoute();
    if(st.tourIdx+1>=r.dinos.length){showSummary();return;}
    st.tourIdx++;
    showTourDino();
  }
  function tourPrev(){
    if(st.tourIdx<=0)return;
    st.tourIdx--;
    showTourDino();
  }
  function quitTour(){
    hideToast();
    st.page='routes';
    st.route=null;
    document.body.className='mode-routes';
    document.body.removeAttribute('data-route');
    if(G)G.setPlaying(false);
    renderRoutes();
  }
  tcPrevBtn.addEventListener('click',tourPrev);
  tcNextBtn.addEventListener('click',tourNext);
  tcQuitBtn.addEventListener('click',quitTour);
  var tourMonBtn=document.getElementById('tourMon');
  tourMonBtn.addEventListener('click',function(){
    var off=document.body.classList.toggle('mon-off');
    tourMonBtn.textContent=off?'原图':'监控';
  });

  /* ================= 总结页 ================= */
  /* 六维特征雷达图（内联 SVG，零依赖） */
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
    s='<svg class="radar" viewBox="0 0 280 250" role="img" aria-label="六维特征图谱">';
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
  /* 游览简报：一句自然话，取代原来的定评句与体型合计条形图 */
  function renderBrief(order){
    var n=order.length;
    if(!n){sumBriefEl.innerHTML='';return;}
    var total=0,max=-1,min=Infinity,maxF=null,minF=null,i,f,k;
    for(i=0;i<n;i++){
      f=DINOS[order[i]];k=lengthOf(f);total+=k;
      if(k>max){max=k;maxF=f;}
      if(k<min){min=k;minF=f;}
    }
    var s='本次巡游共停靠 <b>'+n+'</b> 站。';
    if(n>1){
      s+='这几只成年个体的体长合计约 <b>'+fmtL(total.toFixed(1))+'</b> 米，'+
        '其中'+maxF.name+'最长（<b>'+max+'</b> 米），'+minF.name+'最短（<b>'+min+'</b> 米）。';
    }else{
      s+='这只'+maxF.name+'成年个体的体长约 <b>'+max+'</b> 米。';
    }
    sumBriefEl.innerHTML=s;
  }
  function showSummary(){
    var r=curRoute();
    var order=r.dinos;
    st.page='summary';
    document.body.className='mode-summary';
    document.body.removeAttribute('data-route');
    if(G)G.setPlaying(false);
    var n=order.length,i,k;
    var avg=[0,0,0,0,0,0];
    for(i=0;i<n;i++){
      var f=DINOS[order[i]];
      for(k=0;k<6;k++)avg[k]+=(f.stats?f.stats[k]:0);
    }
    for(k=0;k<6;k++)avg[k]=avg[k]/Math.max(1,n);
    var peak=-1,pv=-1;
    for(k=0;k<6;k++){if(avg[k]>pv){pv=avg[k];peak=k;}}
    sumBarsEl.innerHTML=statsRadar(avg,peak);
    renderBrief(order);
    var dh='';
    for(i=0;i<n;i++){
      var d=DINOS[order[i]],t=d.stats||[0,0,0,0,0,0];
      var ord=[0,1,2,3,4,5].sort(function(a,b){return t[b]-t[a];}).slice(0,2);
      var tp=ord.map(function(j){return STATS_DIMS[j]+t[j];}).join(' · ');
      dh+='<div class="sum-dish">'+
        '<span class="sum-dot" style="background:'+(d.color||'#a52a1f')+'"></span>'+
        '<span class="sum-dname">'+d.name+'</span>'+
        '<span class="sum-dmeta">'+d.country+' · '+d.city+'</span>'+
        '<span class="sum-dtags">'+tp+'</span>'+
      '</div>';
    }
    sumDishesEl.innerHTML=dh;
    sumCountEl.textContent=n;
    var eras={},cns={};
    for(i=0;i<n;i++){var g=DINOS[order[i]];eras[g.era]=1;cns[g.country]=1;}
    sumContEl.textContent=Object.keys(eras).length;
    sumCountryEl.textContent=Object.keys(cns).length;
    summaryBodyEl.scrollTop=0;
    if(G)G.markDirty();
  }
  /* 回园区大门外（各页统一的「回路线选择」出口） */
  function backToRoutes(){
    hideToast();
    if(gateTimer){clearTimeout(gateTimer);gateTimer=null;}
    st.page='routes';
    st.route=null;
    document.body.className='mode-routes';
    document.body.removeAttribute('data-route');
    if(G)G.setPlaying(false);
    renderRoutes();
  }
  scBackBtn.addEventListener('click',backToRoutes);
  scAgainBtn.addEventListener('click',function(){
    if(!st.route)return;
    enterGate(st.route);
  });

  /* ================= 键盘 ================= */
  window.addEventListener('keydown',function(e){
    if(e.key==='Escape'){
      if(st.page==='builder')exitBuilder();
      else if(st.page!=='routes')backToRoutes();
    }else if(st.page==='tour'){
      if(e.key==='ArrowLeft')tourPrev();
      else if(e.key==='ArrowRight')tourNext();
    }
  });

  /* ================= 提示 ================= */
  var toastT=null;
  var TOAST_MS=3600;
  function toast(msg){
    hintEl.textContent=msg;hintEl.classList.add('show');
    clearTimeout(toastT);toastT=setTimeout(function(){hintEl.classList.remove('show');},TOAST_MS);
  }
  function hideToast(){clearTimeout(toastT);hintEl.classList.remove('show');}

  /* ================= 启动 ================= */
  st.custom=loadCustom();
  renderRoutes();
  if(G){G.refreshMarkers();}
  document.body.className='mode-routes';
  toast('选一条游览路线 · 游览车会带你穿行史前世界');
  setTimeout(function(){if(G)G.markDirty();document.getElementById('loader').classList.add('hide');},520);
  if(G)G.start();

  /* logo 图到位才显示 logo 块（挂在 <html> 上，不会被页面切换的 body.className 覆盖）；
     没图就整块隐藏，不留任何 CSS 画的替代图形 */
  (function(){
    try{
      var im=new Image();
      im.onload=function(){document.documentElement.className+=' has-logo';};
      im.src='./assets/tex/logo.webp';
    }catch(e){}
  })();

  /* 首屏若图未就绪，等预检结束后统一重绘 */
  setTimeout(function(){
    for(var i=0;i<DINOS.length;i++)if(DINOS[i].img&&IMG_OK[DINOS[i].name]===null){IMG_OK[DINOS[i].name]=false;}
    if(st.page==='tour')repaintTourImg(st.sel);
  },2600);
})();
