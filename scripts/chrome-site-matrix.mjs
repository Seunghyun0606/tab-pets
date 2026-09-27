import { spawn, spawnSync } from 'node:child_process';
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const extensionPath = resolve(projectRoot, 'dist');
const profilePath = await mkdtemp(resolve(tmpdir(), 'tab-pets-site-matrix-'));
const sites = [
  ['Google Search', 'https://www.google.com/'],
  ['GitHub', 'https://github.com/'],
  ['YouTube', 'https://www.youtube.com/'],
  ['Reddit', 'https://www.reddit.com/'],
  ['Notion public help', 'https://www.notion.so/help'],
  ['Wikipedia', 'https://en.wikipedia.org/wiki/Cat'],
  ['MDN', 'https://developer.mozilla.org/en-US/docs/Web/API/ShadowRoot'],
  ['BBC News', 'https://www.bbc.com/news'],
  ['IANA', 'https://www.iana.org/domains/reserved'],
  ['W3C', 'https://www.w3.org/TR/css-scoping-1/'],
].filter(([name]) => !process.env.QA_SITE || name === process.env.QA_SITE);

const delay = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
const challengeUrl = (url) => /\/sorry\/|[?&]js_challenge=/u.test(url);

const waitFor = async (operation, description, attempts = 200) => {
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
      // Continue with a system Chrome installation.
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

const createClient = async (target, extensionId, extensionErrors, pageErrors) => {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', rejectOpen, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  const contexts = new Map();
  const recordError = (contextId, message) => {
    const context = contexts.get(contextId);
    const isExtension =
      target.type === 'service_worker' ||
      target.url.startsWith(`chrome-extension://${extensionId}/`) ||
      context?.origin === `chrome-extension://${extensionId}`;
    (isExtension ? extensionErrors : pageErrors).push(message);
  };
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.executionContextCreated') {
      contexts.set(message.params.context.id, message.params.context);
    }
    if (message.method === 'Runtime.executionContextDestroyed') {
      contexts.delete(message.params.executionContextId);
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails;
      recordError(details.executionContextId, details.exception?.description ?? details.text);
    }
    if (message.method === 'Runtime.consoleAPICalled' &&
        (message.params.type === 'error' || message.params.type === 'assert')) {
      recordError(
        message.params.executionContextId,
        message.params.args.map((argument) =>
          argument.value ?? argument.description).join(' '),
      );
    }
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timeout);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  socket.addEventListener('close', () => {
    for (const request of pending.values()) {
      clearTimeout(request.timeout);
      request.reject(new Error('Chrome DevTools connection closed.'));
    }
    pending.clear();
  });
  const send = (method, params = {}) =>
    new Promise((resolveRequest, rejectRequest) => {
      const id = ++nextId;
      const timeout = setTimeout(() => {
        pending.delete(id);
        rejectRequest(new Error(`Chrome DevTools ${method} timed out.`));
      }, 10000);
      pending.set(id, { reject: rejectRequest, resolve: resolveRequest, timeout });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(JSON.stringify(result.exceptionDetails));
    }
    return result.result.value;
  };
  await send('Runtime.enable');
  return { evaluate, send, socket };
};

const chrome = spawn(await findChrome(), [
  '--headless=new',
  '--disable-gpu',
  '--ignore-certificate-errors',
  '--no-first-run',
  '--no-default-browser-check',
  '--remote-debugging-port=0',
  `--user-data-dir=${profilePath}`,
  `--disable-extensions-except=${extensionPath}`,
  `--load-extension=${extensionPath}`,
  '--window-size=1000,800',
  'about:blank',
], { stdio: 'ignore', windowsHide: true });

const clients = [];
const extensionErrors = [];
const pageErrors = [];
const results = [];
try {
  const port = await waitFor(async () => {
    const contents = await readFile(resolve(profilePath, 'DevToolsActivePort'), 'utf8');
    const candidate = Number(contents.split(/\r?\n/u)[0]);
    return Number.isInteger(candidate) ? candidate : undefined;
  }, 'Chrome DevTools port');
  const listTargets = async () =>
    (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json());
  const extensionId = await waitFor(async () => {
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
        // Chrome may be replacing a preference file.
      }
    }
    return undefined;
  }, 'extension id');
  const pageTarget = await waitFor(async () =>
    (await listTargets()).find((target) =>
      target.type === 'page' && target.url === 'about:blank'),
  'page target');
  const page = await createClient(pageTarget, extensionId, extensionErrors, pageErrors);
  clients.push(page);
  await page.send('Page.enable');
  const workerTarget = await waitFor(async () =>
    (await listTargets()).find((target) =>
      target.type === 'service_worker' &&
      target.url === `chrome-extension://${extensionId}/background/serviceWorker.js`),
  'extension worker');
  clients.push(await createClient(workerTarget, extensionId, extensionErrors, pageErrors));

  const homeUrl = `chrome-extension://${extensionId}/home/index.html`;
  const homeTarget = await (await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(homeUrl)}`,
    { method: 'PUT' },
  )).json();
  const home = await createClient(homeTarget, extensionId, extensionErrors, pageErrors);
  clients.push(home);
  const normalizedX = 0.37;
  await home.evaluate(`chrome.storage.local.get('petState').then(({ petState }) =>
    chrome.storage.local.set({ petState: {
      ...petState,
      position: { ...petState.position, normalizedX: ${normalizedX} }
    } }))`);
  await fetch(`http://127.0.0.1:${port}/json/activate/${pageTarget.id}`);

  const overlayState = () => page.evaluate(`(() => {
    const hosts = document.querySelectorAll('tab-pets-root[data-tab-pets-runtime]');
    const host = hosts[0];
    const target = host?.shadowRoot?.querySelector('#momo-hit-target');
    const image = target?.querySelector('img');
    const rect = target?.getBoundingClientRect();
    const hostStyle = host && getComputedStyle(host);
    const targetStyle = target && getComputedStyle(target);
    const topElement = rect && document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    return {
      count: hosts.length,
      visible: Boolean(rect && rect.width > 0 && rect.left >= 0 &&
        rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight &&
        image?.complete && image.naturalWidth > 0 &&
        hostStyle?.visibility === 'visible' &&
        targetStyle?.visibility === 'visible' &&
        Number(hostStyle?.opacity) > 0 && Number(targetStyle?.opacity) > 0 &&
        topElement === host),
      isolated: hostStyle?.display === 'block' &&
        hostStyle?.position === 'fixed' && hostStyle?.pointerEvents === 'none' &&
        targetStyle?.pointerEvents === 'auto',
      x: rect?.left,
      viewportWidth: innerWidth,
      title: document.title,
      href: location.href,
      bodyLength: document.body?.innerText?.length ?? 0,
    };
  })()`);

  const dispatchClick = async (x, y) => {
    await page.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1,
    });
    await page.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1,
    });
  };

  for (const [name, url] of sites) {
    console.log(JSON.stringify({ starting: name, url }));
    const errorStart = extensionErrors.length;
    const pageErrorStart = pageErrors.length;
    let stage = 'navigate';
    try {
    let navigation;
    try {
      navigation = await page.send('Page.navigate', { url });
    } catch (error) {
      if (!String(error).includes('Page.navigate timed out')) throw error;
      // Some public sites defer the navigation response after rendering begins.
    }
    if (navigation?.errorText) {
      results.push({ name, url, status: 'navigation_error', error: navigation.errorText });
      console.log(JSON.stringify(results.at(-1)));
      continue;
    }
    let overlay;
    try {
      overlay = await waitFor(async () => {
        const state = await overlayState();
        return state.count === 1 && state.visible && state.bodyLength > 0
          ? state : undefined;
      }, `${name} visible overlay`, 250);
    } catch (error) {
      const lastState = await overlayState().catch(() => undefined);
      if (lastState && challengeUrl(lastState.href)) {
        const finalUrl = new URL(lastState.href);
        lastState.href = finalUrl.origin + finalUrl.pathname;
      }
      results.push({
        name, url, status: lastState && challengeUrl(lastState.href)
          ? 'site_challenge' : 'overlay_error',
        error: String(error),
        lastState,
      });
      console.log(JSON.stringify(results.at(-1)));
      continue;
    }
    if (challengeUrl(overlay.href)) {
      const finalUrl = new URL(overlay.href);
      results.push({
        name, url, finalUrl: finalUrl.origin + finalUrl.pathname,
        status: 'site_challenge',
        overlay: { ...overlay, href: finalUrl.origin + finalUrl.pathname },
      });
      console.log(JSON.stringify(results.at(-1)));
      continue;
    }
    const expectedDestination = new URL(url);
    const actualDestination = new URL(overlay.href);
    const destinationMatch = actualDestination.pathname === expectedDestination.pathname &&
      (actualDestination.hostname === expectedDestination.hostname ||
        (name === 'Notion public help' && actualDestination.hostname === 'www.notion.com'));
    const expectedLeft = 12 + (overlay.viewportWidth - 96 - 24) * normalizedX;
    const positionRestored = Math.abs(overlay.x - expectedLeft) < 2;

    await page.evaluate(`(() => {
      document.querySelector('#tab-pets-qa-probe')?.remove();
      const probe = document.createElement('div');
      probe.id = 'tab-pets-qa-probe';
      probe.style.cssText = 'all:initial!important;position:fixed!important;left:10px!important;top:120px!important;z-index:2147483647!important;background:white!important;padding:8px!important;pointer-events:auto!important;';
      const button = document.createElement('button');
      button.textContent = 'Page interaction probe';
      button.style.cssText = 'all:initial!important;display:block!important;cursor:pointer!important;pointer-events:auto!important;';
      button.addEventListener('click', () => { window.__tabPetsQaClicks = (window.__tabPetsQaClicks ?? 0) + 1; });
      const text = document.createElement('span');
      text.textContent = 'Select this host page text to verify pointer passthrough';
      text.style.cssText = 'all:initial!important;display:block!important;margin-top:28px!important;user-select:text!important;';
      probe.append(button, text);
      document.body.append(probe);
      window.__tabPetsQaWheels = 0;
      document.addEventListener('wheel', () => {
        window.__tabPetsQaWheels += 1;
      }, { once: true, capture: true });
    })()`);
    const probeRect = await page.evaluate(`(() => {
      const button = document.querySelector('#tab-pets-qa-probe button');
      const text = document.querySelector('#tab-pets-qa-probe span');
      const a = button.getBoundingClientRect();
      const b = text.getBoundingClientRect();
      return {
        button: { x: a.x + 15, y: a.y + 10 },
        text: { x: b.x + 5, y: b.y + 10 },
        buttonOnTop: document.elementFromPoint(a.x + 15, a.y + 10) === button,
      };
    })()`);
    if (!probeRect.buttonOnTop) {
      throw new Error('Host page probe button is occluded.');
    }
    stage = 'click';
    await dispatchClick(probeRect.button.x, probeRect.button.y);
    stage = 'post_click';
    const postClick = await page.evaluate(`({ clicks: window.__tabPetsQaClicks ?? 0, href: location.href })`);
    if (postClick.clicks !== 1 || postClick.href !== overlay.href) {
      throw new Error(`Host click changed the page or missed the probe: ${JSON.stringify(postClick)}`);
    }
    stage = 'scroll_before';
    const scrollBefore = await page.evaluate('document.scrollingElement.scrollTop');
    stage = 'scroll_wheel';
    await page.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel', x: 400, y: 220, deltaX: 0, deltaY: 350,
    });
    await delay(500);
    stage = 'selection';
    await page.evaluate('getSelection().removeAllRanges()');
    await page.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: probeRect.text.x, y: probeRect.text.y,
      button: 'left', buttons: 1, clickCount: 2,
    });
    await page.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: probeRect.text.x, y: probeRect.text.y,
      button: 'left', buttons: 0, clickCount: 2,
    });
    const interaction = await page.evaluate(`({
      clicks: window.__tabPetsQaClicks ?? 0,
      wheels: window.__tabPetsQaWheels ?? 0,
      scrollDelta: document.scrollingElement.scrollTop - ${scrollBefore},
      scrollRange: document.scrollingElement.scrollHeight - innerHeight,
      scrollMethod: 'devtools_mouse_wheel',
      selectionLength: getSelection().toString().length,
    })`);
    if (interaction.scrollRange > 0 && interaction.scrollDelta === 0) {
      interaction.scrollCandidates = await page.evaluate(`[...document.querySelectorAll('*')]
        .filter((element) => element.scrollHeight > element.clientHeight + 100 &&
          element.clientHeight > 100)
        .slice(0, 8)
        .map((element) => ({
          tag: element.tagName,
          id: element.id,
          overflowY: getComputedStyle(element).overflowY,
          scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight,
          scrollTop: element.scrollTop,
        }))`);
    }
    await page.evaluate("document.querySelector('#tab-pets-qa-probe')?.remove()");

    stage = 'resize';
    await page.send('Emulation.setDeviceMetricsOverride', {
      deviceScaleFactor: 1, height: 240, mobile: false, width: 320,
    });
    await delay(100);
    const resizedBeforeEvent = await overlayState();
    await page.evaluate("dispatchEvent(new Event('resize'))");
    const resized = await waitFor(async () => {
      const value = await overlayState();
      return value.visible ? value : undefined;
    }, `${name} resized bounds`, 50).catch(async () => ({
      ...(await overlayState()), visible: false,
    }));
    await page.send('Emulation.clearDeviceMetricsOverride');
    await page.evaluate("document.querySelector('#tab-pets-qa-probe')?.remove()");

    const siteErrors = extensionErrors.slice(errorStart);
    results.push({
      name,
      url,
      finalUrl: overlay.href,
      title: overlay.title,
      status: overlay.visible && overlay.isolated && positionRestored &&
        destinationMatch &&
        interaction.clicks === 1 && interaction.wheels > 0 &&
        (interaction.scrollRange === 0 || interaction.scrollDelta > 0) &&
        interaction.selectionLength > 0 && resized.visible &&
        siteErrors.length === 0 ? 'pass' : 'fail',
      overlay: {
        count: overlay.count,
        visible: overlay.visible,
        isolated: overlay.isolated,
        positionRestored,
        destinationMatch,
        resizedVisible: resized.visible,
        resizedBeforeEventVisible: resizedBeforeEvent.visible,
        resized,
      },
      interaction,
      extensionErrors: siteErrors,
      pageConsoleErrors: pageErrors.slice(pageErrorStart).length,
    });
    console.log(JSON.stringify(results.at(-1)));
    } catch (error) {
      results.push({ name, url, status: 'probe_error', stage, error: String(error) });
      console.log(JSON.stringify(results.at(-1)));
    }
  }

  const secondUrl = 'https://www.iana.org/domains/reserved';
  const secondTarget = await (await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(secondUrl)}`,
    { method: 'PUT' },
  )).json();
  const second = await createClient(secondTarget, extensionId, extensionErrors, pageErrors);
  clients.push(second);
  await second.send('Page.enable');
  await fetch(`http://127.0.0.1:${port}/json/activate/${secondTarget.id}`);
  const tabChanged = await waitFor(async () => second.evaluate(`(() => {
    const host = document.querySelector('tab-pets-root[data-tab-pets-runtime]');
    const target = host?.shadowRoot?.querySelector('#momo-hit-target');
    const rect = target?.getBoundingClientRect();
    const expected = 12 + (innerWidth - 96 - 24) * ${normalizedX};
    return Boolean(rect && Math.abs(rect.left - expected) < 2 &&
      target.querySelector('img')?.naturalWidth > 0);
  })()`), 'state after tab change', 200);
  console.log(JSON.stringify({ tabChange: tabChanged ? 'pass' : 'fail' }));
  console.log(JSON.stringify({ summary: {
    passedSites: results.filter((item) => item.status === 'pass').length,
    totalSites: sites.length,
    extensionErrors,
    pageConsoleErrorCount: pageErrors.length,
  } }));
  if (results.some((item) => item.status !== 'pass') || !tabChanged || extensionErrors.length) {
    process.exitCode = 1;
  }
} finally {
  for (const client of clients) client.socket.close();
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], {
      stdio: 'ignore', windowsHide: true,
    });
  } else {
    chrome.kill('SIGTERM');
  }
  await rm(profilePath, { force: true, recursive: true, maxRetries: 5 });
}
