import { expect } from "chai";
import {
  shouldTransformPaste,
  markdownReplace,
  markdownTransform,
  getMarkdownPasteUpdate
} from "../src/bugzilla/mdPaste.js";

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
  it("replaces selection with clipboard hyperlink text when pasted content is not a naked URL", () => {
    const original = "needs label update";
    const start = original.indexOf("label");
    const end = start + "label".length;
    const html = '<a href="https://example.com/try">Bug 123</a>';
    const result = getMarkdownPasteUpdate({
      original,
      selectionStart: start,
      selectionEnd: end,
      selectedText: "label",
      plainText: "Bug 123",
      htmlText: html
    });
    expect(result.text).to.equal("needs [Bug 123](https://example.com/try) update");
  });
  it("inserts markdown links when no text is selected but clipboard contains a link", () => {
    const original = "prefix ";
    const html = '<a href="https://mozilla.org/foo">Bug 456</a>';
    const result = getMarkdownPasteUpdate({
      original,
      selectionStart: original.length,
      selectionEnd: original.length,
      selectedText: "",
      plainText: "Bug 456",
      htmlText: html
    });
    expect(result.text).to.equal("prefix [Bug 456](https://mozilla.org/foo)");
  });
  it("replaces selections with entire clipboard fragments when they include links plus text", () => {
    const original = "needs label update";
    const start = original.indexOf("label");
    const end = start + "label".length;
    const html = "<!--StartFragment-->text <a href=\"https://example.com/try\">link</a> end<!--EndFragment-->";
    const result = getMarkdownPasteUpdate({
      original,
      selectionStart: start,
      selectionEnd: end,
      selectedText: "label",
      plainText: "text link end",
      htmlText: html
    });
    expect(result.text).to.equal("needs text [link](https://example.com/try) end update");
  });
  it("falls back to default pasting when clipboard text is regular prose", () => {
    const original = "needs label update";
    const start = original.indexOf("label");
    const end = start + "label".length;
    const result = getMarkdownPasteUpdate({
      original,
      selectionStart: start,
      selectionEnd: end,
      selectedText: "label",
      plainText: "Bug 123 details",
      htmlText: ""
    });
    expect(result).to.be.null;
  });
  it("does not treat mixed text containing URLs as a bare URL paste", () => {
    const original = "needs label update";
    const start = original.indexOf("label");
    const end = start + "label".length;
    const text = "More info: https://example.com/details";
    const result = getMarkdownPasteUpdate({
      original,
      selectionStart: start,
      selectionEnd: end,
      selectedText: "label",
      plainText: text,
      htmlText: ""
    });
    expect(result).to.be.null;
  });
  it("ignores clipboard HTML without links", () => {
    const original = "prefix ";
    const result = getMarkdownPasteUpdate({
      original,
      selectionStart: original.length,
      selectionEnd: original.length,
      selectedText: "",
      plainText: "Bug",
      htmlText: "<div>Bug</div>"
    });
    expect(result).to.be.null;
  });
  it("inlines clipboard fragments that contain surrounding text and links", () => {
    const original = "prefix ";
    const html = "<!--StartFragment-->text <a href=\"https://example.com/try\">link</a> end<!--EndFragment-->";
    const result = getMarkdownPasteUpdate({
      original,
      selectionStart: original.length,
      selectionEnd: original.length,
      selectedText: "",
      plainText: "text link end",
      htmlText: html
    });
    expect(result.text).to.equal("prefix text [link](https://example.com/try) end");
  });
  it("preserves multiple links inside a clipboard fragment", () => {
    const original = "";
    const html = "<!--StartFragment-->one <a href=\"example.com/a\">alpha</a> and <a href=\"https://example.com/b\">beta</a><!--EndFragment-->";
    const result = getMarkdownPasteUpdate({
      original,
      selectionStart: 0,
      selectionEnd: 0,
      selectedText: "",
      plainText: "one alpha and beta",
      htmlText: html
    });
    expect(result.text).to.equal("one [alpha](https://example.com/a) and [beta](https://example.com/b)");
  });
});
