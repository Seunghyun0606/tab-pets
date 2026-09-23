import { describe, expect, it } from 'vitest';

import { createDefaultPetState, type PetState } from '../src/pet/model/pet';
import {
  migratePetState,
  UnsupportedPetStateVersionError,
} from '../src/storage/migrations';
import {
  PET_STATE_STORAGE_KEY,
  PetStateRepository,
  type PetStorageArea,
} from '../src/storage/repository';

class MemoryStorage implements PetStorageArea {
  readonly values: Record<string, unknown>;

  constructor(initial: Record<string, unknown> = {}) {
    this.values = structuredClone(initial);
  }

  async get(key: string): Promise<Record<string, unknown>> {
    return key in this.values
      ? { [key]: structuredClone(this.values[key]) }
      : {};
  }

  async set(items: Record<string, unknown>): Promise<void> {
    Object.assign(this.values, structuredClone(items));
  }
}

describe('PetStateRepository', () => {
  it('creates and persists the default Momo state when storage is empty', async () => {
    const storage = new MemoryStorage();
    const repository = new PetStateRepository(storage, () => 1_000);

    const state = await repository.load();

    expect(state).toEqual(createDefaultPetState(1_000));
    expect(storage.values[PET_STATE_STORAGE_KEY]).toEqual(state);
  });

  it('round-trips every PetState runtime context', async () => {
    const storage = new MemoryStorage();
    const repository = new PetStateRepository(storage);
    const state: PetState = {
      ...createDefaultPetState(1_000),
      identity: {
        id: 'momo',
        name: 'Momo',
        species: 'CAT',
        personality: 'CURIOUS',
        careTempo: 'HIGH',
      },
      presence: { mode: 'HOME' },
      needs: { satiety: 62, energy: 48, fun: 91 },
      relationship: { xp: 125, stage: 'FAMILIAR' },
      behavior: {
        current: 'SIT',
        startedAt: 900,
        recent: ['WALK', 'LOOK'],
      },
      position: { normalizedX: 0.25, direction: 'LEFT' },
      timestamps: {
        lastStateUpdateAt: 1_000,
        lastInteractionAt: 950,
        lastFeedAt: 800,
        lastPlayAt: 700,
      },
    };

    await repository.save(state);

    expect(await repository.load()).toEqual(state);
  });

  it('normalizes bounded numeric values and heals the stored value', async () => {
    const raw = createDefaultPetState(1_000) as PetState;
    raw.needs = { satiety: -10, energy: 150, fun: 42 };
    raw.position.normalizedX = 2;
    const storage = new MemoryStorage({ [PET_STATE_STORAGE_KEY]: raw });
    const repository = new PetStateRepository(storage);

    const state = await repository.load();

    expect(state.needs).toEqual({ satiety: 0, energy: 100, fun: 42 });
    expect(state.position.normalizedX).toBe(1);
    expect(storage.values[PET_STATE_STORAGE_KEY]).toEqual(state);
  });

  it('replaces malformed v1 data with a safe default', async () => {
    const storage = new MemoryStorage({
      [PET_STATE_STORAGE_KEY]: {
        ...createDefaultPetState(1_000),
        needs: { satiety: 'hungry', energy: 50, fun: 50 },
      },
    });
    const repository = new PetStateRepository(storage, () => 2_000);

    expect(await repository.load()).toEqual(createDefaultPetState(2_000));
  });

  it('serializes concurrent updates so none are lost', async () => {
    const repository = new PetStateRepository(
      new MemoryStorage(),
      () => 1_000,
    );

    await Promise.all(
      Array.from({ length: 20 }, () =>
        repository.update(async (state) => {
          await Promise.resolve();
          state.relationship.xp += 1;
          return state;
        }),
      ),
    );

    expect((await repository.load()).relationship.xp).toBe(20);
  });
});

describe('PetState migrations', () => {
  it('dispatches schema version 1 through the migration registry', () => {
    const state = createDefaultPetState(1_000);

    expect(migratePetState(state)).toEqual(state);
  });

  it('does not silently overwrite a future schema version', async () => {
    const storage = new MemoryStorage({
      [PET_STATE_STORAGE_KEY]: { schemaVersion: 2, future: true },
    });
    const repository = new PetStateRepository(storage);

    await expect(repository.load()).rejects.toBeInstanceOf(
      UnsupportedPetStateVersionError,
    );
    expect(storage.values[PET_STATE_STORAGE_KEY]).toEqual({
      schemaVersion: 2,
      future: true,
    });
  });
});
