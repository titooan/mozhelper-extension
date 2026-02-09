// Treeherder helpers (Firebase TestLab, unit test shortcut, macrobenchmark table; no ES modules)

const treeherderRuntime = (typeof browser !== "undefined" ? browser : chrome);
const treeherderStorage = treeherderRuntime.storage;
const treeherderDefaults = {
  enableTreeherder: true,
  enableTreeherderUnitTests: true,
  enableTreeherderMacrobenchmarkTable: true
};
let treeherderEnabled = true;
let treeherderUnitTestsEnabled = true;
let treeherderMacrobenchmarkTableEnabled = true;

const TREEHERDER_TC_BASE = "https://firefox-ci-tc.services.mozilla.com";
const TREEHERDER_FIREBASE_ICON =
  "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz48IS0tIFVwbG9hZGVkIHRvOiBTVkcgUmVwbywgd3d3LnN2Z3JlcG8uY29tLCBHZW5lcmF0b3I6IFNWRyBSZXBvIE1peGVyIFRvb2xzIC0tPgo8c3ZnIHdpZHRoPSI4MDBweCIgaGVpZ2h0PSI4MDBweCIgdmlld0JveD0iLTQ3LjUgMCAzNTEgMzUxIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiBwcmVzZXJ2ZUFzcGVjdFJhdGlvPSJ4TWlkWU1pZCI+PGRlZnM+PHBhdGggZD0iTTEuMjUzIDI4MC43MzJsMS42MDUtMy4xMzEgOTkuMzUzLTE4OC41MTgtNDQuMTUtODMuNDc1QzU0LjM5Mi0xLjI4MyA0NS4wNzQuNDc0IDQzLjg3IDguMTg4TDEuMjUzIDI4MC43MzJ6IiBpZD0iYSIvPjxmaWx0ZXIgeD0iLTUwJSIgeT0iLTUwJSIgd2lkdGg9IjIwMCUiIGhlaWdodD0iMjAwJSIgZmlsdGVyVW5pdHM9Im9iamVjdEJvdW5kaW5nQm94IiBpZD0iYiI+PGZlR2F1c3NpYW5CbHVyIHN0ZERldmlhdGlvbj0iMTcuNSIgaW49IlNvdXJjZUFscGhhIiByZXN1bHQ9InNoYWRvd0JsdXJJbm5lcjEiLz48ZmVPZmZzZXQgaW49InNoYWRvd0JsdXJJbm5lcjEiIHJlc3VsdD0ic2hhZG93T2Zmc2V0SW5uZXIxIi8+PGZlQ29tcG9zaXRlIGluPSJzaGFkb3dPZmZzZXRJbm5lcjEiIGluMj0iU291cmNlQWxwaGEiIG9wZXJhdG9yPSJhcml0aG1ldGljIiBrMj0iLTEiIGszPSIxIiByZXN1bHQ9InNoYWRvd0lubmVySW5uZXIxIi8+PGZlQ29sb3JNYXRyaXggdmFsdWVzPSIwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwLjA2IDAiIGluPSJzaGFkb3dJbm5lcklubmVyMSIvPjwvZmlsdGVyPjxwYXRoIGQ9Ik0xMzQuNDE3IDE0OC45NzRsMzIuMDM5LTMyLjgxMi0zMi4wMzktNjEuMDA3Yy0zLjA0Mi01Ljc5MS0xMC40MzMtNi4zOTgtMTMuNDQzLS41OWwtMTcuNzA1IDM0LjEwOS0uNTMgMS43NDQgMzEuNjc4IDU4LjU1NnoiIGlkPSJjIi8+PGZpbHRlciB4PSItNTAlIiB5PSItNTAlIiB3aWR0aD0iMjAwJSIgaGVpZ2h0PSIyMDAlIiBmaWx0ZXJVbml0cz0ib2JqZWN0Qm91bmRpbmdCb3giIGlkPSJkIj48ZmVHYXVzc2lhbkJsdXIgc3RkRGV2aWF0aW9uPSIzLjUiIGluPSJTb3VyY2VBbHBoYSIgcmVzdWx0PSJzaGFkb3dCbHVySW5uZXIxIi8+PGZlT2Zmc2V0IGR4PSIxIiBkeT0iLTkiIGluPSJzaGFkb3dCbHVySW5uZXIxIiByZXN1bHQ9InNoYWRvd09mZnNldElubmVyMSIvPjxmZUNvbXBvc2l0ZSBpbj0ic2hhZG93T2Zmc2V0SW5uZXIxIiBpbjI9IlNvdXJjZUFscGhhIiBvcGVyYXRvcj0iYXJpdGhtZXRpYyIgazI9Ii0xIiBrMz0iMSIgcmVzdWx0PSJzaGFkb3dJbm5lcklubmVyMSIvPjxmZUNvbG9yTWF0cml4IHZhbHVlcz0iMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMC4wOSAwIiBpbj0ic2hhZG93SW5uZXJJbm5lcjEiLz48L2ZpbHRlcj48L2RlZnM+PHBhdGggZD0iTTAgMjgyLjk5OGwyLjEyMy0yLjk3MkwxMDIuNTI3IDg5LjUxMmwuMjEyLTIuMDE3TDU4LjQ4IDQuMzU4QzU0Ljc3LTIuNjA2IDQ0LjMzLS44NDUgNDMuMTE0IDYuOTUxTDAgMjgyLjk5OHoiIGZpbGw9IiNGRkMyNEEiLz48dXNlIGZpbGw9IiNGRkE3MTIiIGZpbGwtcnVsZT0iZXZlbm9kZCIgeGxpbms6aHJlZj0iI2EiLz48dXNlIGZpbHRlcj0idXJsKCNiKSIgeGxpbms6aHJlZj0iI2EiLz48cGF0aCBkPSJNMTM1LjAwNSAxNTAuMzhsMzIuOTU1LTMzLjc1LTMyLjk2NS02Mi45M2MtMy4xMjktNS45NTctMTEuODY2LTUuOTc1LTE0Ljk2MiAwTDEwMi40MiA4Ny4yODd2Mi44NmwzMi41ODQgNjAuMjMzeiIgZmlsbD0iI0Y0QkQ2MiIvPjx1c2UgZmlsbD0iI0ZGQTUwRSIgZmlsbC1ydWxlPSJldmVub2RkIiB4bGluazpocmVmPSIjYyIvPjx1c2UgZmlsdGVyPSJ1cmwoI2QpIiB4bGluazpocmVmPSIjYyIvPjxwYXRoIGZpbGw9IiNGNjgyMEMiIGQ9Ik0wIDI4Mi45OThsLjk2Mi0uOTY4IDMuNDk2LTEuNDIgMTI4LjQ3Ny0xMjggMS42MjgtNC40MzEtMzIuMDUtNjEuMDc0eiIvPjxwYXRoIGQ9Ik0xMzkuMTIxIDM0Ny41NTFsMTE2LjI3NS02NC44NDctMzMuMjA0LTIwNC40OTVjLTEuMDM5LTYuMzk4LTguODg4LTguOTI3LTEzLjQ2OC00LjM0TDAgMjgyLjk5OGwxMTUuNjA4IDY0LjU0OGEyNC4xMjYgMjQuMTI2IDAgMCAwIDIzLjUxMy4wMDUiIGZpbGw9IiNGREUwNjgiLz48cGF0aCBkPSJNMjU0LjM1NCAyODIuMTZMMjIxLjQwMiA3OS4yMThjLTEuMDMtNi4zNS03LjU1OC04Ljk3Ny0xMi4xMDMtNC40MjRMMS4yOSAyODIuNmwxMTQuMzM5IDYzLjkwOGEyMy45NDMgMjMuOTQzIDAgMCAwIDIzLjMzNC4wMDZsMTE1LjM5Mi02NC4zNTV6IiBmaWxsPSIjRkNDQTNGIi8+PHBhdGggZD0iTTEzOS4xMiAzNDUuNjRhMjQuMTI2IDI0LjEyNiAwIDAgMS0yMy41MTItLjAwNUwuOTMxIDI4Mi4wMTVsLS45My45ODMgMTE1LjYwNyA2NC41NDhhMjQuMTI2IDI0LjEyNiAwIDAgMCAyMy41MTMuMDA1bDExNi4yNzUtNjQuODQ3LS4yODUtMS43NTItMTE1Ljk5IDY0LjY4OXoiIGZpbGw9IiNFRUFCMzciLz48L3N2Zz4=";
const TREEHERDER_TESTS_ICON = treeherderGetExtensionURL("icons/tests_icon.png");
const TREEHERDER_MACROBENCHMARK_JOB_NAME = "run-macrobenchmark-firebase-fenix";
let treeherderObserver = null;
let treeherderLastTaskId = null;
let treeherderLastRunId = null;
let treeherderLastFirebaseLink = null;
let treeherderLastUnitTestsLink = null;
let treeherderLastMacrobenchmarkKey = null;
let treeherderLastMacrobenchmarkTable = null;
let treeherderLastMacrobenchmarkSkipKey = null;
const treeherderJobNameCache = new Map();
let treeherderActiveRequestId = 0;

function treeherderLog(...args) {
  try {
    console.debug("[MozHelper][Treeherder]", ...args);
  } catch (_error) {
    // no-op
  }
}

// keep logic duplicated here for runtime (tests live in src/treeherder/testlab.js)
function treeherderFindMatrixArtifact(artifacts) {
  if (!Array.isArray(artifacts)) return null;
  return artifacts.find((artifact) => typeof artifact?.name === "string" && artifact.name.endsWith("/matrix_ids.json")) || null;
}

function treeherderExtractWebLink(matrixJson) {
  if (!matrixJson || typeof matrixJson !== "object") {
    treeherderLog("Matrix JSON missing or not object");
    return null;
  }
  for (const [key, entry] of Object.entries(matrixJson)) {
    if (entry && typeof entry === "object" && typeof entry.webLink === "string" && entry.webLink) {
      treeherderLog("Found Firebase webLink in matrix entry", key);
      return entry.webLink;
    }
  }
  const sampleEntry = Object.entries(matrixJson)[0]?.[1];
  treeherderLog("Matrix JSON lacks webLink field", {
    keys: Object.keys(matrixJson),
    sample: sampleEntry
  });
  return null;
}

function treeherderFindUnitTestArtifact(artifacts) {
  if (!Array.isArray(artifacts)) return null;
  const pattern = /public\/reports\/test\/test[^/]*UnitTest\/index\.html$/;
  return artifacts.find((artifact) => typeof artifact?.name === "string" && pattern.test(artifact.name)) || null;
}

function treeherderFindLiveBackingLogArtifact(artifacts) {
  if (!Array.isArray(artifacts)) return null;
  return artifacts.find((artifact) => typeof artifact?.name === "string" && artifact.name.endsWith("/live_backing.log")) || null;
}

function treeherderStripLogPrefix(line) {
  if (typeof line !== "string") return "";
  return line.replace(/^\[[^\]]+\]\s*/, "");
}

function treeherderIsMarkdownTableRow(line) {
  if (typeof line !== "string") return false;
  const trimmed = line.trim();
  return /^\|.*\|$/.test(trimmed);
}

function treeherderIsMarkdownDividerRow(line) {
  if (!treeherderIsMarkdownTableRow(line)) return false;
  const trimmed = line.trim();
  const cells = trimmed
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
  if (!cells.length) return false;
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function treeherderExtractTableFromBlock(lines) {
  if (!Array.isArray(lines) || lines.length < 2) return null;
  const dividerIndex = lines.findIndex(treeherderIsMarkdownDividerRow);
  if (dividerIndex <= 0) return null;
  if (dividerIndex >= lines.length - 1) return null;
  return lines.join("\n");
}

function treeherderExtractMarkdownTable(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  const lines = text
    .split(/\r?\n/)
    .map((line) => treeherderStripLogPrefix(line).trim())
    .filter(Boolean);

  let block = [];
  for (const line of lines) {
    if (treeherderIsMarkdownTableRow(line)) {
      block.push(line);
      continue;
    }
    const table = treeherderExtractTableFromBlock(block);
    if (table) return table;
    block = [];
  }
  return treeherderExtractTableFromBlock(block);
}

function treeherderParseMarkdownRow(line) {
  if (typeof line !== "string") return [];
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return [];
  return trimmed
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

function treeherderParseMarkdownTable(markdown) {
  if (typeof markdown !== "string") return null;
  const lines = markdown.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 3) return null;

  const headers = treeherderParseMarkdownRow(lines[0]);
  if (!headers.length) return null;
  const width = headers.length;
  const rows = lines
    .slice(2)
    .map(treeherderParseMarkdownRow)
    .filter((cells) => cells.length > 0)
    .map((cells) => {
      if (cells.length === width) return cells;
      if (cells.length > width) return cells.slice(0, width);
      return [...cells, ...new Array(width - cells.length).fill("")];
    });
  if (!rows.length) return null;
  return { headers, rows };
}

function treeherderGetSummaryField(summary, labelPrefix) {
  if (!summary || !labelPrefix) return "";
  const items = summary.querySelectorAll("li.small");
  for (const li of items) {
    const strong = li.querySelector("strong");
    if (!strong) continue;
    const label = (strong.textContent || "").trim().toLowerCase();
    if (!label.startsWith(labelPrefix.toLowerCase())) continue;
    const clone = li.cloneNode(true);
    const cloneStrong = clone.querySelector("strong");
    if (cloneStrong) cloneStrong.remove();
    return (clone.textContent || "").replace(/^:\s*/, "").trim();
  }
  for (const li of items) {
    const text = (li.textContent || "").replace(/\s+/g, " ").trim();
    const pattern = new RegExp(`^${labelPrefix}\\s*:?\\s*(.+)$`, "i");
    const match = text.match(pattern);
    if (match && match[1]) return match[1].trim();
  }
  const text = (summary.textContent || "").replace(/\s+/g, " ").trim();
  const pattern = new RegExp(`${labelPrefix}\\s*:?\\s*([^|]+?)\\s*(Task ID|Run ID|Duration|$)`, "i");
  const match = text.match(pattern);
  if (match && match[1]) return match[1].trim();
  return "";
}

function treeherderShouldShowMacrobenchmarkTable(jobName) {
  return (
    typeof jobName === "string" &&
    jobName.toLowerCase().includes(TREEHERDER_MACROBENCHMARK_JOB_NAME.toLowerCase())
  );
}

async function treeherderFetchTaskMetadataName(taskId) {
  try {
    if (!taskId) return "";
    if (treeherderJobNameCache.has(taskId)) return treeherderJobNameCache.get(taskId) || "";
    const url = `${TREEHERDER_TC_BASE}/api/queue/v1/task/${taskId}`;
    const res = await fetch(url);
    if (!res.ok) {
      treeherderLog("Task metadata fetch failed", res.status, res.statusText);
      treeherderJobNameCache.set(taskId, "");
      return "";
    }
    const json = await res.json();
    const name =
      (typeof json?.metadata?.name === "string" && json.metadata.name) ||
      (typeof json?.task?.metadata?.name === "string" && json.task.metadata.name) ||
      "";
    treeherderJobNameCache.set(taskId, name);
    treeherderLog("Resolved job name from task metadata", { taskId, name });
    return name;
  } catch (error) {
    console.warn("[MozHelper][Treeherder] Failed to fetch task metadata", error);
    treeherderJobNameCache.set(taskId, "");
    return "";
  }
}

async function treeherderResolveJobName(summary, taskId) {
  const summaryJobName = treeherderGetSummaryField(summary, "job name");
  if (summaryJobName) return summaryJobName;
  const metadataName = await treeherderFetchTaskMetadataName(taskId);
  return metadataName || "";
}

function treeherderSelectLatestRunId(statusJson) {
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

function treeherderBuildUnitTestArtifactLink(taskId, runId, artifactName) {
  if (!taskId || typeof taskId !== "string") return null;
  if (typeof runId !== "number" || runId < 0) return null;
  if (!artifactName || typeof artifactName !== "string") return null;
  return `${TREEHERDER_TC_BASE}/api/queue/v1/task/${taskId}/runs/${runId}/artifacts/${artifactName}`;
}

function treeherderHasActiveFeatures() {
  return Boolean(treeherderEnabled || treeherderUnitTestsEnabled || treeherderMacrobenchmarkTableEnabled);
}

function treeherderEnsureObserver() {
  if (treeherderObserver || !document.body) return;
  treeherderObserver = new MutationObserver(() => {
    if (!treeherderHasActiveFeatures()) return;
    treeherderTryInjectForCurrentJob();
  });
  treeherderObserver.observe(document.body, { childList: true, subtree: true });
}

function treeherderDisconnectObserver() {
  if (treeherderObserver) {
    treeherderObserver.disconnect();
    treeherderObserver = null;
  }
}

async function treeherderTryInjectForCurrentJob() {
  if (!treeherderHasActiveFeatures()) return;
  const summary = document.getElementById("summary-panel-content");
  if (!summary) return;

  const taskLink = summary.querySelector("#taskInfo");
  if (!taskLink) return;

  const taskId = (taskLink.textContent || "").trim();
  if (!taskId) return;
  const jobName = await treeherderResolveJobName(summary, taskId);
  const shouldShowMacrobenchmarkTable =
    treeherderMacrobenchmarkTableEnabled && treeherderShouldShowMacrobenchmarkTable(jobName);
  const macroDebugKey = `${taskId}:${jobName}`;
  if (treeherderLastMacrobenchmarkSkipKey !== macroDebugKey) {
    treeherderLastMacrobenchmarkSkipKey = macroDebugKey;
    treeherderLog("Macrobenchmark gate", {
      taskId,
      jobName,
      enabled: shouldShowMacrobenchmarkTable
    });
  }
  const runId = await treeherderDetermineRunId(taskId);
  if (runId == null) return;
  const prevTaskId = treeherderLastTaskId;
  const prevRunId = treeherderLastRunId;
  const taskChanged = taskId !== prevTaskId || runId !== prevRunId;

  const requestId = ++treeherderActiveRequestId;
  treeherderLastTaskId = taskId;
  treeherderLastRunId = runId;
  treeherderLog("Evaluating job", taskId, {
    firebaseEnabled: treeherderEnabled,
    unitTestsEnabled: treeherderUnitTestsEnabled,
    macrobenchmarkTableEnabled: treeherderMacrobenchmarkTableEnabled,
    runId
  });

  if (taskChanged) {
    treeherderRemoveSummaryLink();
    treeherderRemoveNavbarIcon();
    treeherderRemoveUnitTestsIcon();
    treeherderRemoveMacrobenchmarkPerformanceTable();
  }

  const needsArtifacts = treeherderEnabled || treeherderUnitTestsEnabled || shouldShowMacrobenchmarkTable;
  const artifacts = needsArtifacts ? await treeherderFetchArtifacts(taskId, runId) : null;
  if (treeherderActiveRequestId !== requestId) return;

  if (treeherderEnabled) {
    const firebaseLink = await treeherderFetchFirebaseLink(taskId, runId, artifacts);
    if (treeherderActiveRequestId !== requestId) return;
    if (firebaseLink) {
      const firebaseChanged =
        taskChanged || firebaseLink !== treeherderLastFirebaseLink;
      treeherderLastFirebaseLink = firebaseLink;
      if (firebaseChanged) {
        treeherderInjectSummaryLink(summary, firebaseLink);
        treeherderInjectNavbarIcon(firebaseLink);
        treeherderLog("Injected Firebase TestLab link", firebaseLink);
      }
    } else {
      treeherderRemoveSummaryLink();
      treeherderRemoveNavbarIcon();
      treeherderLastFirebaseLink = null;
      treeherderLog("Firebase TestLab link unavailable for job", taskId);
    }
  } else {
    treeherderRemoveSummaryLink();
    treeherderRemoveNavbarIcon();
    treeherderLastFirebaseLink = null;
  }

  if (treeherderUnitTestsEnabled) {
    const unitLink = treeherderBuildUnitTestsLink(taskId, runId, artifacts);
    if (treeherderActiveRequestId !== requestId) return;
    if (unitLink) {
      const testsChanged = taskChanged || unitLink !== treeherderLastUnitTestsLink;
      treeherderLastUnitTestsLink = unitLink;
      if (testsChanged) {
        treeherderInjectUnitTestsIcon(unitLink);
        treeherderLog("Injected unit test shortcut", unitLink);
      }
    } else {
      treeherderRemoveUnitTestsIcon();
      treeherderLastUnitTestsLink = null;
      treeherderLog("Unit test report not found for job", taskId);
    }
  } else {
    treeherderRemoveUnitTestsIcon();
    treeherderLastUnitTestsLink = null;
  }

  await treeherderHandleMacrobenchmarkPerformanceTable(
    taskId,
    runId,
    artifacts,
    jobName,
    requestId
  );

}

async function treeherderDetermineRunId(taskId) {
  try {
    const url = `${TREEHERDER_TC_BASE}/api/queue/v1/task/${taskId}/status`;
    const res = await fetch(url);
    if (!res.ok) {
      treeherderLog("Failed to get task status", res.status, res.statusText);
      return 0;
    }
    const json = await res.json();
    return treeherderSelectLatestRunId(json);
  } catch (error) {
    console.warn("[MozHelper][Treeherder] Failed to determine run id", error);
    return 0;
  }
}

async function treeherderFetchArtifacts(taskId, runId) {
  try {
    const artifactsUrl = `${TREEHERDER_TC_BASE}/api/queue/v1/task/${taskId}/runs/${runId}/artifacts`;
    treeherderLog("Fetching artifacts", artifactsUrl);
    const res = await fetch(artifactsUrl);
    if (!res.ok) {
      treeherderLog("Artifact request failed", res.status, res.statusText);
      return null;
    }
    const json = await res.json();
    if (!Array.isArray(json?.artifacts)) {
      treeherderLog("Artifact payload missing artifacts array");
      return null;
    }
    treeherderLog("Artifact list size", json.artifacts.length);
    return json.artifacts;
  } catch (error) {
    console.warn("[MozHelper][Treeherder] Failed to fetch artifacts", error);
    return null;
  }
}

async function treeherderFetchFirebaseLink(taskId, runId, artifacts) {
  try {
    let artifactList = artifacts;
    if (!Array.isArray(artifactList)) {
      artifactList = await treeherderFetchArtifacts(taskId, runId);
    }
    if (!Array.isArray(artifactList)) return null;

    const matrixArtifact = treeherderFindMatrixArtifact(artifactList);
    if (!matrixArtifact) {
      treeherderLog("No Firebase matrix artifact found for job", taskId);
      return null;
    }
    treeherderLog("Found Firebase matrix artifact", matrixArtifact.name);

    const matrixUrl = `${TREEHERDER_TC_BASE}/api/queue/v1/task/${taskId}/runs/${runId}/artifacts/${matrixArtifact.name}`;
    treeherderLog("Fetching Firebase matrix details", matrixUrl);
    const matrixRes = await fetch(matrixUrl);
    if (!matrixRes.ok) {
      treeherderLog("Matrix fetch failed", matrixRes.status, matrixRes.statusText);
      return null;
    }
    const matrixJson = await matrixRes.json();
    return treeherderExtractWebLink(matrixJson);
  } catch (error) {
    console.warn("[MozHelper][Treeherder] Failed to fetch Firebase TestLab link", error);
    return null;
  }
}

function treeherderBuildUnitTestsLink(taskId, runId, artifacts) {
  if (!Array.isArray(artifacts)) return null;
  const artifact = treeherderFindUnitTestArtifact(artifacts);
  if (!artifact) {
    treeherderLog("No unit test artifact found for job", taskId);
    return null;
  }
  treeherderLog("Found unit test artifact", artifact.name);
  return treeherderBuildUnitTestArtifactLink(taskId, runId, artifact.name);
}

async function treeherderFetchMacrobenchmarkTable(taskId, runId, artifacts) {
  try {
    if (!Array.isArray(artifacts)) return null;
    const liveBackingLog = treeherderFindLiveBackingLogArtifact(artifacts);
    if (!liveBackingLog) {
      treeherderLog("No live_backing.log artifact found for job", taskId);
      return null;
    }
    treeherderLog("Fetching macrobenchmark log artifact", {
      taskId,
      runId,
      artifact: liveBackingLog.name
    });
    const logUrl = `${TREEHERDER_TC_BASE}/api/queue/v1/task/${taskId}/runs/${runId}/artifacts/${liveBackingLog.name}`;
    const res = await fetch(logUrl);
    if (!res.ok) {
      treeherderLog("Failed to fetch live_backing.log", res.status, res.statusText);
      return null;
    }
    const logText = await res.text();
    treeherderLog("Fetched live_backing.log", { chars: logText.length });
    const table = treeherderExtractMarkdownTable(logText);
    if (!table) {
      treeherderLog("No markdown table found in live_backing.log", taskId);
      return null;
    }
    treeherderLog("Extracted macrobenchmark markdown table", { lines: table.split("\n").length });
    return table;
  } catch (error) {
    console.warn("[MozHelper][Treeherder] Failed to fetch macrobenchmark table", error);
    return null;
  }
}

function treeherderResolveTabPanel(tabEl) {
  if (!tabEl) return null;
  const ariaControls = tabEl.getAttribute("aria-controls");
  if (ariaControls) {
    const panel = document.getElementById(ariaControls);
    if (panel) return panel;
  }
  const bsTarget = tabEl.getAttribute("data-bs-target") || tabEl.getAttribute("data-target");
  if (bsTarget && bsTarget.startsWith("#")) {
    const panel = document.querySelector(bsTarget);
    if (panel) return panel;
  }
  const href = tabEl.getAttribute("href");
  if (href && href.startsWith("#")) {
    const panel = document.querySelector(href);
    if (panel) return panel;
  }
  return null;
}

function treeherderFindPerformancePanel() {
  const tabs = [...document.querySelectorAll('[role="tab"], button, a')].filter((el) => {
    const label = (el.textContent || "").trim().toLowerCase();
    return label === "performance";
  });
  treeherderLog("Performance tab candidates", { count: tabs.length });
  if (!tabs.length) return null;

  const sortedTabs = [
    ...tabs.filter((el) => el.getAttribute("aria-selected") === "true" || el.classList.contains("active")),
    ...tabs.filter((el) => !(el.getAttribute("aria-selected") === "true" || el.classList.contains("active")))
  ];

  for (const tab of sortedTabs) {
    const panel = treeherderResolveTabPanel(tab);
    if (panel) {
      treeherderLog("Resolved Performance panel via tab linkage");
      return panel;
    }
  }
  const fallback = (
    document.querySelector(".tab-content .tab-pane.active") ||
    document.querySelector(".tab-content .active.show") ||
    document.querySelector(".tab-content > .active")
  );
  if (fallback) treeherderLog("Resolved Performance panel via fallback active tab");
  return fallback;
}

function treeherderRemoveMacrobenchmarkPerformanceTable() {
  document.querySelectorAll(".mozhelper-macrobenchmark-table").forEach((el) => el.remove());
}

async function treeherderCopyText(text) {
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_error) {
    // fallback below
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  } catch (_error) {
    return false;
  }
}

function treeherderInjectMacrobenchmarkPerformanceTable(markdownTable) {
  const parsed = treeherderParseMarkdownTable(markdownTable);
  if (!parsed) return false;
  const panel = treeherderFindPerformancePanel();
  if (!panel) {
    treeherderLog("Performance panel not found for macrobenchmark table");
    return false;
  }

  let container = panel.querySelector(".mozhelper-macrobenchmark-table");
  const signature = `${markdownTable.length}:${markdownTable.slice(0, 64)}`;
  if (container && container.dataset.signature === signature) return true;
  if (container) container.remove();

  container = document.createElement("div");
  container.className = "mozhelper-macrobenchmark-table";
  container.dataset.signature = signature;
  container.style.margin = "0 0 12px 0";
  container.style.background = "transparent";

  const details = document.createElement("details");
  details.className = "mozhelper-macrobenchmark-table-details";
  details.open = false;
  details.style.border = "1px solid #d8dee4";
  details.style.borderRadius = "8px";
  details.style.padding = "8px 10px";
  details.style.background = "#fff";

  const summary = document.createElement("summary");
  summary.style.display = "flex";
  summary.style.alignItems = "center";
  summary.style.justifyContent = "space-between";
  summary.style.gap = "8px";
  summary.style.cursor = "pointer";
  summary.style.userSelect = "none";
  summary.style.outline = "none";

  const summaryLabel = document.createElement("span");
  summaryLabel.textContent = "Macrobenchmark Table";
  summaryLabel.style.fontWeight = "600";
  summary.appendChild(summaryLabel);

  const copyWrap = document.createElement("span");
  copyWrap.style.position = "relative";
  copyWrap.style.display = "inline-flex";
  copyWrap.style.alignItems = "center";

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.title = "Copy markdown table";
  copyButton.setAttribute("aria-label", "Copy markdown table");
  copyButton.style.border = "1px solid #cbd5e1";
  copyButton.style.borderRadius = "6px";
  copyButton.style.background = "#ffffff";
  copyButton.style.color = "#334155";
  copyButton.style.padding = "3px 7px";
  copyButton.style.lineHeight = "1";
  copyButton.style.cursor = "pointer";
  copyButton.style.transition = "background-color 120ms ease, border-color 120ms ease, transform 80ms ease";
  copyButton.style.boxShadow = "0 1px 1px rgba(15, 23, 42, 0.04)";
  copyButton.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16 1H6a2 2 0 0 0-2 2v12h2V3h10V1m3 4H10a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2m0 16H10V7h9v14Z"/></svg>';
  const setButtonIdleStyle = () => {
    copyButton.style.background = "#ffffff";
    copyButton.style.borderColor = "#cbd5e1";
    copyButton.style.transform = "translateY(0)";
  };
  const setButtonHoverStyle = () => {
    copyButton.style.background = "#f8fafc";
    copyButton.style.borderColor = "#94a3b8";
  };
  const setButtonPressedStyle = () => {
    copyButton.style.background = "#f1f5f9";
    copyButton.style.borderColor = "#64748b";
    copyButton.style.transform = "translateY(1px)";
  };
  setButtonIdleStyle();
  copyButton.addEventListener("mouseenter", setButtonHoverStyle);
  copyButton.addEventListener("mouseleave", setButtonIdleStyle);
  copyButton.addEventListener("focus", setButtonHoverStyle);
  copyButton.addEventListener("blur", setButtonIdleStyle);
  copyButton.addEventListener("mousedown", setButtonPressedStyle);

  const tooltip = document.createElement("span");
  tooltip.style.position = "absolute";
  tooltip.style.right = "0";
  tooltip.style.top = "calc(100% + 6px)";
  tooltip.style.maxWidth = "260px";
  tooltip.style.whiteSpace = "nowrap";
  tooltip.style.background = "#0f172a";
  tooltip.style.color = "#ffffff";
  tooltip.style.fontSize = "11px";
  tooltip.style.lineHeight = "1.2";
  tooltip.style.padding = "5px 8px";
  tooltip.style.borderRadius = "6px";
  tooltip.style.boxShadow = "0 8px 18px rgba(15, 23, 42, 0.25)";
  tooltip.style.opacity = "0";
  tooltip.style.pointerEvents = "none";
  tooltip.style.transform = "translateY(2px)";
  tooltip.style.transition = "opacity 120ms ease, transform 120ms ease";
  let tooltipTimer = null;
  const showTooltip = (message) => {
    tooltip.textContent = message;
    tooltip.style.opacity = "1";
    tooltip.style.transform = "translateY(0)";
    if (tooltipTimer) clearTimeout(tooltipTimer);
    tooltipTimer = setTimeout(() => {
      tooltip.style.opacity = "0";
      tooltip.style.transform = "translateY(2px)";
      tooltipTimer = null;
    }, 1700);
  };

  copyButton.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  copyButton.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const copied = await treeherderCopyText(markdownTable);
    showTooltip(copied ? "Markdown table copied into clipboard" : "Failed to copy markdown table");
    copyButton.title = copied ? "Copied" : "Copy failed";
    setTimeout(() => {
      copyButton.title = "Copy markdown table";
    }, 1500);
    setButtonHoverStyle();
  });
  copyWrap.appendChild(copyButton);
  copyWrap.appendChild(tooltip);
  summary.appendChild(copyWrap);
  details.appendChild(summary);

  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.style.fontSize = "12px";
  table.style.marginTop = "8px";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const header of parsed.headers) {
    const th = document.createElement("th");
    th.textContent = header;
    th.style.textAlign = "left";
    th.style.borderBottom = "1px solid #d8dee4";
    th.style.padding = "6px 8px";
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const row of parsed.rows) {
    const tr = document.createElement("tr");
    for (const cell of row) {
      const td = document.createElement("td");
      td.textContent = cell;
      td.style.borderBottom = "1px solid #eef2f7";
      td.style.padding = "6px 8px";
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  details.appendChild(table);
  container.appendChild(details);

  panel.prepend(container);
  treeherderLog("Injected macrobenchmark table into Performance panel", {
    headers: parsed.headers.length,
    rows: parsed.rows.length
  });
  return true;
}

async function treeherderHandleMacrobenchmarkPerformanceTable(taskId, runId, artifacts, jobName, requestId) {
  if (!treeherderShouldShowMacrobenchmarkTable(jobName)) {
    treeherderLog("Skipping macrobenchmark table: job name does not match", { jobName });
    treeherderRemoveMacrobenchmarkPerformanceTable();
    return;
  }

  const cacheKey = `${taskId}:${runId}`;
  let markdownTable = null;
  if (treeherderLastMacrobenchmarkKey === cacheKey) {
    treeherderLog("Using cached macrobenchmark table", { cacheKey });
    markdownTable = treeherderLastMacrobenchmarkTable;
  } else {
    treeherderLog("Loading macrobenchmark table", { cacheKey });
    markdownTable = await treeherderFetchMacrobenchmarkTable(taskId, runId, artifacts);
    if (treeherderActiveRequestId !== requestId) return;
    treeherderLastMacrobenchmarkKey = cacheKey;
    treeherderLastMacrobenchmarkTable = markdownTable;
  }

  if (!markdownTable) {
    treeherderLog("No macrobenchmark table available for selected job", { cacheKey });
    treeherderRemoveMacrobenchmarkPerformanceTable();
    return;
  }
  treeherderInjectMacrobenchmarkPerformanceTable(markdownTable);
}

function treeherderInjectSummaryLink(summary, url) {
  let container = summary.querySelector(".firebase-testlab-link");
  if (container) {
    const anchor = container.querySelector("a");
    if (anchor) anchor.href = url;
    if (!container.querySelector("br")) {
      container.appendChild(document.createElement("br"));
    }
    return;
  }

  const jobItems = summary.querySelectorAll("li.small");
  let jobLi = null;
  for (const li of jobItems) {
    const strong = li.querySelector("strong");
    if (!strong) continue;
    const label = (strong.textContent || "").trim().toLowerCase();
    if (label.startsWith("job name")) {
      jobLi = li;
      break;
    }
  }
  if (!jobLi) return;

  const div = document.createElement("div");
  div.className = "firebase-testlab-link";
  div.style.marginTop = "6px";

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  const icon = document.createElement("img");
  icon.src = TREEHERDER_FIREBASE_ICON;
  icon.alt = "";
  icon.width = 16;
  icon.height = 16;
  icon.style.verticalAlign = "middle";
  icon.style.marginRight = "6px";
  icon.style.display = "inline-block";
  icon.style.filter = "drop-shadow(0 1px 1px rgba(0,0,0,0.1))";

  const label = document.createElement("span");
  label.textContent = "Firebase TestLab";
  label.style.color = "#1a73e8";
  label.style.fontWeight = "normal";
  label.style.textDecoration = "none";

  anchor.appendChild(icon);
  anchor.appendChild(label);

  const br = document.createElement("br");
  div.appendChild(anchor);
  div.appendChild(br);
  jobLi.appendChild(div);
}

function treeherderRemoveSummaryLink() {
  const el = document.querySelector(".firebase-testlab-link");
  if (el) el.remove();
}

function treeherderInsertBeforeDropdown(nav, li) {
  if (!nav) return;
  const dropdownLi =
    nav.querySelector("li.ml-auto") ||
    [...nav.children].reverse().find((child) => child.tagName === "LI");
  if (dropdownLi) {
    nav.insertBefore(li, dropdownLi);
  } else {
    nav.appendChild(li);
  }
}

function treeherderInjectNavbarIcon(url) {
  const nav = document.querySelector(".nav.actionbar-nav");
  if (!nav) return;

  let li = nav.querySelector(".firebase-testlab-nav");
  if (li) {
    const anchor = li.querySelector("a");
    if (anchor) anchor.href = url;
    return;
  }

  li = document.createElement("li");
  li.className = "firebase-testlab-nav";

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.title = "Open Firebase TestLab";
  anchor.style.textDecoration = "none";

  const img = document.createElement("img");
  img.src = TREEHERDER_FIREBASE_ICON;
  img.alt = "Firebase TestLab";
  img.width = 20;
  img.height = 20;
  img.style.display = "inline-block";
  img.style.marginLeft = "8px";

  anchor.appendChild(img);
  li.appendChild(anchor);

  treeherderInsertBeforeDropdown(nav, li);
}

function treeherderRemoveNavbarIcon() {
  const el = document.querySelector(".firebase-testlab-nav");
  if (el) el.remove();
}

function treeherderInjectUnitTestsIcon(url) {
  const nav = document.querySelector(".nav.actionbar-nav");
  if (!nav) return;

  let li = nav.querySelector(".treeherder-unit-tests-nav");
  if (li) {
    const anchor = li.querySelector("a");
    if (anchor) anchor.href = url;
    return;
  }

  li = document.createElement("li");
  li.className = "treeherder-unit-tests-nav";

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.title = "Open unit test results";
  anchor.ariaLabel = "Open unit test results";
  anchor.style.textDecoration = "none";

  const img = document.createElement("img");
  img.src = TREEHERDER_TESTS_ICON;
  img.alt = "";
  img.width = 20;
  img.height = 20;
  img.style.display = "inline-block";
  img.style.marginLeft = "8px";

  anchor.appendChild(img);
  li.appendChild(anchor);

  treeherderInsertBeforeDropdown(nav, li);
}

function treeherderRemoveUnitTestsIcon() {
  const el = document.querySelector(".treeherder-unit-tests-nav");
  if (el) el.remove();
}

function treeherderResetUI() {
  treeherderRemoveSummaryLink();
  treeherderRemoveNavbarIcon();
  treeherderLastTaskId = null;
  treeherderLastFirebaseLink = null;
  treeherderLastUnitTestsLink = null;
  treeherderLastMacrobenchmarkKey = null;
  treeherderLastMacrobenchmarkTable = null;
  treeherderLastMacrobenchmarkSkipKey = null;
  treeherderRemoveUnitTestsIcon();
  treeherderRemoveMacrobenchmarkPerformanceTable();
  treeherderActiveRequestId++;
}

function treeherderInit() {
  treeherderStorage.sync.get(treeherderDefaults).then((items) => {
    treeherderEnabled = items.enableTreeherder ?? true;
    treeherderUnitTestsEnabled = items.enableTreeherderUnitTests ?? true;
    treeherderMacrobenchmarkTableEnabled = items.enableTreeherderMacrobenchmarkTable ?? true;
    if (treeherderHasActiveFeatures()) {
      treeherderEnsureObserver();
      treeherderTryInjectForCurrentJob();
    }
  });

  treeherderRuntime.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    let updated = false;
    if (changes.enableTreeherder) {
      treeherderEnabled = changes.enableTreeherder.newValue;
      updated = true;
    }
    if (changes.enableTreeherderUnitTests) {
      treeherderUnitTestsEnabled = changes.enableTreeherderUnitTests.newValue;
      updated = true;
    }
    if (changes.enableTreeherderMacrobenchmarkTable) {
      treeherderMacrobenchmarkTableEnabled = changes.enableTreeherderMacrobenchmarkTable.newValue;
      updated = true;
    }
    if (!updated) return;
    if (treeherderHasActiveFeatures()) {
      treeherderEnsureObserver();
      treeherderTryInjectForCurrentJob();
    } else {
      treeherderDisconnectObserver();
      treeherderResetUI();
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    treeherderEnsureObserver();
    treeherderInit();
  });
} else {
  treeherderEnsureObserver();
  treeherderInit();
}
function treeherderGetExtensionURL(path) {
  const runtime = treeherderRuntime.runtime ?? treeherderRuntime;
  try {
    return runtime.getURL(path);
  } catch (error) {
    return path;
  }
}
