export const DEFAULT_LANDO_API_BASE = "https://api.lando.services.mozilla.com";
export const LANDO_INSTANCE_API_BASES = new Map([
  ["lando-prod-2025", "https://lando.moz.tools"]
]);

export function normalizeLandoInstance(value) {
  if (value == null) {
    return null;
  }
  const normalized = String(value).trim().toLowerCase();
  return normalized || null;
}

export function getLandoApiBaseUrl(landoInstance) {
  const normalized = normalizeLandoInstance(landoInstance);
  return LANDO_INSTANCE_API_BASES.get(normalized) || DEFAULT_LANDO_API_BASE;
}

export function buildLandoLandingJobUrl(landoCommitId, landoInstance = null) {
  const id = String(landoCommitId || "").trim();
  if (!id) {
    return null;
  }
  const apiBase = getLandoApiBaseUrl(landoInstance);
  const params = new URLSearchParams({
    lando_revision_id: id,
    count: "1"
  });
  const encodedId = encodeURIComponent(id);
  const path = apiBase === DEFAULT_LANDO_API_BASE ? `/landing_jobs/${encodedId}` : `/landing_jobs/${encodedId}/`;
  return `${apiBase}${path}?${params.toString()}`;
}

export function buildLandoRevisionCacheKey(landoCommitId, landoInstance = null) {
  const id = String(landoCommitId || "").trim();
  if (!id) {
    return null;
  }
  return `${getLandoApiBaseUrl(landoInstance)}:${id}`;
}
