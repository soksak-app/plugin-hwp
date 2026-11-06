# Core compatibility

[한국어](core-compatibility.ko.md)

The HWP package declares `engines.soksak: "^0.0.39"`, which admits core release `0.0.39` under the core version-range rules and does not claim compatibility with earlier versions or later unverified versions. 0.0.35 is the version of the core release of F502-13, the first core release that accepts `exposes.element`, which `plugin.json` declares; core 0.0.34 refuses it. Its `plugin.json` also declares a view composition without `surface.module`, which core releases from `0.0.24` accept.
