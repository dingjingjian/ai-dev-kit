(function(){
  var cv=document.getElementById('stage');
  var gl=null;try{gl=cv.getContext('webgl2')||cv.getContext('webgl')}catch(e){}
  if(!gl||typeof THREE==='undefined'){document.getElementById('fallback').classList.add('show');document.getElementById('loader').classList.add('hide');return;}

  var W=innerWidth,H=innerHeight,DPR=Math.min(devicePixelRatio||1,1.5);
  var renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(DPR);renderer.setSize(W,H,false);
  renderer.outputEncoding=THREE.sRGBEncoding;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.05;

  var scene=new THREE.Scene();
  var camera=new THREE.PerspectiveCamera(50,W/H,0.1,5000);
  var R=1.6;

  /* ===== 背景星空天球（程序化银河贴图，偏靛蓝月夜）===== */
  function starfieldTex(){
    var w=2048,h=1024,c=document.createElement('canvas');c.width=w;c.height=h;var x=c.getContext('2d');
    var bg=x.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#040814');bg.addColorStop(.5,'#080d1c');bg.addColorStop(1,'#040814');
    x.fillStyle=bg;x.fillRect(0,0,w,h);
    x.save();x.translate(w/2,h/2);x.rotate(-0.4);x.translate(-w/2,-h/2);
    for(var i=0;i<22;i++){var px=Math.random()*w,py=h/2+(Math.random()-0.5)*h*0.3,r=80+Math.random()*180;
      var gg=x.createRadialGradient(px,py,0,px,py,r),hue=Math.random(),c1=hue<.5?'rgba(120,140,220,':'rgba(200,170,120,';
      gg.addColorStop(0,c1+(0.04+Math.random()*.05)+')');gg.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=gg;x.fillRect(0,0,w,h);}
    for(var i=0;i<4000;i++){var px=Math.random()*w,py=h/2+(Math.random()-0.5)*h*0.32;
      var d=Math.abs(py-h/2)/(h*0.16),b=(1-d*d)*(.3+Math.random()*.6);if(b<=0)continue;
      x.fillStyle='rgba(255,255,255,'+b+')';x.fillRect(px,py,1,1);}
    x.restore();
    for(var i=0;i<3800;i++){var px=Math.random()*w,py=Math.random()*h,b=.15+Math.random()*.5;
      x.fillStyle='rgba(255,255,255,'+b+')';x.fillRect(px,py,1,1);}
    for(var i=0;i<200;i++){var px=Math.random()*w,py=Math.random()*h,b=.82+Math.random()*.18;
      x.fillStyle='rgba(255,255,255,'+b+')';x.fillRect(px,py,1,1);}
    var t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return t;
  }
  var sky=new THREE.Mesh(new THREE.SphereGeometry(3500,48,32),new THREE.MeshBasicMaterial({map:starfieldTex(),side:THREE.BackSide,depthWrite:false}));
  scene.add(sky);

  /* ===== 光照 =====
   * 阳光跟随相机：方向光的方位始终与视线保持约 35° 夹角，
   * 这样飞到任何一个大洲，朝向我们的这一面都是白天（不会再"前面总是黑的"），
   * 同时保留一条晨昏线，昼夜交界仍在。
   */
  var ambient=new THREE.AmbientLight(0x2a3458,0.55);scene.add(ambient);
  var sunLight=new THREE.DirectionalLight(0xfff2d8,1.75);scene.add(sunLight);
  var fillLight=new THREE.DirectionalLight(0x6a7fb0,0.32);scene.add(fillLight);
  var SUN_YAW=0.62,SUN_LIFT=0.2,SUN_DIST=40;
  function updateSun(){
    var p=camera.position,len=p.length()||1;
    var ux=p.x/len,uy=p.y/len,uz=p.z/len;
    var c=Math.cos(SUN_YAW),s=Math.sin(SUN_YAW);
    var dx=ux*c-uz*s,dz=ux*s+uz*c;
    var dy=Math.max(-0.5,Math.min(0.75,uy+SUN_LIFT));
    sunLight.position.set(dx*SUN_DIST,dy*SUN_DIST,dz*SUN_DIST);
    fillLight.position.set(-dx*SUN_DIST,(-dy+0.12)*SUN_DIST,-dz*SUN_DIST);
  }

  /* ===== 工具纹理 ===== */
  function radialTex(c0,c1,c2){
    var c=document.createElement('canvas');c.width=c.height=128;var x=c.getContext('2d'),g=x.createRadialGradient(64,64,0,64,64,64);
    g.addColorStop(0,c0);g.addColorStop(.4,c1);g.addColorStop(1,c2);x.fillStyle=g;x.fillRect(0,0,128,128);
    return new THREE.CanvasTexture(c);
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
  var earthMat=new THREE.MeshStandardMaterial({map:plainTex('#1a2a4a'),roughness:.85,metalness:.04});
  var earthMesh=new THREE.Mesh(new THREE.SphereGeometry(R,48,32),earthMat);mainSpin.add(earthMesh);
  var cloudMat=new THREE.MeshStandardMaterial({map:plainTex('#ffffff'),transparent:true,alphaMap:plainTex('#ffffff'),opacity:.5,roughness:1,depthWrite:false});
  var clouds=new THREE.Mesh(new THREE.SphereGeometry(R*1.012,48,32),cloudMat);mainTilt.add(clouds);
  var atmo=new THREE.Mesh(new THREE.SphereGeometry(R*1.06,48,32),new THREE.MeshBasicMaterial({color:0x4a6db5,side:THREE.BackSide,transparent:true,opacity:.22,blending:THREE.AdditiveBlending,depthWrite:false}));
  mainTilt.add(atmo);

  /* ===== 月亮（参考 earth-3d 的地月系统：贴图月球 + 公转轨道）=====
   * 轨道半径 3.0、月球半径 0.36，与相机默认取景配合，保证在地月同框范围内。
   */
  var MOON_R=0.36,MOON_ORBIT=3.0,MOON_SPEED=0.16;
  var moonSys=new THREE.Group();scene.add(moonSys);
  var moonOrbit=new THREE.Group();moonSys.add(moonOrbit);
  var moonMat=new THREE.MeshStandardMaterial({map:plainTex('#c9c9c6'),roughness:.95,metalness:0});
  var moon=new THREE.Mesh(new THREE.SphereGeometry(MOON_R,32,32),moonMat);
  moon.position.set(MOON_ORBIT,0,0);moonOrbit.add(moon);
  var moonGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:radialTex('rgba(226,232,245,.18)','rgba(170,185,215,.05)','rgba(170,185,215,0)'),blending:THREE.AdditiveBlending,transparent:true,depthWrite:false}));
  moonGlow.scale.set(MOON_R*5.2,MOON_R*5.2,1);moon.add(moonGlow);
  var moonOrbitLine=(function(){
    var n=160,pos=new Float32Array((n+1)*3);
    for(var i=0;i<=n;i++){var a=i/n*Math.PI*2;pos[i*3]=Math.cos(a)*MOON_ORBIT;pos[i*3+1]=0;pos[i*3+2]=-Math.sin(a)*MOON_ORBIT;}
    var g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));
    return new THREE.Line(g,new THREE.LineBasicMaterial({color:0x8fa4c0,transparent:true,opacity:.35}));
  })();
  moonSys.add(moonOrbitLine);
  var moonAngle=Math.PI*0.35;

  /* ===== 神话标记点 ===== */
  var markerGroup=new THREE.Group();mainSpin.add(markerGroup);
  var glowTex=radialTex('rgba(232,236,245,.95)','rgba(180,200,240,.4)','rgba(160,180,220,0)');
  var ringTex=radialTex('rgba(232,236,245,.7)','rgba(180,200,240,.22)','rgba(160,180,220,0)');
  var goldGlowTex=radialTex('rgba(255,235,170,.98)','rgba(212,182,106,.5)','rgba(180,150,80,0)');
  var goldRingTex=radialTex('rgba(255,225,150,.8)','rgba(212,182,106,.3)','rgba(180,150,80,0)');
  var MOON_COL=new THREE.Color('#e8ecf5');
  var GOLD_COL=new THREE.Color('#d4b66a');
  var DIM_COL=new THREE.Color('#5a6a8a');
  var markers=[];
  (function buildMarkers(){
    for(var i=0;i<MYTHS.length;i++){
      var m=MYTHS[i];
      var grp=new THREE.Group();
      grp.position.copy(ll2v(m.lat,m.lon,R*1.012));
      grp.lookAt(0,0,0);grp.rotateX(Math.PI);
      var dot=new THREE.Mesh(new THREE.SphereGeometry(0.05,14,14),new THREE.MeshBasicMaterial({color:MOON_COL.clone(),transparent:true,opacity:.95}));
      var glow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,depthTest:false,color:MOON_COL.clone()}));
      glow.scale.set(0.42,0.42,1);
      var ring=new THREE.Sprite(new THREE.SpriteMaterial({map:ringTex,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,depthTest:false,color:MOON_COL.clone(),opacity:.85}));
      ring.scale.set(0.66,0.66,1);
      var hit=new THREE.Mesh(new THREE.SphereGeometry(0.16,10,10),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,depthTest:false}));
      grp.add(dot);grp.add(glow);grp.add(ring);grp.add(hit);
      markerGroup.add(grp);
      markers.push({myth:m,grp:grp,dot:dot,glow:glow,ring:ring,hit:hit,sel:false,dim:false,front:false});
    }
  })();

  /* ===== 星空点 ===== */
  var stars=(function(){
    var n=3200,geo=new THREE.BufferGeometry(),pos=new Float32Array(n*3),col=new Float32Array(n*3);
    for(var i=0;i<n;i++){var u=Math.random()*2-1,v=Math.random()*6.2832,s=Math.sqrt(1-u*u),Rr=1000+Math.random()*600;
      pos[i*3]=Rr*s*Math.cos(v);pos[i*3+1]=Rr*u;pos[i*3+2]=Rr*s*Math.sin(v);
      var b=.25+Math.random()*.75,t=Math.random();
      if(t<.18){col[i*3]=b*.75;col[i*3+1]=b*.82;col[i*3+2]=b;}
      else if(t<.28){col[i*3]=b;col[i*3+1]=b*.9;col[i*3+2]=b*.72;}
      else{col[i*3]=b;col[i*3+1]=b;col[i*3+2]=b;}}
    geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    geo.setAttribute('color',new THREE.BufferAttribute(col,3));
    var p=new THREE.Points(geo,new THREE.PointsMaterial({size:0.5,sizeAttenuation:true,vertexColors:true,transparent:true,opacity:.9,depthWrite:false}));
    scene.add(p);return p;
  })();

  /* ===== 纹理加载（容错）===== */
  var loader=new THREE.TextureLoader();loader.setCrossOrigin('anonymous');
  var maxA=renderer.capabilities.getMaxAnisotropy();
  function load(u,ok){loader.load(u,ok,undefined,function(){});}
  load('./assets/earth.jpg',function(t){t.encoding=THREE.sRGBEncoding;t.anisotropy=maxA;earthMat.map=t;earthMat.needsUpdate=true;});
  load('./assets/clouds.png',function(t){t.anisotropy=maxA;cloudMat.map=t;cloudMat.alphaMap=t;cloudMat.needsUpdate=true;});
  load('./assets/moon.jpg',function(t){t.encoding=THREE.sRGBEncoding;t.anisotropy=maxA;moonMat.map=t;moonMat.needsUpdate=true;});

  /* ===== 相机 =====
   * 取景系数 2.2（原 1.9）：略微拉远，让月球轨道也落在画面内，地月同框。
   */
  function fitR(){var vFov=camera.fov*Math.PI/180;var hFov=2*Math.atan(Math.tan(vFov/2)*camera.aspect);return Math.max(4,2.2*R/Math.tan(hFov/2));}
  var theta=0.6,phi=1.15,radius=fitR();
  var thetaG=theta,phiG=phi,radiusG=radius,userZoomed=false;
  var R_MIN=2.2,R_MAX=26;
  function camPos(){var sp=Math.sin(phi);
    camera.position.set(radius*sp*Math.sin(theta),radius*Math.cos(phi),radius*sp*Math.cos(theta));
    camera.lookAt(0,0,0);
    updateSun();
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
    var m=markers[i];
    var local=ll2v(m.myth.lat,m.myth.lon,1);
    var e=mainSpin.rotation.y,cs=Math.cos(e),sn=Math.sin(e);
    var wx=local.x*cs+local.z*sn,wy=local.y,wz=-local.x*sn+local.z*cs;
    var len=Math.hypot(wx,wy,wz)||1;
    phiG=Math.acos(Math.max(-1,Math.min(1,wy/len)));
    thetaG=shortAngle(theta,Math.atan2(wx,wz));
    if(!userZoomed)radiusG=fitR()*0.82;
    showCard(i);
  }
  function clearSelection(){
    selIdx=-1;
    if(!userZoomed)radiusG=fitR();
    hideCard();
  }

  /* ===== 神话卡片 ===== */
  var cardEl=document.getElementById('card');
  var picEl=document.getElementById('cPic');
  var picFileEl=document.getElementById('cPicFile');
  /* 配图预检：IMG_OK[i] true 有图 / false 无图或加载失败 / null 检测中。
   * 缺图一律回退到 index.html 里 .pic 的程序化占位，不出现空白块、不改动卡片尺寸，
   * 因此配图可以分批补，不必等 14 张齐了再上线（契约见 docs/配图提示词.md）。 */
  var IMG_OK={};
  MYTHS.forEach(function(m,i){
    if(!m.img){IMG_OK[i]=false;return;}
    IMG_OK[i]=null;
    var im=new Image();
    im.onload=function(){IMG_OK[i]=true;if(selIdx===i)showCard(i);};
    im.onerror=function(){IMG_OK[i]=false;};
    im.src=m.img;
  });
  // 2.6s 仍未就绪的按缺图处理：先给占位，不让卡片空等
  setTimeout(function(){
    for(var i=0;i<MYTHS.length;i++)if(MYTHS[i].img&&IMG_OK[i]===null){IMG_OK[i]=false;if(selIdx===i)showCard(i);}
  },2600);
  function applyPic(m,i){
    var ok=!!(m.img&&IMG_OK[i]===true);
    picEl.className=ok?'pic has':'pic';
    if(ok)picEl.style.backgroundImage="url('"+m.img+"')";else picEl.style.backgroundImage='';
    picFileEl.textContent=m.slug?m.slug+'.webp':'';
  }
  function showCard(i){
    var m=MYTHS[i];
    document.getElementById('cCiv').textContent=m.civ+' · '+regionName(m.region);
    document.getElementById('cName').textContent=m.name;
    applyPic(m,i);
    document.getElementById('cStory').textContent=m.story;
    document.getElementById('cTags').innerHTML=m.tags.map(function(t){return '<span>'+t+'</span>';}).join('');
    document.getElementById('cLoc').textContent='纬度 '+m.lat.toFixed(1)+'°  经度 '+m.lon.toFixed(1)+'°';
    cardEl.classList.add('show');
  }
  function hideCard(){cardEl.classList.remove('show');}
  document.getElementById('cClose').addEventListener('click',clearSelection);

  function regionName(id){
    for(var i=0;i<REGIONS.length;i++)if(REGIONS[i].id===id)return REGIONS[i].name;
    return '';
  }

  /* ===== 区域筛选 tabs ===== */
  var curRegion='all';
  var tabsEl=document.getElementById('tabs');
  var dDragged=false;
  (function buildTabs(){
    for(var i=0;i<REGIONS.length;i++){
      var r=REGIONS[i];
      var b=document.createElement('button');
      // 各大洲前的彩色提示点（同 solar-system-3d dock 的圆点）
      var dot=document.createElement('span');
      dot.className='dot';dot.style.background=r.color||'#e8ecf5';
      b.appendChild(dot);
      b.appendChild(document.createTextNode(r.name));
      b.setAttribute('data-r',r.id);
      if(r.id==='all')b.classList.add('on');
      b.addEventListener('click',function(rid,rlat,rlon,btn){return function(){
        if(dDragged){dDragged=false;return;}
        curRegion=rid;
        var btns=tabsEl.querySelectorAll('button');
        for(var k=0;k<btns.length;k++)btns[k].classList.toggle('on',btns[k].getAttribute('data-r')===rid);
        // 选中后把当前 tab 滚到可视区域居中（同 solar-system-3d dock 逻辑）
        try{btn.scrollIntoView({behavior:'smooth',inline:'center',block:'nearest'});}catch(_){btn.scrollIntoView(true);}
        if(rid!=='all'){
          var local=ll2v(rlat,rlon,1);
          var e=mainSpin.rotation.y,cs=Math.cos(e),sn=Math.sin(e);
          var wx=local.x*cs+local.z*sn,wy=local.y,wz=-local.x*sn+local.z*cs;
          var len=Math.hypot(wx,wy,wz)||1;
          phiG=Math.acos(Math.max(-1,Math.min(1,wy/len)));
          thetaG=shortAngle(theta,Math.atan2(wx,wz));
        }
        clearSelection();
      };}(r.id,r.lat,r.lon,b));
      tabsEl.appendChild(b);
    }
  })();
  // tabs 滚动：触摸端原生横滑（CSS touch-action:pan-x），桌面端滚轮横滚 + 鼠标拖拽
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
  addEventListener('resize',tabsFade);tabsFade();setTimeout(tabsFade,400);

  /* ===== 设置 ===== */
  var autoSpin=true,showStars=true,showClouds=true,showLabel=true,showMoon=true;
  function bind(id,fn){var el=document.getElementById(id);el.addEventListener('click',function(){el.classList.toggle('on');fn(el.classList.contains('on'));});}
  bind('swSpin',function(v){autoSpin=v;});
  bind('swStars',function(v){showStars=v;stars.visible=v;sky.visible=v;});
  bind('swClouds',function(v){showClouds=v;clouds.visible=v;});
  bind('swMoon',function(v){showMoon=v;moonSys.visible=v;});
  bind('swLabel',function(v){showLabel=v;});
  document.getElementById('bReset').addEventListener('click',function(){thetaG=0.6;phiG=1.15;radiusG=fitR();userZoomed=false;clearSelection();});
  document.getElementById('bTop').addEventListener('click',function(){phiG=0.02;});
  var sheet=document.getElementById('sheet'),scrim=document.getElementById('scrim');
  function openSheet(v){sheet.classList.toggle('show',v);scrim.classList.toggle('show',v);}
  document.getElementById('gear').addEventListener('click',function(){openSheet(true);});
  document.getElementById('sClose').addEventListener('click',function(){openSheet(false);});
  scrim.addEventListener('click',function(){openSheet(false);});

  /* ===== 标记点显隐与脉动 ===== */
  var _v=new THREE.Vector3(),_n=new THREE.Vector3(),_d=new THREE.Vector3();
  function refreshMarkers(t){
    for(var i=0;i<markers.length;i++){
      var m=markers[i];
      var sel=(i===selIdx);
      var inReg=(curRegion==='all'||m.myth.region===curRegion);
      var dim=(!sel&&!inReg);
      m.sel=sel;m.dim=dim;
      _v.setFromMatrixPosition(m.grp.matrixWorld);_v.project(camera);
      m.grp.getWorldPosition(_n);
      _d.copy(camera.position).sub(_n).normalize();_n.normalize();
      var front=(_v.z<1)&&(_n.dot(_d)>=0.18);
      m.front=front;
      m.glow.visible=front&&(sel||inReg);
      m.ring.visible=front&&(sel||inReg);
      m.dot.visible=front&&(sel||inReg);
      if(!front){continue;}
      var pulse=0.5+0.5*Math.sin(t*2.4+i*0.7);
      if(sel){
        var g=0.5*(1+0.4*pulse),r=0.78*(1+0.45*pulse);
        m.glow.material.color.copy(GOLD_COL);
        m.ring.material.color.copy(GOLD_COL);
        m.glow.material.map=goldGlowTex;m.ring.material.map=goldRingTex;
        m.glow.scale.set(g,g,1);m.ring.scale.set(r,r,1);
        m.dot.material.color.copy(GOLD_COL);
        m.dot.scale.setScalar(1.15);
      }else if(dim){
        m.glow.material.color.copy(DIM_COL);
        m.ring.material.color.copy(DIM_COL);
        m.glow.material.map=glowTex;m.ring.material.map=ringTex;
        m.glow.scale.set(0.22,0.22,1);m.ring.scale.set(0.34,0.34,1);
        m.dot.material.color.copy(DIM_COL);
        m.dot.scale.setScalar(0.5);
      }else{
        m.glow.material.color.copy(MOON_COL);
        m.ring.material.color.copy(MOON_COL);
        m.glow.material.map=glowTex;m.ring.material.map=ringTex;
        var g2=0.36*(1+0.22*pulse),r2=0.58*(1+0.28*pulse);
        m.glow.scale.set(g2,g2,1);m.ring.scale.set(r2,r2,1);
        m.dot.material.color.copy(MOON_COL);
        m.dot.scale.setScalar(0.85);
      }
    }
  }

  /* ===== 标签投影（选中或悬浮标记的名称）===== */
  var tagPool=[];
  function ensureTags(n){
    while(tagPool.length<n){
      var el=document.createElement('div');el.className='tag';el.style.opacity='0';
      document.body.appendChild(el);tagPool.push(el);
    }
  }
  function updateTags(){
    var need=showLabel?(selIdx>=0?1:0):0;
    ensureTags(1);
    var el=tagPool[0];
    if(need<1){el.style.opacity='0';return;}
    if(selIdx<0){el.style.opacity='0';return;}
    var m=markers[selIdx];
    if(!m.front){el.style.opacity='0';return;}
    _v.setFromMatrixPosition(m.grp.matrixWorld);_v.project(camera);
    el.style.left=((_v.x*0.5+0.5)*W).toFixed(1)+'px';
    el.style.top=((-_v.y*0.5+0.5)*H).toFixed(1)+'px';
    el.textContent=m.myth.civ+'·'+m.myth.name;
    el.style.opacity='1';
  }

  /* ===== 动画 ===== */
  var clock=new THREE.Clock();
  var running=true,perfAccum=0,perfCount=0,dprStep=DPR;
  var eSpin=0.3;
  var EARTH_SPIN=0.12;
  function animate(){
    if(!running)return;
    requestAnimationFrame(animate);
    var dt=clock.getDelta(),t=performance.now()*0.001;
    // 自转：选中某个神话点、或已切换到具体大洲时停转，方便细看
    if(autoSpin && selIdx<0 && curRegion==='all'){
      eSpin+=dt*EARTH_SPIN;
      mainSpin.rotation.y=eSpin;
      clouds.rotation.y=eSpin*1.1;
    }
    moonAngle+=dt*MOON_SPEED;
    moonOrbit.rotation.y=moonAngle;
    stars.rotation.y+=dt*0.003;sky.rotation.y+=dt*0.001;
    theta+=(thetaG-theta)*0.12;phi+=(phiG-phi)*0.12;radius+=(radiusG-radius)*0.1;
    camPos();
    refreshMarkers(t);
    renderer.render(scene,camera);
    updateTags();
    perfAccum+=dt;perfCount++;
    if(perfCount>=30){var avg=perfAccum/perfCount;perfAccum=0;perfCount=0;if(avg>0.04&&dprStep>1){dprStep=Math.max(1,dprStep-0.25);renderer.setPixelRatio(dprStep);renderer.setSize(W,H,false);}}
  }
  addEventListener('resize',function(){
    W=innerWidth;H=innerHeight;camera.aspect=W/H;camera.updateProjectionMatrix();renderer.setSize(W,H,false);
    if(!userZoomed)radiusG=fitR();
  });
  addEventListener('visibilitychange',function(){if(document.hidden){running=false;}else if(!running){running=true;clock.getDelta();animate();}});
  cv.addEventListener('webglcontextlost',function(e){e.preventDefault();running=false;document.getElementById('loader').classList.add('hide');document.getElementById('fallback').classList.add('show');},false);

  animate();
  setTimeout(function(){document.getElementById('loader').classList.add('hide');},600);
  setTimeout(function(){var tp=document.getElementById('tip');tp.classList.add('show');setTimeout(function(){tp.classList.remove('show');},3800);},1400);
})();
