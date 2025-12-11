const runtime = typeof browser !== "undefined" ? browser : chrome;
const bugCache = new Map();
const tryStatusCache = new Map();
const tryStatusPending = new Map();
const TREEHERDER_BASE = "https://treeherder.mozilla.org";
const TRY_SUCCESS_RESULTS = new Set(["success", "skipped"]);
const TRY_ACTIVE_STATES = new Set(["pending", "running", "coalesced", "queued"]);
const TRY_PENDING_RESULTS = new Set(["unknown"]);

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
    if (!repo || !revision) {
      sendResponse({ status: null, reason: "missing-params" });
      return;
    }
    fetchTryStatus(repo, revision)
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
    return { status: null, reason: "missing-jobs", summary: { totalJobs: 0, activeJobs: 0, failedJobs: 0 } };
  }
  let activeJobs = 0;
  let failedJobs = 0;
  const failedJobDetails = [];
  for (const job of jobs) {
    const stateRaw = job?.state;
    const resultRaw = job?.result;
    const state = typeof stateRaw === "string" ? stateRaw.toLowerCase() : null;
    const result = resultRaw == null ? null : String(resultRaw).toLowerCase();
    const hasResult = result !== null && result !== "";
    const resultIsPending = hasResult && TRY_PENDING_RESULTS.has(result);
    const stateIsPending = state && TRY_ACTIVE_STATES.has(state);
    if (!hasResult || stateIsPending || resultIsPending) {
      activeJobs += 1;
    }
    if (hasResult && !TRY_SUCCESS_RESULTS.has(result) && !resultIsPending) {
      failedJobs += 1;
      failedJobDetails.push({
        name: job?.job_type_name || job?.ref_data_name || job?.job_symbol || job?.group_symbol || `job ${job?.id ?? ""}`,
        platform: job?.platform || job?.machine_platform || null,
        state,
        result,
        jobId: job?.id ?? null,
        taskId: job?.task_id ?? null,
        jobSymbol: job?.job_symbol ?? null,
        groupSymbol: job?.group_symbol ?? null
      });
    }
  }
  const summary = {
    totalJobs: jobs.length,
    activeJobs,
    failedJobs
  };
  if (!jobs.length) {
    return { status: null, reason: "no-jobs", summary, failedJobs: failedJobDetails };
  }
  if (failedJobs > 0) {
    return { status: "failure", reason: null, summary, failedJobs: failedJobDetails };
  }
  if (activeJobs > 0) {
    return { status: null, reason: "pending", summary, failedJobs: failedJobDetails };
  }
  return { status: "success", reason: null, summary, failedJobs: failedJobDetails };
}

async function fetchTryStatus(repo, revision) {
  const key = `${repo}:${revision}`;
  if (tryStatusCache.has(key)) {
    return tryStatusCache.get(key);
  }
  if (tryStatusPending.has(key)) {
    return tryStatusPending.get(key);
  }
  const promise = (async () => {
    try {
      const pushParams = new URLSearchParams({
        revision,
        count: "1",
        format: "json"
      });
      const pushUrl = `${TREEHERDER_BASE}/api/project/${encodeURIComponent(repo)}/push/?${pushParams.toString()}`;
      console.debug("[MozHelper][Treeherder] Fetching push", { repo, revision, url: pushUrl });
      const pushJson = await fetchTreeherderJson(pushUrl, "push");
      const pushId = pushJson?.results?.[0]?.id;
      console.debug("[MozHelper][Treeherder] Push lookup result", {
        repo,
        revision,
        count: pushJson?.results?.length,
        pushId
      });
      if (!pushId) {
        console.warn("[MozHelper][Treeherder] No push id for revision", repo, revision);
        return { status: null, reason: "missing-push" };
      }
      const jobsParams = new URLSearchParams({
        push_id: String(pushId),
        count: "2000",
        page: "1",
        format: "json"
      });
      const jobsUrl = `${TREEHERDER_BASE}/api/project/${encodeURIComponent(repo)}/jobs/?${jobsParams.toString()}`;
      console.debug("[MozHelper][Treeherder] Fetching jobs list", { repo, revision, pushId, url: jobsUrl });
      const jobsJson = await fetchTreeherderJson(jobsUrl, "jobs");
      if (!jobsJson || typeof jobsJson !== "object") {
        console.warn("[MozHelper][Treeherder] Missing jobs JSON", { repo, revision });
        return { status: null, reason: "missing-jobs-json" };
      }
      const jobs = Array.isArray(jobsJson.results) ? jobsJson.results : [];
      const result = assessTryJobs(jobs);
      console.debug("[MozHelper][Treeherder] Computed try status", {
        repo,
        revision,
        pushId,
        status: result.status,
        reason: result.reason,
        summary: result.summary
      });
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
