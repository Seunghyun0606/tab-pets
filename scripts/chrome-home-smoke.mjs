import { spawn, spawnSync } from 'node:child_process';
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const extensionPath = resolve(projectRoot, 'dist');
const profilePath = await mkdtemp(resolve(tmpdir(), 'tab-pets-home-'));

const findChrome = async () => {
  const candidates = [];
  if (process.env.CHROME_PATH) candidates.push(process.env.CHROME_PATH);
  if (process.env.LOCALAPPDATA) {
    const playwrightRoot = resolve(process.env.LOCALAPPDATA, 'ms-playwright');
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

const delay = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

const waitFor = async (operation, description, attempts = 150) => {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await operation();
      if (result !== undefined && result !== false) return result;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${description}.`, { cause: lastError });
};

const chrome = spawn(
  await findChrome(),
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    `--user-data-dir=${profilePath}`,
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    '--window-size=1000,800',
    'about:blank',
  ],
  { stdio: 'ignore', windowsHide: true },
);

const stopChrome = () => {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  } else {
    chrome.kill('SIGTERM');
  }
};

const getExtensionId = async () => {
  for (const name of ['Preferences', 'Secure Preferences']) {
    try {
      const preferences = JSON.parse(
        await readFile(resolve(profilePath, 'Default', name), 'utf8'),
      );
      const match = Object.entries(preferences.extensions?.settings ?? {}).find(
        ([, extension]) =>
          extension.path === extensionPath ||
          extension.manifest?.name === 'Tab Pets',
      );
      if (match) return match[0];
    } catch {
      // Chrome may be atomically replacing a preference file.
    }
  }
  return undefined;
};

const createTarget = async (port, url) => {
  const response = await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`,
    { method: 'PUT' },
  );
  if (!response.ok) {
    throw new Error(`Could not create Chrome target: ${response.status}.`);
  }
  return response.json();
};

const closeTarget = async (port, targetId) => {
  const response = await fetch(
    `http://127.0.0.1:${port}/json/close/${targetId}`,
  );
  if (!response.ok) {
    throw new Error(`Could not close Chrome target: ${response.status}.`);
  }
};

const createClient = async (socketUrl) => {
  const socket = new WebSocket(socketUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', rejectOpen, { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });

  const send = (method, params = {}) =>
    new Promise((resolveRequest, rejectRequest) => {
      const id = ++nextId;
      pending.set(id, { reject: rejectRequest, resolve: resolveRequest });
      socket.send(JSON.stringify({ id, method, params }));
    });

  const evaluate = async (expression, userGesture = false) => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture,
    });
    if (result.exceptionDetails) {
      throw new Error(JSON.stringify(result.exceptionDetails));
    }
    return result.result.value;
  };

  await send('Runtime.enable');
  return { evaluate, socket };
};

let panelClient;
let reopenedClient;
let writerClient;
try {
  const port = await waitFor(async () => {
    const contents = await readFile(
      resolve(profilePath, 'DevToolsActivePort'),
      'utf8',
    );
    const candidate = Number(contents.split(/\r?\n/u)[0]);
    return Number.isInteger(candidate) ? candidate : undefined;
  }, 'Chrome DevTools port');
  const extensionId = await waitFor(getExtensionId, 'extension id');
  const homeUrl = `chrome-extension://${extensionId}/home/index.html`;

  const panelTarget = await createTarget(port, homeUrl);
  panelClient = await createClient(panelTarget.webSocketDebuggerUrl);
  const configuration = await waitFor(async () => {
    const value = await panelClient.evaluate(`Promise.all([
      chrome.sidePanel.getOptions({}),
      chrome.sidePanel.getPanelBehavior()
    ]).then(([options, behavior]) => ({ options, behavior }))`);
    return value.options?.path === 'home/index.html' &&
      value.behavior?.openPanelOnActionClick === true
      ? value
      : undefined;
  }, 'Side Panel action configuration');

  const initial = await waitFor(async () => {
    const value = await panelClient.evaluate(`(() => ({
      busy: document.querySelector('main')?.getAttribute('aria-busy'),
      heading: document.querySelector('h1')?.textContent,
      message: document.querySelector('.message')?.textContent,
      presence: [...document.querySelectorAll('dd')].at(-1)?.textContent
    }))()`);
    return value.heading === "Momo's home" && value.presence === 'ROAMING'
      ? value
      : undefined;
  }, 'initial Home hydration');

  const writerTarget = await createTarget(port, homeUrl);
  writerClient = await createClient(writerTarget.webSocketDebuggerUrl);
  await writerClient.evaluate(`chrome.storage.local.get('petState').then(({ petState }) =>
    chrome.storage.local.set({
      petState: {
        ...petState,
        presence: { mode: 'HOME' },
        relationship: { ...petState.relationship, xp: 73 }
      }
    }))`);

  const updated = await waitFor(async () => {
    const value = await panelClient.evaluate(`({
      message: document.querySelector('.message')?.textContent,
      presence: [...document.querySelectorAll('dd')].at(-1)?.textContent
    })`);
    return value.presence === 'HOME' ? value : undefined;
  }, 'live Home state update');

  panelClient.socket.close();
  panelClient = undefined;
  await closeTarget(port, panelTarget.id);

  const reopenedTarget = await createTarget(port, homeUrl);
  reopenedClient = await createClient(reopenedTarget.webSocketDebuggerUrl);
  const reopened = await waitFor(async () => {
    const value = await reopenedClient.evaluate(`Promise.all([
      chrome.storage.local.get('petState'),
      Promise.resolve({
        heading: document.querySelector('h1')?.textContent,
        presence: [...document.querySelectorAll('dd')].at(-1)?.textContent
      })
    ]).then(([stored, view]) => ({ stored: stored.petState, view }))`);
    return value.stored?.relationship?.xp === 73 &&
      value.view?.presence === 'HOME'
      ? value
      : undefined;
  }, 'reopened Home hydration');

  console.log(
    `Chrome Home smoke passed (path=${configuration.options.path}, action=${configuration.behavior.openPanelOnActionClick}, initial=${initial.presence}, updated=${updated.presence}, reopened=${reopened.view.presence}).`,
  );
} finally {
  panelClient?.socket.close();
  reopenedClient?.socket.close();
  writerClient?.socket.close();
  stopChrome();
  await rm(profilePath, { force: true, recursive: true, maxRetries: 5 });
}
