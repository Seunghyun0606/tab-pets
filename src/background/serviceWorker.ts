import { createPetStore } from '../pet/state/petStore';
import { isPetStateRequest } from '../messaging/messages';
import { handlePetMessage } from './petMessageHandler';

const petStore = createPetStore();

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isPetStateRequest(message)) return false;
  void handlePetMessage(message, () => petStore.load()).then(sendResponse);
  return true;
});

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
