# rhwp-studio in the plugin

[한국어](studio.ko.md)

The hwp plugin edits documents with `rhwp-studio`, the editor of [rhwp](https://github.com/edwardkim/rhwp). The source installer pins the planned HWP Studio release `soksak-studio-v0.8.7-2` to the commit named by `COMMIT` in the installer script. The build consumes the installed source directory without Git operations or source identity and cleanliness checks. A plain installed directory and a symlink to a development checkout use the same build contract, so source edits and a retargeted symlink remain usable. The planned release tag is not yet published; delivery status is recorded below.

The H40 source candidate always sets the Studio progress message. It waits for the existing double-animation-frame paint opportunity with its 50 ms fallback only while the message is rendered. When CSS hides the message, the update continues without a paint wait. The embedded 760 × 286 CSS px viewport used by the HWP startup comparison hides `#status-bar` under the responsive small-viewport rule, so those progress waits cannot display their messages. The separate installer is prepared to acquire the planned `soksak-studio-v0.8.7-2` tag and verify the source commit named by its `COMMIT`. The tag does not exist yet; this source pin is a delivery candidate, not a published release. WebKit supports the standard DOM `checkVisibility()` API in Safari 17.4 on macOS Sonoma 14.4, matching the application's minimum macOS version ([WebKit release notes](https://webkit.org/blog/15063/webkit-features-in-safari-17-4/)).

## Build

`make studio` runs `scripts/build-studio.mjs`, which writes the built editor to `ui/studio/`. Git ignores that folder, and `make pack` and the release workflow build it before they pack the plugin.

## Development build

`make studio` consumes the source directory already at `node_modules/.cache/rhwp-soksak-studio-v0.8.7-2`. The directory may be a plain installed source without `.git` or a symlink to a development checkout. Both use the same build preparation contract: the source must contain `rhwp-studio/package.json`, `rhwp-studio/package-lock.json`, `LICENSE` and `THIRD_PARTY_LICENSES.md`. Missing files produce an error naming the missing source file. The build does not clone, checkout, change sparse-checkout settings, inspect a commit, or reject dirty Git state.

The build copies the WebAssembly package of the devDependency `@rhwp/core`, whose version must equal the separate `CORE_VERSION` pin `0.8.7`, to the source's `pkg` folder. It installs the dependencies of `rhwp-studio` from its lockfile with `npm ci` when `node_modules` is absent. It then runs `npm run build:no-hwpctrl -- --base ./` with relative asset paths into `ui/studio/`, adds `ui/studio-host.js` as the final module script in `ui/studio/index.html`, and copies `LICENSE` and `THIRD_PARTY_LICENSES.md` into `ui/studio/`.

Local development uses the installed symlink directly. It does not call the source installer automatically, so source edits and symlink retargeting are used by the next build.

## Release source installation

The release source installer is a separate stage. Run it before a release build:

```sh
make install-studio-source
make studio
```

The installer acquires the planned `soksak-studio-v0.8.7-2` source tag, sparsely checks out `rhwp-studio` without its `e2e` folders and other tests plus the tracked startup owner test, `assets/fonts`, `LICENSE` and `THIRD_PARTY_LICENSES.md`, and verifies the exact `COMMIT` recorded in `scripts/install-studio-source.mjs` and clean Git state. It refuses a symlink or an existing directory without a Git checkout instead of replacing or repairing that source. The installer does not run during local development. Release CI runs `make install-studio-source` before `make pack`, which builds the installed directory before packing.

The planned tag is not published yet. The installer cannot succeed until the tag is available and points to the commit named by `COMMIT`.

The planned source includes the upstream-owned startup test. After the planned tag resolves to the commit named by `COMMIT`, run `npm run test:startup` from the cached `rhwp-studio` directory. The target compiles only the startup helper into `dist/startup-tests` and runs it through Node's test runner. The four cases verify concurrent startup behind the complete barrier, font and WebAssembly rejection behavior, and preservation of both failure causes. The existing four-case result applies to the earlier pinned source; it is not verification of the H40 candidate.

## Host script

`rhwp-studio` exposes `window.rhwpStudio.automation` to hosts that integrate inside its page. `ui/studio-host.js` runs in the page and posts these messages to the window, which the document region passes to the surface page:

- `{type: "soksak-hwp", event: "listening"}` once, when the script runs: the script is the last module script of the page, so the scripts of `rhwp-studio`, which install its message listener, have run before it; the surface page posts its first request only after this message, because the load of the page can report the page before those scripts end and a request posted before the listener exists is lost;
- `{type: "soksak-hwp", event: "save"}` on Command-S, because the embed mode of `rhwp-studio` registers no save command and only prevents the default action of the shortcut;
- `{type: "soksak-hwp", event: "modified", modified}` when `isDirty` of the automation context changes, read after each input event and each reply of the editor, because `rhwp-studio` has no change event for a page at the top level;
- `{type: "soksak-hwp", event: "selection", selection}` when `hasSelection` of the automation context changes, read at the same times;
- `{type: "soksak-hwp", event: "error", message}` when the script cannot read that state.

## Update to a later rhwp tag

1. Set `REPOSITORY`, `TAG` and `COMMIT` in `scripts/install-studio-source.mjs` to the reviewed HWP Studio source release. Keep `CORE_VERSION` in `scripts/build-studio.mjs` and the `@rhwp/core` package version as a separate pin; update them only when the WebAssembly package used by that Studio source changes.
2. Run the startup owner test from the pinned source, then `make studio` and `make check`.
3. Read the embed protocol of the new source (`rhwp-studio/src/embed/`) and the context of `window.rhwpStudio.automation` for changes to requests and fields used by the files of `ui/`.
