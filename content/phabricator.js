// Phabricator inline video enhancer (no ES modules)

const phabStorage = (typeof browser !== "undefined" ? browser.storage : chrome.storage);
const phabDefaultSettings = { enablePhabricator: true };
let phabEnabled = true;

const PHAB_VIDEO_EXTENSIONS = [".mov", ".mp4", ".webm", ".m4v"];

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
  if (!phabEnabled) return;
  const blocks = phabFindVideoBlocks();
  blocks.forEach(phabEnhanceBlock);
}

function phabInit() {
  phabStorage.sync.get(phabDefaultSettings).then((items) => {
    phabEnabled = items.enablePhabricator ?? true;
    if (phabEnabled) phabEnhanceAllVideos();
  });
  const runtime = (typeof browser !== "undefined" ? browser : chrome);
  runtime.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (changes.enablePhabricator) {
      phabEnabled = changes.enablePhabricator.newValue;
      if (phabEnabled) phabEnhanceAllVideos();
    }
  });
  phabEnhanceAllVideos();
  const observer = new MutationObserver(() => phabEnhanceAllVideos());
  observer.observe(document.body, { childList: true, subtree: true });
  for (let i = 1; i <= 5; i++) setTimeout(phabEnhanceAllVideos, i * 1000);
}

phabInit();
