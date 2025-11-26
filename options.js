document.addEventListener("DOMContentLoaded", () => {
  const checkboxes = {
    enableGmail: document.getElementById("enableGmail"),
    enablePhabricator: document.getElementById("enablePhabricator"),
    enableBugzilla: document.getElementById("enableBugzilla"),
    enableTreeherder: document.getElementById("enableTreeherder")
  };

  MozHelperSettings.initToggles({
    checkboxes,
    statusElement: document.getElementById("status"),
    showStatus: true
  });
});
