export const PET_RENDER_SIZE = 96;
export const PET_EDGE_MARGIN = 12;
export const PET_BOTTOM_MARGIN = 10;

export interface PetPlacement {
  bottom: number;
  normalizedX: number;
  size: number;
  x: number;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

export const normalizePosition = (value: number): number =>
  Number.isFinite(value) ? clamp(value, 0, 1) : 0.5;

export const calculatePetPlacement = (
  viewportWidth: number,
  normalizedX: number,
  viewportHeight = Number.POSITIVE_INFINITY,
): PetPlacement => {
  const safeViewportWidth = Math.max(0, viewportWidth);
  const safeViewportHeight = Math.max(0, viewportHeight);
  const size = Math.min(
    PET_RENDER_SIZE,
    safeViewportWidth,
    safeViewportHeight,
  );
  const bottom = Math.min(
    PET_BOTTOM_MARGIN,
    Math.max(0, safeViewportHeight - size),
  );
  const margin =
    safeViewportWidth >= PET_RENDER_SIZE + PET_EDGE_MARGIN * 2
      ? PET_EDGE_MARGIN
      : 0;
  const availableWidth = Math.max(
    0,
    safeViewportWidth - size - margin * 2,
  );
  const safeNormalizedX = normalizePosition(normalizedX);

  return {
    bottom,
    normalizedX: safeNormalizedX,
    size,
    x: margin + availableWidth * safeNormalizedX,
  };
};
