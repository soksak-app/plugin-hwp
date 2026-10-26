# View 진단

HWP view는 성능 측정을 위한 opt-in 문서 프레임 observer를 제공한다. Observer 대상은 view 페이지의
`document.documentElement`이며 중첩된 `studio` 문서 영역은 view root가 아니다.

진단 command는 `hwp.diagnostics.frames.start`, `hwp.diagnostics.frames.stop`, `hwp.diagnostics.frames.read`다. Read는 view page의
`window.history.length`에서 `historyEntries`를, 현재 `studio` document-region state의
`region.state.history.entries.length`에서 `regionHistoryEntries`를 반환한다. 두 값은 entry count이며, 복원 여부만 나타내는
`region.history` boolean을 count로 사용하지 않는다. Start는 두 count와 root의 현재 width, height를 읽은 뒤 root의 실제 `background-color` paint를 불투명한
`rgb(25, 211, 162)`로 설정하고 해당 root를 `ResizeObserver`로 관찰한다. 기존 inline value와 priority를 저장하고 stop, dispose,
observer 시작 실패 때 복원한다. 이 paint는 overlay를 더하거나 root geometry를 바꾸지 않는다. 진단 pixel reader는 이 선언된
color로 불투명한 content rectangle을 찾으며 card와 plane에서 color가 구별되지 않는 frame은 거부한다.

전달된 resize observation마다 다음 `requestAnimationFrame` callback 뒤에 측정한 root의 width와 height를 기존 trace log에
기록한다. 각 frame record에는 증가하는 sequence number, document performance time origin,
animation-frame timestamp가 들어간다. HWP 진단 state는 frame record를 보관하지 않으며 trace log가 기록을 맡는다. 이 event는
document의 resize 및 animation-frame 상태를 설명하며, 표시된 content의 증거는 계속 decoded capture pixel이 맡는다.

Stop은 observer를 끊고 대기 중인 animation-frame callback을 취소한다. Read는 관찰 활성 여부, 다음 frame sequence number,
두 history entry count와 root의 현재 크기를 반환한다. 관찰을 시작하거나 Trace record를 보관하지 않는다. 관찰 중 다시 start하면
거부한다. 기록이 없을 때 stop하면 거부한다. 일반 view startup은 observer를 시작하거나 frame record를 보내지 않는다.
