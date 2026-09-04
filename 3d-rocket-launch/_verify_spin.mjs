// 临时验证脚本：核实 3d-rocket-launch 地球自转的轴倾角/经度/东向与火箭下程方向是否一致
// 复刻 math.js 的 mat4 语义（列向量、右乘）与 engine.js geom.sphere 的 UV 映射

function rotY(a) { const c = Math.cos(a), s = Math.sin(a); return [c,0,s, 0,1,0, -s,0,c]; } // 行主序写出,按列向量作用: v' = R v
function rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return [c,-s,0, s,c,0, 0,0,1]; }
function mul(A, B) { // A,B 为 3x3 行主序
  const O = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++)
    O[r*3+c] = A[r*3]*B[c] + A[r*3+1]*B[3+c] + A[r*3+2]*B[6+c];
  return O;
}
function apply(R, v) { return [R[0]*v[0]+R[1]*v[1]+R[2]*v[2], R[3]*v[0]+R[4]*v[1]+R[5]*v[2], R[6]*v[0]+R[7]*v[1]+R[8]*v[2]]; }

// 验证 math.js rotateY/rotateZ 的方向语义：对 +X 单位向量做 rotateY(+90°)
// math.js: o[0]=a00*c-a20*s, o[8]=a00*s+a20*c → Ry(+90°)·(1,0,0) = (0,0,-1)
// 对应这里 rotY(90°)·(1,0,0) = (cos90, 0, -sin90) = (0,0,-1) ✓ 语义一致
console.log('Ry(90)*X =', apply(rotY(Math.PI/2), [1,0,0]), '(期望 [0,0,-1])');
console.log('Rz(-50)*Y =', apply(rotZ(-50*Math.PI/180), [0,1,0]).map(x=>x.toFixed(3)), '(期望 [-0.766, 0.643, 0])');

const D = Math.PI/180;
// ---- 纹理点 -> 模型球面点（engine.js geom.sphere 映射）----
// v=1 为 +Y 北极；u = 1 - j/seg，u=0 对应西经180°，自西向东递增
// 推导：lon = 180° - th（th 为方位角，x=sp*cos(th), z=sp*sin(th)）
function texToPos(latDeg, lonDeg) {
  const phi = (90 - latDeg) * D;          // 极角
  const th = (180 - lonDeg) * D;          // 方位角
  const sp = Math.sin(phi), cp = Math.cos(phi);
  return [sp*Math.cos(th), cp, sp*Math.sin(th)];
}
function posToLatLon(p) {
  const lat = 90 - Math.acos(Math.max(-1, Math.min(1, p[1]))) / D;
  const th = Math.atan2(p[2], p[0]) / D;  // [-180,180]
  let lon = 180 - th;
  if (lon > 180) lon -= 360; if (lon < -180) lon += 360;
  return [lat, lon];
}

function analyze(name, SPIN0, useY90) {
  // spinEarth: M = T · [Ry(90°)] · Rz(-tilt) · Ry(spin)，自转 spin 从 0 开始
  let M = rotZ(-50*D);
  if (useY90) M = mul(rotY(Math.PI/2), M);
  M = mul(M, rotY(SPIN0));
  // 发射台钉在世界 +Y（地心在 (0,-R,0)，台面即球面 +Y 点）→ 求落在该点的纹理经纬度
  // p = M^-1 · ŷ = Ry(-spin0) · Rz(+tilt) · [Ry(-90°)] · ŷ
  let Minv = rotY(-SPIN0);
  Minv = mul(Minv, rotZ(50*D));
  if (useY90) Minv = mul(Minv, rotY(-Math.PI/2));
  const pad = apply(Minv, [0,1,0]);
  const [lat, lon] = posToLatLon(pad);
  // 东向切向量（模型系）= ŷ × r̂，转世界
  const e = [-pad[2], 0, pad[0]];   // ŷ×p̂ = ( p_z·1? ...) 直接算：(1*pz-0, 0, -px)?? 用叉积公式
  // ŷ×p = (y2*p3-y3*p2, y3*p1-y1*p3, y1*p2-y2*p1), ŷ=(0,1,0) → (p3, 0, -p1)
  const em = [pad[2], 0, -pad[0]];
  const ew = apply(M, em);
  // 北向切向量 = p̂ × east
  const cross = (a,b)=>[a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const nw = apply(M, cross(pad, em));
  console.log('\n[' + name + '] 发射场落在纹理: 纬度 ' + lat.toFixed(1) + '°, 经度 ' + lon.toFixed(1) + '°');
  console.log('  世界东向 = (' + ew.map(x=>x.toFixed(3)).join(', ') + ')   火箭下程方向 = (+X)');
  console.log('  世界北向 = (' + nw.map(x=>x.toFixed(3)).join(', ') + ')   地轴(世界) = (' + apply(M,[0,1,0]).map(x=>x.toFixed(3)).join(', ') + ')');
}
analyze('现状 SPIN0=+100°, 无 Ry(90)', 100*D, false);
analyze('修正 SPIN0=-100° + Ry(90°)', -100*D, true);
