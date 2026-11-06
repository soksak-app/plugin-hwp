# Core compatibility

[한국어](core-compatibility.ko.md)

The HWP package declares `engines.soksak: "^0.0.40"`, which admits core release `0.0.40` under the core version-range rules and does not claim compatibility with earlier versions or later unverified versions. 0.0.40 is the version of the core release of F502-13 (F502-13-1), the first core release that accepts `exposes.element`, which `plugin.json` declares; core 0.0.39 and earlier accept only the exposes kinds `status`, `commands` and `dom`, so they refuse it. Its `plugin.json` also declares a view composition without `surface.module`, which core releases from `0.0.24` accept.
