const runtime = typeof browser !== "undefined" ? browser : chrome;

document.addEventListener("DOMContentLoaded", () => {
  const checkboxes = {
    enableGmail: document.getElementById("popupEnableGmail"),
    enablePhabricator: document.getElementById("popupEnablePhabricator"),
    enableBugzilla: document.getElementById("popupEnableBugzilla"),
    enableTreeherder: document.getElementById("popupEnableTreeherder")
  };

  MozHelperSettings.initToggles({
    checkboxes,
    statusElement: document.getElementById("status"),
    showStatus: true
  });

  document.getElementById("openOptions").addEventListener("click", () => {
    if (runtime.runtime?.openOptionsPage) {
      runtime.runtime.openOptionsPage();
    } else {
      window.open("options.html", "_blank");
    }
  });
});
