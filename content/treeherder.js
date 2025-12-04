// Treeherder helpers (Firebase TestLab & unit test shortcuts, no ES modules)

const treeherderRuntime = (typeof browser !== "undefined" ? browser : chrome);
const treeherderStorage = treeherderRuntime.storage;
const treeherderDefaults = { enableTreeherder: true, enableTreeherderUnitTests: true };
let treeherderEnabled = true;
let treeherderUnitTestsEnabled = true;

const TREEHERDER_TC_BASE = "https://firefox-ci-tc.services.mozilla.com";
const TREEHERDER_FIREBASE_ICON =
  "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz48IS0tIFVwbG9hZGVkIHRvOiBTVkcgUmVwbywgd3d3LnN2Z3JlcG8uY29tLCBHZW5lcmF0b3I6IFNWRyBSZXBvIE1peGVyIFRvb2xzIC0tPgo8c3ZnIHdpZHRoPSI4MDBweCIgaGVpZ2h0PSI4MDBweCIgdmlld0JveD0iLTQ3LjUgMCAzNTEgMzUxIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiBwcmVzZXJ2ZUFzcGVjdFJhdGlvPSJ4TWlkWU1pZCI+PGRlZnM+PHBhdGggZD0iTTEuMjUzIDI4MC43MzJsMS42MDUtMy4xMzEgOTkuMzUzLTE4OC41MTgtNDQuMTUtODMuNDc1QzU0LjM5Mi0xLjI4MyA0NS4wNzQuNDc0IDQzLjg3IDguMTg4TDEuMjUzIDI4MC43MzJ6IiBpZD0iYSIvPjxmaWx0ZXIgeD0iLTUwJSIgeT0iLTUwJSIgd2lkdGg9IjIwMCUiIGhlaWdodD0iMjAwJSIgZmlsdGVyVW5pdHM9Im9iamVjdEJvdW5kaW5nQm94IiBpZD0iYiI+PGZlR2F1c3NpYW5CbHVyIHN0ZERldmlhdGlvbj0iMTcuNSIgaW49IlNvdXJjZUFscGhhIiByZXN1bHQ9InNoYWRvd0JsdXJJbm5lcjEiLz48ZmVPZmZzZXQgaW49InNoYWRvd0JsdXJJbm5lcjEiIHJlc3VsdD0ic2hhZG93T2Zmc2V0SW5uZXIxIi8+PGZlQ29tcG9zaXRlIGluPSJzaGFkb3dPZmZzZXRJbm5lcjEiIGluMj0iU291cmNlQWxwaGEiIG9wZXJhdG9yPSJhcml0aG1ldGljIiBrMj0iLTEiIGszPSIxIiByZXN1bHQ9InNoYWRvd0lubmVySW5uZXIxIi8+PGZlQ29sb3JNYXRyaXggdmFsdWVzPSIwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwLjA2IDAiIGluPSJzaGFkb3dJbm5lcklubmVyMSIvPjwvZmlsdGVyPjxwYXRoIGQ9Ik0xMzQuNDE3IDE0OC45NzRsMzIuMDM5LTMyLjgxMi0zMi4wMzktNjEuMDA3Yy0zLjA0Mi01Ljc5MS0xMC40MzMtNi4zOTgtMTMuNDQzLS41OWwtMTcuNzA1IDM0LjEwOS0uNTMgMS43NDQgMzEuNjc4IDU4LjU1NnoiIGlkPSJjIi8+PGZpbHRlciB4PSItNTAlIiB5PSItNTAlIiB3aWR0aD0iMjAwJSIgaGVpZ2h0PSIyMDAlIiBmaWx0ZXJVbml0cz0ib2JqZWN0Qm91bmRpbmdCb3giIGlkPSJkIj48ZmVHYXVzc2lhbkJsdXIgc3RkRGV2aWF0aW9uPSIzLjUiIGluPSJTb3VyY2VBbHBoYSIgcmVzdWx0PSJzaGFkb3dCbHVySW5uZXIxIi8+PGZlT2Zmc2V0IGR4PSIxIiBkeT0iLTkiIGluPSJzaGFkb3dCbHVySW5uZXIxIiByZXN1bHQ9InNoYWRvd09mZnNldElubmVyMSIvPjxmZUNvbXBvc2l0ZSBpbj0ic2hhZG93T2Zmc2V0SW5uZXIxIiBpbjI9IlNvdXJjZUFscGhhIiBvcGVyYXRvcj0iYXJpdGhtZXRpYyIgazI9Ii0xIiBrMz0iMSIgcmVzdWx0PSJzaGFkb3dJbm5lcklubmVyMSIvPjxmZUNvbG9yTWF0cml4IHZhbHVlcz0iMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMC4wOSAwIiBpbj0ic2hhZG93SW5uZXJJbm5lcjEiLz48L2ZpbHRlcj48L2RlZnM+PHBhdGggZD0iTTAgMjgyLjk5OGwyLjEyMy0yLjk3MkwxMDIuNTI3IDg5LjUxMmwuMjEyLTIuMDE3TDU4LjQ4IDQuMzU4QzU0Ljc3LTIuNjA2IDQ0LjMzLS44NDUgNDMuMTE0IDYuOTUxTDAgMjgyLjk5OHoiIGZpbGw9IiNGRkMyNEEiLz48dXNlIGZpbGw9IiNGRkE3MTIiIGZpbGwtcnVsZT0iZXZlbm9kZCIgeGxpbms6aHJlZj0iI2EiLz48dXNlIGZpbHRlcj0idXJsKCNiKSIgeGxpbms6aHJlZj0iI2EiLz48cGF0aCBkPSJNMTM1LjAwNSAxNTAuMzhsMzIuOTU1LTMzLjc1LTMyLjk2NS02Mi45M2MtMy4xMjktNS45NTctMTEuODY2LTUuOTc1LTE0Ljk2MiAwTDEwMi40MiA4Ny4yODd2Mi44NmwzMi41ODQgNjAuMjMzeiIgZmlsbD0iI0Y0QkQ2MiIvPjx1c2UgZmlsbD0iI0ZGQTUwRSIgZmlsbC1ydWxlPSJldmVub2RkIiB4bGluazpocmVmPSIjYyIvPjx1c2UgZmlsdGVyPSJ1cmwoI2QpIiB4bGluazpocmVmPSIjYyIvPjxwYXRoIGZpbGw9IiNGNjgyMEMiIGQ9Ik0wIDI4Mi45OThsLjk2Mi0uOTY4IDMuNDk2LTEuNDIgMTI4LjQ3Ny0xMjggMS42MjgtNC40MzEtMzIuMDUtNjEuMDc0eiIvPjxwYXRoIGQ9Ik0xMzkuMTIxIDM0Ny41NTFsMTE2LjI3NS02NC44NDctMzMuMjA0LTIwNC40OTVjLTEuMDM5LTYuMzk4LTguODg4LTguOTI3LTEzLjQ2OC00LjM0TDAgMjgyLjk5OGwxMTUuNjA4IDY0LjU0OGEyNC4xMjYgMjQuMTI2IDAgMCAwIDIzLjUxMy4wMDUiIGZpbGw9IiNGREUwNjgiLz48cGF0aCBkPSJNMjU0LjM1NCAyODIuMTZMMjIxLjQwMiA3OS4yMThjLTEuMDMtNi4zNS03LjU1OC04Ljk3Ny0xMi4xMDMtNC40MjRMMS4yOSAyODIuNmwxMTQuMzM5IDYzLjkwOGEyMy45NDMgMjMuOTQzIDAgMCAwIDIzLjMzNC4wMDZsMTE1LjM5Mi02NC4zNTV6IiBmaWxsPSIjRkNDQTNGIi8+PHBhdGggZD0iTTEzOS4xMiAzNDUuNjRhMjQuMTI2IDI0LjEyNiAwIDAgMS0yMy41MTItLjAwNUwuOTMxIDI4Mi4wMTVsLS45My45ODMgMTE1LjYwNyA2NC41NDhhMjQuMTI2IDI0LjEyNiAwIDAgMCAyMy41MTMuMDA1bDExNi4yNzUtNjQuODQ3LS4yODUtMS43NTItMTE1Ljk5IDY0LjY4OXoiIGZpbGw9IiNFRUFCMzciLz48L3N2Zz4=";
const TREEHERDER_TESTS_ICON = treeherderGetExtensionURL("icons/tests_icon.png");
let treeherderObserver = null;
let treeherderLastTaskId = null;
let treeherderLastRunId = null;
let treeherderLastFirebaseLink = null;
let treeherderLastUnitTestsLink = null;
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
  return Boolean(treeherderEnabled || treeherderUnitTestsEnabled);
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
    runId
  });

  if (taskChanged) {
    treeherderRemoveSummaryLink();
    treeherderRemoveNavbarIcon();
    treeherderRemoveUnitTestsIcon();
  }

  const needsArtifacts = treeherderEnabled || treeherderUnitTestsEnabled;
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
  treeherderRemoveUnitTestsIcon();
  treeherderActiveRequestId++;
}

function treeherderInit() {
  treeherderStorage.sync.get(treeherderDefaults).then((items) => {
    treeherderEnabled = items.enableTreeherder ?? true;
    treeherderUnitTestsEnabled = items.enableTreeherderUnitTests ?? true;
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
