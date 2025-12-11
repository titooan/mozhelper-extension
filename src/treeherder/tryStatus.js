const TRY_SUCCESS_RESULTS = new Set(["success", "skipped"]);
const TRY_ACTIVE_STATES = new Set(["pending", "running", "coalesced", "queued"]);
const TRY_PENDING_RESULTS = new Set(["unknown"]);

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
      failedJobs: []
    };
  }
  let activeJobs = 0;
  const failedJobs = [];
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
      failedJobs.push({
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
    failedJobs: failedJobs.length
  };
  if (!jobs.length) {
    return { status: null, reason: "no-jobs", summary, failedJobs };
  }
  if (failedJobs.length > 0) {
    return { status: "failure", reason: null, summary, failedJobs };
  }
  if (activeJobs > 0) {
    return { status: null, reason: "pending", summary, failedJobs };
  }
  return { status: "success", reason: null, summary, failedJobs };
}

export { TRY_SUCCESS_RESULTS, TRY_ACTIVE_STATES };
