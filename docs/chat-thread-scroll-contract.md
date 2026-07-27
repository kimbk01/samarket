# Chat Thread Scroll Contract (SSOT)

모든 채팅 표면(Community 메신저·거래·그룹·주문 CM 위임)은 **`lib/chat-thread-scroll/`** 단일 엔진으로 scroll 을 조작한다.

## Stick 임계값

- `CHAT_THREAD_STICK_THRESHOLD_PX = 96` — 전 표면 통일
- near-bottom 판정: `lib/chat-thread-scroll/near-bottom.ts`

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
2. 우선순위: push latest → persisted visible → unread+lastRead → latest bottom
3. `useLayoutEffect`에서 paint 전에 적용 — **paint 후 `entry_tail_settle` 금지**
4. composer height / fingerprint / chrome sync 는 initial anchor 를 **재실행하지 않음**
5. paint gate: viewport `clientHeight` + rows/virtualizer — **composer height 게이트 금지**

## scrollTop 금지

- `components/chats/`, `components/group-chat/`, CM legacy scroll 모듈에서 **직접 scrollTop/scrollToIndex/scrollToOffset 금지**
- 허용: `lib/chat-thread-scroll/**` 만

검증: `npm run verify:chat-thread-scroll-contract` · `npm run verify:cm-room-entry-scroll-contract`

## Layout shell 분리

- viewport shell CSS/훅: height/composer/keyboard 변수만 — **scrollTop 금지**
- keyboard LOCK: `verify:cm-room-keyboard-layout-contract` (별도 계약)
- shell `style.height` 는 viewport **adapter 입력** — scroll authority 가 아님
- layout/keyboard resize: controller `applyLayoutPreserve` → `engine.syncStickToBottom` → `notifyLayoutResize` **한 transaction**
  - stick → pin bottom (force)
  - !stick → visible message id+offset preserve
- Timeline ref attach 시 `flushInitialEntryAnchor` 동기 1회 (setState mount cross-commit paint 금지)

## CM 위임

- 주문 채팅 `ChatDetailView` → `/community-messenger/rooms/...` redirect — scroll 은 CM 엔진 경로만 사용
- CM controller: `resolveMessengerRoomEntryScrollPaintReady` (composer 비게이트)
- chrome/composer/vv resize → `notifyLayoutResize` preserve/follow 만

## 변경 이력

- P3+P4: 4갈래 scroll → `lib/chat-thread-scroll/` 단일 엔진, stick 96px 통일
- P3+P4.1: CM composer paint gate + tail settle 2단계 (legacy)
- **2026-07-28**: paint-then-correct 제거 — initial anchor 1회, composer/fingerprint/tail settle writer 제거, last-read/unread entry plan
- **2026-07-28**: **Unified viewport/scroll** — entry sync flush + layout-resize stick pin/visible-anchor preserve; stickRef↔engine sync; keyboard/entry 단일 authority (revert 사이클 중단)
