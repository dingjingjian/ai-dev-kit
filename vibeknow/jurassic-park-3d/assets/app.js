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
  var tourVehicleEl=document.getElementById('tourVehicle');
  var tourCrumbEl=document.getElementById('tourCrumb');
  var tourProgressEl=document.getElementById('tourProgress');
  var tourBodyEl=document.getElementById('tourBody');
  var tourImgEl=document.getElementById('tourImg');
  var tourNameEl=document.getElementById('tourName');
  var tourLocEl=document.getElementById('tourLoc');
  var tourIntroEl=document.getElementById('tourIntro');
  var tourTraitsEl=document.getElementById('tourTraits');
  var tourTagsEl=document.getElementById('tourTags');
  var tcPrevBtn=document.getElementById('tcPrev');
  var tcInfoEl=document.getElementById('tcInfo');
  var tcNextBtn=document.getElementById('tcNext');
  var tcQuitBtn=document.getElementById('tcQuit');
  var summaryBodyEl=document.getElementById('summaryBody');
  var sumCountEl=document.getElementById('sumCount');
  var sumContEl=document.getElementById('sumCont');
  var sumCountryEl=document.getElementById('sumCountry');
  var sumThanksEl=document.getElementById('sumThanks');
  var sumBarsEl=document.getElementById('sumBars');
  var sumDishesEl=document.getElementById('sumDishes');
  var sumKcalEl=document.getElementById('sumKcal');
  var scBackBtn=document.getElementById('scBack');
  var hintEl=document.getElementById('hint');

  /* ================= 路线数据 =================
   * 每条路线精选若干展品，按游览车行进顺序排列。
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
     desc:'从二叠纪到新生代，十五件展品串起恐龙的完整兴衰史——一部会行走的地球编年史。',
     dinos:[0,1,2,3,5,7,8,9,10,15,16,17,20,28,29],
     dark:'#0a1520',mid:'#1d3450',light:'#3a5a80',accent:'#4a9ab0',accent2:'#6ab8d0'},
    {key:'bizarre',name:'奇异物种之旅',badge:'怪诞',intensity:4,
     desc:'帆背、厚颅、四翼、镰爪——大自然最不羁的想象力，都在这条路上。',
     dinos:[0,8,20,22,19,18,27,23,13,14],
     dark:'#180a20',mid:'#2e1438',light:'#5a2e6a',accent:'#c080d0',accent2:'#d8a0e0'}
  ];

  /* ================= 常量 ================= */
  var ERA_LABEL={paleozoic:'古生代',triassic:'三叠纪',jurassic:'侏罗纪',cretaceous:'白垩纪',cenozoic:'新生代'};
  var STATS_DIMS=['体型','威胁','速度','智力','防御','稀有'];
  var LENGTH_BASE=15;

  /* ================= 状态 ================= */
  var st={page:'routes',routeIdx:-1,tourIdx:0,sel:0};

  /* ================= 工具函数 ================= */
  function lengthOf(f){return (f&&typeof f.length==='number')?f.length:0;}
  function fmtL(v){return String(v).replace(/\B(?=(\d{3})+(?!\d))/g,',');}
  function fmtCoord(lat,lon){
    return Math.abs(lat).toFixed(1)+'°'+(lat>=0?'N':'S')+' '+Math.abs(lon).toFixed(1)+'°'+(lon>=0?'E':'W');
  }
  function lcRow(k,w,v,over){
    return '<div class="kc-row'+(over?' over':'')+'">'+
      '<span class="kc-k">'+k+'</span>'+
      '<span class="kc-t"><i style="width:'+Math.max(0,Math.min(100,Math.round(w)))+'%"></i></span>'+
      '<span class="kc-v">'+v+'</span></div>';
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

  /* ================= 相机：始终对准当前展品的化石发现地 ================= */
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

  /* ================= 化石发现地标签：只标当前展品 ================= */
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
   * 游览页：路线内全部展品标出，当前展品高亮脉动，其余路线成员压暗作上下文。
   * 其余页面：标记点全隐（地球也不渲染）。 */
  function refreshMarkers(){
    var routeDinos=(st.routeIdx>=0)?ROUTES[st.routeIdx].dinos:[];
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
  function renderRoutes(){
    var html='';
    for(var i=0;i<ROUTES.length;i++){
      var r=ROUTES[i];
      var n=r.dinos.length;
      var eras={},cns={};
      for(var k=0;k<n;k++){var f=DINOS[r.dinos[k]];eras[f.era]=1;cns[f.country]=1;}
      var eraCount=Object.keys(eras).length,cnCount=Object.keys(cns).length;
      var dots='';
      for(var d=0;d<5;d++)dots+='<i'+(d<r.intensity?' class="on"':'')+'></i>';
      html+='<button class="route-card" data-ride="'+i+'">'+
        '<div class="route-card-bg" style="'+
          '--rc-dark:'+r.dark+';--rc-mid:'+r.mid+';--rc-light:'+r.light+
          ';--rc-accent:'+r.accent+';--rc-accent-2:'+r.accent2+
          ';--rc-banner:url(\'./assets/tex/route-'+r.key+'.webp\')"></div>'+
        '<div class="route-card-inner" style="'+
          '--rc-dark:'+r.dark+';--rc-mid:'+r.mid+';--rc-light:'+r.light+
          ';--rc-accent:'+r.accent+';--rc-accent-2:'+r.accent2+'">'+
          '<div class="route-card-head">'+
            '<div class="route-name">'+r.name+'</div>'+
            '<div class="route-badge">'+r.badge+'</div>'+
          '</div>'+
          '<div class="route-desc">'+r.desc+'</div>'+
          '<div class="route-meta">'+
            '<span class="route-stat"><b>'+n+'</b>处展品</span>'+
            '<span class="route-stat"><b>'+eraCount+'</b>个年代</span>'+
            '<span class="route-stat"><b>'+cnCount+'</b>国</span>'+
            '<span class="route-stat">刺激度 <span class="route-intensity">'+dots+'</span></span>'+
          '</div>'+
          '<div class="route-cta">开始游览</div>'+
        '</div>'+
      '</button>';
    }
    routeListEl.innerHTML=html;
  }
  routeListEl.addEventListener('click',function(e){
    var btn=e.target;
    while(btn&&btn!==routeListEl&&btn.tagName!=='BUTTON')btn=btn.parentNode;
    if(!btn||btn===routeListEl||btn.tagName!=='BUTTON')return;
    var idx=parseInt(btn.getAttribute('data-ride'),10);
    if(isNaN(idx))return;
    enterGate(idx);
  });

  /* ================= 大门过渡页 ================= */
  function resetGateAnim(){
    var els=document.querySelectorAll('.gate-door,.gate-logo,.gate-title,.gate-subtitle,.gate-route-name');
    for(var i=0;i<els.length;i++){
      els[i].style.animation='none';
      void els[i].offsetWidth;
      els[i].style.animation='';
    }
  }
  function enterGate(routeIdx){
    st.routeIdx=routeIdx;
    var r=ROUTES[routeIdx];
    st.page='gate';
    document.body.className='mode-gate';
    document.body.setAttribute('data-route',r.key);
    gateTitleEl.textContent='欢迎来到侏罗纪公园';
    gateRouteNameEl.textContent='即将开启 · '+r.name;
    resetGateAnim();
    setTimeout(enterTour,3800);
  }

  /* ================= 游览页（游览车视角）================= */
  function enterTour(){
    var r=ROUTES[st.routeIdx];
    st.tourIdx=0;
    st.sel=r.dinos[0];
    st.page='tour';
    document.body.className='mode-tour';
    document.body.setAttribute('data-route',r.key);
    if(G)G.setPlaying(true);
    showTourDino();
    toast(G?'游览车出发 · 拖动地球可转动':'游览车出发 · 发现地见地球标注');
  }
  function showTourDino(){
    var r=ROUTES[st.routeIdx];
    var idx=r.dinos[st.tourIdx];
    st.sel=idx;
    var f=DINOS[idx];
    tourImgEl.setAttribute('style',thumbStyle(f));
    tourNameEl.textContent=f.name;
    tourLocEl.textContent=f.country+' · '+f.city;
    tourIntroEl.textContent=f.intro;
    tourTraitsEl.innerHTML=f.traits.map(function(t){return '<span class="tour-trait">'+t+'</span>';}).join('');
    tourTagsEl.innerHTML=f.tags.map(function(t){return '<span class="tour-tag">'+t+'</span>';}).join('');
    tourVehicleEl.innerHTML='游览车 <b>#'+String(st.tourIdx+1).padStart(2,'0')+'</b>';
    tourCrumbEl.textContent=r.name+' · '+ERA_LABEL[f.era];
    tourProgressEl.innerHTML='第 <b>'+(st.tourIdx+1)+'</b> / '+r.dinos.length+' 处';
    tcInfoEl.innerHTML='第 <b>'+(st.tourIdx+1)+'</b> / '+r.dinos.length+' · '+f.name;
    tcPrevBtn.disabled=(st.tourIdx===0);
    tcNextBtn.textContent=(st.tourIdx+1>=r.dinos.length)?'游览总结 ›':'下一展品 ›';
    capName.textContent=f.name;
    capCoord.textContent=fmtCoord(f.lat,f.lon);
    if(G){G.setTag(f.city);G.refreshMarkers();G.aimDino(false);G.fitView(false);G.markDirty();}
    tourBodyEl.scrollTop=0;
  }
  function tourNext(){
    var r=ROUTES[st.routeIdx];
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
    st.page='routes';
    st.routeIdx=-1;
    document.body.className='mode-routes';
    document.body.removeAttribute('data-route');
    if(G)G.setPlaying(false);
  }
  tcPrevBtn.addEventListener('click',tourPrev);
  tcNextBtn.addEventListener('click',tourNext);
  tcQuitBtn.addEventListener('click',quitTour);

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
  function renderLength(order){
    var n=order.length;
    if(!n){sumKcalEl.innerHTML='<div class="kc-note">本次尚无展品。</div>';return;}
    var total=0,max=-1,min=Infinity,maxF=null,minF=null,i,f,k;
    for(i=0;i<n;i++){
      f=DINOS[order[i]];k=lengthOf(f);total+=k;
      if(k>=max){max=k;maxF=f;}
      if(k<=min){min=k;minF=f;}
    }
    var avg=Math.round(total/n*10)/10,pct=Math.round(total/LENGTH_BASE*100);
    var h='<div class="kc-total"><b>'+fmtL(total.toFixed(1))+'</b><span>米 · 本次 '+n+' 处合计体长</span></div>';
    h+=lcRow('占基准',pct,pct+'%',pct>100);
    h+=lcRow('每展品均值',avg/LENGTH_BASE*100,avg+' 米',false);
    h+=lcRow('最长',max/LENGTH_BASE*100,maxF.name+' · '+max+' 米',false);
    h+=lcRow('最短',max?min/max*100:0,minF.name+' · '+min+' 米',false);
    h+='<div class="kc-note">体长为成年个体代表值的估算，实际随个体与化石完整性浮动。展厅均长基准 '+LENGTH_BASE+' 米。</div>';
    sumKcalEl.innerHTML=h;
  }
  function showSummary(){
    var r=ROUTES[st.routeIdx];
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
    var peak=-1,pv=-1,low=-1,lv=9;
    for(k=0;k<6;k++){if(avg[k]>pv){pv=avg[k];peak=k;}if(avg[k]<lv){lv=avg[k];low=k;}}
    sumBarsEl.innerHTML=statsRadar(avg,peak);
    sumThanksEl.innerHTML='本次 <em>'+r.name+'</em> 以<em>'+STATS_DIMS[peak]+'</em>维最为突出，'+
      (lv<1.5?'<em>'+STATS_DIMS[low]+'</em>维几乎不显':'<em>'+STATS_DIMS[low]+'</em>维最为克制')+'。<br>感谢游览侏罗纪公园。';
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
    renderLength(order);
    summaryBodyEl.scrollTop=0;
    if(G)G.markDirty();
  }
  scBackBtn.addEventListener('click',function(){
    st.page='routes';
    st.routeIdx=-1;
    document.body.className='mode-routes';
    document.body.removeAttribute('data-route');
  });

  /* ================= 键盘 ================= */
  window.addEventListener('keydown',function(e){
    if(e.key==='Escape'){
      if(st.page==='tour')quitTour();
      else if(st.page==='summary'){
        st.page='routes';st.routeIdx=-1;
        document.body.className='mode-routes';
        document.body.removeAttribute('data-route');
      }
      else if(st.page==='gate'){
        st.page='routes';st.routeIdx=-1;
        document.body.className='mode-routes';
        document.body.removeAttribute('data-route');
      }
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

  /* ================= 启动 ================= */
  renderRoutes();
  if(G){G.refreshMarkers();}
  document.body.className='mode-routes';
  toast('选择一条游览路线 · 游览车将带你穿行史前世界');
  setTimeout(function(){if(G)G.markDirty();document.getElementById('loader').classList.add('hide');},520);
  if(G)G.start();

  /* 首屏若图未就绪，等预检结束后统一重绘 */
  setTimeout(function(){
    for(var i=0;i<DINOS.length;i++)if(DINOS[i].img&&IMG_OK[DINOS[i].name]===null){IMG_OK[DINOS[i].name]=false;}
    if(st.page==='tour')repaintTourImg(st.sel);
  },2600);
})();
