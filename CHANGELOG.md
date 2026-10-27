# Changelog

[한국어](CHANGELOG.ko.md)

## Unreleased

- H38: Pin Studio to the published `soksak-studio-v0.8.7-1` source and remove
  the local startup patch step. The four source owner cases, HWP checks, and
  Studio build pass. Four paired comparisons observed 11–37 ms improvement in
  the interval from font response completion to the reading phase; complete startup acceptance remains
  unestablished.

- H23.11: Add current studio `PerformanceResourceTiming` entries and their
  document clock to the active diagnostic read. Preserve browser-reported
  restricted zeros; make no claim of complete resource history or WebAssembly
  compilation time. The unchanged read owner failed for missing timing fields;
  view diagnostics pass 24/24, declaration owners pass 1/1 each, and the
  current-SDK structural checks pass.

- H37: Inset the existing studio HTML viewport marker by 4 CSS px so its paint remains distinct from the native cyan border. Preserve layout, pointer behavior, preflight and cleanup. The unchanged DOM owner Red becomes Green; all 21 owner cases, current-SDK checks and diagnostic packaging pass. Pixel acceptance remains with core F239-233.

- H36: Return the HWP view document's `performance.timeOrigin` and an immediate `performance.now()` reading with the fixed 1 ms resolution bound from a successful frame-observation start. Red: the owner test found no `sourceClock` in the unchanged reply. Green: the owner test passes 1/1, current-SDK `make check` passes, and the authoritative diagnostic pack succeeds. Application integration remains pending in core F239-221.

- H35: Confirm that the HWP body remains visible after reclaiming and reopening
  the complete view-sharing process group. The measurement changed the view
  from `760 × 286.5` to `785.5 × 286.5` before closing the group; the wider
  viewport expands the responsive toolbar and moves the first paragraph below
  the captured document area. Core F212.14-5-32 restores the initial geometry
  before reopening. Wails and Tauri acceptance then confirmed body OCR,
  at least 90% reclamation within 10 seconds across all three repetitions,
  and no remaining engine-cached process. No HWP source change was required.

- H34: Reconcile the English and Korean HWP records with the current source
  state. Specifications link to the canonical feature status instead of
  citing checklist IDs. H7 states its cause and retry condition, and the
  feature documents include matching implementation, validation and release
  status columns. Red: the current core documentation check reports missing
  status tables, incomplete H7 cause/retry fields, checklist IDs in
  specifications and four changelog translation mismatches. Green: current
  core documentation checks and HWP `make check` pass with the current SDK.

- H23.10: Coalesce root ResizeObserver deliveries that arrive before a pending
  animation frame. Each trace record preserves the first and latest delivery
  timestamps and the positive count represented by its actual frame. Red: the
  core owner test triggered a second root delivery while the existing callback
  was pending and the helper threw before producing a record. Green: the core
  owner test passes 6/6, HWP view diagnostics pass 21/21, and source-SDK
  `make check` passes.

- H23.9: Ignore the exact native document-post echo while a marker request is
  pending, and accept only exact `result` or `error` replies. Red: the tracked
  native-contract test delivered `{type, id, operation}` before the studio
  reply, so marker start resolved `undefined` and failed its evidence and
  cleanup checks. Green: `test/view-diagnostics.test.mjs` passes 21/21 and
  source-SDK `make check` passes.

- H23.8: Ignore the exact studio marker reply shape when its same-window
  message event reaches the companion listener. Native document posts and
  companion replies use the same studio window. Red: a tracked native-envelope
  test produced five replies instead of one; retained Wails and Tauri traces
  show `operation: start` followed by `unknown HWP studio viewport marker
  operation undefined`. Green: the tracked test passes 1/1, and the diagnostic
  specification records request and reply handling.

- H23.7: Validate the complete `diagnostics.json` declaration with the public
  plugin API in `make check`. Remove unsupported array length keywords while
  retaining the exact three-channel marker color checks in the diagnostic
  producer and consumer. Red: the declaration test failed because the SDK
  rejected `minItems`; the manifest checker did not inspect diagnostics.
  Green: the declaration test passes 1/1 and source-SDK `make check` validates
  both declarations and passes the remaining checks.

- H23.6: Add a diagnostic-only fixed viewport marker to the nested HWP
  studio document. The view page enables the studio companion only when its
  diagnostics declaration is present; the studio host waits for attachment
  before posting `listening`, and reports attach failures without declaring
  readiness. The companion inserts a transparent 2 px magenta border only on
  explicit start and verifies the visual viewport, root dimensions, fixed
  positioning and measured rectangle. The commands return the exact viewport
  evidence shape; stop, disposal and pagehide remove the same marker. Frame
  observation no longer changes the view root paint because that paint is
  behind the native studio document. Red: the nested-page loader resolved the
  package declaration under `/ui`, start/stop races leaked or lost marker
  state, concurrent disposal returned before cleanup, and the observer changed
  the root background. Green: 19/19 view diagnostic tests, 43/43 HWP consumer tests, and the current-core `make check`
  pass. The core F212.14-5-8 capture consumer measures viewport pixels separately from
  natural displayed content and cadence.

- H23.5: Include `ui/studio-host.js` in the HWP release. The built editor page
  loads it from `../studio-host.js`; omitting the file caused both hosts to
  report a missing plugin file and wait for an editor message that could not
  arrive. Red: the tracked release test inspected an actual `npm pack` release
  and failed because the packaged editor page referenced missing
  `ui/studio-host.js`. Green: the same test passes after adding the bridge to
  `package.json` `files`; `make pack` runs the release graph check before the
  standard plugin pack command. The source bridge did not need changes.

- H23.4: Pass the view document's bound `performance.now` clock to the shared
  diagnostic frame observer. The observer requires this clock to timestamp
  ResizeObserver delivery. Red: the HWP adapter test received no `now` function
  at the observer boundary. Green: the same test verifies the function uses the
  view performance object as `this` and returns its clock value; graph and
  diagnostic adapter tests pass 5/5. The current-core `make check` passes.

- H23.3: Remove the Node-only `node:assert/strict` import from the
  browser-loaded HWP diagnostic view module. The core browser graph checker
  rejected that import, which stopped diagnostic view loading on both hosts.
  Explicit boundary checks preserve the diagnostic errors without a Node
  runtime dependency. Red: the tracked graph test reported
  `ui/view-diagnostics.js: import node:assert/strict is not in the view import
  map`. Green: the same check passes with the current core SDK, and the graph
  and diagnostic adapter tests pass 5/5.

- H23.1: Add opt-in HWP view-root frame diagnostics through the excluded `diagnostics.json`
  declaration and module. Commands start, stop and read an
  observer of the actual view document root; each resize emits a trace record
  after the next animation frame. The read command reports both the view
  history count and the live `studio` region history count. The diagnostic
  paint restores the exact prior inline background on stop, disposal and
  observer-start failure. Red: the owner test failed because
  `createViewFrameDiagnostics` was missing; the history follow-up failed
  against the staged reply that lacked the studio history count. Green: the
  focused owner test passes 4/4, including a live region-history update and
  disposal during pending start, and the HWP test file passes 43/43. Exposure
  and engine checks pass.
  Current SDK census and catalog checks pass with seven sources, zero pending
  rules and 20 declared events. Captured pixels still need to establish
  displayed-content measurements in H23.2.

- F239-77-hwp: Complete local schema-3 catalog acceptance with the matching installed diagnostic cohort. The current SDK checks 5 sources with zero pending rules and 19 events; both host installations contain the exact source catalog and pass application log audits. Public publication remains separate.

- F239-77-hwp: Convert the HWP event catalog to schema 3 JSON Schema and
  preserve its event contracts. Red: current core `events-check` reported 131
  findings for the schema-2 catalog. Green: current core `events-check`
  accepts all 19 declarations and source emits. The first package run exposed
  two tests reading the legacy field map; they now validate JSON Schema
  properties and required fields, and the focused event/HWP tests pass 48/48.
  Current-core package checks pass. The full package suite was not rerun after
  those test updates; runtime acceptance remains pending.

- H33: HWP `0.0.5` now declares `engines.soksak` `^0.0.21` because published core `v0.0.20` rejects its view composition without `surface.module`. Red: `test/core-version.test.mjs` failed with `">=0.0.18" !== "^0.0.21"`. Green: the same test passes 1/1, and candidate `make check` passes manifest, exposure, engines, events, records and copied contract checks. The package release remains gated on a matching core release. No SDK pin, plugin version, archive or registry changed.

- H32: Construct the embedded editor URL relative to the HWP view page so it keeps the canonical `soksak://hwp` origin. Red: the owning view case expected the canonical URL but received `sok://hwp/...`. Green: the same case passes, `make test` passes 72 of 72, and `CORE_PLUGIN_API_DIR=<core>/packages/plugin-api make check` passes. Package version 0.0.5 is packed locally; it is not published.

- H31: Sync all copied view contract cases with the current plugin API. Red: `scripts/check-test-cases.mjs` found `view-bridge.json` using `sok://` while core used `soksak://`, then found four more stale view case copies. Green: all nine copies match core, `make test` passes 72 of 72, and `make check` passes with the current core API directory.

- H30: The HWP view accepts `{directory: null}` as a valid tab origin when a tab has no source tab. Red: `the view page mounts when its tab has no source origin directory` failed because `startValues` refused the null directory. Green: the same test passes and the HWP document reaches phase `ready`. The package version is 0.0.4 for this fix.

- H29: Require files sidecar 0.0.8 or later and bump the plugin to 0.0.3. Red: the owning manifest test rejected `>=0.0.5`; Green: it passes with the current sidecar floor.

- H28: The view page begins with its doctype and holds no import map. The host inserts the view import map after the doctype, for the core checklist item F212.12-1-10-6, so the copy in the page is removed. Red: the view test failed on the page with the map. Green: `make test` passes 70 of 70, and the core `checkViewPage` accepts the page.
- H27: The start values of a view require the project id: the validator refuses a project without `id`, because core gives `{id, root}`. The view test refuses a project that has only a root. Red: the refusal test failed against the validator of the previous version. Green: the test passes with the validator that requires the id.
- H26: The view page map holds the screen-hash entry of core's view import map, which `checkViewPage` requires. The view test's copy of the map holds the five entries of `VIEW_IMPORTS`. Red: `test/hwp.test.mjs` failed with a deep-equal difference, because the page map lacked the screen-hash entry. Green: `make test` passes 69 of 69, and `make check` passes with `CORE_PLUGIN_API_DIR`.
- H24: The pre-push hook runs `make push-check`, which runs `make test`, `make check` and the commit message check of the pushed range, as the ci workflow does. Red: `.githooks/pre-push` did not exist and `git push --dry-run` ran no check. Green: the hook runs the checks; `make test` passes 69 of 69, and `make check` fails at the pinned SDK, which H25 records.
- F238-c-23-1: `make check` validates `plugin.json` with `validateManifest` of the plugin API (`scripts/check-manifest.mjs`), and reads that API and runs the SDK tools from `CORE_PLUGIN_API_DIR` when it is set. `test/check-manifest.test.mjs` checks that a fixture API's rejection message fails the check. Red: the check file did not exist. Green: `make test` passes 69 of 69, and `make check` exits 0 against the extract of core origin/main.
- F238-c-14: No line of `test/` names the SDK package. `test/sdk-boundary.test.mjs` fails on any line of `test/` that contains the needle, which the test builds from parts. The model comments name the plugin API, and `test/hwp.test.mjs` builds its import-map names from parts. Red: the guard listed five lines. Green: `make test` passes 68 tests.
- F238-c-24: The CI workflow runs `make check` after `make test`, and the release workflow runs `make test`, `make check`, then `make pack`. `test/workflows.test.mjs` requires both orders. Red: the test failed on the previous workflows. Green: `make test` passes 67 tests. `make check` fails its case copy check until a core release publishes the contract files, which is the expected result.
- H12: The hwp page starts its operations (open, save) with `runtime.beginOperation`, passes the returned cids to its files sidecar sends and records, and declares the operation event `plugin.hwp.operation`; the record events of the reads, renders and saves are recorded as events of the plugin. Red: the operation test failed on the committed page; Green: `make test` passes.
- F252-contract-hwp: The copied command, binder and exposure cases follow core origin/main (`create-binder.json`, `expose.json`, `view-commands.json` changed). The replay models cover the function-params binds and the command cids.
- F252-hwp: An export reply that is not a non-empty byte array fails the save and leaves the file unchanged. A studio error without text shows the whole event. A failed context read posts the error event of the contract. A save whose editor notice fails is saved, and the tab reports that the notice failed (`plugin.hwp.notify`). A refused `runtime.log` record is shown as `runtime.error {where: "log"}` and kept on the console.
- F238-b-10-2: the test command runs the whole `test/` directory, so the conformance tests of `test/sdk-models/` run in `make test` (56 of 56 tests, 46 before). `test/test-script.test.mjs` fails when a test file under `test/` is not selected by the test command.
- F238-b-10-1: the core view bridge contract copy is refreshed to the current core case set; `view.bridge.runtime-log-without-level-query` replaces `view.bridge.runtime-log-level-gate`, and the view calls no level query. In this repository the conformance test (`test/sdk-models/conformance.test.mjs`) lists the case as excluded, because the view bridge model has no `runtime.log`.
- H22-1: `test/sdk-models/conformance.test.mjs` replays `view-commands.json` against the bridge model (command registration and the reply to a command request). Red: a mutated refusal code of the model failed the replay at the unregistered command; Green: the restored model passes 9 of 9.
- H22-1: The view page tests run without the SDK. `scripts/build-test.mjs` builds `build/test/ui` with each `@soksak/plugin-api` import rewritten to a model in `test/sdk-models/`, and `test/sdk-models/conformance.test.mjs` replays the copied view, binder and call-limit cases (core F246, F248 to F248-4). The embed limit test enables the mocked clock before the save. Red: `test/sdk-boundary.test.mjs` failed on the SDK import in `test/hwp.test.mjs`. Green: `make test` passes 46 of 46. `@soksak/plugin-api` is pinned to the release `v0.0.18`, so `make check` fails its case copy check until a core release carries the cases.
- H22: the surface is a view: `plugin.json` declares the view composition with the page `ui/index.html` and the document region `studio`, and `ui/view.js` mounts the surface module `ui/hwp.js` over `@soksak/plugin-api/view`, with the region calls of core. The case of a restored session history runs: the page reads `region.state` before it subscribes, and names the files sidecar `@soksak/sidecar-files`. Red and Green are recorded in the checklist.
- H22: `@soksak/plugin-api` is pinned to core main, which exposes `history` on the view region (core F245) and names the sidecar of each view request. `make test` runs the tests of the plugin only, and `make check` runs the pinned SDK validators.
- H5: the CI and release workflows are verified by their runs (no change of the workflows).
- H22: restated the blocker of the move to a view against core main of 2026-10-21. The tab reports and runtime calls of a view are served (core F212.7-11); one gap remains: a view has no route that places its document region or attaches its document, and the generic `runtime.native.call` bypasses the session history of the region (`region.history`). No core release carries the view bridge `@soksak/plugin-api/view` yet.
- H22, H23: registered the move of the surface to a view that carries its document region (core F212.10) and the view measurement before the release. H22 waits on two gaps of the branch `feat/view-kind-F212.7` of 2026-10-21: a view has no call route for the region operations, and the served view calls name no tab reports (`tab.title`, `tab.modified`, `tab.error`).
- H21: new commits are authored as `min-0-max <max@blue.tools>`; `.mailmap` maps the former name `min-median-max`, and published commits are not rewritten.

## 0.0.2 (2026-10-19)

- H20: Release version 0.0.2 with the memory saver declaration (H19); the tag `v0.0.2` publishes `hwp-0.0.2.tgz` built with `sok` of core v0.0.18.
- H19: The surface declares `surface.unload` `{format: 1, maxBytes: 8192}`, writes `{path}` as the core tab state, opens the stored file at mount, and loads the editor page only when its document region restored no session history; `@soksak/plugin-api` and `CORE_RELEASE` come from core 0.0.18, which `engines.soksak` requires. Red: the tab state, history and refusal cases; Green: `make test` passes 42 of 42.

## 0.0.1 (2026-10-14)

- H6: Release version 0.0.1; the tag `v0.0.1` publishes the plugin with `sok` of core 0.0.12, and the plugin requires the files sidecar `>=0.0.5`.
- H18: `@soksak/plugin-api` comes from the core release 0.0.12, `engines.soksak` is `>=0.0.12`, and the release workflow builds `sok` from `CORE_RELEASE: v0.0.12`.
- H17: `make hooks` sets `.githooks` as the hook folder, so a commit whose message breaks the commit form or the term rules, or whose records break the record rules, is refused when it is made.
- H15.1: a tab without `params.path` opens a blank document of the editor, whose first save asks for its file through `core.file.place` and then writes and watches that file.
- H16: `make test` runs the record check `soksak-records`, and CI checks the form of each pushed commit message with `soksak-commits`.
- H14.4: `@soksak/plugin-api` comes from the core release 0.0.11 and `engines.soksak` is `>=0.0.11`, so `make test` runs the event guard from the installed dependency.
- H14.6: the surface registers `hwp.save`, `hwp.reload` and `hwp.request` under their literal names, so the exposure check of `make test` finds their registrations.
- H13: the editor page posts `listening` after the scripts of `rhwp-studio` have run, and the plugin posts its first request after that message, because a request posted before the editor installs its message listener was lost and left the start at `phase: starting`; the wait for the message and each embed request fail with an error that names the step after their bound.
- H14.5: the events of the plugin build costly fields only while their level is stored, and the plugin has no input that carries `cids`.
- H14: the forwarder `ui/events.js` marks the event name it passes with `events: forwarded`, so the catalog check of core reads the names at the calls of `emitEvent`.
- H14: the plugin declares `events.json`, stores the open, close, steps of the start, reads, renders, saves, watch, messages of the editor page, embed requests and commands as `plugin.hwp.*` events through `ui/events.js`, stores the failure of a save that Command-S starts, and runs `soksak-events` in `make test`. `test/events.test.mjs` and 10 tests of `test/hwp.test.mjs` cover it; the manifest test waits for H14.4.
- H11: `hwp.document` exists from the start of the mount and reports its step as `phase`.
- H10: the documents and comments call plugins, sidecars and releases by those words.
- H9.7: the surface loads the editor at `sok://hwp/ui/studio/index.html`.
- H9.6: the documents call the plugin a plugin instead of a package.
- H9.5: `hwp.document` reports whether the editor holds a selection.
- H9.3: the surface shows rhwp-studio in the document region `studio` and opens, saves and reloads the file through its embed requests; the page that drew the pages itself and the vendored `rhwp.js` are removed.
- H9.2: `ui/studio-host.js` runs in the editor page and reports Command-S and unsaved changes to the surface page.
- H9.1: `make studio` builds `rhwp-studio` of rhwp `v0.8.7` unchanged into `ui/studio/`, and `make pack` and the release workflow build it before packing ([docs/studio.md](docs/studio.md)).
