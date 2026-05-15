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
  let sentMessages = [];
  const testExtensionBaseUrl = "moz-extension://test-extension-id/";

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

  function installDom(html = "<!doctype html><body></body>", url = "https://phabricator.services.mozilla.com/D123") {
    const dom = new JSDOM(html, { url });
    global.window = dom.window;
    global.document = dom.window.document;
    global.location = dom.window.location;
    setGlobalNavigator(dom.window.navigator);
    global.HTMLElement = dom.window.HTMLElement;
    global.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
    global.Event = dom.window.Event;
    global.CustomEvent = dom.window.CustomEvent;
    global.MutationObserver = dom.window.MutationObserver;
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

  async function flushPromises() {
    await Promise.resolve();
    await Promise.resolve();
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
            enablePhabricatorTryCommentIcons: true,
            enablePhabricatorUnsubmittedIndicator: true,
            enablePhabricatorFileNotAttachedNotice: true
          })
      },
      onChanged: {
        addListener: () => {}
      }
    };
    const runtimeStub = {
      runtime: {
        getURL: (path) => `${testExtensionBaseUrl}${path}`,
        sendMessage: (message) => {
          sentMessages.push(message);
          return Promise.resolve(null);
        }
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
    sentMessages = [];
    global.browser.runtime.sendMessage = (message) => {
      sentMessages.push(message);
      return Promise.resolve(null);
    };
    if (phabTestApi?.phabSetTryLinkEnabled) {
      phabTestApi.phabSetTryLinkEnabled(true);
    }
    if (phabTestApi?.phabSetTryCommentIconsEnabled) {
      phabTestApi.phabSetTryCommentIconsEnabled(true);
    }
    if (phabTestApi?.phabClearTryStatusCache) {
      phabTestApi.phabClearTryStatusCache();
    }
    if (phabTestApi?.phabResetFileNotAttachedDismissed) {
      phabTestApi.phabResetFileNotAttachedDismissed();
    }
    if (phabTestApi?.phabSetFileNotAttachedEnabled) {
      phabTestApi.phabSetFileNotAttachedEnabled(true);
    }
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
      "https://treeherder.mozilla.org/#/jobs?repo=try&revision=def456&landoCommitID=87&landoInstance=lando-prod-2025";
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
    expect(result.landoInstance).to.equal("lando-prod-2025");
  });

  it("extracts lando-only try links with their lando instance", () => {
    const tryLink =
      "https://treeherder.mozilla.org/jobs?repo=try&landoInstance=lando-prod-2025&landoCommitID=41159";
    document.body.innerHTML = `
      <div class="phui-timeline-shell">
        <div class="phui-timeline-title">
          <a class="phui-link-person" href="/p/alice/">Alice</a>
        </div>
        <div class="transaction-comment">
          <a href="${tryLink}">try</a>
        </div>
        <a class="phabricator-anchor-view" id="comment-lando"></a>
      </div>
    `;
    const result = phabTestApi.phabFindLatestTryLinkData();
    expect(result.url).to.equal(tryLink);
    expect(result.repo).to.equal("try");
    expect(result.revision).to.equal(null);
    expect(result.landoCommitId).to.equal("41159");
    expect(result.landoInstance).to.equal("lando-prod-2025");
  });

  it("adds a loading prefix and requests status for lando-only comment try links", async () => {
    const tryLink =
      "https://treeherder.mozilla.org/jobs?repo=try&landoInstance=lando-prod-2025&landoCommitID=47115";
    global.browser.runtime.sendMessage = (message) => {
      sentMessages.push(message);
      return Promise.resolve({ status: null, reason: "pending", failedJobs: [], pendingJobs: [] });
    };
    document.body.innerHTML = `
      <div class="phui-timeline-shell">
        <div class="phui-timeline-title">
          <a class="phui-link-person" href="/p/alice/">Alice</a>
        </div>
        <div class="transaction-comment">
          <a href="${tryLink}">try</a>
        </div>
      </div>
    `;

    phabTestApi.phabProcessCommentTryLinks();

    const anchor = document.querySelector(".transaction-comment a[href]");
    let icon = anchor.previousElementSibling;
    expect(icon?.dataset.phabTryCommentIcon).to.equal("true");
    expect(icon.className).to.include("fa-chevron-circle-right");
    expect(sentMessages).to.have.lengthOf(1);
    expect(sentMessages[0]).to.deep.include({
      type: "moz-helper:getTryStatus",
      repo: "try",
      revision: null,
      landoCommitId: "47115",
      landoInstance: "lando-prod-2025"
    });

    await flushPromises();

    icon = anchor.previousElementSibling;
    expect(icon?.dataset.phabTryTooltip).to.equal("Loading");
  });

  it("does not keep unresolved try status responses in the Phabricator cache", async () => {
    const tryLink = "https://treeherder.mozilla.org/jobs?repo=try&landoCommitID=47115";
    const responses = [
      { status: null, reason: "missing-push" },
      { status: "success", reason: null, failedJobs: [], pendingJobs: [] }
    ];
    global.browser.runtime.sendMessage = (message) => {
      sentMessages.push(message);
      return Promise.resolve(responses.shift());
    };
    document.body.innerHTML = `
      <div class="transaction-comment">
        <a href="${tryLink}">try</a>
      </div>
    `;

    phabTestApi.phabProcessCommentTryLinks();
    await flushPromises();
    expect(document.querySelector("[data-phab-try-comment-icon]")).to.not.exist;

    phabTestApi.phabProcessCommentTryLinks();
    await flushPromises();

    const icon = document.querySelector("[data-phab-try-comment-icon]");
    expect(icon).to.exist;
    expect(icon.className).to.include("fa-check-circle");
    expect(sentMessages).to.have.lengthOf(2);
  });

  it("extracts try links that only appear in timeline summary content", () => {
    const summaryLink =
      "https://treeherder.mozilla.org/#/jobs?repo=try&revision=sum123&landoCommitID=11";
    document.body.innerHTML = `
      <div class="phui-timeline-shell">
        <div class="phui-timeline-title">
          <a class="phui-link-person" href="/p/alice/">Alice</a>
        </div>
        <div class="phui-timeline-extra">
          Summary update:
          <a href="${summaryLink}">Try run</a>
        </div>
        <a class="phabricator-anchor-view" id="comment-summary"></a>
      </div>
    `;
    const result = phabTestApi.phabFindLatestTryLinkData();
    expect(result.url).to.equal(summaryLink);
    expect(result.commentUrl).to.equal(
      "https://phabricator.services.mozilla.com/D123#comment-summary"
    );
    expect(result.repo).to.equal("try");
    expect(result.revision).to.equal("sum123");
    expect(result.landoCommitId).to.equal("11");
  });

  it("extracts try links from the diff summary property block", () => {
    const summaryTryLink =
      "https://treeherder.mozilla.org/jobs?repo=try&revision=a75c53bce615ca85114213272d49929d4aba745b";
    document.body.innerHTML = `
      <div class="phui-property-list-section">
        <div class="phui-property-list-section-header">
          <span>Summary</span>
        </div>
        <div class="phui-property-list-text-content">
          <div class="phabricator-remarkup">
            <p>
              TRY:: <a href="${summaryTryLink}" class="remarkup-link">try</a>
            </p>
          </div>
        </div>
      </div>
    `;
    const result = phabTestApi.phabFindLatestTryLinkData();
    expect(result.url).to.equal(summaryTryLink);
    expect(result.commentUrl).to.equal(null);
    expect(result.commentId).to.equal(null);
    expect(result.repo).to.equal("try");
    expect(result.revision).to.equal("a75c53bce615ca85114213272d49929d4aba745b");
    expect(result.landoCommitId).to.equal(null);
  });

  it("shows a file-not-attached notice with action buttons", () => {
    document.body.innerHTML = `
      <div class="phui-curtain-object-ref-view phui-curtain-object-ref-view-exiled">
        <div class="phui-curtain-object-ref-view-exiled-cell">
          <span>File Not Attached</span>
          <a href="/file/ui/curtain/attach/PHID-DREV-1/PHID-FILE-1/" data-sigil="workflow">File Not Attached</a>
        </div>
      </div>
    `;
    phabTestApi.phabUpdateFileNotAttachedNotice();
    const notice = document.querySelector('[data-phab-file-not-attached-notice="true"]');
    expect(notice).to.exist;
    expect(notice.querySelector('[data-phab-file-notice-view="true"]')).to.exist;
    expect(notice.querySelector('[data-phab-file-notice-attach="true"]')).to.exist;
  });

  it("clicks the attach workflow link from the notice", () => {
    phabTestApi.phabSetFileNotAttachedEnabled(true);
    phabTestApi.phabResetFileNotAttachedDismissed();
    let clicked = false;
    document.body.innerHTML = `
      <div class="phui-curtain-object-ref-view phui-curtain-object-ref-view-exiled">
        <div class="phui-curtain-object-ref-view-exiled-cell">
          File Not Attached
          <a href="/file/ui/curtain/attach/PHID-DREV-2/PHID-FILE-2/" data-sigil="workflow">File Not Attached</a>
        </div>
      </div>
    `;
    expect(phabTestApi.phabHasUnattachedFiles()).to.equal(true);
    const link = document.querySelector('a[data-sigil="workflow"]');
    link.addEventListener("click", (event) => {
      event.preventDefault();
      clicked = true;
    });
    phabTestApi.phabUpdateFileNotAttachedNotice();
    const notice = document.querySelector('[data-phab-file-not-attached-notice="true"]');
    expect(notice).to.exist;
    const attachButton = notice.querySelector('[data-phab-file-notice-attach="true"]');
    expect(attachButton).to.exist;
    attachButton.click();
    expect(clicked).to.equal(true);
  });

  it("scrolls to the attached-files panel when clicking View", () => {
    phabTestApi.phabSetFileNotAttachedEnabled(true);
    phabTestApi.phabResetFileNotAttachedDismissed();
    let scrolled = false;
    document.body.innerHTML = `
      <div class="phui-curtain-object-ref-view phui-curtain-object-ref-view-exiled" id="target">
        <div class="phui-curtain-object-ref-view-exiled-cell">
          File Not Attached
          <a href="/file/ui/curtain/attach/PHID-DREV-3/PHID-FILE-3/" data-sigil="workflow">File Not Attached</a>
        </div>
      </div>
    `;
    expect(phabTestApi.phabHasUnattachedFiles()).to.equal(true);
    const target = document.getElementById("target");
    target.scrollIntoView = () => {
      scrolled = true;
    };
    phabTestApi.phabUpdateFileNotAttachedNotice();
    const notice = document.querySelector('[data-phab-file-not-attached-notice="true"]');
    expect(notice).to.exist;
    const viewButton = notice.querySelector('[data-phab-file-notice-view="true"]');
    expect(viewButton).to.exist;
    viewButton.click();
    expect(scrolled).to.equal(true);
  });

  it("disables Attach when no workflow link exists", () => {
    phabTestApi.phabSetFileNotAttachedEnabled(true);
    phabTestApi.phabResetFileNotAttachedDismissed();
    document.body.innerHTML = `
      <div class="phui-curtain-object-ref-view-exiled-cell">File Not Attached</div>
    `;
    expect(phabTestApi.phabHasUnattachedFiles()).to.equal(true);
    phabTestApi.phabUpdateFileNotAttachedNotice();
    const notice = document.querySelector('[data-phab-file-not-attached-notice="true"]');
    expect(notice).to.exist;
    const attachButton = notice.querySelector('[data-phab-file-notice-attach="true"]');
    expect(attachButton).to.exist;
    expect(attachButton.disabled).to.equal(true);
  });

  it("shows unsubmitted marker and favicon when main comment has text", () => {
    phabTestApi.phabSetUnsubmittedIndicatorEnabled(true);
    const favicon = document.createElement("link");
    favicon.id = "favicon";
    favicon.rel = "icon";
    favicon.href = "https://phabricator.services.mozilla.com/favicon.ico";
    document.head.appendChild(favicon);
    document.title = "D123: Test diff";
    document.body.innerHTML = '<textarea name="comment">pending note</textarea>';

    phabTestApi.phabUpdateUnsubmittedIndicator();

    const currentFavicon = document.getElementById("favicon");
    expect(document.title).to.equal("** D123: Test diff **");
    expect(currentFavicon.href).to.equal(
      `${testExtensionBaseUrl}icons/phabricator-favicon-red.png`
    );
  });

  it("restores title and favicon when unsubmitted content is cleared", () => {
    phabTestApi.phabSetUnsubmittedIndicatorEnabled(true);
    const originalFavicon = "https://phabricator.services.mozilla.com/favicon.ico";
    const favicon = document.createElement("link");
    favicon.id = "favicon";
    favicon.rel = "icon";
    favicon.href = originalFavicon;
    document.head.appendChild(favicon);
    document.title = "D123: Clean diff";
    document.body.innerHTML = '<textarea name="comment">draft</textarea>';

    phabTestApi.phabUpdateUnsubmittedIndicator();
    const mainComment = document.querySelector("textarea[name='comment']");
    mainComment.value = "";
    phabTestApi.phabUpdateUnsubmittedIndicator();

    const currentFavicon = document.getElementById("favicon");
    expect(document.title).to.equal("D123: Clean diff");
    expect(currentFavicon.href).to.equal(originalFavicon);
  });

  it("shows a floating unsubmitted button when the native one is hidden", () => {
    phabTestApi.phabSetUnsubmittedIndicatorEnabled(true);
    const favicon = document.createElement("link");
    favicon.id = "favicon";
    favicon.rel = "icon";
    favicon.href = "https://phabricator.services.mozilla.com/favicon.ico";
    document.head.appendChild(favicon);
    document.body.innerHTML = `
      <button style="display: none">1 Unsubmitted</button>
      <textarea name="comment">draft</textarea>
    `;

    phabTestApi.phabUpdateUnsubmittedIndicator();

    const floating = document.querySelector('[data-phab-floating-unsubmitted="true"]');
    expect(floating).to.exist;
    expect(floating.hidden).to.equal(false);
    const label = floating.querySelector('[data-phab-floating-unsubmitted-label="true"]');
    expect(label).to.exist;
    expect(label.textContent).to.equal("1 Unsubmitted");
  });

  it("positions floating unsubmitted button below the Phabricator top toolbar", () => {
    phabTestApi.phabSetUnsubmittedIndicatorEnabled(true);
    const favicon = document.createElement("link");
    favicon.id = "favicon";
    favicon.rel = "icon";
    favicon.href = "https://phabricator.services.mozilla.com/favicon.ico";
    document.head.appendChild(favicon);
    document.body.innerHTML = `
      <div class="phabricator-main-menu" id="toolbar"></div>
      <button style="display: none">1 Unsubmitted</button>
      <textarea name="comment">draft</textarea>
    `;

    const toolbar = document.getElementById("toolbar");
    toolbar.getBoundingClientRect = () => ({
      top: 0,
      left: 0,
      right: 1200,
      bottom: 60,
      width: 1200,
      height: 60
    });

    phabTestApi.phabUpdateUnsubmittedIndicator();

    const floating = document.querySelector('[data-phab-floating-unsubmitted="true"]');
    expect(floating).to.exist;
    expect(floating.hidden).to.equal(false);
    expect(floating.style.top).to.equal("70px");
  });

  it("hides the floating unsubmitted button when the native one is visible", () => {
    phabTestApi.phabSetUnsubmittedIndicatorEnabled(true);
    const favicon = document.createElement("link");
    favicon.id = "favicon";
    favicon.rel = "icon";
    favicon.href = "https://phabricator.services.mozilla.com/favicon.ico";
    document.head.appendChild(favicon);
    document.body.innerHTML = `
      <button>2 Unsubmitted</button>
      <textarea name="comment">draft</textarea>
    `;

    phabTestApi.phabUpdateUnsubmittedIndicator();

    const floating = document.querySelector('[data-phab-floating-unsubmitted="true"]');
    expect(floating).to.exist;
    expect(floating.hidden).to.equal(true);
    const native = document.querySelector("button");
    expect(native).to.exist;
    expect(native.style.border).to.equal("1px solid rgb(255, 77, 77)");
  });

  it("applies neon border style to native unsaved button when visible", () => {
    phabTestApi.phabSetUnsubmittedIndicatorEnabled(true);
    const favicon = document.createElement("link");
    favicon.id = "favicon";
    favicon.rel = "icon";
    favicon.href = "https://phabricator.services.mozilla.com/favicon.ico";
    document.head.appendChild(favicon);
    document.body.innerHTML = `
      <button id="native-unsaved">1 Unsaved</button>
      <textarea name="comment"></textarea>
    `;

    phabTestApi.phabUpdateUnsubmittedIndicator();

    const native = document.getElementById("native-unsaved");
    expect(native).to.exist;
    expect(native.style.border).to.equal("1px solid rgb(255, 77, 77)");
    expect(native.style.boxShadow).to.include("rgba(255,60,60,0.35)");
  });

  it("hides floating button after scroll when native topbar button becomes visible in viewport", async () => {
    phabTestApi.phabSetUnsubmittedIndicatorEnabled(true);
    const favicon = document.createElement("link");
    favicon.id = "favicon";
    favicon.rel = "icon";
    favicon.href = "https://phabricator.services.mozilla.com/favicon.ico";
    document.head.appendChild(favicon);
    document.body.innerHTML = `
      <button id="native-unsubmitted">1 Unsubmitted</button>
      <textarea name="comment">draft</textarea>
    `;
    const native = document.getElementById("native-unsubmitted");
    let inViewport = false;
    native.getBoundingClientRect = () =>
      inViewport
        ? ({ top: 10, left: 10, right: 150, bottom: 40, width: 140, height: 30 })
        : ({ top: -120, left: 10, right: 150, bottom: -90, width: 140, height: 30 });

    phabTestApi.phabProcessPage();
    phabTestApi.phabUpdateUnsubmittedIndicator();

    let floating = document.querySelector('[data-phab-floating-unsubmitted="true"]');
    expect(floating).to.exist;
    expect(floating.hidden).to.equal(false);

    inViewport = true;
    window.dispatchEvent(new window.Event("scroll"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    floating = document.querySelector('[data-phab-floating-unsubmitted="true"]');
    expect(floating).to.exist;
    expect(floating.hidden).to.equal(true);
  });

  it("keeps the native unsubmitted count when header button disappears", () => {
    phabTestApi.phabSetUnsubmittedIndicatorEnabled(true);
    const favicon = document.createElement("link");
    favicon.id = "favicon";
    favicon.rel = "icon";
    favicon.href = "https://phabricator.services.mozilla.com/favicon.ico";
    document.head.appendChild(favicon);
    document.body.innerHTML = `
      <button id="native-unsubmitted">
        <span class="phui-icon-view phui-font-fa visual-only fa-comment"></span>
        1 Unsubmitted
      </button>
      <div class="inline-state-is-draft">draft</div>
      <div class="differential-inline-comment-edit">editor</div>
      <textarea name="comment"></textarea>
    `;

    phabTestApi.phabUpdateUnsubmittedIndicator();

    const nativeButton = document.getElementById("native-unsubmitted");
    nativeButton.style.display = "none";
    phabTestApi.phabUpdateUnsubmittedIndicator();

    const floating = document.querySelector('[data-phab-floating-unsubmitted="true"]');
    expect(floating).to.exist;
    expect(floating.hidden).to.equal(false);
    const label = floating.querySelector('[data-phab-floating-unsubmitted-label="true"]');
    expect(label).to.exist;
    expect(label.textContent).to.equal("1 Unsubmitted");
  });

  it("updates floating count from heuristic state when cached count is stale", () => {
    phabTestApi.phabSetUnsubmittedIndicatorEnabled(true);
    const favicon = document.createElement("link");
    favicon.id = "favicon";
    favicon.rel = "icon";
    favicon.href = "https://phabricator.services.mozilla.com/favicon.ico";
    document.head.appendChild(favicon);
    document.body.innerHTML = `
      <div id="diff-banner" class="diff-banner diff-banner-has-unsubmitted">
        <div class="diff-banner-buttons">
          <button id="native-unsubmitted">1 Unsubmitted</button>
        </div>
      </div>
      <div class="inline-state-is-draft">draft-1</div>
      <textarea name="comment"></textarea>
    `;

    phabTestApi.phabUpdateUnsubmittedIndicator();

    const banner = document.getElementById("diff-banner");
    banner.className = "diff-banner";
    const native = document.getElementById("native-unsubmitted");
    native.remove();
    const secondDraft = document.createElement("div");
    secondDraft.className = "inline-state-is-draft";
    secondDraft.textContent = "draft-2";
    document.body.appendChild(secondDraft);

    phabTestApi.phabUpdateUnsubmittedIndicator();

    const floating = document.querySelector('[data-phab-floating-unsubmitted="true"]');
    expect(floating).to.exist;
    expect(floating.hidden).to.equal(false);
    const label = floating.querySelector('[data-phab-floating-unsubmitted-label="true"]');
    expect(label).to.exist;
    expect(label.textContent).to.equal("2 Unsubmitted");
  });

  it("updates floating count to 2 while topbar is hidden when a second draft is typed", async () => {
    phabTestApi.phabSetUnsubmittedIndicatorEnabled(true);
    const favicon = document.createElement("link");
    favicon.id = "favicon";
    favicon.rel = "icon";
    favicon.href = "https://phabricator.services.mozilla.com/favicon.ico";
    document.head.appendChild(favicon);
    document.body.innerHTML = `
      <div id="diff-banner" class="diff-banner diff-banner-has-unsaved diff-banner-has-unsubmitted">
        <div class="diff-banner-buttons">
          <button id="native-unsubmitted" style="display:none">1 Unsubmitted</button>
        </div>
      </div>
      <textarea id="draft-1" class="remarkup-assist-textarea">draft one</textarea>
      <textarea id="draft-2" class="remarkup-assist-textarea"></textarea>
    `;

    phabTestApi.phabProcessPage();
    phabTestApi.phabUpdateUnsubmittedIndicator();

    let floatingLabel = document.querySelector('[data-phab-floating-unsubmitted-label="true"]');
    expect(floatingLabel).to.exist;
    expect(floatingLabel.textContent).to.equal("1 Unsubmitted");

    const draftTwo = document.getElementById("draft-2");
    draftTwo.value = "draft two";
    draftTwo.dispatchEvent(new window.Event("input", { bubbles: true }));

    await new Promise((resolve) => setTimeout(resolve, 25));

    floatingLabel = document.querySelector('[data-phab-floating-unsubmitted-label="true"]');
    expect(floatingLabel).to.exist;
    expect(floatingLabel.textContent).to.equal("2 Unsubmitted");
  });

  it("shows floating button for an empty visible inline comment editor", () => {
    phabTestApi.phabSetUnsubmittedIndicatorEnabled(true);
    const favicon = document.createElement("link");
    favicon.id = "favicon";
    favicon.rel = "icon";
    favicon.href = "https://phabricator.services.mozilla.com/favicon.ico";
    document.head.appendChild(favicon);
    document.body.innerHTML = `
      <div id="diff-banner" class="diff-banner diff-banner-has-unsaved"></div>
      <div class="differential-inline-comment-edit">editor</div>
      <textarea name="comment"></textarea>
    `;

    phabTestApi.phabUpdateUnsubmittedIndicator();

    const floating = document.querySelector('[data-phab-floating-unsubmitted="true"]');
    expect(floating).to.exist;
    expect(floating.hidden).to.equal(false);
    const label = floating.querySelector('[data-phab-floating-unsubmitted-label="true"]');
    expect(label).to.exist;
    expect(label.textContent).to.equal("1 Unsubmitted");
  });

  it("ignores stale hidden unsaved count when banner only reports unsubmitted", () => {
    phabTestApi.phabSetUnsubmittedIndicatorEnabled(true);
    const favicon = document.createElement("link");
    favicon.id = "favicon";
    favicon.rel = "icon";
    favicon.href = "https://phabricator.services.mozilla.com/favicon.ico";
    document.head.appendChild(favicon);
    document.body.innerHTML = `
      <div id="diff-banner" class="diff-banner diff-banner-has-unsubmitted">
        <div class="diff-banner-buttons">
          <button id="native-unsaved" style="display:none">
            <div class="phui-button-text">1 Unsaved</div>
          </button>
          <button id="native-unsubmitted" style="display:none">
            <div class="phui-button-text">1 Unsubmitted</div>
          </button>
        </div>
      </div>
      <div class="inline-state-is-draft">draft</div>
      <textarea name="comment"></textarea>
    `;

    phabTestApi.phabUpdateUnsubmittedIndicator();

    const floating = document.querySelector('[data-phab-floating-unsubmitted="true"]');
    expect(floating).to.exist;
    expect(floating.hidden).to.equal(false);
    const label = floating.querySelector('[data-phab-floating-unsubmitted-label="true"]');
    expect(label).to.exist;
    expect(label.textContent).to.equal("1 Unsubmitted");
  });

  it("does not double count a saved inline draft when banner has only unsubmitted", () => {
    phabTestApi.phabSetUnsubmittedIndicatorEnabled(true);
    const favicon = document.createElement("link");
    favicon.id = "favicon";
    favicon.rel = "icon";
    favicon.href = "https://phabricator.services.mozilla.com/favicon.ico";
    document.head.appendChild(favicon);
    document.body.innerHTML = `
      <div id="diff-banner" class="diff-banner diff-banner-has-unsubmitted"></div>
      <div class="inline-state-is-draft">saved draft</div>
      <div class="differential-inline-comment-edit">
        <textarea class="remarkup-assist-textarea">saved draft</textarea>
      </div>
      <textarea name="comment"></textarea>
    `;

    phabTestApi.phabUpdateUnsubmittedIndicator();

    const floating = document.querySelector('[data-phab-floating-unsubmitted="true"]');
    expect(floating).to.exist;
    expect(floating.hidden).to.equal(false);
    const label = floating.querySelector('[data-phab-floating-unsubmitted-label="true"]');
    expect(label).to.exist;
    expect(label.textContent).to.equal("1 Unsubmitted");
  });

  it("deduplicates mirrored inline draft markers while native counters are unavailable", () => {
    phabTestApi.phabSetUnsubmittedIndicatorEnabled(true);
    const favicon = document.createElement("link");
    favicon.id = "favicon";
    favicon.rel = "icon";
    favicon.href = "https://phabricator.services.mozilla.com/favicon.ico";
    document.head.appendChild(favicon);
    document.body.innerHTML = `
      <div id="diff-banner" class="diff-banner diff-banner-has-unsubmitted"></div>
      <div class="draft-inline" data-inline-comment-id="1">
        <div class="inline-state-is-draft">draft a</div>
      </div>
      <div class="draft-inline" data-inline-comment-id="2">
        <div class="inline-state-is-draft">draft b</div>
      </div>
      <div class="draft-inline" data-inline-comment-id="3">
        <div class="inline-state-is-draft">draft c</div>
      </div>
      <div class="draft-summary" data-inline-comment-id="1">
        <div class="inline-state-is-draft">draft a</div>
      </div>
      <div class="draft-summary" data-inline-comment-id="2">
        <div class="inline-state-is-draft">draft b</div>
      </div>
      <div class="draft-summary" data-inline-comment-id="3">
        <div class="inline-state-is-draft">draft c</div>
      </div>
      <textarea name="comment"></textarea>
    `;

    phabTestApi.phabUpdateUnsubmittedIndicator();

    const floating = document.querySelector('[data-phab-floating-unsubmitted="true"]');
    expect(floating).to.exist;
    expect(floating.hidden).to.equal(false);
    const label = floating.querySelector('[data-phab-floating-unsubmitted-label="true"]');
    expect(label).to.exist;
    expect(label.textContent).to.equal("3 Unsubmitted");
  });

  it("deduplicates mirrored drafts that point to the same hash target", () => {
    phabTestApi.phabSetUnsubmittedIndicatorEnabled(true);
    const favicon = document.createElement("link");
    favicon.id = "favicon";
    favicon.rel = "icon";
    favicon.href = "https://phabricator.services.mozilla.com/favicon.ico";
    document.head.appendChild(favicon);
    document.body.innerHTML = `
      <div id="diff-banner" class="diff-banner diff-banner-has-unsubmitted"></div>
      <div class="inline-state-is-draft">
        <a href="/D240902?id=1#inline-101">inline 1</a>
      </div>
      <div class="inline-state-is-draft">
        <a href="/D240902?id=1#inline-102">inline 2</a>
      </div>
      <div class="inline-state-is-draft">
        <a href="/D240902?id=1#inline-103">inline 3</a>
      </div>
      <div class="inline-state-is-draft">
        <a href="https://phabricator.services.mozilla.com/D240902#inline-101">summary copy 1</a>
      </div>
      <div class="inline-state-is-draft">
        <a href="https://phabricator.services.mozilla.com/D240902#inline-102">summary copy 2</a>
      </div>
      <div class="inline-state-is-draft">
        <a href="https://phabricator.services.mozilla.com/D240902#inline-103">summary copy 3</a>
      </div>
      <textarea name="comment"></textarea>
    `;

    phabTestApi.phabUpdateUnsubmittedIndicator();

    const floating = document.querySelector('[data-phab-floating-unsubmitted="true"]');
    expect(floating).to.exist;
    expect(floating.hidden).to.equal(false);
    const label = floating.querySelector('[data-phab-floating-unsubmitted-label="true"]');
    expect(label).to.exist;
    expect(label.textContent).to.equal("3 Unsubmitted");
  });

  it("does not double count inline comment previews when inline elements also exist", () => {
    phabTestApi.phabSetUnsubmittedIndicatorEnabled(true);
    const favicon = document.createElement("link");
    favicon.id = "favicon";
    favicon.rel = "icon";
    favicon.href = "https://phabricator.services.mozilla.com/favicon.ico";
    document.head.appendChild(favicon);
    document.body.innerHTML = `
      <div class="differential-inline-comment inline-comment-element inline-state-is-draft">
        tthibaud Author Unsubmitted Done Inline Actions test
      </div>
      <div class="differential-inline-comment inline-comment-element inline-state-is-draft">
        tthibaud Author Unsubmitted Done Inline Actions test
      </div>
      <div class="differential-inline-comment inline-comment-element inline-state-is-draft">
        tthibaud Author Unsubmitted Done Inline Actions test
      </div>
      <div class="differential-inline-comment inline-comment-preview inline-state-is-draft">
        tthibaud Unsubmitted Done View Delete test
      </div>
      <div class="differential-inline-comment inline-comment-preview inline-state-is-draft">
        tthibaud Unsubmitted Done View Delete test
      </div>
      <div class="differential-inline-comment inline-comment-preview inline-state-is-draft">
        tthibaud Unsubmitted Done View Delete test
      </div>
      <textarea name="comment"></textarea>
    `;

    phabTestApi.phabUpdateUnsubmittedIndicator();

    const floating = document.querySelector('[data-phab-floating-unsubmitted="true"]');
    expect(floating).to.exist;
    expect(floating.hidden).to.equal(false);
    const label = floating.querySelector('[data-phab-floating-unsubmitted-label="true"]');
    expect(label).to.exist;
    expect(label.textContent).to.equal("3 Unsubmitted");
  });

  it("uses sum of native unsaved and unsubmitted counts in floating button label", () => {
    phabTestApi.phabSetUnsubmittedIndicatorEnabled(true);
    const favicon = document.createElement("link");
    favicon.id = "favicon";
    favicon.rel = "icon";
    favicon.href = "https://phabricator.services.mozilla.com/favicon.ico";
    document.head.appendChild(favicon);
    document.body.innerHTML = `
      <div id="diff-banner" class="diff-banner diff-banner-has-unsaved diff-banner-has-unsubmitted">
        <div class="diff-banner-buttons">
          <button id="native-unsaved" style="display: none">
            <span class="phui-icon-view phui-font-fa fa-commenting-o"></span>
            <div class="phui-button-text">2 Unsaved</div>
          </button>
          <button id="native-unsubmitted" style="display: none">
            <span class="phui-icon-view phui-font-fa fa-comment-o"></span>
            <div class="phui-button-text">1 Unsubmitted</div>
          </button>
        </div>
      </div>
      <textarea name="comment"></textarea>
    `;

    phabTestApi.phabUpdateUnsubmittedIndicator();

    const floating = document.querySelector('[data-phab-floating-unsubmitted="true"]');
    expect(floating).to.exist;
    expect(floating.hidden).to.equal(false);
    const label = floating.querySelector('[data-phab-floating-unsubmitted-label="true"]');
    expect(label).to.exist;
    expect(label.textContent).to.equal("3 Unsubmitted");
  });

  it("updates floating count when native status text changes while topbar is offscreen", async () => {
    phabTestApi.phabSetUnsubmittedIndicatorEnabled(true);
    const favicon = document.createElement("link");
    favicon.id = "favicon";
    favicon.rel = "icon";
    favicon.href = "https://phabricator.services.mozilla.com/favicon.ico";
    document.head.appendChild(favicon);
    document.body.innerHTML = `
      <div id="diff-banner" class="diff-banner diff-banner-has-unsubmitted">
        <div class="diff-banner-buttons">
          <button id="native-unsubmitted">
            <span class="phui-icon-view phui-font-fa fa-comment-o"></span>
            <div id="native-unsubmitted-label" class="phui-button-text">1 Unsubmitted</div>
          </button>
        </div>
      </div>
      <textarea name="comment"></textarea>
    `;

    const native = document.getElementById("native-unsubmitted");
    native.getBoundingClientRect = () => ({
      top: -120,
      left: 10,
      right: 150,
      bottom: -90,
      width: 140,
      height: 30
    });

    phabTestApi.phabProcessPage();
    phabTestApi.phabUpdateUnsubmittedIndicator();

    let floatingLabel = document.querySelector('[data-phab-floating-unsubmitted-label="true"]');
    expect(floatingLabel).to.exist;
    expect(floatingLabel.textContent).to.equal("1 Unsubmitted");

    const nativeLabelTextNode = document.getElementById("native-unsubmitted-label").firstChild;
    nativeLabelTextNode.data = "2 Unsubmitted";

    await new Promise((resolve) => setTimeout(resolve, 25));

    floatingLabel = document.querySelector('[data-phab-floating-unsubmitted-label="true"]');
    expect(floatingLabel).to.exist;
    expect(floatingLabel.textContent).to.equal("2 Unsubmitted");
  });

  it("hides floating button when only native unsaved button is visible in viewport", () => {
    phabTestApi.phabSetUnsubmittedIndicatorEnabled(true);
    const favicon = document.createElement("link");
    favicon.id = "favicon";
    favicon.rel = "icon";
    favicon.href = "https://phabricator.services.mozilla.com/favicon.ico";
    document.head.appendChild(favicon);
    document.body.innerHTML = `
      <button id="native-unsaved">2 Unsaved</button>
      <textarea name="comment"></textarea>
    `;

    phabTestApi.phabUpdateUnsubmittedIndicator();

    const floating = document.querySelector('[data-phab-floating-unsubmitted="true"]');
    expect(floating).to.exist;
    expect(floating.hidden).to.equal(true);
  });

  it("does not show floating unsubmitted button when there are no visible unsubmitted changes", () => {
    phabTestApi.phabSetUnsubmittedIndicatorEnabled(true);
    const favicon = document.createElement("link");
    favicon.id = "favicon";
    favicon.rel = "icon";
    favicon.href = "https://phabricator.services.mozilla.com/favicon.ico";
    document.head.appendChild(favicon);
    document.body.innerHTML = `
      <div class="differential-inline-comment-edit" style="display: none">editor</div>
      <textarea name="comment"></textarea>
    `;

    phabTestApi.phabUpdateUnsubmittedIndicator();

    const floating = document.querySelector('[data-phab-floating-unsubmitted="true"]');
    expect(floating).to.exist;
    expect(floating.hidden).to.equal(true);
    const line = document.querySelector('[data-phab-unsubmitted-indicator="true"]');
    expect(line).to.equal(null);
  });

  it("keeps unsaved and unsubmitted counts summed after saving one of two empty editors", () => {
    phabTestApi.phabSetUnsubmittedIndicatorEnabled(true);
    const favicon = document.createElement("link");
    favicon.id = "favicon";
    favicon.rel = "icon";
    favicon.href = "https://phabricator.services.mozilla.com/favicon.ico";
    document.head.appendChild(favicon);
    document.body.innerHTML = `
      <div class="differential-inline-comment-edit" id="editor-a">editor a</div>
      <div class="differential-inline-comment-edit" id="editor-b">editor b</div>
      <textarea name="comment"></textarea>
    `;

    phabTestApi.phabUpdateUnsubmittedIndicator();

    let floating = document.querySelector('[data-phab-floating-unsubmitted="true"]');
    expect(floating).to.exist;
    expect(floating.hidden).to.equal(false);
    let label = floating.querySelector('[data-phab-floating-unsubmitted-label="true"]');
    expect(label).to.exist;
    expect(label.textContent).to.equal("2 Unsubmitted");

    document.getElementById("editor-a").remove();
    const savedDraft = document.createElement("div");
    savedDraft.className =
      "differential-inline-comment inline-comment-element viewer-is-object-owner inline-is-done inline-state-is-draft";
    savedDraft.textContent = "saved draft";
    document.body.appendChild(savedDraft);

    phabTestApi.phabUpdateUnsubmittedIndicator();

    floating = document.querySelector('[data-phab-floating-unsubmitted="true"]');
    expect(floating).to.exist;
    expect(floating.hidden).to.equal(false);
    label = floating.querySelector('[data-phab-floating-unsubmitted-label="true"]');
    expect(label).to.exist;
    expect(label.textContent).to.equal("2 Unsubmitted");
  });

  it("does not show floating button from stale hidden count after draft is removed", () => {
    phabTestApi.phabSetUnsubmittedIndicatorEnabled(true);
    const favicon = document.createElement("link");
    favicon.id = "favicon";
    favicon.rel = "icon";
    favicon.href = "https://phabricator.services.mozilla.com/favicon.ico";
    document.head.appendChild(favicon);
    document.body.innerHTML = `
      <div id="diff-banner" class="diff-banner diff-banner-has-unsubmitted">
        <div class="diff-banner-buttons">
          <button id="native-unsubmitted">1 Unsubmitted</button>
        </div>
      </div>
      <textarea name="comment">draft</textarea>
    `;

    phabTestApi.phabUpdateUnsubmittedIndicator();

    const banner = document.getElementById("diff-banner");
    banner.className = "diff-banner";
    const native = document.getElementById("native-unsubmitted");
    native.style.display = "none";
    const comment = document.querySelector("textarea[name='comment']");
    comment.value = "";

    phabTestApi.phabUpdateUnsubmittedIndicator();

    const floating = document.querySelector('[data-phab-floating-unsubmitted="true"]');
    expect(floating).to.exist;
    expect(floating.hidden).to.equal(true);
  });

  it("removes stale duplicate floating buttons when unsubmitted is false", () => {
    phabTestApi.phabSetUnsubmittedIndicatorEnabled(true);
    const favicon = document.createElement("link");
    favicon.id = "favicon";
    favicon.rel = "icon";
    favicon.href = "https://phabricator.services.mozilla.com/favicon.ico";
    document.head.appendChild(favicon);
    document.body.innerHTML = `
      <button data-phab-floating-unsubmitted="true" style="display:flex">stale</button>
      <button data-phab-floating-unsubmitted="true" style="display:flex">stale2</button>
      <textarea name="comment"></textarea>
    `;

    phabTestApi.phabUpdateUnsubmittedIndicator();

    const floatingNodes = document.querySelectorAll('[data-phab-floating-unsubmitted="true"]');
    expect(floatingNodes.length).to.equal(1);
    const floating = floatingNodes[0];
    expect(floating.hidden).to.equal(true);
    expect(floating.style.display).to.equal("none");
  });

  it("does not apply unsubmitted indicator outside differential revision pages", () => {
    installDom("<!doctype html><body></body>", "https://phabricator.services.mozilla.com/differential/");
    phabTestApi.phabSetUnsubmittedIndicatorEnabled(true);
    const originalFavicon = "https://phabricator.services.mozilla.com/favicon.ico";
    const favicon = document.createElement("link");
    favicon.id = "favicon";
    favicon.rel = "icon";
    favicon.href = originalFavicon;
    document.head.appendChild(favicon);
    document.title = "Differential";
    document.body.innerHTML = `
      <button style="display: none">1 Unsubmitted</button>
      <textarea name="comment">draft</textarea>
    `;

    phabTestApi.phabUpdateUnsubmittedIndicator();

    const floating = document.querySelector('[data-phab-floating-unsubmitted="true"]');
    const native = document.querySelector("button");
    expect(floating).to.equal(null);
    expect(document.title).to.equal("Differential");
    expect(document.getElementById("favicon").href).to.equal(originalFavicon);
    expect(native.style.border).to.equal("");
  });

  it("matches only Differential revision url paths", () => {
    const cases = [
      { url: "https://phabricator.services.mozilla.com/D123", expected: true },
      { url: "https://phabricator.services.mozilla.com/D123/", expected: true },
      { url: "https://phabricator.services.mozilla.com/D123?tab=changes", expected: true },
      { url: "https://phabricator.services.mozilla.com/d123", expected: false },
      { url: "https://phabricator.services.mozilla.com/D", expected: false },
      { url: "https://phabricator.services.mozilla.com/differential/", expected: false }
    ];

    for (const entry of cases) {
      installDom("<!doctype html><body><textarea name='comment'>draft</textarea></body>", entry.url);
      phabTestApi.phabSetUnsubmittedIndicatorEnabled(true);
      const favicon = document.createElement("link");
      favicon.id = "favicon";
      favicon.rel = "icon";
      favicon.href = "https://phabricator.services.mozilla.com/favicon.ico";
      document.head.appendChild(favicon);
      document.title = "Page";

      phabTestApi.phabUpdateUnsubmittedIndicator();

      const floating = document.querySelector('[data-phab-floating-unsubmitted="true"]');
      if (entry.expected) {
        expect(document.title).to.equal("** Page **");
        expect(document.getElementById("favicon").href).to.equal(
          `${testExtensionBaseUrl}icons/phabricator-favicon-red.png`
        );
        expect(floating).to.exist;
      } else {
        expect(document.title).to.equal("Page");
        expect(document.getElementById("favicon").href).to.equal(
          "https://phabricator.services.mozilla.com/favicon.ico"
        );
        expect(floating).to.equal(null);
      }
    }
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
