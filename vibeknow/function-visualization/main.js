const cv=document.getElementById('cv'),ctx=cv.getContext('2d');
const DPR=Math.min(window.devicePixelRatio||1,2);
let W=900,H=520;
function resize(){
  if(matchMedia('(min-width:921px)').matches){
    var r=cv.getBoundingClientRect();
    if(r.width&&r.height){W=r.width;H=r.height;cv.width=W*DPR;cv.height=H*DPR;ctx.setTransform(DPR,0,0,DPR,0,0);}
  }else{
    var r=cv.getBoundingClientRect();
    if(r.width){W=r.width;H=Math.max(360,Math.min(520,Math.round(W*0.62)));}else{W=900;H=520;}
    cv.width=W*DPR;cv.height=H*DPR;ctx.setTransform(DPR,0,0,DPR,0,0);
  }
}
let OX,OY;
const SX=40,SY=40;
let XMIN,XMAX,YMIN,YMAX;
function updateCoord(){
  OX=W/2; OY=H/2;
  XMIN=-Math.floor(OX/SX); XMAX=Math.ceil((W-OX)/SX);
  YMIN=-Math.ceil(OY/SY); YMAX=Math.floor((H-OY)/SY);
}
resize();updateCoord();
if(window.ResizeObserver)new ResizeObserver(()=>{resize();updateCoord();}).observe(cv);

let ftype='linear';
let params={a:1.0,b:0.0,c:0.0};
let showGrid=true;
let mouseX=-1,mouseY=-1;

function toSx(x){return OX+x*SX;}
function toSy(y){return OY-y*SY;}
function fromSx(px){return (px-OX)/SX;}
function fromSy(py){return (OY-py)/SY;}

function evalF(x){
  const a=params.a,b=params.b,c=params.c;
  switch(ftype){
    case 'linear':return a*x+b;
    case 'quadratic':return a*x*x+b*x+c;
    case 'inverse':return Math.abs(x)<1e-6?NaN:(b===0?(a/x):(a/x));
    case 'exp':return Math.pow(a,x);
    case 'log':return a>0&&a!==1?Math.log(x)/Math.log(a):NaN;
    case 'trig':return a*Math.sin(b*x+c);
  }
  return 0;
}

function describe(){
  const a=params.a,b=params.b,c=params.c;
  let formula='',feat='',narr='',hud='';
  switch(ftype){
    case 'linear':
      formula='y = '+a+'x + ('+b+')';
      const root=a!==0?(-b/a).toFixed(2):'无（a=0）';
      feat='斜率 k='+a+'，y 轴截距 b='+b+'。<strong>零点</strong>：x='+root+'。'+(a>0?'<span class="hl">单调递增</span>':a<0?'<span class="hl">单调递减</span>':'常数函数');
      narr='一次函数图像是<span class="hl">一条直线</span>。斜率 a&gt;0 时<span class="hl2">上升</span>，a&lt;0 时<span class="hl2">下降</span>，a=0 为水平线。<span class="ev">注意 a 不能同时影响截距。</span>';
      hud='直线 · 斜率 <b>'+a+'</b> · 截距 <b>'+b+'</b>';
      break;
    case 'quadratic':
      formula='y = '+a+'x² + '+b+'x + '+c;
      const vx=a!==0?(-b/(2*a)).toFixed(2):'—';
      const vy=a!==0?(a*vx*vx+b*vx+c).toFixed(2):'—';
      const disc=b*b-4*a*c;
      let roots;
      if(a===0)roots='退化为一次函数';
      else if(disc>0)roots='两个实根 x='+((-b+Math.sqrt(disc))/(2*a)).toFixed(2)+', '+((-b-Math.sqrt(disc))/(2*a)).toFixed(2);
      else if(disc===0)roots='一个重根 x='+vx;
      else roots='无实数零点';
      feat='开口'+(a>0?'<span class="hl">向上</span>':a<0?'<span class="hl">向下</span>':'直线')+'。<strong>顶点</strong>('+vx+', '+vy+')。<strong>零点</strong>：'+roots+'。<strong>对称轴</strong> x='+vx;
      narr='二次函数图像是<span class="hl">抛物线</span>。a&gt;0 开口向上，a&lt;0 开口向下。<span class="hl2">|a| 越大开口越小</span>。<span class="ev">判别式 Δ=b²−4ac 决定零点个数。</span>';
      hud='抛物线 · 顶点(<b>'+vx+'</b>, <b>'+vy+'</b>)';
      break;
    case 'inverse':
      formula='y = '+a+'/x';
      feat='<strong>定义域</strong> x≠0。<strong>渐近线</strong>：x 轴与 y 轴。'+(a>0?'<span class="hl">在一、三象限</span>，每象限单调递减':'在<span class="hl">二、四象限</span>，每象限单调递增')+'。<strong>无零点</strong>。';
      narr='反比例函数图像是<span class="hl">双曲线</span>，以两条坐标轴为<span class="hl2">渐近线</span>。<span class="ev">定义域 x≠0，且在每一段内单调，整体不单调。</span>';
      hud='双曲线 · k=<b>'+a+'</b>';
      break;
    case 'exp':
      formula='y = '+a+'ˣ';
      feat='底数 a='+a+'。'+(a>1?'<span class="hl">单调递增</span>':(a>0&&a<1?'<span class="hl">单调递减</span>':'<span class="ev">底数须 a&gt;0 且 a≠1</span>'))+'。<strong>恒过点</strong>(0,1)。<strong>渐近线</strong>：y=0（x 轴）。<strong>值域</strong>(0,+∞)。';
      narr='指数函数 <span class="hl">aˣ</span> 恒过 (0,1)。a&gt;1 时<span class="hl2">随 x 增大快速增长</span>；0&lt;a&lt;1 时递减。<span class="ev">底数必须 a&gt;0 且 a≠1。</span>';
      hud='指数 · 底数 a=<b>'+a+'</b>';
      break;
    case 'log':
      formula='y = log'+a+'(x)';
      feat='底数 a='+a+'。<strong>定义域</strong> x&gt;0。'+(a>1?'<span class="hl">单调递增</span>':(a>0&&a<1?'<span class="hl">单调递减</span>':'<span class="ev">底数须 a&gt;0 且 a≠1</span>'))+'。<strong>恒过点</strong>(1,0)。<strong>渐近线</strong>：x=0（y 轴）。';
      narr='对数函数是<span class="hl">指数函数的反函数</span>，图像关于 y=x 对称。恒过 (1,0)。<span class="ev">定义域 x&gt;0，底数 a&gt;0 且 a≠1。</span>';
      hud='对数 · 底数 a=<b>'+a+'</b>';
      break;
    case 'trig':
      formula='y = '+a+'·sin('+b+'x + '+c+')';
      const T=b!==0?(2*Math.PI/Math.abs(b)).toFixed(2):'∞';
      const A=Math.abs(a);
      feat='<strong>振幅</strong> A='+A+'。<strong>周期</strong> T='+T+'。<strong>初相</strong> φ='+c+'。<strong>值域</strong> ['+(-A)+', '+A+']。<strong>频率</strong> ω='+b+'。';
      narr='正弦函数 <span class="hl">Asin(ωx+φ)</span>：A 控制<span class="hl2">振幅</span>，ω 控制<span class="hl2">周期</span>（T=2π/|ω|），φ 控制<span class="hl2">相位平移</span>。<span class="ev">周期与 ω 成反比。</span>';
      hud='正弦 · 振幅<b>'+A+'</b> · 周期<b>'+T+'</b>';
      break;
  }
  document.getElementById('formula').innerHTML='当前公式：<code>'+formula+'</code>';
  document.getElementById('explain').innerHTML='<strong>关键特征</strong>：'+feat;
  document.getElementById('narr').innerHTML=narr;
  document.getElementById('hud-type').textContent=formula;
  document.getElementById('hud').innerHTML='移动鼠标查看坐标 · 当前：<b id="hud-type">'+hud+'</b>';
}

function drawAxes(){
  if(showGrid){
    ctx.strokeStyle='rgba(100,116,139,0.10)';ctx.lineWidth=1;
    for(let x=Math.ceil(XMIN);x<=XMAX;x++){
      ctx.beginPath();ctx.moveTo(toSx(x),0);ctx.lineTo(toSx(x),H);ctx.stroke();
    }
    for(let y=Math.ceil(YMIN);y<=YMAX;y++){
      ctx.beginPath();ctx.moveTo(0,toSy(y));ctx.lineTo(W,toSy(y));ctx.stroke();
    }
  }
  ctx.strokeStyle='#64748b';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(0,OY);ctx.lineTo(W,OY);ctx.stroke();
  ctx.beginPath();ctx.moveTo(OX,0);ctx.lineTo(OX,H);ctx.stroke();
  ctx.fillStyle='#64748b';
  ctx.beginPath();ctx.moveTo(W-2,OY);ctx.lineTo(W-12,OY-5);ctx.lineTo(W-12,OY+5);ctx.fill();
  ctx.beginPath();ctx.moveTo(OX,2);ctx.lineTo(OX-5,12);ctx.lineTo(OX+5,12);ctx.fill();
  ctx.fillStyle='#64748b';ctx.font='11px sans-serif';ctx.textAlign='center';
  for(let x=Math.ceil(XMIN);x<=XMAX;x++){
    if(x===0)continue;
    ctx.beginPath();ctx.moveTo(toSx(x),OY-3);ctx.lineTo(toSx(x),OY+3);ctx.stroke();
    if(x%2===0)ctx.fillText(x,toSx(x),OY+15);
  }
  ctx.textAlign='right';
  for(let y=Math.ceil(YMIN);y<=YMAX;y++){
    if(y===0)continue;
    ctx.beginPath();ctx.moveTo(OX-3,toSy(y));ctx.lineTo(OX+3,toSy(y));ctx.stroke();
    ctx.fillText(y,OX-6,toSy(y)+4);
  }
  ctx.textAlign='left';ctx.fillStyle='#1e293b';ctx.font='600 13px sans-serif';
  ctx.fillText('x',W-18,OY-8);
  ctx.fillText('y',OX+8,14);
  ctx.fillText('O',OX-12,OY+14);
}

function drawAsymptote(x,y){
  ctx.save();
  ctx.setLineDash([4,4]);ctx.strokeStyle='rgba(220,38,38,0.5)';ctx.lineWidth=1;
  if(x!==null){ctx.beginPath();ctx.moveTo(toSx(x),0);ctx.lineTo(toSx(x),H);ctx.stroke();}
  if(y!==null){ctx.beginPath();ctx.moveTo(0,toSy(y));ctx.lineTo(W,toSy(y));ctx.stroke();}
  ctx.restore();
}

function draw(){
  ctx.fillStyle='#f5f8fb';ctx.fillRect(0,0,W,H);
  drawAxes();

  if(ftype==='inverse'){drawAsymptote(0,0);}
  if(ftype==='exp'){drawAsymptote(null,0);}
  if(ftype==='log'){drawAsymptote(0,null);}

  ctx.strokeStyle='#0284c7';ctx.lineWidth=2.5;
  ctx.beginPath();
  let started=false;
  const xLo=ftype==='log'?0.001:XMIN;
  for(let px=0;px<=W;px+=1){
    const x=fromSx(px);
    if(ftype==='log'&&x<=0){started=false;continue;}
    if(ftype==='inverse'&&Math.abs(x)<1e-6){started=false;continue;}
    const y=evalF(x);
    if(!isFinite(y)){started=false;continue;}
    const sy=toSy(y);
    if(sy<-200||sy>H+200){started=false;continue;}
    if(!started){ctx.moveTo(px,sy);started=true;}
    else ctx.lineTo(px,sy);
  }
  ctx.stroke();

  drawKeyPoints();

  if(mouseX>=0){
    const x=fromSx(mouseX);
    let yInfo='';
    if(!(ftype==='log'&&x<=0)&&!(ftype==='inverse'&&Math.abs(x)<1e-6)){
      const y=evalF(x);
      if(isFinite(y)){
        const sy=toSy(y);
        if(sy>=0&&sy<=H){
          ctx.fillStyle='#dc2626';ctx.beginPath();ctx.arc(mouseX,sy,5,0,Math.PI*2);ctx.fill();
          ctx.strokeStyle='#dc2626';ctx.setLineDash([3,3]);ctx.lineWidth=1;
          ctx.beginPath();ctx.moveTo(mouseX,0);ctx.lineTo(mouseX,H);ctx.stroke();
          ctx.beginPath();ctx.moveTo(0,sy);ctx.lineTo(W,sy);ctx.stroke();
          ctx.setLineDash([]);
          yInfo=' · y=<b>'+y.toFixed(2)+'</b>';
        }
      }
    }
    var ht=document.getElementById('hud-type');
    document.getElementById('hud').innerHTML='x=<b>'+x.toFixed(2)+'</b>'+yInfo+' · <b id="hud-type">'+(ht?ht.textContent:'')+'</b>';
  }

  requestAnimationFrame(draw);
}

function drawKeyPoints(){
  const a=params.a,b=params.b,c=params.c;
  ctx.fillStyle='#dc2626';ctx.strokeStyle='#dc2626';ctx.lineWidth=1.5;
  function dot(x,y,label){
    const sx=toSx(x),sy=toSy(y);
    if(sx<0||sx>W||sy<0||sy>H)return;
    ctx.beginPath();ctx.arc(sx,sy,5,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#1e293b';ctx.font='11px sans-serif';ctx.textAlign='left';
    ctx.fillText(label,sx+8,sy-6);
    ctx.fillStyle='#dc2626';
  }
  if(ftype==='linear'&&a!==0){
    dot(-b/a,0,'零点');
    dot(0,b,'截距');
  }else if(ftype==='quadratic'&&a!==0){
    const vx=-b/(2*a),vy=a*vx*vx+b*vx+c;
    dot(vx,vy,'顶点');
    const disc=b*b-4*a*c;
    if(disc>=0){
      const r1=(-b-Math.sqrt(disc))/(2*a),r2=(-b+Math.sqrt(disc))/(2*a);
      if(disc===0)dot(r1,0,'重根');
      else{dot(r1,0,'x₁');dot(r2,0,'x₂');}
    }
  }else if(ftype==='exp'){
    dot(0,1,'(0,1)');
  }else if(ftype==='log'){
    dot(1,0,'(1,0)');
  }
}

function bindParam(id,key){
  const el=document.getElementById(id);
  const lbl=document.getElementById('v'+key);
  el.addEventListener('input',()=>{
    let v=parseFloat(el.value)/10;
    params[key]=v;
    lbl.textContent=v.toFixed(1);
    describe();
  });
}
bindParam('pa','a');bindParam('pb','b');bindParam('pc','c');

const activeParams={
  linear:['a','b'],quadratic:['a','b','c'],inverse:['a'],
  exp:['a'],log:['a'],trig:['a','b','c']
};
function updateParamState(){
  const active=activeParams[ftype]||[];
  ['a','b','c'].forEach(p=>{
    const row=document.querySelector('.row[data-p="'+p+'"]');
    if(active.includes(p)) row.classList.remove('disabled');
    else row.classList.add('disabled');
  });
}
updateParamState();

document.querySelectorAll('.mode-btn[data-f]').forEach(b=>{
  b.addEventListener('click',()=>{
    document.querySelectorAll('.mode-btn[data-f]').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    ftype=b.dataset.f;
    if(ftype==='linear'){params={a:1,b:0,c:0};}
    else if(ftype==='quadratic'){params={a:0.5,b:0,c:-3};}
    else if(ftype==='inverse'){params={a:4,b:0,c:0};}
    else if(ftype==='exp'){params={a:2,b:0,c:0};}
    else if(ftype==='log'){params={a:2,b:0,c:0};}
    else if(ftype==='trig'){params={a:3,b:1,c:0};}
    syncSliders();
    updateParamState();
    describe();
  });
});

function syncSliders(){
  document.getElementById('pa').value=params.a*10;document.getElementById('va').textContent=params.a.toFixed(1);
  document.getElementById('pb').value=params.b*10;document.getElementById('vb').textContent=params.b.toFixed(1);
  document.getElementById('pc').value=params.c*10;document.getElementById('vc').textContent=params.c.toFixed(1);
}

const defaultParams={
  linear:{a:1,b:0,c:0},quadratic:{a:0.5,b:0,c:-3},inverse:{a:4,b:0,c:0},
  exp:{a:2,b:0,c:0},log:{a:2,b:0,c:0},trig:{a:3,b:1,c:0}
};
document.getElementById('reset').addEventListener('click',()=>{
  params={...defaultParams[ftype]};syncSliders();describe();
});
document.getElementById('toggle-grid').addEventListener('click',()=>{showGrid=!showGrid;});

function updateMouseFromX(clientX){
  const rect=cv.getBoundingClientRect();
  mouseX=(clientX-rect.left)*(W/rect.width);
}
cv.addEventListener('mousemove',e=>{updateMouseFromX(e.clientX);});
cv.addEventListener('mouseleave',()=>{mouseX=-1;});
cv.addEventListener('touchstart',e=>{if(e.touches.length){updateMouseFromX(e.touches[0].clientX);}},{passive:true});
cv.addEventListener('touchmove',e=>{if(e.touches.length){e.preventDefault();updateMouseFromX(e.touches[0].clientX);}},{passive:false});
cv.addEventListener('touchend',()=>{mouseX=-1;});

syncSliders();
describe();
draw();

!function(){function f(){var h=document.querySelector('header');if(h)document.documentElement.style.setProperty('--header-h',h.offsetHeight+'px')}f();addEventListener('resize',f);addEventListener('load',f)}();
