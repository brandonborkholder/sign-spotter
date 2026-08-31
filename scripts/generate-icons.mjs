import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const COLORS = {
  night: [16, 27, 34, 255],
  orange: [228, 93, 47, 255],
  cream: [255, 244, 232, 255],
  mint: [103, 189, 164, 255],
};

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function makeIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const scale = size / 512;
  const setPixel = (x, y, color) => {
    const offset = (y * size + x) * 4;
    pixels.set(color, offset);
  };
  const fill = (predicate, color) => {
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (predicate(x / scale, y / scale)) setPixel(x, y, color);
      }
    }
  };
  const roundedRect = (left, top, right, bottom, radius) => (x, y) => {
    if (x < left || x > right || y < top || y > bottom) return false;
    const cx = Math.max(left + radius, Math.min(x, right - radius));
    const cy = Math.max(top + radius, Math.min(y, bottom - radius));
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
  };
  const circle = (cx, cy, radius) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;

  fill(() => true, COLORS.night);
  fill(roundedRect(110, 91, 402, 421, 47), COLORS.orange);
  fill(roundedRect(154, 166, 358, 328, 3), COLORS.cream);
  fill(circle(256, 247, 56), COLORS.night);
  fill(circle(256, 247, 34), COLORS.mint);
  fill((x, y) => y >= 118 && y <= 144 && x >= 207 + (144 - y) * 0.69 && x <= 305 - (144 - y) * 0.69, COLORS.night);
  fill(circle(349, 374, 18), COLORS.cream);

  const scanlines = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    scanlines[row] = 0;
    pixels.copy(scanlines, row + 1, y * size * 4, (y + 1) * size * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(scanlines, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

writeFileSync("public/icons/icon-192.png", makeIcon(192));
writeFileSync("public/icons/icon-512.png", makeIcon(512));
writeFileSync("public/icons/icon-maskable-512.png", makeIcon(512));
console.log("Generated PWA icons.");
