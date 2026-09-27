import { observePetStateUpdates, requestPetState } from '../messaging/bus';
import type { PetState } from '../pet/model/pet';
import {
  isRuntimeContextValid,
  RUNTIME_CONTEXT_CHECK_INTERVAL_MS,
} from './lifecycle';
import { mountPetLayer, type PetLayer } from './petLayer';

const startBrowserWorld = async (): Promise<void> => {
  const runtimeId = chrome.runtime.id;
  if (runtimeId.length === 0) {
    throw new Error('Tab Pets content script started without an extension runtime.');
  }

  let active = true;
  let layer: PetLayer | undefined;
  let stateUpdateCount = 0;
  const renderState = (state: PetState): void => {
    if (!active) return;
    if (state.presence.mode !== 'ROAMING' && state.presence.mode !== 'GOING_OUT') {
      layer?.destroy();
      layer = undefined;
      return;
    }
    if (layer?.host.isConnected) {
      layer.setNormalizedX(state.position.normalizedX);
      return;
    }
    layer = mountPetLayer({
      assetUrl: chrome.runtime.getURL(
        'assets/pets/momo/browser/idle-placeholder.webp',
      ),
      normalizedX: state.position.normalizedX,
      runtimeId,
    });
  };
  const unsubscribe = observePetStateUpdates((state) => {
    stateUpdateCount += 1;
    renderState(state);
  });
  const teardown = (): void => {
    if (!active) return;
    active = false;
    window.removeEventListener('pagehide', teardown);
    window.clearInterval(runtimeContextCheck);
    unsubscribe();
    layer?.destroy();
  };

  const runtimeContextCheck = window.setInterval(() => {
    if (!isRuntimeContextValid(runtimeId)) teardown();
  }, RUNTIME_CONTEXT_CHECK_INTERVAL_MS);
  window.addEventListener('pagehide', teardown, { once: true });

  const initialUpdateCount = stateUpdateCount;
  const state = await requestPetState();
  if (stateUpdateCount === initialUpdateCount) renderState(state);
};

void startBrowserWorld().catch((error: unknown) => {
  console.error('Tab Pets could not start Browser World.', error);
});
