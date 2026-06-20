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
| `settled` | terminal bottom 완료 — append/layout follow 허용 |

## Public API (hook 경유)

- `notifyEntry({ forceBottom?, restoreSnapshot? })`
- `notifyLayoutCommitted()` — shell/composer RO 후
- `notifyMessagesChanged({ kind: 'append' \| 'prepend', ... })`
- `notifyUserScroll()`
- `notifyPrependInFlight(boolean)`
- `scrollToBottomExplicit()`

## scrollTop 금지

- `components/chats/`, `components/group-chat/`, CM legacy scroll 모듈에서 **직접 scrollTop/scrollToIndex/scrollToOffset 금지**
- 허용: `lib/chat-thread-scroll/**` 만

검증: `npm run verify:chat-thread-scroll-contract`

## Layout shell 분리

- viewport shell CSS/훅: height/composer/keyboard 변수만 — **scrollTop 금지**
- keyboard LOCK: `verify:cm-room-keyboard-layout-contract` (별도 계약)

## CM 위임

- 주문 채팅 `ChatDetailView` → `/community-messenger/rooms/...` redirect — scroll 은 CM 엔진 경로만 사용

## 변경 이력

- P3+P4: 4갈래 scroll → `lib/chat-thread-scroll/` 단일 엔진, stick 96px 통일
