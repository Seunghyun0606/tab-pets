import { calculatePetPlacement, normalizePosition } from './placement';

export interface WalkMotionConfig {
  baseSpeedPxPerSecond: number;
  variationFraction: number;
}

export const CURIOUS_WALK_MOTION: Readonly<WalkMotionConfig> = {
  baseSpeedPxPerSecond: 40,
  variationFraction: 0.125,
};

export interface WalkPlan {
  startNormalizedX: number;
  targetNormalizedX: number;
  startX: number;
  targetX: number;
  speedPxPerSecond: number;
  durationMs: number;
}

export interface WalkSample {
  x: number;
  normalizedX: number;
  arrived: boolean;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

export const resolveWalkSpeed = (
  variation: number,
  config: Readonly<WalkMotionConfig> = CURIOUS_WALK_MOTION,
): number => {
  if (!Number.isFinite(config.baseSpeedPxPerSecond) || config.baseSpeedPxPerSecond <= 0 ||
      !Number.isFinite(config.variationFraction) || config.variationFraction < 0 ||
      config.variationFraction >= 1) {
    throw new RangeError('Walk motion config must have positive speed and variation in [0, 1).');
  }
  const safeVariation = Number.isFinite(variation) ? clamp(variation, -1, 1) : 0;
  return config.baseSpeedPxPerSecond * (1 + safeVariation * config.variationFraction);
};

const planAtSpeed = (
  startNormalizedX: number,
  targetNormalizedX: number,
  viewportWidth: number,
  viewportHeight: number,
  speedPxPerSecond: number,
): WalkPlan => {
  const start = calculatePetPlacement(viewportWidth, startNormalizedX, viewportHeight);
  const target = calculatePetPlacement(viewportWidth, targetNormalizedX, viewportHeight);
  return {
    startNormalizedX: start.normalizedX,
    targetNormalizedX: target.normalizedX,
    startX: start.x,
    targetX: target.x,
    speedPxPerSecond,
    durationMs: (Math.abs(target.x - start.x) / speedPxPerSecond) * 1_000,
  };
};

/** All coordinates are inside the viewport's bounded Pet World, never host DOM coordinates. */
export const createWalkPlan = (
  startNormalizedX: number,
  targetNormalizedX: number,
  viewportWidth: number,
  viewportHeight: number,
  variation = 0,
  config: Readonly<WalkMotionConfig> = CURIOUS_WALK_MOTION,
): WalkPlan => planAtSpeed(
  normalizePosition(startNormalizedX),
  normalizePosition(targetNormalizedX),
  viewportWidth,
  viewportHeight,
  resolveWalkSpeed(variation, config),
);

export const sampleWalk = (plan: Readonly<WalkPlan>, elapsedMs: number): WalkSample => {
  const safeElapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const progress = plan.durationMs === 0 ? 1 : clamp(safeElapsed / plan.durationMs, 0, 1);
  if (progress === 1) {
    return { x: plan.targetX, normalizedX: plan.targetNormalizedX, arrived: true };
  }
  return {
    x: plan.startX + (plan.targetX - plan.startX) * progress,
    normalizedX: plan.startNormalizedX +
      (plan.targetNormalizedX - plan.startNormalizedX) * progress,
    arrived: false,
  };
};

/** Preserve current normalized progress while the viewport changes size. */
export const rebaseWalkForViewport = (
  plan: Readonly<WalkPlan>,
  elapsedMs: number,
  viewportWidth: number,
  viewportHeight: number,
): WalkPlan => planAtSpeed(
  sampleWalk(plan, elapsedMs).normalizedX,
  plan.targetNormalizedX,
  viewportWidth,
  viewportHeight,
  plan.speedPxPerSecond,
);
