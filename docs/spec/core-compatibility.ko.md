# Core compatibility

[English](core-compatibility.md)

HWP package는 `engines.soksak: "^0.0.40"`을 선언한다. 이 범위는 core version-range 규칙에 따라 core release `0.0.40`을 허용하고, 이전 version 및 검증하지 않은 이후 version과의 호환성을 주장하지 않는다. 0.0.40은 `plugin.json`이 선언하는 `exposes.element`를 받는 첫 core release인 F502-13의 core release(F502-13-1)의 version이고, core 0.0.39와 그 이전은 exposes 종류 `status`, `commands`, `dom`만 받으므로 그것을 거부한다. `plugin.json`은 `surface.module` 없는 view composition도 선언하며, core release `0.0.24`부터 이를 받는다.
