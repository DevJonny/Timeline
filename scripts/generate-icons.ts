/// <reference types="node" />

/**
 * Generate the PWA icons.
 *
 * A hand-rolled PNG encoder rather than an image library: the icon is a few
 * flat shapes, and `sharp` (the usual choice) is a large native dependency to
 * carry for something a hundred lines of zlib can do. Node's built-in zlib
 * supplies the only non-trivial part.
 *
 * Run with `npm run icons`. Output is committed, so a normal build needs
 * neither this script nor its output regenerated.
 */

import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = join(ROOT, 'public', 'icons');

type RGB = [number, number, number];

const BACKGROUND: RGB = [0x1a, 0x1a, 0x19];
const AXIS: RGB = [0x89, 0x87, 0x81];

/** The four validated family hues, oldest era at the top. */
const MARKS: RGB[] = [
  [0x00, 0x83, 0x00], // age — green
  [0x90, 0x85, 0xe9], // empire — violet
  [0xd5, 0x51, 0x81], // people — magenta
  [0xc9, 0x85, 0x00], // conflict — yellow
];

class Canvas {
  readonly data: Uint8Array;
  // Declared explicitly: Node's strip-only TypeScript mode, which runs this
  // script without a build step, does not support parameter properties.
  readonly size: number;

  constructor(size: number) {
    this.size = size;
    this.data = new Uint8Array(size * size * 4);
  }

  fill(colour: RGB): void {
    for (let i = 0; i < this.size * this.size; i++) this.set(i, colour, 1);
  }

  private set(index: number, [r, g, b]: RGB, alpha: number): void {
    const o = index * 4;
    const inv = 1 - alpha;
    this.data[o] = Math.round((this.data[o] ?? 0) * inv + r * alpha);
    this.data[o + 1] = Math.round((this.data[o + 1] ?? 0) * inv + g * alpha);
    this.data[o + 2] = Math.round((this.data[o + 2] ?? 0) * inv + b * alpha);
    this.data[o + 3] = 255;
  }

  /** Anti-aliased by sampling coverage on a 3×3 sub-grid. */
  private coverage(x: number, y: number, inside: (px: number, py: number) => boolean): number {
    let hits = 0;
    for (let sy = 0; sy < 3; sy++) {
      for (let sx = 0; sx < 3; sx++) {
        if (inside(x + (sx + 0.5) / 3, y + (sy + 0.5) / 3)) hits++;
      }
    }
    return hits / 9;
  }

  shape(colour: RGB, inside: (px: number, py: number) => boolean): void {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const alpha = this.coverage(x, y, inside);
        if (alpha > 0) this.set(y * this.size + x, colour, alpha);
      }
    }
  }

  roundedRect(colour: RGB, x0: number, y0: number, w: number, h: number, r: number): void {
    const x1 = x0 + w;
    const y1 = y0 + h;
    this.shape(colour, (px, py) => {
      if (px < x0 || px > x1 || py < y0 || py > y1) return false;
      const cx = Math.min(Math.max(px, x0 + r), x1 - r);
      const cy = Math.min(Math.max(py, y0 + r), y1 - r);
      return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
    });
  }

  circle(colour: RGB, cx: number, cy: number, radius: number): void {
    this.shape(colour, (px, py) => (px - cx) ** 2 + (py - cy) ** 2 <= radius * radius);
  }
}

// --- PNG encoding -----------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Uint8Array): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(body)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

function encodePng(canvas: Canvas): Buffer {
  const { size, data } = canvas;

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // 10-12: compression, filter, interlace — all zero.

  // Each scanline is prefixed with filter type 0 (none).
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const from = y * size * 4;
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(data.subarray(from, from + size * 4)).copy(raw, y * (size * 4 + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array()),
  ]);
}

// --- the icon itself --------------------------------------------------------

/**
 * A vertical axis with four era marks — the app in miniature.
 *
 * `padding` insets the artwork for maskable icons, whose outer ~10% can be
 * cropped to whatever shape the platform prefers.
 */
function drawIcon(size: number, padding: number): Canvas {
  const canvas = new Canvas(size);
  canvas.fill(BACKGROUND);

  const inset = size * padding;
  const usable = size - inset * 2;
  const axisX = inset + usable * 0.34;
  const axisWidth = Math.max(2, size * 0.035);

  canvas.roundedRect(
    AXIS,
    axisX - axisWidth / 2,
    inset + usable * 0.06,
    axisWidth,
    usable * 0.88,
    axisWidth / 2,
  );

  // Small enough that the axis stays visible between marks — the spine is
  // what makes the icon read as a timeline rather than a colour swatch.
  const radius = usable * 0.072;
  MARKS.forEach((colour, index) => {
    const y = inset + usable * (0.16 + index * 0.226);
    canvas.circle(colour, axisX, y, radius);
    // A tick reaching right from each mark, echoing the timeline's own layout.
    canvas.roundedRect(
      colour,
      axisX + radius * 1.6,
      y - axisWidth * 0.45,
      usable * (0.3 + (index % 2) * 0.16),
      axisWidth * 0.9,
      axisWidth * 0.45,
    );
  });

  return canvas;
}

await mkdir(OUT_DIR, { recursive: true });

const outputs: Array<{ name: string; size: number; padding: number }> = [
  { name: 'icon-192.png', size: 192, padding: 0.06 },
  { name: 'icon-512.png', size: 512, padding: 0.06 },
  // Maskable icons get extra breathing room; platforms may crop to a circle.
  { name: 'icon-maskable-512.png', size: 512, padding: 0.16 },
  // iOS home screen; Safari ignores the manifest icons.
  { name: 'apple-touch-icon.png', size: 180, padding: 0.08 },
];

for (const { name, size, padding } of outputs) {
  const png = encodePng(drawIcon(size, padding));
  await writeFile(join(OUT_DIR, name), png);
  console.log(`✓ ${name} (${size}×${size}, ${(png.length / 1024).toFixed(1)} kB)`);
}
