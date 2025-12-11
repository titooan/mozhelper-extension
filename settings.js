const MozHelperSettings = (() => {
  const storage = typeof browser !== "undefined" ? browser.storage : chrome.storage;
  const defaultSettings = {
    enableGmail: true,
    enableGmailHover: true,
    enablePhabricator: true,
    enablePhabricatorPaste: true,
    enablePhabricatorTryLinks: true,
    enablePhabricatorTryCommentIcons: true,
    enableBugzilla: true,
    enableTreeherder: true,
    enableTreeherderUnitTests: true
  };

  function applyState(checkboxes, values) {
    Object.entries(checkboxes).forEach(([key, checkbox]) => {
      if (!checkbox) return;
      checkbox.checked = Boolean(values[key]);
      checkbox.dispatchEvent(new CustomEvent("mozhelper:sync", { detail: { value: checkbox.checked } }));
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
        if (changes[key] && checkbox) {
          checkbox.checked = changes[key].newValue;
          checkbox.dispatchEvent(
            new CustomEvent("mozhelper:sync", { detail: { value: checkbox.checked } })
          );
        }
      });
      if (showStatus) setStatus("");
    });
  }

  function bindDependentToggle({ parent, child, label } = {}) {
    if (!parent || !child) return;
    const labelEl = label || child.closest("label");
    const update = () => {
      const enabled = Boolean(parent.checked);
      child.disabled = !enabled;
      if (labelEl) labelEl.classList.toggle("disabled", !enabled);
    };
    parent.addEventListener("change", update);
    parent.addEventListener("mozhelper:sync", update);
    update();
  }

  return {
    initToggles,
    defaultSettings,
    bindDependentToggle
  };
})();

if (typeof globalThis !== "undefined") {
  globalThis.MozHelperSettings = MozHelperSettings;
}
