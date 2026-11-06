import { expect } from "chai";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const contentScript = await readFile(new URL("../content/phabricator.js", import.meta.url), "utf8");

function createPhabricatorPage(settingOverrides = {}) {
  const dom = new JSDOM(`<!doctype html><body style="background-color:rgb(30,30,30)">
    <div class="phui-crumbs-view phui-crumbs-border"><a href="/differential/" class="phui-crumb-view">Differential</a><span class="phabricator-last-crumb"><span class="phui-crumb-name"> D340287</span></span></div>
    <div class="phui-property-list-container grouped"><dl class="phui-property-list-properties">
      <dt class="phui-property-list-key">Bugzilla Bug ID </dt>
      <dd class="phui-property-list-value"><a href="https://bugzilla.mozilla.org/show_bug.cgi?id=2082512">2082512</a></dd>
    </dl></div>
  </body>`, { runScripts: "outside-only", url: "https://phabricator.services.mozilla.com/D340287" });
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
    constructor(parts, options) { this.content = parts.join(""); this.type = options.type; }
    async text() { return this.content; }
  }
  Object.defineProperty(dom.window.navigator, "clipboard", {
    value: { write: async (items) => writes.push(items[0]) }
  });
  dom.window.ClipboardItem = TestClipboardItem;
  dom.window.Blob = TestBlob;
  dom.window.browser = {
    runtime: { getURL: (path) => `moz-extension://test/${path}`, sendMessage: async () => ({}) },
    storage: {
      sync: { get: async (defaults) => ({ ...defaults, ...settingOverrides }) },
      onChanged: { addListener(listener) { onStorageChanged = listener; } }
    }
  };
  dom.window.eval(contentScript);
  return {
    dom,
    writes,
    changeSetting(name, value) { onStorageChanged({ [name]: { newValue: value } }, "sync"); },
    close() { observers.forEach((observer) => observer.disconnect()); dom.window.close(); }
  };
}

describe("Phabricator Bugzilla copy link button", () => {
  it("updates both icon tints when the page theme changes", async () => {
    const { dom, close } = createPhabricatorPage();
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
    const icons = [...dom.window.document.querySelectorAll(".mozhelper-copy-bug-link img, .mozhelper-copy-revision-link img")];
    expect(icons).to.have.length(2);
    expect(icons.map((icon) => icon.style.filter)).to.deep.equal(["invert(1)", "invert(1)"]);
    dom.window.document.body.style.backgroundColor = "white";
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
    expect(icons.map((icon) => icon.style.filter)).to.deep.equal(["none", "none"]);
    close();
  });

  it("copies the current Bugzilla link when its ID changes", async () => {
    const { dom, writes, close } = createPhabricatorPage();
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
    const link = dom.window.document.querySelector(".phui-property-list-value a");
    link.href = "https://bugzilla.mozilla.org/show_bug.cgi?id=1234567";
    link.textContent = "1234567";
    dom.window.document.querySelector(".mozhelper-copy-bug-link").click();
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
    expect(await writes[0].representations["text/plain"].text()).to.equal("Bug 1234567");
    expect(await writes[0].representations["text/html"].text())
      .to.equal('<a href="https://bugzilla.mozilla.org/show_bug.cgi?id=1234567">Bug 1234567</a>');
    close();
  });

  it("copies Bug text and a rich Bugzilla link, then shows Copied", async () => {
    const { dom, writes, close } = createPhabricatorPage();
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
    const button = dom.window.document.querySelector(".mozhelper-copy-bug-link");
    expect(button).to.exist;
    expect(button.querySelector("img").style.filter).to.equal("invert(1)");
    button.click();
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
    expect(writes).to.have.length(1);
    expect(await writes[0].representations["text/plain"].text()).to.equal("Bug 2082512");
    expect(await writes[0].representations["text/html"].text())
      .to.equal('<a href="https://bugzilla.mozilla.org/show_bug.cgi?id=2082512">Bug 2082512</a>');
    expect(button.querySelector(".mozhelper-copy-bug-tooltip").hidden).to.equal(false);
    expect(button.querySelector(".mozhelper-copy-bug-tooltip").textContent).to.equal("Copied");
    close();
  });

  it("copies the Differential revision as a rich Phabricator link", async () => {
    const { dom, writes, close } = createPhabricatorPage();
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
    const button = dom.window.document.querySelector(".mozhelper-copy-revision-link");
    expect(button).to.exist;
    const icon = button.querySelector("img");
    expect(icon.src).to.contain("copy-regular-full.svg");
    button.dispatchEvent(new dom.window.Event("pointerenter"));
    expect(icon.src).to.contain("copy-solid-full.svg");
    button.dispatchEvent(new dom.window.Event("pointerleave"));
    expect(icon.src).to.contain("copy-regular-full.svg");
    expect(button.previousElementSibling).to.equal(dom.window.document.querySelector(".phabricator-last-crumb .phui-crumb-name"));
    expect(button.style.verticalAlign).to.equal("middle");
    button.click();
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
    expect(writes).to.have.length(1);
    expect(await writes[0].representations["text/plain"].text()).to.equal("D340287");
    expect(await writes[0].representations["text/html"].text())
      .to.equal('<a href="https://phabricator.services.mozilla.com/D340287">D340287</a>');
    expect(button.querySelector(".mozhelper-copy-bug-tooltip").hidden).to.equal(false);
    close();
  });

  it("respects the preference and reacts to changes", async () => {
    const { dom, changeSetting, close } = createPhabricatorPage({ enablePhabricatorCopyBugLink: false });
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
    const { document } = dom.window;
    expect(document.querySelector(".mozhelper-copy-bug-link")).to.equal(null);
    expect(document.querySelector(".mozhelper-copy-revision-link")).to.equal(null);
    changeSetting("enablePhabricatorCopyBugLink", true);
    expect(document.querySelector(".mozhelper-copy-bug-link")).to.exist;
    expect(document.querySelector(".mozhelper-copy-revision-link")).to.exist;
    changeSetting("enablePhabricatorCopyBugLink", false);
    expect(document.querySelector(".mozhelper-copy-bug-link")).to.equal(null);
    expect(document.querySelector(".mozhelper-copy-revision-link")).to.equal(null);
    close();
  });
});
