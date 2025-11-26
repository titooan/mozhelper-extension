import { expect } from "chai";
import { shouldTransformPaste, markdownReplace, markdownTransform } from "../src/bugzilla/mdPaste.js";

describe("Bugzilla markdown paste", () => {
  it("decides correctly when to transform", () => {
    expect(shouldTransformPaste("text", "https://mozilla.org")).to.be.true;
    expect(shouldTransformPaste("text", "mozilla.org")).to.be.true;
    expect(shouldTransformPaste("text", "test")).to.be.false;
  });
  it("requires selected text and real URLs", () => {
    expect(shouldTransformPaste("", "https://mozilla.org")).to.be.false;
    expect(shouldTransformPaste("text", "file.png")).to.be.false;
  });
  it("wraps selected text with markdown", () => {
    const original = "hello world";
    const out = markdownReplace(original, 6, 11, "https://mozilla.org");
    expect(out).to.equal("hello [world](https://mozilla.org)");
  });
  it("adds https:// when protocol missing", () => {
    const original = "see bug";
    const out = markdownReplace(original, 4, 7, "mozilla.org/123");
    expect(out).to.equal("see [bug](https://mozilla.org/123)");
  });
  it("returns caret location after replacement", () => {
    const result = markdownTransform("hello world", 0, 5, "https://mozilla.org");
    expect(result.text).to.equal("[hello](https://mozilla.org) world");
    expect(result.caret).to.equal("[hello](https://mozilla.org)".length);
  });
});
