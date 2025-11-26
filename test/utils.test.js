import { expect } from "chai";
import { isLikelyURL } from "../src/utils/url.js";

describe("isLikelyURL", () => {
  it("accepts full URLs", () => {
    expect(isLikelyURL("https://mozilla.org")).to.be.true;
    expect(isLikelyURL("http://example.com/foo")).to.be.true;
  });
  it("accepts naked domains", () => {
    expect(isLikelyURL("mozilla.org")).to.be.true;
    expect(isLikelyURL("foo.bar.io/path")).to.be.true;
  });
  it("rejects non-URLs", () => {
    expect(isLikelyURL("test")).to.be.false;
    expect(isLikelyURL("hello world")).to.be.false;
    expect(isLikelyURL("file.png")).to.be.false;
  });
});
