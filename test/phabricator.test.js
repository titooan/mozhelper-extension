import { expect } from "chai";
import { isVideoUrl } from "../src/phabricator/videoEnhancer.js";
import {
  shouldTransformPaste as phabShouldTransformPaste,
  markdownReplace as phabMarkdownReplace
} from "../src/phabricator/mdPaste.js";

function phabTransformAllowed(original, start, end, pasted) {
  const selected = original.slice(start, end);
  return phabShouldTransformPaste(original, start, end, selected, pasted);
}

describe("Phabricator video detection", () => {
  it("accepts video URLs", () => {
    expect(isVideoUrl("https://example.com/file.mov")).to.be.true;
    expect(isVideoUrl("foo/bar.MP4")).to.be.true;
  });
  it("rejects non-video URLs", () => {
    expect(isVideoUrl("https://example.com/file.txt")).to.be.false;
    expect(isVideoUrl("https://example.com/image.png")).to.be.false;
  });
});

describe("Phabricator markdown paste helper", () => {
  it("requires selected text and probable URLs", () => {
    expect(phabTransformAllowed("label", 0, 5, "example.com")).to.be.true;
    expect(phabTransformAllowed("label", 0, 5, "foo")).to.be.false;
    expect(phabShouldTransformPaste("label", 0, 0, "", "example.com")).to.be.false;
  });

  it("ignores selections that are already URLs", () => {
    const text = "test https://phabricator.services.mozilla.com/D123";
    expect(phabTransformAllowed(text, 5, text.length, "https://mozilla.org")).to.be.false;
  });

  it("ignores selections overlapping markdown links", () => {
    const text = "[tsst](https://phabricator.services.mozilla.com/D272886)";
    expect(phabTransformAllowed(text, 1, 5, "https://mozilla.org")).to.be.false;
    expect(phabTransformAllowed(text, 0, text.length, "https://mozilla.org")).to.be.false;
    const slice = "com/D272886";
    const start = text.indexOf(slice);
    const end = start + slice.length;
    expect(phabTransformAllowed(text, start, end, "https://mozilla.org")).to.be.false;
  });
  it("still transforms outside markdown links", () => {
    const text = "[tsst](https://phabricator.services.mozilla.com/D272886) tail";
    const start = text.indexOf("tail");
    const end = start + 4;
    expect(phabTransformAllowed(text, start, end, "https://mozilla.org")).to.be.true;
  });

  it("wraps selection with markdown links", () => {
    const replaced = phabMarkdownReplace("hello there", 6, 11, "mozilla.org");
    expect(replaced).to.equal("hello [there](https://mozilla.org)");
  });
});
