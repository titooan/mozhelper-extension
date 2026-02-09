<p align="center">
  <img src="mozhelper.png" alt="Moz Helper Suite icon" width="200">
</p>

# Moz Helper Suite

Moz Helper Suite is a Firefox add-on that bundles several small productivity features commonly used around Mozilla:

- **Gmail Bugzilla linkifier with rich tooltips** – automatically turns “Bug 123456” references in Gmail into Bugzilla links, with hover cards that surface status, assignee, product, and component.
- **Bugzilla markdown paste helper** – when you highlight text in the Bugzilla comment box and paste a URL, the helper replaces it with proper `[text](url)` syntax so you never type Markdown by hand.
- **Phabricator inline video player** – detects video artifacts in comments and renders an inline `<video>` player so you can review attachments without downloading them.
- **Phabricator try link surfacer** – retrieves the latest try push link from comments and adds it to the `Diff detail` section so reviewers can see CI status at a glance.
- **Phabricator try link status badger** – prefixes every try link with an icon indicating its status (loading, success, or failure).
- **Phabricator markdown paste helper** – highlight text in any remarkup field and paste a link to instantly wrap the selection with `[text](url)` markdown without touching the mouse again.
- **Phabricator file-not-attached notifier** – shows a sticky top-right alert when a comment includes a “File Not Attached” item, with quick View/Attach actions.
- **Treeherder Firebase TestLab helper** – adds a Firebase button to the Treeherder job summary and navigation bar that fetches the latest TestLab link via Taskcluster.
- **Treeherder unit test shortcut** – detects Taskcluster jobs that expose unit-test HTML reports and adds a toolbar icon that jumps directly to the rendered results.
- **Treeherder macrobenchmark Performance table** – for `run-macrobenchmark-firebase-fenix` jobs, reads `live_backing.log`, extracts benchmark markdown table output, and renders it in a collapsed-by-default expandable section at the top of the Performance tab, with a copy button that copies the raw markdown table to clipboard.
- **Shared settings/popup surfaces** – a toolbar popup and options page let you enable or disable each helper individually, with sync storage keeping preferences aligned across browsers.

<p style="text-align: center;">
  <a href="https://addons.mozilla.org/firefox/addon/moz-helper-suite/">
    <img src="icons/getaddon.svg" alt="Get Moz Helper Suite on AMO" width="200">
  </a>
</p>

## Development

### Prerequisites

- Node.js 18+
- npm

### Build

```bash
npm install
npm run build
```

`npm run build` cleans previous artifacts, copies assets into `build/`, zips `mozilla-helper.xpi`, and runs `web-ext lint` (with a small diagnostics-channel polyfill) to validate the packaged add-on.

#### Installation

After running the build, you can load the unsigned XPI locally:

1. In Firefox, open `about:config` and set:
   - `xpinstall.signatures.required` → `false`
   - `extensions.experiments.enabled` → `true`
2. Open `about:addons`, click the gear icon, and choose “Install Add-on From File…”.
3. Select `mozilla-helper.xpi` from the repository root.
4. Accept any permission prompts (Bugzilla hosts, etc.).

During development, you can also use `about:debugging#/runtime/this-firefox` → “Load Temporary Add-on…” and pick `manifest.json`.

### Tests

```bash
npm test
```

This runs the Mocha suite covering the Gmail, Bugzilla, Phabricator, Treeherder (including macrobenchmark table helpers), Taskcluster table parsing, and URL utility helpers. Please keep tests passing before submitting a change.

## Contributing

Contributions of all sizes are welcome! If you have an idea or a fix, open an issue or send a pull request—no need to ask for permission first. Please include tests whenever possible and describe any user-facing changes so they’re easy to review.
