import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exportDir = path.join(root, 'art', 'exports', 'm1-momo');
const masterDir = path.join(root, 'art', 'masters', 'm1-momo', 'browser');

type Animation = {
  id: string;
  fps: number;
  loop: boolean;
  frames: number;
  files: string[];
};

describe('M1 Momo candidate assets', () => {
  it('exports six complete animations with transparent 256px frames and a shared baseline', async () => {
    const manifest = JSON.parse(await readFile(path.join(exportDir, 'manifest.json'), 'utf8')) as {
      status: string;
      baseline: number;
      animations: Animation[];
    };

    expect(manifest.status).toBe('candidate-not-wired');
    expect(manifest.baseline).toBe(220);
    expect(manifest.animations.map(({ id }) => id)).toEqual([
      'idle', 'walk', 'sit', 'look', 'sleep', 'groom',
    ]);

    for (const animation of manifest.animations) {
      expect(animation.frames).toBe(4);
      expect(animation.files).toHaveLength(4);
      expect(animation.fps).toBeGreaterThan(0);
      const rawFrames: Buffer[] = [];

      for (const [index, file] of animation.files.entries()) {
        const framePath = path.join(exportDir, file);
        const metadata = await sharp(framePath).metadata();
        expect(metadata.format).toBe('webp');
        expect([metadata.width, metadata.height, metadata.hasAlpha]).toEqual([256, 256, true]);

        const masterPath = path.join(masterDir, `${animation.id}-${String(index).padStart(2, '0')}.png`);
        const master = await sharp(masterPath).metadata();
        expect([master.format, master.width, master.height, master.hasAlpha]).toEqual(['png', 512, 512, true]);

        const { data, info } = await sharp(framePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        let minX = 256;
        let maxX = -1;
        let maxY = -1;
        for (let y = 0; y < info.height; y += 1) {
          for (let x = 0; x < info.width; x += 1) {
            if ((data[(y * info.width + x) * 4 + 3] ?? 0) < 128) continue;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
        expect(minX).toBeGreaterThanOrEqual(8);
        expect(maxX).toBeLessThanOrEqual(247);
        expect(maxY).toBeGreaterThanOrEqual(218);
        expect(maxY).toBeLessThanOrEqual(221);
        rawFrames.push(data);
      }
      expect(new Set(rawFrames.map((frame) => frame.toString('base64'))).size).toBe(4);
    }
  });
});
