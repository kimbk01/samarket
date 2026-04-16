# Realtime 구독 · 디바운스 · 클라이언트 트래픽 정책

구현·수치는 아래 표와 **동일 소스**로 유지한다 (문서만 먼저 바꾸지 말고 코드 상수·주석을 함께 갱신).

운영에서 빌드 없이 조정: `NEXT_PUBLIC_MESSENGER_*` 환경변수 — [`lib/community-messenger/messenger-latency-config.ts`](../lib/community-messenger/messenger-latency-config.ts) 의 `readPublicEnvMs` 참고. 예시 키는 [`deployment/messenger-production.env.example`](../deployment/messenger-production.env.example).

| 구분 | 수치 / 키 | 코드 위치 |
|------|-----------|-----------|
| 홈 메타 `onRefresh` 디바운스 | **240ms** | [`lib/community-messenger/messenger-latency-config.ts`](../lib/community-messenger/messenger-latency-config.ts) — `MESSENGER_HOME_META_DEBOUNCE_MS` |
| 방 메타(참가자·방 행) 디바운스 | **200ms** | 동일 — `MESSENGER_ROOM_META_DEBOUNCE_MS` |
| 방 통화·call_stub·call_* 테이블 `onRefresh` 디바운스 | **90ms** (기본, `MESSENGER_INCOMING_CALL_REALTIME_DEBOUNCE_MS`) | [`lib/community-messenger/use-community-messenger-realtime.ts`](../lib/community-messenger/use-community-messenger-realtime.ts) — `callRefreshScheduler` (버스트 시 스케줄만 양산되던 0ms 제거) |
| 홈 사일런트 번들 (방·요청·친구) | `community-messenger:home:silent:home_sync` | [`lib/community-messenger/cm-home-silent-lists-fetch.ts`](../lib/community-messenger/cm-home-silent-lists-fetch.ts) — `GET /api/community-messenger/home-sync` 단일 `runSingleFlight` |
| 친구 요청 수락 시 DM 방 | 수락 직후 `ensureCommunityMessengerDirectRoom` | [`lib/community-messenger/service.ts`](../lib/community-messenger/service.ts) — `respondCommunityMessengerFriendRequest` |
| 수신 통화 폴링 (세션 목록 비어 있지 않음) | **2.5s** (production) / **2s** (local·staging) | [`lib/community-messenger/messenger-latency-config.ts`](../lib/community-messenger/messenger-latency-config.ts) — `getIncomingCallPollIntervalMs` |
| 수신 통화 폴링 (세션 없음) | **3.5s** (production) / **3s** (local·staging) | 동일 (Realtime 폴백) |
| 수신 통화 Realtime→GET 디바운스 | **90ms** (기본, 방 `callRefreshScheduler` 와 동일 상수) | `MESSENGER_INCOMING_CALL_REALTIME_DEBOUNCE_MS` |
| 수신 통화 fetch 합류 | `community-messenger:incoming-calls:directOnly` | 동일 — `runSingleFlight` |
| 오너 허브 배지 최소 fetch 간격 | **22s** | [`lib/chats/owner-hub-badge-store.ts`](../lib/chats/owner-hub-badge-store.ts) — `MIN_FETCH_GAP_MS` (서버 TTL 대비) |
| 오너 허브 배지 가시 탭 폴링 | **60s** | 동일 — `OWNER_HUB_BADGE_POLL_INTERVAL_MS` |
| 오너 허브 배지 서버 TTL | **28s** | [`lib/chats/owner-hub-badge-cache.ts`](../lib/chats/owner-hub-badge-cache.ts) — `HUB_BADGE_TTL_MS` |
| GET `/api/auth/session` 합류 | `client:GET:/api/auth/session` | [`lib/auth/fetch-auth-session-client.ts`](../lib/auth/fetch-auth-session-client.ts) — 로그인 직후 동기화 포함 [`app/login/page.tsx`](../app/login/page.tsx) |

## Community 메신저 방 메시지 — 기본 계약 (저지연)

**단일 수신 경로를 이 계약으로 둔다.** (임시 폴링만 늘리는 방식으로 대체하지 않음 — `.cursor/rules/fundamental-fixes-only.mdc` 와 정합.)

| 단계 | 역할 | 코드 |
|------|------|------|
| 발행 | 메시지·미디어 mutation 직후 **서비스 롤**이 Realtime Broadcast 로 bump 전송. 응답 본문 전에 `await` 로 전송 완료를 보장. | [`publish-messenger-room-bump.ts`](../lib/community-messenger/server/publish-messenger-room-bump.ts) → [`room-bump-broadcast-server.ts`](../lib/community-messenger/realtime/room-bump-broadcast-server.ts) |
| 페이로드 | v2: `canonicalRoomId`, `fromUserId`, `messageId`, 선택 **`message`**(직렬화된 확정 행). 거래·레거시 URL id 와 canonical 이 다르면 **두 채널** 모두 발행 + `rawRouteRoomId` 로 매칭. | [`community-messenger-room-bump-channel.ts`](../lib/community-messenger/realtime/community-messenger-room-bump-channel.ts) (`communityMessengerBumpPayloadMatchesKnownRooms` 등) |
| 직렬화·검증 | 서버→와이어용 `serialize…`, 수신 측 `parse…` — `fromUserId`·방 id·`messageId` 힌트와 교차 검증 후에만 UI 병합. | [`community-messenger-room-bump-message-snapshot.ts`](../lib/community-messenger/realtime/community-messenger-room-bump-message-snapshot.ts) |
| 수신 UI | `subscribeCommunityMessengerRoomBumpBroadcast` + 즉시 `mergeRoomMessages`; 이어서 HTTP 증분(`catchUpAfterRemoteBump`)으로 정합. `postgres_changes` 는 병행. | [`room-bump-broadcast.ts`](../lib/community-messenger/realtime/room-bump-broadcast.ts) (구독만), [`use-messenger-room-client-phase1.ts`](../lib/community-messenger/room/use-messenger-room-client-phase1.ts) |
| 금지 | **클라이언트**가 동일 bump 채널로 메시지 알림을 발행하는 것 — 서버 bump 와 중복·지연·보안 모델이 어긋난다. | (구 `publishCommunityMessengerRoomBump*` 클라 발행 제거됨) |

## 원칙

1. **가벼운 이벤트만** — INSERT 한 건·메타 변경 한 건 단위로 클라이언트에서 머지; **전체 메시지 목록 재요청**은 디바운스된 `refresh` 로만.
2. **방당 WebSocket 채널 1개** — `postgres_changes` 를 한 채널에 묶어 구독 수를 줄임.
3. **홈 목록** — `community_messenger_rooms` 의 `id=in.(…)` 필터는 **90개 단위 청크** (Supabase `in` 한도 여유). 상수: `HOME_ROOMS_IN_FILTER_MAX` in [`use-community-messenger-realtime.ts`](../lib/community-messenger/use-community-messenger-realtime.ts).
4. **typing / presence** (향후) — 별 테이블 또는 브로드캐스트 채널, **수십 바이트 이하** 페이로드; 방 전체 `GET` 금지.

## 안티패턴

- Realtime 이벤트마다 무조건 `refresh(true)` 로 전체 부트스트랩 재호출.
- 동일 테이블에 사용자별 중복 채널 구독.

## 관련 문서

- 프로덕션 SLO·관측: [messenger-production-slo.md](./messenger-production-slo.md)
- 성능 목표 표: [messenger-performance-targets.md](./messenger-performance-targets.md)
