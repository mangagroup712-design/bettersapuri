const toggles = {
  shortcutsEnabled: document.getElementById("shortcutsEnabled"),
  showShortcutBadges: document.getElementById("showShortcutBadges"),
};

function loadSettings() {
  chrome.storage.sync.get(
    {
      shortcutsEnabled: true,
      showShortcutBadges: true,
    },
    function (stored) {
      toggles.shortcutsEnabled.checked = stored.shortcutsEnabled !== false;
      toggles.showShortcutBadges.checked = stored.showShortcutBadges !== false;
    }
  );
}

Object.keys(toggles).forEach(function (key) {
  toggles[key].addEventListener("change", function () {
    chrome.storage.sync.set({ [key]: toggles[key].checked });
  });
});

document.getElementById("openOptions").addEventListener("click", function () {
  chrome.runtime.openOptionsPage();
});

loadSettings();
