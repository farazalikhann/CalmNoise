// Generates the PWA icon PNGs in public/icons/ from scratch (no external
// image libraries) — a dark rounded square with a soft teal circle, matching
// the app's brand colors. Re-run with `node scripts/generate-icons.mjs`
// whenever the brand colors in src/config/site.ts change.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const BG = [10, 15, 28]; // #0a0f1c
const ACCENT = [127, 216, 201]; // #7fd8c9

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * @param {number} size canvas size in px
 * @param {number} circleRadiusRatio radius of the accent circle, relative to size
 * @param {number} cornerRadiusRatio corner radius for the rounded-square background, relative to size (0 = maskable/full-bleed)
 */
function renderIcon(size, circleRadiusRatio, cornerRadiusRatio) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * circleRadiusRatio;
  const corner = size * cornerRadiusRatio;
  const edgeSoftness = 1.2; // px of anti-aliasing feather

  const raw = Buffer.alloc(size * (1 + size * 4));
  let offset = 0;

  for (let y = 0; y < size; y++) {
    raw[offset++] = 0; // filter type: none
    for (let x = 0; x < size; x++) {
      // Rounded-rect mask for the background (1 = inside, 0 = outside)
      let inRect = 1;
      if (corner > 0) {
        const dx = Math.max(corner - x, x - (size - corner), 0);
        const dy = Math.max(corner - y, y - (size - corner), 0);
        if (dx > 0 && dy > 0) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          inRect = clamp01(1 - (dist - corner) / edgeSoftness);
        }
      }

      const dist = Math.hypot(x - cx, y - cy);
      const circleAlpha = clamp01(1 - (dist - r) / edgeSoftness);

      let color = BG;
      let alpha = inRect;

      if (circleAlpha > 0) {
        color = [
          lerp(BG[0], ACCENT[0], circleAlpha),
          lerp(BG[1], ACCENT[1], circleAlpha),
          lerp(BG[2], ACCENT[2], circleAlpha),
        ];
      }

      raw[offset++] = Math.round(color[0]);
      raw[offset++] = Math.round(color[1]);
      raw[offset++] = Math.round(color[2]);
      raw[offset++] = Math.round(alpha * 255);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);

  return png;
}

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

const targets = [
  { file: 'icon-192.png', size: 192, circle: 0.32, corner: 0.22 },
  { file: 'icon-512.png', size: 512, circle: 0.32, corner: 0.22 },
  { file: 'icon-192-maskable.png', size: 192, circle: 0.28, corner: 0 },
  { file: 'icon-512-maskable.png', size: 512, circle: 0.28, corner: 0 },
];

for (const t of targets) {
  const png = renderIcon(t.size, t.circle, t.corner);
  writeFileSync(path.join(outDir, t.file), png);
  console.log(`Wrote public/icons/${t.file}`);
}

// ---------------------------------------------------------------------------
// Open Graph image: 1200x630, brand background with two soft glow circles —
// deliberately text-free since we have no font rasterizer here.
// ---------------------------------------------------------------------------

function renderOgImage(width, height) {
  const ACCENT2 = [157, 180, 245]; // #9db4f5
  const glows = [
    { cx: width * 0.28, cy: height * 0.42, r: height * 0.55, color: ACCENT, softness: height * 0.5 },
    { cx: width * 0.78, cy: height * 0.68, r: height * 0.45, color: ACCENT2, softness: height * 0.45 },
  ];

  const raw = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;

  for (let y = 0; y < height; y++) {
    raw[offset++] = 0;
    for (let x = 0; x < width; x++) {
      let color = BG;
      for (const g of glows) {
        const dist = Math.hypot(x - g.cx, y - g.cy);
        const alpha = clamp01(1 - dist / (g.r + g.softness)) * 0.35;
        color = [
          lerp(color[0], g.color[0], alpha),
          lerp(color[1], g.color[1], alpha),
          lerp(color[2], g.color[2], alpha),
        ];
      }
      raw[offset++] = Math.round(color[0]);
      raw[offset++] = Math.round(color[1]);
      raw[offset++] = Math.round(color[2]);
      raw[offset++] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // color type: RGB (no alpha needed for a flat social image)
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Re-pack raw as RGB (strip alpha byte) since IHDR above declares color type 2.
  const rgbRaw = Buffer.alloc(height * (1 + width * 3));
  let rOff = 0;
  let wOff = 0;
  for (let y = 0; y < height; y++) {
    rgbRaw[wOff++] = 0;
    rOff++; // skip filter byte from raw
    for (let x = 0; x < width; x++) {
      rgbRaw[wOff++] = raw[rOff++];
      rgbRaw[wOff++] = raw[rOff++];
      rgbRaw[wOff++] = raw[rOff++];
      rOff++; // skip alpha
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rgbRaw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const ogPng = renderOgImage(1200, 630);
writeFileSync(path.join(__dirname, '..', 'public', 'og-image.png'), ogPng);
console.log('Wrote public/og-image.png');
