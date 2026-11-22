'use strict';

/**
 * Собирает иконки приложения из исходного логотипа `logo v1.png`.
 * Без внешних зависимостей: PNG-декодер/энкодер на Node.js + zlib.
 *
 * Результат:
 *   src/renderer/assets/logo.png — обрезанный логотип для интерфейса/README;
 *   build/icon.png             — квадратная иконка приложения 1024×1024.
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.join(__dirname, '..');
const SOURCE_CANDIDATES = [
  path.join(ROOT, 'logo v1.png'),
  path.join(ROOT, 'src', 'renderer', 'assets', 'logo.png'),
  path.join(ROOT, 'build', 'icon.png'),
];

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

function encodePng(width, height, pixels) {
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const start = y * (width * 4 + 1);
    scanlines[start] = 0;
    pixels.copy(scanlines, start + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
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

function decodePng(file) {
  const buffer = fs.readFileSync(file);
  let offset = 8;
  let ihdr = null;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') ihdr = data;
    else if (type === 'IDAT') idat.push(data);
    offset += 12 + length;
  }
  if (!ihdr) throw new Error(`Не удалось прочитать PNG: ${file}`);
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const depth = ihdr[8];
  const colorType = ihdr[9];
  const interlace = ihdr[12];
  if (depth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error('Поддерживается только 8-битный RGBA PNG без интерлейса');
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  const pixels = Buffer.alloc(stride * height);
  let previous = Buffer.alloc(stride);
  let position = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[position];
    position += 1;
    const line = raw.subarray(position, position + stride);
    position += stride;
    const out = Buffer.alloc(stride);
    for (let x = 0; x < stride; x += 1) {
      const left = x >= bpp ? out[x - bpp] : 0;
      const up = previous[x];
      const upLeft = x >= bpp ? previous[x - bpp] : 0;
      let value = line[x];
      if (filter === 1) value = (value + left) & 255;
      else if (filter === 2) value = (value + up) & 255;
      else if (filter === 3) value = (value + ((left + up) >> 1)) & 255;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        value = (value + predictor) & 255;
      }
      out[x] = value;
    }
    out.copy(pixels, y * stride);
    previous = out;
  }
  return { width, height, pixels };
}

function alphaBounds(image) {
  const { width, height, pixels } = image;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, width, height };
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function cropImage(image, bounds, padding = 0) {
  const width = bounds.width + padding * 2;
  const height = bounds.height + padding * 2;
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceX = bounds.x + x - padding;
      const sourceY = bounds.y + y - padding;
      if (
        sourceX < 0 ||
        sourceY < 0 ||
        sourceX >= image.width ||
        sourceY >= image.height
      ) {
        continue;
      }
      const from = (sourceY * image.width + sourceX) * 4;
      const to = (y * width + x) * 4;
      image.pixels.copy(pixels, to, from, from + 4);
    }
  }
  return { width, height, pixels };
}

function sampleBilinear(image, x, y) {
  if (x < -0.5 || y < -0.5 || x > image.width - 0.5 || y > image.height - 0.5) {
    return [0, 0, 0, 0];
  }
  const clampedX = Math.max(0, Math.min(image.width - 1, x));
  const clampedY = Math.max(0, Math.min(image.height - 1, y));
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(image.width - 1, x0 + 1);
  const y1 = Math.min(image.height - 1, y0 + 1);
  const fx = clampedX - x0;
  const fy = clampedY - y0;
  const sample = (sx, sy) => {
    const index = (sy * image.width + sx) * 4;
    const alpha = image.pixels[index + 3] / 255;
    return [
      image.pixels[index] * alpha,
      image.pixels[index + 1] * alpha,
      image.pixels[index + 2] * alpha,
      alpha,
    ];
  };
  const mix = (a, b, t) => a + (b - a) * t;
  const top = sample(x0, y0).map((value, index) => mix(value, sample(x1, y0)[index], fx));
  const bottom = sample(x0, y1).map((value, index) => mix(value, sample(x1, y1)[index], fx));
  const result = top.map((value, index) => mix(value, bottom[index], fy));
  const alpha = result[3];
  if (alpha <= 0.0001) return [0, 0, 0, 0];
  return [result[0] / alpha, result[1] / alpha, result[2] / alpha, alpha];
}

function insideRoundedRect(x, y, left, top, width, height, radius) {
  const cx = Math.max(left + radius, Math.min(x, left + width - radius));
  const cy = Math.max(top + radius, Math.min(y, top + height - radius));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function buildAppIcon(logo) {
  const SIZE = 1024;
  const SS = 2;
  const targetWidth = 780;
  const scale = targetWidth / logo.width;
  const targetHeight = logo.height * scale;
  const logoX = (SIZE - targetWidth) / 2;
  const logoY = (SIZE - targetHeight) / 2;
  const pixels = Buffer.alloc(SIZE * SIZE * 4);

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          if (!insideRoundedRect(px, py, 64, 64, SIZE - 128, SIZE - 128, 210)) {
            continue;
          }
          // Мягкий светло-голубой фон, как у облака вокруг логотипа.
          const t = py / SIZE;
          let cr = 255 - t * 8;
          let cg = 253 - t * 5;
          let cb = 255 - t * 2;
          const logoPixel = sampleBilinear(
            logo,
            (px - logoX) / scale,
            (py - logoY) / scale
          );
          const alpha = logoPixel[3];
          if (alpha > 0) {
            cr = cr * (1 - alpha) + logoPixel[0] * alpha;
            cg = cg * (1 - alpha) + logoPixel[1] * alpha;
            cb = cb * (1 - alpha) + logoPixel[2] * alpha;
          }
          r += cr;
          g += cg;
          b += cb;
          a += 1;
        }
      }
      const count = SS * SS;
      const offset = (y * SIZE + x) * 4;
      if (a > 0) {
        pixels[offset] = Math.round(r / a);
        pixels[offset + 1] = Math.round(g / a);
        pixels[offset + 2] = Math.round(b / a);
      }
      pixels[offset + 3] = Math.round((a / count) * 255);
    }
  }
  return { width: SIZE, height: SIZE, pixels };
}

const source = SOURCE_CANDIDATES.find((candidate) => fs.existsSync(candidate));
if (!source) {
  throw new Error('Не найден исходный логотип: logo v1.png');
}

const decoded = decodePng(source);
const bounds = alphaBounds(decoded);
const cropped = cropImage(decoded, bounds, 8);
const appIcon = buildAppIcon(cropped);

const assetsDir = path.join(ROOT, 'src', 'renderer', 'assets');
const buildDir = path.join(ROOT, 'build');
fs.mkdirSync(assetsDir, { recursive: true });
fs.mkdirSync(buildDir, { recursive: true });

const logoFile = path.join(assetsDir, 'logo.png');
const iconFile = path.join(buildDir, 'icon.png');
fs.writeFileSync(logoFile, encodePng(cropped.width, cropped.height, cropped.pixels));
fs.writeFileSync(iconFile, encodePng(appIcon.width, appIcon.height, appIcon.pixels));

console.log(
  `✓ ${path.relative(ROOT, logoFile)} (${cropped.width}×${cropped.height})`
);
console.log(`✓ ${path.relative(ROOT, iconFile)} (${appIcon.width}×${appIcon.height})`);
