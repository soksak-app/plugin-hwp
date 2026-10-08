# rhwp-studio in the package

[한국어](studio.ko.md)

The hwp plugin edits documents with `rhwp-studio`, the editor of [rhwp](https://github.com/edwardkim/rhwp). The package holds the editor as `rhwp-studio` builds it; the plugin does not change its sources.

## Build

`make studio` runs `scripts/build-studio.mjs`, which writes the built editor to `ui/studio/`. Git ignores that folder, and `make pack` and the release workflow build it before they pack the plugin.

The script:

1. checks out `rhwp-studio` without its `e2e` and `tests` folders, `assets/fonts`, `LICENSE` and `THIRD_PARTY_LICENSES.md` of the rhwp tag `TAG` into `node_modules/.cache/rhwp-<tag>`, and refuses a checkout whose commit differs from `COMMIT`;
2. copies the WebAssembly package of the devDependency `@rhwp/core`, whose version must equal the tag, to the `pkg` folder that the `rhwp-studio` build imports;
3. installs the dependencies of `rhwp-studio` from its lockfile with `npm ci`;
4. runs `npm run build:no-hwpctrl -- --base ./`, the build script of `rhwp-studio` without the HWP control plugin, with relative asset paths, into `ui/studio/`;
5. adds `ui/studio-host.js` as a module script at the end of the head of `ui/studio/index.html`;
6. copies `LICENSE` and `THIRD_PARTY_LICENSES.md` of rhwp into `ui/studio/`.

A later build reuses the checkout and its dependencies.

## Host script

`rhwp-studio` exposes `window.rhwpStudio.automation` to hosts that integrate inside its page. `ui/studio-host.js` runs in the page and posts these messages to the window, which the document region passes to the surface page:

- `{type: "soksak-hwp", event: "save"}` on Command-S, because the embed mode of `rhwp-studio` registers no save command and only prevents the default action of the shortcut;
- `{type: "soksak-hwp", event: "modified", modified}` when `isDirty` of the automation context changes, read after each input event and each reply of the editor, because `rhwp-studio` has no change event for a page at the top level;
- `{type: "soksak-hwp", event: "error", message}` when the script cannot read that state.

## Update to a later rhwp tag

1. Set `TAG` and `COMMIT` in `scripts/build-studio.mjs` to the new tag and the commit it names, and the exact version of `@rhwp/core` in `package.json` to the same version.
2. Run `pnpm install` and `make studio`, then `make test`.
3. Read the embed protocol of the new tag (`rhwp-studio/src/embed/`) and the context of `window.rhwpStudio.automation` for changes to the requests and fields that the files of `ui/` use.
