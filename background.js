const runtime = typeof browser !== "undefined" ? browser : chrome;
const bugCache = new Map();
const tryStatusCache = new Map();
const tryStatusPending = new Map();
const landoRevisionCache = new Map();
const landoRevisionPending = new Map();
const TREEHERDER_BASE = "https://treeherder.mozilla.org";
const DEFAULT_LANDO_API_BASE = "https://api.lando.services.mozilla.com";
const LANDO_INSTANCE_API_BASES = {
  "lando-prod-2025": "https://lando.moz.tools"
};
const TRY_SUCCESS_RESULTS = new Set(["success", "skipped"]);
const TRY_ACTIVE_STATES = new Set(["pending", "running", "coalesced", "queued"]);
const TRY_PENDING_RESULTS = new Set(["unknown"]);
const TRY_IGNORED_RESULTS = new Set(["retry"]);
const TRY_IGNORED_STATES = new Set(["retry"]);
const TRY_UNSCHEDULED_STATES = new Set(["unscheduled"]);
const TRY_BLOCKING_TIERS = new Set([1]);
const MAX_PENDING_DEBUG = 15;
const TREEHERDER_TC_BASE = "https://firefox-ci-tc.services.mozilla.com";
const APK_ARTIFACT_NAME = "public/build/target.arm64-v8a.apk";
const APK_JOB_NAMES = ["signing-apk-fenix-debug", "signing-apk-focus-debug"];
const APK_JOB_LABELS = {
  "signing-apk-fenix-debug": "fenix-debug.apk",
  "signing-apk-focus-debug": "focus-debug.apk"
};
const BUGZILLA_BUG_LINK_TARGET_PATTERNS = ["https://bugzilla.mozilla.org/show_bug.cgi?*"];
const BUGZILLA_MENU_ID_COPY_BUG_ID = "moz-helper-copy-bug-id";
const BUGZILLA_MENU_ID_COPY_BUG_MARKDOWN = "moz-helper-copy-bug-markdown";

function parseJobTimestamp(value) {
  if (value == null) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      if (Number.isFinite(num)) {
        return num > 1e12 ? num : num * 1000;
      }
      return null;
    }
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function computeJobOrder(job, index) {
  const timestampFields = [
    job?.start_timestamp,
    job?.startTime,
    job?.start_time,
    job?.submitted_timestamp,
    job?.end_timestamp
  ];
  for (const field of timestampFields) {
    const parsed = parseJobTimestamp(field);
    if (parsed !== null) {
      return parsed;
    }
  }
  const jobId = Number(job?.id);
  if (Number.isFinite(jobId)) {
    return jobId;
  }
  return index;
}

function buildJobKey(job, index) {
  const keyCandidates = [
    job?.job_type_name,
    job?.ref_data_name,
    [job?.group_symbol, job?.job_symbol].filter(Boolean).join("/"),
    job?.job_symbol,
    job?.job_type_id,
    job?.task_id,
    job?.id
  ];
  let baseKey = null;
  for (const candidate of keyCandidates) {
    if (candidate != null && String(candidate).trim()) {
      baseKey = String(candidate).trim();
      break;
    }
  }
  if (!baseKey) {
    baseKey = `job-${job?.id ?? index}`;
  }
  const platform = job?.platform || job?.machine_platform || "";
  return platform ? `${baseKey}::${platform}` : baseKey;
}

function describeJob(job, state, result) {
  return {
    name: job?.job_type_name || job?.ref_data_name || job?.job_symbol || job?.group_symbol || `job ${job?.id ?? ""}`,
    platform: job?.platform || job?.machine_platform || null,
    state,
    result,
    jobId: job?.id ?? null,
    taskId: job?.task_id ?? null,
    jobSymbol: job?.job_symbol ?? null,
    groupSymbol: job?.group_symbol ?? null,
    startTimestamp: job?.start_timestamp ?? job?.startTime ?? job?.start_time ?? null
  };
}

function isBlockingTier(job) {
  const tier = job?.tier;
  if (tier == null || tier === "") {
    return true;
  }
  const parsedTier = Number(tier);
  if (!Number.isFinite(parsedTier)) {
    return true;
  }
  return TRY_BLOCKING_TIERS.has(parsedTier);
}

function normalizeJobEntry(job, index, stats) {
  if (!job || typeof job !== "object") {
    if (stats) stats.ignoredMalformedJobs += 1;
    return null;
  }
  const stateRaw = job?.state;
  const resultRaw = job?.result;
  const state = typeof stateRaw === "string" ? stateRaw.toLowerCase() : null;
  const result = resultRaw == null ? null : String(resultRaw).toLowerCase();
  const hasResult = result !== null && result !== "";
  const resultIsPending = hasResult && TRY_PENDING_RESULTS.has(result);
  const stateIsPending = state && TRY_ACTIVE_STATES.has(state);
  const stateIsIgnored = state && TRY_IGNORED_STATES.has(state);
  const resultIsIgnored = hasResult && TRY_IGNORED_RESULTS.has(result);
  const stateIsUnscheduled = state && TRY_UNSCHEDULED_STATES.has(state);
  if (stateIsIgnored || resultIsIgnored) {
    if (stats) stats.ignoredRetryJobs += 1;
    return null;
  }
  if (stateIsUnscheduled && resultIsPending) {
    if (stats) stats.ignoredUnscheduledJobs += 1;
    return null;
  }
  return {
    job,
    state,
    result,
    hasResult,
    resultIsPending,
    stateIsPending,
    isBlocking: isBlockingTier(job),
    key: buildJobKey(job, index),
    order: computeJobOrder(job, index),
    index
  };
}

function isLaterJobEntry(current, previous) {
  if (!previous) {
    return true;
  }
  if (current.order > previous.order) {
    return true;
  }
  if (current.order === previous.order && current.index > previous.index) {
    return true;
  }
  return false;
}

function selectLatestApkJobEntries(jobs) {
  if (!Array.isArray(jobs)) {
    return [];
  }
  const latestByJobName = new Map();
  jobs.forEach((job, index) => {
    const jobName = typeof job?.job_type_name === "string" ? job.job_type_name.trim() : "";
    if (!APK_JOB_NAMES.includes(jobName)) return;
    const taskId = typeof job?.task_id === "string" ? job.task_id.trim() : "";
    if (!taskId) return;
    const candidate = {
      jobName,
      label: APK_JOB_LABELS[jobName],
      taskId,
      order: computeJobOrder(job, index),
      index
    };
    const existing = latestByJobName.get(jobName);
    if (isLaterJobEntry(candidate, existing)) {
      latestByJobName.set(jobName, candidate);
    }
  });
  return APK_JOB_NAMES.map((jobName) => latestByJobName.get(jobName))
    .filter(Boolean)
    .map(({ jobName, label, taskId }) => ({ jobName, label, taskId }));
}

function buildTaskclusterArtifactUrl(taskId, artifactName = APK_ARTIFACT_NAME, runId = 0) {
  if (typeof taskId !== "string" || !taskId.trim()) return null;
  if (typeof artifactName !== "string" || !artifactName.trim()) return null;
  if (typeof runId !== "number" || runId < 0) return null;
  return `${TREEHERDER_TC_BASE}/api/queue/v1/task/${taskId}/runs/${runId}/artifacts/${artifactName}`;
}

function buildTaskclusterArtifactsListUrl(taskId) {
  if (typeof taskId !== "string" || !taskId.trim()) return null;
  return `${TREEHERDER_TC_BASE}/api/queue/v1/task/${taskId}/runs/0/artifacts`;
}

function normalizeApkDownloadFilename(filename) {
  const value = String(filename || "").trim();
  return value || null;
}

async function fetchApkLinksForTryJobs(jobs) {
  const candidates = selectLatestApkJobEntries(jobs);
  if (!candidates.length) {
    return [];
  }
  const results = await Promise.all(
    candidates.map(async ({ label, taskId }) => {
      try {
        const artifactsJson = await fetchTreeherderJson(
          buildTaskclusterArtifactsListUrl(taskId),
          "artifact list"
        );
        const artifacts = Array.isArray(artifactsJson?.artifacts) ? artifactsJson.artifacts : [];
        const hasTargetApk = artifacts.some(
          (artifact) => typeof artifact?.name === "string" && artifact.name.endsWith(APK_ARTIFACT_NAME)
        );
        if (!hasTargetApk) {
          return null;
        }
        return {
          label,
          url: buildTaskclusterArtifactUrl(taskId, APK_ARTIFACT_NAME, 0)
        };
      } catch (error) {
        console.warn("[MozHelper][Treeherder] APK link lookup failed", { label, taskId, error });
        return null;
      }
    })
  );
  return results.filter(Boolean);
}

async function fetchBug(bugId) {
  if (bugCache.has(bugId)) {
    return bugCache.get(bugId);
  }
  try {
    const response = await fetch(`https://bugzilla.mozilla.org/rest/bug/${bugId}`, {
      credentials: "include"
    });
    if (response.status === 401 || response.status === 403) {
      const secure = { isSecure: true, id: bugId };
      bugCache.set(bugId, secure);
      return secure;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const bug = data?.bugs?.[0];
    if (bug) {
      bugCache.set(bugId, bug);
      return bug;
    }
    if (Array.isArray(data?.faults) || data?.error) {
      const secure = { isSecure: true, id: bugId };
      bugCache.set(bugId, secure);
      return secure;
    }
    bugCache.set(bugId, null);
    return null;
  } catch (error) {
    console.error("Bugzilla fetch failed:", error);
    bugCache.set(bugId, null);
    return null;
  }
}

function extractBugId(linkUrl) {
  try {
    const id = new URL(linkUrl).searchParams.get("id");
    return id && id.trim() ? id.trim() : null;
  } catch (error) {
    return null;
  }
}

function buildBugReferenceText(linkUrl) {
  const bugId = extractBugId(linkUrl);
  return bugId ? `Bug ${bugId}` : null;
}

function buildBugMarkdownLink(linkUrl) {
  const referenceText = buildBugReferenceText(linkUrl);
  return referenceText ? `[${referenceText}](${linkUrl})` : null;
}

function setBugzillaContextMenuEnabled(enabled) {
  if (!runtime.contextMenus) return;
  runtime.contextMenus.removeAll(() => {
    if (!enabled) return;
    runtime.contextMenus.create({
      id: BUGZILLA_MENU_ID_COPY_BUG_ID,
      title: "Copy Bug ID",
      contexts: ["link"],
      targetUrlPatterns: BUGZILLA_BUG_LINK_TARGET_PATTERNS
    });
    runtime.contextMenus.create({
      id: BUGZILLA_MENU_ID_COPY_BUG_MARKDOWN,
      title: "Copy Bug as Markdown Link",
      contexts: ["link"],
      targetUrlPatterns: BUGZILLA_BUG_LINK_TARGET_PATTERNS
    });
  });
}

if (runtime.contextMenus) {
  runtime.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId === BUGZILLA_MENU_ID_COPY_BUG_ID) {
      const text = buildBugReferenceText(info.linkUrl || "");
      if (!text) return;
      navigator.clipboard.writeText(text).catch((error) => {
        console.error("[MozHelper][Bugzilla] Copy bug ID failed:", error);
      });
    } else if (info.menuItemId === BUGZILLA_MENU_ID_COPY_BUG_MARKDOWN) {
      const markdown = buildBugMarkdownLink(info.linkUrl || "");
      if (!markdown) return;
      navigator.clipboard.writeText(markdown).catch((error) => {
        console.error("[MozHelper][Bugzilla] Copy bug markdown link failed:", error);
      });
    }
  });

  runtime.storage.sync.get({ enableBugzillaContextMenu: true }).then((items) => {
    setBugzillaContextMenuEnabled(items.enableBugzillaContextMenu !== false);
  });
  runtime.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (changes.enableBugzillaContextMenu) {
      setBugzillaContextMenuEnabled(changes.enableBugzillaContextMenu.newValue !== false);
    }
  });
}

runtime.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") return;
  if (message.type === "moz-helper:getBugInfo") {
    const bugId = String(message.bugId || "").trim();
    if (!bugId) {
      sendResponse({ bug: null });
      return;
    }
    fetchBug(bugId)
      .then((bug) => sendResponse({ bug }))
      .catch((error) => {
        console.error("Bugzilla fetch failed:", error);
        sendResponse({ bug: null });
    });
    return true;
  }
  if (message.type === "moz-helper:downloadApk") {
    const url = typeof message.url === "string" ? message.url.trim() : "";
    const filename = normalizeApkDownloadFilename(message.filename);
    if (!url || !filename || !runtime.downloads?.download) {
      sendResponse({ ok: false, reason: "missing-params" });
      return;
    }
    runtime.downloads
      .download({
        url,
        filename,
        conflictAction: "uniquify",
        saveAs: false
      })
      .then((downloadId) => sendResponse({ ok: true, downloadId }))
      .catch((error) => {
        console.warn("[MozHelper][Treeherder] APK download failed", {
          url,
          filename,
          error: serializeError(error)
        });
        sendResponse({
          ok: false,
          reason: "exception",
          details: serializeError(error)
        });
      });
    return true;
  }
  if (message.type === "moz-helper:getTryStatus") {
    const repo = String(message.repo || "").trim();
    const revision = String(message.revision || "").trim();
    const landoCommitIdRaw = message.landoCommitId == null ? "" : String(message.landoCommitId).trim();
    const landoCommitId = landoCommitIdRaw || null;
    const landoInstance = normalizeLandoInstance(message.landoInstance);
    if (!repo || (!revision && !landoCommitId)) {
      sendResponse({ status: null, reason: "missing-params" });
      return;
    }
    fetchTryStatus(repo, revision, landoCommitId, landoInstance)
      .then((result) => sendResponse(result || { status: null, reason: "unknown" }))
      .catch((error) => {
        console.error("Treeherder try status fetch failed:", error);
        sendResponse({
          status: null,
          reason: "exception",
          details: serializeError(error)
        });
      });
    return true;
  }
});

// Keep in sync with src/treeherder/tryStatus.js for tests.
function assessTryJobs(jobs) {
  if (!Array.isArray(jobs)) {
    return {
      status: null,
      reason: "missing-jobs",
      summary: { totalJobs: 0, activeJobs: 0, failedJobs: 0 },
      failedJobs: [],
      pendingJobs: []
    };
  }
  let activeJobs = 0;
  let failedJobs = 0;
  const diagnostics = {
    ignoredRetryJobs: 0,
    ignoredUnscheduledJobs: 0,
    ignoredMalformedJobs: 0,
    normalizedJobs: 0,
    dedupedJobs: 0
  };
  const failedJobDetails = [];
  const pendingJobDetails = [];
  const latestJobs = new Map();
  jobs.forEach((job, index) => {
    const entry = normalizeJobEntry(job, index, diagnostics);
    if (!entry) return;
    diagnostics.normalizedJobs += 1;
    const existing = latestJobs.get(entry.key);
    if (isLaterJobEntry(entry, existing)) {
      if (existing) diagnostics.dedupedJobs += 1;
      latestJobs.set(entry.key, entry);
    }
  });
  for (const entry of latestJobs.values()) {
    const { job, state, result, hasResult, resultIsPending, stateIsPending, isBlocking } = entry;
    if (!hasResult || stateIsPending || resultIsPending) {
      activeJobs += 1;
      if (pendingJobDetails.length < MAX_PENDING_DEBUG) {
        pendingJobDetails.push(describeJob(job, state, result));
      }
    }
    if (isBlocking && hasResult && !TRY_SUCCESS_RESULTS.has(result) && !resultIsPending) {
      failedJobs += 1;
      failedJobDetails.push(describeJob(job, state, result));
    }
  }
  const summary = {
    totalJobs: jobs.length,
    activeJobs,
    failedJobs,
    uniqueJobs: latestJobs.size,
    consideredJobs: diagnostics.normalizedJobs,
    dedupedJobs: diagnostics.dedupedJobs,
    ignoredJobs: diagnostics.ignoredRetryJobs + diagnostics.ignoredMalformedJobs + diagnostics.ignoredUnscheduledJobs,
    ignoredRetries: diagnostics.ignoredRetryJobs,
    ignoredUnscheduled: diagnostics.ignoredUnscheduledJobs,
    ignoredMalformed: diagnostics.ignoredMalformedJobs
  };
  if (!jobs.length) {
    return { status: null, reason: "no-jobs", summary, failedJobs: failedJobDetails, pendingJobs: pendingJobDetails };
  }
  if (activeJobs > 0) {
    return { status: null, reason: "pending", summary, failedJobs: failedJobDetails, pendingJobs: pendingJobDetails };
  }
  if (failedJobs > 0) {
    return { status: "failure", reason: null, summary, failedJobs: failedJobDetails, pendingJobs: pendingJobDetails };
  }
  return { status: "success", reason: null, summary, failedJobs: failedJobDetails, pendingJobs: pendingJobDetails };
}

async function fetchTryStatus(repo, revision, landoCommitId = null, landoInstance = null) {
  const normalizedLandoInstance = normalizeLandoInstance(landoInstance);
  let resolvedRevision = revision;
  if (!resolvedRevision && landoCommitId) {
    resolvedRevision = await resolveRevisionFromLando(landoCommitId, normalizedLandoInstance);
  }
  if (!resolvedRevision) {
    console.warn("[MozHelper][Treeherder] Missing revision for try status lookup", {
      repo,
      landoCommitId,
      landoInstance: normalizedLandoInstance
    });
    return { status: null, reason: "missing-revision" };
  }
  const key = `${repo}:${resolvedRevision}`;
  if (tryStatusCache.has(key)) {
    return tryStatusCache.get(key);
  }
  if (tryStatusPending.has(key)) {
    return tryStatusPending.get(key);
  }
  const promise = (async () => {
    try {
      const pushParams = new URLSearchParams({
        revision: resolvedRevision,
        count: "1",
        format: "json"
      });
      const pushUrl = `${TREEHERDER_BASE}/api/project/${encodeURIComponent(repo)}/push/?${pushParams.toString()}`;
      console.debug("[MozHelper][Treeherder] Fetching push", { repo, revision: resolvedRevision, url: pushUrl });
      const pushJson = await fetchTreeherderJson(pushUrl, "push");
      const pushId = pushJson?.results?.[0]?.id;
      console.debug("[MozHelper][Treeherder] Push lookup result", {
        repo,
        revision: resolvedRevision,
        count: pushJson?.results?.length,
        pushId
      });
      if (!pushId) {
        console.warn("[MozHelper][Treeherder] No push id for revision", repo, resolvedRevision);
        return { status: null, reason: "missing-push" };
      }
      const jobsParams = new URLSearchParams({
        push_id: String(pushId),
        count: "2000",
        page: "1",
        format: "json"
      });
      const jobsUrl = `${TREEHERDER_BASE}/api/project/${encodeURIComponent(repo)}/jobs/?${jobsParams.toString()}`;
      console.debug("[MozHelper][Treeherder] Fetching jobs list", { repo, revision: resolvedRevision, pushId, url: jobsUrl });
      const jobsJson = await fetchTreeherderJson(jobsUrl, "jobs");
      if (!jobsJson || typeof jobsJson !== "object") {
        console.warn("[MozHelper][Treeherder] Missing jobs JSON", { repo, revision: resolvedRevision });
        return { status: null, reason: "missing-jobs-json" };
      }
      const jobs = Array.isArray(jobsJson.results) ? jobsJson.results : [];
      const result = assessTryJobs(jobs);
      let apkLinks = [];
      try {
        apkLinks = await fetchApkLinksForTryJobs(jobs);
      } catch (error) {
        console.warn("[MozHelper][Treeherder] APK link enrichment failed", {
          repo,
          revision: resolvedRevision,
          pushId,
          error: serializeError(error)
        });
      }
      console.debug("[MozHelper][Treeherder] Computed try status", {
        repo,
        revision: resolvedRevision,
        pushId,
        status: result.status,
        reason: result.reason,
        summary: result.summary,
        apkLinks
      });
      if (!result.status) {
        console.debug("[MozHelper][Treeherder] Try status unresolved diagnostics", {
          repo,
          revision: resolvedRevision,
          pushId,
          reason: result.reason,
          pendingJobs: (result.pendingJobs || []).slice(0, 10),
          failedJobs: (result.failedJobs || []).slice(0, 5)
        });
      }
      return { ...result, apkLinks };
    } catch (error) {
      console.warn("Treeherder try status lookup failed:", error);
      return {
        status: null,
        reason: "exception",
        details: serializeError(error)
      };
    }
  })()
    .then((result) => {
      tryStatusPending.delete(key);
      if (result?.status) {
        tryStatusCache.set(key, Promise.resolve(result));
      }
      return result;
    })
    .catch((error) => {
      tryStatusPending.delete(key);
      console.warn("Treeherder try status promise failed:", error);
      return {
        status: null,
        reason: "promise-rejection",
        details: serializeError(error)
      };
    });
  tryStatusPending.set(key, promise);
  return promise;
}

function normalizeLandoInstance(value) {
  if (value == null) {
    return null;
  }
  const normalized = String(value).trim().toLowerCase();
  return normalized || null;
}

function getLandoApiBaseUrl(landoInstance) {
  const normalized = normalizeLandoInstance(landoInstance);
  return LANDO_INSTANCE_API_BASES[normalized] || DEFAULT_LANDO_API_BASE;
}

function buildLandoLandingJobUrl(landoCommitId, landoInstance) {
  const id = String(landoCommitId || "").trim();
  if (!id) {
    return null;
  }
  const apiBase = getLandoApiBaseUrl(landoInstance);
  const params = new URLSearchParams({
    lando_revision_id: id,
    count: "1"
  });
  const encodedId = encodeURIComponent(id);
  const path = apiBase === DEFAULT_LANDO_API_BASE ? `/landing_jobs/${encodedId}` : `/landing_jobs/${encodedId}/`;
  return `${apiBase}${path}?${params.toString()}`;
}

function buildLandoRevisionCacheKey(landoCommitId, landoInstance) {
  return `${getLandoApiBaseUrl(landoInstance)}:${String(landoCommitId || "").trim()}`;
}

async function resolveRevisionFromLando(landoCommitId, landoInstance = null) {
  if (!landoCommitId) {
    return null;
  }
  const normalizedLandoInstance = normalizeLandoInstance(landoInstance);
  const cacheKey = buildLandoRevisionCacheKey(landoCommitId, normalizedLandoInstance);
  if (landoRevisionCache.has(cacheKey)) {
    return landoRevisionCache.get(cacheKey);
  }
  if (landoRevisionPending.has(cacheKey)) {
    return landoRevisionPending.get(cacheKey);
  }
  const promise = (async () => {
    try {
      const url = buildLandoLandingJobUrl(landoCommitId, normalizedLandoInstance);
      console.debug("[MozHelper][Lando] Resolving revision", {
        landoCommitId,
        landoInstance: normalizedLandoInstance,
        url
      });
      const res = await fetch(url, {
        credentials: "omit",
        headers: {
          Accept: "application/json",
          "User-Agent": "moz-helper/treeherder-status"
        }
      });
      if (!res.ok) {
        const error = new Error(`Lando resolution failed: ${res.status}`);
        error.code = "http";
        error.status = res.status;
        error.statusText = res.statusText;
        throw error;
      }
      const data = await res.json();
      const commitId =
        data?.results?.[0]?.commit_id ||
        data?.results?.[0]?.commit ||
        data?.results?.[0]?.revision ||
        data?.commit_id ||
        data?.revision ||
        null;
      if (!commitId) {
        console.warn("[MozHelper][Lando] Missing commit ID in response", {
          landoCommitId,
          landoInstance: normalizedLandoInstance
        });
        return null;
      }
      console.debug("[MozHelper][Lando] Resolved revision", {
        landoCommitId,
        landoInstance: normalizedLandoInstance,
        revision: commitId
      });
      return commitId;
    } catch (error) {
      console.warn("[MozHelper][Lando] Failed to resolve revision", {
        landoCommitId,
        landoInstance: normalizedLandoInstance,
        error
      });
      return null;
    }
  })()
    .then((revision) => {
      landoRevisionPending.delete(cacheKey);
      if (revision) {
        landoRevisionCache.set(cacheKey, revision);
      }
      return revision;
    })
    .catch((error) => {
      landoRevisionPending.delete(cacheKey);
      throw error;
    });
  landoRevisionPending.set(cacheKey, promise);
  return promise;
}

async function fetchTreeherderJson(url, label) {
  try {
    const res = await fetch(url, {
      credentials: "omit",
      headers: {
        Accept: "application/json"
      }
    });
    if (!res.ok) {
      const error = new Error(`Treeherder ${label} fetch failed: ${res.status}`);
      error.code = "http";
      error.status = res.status;
      error.statusText = res.statusText;
      throw error;
    }
    const contentType = res.headers.get("content-type") || "";
    const text = await res.text();
    if (!text || !text.trim()) {
      const error = new Error(`Treeherder ${label} response empty`);
      error.code = "empty";
      error.contentType = contentType;
      throw error;
    }
    try {
      return JSON.parse(text);
    } catch (error) {
      const preview = text.slice(0, 120).replace(/\s+/g, " ");
      error.code = "parse";
      error.preview = preview;
      error.contentType = contentType;
      error.responseText = text;
      console.warn("[MozHelper][Treeherder] JSON parse failed", {
        label,
        url,
        contentType,
        preview
      });
      throw error;
    }
  } catch (error) {
    error.contextLabel = label;
    throw error;
  }
}

function serializeError(error) {
  if (!error || typeof error !== "object") {
    return typeof error === "string" ? { message: error } : null;
  }
  return {
    message: error.message,
    code: error.code ?? null,
    status: error.status ?? null,
    statusText: error.statusText ?? null,
    contentType: error.contentType ?? null,
    preview: error.preview ?? null,
    stack: error.stack ?? null
  };
}
