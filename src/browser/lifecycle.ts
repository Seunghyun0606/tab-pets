export const RUNTIME_CONTEXT_CHECK_INTERVAL_MS = 5_000;

export const isRuntimeContextValid = (runtimeId: string): boolean => {
  try {
    return (
      chrome.runtime.id === runtimeId &&
      chrome.runtime.getURL('') === `chrome-extension://${runtimeId}/`
    );
  } catch {
    return false;
  }
};
