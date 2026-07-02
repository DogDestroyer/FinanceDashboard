// Zero-dependency icon generator for Delta AM.
// Draws a filled delta triangle glyph (brass on ink) and writes PNGs by
// hand-encoding RGBA scanlines through node:zlib. No sharp / canvas needed.
// Run: node scripts/generate-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const INK = [0x0d, 0x13, 0x21];
const BRASS = [0xd9, 0xa4, 0x41];
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

// ---- PNG encoding ----
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
};
const png = (size, rgba) => {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
};

// ---- triangle coverage (4x4 supersampled for anti-aliasing) ----
const edge = (px, py, ax, ay, bx, by) => (px - ax) * (by - ay) - (bx - ax) * (py - ay);
const inTri = (px, py, v) => {
  const d1 = edge(px, py, v[0], v[1], v[2], v[3]);
  const d2 = edge(px, py, v[2], v[3], v[4], v[5]);
  const d3 = edge(px, py, v[4], v[5], v[0], v[1]);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
};

const draw = (size) => {
  const rgba = Buffer.alloc(size * size * 4);
  // upward delta triangle, generous padding
  const v = [size * 0.5, size * 0.20, size * 0.20, size * 0.80, size * 0.80, size * 0.80];
  const S = 4; // subsamples per axis
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < S; sy++)
        for (let sx = 0; sx < S; sx++)
          if (inTri(x + (sx + 0.5) / S, y + (sy + 0.5) / S, v)) hits++;
      const cov = hits / (S * S);
      const o = (y * size + x) * 4;
      rgba[o] = Math.round(INK[0] * (1 - cov) + BRASS[0] * cov);
      rgba[o + 1] = Math.round(INK[1] * (1 - cov) + BRASS[1] * cov);
      rgba[o + 2] = Math.round(INK[2] * (1 - cov) + BRASS[2] * cov);
      rgba[o + 3] = 0xff;
    }
  }
  return rgba;
};

mkdirSync(OUT, { recursive: true });
for (const size of [192, 512, 180]) {
  writeFileSync(join(OUT, `icon-${size}.png`), png(size, draw(size)));
  console.log(`wrote public/icon-${size}.png (${size}x${size})`);
}
