const runtime = typeof browser !== "undefined" ? browser : chrome;
const bugCache = new Map();

async function fetchBug(bugId) {
  if (bugCache.has(bugId)) {
    return bugCache.get(bugId);
  }
  try {
    const response = await fetch(`https://bugzilla.mozilla.org/rest/bug/${bugId}`, {
      credentials: "include"
    });
    if (response.status === 401 || response.status === 403) {
      const secure = { isSecure: true, id: bugId };
      bugCache.set(bugId, secure);
      return secure;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const bug = data?.bugs?.[0];
    if (bug) {
      bugCache.set(bugId, bug);
      return bug;
    }
    if (Array.isArray(data?.faults) || data?.error) {
      const secure = { isSecure: true, id: bugId };
      bugCache.set(bugId, secure);
      return secure;
    }
    bugCache.set(bugId, null);
    return null;
  } catch (error) {
    console.error("Bugzilla fetch failed:", error);
    bugCache.set(bugId, null);
    return null;
  }
}

runtime.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "moz-helper:getBugInfo") return;
  const bugId = String(message.bugId || "").trim();
  if (!bugId) {
    sendResponse({ bug: null });
    return;
  }
  fetchBug(bugId)
    .then((bug) => sendResponse({ bug }))
    .catch((error) => {
      console.error("Bugzilla fetch failed:", error);
      sendResponse({ bug: null });
    });
  return true;
});
