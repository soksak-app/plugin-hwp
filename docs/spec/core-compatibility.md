# Core compatibility

[한국어](core-compatibility.ko.md)

The HWP package uses the view manifest contract of core release `0.0.23`. Its `plugin.json` declares a view composition without `surface.module`, which the published core `v0.0.20` reader refuses. `package.json` therefore declares `engines.soksak: "^0.0.23"`, which admits core `0.0.23` and does not claim compatibility with earlier versions or later unverified versions. The package release remains gated on a published core release that carries this contract; see the [HWP compatibility status](../features.md).
