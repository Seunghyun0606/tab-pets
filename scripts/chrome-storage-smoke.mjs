import { spawn, spawnSync } from 'node:child_process';
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const extensionPath = resolve(projectRoot, 'dist');
const profilePath = await mkdtemp(resolve(tmpdir(), 'tab-pets-smoke-'));

const findChrome = async () => {
  const candidates = [];
  if (process.env.CHROME_PATH) {
    candidates.push(process.env.CHROME_PATH);
  }

  if (process.env.LOCALAPPDATA) {
    const playwrightRoot = resolve(
      process.env.LOCALAPPDATA,
      'ms-playwright',
    );
    try {
      const installs = (await readdir(playwrightRoot))
        .filter((name) => name.startsWith('chromium-'))
        .sort()
        .reverse();
      for (const install of installs) {
        candidates.push(
          resolve(playwrightRoot, install, 'chrome-win64', 'chrome.exe'),
          resolve(playwrightRoot, install, 'chrome-win', 'chrome.exe'),
        );
      }
    } catch {
      // Fall through to a system Chrome installation.
    }
  }

  candidates.push(
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
  );

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next known browser location.
    }
  }
  throw new Error('No Chrome or Chromium executable was found.');
};

const chromePath = await findChrome();

const delay = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

const waitFor = async (operation, description) => {
  let lastError;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const result = await operation();
      if (result !== undefined) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${description}.`, { cause: lastError });
};

const launchChrome = () =>
  spawn(
    chromePath,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=0',
      `--user-data-dir=${profilePath}`,
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      'about:blank',
    ],
    { stdio: 'ignore', windowsHide: true },
  );

const stopChrome = (child) => {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }
  child.kill('SIGTERM');
};

const getDebuggerPort = async () =>
  waitFor(async () => {
    const contents = await readFile(
      resolve(profilePath, 'DevToolsActivePort'),
      'utf8',
    );
    const port = Number(contents.split(/\r?\n/u)[0]);
    return Number.isInteger(port) ? port : undefined;
  }, 'Chrome DevTools port');

const getExtensionId = async () => {
  const preferenceFiles = [
    resolve(profilePath, 'Default', 'Preferences'),
    resolve(profilePath, 'Default', 'Secure Preferences'),
  ];

  for (const preferenceFile of preferenceFiles) {
    try {
      const preferences = JSON.parse(await readFile(preferenceFile, 'utf8'));
      const settings = preferences.extensions?.settings ?? {};
      const match = Object.entries(settings).find(
        ([, extension]) =>
          extension.path === extensionPath ||
          extension.manifest?.name === 'Tab Pets',
      );
      if (match) {
        return match[0];
      }
    } catch {
      // Chrome can be in the middle of atomically replacing a preference file.
    }
  }
  return undefined;
};

const createExtensionPageTarget = async (port, extensionId) => {
  const url = `chrome-extension://${extensionId}/home/index.html`;
  const response = await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`,
    { method: 'PUT' },
  );
  return response.ok ? response.json() : undefined;
};

const getExtensionTarget = async (port) =>
  waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets = await response.json();
    const worker = targets.find(
      (target) =>
        target.type === 'service_worker' &&
        target.url.endsWith('/background/serviceWorker.js'),
    );
    if (worker) {
      return worker;
    }

    const extensionId = await getExtensionId();
    return extensionId
      ? createExtensionPageTarget(port, extensionId)
      : undefined;
  }, 'Tab Pets extension runtime');

const evaluate = async (target, expression) => {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', rejectOpen, { once: true });
  });

  const result = await new Promise((resolveResult, rejectResult) => {
    socket.addEventListener(
      'message',
      (event) => {
        const message = JSON.parse(event.data);
        if (message.id !== 1) {
          return;
        }
        if (message.error || message.result?.exceptionDetails) {
          rejectResult(
            new Error(JSON.stringify(message.error ?? message.result.exceptionDetails)),
          );
          return;
        }
        resolveResult(message.result.result.value);
      },
      { once: false },
    );
    socket.send(
      JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression, awaitPromise: true, returnByValue: true },
      }),
    );
  });
  socket.close();
  return result;
};

const readState = async (target) =>
  evaluate(
    target,
    'chrome.storage.local.get("petState").then(({ petState }) => petState)',
  );

let chrome;
try {
  chrome = launchChrome();
  let port = await getDebuggerPort();
  let target = await getExtensionTarget(port);
  const initial = await waitFor(async () => {
    const state = await readState(target);
    return state?.schemaVersion === 1 ? state : undefined;
  }, 'default PetState');

  const markerXp = initial.relationship.xp + 37;
  await evaluate(
    target,
    `chrome.storage.local.get("petState").then(({ petState }) => chrome.storage.local.set({ petState: { ...petState, relationship: { ...petState.relationship, xp: ${markerXp} } } }))`,
  );
  stopChrome(chrome);
  chrome = undefined;
  await rm(resolve(profilePath, 'DevToolsActivePort'), { force: true });
  await delay(250);

  chrome = launchChrome();
  port = await getDebuggerPort();
  target = await getExtensionTarget(port);
  const restored = await waitFor(async () => {
    const state = await readState(target);
    return state?.relationship?.xp === markerXp ? state : undefined;
  }, 'persisted PetState after Chrome reload');

  if (restored.identity?.name !== 'Momo') {
    throw new Error('Restored PetState did not preserve Momo identity.');
  }

  console.log(
    `Chrome storage smoke passed (schemaVersion=${restored.schemaVersion}, xp=${restored.relationship.xp}).`,
  );
} finally {
  if (chrome) {
    stopChrome(chrome);
  }
  await rm(profilePath, { force: true, recursive: true, maxRetries: 5 });
}
