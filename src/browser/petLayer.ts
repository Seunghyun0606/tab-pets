import { createWalkPlan, rebaseWalkForViewport, sampleWalk, type WalkPlan } from './movement';
import { calculatePetPlacement, normalizePosition } from './placement';

export { calculatePetPlacement, normalizePosition, PET_BOTTOM_MARGIN, PET_EDGE_MARGIN, PET_RENDER_SIZE } from './placement';
export type { PetPlacement } from './placement';

export const PET_LAYER_HOST_ID = 'tab-pets-root';
export const PET_ACTIVITY_ZONE_HEIGHT = 180;

const REGISTRY_KEY = Symbol.for('tab-pets.pet-layer.v1');

export interface PetLayer {
  readonly created: boolean;
  readonly hitTarget: HTMLButtonElement;
  readonly host: HTMLElement;
  destroy(): void;
  setNormalizedX(value: number): void;
  walkToNormalizedX(value: number, variation?: number, onArrive?: (normalizedX: number) => void): void;
}

export interface PetLayerOptions {
  assetUrl: string;
  document?: Document;
  normalizedX: number;
  runtimeId: string;
  window?: Window;
}

interface PetLayerRegistry {
  [runtimeId: string]: PetLayer | undefined;
}

const getRegistry = (): PetLayerRegistry => {
  const scope = globalThis as typeof globalThis & {
    [REGISTRY_KEY]?: PetLayerRegistry;
  };
  scope[REGISTRY_KEY] ??= {};
  return scope[REGISTRY_KEY];
};

const setImportantStyle = (
  element: HTMLElement,
  property: string,
  value: string,
): void => {
  element.style.setProperty(property, value, 'important');
};

const getAvailableHostId = (
  document: Document,
  runtimeId: string,
): string => {
  let candidate = PET_LAYER_HOST_ID;
  let collision = 0;
  while (document.getElementById(candidate) !== null) {
    collision += 1;
    candidate = `${PET_LAYER_HOST_ID}-${runtimeId}-${collision}`;
  }
  return candidate;
};

const isolateHost = (host: HTMLElement): void => {
  const styles: ReadonlyArray<readonly [string, string]> = [
    ['all', 'initial'],
    ['background', 'transparent'],
    ['border', '0'],
    ['bottom', '0'],
    ['box-sizing', 'border-box'],
    ['contain', 'layout style paint'],
    ['display', 'block'],
    ['filter', 'none'],
    ['height', `${PET_ACTIVITY_ZONE_HEIGHT}px`],
    ['left', '0'],
    ['margin', '0'],
    ['opacity', '1'],
    ['padding', '0'],
    ['pointer-events', 'none'],
    ['position', 'fixed'],
    ['right', '0'],
    ['transform', 'none'],
    ['visibility', 'visible'],
    ['width', '100vw'],
    ['z-index', '2147483646'],
  ];
  for (const [property, value] of styles) {
    setImportantStyle(host, property, value);
  }
};

const createShadowContents = (
  document: Document,
  shadowRoot: ShadowRoot,
  assetUrl: string,
): HTMLButtonElement => {
  const style = document.createElement('style');
  style.textContent = `
    :host, *, *::before, *::after { box-sizing: border-box; }
    #activity-zone {
      inset: 0;
      overflow: hidden;
      pointer-events: none;
      position: absolute;
    }
    #momo-hit-target {
      all: unset;
      background: transparent;
      border-radius: 18px;
      bottom: var(--tab-pets-bottom);
      cursor: pointer;
      display: block;
      height: var(--tab-pets-size);
      left: 0;
      pointer-events: auto;
      position: absolute;
      transform: translate3d(var(--tab-pets-x), 0, 0);
      width: var(--tab-pets-size);
    }
    #momo-hit-target:focus-visible {
      outline: 3px solid #7c5cff;
      outline-offset: 3px;
    }
    #momo-sprite {
      display: block;
      height: 100%;
      object-fit: contain;
      pointer-events: none;
      user-select: none;
      width: 100%;
      -webkit-user-drag: none;
    }
    @media (prefers-reduced-motion: reduce) {
      #momo-hit-target { transition: none; }
    }
  `;

  const zone = document.createElement('div');
  zone.id = 'activity-zone';

  const hitTarget = document.createElement('button');
  hitTarget.id = 'momo-hit-target';
  hitTarget.type = 'button';
  hitTarget.setAttribute('aria-label', 'Momo, your browser companion');

  const image = document.createElement('img');
  image.id = 'momo-sprite';
  image.alt = '';
  image.draggable = false;
  image.src = assetUrl;

  hitTarget.append(image);
  zone.append(hitTarget);
  shadowRoot.append(style, zone);
  return hitTarget;
};

export const mountPetLayer = (options: PetLayerOptions): PetLayer => {
  const document = options.document ?? globalThis.document;
  const window = options.window ?? globalThis.window;
  const registry = getRegistry();
  const registered = registry[options.runtimeId];

  if (registered?.host.isConnected) {
    registered.setNormalizedX(options.normalizedX);
    return { ...registered, created: false };
  }

  registered?.destroy();

  const host = document.createElement('tab-pets-root');
  host.id = getAvailableHostId(document, options.runtimeId);
  host.dataset.tabPetsRuntime = options.runtimeId;
  isolateHost(host);

  const shadowRoot = host.attachShadow({ mode: 'open' });
  const hitTarget = createShadowContents(
    document,
    shadowRoot,
    options.assetUrl,
  );
  let normalizedX = normalizePosition(options.normalizedX);
  let walk: { plan: WalkPlan; startedAt: number; onArrive?: (normalizedX: number) => void } | undefined;
  let animationFrame: number | undefined;

  const renderPlacement = (): void => {
    const placement = calculatePetPlacement(
      window.innerWidth,
      normalizedX,
      window.innerHeight,
    );
    hitTarget.style.setProperty('--tab-pets-bottom', `${placement.bottom}px`);
    hitTarget.style.setProperty('--tab-pets-x', `${placement.x}px`);
    hitTarget.style.setProperty('--tab-pets-size', `${placement.size}px`);
  };

  const cancelWalk = (): void => {
    if (animationFrame !== undefined) window.cancelAnimationFrame(animationFrame);
    animationFrame = undefined;
    walk = undefined;
  };

  const tickWalk = (now: number): void => {
    animationFrame = undefined;
    if (!walk || destroyed) return;
    const sample = sampleWalk(walk.plan, now - walk.startedAt);
    normalizedX = sample.normalizedX;
    renderPlacement();
    if (sample.arrived) {
      const onArrive = walk.onArrive;
      walk = undefined;
      onArrive?.(normalizedX);
      return;
    }
    animationFrame = window.requestAnimationFrame(tickWalk);
  };

  const handleResize = (): void => {
    if (walk) {
      const now = window.performance.now();
      walk.plan = rebaseWalkForViewport(
        walk.plan,
        now - walk.startedAt,
        window.innerWidth,
        window.innerHeight,
      );
      walk.startedAt = now;
      normalizedX = walk.plan.startNormalizedX;
    }
    renderPlacement();
  };

  window.addEventListener('resize', handleResize, { passive: true });
  renderPlacement();
  document.documentElement.append(host);

  let destroyed = false;
  const layer: PetLayer = {
    created: true,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      cancelWalk();
      window.removeEventListener('resize', handleResize);
      host.remove();
      if (registry[options.runtimeId]?.host === host) {
        delete registry[options.runtimeId];
      }
    },
    hitTarget,
    host,
    setNormalizedX: (value) => {
      cancelWalk();
      normalizedX = normalizePosition(value);
      renderPlacement();
    },
    walkToNormalizedX: (value, variation = 0, onArrive) => {
      cancelWalk();
      const plan = createWalkPlan(
        normalizedX,
        value,
        window.innerWidth,
        window.innerHeight,
        variation,
      );
      walk = {
        plan,
        startedAt: window.performance.now(),
        ...(onArrive ? { onArrive } : {}),
      };
      animationFrame = window.requestAnimationFrame(tickWalk);
    },
  };

  registry[options.runtimeId] = layer;
  return layer;
};
