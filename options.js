document.addEventListener("DOMContentLoaded", () => {
  const checkboxes = {
    enableGmail: document.getElementById("enableGmail"),
    enableGmailHover: document.getElementById("enableGmailHover"),
    enablePhabricator: document.getElementById("enablePhabricator"),
    enablePhabricatorPaste: document.getElementById("enablePhabricatorPaste"),
    enablePhabricatorTryLinks: document.getElementById("enablePhabricatorTryLinks"),
    enablePhabricatorTryCommentIcons: document.getElementById("enablePhabricatorTryCommentIcons"),
    enableBugzilla: document.getElementById("enableBugzilla"),
    enableTreeherder: document.getElementById("enableTreeherder"),
    enableTreeherderUnitTests: document.getElementById("enableTreeherderUnitTests")
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

});
