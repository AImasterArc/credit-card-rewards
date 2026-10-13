// 產生 PWA / iOS 主畫面圖示（純 Node，無外部依賴）
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

const BG_A = hex('#0a84ff');
const BG_B = hex('#30d158');
const WHITE = [255, 255, 255];
const STRIPE = hex('#1c1c1e');
const CHIP = hex('#ffcc00');

const inRoundRect = (u, v, x0, y0, x1, y1, r) => {
  if (u < x0 || u > x1 || v < y0 || v > y1) return false;
  const cx = Math.min(Math.max(u, x0 + r), x1 - r);
  const cy = Math.min(Math.max(v, y0 + r), y1 - r);
  return (u - cx) ** 2 + (v - cy) ** 2 <= r * r;
};

function shade(u, v) {
  // 卡片：置中，落在 maskable 安全區（中央 80%）內
  if (inRoundRect(u, v, 0.2, 0.3, 0.8, 0.7, 0.05)) {
    if (v > 0.37 && v < 0.44) return STRIPE;
    if (inRoundRect(u, v, 0.27, 0.51, 0.38, 0.6, 0.015)) return CHIP;
    if (v > 0.62 && v < 0.645 && u > 0.27 && u < 0.6) return hex('#c7c7cc');
    return WHITE;
  }
  return lerp(BG_A, BG_B, (u + v) / 2);
}

function png(size) {
  const SS = 3; // supersampling
  const row = size * 4 + 1;
  const raw = Buffer.alloc(row * size);
  for (let y = 0; y < size; y++) {
    raw[y * row] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const [cr, cg, cb] = shade((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
          r += cr; g += cg; b += cb;
        }
      const n = SS * SS;
      const o = y * row + 1 + x * 4;
      raw[o] = Math.round(r / n);
      raw[o + 1] = Math.round(g / n);
      raw[o + 2] = Math.round(b / n);
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public', { recursive: true });
writeFileSync('public/apple-touch-icon.png', png(180));
writeFileSync('public/pwa-192.png', png(192));
writeFileSync('public/pwa-512.png', png(512));
writeFileSync(
  'public/favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0a84ff"/><stop offset="1" stop-color="#30d158"/></linearGradient></defs><rect width="64" height="64" rx="14" fill="url(#g)"/><rect x="12.8" y="19.2" width="38.4" height="25.6" rx="3.2" fill="#fff"/><rect x="12.8" y="23.7" width="38.4" height="4.5" fill="#1c1c1e"/><rect x="17.3" y="32.6" width="7" height="5.8" rx="1" fill="#fc0"/></svg>`,
);
console.log('icons generated → public/');
