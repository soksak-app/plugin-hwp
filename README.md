# HWP plugin

[한국어](README.ko.md)

HWP plugin: opens the HWP and HWPX documents of the project in rhwp-studio, the editor of [rhwp](https://github.com/edwardkim/rhwp), and saves them in their own format through the files sidecar. [docs/studio.md](docs/studio.md) describes how the plugin holds rhwp-studio and how to update it. The plugin format is defined in the soksak core specification (`docs/spec/plugins.md`).

```sh
make test                                   # tests
make studio                                 # rhwp-studio in ui/studio
make pack OUT=<folder> SOK=<core>/target/debug/sok   # packs the plugin into <folder>
```

The checklist is [docs/features.md](docs/features.md).
