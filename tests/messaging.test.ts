import { describe, expect, it, vi } from 'vitest';

import { handlePetMessage } from '../src/background/petMessageHandler';
import {
  observePetStateUpdates,
  requestPetState,
  type PetStorageChanges,
} from '../src/messaging/bus';
import { PET_MESSAGE_TYPES } from '../src/messaging/messages';
import { createDefaultPetState } from '../src/pet/model/pet';
import { PET_STATE_STORAGE_KEY } from '../src/storage/repository';

describe('typed PetState messages', () => {
  it('returns the shared state for a request and reports repository failure', async () => {
    const state = createDefaultPetState(1_000);
    const load = vi.fn(async () => state);
    expect(await handlePetMessage({ type: PET_MESSAGE_TYPES.STATE_REQUEST }, load))
      .toEqual({ type: PET_MESSAGE_TYPES.STATE_UPDATED, state });
    expect(load).toHaveBeenCalledOnce();
    expect(await handlePetMessage({ type: PET_MESSAGE_TYPES.CALL_HOME }, load))
      .toBeUndefined();
    expect(load).toHaveBeenCalledOnce();

    const error = await handlePetMessage(
      { type: PET_MESSAGE_TYPES.STATE_REQUEST },
      async () => Promise.reject(new Error('storage unavailable')),
    );
    expect(error).toEqual({
      type: PET_MESSAGE_TYPES.STATE_ERROR,
      message: 'Tab Pets could not load PetState.',
    });
  });

  it('validates a runtime response before exposing PetState', async () => {
    const state = createDefaultPetState(1_000);
    const sendMessage = vi.fn(async () => ({
      type: PET_MESSAGE_TYPES.STATE_UPDATED,
      state,
    }));
    expect(await requestPetState({ sendMessage })).toEqual(state);
    expect(sendMessage).toHaveBeenCalledWith({
      type: PET_MESSAGE_TYPES.STATE_REQUEST,
    });

    await expect(requestPetState({
      sendMessage: async () => ({ type: PET_MESSAGE_TYPES.STATE_ERROR, message: 'failed' }),
    })).rejects.toThrow('failed');
    await expect(requestPetState({
      sendMessage: async () => ({ type: PET_MESSAGE_TYPES.STATE_UPDATED, state: {} }),
    })).rejects.toThrow();
  });

  it('observes only valid local PetState changes and unsubscribes', () => {
    type Listener = Parameters<PetStorageChanges['addListener']>[0];
    let storageListener: Listener | undefined;
    const storageChanges: PetStorageChanges = {
      addListener: (listener) => { storageListener = listener; },
      removeListener: (listener) => {
        if (storageListener === listener) storageListener = undefined;
      },
    };
    const state = createDefaultPetState(1_000);
    const onState = vi.fn();
    const unsubscribe = observePetStateUpdates(onState, storageChanges);
    storageListener?.({ [PET_STATE_STORAGE_KEY]: { newValue: state } }, 'sync');
    storageListener?.({ unrelated: { newValue: state } }, 'local');
    storageListener?.({ [PET_STATE_STORAGE_KEY]: { newValue: {} } }, 'local');
    expect(onState).not.toHaveBeenCalled();
    storageListener?.({ [PET_STATE_STORAGE_KEY]: { newValue: state } }, 'local');
    expect(onState).toHaveBeenCalledOnce();
    expect(onState).toHaveBeenCalledWith(state);
    unsubscribe();
    expect(storageListener).toBeUndefined();
  });
});
