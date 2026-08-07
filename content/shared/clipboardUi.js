// Shared clipboard-copy + floating tooltip helpers used by multiple content scripts (no ES modules).
// Load this file before any content script that references MozHelperClipboardUi.

const MozHelperClipboardUi = (() => {
  async function copyText(text) {
    if (!text) return false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_error) {
      // fallback below
    }
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      return copied;
    } catch (_error) {
      return false;
    }
  }

  function createTooltip({ align = "right", durationMs = 1700 } = {}) {
    const tooltip = document.createElement("span");
    tooltip.style.position = "absolute";
    tooltip.style[align] = "0";
    tooltip.style.top = "calc(100% + 6px)";
    tooltip.style.maxWidth = "260px";
    tooltip.style.whiteSpace = "nowrap";
    tooltip.style.background = "#0f172a";
    tooltip.style.color = "#ffffff";
    tooltip.style.fontSize = "11px";
    tooltip.style.lineHeight = "1.2";
    tooltip.style.padding = "5px 8px";
    tooltip.style.borderRadius = "6px";
    tooltip.style.boxShadow = "0 8px 18px rgba(15, 23, 42, 0.25)";
    tooltip.style.opacity = "0";
    tooltip.style.pointerEvents = "none";
    tooltip.style.transform = "translateY(2px)";
    tooltip.style.transition = "opacity 120ms ease, transform 120ms ease";

    let tooltipTimer = null;
    const show = (message) => {
      tooltip.textContent = message;
      tooltip.style.opacity = "1";
      tooltip.style.transform = "translateY(0)";
      if (tooltipTimer) clearTimeout(tooltipTimer);
      tooltipTimer = setTimeout(() => {
        tooltip.style.opacity = "0";
        tooltip.style.transform = "translateY(2px)";
        tooltipTimer = null;
      }, durationMs);
    };

    return { element: tooltip, show };
  }

  return { copyText, createTooltip };
})();

if (typeof globalThis !== "undefined") {
  globalThis.MozHelperClipboardUi = MozHelperClipboardUi;
}
