# Moz Helper Suite - Repository Guide

## Purpose

Moz Helper Suite is a Firefox extension (Manifest V3) that bundles small workflow helpers used across Mozilla web properties:

- Gmail Bugzilla linkifier with hover tooltips
- Bugzilla markdown paste helper
- Phabricator helpers (inline video player, markdown paste, try-link surfacing/status, file-not-attached notice, unsubmitted-comment indicator with floating fallback action)
- GitHub PR try-link status icons
- Treeherder helpers (Firebase TestLab shortcut/cost summary + unit-test report shortcut + macrobenchmark Performance table rendering)
- Shared popup/options settings backed by sync storage

Non-goals:

- No backend service: all runtime logic runs in extension scripts.
- No framework-based UI: popup/options are plain HTML/JS.

## Tech Stack

- JavaScript (ES modules for testable helper code under `src/`; non-module scripts for extension runtime)
- Firefox WebExtension Manifest V3
- Node.js 18+ (README) / Node 20 in CI release workflow
- npm
- Test stack: `mocha`, `chai`, `jsdom`
- Packaging/linting: `web-ext`

## Project Layout

- `manifest.json`: extension manifest, permissions, content script wiring.
- `background.js`: background script handling network-backed message actions:
  - Bugzilla bug fetch (`moz-helper:getBugInfo`)
  - Try status fetch/assessment (`moz-helper:getTryStatus`), including `landoCommitID` resolution through the URL's Lando instance (`lando-prod-2025` uses `https://lando.moz.tools`; legacy/default uses `https://api.lando.services.mozilla.com`)
- `content/`: runtime content scripts injected per site:
  - `content/gmail.js`
  - `content/bugzilla.js`
  - `content/phabricator.js`
  - `content/github.js`
  - `content/treeherder.js`
- `src/`: testable pure/helper modules that mirror runtime logic:
  - `src/gmail/*`
  - `src/bugzilla/*`
  - `src/phabricator/*`
  - `src/treeherder/*`
    - `src/treeherder/lando.js`: testable Lando instance URL/cache-key helpers mirrored by `background.js`
  - `src/taskcluster/*`
  - `src/utils/url.js`
- `test/`: Mocha unit/integration-style tests for helper logic and selected content-script behavior.
- `settings.js`: shared settings abstraction used by popup/options.
- `popup.html`, `popup.js`: browser action popup UI.
  - The popup requests optional GitHub host access when opened on a GitHub PR without that permission.
- `options.html`, `options.js`: options page UI.
- `tools/webext-diag-polyfill.cjs`: polyfill required by `web-ext lint` in this repo.
- `build/`: generated build directory used for packaging/signing.
- `.github/workflows/release.yml`: tag-triggered release workflow.

## How It Runs

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```

Build extension package:

```bash
npm run build
```

Full package flow (tests + build):

```bash
npm run package
```

What `npm run build` does (from `package.json`):

1. `clean`: remove `build/*`
2. `build:copy`: copy runtime files into `build/` (including `icons/`)
3. `build:xpi`: zip `build/` into `mozilla-helper.xpi`
4. `lint:webext`: run `web-ext lint --source-dir build` with Node polyfill

## Architecture

Core pattern:

1. Site-specific content script observes/mutates DOM and handles user interactions.
2. Content script reads feature flags from `storage.sync`.
3. If network/API fetch or cross-page shared state is needed, content script calls `runtime.sendMessage(...)`.
4. `background.js` fetches remote data, caches results, and responds.

Important boundaries:

- `content/*.js` are runtime scripts loaded by Firefox. They do not use imports.
- `src/*.js` are testable module versions of core logic used by `test/*.test.js`.
- Several files explicitly state "Keep in sync" comments between runtime and `src/` helpers.

High-impact rule for contributors:

- If you change logic that exists in both `content/` and `src/`, update both copies and tests.
  - Example pairs:
  - `content/treeherder.js` <-> `src/treeherder/testlab.js`
  - `background.js` try-status logic <-> `src/treeherder/tryStatus.js`
  - `background.js` Lando instance URL/cache-key logic <-> `src/treeherder/lando.js`
  - `content/bugzilla.js` / `content/phabricator.js` paste logic <-> `src/bugzilla/mdPaste.js` (+ re-export in `src/phabricator/mdPaste.js`)
  - `content/gmail.js` tooltip/linkify behavior <-> `src/gmail/*`

## Common Workflows

Add or update a helper feature:

1. Identify owning runtime script in `content/`.
2. If logic should be testable, add/update mirrored helper in `src/`.
3. Wire setting flags in:
   - `settings.js` default state
   - `popup.html` / `popup.js`
   - `options.html` / `options.js`
   - Phabricator-specific toggles include: `enablePhabricatorPaste`, `enablePhabricatorTryLinks`, `enablePhabricatorTryCommentIcons`, `enablePhabricatorUnsubmittedIndicator`, `enablePhabricatorFileNotAttachedNotice`
4. If remote fetch is required, add a new `runtime.onMessage` handler path in `background.js`.
5. Add/extend tests in `test/`.
6. Run `npm test` and `npm run build`.

Add a new site injection:

1. Create `content/<site>.js`.
2. Add `content_scripts` entry in `manifest.json` with `matches`/`include_globs`.
3. Add settings toggle if needed.
4. Add helper modules/tests under `src/` and `test/`.

GitHub-specific toggles include: `enableGithubTryStatusIcons`; GitHub host access is optional and requested from the popup on GitHub PR pages.

Change Treeherder try-status behavior:

1. Update `src/treeherder/tryStatus.js` first (easier to test).
2. Mirror change in `background.js` (same rules/constants).
3. Update tests in `test/treeherder.test.js`.

## Debugging Playbook

Local extension debugging:

1. Build: `npm run build`
2. Load temporary add-on from `manifest.json` in `about:debugging#/runtime/this-firefox`
3. Open target pages (Gmail/Phabricator/Bugzilla/Treeherder)

Firefox Nightly one-command local run:

```bash
npx web-ext run --firefox="/Applications/Firefox Nightly.app/Contents/MacOS/firefox" --source-dir .
```

Run it from the repo root after `npm install`. This opens a temporary Nightly profile with the extension loaded from the current source tree; keep the command running while testing.

Runtime logging hotspots:

- `content/treeherder.js`: debug logs prefixed with `[MozHelper][Treeherder]`
- `background.js`: logs fetch/status exceptions for Bugzilla/Try status
- `content/*`: many features are driven by `MutationObserver`; if behavior is flaky, inspect DOM timing/selectors first

Frequent failure modes:

- Selector drift on upstream sites (Phabricator/Treeherder/Gmail DOM changes)
- Logic changed only in `src/` or only in `content/` (desync)
- Feature appears disabled due to `storage.sync` state
- Host permission or URL pattern mismatch in `manifest.json`
- Lando instance mismatch for Treeherder links that only carry `landoCommitID`/`landoInstance`

Useful checks:

```bash
npm test
npm run build
```

Then inspect:

- `manifest.json` content script match patterns
- extension console output (content script + background worker)
- test coverage for changed helper behavior

## Testing Strategy

- Primary safety net: unit tests in `test/*.test.js` for helper modules in `src/`.
- `jsdom` is used where DOM behavior needs simulation.
- Existing test coverage areas:
  - Gmail link extraction + tooltip formatting
  - Bugzilla/Phabricator markdown paste transforms
  - Treeherder artifact/run-id helper logic
  - Treeherder macrobenchmark table extraction/parsing
  - Try status classification and diagnostics
  - Shared settings dependency behavior

Expected for new changes:

- Add/adjust tests for any new parsing, transformation, or state logic.
- Prefer testing logic in `src/` modules; keep runtime wrappers thin.

## Conventions

- JavaScript style is plain, functional, and minimal tooling.
- Prefer explicit helpers over clever abstractions.
- Keep runtime scripts compatible with direct browser loading (no import bundling).
- Keep `src/` mirrors aligned with runtime logic where noted in comments.
- Use `storage.sync` defaults consistently through `settings.js`.

Versioning/release:

- GitHub release workflow triggers on tags matching `vX.Y.Z`.
- Workflow syncs `manifest.json` version with tag, runs tests/build, signs via AMO credentials, then creates GitHub release.

## Known Risks / TODO Areas

- Logic duplication between runtime and test modules is a maintainability risk.
- DOM-coupled features can regress when upstream class names/structure change.
- No dedicated linter or formatter beyond `web-ext lint`; style consistency relies on code review.
- `build/` and packaged artifacts in repo can become stale relative to sources if not regenerated.
