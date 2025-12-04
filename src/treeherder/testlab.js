export const TREEHERDER_TC_BASE = "https://firefox-ci-tc.services.mozilla.com";

export function findMatrixArtifact(artifacts) {
  if (!Array.isArray(artifacts)) return null;
  return artifacts.find((artifact) => typeof artifact?.name === "string" && artifact.name.endsWith("/matrix_ids.json")) || null;
}

export function extractWebLinkFromMatrix(matrixJson) {
  if (!matrixJson || typeof matrixJson !== "object") return null;
  for (const entry of Object.values(matrixJson)) {
    if (entry && typeof entry === "object" && typeof entry.webLink === "string" && entry.webLink) {
      return entry.webLink;
    }
  }
  return null;
}

export function findUnitTestReportArtifact(artifacts) {
  if (!Array.isArray(artifacts)) return null;
  const pattern = /public\/reports\/test\/test[^/]*UnitTest\/index\.html$/;
  return artifacts.find((artifact) => typeof artifact?.name === "string" && pattern.test(artifact.name)) || null;
}

export function selectLatestRunId(statusJson) {
  const runs = statusJson?.status?.runs ?? statusJson?.runs;
  if (!Array.isArray(runs) || runs.length === 0) return 0;
  for (let i = runs.length - 1; i >= 0; i--) {
    const runId = runs[i]?.runId;
    if (typeof runId === "number" && Number.isFinite(runId)) {
      return runId;
    }
  }
  return runs.length - 1;
}

export function buildUnitTestArtifactLink(taskId, runId, artifactName) {
  if (!taskId || typeof taskId !== "string") return null;
  if (typeof runId !== "number" || runId < 0) return null;
  if (!artifactName || typeof artifactName !== "string") return null;
  return `${TREEHERDER_TC_BASE}/api/queue/v1/task/${taskId}/runs/${runId}/artifacts/${artifactName}`;
}
