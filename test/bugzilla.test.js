import { expect } from "chai";
import { shouldTransformPaste, markdownReplace, markdownTransform } from "../src/bugzilla/mdPaste.js";

function transformAllowed(original, start, end, pasted) {
  const selected = original.slice(start, end);
  return shouldTransformPaste(original, start, end, selected, pasted);
}

describe("Bugzilla markdown paste", () => {
  it("decides correctly when to transform", () => {
    expect(transformAllowed("hello world", 0, 5, "https://mozilla.org")).to.be.true;
    expect(transformAllowed("hello world", 0, 5, "mozilla.org")).to.be.true;
    expect(transformAllowed("hello world", 0, 5, "test")).to.be.false;
  });
  it("requires selected text and real URLs", () => {
    expect(shouldTransformPaste("hello", 0, 0, "", "https://mozilla.org")).to.be.false;
    expect(transformAllowed("hello", 0, 5, "file.png")).to.be.false;
  });
  it("ignores selections that are already links", () => {
    const text = "see https://example.com";
    expect(transformAllowed(text, 4, text.length, "https://mozilla.org")).to.be.false;
  });
  it("ignores selections overlapping markdown links", () => {
    const text = "see [Bug 123](https://example.com/Bug123)";
    expect(transformAllowed(text, 5, 14, "https://mozilla.org")).to.be.false;
    expect(transformAllowed(text, 5, text.length, "https://mozilla.org")).to.be.false;
    const urlSlice = "example.com/Bug123";
    const start = text.indexOf(urlSlice);
    const end = start + urlSlice.length;
    expect(transformAllowed(text, start, end, "https://mozilla.org")).to.be.false;
  });
  it("still transforms outside markdown links", () => {
    const text = "prefix [Bug 123](https://example.com/Bug123) suffix text";
    const start = text.indexOf("suffix");
    const end = start + "suffix".length;
    expect(transformAllowed(text, start, end, "https://mozilla.org")).to.be.true;
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
