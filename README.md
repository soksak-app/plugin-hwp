# HWP plugin

[한국어](README.ko.md)

HWP plugin: opens the HWP and HWPX documents of the project in rhwp-studio, the editor of [rhwp](https://github.com/edwardkim/rhwp), and saves them in their own format through the files sidecar. [docs/studio.md](docs/studio.md) describes how the plugin holds rhwp-studio and how to update it. The plugin format is defined in the soksak core specification (`docs/spec/plugins.md`).

```sh
make test                                   # tests
make check                                  # SDK checks of the pinned core release
make studio                                 # rhwp-studio in ui/studio
make pack OUT=<folder> SOK=<core>/target/debug/sok   # packs the plugin into <folder>
make hooks                                  # once after cloning: check commit messages and records at commit time
```

`make check` runs the manifest check (`scripts/check-manifest.mjs`), the SDK tools (exposure, engines, events, records) and the contract case copy check against the `@soksak/plugin-api` that `package.json` pins. To check against the core `main` branch, check out its `packages/plugin-api` folder into a scratch folder with a separate index file, which leaves the core checkout unchanged, and set `CORE_PLUGIN_API_DIR` to that folder:

```sh
GIT_INDEX_FILE=<scratch>/index git -C <core> --work-tree=<scratch> checkout origin/main -- packages/plugin-api
CORE_PLUGIN_API_DIR=<scratch>/packages/plugin-api make check
```

The checklist is [docs/features.md](docs/features.md).
