export const TRY_LINK_PATTERN = /^https:\/\/treeherder\.mozilla\.org\/(#\/)?jobs\?/i;

export function parseTryLinkParams(url) {
  if (!url) return { repo: null, revision: null, landoCommitId: null, landoInstance: null };
  const parsedUrl = typeof url === "string" ? new URL(url) : url;
  let repo = parsedUrl.searchParams.get("repo");
  let revision = parsedUrl.searchParams.get("revision");
  let landoCommitId = parsedUrl.searchParams.get("landoCommitID") || parsedUrl.searchParams.get("lando_commit_id");
  let landoInstance = parsedUrl.searchParams.get("landoInstance") || parsedUrl.searchParams.get("lando_instance");
  if ((!repo || !revision || !landoCommitId || !landoInstance) && parsedUrl.hash && parsedUrl.hash.includes("?")) {
    const hashQuery = parsedUrl.hash.slice(parsedUrl.hash.indexOf("?") + 1);
    const hashParams = new URLSearchParams(hashQuery);
    if (!repo) repo = hashParams.get("repo");
    if (!revision) revision = hashParams.get("revision");
    if (!landoCommitId) landoCommitId = hashParams.get("landoCommitID") || hashParams.get("lando_commit_id");
    if (!landoInstance) landoInstance = hashParams.get("landoInstance") || hashParams.get("lando_instance");
  }
  if (!landoCommitId) {
    const fragMatch = /landoCommitID=(\d+)/i.exec(parsedUrl.href);
    if (fragMatch) {
      landoCommitId = fragMatch[1];
    }
  }
  if (!landoInstance) {
    const instanceMatch = /(?:[?&#]|^)landoInstance=([^&#]+)/i.exec(parsedUrl.href);
    if (instanceMatch) {
      landoInstance = decodeURIComponent(instanceMatch[1].replace(/\+/g, " "));
    }
  }
  return {
    repo: repo || null,
    revision: revision || null,
    landoCommitId: landoCommitId || null,
    landoInstance: landoInstance || null
  };
}

export function isTryLinkUrl(url) {
  return TRY_LINK_PATTERN.test(String(url || ""));
}
