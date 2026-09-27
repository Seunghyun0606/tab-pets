import type { PetState, PresenceMode } from '../pet/model/pet';
import type { PetStore } from '../pet/state/petStore';
import { PET_STATE_STORAGE_KEY } from '../storage/repository';

type StorageChangeListener = (
  changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
  areaName: string,
) => void;

export interface StorageChangeSource {
  addListener(listener: StorageChangeListener): void;
  removeListener(listener: StorageChangeListener): void;
}

export interface HomeView {
  showError(): void;
  showLoading(): void;
  showState(state: PetState): void;
}

export interface HomeApp {
  readonly ready: Promise<void>;
  destroy(): void;
  refresh(): Promise<void>;
}

export interface HomeAppOptions {
  onError?: (error: unknown) => void;
  storageChanges: StorageChangeSource;
  store: Pick<PetStore, 'load'>;
  view: HomeView;
}

const presenceMessages: Record<PresenceMode, string> = {
  ROAMING: 'is spending time with you in the Browser World.',
  HOME: 'is relaxing at home.',
  SLEEPING: 'is curled up for a quiet nap.',
  PAUSED: 'is taking a quiet break.',
  GOING_HOME: 'is on the way home.',
  GOING_OUT: 'is getting ready to join you.',
};

const createShell = (
  document: Document,
  title: string,
  message: string,
): HTMLElement => {
  const shell = document.createElement('main');
  shell.className = 'home-shell';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'Momo home';

  const heading = document.createElement('h1');
  heading.id = 'home-title';
  heading.textContent = title;

  const description = document.createElement('p');
  description.className = 'message';
  description.textContent = message;

  shell.setAttribute('aria-labelledby', heading.id);
  shell.append(eyebrow, heading, description);
  return shell;
};

const appendDetail = (
  document: Document,
  list: HTMLDListElement,
  label: string,
  value: string,
): void => {
  const row = document.createElement('div');
  row.className = 'state-row';

  const term = document.createElement('dt');
  term.textContent = label;

  const description = document.createElement('dd');
  description.textContent = value;

  row.append(term, description);
  list.append(row);
};

export const createDomHomeView = (root: HTMLElement): HomeView => ({
  showError: () => {
    const shell = createShell(
      root.ownerDocument,
      "Momo's home",
      "Momo's state could not be loaded. Close and reopen the panel to try again.",
    );
    shell.classList.add('is-error');
    shell.setAttribute('role', 'alert');
    root.replaceChildren(shell);
  },
  showLoading: () => {
    const shell = createShell(
      root.ownerDocument,
      "Momo's home",
      'Checking where Momo is…',
    );
    shell.setAttribute('aria-busy', 'true');
    shell.setAttribute('aria-live', 'polite');
    root.replaceChildren(shell);
  },
  showState: (state) => {
    const shell = createShell(
      root.ownerDocument,
      `${state.identity.name}'s home`,
      `${state.identity.name} ${presenceMessages[state.presence.mode]}`,
    );
    const details = root.ownerDocument.createElement('dl');
    details.className = 'state-card';
    details.setAttribute('aria-label', 'Current companion state');
    appendDetail(
      root.ownerDocument,
      details,
      'Companion',
      `${state.identity.name} · Cat`,
    );
    appendDetail(
      root.ownerDocument,
      details,
      'Presence',
      state.presence.mode,
    );
    shell.append(details);
    root.replaceChildren(shell);
  },
});

export const mountHomeApp = (options: HomeAppOptions): HomeApp => {
  let active = true;
  let requestId = 0;

  const refresh = async (): Promise<void> => {
    const currentRequest = ++requestId;
    try {
      const state = await options.store.load();
      if (active && currentRequest === requestId) {
        options.view.showState(state);
      }
    } catch (error) {
      if (active && currentRequest === requestId) {
        options.view.showError();
        options.onError?.(error);
      }
    }
  };

  const handleStorageChange: StorageChangeListener = (changes, areaName) => {
    if (areaName === 'local' && PET_STATE_STORAGE_KEY in changes) {
      void refresh();
    }
  };

  options.view.showLoading();
  options.storageChanges.addListener(handleStorageChange);
  const ready = refresh();

  return {
    destroy: () => {
      if (!active) return;
      active = false;
      requestId += 1;
      options.storageChanges.removeListener(handleStorageChange);
    },
    ready,
    refresh,
  };
};
