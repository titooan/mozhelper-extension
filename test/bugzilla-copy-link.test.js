import { expect } from "chai";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const contentScript = await readFile(new URL("../content/bugzilla.js", import.meta.url), "utf8");

function createBugzillaPage(backgroundColor = "rgb(255, 255, 255)", settingOverrides = {}) {
  const dom = new JSDOM(`<!doctype html><body style="background-color:${backgroundColor}">
    <div id="field-value-bug_id"><a href="/show_bug.cgi?id=2076726">Bug 2076726</a></div>
  </body>`, { runScripts: "outside-only", url: "https://bugzilla.mozilla.org/show_bug.cgi?id=2076726" });
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
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
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

  it("respects the saved preference and reacts to preference changes", async () => {
    const { dom, changeSetting, close } = createBugzillaPage("rgb(255, 255, 255)", {
      enableBugzillaCopyLink: false
    });
    const { document } = dom.window;
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
    expect(document.querySelector(".mozhelper-copy-bug-link")).to.equal(null);

    changeSetting("enableBugzillaCopyLink", true);
    expect(document.querySelector(".mozhelper-copy-bug-link")).to.exist;
    changeSetting("enableBugzillaCopyLink", false);
    expect(document.querySelector(".mozhelper-copy-bug-link")).to.equal(null);
    close();
  });
});
