# 기능

[English](features.md)

- [o] H1 — P1: rhwp를 bundle한다. `scripts/build-vendor.mjs`는 정확한 devDependency `@rhwp/core` 0.8.7(MIT)의 `rhwp.js`와 `rhwp_bg.wasm`을 `ui/vendor/`에 복사하고, 그 라이선스와 rhwp가 0.8.7에 나열한 third-party 라이선스(`vendor/rhwp-0.8.7-THIRD_PARTY_LICENSES.txt`)를 담은 `rhwp.LICENSE.txt`를 함께 두며, `--check`는 커밋한 파일이 다르면 실패한다. 2026-10-08에 완료했다. `make test`가 그 검사를 실행한다.
- [o] H2 — P1: core checklist 항목 F102.4와 F109를 위해 프로젝트의 `.hwp`나 `.hwpx` 파일을 열고 쪽을 그린다. `surface.opens`는 `hwp`와 `hwpx`를 선언하고, page는 files sidecar 0.0.5 이상의 `readBytes`로 파일을 읽어 각 쪽을 rhwp의 SVG로 그리며, 탭 이름을 파일 이름으로 한다. 2026-10-08에 완료했다. `test/hwp.test.mjs`가 문서를 열어 글과 쪽을 찾고, core 창 검사 `e2e/hwp.test.mjs`가 두 host에서 파일 tree의 `.hwp` 파일을 Enter로 연다.
- [o] H3 — P1: 커서에서 본문 글을 고친다. 클릭은 `hitTest`로 커서를 놓고, 커서의 입력 칸이 입력한 글, 입력기 조합, 편집 키를 받으며, 모든 편집은 `hwp.edit`을 실행한다. 커서의 x는 `getCursorRect`에서, 위쪽과 높이는 `getCursorRectOnLine`에서 가져온다. `getCursorRect`는 글이 있는 줄에서 기준선과 높이 0으로 답하기 때문이다. Red: 다시 그리기가 초점을 가진 입력 칸을 새 쪽으로 옮겨 `the input field keeps the focus while edits draw the pages again`이 실패했고, `the caret has the height of its line in a paragraph with text`가 높이 0으로 실패했다. Green: 둘이 통과하고, core 창 검사에서 네이티브 키가 두 host에서 글을 넣는다.
- [o] H4 — P1: page가 읽은 version으로 `writeBytes`를 써서 파일 자신의 형식으로 저장하고, rhwp가 내용을 잃는다고 보고한 저장은 거절하며, 디스크의 변경을 따르고, 실패는 `tab.error`로 보인다. 2026-10-08에 완료했다. 저장과 충돌 테스트가 통과하고, core 창 검사에서 Command-S가 파일을 쓰며 다시 읽어도 편집이 남는 것을 두 host에서 확인했다.
- [ ] H5 — P1: CI와 release workflow를 더한다. `ci.yml`은 macOS runner에서 `make test`를 실행하고, tag `v*`는 `release.yml`을 실행하며, 이는 선언한 core release의 `sok`으로 plugin을 pack한다.
- [ ] H6 — P1: version 0.0.1을 릴리스하고 registry에 올린다. core 0.0.8과 files sidecar 0.0.5 이상을 요구한다.
- [ ] H7 — P2: 쪽을 카드 폭에 맞춘다. 카드보다 넓은 쪽은 그 폭으로 줄이고, 클릭과 커서도 같은 배율을 쓴다.
- [ ] H8 — P1: 사용자 승인을 받아 activation tier 검사로 커서의 한글 입력기 조합을 같은 창의 AppKit text view와 비교해 확인한다.
