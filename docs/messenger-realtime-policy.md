# Realtime 구독 · 디바운스 · 클라이언트 트래픽 정책

구현·수치는 아래 표와 **동일 소스**로 유지한다 (문서만 먼저 바꾸지 말고 코드 상수·주석을 함께 갱신).

운영에서 빌드 없이 조정: `NEXT_PUBLIC_MESSENGER_*` 환경변수 — [`lib/community-messenger/messenger-latency-config.ts`](../lib/community-messenger/messenger-latency-config.ts) 의 `readPublicEnvMs` 참고. 예시 키는 [`deployment/messenger-production.env.example`](../deployment/messenger-production.env.example).

| 구분 | 수치 / 키 | 코드 위치 |
|------|-----------|-----------|
| 홈 메타 `onRefresh` 디바운스 | **240ms** | [`lib/community-messenger/messenger-latency-config.ts`](../lib/community-messenger/messenger-latency-config.ts) — `MESSENGER_HOME_META_DEBOUNCE_MS` |
| 방 메타(참가자·방 행) 디바운스 | **200ms** | 동일 — `MESSENGER_ROOM_META_DEBOUNCE_MS` |
| 통화·콜 스텁 등 즉시 스케줄 | **0ms** | [`lib/community-messenger/use-community-messenger-realtime.ts`](../lib/community-messenger/use-community-messenger-realtime.ts) — `callRefreshScheduler` |
| 홈 사일런트 번들 (방·요청·친구) | `community-messenger:home:silent:home_sync` | [`lib/community-messenger/cm-home-silent-lists-fetch.ts`](../lib/community-messenger/cm-home-silent-lists-fetch.ts) — `GET /api/community-messenger/home-sync` 단일 `runSingleFlight` |
| 친구 요청 수락 시 DM 방 | 수락 직후 `ensureCommunityMessengerDirectRoom` | [`lib/community-messenger/service.ts`](../lib/community-messenger/service.ts) — `respondCommunityMessengerFriendRequest` |
| 수신 통화 폴링 (세션 목록 비어 있지 않음) | **2.5s** (production) / **2s** (local·staging) | [`lib/community-messenger/messenger-latency-config.ts`](../lib/community-messenger/messenger-latency-config.ts) — `getIncomingCallPollIntervalMs` |
| 수신 통화 폴링 (세션 없음) | **3.5s** (production) / **3s** (local·staging) | 동일 (Realtime 폴백) |
| 수신 통화 Realtime→GET 디바운스 | **90ms** (기본) | `MESSENGER_INCOMING_CALL_REALTIME_DEBOUNCE_MS` |
| 수신 통화 fetch 합류 | `community-messenger:incoming-calls:directOnly` | 동일 — `runSingleFlight` |
| 오너 허브 배지 최소 fetch 간격 | **22s** | [`lib/chats/owner-hub-badge-store.ts`](../lib/chats/owner-hub-badge-store.ts) — `MIN_FETCH_GAP_MS` (서버 TTL 대비) |
| 오너 허브 배지 가시 탭 폴링 | **60s** | 동일 — `OWNER_HUB_BADGE_POLL_INTERVAL_MS` |
| 오너 허브 배지 서버 TTL | **28s** | [`lib/chats/owner-hub-badge-cache.ts`](../lib/chats/owner-hub-badge-cache.ts) — `HUB_BADGE_TTL_MS` |
| GET `/api/auth/session` 합류 | `client:GET:/api/auth/session` | [`lib/auth/fetch-auth-session-client.ts`](../lib/auth/fetch-auth-session-client.ts) — 로그인 직후 동기화 포함 [`app/login/page.tsx`](../app/login/page.tsx) |

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
