export function findCostReportArtifact(artifacts) {
  if (!Array.isArray(artifacts)) return null;
  return (
    artifacts.find(
      (artifact) =>
        typeof artifact?.name === "string" &&
        (artifact.name === "results/CostReport.txt" || artifact.name.endsWith("/results/CostReport.txt"))
    ) || null
  );
}

export function parseFirebaseCostReport(text) {
  if (typeof text !== "string") return null;
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;
  const label = lines[lines.length - 2].replace(/:\s*$/, "");
  const value = lines[lines.length - 1];
  if (!label || !value) return null;
  return `${label}: ${value}`;
}
