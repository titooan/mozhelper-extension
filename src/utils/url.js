const FILE_EXTENSIONS = [
  "png","jpg","jpeg","gif","bmp","svg","webp",
  "mp4","mov","m4v","avi","mkv","webm",
  "pdf","txt","md","zip","gz","tar","rar",
  "css","js","ts","html","json","xml"
];

export function isLikelyURL(text) {
  if (!text) return false;
  const t = text.trim();

  if (/^https?:\/\/[^\"\s]+$/i.test(t)) return true;

  const match = /^[a-z0-9.-]+\.([a-z]{2,24})(\/[^\"\s]*)?$/i.exec(t);
  if (match) {
    const tld = match[1].toLowerCase();
    if (!FILE_EXTENSIONS.includes(tld)) {
      return true;
    }
  }
  return false;
}
