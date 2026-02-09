function stripLogPrefix(line) {
  if (typeof line !== "string") return "";
  return line.replace(/^\[[^\]]+\]\s*/, "");
}

function isMarkdownTableRow(line) {
  if (typeof line !== "string") return false;
  const trimmed = line.trim();
  return /^\|.*\|$/.test(trimmed);
}

function isMarkdownDividerRow(line) {
  if (!isMarkdownTableRow(line)) return false;
  const trimmed = line.trim();
  const cells = trimmed
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
  if (!cells.length) return false;
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function extractTableFromBlock(lines) {
  if (!Array.isArray(lines) || lines.length < 2) return null;
  const dividerIndex = lines.findIndex(isMarkdownDividerRow);
  if (dividerIndex <= 0) return null;
  if (dividerIndex >= lines.length - 1) return null;
  return lines.join("\n");
}

export function extractMarkdownTable(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  const lines = text
    .split(/\r?\n/)
    .map((line) => stripLogPrefix(line).trim())
    .filter(Boolean);

  let block = [];
  for (const line of lines) {
    if (isMarkdownTableRow(line)) {
      block.push(line);
      continue;
    }
    const table = extractTableFromBlock(block);
    if (table) return table;
    block = [];
  }
  return extractTableFromBlock(block);
}

export { stripLogPrefix, isMarkdownTableRow, isMarkdownDividerRow };
