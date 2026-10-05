import { constants } from 'node:fs';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const sourceRoot = path.join(root, 'art', 'exports', 'm1-momo');
const targetRoot = path.join(root, 'src', 'assets', 'pets', 'momo');
const source = JSON.parse(await readFile(path.join(sourceRoot, 'manifest.json'), 'utf8'));
const expectedIds = ['idle', 'walk', 'sit', 'look', 'sleep', 'groom'];

if (source.status !== 'candidate-not-wired' || source.baseline !== 220 ||
    JSON.stringify(source.animations.map(({ id }) => id)) !== JSON.stringify(expectedIds)) {
  throw new Error('M1 Momo source manifest does not match the approved six-animation set.');
}

async function copyWithoutOverwrite(relativePath) {
  if (!/^browser\/[a-z]+-0[0-3]\.webp$/u.test(relativePath)) {
    throw new Error(`Unexpected sprite path: ${relativePath}`);
  }
  const from = path.join(sourceRoot, relativePath);
  const to = path.join(targetRoot, relativePath);
  await stat(from);
  await mkdir(path.dirname(to), { recursive: true });
  try {
    const existing = await readFile(to);
    const candidate = await readFile(from);
    if (!existing.equals(candidate)) throw new Error(`Runtime sprite differs from approved candidate: ${relativePath}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await copyFile(from, to, constants.COPYFILE_EXCL);
  }
}

const animations = [];
for (const animation of source.animations) {
  if (animation.frames !== 4 || animation.files.length !== 4 ||
      !Number.isFinite(animation.fps) || animation.fps <= 0 || typeof animation.loop !== 'boolean') {
    throw new Error(`Invalid animation contract: ${animation.id}`);
  }
  for (const [index, file] of animation.files.entries()) {
    if (file !== `browser/${animation.id}-${String(index).padStart(2, '0')}.webp`) {
      throw new Error(`Unexpected frame order: ${file}`);
    }
    await copyWithoutOverwrite(file);
  }
  animations.push({
    id: animation.id,
    frames: animation.frames,
    fps: animation.fps,
    loop: animation.loop,
    baseline: source.baseline,
    browser: animation.files,
  });
}

const manifestPath = path.join(targetRoot, 'animations.json');
const manifest = `${JSON.stringify({ animations }, null, 2)}\n`;
try {
  const existing = await readFile(manifestPath, 'utf8');
  if (existing !== manifest) throw new Error('Runtime animation contract differs from approved candidates.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await writeFile(manifestPath, manifest, 'utf8');
}

process.stdout.write(`Packaged ${animations.length} approved animations and ${animations.reduce((sum, item) => sum + item.frames, 0)} frames.\n`);
