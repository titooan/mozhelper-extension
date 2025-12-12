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
  const maxSummary = Math.min(5, maxItems);
  const lines = [];
  const seenNames = new Set();
  for (const job of failedJobs) {
    if (lines.length >= maxSummary) break;
    const parts = [];
    const name = job?.name || job?.jobSymbol || job?.groupSymbol || job?.jobId || "Job";
    const nameKey = name.toLowerCase();
    if (seenNames.has(nameKey)) {
      continue;
    }
    seenNames.add(nameKey);
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
  }
  const summaryLine = `Failed jobs: ${failedJobs.length}`;
  if (failedJobs.length <= maxSummary && lines.length) {
    return `${summaryLine}\n${lines.join("\n")}`;
  }
  return summaryLine;
}
