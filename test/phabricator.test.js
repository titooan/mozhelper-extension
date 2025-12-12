import { expect } from "chai";
import { isVideoUrl } from "../src/phabricator/videoEnhancer.js";
import {
  shouldTransformPaste as phabShouldTransformPaste,
  markdownReplace as phabMarkdownReplace
} from "../src/phabricator/mdPaste.js";
import { buildFailedJobsTooltip, SUCCESS_TOOLTIP, PENDING_TOOLTIP } from "../src/phabricator/tryStatusTooltip.js";
import { assessTryJobs } from "../src/treeherder/tryStatus.js";

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

describe("Phabricator try tooltip helper", () => {
  it("returns null when nothing fails", () => {
    expect(buildFailedJobsTooltip([])).to.be.null;
    expect(buildFailedJobsTooltip(null)).to.be.null;
  });

  it("lists failing jobs with platform and result", () => {
    const tooltip = buildFailedJobsTooltip([
      { name: "mochitest", platform: "linux", result: "testfailed" },
      { jobSymbol: "M1", result: "retry" }
    ]);
    expect(tooltip).to.include("Failed jobs: 2");
    expect(tooltip).to.include("mochitest (linux) - testfailed");
    expect(tooltip).to.include("M1 - retry");
  });

  it("does not list retry jobs when fed Treeherder data", () => {
    const { failedJobs } = assessTryJobs([{ state: "retry", result: "" }]);
    const tooltip = buildFailedJobsTooltip(failedJobs);
    expect(tooltip).to.be.null;
  });

  it("deduplicates job names within the tooltip", () => {
    const tooltip = buildFailedJobsTooltip([
      { name: "mochitest", platform: "linux", result: "testfailed" },
      { jobSymbol: "mochitest", platform: "windows", result: "busted" },
      { jobSymbol: "web-platform", platform: "linux", result: "busted" }
    ]);
    expect(tooltip).to.include("Failed jobs: 3");
    const mochitestLines = tooltip.split("\n").filter((line) => line.includes("mochitest"));
    expect(mochitestLines).to.have.length(1);
  });

  it("only shows the summary line when more than five jobs fail", () => {
    const jobs = Array.from({ length: 7 }, (_, i) => ({ name: `job-${i}`, result: "failed" }));
    const tooltip = buildFailedJobsTooltip(jobs);
    expect(tooltip).to.equal("Failed jobs: 7");
  });

  it("exposes a success tooltip copy", () => {
    expect(SUCCESS_TOOLTIP).to.equal("Passed");
  });

  it("exposes a pending tooltip copy", () => {
    expect(PENDING_TOOLTIP).to.equal("Loading");
  });
});
