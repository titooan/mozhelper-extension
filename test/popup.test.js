import { expect } from "chai";
import { JSDOM } from "jsdom";

describe("Popup GitHub permission prompt", () => {
  let popupApi;
  let permissionGranted;
  let requestShouldGrant;
  let requestedPermissions;
  let reloadedTabs;
  let activeTabUrl;

  function installDom() {
    const dom = new JSDOM(`
      <!doctype html>
      <body>
        <section id="githubPermissionPrompt" style="display: none;">
          <button id="grantGithubPermission" type="button"></button>
        </section>
        <p id="status"></p>
      </body>
    `, { url: "moz-extension://test/popup.html" });
    global.window = dom.window;
    global.document = dom.window.document;
    global.CustomEvent = dom.window.CustomEvent;
    return dom;
  }

  before(async () => {
    installDom();
    permissionGranted = false;
    requestShouldGrant = true;
    requestedPermissions = [];
    reloadedTabs = [];
    activeTabUrl = "https://github.com/mozilla/gecko-dev/pull/123";
    const runtimeStub = {
      tabs: {
        query: () => Promise.resolve([{ id: 7, url: activeTabUrl }]),
        reload: (tabId) => {
          reloadedTabs.push(tabId);
          return Promise.resolve();
        }
      },
      permissions: {
        contains: () => Promise.resolve(permissionGranted),
        request: (permissions) => {
          requestedPermissions.push(permissions);
          permissionGranted = requestShouldGrant;
          return Promise.resolve(requestShouldGrant);
        }
      }
    };
    global.browser = runtimeStub;
    global.chrome = runtimeStub;
    global.MozHelperSettings = {
      initToggles: () => {},
      bindDependentToggle: () => {}
    };
    global.__mozHelperExposePopupForTests = (api) => {
      popupApi = api;
    };
    await import("../popup.js");
    expect(popupApi).to.exist;
  });

  beforeEach(() => {
    installDom();
    permissionGranted = false;
    requestShouldGrant = true;
    requestedPermissions = [];
    reloadedTabs = [];
    activeTabUrl = "https://github.com/mozilla/gecko-dev/pull/123";
  });

  after(() => {
    delete global.browser;
    delete global.chrome;
    delete global.MozHelperSettings;
    delete global.__mozHelperExposePopupForTests;
  });

  it("detects GitHub pull request URLs", () => {
    expect(popupApi.isGithubPullRequestUrl("https://github.com/mozilla/gecko-dev/pull/123")).to.be.true;
    expect(popupApi.isGithubPullRequestUrl("https://github.com/mozilla/gecko-dev/pull/123/files")).to.be.true;
    expect(popupApi.isGithubPullRequestUrl("https://github.com/mozilla/gecko-dev/issues/123")).to.be.false;
    expect(popupApi.isGithubPullRequestUrl("https://example.com/mozilla/gecko-dev/pull/123")).to.be.false;
  });

  it("shows a grant button on GitHub PRs without permission", async () => {
    const prompt = document.getElementById("githubPermissionPrompt");
    const button = document.getElementById("grantGithubPermission");
    await popupApi.updateGithubPermissionPrompt(prompt, button, document.getElementById("status"));

    expect(prompt.style.display).to.equal("block");
    expect(button.disabled).to.be.false;
  });

  it("requests GitHub permission and reloads the current PR", async () => {
    const prompt = document.getElementById("githubPermissionPrompt");
    const button = document.getElementById("grantGithubPermission");
    const status = document.getElementById("status");
    await popupApi.updateGithubPermissionPrompt(prompt, button, status);

    await button.onclick();

    expect(requestedPermissions).to.deep.equal([{ origins: ["https://github.com/*"] }]);
    expect(reloadedTabs).to.deep.equal([7]);
    expect(prompt.style.display).to.equal("none");
    expect(status.textContent).to.equal("GitHub access granted. Reloading PR.");
  });

  it("does not show the prompt away from GitHub PRs", async () => {
    activeTabUrl = "https://github.com/mozilla/gecko-dev/issues/123";
    const prompt = document.getElementById("githubPermissionPrompt");
    const button = document.getElementById("grantGithubPermission");
    await popupApi.updateGithubPermissionPrompt(prompt, button, document.getElementById("status"));

    expect(prompt.style.display).to.equal("none");
    expect(button.disabled).to.be.true;
  });

  it("does not show the prompt when GitHub permission is already granted", async () => {
    permissionGranted = true;
    const prompt = document.getElementById("githubPermissionPrompt");
    const button = document.getElementById("grantGithubPermission");
    await popupApi.updateGithubPermissionPrompt(prompt, button, document.getElementById("status"));

    expect(prompt.style.display).to.equal("none");
    expect(button.disabled).to.be.true;
  });

  it("reports a denied GitHub permission request without reloading", async () => {
    requestShouldGrant = false;
    const prompt = document.getElementById("githubPermissionPrompt");
    const button = document.getElementById("grantGithubPermission");
    const status = document.getElementById("status");
    await popupApi.updateGithubPermissionPrompt(prompt, button, status);

    await button.onclick();

    expect(requestedPermissions).to.deep.equal([{ origins: ["https://github.com/*"] }]);
    expect(reloadedTabs).to.deep.equal([]);
    expect(prompt.style.display).to.equal("block");
    expect(status.textContent).to.equal("GitHub access was not granted.");
  });
});
