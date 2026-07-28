# Chat Thread Scroll Contract (SSOT)

모든 채팅 표면(Community 메신저·거래·그룹·주문 CM 위임)은 **`lib/chat-thread-scroll/`** 단일 엔진으로 scroll 을 조작한다.

## Stick 임계값

- `CHAT_THREAD_STICK_THRESHOLD_PX = 96` — **사용자가 아직 하단에 붙어 있는지** 판정용 (entry PASS 기준 아님)
- near-bottom 판정: `lib/chat-thread-scroll/near-bottom.ts`
- pin 목표: `scrollTop = max(0, scrollHeight - clientHeight)` (maxScroll). entry 는 at-max 전 settle 금지.
- layout/keyboard resize: lastGeom 이 near-bottom 이면 **force pin** (stick 플래그 단독에 막히지 않음)

## 상태 머신

| Phase | 의미 |
|-------|------|
| `idle` | 초기 |
| `entryPendingLayout` | 진입 — layout·paint 대기, resize keep-bottom 무시 |
| `settled` | **initial anchor once** 완료 — append/layout follow·preserve 만 허용 |

## Public API (hook 경유)

- `notifyEntry({ forceBottom?, restoreSnapshot? })`
- `notifyLayoutCommitted()` — shell/composer RO 후 (entry 미완료 시 tryComplete만)
- `notifyMessagesChanged({ kind: 'append' \| 'prepend', ... })`
- `notifyUserScroll()`
- `notifyPrependInFlight(boolean)`
- `scrollToBottomExplicit()`
- `notifyLayoutResize()` — settled 이후 preserve 또는 keep-bottom (**재 entry 금지**)

## Initial anchor (Telegram / Kakao 계약)

1. room generation 당 **정확히 1회** (`hasAppliedInitialAnchor`)
2. **항상 latest bottom** (`entryForceBottom: true`) — push·목록 탭 동일. persisted scroll restore · unread→lastRead 자동 점프 **금지**
3. `useLayoutEffect` / hook entry 경로에서 paint 전에 적용 — **paint 후 `entry_tail_settle` 금지**
4. composer height / fingerprint / chrome sync 는 initial anchor 를 **재실행하지 않음**
5. paint gate: viewport `clientHeight` + rows/virtualizer — **composer height 게이트 금지**
6. CM 방 스크롤 경유: **`useChatThreadScroll`만** (CM 전용 ScrollAnchorController 폐기 — `docs/cm-room-telegram-kakao-parity-redesign.md`)

## scrollTop 금지

- `components/chats/`, `components/group-chat/`, CM legacy scroll 모듈에서 **직접 scrollTop/scrollToIndex/scrollToOffset 금지**
- 허용: `lib/chat-thread-scroll/**` 만

검증: `npm run verify:chat-thread-scroll-contract` · `npm run verify:cm-room-entry-scroll-contract`

## Layout shell 분리

- viewport shell CSS/훅: height/composer/keyboard 변수만 — **scrollTop 금지**
- keyboard LOCK: `verify:cm-room-keyboard-layout-contract` (별도 계약)
- shell `style.height` 는 viewport **adapter 입력** — scroll authority 가 아님

## CM 위임

- 주문 채팅 `ChatDetailView` → `/community-messenger/rooms/...` redirect — scroll 은 CM `useChatThreadScroll` 경로만 사용
- `roomMessages` 변경은 `applyRoomMessagesMutation({ kind })` 만 — silent merge 금지 (`verify:cm-room-message-mutation-sites`)
- chrome/composer/vv resize → `notifyLayoutResize` / layoutCommitted preserve/follow 만 (**재 entry 금지**)
- 셸 높이: `useCmRoomVisibleViewportShell` (keyboard LOCK) — scrollTop 금지

## 변경 이력

- P3+P4: 4갈래 scroll → `lib/chat-thread-scroll/` 단일 엔진, stick 96px 통일
- P3+P4.1: CM composer paint gate + tail settle 2단계 (legacy)
- **2026-07-28**: paint-then-correct 제거 — initial anchor 1회, composer/fingerprint/tail settle writer 제거
- **2026-07-28**: `notifyLayoutResize` lastGeom 실측 (키보드 stale stick 플래그)
- **2026-07-28**: CM Telegram/Kakao parity redesign — entry always latest bottom; CM scroll = `useChatThreadScroll`; mutation kind bus; persist/unread entry jump 제거 (`docs/cm-room-telegram-kakao-parity-redesign.md`)
