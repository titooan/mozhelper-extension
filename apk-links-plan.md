# APK Links Implementation Plan

## Goal

Extend the Phabricator `Diff detail` card's `Last try` entry so it keeps the existing first line:

- `Try link`
- optional `Link to comment`

and adds a second line with direct APK links extracted from the same try push:

- `fenix-debug.apk`
- `focus-debug.apk`

Those links should point to the `public/build/target.arm64-v8a.apk` artifact from the jobs:

- `signing-apk-fenix-debug`
- `signing-apk-focus-debug`

## Current State

- The `Last try` row is rendered in `content/phabricator.js` by `phabRenderTryLinkEntry(...)`.
- The row already looks up try status through `moz-helper:getTryStatus`.
- `background.js` fetches the Treeherder push, then the jobs list, and returns the assessed status result.
- The try-status data path already preserves job `task_id`, which is enough to look up Taskcluster artifacts.
- This repo already has a shared Taskcluster URL helper in `src/treeherder/testlab.js`:
  `buildUnitTestArtifactLink(taskId, runId, artifactName)`.
- TryFox’s artifact flow confirms the APK extraction model we want:
  fetch Taskcluster artifacts for a task, filter `.apk`, then build the download URL as:
  `https://firefox-ci-tc.services.mozilla.com/api/queue/v1/task/<taskId>/runs/0/artifacts/<artifactName>`.

## Proposed Data Flow

1. Keep the existing latest-try detection in `content/phabricator.js`.
2. Extend the background try-status fetch path so it also derives APK link metadata from the fetched jobs.
3. For the two target job names, use their `task_id` values to fetch the Taskcluster artifact index for each task.
4. In each artifact list, find `public/build/target.arm64-v8a.apk`.
5. Build direct artifact URLs for the matching tasks.
6. Return those APK links alongside the existing try-status response.
7. Update the `Last try` card renderer to append a second line containing whichever APK links were resolved.

## Implementation Steps

### 1. Add shared APK helper(s)

Create a small shared helper module under `src/treeherder/` for APK-link extraction so the behavior is testable outside the runtime script. Likely responsibilities:

- identify whether a job is one of the supported APK jobs
- map job names to output labels:
  - `signing-apk-fenix-debug` -> `fenix-debug.apk`
  - `signing-apk-focus-debug` -> `focus-debug.apk`
- find the target artifact name:
  - exact match `public/build/target.arm64-v8a.apk`
- build the final artifact URL using the existing Taskcluster base

This can either reuse `buildUnitTestArtifactLink(...)` directly or introduce a more generic artifact-link builder in `src/treeherder/testlab.js` and `background.js`.

### 2. Extend `background.js` try-status fetch result

Inside `fetchTryStatus(...)` in `background.js`:

- after fetching `jobsJson.results`, scan for the latest relevant APK producer jobs
- for each supported job:
  - require a non-empty `task_id`
  - fetch `https://firefox-ci-tc.services.mozilla.com/api/queue/v1/task/<taskId>/runs/0/artifacts`
  - locate `public/build/target.arm64-v8a.apk`
  - if found, build the direct artifact URL
- attach the resolved links to the returned payload, for example:

```js
{
  status,
  reason,
  summary,
  failedJobs,
  pendingJobs,
  apkLinks: [
    { label: "fenix-debug.apk", url: "..." },
    { label: "focus-debug.apk", url: "..." }
  ]
}
```

Notes:

- Do this as best-effort enrichment. APK lookup failure should not fail the whole try-status response.
- Because `background.js` has mirrored logic in `src/`, any shared logic used for matching/building should live in `src/` and be mirrored or imported consistently with the repo’s current conventions.

### 3. Render the second line in the Phabricator card

Update `phabRenderTryLinkEntry(...)` in `content/phabricator.js` so the `Last try` value becomes:

- first line: existing try link and optional comment link
- second line: APK links, prefixed by a line break only when at least one APK link exists

Suggested structure:

- keep the existing inline row content untouched
- append `document.createElement("br")`
- append `fenix-debug.apk`
- if both exist, separate with ` · `
- append `focus-debug.apk`

The APK anchors should use the same external-link attributes already used for the try link:

- `target="_blank"`
- `rel="noreferrer"`

### 4. Refresh after async status resolution

Right now the card is rendered once from `data`, then the async status call only updates the icon. We will need to decide one of these two approaches:

- preferred: re-render the `Last try` row after `phabGetTryResult(...)` resolves, passing the returned `apkLinks`
- alternative: render placeholder-free initially, then patch just the `<dd>` node when APK data arrives

Preferred approach for maintainability:

- let `phabRenderTryLinkEntry(...)` accept an optional `statusInfo` or `apkLinks`
- call it once before the async request
- call it again after the status response resolves so the row updates with the APK links
- then re-apply the try-status icon

This keeps one rendering path for both initial and resolved states.

### 5. Add tests

Add or update tests in:

- `test/phabricator.test.js`
- `test/treeherder.test.js`

Coverage to add:

- helper test: maps `signing-apk-fenix-debug` and `signing-apk-focus-debug` correctly
- helper test: ignores unrelated jobs
- helper test: only accepts `public/build/target.arm64-v8a.apk`
- helper test: builds the expected Taskcluster artifact URL
- Phabricator rendering test: `Last try` card shows a second line with `fenix-debug.apk`
- Phabricator rendering test: shows both APK links separated by ` · `
- Phabricator rendering test: shows no second line when no APK links are available
- background or helper test: missing artifact fetch does not break status assessment

### 6. Verify end-to-end

Run:

```bash
npm test
npm run build
```

Then verify manually on a Phabricator revision page with a qualifying try link that:

- `Last try` still appears in the `Diff detail` card
- the existing try link and comment link still work
- the icon behavior is unchanged
- the second line appears with:
  - `fenix-debug.apk`
  - `focus-debug.apk`
- each APK link opens the expected Taskcluster artifact

## Edge Cases To Handle

- only one of the two APK jobs exists: render only the available link
- the job exists but has no `task_id`: skip it
- the task artifact listing fetch fails: skip APK links, keep try status
- the artifact list exists but does not contain `public/build/target.arm64-v8a.apk`: skip it
- duplicate/retried APK jobs: prefer the latest one using the same recency rules already used for jobs elsewhere
- pending try run: APK links may still be unavailable; do not show placeholders

## Assumptions

- The intended artifact is always `public/build/target.arm64-v8a.apk`.
- The link labels in the card should be exactly:
  - `fenix-debug.apk`
  - `focus-debug.apk`
- APK links should appear only after they are actually resolved, not as disabled placeholders.

## Open Question For Implementation

- When multiple instances of `signing-apk-fenix-debug` or `signing-apk-focus-debug` exist on the same push, we should likely pick the latest task for each job name. That matches the current job-deduping direction in this repo, but it would be good to preserve the exact same “latest” rule during implementation.
