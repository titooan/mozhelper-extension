export const SUCCESS_TOOLTIP = "Passed";
export const PENDING_TOOLTIP = "Loading";

/**
 * Mirrors phabBuildFailedJobsTooltip in content/phabricator.js.
 * @param {Array<Object>} failedJobs
 * @param {number} maxItems
 * @returns {string|null}
 */
export function buildFailedJobsTooltip(failedJobs, maxItems = 12) {
  if (!Array.isArray(failedJobs) || failedJobs.length === 0) {
    return null;
  }
  const lines = [];
  for (const job of failedJobs) {
    if (lines.length >= maxItems) break;
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
  if (failedJobs.length > maxItems) {
    lines.push(`…and ${failedJobs.length - maxItems} more`);
  }
  return `Failed jobs:\n${lines.join("\n")}`;
}
