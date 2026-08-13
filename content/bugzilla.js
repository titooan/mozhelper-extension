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

function bugzillaExtractHtmlFragment(htmlText) {
  if (!htmlText) return "";
  const startMarker = "<!--StartFragment-->";
  const endMarker = "<!--EndFragment-->";
  const startIdx = htmlText.indexOf(startMarker);
  const endIdx = htmlText.indexOf(endMarker);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return htmlText.slice(startIdx + startMarker.length, endIdx);
  }
  return htmlText;
}

function bugzillaDecodeEntities(text) {
  if (!text) return "";
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ");
}

function bugzillaStripHtmlPreservingText(text) {
  if (!text) return "";
  let output = text.replace(/<br\s*\/?>/gi, "\n");
  output = output.replace(/<\/(p|div|li|ul|ol|tr|table|blockquote)>/gi, "\n");
  output = output.replace(/<[^>]+>/g, "");
  output = output.replace(/\r\n/g, "\n");
  output = bugzillaDecodeEntities(output);
  return output.replace(/\u00a0/g, " ");
}

function bugzillaParseClipboardHTML(htmlText) {
  if (!htmlText) return null;
  const fragment = bugzillaExtractHtmlFragment(htmlText);
  if (!fragment) return null;
  let containsLink = false;
  let firstLinkURL = null;
  let firstLinkText = null;
  const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let replaced = fragment.replace(anchorRegex, (match, attrPart, inner) => {
    const hrefMatch = attrPart.match(/href\s*=\s*["']([^"']+)["']/i);
    if (!hrefMatch) return bugzillaStripHtmlPreservingText(inner);
    const rawHref = hrefMatch[1]?.trim();
    if (!rawHref || !bugzillaIsLikelyURL(rawHref)) {
      return bugzillaStripHtmlPreservingText(inner);
    }
    const cleanURL = /^https?:\/\//i.test(rawHref) ? rawHref : `https://${rawHref}`;
    const anchorText = bugzillaStripHtmlPreservingText(inner).replace(/\s+/g, " ").trim();
    if (!anchorText) return "";
    if (!firstLinkURL) {
      firstLinkURL = cleanURL;
      firstLinkText = anchorText;
    }
    containsLink = true;
    return `[${anchorText}](${cleanURL})`;
  });
  replaced = bugzillaStripHtmlPreservingText(replaced);
  if (!replaced.trim()) return containsLink ? { text: "", containsLink, firstLinkURL, firstLinkText } : null;
  return {
    text: replaced,
    containsLink,
    firstLinkURL,
    firstLinkText
  };
}

function bugzillaMarkdownTransform(original, selectionStart, selectionEnd, pastedURL, replacementText = null) {
  const before = original.slice(0, selectionStart);
  const selected = replacementText != null ? replacementText : original.slice(selectionStart, selectionEnd);
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

function bugzillaInsertText(original, selectionStart, selectionEnd, insertion) {
  const before = original.slice(0, selectionStart);
  const after = original.slice(selectionEnd);
  const text = before + insertion + after;
  const caret = before.length + insertion.length;
  return { text, caret };
}

function bugzillaGetPasteUpdate(original, selectionStart, selectionEnd, selectedText, plainText, htmlText) {
  if (bugzillaSelectionOverlapsMarkdown(original, selectionStart, selectionEnd)) return null;
  const selection = selectedText ?? "";
  const hasSelection = selection.length > 0;
  const htmlInfo = bugzillaParseClipboardHTML(htmlText);
  const plainIsURL = plainText ? bugzillaIsLikelyURL(plainText) : false;

  if (hasSelection) {
    if (bugzillaIsLikelyURL(selection)) return null;
    if (plainIsURL) {
      return bugzillaMarkdownTransform(original, selectionStart, selectionEnd, plainText);
    }
    if (htmlInfo?.containsLink && htmlInfo.text) {
      return bugzillaInsertText(original, selectionStart, selectionEnd, htmlInfo.text);
    }
    return null;
  }

  if (htmlInfo?.containsLink && htmlInfo.text) {
    return bugzillaInsertText(original, selectionStart, selectionEnd, htmlInfo.text);
  }

  return null;
}

const bugzillaStorage = (typeof browser !== "undefined" ? browser.storage : chrome.storage);
const bugzillaDefaultSettings = {
  enableBugzilla: true,
  enableBugzillaTakeAndAssign: true
};
let bugzillaEnabled = true;
let bugzillaTakeAndAssignEnabled = true;

function bugzillaHandleTakeAndAssignClick(event) {
  const button = event.currentTarget;
  if (!bugzillaTakeAndAssignEnabled) return;

  const status = document.getElementById("bug_status");
  if (!status || !Array.from(status.options).some((option) => option.value === "ASSIGNED")) {
    return;
  }

  status.value = "ASSIGNED";
  status.dispatchEvent(new Event("change", { bubbles: true }));
}

function bugzillaSyncTakeAndAssignButtons(root = document) {
  const buttons = [];
  if (root.nodeType === Node.ELEMENT_NODE && root.matches(".take-btn")) {
    buttons.push(root);
  }
  if (root.querySelectorAll) {
    buttons.push(...root.querySelectorAll(".take-btn"));
  }
  buttons.forEach((button) => {
    if (button.dataset.mozhelperTakeLabel == null) {
      button.dataset.mozhelperTakeLabel = button.textContent.trim();
    }
    if (!button.dataset.mozhelperTakeAndAssignHandled) {
      button.addEventListener("click", bugzillaHandleTakeAndAssignClick);
      button.dataset.mozhelperTakeAndAssignHandled = "true";
    }
    const label = bugzillaTakeAndAssignEnabled
      ? "Take and assign"
      : button.dataset.mozhelperTakeLabel;
    if (button.textContent.trim() !== label) {
      button.textContent = label;
    }
  });
}

function bugzillaHandlePaste(event) {
  if (!bugzillaEnabled) return;
  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement)) return;
  if (target.id !== "comment") return;

  const start = target.selectionStart;
  const end = target.selectionEnd;
  if (start == null || end == null) return;

  const clipboard = event.clipboardData || window.clipboardData;
  if (!clipboard) return;
  const pasted = (clipboard.getData("text/plain") || "").trim();
  const html = clipboard.getData("text/html") || "";
  const selected = target.value.slice(start, end);

  const update = bugzillaGetPasteUpdate(target.value, start, end, selected, pasted, html);
  if (!update) return;

  event.preventDefault();
  target.value = update.text;
  target.setSelectionRange(update.caret, update.caret);
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
    bugzillaTakeAndAssignEnabled = items.enableBugzillaTakeAndAssign ?? true;
    bugzillaSyncTakeAndAssignButtons();
  });
  const runtime = (typeof browser !== "undefined" ? browser : chrome);
  runtime.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (changes.enableBugzilla) {
      bugzillaEnabled = changes.enableBugzilla.newValue;
    }
    if (changes.enableBugzillaTakeAndAssign) {
      bugzillaTakeAndAssignEnabled = changes.enableBugzillaTakeAndAssign.newValue;
      bugzillaSyncTakeAndAssignButtons();
    }
  });
  bugzillaAttachToCommentField();
  bugzillaSyncTakeAndAssignButtons();
  const observer = new MutationObserver((records) => {
    bugzillaAttachToCommentField();
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          bugzillaSyncTakeAndAssignButtons(node);
        }
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

bugzillaInit();
