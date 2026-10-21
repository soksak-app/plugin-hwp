# 변경 기록

[English](CHANGELOG.md)

## 미배포

- H22, H23: 표면을 문서 영역을 옮겨 가지는 view로 옮기는 항목(core F212.10)과 release 전 view 측정 항목을 등록했다. H22는 branch `feat/view-kind-F212.7`의 두 결손을 기다린다: view에 영역 연산의 call 경로가 없고, 제공되는 view call에 탭 보고(`tab.title`, `tab.modified`, `tab.error`)가 없다.
- H21: 새 커밋의 작성자는 `min-0-max <max@blue.tools>`다. `.mailmap`이 이전 이름 `min-median-max`를 잇고, 게시된 커밋은 다시 쓰지 않는다.

## 0.0.2 (2026-10-19)

- H20: 메모리 절약 선언(H19)을 담은 version 0.0.2를 release한다. tag `v0.0.2`가 core v0.0.18의 `sok`로 만든 `hwp-0.0.2.tgz`를 게시한다.
- H19: 표면이 `surface.unload` `{format: 1, maxBytes: 8192}`를 선언하고, `{path}`를 core 탭 상태로 쓰며, mount에서 저장한 파일을 열고, 문서 영역이 세션 기록을 restore하지 않았을 때만 편집기 페이지를 load한다. `@soksak/plugin-api`와 `CORE_RELEASE`는 core 0.0.18에서 오고 `engines.soksak`이 이를 요구한다. Red: 탭 상태, history, 거부 case; Green: `make test` 42 of 42 통과.

## 0.0.1 (2026-10-14)

- H6: version 0.0.1을 release한다. tag `v0.0.1`이 core 0.0.12의 `sok`로 plugin을 게시하며, plugin은 files sidecar `>=0.0.5`를 요구한다.
- H18: `@soksak/plugin-api`를 core release 0.0.12에서 받고, `engines.soksak`은 `>=0.0.12`이며, release workflow가 `CORE_RELEASE: v0.0.12`에서 `sok`를 build한다.
- H17: `make hooks`가 `.githooks`를 hook 폴더로 정해, commit message의 형식이나 용어 규칙, record 규칙을 어긴 commit이 만들어질 때 거부된다.
- H15.1: `params.path` 없는 tab은 편집기의 빈 문서를 열고, 그 첫 저장은 `core.file.place`로 파일을 물은 뒤 그 파일을 쓰고 감시한다.
- H16: `make test`가 record 검사 `soksak-records`를 실행하고, CI가 push된 각 commit message의 형식을 `soksak-commits`로 검사한다.
- H14.4: `@soksak/plugin-api`를 core release 0.0.11에서 받고 `engines.soksak`은 `>=0.0.11`이므로, `make test`가 설치된 의존성의 event 가드를 실행한다.
- H14.6: 표면이 `hwp.save`, `hwp.reload`, `hwp.request`를 문자 그대로의 이름으로 등록하므로, `make test`의 exposure 검사가 그 등록을 찾는다.
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
