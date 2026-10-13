# Changelog

[한국어](CHANGELOG.ko.md)

## Unreleased

- H14.6: the surface registers `hwp.save`, `hwp.reload` and `hwp.request` under their literal names, so the exposure check of `make test` finds their registrations.
- H13: the editor page posts `listening` after the scripts of `rhwp-studio` have run, and the plugin posts its first request after that message, because a request posted before the editor installs its message listener was lost and left the start at `phase: starting`; the wait for the message and each embed request fail with an error that names the step after their bound.
- H14.5: the events of the plugin build costly fields only while their level is stored, and the plugin has no input that carries `cids`.
- H14: the forwarder `ui/events.js` marks the event name it passes with `events: forwarded`, so the catalog check of core reads the names at the calls of `emitEvent`.
- H14: the plugin declares `events.json`, stores the open, close, steps of the start, reads, renders, saves, watch, messages of the editor page, embed requests and commands as `plugin.hwp.*` events through `ui/events.js`, stores the failure of a save that Command-S starts, and runs `soksak-events` in `make test`. `test/events.test.mjs` and 10 tests of `test/hwp.test.mjs` cover it; the manifest test waits for H14.4.
- H11: `hwp.document` exists from the start of the mount and reports its step as `phase`.
- H10: the documents and comments call plugins, sidecars and releases by those words.
- H9.7: the surface loads the editor at `sok://hwp/ui/studio/index.html`.
- H9.6: the documents call the plugin a plugin instead of a package.
- H9.5: `hwp.document` reports whether the editor holds a selection.
- H9.3: the surface shows rhwp-studio in the document region `studio` and opens, saves and reloads the file through its embed requests; the page that drew the pages itself and the vendored `rhwp.js` are removed.
- H9.2: `ui/studio-host.js` runs in the editor page and reports Command-S and unsaved changes to the surface page.
- H9.1: `make studio` builds `rhwp-studio` of rhwp `v0.8.7` unchanged into `ui/studio/`, and `make pack` and the release workflow build it before packing ([docs/studio.md](docs/studio.md)).
