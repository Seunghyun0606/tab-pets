import type { BehaviorId, PetState } from '../model/pet';

export const AUTONOMOUS_BEHAVIORS = ['IDLE', 'LOOK', 'WALK', 'SIT', 'SLEEP', 'GROOM'] as const;
export type AutonomousBehaviorId = (typeof AUTONOMOUS_BEHAVIORS)[number];
export type RandomSource = () => number;

interface BehaviorConfig {
  baseWeight: number;
  curiousModifier: number;
  durationMs: readonly [minimum: number, maximum: number];
}

// Initial CURIOUS tuning. Values not fixed by the product baseline are kept here for later QA tuning.
export const CURIOUS_BEHAVIOR_CONFIG = {
  IDLE: { baseWeight: 1, curiousModifier: 1, durationMs: [3_000, 12_000] },
  LOOK: { baseWeight: 1, curiousModifier: 1.7, durationMs: [3_000, 7_000] },
  WALK: { baseWeight: 1, curiousModifier: 1.4, durationMs: [4_000, 8_000] },
  SIT: { baseWeight: 1, curiousModifier: 1, durationMs: [8_000, 30_000] },
  SLEEP: { baseWeight: 1, curiousModifier: 0.8, durationMs: [30_000, 120_000] },
  GROOM: { baseWeight: 1, curiousModifier: 1, durationMs: [5_000, 9_000] },
} as const satisfies Record<AutonomousBehaviorId, BehaviorConfig>;

export interface BehaviorCandidate {
  id: AutonomousBehaviorId;
  weight: number;
  durationMs: readonly [minimum: number, maximum: number];
}

export interface BehaviorDecision {
  id: AutonomousBehaviorId;
  startedAt: number;
  durationMs: number;
  endsAt: number;
  /** Newest first, including this decision; persist with behavior.current when integrated. */
  recent: BehaviorId[];
}

const recentHistory = (state: Readonly<PetState>): BehaviorId[] => {
  const recent = state.behavior.recent.slice(0, 3);
  return recent[0] === state.behavior.current
    ? recent
    : [state.behavior.current, ...recent].slice(0, 3);
};

export const getBehaviorCandidates = (state: Readonly<PetState>): BehaviorCandidate[] => {
  if (state.presence.mode !== 'ROAMING' || state.identity.personality !== 'CURIOUS') return [];

  const recent = recentHistory(state);
  return AUTONOMOUS_BEHAVIORS.flatMap((id) => {
    // Excluding the last two prevents a third consecutive selection on the normal path.
    if (recent[0] === id && recent[1] === id) return [];
    const config = CURIOUS_BEHAVIOR_CONFIG[id];
    const count = recent.filter((item) => item === id).length;
    const recentModifier = count === 0 ? 1 : count === 1 ? 0.5 : 0.2;
    return [{
      id,
      weight: config.baseWeight * config.curiousModifier * recentModifier,
      durationMs: config.durationMs,
    }];
  });
};

const safeRandom = (random: RandomSource): number | null => {
  try {
    const value = random();
    return Number.isFinite(value) && value >= 0 && value < 1 ? value : null;
  } catch {
    return null;
  }
};

/** Returns null without mutating state when selection is ineligible or its inputs are unsafe. */
export const chooseBehavior = (
  state: Readonly<PetState>,
  now: number,
  random: RandomSource,
): BehaviorDecision | null => {
  if (!Number.isSafeInteger(now) || now < 0) return null;
  const candidates = getBehaviorCandidates(state);
  if (candidates.length === 0) return null;

  const choice = safeRandom(random);
  if (choice === null) return null;
  const durationChoice = safeRandom(random);
  if (durationChoice === null) return null;

  const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  const target = choice * totalWeight;
  let cumulative = 0;
  const selected = candidates.find((candidate) => {
    cumulative += candidate.weight;
    return target < cumulative;
  }) ?? candidates[candidates.length - 1];
  if (!selected) return null;

  const [minimum, maximum] = selected.durationMs;
  const durationMs = minimum + Math.floor(durationChoice * (maximum - minimum + 1));
  const endsAt = now + durationMs;
  if (!Number.isSafeInteger(endsAt)) return null;
  return {
    id: selected.id,
    startedAt: now,
    durationMs,
    endsAt,
    recent: [selected.id, ...recentHistory(state)].slice(0, 3),
  };
};
