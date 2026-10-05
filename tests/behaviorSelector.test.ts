import { describe, expect, it } from 'vitest';
import {
  AUTONOMOUS_BEHAVIORS,
  CURIOUS_BEHAVIOR_CONFIG,
  chooseBehavior,
  getBehaviorCandidates,
} from '../src/pet/behavior/selector';
import { createDefaultPetState, type PetState } from '../src/pet/model/pet';

const stateWith = (current: PetState['behavior']['current'], recent: PetState['behavior']['recent'] = []): PetState => {
  const state = createDefaultPetState(1_000);
  state.behavior.current = current;
  state.behavior.recent = recent;
  return state;
};

const seededRandom = (seed: number): (() => number) => {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1_664_525) + 1_013_904_223) >>> 0;
    return value / 0x1_0000_0000;
  };
};

describe('Momo autonomous behavior selector', () => {
  it('selects only the six CURIOUS Browser behaviors with configured weights and durations', () => {
    const state = stateWith('LOOK_USER', ['LOOK_USER']);
    const candidates = getBehaviorCandidates(state);
    expect(candidates.map(({ id }) => id)).toEqual(AUTONOMOUS_BEHAVIORS);
    expect(candidates.map(({ id, weight, durationMs }) => ({ id, weight, durationMs }))).toEqual(
      AUTONOMOUS_BEHAVIORS.map((id) => ({
        id,
        weight: CURIOUS_BEHAVIOR_CONFIG[id].baseWeight * CURIOUS_BEHAVIOR_CONFIG[id].curiousModifier,
        durationMs: CURIOUS_BEHAVIOR_CONFIG[id].durationMs,
      })),
    );
  });

  it('applies recent modifiers of 0.50 and 0.20 and excludes a third consecutive choice', () => {
    const once = getBehaviorCandidates(stateWith('LOOK', ['LOOK']));
    expect(once.find(({ id }) => id === 'LOOK')?.weight).toBe(1.7 * 0.5);

    const twiceSeparated = getBehaviorCandidates(stateWith('LOOK', ['LOOK', 'WALK', 'LOOK']));
    expect(twiceSeparated.find(({ id }) => id === 'LOOK')?.weight).toBe(1.7 * 0.2);

    const twiceConsecutive = getBehaviorCandidates(stateWith('LOOK', ['LOOK', 'LOOK', 'WALK']));
    expect(twiceConsecutive.map(({ id }) => id)).not.toContain('LOOK');
  });

  it('returns the same behavior and duration for identical state, time and seed', () => {
    const state = stateWith('IDLE', ['IDLE']);
    const before = structuredClone(state);
    const first = chooseBehavior(state, 42_000, seededRandom(17));
    const second = chooseBehavior(state, 42_000, seededRandom(17));
    expect(first).toEqual(second);
    expect(first).not.toBeNull();
    expect(state).toEqual(before);
    expect(first?.recent).toEqual([first?.id, 'IDLE']);
    expect(first?.recent[0]).toBe(first?.id);
    expect(first?.endsAt).toBe(42_000 + (first?.durationMs ?? 0));
  });

  it('uses cumulative weights and an independent duration draw', () => {
    const state = stateWith('LOOK_USER');
    const draws = [0.5, 0];
    const decision = chooseBehavior(state, 10_000, () => draws.shift() ?? 0);
    expect(decision).toMatchObject({ id: 'WALK', durationMs: 4_000 });
    expect(draws).toEqual([]);
  });

  it('honors the inclusive duration boundaries and the injected time', () => {
    const state = stateWith('LOOK_USER');
    const shortest = chooseBehavior(state, 50_000, () => 0);
    expect(shortest).toMatchObject({ id: 'IDLE', startedAt: 50_000, durationMs: 3_000, endsAt: 53_000 });
    const draws = [0, 0.9999999999999999];
    const longest = chooseBehavior(state, 50_000, () => draws.shift() ?? 0);
    expect(longest).toMatchObject({ id: 'IDLE', durationMs: 12_000, endsAt: 62_000 });
  });

  it('prevents three identical behaviors across successive decisions', () => {
    const firstState = stateWith('IDLE');
    const first = chooseBehavior(firstState, 1_000, () => 0);
    expect(first?.id).toBe('IDLE');
    const secondState = stateWith(first?.id ?? 'IDLE', first?.recent);
    const second = chooseBehavior(secondState, 5_000, () => 0);
    expect(second?.id).not.toBe('IDLE');
  });

  it('does not choose outside ROAMING or for an unsupported personality', () => {
    const state = stateWith('IDLE');
    state.presence.mode = 'HOME';
    expect(getBehaviorCandidates(state)).toEqual([]);
    expect(chooseBehavior(state, 1_000, () => { throw new Error('RNG should not be called'); })).toBeNull();
    state.presence.mode = 'ROAMING';
    state.identity.personality = 'LAZY';
    expect(chooseBehavior(state, 1_000, () => 0)).toBeNull();
  });

  it.each([NaN, Infinity, -0.1, 1])('rejects an invalid random value %s', (value) => {
    expect(chooseBehavior(stateWith('IDLE'), 1_000, () => value)).toBeNull();
  });

  it('rejects a failed second random draw, throwing source or invalid time', () => {
    const state = stateWith('IDLE');
    const draws = [0.5, NaN];
    expect(chooseBehavior(state, 1_000, () => draws.shift() ?? NaN)).toBeNull();
    expect(chooseBehavior(state, 1_000, () => { throw new Error('failed'); })).toBeNull();
    expect(chooseBehavior(state, NaN, () => 0)).toBeNull();
    expect(chooseBehavior(state, -1, () => 0)).toBeNull();
    expect(chooseBehavior(state, Number.MAX_SAFE_INTEGER, () => 0)).toBeNull();
  });
});
