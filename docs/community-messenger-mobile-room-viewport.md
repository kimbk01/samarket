# 커뮤니티 메신저 방 — 모바일 뷰포트·스크롤 (정의·비회귀·변경 이력)

**범위:** `/community-messenger/rooms/[roomId]` Phase2 셸 — **iOS Safari/PWA/WebView·Android Chrome/WebView** 에서 키보드·주소창·세이프에리어와 맞물리는 **높이 CSS 변수**와 **메시지 리스트 스크롤 앵커**만 다룬다. (Realtime·읽음·메시지 본문 계약은 `docs/messenger-realtime-policy.md` 등 별도.)

**제품 목표:** 카카오톡/텔레그램과 **픽셀 단위 동일**이 아니라, 사용자가 보기에 **자연스럽고 안정적**인 것. 남는 차이는 **`lib/ui/messenger-chat-viewport-tuning.ts`** 한 곳의 보정값으로만 조정한다.

---

## 1. 수용 기준 (안정성 — 반드시 보장)

1. **입력창:** 키보드 focus 시 **입력창이 키보드 바로 위**에 붙어 보인다 (가림 없음).
2. **타임라인:** 메시지 리스트가 **키보드 뒤로 가려지지 않는다** (셸 높이·스크롤 앵커).
3. **스크롤:** 키보드 open/close 시 **불필요한 점프**가 없다 — 과거 메시지 열람 중에는 위치 유지, 하단 근처면 최신 유지.
4. **키보드 닫힘:** 하단에 **빈 공간이 남지 않는다** (vv·셸 변수·composer 패딩 일관).
5. **검증 플랫폼:** **iOS Safari·PWA**, **Android Chrome·WebView** 각각에서 회귀 확인.
6. **구현 방식:** **`visualViewport` + `safe-area` + 스크롤 앵커**; 기기별 미세 차이는 **tuning 상수**만 변경.

---

## 2. 목표 (회귀 금지 — 구현 세부)

1. **키보드·도크·회전**으로 타임라인 스크롤 영역 높이만 바뀔 때, **과거 메시지를 읽는 중**이면 **화면에 보이던 대화 위치(하단까지의 거리)** 를 유지한다.
2. **하단 근처(stick-to-bottom)** 면 **최신 메시지**가 입력창 바로 위에 오도록 맞춘다.
3. **입력창**은 셸 높이·safe-area·키보드 크롬과 **이중 패딩**되지 않게 한다 (`keyboardOverlapSuppressed` + `useMobileKeyboardInset` 계약).
4. **`window.innerHeight` / `100vh` 단독**으로 셸 높이를 결정하지 않는다 — **`visualViewport`** + 필요 시 **`innerHeight` 차이** + 네이티브 `samarketShell` inset.

---

## 3. 파일·책임 (단일 소스)

| 구성요소 | 파일 | 역할 |
|----------|------|------|
| 기기별 보정값 (픽셀·ms·임계) | `lib/ui/messenger-chat-viewport-tuning.ts` | 셸 최소 높이, stick 임계, composer footer, 키보드 크롬 히스테리시스 등 — **여기만 수정해 미세 튜닝** |
| 루트 viewport 메타 | `app/layout.tsx` `export const viewport` | `interactiveWidget: "resizes-content"` — Android Chrome 키보드 시 레이아웃 뷰포트 축소 |
| 셸 CSS 변수·측정 | `lib/ui/use-chat-viewport-resize.ts` | `--chat-viewport-height`, `--chat-keyboard-height`, `--chat-composer-height`, `--chat-safe-bottom`; vv·shell inset·composer `ResizeObserver`; `scheduleSync`로 vv 폭주 완화 |
| Phase2 셸 마운트 | `components/community-messenger/room/CommunityMessengerRoomPhase2.tsx` | 콜백 ref + `chatShellMounted` — **ref 미부착인 채 훅만 도는 것** 방지; 좁은 화면에서 `height/maxHeight: var(--chat-viewport-height, 100dvh)` |
| 스크롤 앵커 | `lib/community-messenger/room/use-messenger-room-reader-scroll-bottom.ts` | `lastScrollGeomRef` + `stickToBottomRef`; **ResizeObserver** + **visualViewport** + **window resize/orientation** → 동일 `restoreScrollAfterChromeChange` (rAF 합침) |
| 입력 패딩·키보드 크롬 UI | `CommunityMessengerRoomPhase2Composer.tsx`, `useMessengerTradeKeyboardChrome`, `useMobileKeyboardInset` | 셸이 vv 맞출 때 `disableOverlapEstimate` 로 이중 inset 방지 |
| 가상 리스트 | `useMessengerRoomClientPhase1` 내부 `useVirtualizer` | 별도 훅 파일 제거됨 — **훅 순서**는 `useMessengerRoomDerivedMessageLists` → `useVirtualizer` → `useMessengerRoomReaderScrollBottom` 유지 |
| 타임라인 스크롤 박스 | `CommunityMessengerRoomPhase2MessageTimeline.tsx` | `scrollPaddingBottom: var(--chat-composer-height, 0px)` |

---

## 4. 이벤트가 겹쳐 보일 때 (중복이 아님)

- **`useChatViewportResize`**: 셸 **높이·키보드·composer 변수** 갱신.
- **`useMessengerRoomReaderScrollBottom`**: 타임라인 **scrollTop 보존/하단 고정**.
- **`useMessengerTradeKeyboardChrome`**: **거래 도크 UI 밀도** 등 — 셸 높이와 책임 분리.

같은 `visualViewport` / `window` 이벤트를 여러 군데에서 구독하는 것은 **의도적**이며, 각 레이어에서 rAF·단일 스케줄로 **폭주만 막는다.**

---

## 5. 수정 전 체크리스트 (에이전트·인간 공통)

코드 변경 전 위 표의 파일을 열고 다음을 확인한다.

- [ ] `useChatViewportResize` **cleanup**에서 `syncRafId`, **부트 이중 rAF**(`bootRaf1`/`bootRaf2`), 리스너, **CSS 변수 removeProperty** 모두 처리되는가?
- [ ] Phase2에서 **`narrowViewport && chatShellMounted`** 일 때만 뷰포트 훅을 켜는가? (콜백 ref 제거 시 **첫 프레임 미구독** 회귀)
- [ ] 스크롤 훅에서 **RO + vv + window resize/orientation** 중 하나를 빼면 **어느 플랫폼이 깨지는지** 문서 §3 표 또는 코드 주석에 남길 것.
- [ ] `useMessengerRoomClientPhase1` 안 **훅 순서**를 바꾸지 않는가? (`useVirtualizer` ↔ `useMessengerRoomReaderScrollBottom` 순서 깨지면 React invalid hooks)
- [ ] **임시**로 `window.scrollTo` / body 스크롤 의존 / `100vh` 단독 셸 높이를 넣지 않는가?

---

## 6. 알려진 한계

브라우저·WebView·PWA마다 키보드 동작이 달라 **네이티브 앱과 픽셀 동일**은 기대하지 않는다. 네이티브 래퍼는 `lib/platform/samarket-shell-keyboard.ts` 계약으로 inset을 줄 수 있다.

---

## 7. 변경 이력 (여기에만 누적)

| 날짜 | 요약 | 관련 파일/PR |
|------|------|----------------|
| 2026-05-03 | 수용 기준(안정성)·tuning 단일 모듈 `messenger-chat-viewport-tuning.ts`; 셸·스크롤·composer·키보드 크롬 상수 이관 | `messenger-chat-viewport-tuning`, Phase2 composer, `use-chat-viewport-resize`, `use-messenger-room-reader-scroll-bottom`, `use-messenger-trade-keyboard-chrome` |
| 2026-05-03 | 모바일 셸: `useChatViewportResize`, 콜백 ref·`chatShellMounted`, CSS 변수; 스크롤: 하단 거리 보존 + RO/vv/window; vv `scheduleSync`·부트 rAF 취소; Android `interactive-widget` 문서화 | Phase2, `use-chat-viewport-resize`, `use-messenger-room-reader-scroll-bottom`, `use-messenger-room-client-phase1`(인라인 `useVirtualizer`) |
| 2026-05-04 | 방 페이지 외곽 전환: ViewTransition 없이 CSS transform 진입(240ms)·뒤로가기/엣지 제스처 exit(220ms, 30% threshold)만 추가. viewport 높이·스크롤·키보드 훅은 미변경 | `MessengerRoomSwipeBackShell`, `messenger-view-transitions.css`, `messenger-list-room-slide`, Phase2 header |
| 2026-05-05 | read ack 판정을 방 진입 즉시가 아니라 visible/focus/메시지 DOM/하단 근접 조건 이후 350ms dwell 로 통일. 스크롤 위 새 메시지는 unread 유지 | `use-messenger-room-open-mark-read-effect`, `use-messenger-room-client-phase1`, `messenger-realtime-store`, `messenger-room-ui-constants` |
| 2026-05-18 | 배달 주문 chrome: trade 와 동일 `keyboardCompact` (narrow + composer focus / keyboard open) 시 1줄 스트립만 표시. 셸·스크롤 훅 미변경 | `CommunityMessengerRoomPhase2StoreOrderChrome`, `CommunityMessengerRoomPhase2AttachmentsAndTrade` |

**규칙:** 이 영역을 고치면 **반드시 한 줄이라도 §7 변경 이력 테이블에 추가**한다. 되돌리기 전에 이전 행과 diff를 비교한다. 숫자만 바꿀 때는 **`lib/ui/messenger-chat-viewport-tuning.ts`** 만 수정했는지 확인한다.
