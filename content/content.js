(function () {
  "use strict";

  const CONFIRM_KEYWORDS = [
    "次の問題へ",
    "次の問題",
    "次へ",
    "次に",
    "回答",
    "解答",
    "送信",
    "確定",
    "決定",
    "完了",
    "答えを見る",
    "submit",
    "confirm",
    "next",
    "done",
  ];

  let settings = {
    shortcutsEnabled: true,
    showShortcutBadges: true,
  };

  let cachedSelectedClass = null;
  let badgeObserver = null;
  let badgeRefreshTimer = null;
  let toastEl = null;
  let toastTimer = null;

  function loadSettings() {
    return new Promise(function (resolve) {
      chrome.storage.sync.get(
        { shortcutsEnabled: true, showShortcutBadges: true },
        function (stored) {
          settings = {
            shortcutsEnabled: stored.shortcutsEnabled !== false,
            showShortcutBadges: stored.showShortcutBadges !== false,
          };
          resolve(settings);
        }
      );
    });
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    var style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }
    var rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isTypingContext(target) {
    if (!target) return false;
    var tag = (target.tagName || "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
      var type = (target.type || "").toLowerCase();
      if (type === "radio" || type === "checkbox" || type === "button" || type === "submit") {
        return false;
      }
      return true;
    }
    return !!target.isContentEditable;
  }

  function getClassNames(el) {
    if (!el || !el.className) return [];
    if (typeof el.className === "string") return el.className.split(/\s+/).filter(Boolean);
    return Array.from(el.classList || []);
  }

  function hasClassFragment(el, fragment) {
    return getClassNames(el).some(function (name) {
      return name.indexOf(fragment) !== -1;
    });
  }

  // ---------------------------------------------------------------------------
  // QuizMultipleChoice buttons
  // <button class="_QuizButton_19ml2_2 _QuizMultipleChoice__Button_7dgro_2">
  // selected: ... _isSelected_19ml2_33 selected
  // ---------------------------------------------------------------------------

  function findQuizChoiceButtons() {
    var buttons = Array.from(document.querySelectorAll("button")).filter(function (btn) {
      if (!isVisible(btn)) return false;
      return hasClassFragment(btn, "QuizMultipleChoice__Button_");
    });

    buttons.sort(function (a, b) {
      var ra = a.getBoundingClientRect();
      var rb = b.getBoundingClientRect();
      if (Math.abs(ra.top - rb.top) > 8) return ra.top - rb.top;
      return ra.left - rb.left;
    });

    return buttons.slice(0, 9);
  }

  function findIsSelectedClassName(buttons) {
    if (cachedSelectedClass) return cachedSelectedClass;

    var i;
    var names;
    var j;

    for (i = 0; i < buttons.length; i++) {
      names = getClassNames(buttons[i]);
      for (j = 0; j < names.length; j++) {
        if (names[j].indexOf("_isSelected_") === 0) {
          cachedSelectedClass = names[j];
          return cachedSelectedClass;
        }
      }
    }

    var anySelected = document.querySelector('[class*="_isSelected_"]');
    if (anySelected) {
      names = getClassNames(anySelected);
      for (j = 0; j < names.length; j++) {
        if (names[j].indexOf("_isSelected_") === 0) {
          cachedSelectedClass = names[j];
          return cachedSelectedClass;
        }
      }
    }

    if (buttons.length > 0) {
      names = getClassNames(buttons[0]);
      for (j = 0; j < names.length; j++) {
        var match = names[j].match(/^_QuizButton_([a-z0-9]+)_/i);
        if (match) {
          cachedSelectedClass = "_isSelected_" + match[1] + "_33";
          return cachedSelectedClass;
        }
      }
    }

    return "_isSelected_19ml2_33";
  }

  function isQuizButtonSelected(btn) {
    if (btn.hasAttribute("selected")) return true;
    return getClassNames(btn).some(function (name) {
      return name.indexOf("_isSelected_") === 0;
    });
  }

  function removeSelectedState(btn) {
    getClassNames(btn).forEach(function (name) {
      if (name.indexOf("_isSelected_") === 0) {
        btn.classList.remove(name);
      }
    });
    btn.removeAttribute("selected");
  }

  function applySelectedState(btn, selectedClassName) {
    if (!isQuizButtonSelected(btn)) {
      btn.classList.add(selectedClassName);
      btn.setAttribute("selected", "");
    }
  }

  function clickButton(btn) {
    try {
      btn.focus();
      btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
      btn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
      btn.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true }));
      btn.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    } catch (e) {
      btn.click();
    }
  }

  function toggleQuizButton(btn, selectedClassName) {
    var wasSelected = isQuizButtonSelected(btn);

    if (wasSelected) {
      removeSelectedState(btn);
    } else {
      applySelectedState(btn, selectedClassName);
    }

    clickButton(btn);

    // React の再描画後も見た目を合わせる
    setTimeout(function () {
      if (wasSelected) {
        removeSelectedState(btn);
      } else {
        applySelectedState(btn, selectedClassName);
      }
    }, 0);
  }

  function findChoices() {
    var buttons = findQuizChoiceButtons();
    if (buttons.length >= 1) {
      return buttons.map(function (btn) {
        return { element: btn, type: "quiz-button" };
      });
    }
    return [];
  }

  // ---------------------------------------------------------------------------
  // Confirm
  // ---------------------------------------------------------------------------

  function getButtonLabel(btn) {
    return (btn.textContent || btn.value || btn.getAttribute("aria-label") || "")
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  function findConfirmButton() {
    var candidates = Array.from(
      document.querySelectorAll('button, [role="button"], input[type="submit"]')
    ).filter(isVisible);

    var i;
    var btn;
    var text;
    var k;

    // 1) 「次の問題へ」: _QuizButtons__Button_ + _btn-primary_
    for (i = 0; i < candidates.length; i++) {
      btn = candidates[i];
      if (hasClassFragment(btn, "QuizMultipleChoice__Button_")) continue;
      if (
        hasClassFragment(btn, "QuizButtons__Button_") &&
        hasClassFragment(btn, "btn-primary_")
      ) {
        return btn;
      }
    }

    // 2) RaisedButton / QuizButtons 系で文言一致
    for (i = 0; i < candidates.length; i++) {
      btn = candidates[i];
      if (hasClassFragment(btn, "QuizMultipleChoice__Button_")) continue;
      if (
        !hasClassFragment(btn, "QuizButtons__Button_") &&
        !hasClassFragment(btn, "RaisedButton_")
      ) {
        continue;
      }
      text = getButtonLabel(btn);
      for (k = 0; k < CONFIRM_KEYWORDS.length; k++) {
        if (text.indexOf(CONFIRM_KEYWORDS[k].toLowerCase().replace(/\s+/g, "")) !== -1) {
          return btn;
        }
      }
    }

    // 3) 文言一致（一般ボタン）
    for (i = 0; i < candidates.length; i++) {
      btn = candidates[i];
      if (hasClassFragment(btn, "QuizMultipleChoice__Button_")) continue;
      text = getButtonLabel(btn);
      for (k = 0; k < CONFIRM_KEYWORDS.length; k++) {
        if (text.indexOf(CONFIRM_KEYWORDS[k].toLowerCase().replace(/\s+/g, "")) !== -1) {
          return btn;
        }
      }
    }

    return null;
  }

  function confirmAnswer() {
    var btn = findConfirmButton();
    if (btn) {
      clickButton(btn);
      var label = getButtonLabel(btn);
      if (label.indexOf("次") !== -1) {
        showToast("次の問題へ進みました");
      } else {
        showToast("回答を確定しました");
      }
      return true;
    }
    showToast("確定ボタンが見つかりません");
    return false;
  }

  // ---------------------------------------------------------------------------
  // Badges
  // ---------------------------------------------------------------------------

  function removeBadges() {
    document.querySelectorAll(".sapuri-opt-badge").forEach(function (el) {
      el.remove();
    });
    document.querySelectorAll(".sapuri-opt-badge-host").forEach(function (el) {
      el.classList.remove("sapuri-opt-badge-host");
    });
  }

  function refreshBadges() {
    removeBadges();
    if (!settings.shortcutsEnabled || !settings.showShortcutBadges) return;

    var choices = findChoices();
    choices.forEach(function (choice, index) {
      var host = choice.element;
      if (!host || host.querySelector(".sapuri-opt-badge")) return;

      var badge = document.createElement("span");
      badge.className = "sapuri-opt-badge";
      badge.textContent = String(index + 1);
      badge.setAttribute("aria-hidden", "true");

      if (window.getComputedStyle(host).position === "static") {
        host.style.position = "relative";
      }
      host.classList.add("sapuri-opt-badge-host");
      host.insertBefore(badge, host.firstChild);
    });
  }

  function scheduleBadgeRefresh() {
    clearTimeout(badgeRefreshTimer);
    badgeRefreshTimer = setTimeout(refreshBadges, 100);
  }

  function startBadgeObserver() {
    if (badgeObserver || !document.body) return;
    badgeObserver = new MutationObserver(function () {
      cachedSelectedClass = null;
      scheduleBadgeRefresh();
    });
    badgeObserver.observe(document.body, { childList: true, subtree: true, attributes: true });
  }

  function stopBadgeObserver() {
    if (badgeObserver) {
      badgeObserver.disconnect();
      badgeObserver = null;
    }
    clearTimeout(badgeRefreshTimer);
    removeBadges();
  }

  // ---------------------------------------------------------------------------
  // Toast
  // ---------------------------------------------------------------------------

  function showToast(message) {
    if (!document.body) return;
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "sapuri-shortcut-toast";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      if (toastEl) toastEl.classList.remove("visible");
    }, 1200);
  }

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------

  function handleKeyDown(event) {
    if (!settings.shortcutsEnabled) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTypingContext(event.target)) return;

    var key = event.key;

    if (key >= "1" && key <= "9") {
      var buttons = findQuizChoiceButtons();
      var index = parseInt(key, 10) - 1;
      if (index >= buttons.length) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      var selectedClassName = findIsSelectedClassName(buttons);
      toggleQuizButton(buttons[index], selectedClassName);
      showToast("選択肢 " + key + " を操作しました");
      scheduleBadgeRefresh();
      return;
    }

    if (key === "Enter") {
      var confirmBtn = findConfirmButton();
      if (!confirmBtn && findQuizChoiceButtons().length === 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      confirmAnswer();
    }
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  function bindKeyboard() {
    window.removeEventListener("keydown", handleKeyDown, true);
    document.removeEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
  }

  function unbindKeyboard() {
    window.removeEventListener("keydown", handleKeyDown, true);
    document.removeEventListener("keydown", handleKeyDown, true);
  }

  function applyAll() {
    unbindKeyboard();
    if (settings.shortcutsEnabled) {
      startBadgeObserver();
      scheduleBadgeRefresh();
      bindKeyboard();
    } else {
      stopBadgeObserver();
    }
  }

  function boot() {
    loadSettings().then(applyAll);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== "sync") return;
    if (changes.shortcutsEnabled) {
      settings.shortcutsEnabled = changes.shortcutsEnabled.newValue !== false;
    }
    if (changes.showShortcutBadges) {
      settings.showShortcutBadges = changes.showShortcutBadges.newValue !== false;
    }
    applyAll();
  });
})();
