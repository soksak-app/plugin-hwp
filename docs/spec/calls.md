# Calls

[한국어](calls.ko.md)

The HWP view follows the call rule of core 0.0.40 ([plugin processes](https://github.com/soksak-app/core/blob/main/docs/spec/plugin-processes.md), rule 3). A call has no time limit: it ends by its reply, by its cancel or by the end of its peer, and no timer ends it. `plugin.json` and `diagnostics.json` declare no command `timeout`, which core 0.0.40 refuses. A peer that stays alive and does not reply leaves its call open.

## The plugin API

The page imports `@soksak/plugin-api`, `@soksak/plugin-api/view` and `@soksak/plugin-api/diagnostic-view-frames` at run time, where the application resolves them through the import map of the view; the plugin declares no dependency on them. The call layer of the view is part of that plugin API, so its rules (a request resolves with the result of its reply or rejects with the message and the code of its error, a request with an aborted signal is cancelled, a late reply and a lost peer are reported, and the layer starts no timer) are the behavior of core and are tested there. The tests of this plugin answer the plugin API with the fixture of `test/fixtures/plugin-api/`, which records the calls that the page makes and answers as each test arranges, and judge what the page does: which calls it makes with which arguments, and what it does with the answers. The page does not start a timer of its own for a call.

## The waits of the page

The page talks to the editor page, rhwp-studio in the document region `studio`, by messages. Each wait for the editor page ends by its answer or by the end of that page, and no timer ends it:

- **The end of the editor page.** The region reports the end of the WebContent process of its page through `onState` as the document state whose `error` is `the web content process ended`; core writes `error native document view: web content process terminated: <address>` for it. A navigation that the region starts after the load of the editor page raises the `navigations` count of the state; WebKit counts it when it starts, and a request posted to the page that it leaves has no answer to wait for. The view loads the editor page once and starts no other navigation of the region, so a larger count is a page other than the loaded editor page. At either state the page writes `plugin.hwp.studio.ended {path, reason}` at level error and shows `편집기가 끝났습니다 · <reason>` as the tab error, with the reason `the web content process of the editor page ended` or `the document region started another navigation`.
- **An embed request.** A request `{type: "rhwp-request", id, method, params}` ends by the answer `{type: "rhwp-response", id, result | error}`. The end of the editor page rejects each pending request with `rhwp-studio did not answer <id>: <reason> in phase <phase>`, and a request after that end fails with the same error at once and is not posted. The disposal of the view rejects each pending request with `the hwp surface closed before rhwp-studio answered`.
- **The listening wait.** The start waits for `{type: "soksak-hwp", event: "listening"}` after the load of the editor page. The end of the editor page ends the wait, and the start fails with `the editor page did not post listening: <reason>`.
- **A viewport marker request** of the diagnostic build ends as the [view diagnostics](view-diagnostics.md) state.

The view itself ends with its page, so no wait outlives it.

## Tests

A test waits for the event that it asserts and judges by the order and the result of the events; no test waits for time, counts turns, polls, mocks a timer or sets a time limit of its own. A test awaits the settled state of its view (`view.settled()`) or the push that produces the asserted state, and reads each call of the page from `view.calls`. A test that asserts an absence first waits for the event that ends the handling, then asserts the absence. A wait ends only by its event. The limit of the test runner, `--test-timeout=120000` in the test script of `package.json` and in the test run of `make pack`, ends a test whose event does not come: the runner fails that test with its name. The timers that a page starts are recorded in `view.observed.timers`, and a test that asserts that a wait starts no timer checks its setTimeout and setInterval entries there. The caret tests read the blink timer of the caret, which is the state of its ticks, and the frames of the host script are the frames of the test's view.
