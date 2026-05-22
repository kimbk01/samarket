# Dev 성능 측정 런북 (DEV-STAB-1)

일반 개발과 **성능 측정**을 분리해 Next dev compile/HMR graph 가 API 판정을 오염시키지 않게 한다.

## 명령 분리

| 명령 | 용도 |
|------|------|
| `npm run dev` | 일반 개발 (heap 8GB 기본, verbose memory watch·module graph probe 포함) |
| `npm run dev:measure` | **성능 측정 전용** dev (heap 4GB, monitoring/singleflight 상한, 메신저 trace OFF, 통합 진단 로그) |
| `npm run measure:owner-dashboard-api` | 오너 대시보드 API 3-run + gate ( **dev:measure 가 떠 있어야 함** ) |

선택 env (측정 dev):

- `SAMARKET_DEV_MEMORY_EXIT_ON_CRITICAL=1` — heap ≥ 5GB 시 프로세스 `exit(99)`
- 기존 env 가 설정되어 있으면 `scripts/dev-measure.cjs` 가 **덮어쓰지 않음**

## 측정 순서

1. 일반 `npm run dev` 가 떠 있으면 **종료** (포트·lock 충돌 방지).
2. `npm run dev:measure` 실행 — 기동 배너 `[samarket-dev-measure]` 확인.
3. **첫 route compile 1회는 무시** (Next dev 정상; wall_ms 판정 금지).
4. 터미널에서 `[dev-memory-growth-diagnosis]` **2회 이상** (약 30초 간격) 확인:
   - `inprocess_cache_estimated_mb` ≪ heap → `likely_next_hmr_graph_dominates: true`
   - `cache_not_primary_reason`: `"Next dev compile/HMR graph likely dominates"`
5. `npm run measure:owner-dashboard-api` (로그인: `E2E_TEST_USERNAME=qqqq` 등 `.env.local` 계정).
6. 터미널 tail 에서 `[owner-dashboard-perf-v2]` · `[perf-real-api-cost]` 파싱.

## API 성능 판정 (고정)

**오직 `actual_handler_ms` 만** SLO·회귀 판정에 사용한다.

```text
[perf-real-api-cost] { actual_handler_ms, compile_ms, wall_ms, is_dev_compile_noise, ... }
```

| 필드 | 사용 |
|------|------|
| `actual_handler_ms` | **판정용** (서버 handler / DB·RPC) |
| `wall_ms` | 참고만 — dev compile·클라 RTT 포함 |
| `compile_ms` | 첫 hit noise 식별 (`is_dev_compile_noise`) |

### 라운드 보류 규칙 (이번 DIBAY 측정 기준)

- **auth** server `auth_ms` / handler **4–35ms** → auth 최적화 라운드 **보류**
- **order-counts·notifications warm** `actual_handler_ms` **≤ 30ms** → 해당 API **수정 금지**
- **cold RPC** (order-counts ~250ms, `rpc_wall_ms` ~210ms) → **별도 라운드** (DEV-STAB-1 범위 밖)

## 메모리 가드 (`[dev-memory-growth-diagnosis]`)

| 필드 | 의미 |
|------|------|
| `heap_mb` / `rss_mb` | 현재 프로세스 |
| `heap_delta_30s_mb` | 직전 샘플과 ~30s 간격일 때만 delta |
| `inprocess_cache_estimated_mb` | monitoring·singleflight·CM cache 합산 추정 |
| `likely_next_hmr_graph_dominates` | in-process &lt; 10MB 이고 heap ≥ 2GB |
| `memory_guard_level` | `ok` / `warn` (≥4GB) / `critical` (≥5GB) |

측정 환경 목표(참고): heap ≤ 1.2GiB 는 **일반 dev 장시간 HMR 후에는 기대하지 않음**. 측정은 **fresh `dev:measure` 프로세스** + handler ms 분리로 판단한다.

## 이번 라운드에서 건드리지 않은 것

- auth / owner dashboard API / order-counts RPC / UI / 라우트 / DB

## order-counts cold RPC (라운드 A)

```bash
npm run dev:measure
npm run measure:order-counts-cold-rpc
```

- cold 1회: 헤더 `x-samarket-owner-dashboard-measure: 1` (캐시 invalidate)
- warm 2회: 연속 호출
- 판정: `[order-counts-cold-breakdown].cold_bottleneck_cause` · `rpc_rtt_limited`

## hub cold client wall (라운드 B)

```bash
npm run dev:measure
npm run measure:hub-cold-client-wall
```

- cold: `x-samarket-hub-badge-measure: 1` (hub TTL만 invalidate)
- warm 2회: deferred hub-badge 연속 호출
- 참고: `store-orders?hub_summary=1` client wall 은 스크립트에 별도 표기(동일 화면 이중 fetch 여부 확인)
- 판정: `[hub-cold-client-wall-breakdown].cold_bottleneck_cause` · server 는 `actual_handler_ms`

## owner dashboard waterfall (라운드 C)

```bash
npm run dev:measure
npm run measure:owner-dashboard-waterfall
```

브라우저 콘솔 `[owner-dashboard-waterfall]` — `first_shell_paint_ms` · `api_done` · `first_paint_blocking:false`

## 다음 라운드 후보

1. prod_same_region 재측정 (order-counts·hub cold RTT)

## 관련 문서

- [owner-dashboard-api-perf-lock.md](../owner-dashboard-api-perf-lock.md)
- [samarket-performance-track-state.md](../samarket-performance-track-state.md) — 트랙 **DEV-STAB-1**
