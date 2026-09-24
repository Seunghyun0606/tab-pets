import { createPetStore } from '../pet/state/petStore';
import {
  isRuntimeContextValid,
  RUNTIME_CONTEXT_CHECK_INTERVAL_MS,
} from './lifecycle';
import { mountPetLayer } from './petLayer';

const startBrowserWorld = async (): Promise<void> => {
  const runtimeId = chrome.runtime.id;
  if (runtimeId.length === 0) {
    throw new Error('Tab Pets content script started without an extension runtime.');
  }

  const state = await createPetStore().load();
  if (state.presence.mode !== 'ROAMING' && state.presence.mode !== 'GOING_OUT') {
    return;
  }

  const layer = mountPetLayer({
    assetUrl: chrome.runtime.getURL(
      'assets/pets/momo/browser/idle-placeholder.webp',
    ),
    normalizedX: state.position.normalizedX,
    runtimeId,
  });
  if (!layer.created) return;

  let active = true;
  const teardown = (): void => {
    if (!active) return;
    active = false;
    window.removeEventListener('pagehide', teardown);
    window.clearInterval(runtimeContextCheck);
    layer.destroy();
  };

  const runtimeContextCheck = window.setInterval(() => {
    if (!isRuntimeContextValid(runtimeId)) teardown();
  }, RUNTIME_CONTEXT_CHECK_INTERVAL_MS);
  window.addEventListener('pagehide', teardown, { once: true });
};

void startBrowserWorld().catch((error: unknown) => {
  console.error('Tab Pets could not start Browser World.', error);
});
