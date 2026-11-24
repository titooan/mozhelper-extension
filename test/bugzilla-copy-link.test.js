import { expect } from "chai";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const contentScript = await readFile(new URL("../content/bugzilla.js", import.meta.url), "utf8");

function createBugzillaPage(backgroundColor = "rgb(255, 255, 255)", settingOverrides = {}) {
  const dom = new JSDOM(`<!doctype html><body style="background-color:${backgroundColor}"><div id="summary-container">
    <div id="field-value-bug_id"><a href="/show_bug.cgi?id=2076726">Bug 2076726</a></div>
    <h1 id="field-value-short_desc">[Account Settings] Connect the "Sync this device" button to the AccountManager state</h1>
  </div></body>`, { runScripts: "outside-only", url: "https://bugzilla.mozilla.org/show_bug.cgi?id=2076726" });
  const writes = [];
  const observers = [];
  let onStorageChanged = () => {};
  const NativeMutationObserver = dom.window.MutationObserver;
  dom.window.MutationObserver = class extends NativeMutationObserver {
    constructor(callback) {
      super(callback);
      observers.push(this);
    }
  };
  class TestClipboardItem {
    constructor(representations) { this.representations = representations; }
  }
  class TestBlob {
    constructor(parts, options) {
      this.content = parts.join("");
      this.type = options.type;
    }
    async text() { return this.content; }
  }
  Object.defineProperty(dom.window.navigator, "clipboard", {
    value: { write: async (items) => writes.push(items[0]) }
  });
  dom.window.ClipboardItem = TestClipboardItem;
  dom.window.Blob = TestBlob;
  dom.window.browser = {
    runtime: { getURL: (path) => `moz-extension://test/${path}` },
    storage: {
      sync: { get: async (defaults) => ({ ...defaults, ...settingOverrides }) },
      onChanged: { addListener(listener) { onStorageChanged = listener; } }
    }
  };
  dom.window.eval(contentScript);
  return {
    dom,
    writes,
    changeSetting(name, value) {
      onStorageChanged({ [name]: { newValue: value } }, "sync");
    },
    close() {
      observers.forEach((observer) => observer.disconnect());
      dom.window.close();
    }
  };
}

describe("Bugzilla bug-page copy button", () => {
  it("tints the icon on dark pages and updates when the page theme changes", async () => {
    const { dom, close } = createBugzillaPage("rgb(30, 30, 30)");
    const { document } = dom.window;
    const icon = document.querySelector(".mozhelper-copy-bug-link img");
    expect(icon.style.filter).to.equal("invert(1)");

    document.body.style.backgroundColor = "rgb(255, 255, 255)";
    await new Promise((resolve) => dom.window.setTimeout(resolve, 150));
    expect(icon.style.filter).to.equal("none");

    close();
  });

  it("copies rich and plain text, then shows a Copied tooltip", async () => {
    const { dom, writes, close } = createBugzillaPage();
    const { document } = dom.window;
    const button = document.querySelector(".mozhelper-copy-bug-link");
    button.click();
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

    expect(writes).to.have.length(1);
    expect(await writes[0].representations["text/plain"].text()).to.equal("Bug 2076726");
    expect(await writes[0].representations["text/html"].text())
      .to.equal('<a href="https://bugzilla.mozilla.org/show_bug.cgi?id=2076726">Bug 2076726</a>');
    const tooltip = button.querySelector(".mozhelper-copy-bug-tooltip");
    expect(tooltip.textContent).to.equal("Copied");
    expect(tooltip.hidden).to.equal(false);
    close();
  });

  it("copies the summary with a linked Bug ID in rich text", async () => {
    const { dom, writes, close } = createBugzillaPage();
    const { document } = dom.window;
    const heading = document.querySelector("#field-value-short_desc");
    const button = document.querySelector(".mozhelper-copy-summary");
    expect(heading.lastElementChild).to.equal(button);

    button.click();
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

    expect(writes).to.have.length(1);
    expect(await writes[0].representations["text/plain"].text())
      .to.equal('Bug 2076726 - [Account Settings] Connect the "Sync this device" button to the AccountManager state');
    expect(await writes[0].representations["text/html"].text())
      .to.equal('<a href="https://bugzilla.mozilla.org/show_bug.cgi?id=2076726">Bug 2076726</a> - [Account Settings] Connect the &quot;Sync this device&quot; button to the AccountManager state');
    expect(button.getAttribute("aria-label")).to.equal("Copy Bug summary");
    close();
  });

  it("keeps exactly one summary button after initialization observers run", async () => {
    const { dom, close } = createBugzillaPage();
    await new Promise((resolve) => dom.window.setTimeout(resolve, 20));
    expect(dom.window.document.querySelectorAll(".mozhelper-copy-summary")).to.have.length(1);
    close();
  });

  it("escapes summary markup and fails cleanly when the bug ID is invalid", async () => {
    const { dom, writes, close } = createBugzillaPage();
    const { document } = dom.window;
    const titleHeading = document.querySelector("#field-value-short_desc");
    titleHeading.firstChild.textContent = "Title <script>alert(1)</script> & details";
    document.querySelector(".mozhelper-copy-summary").click();
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
    expect(await writes[0].representations["text/html"].text())
      .to.equal('<a href="https://bugzilla.mozilla.org/show_bug.cgi?id=2076726">Bug 2076726</a> - Title &lt;script&gt;alert(1)&lt;/script&gt; &amp; details');

    document.querySelector("#field-value-bug_id a").href = "/show_bug.cgi?id=not-a-number";
    const button = document.querySelector(".mozhelper-copy-summary");
    button.click();
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
    expect(writes).to.have.length(1);
    expect(button.querySelector(".mozhelper-copy-bug-tooltip").textContent).to.equal("Copy failed");
    close();
  });

  it("stays bounded when the page re-orders siblings around the summary button", async () => {
    const { dom, close } = createBugzillaPage();
    const { document } = dom.window;
    const heading = document.querySelector("#field-value-short_desc");
    const container = heading;
    let pageReactions = 0;
    // Hostile page script: whenever children change, append a node to the h1.
    const pageObserver = new dom.window.MutationObserver((records) => {
      const involvesExtension = records.some((record) =>
        [...record.addedNodes, ...record.removedNodes].some((node) => node.className?.startsWith?.("mozhelper")));
      if (!involvesExtension || pageReactions++ > 200) return;
      const spacer = document.createElement("span");
      spacer.className = "page-spacer";
      heading.append(spacer);
    });
    pageObserver.observe(container, { childList: true });
    document.querySelector(".mozhelper-copy-summary").remove();
    await new Promise((resolve) => dom.window.setTimeout(resolve, 300));
    expect(pageReactions).to.be.below(20);
    expect(document.querySelectorAll(".mozhelper-copy-summary")).to.have.length(1);
    pageObserver.disconnect();
    close();
  });

  it("adds the summary button when the heading renders after init", async () => {
    const { dom, close } = createBugzillaPage();
    const { document } = dom.window;
    document.querySelector(".mozhelper-copy-summary").remove();
    const heading = document.querySelector("#field-value-short_desc");
    const replacement = document.createElement("h1");
    replacement.id = "field-value-short_desc";
    replacement.textContent = "Late title";
    heading.replaceWith(replacement);
    await new Promise((resolve) => dom.window.setTimeout(resolve, 150));
    expect(replacement.lastElementChild.className).to.equal("mozhelper-copy-summary");
    expect(document.querySelectorAll(".mozhelper-copy-summary")).to.have.length(1);
    close();
  });

  it("respects the saved preference and reacts to preference changes", async () => {
    const { dom, changeSetting, close } = createBugzillaPage("rgb(255, 255, 255)", {
      enableBugzillaCopyLink: false
    });
    const { document } = dom.window;
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
    expect(document.querySelector(".mozhelper-copy-bug-link")).to.equal(null);
    expect(document.querySelector(".mozhelper-copy-summary")).to.equal(null);

    changeSetting("enableBugzillaCopyLink", true);
    expect(document.querySelector(".mozhelper-copy-bug-link")).to.exist;
    expect(document.querySelector(".mozhelper-copy-summary")).to.exist;
    changeSetting("enableBugzillaCopyLink", false);
    expect(document.querySelector(".mozhelper-copy-bug-link")).to.equal(null);
    expect(document.querySelector(".mozhelper-copy-summary")).to.equal(null);
    close();
  });
});
