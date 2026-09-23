const runtimeId = chrome.runtime.id;

if (runtimeId.length === 0) {
  throw new Error('Tab Pets content script started without an extension runtime.');
}

