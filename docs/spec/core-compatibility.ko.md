# Core compatibility

[English](core-compatibility.md)

HWP package는 `engines.soksak: "^0.0.41"`을 선언한다. 이 범위는 core 0.0.41부터 그 뒤의 모든 0.0 release를 허용한다([version과 범위](https://github.com/soksak-app/core/blob/main/docs/spec/installation.ko.md#version과-범위)). Package가 0.0.41을 요구하는 이유는 시험이 core 0.0.41에서만 검증되었기 때문이다. 시험은 그 release의 view 시험 host를 쓰고, `events.json`은 0.0.41이 view의 각 record에 추가하는 `surface`를 요구한다. `package.json`의 plugin API pin은 core 0.0.41의 release이다. 0.0.40은 `plugin.json`이 선언하는 `exposes.element`를 받는 첫 core release인 F502-13의 core release(F502-13-1)의 version이고, core 0.0.39와 그 이전은 exposes 종류 `status`, `commands`, `dom`만 받으므로 그것을 거부한다. `plugin.json`은 `surface.module` 없는 view composition도 선언하며, core release `0.0.24`부터 이를 받는다.
