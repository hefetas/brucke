// Bağımlılıksız PNG simge üretici: zeminde beyaz "yol" (S eğrisi) ve nokta.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const BG = [15, 118, 110];
const FG = [255, 255, 255];
const WARM = [251, 191, 36];

function crc32(buf) {
  let c, crc = ~0;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x / size, y / size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Yol: x = 0.5 + 0.2*sin(...) eğrisi, yukarı doğru daralan şerit
function design(u, v, { rounded, scale }) {
  const cx = 0.5, cy = 0.5;
  let x = (u - cx) / scale + cx, y = (v - cy) / scale + cy;
  if (rounded) {
    const rx = Math.abs(u - 0.5) - 0.5 + 0.22, ry = Math.abs(v - 0.5) - 0.5 + 0.22;
    if (rx > 0 && ry > 0 && Math.hypot(rx, ry) > 0.22) return [0, 0, 0, 0];
  }
  // Nokta (hedef)
  if (Math.hypot(x - 0.5, y - 0.22) < 0.07) return [...WARM, 255];
  // Yol şeridi
  if (y > 0.3 && y < 0.82) {
    const t = (y - 0.3) / 0.52;
    const center = 0.5 + 0.16 * Math.sin(t * Math.PI * 2);
    const half = 0.025 + 0.09 * t;
    if (Math.abs(x - center) < half) return [...FG, 255];
  }
  return [...BG, 255];
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', png(192, (u, v) => design(u, v, { rounded: true, scale: 1 })));
writeFileSync('public/icons/icon-512.png', png(512, (u, v) => design(u, v, { rounded: true, scale: 1 })));
writeFileSync('public/icons/icon-maskable-512.png', png(512, (u, v) => design(u, v, { rounded: false, scale: 0.78 })));
console.log('Simgeler public/icons klasörüne yazıldı.');
