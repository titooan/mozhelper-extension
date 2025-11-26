// Gmail Bugzilla linkifier (no ES modules)

const gmailRuntime = (typeof browser !== "undefined" ? browser : chrome);
const gmailStorage = gmailRuntime.storage;
const gmailDefaultSettings = { enableGmail: true };
let gmailEnabled = true;

const GMAIL_BUG_REGEX = /\bBug (\d+)\b/g;
const gmailBugCache = {};
let gmailCurrentHoverBugId = null;

// keep tooltip logic duplicated here for runtime (tests live in src/gmail/tooltip.js)
const GMAIL_TYPE_META = {
  defect: {
    label: "Defect",
    color: "#d93025",
    draw(svg, color) {
      const body = document.createElementNS("http://www.w3.org/2000/svg", "path");
      body.setAttribute("fill", color);
      body.setAttribute(
        "d",
        "M12 5a3 3 0 0 1 3 3v1h1.5a.5.5 0 0 1 0 1H15v2h1.5a.5.5 0 0 1 0 1H15v1a3 3 0 0 1-6 0v-1H7.5a.5.5 0 0 1 0-1H9v-2H7.5a.5.5 0 0 1 0-1H9V8a3 3 0 0 1 3-3z"
      );
      const antennaLeft = document.createElementNS("http://www.w3.org/2000/svg", "path");
      antennaLeft.setAttribute("stroke", color);
      antennaLeft.setAttribute("stroke-width", "1.2");
      antennaLeft.setAttribute("stroke-linecap", "round");
      antennaLeft.setAttribute("d", "M10 4.5L8.5 3");
      const antennaRight = document.createElementNS("http://www.w3.org/2000/svg", "path");
      antennaRight.setAttribute("stroke", color);
      antennaRight.setAttribute("stroke-width", "1.2");
      antennaRight.setAttribute("stroke-linecap", "round");
      antennaRight.setAttribute("d", "M14 4.5L15.5 3");
      svg.appendChild(body);
      svg.appendChild(antennaLeft);
      svg.appendChild(antennaRight);
    }
  },
  task: {
    label: "Task",
    color: "#1a73e8",
    draw(svg, color) {
      const clipboard = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      clipboard.setAttribute("x", "7");
      clipboard.setAttribute("y", "6");
      clipboard.setAttribute("width", "10");
      clipboard.setAttribute("height", "12");
      clipboard.setAttribute("rx", "2");
      clipboard.setAttribute("fill", color);
      const check = document.createElementNS("http://www.w3.org/2000/svg", "path");
      check.setAttribute("fill", "#fff");
      check.setAttribute("d", "M10.2 12.8l1.4 1.4 3.2-3.4.8.8-4.0 4.3-2.2-2.3z");
      svg.appendChild(clipboard);
      svg.appendChild(check);
    }
  },
  enhancement: {
    label: "Enhancement",
    color: "#0d9488",
    draw(svg, color) {
      const star = document.createElementNS("http://www.w3.org/2000/svg", "path");
      star.setAttribute("fill", color);
      star.setAttribute(
        "d",
        "M12 4.5l1.7 3.7 4 .3-3 2.8.9 3.9-3.6-2.1-3.6 2.1.9-3.9-3-2.8 4-.3z"
      );
      svg.appendChild(star);
    }
  }
};

const gmailTooltip = (() => {
  const tip = document.createElement("div");
  tip.style.position = "fixed";
  tip.style.zIndex = 2147483647;
  tip.style.background = "white";
  tip.style.border = "1px solid #d1d5db";
  tip.style.borderRadius = "8px";
  tip.style.padding = "10px 12px";
  tip.style.boxShadow = "0 2px 12px rgba(15,23,42,0.24)";
  tip.style.maxWidth = "340px";
  tip.style.fontSize = "13px";
  tip.style.lineHeight = "1.5";
  tip.style.display = "none";
  tip.style.pointerEvents = "none";
  tip.style.backgroundImage = "linear-gradient(135deg, #fff, #f8fafc)";
  tip.style.color = "#111827";
  return tip;
})();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", gmailEnsureTooltipAttached);
} else {
  gmailEnsureTooltipAttached();
}

function gmailEnsureTooltipAttached() {
  if (!gmailTooltip.isConnected && document.body) {
    document.body.appendChild(gmailTooltip);
  }
}

async function gmailFetchBugInfo(bugId) {
  if (Object.prototype.hasOwnProperty.call(gmailBugCache, bugId)) {
    return gmailBugCache[bugId];
  }
  try {
    const response = await gmailRuntime.runtime.sendMessage({
      type: "moz-helper:getBugInfo",
      bugId
    });
    const bug = response?.bug ?? null;
    gmailBugCache[bugId] = bug;
    return bug;
  } catch (err) {
    console.error("Bugzilla fetch failed:", err);
    gmailBugCache[bugId] = null;
    return null;
  }
}

function gmailPositionTooltip(x, y) {
  gmailTooltip.style.left = x + 14 + "px";
  gmailTooltip.style.top = y + 14 + "px";
}

function gmailShowTooltipLoading(x, y) {
  gmailEnsureTooltipAttached();
  gmailTooltip.textContent = "Loading bug details…";
  gmailTooltip.style.display = "block";
  gmailPositionTooltip(x, y);
}

function gmailCreateTypeIconElement(typeMeta) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.style.flex = "0 0 auto";
  svg.style.marginRight = "4px";
  svg.style.filter = "drop-shadow(0 1px 1px rgba(0,0,0,0.1))";
  typeMeta.draw(svg, typeMeta.color);
  return svg;
}

function gmailGetTypeMeta(type) {
  const key = (type || "").toLowerCase();
  if (GMAIL_TYPE_META[key]) return GMAIL_TYPE_META[key];
  const color = "#64748b";
  return {
    label: type ? type.charAt(0).toUpperCase() + type.slice(1) : "Unknown",
    color,
    draw(svg) {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", "12");
      circle.setAttribute("cy", "12");
      circle.setAttribute("r", "6");
      circle.setAttribute("fill", color);
      svg.appendChild(circle);
    }
  };
}

function gmailBuildRow(label, value) {
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "6px";
  row.style.whiteSpace = "pre-wrap";
  const labelSpan = document.createElement("span");
  labelSpan.style.fontWeight = "600";
  labelSpan.textContent = `${label}:`;
  const valueSpan = document.createElement("span");
  valueSpan.style.flex = "1";
  valueSpan.textContent = value;
  row.appendChild(labelSpan);
  row.appendChild(valueSpan);
  return row;
}

function gmailBuildTypeRow(typeMeta) {
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "6px";
  const labelSpan = document.createElement("span");
  labelSpan.style.fontWeight = "600";
  labelSpan.textContent = "Type:";
  const valueSpan = document.createElement("span");
  valueSpan.style.display = "inline-flex";
  valueSpan.style.alignItems = "center";
  valueSpan.style.gap = "4px";
  valueSpan.style.fontWeight = "500";
  valueSpan.style.color = typeMeta.color;
  valueSpan.appendChild(gmailCreateTypeIconElement(typeMeta));
  const text = document.createElement("span");
  text.textContent = typeMeta.label;
  valueSpan.appendChild(text);
  row.appendChild(labelSpan);
  row.appendChild(valueSpan);
  return row;
}

function gmailFormatAssignee(assignedTo, detail) {
  const email = (assignedTo || "").trim();
  if (!email || email === "nobody@mozilla.org") return "Unassigned";
  const realName = detail?.real_name?.trim();
  if (realName) return realName;
  return email;
}

function gmailFormatStatus(status, resolution) {
  if (!status) return "";
  return `${status}${resolution ? ` ${resolution}` : ""}`.trim();
}

function gmailRenderTooltip(bug, x, y) {
  if (!bug) {
    gmailHideTooltip();
    return;
  }
  gmailEnsureTooltipAttached();
  gmailTooltip.replaceChildren();
  if (bug.isSecure) {
    const title = document.createElement("strong");
    title.textContent = `Bug ${bug.id}`;
    gmailTooltip.appendChild(title);
    const message = document.createElement("div");
    message.style.marginTop = "6px";
    message.textContent = "This is a security-restricted bug. Open it in Bugzilla to view details.";
    gmailTooltip.appendChild(message);
  } else {
    const title = document.createElement("strong");
    title.textContent = bug.summary || `Bug ${bug.id}`;
    gmailTooltip.appendChild(title);
    const metaWrap = document.createElement("div");
    metaWrap.style.display = "flex";
    metaWrap.style.flexDirection = "column";
    metaWrap.style.marginTop = "6px";
    metaWrap.style.gap = "4px";
    const typeMeta = gmailGetTypeMeta(bug.type);
    metaWrap.appendChild(gmailBuildTypeRow(typeMeta));
    const statusText = gmailFormatStatus(bug.status, bug.resolution);
    if (statusText) {
      metaWrap.appendChild(gmailBuildRow("Status", statusText));
    }
    metaWrap.appendChild(gmailBuildRow("Product", bug.product || "Unknown"));
    metaWrap.appendChild(gmailBuildRow("Component", bug.component || "Unknown"));
    metaWrap.appendChild(
      gmailBuildRow("Assignee", gmailFormatAssignee(bug.assigned_to, bug.assigned_to_detail))
    );
    gmailTooltip.appendChild(metaWrap);
  }
  gmailTooltip.style.display = "block";
  gmailPositionTooltip(x, y);
}

function gmailHideTooltip() {
  gmailTooltip.style.display = "none";
}

function gmailBuildBugURL(id) {
  return `https://bugzilla.mozilla.org/show_bug.cgi?id=${id}`;
}

function gmailLinkifyTextNode(textNode) {
  const text = textNode.nodeValue;
  if (!text) return;

  GMAIL_BUG_REGEX.lastIndex = 0;
  if (!GMAIL_BUG_REGEX.test(text)) return;
  if (textNode.parentNode.closest("a")) return;

  const frag = document.createDocumentFragment();
  let lastIndex = 0;
  GMAIL_BUG_REGEX.lastIndex = 0;
  text.replace(GMAIL_BUG_REGEX, (match, id, index) => {
    if (index > lastIndex) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex, index)));
    }
    const a = document.createElement("a");
    a.href = gmailBuildBugURL(id);
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = match;
    a.style.color = "#1a73e8";
    a.style.textDecoration = "underline";
    const swallow = (event) => {
      event.stopPropagation();
      if (event.type === "click") event.stopImmediatePropagation?.();
    };
    a.addEventListener("click", swallow);
    a.addEventListener("mousedown", swallow);
    a.addEventListener("mouseenter", (event) => {
      gmailCurrentHoverBugId = id;
      const coords = { x: event.clientX, y: event.clientY };
      gmailShowTooltipLoading(coords.x, coords.y);
      gmailFetchBugInfo(id).then((bug) => {
        if (gmailCurrentHoverBugId === id) gmailRenderTooltip(bug, coords.x, coords.y);
      });
    });
    a.addEventListener("mousemove", (event) => {
      if (gmailCurrentHoverBugId === id && gmailTooltip.style.display === "block") {
        gmailPositionTooltip(event.clientX, event.clientY);
      }
    });
    a.addEventListener("mouseleave", () => {
      if (gmailCurrentHoverBugId === id) gmailCurrentHoverBugId = null;
      gmailHideTooltip();
    });
    frag.appendChild(a);
    lastIndex = index + match.length;
  });
  if (lastIndex < text.length) {
    frag.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
  textNode.parentNode.replaceChild(frag, textNode);
}

function gmailLinkifyElement(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  for (const node of nodes) gmailLinkifyTextNode(node);
}

function gmailGetInboxSubjects() {
  return Array.from(document.querySelectorAll("span.bog"));
}
function gmailGetEmailSubject() {
  return document.querySelector("div.ha > h2");
}
function gmailGetEmailBodies() {
  return Array.from(document.querySelectorAll("div.a3s"));
}

function gmailProcessAllTargets() {
  if (!gmailEnabled) return;
  const inboxSubjects = gmailGetInboxSubjects();
  for (const s of inboxSubjects) {
    if (s.dataset.bugzillaLinked === "true") continue;
    gmailLinkifyElement(s);
    s.dataset.bugzillaLinked = "true";
  }
  const subject = gmailGetEmailSubject();
  if (subject && subject.dataset.bugzillaLinked !== "true") {
    gmailLinkifyElement(subject);
    subject.dataset.bugzillaLinked = "true";
  }
  const bodies = gmailGetEmailBodies();
  for (const body of bodies) {
    if (body.dataset.bugzillaLinked === "true") continue;
    gmailLinkifyElement(body);
    body.dataset.bugzillaLinked = "true";
  }
}

function gmailSetupObserver() {
  const observer = new MutationObserver((mutations) => {
    if (!gmailEnabled) return;
    let should = false;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (
          node.matches?.("span.bog") ||
          node.querySelector?.("span.bog") ||
          node.matches?.("div.ha > h2") ||
          node.querySelector?.("div.ha > h2") ||
          node.matches?.("div.a3s") ||
          node.querySelector?.("div.a3s")
        ) {
          should = true;
          break;
        }
      }
      if (should) break;
    }
    if (should) gmailProcessAllTargets();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function gmailInit() {
  gmailStorage.sync.get(gmailDefaultSettings).then((items) => {
    gmailEnabled = items.enableGmail ?? true;
    if (gmailEnabled) gmailProcessAllTargets();
  });
  const runtime = (typeof browser !== "undefined" ? browser : chrome);
  runtime.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (changes.enableGmail) {
      gmailEnabled = changes.enableGmail.newValue;
      if (gmailEnabled) gmailProcessAllTargets();
    }
  });
  gmailSetupObserver();
}

gmailInit();
