const VIDEO_EXTENSIONS = [".mov", ".mp4", ".webm", ".m4v"];

export function isVideoUrl(url) {
  const lower = url.toLowerCase();
  return VIDEO_EXTENSIONS.some(ext => lower.includes(ext));
}
