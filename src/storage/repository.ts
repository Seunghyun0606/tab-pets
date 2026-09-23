import { createDefaultPetState, type PetState } from '../pet/model/pet';
import { migratePetState } from './migrations';
import { InvalidPetStateError, parsePetStateV1 } from './schema';

export const PET_STATE_STORAGE_KEY = 'petState';

export interface PetStorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export type PetStateUpdater = (
  state: PetState,
) => PetState | Promise<PetState>;

export class PetStateRepository {
  private updateQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly storage: PetStorageArea,
    private readonly now: () => number = Date.now,
    private readonly storageKey = PET_STATE_STORAGE_KEY,
  ) {}

  load(): Promise<PetState> {
    return this.enqueue(() => this.readOrInitialize());
  }

  save(state: PetState): Promise<PetState> {
    return this.enqueue(async () => {
      const normalized = parsePetStateV1(state);
      await this.write(normalized);
      return structuredClone(normalized);
    });
  }

  update(updater: PetStateUpdater): Promise<PetState> {
    return this.enqueue(async () => {
      const current = await this.readOrInitialize();
      const next = await updater(structuredClone(current));
      const normalized = parsePetStateV1(next);
      await this.write(normalized);
      return structuredClone(normalized);
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.updateQueue.then(operation, operation);
    this.updateQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async readOrInitialize(): Promise<PetState> {
    const stored = (await this.storage.get(this.storageKey))[this.storageKey];
    if (stored === undefined) {
      return this.resetToDefault();
    }

    try {
      const normalized = migratePetState(stored);
      if (JSON.stringify(normalized) !== JSON.stringify(stored)) {
        await this.write(normalized);
      }
      return structuredClone(normalized);
    } catch (error) {
      if (error instanceof InvalidPetStateError) {
        return this.resetToDefault();
      }
      throw error;
    }
  }

  private async resetToDefault(): Promise<PetState> {
    const state = createDefaultPetState(this.now());
    await this.write(state);
    return structuredClone(state);
  }

  private async write(state: PetState): Promise<void> {
    await this.storage.set({ [this.storageKey]: state });
  }
}
