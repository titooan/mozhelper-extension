// Treeherder Firebase TestLab helper (no ES modules)

const treeherderRuntime = (typeof browser !== "undefined" ? browser : chrome);
const treeherderStorage = treeherderRuntime.storage;
const treeherderDefaults = { enableTreeherder: true };
let treeherderEnabled = true;

const TREEHERDER_TC_BASE = "https://firefox-ci-tc.services.mozilla.com";
const TREEHERDER_FIREBASE_ICON =
  "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz48IS0tIFVwbG9hZGVkIHRvOiBTVkcgUmVwbywgd3d3LnN2Z3JlcG8uY29tLCBHZW5lcmF0b3I6IFNWRyBSZXBvIE1peGVyIFRvb2xzIC0tPgo8c3ZnIHdpZHRoPSI4MDBweCIgaGVpZ2h0PSI4MDBweCIgdmlld0JveD0iLTQ3LjUgMCAzNTEgMzUxIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiBwcmVzZXJ2ZUFzcGVjdFJhdGlvPSJ4TWlkWU1pZCI+PGRlZnM+PHBhdGggZD0iTTEuMjUzIDI4MC43MzJsMS42MDUtMy4xMzEgOTkuMzUzLTE4OC41MTgtNDQuMTUtODMuNDc1QzU0LjM5Mi0xLjI4MyA0NS4wNzQuNDc0IDQzLjg3IDguMTg4TDEuMjUzIDI4MC43MzJ6IiBpZD0iYSIvPjxmaWx0ZXIgeD0iLTUwJSIgeT0iLTUwJSIgd2lkdGg9IjIwMCUiIGhlaWdodD0iMjAwJSIgZmlsdGVyVW5pdHM9Im9iamVjdEJvdW5kaW5nQm94IiBpZD0iYiI+PGZlR2F1c3NpYW5CbHVyIHN0ZERldmlhdGlvbj0iMTcuNSIgaW49IlNvdXJjZUFscGhhIiByZXN1bHQ9InNoYWRvd0JsdXJJbm5lcjEiLz48ZmVPZmZzZXQgaW49InNoYWRvd0JsdXJJbm5lcjEiIHJlc3VsdD0ic2hhZG93T2Zmc2V0SW5uZXIxIi8+PGZlQ29tcG9zaXRlIGluPSJzaGFkb3dPZmZzZXRJbm5lcjEiIGluMj0iU291cmNlQWxwaGEiIG9wZXJhdG9yPSJhcml0aG1ldGljIiBrMj0iLTEiIGszPSIxIiByZXN1bHQ9InNoYWRvd0lubmVySW5uZXIxIi8+PGZlQ29sb3JNYXRyaXggdmFsdWVzPSIwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwLjA2IDAiIGluPSJzaGFkb3dJbm5lcklubmVyMSIvPjwvZmlsdGVyPjxwYXRoIGQ9Ik0xMzQuNDE3IDE0OC45NzRsMzIuMDM5LTMyLjgxMi0zMi4wMzktNjEuMDA3Yy0zLjA0Mi01Ljc5MS0xMC40MzMtNi4zOTgtMTMuNDQzLS41OWwtMTcuNzA1IDM0LjEwOS0uNTMgMS43NDQgMzEuNjc4IDU4LjU1NnoiIGlkPSJjIi8+PGZpbHRlciB4PSItNTAlIiB5PSItNTAlIiB3aWR0aD0iMjAwJSIgaGVpZ2h0PSIyMDAlIiBmaWx0ZXJVbml0cz0ib2JqZWN0Qm91bmRpbmdCb3giIGlkPSJkIj48ZmVHYXVzc2lhbkJsdXIgc3RkRGV2aWF0aW9uPSIzLjUiIGluPSJTb3VyY2VBbHBoYSIgcmVzdWx0PSJzaGFkb3dCbHVySW5uZXIxIi8+PGZlT2Zmc2V0IGR4PSIxIiBkeT0iLTkiIGluPSJzaGFkb3dCbHVySW5uZXIxIiByZXN1bHQ9InNoYWRvd09mZnNldElubmVyMSIvPjxmZUNvbXBvc2l0ZSBpbj0ic2hhZG93T2Zmc2V0SW5uZXIxIiBpbjI9IlNvdXJjZUFscGhhIiBvcGVyYXRvcj0iYXJpdGhtZXRpYyIgazI9Ii0xIiBrMz0iMSIgcmVzdWx0PSJzaGFkb3dJbm5lcklubmVyMSIvPjxmZUNvbG9yTWF0cml4IHZhbHVlcz0iMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMC4wOSAwIiBpbj0ic2hhZG93SW5uZXJJbm5lcjEiLz48L2ZpbHRlcj48L2RlZnM+PHBhdGggZD0iTTAgMjgyLjk5OGwyLjEyMy0yLjk3MkwxMDIuNTI3IDg5LjUxMmwuMjEyLTIuMDE3TDU4LjQ4IDQuMzU4QzU0Ljc3LTIuNjA2IDQ0LjMzLS44NDUgNDMuMTE0IDYuOTUxTDAgMjgyLjk5OHoiIGZpbGw9IiNGRkMyNEEiLz48dXNlIGZpbGw9IiNGRkE3MTIiIGZpbGwtcnVsZT0iZXZlbm9kZCIgeGxpbms6aHJlZj0iI2EiLz48dXNlIGZpbHRlcj0idXJsKCNiKSIgeGxpbms6aHJlZj0iI2EiLz48cGF0aCBkPSJNMTM1LjAwNSAxNTAuMzhsMzIuOTU1LTMzLjc1LTMyLjk2NS02Mi45M2MtMy4xMjktNS45NTctMTEuODY2LTUuOTc1LTE0Ljk2MiAwTDEwMi40MiA4Ny4yODd2Mi44NmwzMi41ODQgNjAuMjMzeiIgZmlsbD0iI0Y0QkQ2MiIvPjx1c2UgZmlsbD0iI0ZGQTUwRSIgZmlsbC1ydWxlPSJldmVub2RkIiB4bGluazpocmVmPSIjYyIvPjx1c2UgZmlsdGVyPSJ1cmwoI2QpIiB4bGluazpocmVmPSIjYyIvPjxwYXRoIGZpbGw9IiNGNjgyMEMiIGQ9Ik0wIDI4Mi45OThsLjk2Mi0uOTY4IDMuNDk2LTEuNDIgMTI4LjQ3Ny0xMjggMS42MjgtNC40MzEtMzIuMDUtNjEuMDc0eiIvPjxwYXRoIGQ9Ik0xMzkuMTIxIDM0Ny41NTFsMTE2LjI3NS02NC44NDctMzMuMjA0LTIwNC40OTVjLTEuMDM5LTYuMzk4LTguODg4LTguOTI3LTEzLjQ2OC00LjM0TDAgMjgyLjk5OGwxMTUuNjA4IDY0LjU0OGEyNC4xMjYgMjQuMTI2IDAgMCAwIDIzLjUxMy4wMDUiIGZpbGw9IiNGREUwNjgiLz48cGF0aCBkPSJNMjU0LjM1NCAyODIuMTZMMjIxLjQwMiA3OS4yMThjLTEuMDMtNi4zNS03LjU1OC04Ljk3Ny0xMi4xMDMtNC40MjRMMS4yOSAyODIuNmwxMTQuMzM5IDYzLjkwOGEyMy45NDMgMjMuOTQzIDAgMCAwIDIzLjMzNC4wMDZsMTE1LjM5Mi02NC4zNTV6IiBmaWxsPSIjRkNDQTNGIi8+PHBhdGggZD0iTTEzOS4xMiAzNDUuNjRhMjQuMTI2IDI0LjEyNiAwIDAgMS0yMy41MTItLjAwNUwuOTMxIDI4Mi4wMTVsLS45My45ODMgMTE1LjYwNyA2NC41NDhhMjQuMTI2IDI0LjEyNiAwIDAgMCAyMy41MTMuMDA1bDExNi4yNzUtNjQuODQ3LS4yODUtMS43NTItMTE1Ljk5IDY0LjY4OXoiIGZpbGw9IiNFRUFCMzciLz48L3N2Zz4=";
let treeherderObserver = null;
let treeherderLastTaskId = null;
let treeherderLastWebLink = null;

// keep logic duplicated here for runtime (tests live in src/treeherder/testlab.js)
function treeherderFindMatrixArtifact(artifacts) {
  if (!Array.isArray(artifacts)) return null;
  return artifacts.find((artifact) => typeof artifact?.name === "string" && artifact.name.endsWith("/matrix_ids.json")) || null;
}

function treeherderExtractWebLink(matrixJson) {
  if (!matrixJson || typeof matrixJson !== "object") return null;
  for (const entry of Object.values(matrixJson)) {
    if (entry && typeof entry === "object" && typeof entry.webLink === "string" && entry.webLink) {
      return entry.webLink;
    }
  }
  return null;
}

function treeherderEnsureObserver() {
  if (treeherderObserver || !document.body) return;
  treeherderObserver = new MutationObserver(() => {
    if (!treeherderEnabled) return;
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
  if (!treeherderEnabled) return;
  const summary = document.getElementById("summary-panel-content");
  if (!summary) return;

  const taskLink = summary.querySelector("#taskInfo");
  if (!taskLink) return;

  const taskId = (taskLink.textContent || "").trim();
  if (!taskId) return;

  if (taskId !== treeherderLastTaskId) {
    treeherderRemoveSummaryLink();
    treeherderRemoveNavbarIcon();
  }

  const webLink = await treeherderFetchWebLink(taskId);

  if (!webLink) {
    treeherderRemoveSummaryLink();
    treeherderRemoveNavbarIcon();
    treeherderLastTaskId = taskId;
    treeherderLastWebLink = null;
    return;
  }

  const changed = taskId !== treeherderLastTaskId || webLink !== treeherderLastWebLink;
  treeherderLastTaskId = taskId;
  treeherderLastWebLink = webLink;

  if (changed) {
    treeherderInjectSummaryLink(summary, webLink);
    treeherderInjectNavbarIcon(webLink);
  }
}

async function treeherderFetchWebLink(taskId) {
  try {
    const artifactsUrl = `${TREEHERDER_TC_BASE}/api/queue/v1/task/${taskId}/runs/0/artifacts`;
    const res = await fetch(artifactsUrl);
    if (!res.ok) return null;
    const json = await res.json();
    const matrixArtifact = treeherderFindMatrixArtifact(json?.artifacts);
    if (!matrixArtifact) return null;

    const matrixUrl = `${TREEHERDER_TC_BASE}/api/queue/v1/task/${taskId}/runs/0/artifacts/${matrixArtifact.name}`;
    const matrixRes = await fetch(matrixUrl);
    if (!matrixRes.ok) return null;
    const matrixJson = await matrixRes.json();
    return treeherderExtractWebLink(matrixJson);
  } catch (error) {
    console.warn("[MozHelper][Treeherder] Failed to fetch web link", error);
    return null;
  }
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

  const dropdownLi = nav.querySelector("li.ml-auto");
  if (dropdownLi) {
    nav.insertBefore(li, dropdownLi);
  } else {
    nav.appendChild(li);
  }
}

function treeherderRemoveNavbarIcon() {
  const el = document.querySelector(".firebase-testlab-nav");
  if (el) el.remove();
}

function treeherderResetUI() {
  treeherderRemoveSummaryLink();
  treeherderRemoveNavbarIcon();
  treeherderLastTaskId = null;
  treeherderLastWebLink = null;
}

function treeherderInit() {
  treeherderStorage.sync.get(treeherderDefaults).then((items) => {
    treeherderEnabled = items.enableTreeherder ?? true;
    if (treeherderEnabled) {
      treeherderEnsureObserver();
      treeherderTryInjectForCurrentJob();
    }
  });

  treeherderRuntime.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes.enableTreeherder) return;
    treeherderEnabled = changes.enableTreeherder.newValue;
    if (treeherderEnabled) {
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
