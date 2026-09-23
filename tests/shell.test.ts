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

  it('keeps API permissions limited to the side panel shell', async () => {
    const manifest = await readManifest();

    expect(manifest.permissions).toEqual(['sidePanel']);
    expect(manifest.action?.default_title).toBe('Open Tab Pets home');
  });
});

