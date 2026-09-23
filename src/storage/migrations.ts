import type { PetState } from '../pet/model/pet';
import { InvalidPetStateError, parsePetStateV1 } from './schema';

type Migration = (value: unknown) => PetState;

export class UnsupportedPetStateVersionError extends Error {
  constructor(readonly schemaVersion: number) {
    super(`Unsupported PetState schema version: ${schemaVersion}.`);
    this.name = 'UnsupportedPetStateVersionError';
  }
}

export const migrationRegistry: ReadonlyMap<number, Migration> = new Map([
  [1, parsePetStateV1],
]);

export const migratePetState = (value: unknown): PetState => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new InvalidPetStateError('PetState must be an object.');
  }

  const schemaVersion = (value as Record<string, unknown>).schemaVersion;
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion)) {
    throw new InvalidPetStateError(
      'PetState schemaVersion must be an integer.',
    );
  }

  const migration = migrationRegistry.get(schemaVersion);
  if (!migration) {
    throw new UnsupportedPetStateVersionError(schemaVersion);
  }

  return migration(value);
};
