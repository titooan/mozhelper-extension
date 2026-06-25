import { TREEHERDER_TC_BASE } from "./testlab.js";

export const APK_ARTIFACT_NAME = "public/build/target.arm64-v8a.apk";
export const APK_JOB_NAMES = ["signing-apk-fenix-debug", "signing-apk-focus-debug"];
export const APK_JOB_LABELS = {
  "signing-apk-fenix-debug": "fenix-debug.apk",
  "signing-apk-focus-debug": "focus-debug.apk"
};

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
  const timestampFields = [job?.start_timestamp, job?.startTime, job?.start_time, job?.submitted_timestamp, job?.end_timestamp];
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

function isLaterJobEntry(current, previous) {
  if (!previous) return true;
  if (current.order > previous.order) return true;
  if (current.order === previous.order && current.index > previous.index) return true;
  return false;
}

export function selectLatestApkJobEntries(jobs) {
  if (!Array.isArray(jobs)) return [];
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

export function buildTaskclusterArtifactUrl(taskId, artifactName = APK_ARTIFACT_NAME, runId = 0) {
  if (typeof taskId !== "string" || !taskId.trim()) return null;
  if (typeof artifactName !== "string" || !artifactName.trim()) return null;
  if (typeof runId !== "number" || runId < 0) return null;
  return `${TREEHERDER_TC_BASE}/api/queue/v1/task/${taskId}/runs/${runId}/artifacts/${artifactName}`;
}
