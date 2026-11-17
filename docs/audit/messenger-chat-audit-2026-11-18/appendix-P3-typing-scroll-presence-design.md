# P3 독립 검증 — 입력 중(T1–T8·D2) · 「↓」(X2) · 튐(X3) · 자리 비움(F4/F5) · D6-a

- 작성: 2026-11-18, 읽기 전용 검증(저장소 코드·마이그레이션·라이브러리 소스만). **운영 DB·실기기·외부 서비스 조회 없음.**
- 판정 표기: CONFIRMED / REFUTED / PARTIAL = 코드 근거 기준. 실기기·운영 값은 이 문서에서 새로 측정하지 않음 → 해당 칸은 **NOT_PROVEN(이 검증)**.
- 대상 감사: `docs/audit/messenger-chat-full-audit-ssot-design-2026-11-18.md` §2(T1–T8, D2), §4-2 F4/F5, §6 X2/X3, §6-1 D6-a.

---

## 0. 검증자 결론 요약 (먼저)

1. T1·T2·T3·T5(저장소 정의 기준)·T7·T8·F4 는 코드로 **CONFIRMED**.
2. 감사 문서의 X2 원인 설명은 **PARTIAL** — 두 문장이 틀렸거나 과장:
   - 「자동 따라가기는 scrollTop 만 바꾸고 읽기 상태는 실제 스크롤 이벤트 때만 갱신」→ 프로그램이 `scrollTop` 을 **바꾸면 브라우저가 scroll 이벤트를 쏘고** `onScroll → updateStickToBottomFromScroll` 이 두 값을 모두 갱신한다. 갱신이 빠지는 것은 ① `scrollTop` 이 실제로 안 바뀐 경우(입력 중 행 제거 −40px 와 새 행 +52px 가 상쇄·클램프) ② 애니메이션 중 조기 반환 ③ 따라가기가 **paint 뒤 `useEffect`** 라 첫 프레임에 새 행이 화면 밖인 경우.
   - 「`bumpPendingNewFromOthers` 가 무조건 reading-history 로 덮어씀」→ 함수 안의 쓰기는 무조건이지만 **호출은 수신 직전 viewport 가 맨 아래(≤96px)가 아닐 때만**(`ingest.ts:185`). 맨 아래에서의 「↓ 7초 유지」는 주로 **`remainingUnreadCount>0`(배지 경로)** — 읽음 커서/`lastVisibleMessageId` 가 전진하지 않을 때.
3. **감사가 놓친 결함 3건(코드 확정, 실기기 NOT_PROVEN)**:
   - N1 방 진입 때 저장된 입력 초안이 복원되면(`readRoomComposerDraft`) 사용자가 치지 않았는데 `typing:start` 1회 발송(포커스 확인 없음).
   - N2 TanStack `scrollToIndex(last,"end")` 는 최대 **5초 reconcile** 을 걸어 두고, 그 사이 내용 높이가 바뀌면 사용자 스크롤과 무관하게 다시 맨 아래로 씀(사용자가 위로 올린 직후 사진 로드 시 끌려 내려감 가능).
   - N3 머리글 「입력 중」 표시 경로는 3곳이 아니라 **5곳**(그룹·1:1·일반 `statusLine` 3 + 거래 `listingSubtitle` 1 + 배달 `deliveryHeaderSubtitle` 1).
4. **충돌 보고(임의 선택 안 함)**:
   - C1 그룹 입력 중 이름 규칙: 기존 문서 `group-chat-presence-typing.md §3` 「이름 최대 2명 + 외 N명」 ↔ 감사 D2-b 「이름 입력 중 / N명 입력 중」.
   - C2 감사 D2-a 「수신 TTL 3.2초 유지」 ↔ 같은 문서 §3 「전송 상한 1회/2–3초」: 3초 간격 발신이면 3.2초 TTL 은 여유 0.2초 → 1회 지연만으로 깜빡임. 계약에서 유도되는 값은 TTL ≥ 3초+지연.
   - C3 감사 D2-d 「입력 중·읽음·bump 토픽 공통 함수에 차단 제외」 ↔ 읽음·bump 내용은 RLS 로 이미 읽을 수 있는 데이터(메시지·참가자 행) — 토픽만 막으면 불일치만 생김. 차단 효과가 실제로 있는 것은 휘발성 신호인 **입력 중** 하나.
   - C4 운영 정의 차이: 감사는 운영 `internal.cm_can_access_messenger_room` 을 조회했다고 적었으나 저장소 마이그레이션에는 `internal.` 판 정의가 **없음**(참조만 `20271102130000:278`). 저장소의 토픽 정책은 `public.cm_can_access_messenger_room` 을 호출. → 운영 현재 정의는 이 검증에서 **확인 못 함**.

---

## PART A — 주장별 검증 (코드 인용)

### A-1. T1 「start 1회 + 수신 TTL 3200 + 유휴 2600」 — **CONFIRMED**

`lib/community-messenger/realtime/typing/use-community-messenger-room-typing.ts`
```ts
22 const TYPING_IDLE_MS = 2600;
23 const TYPING_TTL_MS = 3200;
...
50         typingStore.getState().setTyping(roomId, fromUserId, TYPING_TTL_MS);
...
61     const pruneTimer = window.setInterval(() => {
62       typingStore.getState().clearExpired();
63     }, 1500);
...
111    const hasDraft = args.draft.trim().length > 0;
112    if (hasDraft) {
113      if (lastStateRef.current !== "typing") {
114        lastStateRef.current = "typing";
115        sendTyping(roomId, viewerUserId, "typing:start");
116      }
117      if (stopTimerRef.current != null) window.clearTimeout(stopTimerRef.current);
118      stopTimerRef.current = window.setTimeout(() => {
```
- 계속 입력하면 `lastStateRef` 가 "typing" 으로 남아 start 재전송 없음, 유휴 타이머만 계속 연장 → stop 도 없음.
- 수신 쪽 만료 = 3.2초, 실제 제거는 1.5초 주기 정리 → 마지막 수신 뒤 **3.2~4.7초** 사이에 사라짐. 실측(1~4초 표시 후 「온라인」)과 일치.
- 발신 경로 = REST(`sendMessengerPrivateBroadcastFromClient`, `private-broadcast-client.ts:90-121`, 요청마다 `getSession()` + POST).

### A-2. N1 (신규) 초안 복원만으로 「입력 중」 발신 — **CONFIRMED(코드)**, 실기기 NOT_PROVEN
`CommunityMessengerRoomPhase2Composer.tsx`
```ts
236     setDraft(readRoomComposerDraft(roomKey));      // 방 진입 시 저장 초안 복원
...
239   useLayoutEffect(() => {
241     setTypingPublisherEnabled(false);
244             scheduleWhenBrowserIdle(() => setTypingPublisherEnabled(true), 600);
...
354   useCommunityMessengerRoomTypingPublisher({
355     roomId: typingPublisherEnabled ? vm.snapshot.room.id : null,
357     draft: typingPublisherEnabled ? draft : "",
```
발신 훅에 포커스·키 입력 확인이 없어(A-1 의 111-116) 저장 초안이 있으면 진입 ~0.6초 뒤 start 1회 → 상대 머리글에 2.6~4.7초 「입력 중」.

### A-3. T2 머리글 정적 글자 — **CONFIRMED**, 범위는 **PARTIAL(5곳)**
`CommunityMessengerRoomPhase2Header.tsx`
```tsx
423 <p className="truncate sam-text-xxs leading-tight text-[color:var(--cm-room-text-muted)]">{statusLine}</p>
452 <p className="truncate sam-text-xxs ...">{statusLine}</p>
486 <p className="truncate sam-text-xxs ...">{statusLine}</p>
213     if (typingPeerCount > 0) return t("chats_peer_typing");        // listingSubtitle → 397
302     if (typingPeerCount > 0) return t("chats_peer_typing");        // deliveryHeaderSubtitle → 365
365             subtitle={deliveryHeaderSubtitle}
```
`resolve-room-header-status-line.ts:21-26` 은 문자열만 반환(`cm_ui_typing_multiple` / `chats_peer_typing`). 카탈로그 `chats.ts:24` 「입력 중…」/`:112` 「Typing…」, `community-messenger-ui.ts:1042` 「{count}명이 입력 중...」. 움직이는 점 없음.

### A-4. T3 타임라인 중복 행과 조건 — **CONFIRMED**
`CommunityMessengerRoomPhase2MessageTimeline.tsx`
```tsx
1808   const typingRoomBucket = useMessengerTypingStore((state) =>
1809     typingRoomIdKey ? state.byRoomId[typingRoomIdKey] : undefined
...
1835   const typingPeerAvatar = typingPeerUserIds[0] ? messageRowPreamble.peerAvatarFor(typingPeerUserIds[0]) : null;
...
2322         {typingPeerUserIds.length > 0 ? (
2323           <div className="flex w-full items-end justify-start gap-2 px-2 pt-1" aria-live="polite">
2324             <div className="flex h-[30px] w-[34px] shrink-0 items-center justify-center">
2326                 {typingPeerAvatar?.initials ?? "?"}
...
2335                     className="h-1.5 w-1.5 animate-pulse rounded-full bg-current opacity-70"
2343         <div ref={vm.messageEndRef} />
```
조건: 버킷에 만료 전 항목(1:1 은 상대 id, 그룹은 본인 제외 전원). **hydrationPass 게이트 없음**(머리글은 게이트 있음 → 진입 초기에는 타임라인 행만 보일 수 있음). 행 위치 = 가상 목록 호스트 **다음**, `messageEndRef` **앞**, 즉 스크롤 내용 안 → 스크롤 높이 약 34~40px(30px 상자 + `pt-1`, 말풍선 `py-2`) 차지. 빈 방·로딩 분기에서도 삼항 밖이라 렌더됨. 사진 대신 `initials`(`avatarUrl` 버림).

### A-5. T4/X3 「약 1초 튐」 원인 — **CONFIRMED(코드 경로)**, 각 기여 비중은 NOT_PROVEN
경로 3개가 겹친다.
1. **입력 중 행 제거·삽입이 메시지와 다른 커밋** — `typing:stop`(REST 브로드캐스트, 발신자가 전송 순간 초안 비움 → A-1 125-131)과 메시지 INSERT(별도 bump → 병합)는 채널이 달라 순서·커밋이 갈림. 맨 아래에서 −40px 제거 → 브라우저가 `scrollTop` 을 새 최대값으로 **클램프** → 화면 내용이 40px 아래로 이동, 이어 메시지 +52px(추정) 추가 → 따라가기로 위로 이동.
2. **따라가기가 paint 뒤** — `messenger-room-scroll-anchor-controller.ts`
   ```ts
   708   useEffect(() => {
   709     const last = roomMessages[roomMessages.length - 1];
   ...
   720       } else if (engine.readStickToBottom()) {
   721         scrollMessengerToBottom({ reason: "peer_message_near_bottom" });
   ```
   `useEffect` → 새 행이 화면 밖인 프레임이 1회 그려진 뒤 이동. 「↓ 가 메시지보다 먼저 뜸」(3번째 실측)도 이 프레임으로 설명됨(그 프레임에 `remainingUnreadCount=1`).
3. **추정 높이 → 실측 보정** — `estimateMessengerTimelineRowPx` 짧은 글 52 / 기본 96(`messenger-timeline-row-estimate.ts:18,37-40`, `messenger-room-ui-constants.ts:20`). 측정은 `measureElement → resizeItem → notify(false)`(비동기 재렌더) 후 높이 변화 → `onContentResize`(controller 769-773) 또는 TanStack reconcile 이 다시 맨 아래로.
4. **TanStack reconcile(N2)** — `engine.ts:307-314` 가 `virtualizer.scrollToIndex(count - 1, { align: "end" })` 뒤 `vp.scrollTop = vp.scrollHeight`. `@tanstack/virtual-core 3.13.23` `index.js:740-760` 은 `scrollState` 를 만들고 `reconcileScroll`(825-856) 이 **최대 5초(MAX_RECONCILE_MS=5e3)** 동안 매 rAF 목표(마지막 index·end → `getMaxScrollOffset()` = DOM `scrollHeight-clientHeight`, 716-718)가 바뀌면 `_scrollToOffset` 로 다시 씀. 맨 아래 유지 자체는 맞지만 **사용자가 그 5초 안에 위로 올린 뒤 높이가 바뀌면 끌려 내려감**(사용자 스크롤은 목표를 바꾸지 않으므로 그것만으로는 안 씀). 튐의 직접 원인으로는 NOT_PROVEN.

### A-6. T5 차단 확인 없음 — 저장소 정의 기준 **CONFIRMED**, 운영 정의 **NOT_PROVEN(C4)**
`supabase/migrations/20261207120000_cm_group_active_membership_authority.sql:342-366`
```sql
WHERE p.room_id = p_room_id
  AND p.user_id = auth.uid()
  AND (
    ( r.room_type IN ('private_group', 'open_group')
      AND p.left_at IS NULL
      AND NOT COALESCE(public.cm_group_is_user_banned(r.id, auth.uid()), false) )
    OR ( r.room_type IS DISTINCT FROM 'private_group' AND r.room_type IS DISTINCT FROM 'open_group' )
  )
```
1:1 은 참가 행만 있으면 통과(`left_at`·차단 없음). 토픽 정책(최신 `20270425120000:25-26` 읽기, `20270422130000:296` 이후 발신):
```sql
when p_topic like 'community-messenger-typing:%' then
  public.cm_can_access_messenger_room(internal.cm_realtime_topic_suffix_uuid(p_topic, 'community-messenger-typing:'))
```
차단 SSOT = `user_social_relations(relation_type='blocked', is_active)` (`lib/social/user-block-ssot.ts:100-119`, `20260619150000:13`). 토픽 함수 어디에도 없음. 계약 테스트 `cm-realtime-private-broadcast-authorization.contract.test.ts:14-15` 는 `public.` 사용·`internal.cm_can_access_messenger_room` 미사용을 강제.

### A-7. T6 머리글 게이트·발신 유휴 대기 — **CONFIRMED(코드)**, 영향 **PARTIAL**
- `Header.tsx:76` `const bindPresenceAndTyping = hydrationPass >= 2;`, `:157` `if (!bindPresenceAndTyping) return 0;`
- 단 `CommunityMessengerRoomClientPhase2Body.tsx:226-235` 는 타임라인 시드가 있으면 layout effect 에서 즉시 `setHydrationPass(3)` → 일반 재진입은 첫 paint 전 통과. 게이트가 실제로 막는 것은 **시드 없는 진입** 구간뿐.
- 수신 구독(`useCommunityMessengerRoomTypingRuntime`, Body 706-710)은 게이트 없음. 발신 600ms 유휴 대기는 Composer 239-250 확인.

### A-8. T7 문서-코드 불일치 — **CONFIRMED**
`docs/group-chat-presence-typing.md §3`:
```
| 입력 디바운스 | **200–400 ms** | keydown 마다 전송 금지 |
| 전송 상한 | **1회 / 2–3 s** / 사용자 | 추가 타이핑 이벤트 드롭 |
| 조건 | 포그라운드 + 입력 포커스 | |
| 수신 UI | 이름 최대 **2명** + “외 N명” 집계 문구 | |
```
코드: 상한 대신 1회만, 포커스·포그라운드 조건 없음(A-1, N1), 이름 없이 인원수(`resolve-room-header-status-line.ts:22`). `docs/messenger-realtime-policy.md:46` 「**typing / presence** (향후)」 — 이미 구현됨, 낡음.

### A-9. T8 접속 문구 한국어 고정 — **CONFIRMED**
`format-messenger-peer-presence-line.ts:18-26` 「오프라인」「온라인」「자리 비움」「마지막 접속 …」. 호출처 6곳: `resolve-room-header-status-line.ts:27`, `Header.tsx:215,306,315`, `ChatRoomMoreMenu.tsx:183,188`, `CommunityMessengerFriendPresenceLine.tsx:47`. 테스트 하드코딩: `presence-last-seen-end-to-end.test.ts:27`, `direct-header-presence-initial.test.ts:98`. 기존 키 `chats_presence_*`(`chats.ts:49-56/137-144`)는 거래 전용 상대시각 형식이며 ko 「자리비움」(띄어쓰기 다름).

### A-10. F4 「자리 비움」(2분 무입력) — **CONFIRMED** + 두 번째 원인
`lib/community-messenger/presence/presence-policy.ts`
```ts
8  export const SAMARKET_PRESENCE_ACTIVITY_ONLINE_MAX_MS = 2 * 60_000;
58   if (activityAge > SAMARKET_PRESENCE_ACTIVITY_ONLINE_MAX_MS) return "away";   // DB 파생
76   if (!s.documentVisible) return "away";
77   if (activityAge > SAMARKET_PRESENCE_ACTIVITY_ONLINE_MAX_MS) return "away";   // 실시간 파생
```
활동 = `pointerdown`/`keydown`/`scroll`(20초 스로틀) — `use-community-messenger-presence-runtime.ts:30,407-409`. 문서: `presence-policy.ts:7` 주석 「이를 넘기면 사용자 입력이 없다고 보고 ONLINE 불가 → AWAY」(별도 md 규정 없음 — `group-chat-presence-typing.md §1` 은 「최근 120 s 하트비트」 집계로 활동이 아니라 하트비트 기준).
두 번째 원인: 실시간 채널이 「건강하지 않음」이면 `presence-staleness.ts:34-36` 이 관측 15초 경과 online 을 away 로 강등(`use-community-messenger-peer-presence.ts:86-93`). 하트비트 12초(`runtime.ts:29`) → 여유 3초.
F5(접속 반영 수 초 지연): 이 검증에서 원인 코드 확정 못 함 — NOT_PROVEN.

### A-11. X2 「↓」 공식과 모든 쓰기 경로 — 공식 **CONFIRMED**, 원인 서술 **PARTIAL**
공식(`messenger-room-first-unread.ts:147-159`):
```ts
if (remaining > 0) return { visible: true, badgeCount: remaining };
if (input.atLatest) return { visible: false, badgeCount: 0 };
return { visible: true, badgeCount: 0 };
```
`remaining = countUnreadMessagesBelow({ lastReadMessageId: 읽음 바닥, afterMessageId: lastVisibleMessageId })`(Timeline 1086-1094), `atLatest = scrollPosition ∈ {at-bottom, near-bottom}`(Chip 27-30).

`scrollPosition` 쓰기(전수):
| # | 위치 | 값 |
|---|---|---|
| W1 | controller 275-277 `completeEntryPhase` | stick 이면 at-bottom |
| W2 | controller 406-408 ↓(최신) | at-bottom |
| W3 | controller 425-426 force(내 전송) | at-bottom |
| W4 | controller 478-479, 517-518 메시지로 이동 | reading-history |
| W5 | `messenger-room-scroll-near-bottom.ts:87-103` (`updateStickToBottomFromScroll` 538 경유) | viewport 판정(search 시트면 jumped-by-search) |
| W6 | `messenger-room-entry-unread-snapshot.ts:90` 진입 미읽음 캡처 | reading-history |
| W7 | `messenger-room-reader-state-store.ts:77` `bumpPendingNewFromOthers` | **reading-history 고정** |
| W8 | 같은 스토어 59 `setLastVisibleMessageId` (항목 없을 때) | reading-history 기본값 |
| W9 | `use-messenger-room-reader-scroll-room-lifecycle.ts:16` | clearRoom |

`lastVisibleMessageId` 쓰기: controller 413(↓ onDone), 427(force=데이터 끝 id), 480/486/520/524(메시지 이동), 546-551(scroll 이벤트, DOM 판정), `use-messenger-room-open-mark-read-effect.ts:456`(낙관 읽음 = **읽음 커서 id** — 실제 화면 끝보다 뒤로 갈 수 있음).

`scrollPosition` 읽기(정책 영향): `messenger-realtime-store.ts:131`(`activeRoomActuallyReadable`), `cm-participant-unread-full-effects.ts:275`(방 안 소리·배너) — 고착된 reading-history 는 「↓」뿐 아니라 방 안 알림 판단에도 영향.

맨 아래 실측 3종 설명:
- 7초 이상 유지: 맨 아래라 W7 미호출(185 가드) → 남는 원인은 `remaining=1`. 따라가기로 `scrollTop` 이 안 바뀌면(제거·추가 상쇄, 클램프) scroll 이벤트 없음 → `lastVisible` 정체, 읽음은 `isRoomActuallyReadable`(보임+포커스)·화면 후보 조건(`mark-read-effect.ts:957-985`)을 못 넘으면 커서 정체.
- 1초 뒤 사라짐: 측정 보정·mutation 40ms 디바운스 후 읽음 처리(`mark-read-effect.ts:1097-1108`)가 성공한 경우.
- 메시지보다 먼저: A-5 ②.

### A-12. 「자동 따라가기는 읽기 상태를 맞추지 않음」 — **PARTIAL**
`applyLayoutPreserve`(349-379)·`notifyAppend` 분기(432-435)·`onContentResize`(769-773)는 직접 스토어를 쓰지 않는 것이 맞다. 다만 `scrollTop` 이 바뀌면 `onScroll={scheduleScroll}`(Timeline 1947, 1193-1194) → `updateStickToBottomFromScroll`(533-558) 이 W5·lastVisible 을 쓴다. 누락은 「값 불변」「애니메이션 중(535)」「paint 뒤 effect」 3경우.

### A-13. `bumpPendingNewFromOthers` 덮어쓰기 — **CONFIRMED(쓰기)**, 「무조건」은 **PARTIAL**
```ts
// store 68-84
scrollPosition: "reading-history",
pendingNewBelow: (prev?.pendingNewBelow ?? 0) + delta,
// ingest 185, 321-322
if (rid && messengerRoomTracksScrollPosition() && !nearBottomForIngest) { ... insertFromOthers += 1; }
if (insertFromOthers > 0 && rid) { useMessengerRoomReaderStateStore.getState().bumpPendingNewFromOthers(rid, insertFromOthers);
```
또 ingest 172-183 은 viewport 를 읽어 `stickToBottomRef` 만 쓰고 스토어(W5)는 안 씀 → ref 와 스토어가 갈림.

---

## PART B — 구현 설계 (기능 추가·삭제 없음)

### B-1. 입력 중 (D2 수정안)

**상수(계약 유도, `use-community-messenger-room-typing.ts`)**
- `TYPING_RESEND_MS = 2_000` — 문서 §3 「1회/2–3 s」 하한.
- `TYPING_IDLE_MS = 2_600` 유지.
- `TYPING_TTL_MS = 4_500` — 문서 상한 3초 + REST 지연 여유(C2: 감사 D2-a 「3.2 유지」와 다름 → 보고). 정리 주기 1.5초 유지 → 끊긴 뒤 최대 6초 표시(Telegram 약 6초와 같은 범위).

**발신 `useCommunityMessengerRoomTypingPublisher` (키 입력 구동, 타이머 폴링 없음)**
- 인자에 `inputRef: RefObject<HTMLTextAreaElement | null>` 추가(Composer 의 `vm.composerTextareaRef`).
- draft 변경 시: `hasDraft && document.visibilityState==="visible" && document.activeElement===inputRef.current` 일 때만 → `lastState!=="typing" || now-lastSentAtRef >= TYPING_RESEND_MS` 이면 `typing:start` 재전송·`lastSentAtRef=now`. 유휴 타이머는 지금처럼 2.6초.
- 중지(`typing:stop` 1회, lastState==="typing" 일 때만): ① 초안 비움(전송 포함, 기존 125-131) ② 입력창 `blur` ③ `visibilitychange→hidden` ④ `pagehide` ⑤ 방 나감 cleanup(기존 136-150).
- Composer 239-250 `typingPublisherEnabled`·600ms 대기 **제거**(포커스 조건이 대신함 → N1 해소, T6 발신 지연 해소).

**수신 `useCommunityMessengerRoomTypingRuntime`**: TTL 상수만 변경. 추가로 `use-messenger-room-realtime-message-ingest.ts` 의 상대 INSERT 처리(277-294 블록)에서 `useMessengerTypingStore.getState().clearTyping(rid, senderId)` — stop 유실 시에도 메시지 도착 순간 표시 종료(Telegram 동작). (같은 파일 수정, 통화 경로 무관.)

**표시 1곳 = 머리글 `TypingIndicatorLine`**
- 새 표시 컴포넌트 `components/community-messenger/room/phase2/TypingIndicatorLine.tsx`(정적 글자 교체용, 기능 추가 아님): `<span className="sam-typing-line" aria-live="polite"><span>{label}</span><span className="sam-typing-dots" aria-hidden><i/><i/><i/></span></span>`. 색은 현행 `--cm-room-text-muted` 유지(레거시 강조색 여부는 Owner 결정 사항으로만 기록).
- `app/samarket-components.css` `@layer components`:
  ```css
  .sam-typing-dots{display:inline-flex;gap:2px;margin-inline-start:2px;vertical-align:middle}
  .sam-typing-dots>i{width:3px;height:3px;border-radius:9999px;background:currentColor;opacity:.3;animation:sam-typing-dot 1.2s ease-in-out infinite}
  .sam-typing-dots>i:nth-child(2){animation-delay:.2s}
  .sam-typing-dots>i:nth-child(3){animation-delay:.4s}
  @keyframes sam-typing-dot{0%,80%,100%{opacity:.3;transform:translateY(0)}40%{opacity:1;transform:translateY(-1px)}}
  @media (prefers-reduced-motion: reduce){.sam-typing-dots>i{animation:none;opacity:.7}}
  ```
  transform·opacity 만 → 줄 높이 불변(머리글 높이 변화 없음). `lib/ui/sam-component-classes.ts` 에 `Sam` 상수 1개.
- 판정 SSOT: `resolve-room-header-status-line.ts` 반환을 `{ kind:"typing"; label } | { kind:"text"; text }` 로. 5개 경로(423/452/486/397/365) 모두 같은 결과 사용. `StoreOrderDeliveryMessengerHeaderBlock.subtitle`(`string`, 15·65행)은 `ReactNode` 로 넓히거나 `typingLabel` prop 추가.
- 머리글 typing selector 의 `bindPresenceAndTyping` 게이트(157) 제거(접속 점·문구 게이트는 유지).
- 라벨 규칙(이름 데이터 = `snapshot.members[].label`, alias 면 `aliasProfile.displayName` — `communityMessengerMemberAvatar` 와 같은 우선순위):
  - 1:1: `cm_typing_direct` ko「입력 중」/en「typing」
  - 그룹 기본안(문서 §3): 1명 `cm_typing_one`「{name} 입력 중」/「{name} is typing」, 2명 `cm_typing_two`「{name1}, {name2} 입력 중」/「{name1} and {name2} are typing」, 3명+ `cm_typing_many`「{name1}, {name2} 외 {count}명 입력 중」/「{name1}, {name2} and {count} more are typing」, 이름 못 찾음 `cm_typing_count`「{count}명 입력 중」/「{count} people are typing」. **C1 충돌 → Owner 확인 필요**(감사 D2-b 대안: 1명 이름, 2명+ 인원수).
  - 「…」 제거(점 애니메이션과 중복).
- 타임라인 행 **삭제**: Timeline 126(import)·1806-1839(구독·라벨)·2322-2342(행). `messageRowPreamble.peerAvatarFor` 는 2110 에서 계속 사용 → 유지.

**입력 중 스토어·훅 소비처 전수(갱신 대상)**
| 파일:행 | 조치 |
|---|---|
| `use-community-messenger-room-typing.ts` 전체 | 상수·발신 로직·inputRef |
| `CommunityMessengerRoomPhase2Composer.tsx:63,239-250,354-358` | 대기 제거, inputRef 전달 |
| `CommunityMessengerRoomClientPhase2Body.tsx:40,706-710` | 변경 없음(구독 즉시) |
| `CommunityMessengerRoomPhase2Header.tsx:19,156-175,177-189,211-218,300-317,365,397,423,452,486` | 게이트 제거·컴포넌트 |
| `CommunityMessengerRoomPhase2MessageTimeline.tsx:126,1806-1839,2322-2342` | 삭제 |
| `resolve-room-header-status-line.ts` | 반환형 |
| `StoreOrderDeliveryMessengerHeaderBlock.tsx:15,65` | prop |
| `use-messenger-room-realtime-message-ingest.ts` | INSERT 시 clearTyping |
| `lib/auth/client-session-wipe.ts:47,155` | 변경 없음 |
| `lib/i18n/catalog/community-messenger-ui.ts` | 키 5개 ko·en |
| 테스트: `bundle7-wave-bc-contract.test.ts:76-80`(API 불변), `group-room-phase3-s2-online-contract.test.ts:90-99`(문자열 `typingPeerCount` 단언) | 갱신 |

**차단 제외 SQL (운영 DB 함수 변경 = Owner 승인 필수)**
- 설계 원칙: `public.cm_can_access_messenger_room` 은 **바꾸지 않음**(메시지·방 RLS 에 쓰여 차단 시 대화 기록 자체가 사라지는 큰 변화). 토픽 **발신(INSERT)** 쪽만 막는다 → 구독(join)은 그대로 성공하므로 `createMessengerPrivateChannelStatusHandler` 의 CHANNEL_ERROR 재가입 반복(10초 간격 무한 재시도)이 생기지 않음. 양방향 차단이면 양쪽 모두 발신 불가 → 아무도 받지 못함.
- 새 함수(SECURITY DEFINER, `search_path=public`):
  ```sql
  create or replace function internal.cm_can_signal_typing_in_room(p_room_id uuid)
  returns boolean language sql stable security definer set search_path to 'public' as $$
    select public.cm_can_access_messenger_room(p_room_id)
      and not exists (
        select 1
        from public.community_messenger_rooms r
        join public.community_messenger_participants me
          on me.room_id = r.id and me.user_id = auth.uid()
        where r.id = p_room_id
          and r.room_type = 'direct'
          and (
            me.left_at is not null
            or exists (
              select 1
              from public.community_messenger_participants peer
              join public.user_social_relations sr
                on sr.relation_type = 'blocked' and sr.is_active
               and ((sr.owner_user_id = auth.uid() and sr.target_user_id = peer.user_id)
                 or (sr.owner_user_id = peer.user_id and sr.target_user_id = auth.uid()))
              where peer.room_id = r.id and peer.user_id <> auth.uid()
            )
          )
      );
  $$;
  revoke all on function internal.cm_can_signal_typing_in_room(uuid) from public;
  grant execute on function internal.cm_can_signal_typing_in_room(uuid) to authenticated;
  ```
  `internal.cm_realtime_can_send_topic` 의 typing 분기만 이 함수로 교체. 그룹은 그대로(차단은 1:1 개념).
- 작성 절차(AGENTS 규칙 10): 운영 현재 `pg_get_functiondef('internal.cm_realtime_can_send_topic'::regproc)` 를 읽기 전용으로 받아 **그 본문**에 typing 분기만 바꾼 마이그레이션 작성(저장소 사본과 운영 차이 C4 가능). `community_messenger_rooms.room_type`·`user_social_relations.is_active`·1:1 「나감 후 재진입 시 left_at 해제 여부」를 `information_schema` 로 먼저 확인 — 마지막 항목이 「열린 방에서도 left_at 이 남는다」면 `me.left_at is not null` 조건은 빼야 함(확인 못 함).
- 하위 호환: 토픽 이름·페이로드 불변. 구 바이너리/구 웹은 차단 시 REST 발신이 거부(4xx)되고 `private-broadcast-client.ts:122-133` 경고 로그(1분 1회 제한)만 남음. 인덱스: `user_social_relations UNIQUE(owner_user_id,target_user_id)` 로 두 방향 모두 점 조회.
- 롤백: 이전 본문으로 `create or replace` 1회. 계약 테스트 추가(발신 함수 typing 분기에 `cm_can_signal_typing_in_room` 포함, 읽기 함수는 불변).

### B-2. 「↓」·읽기 상태 SSOT (D6-a 구체화)

**한 함수** — `lib/community-messenger/room/messenger-room-scroll-near-bottom.ts` 에:
```ts
export function syncMessengerRoomReaderStateFromViewport(input): void   // 즉시
export function scheduleMessengerRoomReaderStateSync(input): void        // rAF 1회 합침(방별)
```
내용 = 기존 `syncMessengerRoomStickToBottomFromViewport`(scrollPosition·stickRef, search 시트 유지) + `setLastVisibleMessageId(resolveLastVisibleTimelineMessageId(viewport))`. `resolveLastVisibleTimelineMessageId`(controller 135-150) 를 이 파일로 이동·export. rAF 를 controller 밖에 두어 `verify:cm-room-entry-scroll-contract` 금지 패턴(`.scrollTop =`, 중첩 entry rAF)과 무관. 스크롤 쓰기 없음(읽기만) → `verify:chat-thread-scroll-contract` 무관.

**호출 지점(정확)**
| # | 위치 | 방식 | 조건 |
|---|---|---|---|
| S1 | controller `updateStickToBottomFromScroll` 538-551 | 즉시(기존 두 호출을 이 함수 1회로 교체) | 애니메이션 중 제외(535 유지) |
| S2 | controller `applyLayoutPreserve` 끝(363 뒤) | rAF | `engine.isSettled() && hasAppliedInitialAnchorRef.current` 일 때만 → 진입 단계 불변 |
| S3 | controller `scrollMessengerToBottom` notifyAppend 분기 432-435 | rAF | 같음 |
| S4 | controller 머리 변경 `notifyLayoutResize` 745 뒤 | rAF | 같음 |
| S5 | ↓ onDone 411-413, 메시지 이동 onDone 484-486 / rAF 521-526 | 기존 코드를 이 함수 호출로 대체(동작 동일) | — |
| S6 | ingest 171-183 | 수동 metric 읽기 대신 `syncMessengerRoomReaderStateFromViewport`(즉시, 병합 전 위치) — 스토어·ref 일치 | — |

**삭제**: `bumpPendingNewFromOthers` 의 `scrollPosition: "reading-history"` → `scrollPosition: prev?.scrollPosition ?? "reading-history"`(pending 증가만). S6 가 같은 순간 viewport 로 이미 정확한 값을 씀.

**변경**: controller 708 따라가기 `useEffect` → `useLayoutEffect`(paint 전, 계약 「paint 후 correct 금지」와 일치). 하위 타임라인 행의 DOM 은 커밋 완료 상태라 `scrollHeight` 정확.

**변경 안 하는 것과 그 근거(보존 증명)**
| 기존 동작 | 근거 코드 | 이 설계 후 |
|---|---|---|
| E1 진입 우선순위 push→돌아옴→첫 안 읽음→최신, 1회 | controller 587-684 | 미변경. S2-S4 는 `hasAppliedInitialAnchorRef` 이후만 |
| E2 진입 미읽음 캡처 시 reading-history(W6) | snapshot 90 | 미변경. S2-S4 가 진입 단계에 안 돌아 덮지 않음 |
| E3 구분선 「여기까지 읽음」 = `dividerStillUnread`(lastVisible 이 구분선 위일 때) | Timeline 1105-1119 | 진입 단계에서 lastVisible 쓰기 시점 불변 → 첫 표시 동일. 진입 후에는 실제 화면 기준으로만 전진(계약 「실제 노출 범위까지만」) |
| E4 ↓ 누름: 남은 미읽음 있으면 첫 안 읽음, 없으면 최신 | Timeline 2348-2358, first-unread 171-198 | 미변경(S5 는 같은 값 기록) |
| E5 최신 도달 시 진입 세션 정리 | Timeline 1128-1137 | 조건 동일, 더 빨리·확실히 충족 |
| E6 배지 = 읽음 바닥 이후 미읽음, 위로 스크롤로 늘지 않음(CUT-4) | first-unread 74-115 | 공식 미변경 |
| E7 읽음 처리 = 화면 후보·단조 증가 | mark-read 957-985 | 미변경 |
| E8 search 시트 = jumped-by-search | near-bottom 88-89 | S 함수가 activeSheet 전달 |
| E9 방 안 소리·배너 판단(scrollPosition) | realtime-store 131, unread-effects 275 | 맨 아래에서 잘못된 reading-history 가 사라짐(개선), 읽는 중은 S6 가 reading-history 유지 |
| E10 과거 불러오기 중 보정 금지 | controller 351, 753, 770 | S2 는 applyLayoutPreserve 가 반환한 경우 미호출 |

### B-3. 튐 제거 — 무엇이 실제로 없애는가
1. **입력 중 행 삭제(B-1)** → ±34~40px 클램프 이동 원천 제거(가장 큰 진폭).
2. **따라가기 paint 전(`useLayoutEffect`)** → 「새 행이 화면 밖인 1프레임」 제거, ↓ 먼저 뜸도 제거.
3. 추정→실측 보정: 마지막 행이 커지면 `onContentResize`(ResizeObserver 는 layout 뒤·paint 전 전달) → `applyLayoutPreserve` → 같은 프레임 맨 아래 → 보이는 튐 없음. 추정치 재조정은 P4 D4-c 범위(글자 토큰 변경과 함께) — 이번에 값 변경 안 함.
4. **reconcile(N2)**: 따라가기(append) 경로에서는 `scrollToIndex` 호출이 하는 일(맨 아래 유지)을 이미 `scrollTop=scrollHeight` + content RO 가 함 → append 경로에서 `virtualizer.scrollToIndex` 호출 **제거**(진입·명시 경로는 유지 — 진입은 측정 전 위치 보장이 필요). `engine.applyScrollToBottom` 에 「virtualizer 사용 여부」를 넘기는 대신 `notifyAppend` 가 DOM 쓰기만 하는 별도 private 경로를 쓰는 형태(조건 땜빵 아님, 책임 분리). **효과는 NOT_PROVEN** — 0.1초 프레임으로 전후 비교 필수, 회귀 시 이 항목만 되돌림.

### B-4. 「자리 비움」 — Owner 결정(F4) 두 안의 정확한 변경
| | 안 A (현행 유지) | 안 B (레거시: 앞화면이면 온라인) |
|---|---|---|
| `presence-policy.ts:58` | 유지 | 삭제(DB 파생: background→away, ping>15s→away 만) |
| `presence-policy.ts:77` | 유지 | 삭제(실시간: 구독+보임=online) |
| `:8` 상수 | 유지 | 미사용 → 삭제 |
| 활동 기록(`runtime.ts:42-63,407-409`, `last_activity_at`) | 유지 | 유지(서버 기록·관리자 지표 사용 — 삭제 안 함) |
| 영향 화면 | — | 1:1 머리글·점·⋯메뉴, 친구 목록 줄, **그룹 「N명 온라인」**(`group-room-online-authority.ts:113`), 서버 `presence_state_cached`(`service.ts:13691-13706`) |
| 푸시·소리 억제 | — | 영향 없음(`notification-presence-policy.ts:43-70` 은 visibility·activeRoom·ping 만) |
| 테스트 | — | `presence-policy` 단위 테스트 신규(활동 3분 경과 + 보임 → online) |
두 안 공통: 실시간 비정상 시 15초 강등(`presence-staleness.ts`)은 그대로.

**접속 문구 i18n(두 안 공통)** — 새 키(현 ko 문구 그대로 → ko 화면 변화 0):
`cm_presence_online` 온라인/Online · `cm_presence_away` 자리 비움/Away · `cm_presence_offline` 오프라인/Offline · `cm_presence_last_seen_at` 마지막 접속 {stamp}/Last seen {stamp}. `formatMessengerPeerPresenceLine(snapshot, t)` 로 시그니처 변경 → 호출처 6곳 + 테스트 2개 갱신. 거래 `chats_presence_*` 는 형식·띄어쓰기가 달라 재사용 안 함.

### B-5. 회귀 위험과 예방
| 위험 | 예방 |
|---|---|
| 포커스 조건 때문에 Android IME 입력 중 `activeElement` 불일치로 발신 안 됨 | 실기기 행렬 T-1; `focusin` 기반 플래그 대체 준비 |
| 2초 재전송 = REST 요청 증가(사람당 최대 0.5회/초) | 문서 §3 범위 내; 대형 그룹 상한은 감사 ④ Owner 결정 |
| 머리글 5경로 중 누락 | resolver 단일 반환형 + 경로별 테스트 |
| useLayoutEffect 로 바꾼 따라가기가 진입 첫 관찰과 충돌 | `skip_first_observation`(auto-scroll 25-27) 유지, 진입 계약 스크립트 |
| S2-S4 가 진입 구분선·첫 안 읽음 표시를 지움 | settled+applied 조건, `messenger-room-initial-anchor-contract`·`regression-matrix` 테스트 |
| reconcile 제거 후 사진 늦게 커질 때 맨 아래 놓침 | content RO 경로 테스트, 실기기 사진 수신 항목 |
| mark-read 낙관 쓰기(456)가 lastVisible 을 뒤로 돌림 | 이번 범위 밖 — 잔여 위험으로 보고 |
| SQL: 1:1 나감 후 열린 방에서 입력 중 끊김 | left_at 운영 의미 확인 전에는 left_at 조건 제외 |
| 뷰포트 문서 §0 「Android vv listener 금지」 vs controller 788-794 (기존) | 범위 밖 결함 — 보고만 |

### B-6. 테스트
- 갱신: `bundle7-wave-bc-contract.test.ts`, `group-room-phase3-s2-online-contract.test.ts:90-99`, `direct-header-presence-initial.test.ts:98`, `presence-last-seen-end-to-end.test.ts:27`, `cm-realtime-private-broadcast-authorization.contract.test.ts`(새 마이그레이션 단언 추가), `lib/chat-thread-scroll/__tests__/engine.test.ts`(append 경로 scrollToIndex 미호출), `messenger-room-first-unread.test.ts`(공식 불변 확인).
- 신규: 발신 훅(fake timers: 11초 연속 입력 → start ≥5회·간격 ≥2초, 비포커스 0회, blur/hidden/전송/언마운트 stop 1회), 라벨 resolver(1/2/3+/alias/이름 없음), 리더 스토어(bump 가 scrollPosition 보존), near-bottom 동기화(jsdom metric mock: 맨 아래+새 행 → at-bottom·lastVisible=tip), 수신 INSERT 시 clearTyping, 접속 문구 ko/en.
- 실행: `typecheck:build`, 관련 vitest, `verify:cm-room-entry-scroll-contract`, `verify:chat-thread-scroll-contract`, `verify:cm-room-keyboard-layout-contract`, `check:i18n-quality`. 뷰포트 문서 §7 에 1줄 추가(규칙).

### B-7. 실기기 행렬 (Production SHA 매회 기록, PHT)
Android(Samsung 휴대폰)·Android 태블릿(Xiaomi)·iPhone × 키보드 열림/닫힘 × 분할 화면(768px+)/단일:
1. 15초 연속 입력 → 상대 머리글 점 애니메이션 끊김 없음(1초 간격 캡처), 멈춘 뒤 ≤3초 사라짐.
2. 저장 초안 있는 방 진입(입력 안 함) → 상대에 입력 중 안 뜸.
3. 입력 중 앱 홈/◁ → 상대 표시 ≤1초 내 종료.
4. 그룹 1/2/3명 동시 입력 문구.
5. 상대 메시지 수신(맨 아래) × 10회 → 0.1초 프레임: 튐 0, ↓ 0.
6. 위로 읽는 중 수신 → ↓(배지) 표시, 누르면 첫 안 읽음 → 다시 누르면 최신.
7. 미읽음 있는 방 진입 → 구분선·첫 안 읽음 위치 기존과 동일.
8. 사진 수신 직후 위로 스크롤 → 끌려 내려가지 않음.
9. 차단 관계(승인 후) → 입력 중 안 보임, 차단 해제 후 복구.
10. 앞화면 2분 무조작 → 선택 안에 따른 문구.
11. 언어 en → 문구 영어.

### B-8. 롤백
웹: PR 되돌림 1회(구독 토픽·페이로드 불변 → 구 바이너리와 상호 호환, 섞여도 동작). DB: 발신 함수 이전 본문으로 `create or replace`, 새 함수 drop. 네이티브 변경 없음 → `[배포 구분]` 웹(+DB 별도 승인).

---

## 확인 못 함 (NOT_PROVEN)
- 운영 `internal.cm_can_access_messenger_room`·`internal.cm_realtime_can_send_topic` 현재 본문(C4).
- 1:1 방 나감 후 재열람 시 `left_at` 운영 의미.
- X3 튐의 각 원인 기여 비중, N2 reconcile 의 실제 끌어내림, F5 지연 원인.
- 모든 실기기 결과(이 검증은 코드만).
