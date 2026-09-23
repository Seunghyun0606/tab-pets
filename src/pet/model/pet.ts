export const PET_STATE_SCHEMA_VERSION = 1 as const;

export type Species = 'CAT';
export type Personality = 'CURIOUS' | 'LAZY' | 'ENERGETIC';
export type CareTempo = 'HIGH' | 'MEDIUM' | 'LOW';
export type PresenceMode =
  | 'ROAMING'
  | 'HOME'
  | 'SLEEPING'
  | 'PAUSED'
  | 'GOING_HOME'
  | 'GOING_OUT';
export type RelationshipStage =
  | 'NEW_FRIEND'
  | 'FAMILIAR'
  | 'CLOSE'
  | 'BEST_FRIEND';
export type BehaviorId =
  | 'IDLE'
  | 'LOOK'
  | 'WALK'
  | 'SIT'
  | 'SLEEP'
  | 'GROOM'
  | 'LOOK_USER'
  | 'PET_REACTION'
  | 'PLAY'
  | 'HAPPY'
  | 'GO_HOME'
  | 'COME_OUT'
  | 'WINDOW_WATCH'
  | 'YAWN';
export type Direction = 'LEFT' | 'RIGHT';

export interface PetState {
  schemaVersion: typeof PET_STATE_SCHEMA_VERSION;
  identity: {
    id: string;
    name: string;
    species: Species;
    personality: Personality;
    careTempo: CareTempo;
  };
  presence: {
    mode: PresenceMode;
  };
  needs: {
    satiety: number;
    energy: number;
    fun: number;
  };
  relationship: {
    xp: number;
    stage: RelationshipStage;
  };
  behavior: {
    current: BehaviorId;
    startedAt: number;
    recent: BehaviorId[];
  };
  position: {
    normalizedX: number;
    direction: Direction;
  };
  timestamps: {
    lastStateUpdateAt: number;
    lastInteractionAt: number;
    lastFeedAt?: number;
    lastPlayAt?: number;
  };
}

export const createDefaultPetState = (now: number): PetState => ({
  schemaVersion: PET_STATE_SCHEMA_VERSION,
  identity: {
    id: 'momo',
    name: 'Momo',
    species: 'CAT',
    personality: 'CURIOUS',
    careTempo: 'MEDIUM',
  },
  presence: { mode: 'ROAMING' },
  needs: {
    satiety: 80,
    energy: 80,
    fun: 80,
  },
  relationship: {
    xp: 0,
    stage: 'NEW_FRIEND',
  },
  behavior: {
    current: 'IDLE',
    startedAt: now,
    recent: [],
  },
  position: {
    normalizedX: 0.5,
    direction: 'RIGHT',
  },
  timestamps: {
    lastStateUpdateAt: now,
    lastInteractionAt: now,
  },
});
