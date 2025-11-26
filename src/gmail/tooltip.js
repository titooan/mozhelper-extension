const TYPE_META = {
  defect: { label: "Defect", color: "#d93025" },
  task: { label: "Task", color: "#1a73e8" },
  enhancement: { label: "Enhancement", color: "#0d9488" }
};

const DEFAULT_META = { label: "Unknown", color: "#64748b" };

export function getTypeKey(type) {
  if (!type) return null;
  const key = String(type).trim().toLowerCase();
  return key || null;
}

export function getTypeMeta(type) {
  const key = getTypeKey(type);
  if (key && TYPE_META[key]) {
    return { ...TYPE_META[key], key };
  }
  if (key) {
    const label = `${type[0].toUpperCase()}${type.slice(1)}`;
    return { label, color: DEFAULT_META.color, key };
  }
  return { ...DEFAULT_META, key: null };
}

export function formatAssignee(email, detail = {}) {
  const addr = (email || "").trim();
  if (!addr || addr === "nobody@mozilla.org") return "Unassigned";
  const realName = (detail.real_name || "").trim();
  return realName || addr;
}

export function formatStatus(status, resolution) {
  if (!status) return "";
  return `${status}${resolution ? ` ${resolution}` : ""}`.trim();
}
