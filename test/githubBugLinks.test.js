import { expect } from "chai";
import { JSDOM } from "jsdom";

describe("Firefox PR title bug links", () => {
  let dom;
  let onChange;
  let messages;
  let importId = 0;

  async function setup(path = "/mozilla-firefox/firefox/pull/398", settings = {}) {
    dom = new JSDOM("<!doctype html><body></body>", { url: `https://github.com${path}` });
    for (const name of ["window", "document", "location", "Node", "NodeFilter", "MutationObserver"]) {
      global[name] = dom.window[name];
    }
    messages = [];
    global.browser = {
      storage: {
        sync: { get: (defaults) => Promise.resolve({ ...defaults, ...settings }) },
        onChanged: { addListener: (listener) => { onChange = listener; } }
      },
      runtime: { sendMessage: (message) => { messages.push(message); return Promise.resolve({ status: "success" }); } }
    };
    await import(`../content/github.js?buglinks=${importId++}`);
    await flush();
  }

  async function flush() {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  }

  afterEach(() => {
    dom?.window.close();
    delete global.browser;
  });

  it("links bug numbers in dynamically inserted titles without duplicating links", async () => {
    await setup();
    document.body.innerHTML = '<span class="f1 markdown-title">Bug 2071822 - fix nightly tests</span>';
    await flush();
    const title = document.querySelector(".markdown-title");
    let link = title.querySelector("a");
    expect(link.href).to.equal("https://bugzilla.mozilla.org/show_bug.cgi?id=2071822");
    expect(link.textContent).to.equal("Bug 2071822");
    expect(title.textContent).to.equal("Bug 2071822 - fix nightly tests");
    title.appendChild(document.createTextNode("!"));
    await flush();
    expect(title.querySelectorAll("a")).to.have.lengthOf(1);
    title.textContent = "Bug 123 - new title";
    await flush();
    link = title.querySelector("a");
    expect(link.href).to.equal("https://bugzilla.mozilla.org/show_bug.cgi?id=123");
  });

  it("ignores nonmatching titles and existing links", async () => {
    await setup();
    document.body.innerHTML = '<span class="markdown-title">No bug number <a href="/existing">Bug 42</a></span>';
    await flush();
    expect(document.querySelectorAll(".markdown-title a")).to.have.lengthOf(1);
    expect(document.querySelector("a").getAttribute("href")).to.equal("/existing");
  });

  it("responds to preference changes and keeps try status working", async () => {
    await setup(undefined, { enableGithubBugLinks: false });
    document.body.innerHTML = '<span class="markdown-title">Bug 123 - test</span><a href="https://treeherder.mozilla.org/jobs?repo=try&revision=abc">try</a>';
    await flush();
    expect(document.querySelector(".markdown-title a")).to.not.exist;
    expect(document.querySelector("[data-github-try-icon]")).to.exist;
    expect(messages).to.have.lengthOf(1);
    onChange({ enableGithubBugLinks: { newValue: true } }, "sync");
    expect(document.querySelector(".markdown-title a")).to.not.exist;
    onChange({ enableGithubBugLinks: { newValue: false } }, "sync");
    expect(document.querySelector(".markdown-title a")).to.not.exist;
    expect(document.querySelector(".markdown-title").textContent).to.equal("Bug 123 - test");
    expect(document.querySelector("[data-github-try-icon]")).to.exist;
  });

  it("leaves existing links untouched when the preference is disabled", async () => {
    await setup();
    document.body.innerHTML = '<span class="markdown-title">Bug 123 - test</span>';
    await flush();
    const link = document.querySelector(".markdown-title a");
    onChange({ enableGithubBugLinks: { newValue: false } }, "sync");
    expect(document.querySelector(".markdown-title a")).to.equal(link);
    document.querySelector(".markdown-title").textContent = "Bug 456 - updated title";
    await flush();
    expect(document.querySelector(".markdown-title a")).to.not.exist;
    expect(document.querySelector(".markdown-title").textContent).to.equal("Bug 456 - updated title");
  });

  it("does not link titles in other repositories", async () => {
    await setup("/mozilla/gecko-dev/pull/123");
    document.body.innerHTML = '<span class="markdown-title">Bug 123 - test</span>';
    await flush();
    expect(document.querySelector(".markdown-title a")).to.not.exist;
  });
});
