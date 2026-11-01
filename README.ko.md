# HWP plugin

[English](README.md)

HWP plugin은 프로젝트의 HWP와 HWPX 문서를 [rhwp](https://github.com/edwardkim/rhwp)의 편집기 rhwp-studio로 열고, files sidecar로 같은 형식으로 저장한다. [docs/studio.ko.md](docs/studio.ko.md)는 plugin이 rhwp-studio를 담는 방법과 그 갱신을 설명한다. Plugin 형식은 soksak core spec(`docs/spec/plugins.md`)이 정한다.

```sh
make test                                   # test
make check                                  # kit release의 census 검사와 record 검사
make install                 # 설치 단계: 고정된 의존성과 정확한 Studio source
make studio                                 # 설치된 source directory 또는 개발 symlink로 빌드
make pack OUT=<folder> # plugin을 <folder>에 pack한다
make hooks                                  # clone 후 한 번: commit 때 commit message와 record를 검사
```

`make check`는 `package.json`이 pin한 events kit의 census 검사와 records kit의 record 검사를 실행한다. application은 release를 설치할 때 `plugin.json`과 `diagnostics.json`을 검증하고, registry 검사는 release의 exposed 이름을 각 listed core의 선언과 비교한다.

Checklist는 [docs/features.md](docs/features.md)다.
