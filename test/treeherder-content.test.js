import { expect } from "chai";
import { JSDOM } from "jsdom";

describe("Treeherder content script", () => {
  let treeherderApi;
  const realFetch = global.fetch;

  before(async () => {
    const dom = new JSDOM("<!doctype html><body></body>", {
      url: "https://treeherder.mozilla.org/jobs?repo=try"
    });
    global.window = dom.window;
    global.document = dom.window.document;
    global.MutationObserver = dom.window.MutationObserver;
    global.fetch = (url) => {
      const href = String(url);
      if (href.endsWith("/status")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: { runs: [{ runId: 0 }] } }) });
      }
      if (href.endsWith("/artifacts")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ artifacts: [] }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ metadata: { name: "" } }) });
    };
    const runtimeStub = {
      runtime: {
        getURL: (path) => `moz-extension://test/${path}`
      },
      storage: {
        sync: {
          get: () =>
            Promise.resolve({
              enableTreeherder: false,
              enableTreeherderUnitTests: false,
              enableTreeherderMacrobenchmarkTable: false
            })
        },
        onChanged: {
          addListener: () => {}
        }
      }
    };
    global.browser = runtimeStub;
    global.chrome = runtimeStub;
    global.__mozHelperExposeTreeherderForTests = (api) => {
      treeherderApi = api;
    };
    await import("../content/treeherder.js");
    await Promise.resolve();
    await Promise.resolve();
    expect(treeherderApi).to.exist;
  });

  after(() => {
    global.fetch = realFetch;
    delete global.browser;
    delete global.chrome;
    delete global.__mozHelperExposeTreeherderForTests;
  });

  it("inserts the Firebase cost report after Artifact parsing status in job info", () => {
    document.body.innerHTML = `
      <div id="summary-panel-content">
        <ul id="job-info" class="list-unstyled ms-1 fs-80">
          <li><strong>Task: </strong><a id="taskInfo">task-id</a></li>
          <li><strong>Duration: </strong><span>13 minutes</span></li>
          <li><strong>Artifact parsing status: </strong>
            <ul class="list-unstyled ml-1">
              <li>perfherder-data-macrobenchmark.json: <span>parsed</span></li>
            </ul>
          </li>
        </ul>
      </div>
    `;

    const summary = document.getElementById("summary-panel-content");
    treeherderApi.treeherderInjectCostReport(summary, "Physical devices: $2.33 for 28m");

    const items = Array.from(document.querySelectorAll("#job-info > li"));
    const costItem = document.querySelector(".firebase-testlab-cost-report");
    expect(costItem?.tagName).to.equal("LI");
    expect(items.indexOf(costItem)).to.equal(3);
    expect(costItem.querySelector("strong")?.textContent).to.equal("Firebase TestLab cost: ");
    expect(costItem.querySelector("span")?.textContent).to.equal("Physical devices: $2.33 for 28m");
  });

  it("updates an existing Firebase cost report row", () => {
    document.body.innerHTML = `
      <div id="summary-panel-content">
        <ul id="job-info">
          <li><strong>Artifact parsing status: </strong><ul></ul></li>
        </ul>
      </div>
    `;

    const summary = document.getElementById("summary-panel-content");
    treeherderApi.treeherderInjectCostReport(summary, "Physical devices: $1.00 for 12m");
    const firstCostItem = document.querySelector(".firebase-testlab-cost-report");
    treeherderApi.treeherderInjectCostReport(summary, "Physical devices: $2.33 for 28m");

    const costItems = document.querySelectorAll(".firebase-testlab-cost-report");
    expect(costItems).to.have.length(1);
    expect(costItems[0]).to.equal(firstCostItem);
    expect(costItems[0].querySelector("span")?.textContent).to.equal("Physical devices: $2.33 for 28m");
  });

  it("appends the Firebase cost report row when Artifact parsing status is absent", () => {
    document.body.innerHTML = `
      <div id="summary-panel-content">
        <ul id="job-info">
          <li><strong>Task: </strong><a id="taskInfo">task-id</a></li>
        </ul>
      </div>
    `;

    const summary = document.getElementById("summary-panel-content");
    treeherderApi.treeherderInjectCostReport(summary, "Physical devices: $2.33 for 28m");

    const items = Array.from(document.querySelectorAll("#job-info > li"));
    expect(items[items.length - 1].className).to.equal("firebase-testlab-cost-report");
  });
});
