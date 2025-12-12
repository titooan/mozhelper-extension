const TRY_SUCCESS_RESULTS = new Set(["success", "skipped"]);
const TRY_ACTIVE_STATES = new Set(["pending", "running", "coalesced", "queued"]);
const TRY_PENDING_RESULTS = new Set(["unknown"]);
const TRY_IGNORED_RESULTS = new Set(["retry"]);
const TRY_IGNORED_STATES = new Set(["retry"]);
const MAX_PENDING_DEBUG = 15;

function parseJobTimestamp(value) {
  if (value == null) return null;
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
  if (stateIsIgnored || resultIsIgnored) {
    if (stats) stats.ignoredRetryJobs += 1;
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

/**
 * Mirrors assessTryJobs in background.js for easier testing.
 * @param {Array<Object>} jobs
 * @returns {{status:string|null, reason:string|null, summary:Object, failedJobs:Array<Object>}}
 */
export function assessTryJobs(jobs) {
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
    ignoredJobs: diagnostics.ignoredRetryJobs + diagnostics.ignoredMalformedJobs,
    ignoredRetries: diagnostics.ignoredRetryJobs,
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

export { TRY_SUCCESS_RESULTS, TRY_ACTIVE_STATES };
