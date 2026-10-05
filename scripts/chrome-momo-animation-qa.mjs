import { spawn, spawnSync } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const exportDir = path.join(root, 'art', 'exports', 'm1-momo');
const previewUrl = pathToFileURL(path.join(exportDir, 'preview.html')).href;
const profilePath = await mkdtemp(path.join(tmpdir(), 'tab-pets-momo-qa-'));
const manifest = JSON.parse(await readFile(path.join(exportDir, 'manifest.json'), 'utf8'));

const candidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].filter(Boolean);
let chromePath;
for (const candidate of candidates) {
  try {
    await access(candidate);
    chromePath = candidate;
    break;
  } catch {
    // Try the next Chrome installation.
  }
}
if (!chromePath) throw new Error('System Chrome is required for Momo animation QA.');

const chrome = spawn(chromePath, [
  '--headless=new',
  '--no-first-run',
  '--no-default-browser-check',
  '--remote-debugging-port=0',
  `--user-data-dir=${profilePath}`,
  '--window-size=860,1200',
  previewUrl,
], { stdio: 'ignore', windowsHide: true });

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
const waitFor = async (operation, label) => {
  let lastError;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const value = await operation();
      if (value !== undefined && value !== false) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}.`, { cause: lastError });
};

const cleanupProfile = async () => {
  const resolvedTemp = path.resolve(tmpdir());
  const resolvedProfile = path.resolve(profilePath);
  if (path.dirname(resolvedProfile) !== resolvedTemp || !path.basename(resolvedProfile).startsWith('tab-pets-momo-qa-')) {
    throw new Error(`Refusing to remove unexpected QA profile: ${resolvedProfile}`);
  }
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      await rm(resolvedProfile, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(error.code) || attempt === 11) throw error;
      await delay(250);
    }
  }
};

const createClient = async (url) => {
  const socket = new WebSocket(url);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', rejectOpen, { once: true });
  });
  const pending = new Map();
  const errors = [];
  let nextId = 0;
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') {
      errors.push(message.params.exceptionDetails?.exception?.description ?? message.params.exceptionDetails?.text);
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      errors.push(message.params.args.map((argument) => argument.value ?? argument.description).join(' '));
    }
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timeout);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolveRequest, rejectRequest) => {
    const id = ++nextId;
    const timeout = setTimeout(() => {
      pending.delete(id);
      rejectRequest(new Error(`Chrome DevTools ${method} timed out.`));
    }, 10_000);
    pending.set(id, { resolve: resolveRequest, reject: rejectRequest, timeout });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  return { socket, send, evaluate, errors };
};

let client;
try {
  const port = await waitFor(async () => {
    const contents = await readFile(path.join(profilePath, 'DevToolsActivePort'), 'utf8');
    const candidate = Number(contents.split(/\r?\n/u)[0]);
    return Number.isInteger(candidate) ? candidate : undefined;
  }, 'Chrome DevTools port');
  const target = await waitFor(async () => {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    return targets.find((entry) => entry.type === 'page' && entry.url === previewUrl);
  }, 'Momo preview tab');
  client = await createClient(target.webSocketDebuggerUrl);
  const first = await waitFor(async () => {
    const status = await client.evaluate('window.momoPreviewStatus?.()');
    return status?.rows?.length === manifest.animations.length &&
      status.rows.every((row) => row.loaded) ? status : undefined;
  }, '24 sprite images');
  if (first.errors.length || client.errors.length) throw new Error(`Preview errors: ${JSON.stringify([...first.errors, ...client.errors])}`);
  const screenshot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await writeFile(path.join(exportDir, 'chrome-preview.png'), Buffer.from(screenshot.data, 'base64'));

  await delay(350);
  const second = await client.evaluate('window.momoPreviewStatus()');
  if (second.errors.length || client.errors.length) throw new Error(`Playback errors: ${JSON.stringify([...second.errors, ...client.errors])}`);
  for (const [index, animation] of manifest.animations.entries()) {
    const before = first.rows[index];
    const after = second.rows[index];
    if (before.id !== animation.id || before.fps !== animation.fps || before.loop !== animation.loop ||
        after.id !== animation.id || !after.loaded || after.ticks <= before.ticks) {
      throw new Error(`${animation.id}: frames did not advance and load in Chrome`);
    }
  }
  const playingScreenshot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await writeFile(path.join(exportDir, 'chrome-preview-playing.png'), Buffer.from(playingScreenshot.data, 'base64'));

  await delay(1700);
  const fullCycle = await client.evaluate('window.momoPreviewStatus()');
  if (fullCycle.errors.length || client.errors.length) throw new Error(`Full-cycle errors: ${JSON.stringify([...fullCycle.errors, ...client.errors])}`);
  for (const [index, animation] of manifest.animations.entries()) {
    const before = first.rows[index];
    const after = fullCycle.rows[index];
    if (after.id !== animation.id || !after.loaded || after.ticks - before.ticks < 4) {
      throw new Error(`${animation.id}: a full four-frame cycle did not complete in Chrome`);
    }
  }
  const version = await client.send('Browser.getVersion');
  const report = {
    browser: version.product,
    initial: first.rows,
    after350ms: second.rows,
    afterFullCycle: fullCycle.rows,
    errors: client.errors,
    screenshots: ['art/exports/m1-momo/chrome-preview.png', 'art/exports/m1-momo/chrome-preview-playing.png'],
    scope: 'Isolated asset preview; the extension runtime remains unchanged.',
  };
  await writeFile(path.join(exportDir, 'chrome-qa.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  client?.socket.close();
  if (chrome.pid) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      chrome.kill('SIGTERM');
    }
  }
  await cleanupProfile();
}
