import type { PetState } from '../pet/model/pet';
import { migratePetState } from '../storage/migrations';
import { PET_STATE_STORAGE_KEY } from '../storage/repository';
import { PET_MESSAGE_TYPES, type PetMessage } from './messages';

export interface PetMessageRuntime {
  sendMessage(message: PetMessage): Promise<unknown>;
}

export interface PetStorageChanges {
  addListener(
    listener: (changes: Record<string, { newValue?: unknown }>, area: string) => void,
  ): void;
  removeListener(
    listener: (changes: Record<string, { newValue?: unknown }>, area: string) => void,
  ): void;
}

export const requestPetState = async (
  runtime: PetMessageRuntime = chrome.runtime,
): Promise<PetState> => {
  const response = await runtime.sendMessage({ type: PET_MESSAGE_TYPES.STATE_REQUEST });
  if (typeof response !== 'object' || response === null || !('type' in response)) {
    throw new Error('Tab Pets received no state response.');
  }
  const message = response as Record<string, unknown>;
  if (message.type === PET_MESSAGE_TYPES.STATE_ERROR) {
    throw new Error(
      typeof message.message === 'string'
        ? message.message
        : 'Tab Pets could not load PetState.',
    );
  }
  if (message.type !== PET_MESSAGE_TYPES.STATE_UPDATED) {
    throw new Error('Tab Pets received an unexpected state response.');
  }
  return migratePetState(message.state);
};

export const observePetStateUpdates = (
  listener: (state: PetState) => void,
  storageChanges: PetStorageChanges = chrome.storage.onChanged,
): (() => void) => {
  const onChanged = (
    changes: Record<string, { newValue?: unknown }>,
    area: string,
  ): void => {
    if (area !== 'local' || !(PET_STATE_STORAGE_KEY in changes)) return;
    const value = changes[PET_STATE_STORAGE_KEY]?.newValue;
    if (value === undefined) return;
    let state: PetState;
    try {
      state = migratePetState(value);
    } catch {
      // The repository validates and repairs malformed storage on the next request.
      return;
    }
    listener(state);
  };
  storageChanges.addListener(onChanged);
  return () => storageChanges.removeListener(onChanged);
};
