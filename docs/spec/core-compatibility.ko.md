# Core compatibility

[English](core-compatibility.md)

HWP package는 core release `0.0.24`의 view manifest contract를 사용한다. `plugin.json`은 `surface.module` 없는 view composition을 선언하며, 공개 core `v0.0.20` reader는 이를 거부한다. 따라서 `package.json`은 core `0.0.24`을 허용하고 이전 version 및 아직 검증하지 않은 이후 버전과의 호환성을 주장하지 않는 `engines.soksak: "^0.0.24"`을 선언한다. 이 contract를 포함하는 core release가 게시될 때까지 package release는 [HWP 호환성 상태](../features.ko.md)를 기준으로 gate에 둔다.
