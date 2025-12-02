// Phabricator inline video enhancer (no ES modules)

const phabStorage = (typeof browser !== "undefined" ? browser.storage : chrome.storage);
const phabDefaultSettings = {
  enablePhabricator: true,
  enablePhabricatorPaste: true
};
let phabVideoEnabled = true;
let phabPasteEnabled = true;

const PHAB_VIDEO_EXTENSIONS = [".mov", ".mp4", ".webm", ".m4v"];
const PHAB_FILE_EXTENSIONS = [
  "png","jpg","jpeg","gif","bmp","svg","webp",
  "mp4","mov","m4v","avi","mkv","webm",
  "pdf","txt","md","zip","gz","tar","rar",
  "css","js","ts","html","json","xml"
];

function phabIsVideoUrl(url) {
  const lower = url.toLowerCase();
  return PHAB_VIDEO_EXTENSIONS.some(ext => lower.includes(ext));
}

function phabFindVideoBlocks() {
  return document.querySelectorAll(".phabricator-remarkup-embed-layout-link");
}

function phabCreateVideoPlayer(src) {
  const video = document.createElement("video");
  video.src = src;
  video.controls = true;
  video.style.width = "100%";
  video.style.maxWidth = "720px";
  video.style.maxHeight = "50vh";
  video.style.marginTop = "8px";
  video.style.borderRadius = "6px";
  video.style.boxShadow = "0 2px 6px rgba(0,0,0,0.15)";
  video.style.display = "block";
  return video;
}

function phabEnhanceBlock(block) {
  if (block.dataset.videoEnhanced === "true") return;
  const downloadLink = block.querySelector(".phabricator-remarkup-embed-layout-download");
  if (!downloadLink) return;
  const url = downloadLink.href;
  if (!phabIsVideoUrl(url)) return;
  const next = block.nextElementSibling;
  if (next && next.tagName === "VIDEO") {
    block.dataset.videoEnhanced = "true";
    return;
  }
  const video = phabCreateVideoPlayer(url);
  block.insertAdjacentElement("afterend", video);
  block.dataset.videoEnhanced = "true";
}

function phabEnhanceAllVideos() {
  if (!phabVideoEnabled) return;
  const blocks = phabFindVideoBlocks();
  blocks.forEach(phabEnhanceBlock);
}

function phabIsLikelyURL(text) {
  if (!text) return false;
  const t = text.trim();
  if (/^https?:\/\/[^\"\s]+$/i.test(t)) return true;
  const match = /^[a-z0-9.-]+\.([a-z]{2,24})(\/[^\"\s]*)?$/i.exec(t);
  if (match) {
    const tld = match[1].toLowerCase();
    if (!PHAB_FILE_EXTENSIONS.includes(tld)) return true;
  }
  return false;
}

function phabShouldTransformPaste(selectedText, pastedText) {
  if (!selectedText || !pastedText) return false;
  return phabIsLikelyURL(pastedText);
}

function phabMarkdownTransform(original, selectionStart, selectionEnd, pastedURL) {
  const before = original.slice(0, selectionStart);
  const selected = original.slice(selectionStart, selectionEnd);
  const after = original.slice(selectionEnd);
  const cleanURL = /^https?:\/\//i.test(pastedURL) ? pastedURL : `https://${pastedURL}`;
  const markdown = `[${selected}](${cleanURL})`;
  const text = before + markdown + after;
  const caret = before.length + markdown.length;
  return { text, caret };
}

function phabHandlePaste(event) {
  if (!phabPasteEnabled) return;
  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement)) return;
  if (!target.classList.contains("remarkup-assist-textarea")) return;

  const start = target.selectionStart;
  const end = target.selectionEnd;
  if (start == null || end == null || start === end) return;

  const clipboard = event.clipboardData || window.clipboardData;
  if (!clipboard) return;
  const pasted = (clipboard.getData("text/plain") || "").trim();
  const selected = target.value.slice(start, end);
  if (!phabShouldTransformPaste(selected, pasted)) return;

  event.preventDefault();
  const { text, caret } = phabMarkdownTransform(target.value, start, end, pasted);
  target.value = text;
  target.setSelectionRange(caret, caret);
  target.dispatchEvent(new Event("input", { bubbles: true }));
}

function phabAttachPasteHandlers() {
  const fields = document.querySelectorAll("textarea.remarkup-assist-textarea");
  fields.forEach((field) => {
    if (!field.dataset.phabPasteHandled) {
      field.addEventListener("paste", phabHandlePaste, true);
      field.dataset.phabPasteHandled = "true";
    }
  });
}

function phabInit() {
  phabStorage.sync.get(phabDefaultSettings).then((items) => {
    phabVideoEnabled = items.enablePhabricator ?? true;
    phabPasteEnabled = items.enablePhabricatorPaste ?? true;
    if (phabVideoEnabled) phabEnhanceAllVideos();
  });
  const runtime = (typeof browser !== "undefined" ? browser : chrome);
  runtime.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (changes.enablePhabricator) {
      phabVideoEnabled = changes.enablePhabricator.newValue;
      if (phabVideoEnabled) phabEnhanceAllVideos();
    }
    if (changes.enablePhabricatorPaste) {
      phabPasteEnabled = changes.enablePhabricatorPaste.newValue;
    }
  });
  phabEnhanceAllVideos();
  phabAttachPasteHandlers();
  const observer = new MutationObserver(() => {
    phabEnhanceAllVideos();
    phabAttachPasteHandlers();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  for (let i = 1; i <= 5; i++) {
    setTimeout(() => {
      phabEnhanceAllVideos();
      phabAttachPasteHandlers();
    }, i * 1000);
  }
}

phabInit();
