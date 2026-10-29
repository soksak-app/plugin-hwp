# 변경 기록

[English](CHANGELOG.md)

## 미배포

- F275-hwp: `make install`이 고정된 의존성을 설치한다. 시험, 검사, build는 더 이상 설치하지 않는다.
- H46: `@soksak/plugin-api`와 `CORE_RELEASE`를 복사한 모든 계약 case를 공개하는 core commit에 pin하고, view 시험 model이 UUID page 식별자를 따른다.
- F274-hwp: pre-push hook은 push가 게시하는 commit message만 검사한다. 시험과 검사는 CI가 실행한다.
- H45: Plugin API Git 의존성과 release workflow checkout을 version 0.0.21을
  선언하는 동일한 core commit으로 맞춘다.
  Lockfile은 정확한 commit으로 resolve된다. 격리된 virtual store에 고정 package를
  `pnpm fetch`했으며 version과 view-start SHA가 목표와 일치한다. SDK engine 검사와
  계약 사본 9개가 통과한다. Dependency 설치, Studio build, HWP test suite는 실행하지
  않았다. Publication은 대기 상태다.

- H44: 복사한 operation contract와 bridge-model replay를 현재 SDK 관측 형식에
  맞춘다. 첫 operation log와 이후 API request를 transport ID 없이 관측하고
  fixture handler는 clock, batch, 일반 request에 응답한다. Red: 변경 전 두
  operation case가 새 관측 형식 대신 transport clock request를 비교해 실패한다.
  Green: operation ID 증가와 cids 전달을 유지하면서 두 case가 통과한다.

- H43: Catalog owner가 JSON Schema `integer` type을 허용한다. `make check`가
  `diagnostics.json`을 검증하므로 중복된 diagnostics declaration SDK test를
  제거한다. Diagnostic 전용 module은 observer API consumer fake를 거쳐
  `build/test/ui`에서 불러온다. Red: 통합 suite가
  `plugin.hwp.view.content_frame.sequence`를 거부하고 SDK/UI boundary 실패
  세 개를 보고했다. Green: 집중 owner test 33/33과 HWP `make check`의
  manifest, diagnostics, exposure, engines, events, records 및 API 사본
  9개가 통과한다. 전체 suite는 재실행하지 않았다.

- H42: Studio build는 일반 directory 또는 개발 symlink 형태의 설치된
  source directory를 Git preparation과 source pin 검사 없이 사용한다.
  Release source 취득과 exact pin 검사는 별도 installer 단계로 옮기고,
  release CI가 build 전에 이를 호출한다. 일반 directory, dirty/retargeted
  symlink 및 source 누락 owner case가 2/2 통과한다. Studio build는 실행하지 않았다.

- H41: 기존 owner case로 source installer helper를 확인한다. Symlink 거부와
  commit 불일치 또는 dirty source 거부가 2/2 통과한다. 예정 source tag가
  공개되지 않아 installer 실행, upstream startup test, 해당 tag 기준 Studio/HWP
  build는 미확인 상태다.

- H40: Studio load-progress message는 계속 갱신하되 CSS가 표시하지 않을 때
  paint 대기를 생략한다. Message가 보이면 기존 double-animation-frame 대기와
  50 ms fallback을 유지한다. HWP embedded 760 × 286 CSS px viewport는
  responsive rule로 `#status-bar`를 숨긴다. Source owner test 4/4가 통과했으며
  helper TypeScript 검사, HWP `make check`, core `make docs-check`도 통과한다.
  전체 Studio typecheck는 sparse checkout의 `@wasm/rhwp.js` declaration 누락으로
  막혔으며 source 변경은 고정된 Studio release에 아직 들어가지 않았다.

- H39: View record는 bridge의 bounded `runtime.log` writer로 보내고
  `runtime.error` route를 사용한다. Consumer fake는 이전 record별 writer
  요청을 거부한다. Red: 변경 전 HWP open/save test는 fake가 `{level, event,
  fields}`를 거부해 operation record를 잃었다. Green: 대상 HWP consumer test
  2/2, bridge-model conformance 10/10, 현재 API와 일치하는 view-bridge 사본,
  source-SDK `make check`의 계약 사례 9개가 통과한다.

- H38: Studio를 공개된 `soksak-studio-v0.8.7-1` source로 고정하고 local startup
  patch 적용 절차를 제거한다. source owner case 네 개, HWP check와 Studio build가
  통과한다. 네 쌍의 비교에서 font 응답 완료부터 reading phase까지의 구간이 11–37 ms 개선됐다.
  전체 startup acceptance는 확인되지 않았다.

- H23.11: 활성 diagnostic read에 현재 studio `PerformanceResourceTiming` 항목과 document clock을 추가한다. Browser가 제한한 0을 그대로 보존하며 완전한 resource history나 WebAssembly compilation 시간을 주장하지 않는다. 변경 전 read owner는 timing field 누락으로 실패했고, view diagnostics 24/24, declaration owner 각각 1/1, current-SDK 구조 검사가 통과한다.

- H37: 기존 studio HTML viewport marker를 4 CSS px 안쪽에 그려 native cyan border와 paint를 구분한다. Layout, pointer 동작, preflight와 cleanup을 유지한다. 변경 전 DOM owner Red가 Green으로 바뀌며 owner case 21개, current-SDK 검사와 diagnostic packaging이 통과한다. Pixel acceptance는 core F239-233에 남는다.

- H36: 성공한 frame-observation 시작 응답에 HWP view document의 `performance.timeOrigin`, 즉시 읽은 `performance.now()`와 고정된 1 ms 정밀도 상한을 반환한다. Red: 기존 응답에 `sourceClock`이 없음을 owner test가 확인했다. Green: owner test 1/1, current-SDK `make check`, authoritative diagnostic pack이 통과했다. Application 통합은 core F239-221에서 계속한다.

- H35: 전체 view-sharing process group을 회수하고 다시 연 뒤에도 HWP 본문이
  표시되는지 확인한다. group을 닫기 전에 측정이 view를 `760 × 286.5`에서
  `785.5 × 286.5`로 바꿨다. 넓어진 viewport에서 responsive toolbar가 펼쳐져 첫
  문단이 캡처된 document 영역 아래로 이동한다. Core F212.14-5-32는 다시 열기 전에
  초기 geometry를 복원한다. 이후 Wails와 Tauri acceptance에서 본문 OCR, 세 번의
  반복 모두 10초 내 90% 이상 회수, engine-cached process가 남지 않음을 확인했다.
  HWP source 변경은 필요하지 않았다.

- H34: 현재 source 상태에 맞게 영어/한국어 HWP 기록을 정합한다.
  Specification은 checklist ID 대신 canonical feature status에 연결한다. H7은
  원인과 재시도 조건을 명시하며, feature 문서는 구현, 검증, 배포 상태 열을
  함께 제공한다. Red: 현재 core 문서 검사가 status table 누락, H7 원인/재시도
  필드 미기재, specification 내 checklist ID, changelog 번역 불일치 네 건을
  보고한다. Green: 현재 core 문서 검사와 current SDK를 사용한 HWP `make check`가
  통과한다.

- H23.10: 대기 중인 animation frame 전에 도착한 root ResizeObserver delivery를
  하나의 frame으로 병합한다. 각 trace record는 첫 번째와 최신 전달 시각, 해당 실제
  frame이 나타내는 양수 횟수를 보존한다. Red: core 소유 test가 기존 callback 대기 중
  두 번째 root delivery를 보내면 helper가 record를 만들기 전에 throw했다. Green: core
  소유 test 6/6, HWP view diagnostics 21/21 및 source-SDK `make check`가 통과한다.

- H23.9: marker request가 대기 중이면 정확한 native document-post echo를 무시하고
  정확한 `result` 또는 `error` reply만 받는다. Red: tracked native-contract test에서
  studio reply보다 `{type, id, operation}`가 먼저 전달되어 marker start가 `undefined`로
  완료되고 evidence와 cleanup 검사가 실패했다. Green: `test/view-diagnostics.test.mjs`
  21/21과 source-SDK `make check`가 통과한다.

- H23.8: same-window message event가 companion listener에 도달하면 studio marker의
  정확한 reply 형태를 무시한다. Native document post와 companion reply는 같은 studio
  window를 사용한다. Red: tracked native-envelope test는 응답 하나 대신 다섯 개를 만들었고,
  보존된 Wails와 Tauri trace는 `operation: start` 뒤 `unknown HWP studio viewport marker
  operation undefined`를 기록했다. Green: 추적 test가 1/1 통과하고 diagnostic
  specification에 request/reply 처리를 기록한다.

- H23.7: 전체 `diagnostics.json` 선언을 public plugin API로 검증한다.
  `make check`에서 이를 검사한다. 지원하지 않는 array length keyword를 제거하고 diagnostic producer와
  consumer의 정확한 3-channel marker color 검증은 유지한다. Red: SDK가
  `minItems`를 거부해 선언 test가 실패했고 manifest checker는 diagnostics를
  검사하지 않았다. Green: 선언 test 1/1 통과, source-SDK `make check`는 두 선언과
  나머지 검사를 통과한다.

- H23.6: 중첩 HWP studio document에 diagnostic-only 고정 viewport marker를 추가한다.
  View page는 diagnostics 선언이 있을 때만 studio companion을 활성화한다. Studio host는
  attachment가 끝난 뒤 `listening`을 보내고 attachment 실패를 readiness로 표시하지 않고
  오류로 전달한다. Companion은 명시적 start 때만 투명한 2 px magenta border를 추가하고
  visual viewport, root dimension, fixed positioning, 측정 rectangle을 검증한다. 명령은
  viewport evidence의 정확한 형태를 반환하며 stop, dispose, pagehide는 같은 marker를
  제거한다. 기존 view-root paint는 native studio document 뒤에 가려지므로 frame observation은
  이제 root paint를 바꾸지 않는다. Red: 중첩 page loader가 package declaration을 `/ui` 아래에서
  찾았고 start/stop race가 marker state를 유실하거나 제거하지 못했으며 concurrent dispose는
  cleanup 전에 반환했고 observer가 root background를 바꿨다. Green: view diagnostic test 19/19,
  HWP consumer test 43/43, current-core `make check`가
  통과한다. Core F212.14-5-8 capture consumer는 viewport pixel을 자연 표시 content와 cadence에서 분리해
  측정한다.

- H23.5: HWP release에 `ui/studio-host.js`를 포함한다. 빌드된 editor page는
  `../studio-host.js`에서 이 파일을 불러온다. 파일 누락으로 두 host가 plugin
  파일 없음 오류를 기록한 뒤 도착할 수 없는 editor message를 기다렸다. Red:
  추적된 release test가 실제 `npm pack` release를 검사하고 packaged editor page가
  누락된 `ui/studio-host.js`를 참조해 실패했다. Green: bridge를 `package.json`
  `files`에 추가한 뒤 같은 test가 통과한다. `make pack`은 표준 plugin pack 명령
  전에 release graph 검사를 실행한다. Source bridge는 수정하지 않았다.

- H23.4: 공유 diagnostic frame observer에 view document의 바인딩된 `performance.now`
  clock을 전달한다. Observer는 ResizeObserver 전달 시각을
  기록할 때 이 clock을 요구한다. Red: HWP adapter test가 observer 경계에서
  `now` 함수를 받지 못했다. Green: 같은 test가 함수의 `this`가 view performance
  object이고 해당 clock 값을 반환하는지 확인한다. Graph 및 diagnostic adapter
  test 5/5와 current-core `make check`가 통과한다.

- H23.3: browser에서 로드되는 HWP diagnostic view module에서 Node 전용 `node:assert/strict`
  import를 제거한다. Core browser graph checker가 이 import를
  거부해 두 host의 diagnostic view가 로드되지 않았다. 명시적 경계 검사는 Node
  runtime dependency 없이 진단 오류를 유지한다. Red: 추적된 graph test가
  `ui/view-diagnostics.js: import node:assert/strict is not in the view import map`을
  보고했다. Green: 같은 검사가 현재 core SDK에서 통과하고 graph 및 diagnostic
  adapter test가 5/5 통과한다.

- H23.1: 제외되는 `diagnostics.json` 선언과 module로 opt-in HWP view root
  frame 진단을 추가한다. 명령은 실제 view document root observer를 시작,
  중지, 조회하며 각 resize를 다음 animation frame 뒤 trace record로 보낸다.
  Read 명령은 view history와 live `studio` region history count를 모두
  반환한다. 진단 paint는 stop, dispose, observer start 실패 때 기존 inline
  background를 정확히 복원한다. Red: `createViewFrameDiagnostics`가 없어
  소유 test가 실패했고, history follow-up도 staged reply에 studio count가 없어
  실패했다. Green: live region-history update와 start 중 dispose를 포함한
  소유 집중 test 4/4와 HWP test 43/43이 통과한다. Exposure와 engines 검사는 통과했다. 현재 SDK census와 catalog 검사는
  source 7개, pending rule 0개, 선언 event 20개로 통과한다. 표시된 content 측정의 capture pixel 검증은 H23.2에 남아 있다.

- F239-77-hwp: 일치하는 설치 diagnostic cohort로 로컬 schema-3 catalog acceptance를 완료한다. 현재 SDK가 source 5개와 pending rule 0개, event 19개를 검사하며 양쪽 host 설치본의 catalog가 source와 정확히 일치하고 application log audit을 통과한다. Public publication은 별도다.

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
