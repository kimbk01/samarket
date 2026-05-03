# 메신저 프로덕션 SLO · 관측 기준

이 문서는 **커뮤니티 메신저** 기준으로 작성되며, 거래/스토어 채팅에도 동일 원칙을 적용할 수 있습니다.

**카카오톡·LINE급 목표·경고·치명·병목·완화 표:** [messenger-performance-targets.md](./messenger-performance-targets.md) (개발 체크리스트). 아래 env는 **알림(치명 임계)** 용도이며, 목표/경고 수치는 해당 문서와 아래 권장값을 병행한다.

## 1. 목표 SLO · env 알림 한도

| 지표 | 설명 | 목표 (p95) 참조 | 알림 env (단건 초과 시) | 프로덕션 권장 env (치명에 근접) |
|------|------|-----------------|-------------------------|--------------------------------|
| 방 부트스트랩 | HTTP `GET .../bootstrap` 완료 (서버 처리) | [표 §1 행 2](./messenger-performance-targets.md) | `MESSENGER_PERF_ROOM_LOAD_MS` (기본 4000ms) | **2000** |
| 클라 방 입장 RTT | `fetch` 부트스트랩 완료 (네트워크 포함) | 동일 문서 | 동일 이벤트 `chat.room_load` / `bootstrap_fetch` | 클라 APM으로 별도 대시보드 |
| 메시지 전송 RTT | POST `/messages` ~ 응답 | [표 §1 행 4](./messenger-performance-targets.md) | `MESSENGER_PERF_MESSAGE_MS` (기본 2500ms) | **1500** |
| API 라우트 | 단일 핸들러 CPU+IO | [표 §1 행 1·2](./messenger-performance-targets.md) | `MESSENGER_PERF_API_MS` (기본 2000ms) | **1500** |
| DB 구간 | `measureMessengerDb` | [표 §1](./messenger-performance-targets.md) | `MESSENGER_PERF_DB_MS` (기본 800ms) | **500** |
| 통화 첫 연결 | WebRTC 첫 `connected` | [표 §1 행 7·8](./messenger-performance-targets.md) | `MESSENGER_PERF_CALL_CONNECT_MS` (기본 12000ms) | **8000** |
| 패킷 손실 (추정) | 수신 RTP 기반 | [표 §1](./messenger-performance-targets.md) | `MESSENGER_PERF_PACKET_LOSS_PCT` (기본 8%) | **5** |
| 탭→방 마운트 | 목록 탭~방 UI 마운트(클라) | [표 §1 행 2](./messenger-performance-targets.md) | `MESSENGER_PERF_ROOM_TAP_TO_MOUNT_MS` (기본 1200ms) | **800** |
| 방→리스트 마운트 | 방에서 뒤로가기~목록 마운트(클라) | [표 §1 행 1](./messenger-performance-targets.md) | `MESSENGER_PERF_ROOM_TO_LIST_MOUNT_MS` (기본 900ms) | **600** |

**p95 측정:** 프로세스 인메모리 스토어는 평균·최근값만 제공합니다. p95는 **외부 APM**(OpenTelemetry, Datadog 등) 또는 **로그 싱크 후 집계**로 보완합니다.

## 2. 이벤트 · 라우트 매핑

| 소스 | 이벤트/라우트 | 코드 위치 |
|------|----------------|-----------|
| 서버 | `GET .../rooms/[roomId]/bootstrap` | [`app/api/community-messenger/rooms/[roomId]/bootstrap/route.ts`](../app/api/community-messenger/rooms/[roomId]/bootstrap/route.ts) |
| 서버 | `GET /api/community-messenger/bootstrap` (타이밍 기록) | [`app/api/community-messenger/bootstrap/route.ts`](../app/api/community-messenger/bootstrap/route.ts) → `recordMessengerApiTiming` |
| 서버 | `GET /api/community-messenger/home-sync` (묶음) | [`getCommunityMessengerHomeSyncBundle`](../lib/community-messenger/get-community-messenger-home-sync-bundle.ts) · [`app/api/community-messenger/home-sync/route.ts`](../app/api/community-messenger/home-sync/route.ts) |
| 서버 | `GET/POST .../messages` | [`app/api/community-messenger/rooms/[roomId]/messages/route.ts`](../app/api/community-messenger/rooms/[roomId]/messages/route.ts) |
| 클라이언트 | 방 로드 `bootstrap_fetch` | [`lib/community-messenger/monitoring/client.ts`](../lib/community-messenger/monitoring/client.ts) → `CommunityMessengerRoomClient` |
| 클라이언트 | 메시지 RTT `send_roundtrip` | 동일 (텍스트·이미지·파일·음성) |
| 클라이언트 | 통화 연결·손실·재연결 | [`lib/community-messenger/use-community-messenger-group-call.ts`](../lib/community-messenger/use-community-messenger-group-call.ts) |
| 집계 | 관리자 | `/admin/chats/messenger-performance` → `GET /api/admin/community-messenger/monitoring/summary` |

## 3. 환경 변수

`lib/community-messenger/monitoring/thresholds.ts` 와 동일:

- `MESSENGER_PERF_ROOM_LOAD_MS`
- `MESSENGER_PERF_MESSAGE_MS`
- `MESSENGER_PERF_CALL_CONNECT_MS`
- `MESSENGER_PERF_PACKET_LOSS_PCT`
- `MESSENGER_PERF_API_MS`
- `MESSENGER_PERF_DB_MS`
- `MESSENGER_PERF_ROOM_TAP_TO_MOUNT_MS`
- `MESSENGER_PERF_ROOM_TO_LIST_MOUNT_MS`

## 4. 실패율 · 재연결율 (향후)

- **메시지 전송 실패율**: POST 비율 4xx/5xx / 전체 — 라우트에 status 기록 확대 시 계산 가능.
- **재연결**: `call.reconnect` 이벤트 누적 — 세션별 정규화는 별도 집계 필요.

## 5. 운영 체크리스트

1. 스테이징에서 부트스트랩·메시지 p95가 SLO 이내인지 주간 확인  
2. 프로덕션 알림은 **임계 초과 시** `console.warn` + 관리자 **최근 알림** 패널  
3. 멀티 인스턴스 시 인메모리 집계는 노드별 — **APM/로그**로 통합 권장

## 6. Edge 캐시 · 배포 리전 · 클라 네트워크

**공유 캐시 헤더 (CDN):** `GET /api/community-messenger/rooms/[roomId]/bootstrap` 및 `GET /api/community-messenger/home-sync` 성공 응답은 `Cache-Control: public, max-age=0, s-maxage=5, stale-while-revalidate=30` 과 `Vary: Cookie` 를 붙인다 (`lib/http/messenger-api-edge-cache.ts`). 브라우저가 이를 따르려면 클라 `fetch`는 **`cache: "default"`** 와 **`credentials: "include"`** 로 호출해야 한다 (`cache: "no-store"` 는 무시).

**리전:** 필리핀 등 해외 사용자 RTT를 줄이려면 호스트(Vercel 등)를 사용자와 가까운 PoP·프로비저닝 리전에 두고, DB·Supabase는 물리 거리와 함께 튜닝한다. Vercel은 프로젝트 **Functions / Fluid** 리전 설정과 Edge Network가 요청 경로에 미치는 영향을 확인한다.

**Keep-alive:** 브라우저에서 동일 출처 API로의 `fetch`는 일반적으로 **HTTP/2 멀티플렉싱·연결 재사용**을 사용한다. 별도 `Connection` 헤더 조작은 필요 없다.

**Preconnect:** 루트 레이아웃에서 요청 `Host` / `X-Forwarded-*` 로 앱 오리진을 잡아 `<link rel="preconnect" href={origin} />` 를 넣어 첫 TLS·연결 비용을 줄인다.

## 관련 문서

- 단일 부트스트랩 계약: [messenger-bootstrap-contract.md](./messenger-bootstrap-contract.md)
- Supabase 유지 vs 분리(도메인별): [messenger-supabase-split-evaluation.md](./messenger-supabase-split-evaluation.md)
- 성능 목표·설계 한도 (체크리스트): [messenger-performance-targets.md](./messenger-performance-targets.md)
- 부트스트랩·페이로드 한도: [messenger-bootstrap-and-payload-limits.md](./messenger-bootstrap-and-payload-limits.md)
- Realtime · 디바운스 · 클라 트래픽(폴링·단일 비행 키): [messenger-realtime-policy.md](./messenger-realtime-policy.md)
- DB 아카이브 로드맵: [messenger-db-archive-roadmap.md](./messenger-db-archive-roadmap.md)
- 서비스 분리 기준: [messenger-service-split-criteria.md](./messenger-service-split-criteria.md)
