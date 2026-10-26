# View 진단

HWP view는 성능 검사를 위한 opt-in 문서 프레임 observation과 studio viewport 측정을 제공한다. Observer 대상은 view 페이지의
`document.documentElement`이며 중첩된 `studio` 문서 영역은 view root가 아니다.

진단 command는 `hwp.diagnostics.frames.start`, `hwp.diagnostics.frames.stop`, `hwp.diagnostics.frames.read`다. Read는 view page의
`window.history.length`에서 `historyEntries`를, 현재 `studio` document-region state의
`region.state.history.entries.length`에서 `regionHistoryEntries`를 반환한다. 두 값은 entry count이며, 복원 여부만 나타내는
`region.history` boolean을 count로 사용하지 않는다. Start는 두 count와 root의 현재 width, height를 읽은 뒤 해당 root를
`ResizeObserver`로 관찰한다. 관찰은 root style을 바꾸지 않는다.

Start는 document region을 통해 실제 `studio` document에 투명 marker도 요청한다. Diagnostic-only studio companion은 해당
document의 `document.documentElement`에 `position: fixed`, `inset: 0`, `box-sizing: border-box`, 2 px
`rgb(255, 0, 255)` border, `pointer-events: none`, 가능한 가장 높은 stacking order를 가진 element 하나를 추가한다.
기존 layout style은 바꾸지 않으며 명시적 start 전에는 marker가 없다. Companion은 삽입 전에 visual viewport scale이 1,
offset이 0, 크기가 `innerWidth`와 `innerHeight`와 같은지 검증하고 document root client dimension도 inner dimension과
같아야 한다. 이어 fixed marker의 실제 rectangle이 viewport와 정확히 같고 root가 별도의 fixed-position containing block을
만들지 않는지 확인한다 (`transform`, `perspective`, `filter`, `contain`은 `none`, `will-change`는 `auto`, `container-type`은
`normal`). 검증이 실패하면 start를 거부하고 삽입한 marker를 제거한다. Start와 active read는 정확한 marker color와 border 폭,
실제 marker rectangle, inner/client dimension, visual viewport 값과 containing-block 값을 담은 `studioViewport`를 반환한다.
Inactive read와 성공한 stop은 `studioViewport: null`을 반환한다. Stop, dispose, pagehide는 삽입한 동일한 marker element를 제거한다.

View는 `type`, `id`, `operation`을 가진 document-region message로 marker request를 보낸다. Native document-message bridge는
이 요청을 studio document에 전달하고 view listener에도 echo한다. 대기 중인 view listener는 정확히 일치하는 request echo를 무시하고
`result` 또는 `error`를 가진 일치하는 응답만 받는다. Studio companion은 `type`, `id`,
`result` 또는 `error`를 가진 응답을 같은 document window에 게시한다. 같은 window의 message event가 listener에 도달하면 이 정확한
응답 형태를 무시해 응답을 새 request로 처리하지 않는다. 지원하지 않는 request에는 명시적인 error 응답을 보낸다.

`rgb(255, 0, 255)` edge pixel은 studio viewport rectangle만 식별한다. 표시된 editor content나 cadence를 증명하지 않는다.
OCR로 확인한 자연 content와 capture frame timestamp는 별도 증거로 유지한다.

전달된 resize observation마다 다음 `requestAnimationFrame` callback 뒤에 측정한 root의 width와 height를 기존 trace log에
기록한다. 각 frame record에는 증가하는 sequence number, document performance time origin,
animation-frame timestamp가 들어간다. HWP 진단 state는 frame record를 보관하지 않으며 trace log가 기록을 맡는다. 이 event는
document의 resize 및 animation-frame 상태를 설명하며, 표시된 content의 증거는 계속 decoded capture pixel이 맡는다.

Stop은 observer를 끊고 대기 중인 animation-frame callback을 취소하며 studio marker를 제거한다. Read는 관찰 활성 여부, 다음
frame sequence number, 두 history entry count, root의 현재 크기와 활성 중인 marker의 live field를 반환한다. 관찰을 시작하거나
trace record를 보관하지 않는다. 관찰 중 다시 start하면 거부한다. 기록이 없을 때 stop하면 거부한다. 일반 view startup은 observer를
시작하거나 marker를 삽입하거나 frame record를 보내지 않는다.
