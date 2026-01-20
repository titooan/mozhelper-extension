import { expect } from "chai";
import { JSDOM } from "jsdom";
import { isVideoUrl } from "../src/phabricator/videoEnhancer.js";
import {
  shouldTransformPaste as phabShouldTransformPaste,
  markdownReplace as phabMarkdownReplace
} from "../src/phabricator/mdPaste.js";
import { buildFailedJobsTooltip, SUCCESS_TOOLTIP, PENDING_TOOLTIP } from "../src/phabricator/tryStatusTooltip.js";
import { assessTryJobs } from "../src/treeherder/tryStatus.js";

function phabTransformAllowed(original, start, end, pasted) {
  const selected = original.slice(start, end);
  return phabShouldTransformPaste(original, start, end, selected, pasted);
}

describe("Phabricator video detection", () => {
  it("accepts video URLs", () => {
    expect(isVideoUrl("https://example.com/file.mov")).to.be.true;
    expect(isVideoUrl("foo/bar.MP4")).to.be.true;
  });
  it("rejects non-video URLs", () => {
    expect(isVideoUrl("https://example.com/file.txt")).to.be.false;
    expect(isVideoUrl("https://example.com/image.png")).to.be.false;
  });
});

describe("Phabricator markdown paste helper", () => {
  it("requires selected text and probable URLs", () => {
    expect(phabTransformAllowed("label", 0, 5, "example.com")).to.be.true;
    expect(phabTransformAllowed("label", 0, 5, "foo")).to.be.false;
    expect(phabShouldTransformPaste("label", 0, 0, "", "example.com")).to.be.false;
  });

  it("ignores selections that are already URLs", () => {
    const text = "test https://phabricator.services.mozilla.com/D123";
    expect(phabTransformAllowed(text, 5, text.length, "https://mozilla.org")).to.be.false;
  });

  it("ignores selections overlapping markdown links", () => {
    const text = "[tsst](https://phabricator.services.mozilla.com/D272886)";
    expect(phabTransformAllowed(text, 1, 5, "https://mozilla.org")).to.be.false;
    expect(phabTransformAllowed(text, 0, text.length, "https://mozilla.org")).to.be.false;
    const slice = "com/D272886";
    const start = text.indexOf(slice);
    const end = start + slice.length;
    expect(phabTransformAllowed(text, start, end, "https://mozilla.org")).to.be.false;
  });
  it("still transforms outside markdown links", () => {
    const text = "[tsst](https://phabricator.services.mozilla.com/D272886) tail";
    const start = text.indexOf("tail");
    const end = start + 4;
    expect(phabTransformAllowed(text, start, end, "https://mozilla.org")).to.be.true;
  });

  it("wraps selection with markdown links", () => {
    const replaced = phabMarkdownReplace("hello there", 6, 11, "mozilla.org");
    expect(replaced).to.equal("hello [there](https://mozilla.org)");
  });
});

describe("Phabricator try tooltip helper", () => {
  it("returns null when nothing fails", () => {
    expect(buildFailedJobsTooltip([])).to.be.null;
    expect(buildFailedJobsTooltip(null)).to.be.null;
  });

  it("lists failing jobs with platform and result", () => {
    const tooltip = buildFailedJobsTooltip([
      { name: "mochitest", platform: "linux", result: "testfailed" },
      { jobSymbol: "M1", result: "retry" }
    ]);
    expect(tooltip).to.include("Failed jobs: 2");
    expect(tooltip).to.include("mochitest (linux) - testfailed");
    expect(tooltip).to.include("M1 - retry");
  });

  it("does not list retry jobs when fed Treeherder data", () => {
    const { failedJobs } = assessTryJobs([{ state: "retry", result: "" }]);
    const tooltip = buildFailedJobsTooltip(failedJobs);
    expect(tooltip).to.be.null;
  });

  it("deduplicates job names within the tooltip", () => {
    const tooltip = buildFailedJobsTooltip([
      { name: "mochitest", platform: "linux", result: "testfailed" },
      { jobSymbol: "mochitest", platform: "windows", result: "busted" },
      { jobSymbol: "web-platform", platform: "linux", result: "busted" }
    ]);
    expect(tooltip).to.include("Failed jobs: 3");
    const mochitestLines = tooltip.split("\n").filter((line) => line.includes("mochitest"));
    expect(mochitestLines).to.have.length(1);
  });

  it("only shows the summary line when more than five jobs fail", () => {
    const jobs = Array.from({ length: 7 }, (_, i) => ({ name: `job-${i}`, result: "failed" }));
    const tooltip = buildFailedJobsTooltip(jobs);
    expect(tooltip).to.equal("Failed jobs: 7");
  });

  it("exposes a success tooltip copy", () => {
    expect(SUCCESS_TOOLTIP).to.equal("Passed");
  });

  it("exposes a pending tooltip copy", () => {
    expect(PENDING_TOOLTIP).to.equal("Loading");
  });
});

describe("Phabricator try link extraction", () => {
  let phabTestApi;
  const realSetTimeout = global.setTimeout;
  const realConsoleDebug = console.debug;
  const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(global, "navigator");
  let documentPasteListenerCalls = [];

  function setGlobalNavigator(value) {
    try {
      delete global.navigator;
    } catch (error) {}
    Object.defineProperty(global, "navigator", {
      value,
      configurable: true,
      writable: true
    });
  }

  function installDom(html = "<!doctype html><body></body>") {
    const dom = new JSDOM(html, { url: "https://phabricator.services.mozilla.com/D123" });
    global.window = dom.window;
    global.document = dom.window.document;
    global.location = dom.window.location;
    setGlobalNavigator(dom.window.navigator);
    global.HTMLElement = dom.window.HTMLElement;
    global.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
    global.Event = dom.window.Event;
    global.CustomEvent = dom.window.CustomEvent;
    global.requestAnimationFrame = dom.window.requestAnimationFrame || ((cb) => setTimeout(cb, 0));
    dom.window.requestAnimationFrame = global.requestAnimationFrame;
    documentPasteListenerCalls = [];
    const originalAddEventListener = dom.window.document.addEventListener;
    dom.window.document.addEventListener = function (type, listener, options) {
      documentPasteListenerCalls.push({ type, listener, options });
      return originalAddEventListener.call(this, type, listener, options);
    };
    return dom;
  }

  before(async () => {
    console.debug = () => {};
    global.setTimeout = (fn) => {
      if (typeof fn === "function") fn();
      return 0;
    };
    installDom();
    const storageStub = {
      sync: {
        get: () =>
          Promise.resolve({
            enablePhabricator: true,
            enablePhabricatorPaste: true,
            enablePhabricatorTryLinks: true,
            enablePhabricatorTryCommentIcons: true
          })
      },
      onChanged: {
        addListener: () => {}
      }
    };
    const runtimeStub = {
      runtime: {
        sendMessage: () => Promise.resolve(null)
      },
      storage: storageStub
    };
    global.browser = runtimeStub;
    global.chrome = runtimeStub;
    global.__mozHelperExposePhabForTests = (api) => {
      phabTestApi = api;
    };
    await import("../content/phabricator.js");
    global.setTimeout = realSetTimeout;
    expect(phabTestApi).to.exist;
  });

  beforeEach(() => {
    installDom();
  });

  it("attaches a single document paste listener", () => {
    phabTestApi.phabAttachPasteHandlers();
    const pasteListeners = documentPasteListenerCalls.filter((entry) => entry.type === "paste");
    expect(pasteListeners).to.have.lengthOf(1);
    expect(pasteListeners[0]?.options).to.equal(true);
    phabTestApi.phabAttachPasteHandlers();
    const pasteListenersAgain = documentPasteListenerCalls.filter((entry) => entry.type === "paste");
    expect(pasteListenersAgain).to.have.lengthOf(1);
  });

  it("wraps selections pasted into remarkup comment textareas", () => {
    phabTestApi.phabAttachPasteHandlers();
    const textarea = document.createElement("textarea");
    textarea.className = "remarkup-assist-textarea";
    textarea.value = "label";
    document.body.appendChild(textarea);
    textarea.setSelectionRange(0, textarea.value.length);
    const pasteEvent = new window.Event("paste", { bubbles: true, cancelable: true });
    pasteEvent.clipboardData = {
      getData(type) {
        if (type === "text/plain") return "example.com";
        if (type === "text/html") return "";
        return "";
      }
    };
    textarea.dispatchEvent(pasteEvent);
    expect(textarea.value).to.equal("[label](https://example.com)");
    expect(pasteEvent.defaultPrevented).to.be.true;
  });

  it("ignores try links posted by reviewbot", () => {
    const tryLink =
      "https://treeherder.mozilla.org/#/jobs?repo=try&revision=abc123&landoCommitID=42";
    document.body.innerHTML = `
      <div class="phui-timeline-shell">
        <div class="phui-timeline-title">
          <a class="phui-link-person" href="/p/reviewbot/">reviewbot</a>
        </div>
        <div class="transaction-comment">
          <a href="${tryLink}">try</a>
        </div>
        <a class="phabricator-anchor-view" id="comment-reviewbot"></a>
      </div>
    `;
    const result = phabTestApi.phabFindLatestTryLinkData();
    expect(result).to.be.null;
  });

  it("returns the latest non-reviewbot try link even when reviewbot comments last", () => {
    const reviewerLink =
      "https://treeherder.mozilla.org/#/jobs?repo=try&revision=def456&landoCommitID=87";
    const reviewbotLink =
      "https://treeherder.mozilla.org/#/jobs?repo=try&revision=zzz999&landoCommitID=99";
    document.body.innerHTML = `
      <div class="phui-timeline-shell">
        <div class="phui-timeline-title">
          <a class="phui-link-person" href="/p/alice/">Alice</a>
        </div>
        <div class="transaction-comment">
          <a href="${reviewerLink}">try</a>
        </div>
        <a class="phabricator-anchor-view" id="comment-user"></a>
      </div>
      <div class="phui-timeline-shell">
        <div class="phui-timeline-title">
          <a class="phui-link-person" href="/p/reviewbot/">Automation</a>
        </div>
        <div class="transaction-comment">
          <a href="${reviewbotLink}">try</a>
        </div>
        <a class="phabricator-anchor-view" id="comment-reviewbot"></a>
      </div>
    `;
    const result = phabTestApi.phabFindLatestTryLinkData();
    expect(result.url).to.equal(reviewerLink);
    expect(result.commentUrl).to.equal(
      "https://phabricator.services.mozilla.com/D123#comment-user"
    );
    expect(result.repo).to.equal("try");
    expect(result.revision).to.equal("def456");
    expect(result.landoCommitId).to.equal("87");
  });

  after(() => {
    console.debug = realConsoleDebug;
    delete global.__mozHelperExposePhabForTests;
    if (originalNavigatorDescriptor) {
      Object.defineProperty(global, "navigator", originalNavigatorDescriptor);
    } else {
      try {
        delete global.navigator;
      } catch (error) {}
    }
  });
});
