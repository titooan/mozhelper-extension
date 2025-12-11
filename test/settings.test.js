import { expect } from "chai";
import { JSDOM } from "jsdom";

const storageStub = {
  sync: {
    get: () => Promise.resolve({}),
    set: () => Promise.resolve()
  },
  onChanged: {
    addListener: () => {}
  }
};

describe("MozHelperSettings dependent toggles", () => {
  let MozHelperSettings;

  before(async () => {
    global.browser = { storage: storageStub };
    global.chrome = global.browser;
    await import("../settings.js");
    MozHelperSettings = globalThis.MozHelperSettings;
  });

  it("includes hover setting in defaults", () => {
    expect(MozHelperSettings.defaultSettings).to.have.property("enableGmailHover", true);
  });

  it("includes per-comment try icon default", () => {
    expect(MozHelperSettings.defaultSettings).to.have.property("enablePhabricatorTryCommentIcons", true);
  });

  it("disables child checkbox and label when parent unchecked", () => {
    const dom = new JSDOM(`
      <label class="parent">
        <input type="checkbox" id="parent">
      </label>
      <label class="subsetting">
        <input type="checkbox" id="child">
      </label>
    `);
    global.window = dom.window;
    global.document = dom.window.document;
    global.CustomEvent = dom.window.CustomEvent;
    const parent = document.getElementById("parent");
    const child = document.getElementById("child");
    const label = child.closest("label");

    parent.checked = false;
    MozHelperSettings.bindDependentToggle({ parent, child });

    expect(child.disabled).to.be.true;
    expect(label.classList.contains("disabled")).to.be.true;
  });

  it("enables child when parent toggled on via sync event", () => {
    const dom = new JSDOM(`
      <label class="parent">
        <input type="checkbox" id="parent">
      </label>
      <label class="subsetting disabled">
        <input type="checkbox" id="child" disabled>
      </label>
    `);
    global.window = dom.window;
    global.document = dom.window.document;
    global.CustomEvent = dom.window.CustomEvent;
    const parent = document.getElementById("parent");
    const child = document.getElementById("child");
    const label = child.closest("label");

    MozHelperSettings.bindDependentToggle({ parent, child });

    parent.checked = true;
    parent.dispatchEvent(new CustomEvent("mozhelper:sync", { detail: { value: true } }));

    expect(child.disabled).to.be.false;
    expect(label.classList.contains("disabled")).to.be.false;
  });
});
