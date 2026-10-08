# HWP plugin

[English](README.md)

HWP plugin은 프로젝트의 HWP와 HWPX 문서를 [rhwp](https://github.com/edwardkim/rhwp)의 편집기 rhwp-studio로 열고, files sidecar로 같은 형식으로 저장한다. [docs/studio.ko.md](docs/studio.ko.md)는 package가 rhwp-studio를 담는 방법과 그 갱신을 설명한다. Plugin 형식은 soksak core spec(`docs/spec/plugins.md`)이 정한다.

```sh
make test                                   # test
make studio                                 # ui/studio의 rhwp-studio
make pack OUT=<folder> SOK=<core>/target/debug/sok   # plugin package
```

Checklist는 [docs/features.md](docs/features.md)다.
