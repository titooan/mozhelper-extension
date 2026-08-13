import { expect } from "chai";
import { JSDOM } from "jsdom";
import { syncTakeAndAssignButtons } from "../src/bugzilla/takeAndAssign.js";

function createDocument({ assignedOption = true } = {}) {
  const statusOptions = assignedOption
    ? '<option value="NEW">NEW</option><option value="ASSIGNED">ASSIGNED</option>'
    : '<option value="NEW">NEW</option>';
  return new JSDOM(`
    <button class="take-btn secondary">Take</button>
    <button class="take-btn minor">Take</button>
    <select id="bug_status">${statusOptions}</select>
  `).window.document;
}

describe("Bugzilla Take and assign", () => {
  it("relabels every native Take button when enabled", () => {
    const document = createDocument();
    syncTakeAndAssignButtons(document, true);

    expect([...document.querySelectorAll(".take-btn")].map((button) => button.textContent))
      .to.deep.equal(["Take and assign", "Take and assign"]);
  });

  it("processes a newly added Take button subtree without rescanning the document", () => {
    const document = createDocument();
    const container = document.createElement("div");
    container.innerHTML = '<button class="take-btn">Take</button>';
    document.body.append(container);

    syncTakeAndAssignButtons(container, true);

    expect(container.querySelector(".take-btn").textContent).to.equal("Take and assign");
    expect(document.querySelectorAll(".take-btn")[0].textContent).to.equal("Take");
  });

  it("restores native labels when disabled", () => {
    const document = createDocument();
    syncTakeAndAssignButtons(document, true);
    syncTakeAndAssignButtons(document, false);

    expect([...document.querySelectorAll(".take-btn")].map((button) => button.textContent))
      .to.deep.equal(["Take", "Take"]);
  });

  it("sets status to ASSIGNED and emits change when clicked", () => {
    const document = createDocument();
    const status = document.getElementById("bug_status");
    let changeCount = 0;
    status.addEventListener("change", () => { changeCount += 1; });
    syncTakeAndAssignButtons(document, true);

    document.querySelector(".take-btn").click();

    expect(status.value).to.equal("ASSIGNED");
    expect(changeCount).to.equal(1);
  });

  it("does not change status when ASSIGNED is unavailable", () => {
    const document = createDocument({ assignedOption: false });
    const status = document.getElementById("bug_status");
    let changeCount = 0;
    status.addEventListener("change", () => { changeCount += 1; });
    syncTakeAndAssignButtons(document, true);

    document.querySelector(".take-btn").click();

    expect(status.value).to.equal("NEW");
    expect(changeCount).to.equal(0);
  });

  it("attaches its click handler only once across repeated scans", () => {
    const document = createDocument();
    const status = document.getElementById("bug_status");
    let changeCount = 0;
    status.addEventListener("change", () => { changeCount += 1; });
    syncTakeAndAssignButtons(document, true);
    syncTakeAndAssignButtons(document, true);

    document.querySelector(".take-btn").click();

    expect(changeCount).to.equal(1);
  });

  it("does not mutate buttons on a repeated scan with unchanged state", async () => {
    const document = createDocument();
    syncTakeAndAssignButtons(document, true);
    await Promise.resolve();
    let mutationCount = 0;
    const observer = new document.defaultView.MutationObserver((records) => {
      mutationCount += records.length;
    });
    observer.observe(document.body, { attributes: true, childList: true, subtree: true });

    syncTakeAndAssignButtons(document, true);
    await Promise.resolve();
    observer.disconnect();

    expect(mutationCount).to.equal(0);
  });
});
