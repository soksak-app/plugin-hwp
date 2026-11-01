# HWP plugin

[한국어](README.ko.md)

HWP plugin: opens the HWP and HWPX documents of the project in rhwp-studio, the editor of [rhwp](https://github.com/edwardkim/rhwp), and saves them in their own format through the files sidecar. [docs/studio.md](docs/studio.md) describes how the plugin holds rhwp-studio and how to update it. The plugin format is defined in the soksak core specification (`docs/spec/plugins.md`).

```sh
make test                                   # tests
make check                                  # census check and record check of the kit releases
make install                 # installation stage: locked dependencies and the exact Studio source
make studio                                 # build from the installed source directory or development symlink
make pack OUT=<folder> # packs the plugin into <folder>
make hooks                                  # once after cloning: check commit messages and records at commit time
```

`make check` runs the census check of the events kit and the record check of the records kit that `package.json` pins. The application validates `plugin.json` and `diagnostics.json` when it installs the release, and the registry check compares the exposed names of the release with the declarations of each listed core.

The checklist is [docs/features.md](docs/features.md).
