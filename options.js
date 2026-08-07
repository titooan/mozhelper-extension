document.addEventListener("DOMContentLoaded", () => {
  const checkboxes = {
    enableGmail: document.getElementById("enableGmail"),
    enableGmailHover: document.getElementById("enableGmailHover"),
    enablePhabricator: document.getElementById("enablePhabricator"),
    enablePhabricatorPaste: document.getElementById("enablePhabricatorPaste"),
    enablePhabricatorTryLinks: document.getElementById("enablePhabricatorTryLinks"),
    enablePhabricatorTryCommentIcons: document.getElementById("enablePhabricatorTryCommentIcons"),
    enablePhabricatorApkChips: document.getElementById("enablePhabricatorApkChips"),
    enablePhabricatorUnsubmittedIndicator: document.getElementById("enablePhabricatorUnsubmittedIndicator"),
    enablePhabricatorFileNotAttachedNotice: document.getElementById("enablePhabricatorFileNotAttachedNotice"),
    enableBugzilla: document.getElementById("enableBugzilla"),
    enableBugzillaContextMenu: document.getElementById("enableBugzillaContextMenu"),
    enableBugzillaCopyIdButton: document.getElementById("enableBugzillaCopyIdButton"),
    enableGithubTryStatusIcons: document.getElementById("enableGithubTryStatusIcons"),
    enableTreeherder: document.getElementById("enableTreeherder"),
    enableTreeherderUnitTests: document.getElementById("enableTreeherderUnitTests"),
    enableTreeherderMacrobenchmarkTable: document.getElementById("enableTreeherderMacrobenchmarkTable")
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

});
