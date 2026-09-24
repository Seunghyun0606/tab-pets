import { createDomHomeView, mountHomeApp } from './app';
import { createPetStore } from '../pet/state/petStore';

const root = document.querySelector<HTMLElement>('#app');

if (root === null) {
  throw new Error('Tab Pets home root was not found.');
}

const app = mountHomeApp({
  onError: (error) => {
    console.error('Tab Pets home could not load PetState.', error);
  },
  storageChanges: chrome.storage.onChanged,
  store: createPetStore(),
  view: createDomHomeView(root),
});

window.addEventListener('pagehide', () => app.destroy(), { once: true });
