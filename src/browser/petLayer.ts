export const PET_LAYER_HOST_ID = 'tab-pets-root';
export const PET_ACTIVITY_ZONE_HEIGHT = 180;
export const PET_RENDER_SIZE = 96;
export const PET_EDGE_MARGIN = 12;
export const PET_BOTTOM_MARGIN = 10;

const REGISTRY_KEY = Symbol.for('tab-pets.pet-layer.v1');

export interface PetPlacement {
  bottom: number;
  normalizedX: number;
  size: number;
  x: number;
}

export interface PetLayer {
  readonly created: boolean;
  readonly hitTarget: HTMLButtonElement;
  readonly host: HTMLElement;
  destroy(): void;
  setNormalizedX(value: number): void;
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

  document.getElementById(PET_LAYER_HOST_ID)?.remove();

  const host = document.createElement('tab-pets-root');
  host.id = PET_LAYER_HOST_ID;
  host.dataset.tabPetsRuntime = options.runtimeId;
  isolateHost(host);

  const shadowRoot = host.attachShadow({ mode: 'open' });
  const hitTarget = createShadowContents(
    document,
    shadowRoot,
    options.assetUrl,
  );
  let normalizedX = normalizePosition(options.normalizedX);

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

  window.addEventListener('resize', renderPlacement, { passive: true });
  renderPlacement();
  document.documentElement.append(host);

  let destroyed = false;
  const layer: PetLayer = {
    created: true,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      window.removeEventListener('resize', renderPlacement);
      host.remove();
      if (registry[options.runtimeId]?.host === host) {
        delete registry[options.runtimeId];
      }
    },
    hitTarget,
    host,
    setNormalizedX: (value) => {
      normalizedX = normalizePosition(value);
      renderPlacement();
    },
  };

  registry[options.runtimeId] = layer;
  return layer;
};
