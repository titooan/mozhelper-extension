import { expect } from "chai";
import {
  findMatrixArtifact,
  extractWebLinkFromMatrix,
  findUnitTestReportArtifact,
  selectLatestRunId,
  buildUnitTestArtifactLink,
  TREEHERDER_TC_BASE
} from "../src/treeherder/testlab.js";
import {
  APK_ARTIFACT_NAME,
  APK_JOB_LABELS,
  APK_JOB_NAMES,
  buildTaskclusterArtifactUrl,
  selectLatestApkJobEntries
} from "../src/treeherder/apkLinks.js";
import {
  MACROBENCHMARK_JOB_NAME,
  shouldShowMacrobenchmarkTable,
  findLiveBackingLogArtifact,
  extractMacrobenchmarkMarkdownTable,
  parseMarkdownTable
} from "../src/treeherder/performanceTable.js";
import { assessTryJobs } from "../src/treeherder/tryStatus.js";
import {
  buildLandoLandingJobUrl,
  buildLandoRevisionCacheKey,
  getLandoApiBaseUrl
} from "../src/treeherder/lando.js";
import {
  findCostReportArtifact,
  parseFirebaseCostReport
} from "../src/treeherder/costReport.js";

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

  it("ignores unscheduled unknown jobs when failures exist", () => {
    const result = assessTryJobs([
      { state: "unscheduled", result: "unknown", job_type_name: "signing-apk-fenix-debug" },
      { state: "completed", result: "failed", job_type_name: "xpcshell" }
    ]);
    expect(result.status).to.equal("failure");
    expect(result.reason).to.be.null;
    expect(result.summary.activeJobs).to.equal(0);
    expect(result.summary.failedJobs).to.equal(1);
  });

  it("ignores non-blocking tier failures", () => {
    const result = assessTryJobs([
      { state: "completed", result: "success", job_type_name: "linux-test", tier: 1 },
      { state: "completed", result: "testfailed", job_type_name: "fuzzing-simple", tier: 3 }
    ]);
    expect(result.status).to.equal("success");
    expect(result.summary.failedJobs).to.equal(0);
    expect(result.failedJobs).to.have.length(0);
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

describe("Treeherder Lando helper", () => {
  it("uses the legacy Lando API when no instance is supplied", () => {
    expect(getLandoApiBaseUrl(null)).to.equal("https://api.lando.services.mozilla.com");
    expect(buildLandoLandingJobUrl("41159", null)).to.equal(
      "https://api.lando.services.mozilla.com/landing_jobs/41159?lando_revision_id=41159&count=1"
    );
  });

  it("uses lando.moz.tools for lando-prod-2025 links", () => {
    expect(getLandoApiBaseUrl("lando-prod-2025")).to.equal("https://lando.moz.tools");
    expect(buildLandoLandingJobUrl("41159", "lando-prod-2025")).to.equal(
      "https://lando.moz.tools/landing_jobs/41159/?lando_revision_id=41159&count=1"
    );
    expect(buildLandoRevisionCacheKey("41159", "lando-prod-2025")).to.equal(
      "https://lando.moz.tools:41159"
    );
  });
});

describe("Treeherder APK helper", () => {
  it("selects the latest signing APK jobs", () => {
    const jobs = [
      { job_type_name: "signing-apk-fenix-debug", task_id: "old-fenix", start_timestamp: 100 },
      { job_type_name: "unrelated-job", task_id: "ignore-me", start_timestamp: 200 },
      { job_type_name: "signing-apk-focus-debug", task_id: "focus-1", start_timestamp: 120 },
      { job_type_name: "signing-apk-fenix-debug", task_id: "new-fenix", start_timestamp: 300 }
    ];

    const result = selectLatestApkJobEntries(jobs);
    expect(result).to.deep.equal([
      { jobName: APK_JOB_NAMES[0], label: APK_JOB_LABELS[APK_JOB_NAMES[0]], taskId: "new-fenix" },
      { jobName: APK_JOB_NAMES[1], label: APK_JOB_LABELS[APK_JOB_NAMES[1]], taskId: "focus-1" }
    ]);
  });

  it("builds taskcluster artifact URLs for APKs", () => {
    expect(buildTaskclusterArtifactUrl("abc123", APK_ARTIFACT_NAME)).to.equal(
      `${TREEHERDER_TC_BASE}/api/queue/v1/task/abc123/runs/0/artifacts/${APK_ARTIFACT_NAME}`
    );
  });

  it("returns an empty list when there are no matching APK jobs", () => {
    expect(selectLatestApkJobEntries([{ job_type_name: "other", task_id: "1" }])).to.deep.equal([]);
  });
});

describe("Treeherder macrobenchmark performance table helper", () => {
  it("enables table rendering only for the macrobenchmark job name", () => {
    expect(shouldShowMacrobenchmarkTable(MACROBENCHMARK_JOB_NAME)).to.equal(true);
    expect(shouldShowMacrobenchmarkTable(` ${MACROBENCHMARK_JOB_NAME} `)).to.equal(true);
    expect(shouldShowMacrobenchmarkTable("run-other-job")).to.equal(false);
  });

  it("finds live_backing.log artifact", () => {
    const artifacts = [
      { name: "public/logs/live_backing.log" },
      { name: "public/logs/live.log" }
    ];
    expect(findLiveBackingLogArtifact(artifacts)).to.deep.equal(artifacts[0]);
    expect(findLiveBackingLogArtifact([{ name: "public/build/whatever.txt" }])).to.be.null;
  });

  it("extracts and parses benchmark markdown table from task logs", () => {
    const logText = [
      "[task 2026-02-05T19:56:48.672+00:00] | Benchmark                               | median | median None | % diff |",
      "[task 2026-02-05T19:56:48.672+00:00] |:-------------------------------------------:|:-------------:|:--------:|",
      "[task 2026-02-05T19:56:48.672+00:00] | browserPageScroll                        | 610.925 | 738.986 | 17.3 |",
      "[task 2026-02-05T19:56:48.672+00:00] | switchTabsAnimationOff                   | 20.000 | 0.000 |  |"
    ].join("\n");

    const markdown = extractMacrobenchmarkMarkdownTable(logText);
    expect(markdown).to.be.a("string");
    expect(markdown).to.not.include("[task ");

    const parsed = parseMarkdownTable(markdown);
    expect(parsed).to.not.equal(null);
    expect(parsed.headers[0]).to.equal("Benchmark");
    expect(parsed.rows[0][0]).to.equal("browserPageScroll");
    expect(parsed.rows[1][0]).to.equal("switchTabsAnimationOff");
  });

  it("preserves markdown formatting for clipboard copy", () => {
    const logText = [
      "[task 2026-02-05T19:56:48.672+00:00] | Benchmark                               | median | median None | % diff |",
      "[task 2026-02-05T19:56:48.672+00:00] |:-------------------------------------------:|:-------------:|:--------:|",
      "[task 2026-02-05T19:56:48.672+00:00] | browserPageScroll                        | 610.925 | 738.986 | 17.3 |"
    ].join("\n");

    const markdown = extractMacrobenchmarkMarkdownTable(logText);
    expect(markdown).to.equal(
      [
        "| Benchmark                               | median | median None | % diff |",
        "|:-------------------------------------------:|:-------------:|:--------:|",
        "| browserPageScroll                        | 610.925 | 738.986 | 17.3 |"
      ].join("\n")
    );
  });
});

describe("Treeherder Firebase cost report helper", () => {
  it("finds the CostReport artifact", () => {
    const artifacts = [
      { name: "public/results/logcat.txt" },
      { name: "public/results/CostReport.txt" }
    ];
    expect(findCostReportArtifact(artifacts)).to.equal(artifacts[1]);
    expect(findCostReportArtifact([{ name: "public/results/OtherReport.txt" }])).to.be.null;
  });

  it("formats the last two non-empty CostReport lines", () => {
    const report = [
      "Firebase TestLab costs",
      "",
      "Physical devices",
      "$2.33 for 28m",
      ""
    ].join("\n");
    expect(parseFirebaseCostReport(report)).to.equal("Physical devices: $2.33 for 28m");
  });

  it("does not duplicate a CostReport label colon", () => {
    expect(parseFirebaseCostReport("Header\nPhysical devices:\n$2.33 for 28m")).to.equal(
      "Physical devices: $2.33 for 28m"
    );
  });

  it("returns null when the CostReport is missing useful lines", () => {
    expect(parseFirebaseCostReport("Only one line")).to.be.null;
    expect(parseFirebaseCostReport(null)).to.be.null;
  });
});
