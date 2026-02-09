import { extractMarkdownTable } from "../taskcluster/markdownTable.js";

export const MACROBENCHMARK_JOB_NAME = "run-macrobenchmark-firebase-fenix";

export function shouldShowMacrobenchmarkTable(jobName) {
  return typeof jobName === "string" && jobName.trim() === MACROBENCHMARK_JOB_NAME;
}

export function findLiveBackingLogArtifact(artifacts) {
  if (!Array.isArray(artifacts)) return null;
  return artifacts.find((artifact) => typeof artifact?.name === "string" && artifact.name.endsWith("/live_backing.log")) || null;
}

export function extractMacrobenchmarkMarkdownTable(logText) {
  return extractMarkdownTable(logText);
}

function parseMarkdownRow(line) {
  if (typeof line !== "string") return [];
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return [];
  return trimmed
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

export function parseMarkdownTable(markdown) {
  if (typeof markdown !== "string") return null;
  const lines = markdown.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 3) return null;

  const headers = parseMarkdownRow(lines[0]);
  if (!headers.length) return null;

  const rows = lines.slice(2).map(parseMarkdownRow).filter((cells) => cells.length > 0);
  if (!rows.length) return null;

  const width = headers.length;
  const normalizedRows = rows.map((cells) => {
    if (cells.length === width) return cells;
    if (cells.length > width) return cells.slice(0, width);
    return [...cells, ...new Array(width - cells.length).fill("")];
  });

  return { headers, rows: normalizedRows };
}
