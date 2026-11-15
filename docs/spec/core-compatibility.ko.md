# Core compatibility

[English](core-compatibility.md)

HWP package는 `engines.soksak: "^0.0.41"`을 선언한다. 이 범위는 core 0.0.41부터 그 뒤의 모든 0.0 release를 허용한다([version과 범위](https://github.com/soksak-app/core/blob/main/docs/spec/installation.ko.md#version과-범위)). Package가 0.0.41을 요구하는 이유는 `events.json`이 0.0.41이 view의 각 record에 추가하는 `surface`를 선언하기 때문이다. Package는 plugin API의 어떤 release도 지명하지 않으며 그에 대한 의존성을 선언하지 않는다. Application이 view의 import map으로 page의 `@soksak/plugin-api`와 그 subpath를 resolve하고, 시험은 같은 specifier를 `test/fixtures/plugin-api/`의 fixture로 resolve한다. 0.0.40은 `plugin.json`이 선언하는 `exposes.element`를 받는 첫 core release인 F502-13의 core release(F502-13-1)의 version이고, core 0.0.39와 그 이전은 exposes 종류 `status`, `commands`, `dom`만 받으므로 그것을 거부한다. `plugin.json`은 `surface.module` 없는 view composition도 선언하며, core release `0.0.24`부터 이를 받는다.
