(function(){
  var cv=document.getElementById('stage');
  var gl=null;try{gl=cv.getContext('webgl2')||cv.getContext('webgl')}catch(e){}
  if(!gl||typeof THREE==='undefined'){document.getElementById('fallback').classList.add('show');document.getElementById('loader').classList.add('hide');return;}

  var W=innerWidth,H=innerHeight,DPR=Math.min(devicePixelRatio||1,1.5);
  var renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(DPR);renderer.setSize(W,H,false);
  renderer.outputEncoding=THREE.sRGBEncoding;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.08;

  var scene=new THREE.Scene();
  var camera=new THREE.PerspectiveCamera(52,W/H,0.1,5000);

  // 尺寸（艺术化比例）
  var SUN_R=7,EARTH_R=1.6,MOON_R=0.45;
  var EARTH_ORBIT=26,MOON_ORBIT=4.2;

  // ===== 背景星空天球（程序化银河贴图）=====
  function starfieldTex(){
    var w=2048,h=1024,c=document.createElement('canvas');c.width=w;c.height=h;var x=c.getContext('2d');
    var bg=x.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#04050c');bg.addColorStop(.5,'#080a1a');bg.addColorStop(1,'#04050c');
    x.fillStyle=bg;x.fillRect(0,0,w,h);
    x.save();x.translate(w/2,h/2);x.rotate(-0.5);x.translate(-w/2,-h/2);
    for(var i=0;i<24;i++){var px=Math.random()*w,py=h/2+(Math.random()-0.5)*h*0.3,r=90+Math.random()*200;
      var gg=x.createRadialGradient(px,py,0,px,py,r),hue=Math.random(),c1=hue<.4?'rgba(150,120,220,':(hue<.7?'rgba(90,130,210,':'rgba(200,120,150,');
      gg.addColorStop(0,c1+(0.05+Math.random()*.06)+')');gg.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=gg;x.fillRect(0,0,w,h);}
    for(var i=0;i<4400;i++){var px=Math.random()*w,py=h/2+(Math.random()-0.5)*h*0.32;
      var d=Math.abs(py-h/2)/(h*0.16),b=(1-d*d)*(.3+Math.random()*.6);if(b<=0)continue;
      x.fillStyle='rgba(255,255,255,'+b+')';x.fillRect(px,py,1,1);}
    x.restore();
    for(var i=0;i<4200;i++){var px=Math.random()*w,py=Math.random()*h,b=.15+Math.random()*.5;
      x.fillStyle='rgba(255,255,255,'+b+')';x.fillRect(px,py,1,1);}
    for(var i=0;i<220;i++){var px=Math.random()*w,py=Math.random()*h,b=.82+Math.random()*.18;
      x.fillStyle='rgba(255,255,255,'+b+')';x.fillRect(px,py,1,1);}
    var t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return t;
  }
  var sky=new THREE.Mesh(new THREE.SphereGeometry(3500,48,32),new THREE.MeshBasicMaterial({map:starfieldTex(),side:THREE.BackSide,depthWrite:false}));
  scene.add(sky);

  // ===== 光照 =====
  scene.add(new THREE.AmbientLight(0x223044,0.5));
  var sunLight=new THREE.PointLight(0xfff2d0,2.6,0,1.3);scene.add(sunLight);

  // ===== 工具纹理 =====
  function radialTex(c0,c1,c2){
    var c=document.createElement('canvas');c.width=c.height=128;var x=c.getContext('2d'),g=x.createRadialGradient(64,64,0,64,64,64);
    g.addColorStop(0,c0);g.addColorStop(.4,c1);g.addColorStop(1,c2);x.fillStyle=g;x.fillRect(0,0,128,128);
    return new THREE.CanvasTexture(c);
  }
  function sunTex(){
    var c=document.createElement('canvas');c.width=c.height=512;var x=c.getContext('2d');
    x.fillStyle='#ff7a14';x.fillRect(0,0,512,512);
    for(var i=0;i<5200;i++){var px=Math.random()*512,py=Math.random()*512,r=1.5+Math.random()*7;
      x.fillStyle='rgba(255,'+(170+Math.random()*80|0)+','+(30+Math.random()*90|0)+','+(Math.random()*.45)+')';
      x.beginPath();x.arc(px,py,r,0,6.283);x.fill();}
    for(var j=0;j<90;j++){var px=Math.random()*512,py=Math.random()*512,r=8+Math.random()*36;
      var g=x.createRadialGradient(px,py,0,px,py,r);g.addColorStop(0,'rgba(255,245,205,.85)');g.addColorStop(1,'rgba(255,245,205,0)');
      x.fillStyle=g;x.beginPath();x.arc(px,py,r,0,6.283);x.fill();}
    return new THREE.CanvasTexture(c);
  }
  function plainTex(col){var c=document.createElement('canvas');c.width=c.height=4;c.getContext('2d').fillStyle=col;c.getContext('2d').fillRect(0,0,4,4);return new THREE.CanvasTexture(c);}

  // ===== 太阳 =====
  var sun=new THREE.Mesh(new THREE.SphereGeometry(SUN_R,48,48),new THREE.MeshBasicMaterial({map:sunTex()}));
  scene.add(sun);
  var glowA=new THREE.Sprite(new THREE.SpriteMaterial({map:radialTex('rgba(255,225,150,.95)','rgba(255,150,40,.4)','rgba(255,120,20,0)'),blending:THREE.AdditiveBlending,transparent:true,depthWrite:false}));
  glowA.scale.set(SUN_R*3.8,SUN_R*3.8,1);scene.add(glowA);
  var glowB=new THREE.Sprite(new THREE.SpriteMaterial({map:radialTex('rgba(255,180,80,.5)','rgba(255,120,30,.16)','rgba(255,100,20,0)'),blending:THREE.AdditiveBlending,transparent:true,depthWrite:false}));
  glowB.scale.set(SUN_R*5.5,SUN_R*5.5,1);scene.add(glowB);
  var glowC=new THREE.Sprite(new THREE.SpriteMaterial({map:radialTex('rgba(255,140,40,.22)','rgba(255,90,20,.08)','rgba(255,80,10,0)'),blending:THREE.AdditiveBlending,transparent:true,depthWrite:false}));
  glowC.scale.set(SUN_R*8,SUN_R*8,1);scene.add(glowC);

  // ===== 地球 =====
  var earthOrbit=new THREE.Group();scene.add(earthOrbit);
  var earthTilt=new THREE.Group();earthTilt.rotation.z=23.5*Math.PI/180;earthOrbit.add(earthTilt);
  var earthMat=new THREE.MeshStandardMaterial({map:plainTex('#2a5a9a'),roughness:.82,metalness:.06});
  var earth=new THREE.Mesh(new THREE.SphereGeometry(EARTH_R,40,40),earthMat);earthTilt.add(earth);
  var cloudMat=new THREE.MeshStandardMaterial({map:plainTex('#ffffff'),transparent:true,alphaMap:plainTex('#ffffff'),opacity:.55,roughness:1,depthWrite:false});
  var clouds=new THREE.Mesh(new THREE.SphereGeometry(EARTH_R*1.012,40,40),cloudMat);earthTilt.add(clouds);
  // 大气辉光
  var atmo=new THREE.Mesh(new THREE.SphereGeometry(EARTH_R*1.06,40,40),new THREE.MeshBasicMaterial({color:0x3a86d8,side:THREE.BackSide,transparent:true,opacity:.28,blending:THREE.AdditiveBlending,depthWrite:false}));
  earthTilt.add(atmo);

  // ===== 月球 =====
  var moonOrbit=new THREE.Group();earthOrbit.add(moonOrbit);
  var moonMat=new THREE.MeshStandardMaterial({map:plainTex('#b8b8b8'),roughness:.95});
  var moon=new THREE.Mesh(new THREE.SphereGeometry(MOON_R,28,28),moonMat);moonOrbit.add(moon);
  var moonGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:radialTex('rgba(220,220,230,.18)','rgba(180,180,200,.06)','rgba(180,180,200,0)'),blending:THREE.AdditiveBlending,transparent:true,depthWrite:false}));
  moonGlow.scale.set(MOON_R*5,MOON_R*5,1);moon.add(moonGlow);

  // ===== 纹理加载（容错）=====
  var loader=new THREE.TextureLoader();loader.setCrossOrigin('anonymous');
  var maxA=renderer.capabilities.getMaxAnisotropy();
  function load(u,ok){loader.load(u,ok,undefined,function(){});}
  load('./assets/earth.jpg',function(t){t.encoding=THREE.sRGBEncoding;t.anisotropy=maxA;earthMat.map=t;earthMat.needsUpdate=true;});
  load('./assets/clouds.png',function(t){t.anisotropy=maxA;cloudMat.map=t;cloudMat.alphaMap=t;cloudMat.needsUpdate=true;});
  load('./assets/moon.jpg',function(t){t.encoding=THREE.sRGBEncoding;t.anisotropy=maxA;moonMat.map=t;moonMat.needsUpdate=true;});

  // ===== 星空 =====
  var stars=(function(){
    var n=4200,geo=new THREE.BufferGeometry(),pos=new Float32Array(n*3),col=new Float32Array(n*3);
    for(var i=0;i<n;i++){var u=Math.random()*2-1,v=Math.random()*6.2832,s=Math.sqrt(1-u*u),R=1100+Math.random()*700;
      pos[i*3]=R*s*Math.cos(v);pos[i*3+1]=R*u;pos[i*3+2]=R*s*Math.sin(v);
      var b=.25+Math.random()*.75,t=Math.random();
      if(t<.15){col[i*3]=b*.7;col[i*3+1]=b*.8;col[i*3+2]=b;}
      else if(t<.25){col[i*3]=b;col[i*3+1]=b*.85;col[i*3+2]=b*.7;}
      else{col[i*3]=b;col[i*3+1]=b;col[i*3+2]=b;}}
    geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    geo.setAttribute('color',new THREE.BufferAttribute(col,3));
    var m=new THREE.PointsMaterial({size:0.55,sizeAttenuation:true,vertexColors:true,transparent:true,opacity:.9,depthWrite:false});
    var p=new THREE.Points(geo,m);scene.add(p);return p;
  })();

  // ===== 轨道线 =====
  function orbitLine(r,col){var n=160,pts=[];for(var i=0;i<=n;i++){var a=i/n*6.2832;pts.push(new THREE.Vector3(Math.cos(a)*r,0,Math.sin(a)*r));}
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:col,transparent:true,opacity:.28}));}
  var earthOrbitLine=orbitLine(EARTH_ORBIT,0x4a7fb5);scene.add(earthOrbitLine);
  var moonOrbitLine=orbitLine(MOON_ORBIT,0x8a8a8a);earthOrbit.add(moonOrbitLine);

  // ===== 相机控制 =====
  function overviewRadius(){var vFov=camera.fov*Math.PI/180;var hFov=2*Math.atan(Math.tan(vFov/2)*camera.aspect);return Math.max(44,26/Math.tan(hFov/2));}
  var theta=0.9,phi=1.32,radius=overviewRadius();
  var target=new THREE.Vector3(0,0,0),targetGoal=new THREE.Vector3(0,0,0);
  var radiusGoal=radius,R_MIN=12,R_MAX=280;
  var userZoomed=false;
  function camPos(){var sp=Math.sin(phi);
    camera.position.set(target.x+radius*sp*Math.sin(theta),target.y+radius*Math.cos(phi),target.z+radius*sp*Math.cos(theta));
    camera.lookAt(target);}

  // 跟踪
  var focus=null;
  function focusDist(R,minD){var vFov=camera.fov*Math.PI/180;var hFov=2*Math.atan(Math.tan(vFov/2)*camera.aspect);return Math.max(minD,4.2*R/Math.tan(hFov/2));}
  function targetRadiusFor(f){if(!f)return overviewRadius();var R=f==='sun'?SUN_R:(f==='earth'?EARTH_R:MOON_R);var minD=f==='sun'?54:(f==='earth'?22:15);return focusDist(R,minD);}
  var focusTargets={sun:sun,earth:earth,moon:moon};
  var info={
    sun:{name:'太阳',color:'#ffb84d',desc:'太阳系的中心恒星，一颗 G 型主序星。它几乎占据太阳系全部质量，通过核聚变向外辐射光与热。',meta:['表面 ≈ 5500°C','质量占比 99.8%','光球自转 ≈ 25 天']},
    earth:{name:'地球',color:'#4a90e2',desc:'我们的家园。唯一已知拥有液态水与生命的行星，自转形成昼夜，公转决定四季。',meta:['自转 24 小时','公转 365 天','倾角 23.5°']},
    moon:{name:'月球',color:'#cfcfcf',desc:'地球唯一的天然卫星。它被潮汐锁定，始终以同一面朝向地球，引力主宰着海洋潮汐。',meta:['潮汐锁定','距地 38.4 万 km','公转 ≈ 27.3 天']}
  };

  function setFocus(f){
    focus=f;
    userZoomed=false;
    radiusGoal=targetRadiusFor(f);
    if(f){var card=document.getElementById('card');card.classList.add('show');
      var d=info[f];document.getElementById('cName').textContent=d.name;
      document.getElementById('cDot').style.background=d.color;
      document.getElementById('cDesc').textContent=d.desc;
      document.getElementById('cMeta').innerHTML=d.meta.map(function(m){return '<span>'+m+'</span>';}).join('');}
    else{document.getElementById('card').classList.remove('show');target.set(0,0,0);}
    var btns=document.querySelectorAll('#dock button');
    for(var i=0;i<btns.length;i++)btns[i].classList.toggle('on',btns[i].getAttribute('data-f')===(f||''));
  }

  // 拖动 + 点击
  var dragging=false,lx=0,ly=0,downX=0,downY=0,downT=0,pinch=0,moved=false;
  cv.addEventListener('pointerdown',function(e){dragging=true;moved=false;lx=downX=e.clientX;ly=downY=e.clientY;downT=performance.now();cv.setPointerCapture(e.pointerId);});
  cv.addEventListener('pointerup',function(e){
    dragging=false;try{cv.releasePointerCapture(e.pointerId)}catch(_){}
    var dt=performance.now()-downT,dx=e.clientX-downX,dy=e.clientY-downY;
    if(!moved && dt<350 && Math.hypot(dx,dy)<10){handleClick(e.clientX,e.clientY);}
  });
  cv.addEventListener('pointermove',function(e){
    if(!dragging)return;
    var dx=e.clientX-lx,dy=e.clientY-ly;lx=e.clientX;ly=e.clientY;
    if(Math.hypot(e.clientX-downX,e.clientY-downY)>6)moved=true;
    theta-=dx*0.005;phi-=dy*0.005;phi=Math.max(0.08,Math.min(Math.PI-0.08,phi));
  });
  cv.addEventListener('wheel',function(e){e.preventDefault();radius*=1+Math.sign(e.deltaY)*0.08;radius=Math.max(R_MIN,Math.min(R_MAX,radius));userZoomed=true;},{passive:false});
  cv.addEventListener('touchstart',function(e){if(e.touches.length===2){pinch=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);}},{passive:true});
  cv.addEventListener('touchmove',function(e){if(e.touches.length===2){e.preventDefault();var d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);if(pinch){radius*=pinch/d;radius=Math.max(R_MIN,Math.min(R_MAX,radius));userZoomed=true;}pinch=d;}},{passive:false});

  // 点击拾取
  var ray=new THREE.Raycaster(),ndc=new THREE.Vector2();
  function handleClick(cx,cy){
    ndc.x=(cx/W)*2-1;ndc.y=-(cy/H)*2+1;
    ray.setFromCamera(ndc,camera);
    var hits=ray.intersectObjects([sun,earth,moon],false);
    if(hits.length){
      var obj=hits[0].object;
      if(obj===sun)setFocus(focus==='sun'?null:'sun');
      else if(obj===earth)setFocus(focus==='earth'?null:'earth');
      else if(obj===moon)setFocus(focus==='moon'?null:'moon');
    }else{if(focus)setFocus(null);}
  }

  // dock 按钮
  document.querySelectorAll('#dock button').forEach(function(b){
    b.addEventListener('click',function(){var f=b.getAttribute('data-f');setFocus(focus===f?null:(f||null));});
  });

  // 设置
  var playing=true,showOrbit=true,showLabel=true,showStars=true,speedMul=1;
  function bind(id,fn){var el=document.getElementById(id);el.addEventListener('click',function(){el.classList.toggle('on');fn(el.classList.contains('on'));});}
  bind('swPlay',function(v){playing=v;});
  bind('swOrbit',function(v){showOrbit=v;earthOrbitLine.visible=v;moonOrbitLine.visible=v;});
  bind('swLabel',function(v){showLabel=v;});
  bind('swStars',function(v){showStars=v;stars.visible=v;sky.visible=v;});
  var spEl=document.getElementById('speed'),vSp=document.getElementById('vSpeed');
  spEl.addEventListener('input',function(){speedMul=spEl.value/100;vSp.textContent=speedMul.toFixed(1)+'×';});
  document.getElementById('bReset').addEventListener('click',function(){theta=0.9;phi=1.32;setFocus(null);radius=radiusGoal;});
  document.getElementById('bTop').addEventListener('click',function(){theta=0.9;phi=0.02;if(focus)setFocus(null);else{radiusGoal=overviewRadius();userZoomed=false;}radius=radiusGoal;});
  var sheet=document.getElementById('sheet'),scrim=document.getElementById('scrim');
  function openSheet(v){sheet.classList.toggle('show',v);scrim.classList.toggle('show',v);}
  document.getElementById('gear').addEventListener('click',function(){openSheet(true);});
  document.getElementById('sClose').addEventListener('click',function(){openSheet(false);});
  scrim.addEventListener('click',function(){openSheet(false);});

  // 标签
  var tagSun=document.getElementById('tagSun'),tagEarth=document.getElementById('tagEarth'),tagMoon=document.getElementById('tagMoon');
  var _v=new THREE.Vector3();
  function project(obj,el){_v.setFromMatrixPosition(obj.matrixWorld);_v.project(camera);
    var x=(_v.x*0.5+0.5)*W,y=(-_v.y*0.5+0.5)*H;
    if(_v.z<1){el.style.left=x+'px';el.style.top=y+'px';el.style.opacity=showLabel?'1':'0';}else el.style.opacity='0';}

  // 动画
  var clock=new THREE.Clock();
  var running=true,perfAccum=0,perfCount=0,dprStep=DPR;
  var eAng=0.6,mAng=0,eSpin=0;
  var EARTH_REV=0.16,MOON_REV=0.85,EARTH_SPIN=1.6,SUN_SPIN=0.05;
  function animate(){
    if(!running)return;
    requestAnimationFrame(animate);
    var dt=clock.getDelta();
    if(playing){var s=dt*speedMul;
      eAng+=s*EARTH_REV;mAng+=s*MOON_REV;eSpin+=s*EARTH_SPIN;
      earthOrbit.position.set(Math.cos(eAng)*EARTH_ORBIT,0,Math.sin(eAng)*EARTH_ORBIT);
      moonOrbit.position.set(Math.cos(mAng)*MOON_ORBIT,0,Math.sin(mAng)*MOON_ORBIT);
      earth.rotation.y=eSpin;clouds.rotation.y=eSpin*1.12;moon.rotation.y=mAng;sun.rotation.y+=s*SUN_SPIN;
      stars.rotation.y+=s*0.003;sky.rotation.y+=s*0.001;}
    // 跟踪插值
    if(focus){targetGoal.setFromMatrixPosition(focusTargets[focus].matrixWorld);}
    else{targetGoal.set(0,0,0);}
    target.lerp(targetGoal,0.15);
    if(!userZoomed)radius+=(radiusGoal-radius)*0.08;
    camPos();
    renderer.render(scene,camera);
    project(sun,tagSun);project(earth,tagEarth);project(moon,tagMoon);
    perfAccum+=dt;perfCount++;
    if(perfCount>=30){var avg=perfAccum/perfCount;perfAccum=0;perfCount=0;if(avg>0.04&&dprStep>1){dprStep=Math.max(1,dprStep-0.25);renderer.setPixelRatio(dprStep);renderer.setSize(W,H,false);}}
  }
  addEventListener('resize',function(){W=innerWidth;H=innerHeight;camera.aspect=W/H;camera.updateProjectionMatrix();renderer.setSize(W,H,false);if(!userZoomed){radiusGoal=targetRadiusFor(focus);}});

  addEventListener('visibilitychange',function(){if(document.hidden){running=false;}else if(!running){running=true;clock.getDelta();animate();}});
  cv.addEventListener('webglcontextlost',function(e){e.preventDefault();running=false;document.getElementById('loader').classList.add('hide');document.getElementById('fallback').classList.add('show');},false);
  animate();
  setTimeout(function(){document.getElementById('loader').classList.add('hide');},600);
  setTimeout(function(){var t=document.getElementById('tip');t.classList.add('show');setTimeout(function(){t.classList.remove('show');},3200);},1400);
})();