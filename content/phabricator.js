// Phabricator inline video enhancer (no ES modules)

const phabRuntime = (typeof browser !== "undefined" ? browser : chrome);
const phabStorage = phabRuntime.storage;
const phabDefaultSettings = {
  enablePhabricator: true,
  enablePhabricatorPaste: true,
  enablePhabricatorTryLinks: true,
  enablePhabricatorTryCommentIcons: true,
  enablePhabricatorUnsubmittedIndicator: true,
  enablePhabricatorFileNotAttachedNotice: true
};
let phabVideoEnabled = true;
let phabPasteEnabled = true;
let phabTryLinkEnabled = true;
let phabTryCommentIconsEnabled = true;
let phabUnsubmittedIndicatorEnabled = true;
let phabFileNotAttachedEnabled = true;
let phabPasteListenerAttached = false;
let phabPasteListenerDocument = null;
let phabTryTooltipNode = null;
let phabFileNotAttachedNotice = null;
let phabFileNotAttachedDismissed = false;
let phabUnsubmittedIndicatorObserver = null;
let phabUnsubmittedIndicatorPending = false;
let phabUnsubmittedFloatingButton = null;
let phabLastKnownUnsubmittedCountText = null;
let phabLastUnsubmittedDebugSignature = null;
let phabOriginalFaviconHref = null;
let phabUnsubmittedViewportListenersBound = false;
let phabUnsubmittedInputListenerBound = false;
let phabUnsubmittedUpdateSequence = 0;
let phabUnsubmittedPendingReason = null;
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
const PHAB_UNSUBMITTED_FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='30' fill='%23dc2626'/%3E%3C/svg%3E";
const PHAB_UNSUBMITTED_FAVICON_PATH = "icons/phabricator-favicon-red.png";

function phabIsDifferentialRevisionPage() {
  const path = window.location?.pathname || "";
  return /^\/D\d+(?:\/|$)/.test(path);
}

function phabFindFaviconLink() {
  return (
    document.querySelector("link#favicon") ||
    document.querySelector("link[rel~='icon']") ||
    null
  );
}

function phabGetMainCommentTextarea() {
  return document.querySelector("textarea[name='comment']");
}

function phabGetDiffBannerStatus() {
  const banner = document.getElementById("diff-banner") || document.querySelector(".diff-banner");
  const hasUnsaved = Boolean(banner?.classList?.contains("diff-banner-has-unsaved"));
  const hasUnsubmitted = Boolean(banner?.classList?.contains("diff-banner-has-unsubmitted"));
  return {
    bannerPresent: Boolean(banner),
    hasUnsaved,
    hasUnsubmitted,
    hasReviewStatus: hasUnsaved || hasUnsubmitted
  };
}

function phabIsElementActuallyVisible(node) {
  if (!node || !node.isConnected || node.hidden) return false;
  let current = node;
  while (current && current !== document.documentElement) {
    if (current.hidden) return false;
    const style = window.getComputedStyle?.(current);
    if (style && (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse")) {
      return false;
    }
    current = current.parentElement;
  }
  return true;
}

function phabGetDraftDedupKey(node) {
  if (!node) return null;
  const keyAttrs = [
    "data-inline-comment-id",
    "data-comment-id",
    "data-commentid",
    "data-draft-id",
    "data-id",
    "data-phid"
  ];
  const containers = [node, node.closest("[data-inline-comment-id],[data-comment-id],[data-commentid],[data-draft-id],[data-id],[data-phid]")];
  for (const container of containers) {
    if (!container) continue;
    for (const attr of keyAttrs) {
      const value = container.getAttribute?.(attr);
      if (value) return `${attr}:${value}`;
    }
  }

  const parseHash = (href) => {
    if (!href) return null;
    const hashIdx = href.indexOf("#");
    if (hashIdx === -1 || hashIdx === href.length - 1) return null;
    return href.slice(hashIdx + 1).trim() || null;
  };
  const anchor =
    node.querySelector?.("a[href*='#']") ||
    node.closest?.("a[href*='#']") ||
    null;
  if (anchor) {
    const href = anchor.getAttribute("href") || "";
    const hash = parseHash(href);
    if (hash) return `hash:${hash}`;
    if (href) return `href:${href}`;
  }
  return null;
}

function phabCountVisibleInlineDrafts() {
  const visibleDraftNodes = Array.from(document.querySelectorAll(".inline-state-is-draft")).filter((node) =>
    phabIsElementActuallyVisible(node)
  );
  const inlineElementNodes = visibleDraftNodes.filter(
    (node) => !node.classList?.contains("inline-comment-preview")
  );
  const nodesForCount = inlineElementNodes.length ? inlineElementNodes : visibleDraftNodes;
  const uniqueKeys = new Set();
  const draftSamples = [];
  let fallbackCount = 0;
  nodesForCount.forEach((node) => {
    const key = phabGetDraftDedupKey(node);
    if (draftSamples.length < 25) {
      draftSamples.push({
        key: key || null,
        text: (node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
        className: node.className || "",
        parentClassName: node.parentElement?.className || ""
      });
    }
    if (!key) {
      fallbackCount += 1;
      return;
    }
    uniqueKeys.add(key);
  });
  return {
    totalVisible: visibleDraftNodes.length,
    countedVisible: nodesForCount.length,
    uniqueVisible: uniqueKeys.size + fallbackCount,
    dedupKeySample: Array.from(uniqueKeys).slice(0, 25),
    draftSamples
  };
}

function phabGetNativeUnsubmittedButtonCandidates() {
  const reviewStatusPattern = /(?:^|\s)(\d+)\s+(?:Unsubmitted|Unsaved)\b/i;
  return Array.from(document.querySelectorAll("a, button")).filter((node) => {
    if (!node || node.dataset?.phabFloatingUnsubmitted === "true") return false;
    const text = (node.textContent || "").replace(/\s+/g, " ").trim();
    return reviewStatusPattern.test(text);
  });
}

function phabFindNativeVisibleUnsubmittedButton() {
  const candidates = phabGetNativeUnsubmittedButtonCandidates();
  return candidates.find((node) => phabIsElementActuallyVisible(node)) || null;
}

function phabIsElementInViewport(node) {
  if (!node || !node.getBoundingClientRect) return true;
  const rect = node.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
  const hasLayoutInfo =
    viewportWidth > 0 &&
    viewportHeight > 0 &&
    (
      rect.width > 0 ||
      rect.height > 0 ||
      rect.top !== 0 ||
      rect.right !== 0 ||
      rect.bottom !== 0 ||
      rect.left !== 0
    );
  if (!hasLayoutInfo) return true;
  return rect.bottom > 0 && rect.right > 0 && rect.top < viewportHeight && rect.left < viewportWidth;
}

function phabFindNativeReviewStatusButtonVisibleInViewport() {
  const candidates = phabGetNativeUnsubmittedButtonCandidates();
  return (
    candidates.find((node) => phabIsElementActuallyVisible(node) && phabIsElementInViewport(node)) ||
    null
  );
}

function phabApplyNativeUnsubmittedButtonStyle() {
  const candidates = phabGetNativeUnsubmittedButtonCandidates();
  candidates.forEach((node) => {
    if (!node || !(node instanceof HTMLElement)) return;
    const text = (node.textContent || "").replace(/\s+/g, " ").trim();
    if (!/(?:^|\s)(\d+)\s+(?:Unsubmitted|Unsaved)\b/i.test(text)) return;
    node.style.border = "1px solid #ff4d4d";
    node.style.boxShadow = "0 0 0 1px rgba(255,60,60,0.35), 0 0 10px rgba(255,20,20,0.45)";
  });
}

function phabExtractReviewStatusCountsFromText(text) {
  if (!text) return null;
  const normalized = text.replace(/\s+/g, " ").trim();
  const matches = normalized.matchAll(/(?:^|\s)(\d+)\s+(Unsubmitted|Unsaved)\b/gi);
  let unsaved = 0;
  let unsubmitted = 0;
  let found = false;
  for (const match of matches) {
    const count = Number.parseInt(match[1], 10);
    const kind = (match[2] || "").toLowerCase();
    if (!Number.isFinite(count) || count < 0) continue;
    found = true;
    if (kind === "unsaved") {
      unsaved += count;
    } else if (kind === "unsubmitted") {
      unsubmitted += count;
    }
  }
  if (!found) return null;
  return {
    unsaved,
    unsubmitted,
    total: unsaved + unsubmitted
  };
}

function phabGetUnsubmittedState() {
  const bannerStatus = phabGetDiffBannerStatus();
  const candidates = phabGetNativeUnsubmittedButtonCandidates();
  const nativeVisibleTotals = [];
  const nativeAnyTotals = [];
  const nativeAnyUnsavedCounts = [];
  const nativeAnyUnsubmittedCounts = [];
  const nativeVisibleUnsavedCounts = [];
  const nativeVisibleUnsubmittedCounts = [];
  const candidateSummaries = [];
  candidates.forEach((node) => {
    const counts = phabExtractReviewStatusCountsFromText(node.textContent || "");
    if (!counts || !Number.isFinite(counts.total)) return;
    const text = (node.textContent || "").replace(/\s+/g, " ").trim();
    const isVisible = phabIsElementActuallyVisible(node);
    const inViewport = isVisible ? phabIsElementInViewport(node) : false;
    candidateSummaries.push({
      tag: node.tagName?.toLowerCase() || null,
      id: node.id || null,
      className: node.className || "",
      text,
      hidden: Boolean(node.hidden),
      inlineStyleDisplay: node.style?.display || "",
      inlineStyleVisibility: node.style?.visibility || "",
      isVisible,
      inViewport,
      counts
    });
    nativeAnyTotals.push(counts.total);
    nativeAnyUnsavedCounts.push(counts.unsaved);
    nativeAnyUnsubmittedCounts.push(counts.unsubmitted);
    if (isVisible) {
      nativeVisibleTotals.push(counts.total);
      nativeVisibleUnsavedCounts.push(counts.unsaved);
      nativeVisibleUnsubmittedCounts.push(counts.unsubmitted);
    }
  });

  const inlineDraftCounts = phabCountVisibleInlineDrafts();
  const inlineDraftVisibleCount = inlineDraftCounts.uniqueVisible;
  const inlineDraftVisibleRawCount = inlineDraftCounts.totalVisible;
  const inlineDraftVisibleCountedRawCount = inlineDraftCounts.countedVisible;
  const inlineEditorVisibleCount = Array.from(
    document.querySelectorAll(".differential-inline-comment-edit")
  ).filter((node) => phabIsElementActuallyVisible(node)).length;
  const activeCommentTextareaCount = Array.from(
    document.querySelectorAll("textarea.remarkup-assist-textarea, textarea[name='comment']")
  ).filter((node) => phabIsElementActuallyVisible(node) && (node.value || "").trim() !== "").length;
  const mainCommentValue = phabGetMainCommentTextarea()?.value || "";
  const hasMainComment = mainCommentValue.trim() !== "";
  const unsubmittedSignal = bannerStatus.hasUnsubmitted
    ? Math.max(inlineDraftVisibleCount, hasMainComment ? 1 : 0)
    : 0;
  const unsavedSignal = bannerStatus.hasUnsaved
    ? Math.max(inlineEditorVisibleCount, activeCommentTextareaCount)
    : 0;
  const fallbackUnsavedSignal = Math.max(
    inlineEditorVisibleCount,
    activeCommentTextareaCount,
    hasMainComment ? 1 : 0
  );
  const fallbackSignal = inlineDraftVisibleCount + fallbackUnsavedSignal;
  const nativeVisibleCount = nativeVisibleTotals.length ? nativeVisibleTotals.reduce((a, b) => a + b, 0) : null;
  const nativeAnyCount = nativeAnyTotals.length ? nativeAnyTotals.reduce((a, b) => a + b, 0) : null;
  const nativeAnyUnsavedCount = nativeAnyUnsavedCounts.length
    ? nativeAnyUnsavedCounts.reduce((a, b) => a + b, 0)
    : 0;
  const nativeAnyUnsubmittedCount = nativeAnyUnsubmittedCounts.length
    ? nativeAnyUnsubmittedCounts.reduce((a, b) => a + b, 0)
    : 0;
  const nativeVisibleUnsavedCount = nativeVisibleUnsavedCounts.length
    ? nativeVisibleUnsavedCounts.reduce((a, b) => a + b, 0)
    : 0;
  const nativeVisibleUnsubmittedCount = nativeVisibleUnsubmittedCounts.length
    ? nativeVisibleUnsubmittedCounts.reduce((a, b) => a + b, 0)
    : 0;
  const noBannerSignalCount = nativeAnyCount != null
    ? (fallbackSignal > 0 ? Math.min(nativeAnyCount, fallbackSignal) : 0)
    : fallbackSignal;
  const heuristicCount = bannerStatus.hasReviewStatus
    ? Math.max(unsubmittedSignal + unsavedSignal, (bannerStatus.hasUnsubmitted || bannerStatus.hasUnsaved) ? 1 : 0)
    : noBannerSignalCount;
  const heuristicHasUnsubmitted = heuristicCount > 0;

  let hasUnsubmitted = false;
  let countText = null;
  let selectedSource = "none";
  let selectedCount = 0;
  if (nativeVisibleCount != null) {
    hasUnsubmitted = nativeVisibleCount > 0;
    selectedSource = "native-visible";
    selectedCount = nativeVisibleCount;
    if (hasUnsubmitted) {
      countText = `${nativeVisibleCount} Unsubmitted`;
      phabLastKnownUnsubmittedCountText = countText;
    }
  } else if (bannerStatus.hasReviewStatus && nativeAnyCount != null) {
    const nativeBannerCount =
      (bannerStatus.hasUnsaved ? nativeAnyUnsavedCount : 0) +
      (bannerStatus.hasUnsubmitted ? nativeAnyUnsubmittedCount : 0);
    const combinedCount = heuristicHasUnsubmitted
      ? Math.max(nativeBannerCount, heuristicCount)
      : nativeBannerCount;
    hasUnsubmitted = combinedCount > 0;
    selectedSource = "native-hidden-banner-aware";
    selectedCount = combinedCount;
    if (hasUnsubmitted) {
      countText = `${combinedCount} Unsubmitted`;
      phabLastKnownUnsubmittedCountText = countText;
    }
  } else if (heuristicHasUnsubmitted) {
    hasUnsubmitted = true;
    countText = `${Math.max(heuristicCount, 1)} Unsubmitted`;
    phabLastKnownUnsubmittedCountText = countText;
    selectedSource = "heuristic";
    selectedCount = heuristicCount;
  }

  const diagnostics = {
    hasUnsubmitted,
    countText,
    selectedSource,
    selectedCount,
    nativeVisibleCount,
    nativeAnyCount,
    nativeAnyUnsavedCount,
    nativeAnyUnsubmittedCount,
    nativeVisibleUnsavedCount,
    nativeVisibleUnsubmittedCount,
    nativeCandidateCount: candidates.length,
    bannerPresent: bannerStatus.bannerPresent,
    bannerHasUnsaved: bannerStatus.hasUnsaved,
    bannerHasUnsubmitted: bannerStatus.hasUnsubmitted,
    bannerHasReviewStatus: bannerStatus.hasReviewStatus,
    inlineDraftVisibleCount,
    inlineDraftVisibleRawCount,
    inlineDraftVisibleCountedRawCount,
    inlineDraftDedupKeySample: inlineDraftCounts.dedupKeySample,
    inlineDraftSamples: inlineDraftCounts.draftSamples,
    inlineEditorVisibleCount,
    activeCommentTextareaCount,
    unsubmittedSignal,
    unsavedSignal,
    fallbackUnsavedSignal,
    fallbackSignal,
    noBannerSignalCount,
    hasMainComment,
    mainCommentLength: mainCommentValue.length,
    heuristicCount,
    candidateSummaries
  };
  return diagnostics;
}

function phabLogUnsubmittedDiagnostics(diag) {
  const signature = JSON.stringify({
    hasUnsubmitted: diag.hasUnsubmitted,
    selectedSource: diag.selectedSource,
    selectedCount: diag.selectedCount,
    nativeVisibleCount: diag.nativeVisibleCount,
    nativeAnyCount: diag.nativeAnyCount,
    bannerPresent: diag.bannerPresent,
    bannerHasUnsaved: diag.bannerHasUnsaved,
    bannerHasUnsubmitted: diag.bannerHasUnsubmitted,
    inlineDraftVisibleCount: diag.inlineDraftVisibleCount,
    inlineEditorVisibleCount: diag.inlineEditorVisibleCount,
    activeCommentTextareaCount: diag.activeCommentTextareaCount,
    hasMainComment: diag.hasMainComment
  });
  if (signature === phabLastUnsubmittedDebugSignature) return;
  phabLastUnsubmittedDebugSignature = signature;
  console.debug("[MozHelper][Phabricator][Unsubmitted]", {
    seq: diag.seq,
    reason: diag.reason,
    location: diag.location,
    hasUnsubmitted: diag.hasUnsubmitted,
    countText: diag.countText,
    selectedSource: diag.selectedSource,
    selectedCount: diag.selectedCount,
    nativeVisibleCount: diag.nativeVisibleCount,
    nativeAnyCount: diag.nativeAnyCount,
    nativeAnyUnsavedCount: diag.nativeAnyUnsavedCount,
    nativeAnyUnsubmittedCount: diag.nativeAnyUnsubmittedCount,
    bannerPresent: diag.bannerPresent,
    bannerHasUnsaved: diag.bannerHasUnsaved,
    bannerHasUnsubmitted: diag.bannerHasUnsubmitted,
    inlineDraftVisibleCount: diag.inlineDraftVisibleCount,
    inlineEditorVisibleCount: diag.inlineEditorVisibleCount,
    activeCommentTextareaCount: diag.activeCommentTextareaCount,
    hasMainComment: diag.hasMainComment
  });
}

function phabGetUnsubmittedFaviconHref() {
  if (phabRuntime?.runtime?.getURL) {
    return phabRuntime.runtime.getURL(PHAB_UNSUBMITTED_FAVICON_PATH);
  }
  return PHAB_UNSUBMITTED_FAVICON;
}

function phabGetFloatingUnsubmittedTopPx() {
  const defaultTopPx = 18;
  const toolbar = document.querySelector(".phabricator-main-menu");
  if (!toolbar?.getBoundingClientRect) return defaultTopPx;
  const rect = toolbar.getBoundingClientRect();
  if (!rect || rect.height <= 0 || rect.bottom <= 0) return defaultTopPx;
  return Math.max(defaultTopPx, Math.ceil(rect.bottom + 10));
}

function phabApplyFloatingUnsubmittedPosition(button) {
  if (!button?.style) return;
  button.style.top = `${phabGetFloatingUnsubmittedTopPx()}px`;
}

function phabEnsureUnsubmittedFloatingButton() {
  const duplicates = Array.from(document.querySelectorAll('[data-phab-floating-unsubmitted="true"]'));
  if (duplicates.length > 1) {
    duplicates.slice(1).forEach((node) => node.remove());
  }
  if (phabUnsubmittedFloatingButton) {
    const sameDocument = phabUnsubmittedFloatingButton.ownerDocument === document;
    if (phabUnsubmittedFloatingButton.isConnected && sameDocument) {
      return phabUnsubmittedFloatingButton;
    }
    phabCleanupUnsubmittedFloatingButton();
  }
  const existing = document.querySelector('[data-phab-floating-unsubmitted="true"]');
  if (existing) {
    phabUnsubmittedFloatingButton = existing;
    return existing;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.phabFloatingUnsubmitted = "true";
  button.hidden = true;
  Object.assign(button.style, {
    position: "fixed",
    top: `${phabGetFloatingUnsubmittedTopPx()}px`,
    right: "18px",
    zIndex: "2147483003",
    display: "flex",
    alignItems: "center",
    gap: "7px",
    padding: "6px 12px",
    borderRadius: "999px",
    border: "1px solid #ff5a5a",
    background: "rgba(34, 8, 8, 0.95)",
    color: "#ffe4e6",
    fontSize: "12px",
    fontWeight: "600",
    lineHeight: "1",
    boxShadow: "0 0 0 1px rgba(255,40,40,0.35), 0 0 12px rgba(255,30,30,0.55), 0 0 24px rgba(255,0,0,0.35)",
    cursor: "pointer",
    pointerEvents: "auto"
  });

  const icon = document.createElement("span");
  icon.className = "phui-icon-view phui-font-fa visual-only fa-comment";
  icon.setAttribute("aria-hidden", "true");
  icon.style.fontSize = "11px";

  const label = document.createElement("span");
  label.dataset.phabFloatingUnsubmittedLabel = "true";
  label.textContent = "1 Unsubmitted";

  button.append(icon, label);
  button.addEventListener("mouseenter", () => {
    button.style.boxShadow = "0 0 0 1px rgba(255,70,70,0.45), 0 0 16px rgba(255,50,50,0.7), 0 0 30px rgba(255,20,20,0.45)";
  });
  button.addEventListener("mouseleave", () => {
    button.style.boxShadow = "0 0 0 1px rgba(255,40,40,0.35), 0 0 12px rgba(255,30,30,0.55), 0 0 24px rgba(255,0,0,0.35)";
  });
  button.addEventListener("click", () => {
    const native = phabFindNativeVisibleUnsubmittedButton() || phabGetNativeUnsubmittedButtonCandidates()[0];
    if (native) {
      native.click();
      return;
    }
    const fallbackTarget = document.querySelector(
      ".inline-state-is-draft, .differential-inline-comment-edit, textarea[name='comment']"
    );
    if (fallbackTarget?.scrollIntoView) {
      fallbackTarget.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  if (document.body) {
    document.body.appendChild(button);
  }
  phabUnsubmittedFloatingButton = button;
  return button;
}

function phabCleanupUnsubmittedFloatingButton() {
  document
    .querySelectorAll('[data-phab-floating-unsubmitted="true"]')
    .forEach((node) => node.remove());
  phabUnsubmittedFloatingButton = null;
}

function phabGetTitleWithoutUnsubmittedMarker(titleText = document.title) {
  if (!titleText) return "";
  return titleText.replace(/^\*\*\s*/, "").replace(/\s\*\*$/, "");
}

function phabHasUnsubmittedChanges() {
  return phabGetUnsubmittedState().hasUnsubmitted;
}

function phabUpdateUnsubmittedIndicator(reason = "manual") {
  if (!phabUnsubmittedIndicatorEnabled) return;
  if (!phabIsDifferentialRevisionPage()) {
    phabDisableUnsubmittedIndicator();
    return;
  }
  phabUnsubmittedUpdateSequence += 1;
  const unsubmittedState = phabGetUnsubmittedState();
  phabLogUnsubmittedDiagnostics({
    seq: phabUnsubmittedUpdateSequence,
    reason,
    location: window.location?.href || null,
    ...unsubmittedState
  });
  phabApplyNativeUnsubmittedButtonStyle();
  const hasUnsubmitted = unsubmittedState.hasUnsubmitted;
  const floatingButton = phabEnsureUnsubmittedFloatingButton();
  if (floatingButton) {
    phabApplyFloatingUnsubmittedPosition(floatingButton);
    const label = floatingButton.querySelector('[data-phab-floating-unsubmitted-label="true"]');
    if (label) {
      label.textContent = unsubmittedState.countText || "1 Unsubmitted";
    }
    const nativeVisibleButton = phabFindNativeReviewStatusButtonVisibleInViewport();
    const shouldShowFloating = hasUnsubmitted && !nativeVisibleButton;
    floatingButton.hidden = !shouldShowFloating;
    floatingButton.style.display = shouldShowFloating ? "flex" : "none";
    document
      .querySelectorAll('[data-phab-floating-unsubmitted="true"]')
      .forEach((node) => {
        if (node === floatingButton) return;
        node.hidden = true;
        node.style.display = "none";
      });
  }

  const cleanTitle = phabGetTitleWithoutUnsubmittedMarker();
  const nextTitle = hasUnsubmitted ? `** ${cleanTitle} **` : cleanTitle;
  if (document.title !== nextTitle) {
    document.title = nextTitle;
  }

  const favicon = phabFindFaviconLink();
  if (!favicon) return;
  if (hasUnsubmitted) {
    const unsubmittedHref = phabGetUnsubmittedFaviconHref();
    if (!phabOriginalFaviconHref || favicon.href !== unsubmittedHref) {
      phabOriginalFaviconHref = favicon.href;
    }
    favicon.href = unsubmittedHref;
  } else if (phabOriginalFaviconHref) {
    favicon.href = phabOriginalFaviconHref;
  }
}

function phabQueueUnsubmittedIndicatorUpdate(reason = "queue") {
  if (phabUnsubmittedIndicatorPending) {
    if (phabUnsubmittedPendingReason) {
      const reasons = new Set(phabUnsubmittedPendingReason.split(","));
      reasons.add(reason);
      phabUnsubmittedPendingReason = Array.from(reasons).join(",");
    } else {
      phabUnsubmittedPendingReason = reason;
    }
    return;
  }
  phabUnsubmittedIndicatorPending = true;
  phabUnsubmittedPendingReason = reason;
  requestAnimationFrame(() => {
    const nextReason = phabUnsubmittedPendingReason || "raf";
    phabUnsubmittedPendingReason = null;
    phabUnsubmittedIndicatorPending = false;
    phabUpdateUnsubmittedIndicator(nextReason);
  });
}

function phabEnsureUnsubmittedIndicatorObserver() {
  if (phabUnsubmittedIndicatorObserver || !document.body) return;
  phabUnsubmittedIndicatorObserver = new MutationObserver(() => {
    phabQueueUnsubmittedIndicatorUpdate("mutation");
  });
  phabUnsubmittedIndicatorObserver.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["class", "style", "hidden"]
  });
}

function phabHandleUnsubmittedScroll() {
  phabQueueUnsubmittedIndicatorUpdate("scroll");
}

function phabHandleUnsubmittedResize() {
  phabQueueUnsubmittedIndicatorUpdate("resize");
}

function phabBindUnsubmittedViewportListeners() {
  if (phabUnsubmittedViewportListenersBound) return;
  window.addEventListener("scroll", phabHandleUnsubmittedScroll, { passive: true });
  window.addEventListener("resize", phabHandleUnsubmittedResize);
  phabUnsubmittedViewportListenersBound = true;
}

function phabUnbindUnsubmittedViewportListeners() {
  if (!phabUnsubmittedViewportListenersBound) return;
  window.removeEventListener("scroll", phabHandleUnsubmittedScroll);
  window.removeEventListener("resize", phabHandleUnsubmittedResize);
  phabUnsubmittedViewportListenersBound = false;
}

function phabHandleUnsubmittedInput(event) {
  const target = event?.target;
  if (!(target instanceof HTMLTextAreaElement)) return;
  if (target.name !== "comment" && !target.classList.contains("remarkup-assist-textarea")) return;
  phabQueueUnsubmittedIndicatorUpdate("input");
}

function phabBindUnsubmittedInputListener() {
  if (phabUnsubmittedInputListenerBound) return;
  document.addEventListener("input", phabHandleUnsubmittedInput, true);
  phabUnsubmittedInputListenerBound = true;
}

function phabUnbindUnsubmittedInputListener() {
  if (!phabUnsubmittedInputListenerBound) return;
  document.removeEventListener("input", phabHandleUnsubmittedInput, true);
  phabUnsubmittedInputListenerBound = false;
}

function phabDisableUnsubmittedIndicator() {
  if (phabUnsubmittedIndicatorObserver) {
    phabUnsubmittedIndicatorObserver.disconnect();
    phabUnsubmittedIndicatorObserver = null;
  }
  phabUnbindUnsubmittedViewportListeners();
  phabUnbindUnsubmittedInputListener();
  phabCleanupUnsubmittedFloatingButton();
  phabLastKnownUnsubmittedCountText = null;
  phabLastUnsubmittedDebugSignature = null;
  const cleanTitle = phabGetTitleWithoutUnsubmittedMarker();
  if (document.title !== cleanTitle) {
    document.title = cleanTitle;
  }
  const favicon = phabFindFaviconLink();
  if (favicon && phabOriginalFaviconHref) {
    favicon.href = phabOriginalFaviconHref;
  }
}

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

function phabExtractHtmlFragment(htmlText) {
  if (!htmlText) return "";
  const startMarker = "<!--StartFragment-->";
  const endMarker = "<!--EndFragment-->";
  const startIdx = htmlText.indexOf(startMarker);
  const endIdx = htmlText.indexOf(endMarker);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return htmlText.slice(startIdx + startMarker.length, endIdx);
  }
  return htmlText;
}

function phabDecodeEntities(text) {
  if (!text) return "";
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ");
}

function phabStripHtmlPreservingText(text) {
  if (!text) return "";
  let output = text.replace(/<br\s*\/?>/gi, "\n");
  output = output.replace(/<\/(p|div|li|ul|ol|tr|table|blockquote)>/gi, "\n");
  output = output.replace(/<[^>]+>/g, "");
  output = output.replace(/\r\n/g, "\n");
  output = phabDecodeEntities(output);
  return output.replace(/\u00a0/g, " ");
}

function phabParseClipboardHTML(htmlText) {
  if (!htmlText) return null;
  const fragment = phabExtractHtmlFragment(htmlText);
  if (!fragment) return null;
  let containsLink = false;
  let firstLinkURL = null;
  let firstLinkText = null;
  const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let replaced = fragment.replace(anchorRegex, (match, attrPart, inner) => {
    const hrefMatch = attrPart.match(/href\s*=\s*["']([^"']+)["']/i);
    if (!hrefMatch) return phabStripHtmlPreservingText(inner);
    const rawHref = hrefMatch[1]?.trim();
    if (!rawHref || !phabIsLikelyURL(rawHref)) {
      return phabStripHtmlPreservingText(inner);
    }
    const cleanURL = /^https?:\/\//i.test(rawHref) ? rawHref : `https://${rawHref}`;
    const anchorText = phabStripHtmlPreservingText(inner).replace(/\s+/g, " ").trim();
    if (!anchorText) return "";
    if (!firstLinkURL) {
      firstLinkURL = cleanURL;
      firstLinkText = anchorText;
    }
    containsLink = true;
    return `[${anchorText}](${cleanURL})`;
  });
  replaced = phabStripHtmlPreservingText(replaced);
  if (!replaced.trim()) return containsLink ? { text: "", containsLink, firstLinkURL, firstLinkText } : null;
  return {
    text: replaced,
    containsLink,
    firstLinkURL,
    firstLinkText
  };
}

function phabMarkdownTransform(original, selectionStart, selectionEnd, pastedURL, replacementText = null) {
  const before = original.slice(0, selectionStart);
  const selected = replacementText != null ? replacementText : original.slice(selectionStart, selectionEnd);
  const after = original.slice(selectionEnd);
  const cleanURL = /^https?:\/\//i.test(pastedURL) ? pastedURL : `https://${pastedURL}`;
  const markdown = `[${selected}](${cleanURL})`;
  const text = before + markdown + after;
  const caret = before.length + markdown.length;
  return { text, caret };
}

function phabInsertText(original, selectionStart, selectionEnd, insertion) {
  const before = original.slice(0, selectionStart);
  const after = original.slice(selectionEnd);
  const text = before + insertion + after;
  const caret = before.length + insertion.length;
  return { text, caret };
}

function phabGetPasteUpdate(original, selectionStart, selectionEnd, selectedText, plainText, htmlText) {
  if (phabSelectionOverlapsMarkdown(original, selectionStart, selectionEnd)) return null;
  const selection = selectedText ?? "";
  const hasSelection = selection.length > 0;
  const htmlInfo = phabParseClipboardHTML(htmlText);
  const plainIsURL = plainText ? phabIsLikelyURL(plainText) : false;

  if (hasSelection) {
    if (phabIsLikelyURL(selection)) return null;
    if (plainIsURL) {
      return phabMarkdownTransform(original, selectionStart, selectionEnd, plainText);
    }
    if (htmlInfo?.containsLink && htmlInfo.text) {
      return phabInsertText(original, selectionStart, selectionEnd, htmlInfo.text);
    }
    return null;
  }

  if (htmlInfo?.containsLink && htmlInfo.text) {
    return phabInsertText(original, selectionStart, selectionEnd, htmlInfo.text);
  }

  return null;
}

function phabHandlePaste(event) {
  if (!phabPasteEnabled) return;
  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement)) return;
  if (!target.classList.contains("remarkup-assist-textarea")) return;

  const start = target.selectionStart;
  const end = target.selectionEnd;
  if (start == null || end == null) return;

  const clipboard = event.clipboardData || window.clipboardData;
  if (!clipboard) return;
  const pasted = (clipboard.getData("text/plain") || "").trim();
  const html = clipboard.getData("text/html") || "";
  const selected = target.value.slice(start, end);
  const update = phabGetPasteUpdate(target.value, start, end, selected, pasted, html);
  if (!update) return;
  event.preventDefault();
  target.value = update.text;
  target.setSelectionRange(update.caret, update.caret);
  target.dispatchEvent(new Event("input", { bubbles: true }));
}

function phabAttachPasteHandlers() {
  if (phabPasteListenerAttached && phabPasteListenerDocument === document) return;
  document.addEventListener("paste", phabHandlePaste, true);
  phabPasteListenerAttached = true;
  phabPasteListenerDocument = document;
}

function phabFindUnattachedFileLink() {
  return document.querySelector(
    '.phui-curtain-object-ref-view-exiled a[data-sigil="workflow"][href*="/file/ui/curtain/attach/"],' +
      ' .phui-curtain-object-ref-view-exiled-cell a[data-sigil="workflow"][href*="/file/ui/curtain/attach/"]'
  );
}

function phabHasUnattachedFiles() {
  const exiledCells = document.querySelectorAll(
    ".phui-curtain-object-ref-view-exiled-cell, .phui-curtain-object-ref-view-exiled"
  );
  for (const cell of exiledCells) {
    const text = (cell.textContent || "").toLowerCase();
    if (text.includes("file not attached")) return true;
  }
  const attachLink = phabFindUnattachedFileLink();
  if (attachLink && /file not attached/i.test(attachLink.textContent || "")) return true;
  return false;
}

function phabRemoveFileNotAttachedNotice() {
  if (!phabFileNotAttachedNotice) return;
  phabFileNotAttachedNotice.remove();
  phabFileNotAttachedNotice = null;
}

function phabEnsureFileNotAttachedNotice() {
  if (phabFileNotAttachedNotice) {
    const sameDocument = phabFileNotAttachedNotice.ownerDocument === document;
    if (phabFileNotAttachedNotice.isConnected && sameDocument) {
      return phabFileNotAttachedNotice;
    }
    phabRemoveFileNotAttachedNotice();
  }
  const notice = document.createElement("div");
  notice.dataset.phabFileNotAttachedNotice = "true";
  notice.setAttribute("role", "alert");
  notice.style.position = "fixed";
  notice.style.top = "16px";
  notice.style.right = "16px";
  notice.style.zIndex = "2147483001";
  notice.style.background = "#7f1d1d";
  notice.style.color = "#fef2f2";
  notice.style.border = "1px solid #fecaca";
  notice.style.borderRadius = "8px";
  notice.style.boxShadow = "0 10px 24px rgba(0,0,0,0.25)";
  notice.style.padding = "10px 12px";
  notice.style.fontSize = "12px";
  notice.style.lineHeight = "16px";
  notice.style.maxWidth = "260px";
  notice.style.fontFamily = "system-ui, -apple-system, Segoe UI, sans-serif";
  notice.style.display = "flex";
  notice.style.gap = "8px";
  notice.style.alignItems = "flex-start";

  const content = document.createElement("div");
  const title = document.createElement("div");
  title.textContent = "File not attached";
  title.style.fontWeight = "700";
  const body = document.createElement("div");
  body.textContent = "Some referenced files are not public.";
  body.style.marginTop = "2px";
  content.append(title, body);

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.gap = "6px";
  actions.style.marginTop = "6px";

  const viewButton = document.createElement("button");
  viewButton.type = "button";
  viewButton.textContent = "View";
  viewButton.dataset.phabFileNoticeView = "true";
  viewButton.style.border = "1px solid rgba(255,255,255,0.35)";
  viewButton.style.background = "rgba(0,0,0,0.2)";
  viewButton.style.color = "inherit";
  viewButton.style.borderRadius = "6px";
  viewButton.style.padding = "4px 8px";
  viewButton.style.cursor = "pointer";
  viewButton.style.fontSize = "12px";
  viewButton.addEventListener("click", () => {
    const link = phabFindUnattachedFileLink();
    const target = link?.closest(".phui-curtain-object-ref-view") || link?.closest(".phui-curtain-panel") || link;
    if (target?.scrollIntoView) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  const attachButton = document.createElement("button");
  attachButton.type = "button";
  attachButton.textContent = "Attach";
  attachButton.dataset.phabFileNoticeAttach = "true";
  attachButton.style.border = "1px solid rgba(255,255,255,0.35)";
  attachButton.style.background = "#fef2f2";
  attachButton.style.color = "#7f1d1d";
  attachButton.style.borderRadius = "6px";
  attachButton.style.padding = "4px 8px";
  attachButton.style.cursor = "pointer";
  attachButton.style.fontSize = "12px";
  attachButton.addEventListener("click", () => {
    const link = phabFindUnattachedFileLink();
    if (link) link.click();
  });

  actions.append(viewButton, attachButton);
  content.append(actions);

  const close = document.createElement("button");
  close.type = "button";
  close.setAttribute("aria-label", "Dismiss");
  close.textContent = "x";
  close.style.border = "none";
  close.style.background = "transparent";
  close.style.color = "inherit";
  close.style.fontSize = "16px";
  close.style.lineHeight = "16px";
  close.style.cursor = "pointer";
  close.style.padding = "0";
  close.addEventListener("click", () => {
    phabFileNotAttachedDismissed = true;
    phabRemoveFileNotAttachedNotice();
  });

  notice.append(content, close);
  document.body.appendChild(notice);
  phabFileNotAttachedNotice = notice;
  return notice;
}

function phabUpdateFileNotAttachedNotice() {
  if (!phabFileNotAttachedEnabled) {
    phabFileNotAttachedDismissed = false;
    phabRemoveFileNotAttachedNotice();
    return;
  }
  const hasUnattached = phabHasUnattachedFiles();
  if (!hasUnattached) {
    phabFileNotAttachedDismissed = false;
    phabRemoveFileNotAttachedNotice();
    return;
  }
  if (phabFileNotAttachedDismissed) return;
  const notice = phabEnsureFileNotAttachedNotice();
  const attachButton = notice.querySelector('[data-phab-file-notice-attach="true"]');
  const link = phabFindUnattachedFileLink();
  if (attachButton) {
    attachButton.disabled = !link;
    attachButton.style.opacity = link ? "1" : "0.6";
    attachButton.style.cursor = link ? "pointer" : "not-allowed";
  }
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
  let icon = PHAB_COMMENT_TRY_ICONS.get(anchor);
  if (!icon) {
    const prev = anchor.previousElementSibling;
    if (prev && prev.dataset?.phabTryCommentIcon === "true") {
      icon = prev;
    }
  }
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
  if (!icon) {
    const prev = anchor.previousElementSibling;
    if (prev && prev.dataset?.phabTryCommentIcon === "true") {
      icon = prev;
      PHAB_COMMENT_TRY_ICONS.set(anchor, icon);
    }
  }
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
  const anchors = document.querySelectorAll(
    ".transaction-comment a[href], .phui-property-list-section .phui-property-list-text-content a[href]"
  );
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
    const { repo, revision, landoCommitId, landoInstance } = phabParseTryLinkParams(parsedUrl);
    if (!repo || (!revision && !landoCommitId)) {
      phabRemoveCommentTryIcon(anchor);
      return;
    }
    const key = `${repo}:${revision || `lando:${landoInstance || "default"}:${landoCommitId}`}`;
    anchor.dataset.phabTryCommentKey = key;
    phabGetTryResult(repo, revision, landoCommitId, landoInstance)
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

function phabApplyTryStatusIcon(list, statusInfo) {
  if (!list) return;
  const dd = list.querySelector('dd[data-phab-try-link="true"]');
  if (!dd) return;
  let icon = dd.querySelector("[data-phab-try-status]");
  const status = statusInfo?.status ?? null;
  const isPending = !status && statusInfo?.reason === "pending";
  if (!status && !isPending) {
    if (statusInfo) {
      console.debug("[MozHelper][Phabricator] Try status unresolved (no icon)", {
        reason: statusInfo?.reason ?? null,
        summary: statusInfo?.summary ?? null,
        pendingJobs: statusInfo?.pendingJobs ?? null,
        failedJobs: statusInfo?.failedJobs ?? null
      });
    }
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
  console.debug("[MozHelper][Phabricator] Try status icon updated", {
    status,
    pending: isPending,
    hasIcon: Boolean(icon)
  });
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
    if (data.commentId) {
      commentAnchor.dataset.phabCommentId = data.commentId;
      commentAnchor.addEventListener("click", (event) => {
        event.preventDefault();
        const target = document.getElementById(data.commentId) || document.querySelector(`[name="${data.commentId}"]`);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }
        window.location.href = data.commentUrl;
      });
    }
    dd.appendChild(commentAnchor);
  }

  list.append(dt, dd);
}

function phabParseTryLinkParams(url) {
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

function phabIsReviewbotComment(eventNode) {
  if (!eventNode) return false;
  const authorAnchor = eventNode.querySelector(
    ".phui-timeline-title .phui-link-person, .phui-timeline-title .phui-link-profile, .phui-timeline-title .phui-handle"
  );
  if (!authorAnchor) return false;
  const authorName = (authorAnchor.textContent || "").trim().toLowerCase();
  if (authorName === "reviewbot") return true;
  const href = authorAnchor.getAttribute("href") || "";
  if (!href) return false;
  return /\/p\/reviewbot\/?(?:$|[?#])/i.test(href);
}

function phabFindSummaryTryLinkData() {
  const sections = document.querySelectorAll(".phui-property-list-section");
  for (const section of sections) {
    const header = section.querySelector(".phui-property-list-section-header");
    if (!header || !/\bsummary\b/i.test(header.textContent || "")) continue;
    const links = Array.from(section.querySelectorAll("a[href]")).filter((anchor) =>
      PHAB_TRY_LINK_PATTERN.test(anchor.href)
    );
    if (!links.length) continue;
    const tryLink = links[links.length - 1];
    const parsedUrl = (() => {
      try {
        return new URL(tryLink.href);
      } catch (error) {
        return null;
      }
    })();
    const { repo, revision, landoCommitId, landoInstance } = parsedUrl
      ? phabParseTryLinkParams(parsedUrl)
      : { repo: null, revision: null, landoCommitId: null, landoInstance: null };
    return {
      url: tryLink.href,
      commentUrl: null,
      commentId: null,
      repo,
      revision,
      landoCommitId,
      landoInstance
    };
  }
  return null;
}

function phabFindLatestTryLinkData() {
  const timelineEvents = document.querySelectorAll(".phui-timeline-shell");
  let latest = null;
  const baseUrl = `${window.location.origin}${window.location.pathname}${window.location.search}`;

  timelineEvents.forEach((eventNode) => {
    if (phabIsReviewbotComment(eventNode)) return;
    const links = Array.from(eventNode.querySelectorAll("a[href]")).filter((anchor) =>
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
    const { repo, revision, landoCommitId, landoInstance } = parsedUrl
      ? phabParseTryLinkParams(parsedUrl)
      : { repo: null, revision: null, landoCommitId: null, landoInstance: null };
    const anchor = eventNode.querySelector(".phabricator-anchor-view[id], .phabricator-anchor-view[name]");
    const anchorId = anchor?.id || anchor?.getAttribute("name");
    latest = {
      url: tryLink.href,
      commentUrl: anchorId ? `${baseUrl}#${anchorId}` : null,
      commentId: anchorId || null,
      repo,
      revision,
      landoCommitId,
      landoInstance
    };
  });

  return latest || phabFindSummaryTryLinkData();
}

if (typeof globalThis !== "undefined" && typeof globalThis.__mozHelperExposePhabForTests === "function") {
  globalThis.__mozHelperExposePhabForTests({
    phabIsReviewbotComment,
    phabFindLatestTryLinkData,
    phabAttachPasteHandlers,
    phabHandlePaste,
    phabHasUnattachedFiles,
    phabFindUnattachedFileLink,
    phabUpdateFileNotAttachedNotice,
    phabUpdateUnsubmittedIndicator,
    phabProcessPage,
    phabSetUnsubmittedIndicatorEnabled(value) {
      phabUnsubmittedIndicatorEnabled = Boolean(value);
    },
    phabSetFileNotAttachedEnabled(value) {
      phabFileNotAttachedEnabled = Boolean(value);
    },
    phabResetFileNotAttachedDismissed() {
      phabFileNotAttachedDismissed = false;
    }
  });
}

function phabGetTryResult(repo, revision, landoCommitId, landoInstance) {
  if (!repo || (!revision && !landoCommitId) || !phabRuntime?.runtime?.sendMessage) {
    return Promise.resolve(null);
  }
  const cacheKey = `${repo}:${revision || `lando:${landoInstance || "default"}:${landoCommitId}`}`;
  if (PHAB_TRY_STATUS_CACHE.has(cacheKey)) {
    return PHAB_TRY_STATUS_CACHE.get(cacheKey);
  }
  const key = cacheKey;
  if (PHAB_TRY_STATUS_CACHE.has(key)) {
    return PHAB_TRY_STATUS_CACHE.get(key);
  }
  console.debug("[MozHelper][Phabricator] Requesting try status", { repo, revision, landoCommitId, landoInstance });
  const promise = phabRuntime.runtime
    .sendMessage({
      type: "moz-helper:getTryStatus",
      repo,
      revision,
      landoCommitId,
      landoInstance
    })
    .then((response) => {
      const status = response?.status ?? null;
      console.debug("[MozHelper][Phabricator] Try status response", {
        repo,
        revision,
        landoCommitId,
        landoInstance,
        response
      });
      if (!status) {
        console.debug("[MozHelper][Phabricator] Try status unresolved", {
          repo,
          revision,
          landoInstance,
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
  console.debug("[MozHelper][Phabricator] Updating try link entry");
  const list = phabFindDiffDetailList();
  if (!list) {
    console.debug("[MozHelper][Phabricator] Try property list missing");
    return;
  }

  if (!phabTryLinkEnabled) {
    console.debug("[MozHelper][Phabricator] Try link feature disabled");
    phabClearTryLinkEntry(list);
    return;
  }

  const data = phabFindLatestTryLinkData();
  if (!data) {
    console.debug("[MozHelper][Phabricator] No try link detected");
    phabClearTryLinkEntry(list);
    return;
  }

  console.debug("[MozHelper][Phabricator] Found try link", data);
  phabRenderTryLinkEntry(list, data);

  if (data.repo && (data.revision || data.landoCommitId)) {
    phabApplyTryStatusIcon(list, null);
    console.debug("[MozHelper][Phabricator] Fetching try status for latest link", {
      repo: data.repo,
      revision: data.revision,
      landoCommitId: data.landoCommitId ?? null,
      landoInstance: data.landoInstance ?? null
    });
    phabGetTryResult(data.repo, data.revision, data.landoCommitId, data.landoInstance)
      .then((statusInfo) => {
        if (!phabTryLinkEnabled) return;
        console.debug("[MozHelper][Phabricator] Try status resolved", {
          repo: data.repo,
          revision: data.revision,
          landoCommitId: data.landoCommitId ?? null,
          landoInstance: data.landoInstance ?? null,
          status: statusInfo?.status ?? null,
          reason: statusInfo?.reason ?? null,
          summary: statusInfo?.summary ?? null
        });
        phabApplyTryStatusIcon(list, statusInfo);
      })
      .catch(() => {});
  } else {
    console.debug("[MozHelper][Phabricator] Try link missing repo or revision", data);
    phabApplyTryStatusIcon(list, null);
  }
}

function phabProcessPage() {
  phabEnhanceAllVideos();
  phabAttachPasteHandlers();
  phabUpdateLatestTryLink();
  phabProcessCommentTryLinks();
  if (phabUnsubmittedIndicatorEnabled && phabIsDifferentialRevisionPage()) {
    phabEnsureUnsubmittedIndicatorObserver();
    phabBindUnsubmittedViewportListeners();
    phabBindUnsubmittedInputListener();
    phabQueueUnsubmittedIndicatorUpdate();
  } else {
    phabDisableUnsubmittedIndicator();
  }
  phabUpdateFileNotAttachedNotice();
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
    phabUnsubmittedIndicatorEnabled = items.enablePhabricatorUnsubmittedIndicator ?? true;
    phabFileNotAttachedEnabled = items.enablePhabricatorFileNotAttachedNotice ?? true;
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
    if (changes.enablePhabricatorUnsubmittedIndicator) {
      phabUnsubmittedIndicatorEnabled = changes.enablePhabricatorUnsubmittedIndicator.newValue;
      if (phabUnsubmittedIndicatorEnabled && phabIsDifferentialRevisionPage()) {
        phabEnsureUnsubmittedIndicatorObserver();
        phabBindUnsubmittedViewportListeners();
        phabBindUnsubmittedInputListener();
        phabQueueUnsubmittedIndicatorUpdate();
      } else {
        phabDisableUnsubmittedIndicator();
      }
    }
    if (changes.enablePhabricatorFileNotAttachedNotice) {
      phabFileNotAttachedEnabled = changes.enablePhabricatorFileNotAttachedNotice.newValue;
      phabUpdateFileNotAttachedNotice();
    }
  });
}

phabInit();
