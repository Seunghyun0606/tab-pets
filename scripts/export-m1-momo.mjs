import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const sourceDir = path.join(root, 'art', 'drafts', 'm1-momo');
const masterDir = path.join(root, 'art', 'masters', 'm1-momo', 'browser');
const exportDir = path.join(root, 'art', 'exports', 'm1-momo');
const frameDir = path.join(exportDir, 'browser');
const behaviors = [
  { id: 'idle', fps: 6, loop: true },
  { id: 'walk', fps: 9, loop: true },
  { id: 'sit', fps: 6, loop: false },
  { id: 'look', fps: 6, loop: false },
  { id: 'sleep', fps: 4, loop: true },
  { id: 'groom', fps: 8, loop: false },
];
const sourceSize = 1254;
const cellSize = sourceSize / 2;
const masterSize = 512;
const runtimeSize = 256;
const masterBaseline = 440;
const runtimeBaseline = masterBaseline / 2;
const scale = 0.68;
const alphaFloor = 32;

function cleanCell(sheet, row, column) {
  const cell = Buffer.alloc(cellSize * cellSize * 4);
  let minX = cellSize;
  let minY = cellSize;
  let maxX = -1;
  let maxY = -1;
  let cleared = 0;

  for (let y = 0; y < cellSize; y += 1) {
    for (let x = 0; x < cellSize; x += 1) {
      const source = ((row * cellSize + y) * sourceSize + column * cellSize + x) * 4;
      const target = (y * cellSize + x) * 4;
      const alpha = sheet[source + 3];
      if (alpha < alphaFloor) {
        if (alpha > 0) cleared += 1;
        continue;
      }
      sheet.copy(cell, target, source, source + 4);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < 0) throw new Error(`Empty frame at ${row}, ${column}`);
  return { cell, bounds: { minX, minY, maxX, maxY }, cleared };
}

async function exportFrame(id, index, cell, bounds) {
  const sourceWidth = bounds.maxX - bounds.minX + 1;
  const sourceHeight = bounds.maxY - bounds.minY + 1;
  const scaledWidth = Math.round(sourceWidth * scale);
  const scaledHeight = Math.round(sourceHeight * scale);
  const scaled = await sharp(cell, {
    raw: { width: cellSize, height: cellSize, channels: 4 },
  }).extract({ left: bounds.minX, top: bounds.minY, width: sourceWidth, height: sourceHeight })
    .resize(scaledWidth, scaledHeight, { kernel: 'lanczos3' }).png().toBuffer();

  const left = Math.round((masterSize - scaledWidth) / 2);
  const top = masterBaseline - scaledHeight;
  if (left < 0 || top < 0 || left + scaledWidth > masterSize || top + scaledHeight > masterSize) {
    throw new Error(`${id}-${index}: frame exceeds master canvas (left=${left}, top=${top}, bounds=${JSON.stringify(bounds)})`);
  }

  const master = await sharp({
    create: { width: masterSize, height: masterSize, channels: 4, background: '#00000000' },
  }).composite([{ input: scaled, left, top }]).png().toBuffer();
  const filename = `${id}-${String(index).padStart(2, '0')}`;
  await writeFile(path.join(masterDir, `${filename}.png`), master);
  await sharp(master)
    .resize(runtimeSize, runtimeSize, { kernel: 'lanczos3' })
    .webp({ lossless: true, effort: 6 })
    .toFile(path.join(frameDir, `${filename}.webp`));
}

await mkdir(masterDir, { recursive: true });
await mkdir(frameDir, { recursive: true });
const manifest = { status: 'candidate-not-wired', baseline: runtimeBaseline, animations: [] };

for (const behavior of behaviors) {
  const source = path.join(sourceDir, `${behavior.id}-concept.png`);
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== sourceSize || info.height !== sourceSize || info.channels !== 4) {
    throw new Error(`${source}: expected ${sourceSize}x${sourceSize} RGBA`);
  }
  let cleared = 0;
  for (let index = 0; index < 4; index += 1) {
    const { cell, bounds, cleared: removed } = cleanCell(data, Math.floor(index / 2), index % 2);
    cleared += removed;
    await exportFrame(behavior.id, index, cell, bounds);
  }
  manifest.animations.push({ ...behavior, frames: 4, files: Array.from({ length: 4 }, (_, i) => `browser/${behavior.id}-${String(i).padStart(2, '0')}.webp`) });
  process.stdout.write(`${behavior.id}: 4 frames, removed ${cleared} low-alpha pixels\n`);
}

await writeFile(path.join(exportDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

for (const [name, background] of [['light', '#e7e9ec'], ['dark', '#30343b']]) {
  const tiles = [];
  for (let row = 0; row < behaviors.length; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const id = behaviors[row].id;
      const filename = `${id}-${String(column).padStart(2, '0')}.webp`;
      const input = await sharp(path.join(frameDir, filename)).resize(96, 96).png().toBuffer();
      tiles.push({ input, left: 8 + column * 112, top: 8 + row * 112 });
    }
  }
  await sharp({
    create: { width: 448, height: 672, channels: 4, background },
  }).composite(tiles).png().toFile(path.join(exportDir, `preview-${name}.png`));
}
