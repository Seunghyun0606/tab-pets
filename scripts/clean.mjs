import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');

await Promise.all(
  ['coverage', 'dist'].map((directory) =>
    rm(resolve(projectRoot, directory), { force: true, recursive: true }),
  ),
);

