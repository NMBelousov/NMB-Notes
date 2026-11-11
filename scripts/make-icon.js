'use strict';

/** Генерация build/icon.png без внешних зависимостей (чистый Node.js + zlib). */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const SIZE = 1024;
const SS = 2;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function hex(value) {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  const num = parseInt(match[1], 16);
  return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
}

function mix(a, b, t) {
  const clamped = Math.min(1, Math.max(0, t));
  return [
    a[0] + (b[0] - a[0]) * clamped,
    a[1] + (b[1] - a[1]) * clamped,
    a[2] + (b[2] - a[2]) * clamped,
  ];
}

function insideRoundedRect(px, py, x, y, w, h, r) {
  const cx = Math.max(x + r, Math.min(px, x + w - r));
  const cy = Math.max(y + r, Math.min(py, y + h - r));
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

const BG_START = hex('#8a5cf5');
const BG_END = hex('#241b3f');
const BAR_COLORS = [hex('#d7c8ff'), hex('#b49bff'), hex('#8a5cf5'), hex('#6d8bff')];

const BAR_WIDTH = 86;
const BAR_GAP = 34;
const BAR_BOTTOM = 770;
const BAR_HEIGHTS = [270, 490, 390, 220];

function sample(x, y) {
  // Прозрачный фон
  if (!insideRoundedRect(x, y, 40, 40, SIZE - 80, SIZE - 80, 220)) {
    return [0, 0, 0, 0];
  }

  const t = Math.min(1, Math.max(0, (x + y) / (SIZE * 2)));
  let color = mix(BG_START, BG_END, 0.25 + t * 0.95);

  // Мягкий блик сверху
  const glow = Math.max(0, 1 - Math.hypot(x - 300, y - 250) / 620);
  color = mix(color, [1, 1, 1], glow * 0.07);

  const totalWidth = BAR_WIDTH * 4 + BAR_GAP * 3;
  const startX = (SIZE - totalWidth) / 2;
  for (let index = 0; index < 4; index += 1) {
    const bx = startX + index * (BAR_WIDTH + BAR_GAP);
    const bh = BAR_HEIGHTS[index];
    const by = BAR_BOTTOM - bh;
    if (insideRoundedRect(x, y, bx, by, BAR_WIDTH, bh, BAR_WIDTH / 2)) {
      const grad = Math.min(1, Math.max(0, (y - by) / bh));
      const barColor = mix(
        mix(BAR_COLORS[index], [1, 1, 1], 0.2),
        BAR_COLORS[index],
        grad * 0.75 + 0.15
      );
      color = mix(color, barColor, 0.98);
    }
  }

  // Маленькая точка-акцент
  if ((x - 760) ** 2 + (y - 264) ** 2 <= 26 ** 2) {
    color = mix(color, hex('#ffffff'), 0.9);
  }

  return [color[0], color[1], color[2], 1];
}

function buildPixels() {
  const pixels = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const [cr, cg, cb, ca] = sample(
            x + (sx + 0.5) / SS,
            y + (sy + 0.5) / SS
          );
          r += cr * ca;
          g += cg * ca;
          b += cb * ca;
          a += ca;
        }
      }
      const count = SS * SS;
      const alpha = a / count;
      const offset = (y * SIZE + x) * 4;
      if (alpha > 0) {
        pixels[offset] = Math.round((r / a) * 255);
        pixels[offset + 1] = Math.round((g / a) * 255);
        pixels[offset + 2] = Math.round((b / a) * 255);
      }
      pixels[offset + 3] = Math.round(alpha * 255);
    }
  }
  return pixels;
}

function encodePng(pixels) {
  const scanlines = Buffer.alloc(SIZE * (SIZE * 4 + 1));
  for (let y = 0; y < SIZE; y += 1) {
    const rowStart = y * (SIZE * 4 + 1);
    scanlines[rowStart] = 0;
    pixels.copy(scanlines, rowStart + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, '..', 'build');
fs.mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, 'icon.png');
fs.writeFileSync(file, encodePng(buildPixels()));
console.log(`✓ ${path.relative(process.cwd(), file)} (${SIZE}×${SIZE})`);
