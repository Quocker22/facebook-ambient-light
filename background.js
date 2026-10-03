// Toolbar icon: open the settings panel on the current Facebook tab.
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id || !tab.url?.startsWith('https://www.facebook.com/')) return;
  chrome.tabs.sendMessage(tab.id, { type: 'fb-ambient-open-panel' }).catch(() => {
    // The tab was opened before the extension was (re)loaded: no listener yet.
  });
});
