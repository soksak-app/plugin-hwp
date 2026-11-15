# Calls

[English](calls.md)

HWP view는 core 0.0.40의 call 규칙을 따른다([plugin processes](https://github.com/soksak-app/core/blob/main/docs/spec/plugin-processes.ko.md), rule 3). Call에는 시간 한도가 없다. Call은 답, cancel, 상대의 끝으로 끝나고, 어떤 timer도 그것을 끝내지 않는다. `plugin.json`과 `diagnostics.json`은 core 0.0.40이 거부하는 command `timeout`을 선언하지 않는다. 살아 있으면서 답하지 않는 상대는 그 call을 열린 채로 둔다.

## Plugin API

Page는 `@soksak/plugin-api`, `@soksak/plugin-api/view`, `@soksak/plugin-api/diagnostic-view-frames`를 run time에 import하며, application이 view의 import map으로 그것을 resolve한다. Plugin은 그것에 대한 의존성을 선언하지 않는다. View의 call layer는 그 plugin API의 일부이므로, 그 규칙(request는 답의 result로 resolve하거나 답의 error의 message와 code로 reject하고, abort되는 signal을 가진 request는 cancel되며, late reply와 lost peer는 알리고, layer는 timer를 시작하지 않는다)은 core의 동작이며 core에서 시험한다. 이 plugin의 시험은 plugin API를 `test/fixtures/plugin-api/`의 fixture로 응답한다. 이 fixture는 page가 하는 call을 기록하고 각 시험이 정한 대로 답하며, 시험은 page가 하는 일을 판단한다. 곧 page가 어떤 call을 어떤 인수로 하는지와 그 답으로 무엇을 하는지이다. Page는 call마다 자신의 timer를 시작하지 않는다.

## Page의 대기

Page는 document region `studio`의 editor page인 rhwp-studio와 message로 말한다. Editor page를 기다리는 각 대기는 그 답이나 그 page의 끝으로 끝나고, 어떤 timer도 그것을 끝내지 않는다.

- **Editor page의 끝.** Region은 page의 WebContent process의 끝을 `onState`로 `error`가 `the web content process ended`인 document state로 알린다. Core는 이때 `error native document view: web content process terminated: <address>`를 쓴다. Editor page의 load 뒤 region이 시작한 navigation은 state의 `navigations` 수를 올린다. WebKit은 navigation을 시작할 때 세며, 그 navigation이 떠나는 page로 보낸 request에는 기다릴 답이 없다. View는 editor page를 한 번 load하고 region의 다른 navigation을 시작하지 않으므로, 더 큰 수는 load한 editor page가 아닌 page다. 두 state 중 어느 것이든 page는 `plugin.hwp.studio.ended {path, reason}`을 error 수준으로 쓰고 `편집기가 끝났습니다 · <reason>`을 tab error로 보인다. Reason은 `the web content process of the editor page ended` 또는 `the document region started another navigation`이다.
- **Embed request.** Request `{type: "rhwp-request", id, method, params}`는 답 `{type: "rhwp-response", id, result | error}`로 끝난다. Editor page의 끝은 대기 중인 각 request를 `rhwp-studio did not answer <id>: <reason> in phase <phase>`로 reject하고, 그 끝 뒤의 request는 post되지 않고 같은 error로 바로 실패한다. View의 dispose는 대기 중인 각 request를 `the hwp surface closed before rhwp-studio answered`로 reject한다.
- **Listening 대기.** Start는 editor page의 load 뒤 `{type: "soksak-hwp", event: "listening"}`을 기다린다. Editor page의 끝이 이 대기를 끝내고, start는 `the editor page did not post listening: <reason>`으로 실패한다.
- 진단 build의 **viewport marker request**는 [view 진단](view-diagnostics.ko.md)이 적은 대로 끝난다.

View 자신은 그 page와 함께 끝나므로 어떤 대기도 view보다 오래 남지 않는다.

## Test

Test는 자기가 확인하는 event를 기다리고 event의 순서와 결과로 판정한다. 어떤 test도 시간을 기다리거나, 턴을 세거나, poll하거나, timer를 mock하거나, 자기 시간 한도를 두지 않는다. Test는 view의 settled 상태(`view.settled()`) 또는 asserted 상태를 만드는 push를 기다리고, page의 각 call을 `view.calls`에서 읽는다. 없음을 확인하는 test는 먼저 처리를 끝내는 event를 기다린 뒤 없음을 확인한다. 대기는 그 event로만 끝난다. Event가 오지 않는 test는 test runner의 한도, 곧 `package.json` test script와 `make pack`의 test 실행에 있는 `--test-timeout=120000`이 끝내며, runner는 그 test를 이름과 함께 실패시킨다. Page가 시작하는 timer는 `view.observed.timers`에 기록되고, 대기가 timer를 시작하지 않는다고 확인하는 test는 그 목록의 setTimeout과 setInterval 항목을 확인한다. Caret test는 tick의 상태인 caret의 blink timer를 읽고, host script의 frame은 test view의 frame이다.
