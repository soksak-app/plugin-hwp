# View diagnostics

The HWP view exposes an opt-in document-frame observer for performance measurement. The observer targets the view page's
`document.documentElement`; the nested `studio` document region is not the view root.

The diagnostic commands are `hwp.diagnostics.frames.start`, `hwp.diagnostics.frames.stop`, and
`hwp.diagnostics.frames.read`. Read returns `historyEntries` from the view page's `window.history.length` and
`regionHistoryEntries` from the live `studio` document-region state at `region.state.history.entries.length`.
Both values are entry counts; `region.history` is only the restored-history flag and is not used as a count. Start reads both counts and the root's current width and height, then
sets the root's actual `background-color` paint to opaque `rgb(25, 211, 162)` and observes that root with `ResizeObserver`.
It saves the exact prior inline value and priority and restores them on stop, disposal, or observer-start failure. The paint
does not add an overlay or change the root's geometry. The diagnostic pixel reader uses this declared color to locate the
opaque content rectangle and rejects frames where the color is not distinct from the card and plane.

For each delivered resize observation, the observer writes the root's measured width and height after the next
`requestAnimationFrame` callback to the existing trace log. Each frame record includes an
increasing sequence number, the document performance time origin, and the animation-frame timestamp. HWP diagnostic state
retains no frame records; the trace log is their record. These events describe the document's resize and animation-frame
state; decoded capture pixels remain the evidence of displayed content.

Stop disconnects the observer and cancels any pending animation-frame callback. Read returns whether observation is enabled,
the next frame sequence number, both current history entry counts, and the root's current dimensions. It does not start observation or
retain trace records. Starting while observation is active is rejected. Stopping while observation is inactive is rejected.
Normal view startup does not start the observer or send frame records.
