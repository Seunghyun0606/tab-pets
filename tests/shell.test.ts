import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

interface ExtensionManifest {
  action?: { default_title?: string };
  background?: { service_worker?: string; type?: string };
  content_scripts?: Array<{ js?: string[]; matches?: string[] }>;
  manifest_version?: number;
  permissions?: string[];
  side_panel?: { default_path?: string };
  web_accessible_resources?: Array<{
    matches?: string[];
    resources?: string[];
  }>;
}

const readManifest = async (): Promise<ExtensionManifest> => {
  const path = resolve(import.meta.dirname, '..', 'manifest.json');
  return JSON.parse(await readFile(path, 'utf8')) as ExtensionManifest;
};

describe('extension shell manifest', () => {
  it('declares the three MV3 runtime entry points', async () => {
    const manifest = await readManifest();

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background).toEqual({
      service_worker: 'background/serviceWorker.js',
      type: 'module',
    });
    expect(manifest.side_panel?.default_path).toBe('home/index.html');
    expect(manifest.content_scripts?.[0]?.js).toEqual([
      'browser/contentScript.js',
    ]);
  });

  it('keeps API permissions limited to the side panel and pet persistence', async () => {
    const manifest = await readManifest();

    expect(manifest.permissions).toEqual(['sidePanel', 'storage']);
    expect(manifest.action?.default_title).toBe('Open Tab Pets home');
  });

  it('exposes only the browser sprite asset to matched web pages', async () => {
    const manifest = await readManifest();

    expect(manifest.web_accessible_resources).toEqual([
      {
        resources: ['assets/pets/momo/browser/*.webp'],
        matches: ['http://*/*', 'https://*/*'],
      },
    ]);
  });

  it('provides a repeatable Side Panel hydration smoke command', async () => {
    const packageJson = JSON.parse(
      await readFile(resolve(import.meta.dirname, '..', 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.['smoke:home']).toBe(
      'node scripts/chrome-home-smoke.mjs',
    );
  });
});
