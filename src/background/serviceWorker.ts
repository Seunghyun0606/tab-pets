import { createPetStore } from '../pet/state/petStore';

const petStore = createPetStore();

const configureSidePanel = async (): Promise<void> => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
};

const initializeRuntime = async (): Promise<void> => {
  await Promise.all([configureSidePanel(), petStore.load()]);
};

chrome.runtime.onInstalled.addListener(() => {
  void initializeRuntime();
});

chrome.runtime.onStartup.addListener(() => {
  void initializeRuntime();
});
