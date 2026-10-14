#!/usr/bin/env node
/**
 * Genera le icone PNG della PWA dalla stessa forma dell'icona SVG.
 *
 * Scrive i PNG a mano con zlib, invece di aggiungere una dipendenza di
 * elaborazione immagini a un container che non ne ha bisogno. Si rilancia solo
 * se cambia il disegno dell'icona.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { crc32 } from "node:zlib";

const BLUE = [0x2a, 0x78, 0xd6];
const PAPER = [0xfc, 0xfc, 0xfb];
const SOFT = [0xcd, 0xe2, 0xfb];
const DEEP = [0x18, 0x4f, 0x95];

/** Disegna l'icona in un buffer RGBA alla dimensione richiesta. */
function draw(size, { maskable = false } = {}) {
  const pixels = Buffer.alloc(size * size * 4);
  const s = (value) => (value / 512) * size;
  // Su maskable il disegno sta nella zona sicura centrale (80%).
  const inset = maskable ? size * 0.1 : 0;
  const scale = maskable ? 0.8 : 1;
  const px = (value) => inset + s(value) * scale;

  const radius = maskable ? 0 : s(112);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let color = null;
      let alpha = 0;

      const inRounded = insideRoundedRect(x, y, 0, 0, size, size, radius);
      if (inRounded) {
        color = BLUE;
        alpha = 255;
      }

      // Corpo della carta
      if (inRect(x, y, px(112), px(168), px(400), px(368)) && inRounded) {
        color = PAPER;
      }
      // Banda magnetica
      if (inRect(x, y, px(112), px(232), px(400), px(280)) && inRounded) {
        color = SOFT;
      }
      // Pastiglia superiore
      if (inRect(x, y, px(176), px(136), px(336), px(168)) && inRounded) {
        color = DEEP;
      }
      // Moneta
      const cx = px(336);
      const cy = px(256);
      const r = s(28) * scale;
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r && inRounded) {
        color = BLUE;
      }

      const offset = (y * size + x) * 4;
      if (color) {
        pixels[offset] = color[0];
        pixels[offset + 1] = color[1];
        pixels[offset + 2] = color[2];
        pixels[offset + 3] = alpha;
      }
    }
  }
  return pixels;
}

function inRect(x, y, x0, y0, x1, y1) {
  return x >= x0 && x < x1 && y >= y0 && y < y1;
}

function insideRoundedRect(x, y, x0, y0, x1, y1, radius) {
  if (x < x0 || x >= x1 || y < y0 || y >= y1) return false;
  if (radius <= 0) return true;
  const corners = [
    [x0 + radius, y0 + radius],
    [x1 - radius, y0 + radius],
    [x0 + radius, y1 - radius],
    [x1 - radius, y1 - radius],
  ];
  const outsideX = x < x0 + radius || x >= x1 - radius;
  const outsideY = y < y0 + radius || y >= y1 - radius;
  if (!(outsideX && outsideY)) return true;
  return corners.some(([cx, cy]) => (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius);
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Ogni riga va preceduta dal byte di filtro (0 = nessun filtro).
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const targets = [
  { file: "public/icon-192.png", size: 192, options: {} },
  { file: "public/icon-512.png", size: 512, options: {} },
  { file: "public/icon-maskable.png", size: 512, options: { maskable: true } },
  { file: "public/apple-icon.png", size: 180, options: {} },
];

for (const target of targets) {
  writeFileSync(target.file, encodePng(target.size, draw(target.size, target.options)));
  console.log(`${target.file} (${target.size}px)`);
}
