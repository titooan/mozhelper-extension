const runtime = typeof browser !== "undefined" ? browser : chrome;
const bugCache = new Map();
const tryStatusCache = new Map();
const tryStatusPending = new Map();
const landoRevisionCache = new Map();
const landoRevisionPending = new Map();
const TREEHERDER_BASE = "https://treeherder.mozilla.org";
const TRY_SUCCESS_RESULTS = new Set(["success", "skipped"]);
const TRY_ACTIVE_STATES = new Set(["pending", "running", "coalesced", "queued"]);
const TRY_PENDING_RESULTS = new Set(["unknown"]);
const TRY_IGNORED_RESULTS = new Set(["retry"]);
const TRY_IGNORED_STATES = new Set(["retry"]);
const TRY_UNSCHEDULED_STATES = new Set(["unscheduled"]);
const MAX_PENDING_DEBUG = 15;

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
  if (message.type === "moz-helper:getTryStatus") {
    const repo = String(message.repo || "").trim();
    const revision = String(message.revision || "").trim();
    const landoCommitIdRaw = message.landoCommitId == null ? "" : String(message.landoCommitId).trim();
    const landoCommitId = landoCommitIdRaw || null;
    if (!repo || (!revision && !landoCommitId)) {
      sendResponse({ status: null, reason: "missing-params" });
      return;
    }
    fetchTryStatus(repo, revision, landoCommitId)
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
    const { job, state, result, hasResult, resultIsPending, stateIsPending } = entry;
    if (!hasResult || stateIsPending || resultIsPending) {
      activeJobs += 1;
      if (pendingJobDetails.length < MAX_PENDING_DEBUG) {
        pendingJobDetails.push(describeJob(job, state, result));
      }
    }
    if (hasResult && !TRY_SUCCESS_RESULTS.has(result) && !resultIsPending) {
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

async function fetchTryStatus(repo, revision, landoCommitId = null) {
  let resolvedRevision = revision;
  if (!resolvedRevision && landoCommitId) {
    resolvedRevision = await resolveRevisionFromLando(landoCommitId);
  }
  if (!resolvedRevision) {
    console.warn("[MozHelper][Treeherder] Missing revision for try status lookup", { repo, landoCommitId });
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
      console.debug("[MozHelper][Treeherder] Computed try status", {
        repo,
        revision: resolvedRevision,
        pushId,
        status: result.status,
        reason: result.reason,
        summary: result.summary
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
      return result;
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

async function resolveRevisionFromLando(landoCommitId) {
  if (!landoCommitId) {
    return null;
  }
  if (landoRevisionCache.has(landoCommitId)) {
    return landoRevisionCache.get(landoCommitId);
  }
  if (landoRevisionPending.has(landoCommitId)) {
    return landoRevisionPending.get(landoCommitId);
  }
  const promise = (async () => {
    try {
      const params = new URLSearchParams({
        lando_revision_id: landoCommitId,
        count: "1"
      });
      const url = `https://api.lando.services.mozilla.com/landing_jobs/${encodeURIComponent(
        landoCommitId
      )}?${params.toString()}`;
      console.debug("[MozHelper][Lando] Resolving revision", { landoCommitId, url });
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
        console.warn("[MozHelper][Lando] Missing commit ID in response", { landoCommitId });
        return null;
      }
      console.debug("[MozHelper][Lando] Resolved revision", { landoCommitId, revision: commitId });
      return commitId;
    } catch (error) {
      console.warn("[MozHelper][Lando] Failed to resolve revision", { landoCommitId, error });
      return null;
    }
  })()
    .then((revision) => {
      landoRevisionPending.delete(landoCommitId);
      if (revision) {
        landoRevisionCache.set(landoCommitId, revision);
      }
      return revision;
    })
    .catch((error) => {
      landoRevisionPending.delete(landoCommitId);
      throw error;
    });
  landoRevisionPending.set(landoCommitId, promise);
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
