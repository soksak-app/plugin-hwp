# rhwp-studio in the plugin

[한국어](studio.ko.md)

The hwp plugin edits documents with `rhwp-studio`, the editor of [rhwp](https://github.com/edwardkim/rhwp). It builds the HWP Studio source release [`soksak-studio-v0.8.7-1`](https://github.com/min-0-max/rhwp/tree/soksak-studio-v0.8.7-1), pinned to the commit named by `COMMIT` in the build script. That source preserves synchronous font detection and `@font-face` registration, starts critical web-font loading and WebAssembly initialization concurrently, and waits for both operations before renderer setup or the ready barrier. It retains the upstream font loader's per-face fallback behavior. If both startup operations fail, the aggregate error message includes both causes and its `errors` array retains both original values.

The H40 source candidate always sets the Studio progress message. It waits for the existing double-animation-frame paint opportunity with its 50 ms fallback only while the message is rendered. When CSS hides the message, the update continues without a paint wait. The embedded 760 × 286 CSS px viewport used by the HWP startup comparison hides `#status-bar` under the responsive small-viewport rule, so those progress waits cannot display their messages. The pinned `soksak-studio-v0.8.7-1` source does not yet include this change.

## Build

`make studio` runs `scripts/build-studio.mjs`, which writes the built editor to `ui/studio/`. Git ignores that folder, and `make pack` and the release workflow build it before they pack the plugin.

The script:

1. sparsely checks out `rhwp-studio` without its `e2e` folders and other tests, plus the tracked startup owner test, `assets/fonts`, `LICENSE` and `THIRD_PARTY_LICENSES.md` from `https://github.com/min-0-max/rhwp.git`, tag `soksak-studio-v0.8.7-1`, into `node_modules/.cache/rhwp-soksak-studio-v0.8.7-1`;
2. requires the checkout commit to equal `COMMIT` and rejects any tracked or untracked source changes;
3. copies the WebAssembly package of the devDependency `@rhwp/core`, whose version must equal the separate `CORE_VERSION` pin `0.8.7`, to the `pkg` folder that `rhwp-studio` imports;
4. installs the dependencies of `rhwp-studio` from its lockfile with `npm ci`;
5. runs `npm run build:no-hwpctrl -- --base ./`, the published `rhwp-studio` build script without the HWP control plugin and with relative asset paths, into `ui/studio/`;
6. adds `ui/studio-host.js` as a module script at the end of the head of `ui/studio/index.html`;
7. copies `LICENSE` and `THIRD_PARTY_LICENSES.md` from rhwp into `ui/studio/`.

A later build reuses the checkout and its dependencies after rechecking the exact commit and clean source state. It does not rewrite or repair a changed checkout; source drift fails the build and requires a fresh checkout of the pinned tag.

The pinned source includes the upstream-owned startup test. Run `npm run test:startup` from the cached `rhwp-studio` directory. The target compiles only the startup helper into `dist/startup-tests` and runs it through Node's test runner. The four cases verify concurrent startup behind the complete barrier, font and WebAssembly rejection behavior, and preservation of both failure causes. All four pass on the pinned source. Four paired startup comparisons observed 11–37 ms improvement in the interval from font response completion to the reading phase. This result covers that interval only; it does not establish acceptance of the complete startup or first-content target.

## Host script

`rhwp-studio` exposes `window.rhwpStudio.automation` to hosts that integrate inside its page. `ui/studio-host.js` runs in the page and posts these messages to the window, which the document region passes to the surface page:

- `{type: "soksak-hwp", event: "listening"}` once, when the script runs: the script is the last module script of the page, so the scripts of `rhwp-studio`, which install its message listener, have run before it; the surface page posts its first request only after this message, because the load of the page can report the page before those scripts end and a request posted before the listener exists is lost;
- `{type: "soksak-hwp", event: "save"}` on Command-S, because the embed mode of `rhwp-studio` registers no save command and only prevents the default action of the shortcut;
- `{type: "soksak-hwp", event: "modified", modified}` when `isDirty` of the automation context changes, read after each input event and each reply of the editor, because `rhwp-studio` has no change event for a page at the top level;
- `{type: "soksak-hwp", event: "selection", selection}` when `hasSelection` of the automation context changes, read at the same times;
- `{type: "soksak-hwp", event: "error", message}` when the script cannot read that state.

## Update to a later rhwp tag

1. Set `REPOSITORY`, `TAG` and `COMMIT` in `scripts/build-studio.mjs` to the reviewed HWP Studio source release. Keep `CORE_VERSION` and the `@rhwp/core` package version as a separate pin; update them only when the WebAssembly package used by that Studio source changes.
2. Run the startup owner test from the pinned source, then `make studio` and `make check`.
3. Read the embed protocol of the new source (`rhwp-studio/src/embed/`) and the context of `window.rhwpStudio.automation` for changes to requests and fields used by the files of `ui/`.
