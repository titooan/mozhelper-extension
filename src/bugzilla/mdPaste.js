import { isLikelyURL } from "../utils/url.js";

function selectionInsideMarkdownLink(text, selectionStart, selectionEnd) {
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

function extractHtmlFragment(htmlText) {
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

function decodeEntities(text) {
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

function stripHtmlPreservingText(text) {
  if (!text) return "";
  let output = text.replace(/<br\s*\/?>/gi, "\n");
  output = output.replace(/<\/(p|div|li|ul|ol|tr|table|blockquote)>/gi, "\n");
  output = output.replace(/<[^>]+>/g, "");
  output = output.replace(/\r\n/g, "\n");
  output = decodeEntities(output);
  return output.replace(/\u00a0/g, " ");
}

function parseClipboardHTML(htmlText) {
  if (!htmlText) return null;
  const fragment = extractHtmlFragment(htmlText);
  if (!fragment) return null;
  let containsLink = false;
  let firstLinkURL = null;
  let firstLinkText = null;
  const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let replaced = fragment.replace(anchorRegex, (match, attrPart, inner) => {
    const hrefMatch = attrPart.match(/href\s*=\s*["']([^"']+)["']/i);
    if (!hrefMatch) return stripHtmlPreservingText(inner);
    const rawHref = hrefMatch[1]?.trim();
    if (!rawHref || !isLikelyURL(rawHref)) {
      return stripHtmlPreservingText(inner);
    }
    const cleanURL = /^https?:\/\//i.test(rawHref) ? rawHref : `https://${rawHref}`;
    const anchorText = stripHtmlPreservingText(inner).replace(/\s+/g, " ").trim();
    if (!anchorText) return "";
    if (!firstLinkURL) {
      firstLinkURL = cleanURL;
      firstLinkText = anchorText;
    }
    containsLink = true;
    return `[${anchorText}](${cleanURL})`;
  });
  replaced = stripHtmlPreservingText(replaced);
  if (!replaced.trim()) return containsLink ? { text: "", containsLink, firstLinkURL, firstLinkText } : null;
  return {
    text: replaced,
    containsLink,
    firstLinkURL,
    firstLinkText
  };
}

function insertText(original, selectionStart, selectionEnd, insertion) {
  const before = original.slice(0, selectionStart);
  const after = original.slice(selectionEnd);
  const text = before + insertion + after;
  const caret = before.length + insertion.length;
  return { text, caret };
}

export function shouldTransformPaste(original, selectionStart, selectionEnd, selectedText, pastedText) {
  const result = getMarkdownPasteUpdate({
    original,
    selectionStart,
    selectionEnd,
    selectedText,
    plainText: pastedText
  });
  return Boolean(result);
}

export function markdownTransform(original, selectionStart, selectionEnd, pastedURL, replacementText = null) {
  const before = original.slice(0, selectionStart);
  const after = original.slice(selectionEnd);
  const cleanURL = /^https?:\/\//i.test(pastedURL) ? pastedURL : `https://${pastedURL}`;
  const selected = replacementText != null ? replacementText : original.slice(selectionStart, selectionEnd);
  const markdown = `[${selected}](${cleanURL})`;
  const text = before + markdown + after;
  const caret = before.length + markdown.length;
  return { text, caret };
}

export function markdownReplace(original, selectionStart, selectionEnd, pastedURL) {
  return markdownTransform(original, selectionStart, selectionEnd, pastedURL).text;
}

export function getMarkdownPasteUpdate({ original, selectionStart, selectionEnd, selectedText, plainText, htmlText }) {
  if (selectionInsideMarkdownLink(original, selectionStart, selectionEnd)) return null;
  const selection = selectedText ?? "";
  const hasSelection = selection.length > 0;
  const htmlInfo = parseClipboardHTML(htmlText);
  const plainIsURL = plainText ? isLikelyURL(plainText) : false;

  if (hasSelection) {
    if (isLikelyURL(selection)) return null;
    if (plainIsURL) {
      return markdownTransform(original, selectionStart, selectionEnd, plainText);
    }
    if (htmlInfo?.containsLink && htmlInfo.text) {
      return insertText(original, selectionStart, selectionEnd, htmlInfo.text);
    }
    return null;
  }

  if (htmlInfo?.containsLink && htmlInfo.text) {
    return insertText(original, selectionStart, selectionEnd, htmlInfo.text);
  }
  return null;
}
