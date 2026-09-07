(function(){
  var cv=document.getElementById('stage');
  var gl=null;try{gl=cv.getContext('webgl2')||cv.getContext('webgl')}catch(e){}
  if(!gl||typeof THREE==='undefined'){document.getElementById('fallback').classList.add('show');document.getElementById('loader').classList.add('hide');return;}

  var W=innerWidth,H=innerHeight,DPR=Math.min(devicePixelRatio||1,1.5);
  var renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(DPR);renderer.setSize(W,H,false);
  renderer.outputEncoding=THREE.sRGBEncoding;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.1;

  var scene=new THREE.Scene();
  var camera=new THREE.PerspectiveCamera(45,W/H,0.1,5000);

  var MOON_R=5;

  // ===== 背景星空天球 =====
  function starfieldTex(){
    var w=2048,h=1024,c=document.createElement('canvas');c.width=w;c.height=h;var x=c.getContext('2d');
    var bg=x.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#04050c');bg.addColorStop(.5,'#080a1a');bg.addColorStop(1,'#04050c');
    x.fillStyle=bg;x.fillRect(0,0,w,h);
    x.save();x.translate(w/2,h/2);x.rotate(-0.4);x.translate(-w/2,-h/2);
    for(var i=0;i<22;i++){var px=Math.random()*w,py=h/2+(Math.random()-0.5)*h*0.28,r=100+Math.random()*220;
      var gg=x.createRadialGradient(px,py,0,px,py,r),hue=Math.random(),c1=hue<.4?'rgba(150,120,220,':(hue<.7?'rgba(90,130,210,':'rgba(200,120,150,');
      gg.addColorStop(0,c1+(0.04+Math.random()*.05)+')');gg.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=gg;x.fillRect(0,0,w,h);}
    for(var i=0;i<3600;i++){var px=Math.random()*w,py=h/2+(Math.random()-0.5)*h*0.3;
      var d=Math.abs(py-h/2)/(h*0.15),b=(1-d*d)*(.3+Math.random()*.6);if(b<=0)continue;
      x.fillStyle='rgba(255,255,255,'+b+')';x.fillRect(px,py,1,1);}
    x.restore();
    for(var i=0;i<3800;i++){var px=Math.random()*w,py=Math.random()*h,b=.15+Math.random()*.5;
      x.fillStyle='rgba(255,255,255,'+b+')';x.fillRect(px,py,1,1);}
    for(var i=0;i<200;i++){var px=Math.random()*w,py=Math.random()*h,b=.82+Math.random()*.18;
      x.fillStyle='rgba(255,255,255,'+b+')';x.fillRect(px,py,1,1);}
    var t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return t;
  }
  var sky=new THREE.Mesh(new THREE.SphereGeometry(2500,48,32),new THREE.MeshBasicMaterial({map:starfieldTex(),side:THREE.BackSide,depthWrite:false}));
  scene.add(sky);

  // ===== 光照 =====
  scene.add(new THREE.AmbientLight(0x223044,0.4));
  var sunLight=new THREE.DirectionalLight(0xffffff,2.4);
  sunLight.position.set(0,0,MOON_R*3);
  scene.add(sunLight);

  // ===== 月球 =====
  function plainTex(col){var c=document.createElement('canvas');c.width=c.height=4;c.getContext('2d').fillStyle=col;c.getContext('2d').fillRect(0,0,4,4);return new THREE.CanvasTexture(c);}
  var moonMat=new THREE.MeshStandardMaterial({map:plainTex('#b8b8b8'),roughness:.95,metalness:0});
  var moon=new THREE.Mesh(new THREE.SphereGeometry(MOON_R,64,64),moonMat);
  scene.add(moon);

  function radialTex(c0,c1,c2){
    var c=document.createElement('canvas');c.width=c.height=128;var x=c.getContext('2d'),g=x.createRadialGradient(64,64,0,64,64,64);
    g.addColorStop(0,c0);g.addColorStop(.4,c1);g.addColorStop(1,c2);x.fillStyle=g;x.fillRect(0,0,128,128);
    return new THREE.CanvasTexture(c);
  }
  var moonGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:radialTex('rgba(200,220,255,.28)','rgba(160,190,240,.1)','rgba(140,170,230,0)'),blending:THREE.AdditiveBlending,transparent:true,depthWrite:false}));
  moonGlow.scale.set(MOON_R*4.5,MOON_R*4.5,1);
  scene.add(moonGlow);
  var moonGlow2=new THREE.Sprite(new THREE.SpriteMaterial({map:radialTex('rgba(180,210,255,.12)','rgba(140,180,230,.04)','rgba(120,160,220,0)'),blending:THREE.AdditiveBlending,transparent:true,depthWrite:false}));
  moonGlow2.scale.set(MOON_R*8,MOON_R*8,1);
  scene.add(moonGlow2);

  // ===== 纹理加载 =====
  var loader=new THREE.TextureLoader();loader.setCrossOrigin('anonymous');
  var maxA=renderer.capabilities.getMaxAnisotropy();
  function load(u,ok){loader.load(u,ok,undefined,function(){});}
  load('./assets/moon.jpg',function(t){t.encoding=THREE.sRGBEncoding;t.anisotropy=maxA;moonMat.map=t;moonMat.needsUpdate=true;});

  // ===== 近层星空粒子 =====
  var stars=(function(){
    var n=2600,geo=new THREE.BufferGeometry(),pos=new Float32Array(n*3),col=new Float32Array(n*3);
    for(var i=0;i<n;i++){var u=Math.random()*2-1,v=Math.random()*6.2832,s=Math.sqrt(1-u*u),R=800+Math.random()*600;
      pos[i*3]=R*s*Math.cos(v);pos[i*3+1]=R*u;pos[i*3+2]=R*s*Math.sin(v);
      var b=.25+Math.random()*.75,t=Math.random();
      if(t<.15){col[i*3]=b*.8;col[i*3+1]=b*.85;col[i*3+2]=b;}
      else if(t<.25){col[i*3]=b;col[i*3+1]=b*.85;col[i*3+2]=b*.7;}
      else{col[i*3]=b;col[i*3+1]=b;col[i*3+2]=b;}}
    geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    geo.setAttribute('color',new THREE.BufferAttribute(col,3));
    var m=new THREE.PointsMaterial({size:0.6,sizeAttenuation:true,vertexColors:true,transparent:true,opacity:.9,depthWrite:false});
    var p=new THREE.Points(geo,m);scene.add(p);return p;
  })();

  // ===== 相机控制 =====
  var theta=0,phi=Math.PI/2,radius=18;
  var R_MIN=8,R_MAX=60;
  function camPos(){var sp=Math.sin(phi);
    camera.position.set(radius*sp*Math.sin(theta),radius*Math.cos(phi),radius*sp*Math.cos(theta));
    camera.lookAt(0,0,0);}

  var dragging=false,lx=0,ly=0,moved=false,downX=0,downY=0,downT=0,pinch=0;
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
    theta-=dx*0.005;phi-=dy*0.005;phi=Math.max(0.1,Math.min(Math.PI-0.1,phi));
  });
  cv.addEventListener('wheel',function(e){e.preventDefault();radius*=1+Math.sign(e.deltaY)*0.08;radius=Math.max(R_MIN,Math.min(R_MAX,radius));},{passive:false});
  cv.addEventListener('touchstart',function(e){if(e.touches.length===2){pinch=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);}},{passive:true});
  cv.addEventListener('touchmove',function(e){if(e.touches.length===2){e.preventDefault();var d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);if(pinch){radius*=pinch/d;radius=Math.max(R_MIN,Math.min(R_MAX,radius));}pinch=d;}},{passive:false});

  // 点击拾取
  var ray=new THREE.Raycaster(),ndc=new THREE.Vector2();
  function handleClick(cx,cy){
    ndc.x=(cx/W)*2-1;ndc.y=-(cy/H)*2+1;
    ray.setFromCamera(ndc,camera);
    var hits=ray.intersectObject(moon,false);
    if(hits.length){setView(view==='sci'?'moon':'sci');}
  }

  // ===== 月相 =====
  var phaseDeg=180;
  var phaseAuto=false;
  var phSlider=document.getElementById('phSlider');
  var phNameEl=document.getElementById('phName');
  function phaseName(deg){
    var d=(deg%360+360)%360;
    if(d<8||d>352) return '新月';
    if(d<82) return '蛾眉月';
    if(d<98) return '上弦月';
    if(d<172) return '盈凸月';
    if(d<188) return '满月';
    if(d<262) return '亏凸月';
    if(d<278) return '下弦月';
    return '残月';
  }
  function setPhase(deg){
    phaseDeg=((deg%360)+360)%360;
    var a=phaseDeg*Math.PI/180;
    var d=MOON_R*4;
    sunLight.position.set(Math.sin(a)*d, 0, -Math.cos(a)*d);
    phNameEl.textContent=phaseName(phaseDeg);
    if(!phaseAuto) phSlider.value=phaseDeg;
  }
  phSlider.addEventListener('input',function(){if(!phaseAuto) setPhase(parseFloat(phSlider.value));});
  setPhase(180);

  var swPhAuto=document.getElementById('swPhAuto');
  swPhAuto.addEventListener('click',function(){
    phaseAuto=!phaseAuto;
    swPhAuto.classList.toggle('on',phaseAuto);
    phSlider.disabled=phaseAuto;
  });

  // ===== dock 切换 =====
  var view='moon';
  var phasePanel=document.getElementById('phase');
  var sciPanel=document.getElementById('sci');
  var setPanel=document.getElementById('set');
  var scrim=document.getElementById('scrim');

  function setView(v){
    view=v;
    document.querySelectorAll('#dock button').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-v')===v);});
    phasePanel.classList.toggle('show',v==='phase');
    sciPanel.classList.toggle('show',v==='sci');
  }
  document.querySelectorAll('#dock button').forEach(function(b){
    b.addEventListener('click',function(){var v=b.getAttribute('data-v');setView(view===v?'moon':v);});
  });

  // ===== 设置 =====
  var spinning=true,spinMul=1;
  function bind(id,fn){var el=document.getElementById(id);el.addEventListener('click',function(){el.classList.toggle('on');fn(el.classList.contains('on'));});}
  bind('swSpin',function(v){spinning=v;});
  bind('swStars',function(v){stars.visible=v;sky.visible=v;});
  bind('swGlow',function(v){moonGlow.visible=v;moonGlow2.visible=v;});
  var spEl=document.getElementById('spinSpeed'),vSp=document.getElementById('vSpin');
  spEl.addEventListener('input',function(){spinMul=spEl.value/100;vSp.textContent=spinMul.toFixed(1)+'×';});
  document.getElementById('bReset').addEventListener('click',function(){theta=0;phi=Math.PI/2;radius=18;});
  document.getElementById('bTop').addEventListener('click',function(){theta=0;phi=Math.PI/2;radius=11;});
  function updateScrim(){scrim.classList.toggle('show',setPanel.classList.contains('show'));}
  document.getElementById('gear').addEventListener('click',function(){setPanel.classList.add('show');updateScrim();});
  document.getElementById('setClose').addEventListener('click',function(){setPanel.classList.remove('show');updateScrim();});
  scrim.addEventListener('click',function(){setPanel.classList.remove('show');updateScrim();});

  // ===== 动画 =====
  var clock=new THREE.Clock();
  var running=true,mSpin=0,dprStep=DPR,perfAccum=0,perfCount=0;
  function animate(){
    if(!running)return;
    requestAnimationFrame(animate);
    var dt=clock.getDelta();
    if(spinning){mSpin+=dt*0.15*spinMul;moon.rotation.y=mSpin;}
    if(phaseAuto){setPhase(phaseDeg+dt*30);}
    camPos();
    moonGlow.position.copy(moon.position);
    moonGlow2.position.copy(moon.position);
    renderer.render(scene,camera);
    perfAccum+=dt;perfCount++;
    if(perfCount>=30){var avg=perfAccum/perfCount;perfAccum=0;perfCount=0;if(avg>0.04&&dprStep>1){dprStep=Math.max(1,dprStep-0.25);renderer.setPixelRatio(dprStep);renderer.setSize(W,H,false);}}
  }

  addEventListener('resize',function(){W=innerWidth;H=innerHeight;camera.aspect=W/H;camera.updateProjectionMatrix();renderer.setSize(W,H,false);});
  addEventListener('visibilitychange',function(){if(document.hidden){running=false;}else if(!running){running=true;clock.getDelta();animate();}});
  cv.addEventListener('webglcontextlost',function(e){e.preventDefault();running=false;document.getElementById('loader').classList.add('hide');document.getElementById('fallback').classList.add('show');},false);
  animate();
  setTimeout(function(){document.getElementById('loader').classList.add('hide');},600);
  setTimeout(function(){var t=document.getElementById('tip');t.classList.add('show');setTimeout(function(){t.classList.remove('show');},3400);},1500);
})();
