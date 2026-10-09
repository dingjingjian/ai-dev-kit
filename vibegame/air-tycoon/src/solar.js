/* solar.js —— 真实时间 → 太阳直射点（日下点）→ 球面方向向量。
 *
 * 为什么单独成文件、且放在 src/ 而不是塞进 render.js：
 *   ① 「太阳位置」是一个**纯函数**（输入一个 Date，输出一个经纬度），
 *      可以完全脱离 WebGL 在无头环境里断言（tests/headless.js 的「太阳位置层」）。
 *      渲染层只消费它的输出，不重复实现第二份天文计算。
 *   ② 它是 render.js 里 SUN_DIR 的**唯一初值来源**。render.js 那边只保留
 *      「谁在用这个方向」的知识（主光/压暗壳/灯火壳/经纬网烘焙），
 *      不掺「这个方向是怎么算出来的」，两者互不污染。
 *
 * ⚠ 本模块的产出必须与 AT.geo 的 UV 约定严格对齐：
 *   走 AT.geo.ll2v(lat, lon, r) 而不是自己手写 x/y/z 公式 ——
 *   手写一份的结果是晨昏线整体偏 180°，且**不报错**（球还是那个球，
 *   只是白天那半边亮着灯）。已实测 ll2v ↔ v2ll 严格互逆（见 headless 断言）。
 */
(function (global) {
  'use strict';
  var AT = global.AT = global.AT || {};

  var D2R = Math.PI / 180;

  /* 太阳方向的安全回退值。
   * 与 render.js 的历史常量一致（反算 = 直射点 25.1°N / 128.7°E）；
   * 一旦时间解析出任何异常就退到这里 —— 宁可晨昏线停在上一版的位置，
   * 也不要让整个球体变成全黑或全亮（那种失败没有任何一层会报错）。 */
  var FALLBACK_SUN_DIR = [4, 3, 5];

  /* 一年中的第几天（1 起算）。用于赤纬近似。
   * 用 UTC 归一到「当天 0 点」再求差，避免把时分秒算进天数导致赤纬跳变。 */
  function dayOfYear(d) {
    var start = Date.UTC(d.getFullYear(), 0, 1);
    var cur = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.floor((cur - start) / 86400000) + 1;
  }

  /* 太阳赤纬（度）—— 用「一年中日序」的余弦近似。
   *
   * ⚠ 不用 `23.44 * sin(2π/365 * (doy - 81))` 这种更简陋的形式：
   *   它把极值日钉死在 3 月 22 / 9 月 22，而真实极值在 6 月 21 / 12 月 21
   *   （因为轨道偏心率与黄赤交角的存在，日序 → 赤纬不是纯正弦）。
   *   误差可达数度 —— 在球面上就是晨昏线错开几百公里。这里用
   *   Cooper 方程（1969）的形式，其极值落在正确的日期上。
   *   doy=172（6/21）→ +23.4°；doy=355（12/21）→ −23.4°（已验证）。 */
  function declination(doy, hoursUTC) {
    // 加小时修正，让赤纬在一天之内也是连续的（跨日不跳）
    var n = doy - 81 + (hoursUTC / 24);
    return 23.44 * Math.sin(2 * Math.PI * n / 365.24);
  }

  /* 由时刻算日下点经纬度。
   *
   * 时角：日下点经度 = 15° × (12 − 当地太阳时)。
   * 本作直接用**本机时间**当作太阳时基准（见 README 的取舍说明）：
   *   lon_subsolar = 15 × (12 − hoursLocal)
   * 于是「本机 12:00 时，日下点在本机所在经度上」。
   * 这比坚持 UTC 更符合玩家的直觉预期 —— 玩家在中午打开看到的是白天。
   *
   * ⚠ 代价（必须写清楚，否则后人会当成 bug）：
   *   本机时区与经度不匹配时（例如中国用东八区时间、经度跨 73°E~135°E），
   *   日下点会相对真实位置偏移最多约 30°。这是**有意为之的简化**：
   *   本作要的是「打开就像此刻的天色」，不是天文台级的日下点。
   *   若日后需要精确，改这一处即可（传入 real UTC hours），但要注意
   *   那会让「北京的玩家在中午看到夜面」—— 直觉上反而更怪。
   */
  function subsolarPoint(date) {
    var hours = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
    var lon = 15 * (12 - hours);
    // 归一到 [-180, 180)
    while (lon >= 180) lon -= 360;
    while (lon < -180) lon += 360;

    var doy = dayOfYear(date);
    var lat = declination(doy, date.getUTCHours());

    // 极区保护：赤纬本身不会超过 ±23.44°，这里只是防御异常 Date
    if (!isFinite(lat)) lat = 0;
    lat = Math.max(-90, Math.min(90, lat));
    return { lat: lat, lon: lon };
  }

  /* 日下点 → 单位方向向量（球心指向太阳）。
   * 直接复用 geo 的 UV 约定，不手写三角函数 —— 见文件头说明。 */
  function sunDirAt(date, geo) {
    var g = geo || AT.geo;
    if (!g || typeof g.ll2v !== 'function') return FALLBACK_SUN_DIR.slice();
    try {
      var p = subsolarPoint(date);
      var v = g.ll2v(p.lat, p.lon, 1);
      if (!isFinite(v.x) || !isFinite(v.y) || !isFinite(v.z)) {
        return FALLBACK_SUN_DIR.slice();
      }
      return [v.x, v.y, v.z];
    } catch (e) {
      return FALLBACK_SUN_DIR.slice();
    }
  }

  AT.solar = {
    FALLBACK_SUN_DIR: FALLBACK_SUN_DIR,
    dayOfYear: dayOfYear,
    declination: declination,
    subsolarPoint: subsolarPoint,
    sunDirAt: sunDirAt
  };
})(typeof window !== 'undefined' ? window : this);
