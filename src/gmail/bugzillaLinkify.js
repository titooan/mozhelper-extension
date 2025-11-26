const BUG_REGEX = /\bBug (\d+)\b/g;

export function findBugMatches(text) {
  BUG_REGEX.lastIndex = 0;
  const ids = new Set();
  let m;
  while ((m = BUG_REGEX.exec(text)) !== null) {
    ids.add(m[1]);
  }
  return Array.from(ids);
}

export function buildBugURL(id) {
  return `https://bugzilla.mozilla.org/show_bug.cgi?id=${id}`;
}
