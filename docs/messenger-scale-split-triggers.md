# 메신저 확장 트리거 · 하이브리드 분리 로드맵 (S→M/L)

이 문서는 **SAMarket 메신저**를 S 규모(메신저 MAU 10만/동접 1천)에서 안정적으로 운영한 뒤,
M/L로 확장할 때 “언제, 무엇을, 어디까지” 분리할지의 **운영 트리거**와 **점진적 분리 방식**을 고정합니다.

관련 문서:
- Supabase 유지 vs 분리: `docs/messenger-supabase-split-evaluation.md`
- 분리 기준(상세): `docs/messenger-service-split-criteria.md`
- 프로덕션 SLO: `docs/messenger-production-slo.md`

---

## 1) 분리 트리거(관측 기반)

### A. Realtime 안정성 트리거
- **Realtime subscribe failure rate**가 15분 이상 연속으로 상승
  - 경고: \( \ge 1\% \)
  - 치명: \( \ge 5\% \)
- **scope별 실패율**이 특정 채널에서 집중됨(예: calls/incoming, room signals 등)
  - 코드 집계: `lib/community-messenger/monitoring/server-store.ts`의 `realtime.subscription:<scope>`

### B. API/DB 비용 트리거
- p95 API latency가 치명 기준 초과가 반복(핫패스: home-sync, room bootstrap, send message)
- DB 구간(쿼리/락/RPC)이 치명 기준 초과가 반복
- write amplification(메시지 1건에 부수 업데이트가 과도)으로 Postgres 비용이 급증

### C. 동접/팬아웃 트리거
- 메신저 동접이 M(1만)로 근접하면서 다음이 나타남:
  - WebSocket 연결 수 증가로 Realtime 타임아웃/재시도 폭주
  - 메시지 fanout/읽음 갱신으로 DB가 병목

---

## 2) 분리 원칙(점진적)

### 단계 1: Thin gateway 추가(가장 비용 대비 효과 큼)
목표: **fanout/레이트리밋/큐잉/서킷브레이커**를 앱 서버에서 분리해, 장애 반경과 부하를 줄입니다.

- **Gateway 역할**
  - WebSocket(또는 SSE) fanout
  - 메시지 전송/읽음 이벤트 큐잉
  - rate limit + spike absorption
  - degrade mode 전환(백업 폴링/프리패치 제한) 신호 제공

- **DB는 그대로(Postgres/Supabase) 유지**
  - 초기에는 데이터 원장 변경 없이 “전송/전달 경로”만 분리

### 단계 2: 이벤트 스트림(append-only)로 전환 준비
목표: 메시지/읽음/알림을 **이벤트 로그 기반**으로 전환해 재현/복구/정합성/확장성을 확보합니다.

- `message_events`, `read_events` 같은 append-only 테이블/스트림을 도입
- materialized view 또는 캐시로 “목록/안읽음”을 계산

### 단계 3: 메신저 도메인 전용 DB/캐시
목표: 메신저 트래픽이 앱 전체와 완전히 분리되어도 운영 가능하도록 합니다.

- Redis(또는 KV) 캐시 + 큐
- 메신저 전용 Postgres/Shard/Partition 검토

---

## 3) 코드 경계(Ports) 준비 체크

분리의 핵심은 “기능이 아니라 **경계**”입니다. 다음을 우선합니다.

- **Realtime/Signaling boundary**: `lib/chat-domain/ports/*` 패턴 유지
- **Room bootstrap contract**: `docs/messenger-bootstrap-contract.md` 고정
- **모니터링/지표**: `lib/community-messenger/monitoring/*`는 gateway/앱 모두에서 재사용 가능하게 유지

