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

  var R=1.6;

  // ===== 背景星空天球（程序化银河贴图，暖色调）=====
  function starfieldTex(){
    var w=2048,h=1024,c=document.createElement('canvas');c.width=w;c.height=h;var x=c.getContext('2d');
    var bg=x.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#0a0608');bg.addColorStop(.5,'#120a0c');bg.addColorStop(1,'#0a0608');
    x.fillStyle=bg;x.fillRect(0,0,w,h);
    x.save();x.translate(w/2,h/2);x.rotate(-0.4);x.translate(-w/2,-h/2);
    for(var i=0;i<22;i++){var px=Math.random()*w,py=h/2+(Math.random()-0.5)*h*0.3,r=90+Math.random()*220;
      var gg=x.createRadialGradient(px,py,0,px,py,r),hue=Math.random(),c1=hue<.4?'rgba(200,120,90,':(hue<.7?'rgba(180,140,100,':'rgba(150,110,140,');
      gg.addColorStop(0,c1+(0.04+Math.random()*.05)+')');gg.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=gg;x.fillRect(0,0,w,h);}
    x.restore();
    for(var i=0;i<4200;i++){var px=Math.random()*w,py=Math.random()*h,b=.15+Math.random()*.5;
      x.fillStyle='rgba(255,240,225,'+b+')';x.fillRect(px,py,1,1);}
    for(var i=0;i<220;i++){var px=Math.random()*w,py=Math.random()*h,b=.82+Math.random()*.18;
      x.fillStyle='rgba(255,245,230,'+b+')';x.fillRect(px,py,1,1);}
    var t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return t;
  }
  var sky=new THREE.Mesh(new THREE.SphereGeometry(3500,48,32),new THREE.MeshBasicMaterial({map:starfieldTex(),side:THREE.BackSide,depthWrite:false}));
  scene.add(sky);

  // ===== 光照 =====
  var ambient=new THREE.AmbientLight(0x5a3a28,0.65);scene.add(ambient);
  var sunLight=new THREE.PointLight(0xffd8a8,2.6,0,1.3);sunLight.position.set(38,12,22);scene.add(sunLight);

  // ===== 工具纹理 =====
  function radialTex(c0,c1,c2){
    var c=document.createElement('canvas');c.width=c.height=128;var x=c.getContext('2d'),g=x.createRadialGradient(64,64,0,64,64,64);
    g.addColorStop(0,c0);g.addColorStop(.4,c1);g.addColorStop(1,c2);x.fillStyle=g;x.fillRect(0,0,128,128);
    return new THREE.CanvasTexture(c);
  }
  function plainTex(col){var c=document.createElement('canvas');c.width=c.height=4;c.getContext('2d').fillStyle=col;c.getContext('2d').fillRect(0,0,4,4);return new THREE.CanvasTexture(c);}

  // 经纬度 → 球面坐标（与 three.js SphereGeometry 贴图 UV 对齐）
  function ll2v(lat,lon,r){
    var th=(90-lat)*Math.PI/180,p=(lon+180)/360*Math.PI*2;
    return new THREE.Vector3(-r*Math.cos(p)*Math.sin(th),r*Math.cos(th),r*Math.sin(p)*Math.sin(th));
  }

  // ===== 主地球 =====
  var mainTilt=new THREE.Group();mainTilt.rotation.z=23.5*Math.PI/180;scene.add(mainTilt);
  var mainSpin=new THREE.Group();mainTilt.add(mainSpin);
  var earthMat=new THREE.MeshStandardMaterial({map:plainTex('#2a5a9a'),roughness:.82,metalness:.06});
  var earthMesh=new THREE.Mesh(new THREE.SphereGeometry(R,48,32),earthMat);mainSpin.add(earthMesh);
  var cloudMat=new THREE.MeshStandardMaterial({map:plainTex('#ffffff'),transparent:true,alphaMap:plainTex('#ffffff'),opacity:.5,roughness:1,depthWrite:false});
  var clouds=new THREE.Mesh(new THREE.SphereGeometry(R*1.012,48,32),cloudMat);mainTilt.add(clouds);
  var atmo=new THREE.Mesh(new THREE.SphereGeometry(R*1.06,48,32),new THREE.MeshBasicMaterial({color:0xff6b35,side:THREE.BackSide,transparent:true,opacity:.3,blending:THREE.AdditiveBlending,depthWrite:false}));
  mainTilt.add(atmo);

  // ===== 美食标记点 =====
  // 每个标记点：发光小球 + 外圈光晕 sprite，挂在 mainSpin 上随地球自转
  var markers=[];
  var markerGroup=new THREE.Group();mainSpin.add(markerGroup);
  var glowTex=radialTex('rgba(255,220,180,.95)','rgba(255,140,60,.45)','rgba(255,100,30,0)');
  var ringTex=radialTex('rgba(255,200,140,.7)','rgba(255,140,60,.25)','rgba(255,100,30,0)');
  var pickMeshes=[]; // 用于 raycaster 拾取的 mesh 列表
  function buildMarkers(){
    for(var i=0;i<FOODS.length;i++){
      var f=FOODS[i];
      var pos=ll2v(f.lat,f.lon,R*1.012);
      var grp=new THREE.Group();grp.position.copy(pos);
      // 让标记点 +Z 朝向球面外法线
      grp.lookAt(0,0,0);grp.rotateX(Math.PI);
      var col=new THREE.Color(f.color);
      var dot=new THREE.Mesh(
        new THREE.SphereGeometry(0.058,16,16),
        new THREE.MeshBasicMaterial({color:col})
      );
      dot.userData.index=i;
      var glow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,color:col}));
      glow.scale.set(0.46,0.46,1);
      var ring=new THREE.Sprite(new THREE.SpriteMaterial({map:ringTex,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,color:col,opacity:.8}));
      ring.scale.set(0.72,0.72,1);
      grp.add(dot);grp.add(glow);grp.add(ring);
      markerGroup.add(grp);
      markers.push({food:f,grp:grp,dot:dot,glow:glow,ring:ring,baseGlow:0.46,baseRing:0.72,visible:true});
      pickMeshes.push(dot);
    }
  }
  buildMarkers();

  // ===== 星空点 =====
  var stars=(function(){
    var n=4200,geo=new THREE.BufferGeometry(),pos=new Float32Array(n*3),col=new Float32Array(n*3);
    for(var i=0;i<n;i++){var u=Math.random()*2-1,v=Math.random()*6.2832,s=Math.sqrt(1-u*u),Rr=1100+Math.random()*700;
      pos[i*3]=Rr*s*Math.cos(v);pos[i*3+1]=Rr*u;pos[i*3+2]=Rr*s*Math.sin(v);
      var b=.25+Math.random()*.75,t=Math.random();
      if(t<.2){col[i*3]=b;col[i*3+1]=b*.85;col[i*3+2]=b*.7;}
      else if(t<.3){col[i*3]=b*.9;col[i*3+1]=b*.8;col[i*3+2]=b;}
      else{col[i*3]=b;col[i*3+1]=b*.96;col[i*3+2]=b*.9;}}
    geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    geo.setAttribute('color',new THREE.BufferAttribute(col,3));
    var m=new THREE.PointsMaterial({size:0.55,sizeAttenuation:true,vertexColors:true,transparent:true,opacity:.9,depthWrite:false});
    var p=new THREE.Points(geo,m);scene.add(p);return p;
  })();

  // ===== 纹理加载（容错）=====
  var loader=new THREE.TextureLoader();loader.setCrossOrigin('anonymous');
  var maxA=renderer.capabilities.getMaxAnisotropy();
  function load(u,ok){loader.load(u,ok,undefined,function(){});}
  load('./assets/earth.jpg',function(t){t.encoding=THREE.sRGBEncoding;t.anisotropy=maxA;earthMat.map=t;earthMat.needsUpdate=true;});
  load('./assets/clouds.png',function(t){t.anisotropy=maxA;cloudMat.map=t;cloudMat.alphaMap=t;cloudMat.needsUpdate=true;});

  // ===== 相机 =====
  function fitR(minD){var vFov=camera.fov*Math.PI/180;var hFov=2*Math.atan(Math.tan(vFov/2)*camera.aspect);return Math.max(minD,4.2*R/Math.tan(hFov/2));}
  var PRESETS={
    overview:function(){return[0.9,1.22,fitR(6)];}
  };
  var theta=0.9,phi=1.22,radius=fitR(6);
  var thetaG=theta,phiG=phi,radiusG=radius,userZoomed=false;
  var R_MIN=2.8,R_MAX=60;
  function setCardMode(){}
  function camPos(){var sp=Math.sin(phi);
    camera.position.set(radius*sp*Math.sin(theta),radius*Math.cos(phi),radius*sp*Math.cos(theta));
    camera.lookAt(0,0,0);
  }

  /* 手势：单指旋转 / 双指缩放，互斥。
   * 单指轻点（位移很小、时间很短）走点击拾取，不走旋转。 */
  var pointers={},dragId=null,pinch=0;
  var lx=0,ly=0,downX=0,downY=0,downT=0,moved=0;
  function pCount(){var n=0,k;for(k in pointers)if(pointers[k])n++;return n;}
  function armDrag(id){dragId=id;lx=pointers[id].x;ly=pointers[id].y;}
  function stopDrag(){dragId=null;}
  function tdist(t){return Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);}
  cv.addEventListener('pointerdown',function(e){
    pointers[e.pointerId]={x:e.clientX,y:e.clientY};
    if(pCount()>1){stopDrag();return;}
    armDrag(e.pointerId);
    cv.setPointerCapture(e.pointerId);
    downX=e.clientX;downY=e.clientY;downT=performance.now();moved=0;
    // 开始拖动 → 关闭自动旋转
    stopAutoRotate();
  });
  function onPointerEnd(e){
    delete pointers[e.pointerId];
    if(dragId===e.pointerId)stopDrag();
    try{cv.releasePointerCapture(e.pointerId)}catch(_){}
    var n=pCount();
    if(n===0){
      // 判定是否为"轻点"：位移小、时间短 → 当作点击拾取
      var dt=performance.now()-downT;
      if(moved<6 && dt<280){tryPick(downX,downY);}
      stopDrag();return;
    }
    if(n===1){for(var id in pointers)if(pointers[id]){armDrag(Number(id));break;}}
  }
  cv.addEventListener('pointerup',onPointerEnd);
  cv.addEventListener('pointercancel',onPointerEnd);
  cv.addEventListener('pointermove',function(e){
    var p=pointers[e.pointerId];if(!p)return;
    var nx=e.clientX,ny=e.clientY;
    moved+=Math.hypot(nx-p.x,ny-p.y);
    p.x=nx;p.y=ny;
    if(e.pointerId!==dragId)return;
    if(pCount()>1){stopDrag();return;}
    var dx=nx-lx,dy=ny-ly;lx=nx;ly=ny;
    thetaG-=dx*0.005;phiG-=dy*0.005;phiG=Math.max(0.08,Math.min(Math.PI-0.08,phiG));
  });
  cv.addEventListener('wheel',function(e){e.preventDefault();radiusG*=1+Math.sign(e.deltaY)*0.08;radiusG=Math.max(R_MIN,Math.min(R_MAX,radiusG));userZoomed=true;},{passive:false});
  cv.addEventListener('touchstart',function(e){if(e.touches.length===2){stopDrag();pinch=tdist(e.touches);}},{passive:true});
  cv.addEventListener('touchend',function(e){if(e.touches.length<2)pinch=0;},{passive:true});
  cv.addEventListener('touchcancel',function(){pinch=0;},{passive:true});
  cv.addEventListener('touchmove',function(e){if(e.touches.length!==2)return;e.preventDefault();var d=tdist(e.touches);if(pinch>12&&d>12){radiusG*=pinch/d;radiusG=Math.max(R_MIN,Math.min(R_MAX,radiusG));userZoomed=true;}pinch=d;},{passive:false});

  // ===== 点击拾取 =====
  var raycaster=new THREE.Raycaster();
  var ndc=new THREE.Vector2();
  var hoverIdx=-1,selectedIdx=-1;
  function tryPick(cx,cy){
    ndc.x=(cx/W)*2-1;ndc.y=-(cy/H)*2+1;
    raycaster.setFromCamera(ndc,camera);
    // 仅拾取当前可见的标记点
    var visible=[];
    for(var i=0;i<markers.length;i++){if(markers[i].visible)visible.push(markers[i].dot);}
    var hits=raycaster.intersectObjects(visible,false);
    if(hits.length>0){
      var idx=hits[0].object.userData.index;
      selectFood(idx);
    }
  }
  // 鼠标 hover 高亮（仅桌面端，pointer 不在 touch 上做）
  cv.addEventListener('mousemove',function(e){
    ndc.x=(e.clientX/W)*2-1;ndc.y=-(e.clientY/H)*2+1;
    raycaster.setFromCamera(ndc,camera);
    var visible=[];
    for(var i=0;i<markers.length;i++){if(markers[i].visible)visible.push(markers[i].dot);}
    var hits=raycaster.intersectObjects(visible,false);
    var newHover=hits.length>0?hits[0].object.userData.index:-1;
    if(newHover!==hoverIdx){
      hoverIdx=newHover;
      cv.style.cursor=newHover>=0?'pointer':'';
    }
  });

  // ===== 详情卡片 =====
  var cardEl=document.getElementById('card');
  function selectFood(idx){
    selectedIdx=idx;
    var f=FOODS[idx];
    document.getElementById('cName').textContent=f.name;
    document.getElementById('cLoc').textContent=f.country+' · '+f.city;
    document.getElementById('cIntro').textContent=f.intro;
    document.getElementById('cSwatch').style.background=
      'radial-gradient(circle at 30% 25%,'+lighten(f.color,0.25)+','+f.color+' 55%,'+darken(f.color,0.3)+')';
    var ingEl=document.getElementById('cIng');
    ingEl.innerHTML=f.ingredients.map(function(t){return '<span class="cchip ing">'+t+'</span>';}).join('');
    var tagEl=document.getElementById('cTags');
    tagEl.innerHTML=f.tags.map(function(t){return '<span class="cchip">'+t+'</span>';}).join('');
    cardEl.classList.add('show');
    setCardMode(true);
    // 提示一下选中了哪个
    var hint=document.getElementById('hint');
    hint.textContent='已选中 '+f.name+'（'+f.country+'）';
    hint.classList.add('show');
    clearTimeout(hint._t);
    hint._t=setTimeout(function(){hint.classList.remove('show');},1800);
    // 品尝模式：显示4下一道"按钮 + 进度
    if(tastingMode){
      cActions.style.display='flex';
      cProgress.textContent='第 '+(tastingIdx+1)+' / '+order.length+' 道';
      cNext.textContent=(tastingIdx+1>=order.length)?'品尝完毕 ✓':'下一道 ›';
    }else{
      cActions.style.display='none';
    }
  }
  function clearSelection(){
    selectedIdx=-1;
    cardEl.classList.remove('show');
    setCardMode(false);
  }
  document.getElementById('cClose').addEventListener('click',clearSelection);

  // 颜色明暗工具
  function hex2rgb(h){h=h.replace('#','');return [parseInt(h.substr(0,2),16),parseInt(h.substr(2,2),16),parseInt(h.substr(4,2),16)];}
  function rgb2hex(r){function f(v){v=Math.max(0,Math.min(255,Math.round(v)));return ('0'+v.toString(16)).slice(-2);}return '#'+f(r[0])+f(r[1])+f(r[2]);}
  function lighten(h,a){var r=hex2rgb(h);return rgb2hex([r[0]+(255-r[0])*a,r[1]+(255-r[1])*a,r[2]+(255-r[2])*a]);}
  function darken(h,a){var r=hex2rgb(h);return rgb2hex([r[0]*(1-a),r[1]*(1-a),r[2]*(1-a)]);}

  // ===== 大洲过滤 =====
  var curContinent='all';
  var CONT_NAMES={all:'全部',asia:'亚洲',europe:'欧洲',africa:'非洲',nam:'北美',sam:'南美',oce:'大洋洲'};
  function applyFilter(){
    var cnt={all:0,asia:0,europe:0,africa:0,nam:0,sam:0,oce:0};
    for(var i=0;i<FOODS.length;i++)cnt[FOODS[i].continent]++;
    cnt.all=FOODS.length;
    for(var k in cnt){var el=document.getElementById('cnt-'+k);if(el)el.textContent=' '+cnt[k];}
    for(var i=0;i<markers.length;i++){
      var m=markers[i];
      var on=(curContinent==='all'||m.food.continent===curContinent);
      m.visible=on;
      m.grp.visible=on;
    }
    if(selectedIdx>=0){
      // 当前选中项被过滤掉 → 关闭卡片
      if(curContinent!=='all'&&FOODS[selectedIdx].continent!==curContinent){clearSelection();}
    }
    var stat=document.getElementById('stat');
    var shown=curContinent==='all'?FOODS.length:cnt[curContinent];
    stat.innerHTML='当前显示 <b>'+shown+'</b> / '+FOODS.length+' 道美食<br>覆盖 <b>6</b> 大洲 · <b>'+countCountries()+'</b> 个国家';
  }
  function countCountries(){var s={};for(var i=0;i<FOODS.length;i++)s[FOODS[i].country]=1;return Object.keys(s).length;}

  // 大洲中心经纬度（选能看清该洲标记点的视角）
  var CONT_VIEWS={
    asia:[95,28],europe:[15,52],africa:[20,5],
    nam:[-100,45],sam:[-60,-15],oce:[135,-25]
  };
  function syncPlaySw(){var sw=document.getElementById('swPlay');if(sw)sw.classList.toggle('on',playing);}
  function stopAutoRotate(){if(playing){playing=false;syncPlaySw();}}
  // 定位到 (lat,lon)：标记点挂在 mainSpin 下随地球自转 eSpin，
  // 要让相机对准标记点的"当前世界位置"，需先把局部坐标绕 Y 轴旋转 eSpin 再反推 theta/phi
  function aimAt(lat,lon){
    var local=ll2v(lat,lon,1);
    var cs=Math.cos(eSpin),sn=Math.sin(eSpin);
    var wx=local.x*cs+local.z*sn;
    var wy=local.y;
    var wz=-local.x*sn+local.z*cs;
    phiG=Math.acos(Math.max(-1,Math.min(1,wy)));
    thetaG=Math.atan2(wx,wz);
  }
  function flyToContinent(c){
    stopAutoRotate();
    if(c==='all'){thetaG=0.9;phiG=1.22;return;}
    var v=CONT_VIEWS[c];if(!v)return;
    aimAt(v[1],v[0]);
  }
  document.querySelectorAll('#dock button').forEach(function(b){
    b.addEventListener('click',function(){
      curContinent=b.getAttribute('data-c');
      document.querySelectorAll('#dock button').forEach(function(x){x.classList.toggle('on',x===b);});
      applyFilter();
      flyToContinent(curContinent);
    });
  });

  // ===== 菜单面板 + 点餐流程 =====
  var CONT_ORDER=['asia','europe','africa','nam','sam','oce'];
  var CONT_LABELS={asia:'亚洲',europe:'欧洲',africa:'非洲',nam:'北美洲',sam:'南美洲',oce:'大洋洲'};
  var menuOverlay=document.getElementById('menuOverlay');
  var menuBody=document.getElementById('menuBody');
  var orderCountEl=document.getElementById('orderCount');
  var orderBtn=document.getElementById('orderBtn');
  var cActions=document.getElementById('cActions');
  var cProgress=document.getElementById('cProgress');
  var cNext=document.getElementById('cNext');
  var order=[];           // 已点菜品 idx 列表
  var tastingMode=false;  // 是否在品尝流程中
  var tastingIdx=0;       // 当前品尝到第几道

  function buildMenu(){
    var html='';
    for(var ci=0;ci<CONT_ORDER.length;ci++){
      var c=CONT_ORDER[ci],items=[];
      for(var fi=0;fi<FOODS.length;fi++)if(FOODS[fi].continent===c)items.push(fi);
      if(!items.length)continue;
      html+='<div class="menu-group"><div class="menu-group-title">'+CONT_LABELS[c]+'</div>';
      for(var ii=0;ii<items.length;ii++){
        var f=FOODS[items[ii]];
        var added=order.indexOf(items[ii])>=0;
        html+='<div class="menu-item'+(added?' added':'')+'" data-idx="'+items[ii]+'">'+
          '<div class="mi-dot" style="color:'+f.color+';background:'+f.color+'"></div>'+
          '<div class="mi-info">'+
            '<div class="mi-name">'+f.name+'</div>'+
            '<div class="mi-loc">'+f.country+' · '+f.city+'</div>'+
            '<div class="mi-tags">'+f.tags.join(' · ')+'</div>'+
          '</div>'+
          '<button class="mi-add">'+(added?'✓':'+')+'</button>'+
        '</div>';
      }
      html+='</div>';
    }
    menuBody.innerHTML=html;
    menuBody.querySelectorAll('.menu-item').forEach(function(el){
      el.addEventListener('click',function(){
        toggleOrder(parseInt(el.getAttribute('data-idx'),10));
      });
    });
  }
  function toggleOrder(idx){
    var pos=order.indexOf(idx);
    if(pos>=0)order.splice(pos,1);else order.push(idx);
    updateOrderUI();
    var item=menuBody.querySelector('.menu-item[data-idx="'+idx+'"]');
    if(item){
      var added=order.indexOf(idx)>=0;
      item.classList.toggle('added',added);
      var addBtn=item.querySelector('.mi-add');
      if(addBtn)addBtn.textContent=added?'✓':'+';
    }
  }
  function updateOrderUI(){
    orderCountEl.textContent=order.length;
    orderBtn.disabled=order.length===0;
    orderBtn.textContent=order.length===0?'请先点单':'开始品尝 ('+order.length+')';
  }
  function serveCourse(){
    if(tastingIdx>=order.length){endTasting();return;}
    var idx=order[tastingIdx];
    curContinent='all';
    document.querySelectorAll('#dock button').forEach(function(x){x.classList.toggle('on',x.getAttribute('data-c')==='all');});
    applyFilter();
    stopAutoRotate();
    aimAt(FOODS[idx].lat,FOODS[idx].lon);
    selectFood(idx);
  }
  function startTasting(){
    if(!order.length)return;
    closeMenu();
    tastingMode=true;tastingIdx=0;
    serveCourse();
  }
  function endTasting(){
    tastingMode=false;
    clearSelection();
    var hint=document.getElementById('hint');
    hint.textContent='品尝完毕，欢迎再次光临 🍽️';
    hint.classList.add('show');
    clearTimeout(hint._t);
    hint._t=setTimeout(function(){hint.classList.remove('show');},2800);
  }
  function openMenu(){buildMenu();updateOrderUI();menuOverlay.classList.add('show');}
  function closeMenu(){menuOverlay.classList.remove('show');}
  document.getElementById('menuBtn').addEventListener('click',openMenu);
  document.getElementById('menuClose').addEventListener('click',closeMenu);
  menuOverlay.addEventListener('click',function(e){if(e.target===menuOverlay)closeMenu();});
  orderBtn.addEventListener('click',startTasting);
  cNext.addEventListener('click',function(){
    if(tastingIdx+1>=order.length){endTasting();return;}
    tastingIdx++;serveCourse();
  });

  // ===== 城市标签（仅显示当前可见标记点的城市名）=====
  var tags=[];
  function addTag(obj,text){
    var el=document.createElement('div');el.className='tag';el.textContent=text;el.style.opacity='0';
    document.body.appendChild(el);
    tags.push({obj:obj,el:el});
  }
  for(var i=0;i<markers.length;i++){
    // 标签锚点：在标记点正上方一点
    var anchor=new THREE.Object3D();
    anchor.position.copy(markers[i].grp.position).multiplyScalar(1.04);
    markerGroup.add(anchor);
    markers[i].tagAnchor=anchor;
    addTag(anchor,FOODS[i].city);
  }

  // ===== 设置 =====
  var playing=true,showLabel=true,showStars=true,showClouds=true,showBeam=true;
  function bind(id,fn){var el=document.getElementById(id);el.addEventListener('click',function(){el.classList.toggle('on');fn(el.classList.contains('on'));});}
  bind('swPlay',function(v){playing=v;});
  bind('swLabel',function(v){showLabel=v;});
  bind('swStars',function(v){showStars=v;stars.visible=v;sky.visible=v;});
  bind('swClouds',function(v){showClouds=v;clouds.visible=v;});
  bind('swBeam',function(v){showBeam=v;});
  document.getElementById('bReset').addEventListener('click',function(){var p=PRESETS.overview();thetaG=p[0];phiG=p[1];radiusG=p[2];userZoomed=false;});
  document.getElementById('bTop').addEventListener('click',function(){phiG=0.02;});
  var sheet=document.getElementById('sheet'),scrim=document.getElementById('scrim');
  function openSheet(v){sheet.classList.toggle('show',v);scrim.classList.toggle('show',v);}
  document.getElementById('gear').addEventListener('click',function(){openSheet(true);});
  document.getElementById('sClose').addEventListener('click',function(){openSheet(false);});
  scrim.addEventListener('click',function(){openSheet(false);});

  // ===== 标签投影 =====
  var _v=new THREE.Vector3(),_n=new THREE.Vector3(),_d=new THREE.Vector3();
  var SVGNS='http://www.w3.org/2000/svg';
  var leaders=document.createElementNS(SVGNS,'svg');
  leaders.setAttribute('class','leaders');
  document.body.appendChild(leaders);
  var _lines=[];
  function leaderLine(i){
    var l=_lines[i];
    if(!l){l=document.createElementNS(SVGNS,'line');l.setAttribute('stroke','rgba(255,180,140,.5)');l.setAttribute('stroke-width','1');l.setAttribute('stroke-dasharray','3 3');leaders.appendChild(l);_lines[i]=l;}
    return l;
  }
  var _items=[];
  function collectTags(){
    _items.length=0;
    for(var i=0;i<tags.length;i++){
      var tg=tags[i],el=tg.el,m=markers[i];
      if(!m.visible||!showLabel){el.style.opacity='0';continue;}
      _v.setFromMatrixPosition(tg.obj.matrixWorld);_v.project(camera);
      if(_v.z>=1){el.style.opacity='0';continue;}
      // 仅显示朝向相机这一侧的标签：球心在原点，世界 position 归一化即外法线
      m.grp.getWorldPosition(_n);
      _d.copy(camera.position).sub(_n).normalize();
      _n.normalize();
      if(_n.dot(_d)<0.18){el.style.opacity='0';continue;}
      if(!tg.w){var ww=el.offsetWidth,hh=el.offsetHeight;if(ww>0){tg.w=ww;tg.h=hh;}}
      _items.push({el:el,ax:(_v.x*0.5+0.5)*W,ay:(-_v.y*0.5+0.5)*H,w:tg.w||60,h:tg.h||18,idx:i});
    }
  }
  function layoutTags(){
    var n=_items.length,i,j,it;
    var PAD=6,M=8;
    for(i=0;i<n;i++){it=_items[i];it.cx=it.ax;it.cy=it.ay-it.h*0.9;}
    var cr=cardEl.classList.contains('show')?cardEl.getBoundingClientRect():null;
    var ccx=0,ccy=0,cw=0,ch=0;
    if(cr){ccx=(cr.left+cr.right)*0.5;ccy=(cr.top+cr.bottom)*0.5;cw=cr.right-cr.left;ch=cr.bottom-cr.top;}
    for(var pass=0;pass<4;pass++){
      for(i=0;i<n;i++)for(j=i+1;j<n;j++){
        var a=_items[i],b=_items[j];
        var ox=(a.w+b.w)*0.5+PAD-Math.abs(b.cx-a.cx);
        var oy=(a.h+b.h)*0.5+PAD-Math.abs(b.cy-a.cy);
        if(ox>0&&oy>0){
          if(ox<oy){var sx=(b.cx<a.cx?-1:1)*ox*0.5;a.cx-=sx;b.cx+=sx;}
          else{var sy=(b.cy<a.cy?-1:1)*oy*0.5;a.cy-=sy;b.cy+=sy;}
        }
      }
      for(i=0;i<n;i++){
        it=_items[i];
        if(cr){
          var ox2=(it.w+cw)*0.5+10-Math.abs(ccx-it.cx);
          var oy2=(it.h+ch)*0.5+10-Math.abs(ccy-it.cy);
          if(ox2>0&&oy2>0){
            if(ox2<oy2)it.cx+=(it.cx<ccx?-1:1)*(ox2+2);
            else it.cy-=(oy2+2);
          }
        }
        it.cx=Math.max(M+it.w*0.5,Math.min(W-M-it.w*0.5,it.cx));
        it.cy=Math.max(M+it.h*0.5,Math.min(H-M-it.h*0.5,it.cy));
      }
    }
    var used=0;
    for(i=0;i<n;i++){
      it=_items[i];
      it.tx=it.cx;it.ty=it.cy+it.h*0.9;
      it.el.style.left=it.tx.toFixed(1)+'px';it.el.style.top=it.ty.toFixed(1)+'px';it.el.style.opacity='1';
      if(Math.abs(it.tx-it.ax)<3&&Math.abs(it.ty-it.ay)<3)continue;
      var rx0=it.cx-it.w*0.5,rx1=it.cx+it.w*0.5,ry0=it.cy-it.h*0.5,ry1=it.cy+it.h*0.5;
      var px=Math.max(rx0,Math.min(it.ax,rx1)),py=Math.max(ry0,Math.min(it.ay,ry1));
      if(px===it.ax&&py===it.ay){
        var dl=it.ax-rx0,dr=rx1-it.ax,dt=it.ay-ry0,db=ry1-it.ay,mn=Math.min(dl,dr,dt,db);
        if(mn===dl)px=rx0;else if(mn===dr)px=rx1;else if(mn===dt)py=ry0;else py=ry1;
      }
      var l=leaderLine(used++);
      l.setAttribute('x1',it.ax.toFixed(1));l.setAttribute('y1',it.ay.toFixed(1));
      l.setAttribute('x2',px.toFixed(1));l.setAttribute('y2',py.toFixed(1));
      l.style.display='';
    }
    for(i=used;i<_lines.length;i++)_lines[i].style.display='none';
  }
  function updateTags(){collectTags();layoutTags();}

  // ===== 选中标记点的脉冲高亮（在动画里调）=====
  function updateMarkers(t){
    for(var i=0;i<markers.length;i++){
      var m=markers[i];
      if(!m.visible)continue;
      var isSel=(i===selectedIdx),isHov=(i===hoverIdx);
      var pulse=0.5+0.5*Math.sin(t*2.6+i*0.7);
      var glowScale=m.baseGlow*(1+0.28*pulse)+(isSel?0.28:0)+(isHov?0.14:0);
      var ringScale=m.baseRing*(1+0.34*pulse)+(isSel?0.34:0)+(isHov?0.18:0);
      m.glow.scale.set(glowScale,glowScale,1);
      m.ring.scale.set(ringScale,ringScale,1);
      m.dot.scale.setScalar(isSel?1.8:(isHov?1.4:1));
    }
  }

  // ===== 动画 =====
  var clock=new THREE.Clock();
  var running=true,perfAccum=0,perfCount=0,dprStep=DPR;
  var eSpin=2.68;
  var EARTH_SPIN=0.18; // 慢一点，方便看清标记
  function animate(){
    if(!running)return;
    requestAnimationFrame(animate);
    var dt=clock.getDelta(),t=performance.now()*0.001;
    if(playing){
      var s=dt;
      eSpin+=s*EARTH_SPIN;
      mainSpin.rotation.y=eSpin;clouds.rotation.y=eSpin*1.12;
      stars.rotation.y+=s*0.003;sky.rotation.y+=s*0.001;
    }
    theta+=(thetaG-theta)*0.12;phi+=(phiG-phi)*0.12;radius+=(radiusG-radius)*0.1;
    camPos();
    renderer.render(scene,camera);
    updateMarkers(t);
    updateTags();
    perfAccum+=dt;perfCount++;
    if(perfCount>=30){var avg=perfAccum/perfCount;perfAccum=0;perfCount=0;if(avg>0.04&&dprStep>1){dprStep=Math.max(1,dprStep-0.25);renderer.setPixelRatio(dprStep);renderer.setSize(W,H,false);}}
  }
  addEventListener('resize',function(){
    W=innerWidth;H=innerHeight;camera.aspect=W/H;camera.updateProjectionMatrix();renderer.setSize(W,H,false);
    if(!userZoomed){radiusG=PRESETS.overview()[2];}
  });
  addEventListener('visibilitychange',function(){if(document.hidden){running=false;}else if(!running){running=true;clock.getDelta();animate();}});
  cv.addEventListener('webglcontextlost',function(e){e.preventDefault();running=false;document.getElementById('loader').classList.add('hide');document.getElementById('fallback').classList.add('show');},false);

  // ===== 启动 =====
  applyFilter();
  setCardMode(false);
  animate();
  setTimeout(function(){document.getElementById('loader').classList.add('hide');},600);
  // 加载完成后自动弹出菜单（虚拟餐厅点餐流程）
  setTimeout(function(){openMenu();},900);
})();
