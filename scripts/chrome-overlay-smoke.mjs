import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const extensionPath = resolve(projectRoot, 'dist');
const profilePath = await mkdtemp(resolve(tmpdir(), 'tab-pets-overlay-'));

const fixture = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      html, body { margin: 0; min-height: 2200px; }
      * { box-sizing: content-box !important; color: rgb(170, 0, 0) !important; }
      tab-pets-root {
        display: none !important;
        height: 1px !important;
        pointer-events: auto !important;
        position: static !important;
        transform: translateX(500px) !important;
        visibility: hidden !important;
        width: 1px !important;
      }
      #underlay {
        bottom: 12px;
        height: 40px;
        left: 12px;
        position: fixed;
        width: 120px;
      }
      #selectable {
        background: white;
        bottom: 92px;
        color: black !important;
        left: 12px;
        position: fixed;
        user-select: text;
        width: 320px;
      }
      #momo-hit-target { width: 31px; }
    </style>
  </head>
  <body>
    <section id="tab-pets-root" data-host-owner="page">
      Page content with an extension-like id must survive.
    </section>
    <button id="underlay" type="button">Page button</button>
    <p id="selectable">This page text must remain selectable beneath the overlay.</p>
    <div id="momo-hit-target">Host probe</div>
    <script>
      window.fixtureClicks = 0;
      document.querySelector('#underlay').addEventListener('click', () => {
        window.fixtureClicks += 1;
      });
    </script>
  </body>
</html>`;

const server = createServer((request, response) => {
  if (request.url === '/favicon.ico') {
    response.writeHead(204).end();
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(fixture);
});

await new Promise((resolveListen, rejectListen) => {
  server.once('error', rejectListen);
  server.listen(0, '127.0.0.1', resolveListen);
});
const address = server.address();
if (!address || typeof address === 'string') {
  throw new Error('Fixture server did not expose a TCP port.');
}
const fixtureUrl = `http://127.0.0.1:${address.port}/fixture`;

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
    '--ignore-certificate-errors',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    `--user-data-dir=${profilePath}`,
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    '--window-size=900,700',
    fixtureUrl,
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

const createClient = async (socketUrl) => {
  const socket = new WebSocket(socketUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', rejectOpen, { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  const contexts = new Map();
  const diagnostics = [];
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.executionContextCreated') {
      contexts.set(message.params.context.id, message.params.context);
      return;
    }
    if (message.method === 'Runtime.executionContextDestroyed') {
      contexts.delete(message.params.executionContextId);
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') {
      diagnostics.push(message.params.exceptionDetails?.text ?? 'Runtime exception');
      return;
    }
    if (message.method === 'Runtime.consoleAPICalled') {
      diagnostics.push(
        message.params.args
          .map((argument) => argument.value ?? argument.description)
          .join(' '),
      );
      return;
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

  await send('Runtime.enable');
  await send('Page.enable');
  return { contexts, diagnostics, send, socket };
};

const valueFrom = (result) => result.result.value;

let client;
let extensionReloadClient;
try {
  const port = await waitFor(async () => {
    const contents = await readFile(
      resolve(profilePath, 'DevToolsActivePort'),
      'utf8',
    );
    const candidate = Number(contents.split(/\r?\n/u)[0]);
    return Number.isInteger(candidate) ? candidate : undefined;
  }, 'Chrome DevTools port');

  const target = await waitFor(async () => {
    const targets = await (
      await fetch(`http://127.0.0.1:${port}/json/list`)
    ).json();
    return targets.find(
      (candidate) =>
        candidate.type === 'page' && candidate.url.startsWith(fixtureUrl),
    );
  }, 'fixture page target');

  client = await createClient(target.webSocketDebuggerUrl);
  const extensionId = await waitFor(getExtensionId, 'extension id');
  const evaluate = async (expression, contextId) => {
    const result = await client.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      ...(contextId === undefined ? {} : { contextId }),
    });
    if (result.exceptionDetails) {
      throw new Error(JSON.stringify(result.exceptionDetails));
    }
    return valueFrom(result);
  };

  const waitForOverlay = (description = 'Momo overlay') =>
    waitFor(
      () =>
        evaluate(`(() => {
          const host = document.querySelector(
            'tab-pets-root[data-tab-pets-runtime]',
          );
          const image = host?.shadowRoot?.querySelector('#momo-sprite');
          return Boolean(host && image?.complete && image.naturalWidth > 0);
        })()`),
      description,
    );

  await client.send('Page.reload', { ignoreCache: true });
  try {
    await waitForOverlay();
  } catch (error) {
    const state = await evaluate(`({
      href: location.href,
      readyState: document.readyState,
      rootCount: document.querySelectorAll(
        'tab-pets-root[data-tab-pets-runtime]'
      ).length
    })`);
    const isolatedWorlds = [];
    for (const context of client.contexts.values()) {
      if (context.auxData?.isDefault) continue;
      try {
        isolatedWorlds.push({
          context,
          probe: await evaluate(`({
            runtimeId: typeof chrome !== 'undefined' && chrome.runtime?.id,
            storageAvailable: typeof chrome !== 'undefined' && Boolean(chrome.storage?.local),
            rootCount: document.querySelectorAll(
              'tab-pets-root[data-tab-pets-runtime]'
            ).length
          })`, context.id),
        });
      } catch (probeError) {
        isolatedWorlds.push({ context, probeError: String(probeError) });
      }
    }
    throw new Error(
      `Initial overlay failed: ${JSON.stringify({
        contexts: [...client.contexts.values()],
        diagnostics: client.diagnostics,
        isolatedWorlds,
        state,
      })}`,
      { cause: error },
    );
  }

  const isolation = await evaluate(`(() => {
    const host = document.querySelector(
      'tab-pets-root[data-tab-pets-runtime]'
    );
    const target = host.shadowRoot.querySelector('#momo-hit-target');
    const hostProbe = document.querySelector('body > #momo-hit-target');
    const hostStyle = getComputedStyle(host);
    const targetStyle = getComputedStyle(target);
    const rect = target.getBoundingClientRect();
    return {
      count: document.querySelectorAll(
        'tab-pets-root[data-tab-pets-runtime]'
      ).length,
      hostDisplay: hostStyle.display,
      hostIdAvoidedCollision: host.id !== 'tab-pets-root',
      hostPointerEvents: hostStyle.pointerEvents,
      hostPosition: hostStyle.position,
      hostVisibility: hostStyle.visibility,
      probeWidth: getComputedStyle(hostProbe).width,
      pageHostPreserved: document.querySelector(
        '#tab-pets-root[data-host-owner="page"]'
      )?.textContent.includes('must survive') === true,
      targetPointerEvents: targetStyle.pointerEvents,
      targetWidth: rect.width,
    };
  })()`);
  if (
    isolation.count !== 1 ||
    isolation.hostDisplay !== 'block' ||
    !isolation.hostIdAvoidedCollision ||
    isolation.hostPointerEvents !== 'none' ||
    isolation.hostPosition !== 'fixed' ||
    isolation.hostVisibility !== 'visible' ||
    isolation.probeWidth !== '31px' ||
    !isolation.pageHostPreserved ||
    isolation.targetPointerEvents !== 'auto' ||
    isolation.targetWidth !== 96
  ) {
    throw new Error(`Shadow DOM isolation failed: ${JSON.stringify(isolation)}`);
  }

  const viewport = await evaluate('({ width: innerWidth, height: innerHeight })');
  await client.send('Input.dispatchMouseEvent', {
    button: 'left',
    buttons: 1,
    clickCount: 1,
    type: 'mousePressed',
    x: 30,
    y: viewport.height - 30,
  });
  await client.send('Input.dispatchMouseEvent', {
    button: 'left',
    buttons: 0,
    clickCount: 1,
    type: 'mouseReleased',
    x: 30,
    y: viewport.height - 30,
  });
  if ((await evaluate('window.fixtureClicks')) !== 1) {
    throw new Error('Overlay blocked a click outside the pet hit target.');
  }

  await client.send('Input.dispatchMouseEvent', {
    deltaX: 0,
    deltaY: 500,
    type: 'mouseWheel',
    x: 350,
    y: viewport.height - 60,
  });
  await waitFor(() => evaluate('scrollY > 0'), 'page scroll through overlay');

  await evaluate('scrollTo(0, 0); getSelection().removeAllRanges()');
  const selectionY = viewport.height - 102;
  await client.send('Input.dispatchMouseEvent', {
    button: 'left',
    buttons: 1,
    clickCount: 1,
    type: 'mousePressed',
    x: 20,
    y: selectionY,
  });
  await client.send('Input.dispatchMouseEvent', {
    button: 'left',
    buttons: 1,
    type: 'mouseMoved',
    x: 280,
    y: selectionY,
  });
  await client.send('Input.dispatchMouseEvent', {
    button: 'left',
    buttons: 0,
    clickCount: 1,
    type: 'mouseReleased',
    x: 280,
    y: selectionY,
  });
  if ((await evaluate('getSelection().toString().trim().length')) === 0) {
    throw new Error('Overlay blocked text selection outside the pet hit target.');
  }

  // Ordinary MV3 worker suspension must not look like an extension reload and
  // tear down Browser World after Chrome's 30-second idle window.
  await delay(32_000);
  await waitForOverlay('Momo overlay after service worker idle timeout');

  const extensionContextId = await waitFor(async () => {
    for (const context of client.contexts.values()) {
      if (context.auxData?.isDefault) continue;
      try {
        const runtimeId = await evaluate(
          'typeof chrome !== "undefined" && chrome.runtime?.id',
          context.id,
        );
        if (runtimeId === extensionId) return context.id;
      } catch {
        // Contexts can disappear during navigation.
      }
    }
    return undefined;
  }, 'content script execution context');

  const bundle = await readFile(
    resolve(extensionPath, 'browser', 'contentScript.js'),
    'utf8',
  );
  await evaluate(bundle, extensionContextId);
  await delay(100);
  if ((await evaluate(`document.querySelectorAll(
    'tab-pets-root[data-tab-pets-runtime]'
  ).length`)) !== 1) {
    throw new Error('Duplicate Content Script execution created another pet root.');
  }

  await client.send('Emulation.setDeviceMetricsOverride', {
    deviceScaleFactor: 1,
    height: 64,
    mobile: false,
    width: 180,
  });
  const boundsAreValid = await waitFor(() =>
    evaluate(`(() => {
      const target = document.querySelector(
        'tab-pets-root[data-tab-pets-runtime]'
      )
        .shadowRoot.querySelector('#momo-hit-target');
      const rect = target.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 &&
        rect.bottom <= innerHeight;
    })()`),
  'pet bounds after resize');
  if (!boundsAreValid) throw new Error('Pet escaped the resized viewport.');
  await client.send('Emulation.clearDeviceMetricsOverride');

  await evaluate("dispatchEvent(new PageTransitionEvent('pagehide'))");
  await waitFor(
    () => evaluate(
      "!document.querySelector('tab-pets-root[data-tab-pets-runtime]')",
    ),
    'pagehide overlay teardown',
  );
  await client.send('Page.reload', { ignoreCache: true });
  await waitForOverlay('Momo overlay after fixture reload');

  const smokeSites = [
    'https://example.com/',
    'https://www.wikipedia.org/',
    'https://www.iana.org/help/example-domains',
  ];
  for (const site of smokeSites) {
    await client.send('Page.navigate', { url: site });
    await waitFor(
      () => evaluate(`location.href.startsWith(${JSON.stringify(site)})`),
      `${site} navigation`,
      250,
    );
    await waitForOverlay(`Momo overlay on ${site}`);
  }

  await evaluate(`document.querySelector(
      'tab-pets-root[data-tab-pets-runtime]'
    )
    .setAttribute('data-smoke-generation', 'before-extension-reload')`);
  const extensionPageUrl = `chrome-extension://${extensionId}/home/index.html`;
  const extensionReloadTarget = await (
    await fetch(
      `http://127.0.0.1:${port}/json/new?${encodeURIComponent(extensionPageUrl)}`,
      { method: 'PUT' },
    )
  ).json();
  extensionReloadClient = await createClient(
    extensionReloadTarget.webSocketDebuggerUrl,
  );
  void extensionReloadClient
    .send('Runtime.evaluate', {
      expression: 'chrome.runtime.reload(); true',
      returnByValue: true,
    })
    .catch(() => undefined);
  await waitFor(
    () =>
      evaluate(
        "!document.querySelector('[data-smoke-generation=\"before-extension-reload\"]')",
      ),
    'extension reload overlay teardown',
  );

  console.log(
    'Chrome overlay smoke passed (host-id collision preservation, isolation, pass-through, worker idle, duplicate injection, resize, page and extension teardown, 3 sites).',
  );
} finally {
  extensionReloadClient?.socket.close();
  client?.socket.close();
  stopChrome();
  await new Promise((resolveClose) => server.close(resolveClose));
  await rm(profilePath, { force: true, recursive: true, maxRetries: 5 });
}
