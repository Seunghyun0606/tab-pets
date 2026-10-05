import { describe, expect, it } from 'vitest';

import {
  calculatePetPlacement,
  PET_BOTTOM_MARGIN,
  PET_EDGE_MARGIN,
  PET_RENDER_SIZE,
} from '../src/browser/petLayer';
import {
  createWalkPlan,
  rebaseWalkForViewport,
  resolveWalkSpeed,
  sampleWalk,
} from '../src/browser/movement';

describe('Browser World placement', () => {
  it('maps normalized position into the viewport activity zone', () => {
    expect(calculatePetPlacement(1_000, 0)).toEqual({
      bottom: PET_BOTTOM_MARGIN,
      normalizedX: 0,
      size: PET_RENDER_SIZE,
      x: PET_EDGE_MARGIN,
    });
    expect(calculatePetPlacement(1_000, 1)).toEqual({
      bottom: PET_BOTTOM_MARGIN,
      normalizedX: 1,
      size: PET_RENDER_SIZE,
      x: 1_000 - PET_RENDER_SIZE - PET_EDGE_MARGIN,
    });
  });

  it('normalizes invalid positions and keeps the full pet inside narrow viewports', () => {
    expect(calculatePetPlacement(180, Number.NaN).normalizedX).toBe(0.5);

    const placement = calculatePetPlacement(72, 2);
    expect(placement).toEqual({
      bottom: PET_BOTTOM_MARGIN,
      normalizedX: 1,
      size: 72,
      x: 0,
    });
    expect(placement.x + placement.size).toBeLessThanOrEqual(72);
  });

  it('shrinks and lowers the pet to remain fully visible in a short viewport', () => {
    expect(calculatePetPlacement(320, 0.5, 64)).toEqual({
      bottom: 0,
      normalizedX: 0.5,
      size: 64,
      x: 128,
    });
  });
});

describe('Browser World WALK motion', () => {
  it('uses a configurable 35–45 px/s CURIOUS speed range', () => {
    expect(resolveWalkSpeed(-1)).toBe(35);
    expect(resolveWalkSpeed(0)).toBe(40);
    expect(resolveWalkSpeed(1)).toBe(45);
    expect(resolveWalkSpeed(Number.NaN)).toBe(40);
    expect(resolveWalkSpeed(2)).toBe(45);
    expect(resolveWalkSpeed(1, { baseSpeedPxPerSecond: 50, variationFraction: 0.1 })).toBeCloseTo(55);
    expect(() => resolveWalkSpeed(0, { baseSpeedPxPerSecond: 0, variationFraction: 0.1 })).toThrow(RangeError);
  });

  it('clamps WALK targets to the Pet World bounds and arrives at the target', () => {
    const plan = createWalkPlan(-1, 2, 1_000, 700);
    expect(plan).toMatchObject({
      startNormalizedX: 0,
      targetNormalizedX: 1,
      startX: PET_EDGE_MARGIN,
      targetX: 1_000 - PET_RENDER_SIZE - PET_EDGE_MARGIN,
      speedPxPerSecond: 40,
      durationMs: 22_000,
    });
    expect(sampleWalk(plan, -1)).toMatchObject({ x: plan.startX, normalizedX: 0, arrived: false });
    expect(sampleWalk(plan, 11_000)).toMatchObject({ x: 452, normalizedX: 0.5, arrived: false });
    expect(sampleWalk(plan, 23_000)).toMatchObject({ x: plan.targetX, normalizedX: 1, arrived: true });
  });

  it('keeps the normalized destination in a viewport narrower than the pet', () => {
    const plan = createWalkPlan(0.1, 0.9, 64, 64);
    expect(plan).toMatchObject({ startX: 0, targetX: 0, durationMs: 0 });
    expect(sampleWalk(plan, 0)).toMatchObject({ x: 0, normalizedX: 0.9, arrived: true });
    expect(calculatePetPlacement(1_000, sampleWalk(plan, 0).normalizedX).normalizedX).toBe(0.9);
  });

  it('rebases an active walk on resize without losing normalized progress', () => {
    const original = createWalkPlan(0, 1, 1_000, 700);
    const resized = rebaseWalkForViewport(original, 11_000, 180, 700);
    expect(resized.startNormalizedX).toBe(0.5);
    expect(resized.targetNormalizedX).toBe(1);
    expect(resized.startX).toBe(42);
    expect(resized.targetX).toBe(72);
    expect(resized.durationMs).toBe(750);
    expect(sampleWalk(resized, resized.durationMs)).toMatchObject({ x: 72, normalizedX: 1, arrived: true });
  });

  it('restores persisted normalizedX after a tab return and width change', () => {
    const persistedNormalizedX = 0.73;
    const firstTab = calculatePetPlacement(1_000, persistedNormalizedX, 700);
    const returnedTab = calculatePetPlacement(180, persistedNormalizedX, 64);
    expect(firstTab.normalizedX).toBe(persistedNormalizedX);
    expect(returnedTab.normalizedX).toBe(persistedNormalizedX);
    expect(returnedTab.x).toBeGreaterThanOrEqual(0);
    expect(returnedTab.x + returnedTab.size).toBeLessThanOrEqual(180);
  });
});
