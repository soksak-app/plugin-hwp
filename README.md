# HWP plugin

[한국어](README.ko.md)

HWP plugin: opens the HWP and HWPX documents of the project with [rhwp](https://github.com/edwardkim/rhwp), draws their pages, edits their body text and saves them in their own format through the files sidecar. The plugin format is defined in the soksak core specification (`docs/spec/plugins.md`).

```sh
make test                                   # tests
make studio                                 # rhwp-studio in ui/studio
make pack OUT=<folder> SOK=<core>/target/debug/sok   # the plugin package
```

The checklist is [docs/features.md](docs/features.md).
