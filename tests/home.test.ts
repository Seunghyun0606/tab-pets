import { describe, expect, it, vi } from 'vitest';

import {
  mountHomeApp,
  type HomeView,
  type StorageChangeSource,
} from '../src/home/app';
import { createDefaultPetState, type PetState } from '../src/pet/model/pet';
import type { PetStore } from '../src/pet/state/petStore';
import { PET_STATE_STORAGE_KEY } from '../src/storage/repository';

type Listener = Parameters<StorageChangeSource['addListener']>[0];

class MemoryChangeSource implements StorageChangeSource {
  readonly listeners = new Set<Listener>();

  addListener(listener: Listener): void {
    this.listeners.add(listener);
  }

  emit(areaName = 'local'): void {
    for (const listener of this.listeners) {
      listener({ [PET_STATE_STORAGE_KEY]: { newValue: {} } }, areaName);
    }
  }

  removeListener(listener: Listener): void {
    this.listeners.delete(listener);
  }
}

const createView = (): HomeView & {
  errors: number;
  loading: number;
  states: PetState[];
} => ({
  errors: 0,
  loading: 0,
  showError() {
    this.errors += 1;
  },
  showLoading() {
    this.loading += 1;
  },
  showState(state) {
    this.states.push(structuredClone(state));
  },
  states: [],
});

const createStore = (load: PetStore['load']): PetStore => ({
  load,
  save: async (state) => state,
  update: async (updater) => updater(createDefaultPetState(1_000)),
});

const flushPromises = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('Side Panel home app', () => {
  it('shows loading and hydrates the shared persistent Momo state', async () => {
    const state = createDefaultPetState(1_000);
    state.presence.mode = 'HOME';
    const view = createView();
    const changes = new MemoryChangeSource();
    const app = mountHomeApp({
      storageChanges: changes,
      store: createStore(async () => structuredClone(state)),
      view,
    });

    expect(view.loading).toBe(1);
    await app.ready;

    expect(view.states).toEqual([state]);
    expect(view.errors).toBe(0);
    expect(changes.listeners.size).toBe(1);
  });

  it('reloads from the repository after local state changes and unsubscribes', async () => {
    const first = createDefaultPetState(1_000);
    const second = createDefaultPetState(2_000);
    second.relationship.xp = 42;
    second.presence.mode = 'HOME';
    const states = [first, second];
    const load = vi.fn(async () => structuredClone(states.shift() ?? second));
    const view = createView();
    const changes = new MemoryChangeSource();
    const app = mountHomeApp({
      storageChanges: changes,
      store: createStore(load),
      view,
    });
    await app.ready;

    changes.emit('sync');
    await flushPromises();
    expect(load).toHaveBeenCalledTimes(1);

    changes.emit();
    await flushPromises();
    expect(load).toHaveBeenCalledTimes(2);
    expect(view.states.at(-1)).toEqual(second);

    app.destroy();
    expect(changes.listeners.size).toBe(0);
    changes.emit();
    await flushPromises();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('renders an error without replacing a newer successful refresh', async () => {
    let rejectInitial: ((reason?: unknown) => void) | undefined;
    const initial = new Promise<PetState>((_resolve, reject) => {
      rejectInitial = reject;
    });
    const current = createDefaultPetState(2_000);
    current.presence.mode = 'SLEEPING';
    const load = vi
      .fn<PetStore['load']>()
      .mockImplementationOnce(() => initial)
      .mockResolvedValueOnce(current);
    const view = createView();
    const changes = new MemoryChangeSource();
    const onError = vi.fn();
    const app = mountHomeApp({
      onError,
      storageChanges: changes,
      store: createStore(load),
      view,
    });

    changes.emit();
    await flushPromises();
    rejectInitial?.(new Error('stale load failed'));
    await app.ready;

    expect(view.states).toEqual([current]);
    expect(view.errors).toBe(0);
    expect(onError).not.toHaveBeenCalled();
  });

  it('shows an error when initial hydration fails', async () => {
    const view = createView();
    const onError = vi.fn();
    const error = new Error('storage unavailable');
    const app = mountHomeApp({
      onError,
      storageChanges: new MemoryChangeSource(),
      store: createStore(async () => Promise.reject(error)),
      view,
    });

    await app.ready;

    expect(view.errors).toBe(1);
    expect(view.states).toEqual([]);
    expect(onError).toHaveBeenCalledWith(error);
  });
});
