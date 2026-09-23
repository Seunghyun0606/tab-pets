import type { PetState } from '../model/pet';
import {
  PetStateRepository,
  type PetStateUpdater,
  type PetStorageArea,
} from '../../storage/repository';

export interface PetStore {
  load(): Promise<PetState>;
  save(state: PetState): Promise<PetState>;
  update(updater: PetStateUpdater): Promise<PetState>;
}

export const createPetStore = (
  storage: PetStorageArea = chrome.storage.local,
  now: () => number = Date.now,
): PetStore => new PetStateRepository(storage, now);
