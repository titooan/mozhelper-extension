const runtime = typeof browser !== "undefined" ? browser : chrome;
const GITHUB_ORIGIN_PERMISSION = "https://github.com/*";

function isGithubPullRequestUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.hostname === "github.com" && /^\/[^/]+\/[^/]+\/pull\/\d+(?:\/|$)/.test(parsed.pathname);
  } catch (error) {
    return false;
  }
}

async function getActiveTab() {
  if (!runtime.tabs?.query) return null;
  const tabs = await runtime.tabs.query({ active: true, currentWindow: true });
  return tabs?.[0] || null;
}

async function hasGithubPermission() {
  if (!runtime.permissions?.contains) return true;
  return runtime.permissions.contains({ origins: [GITHUB_ORIGIN_PERMISSION] });
}

async function updateGithubPermissionPrompt(prompt, button, statusElement) {
  if (!prompt || !button) return;
  const tab = await getActiveTab();
  const shouldShow = isGithubPullRequestUrl(tab?.url) && !(await hasGithubPermission());
  prompt.style.display = shouldShow ? "block" : "none";
  button.disabled = !shouldShow;
  button.onclick = async () => {
    if (!runtime.permissions?.request) return;
    const granted = await runtime.permissions.request({ origins: [GITHUB_ORIGIN_PERMISSION] });
    if (!granted) {
      if (statusElement) statusElement.textContent = "GitHub access was not granted.";
      return;
    }
    prompt.style.display = "none";
    button.disabled = true;
    if (statusElement) statusElement.textContent = "GitHub access granted. Reloading PR.";
    if (tab?.id != null && runtime.tabs?.reload) {
      await runtime.tabs.reload(tab.id);
    }
  };
}

document.addEventListener("DOMContentLoaded", () => {
  const checkboxes = {
    enableGmail: document.getElementById("popupEnableGmail"),
    enableGmailHover: document.getElementById("popupEnableGmailHover"),
    enablePhabricator: document.getElementById("popupEnablePhabricator"),
    enablePhabricatorPaste: document.getElementById("popupEnablePhabricatorPaste"),
    enablePhabricatorTryLinks: document.getElementById("popupEnablePhabricatorTryLinks"),
    enablePhabricatorTryCommentIcons: document.getElementById("popupEnablePhabricatorTryCommentIcons"),
    enablePhabricatorUnsubmittedIndicator: document.getElementById("popupEnablePhabricatorUnsubmittedIndicator"),
    enablePhabricatorFileNotAttachedNotice: document.getElementById("popupEnablePhabricatorFileNotAttachedNotice"),
    enableBugzilla: document.getElementById("popupEnableBugzilla"),
    enableGithubTryStatusIcons: document.getElementById("popupEnableGithubTryStatusIcons"),
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

  updateGithubPermissionPrompt(
    document.getElementById("githubPermissionPrompt"),
    document.getElementById("grantGithubPermission"),
    document.getElementById("status")
  ).catch(() => {});
});

if (typeof globalThis !== "undefined" && typeof globalThis.__mozHelperExposePopupForTests === "function") {
  globalThis.__mozHelperExposePopupForTests({
    isGithubPullRequestUrl,
    updateGithubPermissionPrompt
  });
}
