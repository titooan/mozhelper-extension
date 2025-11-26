import { isLikelyURL } from "../utils/url.js";

export function shouldTransformPaste(selectedText, pastedText) {
  if (!selectedText || !pastedText) return false;
  return isLikelyURL(pastedText);
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
