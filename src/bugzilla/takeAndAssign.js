function handleTakeAndAssignClick(event) {
  const button = event.currentTarget;
  if (button.dataset.mozhelperTakeAndAssignEnabled !== "true") return;

  const document = button.ownerDocument;
  const status = document.getElementById("bug_status");
  if (!status || !Array.from(status.options).some((option) => option.value === "ASSIGNED")) {
    return;
  }

  status.value = "ASSIGNED";
  const ChangeEvent = document.defaultView?.Event || Event;
  status.dispatchEvent(new ChangeEvent("change", { bubbles: true }));
}

export function syncTakeAndAssignButtons(root, enabled) {
  const buttons = [];
  const Element = root.ownerDocument?.defaultView?.Element;
  if (Element && root instanceof Element && root.matches(".take-btn")) {
    buttons.push(root);
  }
  if (root.querySelectorAll) {
    buttons.push(...root.querySelectorAll(".take-btn"));
  }
  buttons.forEach((button) => {
    if (button.dataset.mozhelperTakeLabel == null) {
      button.dataset.mozhelperTakeLabel = button.textContent.trim();
    }
    if (!button.dataset.mozhelperTakeAndAssignHandled) {
      button.addEventListener("click", handleTakeAndAssignClick);
      button.dataset.mozhelperTakeAndAssignHandled = "true";
    }
    const enabledValue = String(Boolean(enabled));
    if (button.dataset.mozhelperTakeAndAssignEnabled !== enabledValue) {
      button.dataset.mozhelperTakeAndAssignEnabled = enabledValue;
    }
    const label = enabled ? "Take and assign" : button.dataset.mozhelperTakeLabel;
    if (button.textContent.trim() !== label) {
      button.textContent = label;
    }
  });
}
