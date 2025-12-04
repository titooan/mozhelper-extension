const runtime = typeof browser !== "undefined" ? browser : chrome;

document.addEventListener("DOMContentLoaded", () => {
  const checkboxes = {
    enableGmail: document.getElementById("popupEnableGmail"),
    enableGmailHover: document.getElementById("popupEnableGmailHover"),
    enablePhabricator: document.getElementById("popupEnablePhabricator"),
    enablePhabricatorPaste: document.getElementById("popupEnablePhabricatorPaste"),
    enableBugzilla: document.getElementById("popupEnableBugzilla"),
    enableTreeherder: document.getElementById("popupEnableTreeherder"),
    enableTreeherderUnitTests: document.getElementById("popupEnableTreeherderUnitTests")
  };

  MozHelperSettings.initToggles({
    checkboxes,
    statusElement: document.getElementById("status"),
    showStatus: true
  });

  MozHelperSettings.bindDependentToggle({
    parent: checkboxes.enableGmail,
    child: checkboxes.enableGmailHover
  });

  document.getElementById("openOptions").addEventListener("click", () => {
    if (runtime.runtime?.openOptionsPage) {
      runtime.runtime.openOptionsPage();
    } else {
      window.open("options.html", "_blank");
    }
  });
});
