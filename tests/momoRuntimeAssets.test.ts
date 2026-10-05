import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(root, 'art', 'exports', 'm1-momo');
const runtimeRoot = path.join(root, 'src', 'assets', 'pets', 'momo');

type Animation = {
  id: string;
  frames: number;
  fps: number;
  loop: boolean;
  baseline: number;
  browser: string[];
};

describe('packaged Momo Browser animations', () => {
  it('preserves the approved 24 transparent candidates and playback contract', async () => {
    const source = JSON.parse(await readFile(path.join(sourceRoot, 'manifest.json'), 'utf8')) as {
      baseline: number;
      animations: Array<{ id: string; frames: number; fps: number; loop: boolean; files: string[] }>;
    };
    const runtime = JSON.parse(await readFile(path.join(runtimeRoot, 'animations.json'), 'utf8')) as {
      animations: Animation[];
    };
    expect(runtime.animations).toHaveLength(6);

    for (const [index, animation] of runtime.animations.entries()) {
      const approved = source.animations[index];
      expect(approved).toBeDefined();
      expect(animation).toEqual({
        id: approved?.id,
        frames: approved?.frames,
        fps: approved?.fps,
        loop: approved?.loop,
        baseline: source.baseline,
        browser: approved?.files,
      });
      expect(animation.baseline).toBe(220);

      for (const file of animation.browser) {
        const sourceBytes = await readFile(path.join(sourceRoot, file));
        const runtimePath = path.join(runtimeRoot, file);
        expect(await readFile(runtimePath)).toEqual(sourceBytes);
        const metadata = await sharp(runtimePath).metadata();
        expect([metadata.format, metadata.width, metadata.height, metadata.hasAlpha]).toEqual(['webp', 256, 256, true]);
      }
    }

    const placeholder = JSON.parse(await readFile(path.join(runtimeRoot, 'manifest.json'), 'utf8')) as {
      id: string;
      browser: string;
      placeholder: boolean;
    };
    expect(placeholder).toMatchObject({
      id: 'idle-placeholder',
      browser: 'browser/idle-placeholder.webp',
      placeholder: true,
    });
  });
});
