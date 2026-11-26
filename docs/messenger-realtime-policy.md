# Realtime 구독 · 디바운스 · 클라이언트 트래픽 정책

구현·수치는 아래 표와 **동일 소스**로 유지한다 (문서만 먼저 바꾸지 말고 코드 상수·주석을 함께 갱신).

운영에서 빌드 없이 조정: `NEXT_PUBLIC_MESSENGER_*` 환경변수 — [`lib/community-messenger/messenger-latency-config.ts`](../lib/community-messenger/messenger-latency-config.ts) 의 `readPublicEnvMs` 참고. 예시 키는 [`deployment/messenger-production.env.example`](../deployment/messenger-production.env.example).

| 구분 | 수치 / 키 | 코드 위치 |
|------|-----------|-----------|
| 홈 메타 `onRefresh` 디바운스 | **240ms** | [`lib/community-messenger/messenger-latency-config.ts`](../lib/community-messenger/messenger-latency-config.ts) — `MESSENGER_HOME_META_DEBOUNCE_MS` |
| 방 메타(참가자·방 행) 디바운스 | **200ms** | 동일 — `MESSENGER_ROOM_META_DEBOUNCE_MS` |
| 방 통화·call_stub·call_* 테이블 `onRefresh` 디바운스 | **50ms** (기본, `MESSENGER_ROOM_CALL_REALTIME_BUNDLE_DEBOUNCE_MS`) | [`lib/community-messenger/use-community-messenger-realtime.ts`](../lib/community-messenger/use-community-messenger-realtime.ts) — `callRefreshScheduler` |
| 홈 사일런트 번들 (방·요청·친구) | `community-messenger:home:silent:home_sync:{tier}` | [`lib/community-messenger/cm-home-silent-lists-fetch.ts`](../lib/community-messenger/cm-home-silent-lists-fetch.ts) — `GET /api/community-messenger/home-sync` tier별 `runSingleFlight` + **성공 응답 TTL 재생**(critical·full 각각 `MESSENGER_HOME_SILENT_SYNC_*_REPLAY_TTL_MS`, 기본 2s / 4s) + pathname **전환 안정화**·**동일 path 왕복 debounce**; 상위 `refresh()` 의 `AbortSignal` 은 **HTTP fetch 에 전달하지 않음**. 진단: `[home-sync-reentry]`(`cm-home-sync-reentry-log.ts`, dev 기본 / `localStorage samarket:debug:homeSyncReentry=1`), **`[home-sync-suppress]`**(`cm-home-sync-suppress-log.ts`, dev 기본 / `samarket:debug:homeSyncSuppress=1`) |
| 홈 meta / rooms-in **물리 채널** grace keepalive | 기본 **6000ms** (`NEXT_PUBLIC_MESSENGER_HOME_RT_DEFERRED_STOP_GRACE_MS`, **3000–8000**) | [`lib/community-messenger/messenger-latency-config.ts`](../lib/community-messenger/messenger-latency-config.ts) — `MESSENGER_HOME_REALTIME_DEFERRED_PHYSICAL_STOP_GRACE_MS`; [`lib/community-messenger/use-community-messenger-realtime.ts`](../lib/community-messenger/use-community-messenger-realtime.ts) — 마지막 리스너 이탈 시 즉시 `removeChannel` 금지·grace 후 `final_stop`. 진단: **`[cm-rt-grace]`**(`defer_stop`·`cancel_stop`·`reuse_existing`·`final_stop`, `cm-rt-grace-log.ts`); `[cm-rt-lifecycle-fix]` 는 create/reuse 요약 |
| Realtime churn **최근 window** | **30s / 60s** + `reuse_ratio`·`cancel_ratio`·`physical_stop_rate`·`churn_level` | [`lib/community-messenger/realtime/cm-rt-window-metrics.ts`](../lib/community-messenger/realtime/cm-rt-window-metrics.ts) — **`[cm-rt-window-summary]`** dev; `community-messenger-home` create·grace 이벤트 누적; `[cm-rt-loop-summary]` 출력 틱에 동시 emit + 12s 주기 |
| **`tier=full` home-sync wall 분해** | dev / `SAMARKET_LOG_HOME_SYNC_FULL_ANALYSIS=1` / `SAMARKET_LOG_HOME_SYNC_BREAKDOWN=1` | [`lib/community-messenger/home-sync-full-analysis-log.ts`](../lib/community-messenger/home-sync-full-analysis-log.ts) — **`[home-sync-full-analysis]`** (`trade_fetch_ms`·`trade_merge_cpu_ms`·`rooms_query_ms`·`unread_ms`·`profiles_ms`·`serialize_ms`·`full_extra_payload_ms`·`duplicate_trade_merge_count`·`full_vs_critical_gap_ms` 등). `tier=critical` 직전 스냅샷: [`home-sync-critical-route-snapshot.ts`](../lib/community-messenger/home-sync-critical-route-snapshot.ts) |
| 친구 요청 수락 시 DM 방 | 수락 직후 `ensureCommunityMessengerDirectRoom` | [`lib/community-messenger/service.ts`](../lib/community-messenger/service.ts) — `respondCommunityMessengerFriendRequest` |
| 수신 통화 폴링 (세션 목록 비어 있지 않음) | **2.5s** (production) / **2s** (local·staging) | [`lib/community-messenger/messenger-latency-config.ts`](../lib/community-messenger/messenger-latency-config.ts) — `getIncomingCallPollIntervalMs` |
| 수신 통화 폴링 (세션 없음) | **3.5s** (production) / **3s** (local·staging) | 동일 (Realtime 폴백) |
| 수신 통화 Realtime→GET 디바운스 | **22ms** (기본) | `MESSENGER_INCOMING_CALL_REALTIME_DEBOUNCE_MS` |
| Realtime 정상 시 수신 통화 HTTP 백업 폴링 | **끔** (링·비정상 RT 시만 `getIncomingCallPollIntervalMs` / ring 420ms) | [`incoming-call-backup-poll-policy.ts`](../lib/layout/incoming-call-backup-poll-policy.ts) + `GlobalCommunityMessengerIncomingCall` |
| 방 silent 부트스트랩 coalesce | **400ms** (기본) | `MESSENGER_ROOM_BOOTSTRAP_DEBOUNCE_MS` / `CM_BOOTSTRAP_DEBOUNCE_MS` |
| 수신 통화 fetch 합류 | `community-messenger:incoming-calls:directOnly` | 동일 — `runSingleFlight` |
| 오너 허브 배지 최소 fetch 간격 | **22s** | [`lib/chats/owner-hub-badge-store.ts`](../lib/chats/owner-hub-badge-store.ts) — `MIN_FETCH_GAP_MS` (서버 TTL 대비) |
| 오너 허브 배지 가시 탭 폴링 | **60s** | 동일 — `OWNER_HUB_BADGE_POLL_INTERVAL_MS` |
| 오너 허브 배지 서버 TTL | **28s** | [`lib/chats/owner-hub-badge-cache.ts`](../lib/chats/owner-hub-badge-cache.ts) — `HUB_BADGE_TTL_MS` |
| GET `/api/auth/session` 합류 | `client:GET:/api/auth/session` | [`lib/auth/fetch-auth-session-client.ts`](../lib/auth/fetch-auth-session-client.ts) — 로그인 직후 동기화 포함 [`app/login/page.tsx`](../app/login/page.tsx) |

## Community 메신저 방 메시지 — 기본 계약 (저지연)

**단일 수신 경로를 이 계약으로 둔다.** (임시 폴링만 늘리는 방식으로 대체하지 않음 — `.cursor/rules/fundamental-fixes-only.mdc` 와 정합.)

| 단계 | 역할 | 코드 |
|------|------|------|
| 발행 | 메시지·미디어 mutation 직후 **서비스 롤**이 Realtime Broadcast 로 bump 전송. 텍스트 전송(P2, 2026-11-18): 배지 target bump·durable 알림(`notification_events`) 완료 **뒤** bump 를 시작하고 `after(promise)` 로 수명만 붙잡는다(응답은 bump 완료를 기다리지 않음). RPC 반환 `room_type`·`chat_domain`·`domain_identity`·`recipient_user_ids` 로 방·참가자 재조회 없이 발행(없으면 `publishMessengerRoomBumpAfterMutation` 폴백). 그 밖의 mutation 은 기존대로 `after()` 안 `publishMessengerRoomBumpAfterMutation`. | [`publish-text-send-room-bump.ts`](../lib/community-messenger/server/publish-text-send-room-bump.ts), [`publish-messenger-room-bump.ts`](../lib/community-messenger/server/publish-messenger-room-bump.ts) → [`room-bump-broadcast-server.ts`](../lib/community-messenger/realtime/room-bump-broadcast-server.ts) |
| 페이로드 | v2: `canonicalRoomId`, `fromUserId`, `messageId`, 선택 **`message`**(직렬화된 확정 행). 거래·레거시 URL id 와 canonical 이 다르면 **두 채널** 모두 발행 + `rawRouteRoomId` 로 매칭. Phase E: 선택 **`chatDomain`/`domainIdentity`/`eventId`** (dual-write된 방만) — dedupe [`domain-realtime-envelope.ts`](../lib/chat-domain/realtime/domain-realtime-envelope.ts). 선택 **`messageAction: "hard_deleted"`**(P2 — 음성 영구 삭제): 받는 쪽은 그 `messageId` 행을 로컬에서 제거하고 단건 GET 을 하지 않는다(묘비 없음, 구 클라이언트는 무시). | [`community-messenger-room-bump-channel.ts`](../lib/community-messenger/realtime/community-messenger-room-bump-channel.ts) (`communityMessengerBumpPayloadMatchesKnownRooms` 등) |
| 직렬화·검증 | 서버→와이어용 `serialize…`, 수신 측 `parse…` — `fromUserId`·방 id·`messageId` 힌트와 교차 검증 후에만 UI 병합. | [`community-messenger-room-bump-message-snapshot.ts`](../lib/community-messenger/realtime/community-messenger-room-bump-message-snapshot.ts) |
| 수신 UI | `subscribeCommunityMessengerRoomBumpBroadcast` + 즉시 `mergeRoomMessages`. 단건 GET(`messages/{id}`) 생략 조건(P2 L1): 상대의 **새** 텍스트·스티커이고 스냅샷 검증 성공·본문 미절단·병합 전 로컬에 없던 id·(답장이면 인용 문구 있음)·보낸 사람 이름 있음 — [`peer-bump-snapshot-skip-policy.ts`](../lib/community-messenger/room/peer-bump-snapshot-skip-policy.ts). 그 밖(이미지·파일·음성·통화 기록, 같은 id 수정·삭제·반응, 스냅샷 없음·검증 실패)은 HTTP 정합(`catchUpAfterRemoteBump`). 참가자 UPDATE 가 읽음·안 읽음 컬럼만 바꿨으면 메타 재조회 없음(P2 L2), 읽음 신호마다 하던 강제 silent bootstrap 없음 — 커서 메시지가 로컬에 없을 때만 1초 디바운스 1회(P2 L3). `postgres_changes` 는 병행. | [`room-bump-broadcast.ts`](../lib/community-messenger/realtime/room-bump-broadcast.ts) (구독만), [`use-messenger-room-bump-broadcast-subscription.ts`](../lib/community-messenger/room/use-messenger-room-bump-broadcast-subscription.ts), [`use-messenger-room-client-phase1.ts`](../lib/community-messenger/room/use-messenger-room-client-phase1.ts) |
| 채널 재생성 | realtime-js 는 같은 토픽이면 상태와 무관하게 같은 객체를 돌려준다 → 같은 토픽을 await 없이 다시 만들면 leaving 객체를 받아 조용히 죽는다(X4). 메신저 채널은 `releaseMessengerChannel`·`whenMessengerTopicFree` 로 이전 제거 완료 뒤 생성(입력 중·방 bump·친구·홈 목록·read-ack). 방 묶음 `global-messenger:bundle:<viewer>:<chunk>:g<n>`·홈 `community-messenger-home:rooms-in:<uid>:<offset>:g<n>` 은 바인드마다 새 세대 토픽(정책 `cm_realtime_topic_first_uuid_after` 가 uuid 뒤 `(:|$)` 허용). 홈 meta 는 접미 불가(`suffix_uuid`)라 지문 재바인드 대상 아님. **토큰 갱신 재구독 없음** — `realtime.setAuth` 가 가입 채널에 새 토큰을 보낸다. `subscribe-with-retry.ts`(통화 공유)는 그대로. | [`messenger-channel-topic-lease.ts`](../lib/community-messenger/realtime/messenger-channel-topic-lease.ts) |
| 금지 | **클라이언트**가 동일 bump 채널로 메시지 알림을 발행하는 것 — 서버 bump 와 중복·지연·보안 모델이 어긋난다. | (구 `publishCommunityMessengerRoomBump*` 클라 발행 제거됨) |
| 반응 | 반응 추가·교체·해제 뒤 **서버가** 같은 bump 를 `messageId` 만 실어 발행한다. 반응 집계는 보는 사람마다 `mine` 이 달라 **스냅샷 없음**. 새 메시지가 아니므로 `skipBadgeTargetBump`(배지·알림 없음). 받는 쪽은 `messages/{id}` 단건 정합으로 반영하고, 단건 응답은 반응이 없으면 `reactions: []` 를 실어 지운 반응을 병합에서 지운다. Realtime `postgres_changes` 로 반응 표를 구독하지 않는다(CUT-R1). (2026-11-16 실기: 상대 반응이 방에 다시 들어가야 보이고, 지운 반응 칩이 남았다) | [`reactions/route.ts`](../app/api/community-messenger/rooms/[roomId]/messages/[messageId]/reactions/route.ts), `getCommunityMessengerRoomMessageById` |

## 실시간 연결 감독 (D1 R1 · Owner 「개정안 승인」 2026-11-26)

개정안: [`docs/audit/supabase-request-surge-2026-11-18/messenger-realtime-contract-revision-d1-d2-2026-11-26.md`](./audit/supabase-request-surge-2026-11-18/messenger-realtime-contract-revision-d1-d2-2026-11-26.md)

| 항목 | 계약 | 코드 |
|------|------|------|
| 입구 | 메신저·알림·거래 **비통화** 채널은 `superviseMessengerChannel` 로만 가입(안에서 `subscribeWithRetry` 그대로 호출 — 통화 공유 파일 무변경). 통화 채널(통화 화면·수신·통화 기록·그룹 통화)은 `subscribeWithRetry` 직접 호출 유지, 감독은 세지도 멈추지도 않음 | [`messenger-realtime-supervisor.ts`](../lib/community-messenger/realtime/messenger-realtime-supervisor.ts) |
| 오프라인 일시정지 | 오프라인에서 실패가 오면 대상 채널·자체 루프를 멈추고(가입 0·HTTP 폴백 0), 온라인이 되면 300ms 간격으로 1번씩 재가입. 차단 창·대기 단계와 별개(실기 T4 재실기 2026-11-26) | 동일 |
| 차단 | 오프라인·화면 숨김 중 실패는 세지 않음(실기 T4 2026-11-26). `TIMED_OUT`·`CHANNEL_ERROR` 를 2초 묶음(소켓 사건 1번)으로 세어 60초 6번 또는 5분 20번 → 대상 전부 stop, 호출부에 `CLOSED` 전달. 소켓 1번 끊김(모든 채널 동시 오류)은 1번. `CLOSED` 는 세지 않음(래퍼 내부 재생성) | 동일 |
| 대기·시험 | 30→60→120→300초 뒤 채널 1개(홈 meta 우선) 시험, 15초 안 SUBSCRIBED 면 나머지 300ms 간격 재가입. 숨김·오프라인이면 보일 때·온라인 때 시험. 시험 채널이 시험 중 사라지면 곧바로 다른 채널로 시험, 채널이 없으면 닫음 | 동일 |
| 관찰 기간 | 시험 통과로 닫힌 뒤 5분: 소켓 사건 2번이면 다시 차단, 대기 단계는 유지(5분 안정 뒤에만 30초로) | 동일 |
| 채널 쉼 | 같은 채널 연속 6회 실패 → 그 채널만 멈춤, 시험·복귀·온라인 때 재가입 | 동일 |
| 자체 루프 | presence 사용자 토픽·read-ack: 실패(`TIMED_OUT`·`CHANNEL_ERROR`)를 감독 창에 함께 셈, 연속 6회·차단 중·차단 열림 때 채널을 놓고 `whenMessengerRealtimeJoinAllowed` 대기(대기를 먼저 걸고 놓음 — 놓을 때 동기 `CLOSED` 재귀 방지). 끄기 스위치면 지금 동작 | `presence-user-broadcast-client.ts` · `cm-read-ack-broadcast-client.ts` |
| 감시 | `realtime.subscription` / `supervisor_open·close·park·probe_fail` | 앱 감시 5분 묶음 → D4 매시 감시 표 |
| 롤백 | `NEXT_PUBLIC_MESSENGER_RT_SUPERVISOR=0` → 감독 통과(이전 동작) | 동일 |

| 재동기화 1번 (R2) | 채널은 두 번째 이후 SUBSCRIBED 에서 스스로 다시 읽지 않고 `noteMessengerRealtimeResubscribed()` 만 부른다. 마지막 재가입 뒤 1초 조용(첫 재가입부터 최대 5초) 뒤 받는 쪽을 1번씩: 열린 방 `after=`(이유 `reconnect`, bootstrap 다시 안 받음) · 홈 목록 확인(meta 를 포함한 바인드 1곳) · 알림 RESYNC · 친구요청. 처음 가입은 지금 그대로 | [`messenger-realtime-resync.ts`](../lib/community-messenger/realtime/messenger-realtime-resync.ts) |
| 폴백 상한 (R3) | 방 묶음의 「실패마다 열린 방 HTTP 따라잡기」 없음. 묶음 채널이 만들어진 뒤 모든 조각이 SUBSCRIBED 가 아닌 상태가 15초 넘게 이어지고 화면 보임·온라인이면 방당 60초에 1번 `after=`(이유 `fallback`) | `global-messenger-room-bundle-channel.ts` |

R4(중복 가입 제거)는 PR-C 에서 이 절에 더한다.

## 원칙

1. **가벼운 이벤트만** — INSERT 한 건·메타 변경 한 건 단위로 클라이언트에서 머지; **전체 메시지 목록 재요청**은 디바운스된 `refresh` 로만.
2. **방당 WebSocket 채널 1개** — `postgres_changes` 를 한 채널에 묶어 구독 수를 줄임.
3. **홈 목록** — `community_messenger_rooms` / `community_messenger_messages` 의 `in.(…)` 필터는 **50개 단위 청크** (`COMMUNITY_MESSENGER_HOME_ROOMS_IN_FILTER_MAX`). Docs `in` 한도(100)보다 작게 유지 — Realtime subscription btree(~2704B)가 60–90 UUID에서 조용히 실패할 수 있음(supabase/realtime#1670; CUT-2B/C). 상수: [`community-messenger-home-realtime-channels.ts`](../lib/community-messenger/realtime/community-messenger-home-realtime-channels.ts).
4. **typing / presence** — 브로드캐스트 채널, **수십 바이트 이하** 페이로드; 방 전체 `GET` 금지. 입력 중 = 비공개 토픽 `community-messenger-typing:<roomId>`, 레거시 Telegram 기준 재전송 **5초**(`ChatActivityEnterView` 5000) · 수신 유지 **5.9초**(`MessagesController` 5900) · 유휴 2.6초 stop · 화면 보임 + 입력창 포커스일 때만. 수신 채널은 토픽당 1개 공유(방 화면·대화 목록 보이는 행 최대 15방) — 상세 `docs/group-chat-presence-typing.md` §3 (P3 2026-11-18).
5. **1:1 통화 히스토리** — terminal 상태(`rejected`/`cancelled`/`missed`/`ended`)는 세션 로그 중복 여부와 무관하게 채팅 `call_stub` 를 보장한다. 클라이언트는 즉시 로컬 stub 를 병합하고, 서버는 `replaceExisting` 으로 최종 stub 를 보정한다. 로컬 `cm-cevt-*`와 DB UUID stub는 `sessionId/tmpSessionId + callResolvedEvent/callStatus` 기준으로 한 줄만 표시하고, 숨김도 message id와 session key를 함께 저장한다.

## 안티패턴

- Realtime 이벤트마다 무조건 `refresh(true)` 로 전체 부트스트랩 재호출.
- 동일 테이블에 사용자별 중복 채널 구독.

## 관련 문서

- 프로덕션 SLO·관측: [messenger-production-slo.md](./messenger-production-slo.md)
- 성능 목표 표: [messenger-performance-targets.md](./messenger-performance-targets.md)
