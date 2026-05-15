# 메신저 성능 목표 (카카오톡·LINE급 참조)

운영·개발 공통으로 사용하는 **체크리스트**. 집계는 기본 **p95**; 클라이언트·네트워크 포함 지표는 별도 표기.

**관련:** [messenger-production-slo.md](./messenger-production-slo.md) (env·알림), [messenger-bootstrap-and-payload-limits.md](./messenger-bootstrap-and-payload-limits.md) (코드 한도).  
**구조 lock · 베이스라인:** [messenger-performance-architecture.md](./messenger-performance-architecture.md), [messenger-performance-baseline.md](./messenger-performance-baseline.md).

### 운영 슬리버 (warm · 네이티브급 체감)

집계는 **p95·세션 윈도** 기준으로 보되, 아래 **정상 대역**을 우선 만족하는지 본다. 코드 참조: [`MESSENGER_PERF_REFERENCE_ROOM_OPEN_MS`](../lib/community-messenger/monitoring/thresholds.ts), [`MESSENGER_PERF_REFERENCE_BOOTSTRAP_FETCH_CLIENT_MS`](../lib/community-messenger/monitoring/thresholds.ts), [`MESSENGER_PERF_REFERENCE_FRAME_MS`](../lib/community-messenger/monitoring/thresholds.ts), [`MESSENGER_PERF_REFERENCE_PREFETCH_RATIOS`](../lib/community-messenger/monitoring/thresholds.ts).

#### room_open

| 구간 | 메트릭 | 정상 대역 | 비고 |
|------|--------|-----------|------|
| 홈 부트스트랑 후 목록 UI 동기 | `list_bootstrap_align` (`mergeHomeSyncIntoBootstrap` 동기만) | **5 ~ 30 ms** | 네트워크·home-sync 제외 |
| 방 진입 직후 목록·배지 정합 | `badge_list_align` + `kind: room_open` | **0 ~ 10 ms** | [`messengerMonitorUnreadListSync`](../lib/community-messenger/monitoring/client.ts) |

#### bootstrap_fetch (클라 `chat.room_load` / `bootstrap_fetch`)

| 분기 | 정상 대역 | 비고 |
|------|-----------|------|
| 스냅샷 캐시 **HIT** (`consumeRoomSnapshot` 등 즉시 시드) | **0 ~ 100 ms** | 상위 run 클라 왕복만 |
| 스냅샷 캐시 **MISS** (HTTP 부트스트랩 필요) | **200 ~ 500 ms** 이하 | 단일 RTT·페이로드 슬림·엣지 캐시 |

#### 렌더·스크롤·대용량 타임라인

| 항목 | 목표 | 비고 |
|------|------|------|
| 메인 스레드 프레임 | **≤ 16 ms** (60fps) | Chrome Performance / `MESSENGER_PERF_REFERENCE_FRAME_MS` |
| 스크롤 | 끊김 없음 | 타임라인 가상 스크롤·rAF 배치 |
| 메시지 개수 | **1000+** 에도 동일 | `@tanstack/react-virtual` + 행 `memo`·메시지 배열 상한·이미지 lazy |

#### prefetch (`room-snapshot-cache` 프리패치 → TTL 내 재입장)

| 지표 | 목표 |
|------|------|
| **HIT ratio** (시도 대비 TTL fresh 또는 즉시 재사용) | **≥ 80 %** |

---

## 1) 지연 목표 (ms = 밀리초, p95 기본)

| # | 지표 | 목표 | 경고 | 치명 | 초과 시 유력 병목 | 권장 완화 |
|---|------|------|------|------|-------------------|-----------|
| 1 | 채팅방 목록 로드 (목록 API 완료 ~ 첫 의미 있는 페인트 가능) | ≤ **400** | ≤ **800** | ≤ **1500** | DB N+1·과대 페이로드·콜드 캐시 | 필드 슬림·커서·병렬 쿼리·짧은 TTL 캐시·인덱스 |
| 2 | 방 입장 부트스트랩 (입장 ~ 메타+초기 메시지 사용 가능) | ≤ **500** | ≤ **1000** | ≤ **2000** | 부트스트랩 과대·조인·동기 왕복 연쇄 | 캐시 HIT/MISS 슬리버는 상단 **bootstrap_fetch** · DTO 고정·단일 RTT |
| 3 | 최근 메시지 렌더 (데이터 준비 후 ~ 주요 말풍선 페인트) | ≤ **100** | ≤ **250** | ≤ **500** | 과다 DOM·이미지 디코드·레이아웃 스래싱 | 가상 스크롤·지연 로드·배치 렌더 |
| 4 | 전송 지연 (전송 ~ 서버 ack) | ≤ **200** | ≤ **500** | ≤ **1500** | API 큐잉·DB 쓰기·리전 왕복 | 낙관적 UI·경량 쓰기·idempotency |
| 5 | 수신 전달 (상대 발송 ~ 본인 화면 반영) | ≤ **300** | ≤ **800** | ≤ **2000** | Realtime 지연·풀링 폴백·클라 배치 과다 | 전용 채널·슬림 이벤트·재연결 정책 |
| 6 | 읽음·미읽음 갱신 (읽음 처리 ~ 배지·목록 일치) | ≤ **200** | ≤ **500** | ≤ **1000** | 집계 쿼리·목록 재조회 폭주 | 낙관적 읽음·역할별 unread·디바운스 |
| 7 | 홈 목록 UI 정합 (`list_bootstrap_align` — `mergeHomeSyncIntoBootstrap`·세션 캐시 동기 구간만) | ≤ **30** | ≤ **50** | ≤ **90** | 리스트 diff·캐시 prime 과대 | 정상 대역 **5~30** · `MESSENGER_PERF_HOME_UI_ALIGN_MS` |
| 8 | 홈 silent 클라 네트워크 (`home_sync_fetch_ms` — `GET /api/community-messenger/home-sync` 1왕복) | ≤ **600** | ≤ **1200** | ≤ **2000** | 서버 3쿼리 병렬·RTT·Next 핸들러 | 단일 fetch·서버 `Promise.all`·알림 한도 `MESSENGER_PERF_HOME_SYNC_FETCH_MS` |
| 9 | silent 실패 후 fresh 부트스트랩 (`silent_fail_fallback_bootstrap_ms`) | ≤ **2000** | ≤ **4000** | ≤ **8000** | 폴백 전체 부트스트랩 과대·연쇄 RTT | 홈-sync 성공률·폴백 최소화·알림 한도 `MESSENGER_PERF_SILENT_FALLBACK_BOOTSTRAP_MS` |
| 10 | 음성 통화 연결 (발신/수락 ~ 양방향 오디오 체감) | ≤ **2.0 s** | ≤ **4.0 s** | ≤ **8.0 s** | 시그널링 RTT·ICE·TURN 홀펀칭 | TURN 지역화·ICE 튜닝·폴백 코덱 |
| 11 | 영상 통화 연결 (첫 프레임 체감) | ≤ **3.0 s** | ≤ **6.0 s** | ≤ **12.0 s** | 대역폭·인코더·SFU 혼잡 | ABR·낮은 해상도 선행·가까운 POP |
| 12 | 그룹 참여·입장 완료 | ≤ **1.0 s** | ≤ **3.0 s** | ≤ **8.0 s** | 멤버십 검증·락·토큰 체인 | 캐시·비동기 워커·idempotent join |
| 13 | 재연결 (끊김 ~ 송수신·실시간 복구) | ≤ **2.0 s** | ≤ **5.0 s** | ≤ **15.0 s** | 소켓 스톰·토큰 갱신·백오프 과대 | 백오프 상한·diff sync·하트비트 |

---

## 2) 설계 한도 (하드 체크리스트)

| 항목 | 권장 | 경고 | 치명 | 메모 |
|------|------|------|------|------|
| 방 입장 동시·연쇄 **API 호출 수** (약 2s 윈도) | ≤ **3** | ≤ **5** | ≤ **8** | 부트스트랩 병합·나머지 지연 로드 |
| **부트스트랩 페이로드** (gzip 후) | ≤ **80 KB** | ≤ **150 KB** | ≤ **250 KB** | 이미지·긴 히스토리는 별도 요청 |
| **가상화 전** 동시 메시지 DOM | ≤ **50** | ≤ **80** | ≤ **120** | 초과 시 가상 스크롤 필수 |
| **그룹 최적화 모드** 전환 인원 | ≥ **50** 검토 | ≥ **100** 필수 | ≥ **200** 엄격 | presence·typing·읽음 샘플링 |

**그룹 채팅 상세:** [group-chat-ui-performance.md](./group-chat-ui-performance.md) (가상화·최적화 모드), [group-chat-presence-typing.md](./group-chat-presence-typing.md) (수치 정책).

---

## 3) 코드·환경 매핑 (SAMarket)

| 이 문서 구간 | 코드/설정 |
|--------------|-----------|
| Realtime 디바운스·홈 API 단일 비행·폴링 수치 | [messenger-realtime-policy.md](./messenger-realtime-policy.md) (표 — 코드 경로와 동기화) |
| 그룹 인원·가상화·bootstrap 한도 | `MESSENGER_PERF_DESIGN_LIMITS` → [`lib/community-messenger/monitoring/thresholds.ts`](../lib/community-messenger/monitoring/thresholds.ts); 설명 [group-chat-ui-performance.md](./group-chat-ui-performance.md) |
| room_open·부트스트랩 fetch·프레임·prefetch 슬리버 (문서 상단) | `MESSENGER_PERF_REFERENCE_ROOM_OPEN_MS` · `MESSENGER_PERF_REFERENCE_BOOTSTRAP_FETCH_CLIENT_MS` · `MESSENGER_PERF_REFERENCE_FRAME_MS` · `MESSENGER_PERF_REFERENCE_PREFETCH_RATIOS` |
| 방 로드·부트스트랩 알림 한도 | `MESSENGER_PERF_ROOM_LOAD_MS` → [`lib/community-messenger/monitoring/thresholds.ts`](../lib/community-messenger/monitoring/thresholds.ts) (`chat.room_load` / `bootstrap_fetch`) |
| 홈 목록 UI 정합 알림 (`list_bootstrap_align`) | `MESSENGER_PERF_HOME_UI_ALIGN_MS` (기본 400) → [`thresholds.ts`](../lib/community-messenger/monitoring/thresholds.ts) (`chat.unread_sync` / `list_bootstrap_align`) |
| 홈 silent 클라 네트워크 알림 (`home_sync_fetch_ms`) | `MESSENGER_PERF_HOME_SYNC_FETCH_MS` (기본 2000) → [`thresholds.ts`](../lib/community-messenger/monitoring/thresholds.ts) (`chat.unread_sync` / `home_sync_fetch_ms`); 참조 p95 `homeSilentListSync` |
| silent 실패 후 fresh 부트스트랩 알림 (`silent_fail_fallback_bootstrap_ms`) | `MESSENGER_PERF_SILENT_FALLBACK_BOOTSTRAP_MS` (기본 8000) → [`thresholds.ts`](../lib/community-messenger/monitoring/thresholds.ts) (`chat.unread_sync` / `silent_fail_fallback_bootstrap_ms`) |
| 메시지 RTT | `MESSENGER_PERF_MESSAGE_MS` (`send_roundtrip`) |
| 통화 연결 | `MESSENGER_PERF_CALL_CONNECT_MS` (`first_connected`) |
| API 핸들러 | `MESSENGER_PERF_API_MS` (`api.community_messenger`) |
| DB 구간 | `MESSENGER_PERF_DB_MS` (`db.community_messenger`) |
| 패킷 손실 | `MESSENGER_PERF_PACKET_LOSS_PCT` |
| 거래 채팅 perf 로그 | `CHAT_PERF_LOG=1` → `[chat.room.detail]`, `[chat.rooms.list]`, `[chat.room.bootstrap]` (도메인·분기) |

**주의:** 저장소 기본 env는 스테이징 여유를 두고 **완화**되어 있을 수 있다. 프로덕션은 [messenger-production-slo.md](./messenger-production-slo.md)의 권장 env로 조정한다.

---

## 4) 측정 규칙 (합의용)

1. 서버 전용 구간은 **핸들러/미들웨어 타이밍**; E2E는 **클라이언트 스팬** 별도.  
2. “방 입장 API 수”는 동일 화면 전환에서 **fetch/XHR 합산**.  
3. p95는 인메모리 샘플만으로는 부족할 수 있음 → **APM·로그 싱크**로 보완 ([messenger-production-slo.md](./messenger-production-slo.md) 참고).
