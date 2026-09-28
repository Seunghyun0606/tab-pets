import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const extensionPath = resolve(projectRoot, 'dist');
const profilePath = await mkdtemp(resolve(tmpdir(), 'tab-pets-foundation-'));
const fixture = `<!doctype html><html><head><meta charset="utf-8"><title>Tab Pets fixture</title></head>
<body><button id="fixture-button">Page action</button><script>
  window.fixtureClicks = 0;
  document.querySelector('#fixture-button').addEventListener('click', () => {
    window.fixtureClicks += 1;
  });
</script></body></html>`;
const server = createServer((request, response) => {
  if (request.url === '/favicon.ico') {
    response.writeHead(204).end();
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(fixture);
});

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

const findChrome = async () => {
  const candidates = [];
  if (process.env.CHROME_PATH) candidates.push(process.env.CHROME_PATH);
  if (process.env.LOCALAPPDATA) {
    try {
      const installs = (await readdir(resolve(process.env.LOCALAPPDATA, 'ms-playwright')))
        .filter((name) => name.startsWith('chromium-'))
        .sort()
        .reverse();
      for (const install of installs) {
        candidates.push(
          resolve(process.env.LOCALAPPDATA, 'ms-playwright', install, 'chrome-win64', 'chrome.exe'),
          resolve(process.env.LOCALAPPDATA, 'ms-playwright', install, 'chrome-win', 'chrome.exe'),
        );
      }
    } catch {
      // Try a system Chrome installation.
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
      // Try the next location.
    }
  }
  throw new Error('No Chrome or Chromium executable was found.');
};

const launchChrome = (chromePath) =>
  spawn(chromePath, [
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
  ], { stdio: 'ignore', windowsHide: true });

const stopChrome = (child) => {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore', windowsHide: true,
    });
  } else {
    child.kill('SIGTERM');
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
          extension.path === extensionPath || extension.manifest?.name === 'Tab Pets',
      );
      if (match) return match[0];
    } catch {
      // Chrome can replace its preferences while they are read.
    }
  }
  return undefined;
};

const createClient = async (target, label, diagnostics) => {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', rejectOpen, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') {
      diagnostics.push(`${label}: ${message.params.exceptionDetails?.text ?? 'uncaught exception'}`);
    }
    if (message.method === 'Runtime.consoleAPICalled' &&
        (message.params.type === 'error' || message.params.type === 'assert')) {
      const args = message.params.args
        .map((argument) => argument.value ?? argument.description)
        .join(' ');
      diagnostics.push(`${label}: console.${message.params.type}: ${args}`);
    }
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
      diagnostics.push(`${label}: ${message.params.entry.text}`);
    }
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
      throw new Error(`${label}: ${JSON.stringify(result.exceptionDetails)}`);
    }
    return result.result.value;
  };
  await send('Runtime.enable');
  await send('Log.enable');
  return { evaluate, send, socket };
};

let chrome;
const clients = [];
const diagnostics = [];
try {
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Fixture server did not expose a TCP port.');
  }
  const fixtureUrl = `http://127.0.0.1:${address.port}/fixture`;
  const chromePath = await findChrome();
  chrome = launchChrome(chromePath);

  const getDebuggerPort = () => waitFor(async () => {
    const contents = await readFile(resolve(profilePath, 'DevToolsActivePort'), 'utf8');
    const candidate = Number(contents.split(/\r?\n/u)[0]);
    return Number.isInteger(candidate) ? candidate : undefined;
  }, 'Chrome DevTools port');
  let port = await getDebuggerPort();
  const listTargets = async () =>
    (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json());
  const activatePage = async (targetId) => {
    const response = await fetch(`http://127.0.0.1:${port}/json/activate/${targetId}`);
    if (!response.ok) {
      throw new Error(`Could not activate fixture page: HTTP ${response.status}`);
    }
  };
  const extensionId = await waitFor(getExtensionId, 'extension id');
  const pageTarget = await waitFor(async () =>
    (await listTargets()).find((target) =>
      target.type === 'page' && target.url === 'about:blank'),
  'fixture page target');
  let page = await createClient(pageTarget, 'page', diagnostics);
  clients.push(page);
  await page.send('Page.enable');
  const workerTarget = await waitFor(async () =>
    (await listTargets()).find((target) =>
      target.type === 'service_worker' &&
      target.url === `chrome-extension://${extensionId}/background/serviceWorker.js`),
  'extension service worker');
  const worker = await createClient(workerTarget, 'service worker', diagnostics);
  clients.push(worker);
  await page.send('Page.navigate', { url: fixtureUrl });

  const homeUrl = `chrome-extension://${extensionId}/home/index.html`;
  const homeTarget = await (await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(homeUrl)}`,
    { method: 'PUT' },
  )).json();
  const home = await createClient(homeTarget, 'Home', diagnostics);
  clients.push(home);
  await home.evaluate(`chrome.windows.getCurrent().then(({ id }) =>
    chrome.sidePanel.open({ windowId: id }))`, true);

  const readOverlay = () => page.evaluate(`(() => {
    const hosts = document.querySelectorAll('tab-pets-root[data-tab-pets-runtime]');
    const target = hosts[0]?.shadowRoot?.querySelector('#momo-hit-target');
    const image = target?.querySelector('img');
    const rect = target?.getBoundingClientRect();
    return {
      count: hosts.length,
      visible: Boolean(rect && rect.width > 0 && rect.left >= 0 &&
        rect.right <= innerWidth && image?.complete && image.naturalWidth > 0),
      x: rect?.left,
      viewportWidth: innerWidth,
    };
  })()`);
  await waitFor(async () => {
    const overlay = await readOverlay();
    return overlay.count === 1 && overlay.visible ? overlay : undefined;
  }, 'one visible Momo overlay');
  const initial = await waitFor(async () => {
    const value = await home.evaluate(`Promise.all([
      chrome.runtime.sendMessage({ type: 'PET_STATE_REQUEST' }),
      chrome.storage.local.get('petState')
    ]).then(([response, stored]) => ({
      response,
      stored: stored.petState,
      heading: document.querySelector('h1')?.textContent,
      presence: [...document.querySelectorAll('dd')].at(-1)?.textContent
    }))`);
    return value.response?.type === 'PET_STATE_UPDATED' &&
      value.response.state?.identity?.id === 'momo' &&
      value.stored?.identity?.id === 'momo' &&
      value.heading === "Momo's home" && value.presence === 'ROAMING'
      ? value : undefined;
  }, 'shared state request and Home hydration');
  // Keep the fixture page foregrounded while checking live rendering. Opening
  // Home as a tab otherwise leaves Chrome free to throttle the fixture tab.
  await activatePage(pageTarget.id);

  if (process.env.TAB_PETS_E2E_INJECT_DIAGNOSTICS === '1') {
    await page.evaluate("console.error('intentional fixture console error')");
    await home.evaluate("setTimeout(() => { throw new Error('intentional extension error'); }, 0)");
    await delay(100);
  }

  const expectedX = 0.23;
  await home.evaluate(`chrome.storage.local.get('petState').then(({ petState }) =>
    chrome.storage.local.set({ petState: {
      ...petState,
      position: { ...petState.position, normalizedX: ${expectedX} }
    } }))`);
  try {
    await waitFor(async () => {
      const overlay = await readOverlay();
      const expectedLeft = 12 + (overlay.viewportWidth - 96 - 24) * expectedX;
      return Math.abs(overlay.x - expectedLeft) < 1 ? overlay : undefined;
    }, 'live normalized position update');
  } catch (error) {
    const [overlay, stored] = await Promise.allSettled([
      readOverlay(),
      home.evaluate(
        "chrome.storage.local.get('petState').then(({ petState }) => petState?.position?.normalizedX)",
      ),
    ]);
    throw new Error(
      `Live position update failed: stored=${JSON.stringify(stored)}, overlay=${JSON.stringify(overlay)}`,
      { cause: error },
    );
  }

  // Headless Chrome invalidates the old extension context on runtime.reload().
  // Watch for a replacement worker while the runtime reload is in progress.
  let reloadWorkerTargets = 0;
  const monitorReload = (async () => {
    const observed = new Set([workerTarget.id]);
    for (let attempt = 0; attempt < 70; attempt += 1) {
      for (const target of await listTargets()) {
        if (target.type !== 'service_worker' ||
            target.url !== `chrome-extension://${extensionId}/background/serviceWorker.js` ||
            observed.has(target.id)) continue;
        observed.add(target.id);
        clients.push(await createClient(target, 'worker after runtime reload', diagnostics));
        reloadWorkerTargets += 1;
      }
      await delay(100);
    }
  })().catch((error) => {
    diagnostics.push(`runtime reload monitor: ${String(error)}`);
  });
  void home.send('Runtime.evaluate', {
    expression: 'chrome.runtime.reload(); true',
    returnByValue: true,
  }).catch(() => undefined);
  await waitFor(async () => (await readOverlay()).count === 0,
    'overlay teardown after runtime reload');
  await monitorReload;

  // This headless run does not start a replacement worker until the same-profile
  // browser restart. A worker that does appear above is attached and monitored.
  for (const client of clients) client.socket.close();
  clients.length = 0;
  stopChrome(chrome);
  chrome = undefined;
  await rm(resolve(profilePath, 'DevToolsActivePort'), { force: true });
  await delay(250);
  chrome = launchChrome(chromePath);
  port = await getDebuggerPort();
  const restartedPageTarget = await waitFor(async () =>
    (await listTargets()).find((target) =>
      target.type === 'page' && target.url === 'about:blank'),
  'fixture page after extension reload');
  page = await createClient(restartedPageTarget, 'reloaded page', diagnostics);
  clients.push(page);
  await page.send('Page.enable');
  const restartedWorkerTarget = await waitFor(async () =>
    (await listTargets()).find((target) =>
      target.type === 'service_worker' &&
      target.url === `chrome-extension://${extensionId}/background/serviceWorker.js`),
  'service worker after extension reload');
  clients.push(await createClient(restartedWorkerTarget, 'reloaded service worker', diagnostics));
  await page.send('Page.navigate', { url: fixtureUrl });

  const reopenedTarget = await (await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(homeUrl)}`,
    { method: 'PUT' },
  )).json();
  const reopened = await createClient(reopenedTarget, 'reopened Home', diagnostics);
  clients.push(reopened);
  const restored = await waitFor(async () => {
    const value = await reopened.evaluate(`Promise.all([
      chrome.runtime.sendMessage({ type: 'PET_STATE_REQUEST' }),
      chrome.storage.local.get('petState')
    ]).then(([response, stored]) => ({
      response,
      stored: stored.petState,
      heading: document.querySelector('h1')?.textContent
    }))`);
    return value.response?.type === 'PET_STATE_UPDATED' &&
      value.response.state?.identity?.id === initial.response.state.identity.id &&
      value.response.state?.position?.normalizedX === expectedX &&
      value.stored?.position?.normalizedX === expectedX &&
      value.heading === "Momo's home" ? value : undefined;
  }, 'state hydration after extension reload');

  await activatePage(restartedPageTarget.id);
  await page.send('Page.reload', { ignoreCache: true });
  await waitFor(async () => {
    const overlay = await readOverlay();
    const expectedLeft = 12 + (overlay.viewportWidth - 96 - 24) * expectedX;
    return overlay.count === 1 && overlay.visible &&
      Math.abs(overlay.x - expectedLeft) < 1 ? overlay : undefined;
  }, 'restored overlay after page reload');

  if (diagnostics.length > 0) {
    throw new Error(`Unexpected browser diagnostics: ${diagnostics.join(' | ')}`);
  }
  console.log(
    `Runtime foundation E2E passed (extension, one overlay, Home, identity=${restored.stored.identity.id}, normalizedX=${expectedX}, runtime reload, reload workers=${reloadWorkerTargets}, same-profile restart, page reload, no console errors).`,
  );
} finally {
  for (const client of clients) client.socket.close();
  if (chrome) {
    stopChrome(chrome);
  }
  await new Promise((resolveClose) => server.close(resolveClose));
  await rm(profilePath, { force: true, recursive: true, maxRetries: 5 });
}
