# 변경 기록

[English](CHANGELOG.md)

## 미배포

- H13: 편집기 쪽이 `rhwp-studio`의 script가 실행된 뒤 `listening`을 보내고, plugin은 그 message 뒤에 첫 요청을 보낸다. 편집기가 message listener를 설치하기 전에 보낸 요청이 사라져 시작이 `phase: starting`에 머물렀기 때문이다. message의 대기와 각 embed 요청은 한도 뒤에 단계를 밝히는 error로 실패한다.
- H14.5: plugin event는 level이 저장될 때만 비싼 field를 만들고, plugin에는 `cids`를 가진 입력이 없다.
- H14: 전달자 `ui/events.js`가 넘기는 event 이름에 `events: forwarded`를 표시하므로, core의 catalog 검사가 `emitEvent` 호출에서 이름을 읽는다.
- H14: plugin이 `events.json`을 선언하고, 열기, 닫기, 시작 단계, 읽기, render, 저장, 감시, 편집기 쪽 message, embed 요청, command를 `ui/events.js`를 거쳐 `plugin.hwp.*` event로 저장하며, Command-S가 시작한 저장의 실패를 저장하고, `make test`에서 `soksak-events`를 실행한다. `test/events.test.mjs`와 `test/hwp.test.mjs`의 test 10개가 이를 검사하고, manifest test는 H14.4를 기다린다.
- H11: `hwp.document`가 mount를 시작할 때부터 있고 그 단계를 `phase`로 알린다.
- H10: 문서와 주석이 plugin, sidecar, release를 그 말로 부른다.
- H9.7: 표면이 편집기를 `sok://hwp/ui/studio/index.html`에서 연다.
- H9.6: 문서가 plugin을 package 대신 plugin이라고 부른다.
- H9.5: `hwp.document`가 편집기에 선택 영역이 있는지 알린다.
- H9.3: 표면이 rhwp-studio를 문서 영역 `studio`에 보이고 그 embed 요청으로 파일을 열고 저장하고 다시 읽는다. 쪽을 직접 그리던 페이지와 vendor한 `rhwp.js`는 지웠다.
- H9.2: `ui/studio-host.js`가 편집기 페이지에서 실행되어 Command-S와 미저장 변경을 표면 페이지에 알린다.
- H9.1: `make studio`가 rhwp `v0.8.7`의 `rhwp-studio`를 고치지 않고 `ui/studio/`에 빌드하고, `make pack`과 release workflow는 pack 전에 그것을 빌드한다([docs/studio.ko.md](docs/studio.ko.md)).
