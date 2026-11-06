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
const bugzillaRuntime = (typeof browser !== "undefined" ? browser : chrome);
const bugzillaDefaultSettings = {
  enableBugzilla: true,
  enableBugzillaTakeAndAssign: true,
  enableBugzillaCopyLink: true
};
let bugzillaEnabled = true;
let bugzillaTakeAndAssignEnabled = true;
let bugzillaCopyLinkEnabled = true;

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

function bugzillaGetCopyPayload(bugId) {
  if (!/^\d+$/.test(String(bugId || ""))) return null;
  const text = `Bug ${bugId}`;
  const url = `https://bugzilla.mozilla.org/show_bug.cgi?id=${bugId}`;
  return { text, html: `<a href="${url}">${text}</a>`, url };
}

async function bugzillaCopyBugLink(button) {
  const bugLink = document.querySelector("#field-value-bug_id a[href]");
  if (!bugLink) return;
  let bugId;
  try {
    bugId = new URL(bugLink.href).searchParams.get("id");
  } catch (_error) {
    return;
  }
  const payload = bugzillaGetCopyPayload(bugId);
  if (!payload || !navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    bugzillaShowCopyStatus(button, false);
    return;
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({
      "text/plain": new Blob([payload.text], { type: "text/plain" }),
      "text/html": new Blob([payload.html], { type: "text/html" })
    })]);
    bugzillaShowCopyStatus(button, true);
  } catch (_error) {
    bugzillaShowCopyStatus(button, false);
  }
}

function bugzillaShowCopyStatus(button, copied) {
  const message = copied ? "Copied" : "Copy failed";
  button.setAttribute("aria-label", copied ? "Copy Bug link" : message);
  const tooltip = button.querySelector(".mozhelper-copy-bug-tooltip");
  if (tooltip) {
    tooltip.textContent = message;
    tooltip.hidden = false;
  }
  if (button._mozHelperStatusTimer) clearTimeout(button._mozHelperStatusTimer);
  button._mozHelperStatusTimer = setTimeout(() => {
    if (tooltip) tooltip.hidden = true;
    button.setAttribute("aria-label", "Copy Bug link");
  }, 1500);
}

function bugzillaIsDarkTheme(element) {
  let current = element;
  while (current) {
    const background = getComputedStyle(current).backgroundColor;
    const match = background.match(/rgba?\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)(?:,\s*([\d.]+))?\)/);
    if (match && (match[4] == null || Number(match[4]) > 0)) {
      const [red, green, blue] = match.slice(1, 4).map(Number);
      return (0.2126 * red + 0.7152 * green + 0.0722 * blue) < 128;
    }
    current = current.parentElement;
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function bugzillaApplyCopyButtonTheme(button) {
  const icon = button.querySelector("img");
  if (icon) icon.style.filter = bugzillaIsDarkTheme(button) ? "invert(1)" : "none";
}

function bugzillaSyncCopyButton() {
  const bugIdField = document.getElementById("field-value-bug_id");
  const existingButton = bugIdField?.querySelector(".mozhelper-copy-bug-link");
  if (!bugzillaCopyLinkEnabled) {
    existingButton?.remove();
    return;
  }
  const bugLink = bugIdField?.querySelector("a[href]");
  if (!bugLink) return;
  if (existingButton) {
    bugzillaApplyCopyButtonTheme(existingButton);
    return;
  }

  const button = document.createElement("button");
  const icon = document.createElement("img");
  const tooltip = document.createElement("span");
  const regularIcon = bugzillaRuntime.runtime.getURL("icons/copy-regular-full.svg");
  const solidIcon = bugzillaRuntime.runtime.getURL("icons/copy-solid-full.svg");
  button.type = "button";
  button.className = "mozhelper-copy-bug-link";
  button.title = "Copy Bug link";
  button.setAttribute("aria-label", "Copy Bug link");
  button.style.cssText = "position:relative;display:inline-flex;align-items:center;justify-content:center;margin-inline-start:6px;padding:2px;border:0;background:transparent;color:inherit;cursor:pointer;vertical-align:middle;";
  icon.src = regularIcon;
  icon.alt = "";
  icon.width = 14;
  icon.height = 14;
  icon.style.cssText = "display:block;width:14px;height:14px;";
  tooltip.className = "mozhelper-copy-bug-tooltip";
  tooltip.setAttribute("role", "status");
  tooltip.textContent = "Copied";
  tooltip.hidden = true;
  tooltip.style.cssText = "position:absolute;z-index:10000;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);padding:3px 7px;border-radius:3px;background:#222;color:#fff;font:12px/1.3 sans-serif;white-space:nowrap;pointer-events:none;";
  button.append(icon, tooltip);
  button.addEventListener("mouseenter", () => { icon.src = solidIcon; });
  button.addEventListener("mouseleave", () => { icon.src = regularIcon; });
  button.addEventListener("focus", () => { icon.src = solidIcon; });
  button.addEventListener("blur", () => { icon.src = regularIcon; });
  button.addEventListener("click", () => bugzillaCopyBugLink(button));
  bugLink.after(button);
  bugzillaApplyCopyButtonTheme(button);
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
    bugzillaCopyLinkEnabled = items.enableBugzillaCopyLink ?? true;
    bugzillaSyncTakeAndAssignButtons();
    bugzillaSyncCopyButton();
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
    if (changes.enableBugzillaCopyLink) {
      bugzillaCopyLinkEnabled = changes.enableBugzillaCopyLink.newValue ?? true;
      bugzillaSyncCopyButton();
    }
  });
  bugzillaAttachToCommentField();
  bugzillaSyncTakeAndAssignButtons();
  bugzillaSyncCopyButton();
  const observer = new MutationObserver((records) => {
    bugzillaAttachToCommentField();
    bugzillaSyncCopyButton();
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          bugzillaSyncTakeAndAssignButtons(node);
        }
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
  const themeObserver = new MutationObserver(() => bugzillaSyncCopyButton());
  [document.documentElement, document.body].filter(Boolean).forEach((element) => {
    themeObserver.observe(element, { attributes: true, attributeFilter: ["class", "style"] });
  });
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", bugzillaSyncCopyButton);
}

bugzillaInit();
