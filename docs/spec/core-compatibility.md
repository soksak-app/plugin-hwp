# Core compatibility

[한국어](core-compatibility.ko.md)

The HWP package declares `engines.soksak: "^0.0.41"`, which admits core 0.0.41 and every later 0.0 release ([versions and ranges](https://github.com/soksak-app/core/blob/main/docs/spec/installation.md#versions-and-ranges)). The package requires 0.0.41 because its tests run only against core 0.0.41: the view test host of that release, and `events.json`, which requires the `surface` that 0.0.41 adds to each view record. The plugin API pin of `package.json` is the release of core 0.0.41. 0.0.40 is the version of the core release of F502-13 (F502-13-1), the first core release that accepts `exposes.element`, which `plugin.json` declares; core 0.0.39 and earlier accept only the exposes kinds `status`, `commands` and `dom`, so they refuse it. Its `plugin.json` also declares a view composition without `surface.module`, which core releases from `0.0.24` accept.
