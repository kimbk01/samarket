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
2. 우선순위: push latest → unread+**firstUnread**(lastRead 다음) → latest bottom *(persist restore on default re-entry: removed 2026-07-28)*
3. `useLayoutEffect`에서 paint 전에 적용 — **paint 후 `entry_tail_settle` 금지**
4. composer height / fingerprint / chrome sync 는 initial anchor 를 **재실행하지 않음**
5. paint gate: viewport `clientHeight` + rows/virtualizer — **composer height 게이트 금지**
6. Jump-latest FAB: 우하단 ↓ · 뱃지=viewport 아래 unread · 탭=`scrollMessengerToBottom` only · 새 scroll writer 금지

## scrollTop 금지

- `components/chats/`, `components/group-chat/`, CM legacy scroll 모듈에서 **직접 scrollTop/scrollToIndex/scrollToOffset 금지**
- 허용: `lib/chat-thread-scroll/**` 만

검증: `npm run verify:chat-thread-scroll-contract` · `npm run verify:cm-room-entry-scroll-contract`

## Layout shell 분리

- viewport shell CSS/훅: height/composer/keyboard 변수만 — **scrollTop 금지**
- keyboard LOCK: `verify:cm-room-keyboard-layout-contract` (별도 계약)
- shell `style.height` 는 viewport **adapter 입력** — scroll authority 가 아님

## CM 위임

- 주문 채팅 `ChatDetailView` → `/community-messenger/rooms/...` redirect — scroll 은 CM 엔진 경로만 사용
- CM controller: `resolveMessengerRoomEntryScrollPaintReady` (composer 비게이트)
- chrome/composer/vv resize → `notifyLayoutResize` preserve/follow 만

## 변경 이력

- P3+P4: 4갈래 scroll → `lib/chat-thread-scroll/` 단일 엔진, stick 96px 통일
- P3+P4.1: CM composer paint gate + tail settle 2단계 (legacy)
- **2026-07-28**: paint-then-correct 제거 — initial anchor 1회, composer/fingerprint/tail settle writer 제거, last-read/unread entry plan
- **2026-07-28**: `notifyLayoutResize`의 "하단에 있었는가" 판단을 `state.stickToBottom`(스크롤 이벤트로만 갱신되는 플래그) 단독 의존에서, resize 직전 캡처된 `lastGeom` 기준 실측 재확인으로 변경 — 키보드 open 시 과도기적 scroll 이벤트로 플래그가 잘못 뒤집혀도 실제 위치로 다시 판단. `prependInFlight` 중에도 geometry는 계속 갱신(스크롤은 여전히 손대지 않음). 실기기(Xiaomi) 재현: 키보드 open 시 scrollTop 미보정으로 마지막 말풍선이 최대 297px 가려지던 것의 구조적 원인 대응 — 실기기 재검증 전까지 미확정
- **2026-07-28**: 방 진입 직후 "최신 메시지가 잠깐 맞게 보였다가 예전 스크롤 위치로 튕기는" 현상 — 영상 실측으로 재현 확인(GROUP QA 방). 원인: `use-messenger-room-client-phase1.ts`가 `initialServerSnapshot` prop 변경(BootstrapGate cache-hit 이후 background refresh로 전체 스냅샷 도착) 때마다 `mergeRoomMessages`로 과거 메시지를 상단에 병합하는데, 이게 pagination(`loadOlderMessages`)이 아니라서 `notifyPrependComplete` 앵커 보존 경로를 안 타고 scrollTop 보정 없이 DOM만 커짐. scroll-anchor-controller에 top(head) message id 변화를 append와 별개로 감지하는 effect 추가 — `hasAppliedInitialAnchorRef` 적용 후 + `loadingOlderMessages`/`prependInFlight` 아닐 때만 `engine.notifyLayoutResize` 재호출로 재정렬. `.scrollTop =` 직접 조작 없음(엔진 경유). 실기기 재검증 전까지 미확정
- **2026-07-28**: Enter = sole policy (latest / first-unread). Persist restore on default re-entry removed. Keyboard/chrome use `correctLayoutPreserve` — stick not re-judged from lastGeom; settle-fail no-write path closed when stick already set. Dock no longer re-syncs stick from viewport. `reentry_hydration_restored` must not mark entry scroll settled.
- **2026-07-28**: Telegram unread UX — entry anchor = first unread after lastRead; unread divider once; bottom-right ↓ FAB badge = unread remaining below viewport; tap uses existing `scrollMessengerToBottom` only.
