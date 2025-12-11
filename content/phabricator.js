// Phabricator inline video enhancer (no ES modules)

const phabRuntime = (typeof browser !== "undefined" ? browser : chrome);
const phabStorage = phabRuntime.storage;
const phabDefaultSettings = {
  enablePhabricator: true,
  enablePhabricatorPaste: true,
  enablePhabricatorTryLinks: true,
  enablePhabricatorTryCommentIcons: true
};
let phabVideoEnabled = true;
let phabPasteEnabled = true;
let phabTryLinkEnabled = true;
let phabTryCommentIconsEnabled = true;
let phabTryTooltipNode = null;
const PHAB_COMMENT_TRY_ICONS = new WeakMap();

const PHAB_VIDEO_EXTENSIONS = [".mov", ".mp4", ".webm", ".m4v"];
const PHAB_FILE_EXTENSIONS = [
  "png","jpg","jpeg","gif","bmp","svg","webp",
  "mp4","mov","m4v","avi","mkv","webm",
  "pdf","txt","md","zip","gz","tar","rar",
  "css","js","ts","html","json","xml"
];
const PHAB_TRY_LINK_PATTERN = /^https:\/\/treeherder\.mozilla\.org\/(#\/)?jobs\?/i;
const PHAB_TRY_STATUS_CACHE = new Map();
const PHAB_SUCCESS_TOOLTIP = "Passed"; // Keep in sync with src/phabricator/tryStatusTooltip.js
const PHAB_PENDING_TOOLTIP = "Loading"; // Keep in sync with src/phabricator/tryStatusTooltip.js

function phabIsVideoUrl(url) {
  const lower = url.toLowerCase();
  return PHAB_VIDEO_EXTENSIONS.some(ext => lower.includes(ext));
}

function phabFindVideoBlocks() {
  return document.querySelectorAll(".phabricator-remarkup-embed-layout-link");
}

function phabCreateVideoPlayer(src) {
  const video = document.createElement("video");
  video.src = src;
  video.controls = true;
  video.style.width = "100%";
  video.style.maxWidth = "720px";
  video.style.maxHeight = "50vh";
  video.style.marginTop = "8px";
  video.style.borderRadius = "6px";
  video.style.boxShadow = "0 2px 6px rgba(0,0,0,0.15)";
  video.style.display = "block";
  return video;
}

function phabEnhanceBlock(block) {
  if (block.dataset.videoEnhanced === "true") return;
  const downloadLink = block.querySelector(".phabricator-remarkup-embed-layout-download");
  if (!downloadLink) return;
  const url = downloadLink.href;
  if (!phabIsVideoUrl(url)) return;
  const next = block.nextElementSibling;
  if (next && next.tagName === "VIDEO") {
    block.dataset.videoEnhanced = "true";
    return;
  }
  const video = phabCreateVideoPlayer(url);
  block.insertAdjacentElement("afterend", video);
  block.dataset.videoEnhanced = "true";
}

function phabEnhanceAllVideos() {
  if (!phabVideoEnabled) return;
  const blocks = phabFindVideoBlocks();
  blocks.forEach(phabEnhanceBlock);
}

function phabIsLikelyURL(text) {
  if (!text) return false;
  const t = text.trim();
  if (/^https?:\/\/[^\"\s]+$/i.test(t)) return true;
  const match = /^[a-z0-9.-]+\.([a-z]{2,24})(\/[^\"\s]*)?$/i.exec(t);
  if (match) {
    const tld = match[1].toLowerCase();
    if (!PHAB_FILE_EXTENSIONS.includes(tld)) return true;
  }
  return false;
}

function phabSelectionOverlapsMarkdown(text, selectionStart, selectionEnd) {
  if (!text) return false;
  const regex = /\[[^\]]+\]\([^)]+\)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;
    if (selectionStart >= matchStart && selectionEnd <= matchEnd) return true;
  }
  return false;
}

function phabShouldTransformPaste(original, selectionStart, selectionEnd, selectedText, pastedText) {
  if (!selectedText || !pastedText) return false;
  if (!phabIsLikelyURL(pastedText)) return false;
  if (phabIsLikelyURL(selectedText)) return false;
  if (phabSelectionOverlapsMarkdown(original, selectionStart, selectionEnd)) return false;
  return true;
}

function phabMarkdownTransform(original, selectionStart, selectionEnd, pastedURL) {
  const before = original.slice(0, selectionStart);
  const selected = original.slice(selectionStart, selectionEnd);
  const after = original.slice(selectionEnd);
  const cleanURL = /^https?:\/\//i.test(pastedURL) ? pastedURL : `https://${pastedURL}`;
  const markdown = `[${selected}](${cleanURL})`;
  const text = before + markdown + after;
  const caret = before.length + markdown.length;
  return { text, caret };
}

function phabHandlePaste(event) {
  if (!phabPasteEnabled) return;
  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement)) return;
  if (!target.classList.contains("remarkup-assist-textarea")) return;

  const start = target.selectionStart;
  const end = target.selectionEnd;
  if (start == null || end == null || start === end) return;

  const clipboard = event.clipboardData || window.clipboardData;
  if (!clipboard) return;
  const pasted = (clipboard.getData("text/plain") || "").trim();
  const selected = target.value.slice(start, end);
  if (!phabShouldTransformPaste(target.value, start, end, selected, pasted)) return;

  event.preventDefault();
  const { text, caret } = phabMarkdownTransform(target.value, start, end, pasted);
  target.value = text;
  target.setSelectionRange(caret, caret);
  target.dispatchEvent(new Event("input", { bubbles: true }));
}

function phabAttachPasteHandlers() {
  const fields = document.querySelectorAll("textarea.remarkup-assist-textarea");
  fields.forEach((field) => {
    if (!field.dataset.phabPasteHandled) {
      field.addEventListener("paste", phabHandlePaste, true);
      field.dataset.phabPasteHandled = "true";
    }
  });
}

function phabFindDiffDetailList() {
  const containers = document.querySelectorAll(".phui-box.phui-box-border.phui-object-box");
  for (const container of containers) {
    const header = container.querySelector(".phui-header-view .phui-header-header");
    if (header && header.textContent?.trim().includes("Diff Detail")) {
      const list = container.querySelector("dl.phui-property-list-properties");
      if (list) return list;
    }
  }
  return null;
}

function phabClearTryLinkEntry(list) {
  if (!list) return;
  list.querySelectorAll("[data-phab-try-link]").forEach((node) => node.remove());
}

function phabRemoveCommentTryIcon(anchor) {
  if (!anchor) return;
  const icon = PHAB_COMMENT_TRY_ICONS.get(anchor);
  if (icon) {
    if (icon.dataset.phabTryTooltip && phabTryTooltipNode?.textContent === icon.dataset.phabTryTooltip) {
      phabHideTryTooltip();
    }
    icon.remove();
    PHAB_COMMENT_TRY_ICONS.delete(anchor);
  }
  delete anchor.dataset.phabTryCommentKey;
}

function phabApplyCommentTryStatus(anchor, statusInfo) {
  if (!anchor) return;
  const status = statusInfo?.status ?? null;
  const isPending = !status && statusInfo?.reason === "pending";
  let icon = PHAB_COMMENT_TRY_ICONS.get(anchor);
  if (!status && !isPending) {
    if (icon) {
      icon.remove();
      PHAB_COMMENT_TRY_ICONS.delete(anchor);
    }
    return;
  }
  if (!icon) {
    icon = document.createElement("span");
    icon.dataset.phabTryCommentIcon = "true";
    icon.className = "phab-try-comment-icon phui-icon-view phui-font-fa visual-only";
    icon.style.marginRight = "4px";
    icon.style.verticalAlign = "middle";
    icon.style.position = "relative";
    icon.style.top = "-0.5px";
    icon.setAttribute("aria-hidden", "true");
    if (anchor.parentNode) {
      anchor.parentNode.insertBefore(icon, anchor);
    }
    PHAB_COMMENT_TRY_ICONS.set(anchor, icon);
  }
  if (status === "success") {
    icon.className = "phab-try-comment-icon phui-icon-view phui-font-fa visual-only fa-check-circle green";
    icon.removeAttribute("title");
    icon.dataset.phabTryTooltip = PHAB_SUCCESS_TOOLTIP;
    phabAttachTooltipHandlers(icon);
  } else if (status === "failure") {
    icon.className = "phab-try-comment-icon phui-icon-view phui-font-fa visual-only fa-times-circle red";
    const tooltip = phabBuildFailedJobsTooltip(statusInfo?.failedJobs);
    if (tooltip) {
      icon.removeAttribute("title");
      icon.dataset.phabTryTooltip = tooltip;
      phabAttachTooltipHandlers(icon);
    } else {
      icon.title = "Try jobs failed";
      delete icon.dataset.phabTryTooltip;
    }
  } else if (isPending) {
    icon.className = "phab-try-comment-icon phui-icon-view phui-font-fa visual-only fa-chevron-circle-right blue";
    icon.removeAttribute("title");
    icon.dataset.phabTryTooltip = PHAB_PENDING_TOOLTIP;
    phabAttachTooltipHandlers(icon);
  } else {
    icon.removeAttribute("title");
    delete icon.dataset.phabTryTooltip;
  }
}

function phabEnsureTryTooltip() {
  if (phabTryTooltipNode && phabTryTooltipNode.isConnected) {
    return phabTryTooltipNode;
  }
  const tip = document.createElement("div");
  tip.dataset.phabTryTooltip = "true";
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
  phabTryTooltipNode = tip;
  return tip;
}

function phabHideTryTooltip() {
  if (!phabTryTooltipNode) return;
  phabTryTooltipNode.style.display = "none";
  phabTryTooltipNode.textContent = "";
}

function phabShowTryTooltip(target, text) {
  if (!target || !text) return;
  const tip = phabEnsureTryTooltip();
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

function phabAttachTooltipHandlers(icon) {
  if (!icon || icon.dataset.phabTryTooltipBound === "true") return;
  icon.addEventListener("mouseenter", () => {
    const text = icon.dataset.phabTryTooltip;
    if (text) {
      phabShowTryTooltip(icon, text);
    }
  });
  icon.addEventListener("mouseleave", () => {
    phabHideTryTooltip();
  });
  icon.addEventListener("mousedown", phabHideTryTooltip);
  icon.dataset.phabTryTooltipBound = "true";
}

window.addEventListener("scroll", phabHideTryTooltip, true);
window.addEventListener("resize", phabHideTryTooltip);
document.addEventListener("keydown", phabHideTryTooltip, true);

function phabProcessCommentTryLinks() {
  const anchors = document.querySelectorAll(".transaction-comment a[href]");
  if (!phabTryCommentIconsEnabled) {
    anchors.forEach((anchor) => phabRemoveCommentTryIcon(anchor));
    return;
  }
  anchors.forEach((anchor) => {
    if (!PHAB_TRY_LINK_PATTERN.test(anchor.href)) {
      phabRemoveCommentTryIcon(anchor);
      return;
    }
    const parsedUrl = (() => {
      try {
        return new URL(anchor.href);
      } catch (error) {
        return null;
      }
    })();
    if (!parsedUrl) {
      phabRemoveCommentTryIcon(anchor);
      return;
    }
    const { repo, revision } = phabParseTryLinkParams(parsedUrl);
    if (!repo || !revision) {
      phabRemoveCommentTryIcon(anchor);
      return;
    }
    const key = `${repo}:${revision}`;
    anchor.dataset.phabTryCommentKey = key;
    phabGetTryResult(repo, revision)
      .then((statusInfo) => {
        if (!phabTryCommentIconsEnabled) return;
        if (!anchor.isConnected || anchor.dataset.phabTryCommentKey !== key) {
          return;
        }
        phabApplyCommentTryStatus(anchor, statusInfo);
      })
      .catch(() => {});
  });
}

// Keep in sync with src/phabricator/tryStatusTooltip.js for tests.
function phabBuildFailedJobsTooltip(failedJobs) {
  if (!Array.isArray(failedJobs) || failedJobs.length === 0) {
    return null;
  }
  const MAX_ITEMS = 12;
  const lines = [];
  for (const job of failedJobs) {
    if (lines.length >= MAX_ITEMS) break;
    const parts = [];
    const name = job?.name || job?.jobSymbol || job?.groupSymbol || job?.jobId || "Job";
    const platform = job?.platform;
    const result = job?.result;
    parts.push(name);
    if (platform) {
      parts.push(`(${platform})`);
    }
    if (result) {
      parts.push(`- ${result}`);
    }
    lines.push(parts.join(" "));
  }
  if (!lines.length) {
    return null;
  }
  if (failedJobs.length > MAX_ITEMS) {
    lines.push(`…and ${failedJobs.length - MAX_ITEMS} more`);
  }
  return `Failed jobs:\n${lines.join("\n")}`;
}

function phabApplyTryStatusIcon(list, statusInfo) {
  if (!list) return;
  const dd = list.querySelector('dd[data-phab-try-link="true"]');
  if (!dd) return;
  let icon = dd.querySelector("[data-phab-try-status]");
  const status = statusInfo?.status ?? null;
  const isPending = !status && statusInfo?.reason === "pending";
  if (!status && !isPending) {
    if (icon) icon.remove();
    phabHideTryTooltip();
    return;
  }
  if (!icon) {
    icon = document.createElement("span");
    icon.dataset.phabTryStatus = "true";
    icon.style.marginRight = "6px";
    icon.setAttribute("aria-hidden", "true");
    dd.insertBefore(icon, dd.firstChild);
  }
  if (status === "success") {
    icon.className = "visual-only phui-icon-view phui-font-fa fa-check-circle green";
    icon.removeAttribute("title");
    icon.dataset.phabTryTooltip = PHAB_SUCCESS_TOOLTIP;
    phabAttachTooltipHandlers(icon);
    phabHideTryTooltip();
  } else if (status === "failure") {
    icon.className = "visual-only phui-icon-view phui-font-fa fa-times-circle red";
    const tooltip = phabBuildFailedJobsTooltip(statusInfo?.failedJobs);
    if (tooltip) {
      icon.removeAttribute("title");
      icon.dataset.phabTryTooltip = tooltip;
      phabAttachTooltipHandlers(icon);
    } else {
      icon.title = "Try jobs failed";
      delete icon.dataset.phabTryTooltip;
    }
  } else if (isPending) {
    icon.className = "visual-only phui-icon-view phui-font-fa fa-chevron-circle-right blue";
    icon.removeAttribute("title");
    icon.dataset.phabTryTooltip = PHAB_PENDING_TOOLTIP;
    phabAttachTooltipHandlers(icon);
  } else {
    icon.removeAttribute("title");
    delete icon.dataset.phabTryTooltip;
  }
}

function phabRenderTryLinkEntry(list, data) {
  phabClearTryLinkEntry(list);
  if (!list || !data) return;

  const dt = document.createElement("dt");
  dt.className = "phui-property-list-key";
  dt.dataset.phabTryLink = "true";
  dt.textContent = "Last try";

  const dd = document.createElement("dd");
  dd.className = "phui-property-list-value";
  dd.dataset.phabTryLink = "true";

  const tryAnchor = document.createElement("a");
  tryAnchor.href = data.url;
  tryAnchor.target = "_blank";
  tryAnchor.rel = "noreferrer";
  tryAnchor.textContent = "Try link";
  dd.appendChild(tryAnchor);

  if (data.commentUrl) {
    dd.appendChild(document.createTextNode(" · "));
    const commentAnchor = document.createElement("a");
    commentAnchor.href = data.commentUrl;
    commentAnchor.textContent = "Link to comment";
    dd.appendChild(commentAnchor);
  }

  list.append(dt, dd);
}

function phabParseTryLinkParams(url) {
  if (!url) return { repo: null, revision: null };
  let repo = url.searchParams.get("repo");
  let revision = url.searchParams.get("revision");
  if ((!repo || !revision) && url.hash && url.hash.includes("?")) {
    const hashQuery = url.hash.slice(url.hash.indexOf("?") + 1);
    const hashParams = new URLSearchParams(hashQuery);
    if (!repo) repo = hashParams.get("repo");
    if (!revision) revision = hashParams.get("revision");
  }
  return {
    repo: repo || null,
    revision: revision || null
  };
}

function phabFindLatestTryLinkData() {
  const timelineEvents = document.querySelectorAll(".phui-timeline-shell");
  let latest = null;
  const baseUrl = `${window.location.origin}${window.location.pathname}${window.location.search}`;

  timelineEvents.forEach((eventNode) => {
    const comment = eventNode.querySelector(".transaction-comment");
    if (!comment) return;
    const links = Array.from(comment.querySelectorAll("a[href]")).filter((anchor) =>
      PHAB_TRY_LINK_PATTERN.test(anchor.href)
    );
    if (!links.length) return;
    const tryLink = links[links.length - 1];
    const parsedUrl = (() => {
      try {
        return new URL(tryLink.href);
      } catch (error) {
        return null;
      }
    })();
    const { repo, revision } = parsedUrl ? phabParseTryLinkParams(parsedUrl) : { repo: null, revision: null };
    const anchor = eventNode.querySelector(".phabricator-anchor-view[id], .phabricator-anchor-view[name]");
    const anchorId = anchor?.id || anchor?.getAttribute("name");
    latest = {
      url: tryLink.href,
      commentUrl: anchorId ? `${baseUrl}#${anchorId}` : null,
      repo,
      revision
    };
  });

  return latest;
}

function phabGetTryResult(repo, revision) {
  if (!repo || !revision || !phabRuntime?.runtime?.sendMessage) {
    return Promise.resolve(null);
  }
  const key = `${repo}:${revision}`;
  if (PHAB_TRY_STATUS_CACHE.has(key)) {
    return PHAB_TRY_STATUS_CACHE.get(key);
  }
  console.debug("[MozHelper][Phabricator] Requesting try status", { repo, revision });
  const promise = phabRuntime.runtime
    .sendMessage({
      type: "moz-helper:getTryStatus",
      repo,
      revision
    })
    .then((response) => {
      const status = response?.status ?? null;
      console.debug("[MozHelper][Phabricator] Try status response", { repo, revision, response });
      if (!status) {
        console.debug("[MozHelper][Phabricator] Try status unresolved", {
          repo,
          revision,
          reason: response?.reason ?? "unknown",
          details: response?.details ?? null,
          summary: response?.summary ?? null
        });
      }
      return response ?? null;
    })
    .catch((error) => {
      console.warn("[MozHelper][Phabricator] Try status lookup failed", error);
      return null;
    });
  PHAB_TRY_STATUS_CACHE.set(key, promise);
  return promise;
}

function phabUpdateLatestTryLink() {
  const list = phabFindDiffDetailList();
  if (!list) return;

  if (!phabTryLinkEnabled) {
    phabClearTryLinkEntry(list);
    return;
  }

  const data = phabFindLatestTryLinkData();
  if (!data) {
    phabClearTryLinkEntry(list);
    return;
  }

  phabRenderTryLinkEntry(list, data);

  if (data.repo && data.revision) {
    phabApplyTryStatusIcon(list, null);
    phabGetTryResult(data.repo, data.revision)
      .then((statusInfo) => {
        if (!phabTryLinkEnabled) return;
        phabApplyTryStatusIcon(list, statusInfo);
      })
      .catch(() => {});
  } else {
    phabApplyTryStatusIcon(list, null);
  }
}

function phabProcessPage() {
  phabEnhanceAllVideos();
  phabAttachPasteHandlers();
  phabUpdateLatestTryLink();
  phabProcessCommentTryLinks();
}

function phabRunInitialPasses() {
  const run = () => {
    phabProcessPage();
    setTimeout(phabProcessPage, 600);
    setTimeout(phabProcessPage, 2000);
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
}

function phabInit() {
  phabStorage.sync.get(phabDefaultSettings).then((items) => {
    phabVideoEnabled = items.enablePhabricator ?? true;
    phabPasteEnabled = items.enablePhabricatorPaste ?? true;
    phabTryLinkEnabled = items.enablePhabricatorTryLinks ?? true;
    phabTryCommentIconsEnabled = items.enablePhabricatorTryCommentIcons ?? true;
    phabRunInitialPasses();
  });
  phabRuntime.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (changes.enablePhabricator) {
      phabVideoEnabled = changes.enablePhabricator.newValue;
      if (phabVideoEnabled) phabRunInitialPasses();
    }
    if (changes.enablePhabricatorPaste) {
      phabPasteEnabled = changes.enablePhabricatorPaste.newValue;
      phabRunInitialPasses();
    }
    if (changes.enablePhabricatorTryLinks) {
      phabTryLinkEnabled = changes.enablePhabricatorTryLinks.newValue;
      phabRunInitialPasses();
    }
    if (changes.enablePhabricatorTryCommentIcons) {
      phabTryCommentIconsEnabled = changes.enablePhabricatorTryCommentIcons.newValue;
      phabProcessCommentTryLinks();
    }
  });
}

phabInit();
