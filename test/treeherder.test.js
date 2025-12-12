import { expect } from "chai";
import {
  findMatrixArtifact,
  extractWebLinkFromMatrix,
  findUnitTestReportArtifact,
  selectLatestRunId,
  buildUnitTestArtifactLink,
  TREEHERDER_TC_BASE
} from "../src/treeherder/testlab.js";
import { assessTryJobs } from "../src/treeherder/tryStatus.js";

describe("Treeherder Firebase helper", () => {
  describe("findMatrixArtifact", () => {
    it("returns the artifact ending with matrix_ids.json", () => {
      const artifacts = [
        { name: "public/logs/live_backing.log" },
        { name: "public/build/matrix_ids.json" },
        { name: "public/other/thing.txt" }
      ];
      const result = findMatrixArtifact(artifacts);
      expect(result).to.equal(artifacts[1]);
    });

    it("returns null when no matrix artifact exists", () => {
      const artifacts = [{ name: "public/build/manifest.json" }];
      expect(findMatrixArtifact(artifacts)).to.be.null;
    });
  });

  describe("extractWebLinkFromMatrix", () => {
    it("returns the first entry that contains a webLink", () => {
      const matrix = {
        shard1: { device: "Pixel 6", webLink: "https://firebase/link/1" },
        shard2: { device: "Pixel 5", webLink: "https://firebase/link/2" }
      };
      expect(extractWebLinkFromMatrix(matrix)).to.equal("https://firebase/link/1");
    });

    it("ignores entries without a webLink", () => {
      const matrix = {
        shard1: { device: "Pixel 6" },
        shard2: { device: "Pixel 5" }
      };
      expect(extractWebLinkFromMatrix(matrix)).to.be.null;
    });
  });

  describe("findUnitTestReportArtifact", () => {
    it("returns artifacts ending with UnitTest index", () => {
      const artifacts = [
        { name: "public/reports/test/testFenixDebugUnitTest/index.html" },
        { name: "public/reports/test/testFocusReleaseUnitTest/index.html" }
      ];
      const result = findUnitTestReportArtifact(artifacts);
      expect(result).to.equal(artifacts[0]);
    });

    it("returns null when pattern not found", () => {
      const artifacts = [{ name: "public/reports/test/testNotTests/index.html" }];
      expect(findUnitTestReportArtifact(artifacts)).to.be.null;
    });
  });

  describe("selectLatestRunId", () => {
    it("returns latest run id when present", () => {
      const status = {
        status: {
          runs: [{ runId: 0 }, { runId: 1 }]
        }
      };
      expect(selectLatestRunId(status)).to.equal(1);
    });

    it("falls back to runs length when runId missing", () => {
      const status = { status: { runs: [{}, {}] } };
      expect(selectLatestRunId(status)).to.equal(1);
    });

    it("handles empty or malformed payloads", () => {
      expect(selectLatestRunId({ status: {} })).to.equal(0);
      expect(selectLatestRunId(null)).to.equal(0);
    });
  });

  describe("buildUnitTestArtifactLink", () => {
    it("builds a Taskcluster artifact URL", () => {
      const link = buildUnitTestArtifactLink("abc", 2, "public/reports/test/testFooUnitTest/index.html");
      expect(link).to.equal(
        `${TREEHERDER_TC_BASE}/api/queue/v1/task/abc/runs/2/artifacts/public/reports/test/testFooUnitTest/index.html`
      );
    });

    it("returns null on invalid inputs", () => {
      expect(buildUnitTestArtifactLink("", 1, "thing")).to.be.null;
      expect(buildUnitTestArtifactLink("abc", -1, "thing")).to.be.null;
      expect(buildUnitTestArtifactLink("abc", 0, "")).to.be.null;
    });
  });
});

describe("Treeherder try status helper", () => {
  it("marks run as pending when any job lacks result", () => {
    const result = assessTryJobs([
      { state: "pending", result: null },
      { state: "completed", result: "success" }
    ]);
    expect(result.status).to.be.null;
    expect(result.summary).to.deep.include({ totalJobs: 2, activeJobs: 1, failedJobs: 0 });
    expect(result.pendingJobs).to.have.length(1);
    expect(result.pendingJobs[0].state).to.equal("pending");
  });

  it("marks run as failure when a job completes unsuccessfully", () => {
    const { status, failedJobs } = assessTryJobs([
      { state: "completed", result: "success" },
      { state: "completed", result: "testfailed", job_type_name: "mochitest" }
    ]);
    expect(status).to.equal("failure");
    expect(failedJobs).to.have.length(1);
    expect(failedJobs[0].name).to.equal("mochitest");
  });

  it("marks run as success when all jobs finish successfully", () => {
    const result = assessTryJobs([{ result: "success" }, { result: "skipped" }]);
    expect(result.status).to.equal("success");
    expect(result.summary).to.deep.include({ totalJobs: 2, activeJobs: 0, failedJobs: 0 });
  });

  it("ignores earlier failures when a later retry succeeds for the same job", () => {
    const result = assessTryJobs([
      { job_type_name: "mochitest", platform: "linux", state: "completed", result: "testfailed", start_timestamp: 100 },
      { job_type_name: "mochitest", platform: "linux", state: "completed", result: "success", start_timestamp: 200 }
    ]);
    expect(result.status).to.equal("success");
    expect(result.failedJobs).to.have.length(0);
  });

  it("treats the latest run as authoritative when it fails after an earlier success", () => {
    const result = assessTryJobs([
      { job_type_name: "mochitest", platform: "linux", state: "completed", result: "success", start_timestamp: 100 },
      { job_type_name: "mochitest", platform: "linux", state: "completed", result: "testfailed", start_timestamp: 300 }
    ]);
    expect(result.status).to.equal("failure");
    expect(result.failedJobs).to.have.length(1);
    expect(result.failedJobs[0].name).to.equal("mochitest");
  });

  it("ignores jobs that are retried when assessing status", () => {
    const result = assessTryJobs([
      { state: "completed", result: "success" },
      { state: "retry", result: "", job_type_name: "needs retry" },
      { state: "completed", result: "retry", job_type_name: "mochitest" }
    ]);
    expect(result.status).to.equal("success");
    expect(result.summary).to.deep.include({ totalJobs: 3, activeJobs: 0, failedJobs: 0 });
    expect(result.failedJobs).to.have.length(0);
  });

  it("treats unknown results as pending rather than failure", () => {
    const result = assessTryJobs([{ state: "completed", result: "unknown" }]);
    expect(result.status).to.be.null;
    expect(result.reason).to.equal("pending");
    expect(result.summary).to.deep.include({ totalJobs: 1, activeJobs: 1, failedJobs: 0 });
    expect(result.failedJobs).to.have.length(0);
  });

  it("keeps pending status when failures exist alongside unknown jobs", () => {
    const result = assessTryJobs([
      { state: "completed", result: "unknown" },
      { state: "completed", result: "failed", job_type_name: "xpcshell" }
    ]);
    expect(result.status).to.be.null;
    expect(result.reason).to.equal("pending");
    expect(result.failedJobs).to.have.length(1);
    expect(result.failedJobs[0].name).to.equal("xpcshell");
    expect(result.summary.failedJobs).to.equal(1);
  });

  it("handles malformed inputs", () => {
    const result = assessTryJobs(null);
    expect(result.reason).to.equal("missing-jobs");
    expect(result.summary.totalJobs).to.equal(0);
  });

  it("tracks diagnostics for deduped and ignored jobs", () => {
    const result = assessTryJobs([
      { job_type_name: "mochitest", state: "completed", result: "success", start_timestamp: 100 },
      { job_type_name: "mochitest", state: "completed", result: "success", start_timestamp: 200 },
      { job_type_name: "web-platform", state: "retry", result: "" }
    ]);
    expect(result.summary.uniqueJobs).to.equal(1);
    expect(result.summary.consideredJobs).to.equal(2);
    expect(result.summary.dedupedJobs).to.equal(1);
    expect(result.summary.ignoredRetries).to.equal(1);
    expect(result.summary.ignoredJobs).to.equal(1);
  });
});
