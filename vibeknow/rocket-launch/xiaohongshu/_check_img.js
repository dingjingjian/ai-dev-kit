const fs = require('fs');
const buf = fs.readFileSync('C:/Users/ASUS/Documents/小有可为-AI向善创新挑战赛/项目文档/06_社媒与传播/05_火箭发射/素材图/07_3D火箭效果.png');
// PNG width/height at bytes 16-23 (big-endian)
const w = buf.readUInt32BE(16);
const h = buf.readUInt32BE(20);
console.log('Width:', w, 'Height:', h, 'Ratio:', (w/h).toFixed(3));
