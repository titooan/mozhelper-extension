const githubRuntime = (typeof browser !== "undefined" ? browser : chrome);
const githubStorage = githubRuntime.storage;
const githubDefaultSettings = {
  enableGithubTryStatusIcons: true
};
const GITHUB_TRY_LINK_PATTERN = /^https:\/\/treeherder\.mozilla\.org\/(#\/)?jobs\?/i;
const GITHUB_TRY_STATUS_CACHE = new Map();
const GITHUB_TRY_ICONS = new WeakMap();
const GITHUB_SUCCESS_TOOLTIP = "Passed";
const GITHUB_PENDING_TOOLTIP = "Loading";
let githubTryStatusIconsEnabled = true;
let githubTryStatusObserver = null;
let githubTryTooltipNode = null;

function githubParseTryLinkParams(url) {
  if (!url) return { repo: null, revision: null, landoCommitId: null, landoInstance: null };
  let repo = url.searchParams.get("repo");
  let revision = url.searchParams.get("revision");
  let landoCommitId = url.searchParams.get("landoCommitID") || url.searchParams.get("lando_commit_id");
  let landoInstance = url.searchParams.get("landoInstance") || url.searchParams.get("lando_instance");
  if ((!repo || !revision || !landoCommitId || !landoInstance) && url.hash && url.hash.includes("?")) {
    const hashQuery = url.hash.slice(url.hash.indexOf("?") + 1);
    const hashParams = new URLSearchParams(hashQuery);
    if (!repo) repo = hashParams.get("repo");
    if (!revision) revision = hashParams.get("revision");
    if (!landoCommitId) landoCommitId = hashParams.get("landoCommitID") || hashParams.get("lando_commit_id");
    if (!landoInstance) landoInstance = hashParams.get("landoInstance") || hashParams.get("lando_instance");
  }
  if (!landoCommitId) {
    const fragMatch = /landoCommitID=(\d+)/i.exec(url.href);
    if (fragMatch) {
      landoCommitId = fragMatch[1];
    }
  }
  if (!landoInstance) {
    const instanceMatch = /(?:[?&#]|^)landoInstance=([^&#]+)/i.exec(url.href);
    if (instanceMatch) {
      landoInstance = decodeURIComponent(instanceMatch[1].replace(/\+/g, " "));
    }
  }
  return {
    repo: repo || null,
    revision: revision || null,
    landoCommitId: landoCommitId || null,
    landoInstance: landoInstance || null
  };
}

function githubBuildFailedJobsTooltip(failedJobs) {
  if (!Array.isArray(failedJobs) || failedJobs.length === 0) {
    return null;
  }
  const maxSummary = 5;
  const lines = [];
  const seenNames = new Set();
  for (const job of failedJobs) {
    if (lines.length >= maxSummary) break;
    const parts = [];
    const name = job?.name || job?.jobSymbol || job?.groupSymbol || job?.jobId || "Job";
    const nameKey = name.toLowerCase();
    if (seenNames.has(nameKey)) continue;
    seenNames.add(nameKey);
    const platform = job?.platform;
    const result = job?.result;
    parts.push(name);
    if (platform) parts.push(`(${platform})`);
    if (result) parts.push(`- ${result}`);
    lines.push(parts.join(" "));
  }
  const summaryLine = `Failed jobs: ${failedJobs.length}`;
  if (failedJobs.length <= maxSummary && lines.length) {
    return `${summaryLine}\n${lines.join("\n")}`;
  }
  return summaryLine;
}

function githubEnsureTryTooltip() {
  if (githubTryTooltipNode && githubTryTooltipNode.isConnected) {
    return githubTryTooltipNode;
  }
  const tip = document.createElement("div");
  tip.dataset.githubTryTooltip = "true";
  tip.style.position = "fixed";
  tip.style.zIndex = "2147483000";
  tip.style.background = "#111827";
  tip.style.color = "white";
  tip.style.padding = "8px 10px";
  tip.style.borderRadius = "6px";
  tip.style.boxShadow = "0 8px 16px rgba(0,0,0,0.25)";
  tip.style.fontSize = "12px";
  tip.style.lineHeight = "16px";
  tip.style.maxWidth = "320px";
  tip.style.pointerEvents = "none";
  tip.style.whiteSpace = "pre-line";
  tip.style.display = "none";
  document.body.appendChild(tip);
  githubTryTooltipNode = tip;
  return tip;
}

function githubHideTryTooltip() {
  if (!githubTryTooltipNode) return;
  githubTryTooltipNode.style.display = "none";
  githubTryTooltipNode.textContent = "";
}

function githubShowTryTooltip(target, text) {
  if (!target || !text) return;
  const tip = githubEnsureTryTooltip();
  tip.textContent = text;
  tip.style.display = "block";
  requestAnimationFrame(() => {
    const rect = target.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    const margin = 8;
    let left = rect.left + (rect.width - tipRect.width) / 2;
    if (left < margin) left = margin;
    const maxLeft = window.innerWidth - tipRect.width - margin;
    if (left > maxLeft) left = maxLeft;
    let top = rect.bottom + margin;
    const maxTop = window.innerHeight - tipRect.height - margin;
    if (top > maxTop) {
      top = rect.top - tipRect.height - margin;
      if (top < margin) top = margin;
    }
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
  });
}

function githubAttachTooltipHandlers(icon) {
  if (!icon || icon.dataset.githubTryTooltipBound === "true") return;
  icon.addEventListener("mouseenter", () => {
    const text = icon.dataset.githubTryTooltip;
    if (text) {
      githubShowTryTooltip(icon, text);
    }
  });
  icon.addEventListener("mouseleave", githubHideTryTooltip);
  icon.addEventListener("mousedown", githubHideTryTooltip);
  icon.dataset.githubTryTooltipBound = "true";
}

function githubApplyIconStyle(icon, status, tooltip) {
  icon.className = "mozhelper-github-try-icon";
  icon.style.display = "inline-flex";
  icon.style.alignItems = "center";
  icon.style.justifyContent = "center";
  icon.style.width = "14px";
  icon.style.height = "14px";
  icon.style.marginRight = "4px";
  icon.style.borderRadius = "50%";
  icon.style.color = "#fff";
  icon.style.fontSize = "10px";
  icon.style.fontWeight = "700";
  icon.style.lineHeight = "14px";
  icon.style.verticalAlign = "-1px";
  icon.setAttribute("aria-hidden", "true");
  if (status === "success") {
    icon.textContent = "✓";
    icon.style.background = "#1a7f37";
  } else if (status === "failure") {
    icon.textContent = "!";
    icon.style.background = "#cf222e";
  } else {
    icon.textContent = "…";
    icon.style.background = "#0969da";
  }
  icon.removeAttribute("title");
  if (tooltip) {
    icon.dataset.githubTryTooltip = tooltip;
    githubAttachTooltipHandlers(icon);
  } else {
    delete icon.dataset.githubTryTooltip;
  }
}

function githubRemoveTryIcon(anchor) {
  if (!anchor) return;
  let icon = GITHUB_TRY_ICONS.get(anchor);
  if (!icon) {
    const prev = anchor.previousElementSibling;
    if (prev && prev.dataset?.githubTryIcon === "true") {
      icon = prev;
    }
  }
  if (icon) {
    if (icon.dataset.githubTryTooltip && githubTryTooltipNode?.textContent === icon.dataset.githubTryTooltip) {
      githubHideTryTooltip();
    }
    icon.remove();
    GITHUB_TRY_ICONS.delete(anchor);
  }
  delete anchor.dataset.githubTryKey;
}

function githubApplyTryStatus(anchor, statusInfo) {
  if (!anchor) return;
  const status = statusInfo?.status ?? null;
  const isPending = !status && statusInfo?.reason === "pending";
  let icon = GITHUB_TRY_ICONS.get(anchor);
  if (!icon) {
    const prev = anchor.previousElementSibling;
    if (prev && prev.dataset?.githubTryIcon === "true") {
      icon = prev;
      GITHUB_TRY_ICONS.set(anchor, icon);
    }
  }
  if (!status && !isPending) {
    if (icon) {
      icon.remove();
      GITHUB_TRY_ICONS.delete(anchor);
    }
    return;
  }
  if (!icon) {
    icon = document.createElement("span");
    icon.dataset.githubTryIcon = "true";
    if (anchor.parentNode) {
      anchor.parentNode.insertBefore(icon, anchor);
    }
    GITHUB_TRY_ICONS.set(anchor, icon);
  }
  if (status === "success") {
    githubApplyIconStyle(icon, "success", GITHUB_SUCCESS_TOOLTIP);
  } else if (status === "failure") {
    githubApplyIconStyle(icon, "failure", githubBuildFailedJobsTooltip(statusInfo?.failedJobs) || "Try jobs failed");
  } else {
    githubApplyIconStyle(icon, "pending", GITHUB_PENDING_TOOLTIP);
  }
}

function githubGetTryResult(repo, revision, landoCommitId, landoInstance) {
  if (!repo || (!revision && !landoCommitId) || !githubRuntime?.runtime?.sendMessage) {
    return Promise.resolve(null);
  }
  const key = `${repo}:${revision || `lando:${landoInstance || "default"}:${landoCommitId}`}`;
  if (GITHUB_TRY_STATUS_CACHE.has(key)) {
    return GITHUB_TRY_STATUS_CACHE.get(key);
  }
  const promise = githubRuntime.runtime
    .sendMessage({
      type: "moz-helper:getTryStatus",
      repo,
      revision,
      landoCommitId,
      landoInstance
    })
    .then((response) => response ?? null)
    .catch((error) => {
      console.warn("[MozHelper][GitHub] Try status lookup failed", error);
      return null;
    });
  GITHUB_TRY_STATUS_CACHE.set(key, promise);
  return promise;
}

function githubFindTryLinkAnchors(root = document) {
  const anchors = [];
  if (root.matches?.("a[href]")) {
    anchors.push(root);
  }
  root.querySelectorAll?.("a[href]").forEach((anchor) => anchors.push(anchor));
  return anchors.filter((anchor) => {
    if (anchor.dataset?.githubTryIcon === "true") return false;
    return GITHUB_TRY_LINK_PATTERN.test(anchor.href);
  });
}

function githubProcessTryLinks(root = document) {
  const anchors = githubFindTryLinkAnchors(root);
  if (!githubTryStatusIconsEnabled) {
    document.querySelectorAll("a[data-github-try-key]").forEach((anchor) => githubRemoveTryIcon(anchor));
    anchors.forEach((anchor) => githubRemoveTryIcon(anchor));
    return;
  }
  anchors.forEach((anchor) => {
    const parsedUrl = (() => {
      try {
        return new URL(anchor.href);
      } catch (error) {
        return null;
      }
    })();
    if (!parsedUrl) {
      githubRemoveTryIcon(anchor);
      return;
    }
    const { repo, revision, landoCommitId, landoInstance } = githubParseTryLinkParams(parsedUrl);
    if (!repo || (!revision && !landoCommitId)) {
      githubRemoveTryIcon(anchor);
      return;
    }
    const key = `${repo}:${revision || `lando:${landoInstance || "default"}:${landoCommitId}`}`;
    const existingIcon = GITHUB_TRY_ICONS.get(anchor) || anchor.previousElementSibling;
    if (anchor.dataset.githubTryKey === key && existingIcon?.dataset?.githubTryIcon === "true") {
      return;
    }
    anchor.dataset.githubTryKey = key;
    githubApplyTryStatus(anchor, { status: null, reason: "pending" });
    githubGetTryResult(repo, revision, landoCommitId, landoInstance)
      .then((statusInfo) => {
        if (!githubTryStatusIconsEnabled) return;
        if (!anchor.isConnected || anchor.dataset.githubTryKey !== key) {
          return;
        }
        githubApplyTryStatus(anchor, statusInfo);
      })
      .catch(() => {});
  });
}

function githubEnsureObserver() {
  if (githubTryStatusObserver || !document.body) return;
  githubTryStatusObserver = new MutationObserver((mutations) => {
    if (!githubTryStatusIconsEnabled) return;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          githubProcessTryLinks(node);
        }
      }
    }
  });
  githubTryStatusObserver.observe(document.body, { childList: true, subtree: true });
}

function githubInit() {
  githubStorage.sync.get(githubDefaultSettings).then((items) => {
    githubTryStatusIconsEnabled = items.enableGithubTryStatusIcons ?? true;
    githubEnsureObserver();
    githubProcessTryLinks();
  });

  githubRuntime.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes.enableGithubTryStatusIcons) return;
    githubTryStatusIconsEnabled = changes.enableGithubTryStatusIcons.newValue;
    if (githubTryStatusIconsEnabled) {
      githubEnsureObserver();
      githubProcessTryLinks();
    } else {
      githubProcessTryLinks();
      githubHideTryTooltip();
    }
  });
}

window.addEventListener("scroll", githubHideTryTooltip, true);
window.addEventListener("resize", githubHideTryTooltip);
document.addEventListener("keydown", githubHideTryTooltip, true);

if (typeof globalThis !== "undefined" && typeof globalThis.__mozHelperExposeGithubForTests === "function") {
  globalThis.__mozHelperExposeGithubForTests({
    githubParseTryLinkParams,
    githubBuildFailedJobsTooltip,
    githubProcessTryLinks,
    githubApplyTryStatus,
    githubRemoveTryIcon,
    githubSetTryStatusIconsEnabled(value) {
      githubTryStatusIconsEnabled = Boolean(value);
    },
    githubClearTryStatusCache() {
      GITHUB_TRY_STATUS_CACHE.clear();
    }
  });
}

githubInit();
