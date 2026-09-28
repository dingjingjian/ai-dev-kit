(function(){
  var cv=document.getElementById('stage');
  var gl=null;try{gl=cv.getContext('webgl2')||cv.getContext('webgl')}catch(e){}
  if(!gl||typeof THREE==='undefined'){document.getElementById('fallback').classList.add('show');document.getElementById('loader').classList.add('hide');return;}
  try{gl.disable(gl.DITHER);}catch(e){}

  var W=innerWidth,H=innerHeight,DPR=Math.min(devicePixelRatio||1,2);
  var renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(DPR);renderer.setSize(W,H,false);
  renderer.outputEncoding=THREE.sRGBEncoding;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.2;

  var scene=new THREE.Scene();
  var camera=new THREE.PerspectiveCamera(50,W/H,0.1,5000);
  var R=1.6;

  /* ===== 背景星空天球（复用 moon-myths / earth-3d 的程序化星空）===== */
  var GALAXY_TILT=1.15;
  function starfieldTex(){
    var w=2048,h=1024,c=document.createElement('canvas');c.width=w;c.height=h;var x=c.getContext('2d'),i;
    var bg=x.createLinearGradient(0,0,0,h);
    bg.addColorStop(0,'#0a0806');bg.addColorStop(.5,'#0e0b08');bg.addColorStop(1,'#0a0806');
    x.fillStyle=bg;x.fillRect(0,0,w,h);
    function band(col,spread,peak){
      var g=x.createLinearGradient(0,h/2-spread,0,h/2+spread);
      g.addColorStop(0,'rgba('+col+',0)');g.addColorStop(.2,'rgba('+col+','+(peak*.45)+')');
      g.addColorStop(.5,'rgba('+col+','+peak+')');g.addColorStop(.8,'rgba('+col+','+(peak*.45)+')');
      g.addColorStop(1,'rgba('+col+',0)');
      x.fillStyle=g;x.fillRect(0,h/2-spread,w,spread*2);
    }
    band('190,180,164',h*0.30,0.062);band('210,202,188',h*0.17,0.058);
    band('228,222,212',h*0.075,0.056);band('242,238,230',h*0.028,0.056);
    function blot(px,py,r,col,a){
      var g2=x.createRadialGradient(0,0,0,0,0,r);
      g2.addColorStop(0,'rgba('+col+','+a+')');g2.addColorStop(1,'rgba('+col+',0)');
      for(var k=-1;k<=1;k++){
        if(k&&px>w*.1&&px<w*.9)continue;
        x.save();x.translate(px+k*w,py);x.fillStyle=g2;x.fillRect(-r,-r,r*2,r*2);x.restore();
      }
    }
    /* 大团低透明度的彩色云气是之前最脏的一块：在深底上偏紫偏棕、糊成一片。
       这里把团数减半、透明度压低，并把蓝紫一律换成中性暖灰，让银河带收成一条
       「银灰浮尘」而不是彩雾——暖琥珀主调下再留冷色云，就会重新糊回脏。 */
    for(i=0;i<22;i++){
      blot(Math.random()*w,h/2+(Math.random()-.5)*h*.30,200+Math.random()*220,Math.random()<.62?'158,148,132':'198,178,148',.007+Math.random()*.012);
    }
    for(i=0;i<9;i++)blot(Math.random()*w,Math.random()*h,160+Math.random()*280,Math.random()<.55?'160,150,134':'208,182,152',.008+Math.random()*.014);
    for(i=0;i<90;i++){
      var warm=Math.random()<.34;
      blot(Math.random()*w,h/2+(Math.random()-.5)*h*.34,36+Math.random()*190,warm?'230,190,148':'172,162,148',.016+Math.random()*.032);
    }
    for(i=0;i<30;i++){
      blot(Math.random()*w,h/2+(Math.random()-.5)*h*.20,60+Math.random()*230,'8,7,5',.04+Math.random()*.07);
    }
    var vg=x.createLinearGradient(0,0,0,h);
    vg.addColorStop(0,'rgba(0,0,0,.30)');vg.addColorStop(.34,'rgba(0,0,0,0)');
    vg.addColorStop(.66,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,.30)');
    x.fillStyle=vg;x.fillRect(0,0,w,h);
    var c2=document.createElement('canvas');c2.width=w;c2.height=h;
    var x2=c2.getContext('2d');
    x2.filter='blur(2.5px)';
    x2.drawImage(c,-w,0);x2.drawImage(c,0,0);x2.drawImage(c,w,0);
    var t=new THREE.CanvasTexture(c2);t.encoding=THREE.sRGBEncoding;
    t.anisotropy=renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  var sky=new THREE.Mesh(new THREE.SphereGeometry(3500,48,32),new THREE.MeshBasicMaterial({map:starfieldTex(),side:THREE.BackSide,depthWrite:false}));
  sky.rotation.z=GALAXY_TILT;scene.add(sky);

  /* ===== 光照：取真实北京时间。
     环境光用「暖中性」而不是冷蓝——冷蓝环境光会把整颗地球染成橄榄灰，
     真正负责「夜面偏冷」的是背光补光（fillLight 只打在暗面，不影响日照面）。
     暖琥珀主调下把环境光再往褐里挪一点，让地球的暗面与页面底色连成一体。 ===== */
  var ambient=new THREE.AmbientLight(0x40382a,0.34);scene.add(ambient);
  var sunLight=new THREE.DirectionalLight(0xfff4e2,2.3);scene.add(sunLight);
  var fillLight=new THREE.DirectionalLight(0x3a6675,0.3);scene.add(fillLight);
  var SUN_DIST=40;
  var OBLIQ=23.44;
  var _sunV=new THREE.Vector3();
  var astro={sunLon:0,sunDec:0,bjH:0,bjM:0};
  function astroUpdate(){
    var d=new Date();
    var utcH=d.getUTCHours()+d.getUTCMinutes()/60+d.getUTCSeconds()/3600;
    var bj=(utcH+8)%24;
    astro.bjH=Math.floor(bj);astro.bjM=d.getUTCMinutes();
    var lon=15*(12-utcH),dec=0;
    if(lon>180)lon-=360;if(lon<=-180)lon+=360;
    var n=Math.floor((Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())-Date.UTC(d.getUTCFullYear(),0,0))/86400000);
    dec=-OBLIQ*Math.cos(2*Math.PI*(n+10)/365.24);
    astro.sunLon=lon;astro.sunDec=dec;
    _sunV.copy(ll2v(dec,lon,1)).normalize();
    sunLight.position.copy(_sunV).multiplyScalar(SUN_DIST);
    fillLight.position.copy(_sunV).multiplyScalar(-SUN_DIST);
  }
  var nowEl=document.getElementById('nowInfo'),nowStr='',nowAt=-1;
  function pad2(n){return (n<10?'0':'')+n;}
  function tickNowInfo(t){
    if(!nowEl||t-nowAt<1)return;
    nowAt=t;
    var lon=astro.sunLon,dec=astro.sunDec;
    var s='<b>'+pad2(astro.bjH)+':'+pad2(astro.bjM)+'</b> 北京时间'+
          '<em>阳光直射 '+Math.abs(lon).toFixed(1)+'°'+(lon>=0?'E':'W')+' · 赤纬 '+(dec>=0?'+':'')+dec.toFixed(1)+'°</em>';
    if(s!==nowStr){nowStr=s;nowEl.innerHTML=s;}
  }

  /* ===== 工具纹理 ===== */
  function radialTex(c0,c1,c2){
    var c=document.createElement('canvas');c.width=c.height=128;var x=c.getContext('2d'),g=x.createRadialGradient(64,64,0,64,64,64);
    g.addColorStop(0,c0);g.addColorStop(.4,c1);g.addColorStop(1,c2);x.fillStyle=g;x.fillRect(0,0,128,128);
    return new THREE.CanvasTexture(c);
  }
  function radialStops(stops){
    var s=128,c=document.createElement('canvas');c.width=c.height=s;var x=c.getContext('2d');
    var g=x.createRadialGradient(64,64,0,64,64,64),i;
    for(i=0;i<stops.length;i++)g.addColorStop(stops[i][0],stops[i][1]);
    x.fillStyle=g;x.fillRect(0,0,s,s);
    var t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return t;
  }
  function plainTex(col){var c=document.createElement('canvas');c.width=c.height=4;c.getContext('2d').fillStyle=col;c.getContext('2d').fillRect(0,0,4,4);return new THREE.CanvasTexture(c);}

  /* 经纬度 → 球面坐标（与 three.js SphereGeometry 贴图 UV 对齐，同 earth-3d）*/
  function ll2v(lat,lon,r){
    var th=(90-lat)*Math.PI/180,p=(lon+180)/360*Math.PI*2;
    return new THREE.Vector3(-r*Math.cos(p)*Math.sin(th),r*Math.cos(th),r*Math.sin(p)*Math.sin(th));
  }

  /* ===== 主地球 ===== */
  var mainTilt=new THREE.Group();mainTilt.rotation.z=23.5*Math.PI/180;scene.add(mainTilt);
  var mainSpin=new THREE.Group();mainTilt.add(mainSpin);
  var earthMat=new THREE.MeshStandardMaterial({map:plainTex('#171310'),color:new THREE.Color('#fff2e2'),roughness:.9,metalness:.02});
  var earthMesh=new THREE.Mesh(new THREE.SphereGeometry(R,48,32),earthMat);mainSpin.add(earthMesh);
  var cloudMat=new THREE.MeshStandardMaterial({map:plainTex('#ffffff'),transparent:true,alphaMap:plainTex('#ffffff'),opacity:.34,roughness:1,depthWrite:false});
  var clouds=new THREE.Mesh(new THREE.SphereGeometry(R*1.012,48,32),cloudMat);mainTilt.add(clouds);
  /* 大气辉光：不用 BackSide 空壳——壳背面的可见部分是一圈等宽环带，
     外缘硬切、宽度只由半径差决定，收窄了照样像给地球套了个土星环。
     改用「贴在地心的加性光晕 sprite」：峰值落在地球轮廓上，向外柔和衰减，
     被地球自身的正面挡掉中心（depthTest 保留），于是只剩一圈自然的边缘辉光。
     峰值半径 = 光晕半径 × 0.67，取 2.4 × 0.67 ≈ 1.6 = R。 */
  var atmo=new THREE.Sprite(new THREE.SpriteMaterial({
    map:radialStops([
      [0,'rgba(240,190,110,0)'],[.52,'rgba(240,190,110,0)'],[.615,'rgba(234,168,70,.5)'],
      [.67,'rgba(232,163,61,.6)'],[.78,'rgba(214,142,44,.2)'],[.9,'rgba(202,132,40,.05)'],[1,'rgba(196,128,38,0)']
    ]),
    transparent:true,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending,opacity:.62
  }));
  atmo.scale.set(4.8,4.8,1);
  mainTilt.add(atmo);

  /* ===== 美食标记点 =====
   * 形制同 world-heroines-atlas（实心点 + 光晕 + 描边 + 细环四层），配色按大洲取色：
   *   亚洲红 / 欧洲蓝 / 非洲绿 / 北美紫 / 南美橙 / 大洋洲青 */
  var markerGroup=new THREE.Group();mainSpin.add(markerGroup);
  var haloTex=radialStops([
    [0,'rgba(255,252,246,.96)'],[.16,'rgba(255,246,230,.78)'],[.34,'rgba(250,232,204,.4)'],
    [.56,'rgba(244,214,168,.12)'],[.8,'rgba(238,204,150,.02)'],[1,'rgba(236,200,146,0)']
  ]);
  var coreTex=radialStops([
    [0,'rgba(255,255,255,1)'],[.7,'rgba(255,255,255,1)'],[.84,'rgba(255,255,255,.5)'],
    [1,'rgba(255,255,255,0)']
  ]);
  var contourTex=radialStops([
    [0,'rgba(10,8,5,0)'],[.46,'rgba(10,8,5,0)'],[.56,'rgba(10,8,5,.3)'],
    [.68,'rgba(10,8,5,.44)'],[.8,'rgba(10,8,5,.2)'],[.92,'rgba(10,8,5,.04)'],[1,'rgba(10,8,5,0)']
  ]);
  var ringLineTex=radialStops([
    [0,'rgba(255,255,255,0)'],[.6,'rgba(255,255,255,0)'],[.64,'rgba(255,255,255,.45)'],
    [.7,'rgba(255,255,255,1)'],[.74,'rgba(255,255,255,.45)'],[.78,'rgba(255,255,255,0)'],[1,'rgba(255,255,255,0)']
  ]);
  var MK_HALO=0.24,MK_CORE=0.085,MK_CONTOUR=0.13,MK_RING=0.24,MK_RING_SEL=0.3;
  var REF_DIST=9.7;
  /* 色彩管理：本文件带的 three 仍是 legacy 模式（ColorManagement.legacyMode=true）。
     这种模式下 new Color('#hex') 给材质时颜色被当作线性值，再经 outputEncoding=sRGB 回写，
     屏幕上等于白提亮一档——大洲色会被洗成同一片粉白（#e2604a 会显示成 #f1a696）。
     所以凡是交给材质的颜色都要 convertSRGBToLinear() 过一遍；
     交给 CSS 的（名牌圆点）保持 sRGB 原色，因此 REG_COL / DAWN_COL 不转换。 */
  var DAWN_COL=new THREE.Color('#f5ebd8');
  var GOLD_COL=new THREE.Color('#e8a33d').convertSRGBToLinear();
  var DIM_COL=new THREE.Color('#8a7a63').convertSRGBToLinear();
  var WHITE_COL=new THREE.Color('#ffffff');
  /* 地域色表：与 foods.js 的 REGIONS.color 同源（保留 sRGB，取材质色时再转线性） */
  var REG_COL={};
  (function(){
    for(var i=0;i<REGIONS.length;i++)REG_COL[REGIONS[i].id]=new THREE.Color(REGIONS[i].color||'#f5ebd8');
  })();
  /* 当前筛选地域 id */
  var curRegion='all';
  var markers=[];
  (function buildMarkers(){
    for(var i=0;i<FOODS.length;i++){
      var m=FOODS[i];
      var grp=new THREE.Group();
      grp.position.copy(ll2v(m.lat,m.lon,R*1.012));
      grp.lookAt(0,0,0);grp.rotateX(Math.PI);
      var cReg=(REG_COL[m.region]||DAWN_COL).clone().convertSRGBToLinear();
      /* cCore 只往白里提 7%：提太多会把大洲色洗成同一个粉白点，颜色编码就废了 */
      var cHalo=cReg.clone(),cCore=cReg.clone().lerp(WHITE_COL,.07),cRing=cReg.clone();
      var contour=new THREE.Sprite(new THREE.SpriteMaterial({map:contourTex,transparent:true,depthWrite:false,depthTest:false,toneMapped:false,opacity:.85}));
      contour.scale.set(MK_CONTOUR,MK_CONTOUR,1);
      var halo=new THREE.Sprite(new THREE.SpriteMaterial({map:haloTex,transparent:true,depthWrite:false,depthTest:false,toneMapped:false,color:cHalo.clone(),opacity:.5}));
      halo.scale.set(MK_HALO,MK_HALO,1);
      var core=new THREE.Sprite(new THREE.SpriteMaterial({map:coreTex,transparent:true,depthWrite:false,depthTest:false,toneMapped:false,color:cCore.clone(),opacity:1}));
      core.scale.set(MK_CORE,MK_CORE,1);
      var ring=new THREE.Sprite(new THREE.SpriteMaterial({map:ringLineTex,transparent:true,depthWrite:false,depthTest:false,toneMapped:false,color:cRing.clone(),opacity:.42}));
      ring.scale.set(MK_RING,MK_RING,1);
      var hit=new THREE.Mesh(new THREE.SphereGeometry(0.16,10,10),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,depthTest:false}));
      contour.renderOrder=10;halo.renderOrder=11;ring.renderOrder=12;core.renderOrder=13;
      grp.add(contour);grp.add(halo);grp.add(ring);grp.add(core);grp.add(hit);
      markerGroup.add(grp);
      markers.push({food:m,grp:grp,contour:contour,halo:halo,core:core,ring:ring,hit:hit,
        cHalo:cHalo,cCore:cCore,cRing:cRing,fade:1,sel:false,dim:false,front:false});
    }
  })();
  var ping=new THREE.Sprite(new THREE.SpriteMaterial({map:ringLineTex,transparent:true,depthWrite:false,depthTest:false,toneMapped:false,color:DAWN_COL.clone(),opacity:0}));
  ping.visible=false;ping.renderOrder=14;markerGroup.add(ping);

  /* ===== 星空点（复用 moon-myths 的程序化星点）===== */
  function gaussRand(){var u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(6.2832*v);}
  function starTex(spike){
    var s=64,c=document.createElement('canvas');c.width=c.height=s;var x=c.getContext('2d'),i;
    var g=x.createRadialGradient(32,32,0,32,32,32);
    g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.2,'rgba(255,255,255,.88)');
    g.addColorStop(.38,'rgba(255,255,255,.3)');g.addColorStop(.62,'rgba(255,255,255,.07)');
    g.addColorStop(1,'rgba(255,255,255,0)');
    x.fillStyle=g;x.fillRect(0,0,s,s);
    if(spike){
      var bars=[[1,0],[0,1],[.7,.7],[-.7,.7]];
      for(i=0;i<4;i++){
        x.save();x.translate(32,32);x.rotate(Math.atan2(bars[i][1],bars[i][0]));
        var lg=x.createLinearGradient(0,0,31,0);
        lg.addColorStop(0,'rgba(255,255,255,.5)');lg.addColorStop(.3,'rgba(255,255,255,.12)');lg.addColorStop(1,'rgba(255,255,255,0)');
        x.fillStyle=lg;x.fillRect(0,-.7,31,1.4);x.restore();
      }
    }
    var t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return t;
  }
  function dotCoreTex(){
    var s=32,c=document.createElement('canvas');c.width=c.height=s;var x=c.getContext('2d');
    var g=x.createRadialGradient(16,16,0,16,16,16);
    g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.16,'rgba(255,255,255,.94)');
    g.addColorStop(.32,'rgba(255,255,255,.46)');g.addColorStop(.55,'rgba(255,255,255,.1)');
    g.addColorStop(.78,'rgba(255,255,255,.02)');g.addColorStop(1,'rgba(255,255,255,0)');
    x.fillStyle=g;x.fillRect(0,0,s,s);
    var t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return t;
  }
  var stars=new THREE.Group();stars.rotation.z=GALAXY_TILT;scene.add(stars);
  (function buildStars(){
    var dot=dotCoreTex(),soft=starTex(false),flare=starTex(true);
    var tiers=[{n:5600,size:1.5,tex:dot,op:.9,bandP:.8,maxB:.72},
               {n:3000,size:2.2,tex:dot,op:.92,bandP:.7,maxB:.82},
               {n:1000,size:3.3,tex:soft,op:.96,bandP:.55,maxB:.95},
               {n:160,size:5.2,tex:flare,op:1,bandP:.38,maxB:1}];
    for(var k=0;k<tiers.length;k++){
      var T=tiers[k],n=T.n,pos=new Float32Array(n*3),col=new Float32Array(n*3);
      for(var i=0;i<n;i++){
        var u=Math.random()*2-1,v=Math.random()*6.2832,sp=Math.sqrt(1-u*u);
        var dx=sp*Math.cos(v),dy=u,dz=sp*Math.sin(v);
        if(Math.random()<T.bandP)dy*=Math.abs(gaussRand())*.28;
        var L=Math.sqrt(dx*dx+dy*dy+dz*dz)||1,rad=1000+Math.random()*600;
        pos[i*3]=dx/L*rad;pos[i*3+1]=dy/L*rad;pos[i*3+2]=dz/L*rad;
        var b=T.maxB*(.34+Math.pow(Math.random(),2)*.66),ct=Math.random();
        if(ct<.6){col[i*3]=b*.86;col[i*3+1]=b*.92;col[i*3+2]=b;}
        else if(ct<.88){col[i*3]=b;col[i*3+1]=b;col[i*3+2]=b*.99;}
        else{col[i*3]=b;col[i*3+1]=b*.88;col[i*3+2]=b*.7;}
      }
      var geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
      geo.setAttribute('color',new THREE.BufferAttribute(col,3));
      stars.add(new THREE.Points(geo,new THREE.PointsMaterial({map:T.tex,size:T.size*DPR,sizeAttenuation:false,vertexColors:true,transparent:true,opacity:T.op,depthWrite:false,blending:THREE.AdditiveBlending})));
    }
  })();

  /* ===== 纹理加载（容错）===== */
  var loader=new THREE.TextureLoader();loader.setCrossOrigin('anonymous');
  var maxA=renderer.capabilities.getMaxAnisotropy();
  function load(u,ok){loader.load(u,ok,undefined,function(){});}
  load('./assets/earth.jpg',function(t){t.encoding=THREE.sRGBEncoding;t.anisotropy=maxA;earthMat.map=t;earthMat.needsUpdate=true;});
  load('./assets/clouds.png',function(t){t.anisotropy=maxA;cloudMat.map=t;cloudMat.alphaMap=t;cloudMat.needsUpdate=true;});

  /* ===== 相机 ===== */
  function fitR(){var vFov=camera.fov*Math.PI/180;var hFov=2*Math.atan(Math.tan(vFov/2)*camera.aspect);return Math.max(4,2.0*R/Math.tan(hFov/2));}
  var theta=0.6,phi=1.15,radius=fitR();
  var thetaG=theta,phiG=phi,radiusG=radius,userZoomed=false;
  var R_MIN=2.2,R_MAX=26;
  var PAN_CARD=0.14,panG=0,pan=0;
  function camPos(){var sp=Math.sin(phi);
    camera.position.set(radius*sp*Math.sin(theta),radius*Math.cos(phi),radius*sp*Math.cos(theta));
    camera.lookAt(0,-pan*radius,0);
  }
  /* 开场视角正对的点：中国·北京烤鸭 */
  var HOME_LAT=39.9,HOME_LON=116.4;
  (function(){
    for(var i=0;i<FOODS.length;i++){
      if(FOODS[i].country==='中国'&&FOODS[i].name==='北京烤鸭'){HOME_LAT=FOODS[i].lat;HOME_LON=FOODS[i].lon;return;}
    }
  })();
  var _aim=new THREE.Vector3();
  function aimLatLon(lat,lon){
    _aim.copy(ll2v(lat,lon,1));
    mainTilt.updateMatrixWorld(true);
    _aim.applyMatrix4(mainSpin.matrixWorld);
    var len=_aim.length()||1;
    phiG=Math.acos(Math.max(-1,Math.min(1,_aim.y/len)));
    thetaG=shortAngle(theta,Math.atan2(_aim.x,_aim.z));
  }

  /* ===== 手势：单指旋转 / 双指缩放，区分点击与拖动 ===== */
  var pointers={},dragId=null,pinch=0,lx=0,ly=0;
  var downX=0,downY=0,downT=0,moved=false;
  function pCount(){var n=0,k;for(k in pointers)if(pointers[k])n++;return n;}
  function stopDrag(){dragId=null;}
  function tdist(t){return Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);}
  cv.addEventListener('pointerdown',function(e){
    pointers[e.pointerId]={x:e.clientX,y:e.clientY};
    if(pCount()>1){stopDrag();return;}
    dragId=e.pointerId;lx=e.clientX;ly=e.clientY;
    downX=e.clientX;downY=e.clientY;downT=performance.now();moved=false;
    try{cv.setPointerCapture(e.pointerId);}catch(_){}
  });
  function onPointerEnd(e){
    var isMain=(e.pointerId===dragId);
    delete pointers[e.pointerId];
    if(dragId===e.pointerId)stopDrag();
    try{cv.releasePointerCapture(e.pointerId)}catch(_){}
    if(isMain&&!moved){
      var dt=performance.now()-downT;
      var dx=e.clientX-downX,dy=e.clientY-downY;
      if(dt<400&&Math.hypot(dx,dy)<10){handleClick(e.clientX,e.clientY);}
    }
    var n=pCount();
    if(n===1){for(var id in pointers)if(pointers[id]){dragId=Number(id);lx=pointers[id].x;ly=pointers[id].y;break;}}
  }
  cv.addEventListener('pointerup',onPointerEnd);
  cv.addEventListener('pointercancel',onPointerEnd);
  cv.addEventListener('pointermove',function(e){
    var p=pointers[e.pointerId];if(!p)return;
    p.x=e.clientX;p.y=e.clientY;
    if(e.pointerId!==dragId||pCount()>1)return;
    var dx=e.clientX-lx,dy=e.clientY-ly;
    if(Math.abs(dx)+Math.abs(dy)>2)moved=true;
    lx=e.clientX;ly=e.clientY;
    thetaG-=dx*0.005;phiG-=dy*0.005;phiG=Math.max(0.08,Math.min(Math.PI-0.08,phiG));
  });
  cv.addEventListener('wheel',function(e){e.preventDefault();radiusG*=1+Math.sign(e.deltaY)*0.08;radiusG=Math.max(R_MIN,Math.min(R_MAX,radiusG));userZoomed=true;},{passive:false});
  cv.addEventListener('touchstart',function(e){if(e.touches.length===2){stopDrag();pinch=tdist(e.touches);}},{passive:true});
  cv.addEventListener('touchend',function(e){if(e.touches.length<2)pinch=0;},{passive:true});
  cv.addEventListener('touchcancel',function(){pinch=0;},{passive:true});
  cv.addEventListener('touchmove',function(e){if(e.touches.length!==2)return;e.preventDefault();var d=tdist(e.touches);if(pinch>12&&d>12){radiusG*=pinch/d;radiusG=Math.max(R_MIN,Math.min(R_MAX,radiusG));userZoomed=true;}pinch=d;},{passive:false});

  /* ===== Raycaster：点击标记点 ===== */
  var raycaster=new THREE.Raycaster();
  var ndc=new THREE.Vector2();
  function handleClick(cx,cy){
    ndc.x=(cx/W)*2-1;ndc.y=-(cy/H)*2+1;
    raycaster.setFromCamera(ndc,camera);
    var targets=[];
    for(var i=0;i<markers.length;i++){
      var m=markers[i];
      if(!m.front)continue;
      targets.push(m.hit);
    }
    if(targets.length===0)return;
    var hits=raycaster.intersectObjects(targets,false);
    if(hits.length>0){
      var hitMesh=hits[0].object;
      for(var j=0;j<markers.length;j++){
        if(markers[j].hit===hitMesh){selectMarker(j);return;}
      }
    }
  }

  /* ===== 选中标记：停转 + 飞到正面 + 展开卡片 ===== */
  var selIdx=-1;
  function shortAngle(from,to){
    var d=(to-from)%(Math.PI*2);
    if(d>Math.PI)d-=Math.PI*2;
    if(d<-Math.PI)d+=Math.PI*2;
    return from+d;
  }
  function selectMarker(i){
    selIdx=i;
    aimLatLon(markers[i].food.lat,markers[i].food.lon);
    if(!userZoomed)radiusG=fitR()*0.82;
    showCard(i);
    syncList();
  }
  function clearSelection(){
    selIdx=-1;
    if(!userZoomed)radiusG=fitR();
    hideCard();
    syncList();
  }

  /* ===== 味型推断：从 taste [甜,辣,酸,咸,鲜,香] 取主导味型 ===== */
  function tasteProfile(t){
    var sorted=[];
    for(var i=0;i<t.length;i++)sorted.push({i:i,v:t[i]});
    sorted.sort(function(a,b){return b.v-a.v;});
    if(sorted[0].v===0)return '清淡';
    var name=TASTE_DIMS[sorted[0].i];
    if(sorted[1]&&sorted[1].v>=sorted[0].v-1&&sorted[1].v>=3)name+=TASTE_DIMS[sorted[1].i];
    return name+'为主';
  }

  /* ===== 美食卡片 ===== */
  var cardEl=document.getElementById('card');
  var picEl=document.getElementById('cPic');
  var picFileEl=document.getElementById('cPicFile');
  var metaEl=document.getElementById('cMeta');
  var ingrEl=document.getElementById('cIngr');
  var IMG_OK={};
  FOODS.forEach(function(m,i){
    if(!m.img){IMG_OK[i]=false;return;}
    IMG_OK[i]=null;
    var im=new Image();
    im.onload=function(){IMG_OK[i]=true;if(selIdx===i)showCard(i);};
    im.onerror=function(){IMG_OK[i]=false;};
    im.src=m.img;
  });
  setTimeout(function(){
    for(var i=0;i<FOODS.length;i++)if(FOODS[i].img&&IMG_OK[i]===null){IMG_OK[i]=false;if(selIdx===i)showCard(i);}
  },2600);
  function applyPic(m,i){
    var ok=!!(m.img&&IMG_OK[i]===true);
    picEl.className=ok?'pic has':'pic';
    if(ok)picEl.style.backgroundImage="url('"+m.img+"')";else picEl.style.backgroundImage='';
    picFileEl.textContent=m.slug?m.slug+'.webp':'';
  }
  function regionName(id){for(var i=0;i<REGIONS.length;i++)if(REGIONS[i].id===id)return REGIONS[i].name;return '';}
  function showCard(i){
    var m=FOODS[i];
    document.getElementById('cCiv').textContent=m.civ+' · '+regionName(m.region);
    document.getElementById('cName').textContent=m.name;
    /* 味型·热量行：美食卡片特有的字段 */
    metaEl.innerHTML='<span>'+tasteProfile(m.taste)+'</span><span>'+(m.kcal||'?')+' 千卡</span>';
    applyPic(m,i);
    document.getElementById('cStory').textContent=m.story;
    /* 食材行：美食卡片特有 */
    if(m.ingredients&&m.ingredients.length){
      ingrEl.innerHTML='<b>食材</b>'+m.ingredients.join('、');
      ingrEl.style.display='';
    }else ingrEl.style.display='none';
    document.getElementById('cTags').innerHTML=m.tags.map(function(t){return '<span>'+t+'</span>';}).join('');
    document.getElementById('cLoc').textContent='纬度 '+m.lat.toFixed(1)+'°  经度 '+m.lon.toFixed(1)+'°';
    cardEl.classList.add('show');
    cardEl.scrollTop=0;
    panG=PAN_CARD;
  }
  function hideCard(){cardEl.classList.remove('show');panG=0;}
  document.getElementById('cClose').addEventListener('click',clearSelection);

  /* ===== 分享到小红书 ===== */
  var cShareBtn=document.getElementById('cShare');
  /* 分享图版式：顶部通栏菜品图 → 下方暖黑底上的「大洲行 / 菜名 / 味型·热量 / 故事 / 食材 / 标签」→ 页脚品牌。
     整块文字都落在纯底色上，不与照片交叠，确保任何一张图上都清晰可读。 */
  function drawShareCard(idx,m,onDone){
    var sw=1080,sh=1440,P=80,HERO=870,W=sw-P*2;
    var SERIF='Georgia,"Songti SC","Noto Serif SC","STSong","SimSun",serif';
    var SANS='-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    var BG='#130e07';                       /* 文字区底色，与顶部图下缘的渐隐色一致 */
    var c=document.createElement('canvas');c.width=sw;c.height=sh;
    var x=c.getContext('2d');
    var NO_START='，。、；：？！）』」》〉”’…—·%';
    function wrap(str,font,maxW){
      x.font=font;var chars=str.split(''),line='',out=[];
      for(var i=0;i<chars.length;i++){
        var ch=chars[i],t=line+ch;
        if(x.measureText(t).width>maxW&&line){
          /* 中文禁则：标点不另起一行，挂在上行行尾之后再换行 */
          if(NO_START.indexOf(ch)>=0){out.push(t);line='';}
          else{out.push(line);line=ch;}
        }else line=t;
      }
      if(line)out.push(line);return out;
    }
    function drawBg(){
      var bg=x.createLinearGradient(0,0,0,sh);
      bg.addColorStop(0,'#1b1409');bg.addColorStop(.62,BG);bg.addColorStop(1,'#0d0904');
      x.fillStyle=bg;x.fillRect(0,0,sw,sh);
      var vg=x.createRadialGradient(sw/2,sh*0.72,0,sw/2,sh*0.72,sw*0.78);
      vg.addColorStop(0,'rgba(232,163,61,.055)');vg.addColorStop(1,'rgba(232,163,61,0)');
      x.fillStyle=vg;x.fillRect(0,HERO,sw,sh-HERO);
      x.fillStyle='rgba(255,224,190,.5)';
      for(var i=0;i<46;i++){
        x.globalAlpha=Math.random()*0.22+0.06;
        x.beginPath();x.arc(Math.random()*sw,HERO+40+Math.random()*(sh-HERO-140),Math.random()*1.5+0.4,0,Math.PI*2);x.fill();
      }
      x.globalAlpha=1;
    }
    function heroFade(){
      var fg=x.createLinearGradient(0,HERO-170,0,HERO);
      fg.addColorStop(0,'rgba(19,14,7,0)');fg.addColorStop(1,'rgba(19,14,7,1)');
      x.fillStyle=fg;x.fillRect(0,HERO-170,sw,170);
    }
    /* 无图回退：暗盘底 + 炉火余光 + 火候圆盘 + 文件名，与卡片里的占位保持一致 */
    function drawPlaceholder(){
      var pg=x.createLinearGradient(0,0,0,HERO);
      pg.addColorStop(0,'#241a0e');pg.addColorStop(1,'#150f08');
      x.fillStyle=pg;x.fillRect(0,0,sw,HERO);
      var rg=x.createRadialGradient(sw/2,HERO*0.5,0,sw/2,HERO*0.5,540);
      rg.addColorStop(0,'rgba(232,163,61,.20)');rg.addColorStop(1,'rgba(232,163,61,0)');
      x.fillStyle=rg;x.fillRect(0,0,sw,HERO);
      var cy=HERO*0.46;
      x.strokeStyle='rgba(244,197,121,.45)';x.lineWidth=2;
      x.beginPath();x.arc(sw/2,cy,86,0,Math.PI*2);x.stroke();
      x.strokeStyle='rgba(244,197,121,.22)';x.lineWidth=1;
      x.beginPath();x.arc(sw/2,cy,112,0,Math.PI*2);x.stroke();
      var og=x.createRadialGradient(sw/2-8,cy-8,0,sw/2,cy,30);
      og.addColorStop(0,'#fff4e0');og.addColorStop(.6,'#f4c579');og.addColorStop(1,'#c2812a');
      x.fillStyle=og;x.beginPath();x.arc(sw/2,cy,30,0,Math.PI*2);x.fill();
      x.textAlign='center';
      x.fillStyle='#c0ae92';x.font='500 28px '+SANS;
      x.fillText('配图待生成',sw/2,cy+190);
      x.fillStyle='rgba(143,127,104,.75)';x.font='400 22px '+SANS;
      x.fillText(m.slug?m.slug+'.webp':'',sw/2,cy+228);
      x.textAlign='left';
      heroFade();
    }
    function drawText(){
      var TOP=HERO+40;
      x.textAlign='left';
      x.shadowColor='rgba(0,0,0,.55)';x.shadowBlur=8;x.shadowOffsetY=2;
      /* 大洲行：左「文明·大洲」，右「经纬度」 */
      x.fillStyle='#e8a33d';x.font='600 27px '+SANS;
      x.fillText(m.civ+' · '+regionName(m.region),P,TOP);
      x.textAlign='right';
      x.fillStyle='#8f7f68';x.font='400 23px '+SANS;
      x.fillText('纬度 '+m.lat.toFixed(1)+'°  经度 '+m.lon.toFixed(1)+'°',sw-P,TOP);
      /* 菜名 */
      x.textAlign='left';
      x.fillStyle='#f8f1e2';x.font='600 72px '+SERIF;
      x.fillText(m.name,P,TOP+74);
      /* 味型 · 热量 */
      x.fillStyle='#d3a75f';x.font='500 27px '+SANS;
      x.fillText(tasteProfile(m.taste)+'　·　'+(m.kcal||'?')+' 千卡',P,TOP+126);
      /* 故事：最多三行，超出截断加省略号 */
      x.fillStyle='#e9dfcc';x.font='32px '+SERIF;
      var lines=wrap(m.story,'32px '+SERIF,W);
      if(lines.length>3){lines=lines.slice(0,3);lines[2]=lines[2].slice(0,-1)+'…';}
      var y=TOP+184,lh=47;
      for(var i=0;i<lines.length;i++){x.fillText(lines[i],P,y);y+=lh;}
      var lastBaseline=y-lh;
      /* 食材行 */
      if(m.ingredients&&m.ingredients.length){
        var igy=lastBaseline+52;
        x.font='500 26px '+SANS;
        x.fillStyle='#d3a75f';x.fillText('食材',P,igy);
        x.fillStyle='#b3a086';x.fillText(' · '+m.ingredients.join('、'),P+x.measureText('食材').width,igy);
        lastBaseline=igy;
      }
      /* 标签：一行胶囊，超出换行 */
      x.shadowBlur=0;x.shadowOffsetY=0;
      x.font='500 24px '+SANS;
      var tx=P,ty=lastBaseline+34;
      for(var ti=0;ti<m.tags.length;ti++){
        var tag=m.tags[ti],tw=x.measureText(tag).width+32;
        if(tx+tw>sw-P&&tx>P){tx=P;ty+=44+12;}
        x.fillStyle='rgba(232,163,61,.13)';x.fillRect(tx,ty,tw,44);
        x.strokeStyle='rgba(232,163,61,.45)';x.lineWidth=1.5;x.strokeRect(tx+0.75,ty+0.75,tw-1.5,42.5);
        x.fillStyle='#e8a33d';x.fillText(tag,tx+16,ty+30);
        tx+=tw+14;
      }
      /* 页脚：分隔线 + 左中文品牌 / 右英文品牌 */
      x.strokeStyle='rgba(232,163,61,.22)';x.lineWidth=1;
      x.beginPath();x.moveTo(P,1352);x.lineTo(sw-P,1352);x.stroke();
      x.fillStyle='#e8a33d';x.font='600 27px '+SERIF;
      x.fillText('世界美食图鉴',P,1398);
      x.textAlign='right';
      x.fillStyle='#8f7f68';x.font='500 20px '+SANS;
      x.fillText('WORLD FOOD ATLAS',sw-P,1397);
      x.textAlign='left';
      onDone(c.toDataURL('image/jpeg',0.92));
    }
    drawBg();
    if(m.img&&IMG_OK[idx]===true){
      var im=new Image();
      im.onload=function(){
        var s=Math.max(sw/im.width,HERO/im.height),dw=im.width*s,dh=im.height*s;
        x.save();x.beginPath();x.rect(0,0,sw,HERO);x.clip();
        x.drawImage(im,(sw-dw)/2,(HERO-dh)/2,dw,dh);
        x.restore();
        heroFade();drawText();
      };
      im.onerror=function(){drawPlaceholder();drawText();};
      im.src=m.img;
    }else{drawPlaceholder();drawText();}
  }
  function shareToXhs(idx){
    var m=FOODS[idx];
    var miniTool=window.xhs&&window.xhs.miniTool;
    if(!miniTool){
      drawShareCard(idx,m,function(){
        alert('当前环境未注入小红书端能力，请在小红书 App 内打开本工具使用分享功能。');
      });
      return;
    }
    var orig=cShareBtn.textContent;
    cShareBtn.textContent='生成中…';cShareBtn.disabled=true;
    drawShareCard(idx,m,function(dataUrl){
      var content='【'+m.civ+'·'+m.name+'】\n'+m.story+'\n\n';
      if(m.ingredients&&m.ingredients.length)content+='食材：'+m.ingredients.join('、')+'\n\n';
      content+='味型：'+tasteProfile(m.taste)+'  ·  热量 '+(m.kcal||'?')+' 千卡\n';
      content+='纬度 '+m.lat.toFixed(1)+'°  经度 '+m.lon.toFixed(1)+'°';
      content+='\n—— 世界美食图鉴 · WORLD FOOD ATLAS';
      if(content.length>1000)content=content.slice(0,997)+'…';
      var title=(m.name+' · '+m.civ).slice(0,20);
      miniTool.writeTempFile({data:dataUrl}).then(function(r){
        return miniTool.postNote({title:title,content:content,pageType:'photo_publish',mediaInfo:{image_resources:[{url:r.filePath}]}});
      }).then(function(){
        cShareBtn.textContent=orig;cShareBtn.disabled=false;
      }).catch(function(err){
        cShareBtn.textContent=orig;cShareBtn.disabled=false;
        alert('分享失败：'+(err&&err.errMsg||'未知错误'));
      });
    });
  }
  cShareBtn.addEventListener('click',function(){if(selIdx>=0)shareToXhs(selIdx);});

  /* ===== 地域筛选 tabs ===== */
  var tabsEl=document.getElementById('tabs');
  var dDragged=false;
  function buildTabs(){
    tabsEl.innerHTML='';
    for(var i=0;i<REGIONS.length;i++){
      var r=REGIONS[i];
      var b=document.createElement('button');
      var dot=document.createElement('span');
      dot.className='dot';dot.style.background=r.color||'#f5ebd8';
      b.appendChild(dot);
      b.appendChild(document.createTextNode(r.name));
      b.setAttribute('data-r',r.id);
      if(r.id==='all')b.classList.add('on');
      b.addEventListener('click',function(rid,rlat,rlon,btn){return function(){
        if(dDragged){dDragged=false;return;}
        curRegion=rid;
        var btns=tabsEl.querySelectorAll('button');
        for(var k=0;k<btns.length;k++)btns[k].classList.toggle('on',btns[k].getAttribute('data-r')===rid);
        try{btn.scrollIntoView({behavior:'smooth',inline:'center',block:'nearest'});}catch(_){btn.scrollIntoView(true);}
        if(rid!=='all')aimLatLon(rlat,rlon);
        clearSelection();
      };}(r.id,r.lat,r.lon,b));
      tabsEl.appendChild(b);
    }
    tabsFade();
  }
  buildTabs();
  tabsEl.addEventListener('wheel',function(e){
    if(Math.abs(e.deltaX)>Math.abs(e.deltaY))return;
    e.preventDefault();
    tabsEl.scrollLeft+=e.deltaY;
  },{passive:false});
  var tDown=false,tX=0;
  tabsEl.addEventListener('pointerdown',function(e){
    if(e.pointerType!=='mouse')return;
    tDown=true;tX=e.clientX;dDragged=false;
  });
  tabsEl.addEventListener('pointermove',function(e){
    if(!tDown)return;
    var dx=e.clientX-tX;
    if(Math.abs(dx)>4){dDragged=true;tabsEl.setPointerCapture(e.pointerId);}
    if(dDragged){tabsEl.scrollLeft-=dx;tX=e.clientX;}
  });
  function tEnd(){tDown=false;}
  tabsEl.addEventListener('pointerup',tEnd);
  tabsEl.addEventListener('pointercancel',tEnd);
  function tabsFade(){tabsEl.classList.toggle('scrollable',tabsEl.scrollWidth>tabsEl.clientWidth+1);}
  tabsEl.addEventListener('scroll',function(){tabsEl.classList.add('scrollable');});
  addEventListener('resize',tabsFade);setTimeout(tabsFade,400);

  /* ===== 完整清单：35 道美食一览，按大洲分列（左上按钮开合）===== */
  var listWrap=document.getElementById('listWrap');
  var listScroll=document.getElementById('listScroll');
  var listRows=[];
  var listOpen=false;
  function mkEl(tag,cls,txt){var e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.appendChild(document.createTextNode(txt));return e;}
  function buildList(){
    listScroll.innerHTML='';
    listRows=[];
    var total=0,r,i;
    for(r=0;r<REGIONS.length;r++){
      var reg=REGIONS[r];
      if(reg.id==='all')continue;
      var idxs=[];
      for(i=0;i<FOODS.length;i++)if(FOODS[i].region===reg.id)idxs.push(i);
      if(!idxs.length)continue;
      var grp=mkEl('div','grp');
      grp.setAttribute('data-r',reg.id);
      var h=mkEl('h4'),di=mkEl('i');
      di.style.background=reg.color||'#f5ebd8';
      h.appendChild(di);
      h.appendChild(document.createTextNode(reg.name));
      h.appendChild(mkEl('em',null,idxs.length+' 道'));
      grp.appendChild(h);
      for(i=0;i<idxs.length;i++){
        var idx=idxs[i],m=FOODS[idx];
        var it=document.createElement('button');
        it.type='button';it.className='item';
        var th=mkEl('div','th');
        if(m.img){
          var im=document.createElement('img');
          im.alt='';
          (function(cell,img){img.onerror=function(){img.style.display='none';cell.className='th bad';};})(th,im);
          im.src=m.img;
          th.appendChild(im);
        }else th.className='th bad';
        th.appendChild(mkEl('b'));
        it.appendChild(th);
        var tx=mkEl('div','tx');
        tx.appendChild(mkEl('div','nm',m.name));
        var mt=mkEl('div','mt');
        mt.appendChild(document.createTextNode(m.civ+' · '));
        mt.appendChild(mkEl('span','k',tasteProfile(m.taste)+' · '+(m.kcal||'?')+'千卡'));
        tx.appendChild(mt);
        it.appendChild(tx);
        it.addEventListener('click',(function(x){return function(){openList(false);selectMarker(x);};})(idx));
        grp.appendChild(it);
        listRows[idx]=it;
        total++;
      }
      listScroll.appendChild(grp);
    }
    var cnt=document.getElementById('listCnt');
    if(cnt)cnt.textContent=total+' 道';
    syncList();
  }
  function syncList(){
    for(var i=0;i<FOODS.length;i++){
      var el=listRows[i];if(!el)continue;
      var cls='item';
      if(i===selIdx)cls+=' on';
      if(curRegion!=='all'&&FOODS[i].region!==curRegion)cls+=' dim';
      if(el.className!==cls)el.className=cls;
    }
  }
  function openList(v){
    listOpen=!!v;
    if(v){syncList();openSheet(false);}
    listWrap.className=v?'listwrap show':'listwrap';
    listWrap.setAttribute('aria-hidden',v?'false':'true');
  }
  document.getElementById('listBtn').addEventListener('click',function(){openList(!listOpen);});
  document.getElementById('lClose').addEventListener('click',function(){openList(false);});
  addEventListener('keydown',function(e){if(listOpen&&(e.key==='Escape'||e.keyCode===27))openList(false);});
  buildList();

  /* ===== 设置 ===== */
  var autoSpin=true,showStars=true,showClouds=true,showLabel=true;
  function bind(id,fn){var el=document.getElementById(id);el.addEventListener('click',function(){el.classList.toggle('on');fn(el.classList.contains('on'));});}
  bind('swSpin',function(v){autoSpin=v;});
  bind('swStars',function(v){showStars=v;stars.visible=v;sky.visible=v;});
  bind('swClouds',function(v){showClouds=v;clouds.visible=v;});
  bind('swLabel',function(v){showLabel=v;});
  document.getElementById('bReset').addEventListener('click',function(){aimLatLon(HOME_LAT,HOME_LON);radiusG=fitR();userZoomed=false;clearSelection();});
  document.getElementById('bTop').addEventListener('click',function(){phiG=0.02;});
  var sheet=document.getElementById('sheet'),scrim=document.getElementById('scrim');
  function openSheet(v){sheet.classList.toggle('show',v);scrim.classList.toggle('show',v);}
  document.getElementById('gear').addEventListener('click',function(){openSheet(true);});
  document.getElementById('sClose').addEventListener('click',function(){openSheet(false);});
  scrim.addEventListener('click',function(){openSheet(false);});

  /* ===== 标记点显隐、呼吸与脉冲 ===== */
  var _v=new THREE.Vector3(),_n=new THREE.Vector3(),_d=new THREE.Vector3();
  function refreshMarkers(t){
    var mkScale=Math.max(0.6,Math.min(2.2,radius/REF_DIST));
    for(var i=0;i<markers.length;i++){
      var m=markers[i];
      m.grp.scale.setScalar(mkScale);
      var sel=(i===selIdx);
      var inVal=(curRegion==='all'||m.food.region===curRegion);
      var dim=(!sel&&!inVal);
      m.sel=sel;m.dim=dim;
      _v.setFromMatrixPosition(m.grp.matrixWorld);_v.project(camera);
      m.grp.getWorldPosition(_n);
      _d.copy(camera.position).sub(_n).normalize();_n.normalize();
      var facing=_n.dot(_d);
      var front=(_v.z<1)&&(facing>=0.16);
      m.front=front;
      var show=front&&(sel||inVal);
      m.contour.visible=show;m.halo.visible=show;m.core.visible=show;m.ring.visible=show;
      var fade=front?Math.max(0,Math.min(1,(facing-0.16)/0.24)):0;
      m.fade=fade;
      if(!show)continue;
      var pulse=0.5+0.5*Math.sin(t*2.4+i*0.7);
      if(sel){
        m.halo.material.color.copy(GOLD_COL);
        m.core.material.color.copy(GOLD_COL);
        m.ring.material.color.copy(GOLD_COL);
        m.halo.scale.set(0.3*(1+.08*pulse),0.3*(1+.08*pulse),1);
        m.core.scale.set(0.115,0.115,1);
        m.contour.scale.set(0.26,0.26,1);
        m.ring.scale.set(MK_RING_SEL,MK_RING_SEL,1);
        m.halo.material.opacity=(.62+.14*pulse)*fade;
        m.core.material.opacity=1*fade;
        m.contour.material.opacity=.9*fade;
        m.ring.material.opacity=1*fade;
      }else if(dim){
        m.halo.material.color.copy(DIM_COL);
        m.core.material.color.copy(DIM_COL);
        m.ring.material.color.copy(DIM_COL);
        m.halo.scale.set(0.14,0.14,1);
        m.core.scale.set(0.05,0.05,1);
        m.contour.scale.set(0.13,0.13,1);
        m.ring.scale.set(0.14,0.14,1);
        m.halo.material.opacity=.26*fade;
        m.core.material.opacity=.7*fade;
        m.contour.material.opacity=.4*fade;
        m.ring.material.opacity=.22*fade;
      }else{
        m.halo.material.color.copy(m.cHalo);
        m.core.material.color.copy(m.cCore);
        m.ring.material.color.copy(m.cRing);
        m.halo.scale.set(MK_HALO*(1+.12*pulse),MK_HALO*(1+.12*pulse),1);
        m.core.scale.set(MK_CORE*(1+.06*pulse),MK_CORE*(1+.06*pulse),1);
        m.contour.scale.set(MK_CONTOUR,MK_CONTOUR,1);
        m.ring.scale.set(MK_RING,MK_RING,1);
        m.halo.material.opacity=(.42+.14*pulse)*fade;
        m.core.material.opacity=1*fade;
        m.contour.material.opacity=.6*fade;
        m.ring.material.opacity=.46*fade;
      }
    }
    var sm=(selIdx>=0)?markers[selIdx]:null;
    if(sm&&sm.front&&sm.ring.visible){
      var k=(t%1.8)/1.8,ps=MK_RING_SEL*(1+k*1.7)*mkScale;
      ping.position.copy(sm.grp.position);
      ping.scale.set(ps,ps,1);
      ping.material.color.copy(GOLD_COL);
      ping.material.opacity=(1-k)*(1-k)*.75*sm.fade;
      ping.visible=true;
    }else ping.visible=false;
  }

  /* ===== 标签投影：所有朝向镜头的标记都挂名牌 ===== */
  var tagPool=[],tagCand=[];
  (function initTags(){
    for(var i=0;i<FOODS.length;i++){
      var el=document.createElement('div');el.className='tag';el.style.opacity='0';
      var cs=(REG_COL[FOODS[i].region]||DAWN_COL).getStyle();
      var d=document.createElement('i');
      d.style.background=cs;
      el.style.borderColor=cs.replace('rgb(','rgba(').replace(')',',.5)');
      el.appendChild(d);
      el.appendChild(document.createTextNode(FOODS[i].civ+'·'+FOODS[i].name));
      (function(idx){
        el.addEventListener('click',function(){
          if(!tagPool[idx].on)return;
          selectMarker(idx);
        });
      })(i);
      document.body.appendChild(el);
      tagPool.push({el:el,w:0,h:0,on:false,o:0});
    }
  })();
  function updateTags(){
    var i,show=showLabel;
    tagCand.length=0;
    if(show){
      for(i=0;i<markers.length;i++){
        var m=markers[i];
        if(!m.front||m.dim||!m.core.visible)continue;
        _v.setFromMatrixPosition(m.grp.matrixWorld);_v.project(camera);
        tagCand.push({i:i,x:(_v.x*0.5+0.5)*W,y:(-_v.y*0.5+0.5)*H,f:m.fade,sel:m.sel});
      }
      tagCand.sort(function(a,b){return (b.sel?1:0)-(a.sel?1:0)||(b.f-a.f);});
    }
    for(i=0;i<tagPool.length;i++)tagPool[i].on=false;
    var placed=[];
    for(i=0;i<tagCand.length;i++){
      var c=tagCand[i],t=tagPool[c.i],el=t.el;
      if(!t.w){t.w=el.offsetWidth||96;t.h=el.offsetHeight||22;}
      var rx=c.x-t.w/2-3,ry=c.y-t.h*1.4-3,rw=t.w+6,rh=t.h+6,ok=true;
      for(var j=0;j<placed.length;j++){
        var p=placed[j];
        if(rx<p.x+p.w&&p.x<rx+rw&&ry<p.y+p.h&&p.y<ry+rh){ok=false;break;}
      }
      if(!ok)continue;
      placed.push({x:rx,y:ry,w:rw,h:rh});
      t.on=true;
      var o=c.sel?1:Math.min(1,c.f*1.15);
      el.style.left=c.x.toFixed(1)+'px';el.style.top=c.y.toFixed(1)+'px';
      if(Math.abs(o-t.o)>0.02){el.style.opacity=o.toFixed(2);t.o=o;}
      if(c.sel!==(el.className.indexOf('on')>=0))el.className=c.sel?'tag on':'tag';
    }
    for(i=0;i<tagPool.length;i++){
      var q=tagPool[i];
      if(!q.on&&q.o!==0){q.el.style.opacity='0';q.o=0;q.el.className='tag';}
      q.el.style.pointerEvents=q.on?'auto':'none';
    }
  }

  /* ===== 动画 ===== */
  var clock=new THREE.Clock();
  var running=true,perfAccum=0,perfCount=0,dprStep=DPR;
  var eSpin=0.3;
  var EARTH_SPIN=0.06;
  mainSpin.rotation.y=eSpin;
  aimLatLon(HOME_LAT,HOME_LON);
  theta=thetaG;phi=phiG;
  function animate(){
    if(!running)return;
    requestAnimationFrame(animate);
    var dt=clock.getDelta(),t=performance.now()*0.001;
    if(autoSpin && selIdx<0 && curRegion==='all'){
      eSpin+=dt*EARTH_SPIN;
      mainSpin.rotation.y=eSpin;
      clouds.rotation.y=eSpin*1.1;
    }
    stars.rotation.y+=dt*0.0016;sky.rotation.y+=dt*0.0016;
    theta+=(thetaG-theta)*0.12;phi+=(phiG-phi)*0.12;radius+=(radiusG-radius)*0.1;pan+=(panG-pan)*0.12;
    camPos();
    astroUpdate();
    refreshMarkers(t);
    renderer.render(scene,camera);
    updateTags();
    tickNowInfo(t);
    perfAccum+=dt;perfCount++;
    if(perfCount>=30){var avg=perfAccum/perfCount;perfAccum=0;perfCount=0;if(avg>0.04&&dprStep>1){dprStep=Math.max(1,dprStep-0.25);renderer.setPixelRatio(dprStep);renderer.setSize(W,H,false);}}
  }
  addEventListener('resize',function(){
    W=innerWidth;H=innerHeight;camera.aspect=W/H;camera.updateProjectionMatrix();renderer.setSize(W,H,false);
    if(!userZoomed)radiusG=fitR();
    for(var i=0;i<tagPool.length;i++){tagPool[i].w=0;tagPool[i].h=0;}
  });
  addEventListener('visibilitychange',function(){if(document.hidden){running=false;}else if(!running){running=true;clock.getDelta();animate();}});
  cv.addEventListener('webglcontextlost',function(e){e.preventDefault();running=false;document.getElementById('loader').classList.add('hide');document.getElementById('fallback').classList.add('show');},false);

  animate();
  setTimeout(function(){document.getElementById('loader').classList.add('hide');},600);
  setTimeout(function(){var tp=document.getElementById('tip');tp.classList.add('show');setTimeout(function(){tp.classList.remove('show');},3800);},1400);
})();
