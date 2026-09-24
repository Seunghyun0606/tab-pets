import { describe, expect, it } from 'vitest';

import {
  calculatePetPlacement,
  PET_BOTTOM_MARGIN,
  PET_EDGE_MARGIN,
  PET_RENDER_SIZE,
} from '../src/browser/petLayer';

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
