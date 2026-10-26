# View diagnostics

The HWP view exposes opt-in document-frame observation and studio viewport measurement for performance checks. The observer
targets the view page's `document.documentElement`; the nested `studio` document region is not the view root.

The diagnostic commands are `hwp.diagnostics.frames.start`, `hwp.diagnostics.frames.stop`, and
`hwp.diagnostics.frames.read`. Read returns `historyEntries` from the view page's `window.history.length` and
`regionHistoryEntries` from the live `studio` document-region state at `region.state.history.entries.length`. Both values are
entry counts; `region.history` is only the restored-history flag and is not used as a count. Start reads both counts and the
root's current width and height, then observes that root with `ResizeObserver`. Observation does not change the root's style.

Start also requests a transparent marker in the actual `studio` document through the document region. The diagnostic-only
studio companion appends one fixed element to that document's `document.documentElement`, with `inset: 0`, `box-sizing:
border-box`, a 2 px `rgb(255, 0, 255)` border, `pointer-events: none`, and the highest supported stacking order. The marker changes
no existing layout style and is not present before an explicit start. Before inserting it, the companion requires a visual
viewport at scale 1, zero offsets, and dimensions equal to `innerWidth` and `innerHeight`; the document root's client dimensions
must also equal the inner dimensions. It then checks that the fixed marker's measured rectangle is exactly the viewport and
that the root does not establish another fixed-position containing block (`transform`, `perspective`, `filter`, and `contain`
are `none`, `will-change` is `auto`, and `container-type` is `normal`). A failed check refuses start and removes any inserted
marker. Start and active read return `studioViewport` with the exact marker color and border width, measured marker rectangle,
inner and client dimensions, visual viewport values, and containing-block values. Inactive read and a successful stop return
`studioViewport: null`; stop, disposal, and pagehide remove the exact marker element.

The view sends marker requests as document-region messages with `type`, `id`, and `operation`. The studio companion replies to
the same document window with `type`, `id`, and either `result` or `error`; it ignores that exact reply shape when the resulting
same-window message event reaches its listener, so the reply is not handled as another request. An unsupported request still receives
an explicit error reply.

The `rgb(255, 0, 255)` edge pixels identify the studio viewport rectangle only. They do not establish the displayed editor
content or its cadence; OCR-confirmed natural content and recorded frame timestamps remain separate evidence.

For each delivered resize observation, the observer writes the root's measured width and height after the next
`requestAnimationFrame` callback to the existing trace log. Each frame record includes an increasing sequence number, the
document performance time origin, and the animation-frame timestamp. HWP diagnostic state retains no frame records; the trace
log is their record. These events describe the document's resize and animation-frame state; decoded capture pixels remain the
evidence of displayed content.

Stop disconnects the observer, cancels any pending animation-frame callback, and removes the studio marker. Read returns whether
observation is enabled, the next frame sequence number, both current history entry counts, the root's current dimensions, and
the live marker fields when active. It does not start observation or retain trace records. Starting while observation is active
is rejected. Stopping while observation is inactive is rejected. Normal view startup does not start the observer, insert the
marker, or send frame records.
