// Bugzilla markdown paste helper (no ES modules)

// keep logic duplicated here for runtime (tests use src/bugzilla/mdPaste.js)
const FILE_EXTENSIONS = [
  "png","jpg","jpeg","gif","bmp","svg","webp",
  "mp4","mov","m4v","avi","mkv","webm",
  "pdf","txt","md","zip","gz","tar","rar",
  "css","js","ts","html","json","xml"
];

function bugzillaIsLikelyURL(text) {
  if (!text) return false;
  const t = text.trim();
  if (/^https?:\/\/[^\"\s]+$/i.test(t)) return true;
  const match = /^[a-z0-9.-]+\.([a-z]{2,24})(\/[^\"\s]*)?$/i.exec(t);
  if (match) {
    const tld = match[1].toLowerCase();
    if (!FILE_EXTENSIONS.includes(tld)) return true;
  }
  return false;
}

function bugzillaSelectionOverlapsMarkdown(text, selectionStart, selectionEnd) {
  if (!text) return false;
  const regex = /\[[^\]]+\]\([^)]+\)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;
    if (selectionStart >= matchStart && selectionEnd <= matchEnd) {
      return true;
    }
  }
  return false;
}

function bugzillaShouldTransformPaste(original, selectionStart, selectionEnd, selectedText, pastedText) {
  if (!selectedText || !pastedText) return false;
  if (!bugzillaIsLikelyURL(pastedText)) return false;
  if (bugzillaIsLikelyURL(selectedText)) return false;
  if (bugzillaSelectionOverlapsMarkdown(original, selectionStart, selectionEnd)) return false;
  return true;
}

function bugzillaMarkdownTransform(original, selectionStart, selectionEnd, pastedURL) {
  const before = original.slice(0, selectionStart);
  const selected = original.slice(selectionStart, selectionEnd);
  const after = original.slice(selectionEnd);
  const cleanURL = /^https?:\/\//i.test(pastedURL) ? pastedURL : `https://${pastedURL}`;
  const markdown = `[${selected}](${cleanURL})`;
  const text = before + markdown + after;
  const caret = before.length + markdown.length;
  return { text, caret };
}

function bugzillaMarkdownReplace(original, selectionStart, selectionEnd, pastedURL) {
  return bugzillaMarkdownTransform(original, selectionStart, selectionEnd, pastedURL).text;
}

const bugzillaStorage = (typeof browser !== "undefined" ? browser.storage : chrome.storage);
const bugzillaDefaultSettings = { enableBugzilla: true };
let bugzillaEnabled = true;

function bugzillaHandlePaste(event) {
  if (!bugzillaEnabled) return;
  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement)) return;
  if (target.id !== "comment") return;

  const start = target.selectionStart;
  const end = target.selectionEnd;
  if (start == null || end == null || start === end) return;

  const clipboard = event.clipboardData || window.clipboardData;
  if (!clipboard) return;
  const pasted = (clipboard.getData("text/plain") || "").trim();
  const selected = target.value.slice(start, end);

  if (!bugzillaShouldTransformPaste(target.value, start, end, selected, pasted)) return;

  event.preventDefault();
  const { text, caret } = bugzillaMarkdownTransform(target.value, start, end, pasted);
  target.value = text;
  target.setSelectionRange(caret, caret);
  target.dispatchEvent(new Event("input", { bubbles: true }));
}

function bugzillaAttachToCommentField() {
  const field = document.getElementById("comment");
  if (field && !field.dataset.mdPasteHandled) {
    field.addEventListener("paste", bugzillaHandlePaste, true);
    field.dataset.mdPasteHandled = "true";
  }
}

function bugzillaInit() {
  bugzillaStorage.sync.get(bugzillaDefaultSettings).then((items) => {
    bugzillaEnabled = items.enableBugzilla ?? true;
  });
  const runtime = (typeof browser !== "undefined" ? browser : chrome);
  runtime.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (changes.enableBugzilla) {
      bugzillaEnabled = changes.enableBugzilla.newValue;
    }
  });
  bugzillaAttachToCommentField();
  const observer = new MutationObserver(() => bugzillaAttachToCommentField());
  observer.observe(document.body, { childList: true, subtree: true });
}

bugzillaInit();
