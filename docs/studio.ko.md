# Package 안의 rhwp-studio

[English](studio.md)

hwp plugin은 [rhwp](https://github.com/edwardkim/rhwp)의 편집기 `rhwp-studio`로 문서를 편집한다. Package는 `rhwp-studio`가 빌드한 그대로의 편집기를 담고, plugin은 그 source를 고치지 않는다.

## 빌드

`make studio`는 `scripts/build-studio.mjs`를 실행하고, 이 script는 빌드한 편집기를 `ui/studio/`에 쓴다. Git은 그 폴더를 무시하고, `make pack`과 release workflow는 plugin을 pack하기 전에 그것을 빌드한다.

Script는:

1. rhwp tag `TAG`의 `rhwp-studio`(`e2e`와 `tests` 폴더 제외), `assets/fonts`, `LICENSE`, `THIRD_PARTY_LICENSES.md`를 `node_modules/.cache/rhwp-<tag>`에 checkout하고, commit이 `COMMIT`과 다르면 거부한다.
2. 버전이 tag와 같아야 하는 devDependency `@rhwp/core`의 WebAssembly package를 `rhwp-studio` 빌드가 import하는 `pkg` 폴더로 복사한다.
3. `rhwp-studio`의 의존성을 lockfile로 `npm ci` 설치한다.
4. HWP control plugin 없이 빌드하는 `rhwp-studio`의 빌드 script `npm run build:no-hwpctrl -- --base ./`를 상대 asset 경로로 `ui/studio/`에 실행한다.
5. rhwp의 `LICENSE`와 `THIRD_PARTY_LICENSES.md`를 `ui/studio/`에 복사한다.

이후 빌드는 checkout과 그 의존성을 다시 쓴다.

## 이후 rhwp tag로 갱신

1. `scripts/build-studio.mjs`의 `TAG`와 `COMMIT`을 새 tag와 그 tag의 commit으로, `package.json`의 `@rhwp/core` 정확한 버전을 같은 버전으로 정한다.
2. `pnpm install`과 `make studio`, 그다음 `make test`를 실행한다.
3. 새 tag의 embed protocol(`rhwp-studio/src/embed/`)과 `window.rhwpStudio.automation`의 context를 읽고, `ui/`의 파일이 쓰는 요청과 필드가 바뀌었는지 확인한다.
