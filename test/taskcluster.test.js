import { expect } from "chai";
import {
  extractMarkdownTable,
  stripLogPrefix,
  isMarkdownTableRow,
  isMarkdownDividerRow
} from "../src/taskcluster/markdownTable.js";

describe("Taskcluster markdown table extraction", () => {
  it("strips Taskcluster log prefixes", () => {
    const line = "[task 2026-02-05T19:56:48.672+00:00] | Benchmark | median |";
    expect(stripLogPrefix(line)).to.equal("| Benchmark | median |");
  });

  it("detects table rows and divider rows", () => {
    expect(isMarkdownTableRow("| a | b |")).to.equal(true);
    expect(isMarkdownTableRow("not a row")).to.equal(false);
    expect(isMarkdownDividerRow("|:---:|---|")).to.equal(true);
    expect(isMarkdownDividerRow("| a | b |")).to.equal(false);
  });

  it("extracts a markdown table and removes line prefixes", () => {
    const selected = [
      "[task 2026-02-05T19:56:48.672+00:00] | Benchmark | median | median None | % diff |",
      "[task 2026-02-05T19:56:48.672+00:00] |:-------------------------------------------:|:-------------:|:-------------:|:------:|",
      "[task 2026-02-05T19:56:48.672+00:00] | browserPageScroll | 610.925 | 738.986 | 17.3 |",
      "[task 2026-02-05T19:56:48.672+00:00] | homepageScroll | 559.046 | 633.191 | 11.7 |"
    ].join("\n");

    expect(extractMarkdownTable(selected)).to.equal(
      [
        "| Benchmark | median | median None | % diff |",
        "|:-------------------------------------------:|:-------------:|:-------------:|:------:|",
        "| browserPageScroll | 610.925 | 738.986 | 17.3 |",
        "| homepageScroll | 559.046 | 633.191 | 11.7 |"
      ].join("\n")
    );
  });

  it("returns null when selection has no table divider row", () => {
    const selected = [
      "[task 1] | Benchmark | median |",
      "[task 1] | browserPageScroll | 610.925 |"
    ].join("\n");
    expect(extractMarkdownTable(selected)).to.be.null;
  });

  it("extracts first valid table block from mixed selections", () => {
    const selected = [
      "[task 1] random line",
      "[task 1] | Header | Value |",
      "[task 1] |:------:|:-----:|",
      "[task 1] | one | 1 |",
      "[task 1] trailing text",
      "[task 1] | bad | block |",
      "[task 1] | not a divider |"
    ].join("\n");

    expect(extractMarkdownTable(selected)).to.equal(
      [
        "| Header | Value |",
        "|:------:|:-----:|",
        "| one | 1 |"
      ].join("\n")
    );
  });

  it("detects benchmark table from task log lines", () => {
    const selected = [
      "[task 2026-02-05T19:56:48.672+00:00] | Benchmark                               | median | median None | % diff |",
      "[task 2026-02-05T19:56:48.672+00:00] |:-------------------------------------------:|:-------------:|:--------:|",
      "[task 2026-02-05T19:56:48.672+00:00] | browserPageScroll                        | 610.925 | 738.986 | 17.3 |",
      "[task 2026-02-05T19:56:48.672+00:00] | homepageScroll                           | 559.046 | 633.191 | 11.7 |",
      "[task 2026-02-05T19:56:48.672+00:00] | normalBrowsing[composableToolbar=false]  | 582.565 | 729.420 | 20.1 |",
      "[task 2026-02-05T19:56:48.672+00:00] | normalBrowsing[composableToolbar=true]   | 614.994 | 851.017 | 27.7 |",
      "[task 2026-02-05T19:56:48.672+00:00] | onboarding                               | 470.923 | 545.571 | 13.7 |",
      "[task 2026-02-05T19:56:48.672+00:00] | privateBrowsing[composableToolbar=false] | 541.709 | 729.062 | 25.7 |",
      "[task 2026-02-05T19:56:48.672+00:00] | privateBrowsing[composableToolbar=true]  | 577.425 | 796.466 | 27.5 |",
      "[task 2026-02-05T19:56:48.672+00:00] | startup                                  | 520.551 | 682.901 | 23.8 |",
      "[task 2026-02-05T19:56:48.672+00:00] | startupLaunchIntent                      | 642.393 | 730.795 | 12.1 |",
      "[task 2026-02-05T19:56:48.672+00:00] | switchTabsAnimationOff                   | 20.000 | 0.000 |  |",
      "[task 2026-02-05T19:56:48.672+00:00] | switchTabsAnimationOn                    | 27.000 | 0.000 |  |",
      "[task 2026-02-05T19:56:48.672+00:00] | switchTabs[composableToolbar=false]      | 598.992 | 753.928 | 20.6 |",
      "[task 2026-02-05T19:56:48.672+00:00] | switchTabs[composableToolbar=true]       | 605.938 | 841.008 | 28.0 |"
    ].join("\n");

    const table = extractMarkdownTable(selected);
    expect(table).to.be.a("string");
    expect(table).to.include("| Benchmark                               | median | median None | % diff |");
    expect(table).to.include("| startupLaunchIntent                      | 642.393 | 730.795 | 12.1 |");
    expect(table).to.not.include("[task 2026-02-05T19:56:48.672+00:00]");
  });
});
