import { expect } from "chai";
import { isVideoUrl } from "../src/phabricator/videoEnhancer.js";
import {
  shouldTransformPaste as phabShouldTransformPaste,
  markdownReplace as phabMarkdownReplace
} from "../src/phabricator/mdPaste.js";

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
    expect(phabShouldTransformPaste("label", "example.com")).to.be.true;
    expect(phabShouldTransformPaste("label", "foo")).to.be.false;
    expect(phabShouldTransformPaste("", "example.com")).to.be.false;
  });

  it("wraps selection with markdown links", () => {
    const replaced = phabMarkdownReplace("hello there", 6, 11, "mozilla.org");
    expect(replaced).to.equal("hello [there](https://mozilla.org)");
  });
});
