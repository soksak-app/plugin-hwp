# Calls

[한국어](calls.ko.md)

The HWP view follows the call rule of core 0.0.40 ([plugin processes](https://github.com/soksak-app/core/blob/main/docs/spec/plugin-processes.md), rule 3). A call has no time limit: it ends by its reply, by its cancel or by the end of its peer, and no timer ends it. `plugin.json` and `diagnostics.json` declare no command `timeout`, which core 0.0.40 refuses. A peer that stays alive and does not reply leaves its call open.

## The SDK model

`test/sdk-models/view.mjs` is the model of the call layer of the view bridge, and the conformance test replays the cases `calls.end.*` of the copy `test/fixtures/contract/calls.json` against it. A request resolves with the result of its reply or rejects with the message and the code of its error; a request with a signal that aborts sends `{id, cancel: true}` and rejects with `cancelled`, and a reply after that cancel is a late reply, reported with its delay and passed to no caller; `peerLost(reason)` rejects each open call with `command <name> ended: <reason>` and reports `peer-lost` for each of them and then the open calls. The model starts no timer.

## The waits of the page

The page talks to the editor page, rhwp-studio in the document region `studio`, by messages. Each wait for the editor page ends by its answer or by the end of that page, and no timer ends it:

- **The end of the editor page.** The region reports the end of the WebContent process of its page through `onState` as the document state whose `error` is `the web content process ended`; core writes `error native document view: web content process terminated: <address>` for it. A navigation that the region starts after the load of the editor page raises the `navigations` count of the state; WebKit counts it when it starts, and a request posted to the page that it leaves has no answer to wait for. The view loads the editor page once and starts no other navigation of the region, so a larger count is a page other than the loaded editor page. At either state the page writes `plugin.hwp.studio.ended {path, reason}` at level error and shows `편집기가 끝났습니다 · <reason>` as the tab error, with the reason `the web content process of the editor page ended` or `the document region started another navigation`.
- **An embed request.** A request `{type: "rhwp-request", id, method, params}` ends by the answer `{type: "rhwp-response", id, result | error}`. The end of the editor page rejects each pending request with `rhwp-studio did not answer <id>: <reason> in phase <phase>`, and a request after that end fails with the same error at once and is not posted. The disposal of the view rejects each pending request with `the hwp surface closed before rhwp-studio answered`.
- **The listening wait.** The start waits for `{type: "soksak-hwp", event: "listening"}` after the load of the editor page. The end of the editor page ends the wait, and the start fails with `the editor page did not post listening: <reason>`.
- **A viewport marker request** of the diagnostic build ends as the [view diagnostics](view-diagnostics.md) state.

The view itself ends with its page, so no wait outlives it.

## Tests

A test waits for the event that it asserts and judges by the order and the result of the events; no test waits for time, counts turns, polls, mocks a timer or sets a time limit. The fakes record each occurrence that a test can observe, a posted message, a served call, a log record, a report or a delivered event, and each record runs the waits whose condition now holds (`test/occurrences.mjs`); the fake of the host records each host event after the page has dispatched it to its listeners. A test that asserts an absence first waits for the event that ends the handling, then asserts the absence. A wait whose event does not come is rejected at the end of the event loop, when the process emits `beforeExit` with nothing left to run, with the state that it waits for, so the test fails by that event. The page starts no timer: `test/no-timers.mjs` records each timer that a built ui file starts and does not start it, and the tests of the waits assert that list where the wait has begun. The caret tests read the blink timer of the caret, which is the state of its ticks, and the frames of the host script are the frames that the test runs.
