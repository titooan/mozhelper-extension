import { expect } from "chai";
import { findBugMatches, buildBugURL } from "../src/gmail/bugzillaLinkify.js";
import { getTypeMeta, formatAssignee, formatStatus } from "../src/gmail/tooltip.js";

describe("Gmail Bugzilla linkifier", () => {
  it("finds bug IDs in text", () => {
    const ids = findBugMatches("Bug 12345 and Bug 67890 and Bug 12345 again");
    expect(ids.sort()).to.deep.equal(["12345", "67890"]);
  });
  it("builds correct Bugzilla URL", () => {
    expect(buildBugURL("12345")).to.equal("https://bugzilla.mozilla.org/show_bug.cgi?id=12345");
  });
  it("returns empty array when no matches", () => {
    expect(findBugMatches("just text")).to.deep.equal([]);
  });

  describe("tooltip helpers", () => {
    it("formats status with resolution", () => {
      expect(formatStatus("RESOLVED", "FIXED")).to.equal("RESOLVED FIXED");
      expect(formatStatus("NEW", "")).to.equal("NEW");
    });
    it("formats assignee names", () => {
      expect(formatAssignee("nobody@mozilla.org")).to.equal("Unassigned");
      expect(formatAssignee("dev@mozilla.org", { real_name: "Dev Rel" })).to.equal("Dev Rel");
      expect(formatAssignee("owner@mozilla.org")).to.equal("owner@mozilla.org");
    });
    it("normalizes type metadata", () => {
      const defect = getTypeMeta("DEFECT");
      expect(defect.label).to.equal("Defect");
      expect(defect.color).to.equal("#d93025");
      const fallback = getTypeMeta("custom_type");
      expect(fallback.label).to.equal("Custom_type");
      expect(fallback.color).to.equal("#64748b");
      const unknown = getTypeMeta("");
      expect(unknown.label).to.equal("Unknown");
    });
  });
});
