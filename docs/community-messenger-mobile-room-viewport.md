# 커뮤니티 메신저 방 — 모바일 뷰포트·스크롤 (정의·비회귀·변경 이력)

> **LOCK (P0 · `8a91e387`)** — CM Room Keyboard/Layout 계약 고정.  
> Cursor: `.cursor/rules/cm-room-keyboard-layout-contract-lock.mdc`  
> 검증: `npm run verify:cm-room-keyboard-layout-contract` · `vitest run components/chat/__tests__/chat-chrome-layout-contract.test.ts`

**범위:** `/community-messenger/rooms/[roomId]` Phase2 셸 — **iOS Safari/PWA/WebView·Android Chrome/WebView** 에서 키보드·주소창·세이프에리어와 맞물리는 **flex shell**과 **메시지 리스트 스크롤 앵커**만 다룬다. (Realtime·읽음·메시지 본문 계약은 `docs/messenger-realtime-policy.md` 등 별도.)

**제품 목표:** 카카오톡/텔레그램과 **픽셀 단위 동일**이 아니라, 사용자가 보기에 **자연스럽고 안정적**인 것. **Composer가 헤더 밑으로 올라가면 버그.**

---

## 0. LOCK — Keyboard/Layout SSOT (변경 시 §7 + verify 필수)

### 구조

```txt
CommunityMessengerRoomShell
├ ChatHeader
├ MessageTimeline
├ MessageScrollController
├ ChatComposer
└ useCmRoomKbOffset (iOS only)
```

| 플랫폼 | 허용 |
|--------|------|
| Android | `adjustResize` + `safe-bottom` |
| iOS | `safe-bottom` + `--kb-offset` |

### Flex

- **Shell:** `display:flex; flex-direction:column; min-height:0; overflow:hidden`
- **Header:** `flex-shrink:0`
- **Timeline:** `flex:1; min-height:0; overflow-y:auto`
- **Composer:** `flex-shrink:0` — `fixed`/`sticky` **금지**

### 하단 단일 권한

Composer: `padding-bottom: calc(var(--safe-bottom) + var(--kb-offset, 0px))` **한 곳만**.  
`safe-bottom` × nav gap × keyboard bottom × bottom inset **동시 사용 금지**.

### 절대 재도입 금지

`--chat-viewport-height` · `--chat-bottom-inset` · dedupe · hysteresis · slack · `translateY` keyboard patch · bottom patch · Android vv layout · `keyboardOverlapSuppressed` · `useChatViewportShellInsets` · `chat-viewport-shell-platform` · `useMessengerTradeKeyboardChrome` · 중복 viewport Provider.

### 레드팀

문제 시 **레이어·Provider·transform·if 땜빵 추가 금지** — 기존 구조 안에서 **제거·단순화**.

### 정상 동작 체크

1. 진입 즉시 히스토리 2. 키보드 open → Composer 키보드 위 3. Composer 헤더 밑 = 버그 4. 전송 후 키보드 유지 5. Timeline follow 6. flicker 없음 7. scroll jump 없음 8. close 자연 복귀

---

## 1. 수용 기준 (안정성 — 반드시 보장)

1. **입력창:** 키보드 focus 시 **입력창이 키보드 바로 위**에 붙어 보인다 (가림 없음).
2. **타임라인:** 메시지 리스트가 **키보드 뒤로 가려지지 않는다** (셸 높이·스크롤 앵커).
3. **스크롤:** 키보드 open/close 시 **불필요한 점프**가 없다 — 과거 메시지 열람 중에는 위치 유지, 하단 근처면 최신 유지.
4. **키보드 닫힘:** 하단에 **빈 공간이 남지 않는다** (vv·셸 변수·composer 패딩 일관).
5. **검증 플랫폼:** **iOS Safari·PWA**, **Android Chrome·WebView** 각각에서 회귀 확인.
6. **구현 방식:** **flex column shell** + `safe-area` + 스크롤 앵커; Android는 `adjustResize`·`interactiveWidget: resizes-content`; iOS overlay만 `--kb-offset`.

---

## 2. 목표 (회귀 금지 — flex-only 구현)

1. **키보드·도크·회전**으로 타임라인 스크롤 영역 높이만 바뀔 때, **과거 메시지를 읽는 중**이면 **화면에 보이던 대화 위치(하단까지의 거리)** 를 유지한다.
2. **하단 근처(stick-to-bottom)** 면 **최신 메시지**가 입력창 바로 위에 오도록 맞춘다.
3. **입력창**은 flex footer — `fixed`/`sticky`/JS keyboard padding **금지**. safe-bottom은 `.cm-room-composer` 한 곳만.
4. **셸 높이**는 부모 flex chain(`height:100%`, `min-h-0`) — **`--chat-viewport-height`·vv nav gap dedupe·`--chat-bottom-inset` 금지**.
5. **Android:** `adjustResize` + flex column — JS keyboard layout 개입 **금지**.
6. **iOS overlay WebView:** `--kb-offset` 단일 변수만 (`use-cm-room-kb-offset.ts`).

### DOM 계약

```txt
[data-cm-room].cm-room-shell  (padding-top: --safe-top)
├─ header (flex-shrink-0)
├─ .cm-room-timeline (flex-1 min-h-0 overflow-y-auto)
├─ trade/delivery attachments (flex-shrink-0)
└─ .cm-room-composer (flex-shrink-0; padding-bottom: calc(--safe-bottom + --kb-offset))
```

---

## 3. 파일·책임 (단일 소스)

| 구성요소 | 파일 | 역할 |
|----------|------|------|
| 기기별 보정값 (픽셀·ms·임계) | `lib/ui/messenger-chat-viewport-tuning.ts` | stick 임계, delivery composer UI, iOS `--kb-offset` 최소 px — **keyboard slack/hysteresis 금지** |
| 루트 viewport 메타 | `app/layout.tsx` `export const viewport` | `interactiveWidget: "resizes-content"` — Android Chrome 키보드 시 레이아웃 뷰포트 축소 |
| 셸 CSS | `app/chat-viewport-shell.css` | `cm-room-shell` / `cm-room-timeline` / `cm-room-composer` flex-only |
| iOS keyboard offset | `lib/ui/use-cm-room-kb-offset.ts` | overlay WebView만 `--kb-offset`; Android no-op |
| Phase2 셸 마운트 | `CommunityMessengerRoomClientPhase2Body.tsx` | flex shell; timeline 항상 mount (hydration pass로 hidden 금지) |
| 스크롤 앵커 | `use-messenger-room-reader-scroll-bottom.ts` | scrollTop 보존/하단 고정 — layout shell과 **분리** |
| 거래 도크 UI | `CommunityMessengerRoomPhase2AttachmentsAndTrade` | narrow + composerFocused → `keyboardCompact` — vv/layout 구독 **금지** |
| 가상 리스트 | `useMessengerRoomClientPhase1` | **훅 순서** `useVirtualizer` → `useMessengerRoomReaderScrollBottom` 유지 |
| 타임라인 스크롤 박스 | `CommunityMessengerRoomPhase2MessageTimeline.tsx` | `.chat-timeline-scroll`; trade dock만 `scrollPaddingBottom` |

---

## 4. 레이어 분리

- **`useCmRoomKbOffset`**: iOS `--kb-offset` only.
- **`useMessengerRoomReaderScrollBottom`**: 타임라인 scrollTop 보존/하단 고정 (RO + window; iOS만 vv).
- **거래 도크 compact**: `composerFocused` + narrow viewport — 별도 keyboard chrome hook 없음.
- **`MessengerRoomPhase2ViewProvider`**: Timeline·Sheets용 — **`room` 전체 dep 금지**; `message` 타이핑은 Composer slice context만 갱신.

---

## 5. 수정 전 체크리스트 (에이전트·인간 공통)

- [ ] `--chat-viewport-height` / `--chat-bottom-inset` / `useChatViewportShellInsets` / nav gap dedupe 를 **다시 도입하지 않았는가?**
- [ ] composer에 `fixed`/`sticky`/이중 safe-bottom padding 이 **없는가?**
- [ ] timeline wrapper가 hydration pass로 `hidden`/`display:none` 되지 **않는가?** (virtual row cap은 OK)
- [ ] `useMessengerRoomClientPhase1` **훅 순서**를 바꾸지 않았는가?
- [ ] 스크롤 보정을 **폴링·임시 `window.scrollTo`만**으로 대체하지 않았는가?
- [ ] Android scroll/layout path에 **`visualViewport` listener** 를 붙이지 않았는가?
- [ ] **`npm run verify:cm-room-keyboard-layout-contract`** PASS 했는가?

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
| 2026-06-20 | 방 재진입·메시지 merge 중 tail id 가 그대로인 내 메시지를 새 append 로 오판해 하단 스크롤을 반복하지 않도록 auto-scroll 판정 수정. 실제 새 내 메시지 tail append 는 기존처럼 하단 고정 | `messenger-room-messages-auto-scroll`, `messenger-room-regression-matrix.test` |
| 2026-05-20 | 배달 주문: 포커스만으로 chrome 접기 제거(키보드 open 시만 compact). vv 셸에서 composer `sticky`·추가 footer px 제거·`--chat-safe-bottom`만 사용. 오너 주문 패널·구매자 주문 시트 닫힘 시 shadow bleed 제거(`shadow-none`·`invisible`) | `CommunityMessengerRoomPhase2AttachmentsAndTrade`, `CommunityMessengerRoomPhase2Composer`, `StoreOrderSellerOrderPanel`, `StoreOrderBuyerRoomSheet`, `samarket-components.css` |
| 2026-06-08 | 1:1 통화 페이지·전역 수신 오버레이에 통화 전용 `visualViewport` 높이 변수(`--call-viewport-height`) 적용. 방 셸·스크롤·composer 계약은 미변경 | `CallScreenShell`, `CallScreen`, `CommunityMessengerCallClient` |
| 2026-06-08 | 통화 자식 화면·라우트 로딩의 잔여 `min-h-[100dvh]` 의존 제거. 높이 기준은 부모 `CallScreenShell`의 `--call-viewport-height`로 단일화 | `IncomingCallView`, `OutgoingCallView`, `CommunityMessengerCallRouteLoading` |
| 2026-06-11 | 통화 오버레이: `resolveLayoutVisibleViewportCssPx`(방과 동일 vv 공식)·셸 실측 `height` 인라인·z-1280(하단 탭 위)·호스트/수신 벨 BottomNav 선제 suppress — 모바일 하단 흰 띠(앱 배경 비침) 구조 수정 | `layout-visible-viewport-px`, `CallScreenShell`, `CommunityMessengerActiveCallHost`, `CallOverlay` |
| 2026-06-14 | 채팅 헤더·composer 전용 재구성: 셸 `chat-viewport-shell` + safe-area padding + narrow `100dvh`; `useChatViewportResize` 높이 JS 제거(composer 높이 ResizeObserver만); header `sticky`·composer 이중 safe-area/keyboard padding 제거; Android `adjustResize` | `app/chat-viewport-shell.css`, `components/chat/*`, `messenger-header.tsx`, `CommunityMessengerRoomPhase2Composer`, `CommunityMessengerRoomClientPhase2Body`, `AndroidManifest.xml` |
| 2026-06-14 | 기기별 보완: `chat-viewport-shell-platform`·`useChatViewportShellInsets`(overlay 시 셸 `--chat-shell-keyboard-offset`만); embedded 슬라이드 패널 `padding-top:0`; iOS/Android 플랫폼 클래스 | `lib/ui/chat-viewport-shell-platform.ts`, `use-chat-viewport-shell-insets.ts`, `CommunityMessengerRoomClientPhase2Body` |
| 2026-06-14 | 정리: 레거시 `use-chat-viewport-resize.ts` 제거, composer 높이·keyboard insets 단일 훅 통합, ShellChromeFrame `data-cm-room` 고정, keyboard 이중 padding 가드 | `use-chat-viewport-shell-insets.ts`, `CommunityMessengerRoomShellChromeFrame.tsx` |
| 2026-06-20 | **Keyboard P0** — `--chat-bottom-active`(keyboard OR `--safe-bottom`), closed vv nav gap 제거, shell height에서 native keyboard 차감 제거; vv 이미 keyboard 반영 시 padding dedupe | `chat-viewport-shell-platform.ts`, `use-chat-viewport-shell-insets.ts`, `layout-visible-viewport-px.ts`, `chat-viewport-shell.css` |
| 2026-06-20 | **Keyboard P0.1** — `--chat-viewport-height` 를 `:root` + `sam-chat-viewport-height-active` 로 app shell~segment 체인에 전파; tablet keyboard open composer-키보드 gap 제거 | `chat-viewport-height-sync.ts`, `use-chat-viewport-shell-insets.ts`, `chat-viewport-shell.css` |
| 2026-06-20 | **Keyboard hotfix** — P0 `--chat-bottom-active` dedupe·height-only 계약 롤백, de465d9d `calc(--safe-bottom + --chat-bottom-inset)`·native height 차감 복원; P0.1 shell chain 유지 | `chat-viewport-shell-platform.ts`, `use-chat-viewport-shell-insets.ts`, `layout-visible-viewport-px.ts`, `chat-viewport-shell.css` |
| 2026-06-20 | **Keyboard revert P0.1** — `sam-chat-viewport-height-active`·`:root` height chain 제거, shell-only `--chat-viewport-height` 복원 (키보드 open composer 헤더 밑 고정 회귀) | `chat-viewport-shell.css`, `use-chat-viewport-shell-insets.ts`, `chat-viewport-height-sync.ts` 삭제 |
| 2026-06-20 | **Safe Area × keyboard dedupe** — `--safe-bottom` bridge 시 vv nav gap 0; layout height가 keyboard 흡수 시 padding inset 0 (adjustResize·overlay 이중 차감 방지). P0.1 root chain 금지 유지 | `chat-viewport-shell-platform.ts`, `use-chat-viewport-shell-insets.ts` |
| 2026-06-15 | 모바일 composer 체감 높이를 52px 기준으로 축소하고, `+` 첨부 메뉴를 dim 없는 80% 중앙 카드로 조정. 셸 safe-area·scroll anchor 계약은 유지 | `messenger-chat-viewport-tuning`, `chat-viewport-shell.css`, `CommunityMessengerRoomPhase2RoomSheets` |
| 2026-06-20 | **Flex-only P0** — `--chat-viewport-height`/`--chat-bottom-inset`/vv dedupe 제거; `cm-room-shell` flex column; Android adjustResize only; iOS `--kb-offset` via `use-cm-room-kb-offset`; timeline hydration hidden 제거; `keyboardOverlapSuppressed` 삭제 | `chat-viewport-shell.css`, `use-cm-room-kb-offset.ts`, `CommunityMessengerRoomClientPhase2Body`, 삭제: `use-chat-viewport-shell-insets`, `chat-viewport-shell-platform` |
| 2026-06-20 | **Legacy removal** — `MessengerRoomMobileViewportProvider`·`useMessengerTradeKeyboardChrome` 삭제; keyboard hysteresis/slack 상수 제거; scroll anchor `visualViewport` iOS only; trade dock compact = composer focus only; `room.message` view deps 제거 | 삭제: `messenger-room-mobile-viewport-context`, `use-messenger-trade-keyboard-chrome`; `messenger-chat-viewport-tuning`, `CommunityMessengerRoomClientPhase2Body`, `messenger-room-scroll-anchor-controller`, `ChatDetailView` |
| 2026-06-20 | **Render boundary** — `MessengerRoomPhase2ViewProvider` whole-`room` dep 제거(타이핑→Timeline invalidate 차단); Header/Composer/Call slice context 유지; dead `_view_destructure_block.txt` 삭제 | `CommunityMessengerRoomClientPhase2Body`, `chat-detail-bottom-nav-authority.mdc` |
| 2026-06-20 | **LOCK** — Keyboard/Layout 계약 고정(P0 `8a91e387`); `verify:cm-room-keyboard-layout-contract` · `cm-room-keyboard-layout-contract-lock.mdc` | `docs/community-messenger-mobile-room-viewport.md`, `scripts/verify-cm-room-keyboard-layout-contract.mjs` |
| 2026-06-20 | **Tail anchor** — timeline 단일 scroll(`cm-room-timeline overflow:hidden`); `--chat-composer-height`·scroll-padding-bottom; near-bottom 96px; peer append gate; keyboard/composer resize 2×rAF keep-bottom | `messenger-room-scroll-anchor-controller`, `use-cm-room-composer-height`, `chat-viewport-shell.css` |
| 2026-06-20 | **Push entry tail** — push/deeplink/OS 알림 진입 시 persisted scroll restore 금지·latest bottom 고정; composer RO 후 `push_entry_tail_settle`/`entry_tail_settle` 2-phase 보정; trade `/chats/` push force bottom | `messenger-room-entry-intent`, `cm-room-push-entry-warm`, `PushRouteListener`, `messenger-room-scroll-anchor-controller`, `use-cm-room-composer-height`, `ChatDetailView` |
| 2026-06-20 | **Entry paint readiness** — lastMessage-only hint는 paint 금지·initial load 전 skeleton 고정·empty는 complete 후; entry scroll은 viewport/row/composer ready gate; timeline scroll min-height 1px | `messenger-room-timeline-hydration`, `messenger-room-entry-scroll-ready`, `messenger-room-scroll-anchor-controller`, `chat-viewport-shell.css` |
| 2026-06-20 | **Order/delivery/group entry tail** — 주문·배달 CM 방: defer entry scroll → store-order dock force bottom; 그룹 채팅: bootstrap 후 thread scroll tail | `use-messenger-room-store-order-dock-scroll-anchor`, `messenger-room-scroll-to-bottom`, `GroupChatRoomClient`, `chat-thread-entry-scroll` |
| 2026-06-20 | **Entry bootstrap authority** — incomplete lastMessage-only seed authoritative 금지; BootstrapGate complete/confirmed-empty 전 RoomClient 미마운트 | `messenger-room-initial-snapshot-authority`, `CommunityMessengerRoomBootstrapGate`, `fetch-community-messenger-room-bootstrap-client`, `use-messenger-room-local-indexed-db-snapshot` |
| 2026-06-20 | **Telegram/Kakao IME viewport** — `visualViewport.height` SSOT; keyboard open 시 safe-bottom/nav gap(48px) 제거; timeline=`visible−chrome`; vv keep-bottom Android 포함 | `cm-room-visible-viewport-contract`, `use-cm-room-visible-viewport-shell`, `chat-viewport-shell.css`, `messenger-room-scroll-anchor-controller`, `CommunityMessengerRoomClientPhase2Body` |
| 2026-06-20 | **P3+P4 scroll SSOT** — CM·거래·그룹·주문 CM 위임 → `lib/chat-thread-scroll/` 단일 엔진; stick 96px; legacy scroll 모듈 삭제; `verify:chat-thread-scroll-contract` | `lib/chat-thread-scroll`, `messenger-room-scroll-anchor-controller`, `ChatDetailView`, `GroupChatRoomClient`, `docs/chat-thread-scroll-contract.md` |
| 2026-07-27 | **iOS vv-band + no focus scroll** — Android 경로 유지; iOS offsetTop>0 시 shell top pin; open padding=0; iOS scrollIntoView skip; probe 모듈 | `cm-room-visible-viewport-contract`, `use-cm-room-visible-viewport-shell`, `cm-room-kb-viewport-probe`, Phase2Composer |
| 2026-07-27 | **Telegram parity** — iOS keyboard open 시 `.messenger-page`를 vv band(top+height)로 pin; document overflow lock; WK input accessory(^/v/✓) 네이티브 숨김; Android 변경 0 | `use-cm-room-visible-viewport-shell`, `cm-room-visible-viewport-contract`, `DibayWebViewKeyboardChrome.swift` |

| 2026-07-28 | **Initial anchor SSOT** — paint-then-correct 제거: composer/fingerprint/`entry_tail_settle` 이중 scroll 금지; initial anchor room generation 1회(useLayoutEffect); unread+lastRead entry plan; after-rows rAF loop 제거; resize/vv/chrome → `notifyLayoutResize` preserve만 | `messenger-room-scroll-anchor-controller`, `messenger-room-entry-scroll-ready`, `messenger-room-entry-intent`, `messenger-timeline-layout-mode`, `docs/chat-thread-scroll-contract.md` |
| 2026-07-28 | **Restore 0841/May keep-bottom** — `6ba01bce2`에서 빠진 prev-near→pin 복원; height-only 가짜 scroll 무시; layout preserve의 entry-anchor 게이트 해제 | `engine.ts`, `messenger-room-scroll-anchor-controller.ts` |

**규칙:** 이 영역을 고치면 **반드시 한 줄이라도 §7 변경 이력 테이블에 추가**한다. 되돌리기 전에 이전 행과 diff를 비교한다. 숫자만 바꿀 때는 **`lib/ui/messenger-chat-viewport-tuning.ts`** 만 수정했는지 확인한다.
