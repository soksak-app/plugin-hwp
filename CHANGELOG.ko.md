# 변경 기록

[English](CHANGELOG.md)

## 미배포

- H10: 문서와 주석이 plugin, sidecar, release를 그 말로 부른다.
- H9.7: 표면이 편집기를 `sok://hwp/ui/studio/index.html`에서 연다.
- H9.6: 문서가 plugin을 package 대신 plugin이라고 부른다.
- H9.5: `hwp.document`가 편집기에 선택 영역이 있는지 알린다.
- H9.3: 표면이 rhwp-studio를 문서 영역 `studio`에 보이고 그 embed 요청으로 파일을 열고 저장하고 다시 읽는다. 쪽을 직접 그리던 페이지와 vendor한 `rhwp.js`는 지웠다.
- H9.2: `ui/studio-host.js`가 편집기 페이지에서 실행되어 Command-S와 미저장 변경을 표면 페이지에 알린다.
- H9.1: `make studio`가 rhwp `v0.8.7`의 `rhwp-studio`를 고치지 않고 `ui/studio/`에 빌드하고, `make pack`과 release workflow는 pack 전에 그것을 빌드한다([docs/studio.ko.md](docs/studio.ko.md)).
