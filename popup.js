const runtime = typeof browser !== "undefined" ? browser : chrome;

document.addEventListener("DOMContentLoaded", () => {
  const checkboxes = {
    enableGmail: document.getElementById("popupEnableGmail"),
    enableGmailHover: document.getElementById("popupEnableGmailHover"),
    enablePhabricator: document.getElementById("popupEnablePhabricator"),
    enablePhabricatorPaste: document.getElementById("popupEnablePhabricatorPaste"),
    enablePhabricatorTryLinks: document.getElementById("popupEnablePhabricatorTryLinks"),
    enablePhabricatorTryCommentIcons: document.getElementById("popupEnablePhabricatorTryCommentIcons"),
    enablePhabricatorFileNotAttachedNotice: document.getElementById("popupEnablePhabricatorFileNotAttachedNotice"),
    enableBugzilla: document.getElementById("popupEnableBugzilla"),
    enableTreeherder: document.getElementById("popupEnableTreeherder"),
    enableTreeherderUnitTests: document.getElementById("popupEnableTreeherderUnitTests"),
    enableTreeherderMacrobenchmarkTable: document.getElementById("popupEnableTreeherderMacrobenchmarkTable")
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
  MozHelperSettings.bindDependentToggle({
    parent: checkboxes.enableTreeherder,
    child: checkboxes.enableTreeherderUnitTests
  });
  MozHelperSettings.bindDependentToggle({
    parent: checkboxes.enableTreeherder,
    child: checkboxes.enableTreeherderMacrobenchmarkTable
  });

  document.getElementById("openOptions").addEventListener("click", () => {
    if (runtime.runtime?.openOptionsPage) {
      runtime.runtime.openOptionsPage();
    } else {
      window.open("options.html", "_blank");
    }
  });
});
