
(function() {
  'use strict';

  var BEAD_DIAMETER_MM = 5;

  var BEAD_COLORS = [
    { code: '23', name: '白色', hex: '#FFFFFF', group: '白色系' },
    { code: '17', name: '月牙白', hex: '#F8F6EA', group: '白色系' },
    { code: '7', name: '半透明', hex: '#E6F0EF', group: '白色系' },
    { code: '8', name: '浅肤', hex: '#FFDFC4', group: '肤色系' },
    { code: '18', name: '肤色粉', hex: '#F5C9BC', group: '肤色系' },
    { code: '19', name: '肤色', hex: '#FFCBA4', group: '肤色系' },
    { code: '16', name: '肤色红', hex: '#E8A08A', group: '肤色系' },
    { code: '20', name: '月牙黄', hex: '#F5EEB8', group: '黄色系' },
    { code: '43', name: '黄色', hex: '#FFD800', group: '黄色系' },
    { code: '44', name: '荧光黄', hex: '#CCFF00', group: '黄色系' },
    { code: '45', name: '橙黄', hex: '#FDA428', group: '黄色系' },
    { code: '46', name: '姜黄', hex: '#DAA520', group: '黄色系' },
    { code: '21', name: '橙色', hex: '#FF8C00', group: '橙色系' },
    { code: '22', name: '橘红', hex: '#FF5722', group: '橙色系' },
    { code: '47', name: '大红', hex: '#FF0000', group: '红色系' },
    { code: '48', name: '嫣红', hex: '#E8465F', group: '红色系' },
    { code: '39', name: '西瓜红', hex: '#FC6C85', group: '红色系' },
    { code: '33', name: '淡粉', hex: '#FFB6C1', group: '粉色系' },
    { code: '34', name: '粉桃', hex: '#F8A48B', group: '粉色系' },
    { code: '35', name: '桃红', hex: '#FF47A3', group: '粉色系' },
    { code: '36', name: '粉红', hex: '#FF69B4', group: '粉色系' },
    { code: '37', name: '玫红', hex: '#FF007F', group: '粉色系' },
    { code: '38', name: '亮粉', hex: '#FF7BAC', group: '粉色系' },
    { code: '25', name: '淡紫', hex: '#D8BFD8', group: '紫色系' },
    { code: '26', name: '紫色', hex: '#800080', group: '紫色系' },
    { code: '27', name: '蓝紫', hex: '#7B68EE', group: '紫色系' },
    { code: '28', name: '深紫', hex: '#4B0082', group: '紫色系' },
    { code: '32', name: '紫红', hex: '#A0205E', group: '紫色系' },
    { code: '9', name: '灰蓝', hex: '#7393B8', group: '蓝色系' },
    { code: '10', name: '浅蓝', hex: '#A6D9F0', group: '蓝色系' },
    { code: '11', name: '天蓝', hex: '#55B8E8', group: '蓝色系' },
    { code: '12', name: '湖蓝', hex: '#1E9BD7', group: '蓝色系' },
    { code: '13', name: '蓝色', hex: '#1666C4', group: '蓝色系' },
    { code: '14', name: '普蓝', hex: '#0B3D91', group: '蓝色系' },
    { code: '15', name: '宝蓝', hex: '#2B4FD8', group: '蓝色系' },
    { code: '1', name: '淡绿', hex: '#C8E6A8', group: '绿色系' },
    { code: '2', name: '草绿', hex: '#7CC24B', group: '绿色系' },
    { code: '3', name: '深绿', hex: '#1C7A33', group: '绿色系' },
    { code: '4', name: '绿色', hex: '#35A839', group: '绿色系' },
    { code: '5', name: '墨绿', hex: '#14401F', group: '绿色系' },
    { code: '6', name: '松石绿', hex: '#2FC2C5', group: '绿色系' },
    { code: '24', name: '浅棕', hex: '#B07B4F', group: '棕色系' },
    { code: '40', name: '棕色', hex: '#8B5A2B', group: '棕色系' },
    { code: '41', name: '深棕', hex: '#5C3A21', group: '棕色系' },
    { code: '42', name: '红棕', hex: '#7A3B2E', group: '棕色系' },
    { code: '29', name: '浅灰', hex: '#C0C0C0', group: '灰黑色系' },
    { code: '30', name: '灰色', hex: '#8C8C8C', group: '灰黑色系' },
    { code: '31', name: '黑色', hex: '#1A1A1A', group: '灰黑色系' }
  ];

  var canvas = document.getElementById('beadCanvas');
  var ctx = canvas.getContext('2d');

  var gridSize = 29;
  var boardShape = 'square';
  var cellSize = 16;
  var zoomLevel = 1;
  var pixels = [];
  var pegMask = [];
  var currentTool = 'pencil';
  var currentColor = '#FFFFFF';
  var currentColorName = '23号 白色';
  var isDrawing = false;
  var showGrid = true;
  var beadStyle = true;
  var ironedView = false;
  var mirrorDraw = false;
  var history = [];
  var historyIndex = -1;
  var MAX_HISTORY = 50;
  var lastDrawnCell = null;

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(function(v) { return Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0'); }).join('');
  }

  function colorDistance(c1, c2) {
    var dr = c1[0] - c2[0], dg = c1[1] - c2[1], db = c1[2] - c2[2];
    return dr * dr + dg * dg + db * db;
  }

  function quantizeToBeadPalette(r, g, b) {
    var target = [r, g, b];
    var best = BEAD_COLORS[0];
    var bestDist = Infinity;
    for (var i = 0; i < BEAD_COLORS.length; i++) {
      var rgb = hexToRgb(BEAD_COLORS[i].hex);
      var d = colorDistance(target, rgb);
      if (d < bestDist) { bestDist = d; best = BEAD_COLORS[i]; }
    }
    return best;
  }

  function isPegValid(x, y) {
    if (x < 0 || x >= gridSize || y < 0 || y >= gridSize) return false;
    return pegMask[y] && pegMask[y][x] ? true : false;
  }

  function buildPegMask() {
    pegMask = [];
    var center = (gridSize - 1) / 2;
    for (var y = 0; y < gridSize; y++) {
      pegMask[y] = [];
      for (var x = 0; x < gridSize; x++) {
        switch (boardShape) {
          case 'square':
            pegMask[y][x] = true;
            break;
          case 'circle':
            pegMask[y][x] = Math.sqrt(Math.pow(x - center, 2) + Math.pow(y - center, 2)) <= center;
            break;
          case 'heart':
            var nx = (x - center) / (gridSize * 0.44);
            var ny = -(y - center * 0.8) / (gridSize * 0.44);
            var val = Math.pow(nx * nx + ny * ny - 1, 3) - nx * nx * ny * ny * ny;
            pegMask[y][x] = val <= 0.02;
            break;
          case 'hexagon':
            var ax = Math.abs(x - center);
            var ay = Math.abs(y - center);
            var s = gridSize / 2;
            pegMask[y][x] = (ax <= s && ay <= s && (s - ay) >= (ax - s * 0.5) * Math.tan(Math.PI / 3));
            break;
          default:
            pegMask[y][x] = true;
        }
      }
    }
  }

  function initPixels() {
    pixels = [];
    for (var y = 0; y < gridSize; y++) {
      pixels[y] = [];
      for (var x = 0; x < gridSize; x++) {
        pixels[y][x] = null;
      }
    }
  }

  function calcCellSize() {
    var area = document.getElementById('canvasArea');
    var isMobile = window.innerWidth < 1024;
    var pad = isMobile ? 16 : 40;
    var maxW = area.clientWidth - pad;
    var maxH = area.clientHeight - pad;
    var ideal = Math.floor(Math.min(maxW, maxH) / gridSize);
    return Math.max(2, ideal);
  }

  function resizeCanvas() {
    cellSize = calcCellSize();
    var displaySize = Math.round(cellSize * gridSize * zoomLevel);
    canvas.width = displaySize;
    canvas.height = displaySize;
    canvas.style.width = displaySize + 'px';
    canvas.style.height = displaySize + 'px';
    redraw();
  }

  function lightenColor(hex, amount) {
    var rgb = hexToRgb(hex);
    return rgbToHex(
      Math.min(255, rgb[0] + amount),
      Math.min(255, rgb[1] + amount),
      Math.min(255, rgb[2] + amount)
    );
  }

  function darkenColor(hex, amount) {
    var rgb = hexToRgb(hex);
    return rgbToHex(
      Math.max(0, rgb[0] - amount),
      Math.max(0, rgb[1] - amount),
      Math.max(0, rgb[2] - amount)
    );
  }

  // 基于坐标的确定性伪随机数：每颗豆的明度抖动固定，重绘不闪烁
  function beadHash(x, y) {
    var h = (x * 374761393 + y * 668265263) ^ 0x5bf03635;
    h = (h ^ (h >>> 13)) * 1274126177;
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967295;
  }

  function roundRectPath(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // 熨烫后的拼豆：豆体融化成圆角方形，豆间有融合缝隙，中心孔半闭合，表面带熔融光泽
  function drawIronedBead(c, px, py, sz, color, x, y) {
    var variance = Math.round((beadHash(x, y) - 0.5) * 12);
    var base = variance >= 0 ? lightenColor(color, variance) : darkenColor(color, -variance);
    var cx = px + sz / 2, cy = py + sz / 2;

    // 融合缝隙：豆与豆之间的深色熔接线
    c.fillStyle = darkenColor(base, 32);
    c.fillRect(px, py, sz, sz);

    // 小尺寸快速路径
    if (sz < 7) {
      c.fillStyle = base;
      c.fillRect(px + 0.5, py + 0.5, sz - 1, sz - 1);
      return;
    }

    var inset = Math.max(0.6, sz * 0.045);
    var bx = px + inset, by = py + inset;
    var bw = sz - inset * 2;

    // 豆体：融化后的圆角方形，熔融塑料渐变
    if (sz >= 12) {
      var grad = c.createRadialGradient(cx - bw * 0.2, cy - bw * 0.24, bw * 0.1, cx, cy, bw * 0.78);
      grad.addColorStop(0, lightenColor(base, 16));
      grad.addColorStop(0.55, base);
      grad.addColorStop(1, darkenColor(base, 20));
      c.fillStyle = grad;
    } else {
      c.fillStyle = base;
    }
    roundRectPath(c, bx, by, bw, bw, bw * 0.34);
    c.fill();

    // 中心孔：熨烫后半闭合，呈深色小孔
    if (sz >= 8) {
      var holeR = Math.max(0.8, sz * 0.105);
      c.fillStyle = darkenColor(base, 45);
      c.beginPath();
      c.arc(cx, cy, holeR, 0, Math.PI * 2);
      c.fill();
      if (sz >= 14) {
        c.fillStyle = 'rgba(0,0,0,0.25)';
        c.beginPath();
        c.arc(cx, cy, holeR * 0.55, 0, Math.PI * 2);
        c.fill();
      }
    }

    // 表面光泽：熔融塑料的斜上方高光
    if (sz >= 14) {
      c.fillStyle = 'rgba(255,255,255,0.15)';
      roundRectPath(c, bx + bw * 0.16, by + bw * 0.12, bw * 0.42, bw * 0.2, bw * 0.1);
      c.fill();
    }
  }

  function redraw() {
    var sz = cellSize * zoomLevel;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#e8e0d4';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (var y = 0; y < gridSize; y++) {
      for (var x = 0; x < gridSize; x++) {
        var px = x * sz;
        var py = y * sz;

        if (!isPegValid(x, y)) {
          ctx.fillStyle = '#b8b0a4';
          ctx.fillRect(px, py, sz, sz);
          continue;
        }

        if (ironedView && pixels[y][x]) {
          drawIronedBead(ctx, px, py, sz, pixels[y][x], x, y);
        } else if (beadStyle && !ironedView) {
          ctx.fillStyle = '#d8d0c4';
          ctx.fillRect(px, py, sz, sz);

          var pegR = Math.max(1, sz * 0.08);
          ctx.fillStyle = '#c8c0b4';
          ctx.beginPath();
          ctx.arc(px + sz / 2, py + sz / 2, pegR, 0, Math.PI * 2);
          ctx.fill();

          if (pixels[y][x]) {
            var beadR = Math.max(2, sz * 0.42);
            var cx = px + sz / 2;
            var cy = py + sz / 2;

            var grad = ctx.createRadialGradient(cx - beadR * 0.2, cy - beadR * 0.2, beadR * 0.1, cx, cy, beadR);
            grad.addColorStop(0, lightenColor(pixels[y][x], 40));
            grad.addColorStop(0.7, pixels[y][x]);
            grad.addColorStop(1, darkenColor(pixels[y][x], 30));
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy, beadR, 0, Math.PI * 2);
            ctx.fill();

            if (sz > 10) {
              var holeR = Math.max(1, sz * 0.08);
              ctx.fillStyle = darkenColor(pixels[y][x], 50);
              ctx.globalAlpha = 0.5;
              ctx.beginPath();
              ctx.arc(cx, cy, holeR, 0, Math.PI * 2);
              ctx.fill();
              ctx.globalAlpha = 1;
            }

            if (sz > 14) {
              var hlR = Math.max(1, sz * 0.12);
              ctx.fillStyle = 'rgba(255,255,255,0.35)';
              ctx.beginPath();
              ctx.arc(cx - beadR * 0.25, cy - beadR * 0.25, hlR, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        } else {
          ctx.fillStyle = '#d8d0c4';
          ctx.fillRect(px, py, sz, sz);
          if (pixels[y][x]) {
            ctx.fillStyle = pixels[y][x];
            ctx.fillRect(px + 1, py + 1, sz - 2, sz - 2);
          }
        }
      }
    }

    if (showGrid && !ironedView && sz >= 6) {
      ctx.strokeStyle = 'rgba(0,0,0,0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var i = 0; i <= gridSize; i++) {
        var pos = Math.round(i * sz) + 0.5;
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, canvas.height);
        ctx.moveTo(0, pos);
        ctx.lineTo(canvas.width, pos);
      }
      ctx.stroke();
    }
  }

  function getPixelCoord(e) {
    var rect = canvas.getBoundingClientRect();
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    var clientX = e.clientX !== undefined ? e.clientX : e.touches[0].clientX;
    var clientY = e.clientY !== undefined ? e.clientY : e.touches[0].clientY;
    var sz = cellSize * zoomLevel;
    var x = Math.floor((clientX - rect.left) * scaleX / sz);
    var y = Math.floor((clientY - rect.top) * scaleY / sz);
    return { x: Math.max(0, Math.min(gridSize - 1, x)), y: Math.max(0, Math.min(gridSize - 1, y)) };
  }

  function drawPixel(x, y) {
    if (!isPegValid(x, y)) return;
    if (currentTool === 'pencil') {
      pixels[y][x] = currentColor;
      if (mirrorDraw) {
        var mx = gridSize - 1 - x;
        if (isPegValid(mx, y)) pixels[y][mx] = currentColor;
      }
    } else if (currentTool === 'eraser') {
      pixels[y][x] = null;
      if (mirrorDraw) {
        var mx2 = gridSize - 1 - x;
        if (isPegValid(mx2, y)) pixels[y][mx2] = null;
      }
    } else if (currentTool === 'bucket') {
      floodFill(x, y, pixels[y][x], currentColor);
    } else if (currentTool === 'picker') {
      if (pixels[y][x]) {
        setColor(pixels[y][x]);
        var picked = BEAD_COLORS.find(function(c) { return c.hex.toUpperCase() === pixels[y][x].toUpperCase(); });
        showToast('已取色 ' + (picked ? picked.code + '号 ' + picked.name : '自定义颜色'));
      } else {
        showToast('该位置无拼豆可取色');
      }
    }
  }

  function floodFill(x, y, targetColor, replaceColor) {
    if (targetColor === replaceColor) return;
    var stack = [[x, y]];
    var visited = {};
    while (stack.length > 0) {
      var item = stack.pop();
      var cx = item[0], cy = item[1];
      var key = cx + ',' + cy;
      if (visited[key]) continue;
      if (!isPegValid(cx, cy)) continue;
      if (pixels[cy][cx] !== targetColor) continue;
      visited[key] = true;
      pixels[cy][cx] = replaceColor;
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
  }

  var STORAGE_KEY = 'perler-bead-designer-v1';
  var saveStateTimer = null;
  function persistState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        gridSize: gridSize,
        boardShape: boardShape,
        pixels: pixels,
        currentColor: currentColor,
        showGrid: showGrid,
        beadStyle: beadStyle,
        ironedView: ironedView,
        mirrorDraw: mirrorDraw
      }));
    } catch(e) {}
  }
  function saveState() {
    if (saveStateTimer) clearTimeout(saveStateTimer);
    saveStateTimer = setTimeout(persistState, 400);
  }
  window.addEventListener('beforeunload', function() {
    if (saveStateTimer) { clearTimeout(saveStateTimer); saveStateTimer = null; }
    persistState();
  });
  function loadState() {
    try {
      var s = localStorage.getItem(STORAGE_KEY);
      if (!s) return null;
      var data = JSON.parse(s);
      return data || null;
    } catch(e) { return null; }
  }

  function saveHistory() {
    history = history.slice(0, historyIndex + 1);
    var snapshot = [];
    for (var y = 0; y < gridSize; y++) snapshot.push(pixels[y].slice());
    history.push(snapshot);
    if (history.length > MAX_HISTORY) { history.shift(); } else { historyIndex++; }
    updateHistoryButtons();
    saveState();
  }

  function undo() {
    if (historyIndex > 0) {
      historyIndex--;
      restoreFromHistory();
    }
  }

  function redo() {
    if (historyIndex < history.length - 1) {
      historyIndex++;
      restoreFromHistory();
    }
  }

  function restoreFromHistory() {
    var snap = history[historyIndex];
    pixels = [];
    for (var y = 0; y < gridSize; y++) pixels.push(snap[y].slice());
    redraw();
    updateMaterialList();
    updateInfoBox();
    updateHistoryButtons();
  }

  function updateHistoryButtons() {
    var canUndo = historyIndex > 0;
    var canRedo = historyIndex < history.length - 1;
    ['undoBtn', 'mUndoBtn'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.disabled = !canUndo;
    });
    ['redoBtn', 'mRedoBtn'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.disabled = !canRedo;
    });
  }

  function setColor(hex) {
    currentColor = hex;
    var found = BEAD_COLORS.find(function(c) { return c.hex.toUpperCase() === hex.toUpperCase(); });
    currentColorName = found ? found.code + '号 ' + found.name : '自定义';
    document.getElementById('colorSwatchInner').style.background = hex;
    document.getElementById('colorNameDisplay').textContent = currentColorName;
    document.getElementById('colorInput').value = hex;
    updatePaletteSelection();
    saveState();
  }

  function updatePaletteSelection() {
    document.querySelectorAll('.palette-bead').forEach(function(el) {
      el.classList.toggle('selected', el.dataset.color.toUpperCase() === currentColor.toUpperCase());
    });
  }

  function buildPalette(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    var groups = {};
    BEAD_COLORS.forEach(function(c) {
      if (!groups[c.group]) groups[c.group] = [];
      groups[c.group].push(c);
    });
    Object.keys(groups).forEach(function(groupName) {
      var section = document.createElement('div');
      section.className = 'palette-section';
      var title = document.createElement('div');
      title.className = 'palette-section-title';
      title.textContent = groupName;
      section.appendChild(title);
      var grid = document.createElement('div');
      grid.className = 'palette-grid';
      groups[groupName].forEach(function(c) {
        var bead = document.createElement('div');
        bead.className = 'palette-bead';
        bead.style.background = c.hex;
        bead.dataset.color = c.hex;
        bead.title = c.code + '号 ' + c.name + ' (' + c.hex + ')';
        if (c.hex.toUpperCase() === currentColor.toUpperCase()) bead.classList.add('selected');
        bead.addEventListener('click', function() {
          setColor(c.hex);
          if (currentTool === 'picker') {
            setTool('pencil', true);
            showToast('已选 ' + c.code + '号 ' + c.name + '，切换至放置');
          }
          closeSlidePanels();
        });
        grid.appendChild(bead);
      });
      section.appendChild(grid);
      title.addEventListener('click', function() {
        title.classList.toggle('collapsed');
        grid.classList.toggle('collapsed');
      });
      container.appendChild(section);
    });
  }

  function countBeads() {
    var counts = {};
    var total = 0;
    for (var y = 0; y < gridSize; y++) {
      for (var x = 0; x < gridSize; x++) {
        if (pixels[y][x] && isPegValid(x, y)) {
          var c = pixels[y][x].toUpperCase();
          counts[c] = (counts[c] || 0) + 1;
          total++;
        }
      }
    }
    return { counts: counts, total: total };
  }

  function updateMaterialList() {
    var result = countBeads();
    var html = '';
    if (result.total === 0) {
      html = '<div style="color:var(--fg-overlay);font-size:11px;padding:8px 0;">尚未放置拼豆</div>';
    } else {
      var entries = Object.keys(result.counts).map(function(hex) {
        var found = BEAD_COLORS.find(function(c) { return c.hex.toUpperCase() === hex; });
        return { hex: hex, name: found ? found.code + '号 ' + found.name : '自定义', count: result.counts[hex] };
      }).sort(function(a, b) { return b.count - a.count; });
      entries.forEach(function(e) {
        html += '<div class="material-row">' +
          '<div class="material-dot" style="background:' + e.hex + '"></div>' +
          '<div class="material-name">' + e.name + '</div>' +
          '<div class="material-count">' + e.count + '</div></div>';
      });
      html += '<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border);font-size:11px;color:var(--fg-text);">合计: <strong>' + result.total + '</strong> 颗</div>';
    }
    var ml = document.getElementById('materialList');
    var mml = document.getElementById('mobileMaterialList');
    if (ml) ml.innerHTML = html;
    if (mml) mml.innerHTML = html;
  }

  function updateInfoBox() {
    var result = countBeads();
    var shapeNames = { square: '正方形', circle: '圆形', heart: '心形', hexagon: '六边形' };
    var wCm = (gridSize * BEAD_DIAMETER_MM / 10).toFixed(1);
    var hCm = wCm;
    var text = '<strong>' + gridSize + ' × ' + gridSize + '</strong> ' + (shapeNames[boardShape] || boardShape) + '钉板<br>' +
      '拼豆数量: <strong>' + result.total + '</strong> 颗<br>' +
      '成品尺寸: 约 <strong>' + wCm + ' × ' + hCm + '</strong> cm<br>' +
      '熨烫后: 尺寸基本不变，厚度变薄';
    var ib = document.getElementById('infoBox');
    var mib = document.getElementById('mobileInfoBox');
    if (ib) ib.innerHTML = text;
    if (mib) mib.innerHTML = text;
  }

  function mirrorHorizontal() {
    var newPixels = [];
    for (var y = 0; y < gridSize; y++) {
      newPixels[y] = [];
      for (var x = 0; x < gridSize; x++) {
        newPixels[y][x] = pixels[y][gridSize - 1 - x];
      }
    }
    pixels = newPixels;
    saveHistory();
    redraw();
    updateMaterialList();
    updateInfoBox();
  }

  function mirrorVertical() {
    var newPixels = [];
    for (var y = 0; y < gridSize; y++) {
      newPixels[y] = pixels[gridSize - 1 - y].slice();
    }
    pixels = newPixels;
    saveHistory();
    redraw();
    updateMaterialList();
    updateInfoBox();
  }

  function rotateClockwise() {
    var newPixels = [];
    for (var y = 0; y < gridSize; y++) {
      newPixels[y] = [];
      for (var x = 0; x < gridSize; x++) {
        newPixels[y][x] = pixels[gridSize - 1 - x][y];
      }
    }
    pixels = newPixels;
    buildPegMask();
    saveHistory();
    redraw();
    updateMaterialList();
    updateInfoBox();
  }

  function clearCanvas() {
    showConfirm('确定清空整个钉板吗？', '将移除画布上的所有拼豆，误操作可通过撤销恢复。', function() {
      initPixels();
      saveHistory();
      redraw();
      updateMaterialList();
      updateInfoBox();
      showToast('钉板已清空');
    });
  }

  function generateSVG() {
    var rects = [];
    for (var y = 0; y < gridSize; y++) {
      for (var x = 0; x < gridSize; x++) {
        if (pixels[y][x] && isPegValid(x, y)) {
          if (ironedView) {
            rects.push('  <rect x="' + x + '" y="' + y + '" width="1" height="1" fill="' + darkenColor(pixels[y][x], 32) + '"/>');
            rects.push('  <rect x="' + (x + 0.05) + '" y="' + (y + 0.05) + '" width="0.9" height="0.9" rx="0.3" fill="' + pixels[y][x] + '"/>');
            rects.push('  <circle cx="' + (x + 0.5) + '" cy="' + (y + 0.5) + '" r="0.105" fill="' + darkenColor(pixels[y][x], 45) + '"/>');
          } else if (beadStyle) {
            rects.push('  <circle cx="' + (x + 0.5) + '" cy="' + (y + 0.5) + '" r="0.42" fill="' + pixels[y][x] + '"/>');
          } else {
            rects.push('  <rect x="' + x + '" y="' + y + '" width="1" height="1" fill="' + pixels[y][x] + '"/>');
          }
        }
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + gridSize + '" height="' + gridSize + '" viewBox="0 0 ' + gridSize + ' ' + gridSize + '" shape-rendering="crispEdges">\n' + rects.join('\n') + '\n</svg>';
  }

  // ===== 导出兼容层：容器内走 JSBridge 存相册，浏览器直开回退 blob 下载 =====
  function _hasMiniTool() {
    return !!(window.xhs && window.xhs.miniTool && window.xhs.miniTool.saveImageToPhotosAlbum);
  }
  function _saveCanvasToAlbum(canvas, toastMsg) {
    var dataUrl;
    try { dataUrl = canvas.toDataURL('image/png'); } catch (e) { showToast('导出失败'); return; }
    window.xhs.miniTool.writeTempFile({ data: dataUrl })
      .then(function(res) { return window.xhs.miniTool.saveImageToPhotosAlbum({ filePath: res.filePath }); })
      .then(function() { showToast(toastMsg || '已保存到相册'); })
      .catch(function() { showToast('保存失败，请检查相册权限'); });
  }
  function _browserDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  function downloadSVG() {
    var svg = generateSVG();
    if (_hasMiniTool()) {
      var sblob = new Blob([svg], { type: 'image/svg+xml' });
      var surl = URL.createObjectURL(sblob);
      var img = new Image();
      img.onload = function() {
        var w = (img.width || gridSize) * 10;
        var h = (img.height || gridSize) * 10;
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(surl);
        _saveCanvasToAlbum(c, 'SVG 已保存到相册');
      };
      img.onerror = function() { URL.revokeObjectURL(surl); showToast('当前环境暂不支持导出 SVG'); };
      img.src = surl;
    } else {
      var blob = new Blob([svg], { type: 'image/svg+xml' });
      _browserDownload(blob, 'perler-bead-' + gridSize + 'x' + gridSize + '-' + Date.now() + '.svg');
      showToast('SVG 已下载');
    }
  }

  function downloadPNG(scaleOpts) {
    var scale = scaleOpts || 10;
    if (ironedView && scale < 16) scale = 16;
    var tmp = document.createElement('canvas');
    tmp.width = gridSize * scale;
    tmp.height = gridSize * scale;
    var tctx = tmp.getContext('2d');
    tctx.imageSmoothingEnabled = false;

    tctx.fillStyle = '#e8e0d4';
    tctx.fillRect(0, 0, tmp.width, tmp.height);

    for (var y = 0; y < gridSize; y++) {
      for (var x = 0; x < gridSize; x++) {
        if (!isPegValid(x, y)) {
          tctx.fillStyle = '#b8b0a4';
          tctx.fillRect(x * scale, y * scale, scale, scale);
          continue;
        }
        if (pixels[y][x]) {
          if (ironedView) {
            drawIronedBead(tctx, x * scale, y * scale, scale, pixels[y][x], x, y);
          } else if (beadStyle) {
            tctx.fillStyle = '#d8d0c4';
            tctx.fillRect(x * scale, y * scale, scale, scale);
            var beadR = scale * 0.42;
            var cx = x * scale + scale / 2;
            var cy = y * scale + scale / 2;
            var grad = tctx.createRadialGradient(cx - beadR * 0.2, cy - beadR * 0.2, beadR * 0.1, cx, cy, beadR);
            grad.addColorStop(0, lightenColor(pixels[y][x], 40));
            grad.addColorStop(0.7, pixels[y][x]);
            grad.addColorStop(1, darkenColor(pixels[y][x], 30));
            tctx.fillStyle = grad;
            tctx.beginPath();
            tctx.arc(cx, cy, beadR, 0, Math.PI * 2);
            tctx.fill();
          } else {
            tctx.fillStyle = pixels[y][x];
            tctx.fillRect(x * scale, y * scale, scale, scale);
          }
        } else {
          tctx.fillStyle = '#d8d0c4';
          tctx.fillRect(x * scale, y * scale, scale, scale);
        }
      }
    }

    if (_hasMiniTool()) {
      _saveCanvasToAlbum(tmp, 'PNG 已保存到相册');
    } else {
      tmp.toBlob(function(blob) {
        _browserDownload(blob, 'perler-bead-' + gridSize + 'x' + gridSize + '-' + Date.now() + '.png');
        showToast('PNG 已下载');
      });
    }
  }

  function downloadPattern() {
    var scale = 20;
    var margin = 80;
    var legendH = 0;
    var result = countBeads();
    var entries = Object.keys(result.counts).map(function(hex) {
      var found = BEAD_COLORS.find(function(c) { return c.hex.toUpperCase() === hex; });
      return { hex: hex, name: found ? found.code + '号 ' + found.name : '自定义', count: result.counts[hex] };
    }).sort(function(a, b) { return b.count - a.count; });
    legendH = Math.ceil(entries.length / 4) * 24 + 40;

    var tmp = document.createElement('canvas');
    tmp.width = gridSize * scale + margin * 2;
    tmp.height = gridSize * scale + margin * 2 + legendH;
    var tctx = tmp.getContext('2d');

    tctx.fillStyle = '#ffffff';
    tctx.fillRect(0, 0, tmp.width, tmp.height);

    tctx.fillStyle = '#333';
    tctx.font = 'bold 16px "Microsoft YaHei", sans-serif';
    tctx.textAlign = 'center';
    tctx.fillText('拼豆图纸 - ' + gridSize + '×' + gridSize + ' ' + ({ square: '正方形', circle: '圆形', heart: '心形', hexagon: '六边形' }[boardShape] || '') + '钉板', tmp.width / 2, 30);
    tctx.font = '12px "Microsoft YaHei", sans-serif';
    tctx.fillText('拼豆总数: ' + result.total + ' 颗 | 成品尺寸: 约 ' + (gridSize * BEAD_DIAMETER_MM / 10).toFixed(1) + 'cm', tmp.width / 2, 52);

    var ox = margin;
    var oy = margin;

    tctx.fillStyle = '#f0ebe3';
    tctx.fillRect(ox, oy, gridSize * scale, gridSize * scale);

    for (var y = 0; y < gridSize; y++) {
      for (var x = 0; x < gridSize; x++) {
        if (!isPegValid(x, y)) {
          tctx.fillStyle = '#d0c8bc';
          tctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
          continue;
        }
        if (pixels[y][x]) {
          tctx.fillStyle = pixels[y][x];
          tctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
        }
      }
    }

    tctx.strokeStyle = 'rgba(0,0,0,0.2)';
    tctx.lineWidth = 0.5;
    for (var i = 0; i <= gridSize; i++) {
      tctx.beginPath();
      tctx.moveTo(ox + i * scale, oy);
      tctx.lineTo(ox + i * scale, oy + gridSize * scale);
      tctx.stroke();
      tctx.beginPath();
      tctx.moveTo(ox, oy + i * scale);
      tctx.lineTo(ox + gridSize * scale, oy + i * scale);
      tctx.stroke();
    }

    tctx.fillStyle = '#999';
    tctx.font = '9px sans-serif';
    tctx.textAlign = 'center';
    for (var i2 = 0; i2 < gridSize; i2 += 5) {
      tctx.fillText(i2 + 1, ox + i2 * scale + scale / 2, oy - 4);
      tctx.fillText(i2 + 1, ox - 8, oy + i2 * scale + scale / 2 + 3);
    }

    var legendY = oy + gridSize * scale + 20;
    tctx.fillStyle = '#333';
    tctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
    tctx.textAlign = 'left';
    tctx.fillText('用料清单', ox, legendY);
    legendY += 8;

    tctx.font = '11px "Microsoft YaHei", sans-serif';
    entries.forEach(function(e, idx) {
      var col = idx % 4;
      var row = Math.floor(idx / 4);
      var lx = ox + col * (gridSize * scale / 4);
      var ly = legendY + row * 24;
      tctx.fillStyle = e.hex;
      tctx.beginPath();
      tctx.arc(lx + 8, ly + 8, 7, 0, Math.PI * 2);
      tctx.fill();
      tctx.strokeStyle = '#999';
      tctx.lineWidth = 0.5;
      tctx.stroke();
      tctx.fillStyle = '#333';
      tctx.textAlign = 'left';
      tctx.fillText(e.name + ' ×' + e.count, lx + 20, ly + 12);
    });

    if (_hasMiniTool()) {
      _saveCanvasToAlbum(tmp, '图纸已保存到相册');
    } else {
      tmp.toBlob(function(blob) {
        _browserDownload(blob, 'perler-pattern-' + gridSize + 'x' + gridSize + '-' + Date.now() + '.png');
        showToast('图纸已下载');
      });
    }
  }

  function importImage(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
      var img = new Image();
      img.onload = function() {
        var scale = Math.min(gridSize / img.width, gridSize / img.height);
        var drawW = Math.max(1, Math.round(img.width * scale));
        var drawH = Math.max(1, Math.round(img.height * scale));
        var offsetX = Math.floor((gridSize - drawW) / 2);
        var offsetY = Math.floor((gridSize - drawH) / 2);

        var tmp = document.createElement('canvas');
        tmp.width = drawW;
        tmp.height = drawH;
        var tctx = tmp.getContext('2d');
        tctx.imageSmoothingEnabled = true;
        tctx.imageSmoothingQuality = 'high';
        tctx.drawImage(img, 0, 0, drawW, drawH);

        var imgData = tctx.getImageData(0, 0, drawW, drawH);
        var data = imgData.data;
        var isMob = window.innerWidth < 1024;
        var quantize, transparentBg;
        if (isMob) {
          quantize = true;
          transparentBg = false;
        } else {
          quantize = document.getElementById('quantizeToggle').checked;
          transparentBg = document.getElementById('transparentToggle').checked;
        }

        initPixels();

        for (var y = 0; y < drawH; y++) {
          for (var x = 0; x < drawW; x++) {
            var idx = (y * drawW + x) * 4;
            var r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
            if (a < 128) continue;
            if (transparentBg && r > 240 && g > 240 && b > 240) continue;
            var hex;
            if (quantize) {
              hex = quantizeToBeadPalette(r, g, b).hex;
            } else {
              hex = rgbToHex(r, g, b);
            }
            var px = offsetX + x;
            var py = offsetY + y;
            if (isPegValid(px, py)) {
              pixels[py][px] = hex;
            }
          }
        }

        saveHistory();
        redraw();
        updateMaterialList();
        updateInfoBox();
        showToast('图片已导入');
      };
      img.onerror = function() { alert('图片加载失败'); };
      img.src = e.target.result;
    };
    reader.onerror = function() { alert('文件读取失败'); };
    reader.readAsDataURL(file);
  }

  var toastTimer = null;
  function showToast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function() { t.classList.remove('show'); }, 1800);
  }

  // 应用内确认弹窗：不依赖 window.confirm（浏览器拦截对话框后会静默失败）
  var confirmCallback = null;
  function showConfirm(title, msg, onOk) {
    confirmCallback = onOk;
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMsg').textContent = msg;
    document.getElementById('confirmOverlay').classList.add('open');
  }
  function hideConfirm() {
    document.getElementById('confirmOverlay').classList.remove('open');
    confirmCallback = null;
  }

  function closeSlidePanels() {
    document.getElementById('colorPanel').classList.remove('open');
    document.getElementById('morePanel').classList.remove('open');
    document.getElementById('slideOverlay').classList.remove('open');
  }

  function openSlidePanel(id) {
    closeSlidePanels();
    document.getElementById(id).classList.add('open');
    document.getElementById('slideOverlay').classList.add('open');
  }

  var TOOL_HINTS = {
    pencil: '放置模式：点击或拖动放置拼豆',
    eraser: '移除模式：点击或拖动移除拼豆',
    bucket: '填充模式：点击填充连通区域',
    picker: '取色模式：点击拼豆拾取颜色',
    move: '移动模式：拖动平移画布'
  };
  function setTool(tool, silent) {
    currentTool = tool;
    document.querySelectorAll('.tool-btn, .m-tool-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });
    canvas.style.cursor = tool === 'move' ? 'grab' : (tool === 'picker' ? 'cell' : 'crosshair');
    if (!silent && TOOL_HINTS[tool]) showToast(TOOL_HINTS[tool]);
  }

  canvas.addEventListener('mousedown', function(e) {
    isDrawing = true;
    lastDrawnCell = null;
    var coord = getPixelCoord(e);
    lastDrawnCell = coord;
    drawPixel(coord.x, coord.y);
    redraw();
  });

  canvas.addEventListener('mousemove', function(e) {
    if (!isDrawing) return;
    if (currentTool === 'bucket' || currentTool === 'picker') return;
    var coord = getPixelCoord(e);
    if (lastDrawnCell && coord.x === lastDrawnCell.x && coord.y === lastDrawnCell.y) return;
    lastDrawnCell = coord;
    drawPixel(coord.x, coord.y);
    redraw();
  });

  canvas.addEventListener('mouseup', function() {
    if (isDrawing) { isDrawing = false; saveHistory(); updateMaterialList(); updateInfoBox(); }
  });

  canvas.addEventListener('mouseleave', function() {
    if (isDrawing) { isDrawing = false; saveHistory(); updateMaterialList(); updateInfoBox(); }
  });

  var pinchStart = null;
  var movePan = null;
  var canvasScrollerEl = document.getElementById('canvasScroller');

  function touchDist(t0, t1) {
    return Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
  }

  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    if (e.touches.length === 2) {
      isDrawing = false;
      movePan = null;
      var t0 = e.touches[0], t1 = e.touches[1];
      pinchStart = {
        dist: touchDist(t0, t1),
        zoom: zoomLevel,
        midX: (t0.clientX + t1.clientX) / 2,
        midY: (t0.clientY + t1.clientY) / 2,
        sl: canvasScrollerEl.scrollLeft,
        st: canvasScrollerEl.scrollTop
      };
      return;
    }
    if (currentTool === 'move') {
      isDrawing = false;
      var t = e.touches[0];
      movePan = { x: t.clientX, y: t.clientY, sl: canvasScrollerEl.scrollLeft, st: canvasScrollerEl.scrollTop };
      canvas.style.cursor = 'grabbing';
      return;
    }
    isDrawing = true;
    lastDrawnCell = null;
    var coord = getPixelCoord(e);
    lastDrawnCell = coord;
    drawPixel(coord.x, coord.y);
    redraw();
  }, { passive: false });

  canvas.addEventListener('touchmove', function(e) {
    e.preventDefault();
    if (e.touches.length === 2 && pinchStart) {
      var t0 = e.touches[0], t1 = e.touches[1];
      var dist = touchDist(t0, t1);
      if (pinchStart.dist > 0) {
        var ratio = dist / pinchStart.dist;
        var newZoom = Math.max(0.5, Math.min(3, +(pinchStart.zoom * ratio).toFixed(2)));
        if (newZoom !== zoomLevel) {
          zoomLevel = newZoom;
          resizeCanvas();
        }
      }
      var midX = (t0.clientX + t1.clientX) / 2;
      var midY = (t0.clientY + t1.clientY) / 2;
      canvasScrollerEl.scrollLeft = pinchStart.sl - (midX - pinchStart.midX);
      canvasScrollerEl.scrollTop = pinchStart.st - (midY - pinchStart.midY);
      return;
    }
    if (currentTool === 'move' && movePan && e.touches.length === 1) {
      var t = e.touches[0];
      canvasScrollerEl.scrollLeft = movePan.sl - (t.clientX - movePan.x);
      canvasScrollerEl.scrollTop = movePan.st - (t.clientY - movePan.y);
      return;
    }
    if (!isDrawing) return;
    if (currentTool === 'bucket' || currentTool === 'picker') return;
    var coord = getPixelCoord(e);
    if (lastDrawnCell && coord.x === lastDrawnCell.x && coord.y === lastDrawnCell.y) return;
    lastDrawnCell = coord;
    drawPixel(coord.x, coord.y);
    redraw();
  }, { passive: false });

  canvas.addEventListener('touchend', function(e) {
    e.preventDefault();
    if (e.touches.length < 2) pinchStart = null;
    if (e.touches.length === 0 && movePan) {
      movePan = null;
      canvas.style.cursor = currentTool === 'move' ? 'grab' : canvas.style.cursor;
    }
    if (e.touches.length === 0 && isDrawing) {
      isDrawing = false; saveHistory(); updateMaterialList(); updateInfoBox();
    }
  }, { passive: false });

  document.querySelectorAll('.tool-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { setTool(btn.dataset.tool); });
  });
  document.querySelectorAll('.m-tool-btn[data-tool]').forEach(function(btn) {
    btn.addEventListener('click', function() { setTool(btn.dataset.tool); });
  });

  document.getElementById('colorInput').addEventListener('input', function(e) { setColor(e.target.value); });

  function hasBeads() {
    for (var y = 0; y < gridSize; y++) {
      for (var x = 0; x < gridSize; x++) {
        if (pixels[y][x]) return true;
      }
    }
    return false;
  }

  function applyBoardChange(newSize) {
    var oldSize = gridSize;
    var oldPixels = pixels;
    gridSize = newSize;
    zoomLevel = 1;
    buildPegMask();
    initPixels();
    if (oldPixels && oldSize > 0) {
      var offset = Math.floor((newSize - oldSize) / 2);
      for (var y = 0; y < oldSize; y++) {
        for (var x = 0; x < oldSize; x++) {
          if (!oldPixels[y] || !oldPixels[y][x]) continue;
          var nx = x + offset, ny = y + offset;
          if (nx < 0 || nx >= newSize || ny < 0 || ny >= newSize) continue;
          if (isPegValid(nx, ny)) pixels[ny][nx] = oldPixels[y][x];
        }
      }
    }
    history = []; historyIndex = -1;
    saveHistory();
    resizeCanvas();
    updateMaterialList();
    updateInfoBox();
  }

  function handleSizeChange(e) {
    var newSize = parseInt(e.target.value);
    var selects = [document.getElementById('sizeSelect'), document.getElementById('mSizeSelect')];
    if (hasBeads() && newSize !== gridSize) {
      selects.forEach(function(s) { if (s) s.value = gridSize; });
      var msg = newSize > gridSize
        ? '将扩大钉板，原有拼豆会居中保留在新的画布上。'
        : '将缩小钉板，超出新尺寸边缘的拼豆会被裁掉，其余居中保留。';
      showConfirm('切换钉板尺寸', msg, function() {
        selects.forEach(function(s) { if (s) s.value = newSize; });
        applyBoardChange(newSize);
      });
    } else {
      applyBoardChange(newSize);
    }
  }
  document.getElementById('sizeSelect').addEventListener('change', handleSizeChange);
  document.getElementById('mSizeSelect').addEventListener('change', handleSizeChange);

  function handleGridToggle() {
    showGrid = this.checked;
    var otherId = this.id === 'gridToggle' ? 'mGridToggle' : 'gridToggle';
    var other = document.getElementById(otherId);
    if (other) other.checked = showGrid;
    redraw();
    saveState();
  }
  function handleBeadStyleToggle() {
    beadStyle = this.checked;
    var otherId = this.id === 'beadStyleToggle' ? 'mBeadStyleToggle' : 'beadStyleToggle';
    var other = document.getElementById(otherId);
    if (other) other.checked = beadStyle;
    redraw();
    saveState();
  }
  function handleIronedToggle() {
    ironedView = this.checked;
    var otherId = this.id === 'ironedToggle' ? 'mIronedToggle' : 'ironedToggle';
    var other = document.getElementById(otherId);
    if (other) other.checked = ironedView;
    redraw();
    saveState();
  }
  function handleMirrorDrawToggle() {
    mirrorDraw = this.checked;
    var otherId = this.id === 'mirrorDrawToggle' ? 'mMirrorDrawToggle' : 'mirrorDrawToggle';
    var other = document.getElementById(otherId);
    if (other) other.checked = mirrorDraw;
    saveState();
  }

  document.getElementById('gridToggle').addEventListener('change', handleGridToggle);
  document.getElementById('beadStyleToggle').addEventListener('change', handleBeadStyleToggle);
  document.getElementById('ironedToggle').addEventListener('change', handleIronedToggle);
  document.getElementById('mirrorDrawToggle').addEventListener('change', handleMirrorDrawToggle);
  document.getElementById('mGridToggle').addEventListener('change', handleGridToggle);
  document.getElementById('mBeadStyleToggle').addEventListener('change', handleBeadStyleToggle);
  document.getElementById('mMirrorDrawToggle').addEventListener('change', handleMirrorDrawToggle);

  document.getElementById('undoBtn').addEventListener('click', undo);
  document.getElementById('redoBtn').addEventListener('click', redo);
  document.getElementById('mUndoBtn').addEventListener('click', undo);
  document.getElementById('mRedoBtn').addEventListener('click', redo);
  document.getElementById('clearBtn').addEventListener('click', clearCanvas);
  document.getElementById('clearBtn2').addEventListener('click', clearCanvas);
  document.getElementById('mClearBtn4').addEventListener('click', clearCanvas);

  document.getElementById('confirmOkBtn').addEventListener('click', function() {
    var cb = confirmCallback;
    hideConfirm();
    closeSlidePanels();
    if (cb) cb();
  });
  document.getElementById('confirmCancelBtn').addEventListener('click', hideConfirm);
  document.getElementById('confirmOverlay').addEventListener('click', function(e) {
    if (e.target === this) hideConfirm();
  });
  document.getElementById('mirrorHBtn').addEventListener('click', mirrorHorizontal);
  document.getElementById('mirrorVBtn').addEventListener('click', mirrorVertical);
  document.getElementById('rotateBtn').addEventListener('click', rotateClockwise);
  document.getElementById('mMirrorHBtn').addEventListener('click', mirrorHorizontal);
  document.getElementById('mMirrorVBtn').addEventListener('click', mirrorVertical);
  document.getElementById('mRotateBtn').addEventListener('click', rotateClockwise);

  document.getElementById('exportPngBtn').addEventListener('click', function() { downloadPNG(10); });
  document.getElementById('exportPngBtn2').addEventListener('click', function() { downloadPNG(10); });
  document.getElementById('exportSvgBtn').addEventListener('click', downloadSVG);
  document.getElementById('exportPatternBtn').addEventListener('click', downloadPattern);
  document.getElementById('mExportPatternBtn').addEventListener('click', downloadPattern);

  document.getElementById('mIronedBtn').addEventListener('click', function() {
    ironedView = !ironedView;
    this.classList.toggle('active', ironedView);
    var ironedCb = document.getElementById('ironedToggle');
    if (ironedCb) ironedCb.checked = ironedView;
    redraw();
    saveState();
    showToast(ironedView ? '已开启熨烫效果预览' : '已关闭熨烫效果预览');
  });

  document.getElementById('importImgBtn').addEventListener('click', function() { document.getElementById('imgFileInput').click(); });
  document.getElementById('importBtn').addEventListener('click', function() { document.getElementById('imgFileInput').click(); });
  document.getElementById('mImportBtn').addEventListener('click', function() { document.getElementById('imgFileInput').click(); });
  document.getElementById('imgFileInput').addEventListener('change', function(e) {
    var file = e.target.files[0];
    if (file) { importImage(file); e.target.value = ''; }
  });

  document.getElementById('zoomInBtn').addEventListener('click', function() {
    zoomLevel = Math.min(3, zoomLevel + 0.25);
    resizeCanvas();
  });
  document.getElementById('zoomOutBtn').addEventListener('click', function() {
    zoomLevel = Math.max(0.5, zoomLevel - 0.25);
    resizeCanvas();
  });
  document.getElementById('zoomFitBtn').addEventListener('click', function() {
    zoomLevel = 1;
    resizeCanvas();
  });

  canvasScrollerEl.addEventListener('wheel', function(e) {
    e.preventDefault();
    var delta = e.deltaY < 0 ? 0.12 : -0.12;
    var newZoom = Math.max(0.5, Math.min(3, +(zoomLevel + delta).toFixed(2)));
    if (newZoom === zoomLevel) return;
    var oldRect = canvas.getBoundingClientRect();
    var mx = e.clientX - oldRect.left;
    var my = e.clientY - oldRect.top;
    var ratio = newZoom / zoomLevel;
    var targetMx = mx * ratio;
    var targetMy = my * ratio;
    zoomLevel = newZoom;
    resizeCanvas();
    var newRect = canvas.getBoundingClientRect();
    canvasScrollerEl.scrollLeft += targetMx - (e.clientX - newRect.left);
    canvasScrollerEl.scrollTop += targetMy - (e.clientY - newRect.top);
  }, { passive: false });

  document.getElementById('mColorBtn').addEventListener('click', function() { openSlidePanel('colorPanel'); });
  document.getElementById('mPanelBtn').addEventListener('click', function() { openSlidePanel('morePanel'); });
  document.getElementById('slideOverlay').addEventListener('click', closeSlidePanels);

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { closeSlidePanels(); hideConfirm(); return; }
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') { e.preventDefault(); undo(); }
      else if (e.key === 'y') { e.preventDefault(); redo(); }
      return;
    }
    var keyMap = { b: 'pencil', e: 'eraser', g: 'bucket', i: 'picker' };
    var tool = keyMap[e.key.toLowerCase()];
    if (tool) setTool(tool);
    if (e.key === '=' || e.key === '+') { zoomLevel = Math.min(3, zoomLevel + 0.25); resizeCanvas(); }
    if (e.key === '-') { zoomLevel = Math.max(0.5, zoomLevel - 0.25); resizeCanvas(); }
    if (e.key === '0') { zoomLevel = 1; resizeCanvas(); }
  });

  window.addEventListener('resize', resizeCanvas);

  var saved = loadState();
  if (saved) {
    if (saved.gridSize) gridSize = saved.gridSize;
    if (saved.boardShape) boardShape = saved.boardShape;
    if (saved.showGrid !== undefined) showGrid = saved.showGrid;
    if (saved.beadStyle !== undefined) beadStyle = saved.beadStyle;
    if (saved.ironedView !== undefined) ironedView = saved.ironedView;
    if (saved.mirrorDraw !== undefined) mirrorDraw = saved.mirrorDraw;
    if (saved.currentColor) currentColor = saved.currentColor;
  }

  buildPalette('paletteContainer');
  buildPalette('mobilePaletteContainer');
  buildPegMask();
  initPixels();

  if (saved && saved.pixels) {
    for (var y = 0; y < gridSize && y < saved.pixels.length; y++) {
      if (!saved.pixels[y]) continue;
      for (var x = 0; x < gridSize && x < saved.pixels[y].length; x++) {
        pixels[y][x] = saved.pixels[y][x];
      }
    }
  }

  setColor(currentColor);

  ['sizeSelect', 'mSizeSelect'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = gridSize;
  });
  ['gridToggle', 'mGridToggle'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.checked = showGrid;
  });
  ['beadStyleToggle', 'mBeadStyleToggle'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.checked = beadStyle;
  });
  var ironedCb0 = document.getElementById('ironedToggle');
  if (ironedCb0) ironedCb0.checked = ironedView;
  var mIronedBtn0 = document.getElementById('mIronedBtn');
  if (mIronedBtn0) mIronedBtn0.classList.toggle('active', ironedView);
  ['mirrorDrawToggle', 'mMirrorDrawToggle'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.checked = mirrorDraw;
  });

  resizeCanvas();
  saveHistory();
  updateMaterialList();
  updateInfoBox();
})();
