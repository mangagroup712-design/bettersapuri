const shortcutsEnabled = document.getElementById("shortcutsEnabled");
const showShortcutBadges = document.getElementById("showShortcutBadges");
const saveBtn = document.getElementById("saveBtn");
const statusEl = document.getElementById("status");

function loadSettings() {
  chrome.storage.sync.get(
    {
      shortcutsEnabled: true,
      showShortcutBadges: true,
    },
    function (stored) {
      shortcutsEnabled.checked = stored.shortcutsEnabled !== false;
      showShortcutBadges.checked = stored.showShortcutBadges !== false;
    }
  );
}

saveBtn.addEventListener("click", function () {
  chrome.storage.sync.set(
    {
      shortcutsEnabled: shortcutsEnabled.checked,
      showShortcutBadges: showShortcutBadges.checked,
    },
    function () {
      statusEl.textContent = "設定を保存しました";
      setTimeout(function () {
        statusEl.textContent = "";
      }, 2500);
    }
  );
});

loadSettings();
