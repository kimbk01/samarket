# Chat Thread Scroll Contract (SSOT)

모든 채팅 표면(Community 메신저·거래·그룹·주문 CM 위임)은 **`lib/chat-thread-scroll/`** 단일 엔진으로 scroll 을 조작한다.

Unread 제품 계약은 `docs/dibay-messenger-final-stabilization-contract.md`를 따른다.
아래와 충돌하는 과거 `entryUnreadCount` Authority / always-latest FAB 문구는
`SUPERSEDED`다.

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
2. 우선순위: push latest → **뒤로 돌아옴 = 보던 메시지 + 화면 안 위치**(D4 2026-11-09) → unread+**firstUnread**(lastRead 다음) → latest bottom *(목록에서 누른 재진입의 persist restore 는 계속 없음 — 2026-07-28)*
3. `useLayoutEffect`에서 paint 전에 적용 — **paint 후 `entry_tail_settle` 금지**
4. composer height / fingerprint / chrome sync 는 initial anchor 를 **재실행하지 않음**
5. paint gate: viewport `clientHeight` + rows/virtualizer — **composer height 게이트 금지**
6. 우하단 ↓: unread가 남으면 **first/next unread**로 이동하고, unread가 없을 때만 latest로 이동한다.

## Unread cursor / Divider / Arrow

- Authority는 서버 participant read cursor와 canonical timeline ordering이다.
- `entryUnreadCount`는 진입 애니메이션/초기 렌더 보조 상태일 수 있으나 숫자
  Authority가 아니다.
- 남은 unread 수는 canonical cursor 이후의 unread-eligible rows와 실제 visible
  range에서 파생한다.
- 실제 노출 범위까지만 cursor를 단조 증가시킨다. 단순 scroll event만으로 read
  commit하지 않는다.
- 새 메시지가 동시에 도착하면 visible range 밖의 row를 read 처리하지 않는다.
- Divider는 현재 read boundary 의미를 유지하고, 모두 읽으면 제거한다.
- 재진입 시 서버 cursor로 first unread와 Divider를 다시 계산한다.
- unread로 인정된 `call_stub`는 text/image 등과 동일하게 first-unread와 Divider
  후보에 포함한다.
- 모든 scroll write는 계속 `lib/chat-thread-scroll/**` 엔진을 경유한다. unread
  기능을 이유로 별도 `scrollTop` writer를 만들지 않는다.

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
- **2026-07-28**: FAB badge authority → `entryUnreadCount` snapshot (survives list optimistic clear). Clear on latest / FAB tap. Keyboard/shell/engine unchanged.
- **2026-11-09 D4 (Owner 「D4 진행」)**: 방 → 링크·상세 → 뒤로 오면 방이 맨 아래로 열리던 결함(Android 앱·운영 브라우저 실측: 스크롤 960/2400 → 2400). 원인: ① 방은 위치를 저장(`saveMessengerRoomScrollPosition`)하지만 진입 정책이 읽지 않고 지움 ② 앱 전체 규칙 P1(`lib/navigation/app-scroll-memory.ts`, 상세에서 뒤로 → 이전 위치)은 방을 「자체 계약」이라 제외해 방문 순서에도 없음 — 두 계약이 서로 복원한다고 가정 ③ 돌아오면 위로 불러온 지난 메시지가 사라져 보던 메시지가 없음(88줄 → 39줄). 수정: 방 경로는 앱 방문 순서에 **기록만**(`isAppScrollVisitTrackedPath`), 방 첫 그림 때 1번 판정(`decideMessengerRoomReturnEntry` — 기록 전이면 같은 규칙으로 미리 판정 `peekAppScrollVisit`, 주소가 아직 방이 아니면 새 진입). 돌아옴이면 ① 나갈 때 보관한 메시지(`saveMessengerRoomReturnHistory`, 방 3개·1,000개·30분, 네트워크 없음)를 첫 메시지 목록에 합치고 ② 진입 정책 `returnRestore` → `room_entry_restore` + 보던 메시지 줄 + 화면 안 위치(`anchorOffsetPx`). 보던 메시지가 그려진 목록에 없으면 기존 정책. 위치 보관 60초 → 30분(앱 규칙과 동일). 떼어진 화면 값(보던 메시지 없음)은 직전 위치를 덮지 않음. 알림 진입(push)·목록 누름은 그대로 최신/첫 안 읽음. 나가 있는 동안 온 새 메시지는 기존 「아래 새 메시지」 칩.
- **2026-08-04 Phase 4:** `entryUnreadCount` FAB Authority와 진입 즉시 전체
  mark-read 제거. 실제 visible row까지만 cursor를 전진하고 remaining unread를
  canonical ordering에서 파생한다. FAB는 unread가 남으면 next unread, 없으면
  latest로 이동하며 `call_stub`도 동일 후보에 포함한다.
