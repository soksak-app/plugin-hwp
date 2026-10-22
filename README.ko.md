# HWP plugin

[English](README.md)

HWP plugin은 프로젝트의 HWP와 HWPX 문서를 [rhwp](https://github.com/edwardkim/rhwp)의 편집기 rhwp-studio로 열고, files sidecar로 같은 형식으로 저장한다. [docs/studio.ko.md](docs/studio.ko.md)는 plugin이 rhwp-studio를 담는 방법과 그 갱신을 설명한다. Plugin 형식은 soksak core spec(`docs/spec/plugins.md`)이 정한다.

```sh
make test                                   # test
make check                                  # 고정된 core release의 SDK 검사
make studio                                 # ui/studio의 rhwp-studio
make pack OUT=<folder> SOK=<core>/target/debug/sok   # plugin을 <folder>에 pack한다
make hooks                                  # clone 후 한 번: commit 때 commit message와 record를 검사
```

`make check`는 manifest 검사(`scripts/check-manifest.mjs`), SDK 도구(exposure, engines, events, records)와 contract case 복사 검사를 `package.json`이 고정한 `@soksak/plugin-api`로 실행한다. core `main` branch로 검사하려면 core의 `origin/main`에서 `packages/plugin-api` 폴더를 별도 index 파일로 scratch 폴더에 checkout하고(core checkout은 바뀌지 않는다), `CORE_PLUGIN_API_DIR`를 그 폴더로 지정한다:

```sh
GIT_INDEX_FILE=<scratch>/index git -C <core> --work-tree=<scratch> checkout origin/main -- packages/plugin-api
CORE_PLUGIN_API_DIR=<scratch>/packages/plugin-api make check
```

Checklist는 [docs/features.md](docs/features.md)다.
