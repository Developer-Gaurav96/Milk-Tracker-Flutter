/* Generates the PWA icon set as real PNGs (no dependencies).
   Run: node tools/genicons.js                                              */

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

/* ---------- minimal PNG encoder (RGBA, 8-bit) ---------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([len, typed, crc]);
}

function encodePNG(w, h, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type: RGBA
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- drawing helpers ---------- */

const rgba = (hex, a = 255) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
  a
];

const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);

/* Signed distance to a rounded square centred at (cx, cy). */
function roundedBoxSDF(x, y, cx, cy, half, radius) {
  const qx = Math.abs(x - cx) - (half - radius);
  const qy = Math.abs(y - cy) - (half - radius);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - radius;
}

function blend(dst, src) {
  const a = src[3] / 255;
  if (a <= 0) return dst;
  if (a >= 1) return [src[0], src[1], src[2], 255];
  return [
    Math.round(src[0] * a + dst[0] * (1 - a)),
    Math.round(src[1] * a + dst[1] * (1 - a)),
    Math.round(src[2] * a + dst[2] * (1 - a)),
    Math.round(255 * a + dst[3] * (1 - a))
  ];
}

/* ---------- the icon itself ---------- */

const SLATE_DEEP = rgba('#0B1220');
const SLATE = rgba('#152238');
const ICE = rgba('#7DD3FC');
const ICE_BRIGHT = rgba('#BAE6FD');
const DAHI = rgba('#A78BFA');
const DAHI_DEEP = rgba('#6D28D9');
const WHITE = rgba('#F8FAFC');

/* A milk glass: tapered body, filled with a blue→violet dairy gradient,
   sitting on a dark slate rounded square. */
function sample(u, v, maskable) {
  // Maskable icons get cropped to a circle on some launchers, so the
  // artwork stays inside the 80% safe zone and the backdrop goes full-bleed.
  const inset = maskable ? 0.0 : 0.085;
  const cx = 0.5, cy = 0.5;
  const half = 0.5 - inset;
  const radius = maskable ? half : 0.215;

  let px = [0, 0, 0, 0];

  // Backdrop
  const dBox = roundedBoxSDF(u, v, cx, cy, half, radius);
  const boxAlpha = clamp01(0.5 - dBox * 220);
  if (boxAlpha > 0) {
    const grad = lerp(SLATE_DEEP, SLATE, clamp01((v - 0.1) / 0.8));
    const glow = Math.exp(-(((u - 0.5) ** 2) / 0.10 + ((v - 0.18) ** 2) / 0.045));
    const lit = lerp(grad, lerp(DAHI_DEEP, ICE, 0.35), clamp01(glow) * 0.42);
    px = blend(px, [lit[0], lit[1], lit[2], Math.round(255 * boxAlpha)]);
  }

  // Glass silhouette: narrow at the rim, widening toward the base.
  const rimTop = 0.30;
  const rimBottom = 0.755;
  const rimHalf = 0.125;
  const baseHalf = 0.225;

  let inGlass = false;
  let edgeFade = 0;
  if (v >= rimTop && v <= rimBottom) {
    const t = (v - rimTop) / (rimBottom - rimTop);
    // Slight outward curve so the profile reads as a tumbler, not a trapezoid.
    const width = rimHalf + (baseHalf - rimHalf) * Math.pow(t, 0.78);
    const dist = width - Math.abs(u - 0.5);
    if (dist > -0.012) {
      inGlass = true;
      edgeFade = clamp01(dist / 0.016);
    }
  }

  if (inGlass) {
    const fillLine = 0.415;               // milk surface
    const filled = v >= fillLine;

    let body;
    if (filled) {
      const t = clamp01((v - fillLine) / (rimBottom - fillLine));
      body = lerp(ICE, DAHI, t * 0.85);
    } else {
      // Empty head-space: faint frosted glass.
      body = [214, 230, 244];
    }

    // Vertical sheen down the left side of the glass.
    const sheen = Math.exp(-(((u - 0.40) ** 2) / 0.0042)) * clamp01(1 - Math.abs(v - 0.52) / 0.34);
    body = lerp(body, WHITE, clamp01(sheen) * 0.5);

    // Meniscus: a bright line where the milk meets the glass.
    if (filled) {
      const men = Math.exp(-(((v - fillLine) ** 2) / 0.00028));
      body = lerp(body, ICE_BRIGHT, clamp01(men) * 0.85);
    }

    // Soft top and bottom shading.
    const shade = 1 - clamp01(Math.abs(v - 0.55) / 0.34) * 0.22;
    body = [body[0] * shade, body[1] * shade, body[2] * shade];

    const glassAlpha = Math.round(255 * (filled ? 1 : 0.30 + 0.34 * edgeFade));
    px = blend(px, [body[0], body[1], body[2], glassAlpha]);
  }

  // Rim highlight across the top of the glass.
  const rimLine = Math.exp(-(((v - rimTop) ** 2) / 0.00022)) *
    (Math.abs(u - 0.5) < rimHalf + 0.012 ? 1 : 0);
  if (rimLine > 0.02) {
    px = blend(px, [ICE_BRIGHT[0], ICE_BRIGHT[1], ICE_BRIGHT[2], Math.round(210 * clamp01(rimLine))]);
  }

  return px;
}

function render(size, maskable) {
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // 1.5x oversample for smoother edges at small sizes.
      let acc = [0, 0, 0, 0];
      const N = 3;
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          const u = (x + (sx + 0.5) / N) / size;
          const v = (y + (sy + 0.5) / N) / size;
          const c = sample(u, v, maskable);
          acc = [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2], acc[3] + c[3]];
        }
      }
      const total = N * N;
      const o = (y * size + x) * 4;
      px[o] = Math.round(acc[0] / total);
      px[o + 1] = Math.round(acc[1] / total);
      px[o + 2] = Math.round(acc[2] / total);
      px[o + 3] = Math.round(acc[3] / total);
    }
  }
  return px;
}

const targets = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-180.png', 180, false],
  ['icon-maskable-512.png', 512, true]
];

const outDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(outDir, { recursive: true });

for (const [name, size, maskable] of targets) {
  const buf = encodePNG(size, size, render(size, maskable));
  fs.writeFileSync(path.join(outDir, name), buf);
  console.log('wrote assets/' + name + '  (' + buf.length + ' bytes)');
}
