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
| 셸 CSS·플랫폼 insets | `app/chat-viewport-shell.css`, `lib/ui/chat-viewport-shell-platform.ts`, `lib/ui/use-chat-viewport-shell-insets.ts` | `100dvh`+safe-area flex 셸, keyboard overlay(`--chat-shell-keyboard-offset`), composer 높이(`--chat-composer-height`) |
| Phase2 셸 마운트 | `components/community-messenger/room/CommunityMessengerRoomClientPhase2Body.tsx` | `chat-viewport-shell` narrow/embedded/wide, 콜백 ref + `chatShellMounted`, `useChatViewportShellInsets` |
| 스크롤 앵커 | `lib/community-messenger/room/use-messenger-room-reader-scroll-bottom.ts` | `lastScrollGeomRef` + `stickToBottomRef`; **ResizeObserver** + **visualViewport** + **window resize/orientation** → 동일 `restoreScrollAfterChromeChange` (rAF 합침) |
| 입력·키보드 크롬 UI | `CommunityMessengerRoomPhase2Composer.tsx`, `useMessengerTradeKeyboardChrome` | `ChatComposer` flex footer; 거래 도크 compact 등 — composer padding JS inset **금지** |
| 가상 리스트 | `useMessengerRoomClientPhase1` 내부 `useVirtualizer` | **훅 순서**는 `useMessengerRoomDerivedMessageLists` → `useVirtualizer` → `useMessengerRoomReaderScrollBottom` 유지 |
| 타임라인 스크롤 박스 | `CommunityMessengerRoomPhase2MessageTimeline.tsx` | trade dock 만 `scrollPaddingBottom`; composer 겹침 padding **금지** |

---

## 4. 이벤트가 겹쳐 보일 때 (중복이 아님)

- **`useChatViewportShellInsets`**: 셸 **keyboard overlay padding**·**composer 높이 변수** 갱신.
- **`useMessengerRoomReaderScrollBottom`**: 타임라인 **scrollTop 보존/하단 고정**.
- **`useMessengerTradeKeyboardChrome`**: **거래 도크 UI 밀도** 등 — 셸 레이아웃과 책임 분리.

같은 `visualViewport` / `window` 이벤트를 여러 군데에서 구독하는 것은 **의도적**이며, 각 레이어에서 rAF·단일 스케줄로 **폭주만 막는다.**

---

## 5. 수정 전 체크리스트 (에이전트·인간 공통)

코드 변경 전 위 표의 파일을 열고 다음을 확인한다.

- [ ] `useChatViewportShellInsets` **cleanup**에서 rAF 취소·`--chat-shell-keyboard-offset`·`--chat-composer-height` removeProperty·리스너 해제가 있는가?
- [ ] Phase2에서 **`chatShellMounted`** 일 때만 셸 insets 훅을 켜는가? (콜백 ref 미부착 시 첫 프레임 미구독 회귀)
- [ ] 스크롤 훅에서 **RO + vv + window resize/orientation** 중 하나를 빼면 **어느 플랫폼이 깨지는지** 문서 §3 표 또는 코드 주석에 남길 것.
- [ ] `useMessengerRoomClientPhase1` 안 **훅 순서**를 바꾸지 않는가? (`useVirtualizer` ↔ `useMessengerRoomReaderScrollBottom` 순서 깨지면 React invalid hooks)
- [ ] **임시**로 `window.scrollTo` / body 스크롤 의존 / composer `sticky`+이중 safe-area padding 을 넣지 않는가?

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
| 2026-06-18 | 첫 진입 스크롤 SSOT(`messenger-room-entry-scroll-owner`): pass3·entry scroll settle 전 direct 유지, viewport resize·virtual upgrade scroll 중복 억제 | `messenger-room-entry-scroll-owner`, `use-messenger-room-reader-scroll-bottom`, `CommunityMessengerRoomPhase2MessageTimeline` |
| 2026-06-18 | **Core lockdown**: paint seed SSOT(`hasMessengerRoomHydrationTimelineSeed` — lastMessage only 금지), send pipeline 단일 scroll(optimistic만 `own_message_append`, ack/finally 중복 제거), scroll owner 경유 `runMessengerRoomScrollToBottom`, re-entry pass3 시 `reentry_hydration_restored` settle | `messenger-room-timeline-hydration`, `use-messenger-room-phase2-controller`, `messenger-room-scroll-to-bottom`, `messenger-room-messages-auto-scroll`, `CommunityMessengerRoomClientPhase2Body` |
| 2026-06-20 | 통화 내역이 많은 seed 방 진입에서 Pass1→Phase2 composer 교체로 draft/전송이 유실되지 않도록, seed 방은 Phase2 body를 첫 render부터 ready 처리하고 Pass1 draft를 Phase1 message SSOT에 동기화 | `CommunityMessengerRoomPhase2`, `CommunityMessengerRoomPass1ComposerShell`, `messenger-room-timeline-hydration` |
| 2026-06-20 | 일반 메신저/통화 내역 방 진입 시 older history 전체 자동 hydration 금지. 현재 window만 안정화하고 과거 내역은 상단 스크롤에서 로드해 rows 교체·흰 화면·scroll 재앵커 반복을 방지 | `use-messenger-room-eager-older-history-hydration`, `use-messenger-room-load-older-messages-fetch` |
| 2026-06-20 | 특정 방 재진입에서 seed 없이 bootstrap gate 가 막힌 경우 빈 셸로 내리지 않고 blocking retry 까지 로딩 상태 유지. 배달/주문 방도 진입 older history 자동 hydration 을 중지해 첫 화면 rows 교체·마지막 메시지 점프를 방지 | `messenger-room-bootstrap-refresh`, `use-messenger-room-eager-older-history-hydration` |
| 2026-05-20 | 배달 주문: 포커스만으로 chrome 접기 제거(키보드 open 시만 compact). vv 셸에서 composer `sticky`·추가 footer px 제거·`--chat-safe-bottom`만 사용. 오너 주문 패널·구매자 주문 시트 닫힘 시 shadow bleed 제거(`shadow-none`·`invisible`) | `CommunityMessengerRoomPhase2AttachmentsAndTrade`, `CommunityMessengerRoomPhase2Composer`, `StoreOrderSellerOrderPanel`, `StoreOrderBuyerRoomSheet`, `samarket-components.css` |
| 2026-06-08 | 1:1 통화 페이지·전역 수신 오버레이에 통화 전용 `visualViewport` 높이 변수(`--call-viewport-height`) 적용. 방 셸·스크롤·composer 계약은 미변경 | `CallScreenShell`, `CallScreen`, `CommunityMessengerCallClient` |
| 2026-06-08 | 통화 자식 화면·라우트 로딩의 잔여 `min-h-[100dvh]` 의존 제거. 높이 기준은 부모 `CallScreenShell`의 `--call-viewport-height`로 단일화 | `IncomingCallView`, `OutgoingCallView`, `CommunityMessengerCallRouteLoading` |
| 2026-06-11 | 통화 오버레이: `resolveLayoutVisibleViewportCssPx`(방과 동일 vv 공식)·셸 실측 `height` 인라인·z-1280(하단 탭 위)·호스트/수신 벨 BottomNav 선제 suppress — 모바일 하단 흰 띠(앱 배경 비침) 구조 수정 | `layout-visible-viewport-px`, `CallScreenShell`, `CommunityMessengerActiveCallHost`, `CallOverlay` |
| 2026-06-14 | 채팅 헤더·composer 전용 재구성: 셸 `chat-viewport-shell` + safe-area padding + narrow `100dvh`; `useChatViewportResize` 높이 JS 제거(composer 높이 ResizeObserver만); header `sticky`·composer 이중 safe-area/keyboard padding 제거; Android `adjustResize` | `app/chat-viewport-shell.css`, `components/chat/*`, `messenger-header.tsx`, `CommunityMessengerRoomPhase2Composer`, `CommunityMessengerRoomClientPhase2Body`, `AndroidManifest.xml` |
| 2026-06-14 | 기기별 보완: `chat-viewport-shell-platform`·`useChatViewportShellInsets`(overlay 시 셸 `--chat-shell-keyboard-offset`만); embedded 슬라이드 패널 `padding-top:0`; iOS/Android 플랫폼 클래스 | `lib/ui/chat-viewport-shell-platform.ts`, `use-chat-viewport-shell-insets.ts`, `CommunityMessengerRoomClientPhase2Body` |
| 2026-06-14 | 정리: 레거시 `use-chat-viewport-resize.ts` 제거, composer 높이·keyboard insets 단일 훅 통합, ShellChromeFrame `data-cm-room` 고정, keyboard 이중 padding 가드 | `use-chat-viewport-shell-insets.ts`, `CommunityMessengerRoomShellChromeFrame.tsx` |
| 2026-06-15 | 모바일 composer 체감 높이를 52px 기준으로 축소하고, `+` 첨부 메뉴를 dim 없는 80% 중앙 카드로 조정. 셸 safe-area·scroll anchor 계약은 유지 | `messenger-chat-viewport-tuning`, `chat-viewport-shell.css`, `CommunityMessengerRoomPhase2RoomSheets` |

**규칙:** 이 영역을 고치면 **반드시 한 줄이라도 §7 변경 이력 테이블에 추가**한다. 되돌리기 전에 이전 행과 diff를 비교한다. 숫자만 바꿀 때는 **`lib/ui/messenger-chat-viewport-tuning.ts`** 만 수정했는지 확인한다.
