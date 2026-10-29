# Plugin 안의 rhwp-studio

[English](studio.md)

hwp plugin은 [rhwp](https://github.com/edwardkim/rhwp)의 편집기 `rhwp-studio`로 문서를 편집한다. Source installer는 예정된 HWP Studio release `soksak-studio-v0.8.7-2`를 installer script의 `COMMIT` 값으로 고정한다. Build는 Git 작업, source identity, clean 상태 검사 없이 설치된 source directory를 사용한다. 일반 설치 directory와 개발 checkout을 가리키는 symlink는 같은 build 계약을 따르므로 source 수정과 symlink 대상 변경을 그대로 사용할 수 있다. 이 source는 동기 font 감지와 `@font-face` 등록을 유지하고 critical web-font 로딩과 WebAssembly 초기화를 함께 시작한 뒤 두 작업이 모두 끝날 때까지 renderer setup과 ready barrier를 기다린다. Upstream font loader의 face별 fallback 동작을 유지한다. 두 startup 작업이 함께 실패하면 aggregate error message에 두 원인을 모두 포함하고 `errors` 배열에는 원래 오류값을 보존한다. 예정 release tag는 아직 공개되지 않았으며 아래에 delivery 상태를 기록한다.

H40 source candidate는 Studio progress message를 항상 갱신한다. Message가 렌더링될 때만 기존의 double animation frame paint 기회와 50 ms fallback을 기다린다. CSS가 message를 숨긴 상태에서는 paint 대기 없이 다음 단계로 진행한다. HWP startup 비교에 사용한 760 × 286 CSS px embedded viewport는 responsive small-viewport 규칙에 따라 `#status-bar`를 숨기므로, 해당 progress 대기는 message를 화면에 표시할 수 없다. 별도 installer는 예정된 `soksak-studio-v0.8.7-2` tag를 가져오고 installer의 `COMMIT`이 가리키는 source commit을 확인하도록 준비됐다. Tag는 아직 존재하지 않으므로 이 source pin은 delivery 후보이며 공개 release가 아니다. 표준 DOM `checkVisibility()` API는 WebKit Safari 17.4부터 macOS Sonoma 14.4에서 지원되어 앱의 최소 macOS version과 일치한다([WebKit release notes](https://webkit.org/blog/15063/webkit-features-in-safari-17-4/)).

## 빌드

`make studio`는 `scripts/build-studio.mjs`를 실행하고, 이 script는 빌드한 편집기를 `ui/studio/`에 쓴다. Git은 그 폴더를 무시하고, `make pack`과 release workflow는 plugin을 pack하기 전에 그것을 빌드한다.

## 개발 빌드

`make studio`는 `node_modules/.cache/rhwp-soksak-studio-v0.8.7-2`에 이미 설치된 source directory를 사용한다. Directory는 `.git`이 없는 일반 설치 경로이거나 개발 checkout을 가리키는 symlink일 수 있다. 두 경로는 같은 빌드 준비 계약을 따른다. Source에는 `rhwp-studio/package.json`, `rhwp-studio/package-lock.json`, `LICENSE`, `THIRD_PARTY_LICENSES.md`가 있어야 하며 누락된 파일을 이름으로 알리는 오류를 낸다. Build는 clone, checkout, sparse-checkout 설정 변경, commit 확인, Git dirty 상태 거부를 하지 않는다.

Build는 `@rhwp/core` devDependency의 WebAssembly package를 `rhwp-studio`가 import하는 source의 `pkg` 폴더로 복사한다. Package version은 별도 `CORE_VERSION` pin `0.8.7`과 같아야 한다. `rhwp-studio`의 `node_modules`가 없으면 lockfile로 `npm ci` 설치한다. 이어 상대 asset 경로로 HWP control plugin 없이 `npm run build:no-hwpctrl -- --base ./`를 실행해 `ui/studio/`를 빌드하고, `ui/studio-host.js`를 `ui/studio/index.html`의 마지막 module script로 추가하며, `LICENSE`와 `THIRD_PARTY_LICENSES.md`를 `ui/studio/`에 복사한다.

Local development는 설치된 symlink를 직접 사용한다. Source installer를 자동 호출하지 않으므로 source 수정과 symlink 대상 변경이 다음 build에 반영된다.

## Release source 설치

설치 단계인 `make install`은 고정된 의존성을 설치한 뒤 release source installer를 실행한다. Release build 전에 실행한다:

```sh
make install
make studio
```

Installer는 예정된 `soksak-studio-v0.8.7-2` source tag를 가져오고, `rhwp-studio`의 `e2e`와 다른 tests를 제외하되 추적되는 startup owner test, `assets/fonts`, `LICENSE`, `THIRD_PARTY_LICENSES.md`를 sparse checkout한 뒤 `scripts/install-studio-source.mjs`의 `COMMIT`과 clean Git 상태를 확인한다. Symlink 또는 Git checkout이 없는 기존 directory는 source를 교체하거나 복구하지 않고 거부한다. Local development에서는 installer를 자동 실행하지 않는다. Release CI는 `make pack` 전에 `make install`를 실행하고, `make pack`이 설치된 directory를 빌드한 뒤 pack한다.

예정된 tag는 아직 공개되지 않았다. Tag가 공개되고 `COMMIT` 값의 commit을 가리키기 전에는 installer가 완료될 수 없다.

예정 source에는 upstream 소유 startup test가 들어 있다. 예정 tag가 `COMMIT`에 적힌 commit을 가리키면 Cache된 `rhwp-studio`에서 `npm run test:startup`을 실행한다. 이 target은 startup helper만 `dist/startup-tests`에 compile하고 Node test runner로 실행한다. 네 case는 전체 barrier를 지키면서 두 작업을 함께 시작하는지, font와 WebAssembly의 실패 동작, 두 실패 원인의 보존을 검사한다. 기존 네 case 결과는 이전 pin에만 해당하며 H40 후보의 검증 결과가 아니다.

## Host script

`rhwp-studio`는 자기 페이지 안에서 통합하는 host에게 `window.rhwpStudio.automation`을 내준다. `ui/studio-host.js`는 그 페이지에서 실행되어 window에 다음 message를 보내고, 문서 영역은 그것을 표면 페이지에 전달한다.

- script가 실행될 때 한 번 `{type: "soksak-hwp", event: "listening"}`. 이 script는 쪽의 마지막 module script이므로 message listener를 설치하는 `rhwp-studio`의 script가 먼저 실행된다. 쪽의 load는 그 script가 끝나기 전에 쪽을 알릴 수 있고 listener가 생기기 전에 보낸 요청은 사라지므로, surface 쪽은 이 message 뒤에야 첫 요청을 보낸다.
- Command-S에서 `{type: "soksak-hwp", event: "save"}`. `rhwp-studio`의 embed mode는 저장 command를 등록하지 않고 단축키의 기본 동작만 막기 때문이다.
- automation context의 `isDirty`가 바뀌면 `{type: "soksak-hwp", event: "modified", modified}`. 입력 event와 편집기의 응답마다 읽는다. `rhwp-studio`에는 최상위 페이지를 위한 변경 event가 없기 때문이다.
- automation context의 `hasSelection`이 바뀌면 `{type: "soksak-hwp", event: "selection", selection}`. 같은 때에 읽는다.
- 그 상태를 읽을 수 없으면 `{type: "soksak-hwp", event: "error", message}`.

## 이후 rhwp tag로 갱신

1. `scripts/install-studio-source.mjs`의 `REPOSITORY`, `TAG`, `COMMIT`을 검토한 HWP Studio source release로 바꾼다. `scripts/build-studio.mjs`의 `CORE_VERSION`과 `@rhwp/core` version은 별도 pin으로 유지하고 해당 Studio source가 사용하는 WebAssembly package가 바뀔 때만 갱신한다.
2. 고정 source의 startup owner test, `make studio`, `make check`를 실행한다.
3. 새 source의 embed protocol(`rhwp-studio/src/embed/`)과 `window.rhwpStudio.automation` context를 읽고 `ui/`에서 사용하는 요청과 필드의 변화를 확인한다.
