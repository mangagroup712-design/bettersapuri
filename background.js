chrome.runtime.onInstalled.addListener(function () {
  chrome.storage.sync.get(null, function (stored) {
    if (Object.keys(stored).length === 0) {
      chrome.storage.sync.set({
        shortcutsEnabled: true,
        showShortcutBadges: true,
      });
    }
  });
});
