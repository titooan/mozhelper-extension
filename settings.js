const MozHelperSettings = (() => {
  const storage = typeof browser !== "undefined" ? browser.storage : chrome.storage;
  const defaultSettings = {
    enableGmail: true,
    enablePhabricator: true,
    enablePhabricatorPaste: true,
    enableBugzilla: true,
    enableTreeherder: true
  };

  function applyState(checkboxes, values) {
    Object.entries(checkboxes).forEach(([key, checkbox]) => {
      if (checkbox) checkbox.checked = Boolean(values[key]);
    });
  }

  function collectState(checkboxes) {
    const state = {};
    Object.entries(checkboxes).forEach(([key, checkbox]) => {
      if (checkbox) state[key] = checkbox.checked;
    });
    return state;
  }

  function initToggles({ checkboxes, statusElement, showStatus = false }) {
    const entries = Object.entries(checkboxes || {}).filter(([, el]) => el);
    if (!entries.length) return;

    let statusTimer = null;
    const setStatus = (message) => {
      if (!statusElement) return;
      statusElement.textContent = message;
      if (statusTimer) clearTimeout(statusTimer);
      if (message) {
        statusTimer = setTimeout(() => {
          statusElement.textContent = "";
          statusTimer = null;
        }, 1500);
      }
    };

    storage.sync.get(defaultSettings).then((items) => applyState(checkboxes, items));

    const save = () => {
      const nextState = collectState(checkboxes);
      storage.sync.set(nextState).then(() => {
        if (showStatus) setStatus("Settings saved.");
      });
    };

    entries.forEach(([, checkbox]) => checkbox.addEventListener("change", save));

    storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      entries.forEach(([key, checkbox]) => {
        if (changes[key] && checkbox) checkbox.checked = changes[key].newValue;
      });
      if (showStatus) setStatus("");
    });
  }

  return {
    initToggles,
    defaultSettings
  };
})();
