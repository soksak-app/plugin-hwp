# View measurement

[한국어](view-measurement.ko.md)

The view benchmark `e2e/benchmark/hwp-view.test.mjs` judges the HWP view by the pass values of core (core
`docs/spec/plugin-processes.md#pass-values`). Pass value (iii) bounds the first display of a view whose process is already running by
the DOM mount baseline of the plugin and host plus 300 ms, and (iii-b) bounds the first display of a new process by the same sum; a
plugin without a recorded baseline is judged against 300 ms alone. This page records the baseline of the HWP view, which the plugin
owns.

## DOM mount baseline

The baseline is the median time from the start to the end of the mount of the HWP surface on the workbench page, which core measured on
the Wails and the Tauri host before it removed that mount; the record is the fixed reference. The baseline of the mygo host is the
lower of the two.

| Host | DOM mount baseline |
| --- | --- |
| wailsv3 | 701 ms |
| tauriv2 | 813 ms |
| mygo | 701 ms, the lower of wailsv3 and tauriv2 |

`HWP_VIEW_BASELINES_MS` of `e2e/benchmark/cases/hwp.mjs` holds the recorded values, and `domMountBaselineMs` of
`@soksak/window-check/view-metrics.mjs` gives the baseline of each host.
