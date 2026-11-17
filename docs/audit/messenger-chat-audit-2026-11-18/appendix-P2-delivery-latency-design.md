# P2 — 독립 검증: 감사 문서 §3(지연)·§6 X4~X7 + 지연 단축 구현 설계

- 대상 문서: `docs/audit/messenger-chat-full-audit-ssot-design-2026-11-18.md`
- 검증 방식: **현재 작업 트리 코드·라이브러리 소스 읽기만**. DB 조회·외부 서비스·실기기·운영 측정 **없음**.
- 따라서 이 문서의 모든 판정은 **코드 판정**이다. 운영·실기기 판정은 전부 **NOT_PROVEN**.
- 라이브러리 버전: `@supabase/realtime-js 2.99.2`, `@supabase/supabase-js 2.99.2`, `next 16.1.7` (package.json 확인).
- 배포 지역: `vercel.json` `"regions": ["bom1"]`, `"SUPABASE_REGION": "ap-south-1"` (같은 지역).

---

## 요약 판정표

| # | 주장 | 판정 | 핵심 차이 |
|---|---|---|---|
| A1 | 1:1 전송 응답 전 순차 DB 왕복 18~20회 | **PARTIAL** (과소 계산) | 내 계산 **20~21회(캐시 따뜻함)**, 수신자가 방에 열려 있으면 **+3~4회 (≈24)**, 콜드 인증·관리자/동의 캐시 미스면 +1~3. 문서의 단계별 수치 중 3곳이 틀림 |
| A2 | 배지 bump·알림 파이프라인 수신자 순차 await | **CONFIRMED** | |
| A3 | pre-ACK 목적(44e7073fe) · 통화 코드 없음 | **PARTIAL** | 목적 CONFIRMED. 그러나 「통화 코드 없음(타입 import 만)」은 틀림 — 이 경로가 **통화와 공유하는 모듈**을 호출한다(아래 A3) |
| A4 | 방 bump 는 after() 안, 방·참가자 재조회 | **CONFIRMED** | |
| A5 | RPC 반환에 room_type/chat_domain 없음 → 추가 rooms SELECT | **CONFIRMED(저장소 마이그레이션 기준)** · 운영 정의 NOT_PROVEN(이번 검증은 DB 미조회) | TS 는 이미 `payload.room_type` 을 읽는다 → DB 만 바꾸면 코드 변경 없이 1왕복 제거 |
| A6 | 수신: 단건 GET·이중 apply·읽음 시 silent bootstrap·참가자 UPDATE→after= | **CONFIRMED** | 추가: 전송 RPC 가 1:1 참가자 행 **2개를 모두 UPDATE** → 메시지 1건마다 양쪽 기기에서 participants UPDATE 2건 → `after=` 재조회 |
| A7 | X4 토큰 갱신 재구독 버그 | **CONFIRMED(라이브러리 소스) — 범위는 문서보다 넓음** | 토큰 갱신만이 아니라 **방 입장/퇴장(방 묶음 채널)·홈 목록 변화(홈 채널)·effect 재실행(typing·bump·friendship)** 때도 같은 토픽을 await 없이 재생성. 또한 supabase-js·앱이 이미 `setAuth` 로 가입된 채널에 새 토큰을 보낸다 → 토큰 갱신 재구독은 불필요 |
| A8 | X5 음성 삭제 bump 없음·DELETE 에 room_id 없음 | **PARTIAL** | bump 없음 CONFIRMED. 저장소 마이그레이션은 `REPLICA IDENTITY FULL`. 「RLS 에서 DELETE old 에 PK 만」은 저장소 안 문서에 근거 없음 → **NOT_PROVEN** |
| A9 | X6 안 읽음 고착 | **CONFIRMED** | silent_delta 도 같은 lastReadAt 이라 복구 안 됨 |
| A10 | X7 left_at 미필터 | **CONFIRMED** | 추가: 전송 RPC 의 비그룹 `recipient_user_ids` 도 left_at 미필터 → 알림 이벤트도 나간 참가자에게 생성될 수 있음 |
| A11 | 정책 문서가 bump 를 응답 전 await 로 기술 | **CONFIRMED (문서·코드 불일치)** | 같은 정책 문서의 「스냅샷 병합 성공 시 단건 GET 생략」도 코드와 불일치 |

---

# PART A — 주장별 검증

## A1. POST `/rooms/[roomId]/messages` 1:1 텍스트 — 응답 전 await 순서와 DB 왕복

파일: `app/api/community-messenger/rooms/[roomId]/messages/route.ts` (POST 180~464).

### 순서 (인용)

```ts
// route.ts:190-194
const [authGate, parsed, routeParams] = await Promise.all([
  ensureApiRouteAuthGate(),
  parseJsonBody<...>(req, "invalid_json"),
  params,
]);
// route.ts:200-211
const [rateLimit, canon] = await Promise.all([
  enforceRateLimit({...}),
  import(".../messenger-room-canonical-resolve-api").then(({ messengerRoomCanonicalOrJsonError }) => messengerRoomCanonicalOrJsonError(userId, rawRoomId)),
]);
// route.ts:225
const profileGate = await requireProfileFieldsForAction(sbSend, userId, "messenger_send_message");
// route.ts:232
const memberWriteGate = await assertVerifiedMemberForAction(sbSend, userId);
// route.ts:286 → service.sendCommunityMessengerMessage (group gate → block gate → RPC)
// route.ts:336
await bumpMessengerRoomTargetsForRecipients(sb, {...});
// route.ts:351
deferredPostAck = await runCommunityMessengerSendDurablePreAckEffects(sb, postAckEffects, t5 ?? undefined);
// route.ts:369
after(async () => { ... publishMessengerRoomBumpAfterMutation(bumpArgs) ... runCommunityMessengerSendDeferredPostAckEffects ... });
```

### 단계별 DB 왕복 (일반 1:1, 수신자 1명, 답장 아님)

| # | 단계 | 근거 인용 | 순차 왕복 |
|---|---|---|---|
| 1 | 인증 | `ensure-api-route-auth-gate.ts:62-75` warm cache(12s, `API_ROUTE_AUTH_WARM_TTL_MS = 12_000`) + 세션 검증 캐시(5s, `TTL_MS = 5_000`) 적중이면 0. 미스면 `validateActiveSessionLight` 의 `Promise.all([profiles, registry])` (`server-guards.ts:258-285`) | **0** (따뜻) / 1 (+getClaims) |
| 2 | 속도 제한 ‖ 방 확인 | `messengerRoomCanonicalOrJsonError` — 캐시 **적중이어도** `recheckActiveMessengerParticipant` → `loadMessengerRoomAccess` = `rpc("community_messenger_room_access")` (`canonical-resolve-api.ts:131-135`, `core.ts:74`, `messenger-room-access.ts:41`). 미스면 같은 RPC 1회. Redis 속도제한은 병렬 | **1** (문서 「0~1」은 틀림 — 최소 1) |
| 3 | 프로필 필수 항목 | `require-profile-completion.server.ts:44-50` `from("profiles").select(...)` (profile 인자 미전달) | **1** |
| 4 | 인증 회원 | `member-access.ts:629-635` profiles SELECT → `:646` `hasActiveAdminMembershipOrLegacyRole` (판정 캐시 15s/60s, `admin-membership.ts:57-61`) → `:705` `resolveRequiredConsentVersions()` (모듈 캐시) | **1** (따뜻) ~ 3 (문서 「2」 — 캐시 상태 따라 1~3) |
| 5 | 그룹 확인 | `service.ts` send: `assertActiveGroupMembershipIfGroup({ userId, roomId, supabase: sb })` — roomType 미전달 → `loadCommunityMessengerRoomType` rooms SELECT (`group-active-membership-gate.ts:106-109`). **단계 2 에서 이미 읽은 `canon.access.roomType` 을 버리고 다시 읽음** | **1** |
| 6 | 1:1 차단 | `direct-room-communication-gate.ts:178-196` (rooms‖product_chats‖store_orders) → `:209` `resolveDirectRoomPeer` (rooms‖participants, `:80`) → `:228` `user_social_relations` → `:238` `community_friend_requests` | **4** |
| 7 | 원자 저장 RPC | `service.ts trySendCommunityMessengerTextAtomic` `sb.rpc("community_messenger_send_text_message", ...)` | **1** |
| 8 | 배지 대상 bump | `notification-target-messenger-bridge.ts:194-199` 4쿼리 병렬 1회 → `:233-254` `for (const uid of recipientIds) { ... await bumpChatRoomTargetFromMessengerParticipant(...) }` → `notification-targets.ts` `sb.rpc(UPSERT_NOTIFICATION_TARGET_RPC)` (actor 미전달이라 차단 조회 없음) | **1 + N = 2** |
| 9a | pre-ACK: 방 필드 | `community-messenger-send-post-ack-effects.ts:103-108` `if ((!chatDomain \|\| !roomType) && roomId) { ... from("community_messenger_rooms").select("chat_domain, room_type, direct_key") ...}` | **1** |
| 9b | pre-ACK: 표시 공통 | `load-message-notification-display-context.ts` `loadMessageNotificationDisplaySharedContext`: `const bootstrapRoom = await loadRoomContext(...)` (rooms) → `await Promise.all([profiles, loadMessageRow, user_settings, loadRoomContext(...)])` — **rooms 를 두 번째로 또 읽음** | **2** (문서는 1) |
| 9c | pre-ACK: 수신자별 | `notify-message-pipeline.ts:210-363` 루프 안 순차: `isNotificationBlockedForRecipient`(user_social_relations) → `isRoomMutedForUser`(participants) → `loadRecipientPresenceSnapshot`(presence_snapshots) → `buildRecipientMessageNotificationDisplay` 내부 `loadNotificationUserLanguage` (user_settings‖devices 병렬) → `createAndDispatchNotificationEvent` (`notification_events` INSERT) → `markChatPushHandoffPending` (`notification_events` UPDATE) | **6N = 6** (문서 「≈5」) |
| 9d | 수신자가 같은 방 전면(presence) | `notify-message-pipeline.ts:359-360` `if (decisionSnapshot.suppressReasons.includes("auto_read_same_room")) { await markRoomRead(sb, recipientUserId, roomId); }` → `notify-read-service.ts:74-75` events UPDATE + `clearTargetsAfterRoomReadBestEffort` (→ `clearNotificationTarget` + `clearMessengerRoomNotificationTargetAfterRead` 병렬1+clear1) | **+3~4** (문서 누락) |

**합계(일반 1:1, N=1, 따뜻한 캐시, 상대가 방 밖)**: 0 + 1 + 1 + 1 + 1 + 4 + 1 + 2 + 1 + 2 + 6 = **20**.
- 상대가 같은 방을 열고 있을 때(대화 중 일반 상황): **≈23~24**.
- 인증 콜드 +1, 관리자·동의 캐시 미스 +1~2.
- 문서 「18~20」은 **하한 쪽으로 과소**. 판정 **PARTIAL**. 문서 표의 오류: ①단계1 「0~1」→1(최소), ②단계3 「2(순차)」→1~3, ③단계8 「1+1+5N」→1+2+6N(+자동 읽음 3~4).
- 그 밖의 순차 대기: `await import(...)` 동적 모듈 로드 다수(route 326, 329, 347; 서비스 내부). 콜드 인스턴스에서만 의미.

## A2. 수신자 순차 루프 — CONFIRMED

```ts
// notification-target-messenger-bridge.ts:233-254
for (const uid of recipientIds) {
  if (kind === "trade") { await bumpTradeTargetForMessengerRoomRecipients(sb, {...}); continue; }
  if (kind === "delivery") { await bumpDeliveryTargetForRecipient(sb, {...}); continue; }
  await bumpChatRoomTargetFromMessengerParticipant(sb, {...});
}
// notify-message-pipeline.ts:210-214
for (const recipientUserId of recipients) {
  ...
  const blocked = await isNotificationBlockedForRecipient(sb, recipientUserId, senderUserId);
```
추가: 거래 방은 수신자마다 `product_chats` 를 다시 읽는다(`bumpTradeTargetForMessengerRoomRecipients` 를 `recipientUserIds: [uid]` 로 1명씩 호출 → `:320-324` 매번 SELECT).

## A3. pre-ACK 목적 · 통화 코드 접촉 — PARTIAL

목적(인용, CONFIRMED):
```ts
// route.ts:313-322
 * Await target bump BEFORE ACK so a fast room-open mark_read cannot clear before
 * the unread write lands (measured group/SO race: after() bump after mark_read).
 * Durable notification_events accept BEFORE ACK (44e7073fe — after() historically
 * stalled event inserts ~2026-07-22). FCM/OS push + item_trade mirror run in after()
// post-ack-effects.ts:6-11
 * - `44e7073fe`: Production `after()` often never persisted `notification_events`
 * - PRE_ACK: durable `notification_events` accept (+ badge invalidate) — preserves 44e7073fe.
```
**두 가지 선행 불변식**이 있다: (i) 배지 target bump 가 mark_read 보다 먼저, (ii) notification_events 가 응답 전에 확정.

통화 접촉 — 문서의 「통화·VoIP 코드는 이 경로에 없음(타입 import 만)」은 **틀림**. 이 경로가 **통화 경로와 공유하는 함수**를 호출한다:
1. `publishMessengerRoomBumpAfterMutation` — 통화 기록 경로가 같은 함수를 쓴다: `app/api/community-messenger/calls/stub-message/route.ts:117` `await publishMessengerRoomBumpAfterMutation({`, `lib/community-messenger/call-authority/call-chat-projection-authority.ts:11`, 함수 본문 `publish-messenger-room-bump.ts:128-139` 「통화 기록 저장 4경로 모두 … 이 함수를 부른다」.
2. `dispatchNotificationEvent` (after 안) — `notification-event-dispatcher.ts:64-66` `dispatchNotificationPushIfAllowed(sb, row, { callPushKind: row.type === "missed_call" ? "missed_call" : undefined })` → 부재중 통화 푸시와 공유(`notify-push-dispatcher.ts:188`).
3. `markChatPushHandoffPending` 모듈 — `chat-notification-push-handoff.ts:57` `const CHAT_CALL_TYPES = new Set(["missed_call", "incoming_call_signal"])` (통화 이벤트 handoff 와 같은 파일).
4. `createNotificationEvent` — `call_session_id` 컬럼을 쓰는 공용 저장 함수.
- **결론**: 텍스트 전송 경로 자체는 통화를 발신하지 않는다(VoIP/FCM 통화 발송 호출 없음 — CONFIRMED). 그러나 위 공용 함수를 **수정**하면 통화 경로가 바뀐다 → 통화 변경 규정 1번 적용 대상. 설계(PART B)는 이 4개 파일을 **수정하지 않는다**.

## A4. 방 bump 는 after() 안 + 재조회 — CONFIRMED

```ts
// route.ts:369-381
after(async () => {
  ...
  await publishMessengerRoomBumpAfterMutation(bumpArgs);
// publish-messenger-room-bump.ts:70-77
const [{ data: roomRow }, { data: participantRows }] = await Promise.all([
  sbForBadge.from("community_messenger_rooms").select("room_type, direct_key, chat_domain, domain_identity").eq("id", canon).maybeSingle(),
  sbForBadge.from("community_messenger_participants").select("user_id, left_at, cleared_at").eq("room_id", canon),
]);
// :153 await publishCommunityMessengerRoomBumpFromServer(...) → private-broadcast-server.ts:53 postRealtimeBroadcastRest
```
그룹이면 `listActiveGroupRecipientUserIds` 1왕복 추가(`:90-97`). 즉 bump 는 「응답 생성 → after 시작 → DB 1~2 → REST 1」 뒤에 나간다.

## A5. RPC 반환 — CONFIRMED (저장소 기준)

저장소 최신 정의(`supabase/migrations/20270414160000_wp6_chat07_unread_exclude_banned.sql:277-283`, 이후 `20270629120000_cm_unarchive_on_incoming_activity.sql` 는 pg_get_functiondef 문자열 치환으로 is_archived 만 추가):
```sql
RETURN jsonb_build_object(
  'ok', true,
  'deduped', false,
  'message', to_jsonb(v_msg),
  'recipient_user_ids', coalesce(v_recipients, '[]'::jsonb),
  'room_direct_key', to_jsonb(v_room.direct_key)
);
```
TS 는 이미 읽으려 한다:
```ts
// service.ts trySendCommunityMessengerTextAtomic
roomType: typeof payload.room_type === "string" ? payload.room_type : null,
chatDomain: typeof payload.chat_domain === "string" ? payload.chat_domain : null,
```
→ 항상 null → `resolveRoomNotifyFields` 의 rooms SELECT(`post-ack-effects.ts:103-108`) 가 매번 실행. 문서는 「운영 함수 정의로 확인」이라 했으나 이번 검증은 DB 미조회 → 운영 정의는 **NOT_PROVEN**(저장소 마이그레이션 기준 CONFIRMED).

## A6. 수신 측 — CONFIRMED

(a) 상대 메시지마다 단건 GET:
```ts
// own-room-bump-origin-policy.ts:59
if (!isOwnAuthoredRoomBump(input)) return "apply";
// use-messenger-room-bump-broadcast-subscription.ts (flush)
if (item.ownDecision === "replace_pending" && !snapshotTruncated) continue;
if (item.ownDecision === "merge_only" && mergedSnapshot && !snapshotTruncated) continue;
needsCatchUp = true;   // ← 상대 메시지("apply")는 스냅샷 병합 성공이어도 항상 여기
// use-messenger-room-remote-catchup.ts catchUpAfterRemoteBump
const single = hint ? await tryMergeSingleMessageFromBump(hint) : "failed";
// tryMergeSingleMessageFromBump: fetchJson(`${communityMessengerRoomResourcePath(rid)}/messages/${encodeURIComponent(mid)}`)
```
코드 주석이 의도를 밝힘: 「Remote bump = invalidation signal (not status authority). Always reconcile by message id when hinted … Snapshot merge (if any) is acceleration only.」 → 정책 문서(`messenger-realtime-policy.md:37` 「snapshot 병합 성공 시 단건 GET 은 생략」)와 **불일치**.

(b) applyIncomingMessageEvent 2회: 스냅샷 병합 시 flush 안 `applyIncomingMessageEvent({...})` 1회 + 단건 GET 성공 시 `projectHubTipAfterCatchUpMerge` → `applyIncomingMessageEvent` 1회. `setRoomMessages(mergeRoomMessages)` 도 2회.

(c) 읽음 신호마다 강제 silent bootstrap:
```ts
// use-messenger-room-client-phase1.ts:1382-1386
if (applySource !== "entry_silent") {
  queueMicrotask(() => {
    forgetMessengerRoomClientBootstrapFlights({ roomId: ledgerRoomId, viewerUserId: uid });
    void refresh(true, { forceSilentNetwork: true, triggerReason: "read_patch_force_network" });
```
(d) 참가자 UPDATE → meta 스케줄 → onRefresh → after= → (없으면) silent refresh:
```ts
// global-messenger-room-bundle-channel.ts (participants 핸들러)
getOrCreateRoomSchedulers(entry, roomKey).meta.schedule();   // 내 행·상대 행 구분 없음
// phase1:1491-1502
onRefresh: () => { void (async () => {
  const mergedNewMessages = await catchUpNewerMessages();
  if (!mergedNewMessages) { void refresh(true, { triggerReason: "realtime_on_refresh" }); }
```
**추가 발견**: 전송 RPC 가 방의 모든 활성 참가자 행을 UPDATE 한다(`UPDATE public.community_messenger_participants p SET unread_count = CASE ... WHERE p.room_id = p_room_id AND (p.left_at IS NULL)`) → 1:1 메시지 1건마다 participants UPDATE **2건** → 양쪽 기기 모두 meta 스케줄 → `after=` GET. 즉 수신 측은 메시지 1건에 bump·postgres INSERT·participants UPDATE 세 경로가 겹친다(INSERT 경로 `use-messenger-room-realtime-message-ingest` 세부는 이번에 추적하지 않음 — NOT_PROVEN).

## A7. X4 — 같은 토픽 재생성 버그

### 라이브러리 소스 (CONFIRMED)

```js
// realtime-js/dist/main/RealtimeClient.js:277-287
channel(topic, params = { config: {} }) {
  const realtimeTopic = `realtime:${topic}`;
  const exists = this.getChannels().find((c) => c.topic === realtimeTopic);   // 상태 무시
  if (!exists) { const chan = new RealtimeChannel(...); this.channels.push(chan); return chan; }
  else { return exists; }
}
// RealtimeClient.js:213-219
async removeChannel(channel) {
  const status = await channel.unsubscribe();
  if (this.channels.length === 0) { this.disconnect(); }
  return status;
}
// RealtimeClient.js:450-452
_remove(channel) { this.channels = this.channels.filter((c) => c.topic !== channel.topic); }  // 토픽 단위 제거
// RealtimeChannel.js:363-388
unsubscribe(timeout = this.timeout) {
  this.state = CHANNEL_STATES.leaving;
  ...
  leavePush.send();
  if (!this._canPush()) { leavePush.trigger('ok', {}); }     // 미가입이면 즉시 close
// RealtimeChannel.js:81-86 (생성자)
this._onClose(() => { ...; this.state = CHANNEL_STATES.closed; this.socket._remove(this); });
// RealtimeChannel.js:122-127
subscribe(callback, timeout = this.timeout) {
  if (!this.socket.isConnected()) { this.socket.connect(); }
  if (this.state == CHANNEL_STATES.closed) { ... join ... }
  return this;                                                // leaving 이면 아무것도 안 하고 콜백도 등록 안 함
```
결과: **가입(joined) 상태** 채널을 `void removeChannel` 한 직후 같은 토픽으로 `sb.channel()` → 같은 객체(leaving) 반환 → `.on()` 은 그 객체에 붙고 → `subscribe()` 는 무동작·상태 콜백 미등록 → leave 응답 도착 시 `_remove` 로 소켓에서 빠짐 → **조용히 죽음, 재시도 없음**. (미가입 상태 채널이면 `_canPush()` false 로 동기 close → 문제 없음.)

### setAuth 전파 (CONFIRMED — 재구독 불필요)

```js
// RealtimeClient.js:742-756 (_performAuth)
if (this.accessTokenValue != tokenToSend) {
  this.accessTokenValue = tokenToSend;
  this.channels.forEach((channel) => {
    tokenToSend && channel.updateJoinPayload(payload);
    if (channel.joinedOnce && channel._isJoined()) {
      channel._push(CHANNEL_EVENTS.access_token, { access_token: tokenToSend });
```
```js
// supabase-js/dist/index.mjs _handleTokenChanged
if ((event === "TOKEN_REFRESHED" || event === "SIGNED_IN") && this.changedAccessToken !== token) {
  this.changedAccessToken = token; this.realtime.setAuth(token);
```
앱도 직접 호출: `lib/supabase/client.ts` `sb.auth.onAuthStateChange((event, session) => { ... void sb.realtime.setAuth(t); if (event === "TOKEN_REFRESHED") { dispatchSamarketRealtimeTokenRefreshed(); } })`. 즉 가입된 채널은 이미 새 토큰을 받는다. 그 뒤 앱 이벤트가 재구독을 일으켜 **오히려 채널을 죽인다**. 하트비트마다 `_setAuthSafely('heartbeat')`(`:398`)도 있다.

### 같은 토픽을 await 없이 재생성하는 메신저 호출처 전부 (통화 전용 파일 제외)

| # | 파일·함수 | 토픽 | 재생성 트리거 | 판정 |
|---|---|---|---|---|
| R1 | `realtime/cm-read-ack-broadcast-client.ts:73-99` `subscribeReadAckChannel` | `cm-read-ack:<room>` | 토큰 갱신 이벤트(`:96-99`) — `void sb.removeChannel(ch); ch = null; ch = sb.channel(같은이름)` | CONFIRMED |
| R2 | `realtime/global-messenger-room-bundle-channel.ts` `bindFilteredPostgresSubscriptions` → `subscribeWithRetry` | `global-messenger:bundle:<viewer>:<chunk>` | **방 목록 변화마다**(`notifyRoomListenersChanged` → 키 바뀜 → `for (const ch of channels) ch.stop()` 후 같은 이름 생성) + 토큰 갱신(`:629-639`, `lastBoundRoomIdsKey = ""`) | CONFIRMED — 문서보다 넓음(방 입장·퇴장마다) |
| R3 | `use-community-messenger-realtime.ts:497-515` `attachChannelsForFingerprint` → `community-messenger-home-realtime-channels.ts` | `community-messenger-home:meta:<uid>`, `community-messenger-home:rooms-in:<uid>:<offset>` | 홈 방 지문 변화(`rooms_fingerprint_diff_rebind`) + 토큰 갱신(`:604-613`) | CONFIRMED (문서 누락) |
| R4 | `realtime/typing/use-community-messenger-room-typing.ts:43-75` | `community-messenger-typing:<room>` | effect deps `[args.peerUserId, args.roomId, args.viewerUserId]` 변화 — 예: peerUserId 가 늦게 채워짐, 같은 방 빠른 재진입 | CONFIRMED(패턴) · 실제 발생 빈도 NOT_PROVEN |
| R5 | `room/use-messenger-room-bump-broadcast-subscription.ts` `createRoomBumpEntry` / `entry.stop` (`void sb.removeChannel(ch)`) → `realtime/room-bump-broadcast.ts:38` | `community-messenger-room-bump:<room>` | effect deps(`catchUpAfterRemoteBump`(streamRoomId 변경 시 새 식별자), `snapshot?.room?.id`, `roomReadyForRealtime` 등) 변화·같은 방 빠른 재진입 | CONFIRMED(패턴) · 빈도 NOT_PROVEN |
| R6 | `room/use-messenger-room-friendship-sync.ts:174-206` | `cm-room-friendship:<viewer>:<peer>` | deps 에 `refresh` 포함 — refresh 식별자 바뀔 때마다 재구독 | CONFIRMED(패턴). 주의: 이 훅은 `logCallPermission("stale_room_refresh")` 로 **통화 권한 스냅샷**을 갱신 → 통화 인접 |
| R7 | `realtime/home-list-room-insert-broadcast-client.ts:40-62` | `cm-home-list:<uid>` | effect `[userId]` 재실행(드묾) | 패턴만 |
| R8 | `subscribe-with-retry.ts` `resubscribe()` (`void args.sb.removeChannel(channel); ... channel = openChannel();`) | 모든 subscribeWithRetry 이름 | 실패 후 재구독 — 실패 상태 채널은 대개 미가입 → 동기 close → **대부분 안전** | 저위험 |
| — | `subscribeWithRetry` 사용처 중 메신저 외: `use-global-friend-request-feed`, `use-cm-participants-hub-sync`, presence, `notifications-rt` | effect 재실행 시 같은 패턴 가능 | 범위 밖, 보고만 |
| — | **통화 파일**(수정 금지 대상): `call-v4/call-v4-incoming-realtime-feed.ts`, `realtime/cm-incoming-call-realtime-holder.ts`, `use-community-messenger-group-call.ts`, `call-history/use-community-call-history-realtime-sync.ts`, `CommunityMessengerCallClient.tsx`, `call-invite-realtime-broadcast.ts`, `call-video-upgrade-broadcast.ts` | — | — | 이번 설계에서 손대지 않음 |

R2 상세 경합: `subscribeWithRetry` 는 생성 시 동기 `openChannel()`(leaving 객체 획득) 후 `attachSubscribe` 가 `await waitForSupabaseRealtimeAuth` 뒤 `channel.subscribe(...)`. 토큰이 이미 있으면 마이크로태스크만 지나 leave 응답(네트워크 1RTT)보다 먼저 subscribe → 무동작·콜백 없음 → 재시도 없음. leave 응답이 먼저 오면 closed 객체로 join 을 보내지만 소켓 목록에서 빠져 응답이 라우팅되지 않음 → 10s 후 TIMED_OUT → 재시도로 회복. 어느 쪽이든 수신 중단 구간 발생. **운영 재현: NOT_PROVEN.**

## A8. X5 음성 삭제 — PARTIAL

```ts
// service.ts deleteCommunityMessengerVoiceMessage
const { error: delErr } = await (sb as any).from("community_messenger_messages").delete().eq("id", messageId);
...
await recomputeCommunityMessengerRoomLastMessage(sb, roomId);
return { ok: true };
// app/api/community-messenger/rooms/[roomId]/messages/[messageId]/route.ts DELETE — publishMessengerRoomBump 호출 없음
return NextResponse.json({ ok: true });
```
→ bump 없음 **CONFIRMED**. 캐시 무효화(`invalidateRoomBootstrapSnapshotCache`)도 없음(추가 발견).
수신 핸들러: `const rowForId = eventType === "DELETE" ? rawOld : rawNew; const payloadRoomId = typeof rowForId?.room_id === "string" ? ... ; if (!roomKey || !entry.listenersByRoom.has(roomKey)) return;`
저장소: `supabase/migrations/20261202190000_community_messenger_messages_replica_identity_full.sql` → `ALTER TABLE public.community_messenger_messages REPLICA IDENTITY FULL;`. 「RLS 활성 시 DELETE old 레코드에 PK 만」은 Supabase 공식 문서 내용이나 **저장소 문서에 없음** → 이번 검증 기준 **NOT_PROVEN**. (덧붙여 위 A7-R2 로 묶음 채널이 죽어 있으면 DELETE 이벤트 자체를 못 받는다.)

## A9. X6 — CONFIRMED

```ts
// phase1:1290-1308
let createdAtForCursor: string | undefined;
if (lrmStr) {
  const fromLive = roomMessagesRef.current.find((m) => m.id === lrmStr)?.createdAt;
  const fromSnap = snap.messages.find((m) => m.id === lrmStr)?.createdAt;
  ...
}
setSnapshot((prev) => ({ ...prev, readReceipt: { ...prev.readReceipt,
  ...(lrmStr ? { lastReadMessageId: lrmStr } : {}),
  ...(lraStr ? { lastReadAt: lraStr } : {}),
  ...(createdAtForCursor != null ? { lastReadMessageCreatedAt: createdAtForCursor } : {}),   // 못 찾으면 옛 시각 유지
```
```ts
// CommunityMessengerRoomPhase2MessageTimeline.tsx (useMemo)
if (!cMsg && mMsg && cursorCreatedAtServer) {
  const tb = new Date(mMsg.createdAt).getTime(); const tc = new Date(cursorCreatedAtServer).getTime();
  if (tc < tb) return { ..., peerHasReadMyLatestMessage: false };   // 옛 시각 → 「안 읽음」
```
```ts
// merge-community-messenger-silent-delta.ts
rr && rr.lastReadMessageId && (!prevRr || readReceiptIsNewer(rr.lastReadAt, prevRr.lastReadAt)) ? {...} : prevRr;
// readReceiptIsNewer: n > p — 같은 lastReadAt 이면 거절 → 서버의 올바른 lastReadMessageCreatedAt 도 버려짐
```
문서 파일명 `MessageTimeline.tsx` 는 실제 `components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageTimeline.tsx`. 자가 회복 조건: 커서 메시지가 나중에 목록에 들어오면 memo 재계산으로 해소(예: 내 낙관 행이 확정 id 로 바뀔 때). 커서 id 가 끝내 목록에 없으면(숨김·통화 기록·창 밖) 고착.

## A10. X7 — CONFIRMED (+확장)

```ts
// notification-target-messenger-bridge.ts:196
sb.from("community_messenger_participants").select("user_id, left_at").eq("room_id", roomId),
// :224-229 (비그룹)
for (const row of (participants ?? []) as Array<{ user_id?: unknown }>) {
  const uid = ...; if (!uid || uid === fromUserId) continue; recipientIds.push(uid);   // left_at 무시
```
확장(문서 누락): RPC 비그룹 분기도 미필터
```sql
FROM public.community_messenger_participants
WHERE room_id = p_room_id AND user_id <> p_sender_id;   -- left_at 조건 없음
```
→ `recipient_user_ids` → `notifyMessagePipeline` 이 나간 참가자에게 `notification_events` 를 만들 수 있다. 일반 1:1 은 `readmitLeftGeneralDirectPeerForSend` 가 먼저 되살리므로 영향이 거래·주문 방 쪽에 한정될 가능성(NOT_PROVEN). 이 RPC 필터는 **동작 변경**이므로 PART B 에 넣지 않고 Owner 결정 필요로 남긴다.

## A11. 정책 문서 — CONFIRMED (불일치)

`docs/messenger-realtime-policy.md:34` 「메시지·미디어 mutation 직후 서비스 롤이 Realtime Broadcast 로 bump 전송. **응답 본문 전에 `await` 로 전송 완료를 보장.**」 ↔ 코드 `route.ts:369-381` after() 안, 테스트 `post-ack-after-order.test.ts` 「does not await bump before ACK return (stays inside after)」. `:37` 「snapshot 병합 성공 시 단건 GET 은 생략」 ↔ A6(a).

---

# PART B — 구현 설계 (기능 불변 · durable 알림 보장 유지)

## B0. 원칙·불변식 (깨면 안 되는 것)

- **I1 배지 선행**: 수신자 `notification_targets` bump 가 수신자 mark_read 보다 먼저 커밋(route.ts:313-316 실측 경합).
- **I2 durable 알림**: `notification_events` INSERT(+handoff pending) 가 응답 전 확정(44e7073fe).
- **I3 방 bump 는 서버만**(클라 발행 금지) — 유지.
- **I4 bump 는 I1 이후**: bump 를 받은 수신자가 즉시 mark_read 할 수 있으므로 bump 발행은 target bump 완료 뒤.
- **I5 자동 읽음 순서**: `notifyMessagePipeline` 의 `markRoomRead`(auto_read_same_room) 는 target bump 뒤(현재 순차라서 보장됨).
- **I6 오류 우선순위**: 여러 게이트가 동시에 실패할 때 지금과 같은 오류를 돌려준다(프로필 → 회원 → 그룹 → 차단 → RPC).
- **I7 통화 무접촉**: 아래 파일은 **수정하지 않는다** — `publish-messenger-room-bump.ts`, `notification-event-dispatcher.ts`, `chat-notification-push-handoff.ts`, `notification-event-repository.ts`, `subscribe-with-retry.ts`, `cm-rt-channel-registry.ts`, 통화 전용 파일 전부. 이것을 지키면 통화 변경 규정 3번(사전 승인) 대상이 아니다. 지키지 못하는 항목은 각 항목에 「통화 접촉」으로 표시했다.

> 「bump 를 RPC 직후 즉시」(문서 D3-a)는 **I4 와 충돌**한다(I1 이 아직 안 끝난 상태에서 수신자가 mark_read → 늦게 도착한 target bump 가 배지를 되살림 — route 주석의 실측 경합 재발). 아래 B2 는 「target bump 직후」로 바꾼다. 문서 D3-a 와 이 설계의 **충돌을 그대로 보고**한다(규정 7).

## B1. DB — 전송 RPC 반환 필드 추가 (Owner 승인 필요 · 운영 DB 적용)

- 변경: `community_messenger_send_text_message` 의 성공 반환 3곳(정상·dedupe·unique_violation dedupe)에 필드 추가.
```sql
-- 개념 diff (운영 현재 정의를 pg_get_functiondef 로 읽어 치환 — 20270629120000 와 같은 방식, 앵커가 정확히 3번 아니면 중단)
-  'room_direct_key', to_jsonb(v_room.direct_key)
+  'room_direct_key', to_jsonb(v_room.direct_key),
+  'room_type', to_jsonb(v_room.room_type),
+  'chat_domain', to_jsonb(v_room.chat_domain),
+  'domain_identity', to_jsonb(v_room.domain_identity)
```
  - `v_room` 은 `SELECT r.* INTO v_room FROM community_messenger_rooms r ...` 로 이미 읽은 행 → 추가 쿼리 0. `domain_identity` 컬럼 존재는 `publish-messenger-room-bump.ts:73` select 로 코드상 확인, **운영 컬럼 존재는 적용 전 `information_schema.columns` 로 확인 필요**(AGENTS 10번).
  - 함수 시그니처·반환형(jsonb) 불변 → 권한·호출처 영향 없음.
- 호환: 현재 배포 코드는 `typeof payload.room_type === "string" ? ... : null` 로 이미 읽음 → **DB 먼저 적용해도 안전**, 적용 즉시 `resolveRoomNotifyFields` 의 rooms SELECT 가 사라짐(코드 변경 0). 옛 코드는 모르는 키를 무시. 네이티브 무관.
- 효과: 응답 전 −1 왕복. B2 의 bump 재조회 제거 재료.
- 롤백: 이전 정의(적용 직전 `pg_get_functiondef` 백업)로 `CREATE OR REPLACE`. 코드는 null 처리 경로가 그대로라 동작 복귀.
- 같은 방식으로 `community_messenger_room_access` 를 바꿀 필요는 없음(B3 은 기존 반환만 사용).

## B2. 서버 전송 경로 순서 (route.ts · 텍스트 전용 새 함수)

### 변경 목록

| 파일·함수 | 이전 | 이후 |
|---|---|---|
| `notification-target-messenger-bridge.ts` `bumpMessengerRoomTargetsForRecipients` | 수신자 for-await | `await Promise.all(recipientIds.map(...))`. 거래: `product_chats` 1회 읽고 `bumpTradeTargetForMessengerRoomRecipients(sb,{recipientUserIds: recipientIds})` 1회 호출(이 함수 안 루프도 `Promise.all`). 반환에 `{ roomType, directKey, kind, recipientIds }` 추가(기존 호출처는 void 로 무시 — 호환) |
| `notify-message-pipeline.ts` `notifyMessagePipeline` | 수신자 for-await, 루프 안 6왕복 순차 | ① 수신자별 `Promise.all([block, muted(멘션 아니면), presence, language])` 1왕복 → display 빌드 → INSERT → handoff pending (3 순차). ② 수신자들끼리 `Promise.all`. ③ 새 옵션 `deferAutoRead?: boolean` — true 면 `markRoomRead` 를 실행하지 않고 결과에 `autoReadRecipientIds` 로 돌려줌(기본 false = 기존 호출처 동작 불변). `buildRecipientMessageNotificationDisplay` 가 언어를 읽으므로 언어를 인자로 받는 내부 변형 추가(공개 함수 시그니처 유지) |
| `load-message-notification-display-context.ts` `loadMessageNotificationDisplaySharedContext` | `loadRoomContext` 를 두 번(순차 1 + 병렬 1) | `resolvedRoomKind === input.roomKind`(또는 room 행 재사용 가능) 일 때 첫 결과 재사용 → 병렬 블록에서 rooms 쿼리 제거, 첫 rooms 쿼리를 병렬 블록에 합쳐 1왕복. 단, `loadRoomContext` 는 roomKind 에 따라 이름(`group` 대체 이름)만 다르게 만드는 순수 변환이므로 **행 1회 읽고 변환 2회**로 같은 결과 |
| `community-messenger-send-post-ack-effects.ts` `runCommunityMessengerSendDurablePreAckEffects` | target bump 끝난 뒤 순차 실행 | `notifyMessagePipeline(..., { deferPush: true, deferAutoRead: true })` 로 호출, 결과 `autoReadRecipientIds` 를 반환 객체에 포함 |
| **새** `lib/community-messenger/server/publish-text-send-room-bump.ts` `publishTextSendRoomBump(prefetched)` | (없음) | 텍스트 전송 전용. 입력: canonical/raw id, fromUserId, message, `roomType/chatDomain/domainIdentity`(B1 RPC), `recipientUserIds`(RPC). 동작: `invalidateRoomBootstrapRouteCacheForRoom`·`invalidateRoomBootstrapSnapshotCache`(기존과 같은 대상) → 답장(`replyToMessageId`)일 때만 participants `cleared_at` 1회 조회(기존 S-2 H 규칙 그대로) → `publishCommunityMessengerRoomBumpFromServer` (기존 공용 발행기 **호출만**, 수정 없음). RPC 필드가 null(B1 미적용)이면 기존 `publishMessengerRoomBumpAfterMutation` 을 그대로 호출(폴백) |
| `route.ts` POST | target bump → durable → (응답) → after(bump → FCM) | 아래 순서 |

### 새 순서 (route.ts POST)

```
RPC 성공
 ├─ P_target  = bumpMessengerRoomTargetsForRecipients(...)        // I1
 ├─ P_durable = runCommunityMessengerSendDurablePreAckEffects(...)  // I2 (deferAutoRead)
 │   (둘은 서로 다른 표: notification_targets vs notification_events → 병렬)
 ├─ await P_target
 ├─ P_bump = publishTextSendRoomBump(...); after(P_bump)            // I4: target 뒤, durable 과 병렬, 응답을 기다리지 않음
 ├─ await P_durable
 ├─ autoRead 수신자: await Promise.all(markRoomRead(...))           // I5: target 뒤 (P_target 완료 후라 보장)
 ├─ 응답
 └─ after(async () => runCommunityMessengerSendDeferredPostAckEffects(...))  // FCM·미러 — 기존 그대로
```
- `after(promise)` 지원: `node_modules/next/dist/server/after/after.d.ts` `export type AfterTask<T> = Promise<T> | AfterCallback<T>; export declare function after<T>(task: AfterTask<T>): void;` (16.1.7). 프로미스는 **즉시 실행**되고 `after` 는 수명만 붙잡는다.
- `markRoomRead` 를 응답 전에 두는 이유: 지금도 응답 전(파이프라인 안)이다 → 동작 동일.

### 의미 동등성

- target bump: 같은 수신자 집합·같은 RPC(`upsert`)·같은 인자. 수신자 간 독립 행(user_id 별) → 순서 무관. idempotent RPC(`data === false` no-op).
- 알림 파이프라인: 수신자별 판정 입력(차단·음소거·presence·언어)은 모두 읽기 → 병렬화해도 같은 값. 멘션이면 muted 조회 생략 규칙 그대로. INSERT dedupe 키 동일 → 중복 시 23505 → 기존과 같이 skip. `decisionSnapshotsByRecipientId`·`deferredPushes` 는 객체·배열 수집 순서만 달라짐(소비처 `deferredPushes` 는 for-of 전송 → 수신자 간 FCM 순서만 달라짐, 의미 동일).
- target bump ‖ durable 병렬: 두 작업이 공유하는 쓰기는 `markRoomRead` 의 target clear 뿐 → `deferAutoRead` 로 target bump 뒤로 미룸(I5).
- bump 시점: 기존 「durable 뒤·응답 뒤」 → 새 「target 뒤·durable 과 병렬」. 차이 = 수신자가 notification_events INSERT 전에 메시지를 볼 수 있음. 이미 postgres_changes INSERT(RPC 커밋 즉시)로 같은 상황이 존재하므로 **새 경합은 아님**. 단, bump 경로가 가장 빠른 경로가 되므로 빈도는 늘 수 있다 → 위험 R-B2-1.

### 위험·회귀

- **R-B2-1** 수신자가 방에서 즉시 mark_read → 아직 INSERT 전인 `notification_events` 는 unread 로 남을 수 있음(종 배지). 완화: 파이프라인 presence 자동 읽음(같은 방 전면 → INSERT 직후 markRoomRead)이 같은 상황을 덮음. presence 가 오래됐으면 남음. **검증 필수**(B9 측정 ③). 위험이 확인되면 bump 를 `await P_durable` 뒤로 옮긴다(여전히 응답 전 시작 → 기존보다 빠름) — 이 대안은 의미가 기존과 100% 같다. **기본 권장 = 대안(보수안)**: `await P_target; await P_durable; P_bump=...; after(P_bump)` — 지연 이득은 durable 병렬화·재조회 제거로 대부분 확보.
- **R-B2-2** 병렬 쿼리 수 증가 → Supabase 연결/PostgREST 동시성. 수신자 N 이 큰 그룹(수백)에서 `Promise.all` 폭주 → **동시성 상한 8** 의 작은 풀로 제한.
- **R-B2-3** 테스트 계약 변경: `post-ack-after-order.test.ts`(「bump stays inside after」 — `after(P_bump)` 이므로 유지 가능하나 소스 문자열 검사 수정 필요), `cm-send-domain-target-bump-before-ack-contract.test.ts`(`await bumpMessengerRoomTargetsForRecipients` 문자열 검사 → `await P_target` 로 수정), `call-stub-room-bump-parity.test.ts`(공용 함수 불변이라 통과해야 함).
- **R-B2-4** `bumpMessengerRoomTargetsForRecipients` 반환형 변경 — 다른 호출처(`publish-messenger-room-bump.ts:183` 등)는 반환값 미사용 → 호환. 단 `publish-messenger-room-bump.ts` 가 이 함수를 호출하므로 **병렬화가 통화 기록 bump 경로(skipBadgeTargetBump 아닐 때)의 target 쓰기 순서도 바꾼다** → 「통화 접촉(간접)」. 회피안: 병렬 버전을 새 함수 `bumpMessengerRoomTargetsForRecipientsParallel` 로 두고 텍스트 route 만 사용 → I7 유지. **권장 = 새 함수.** 같은 이유로 `notifyMessagePipeline` 변경도 새 옵션 기본값 false + 병렬화는 `opts.parallelRecipients === true` 일 때만(통화 부재중 알림이 이 파이프라인을 쓰는지는 NOT_PROVEN — grep `notifyMessagePipeline(` 호출처 확인 후 결정).

### 롤백

route.ts 한 파일 되돌리면 이전 순서 복귀(새 함수·옵션은 미사용 상태로 남아 무해).

## B3. 게이트 병합 (응답 전 7~9 → 2~3 왕복)

| 파일·함수 | 이전 | 이후 |
|---|---|---|
| route.ts | profile(1) → member(1~3) 순차 | `profiles` 를 **1회** 합집합 컬럼으로 읽어 `requireProfileFieldsForAction(sb, userId, action, profile)`(4번째 인자 이미 지원) + `loadMemberAccessState` 에 `profileRow` 선택 인자 추가(없으면 기존대로 읽음) |
| route.ts → service | group gate 가 rooms 재조회 | `canon.access?.roomType` 를 `sendCommunityMessengerMessage({ roomTypeHint })` → `assertActiveGroupMembershipIfGroup({ roomType })`(이미 지원: 「When roomType already known, skip room_type SELECT」). 그룹이면 `canon.access.banned/groupParticipant` 로 판정 가능하나 **기존 함수 경로 유지**(그룹은 ban·participant 조회 2회 그대로) |
| `direct-room-communication-gate.ts` | 4 순차 | ① `domainEvidence` 3쿼리 ‖ `resolveDirectRoomPeer` 2쿼리 동시(둘 다 roomId 만 필요) → ② `fetchBlockedPairFromSb` ‖ `fetchFriendRequestRejectedByPeer` 동시 → 결과는 **기존 순서로 평가**(blocked 먼저, 그다음 rejected). 2 왕복 |
| route.ts | 프로필·회원 → (service) 그룹 → 차단 | 프로필·회원 프로미스와 차단 게이트 프로미스를 **동시에 시작**, 결과를 I6 순서로 검사. `readmitLeftGeneralDirectPeerForSend`(쓰기)는 모든 게이트 통과 확인 뒤에만 실행(지금과 같음) |

- 동등성: 모두 읽기 → 같은 입력에 같은 결과. 오류 우선순위는 평가 순서로 보존(I6). 낭비: 거래 방에서 peer 조회 1개(불필요해도 읽기만).
- 통화 접촉: `direct-room-communication-gate.ts` 헤더에 「message/call/push/incoming」이라 적혀 있으나 import 처는 `service.ts`(전송) · `server/assert-messenger-room-send-allowed.ts`(이미지·파일·음성 라우트)뿐 — grep 확인. **통화 라우트 import 없음(CONFIRMED by grep)**. 그래도 변경 PR 설명에 명시.
- 위험: `loadMemberAccessState` 는 회원·관리자 공용 → 선택 인자 추가만, 기존 호출 무변경.
- 효과: 응답 전 왕복 = 인증0 + 방확인1 + max(프로필·회원 1~3, 차단 2) + 그룹(1:1은 0) + RPC1 + max(target 2, durable 1+1+4) + (자동 읽음 3~4) ≈ **9~10 (방 밖) / 12~14 (같은 방)**. B1 적용 시 −1.

## B4. Realtime 채널 재구독 (X4 · 모든 호출처)

### SSOT 도우미 (메신저 전용, 통화 무접촉)

새 파일 `lib/community-messenger/realtime/messenger-channel-topic-lease.ts`:
```ts
const pendingRelease = new Map<string, Promise<unknown>>();   // key = "realtime:"+topic
export function releaseMessengerChannel(sb, ch): void {
  const key = ch.topic;
  const p = sb.removeChannel(ch).catch(() => "error").finally(() => { if (pendingRelease.get(key) === p) pendingRelease.delete(key); });
  pendingRelease.set(key, p);
}
export async function whenMessengerTopicFree(sb, topic): Promise<void> {
  const key = `realtime:${topic}`;
  const p = pendingRelease.get(key);
  if (p) await p;                                   // realtime-js unsubscribe 는 ok/timeout(기본 10s)/error 로 항상 끝남
  const stale = sb.getChannels().find((c) => c.topic === key && c.state !== "joined" && c.state !== "joining");
  if (stale) await sb.removeChannel(stale).catch(() => undefined);   // 추적 밖에서 leaving 인 채널(subscribeWithRetry 가 void 로 지운 것)
}
```
주의: `removeChannel` 은 남은 채널 0개면 `disconnect()` → 다음 subscribe 가 재연결(비용 1회). 메신저 화면에서는 다른 채널이 항상 있음(실측 NOT_PROVEN).

### 호출처별

| # | 수정 | 근거 |
|---|---|---|
| R1 read-ack | 토큰 갱신 재구독 **삭제**(setAuth 가 전파 — A7 인용). 남는 재구독 경로(auth bridge onReady 1회)는 `releaseMessengerChannel` + `await whenMessengerTopicFree` 후 생성, 세대 번호로 취소 확인 | 토큰 갱신으로 죽던 원인 제거 |
| R2 방 묶음 | ① 토큰 갱신 재바인드 삭제. ② 채널 이름에 바인드 세대 접미: `global-messenger:bundle:<viewer>:<chunk>:g<gen>` — 정책 `internal.cm_realtime_topic_first_uuid_after(p_topic, 'global-messenger:bundle:') = auth.uid()` 가 uuid 뒤 `(:|$)` 를 허용(`20270422130000_...sql:16-17` `'^[0-9a-f]{8}-...{12}(:|$)'`) → **DB 변경 없이** 매 재바인드가 새 토픽 → leaving 재사용 불가. subscribeWithRetry 파일 무수정 | 방 입장/퇴장 사망 제거 |
| R3 홈 | rooms-in: 같은 방식 접미 `:<offset>:g<gen>`(정책 `first_uuid_after` 허용 `:238-239`). meta: 정책이 `cm_realtime_topic_suffix_uuid`(정확히 uuid 끝, `:236-237`) → 접미 불가 → **지문 재바인드 때 meta 는 재생성하지 않음**(meta 필터가 지문과 무관한지 `community-messenger-home-realtime-channels.ts` meta 바인딩 확인 후 — 이번 검증 NOT_PROVEN), 토큰 재바인드 삭제 | |
| R4 typing | effect 안: `let alive = true; void (async () => { await whenMessengerTopicFree(sb, topic); if (!alive) return; ch = sb.channel(...)...subscribe(...) })()`; cleanup: `alive = false; if (ch) releaseMessengerChannel(sb, ch)` | |
| R5 bump | `createRoomBumpEntry` 를 비동기 생성으로(같은 패턴), `entry.stop` 은 `releaseMessengerChannel`. 생성 대기 중 도착한 bump 는 없음(구독 전) → 공백 시간 = leave 1RTT. 공백 보상: 구독 SUBSCRIBED 시 기존 `firstSubscribeResync` 와 같은 `catchUpNewerMessages` 1회(현재 bump 구독은 SUBSCRIBED 콜백이 없음 → `createMessengerPrivateChannelStatusHandler({ onStatus })` 로 추가) | 메시지 주 경로 — 반드시 실기 검증 |
| R6 friendship | deps 에서 `refresh` 제거(ref 경유) + 같은 패턴. **통화 권한 스냅샷 갱신 훅** → PR 설명에 통화 인접 명시, 통화 행렬 영향 없음 근거: 구독 대상·처리 함수 불변, 재구독 횟수만 감소 | 통화 인접 |
| R7 home-list | 같은 패턴 | |
| R8 subscribeWithRetry 내부 | **수정하지 않음**(통화 공유) — 실패 후 재구독은 미가입 채널이라 대부분 안전(A7). 고치려면 통화 변경 규정 절차로 별도 PR | 통화 접촉 → 보류·보고 |

- 안전망: TOKEN_REFRESHED 때 재구독 대신 「`ch.state !== "joined"` 인 메신저 채널만」 재가입 시도(위 도우미 경유). joined 채널은 setAuth 로 충분.
- 위험: (a) 토큰 만료 후 백그라운드 복귀 — 서버가 만료 토큰 채널을 닫으면 errored → realtime-js `rejoinTimer` 가 `updateJoinPayload` 된 새 토큰으로 재가입(`_performAuth` 가 join payload 갱신) → 회복. (b) 세대 접미로 Realtime 서버 토픽 수 증가 없음(이전 토픽은 leave). (c) 접미 형식이 정책 정규식과 맞는지 **운영 함수 정의 확인 필요**(저장소 기준만 확인).
- 롤백: 파일 단위 되돌림.

## B5. 수신 측 중복 조회 제거 (L1·L2·L3)

| 항목 | 이전 | 이후 | 정합 유지 조건 |
|---|---|---|---|
| L1 상대 메시지 단건 GET | `ownDecision === "apply"` 면 항상 `needsCatchUp` | 아래 **모두** 참이면 `continue`(GET 생략): ① `pre` 파싱 성공(이미 `senderId === fromUserId`·roomId·messageId 교차검증) ② `!snapshotTruncated` ③ 병합 **전** 로컬에 같은 id 가 없었음(= 새 INSERT, 같은 id 갱신 아님) ④ `messageType` ∈ {text, sticker} (이미지·파일·음성·통화 기록·선물·공유는 서명 URL·메타 보강 가능성 → 기존대로 GET) ⑤ 답장이면 `replyPreviewText` 존재 | 서버는 cleared_at 수신자에게 답장 스냅샷을 아예 안 보냄(`publish-messenger-room-bump.ts:112-125`) → ⑤ 와 함께 인용 노출 규칙 유지. 같은 id 갱신(수정·삭제·반응)은 ③ 으로 기존 경로 |
| L1 이중 apply | 스냅샷 병합 + GET 병합 각각 `applyIncomingMessageEvent` | GET 생략 시 자동 해소. GET 하는 경우 `alreadyMergedSnapshot` 이면 GET 결과가 스냅샷과 같은 필드면 hub 투영 생략(얕은 비교: content·deletedForEveryoneAt·metadata 참조) |
| L2 참가자 UPDATE | 내 행·상대 행 모두 `meta.schedule()` → after=/silent | ① 내 행(`user_id === viewer`)은 `last_read*`·`unread_count` 만 바뀐 경우 무시(내 mark_read 결과는 PATCH 응답이 이미 반영). ② 상대 행은 `emitRoomParticipantPostgresForRoom`(읽음 커서) 만, `meta.schedule` 은 `is_muted/left_at/role` 등 메타 컬럼 변화일 때만. 비교는 `payload.old`(REPLICA IDENTITY FULL 저장소 기준 — 운영 NOT_PROVEN; old 가 PK 만이면 판별 불가 → 기존대로 schedule 로 폴백) | 새 메시지는 bump·INSERT 경로가 담당 |
| L3 읽음 신호 강제 bootstrap | `read_ack_broadcast`·`participant_pg` 마다 `refresh(true, { forceSilentNetwork })` | 강제 refresh 제거. 대신 **X6 수정(B6)** 으로 커서 시각 문제 해소. 커서 id 가 로컬에 없을 때만 1회 `silent_delta`(디바운스 1s) | 기존 refresh 는 「400ms coalesce 로 라벨 유실」 대응이었음 → 즉시 스냅샷 패치가 이미 있음(`setSnapshot`) |

- 정책 문서 `messenger-realtime-policy.md` 의 「수신 UI」 행을 코드와 맞춰 갱신(같은 PR).
- 위험: L1 ③ 판정이 `roomMessagesRef` 시점 경합(같은 rAF 배치에서 INSERT 경로가 먼저 병합) → 로컬에 있어도 「같은 id 새 INSERT」일 수 있음 → 이 경우 GET 함(보수적, 기존 동작).
- 테스트: `own-room-bump-origin-policy.test.ts`, `messenger-room-remote-catchup-outcome.test.ts`, `messenger-canonical-message-update-propagation.contract.test.ts`, `messenger-reaction-realtime-bump.test.ts`(반응은 스냅샷 없음 → GET 유지 확인), `d12-entry-silent-read-receipt.test.ts`.

## B6. X6 — 읽음 커서 시각

- `onParticipantPostgresForPeerRead`: `createdAtForCursor` 를 못 찾으면 `lastReadMessageCreatedAt` 를 **삭제(null)** 하고 `lastReadAt` 을 대체 비교값으로 쓰지 않는다. 타임라인 memo: `!cMsg && cursorCreatedAtServer` 분기는 서버값일 때만. 둘 다 없으면 「커서가 내 최신보다 뒤인지 모름」 → 기존 false 대신 **`lastReadAt >= mMsg.createdAt` 이면 true**(읽은 시각이 내 메시지 생성 뒤면 그 메시지는 읽혔다 — 1:1·서버 시각 기준 동일 시계). 
- 서버: read-ack broadcast 페이로드에 `lastReadMessageCreatedAt` 추가(mark_read 결과에 이미 메시지 id 가 있음 — 생성 시각 포함 여부 NOT_PROVEN, 없으면 RPC 반환 확인 필요) → 구 서버 페이로드면 위 클라 규칙으로 동작(호환).
- silent_delta 병합: `readReceiptIsNewer` 가 같으면(`n === p`) `lastReadMessageCreatedAt` 만 채움(`prevRr.lastReadMessageId === rr.lastReadMessageId` 일 때).
- 위험: 클라·서버 시계 혼용 금지 — `lastReadAt`(서버)과 `createdAt`(서버 RPC `p_created_at`)은 모두 서버 시각. 낙관 행(pending)은 비교 대상에서 이미 제외.

## B7. X5 — 음성 삭제 bump

- `DELETE` 라우트 성공 뒤 `after(() => publishMessengerRoomBumpAfterMutation({ rawRouteRoomId, canonicalRoomId, fromUserId, messageId, skipBadgeTargetBump: true, invalidateParticipantLists: true }))` — 「모두에게서 삭제」 경로(N-3)와 같은 인자. 공용 함수 **호출만**(수정 없음 → I7 유지).
- 수신: 스냅샷 없음 → `catchUpAfterRemoteBump(hint)` → 단건 GET 404 → 현재 `tryMergeSingleMessageFromBump` 는 404 를 **재시도 14회(130ms 간격)** 후 실패 → `after=` → refresh. 하드 삭제 행은 영원히 404 → **1.8초 낭비 + 삭제 반영 안 됨**. 따라서 bump 페이로드에 `listAction`/`reason: "message_hard_deleted"` 같은 신호가 필요하나 이는 공용 bump 페이로드 계약 변경 → **Owner 결정 필요**. 대안(계약 무변경): 음성 삭제를 하드 삭제 대신 `deleted_for_everyone_at` 소프트 삭제 + 스토리지 정리로 바꿔 기존 「모두에게서 삭제」 경로와 통일 — 기능 변화(삭제 행 표시 문구)라 **Owner 결정 필요**. 이 설계는 둘 중 하나를 고르지 않고 충돌로 보고한다.

## B8. X7

- `bumpMessengerRoomTargetsForRecipients` 비그룹 분기: `if (row.left_at) continue;` 추가(`select("user_id, left_at")` 이미 읽음). 동작 변화: 나간 참가자 배지 bump 중단 — 나간 사람이 방 목록에 없으므로 배지가 생기면 그것이 결함. 일반 1:1 은 readmit 이 먼저 left_at 을 지우므로 영향 없음.
- RPC `recipient_user_ids` left_at 필터는 알림 동작 변경 → 별도 Owner 결정(위 A10).

## B9. 배포 순서·호환

1. **B1 DB 먼저**(Owner 승인 → 운영 적용 → `pg_get_functiondef` 대조). 현재 배포 코드가 새 필드를 이미 읽으므로 적용만으로 효과. 실패 시 즉시 롤백 가능.
2. 코드 PR 분리(효율 규정 8 · 도메인 혼합 금지):
   - PR-1 서버 전송(B2·B3·B8) — 웹. 
   - PR-2 Realtime 채널(B4) — 웹. R6(friendship)은 통화 인접 표기.
   - PR-3 수신 측(B5·B6) + 정책 문서 갱신 — 웹.
   - X5(B7)는 Owner 결정 후.
   - 어떤 PR 도 `android/**`·`ios/**`·Capacitor 변경 없음 → `[배포 구분]` 웹, 앱 재시작만. 설치된 구 바이너리 무관(웹 번들은 Vercel 에서 로드). 단 네이티브 셸이 웹 번들을 캐시하는지(서비스워커·capacitor-www) 확인은 `verify:native-version-bump` 결과로.
3. 통화 규정: I7 목록 파일을 건드리지 않으면 통화 PR 아님. R-B2-4 권장안(새 함수)을 따르지 않으면 PR-1 은 통화 접촉 → 통화 변경 규정 3번(영향 분석·Owner 승인) 대상.

## B10. 테스트

- 수정: `app/api/community-messenger/rooms/[roomId]/messages/__tests__/post-ack-after-order.test.ts`, `lib/community-messenger/__tests__/cm-send-domain-target-bump-before-ack-contract.test.ts`(순서 계약을 「target 완료 → bump 시작」, 「durable 응답 전」으로 재작성), `lib/notifications/__tests__/pipeline/notify-message-pipeline.test.ts`(병렬·`deferAutoRead`), `lib/community-messenger/room/__tests__/own-room-bump-origin-policy.test.ts`, `messenger-room-remote-catchup-outcome.test.ts`, `d12-entry-silent-read-receipt.test.ts`, `lib/community-messenger/realtime/__tests__/open-room-bundle-subscription-bind.test.ts`(채널 이름 세대 접미).
- 추가: ① `messenger-channel-topic-lease.test.ts` — 가짜 RealtimeClient(실제 `RealtimeClient.channel` 의 상태 무시 반환 재현)로 「release 직후 acquire 가 새 객체를 받는다」. ② route 순서 런타임 테스트 — `bump 시작 시점 > target 완료 시점`, `응답 전 notification INSERT 완료`(after 를 즉시 실행하는 목). ③ `direct-room-communication-gate` 오류 우선순위(차단+거절 동시 → blocked_target). ④ X6: 커서 id 미존재 + `lastReadAt` > 내 메시지 → 읽음. ⑤ 통화 회귀: `call-stub-room-bump-parity.test.ts`, `d7-s1-call-stub-list-invalidate.test.ts` 그대로 통과.
- 로컬 검증: `npm run typecheck:build` + 위 vitest + 변경 파일 eslint + `npm run typecheck:test` (개발 프로세스 1·3).

## B11. 측정 계획 (T5)

- T5 는 요청 헤더 opt-in: `requestWantsT5Trace` → `x-samarket-t5-trace: 1|true|yes`. 응답 헤더 `x-samarket-t5`(`cid=...;S0=0;S1=..;...;span=..`)와 본문 `t5` 로 응답 전 구간(S1~S13, spans: S2_profile_ms, S3_group_gate_ms, S3_block_gate_ms, BG_*, TB_*, ND_*, S10_target_bump_ms, S12_pre_ack_effects_ms)을 돌려준다. **after() 구간(S14~S17)은 응답에 실리지 않는다**(응답 뒤 실행) → bump 지연은 수신 기기에서 따로 측정.
- 클라이언트 코드에서 이 헤더를 보내는 곳 없음(grep) → 운영 트래픽엔 수치 없음(문서 서술과 일치).
- 실행(운영, Owner 가 지정한 테스트 계정 2개, 같은 1:1 방): 로그인된 앱 WebView/브라우저의 개발자 콘솔에서 쿠키 세션 그대로
  ```js
  const r = await fetch(`/api/community-messenger/rooms/${ROOM_ID}/messages`, { method: "POST", credentials: "include",
    headers: { "content-type": "application/json", "x-samarket-t5-trace": "1", "x-samarket-t5-cid": `t5-${Date.now()}` },
    body: JSON.stringify({ content: "t5 측정", clientMessageId: crypto.randomUUID() }) });
  console.log(r.headers.get("x-samarket-t5"), r.headers.get("x-samarket-send-route-ms"), (await r.json()).t5);
  ```
  토큰·비밀번호를 다루지 않는다(쿠키 세션 재사용). 각 조건 20회: ① 수신자 방 밖 ② 수신자 같은 방 전면(자동 읽음 경로) ③ 연속 2초 간격. 매 회 Production SHA·PHT 시각 기록. 실제 메시지가 상대에게 가므로 테스트 계정끼리만.
- 수신 측: 수신 기기에서 `cmRtReadSyncLog`/debug(`isCommunityMessengerRealtimeDebugEnabled`)로 `room_bump_recv` 시각 기록, 발신 `S0` 와 cid·messageId 로 대조(기기 시계 차 → 같은 기기 2탭으로 1차 측정).
- R-B2-1 확인: 조건 ② 에서 수신자 `notification_events.unread` 가 남는지 — 운영 DB 읽기 전용 조회(AGENTS 10번 규칙, 컬럼 먼저 확인).
- 수정 전·후 같은 방·같은 기기로 p50/p90 비교. 목표(`messenger-performance-targets.md` #4 전송 ACK ≤200ms, #5 수신 ≤300ms)는 클라이언트 포함 수치 — 필리핀↔bom1 왕복만 수십~100ms 대(NOT_PROVEN)라 서버 TTFB ≤200ms 와 구분해 보고.

## B12. 변경별 롤백 요약

| 변경 | 롤백 |
|---|---|
| B1 RPC | 백업 정의 재적용(코드 무변경으로 동작 복귀) |
| B2 순서 | route.ts 되돌림 |
| B3 게이트 | route.ts·gate 파일 되돌림 |
| B4 채널 | 파일별 되돌림(토픽 접미 제거) |
| B5/B6 수신 | 해당 훅 되돌림 |
| B7/B8 | 각 1~2줄 되돌림 |

---

## 이번 검증에서 확인 못 함 (NOT_PROVEN)

- 운영 DB 함수 정의(RPC 반환·`community_messenger_room_access`·토픽 정책 정규식)·replica identity — DB 미조회.
- 운영·실기기 지연 수치, X4 실제 발생 빈도, R-B2-1 경합 빈도.
- `use-messenger-room-realtime-message-ingest` INSERT 경로 세부, 홈 meta 채널 필터의 지문 의존 여부, `notifyMessagePipeline` 의 통화(부재중) 호출처 여부, mark_read RPC 가 notification_events 를 읽음 처리하는지.
