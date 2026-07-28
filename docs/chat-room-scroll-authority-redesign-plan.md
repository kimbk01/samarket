# 채팅방 스크롤/진입 단일 권한 재설계 계획 (v2 — 내 계획 + 커서 계획 병합)

작성일: 2026-07-28
대상: `/community-messenger/rooms/[roomId]` — 1:1 · 그룹 · 거래 · 주문 4개 도메인 공통

## 0. 결론 한 줄

오늘처럼 "터진 경로 하나씩 패치"를 반복하면 또 터진다. **엔진이 없어서가 아니라, CM이 엔진 옆에 정책·데이터 경로를 너무 많이 얹어 둔 게 문제다.** 레거시(`/chats` · `useChatThreadScroll`)처럼 "메시지 변화 → 엔진 1곳만"으로 CM을 얇게 수렴시키고, 그 다음에 남은 우회 지점을 전수 정리한다.

*(v1과 달라진 점: v1은 "우회 지점을 다 찾아서 가드레일로 막자"는 방어적 접근이었다. 커서 계획을 검토한 뒤, 더 근본적인 문제 — CM 쪽 훅이 레거시보다 정책을 너무 많이 떠안고 있다는 것 — 을 반영해 "CM을 레거시 훅 수준으로 얇게 만든다"는 목표를 앞에 추가했다.)*

## 1. 왜 5~6번 고쳐도 반복되는가

| 레이어 | 역할 | 현실 |
|---|---|---|
| `ChatThreadScrollEngine` | scrollTop 유일 조작 | 있음, 설계 자체는 문제 없음 |
| `useChatThreadScroll` (레거시 `/chats`) | entry/append/prepend/resize를 엔진에만 연결 | **얇음** — entry는 기본 force-bottom |
| CM `ScrollAnchorController` + `phase1` | persist 복원, unread/lastRead 우선순위, hydration, virtualizer, snapshot merge 등 | **두껍다** — roomMessages 갱신 중 append/prepend로 분류 안 된 경로가 남는다 |

오늘 실제로 겪은 두 건 모두 이 패턴이다.

- 키보드: `stickToBottom` 플래그만 믿다가 실패 → 엔진 `lastGeom` 실측 재확인으로 수정(완료, 실기기 재검증 대기)
- 진입 후 튕김: `initialServerSnapshot` refresh → `mergeRoomMessages`로 위쪽에 과거 메시지가 붙는데, 이게 pagination `prepend`로 분류되지 않아 앵커 보존 경로를 안 탐 → 오늘 top-id 변화 감지로 응급 수정(완료, 실기기 재검증 대기)

**패턴: "엔진 밖에서 일어나는 데이터 변화"가 반복적으로 스크롤을 깨뜨린다.** 다음에 또 새 경로(예: 리액션 갱신, 통화 스텁 삽입 등)가 같은 방식으로 터질 수 있다.

## 2. 목표 제품 계약 — "가벼운 채팅창" (레거시와 동일)

| 상황 | 기대 동작 |
|---|---|
| 목록에서 방 진입 | **항상 최신(bottom)** — 예전 스크롤 위치 복원 안 함 |
| 푸시/딥링크 진입 | 동일하게 최신 (또는 unread 경계 — 제품 정책 하나로 통일, §6에서 결정) |
| 내 메시지 전송 | 무조건 bottom follow |
| 상대 메시지 도착 | near-bottom이면 follow, 아니면 위치 유지(+ 새 메시지 표시) |
| 과거 메시지 불러오기(pagination) | prepend 앵커 보존(위치 유지) |
| 키보드 open/close | 셸 높이만 변경 → 엔진 `notifyLayoutResize`만. 새 스크롤 writer 추가 금지 |
| 캐시→서버 refresh로 메시지가 앞에 붙음 | pagination과 동일한 엔진 `prepend` 이벤트로만 처리 |

지금 문서(`docs/chat-thread-scroll-contract.md`)의 initial anchor 우선순위(`persisted visible → unread+lastRead → latest`)가 "목록 탭 진입에도 최신이 안 보이는" 직접 원인이다. **가벼운 채팅창에서는 목록 진입 시 이 우선순위 자체를 없애고 레거시처럼 `forceBottom: true` 기본으로 바꾼다.** (§6 결정 필요)

## 3. 목표 아키텍처

```
[ roomMessages 변경의 유일한 분류 ]
  append | prepend | replace(entry seed) | clear
           │
           ▼
[ ChatThreadScrollEngine 만 scrollTop 조작 ]
           ▲
[ shell / keyboard / composer RO ]
  → height CSS 변수만 → notifyLayoutResize (재 entry 금지)
```

- CM도 `useChatThreadScroll`(또는 동일 API를 쓰는 얇은 래퍼)로 수렴시킨다.
- `messenger-room-scroll-position-store`의 "목록 재진입 시 예전 위치 복원" 기능은 제거하거나 최소한 "목록 탭으로 들어온 진입"에서는 무시한다(TTL=0 아님, 아예 조회 안 함).
- `ScrollAnchorController`의 나머지 정책(unread 경계, lastRead 등)은 "엔진 호출 순서 결정"으로만 남기고, `phase1`에 흩어진 "조용한 merge"는 전부 append/prepend 이벤트로 명시화한다.
- 키보드는 기존 LOCK(`cm-room-keyboard-layout-contract-lock`) 그대로 유지 — 이번 재설계에 키보드 패치 레이어를 새로 추가하지 않는다.

## 4. 작업 단계

### Phase A — 전수 리스트업 (완료, 2026-07-28)

`roomMessages` 를 mutate 하는 **모든** 지점을 전수 조사했다(9개 파일, `setRoomMessages(` 호출부 전체).

**핵심 발견 — 예상보다 덜 위험했다.** `messenger-room-scroll-anchor-controller.ts` 는 호출 출처와 무관하게 `roomMessages` 배열 자체의 **head id 변화**(`prevHeadMessageIdRef`, Fix #2)와 **tail id 변화**(`prevTailMessageIdRef`, 기존)를 제네릭하게 감시해 각각 `engine.notifyLayoutResize`(head) / auto-scroll 정책(tail)으로 흡수한다. 즉 새 mutation 지점이 추가돼도 "엔진에 알리는 걸 잊어서" 깨지는 구조적 위험은 이 두 watcher가 이미 낮춰 놓았다. 남은 위험은 (a) 이 watcher 자체가 깨지는 것, (b) 아무도 모르게 새 mutation 지점이 추가되는 것 — 둘 다 `scripts/verify-cm-room-message-mutation-sites.mjs`(Phase C) 로 정적 게이트화했다.

| ID | 트리거 | 파일·함수 | 엔진 통지 경로 | 분류 |
|---|---|---|---|---|
| M1 | 목록 진입 seed(3곳: L373 승격, L400 초기 useState, L447 cached seed) | `use-messenger-room-client-phase1.ts` | 최초 mount, `entryPendingLayout` 단계 — 엔진 진입 전이라 해당 없음 | replace(entry), **중복 3곳 — 정리 여지 있으나 idempotent merge라 정합성 문제는 없음** |
| M2 | BootstrapGate refresh merge (L364-387) + snapshot→messages 재조정 (L1418-1468) | `use-messenger-room-client-phase1.ts` | head watcher(Fix #2) | prepend(silent) — **head watcher로 커버됨** |
| M3 | Realtime store 초기 합류(L415) + cross-tab bus 이벤트(L552) | `use-messenger-room-client-phase1.ts` | tail/head watcher | append 우선, 드물게 prepend 가능 — watcher로 커버 |
| M4 | `loadOlderMessages`(명시적 pagination) | `use-messenger-room-load-older-messages-fetch.ts` | `notifyPrependInFlight` + 명시적 prepend-preserve 경로(정상) | prepend(explicit, anchor 보존) |
| M5 | 내 전송/스티커/이미지/파일/음성 optimistic append + ack 교체 | `use-messenger-room-phase2-controller.ts`, `use-messenger-room-voice-recording.ts` | 명시적 `scrollMessengerToBottom({reason:"own_message_append"})` | append(explicit, force bottom) |
| M6 | 편집/삭제/리액션 | `use-messenger-room-phase2-controller.ts` | 없음(불필요) | mid-array patch/filter — head/tail 불변, 스크롤 무관 확인됨 |
| M7 | Realtime INSERT ingest | `use-messenger-room-realtime-message-ingest.ts` | tail watcher | append |
| M8 | Remote catch-up(단건/배치) | `use-messenger-room-remote-catchup.ts` | head/tail watcher | append 우선 |
| M9 | Bump broadcast 단건 병합 | `use-messenger-room-bump-broadcast-subscription.ts` | head/tail watcher | append |
| M10 | Bootstrap refresh(explicit/silent) primed seed | `messenger-room-bootstrap-refresh.ts` | head watcher(Fix #2) | prepend(silent) 가능 — head watcher로 커버 |
| M11 | 타임라인 cap trim(길이 초과 시 앞부분 slice) | `CommunityMessengerRoomPhase2MessageTimeline.tsx` | head watcher(Fix #2) | **head 제거(reverse-prepend)** — Fix #2 이전엔 미커버였을 가능성, 지금은 head watcher가 잡음 |

**완료 기준 재정의:** "엔진 미연결 행 0개"가 아니라 **"head/tail watcher 커버 범위 밖 행 0개"** — 위 표 기준 충족. 유일한 예외였던 M11(cap trim)은 Fix #2의 head watcher가 이미 커버.

### Phase B — 가벼운 진입 계약 (완료, 2026-07-28)

- `resolveMessengerRoomEntryScrollPlan`(`messenger-room-entry-intent.ts`) 을 단순화 — `hasPersisted`/`unreadCount`/`lastReadMessageId` 분기를 모두 제거하고 push·default(목록 재진입 포함) 모두 `{reason: initial_load|push_entry_initial_load, clearPersist: true, forceBottom: true, anchorMessageId: null}` 고정 반환.
- 결과: `room_entry_restore` reason 이 더 이상 생성되지 않으므로, 컨트롤러의 `consumeMessengerRoomScrollPosition` persisted-restore 조회 분기는 목록 진입 경로에서 도달 불가(dead code) — 최소 diff 원칙에 따라 지금은 "호출되지 않게"만 하고 컨트롤러 자체의 코드 삭제는 다음 정리 단계로 미룸(§8 리스크에 기록).
- unread 점프 제거도 동일 함수 변경으로 함께 해결(플랜과 별도 분기가 아니라 같은 조건문이었음).
- 관련 유닛 테스트 3개 업데이트: `messenger-room-entry-intent.test.ts`, `messenger-room-scroll-anchor-policy.test.ts`, `messenger-room-initial-anchor-contract.test.ts`.
- `docs/chat-thread-scroll-contract.md` §Initial anchor·변경 이력 갱신.

**완료 기준 검증:** eslint clean, `verify:cm-room-entry-scroll-contract`/`verify:chat-thread-scroll-contract`/`verify:cm-room-keyboard-layout-contract` PASS. **실기기 재검증 전까지 미확정** — vitest 는 샌드박스에서 rollup 네이티브 바이너리 부재로 실행 불가(사용자 환경에서 `npm run test`/`npx vitest run` 필요), 실기기 QA(§4 Phase E 체크리스트 2번: "재진입 → 최신")는 아직 수행되지 않음.

### Phase C — CM을 레거시 훅 수준으로 정렬 (부분 완료)

- **완료:** `scripts/verify-cm-room-message-mutation-sites.mjs` 신규 — `roomMessages` 를 mutate 하는 9개 파일을 화이트리스트로 고정하고, (a) 화이트리스트 밖에서 새 mutation 지점이 생기면 FAIL, (b) 화이트리스트에 있는데 더 이상 안 쓰면 FAIL(표류 항목 방지), (c) 컨트롤러의 head/tail watcher 마커 코드가 지워지면 FAIL. `npm run verify:cm-room-message-mutation-sites` 로 실행, package.json 등록 완료.
- **보류(다음 세션):** Phase A M1 에서 발견한 "snapshot→roomMessages merge 를 하는 중복 3곳"(L364-387 승격, L400 초기 seed, L447 cached seed, L1418-1468 재조정)을 단일 경로로 통합. 지금은 idempotent merge(`mergeRoomMessages` 의 Map 기반 dedupe)라 정합성 버그는 없지만, "두껍다"는 근본 진단(§1)의 실제 사례이며 유지보수 부담·성능(중복 merge 연산)의 원인. 통합은 `phase1.ts` 의 여러 `useLayoutEffect`/`useEffect` 순서·타이밍에 손대야 해서 리스크가 있어 별도 세션으로 분리.
- **보류(다음 세션):** `messenger-room-scroll-anchor-controller.ts` 의 `notifyEntryFromPlan` 안 `room_entry_restore` 분기(L263-304, 이제 도달 불가) 삭제 — Phase B가 만든 dead code 정리. 컨트롤러가 오늘 이미 두 차례(Fix #2, 화이트리스트 게이트 참조) 손댄 민감 파일이라, 실기기로 Phase B 를 먼저 확인한 뒤 별도 diff로 진행 권장.

### Phase D — 키보드 (스크롤과 분리 유지)

- Android: `adjustResize` + shell height만. iOS: 기존 band/`--kb-offset`만.
- 리사이즈 시 엔진 `notifyLayoutResize` + `lastGeom` 실측만(오늘 수정 유지, 실기기 재검증).
- 새 keyboard 레이어·Provider·transform 추가 금지.

### Phase E — 실기기 게이트 (고침 판정)

매번 동일 체크리스트, 4도메인 × 2기종 이상:
1. 목록 → 진입 → 최신 보임
2. 중간까지 스크롤 후 나가기 → 재진입 → 최신(새 계약, 예전 위치 복원 안 함)
3. 키보드 open → 마지막 말풍선 안 가림, composer 키보드 위
4. 과거 로드 중 → 읽던 위치 유지
5. 전송/상대 메시지 near-bottom follow

## 5. "가벼운 채팅창"이 의미하는 것 / 아닌 것

**한다:** 레거시와 같은 스크롤 상태 머신·API 재사용. 진입 = 최신 보이기. 메시지 변화 = append/prepend 두 가지로만 분류.

**안 한다(이번 트랙에서):** CM UI 전체·Pass0~3·virtualizer 재작성. 키보드 LOCK 구조 재발명. `/market` 목록의 lightweight 계약과 혼동.

## 6. 결정 사항 (승인 완료 — 2026-07-28)

- **재진입 위치 복원: 제거.** 목록에서 방을 다시 열면 항상 최신(bottom). `messenger-room-scroll-position-store`의 persist-restore는 목록 진입 경로에서 더 이상 조회하지 않는다.
- **unread → 첫 안읽음 지점 점프: 제거.** 진입은 항상 최신, 안 읽은 메시지 수는 배지로만 표시(헤더/상단).
- **작업 범위: A→B→C 전체 진행.** 단, `use-messenger-room-client-phase1.ts`는 크고 민감한 파일이라 지점별로 쪼개서 정적 게이트를 통과시키며 진행한다. 한 세션에 다 못 끝낼 수 있음을 전제로, 단계마다 중간 상태를 커밋 가능한 지점으로 나눈다.
