# 변경 기록

[English](CHANGELOG.md)

## 미배포

- F239-77-hwp: HWP event catalog를 schema 3 JSON Schema로 변환하고 event 계약을
  유지한다. Red: 현재 core `events-check`가 schema 2 catalog에서 finding 131개를
  냈다. Green: 현재 core `events-check`가 선언 19개와 source emit을 모두 받는다.
  첫 package 실행은 legacy field map을 읽던 test 두 개를 드러냈다. 해당 test를
  JSON Schema properties와 required field 검사로 바꾸고, 집중 event/HWP test가
  48/48 통과한다. 현재 core package 검사가 통과한다. 두 test 수정 뒤 전체 package
  suite는 재실행하지 않았다. Runtime acceptance는 대기 중이다.

- H33: HWP `0.0.5`은 공개 core `v0.0.20`이 `surface.module` 없는 view composition을 거부하므로 `engines.soksak` `^0.0.21`을 선언한다. Red: `test/core-version.test.mjs`가 `">=0.0.18" !== "^0.0.21"`로 실패했다. Green: 같은 test가 1/1 통과하고 candidate `make check`에서 manifest, exposure, engines, events, records와 copied contract 검사가 통과한다. 일치하는 core release가 게시될 때까지 package release를 gate에 둔다. SDK pin, plugin version, archive, registry는 바꾸지 않았다.

- H32: 내장 편집기 URL을 HWP view page에 대한 상대 주소로 만들어 canonical `soksak://hwp` origin을 유지한다. Red: owning view case는 canonical URL을 기대했지만 `sok://hwp/...`를 받았다. Green: 같은 case와 `make test` 72/72, `CORE_PLUGIN_API_DIR=<core>/packages/plugin-api make check`가 통과한다. Package 0.0.5는 로컬 pack만 했으며 공개하지 않았다.

- H31: 복사한 view contract 사례를 현재 plugin API와 동기화한다. Red: `scripts/check-test-cases.mjs`가 `view-bridge.json`에서 core는 `soksak://`, 복사본은 `sok://`를 사용한다고 보고했고, 이후 stale view 사례 복사본 네 개를 더 찾았다. Green: 복사본 9개가 모두 core와 일치하고 `make test`는 72개 중 72개, 현재 core API 디렉터리를 지정한 `make check`는 통과한다.

- H30: source tab이 없는 tab origin `{directory: null}`을 HWP view가 허용한다. Red: `the view page mounts when its tab has no source origin directory`가 `startValues`의 null directory 거부로 실패했다. Green: 같은 test가 통과하고 HWP 문서가 phase `ready`에 도달한다. 이 수정의 package version은 0.0.4다.

- H29: files sidecar 0.0.8 이상을 요구하고 plugin을 0.0.3으로 올린다. Red: owning manifest test가 `>=0.0.5`에서 실패했다. Green: 현재 sidecar 하한으로 통과한다.

- H28: view 페이지는 doctype으로 시작하고 import map을 갖지 않는다. host가 doctype 뒤에 view import map을 넣으므로(core F212.12-1-10-6), 페이지의 복사본을 뺐다. Red: 시험이 map을 가진 page에서 실패했다. Green: `make test`가 70개 중 70개를 통과하고, core의 `checkViewPage`가 page를 받아들인다.
- H27: view의 start 값은 project id를 요구한다. 검증기는 `id`가 없는 project를 거부한다. core가 `{id, root}`를 주기 때문이다. view 시험은 root만 가진 project를 거부한다. Red: 이전 검증기에 대해 거부 시험이 실패했다. Green: id를 요구하는 검증기에서 시험이 통과한다.
- H26: view 페이지 map이 core view import map의 screen-hash 항목을 가진다. `checkViewPage`가 이 항목을 요구한다. 시험의 map 복사본은 `VIEW_IMPORTS`의 다섯 항목을 가진다. Red: `test/hwp.test.mjs`가 page map에 screen-hash 항목이 없어 deep-equal 차이로 실패했다. Green: `make test`가 69개 중 69개를 통과하고, `CORE_PLUGIN_API_DIR`로 `make check`가 통과한다.
- H24: pre-push 훅이 `make push-check`를 실행한다. 이것은 ci workflow와 같이 `make test`, `make check`, push 범위의 commit message 검사를 실행한다. Red: `.githooks/pre-push`가 없었고 `git push --dry-run`은 검사를 실행하지 않았다. Green: 훅이 검사를 실행한다. `make test`는 69개 중 69개를 통과하고, `make check`는 고정 SDK에서 실패하며 이것은 H25가 기록한다.
- F238-c-23-1: `make check`는 plugin API의 `validateManifest`로 `plugin.json`을 검사하며(`scripts/check-manifest.mjs`), `CORE_PLUGIN_API_DIR`가 설정되면 그 API를 읽고 SDK 도구를 그 폴더에서 실행한다. `test/check-manifest.test.mjs`는 fixture API의 거부 메시지가 검사를 실패시키는지 확인한다. Red: 검사 파일이 없었다. Green: `make test`가 69개 중 69개를 통과하며, `make check`는 core origin/main 추출본에 대해 0으로 종료된다.
- F238-c-14: `test/`의 어느 줄도 SDK 패키지 이름을 싣지 않는다. `test/sdk-boundary.test.mjs`는 needle을 포함한 `test/`의 줄마다 실패하며, needle은 부분 문자열에서 조립한다. model 주석은 plugin API로 적고, `test/hwp.test.mjs`는 import map 이름을 부분 문자열에서 조립한다. Red: guard가 다섯 줄을 나열했다. Green: `make test`가 test 68개를 통과한다.
- F238-c-24: CI workflow는 `make test` 다음에 `make check`를 실행하고, release workflow는 `make test`, `make check`, `make pack` 순서로 실행한다. `test/workflows.test.mjs`가 두 순서를 요구한다. Red: 이전 workflow에서 test가 실패했다. Green: `make test`가 67개 test를 통과한다. `make check`는 core release가 계약 파일을 게시할 때까지 case 복사 검사에서 실패하며, 이것이 예상된 결과다.
- H12: hwp page는 operation(open, save)을 `runtime.beginOperation`으로 시작하고, 돌려받은 cids를 files sidecar 요청과 record에 넘기며, operation event `plugin.hwp.operation`을 선언한다. read, render, save의 record는 plugin의 event로 기록된다. Red: operation test가 커밋된 page에서 실패했다. Green: `make test`가 통과한다.
- F252-contract-hwp: 복사한 command, binder, 노출 사례를 core origin/main에 맞췄다(`create-binder.json`, `expose.json`, `view-commands.json`이 바뀌었다). replay model은 매개변수 함수 bind와 command cids를 포괄한다.
- F252-hwp: byte 값 배열이 아닌 export 응답은 저장을 실패시키고 파일을 바꾸지 않는다. 텍스트가 없는 studio 오류는 event 전체를 표시한다. 실패한 context 읽기는 계약의 오류 event를 보낸다. 편집기 알림이 실패한 저장은 저장된 상태로 두고, tab은 알림 실패를 표시한다(`plugin.hwp.notify`). 거부된 `runtime.log` 기록은 `runtime.error {where: "log"}`로 표시하고 콘솔에도 남긴다.
- F238-b-10-2: test 명령이 `test/` 전체를 실행하므로 `test/sdk-models/`의 conformance test가 `make test`에서 실행된다(이전 46개, 이제 56개 중 56개 통과). `test/test-script.test.mjs`는 `test/` 아래의 test 파일이 test 명령에 선택되지 않으면 실패한다.
- F238-b-10-1: core view bridge 계약 사본을 현재 core 사례 집합으로 새로 고쳤다. `view.bridge.runtime-log-without-level-query`가 `view.bridge.runtime-log-level-gate`를 대신하며, view는 level 질의를 부르지 않는다. 이 저장소에서는 conformance test(`test/sdk-models/conformance.test.mjs`)가 사례를 제외 목록에 적는다. view bridge model에 `runtime.log`가 없기 때문이다.
- H22-1: `test/sdk-models/conformance.test.mjs`가 `view-commands.json`을 bridge model에 재생한다(command 등록과 command 요청의 응답). Red: model의 거부 code를 바꾼 mutation이 등록되지 않은 command의 재생에서 실패했다. Green: 복원한 model은 9개 중 9개 통과한다.
- H22-1: view 페이지 test는 SDK 없이 실행한다. `scripts/build-test.mjs`는 각 `@soksak/plugin-api` import를 `test/sdk-models/`의 model로 바꾼 `build/test/ui`를 만들고, `test/sdk-models/conformance.test.mjs`는 복사된 view, binder, call 한도 case를 재생한다(core F246, F248부터 F248-4까지). embed 한도 test는 save 전에 mock clock을 켠다. Red: `test/sdk-boundary.test.mjs`가 `test/hwp.test.mjs`의 SDK import에서 실패했다. Green: `make test`가 46개 중 46개 통과한다. `@soksak/plugin-api`는 release `v0.0.18`에 고정했으므로, core release가 case를 담을 때까지 `make check`의 case 복사 검사는 실패한다.
- H22: 표면은 view다. `plugin.json`은 페이지 `ui/index.html`과 문서 영역 `studio`를 담은 view composition을 선언하고, `ui/view.js`는 `@soksak/plugin-api/view`로 표면 module `ui/hwp.js`를 core의 영역 call과 함께 mount한다. 저장된 세션 기록이 restore된 case는 실행한다. 페이지는 구독 전에 `region.state`를 읽고, files sidecar를 `@soksak/sidecar-files`로 이름 붙인다. Red와 Green은 체크리스트에 기록했다.
- H22: `@soksak/plugin-api`를 core main에 고정했다. 이 core main은 view 영역에 `history`를 노출하고(core F245), view 요청마다 sidecar 이름을 받는다. `make test`는 플러그인 test만 실행하고, `make check`는 고정된 SDK 검사를 실행한다.
- H5: CI와 release workflow는 그 실행으로 확인했다(workflow는 바꾸지 않았다).
- H22: view로 옮기는 항목의 막힘을 2026-10-21의 core main에 대해 다시 적었다. view의 탭 보고와 runtime call은 제공된다(core F212.7-11). 결손 하나가 남는다: view에는 자신의 문서 영역을 놓거나 그 문서를 붙이는 경로가 없고, 일반 `runtime.native.call`은 영역의 세션 기록(`region.history`)을 거치지 않는다. view bridge `@soksak/plugin-api/view`를 담은 core release는 아직 없다.
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
