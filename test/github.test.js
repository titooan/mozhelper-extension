import { expect } from "chai";
import { JSDOM } from "jsdom";
import { isTryLinkUrl, parseTryLinkParams } from "../src/treeherder/tryLink.js";

describe("Treeherder try link parsing", () => {
  it("detects Treeherder jobs URLs", () => {
    expect(isTryLinkUrl("https://treeherder.mozilla.org/jobs?repo=try&revision=abc")).to.be.true;
    expect(isTryLinkUrl("https://treeherder.mozilla.org/#/jobs?repo=try&revision=abc")).to.be.true;
    expect(isTryLinkUrl("https://treeherder.mozilla.org/perfherder")).to.be.false;
  });

  it("parses query try link params", () => {
    const result = parseTryLinkParams(
      "https://treeherder.mozilla.org/jobs?repo=try&revision=abc123&landoCommitID=42&landoInstance=lando-prod-2025"
    );
    expect(result).to.deep.equal({
      repo: "try",
      revision: "abc123",
      landoCommitId: "42",
      landoInstance: "lando-prod-2025"
    });
  });

  it("parses hash query try link params", () => {
    const result = parseTryLinkParams(
      "https://treeherder.mozilla.org/#/jobs?repo=try&revision=def456&landoCommitID=87"
    );
    expect(result.repo).to.equal("try");
    expect(result.revision).to.equal("def456");
    expect(result.landoCommitId).to.equal("87");
  });

  it("parses lando-only try links", () => {
    const result = parseTryLinkParams(
      "https://treeherder.mozilla.org/jobs?repo=try&landoInstance=lando-prod-2025&landoCommitID=41159"
    );
    expect(result.repo).to.equal("try");
    expect(result.revision).to.equal(null);
    expect(result.landoCommitId).to.equal("41159");
    expect(result.landoInstance).to.equal("lando-prod-2025");
  });
});

describe("GitHub try status icons", () => {
  let githubTestApi;
  let sentMessages;
  const realConsoleWarn = console.warn;
  const realSetTimeout = global.setTimeout;

  function installDom(html = "<!doctype html><body></body>") {
    const dom = new JSDOM(html, { url: "https://github.com/mozilla/gecko-dev/pull/123" });
    global.window = dom.window;
    global.document = dom.window.document;
    global.location = dom.window.location;
    global.HTMLElement = dom.window.HTMLElement;
    global.Node = dom.window.Node;
    global.Event = dom.window.Event;
    global.CustomEvent = dom.window.CustomEvent;
    global.MutationObserver = dom.window.MutationObserver;
    global.requestAnimationFrame = dom.window.requestAnimationFrame || ((cb) => setTimeout(cb, 0));
    dom.window.requestAnimationFrame = global.requestAnimationFrame;
    return dom;
  }

  async function flushPromises() {
    await Promise.resolve();
    await Promise.resolve();
  }

  before(async () => {
    console.warn = () => {};
    global.setTimeout = (fn) => {
      if (typeof fn === "function") fn();
      return 0;
    };
    installDom();
    sentMessages = [];
    const storageStub = {
      sync: {
        get: () => Promise.resolve({ enableGithubTryStatusIcons: true })
      },
      onChanged: {
        addListener: () => {}
      }
    };
    const runtimeStub = {
      runtime: {
        sendMessage: (message) => {
          sentMessages.push(message);
          return Promise.resolve({ status: "success", reason: null, failedJobs: [], pendingJobs: [] });
        }
      },
      storage: storageStub
    };
    global.browser = runtimeStub;
    global.chrome = runtimeStub;
    global.__mozHelperExposeGithubForTests = (api) => {
      githubTestApi = api;
    };
    await import("../content/github.js");
    global.setTimeout = realSetTimeout;
    expect(githubTestApi).to.exist;
  });

  beforeEach(() => {
    installDom();
    sentMessages = [];
    githubTestApi.githubSetTryStatusIconsEnabled(true);
    githubTestApi.githubClearTryStatusCache();
  });

  after(() => {
    console.warn = realConsoleWarn;
    delete global.browser;
    delete global.chrome;
    delete global.__mozHelperExposeGithubForTests;
  });

  it("adds a status icon before a GitHub PR try link", async () => {
    document.body.innerHTML = `
      <div class="comment-body">
        <a href="https://treeherder.mozilla.org/#/jobs?repo=try&revision=abc123">try</a>
      </div>
    `;
    githubTestApi.githubProcessTryLinks();
    await flushPromises();

    const anchor = document.querySelector("a[href]");
    const icon = anchor.previousElementSibling;
    expect(icon?.dataset.githubTryIcon).to.equal("true");
    expect(icon.textContent).to.equal("✓");
    expect(icon.dataset.githubTryTooltip).to.equal("Passed");
    expect(sentMessages).to.have.lengthOf(1);
    expect(sentMessages[0]).to.include({
      type: "moz-helper:getTryStatus",
      repo: "try",
      revision: "abc123"
    });
  });

  it("processes an added anchor node as the root", async () => {
    const anchor = document.createElement("a");
    anchor.href = "https://treeherder.mozilla.org/jobs?repo=try&revision=root123";
    anchor.textContent = "try";
    document.body.appendChild(anchor);

    githubTestApi.githubProcessTryLinks(anchor);
    await flushPromises();

    const icon = anchor.previousElementSibling;
    expect(icon?.dataset.githubTryIcon).to.equal("true");
    expect(icon.textContent).to.equal("✓");
    expect(sentMessages).to.have.lengthOf(1);
  });

  it("does not reset an already processed link to loading", async () => {
    document.body.innerHTML = `
      <div class="comment-body">
        <a href="https://treeherder.mozilla.org/jobs?repo=try&revision=stable123">try</a>
      </div>
    `;
    githubTestApi.githubProcessTryLinks();
    await flushPromises();

    const anchor = document.querySelector("a[href]");
    const icon = anchor.previousElementSibling;
    expect(icon.textContent).to.equal("✓");

    githubTestApi.githubProcessTryLinks();
    expect(anchor.previousElementSibling).to.equal(icon);
    expect(icon.textContent).to.equal("✓");
    expect(sentMessages).to.have.lengthOf(1);
  });

  it("renders failed status details", () => {
    document.body.innerHTML = `
      <div class="comment-body">
        <a href="https://treeherder.mozilla.org/jobs?repo=try&revision=abc123">try</a>
      </div>
    `;
    const anchor = document.querySelector("a[href]");
    githubTestApi.githubApplyTryStatus(anchor, {
      status: "failure",
      failedJobs: [{ name: "mochitest", platform: "linux", result: "testfailed" }]
    });
    const icon = anchor.previousElementSibling;
    expect(icon.textContent).to.equal("!");
    expect(icon.dataset.githubTryTooltip).to.include("mochitest (linux) - testfailed");
  });

  it("removes icons when disabled", async () => {
    document.body.innerHTML = `
      <div class="comment-body">
        <a href="https://treeherder.mozilla.org/jobs?repo=try&revision=abc123">try</a>
      </div>
    `;
    githubTestApi.githubProcessTryLinks();
    await flushPromises();
    expect(document.querySelector("[data-github-try-icon]")).to.exist;

    githubTestApi.githubSetTryStatusIconsEnabled(false);
    githubTestApi.githubProcessTryLinks();
    expect(document.querySelector("[data-github-try-icon]")).to.not.exist;
  });

  it("ignores malformed try links without repo or revision", () => {
    document.body.innerHTML = `
      <div class="comment-body">
        <a href="https://treeherder.mozilla.org/jobs?repo=try">try</a>
      </div>
    `;
    githubTestApi.githubProcessTryLinks();
    expect(document.querySelector("[data-github-try-icon]")).to.not.exist;
    expect(sentMessages).to.have.lengthOf(0);
  });
});
