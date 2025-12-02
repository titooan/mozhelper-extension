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

export function shouldTransformPaste(original, selectionStart, selectionEnd, selectedText, pastedText) {
  if (!selectedText || !pastedText) return false;
  if (!isLikelyURL(pastedText)) return false;
  if (isLikelyURL(selectedText)) return false;
  if (selectionInsideMarkdownLink(original, selectionStart, selectionEnd)) return false;
  return true;
}

export function markdownTransform(original, selectionStart, selectionEnd, pastedURL) {
  const before = original.slice(0, selectionStart);
  const selected = original.slice(selectionStart, selectionEnd);
  const after = original.slice(selectionEnd);
  const cleanURL = /^https?:\/\//i.test(pastedURL) ? pastedURL : `https://${pastedURL}`;
  const markdown = `[${selected}](${cleanURL})`;
  const text = before + markdown + after;
  const caret = before.length + markdown.length;
  return { text, caret };
}

export function markdownReplace(original, selectionStart, selectionEnd, pastedURL) {
  return markdownTransform(original, selectionStart, selectionEnd, pastedURL).text;
}
