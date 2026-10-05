import { cp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import { build } from 'esbuild';

const projectRoot = resolve(import.meta.dirname, '..');
const outputRoot = resolve(projectRoot, 'dist');

const fromRoot = (...segments) => resolve(projectRoot, ...segments);
const fromOutput = (...segments) => resolve(outputRoot, ...segments);

await rm(outputRoot, { force: true, recursive: true });
await mkdir(outputRoot, { recursive: true });

const sharedBuildOptions = {
  bundle: true,
  legalComments: 'none',
  minify: false,
  platform: 'browser',
  sourcemap: true,
  target: ['chrome114'],
};

await Promise.all([
  build({
    ...sharedBuildOptions,
    entryPoints: [fromRoot('src/background/serviceWorker.ts')],
    format: 'esm',
    outfile: fromOutput('background/serviceWorker.js'),
  }),
  build({
    ...sharedBuildOptions,
    entryPoints: [fromRoot('src/browser/contentScript.ts')],
    format: 'iife',
    globalName: 'TabPetsContentScript',
    outfile: fromOutput('browser/contentScript.js'),
  }),
  build({
    ...sharedBuildOptions,
    entryPoints: [fromRoot('src/home/main.ts')],
    format: 'esm',
    outfile: fromOutput('home/main.js'),
  }),
]);

await Promise.all([
  cp(fromRoot('manifest.json'), fromOutput('manifest.json')),
  cp(fromRoot('src/assets'), fromOutput('assets'), { recursive: true }),
  cp(fromRoot('src/home/index.html'), fromOutput('home/index.html')),
  cp(fromRoot('src/home/styles.css'), fromOutput('home/styles.css')),
]);

const manifest = JSON.parse(await readFile(fromOutput('manifest.json'), 'utf8'));

if (manifest.manifest_version !== 3) {
  throw new Error('The production manifest must use Manifest V3.');
}

const referencedFiles = [
  manifest.background?.service_worker,
  manifest.side_panel?.default_path,
  ...(manifest.content_scripts ?? []).flatMap((entry) => entry.js ?? []),
].filter((value) => typeof value === 'string');

await Promise.all(
  referencedFiles.map(async (relativePath) => {
    const file = await stat(fromOutput(relativePath));
    if (!file.isFile()) {
      throw new Error(`Manifest path is not a file: ${relativePath}`);
    }
  }),
);

const momoAssetRoot = fromOutput('assets/pets/momo');
const momoAnimations = JSON.parse(await readFile(resolve(momoAssetRoot, 'animations.json'), 'utf8'));
const expectedAnimationIds = ['idle', 'walk', 'sit', 'look', 'sleep', 'groom'];
if (JSON.stringify(momoAnimations.animations?.map(({ id }) => id)) !== JSON.stringify(expectedAnimationIds)) {
  throw new Error('The packaged Momo animation set is incomplete.');
}
await Promise.all(momoAnimations.animations.flatMap((animation) => {
  if (animation.frames !== 4 || animation.browser?.length !== 4 || animation.baseline !== 220 ||
      !Number.isFinite(animation.fps) || animation.fps <= 0 || typeof animation.loop !== 'boolean') {
    throw new Error(`Invalid Momo animation contract: ${animation.id}`);
  }
  return animation.browser.map(async (relativePath, index) => {
    if (relativePath !== `browser/${animation.id}-${String(index).padStart(2, '0')}.webp`) {
      throw new Error(`Unexpected Momo frame path: ${relativePath}`);
    }
    const file = await stat(resolve(momoAssetRoot, relativePath));
    if (!file.isFile()) throw new Error(`Missing Momo frame: ${relativePath}`);
  });
}));
