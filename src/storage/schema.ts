import {
  PET_STATE_SCHEMA_VERSION,
  type BehaviorId,
  type CareTempo,
  type Direction,
  type Personality,
  type PetState,
  type PresenceMode,
  type RelationshipStage,
  type Species,
} from '../pet/model/pet';

const SPECIES = ['CAT'] as const satisfies readonly Species[];
const PERSONALITIES = [
  'CURIOUS',
  'LAZY',
  'ENERGETIC',
] as const satisfies readonly Personality[];
const CARE_TEMPOS = [
  'HIGH',
  'MEDIUM',
  'LOW',
] as const satisfies readonly CareTempo[];
const PRESENCE_MODES = [
  'ROAMING',
  'HOME',
  'SLEEPING',
  'PAUSED',
  'GOING_HOME',
  'GOING_OUT',
] as const satisfies readonly PresenceMode[];
const RELATIONSHIP_STAGES = [
  'NEW_FRIEND',
  'FAMILIAR',
  'CLOSE',
  'BEST_FRIEND',
] as const satisfies readonly RelationshipStage[];
const BEHAVIOR_IDS = [
  'IDLE',
  'LOOK',
  'WALK',
  'SIT',
  'SLEEP',
  'GROOM',
  'LOOK_USER',
  'PET_REACTION',
  'PLAY',
  'HAPPY',
  'GO_HOME',
  'COME_OUT',
  'WINDOW_WATCH',
  'YAWN',
] as const satisfies readonly BehaviorId[];
const DIRECTIONS = ['LEFT', 'RIGHT'] as const satisfies readonly Direction[];

export class InvalidPetStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPetStateError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readRecord = (
  parent: Record<string, unknown>,
  key: string,
): Record<string, unknown> => {
  const value = parent[key];
  if (!isRecord(value)) {
    throw new InvalidPetStateError(`${key} must be an object.`);
  }
  return value;
};

const readString = (parent: Record<string, unknown>, key: string): string => {
  const value = parent[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new InvalidPetStateError(`${key} must be a non-empty string.`);
  }
  return value;
};

const readEnum = <T extends string>(
  parent: Record<string, unknown>,
  key: string,
  values: readonly T[],
): T => {
  const value = parent[key];
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new InvalidPetStateError(
      `${key} must be one of: ${values.join(', ')}.`,
    );
  }
  return value as T;
};

const readNumber = (parent: Record<string, unknown>, key: string): number => {
  const value = parent[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InvalidPetStateError(`${key} must be a finite number.`);
  }
  return value;
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const readOptionalTimestamp = (
  parent: Record<string, unknown>,
  key: string,
): number | undefined => {
  if (parent[key] === undefined) {
    return undefined;
  }
  return Math.max(0, readNumber(parent, key));
};

export const parsePetStateV1 = (value: unknown): PetState => {
  if (!isRecord(value)) {
    throw new InvalidPetStateError('PetState must be an object.');
  }
  if (value.schemaVersion !== PET_STATE_SCHEMA_VERSION) {
    throw new InvalidPetStateError('PetState is not schema version 1.');
  }

  const identity = readRecord(value, 'identity');
  const presence = readRecord(value, 'presence');
  const needs = readRecord(value, 'needs');
  const relationship = readRecord(value, 'relationship');
  const behavior = readRecord(value, 'behavior');
  const position = readRecord(value, 'position');
  const timestamps = readRecord(value, 'timestamps');
  const recent = behavior.recent;

  if (
    !Array.isArray(recent) ||
    !recent.every(
      (item): item is BehaviorId =>
        typeof item === 'string' && BEHAVIOR_IDS.includes(item as BehaviorId),
    )
  ) {
    throw new InvalidPetStateError('recent must contain known behavior ids.');
  }

  const lastFeedAt = readOptionalTimestamp(timestamps, 'lastFeedAt');
  const lastPlayAt = readOptionalTimestamp(timestamps, 'lastPlayAt');

  return {
    schemaVersion: PET_STATE_SCHEMA_VERSION,
    identity: {
      id: readString(identity, 'id'),
      name: readString(identity, 'name'),
      species: readEnum(identity, 'species', SPECIES),
      personality: readEnum(identity, 'personality', PERSONALITIES),
      careTempo: readEnum(identity, 'careTempo', CARE_TEMPOS),
    },
    presence: {
      mode: readEnum(presence, 'mode', PRESENCE_MODES),
    },
    needs: {
      satiety: clamp(readNumber(needs, 'satiety'), 0, 100),
      energy: clamp(readNumber(needs, 'energy'), 0, 100),
      fun: clamp(readNumber(needs, 'fun'), 0, 100),
    },
    relationship: {
      xp: Math.max(0, readNumber(relationship, 'xp')),
      stage: readEnum(relationship, 'stage', RELATIONSHIP_STAGES),
    },
    behavior: {
      current: readEnum(behavior, 'current', BEHAVIOR_IDS),
      startedAt: Math.max(0, readNumber(behavior, 'startedAt')),
      recent: [...recent],
    },
    position: {
      normalizedX: clamp(readNumber(position, 'normalizedX'), 0, 1),
      direction: readEnum(position, 'direction', DIRECTIONS),
    },
    timestamps: {
      lastStateUpdateAt: Math.max(
        0,
        readNumber(timestamps, 'lastStateUpdateAt'),
      ),
      lastInteractionAt: Math.max(
        0,
        readNumber(timestamps, 'lastInteractionAt'),
      ),
      ...(lastFeedAt === undefined ? {} : { lastFeedAt }),
      ...(lastPlayAt === undefined ? {} : { lastPlayAt }),
    },
  };
};
