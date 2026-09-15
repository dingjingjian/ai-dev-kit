/* 拼豆城市 · 真实图纸渲染器：把 buildings.json 的像素稿画成拼豆 */
window.BEAD = (function () {
  function renderSvg(b, bead, opts) {
    opts = opts || {};
    var pal = window.BEADS.pal;
    var rows = b.rows;
    var n = rows.length;
    var size = n * bead;
    var cells = "";
    for (var y = 0; y < n; y++) {
      var row = rows[y];
      for (var x = 0; x < n; x++) {
        var ch = row[x];
        if (ch === "." || ch === " ") continue;
        var hex = pal[ch] || "#ccc";
        var cx = x * bead + bead / 2;
        var cy = y * bead + bead / 2;
        // 豆子：外圈 + 底部暗弧 + 中心孔
        cells += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (bead * 0.42) + '" fill="' + hex + '"/>';
        cells += '<circle cx="' + cx + '" cy="' + (cy + bead * 0.12) + '" r="' + (bead * 0.30) + '" fill="rgba(0,0,0,0.18)"/>';
        cells += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (bead * 0.14) + '" fill="rgba(20,20,35,0.55)"/>';
        if (bead >= 8) {
          cells += '<circle cx="' + (cx - bead * 0.12) + '" cy="' + (cy - bead * 0.14) + '" r="' + (bead * 0.10) + '" fill="rgba(255,255,255,0.35)"/>';
        }
      }
    }
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size +
      '" shape-rendering="crispEdges">' + cells + '</svg>';
  }

  function catColor(id) {
    var c = window.BEADS.cats[id];
    return c ? c.color : "#999";
  }
  function catName(id) {
    var c = window.BEADS.cats[id];
    return c ? c.name : id;
  }
  function byId(id) {
    for (var i = 0; i < window.BEADS.buildings.length; i++) {
      if (window.BEADS.buildings[i].id === id) return window.BEADS.buildings[i];
    }
    return null;
  }
  // 每个建筑的关键一行数值（贴合游戏属性）
  function statLine(b) {
    var parts = [];
    parts.push("造价 " + b.cost);
    if (b.popCap) parts.push("住" + b.popCap);
    if (b.jobs) parts.push("岗" + b.jobs);
    if (b.income) parts.push("+" + b.income + "/分");
    var gen = b.gen || {};
    if (gen.power) parts.push("发电+" + gen.power);
    if (gen.water) parts.push("供水+" + gen.water);
    if (gen.trash) parts.push("运力+" + gen.trash);
    if (b.happy > 0) parts.push("幸福+" + b.happy);
    else if (b.happy < 0) parts.push("幸福" + b.happy);
    return parts.join(" · ");
  }
  return { renderSvg: renderSvg, catColor: catColor, catName: catName, byId: byId, statLine: statLine };
})();
