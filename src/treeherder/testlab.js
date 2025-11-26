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
