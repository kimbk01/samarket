# Owner dashboard API perf lock

**범위:** `GET /api/me/store-owner-hub-badge`, `GET /api/me/stores/[storeId]/order-counts`, `GET /api/me/notifications` (unread count).  
**금지:** 메신저 bootstrap·unread semantics·응답 JSON contract·UI·hub badge no-store fast path 구현·notifications cache 동작.

**목적:** 구조 회귀(직렬 RTT·legacy 폴백)와 네트워크 RTT 한계를 분리해, linked Supabase 로컬 dev에서 cold 250ms 미달만으로 반복 튜닝하지 않는다.

---

## 환경 모드 (`environment_mode`)

| 모드 | 판정 | 설정 |
|------|------|------|
| `local_linked` | 로컬 Next dev → **원격 linked** Supabase (PostgREST RTT 지배) | 기본 (`localhost` + `.env.local` linked URL) |
| `prod_same_region` | 배포 런타임·DB **동일 리전** | `OWNER_DASHBOARD_PERF_ENV=prod_same_region` 또는 `VERCEL=1` / `SAMARKET_DEPLOYMENT_SAME_REGION=1` |
| `unknown` | 로컬 SLO를 보수적으로 적용 | 그 외 `SAMARKET_BASE_URL` |

측정:

```bash
npm run dev   # 필수 — server perf-v2 JSON 로그
npm run measure:owner-dashboard-api
# prod 동일 리전 스테이징:
OWNER_DASHBOARD_PERF_ENV=prod_same_region SAMARKET_BASE_URL=https://... npm run measure:owner-dashboard-api
```

첫 order-counts 요청은 `x-samarket-owner-dashboard-measure: 1` 로 dev 캐시만 무효화(응답 JSON 동일).

출력 필드: `structural_pass`, `latency_pass`, `rtt_limited`, `recommended_action`.

**CI/PR:** `structural_pass === false` → **무조건 exit 1**. `rtt_limited === true` → 코드 수정 금지, 배포 환경 재측정. `latency_pass`는 `environment_mode`별.

---

## order-counts SLO

### 구조 PASS (모든 환경 — 회귀 시 FAIL)

| 조건 | 기대 |
|------|------|
| `order_counts_via` | `rpc_snapshot` (cold) |
| `db_round_trips` | `1` (cold) |
| `fallback_used` | `0` |
| `ownership_check_ms` | `0` (앱·breakdown) |
| `store_ops_meta_ms` | `0` (앱·breakdown) |
| `rpc_server_sql_ms` | ≤ 20ms (`EXPLAIN ANALYZE` 기록, measure가 채움) |
| warm | `cache_hit = 1`, `total_ms` ≤ 30ms (구조 락 warm 상한) |

RPC: `get_owner_store_ops_dashboard_snapshot` — owner gate + meta + counts 단일 SECURITY DEFINER 호출.

### Latency — `local_linked` (참고)

| | 기준 |
|--|------|
| cold `total_ms` | ≤ **350ms** 허용 (`rpc_snapshot` 유지 필수) |
| cold 250–350ms | **WARN** (`rtt_limited`) — RTT 한계, SQL 튜닝 금지 |
| cold > 350ms | **FAIL** (로컬 허용 상한 초과) |
| warm `total_ms` | ≤ **30ms** |

### Latency — `prod_same_region` (목표)

| | 기준 |
|--|------|
| cold `total_ms` | ≤ **250ms** **FAIL** if over |
| warm `total_ms` | ≤ **20ms** **FAIL** if over |

### DB vs RTT (2026-05-24 기록)

`EXPLAIN ANALYZE get_owner_store_ops_dashboard_snapshot` 실행 **~5ms** → RPC 내부 SQL 병목 아님.  
`rpc_wall_ms` 130–280ms vs SQL 5ms → **PostgREST/네트워크 RTT** (local_linked).

---

## 회귀 경고 (`[owner-dashboard-perf-v2]`)

### local_linked — **FAIL** (구조)

- legacy fallback (`fallback_used=1`, `[owner-store-ops-counts-legacy-fallback]`)
- `db_round_trips > 1` (order-counts cold)
- `order_counts_via !== rpc_snapshot`
- warm에서 `cache_hit` 반복 미스 (measure 3-run)
- `rpc_server_sql_ms > 20` (EXPLAIN)
- 응답 JSON shape 변경 (계약 테스트·리뷰 — 런타임 로그만으로는 미검)

### local_linked — **WARN** (latency)

- cold `total_ms` 250–350ms (`[owner-dashboard-perf-v2] rtt_limited`)
- `rpc_wall_ms` 높고 EXPLAIN 빠름

### prod_same_region — **FAIL** (latency)

- order-counts cold `total_ms` > 250ms
- order-counts warm `total_ms` > 20ms
- (구조 FAIL 항목은 동일)

---

## API별 구조 락

### A. order-counts

- `rpc_snapshot` only (cold)
- 1 app RTT / `db_round_trips: 1`
- `fallback_used: 0`
- 직렬 ownership·meta 제거 (`ownership_check_ms` / `store_ops_meta_ms` ≈ 0)

### B. hub badge (no-store 계정)

- `no_hub_fast_path: 1`
- `unread_parts_ms: 0` (`unread_parts_via: skipped_no_hub`)
- warm `total_ms` ≤ 30ms

no-store 게이트 측정: `OWNER_DASHBOARD_GATE_NO_HUB=1` + hub 없는 계정(예: `aaaa`).

### C. notifications (unread_count_only)

- cold `notifications_via: rpc_segmented` · `db_round_trips: 1`
- warm `cache_hit: 1` · `notification_count_ms: 0` (globalThis 캐시락)
- `?owner_store_id=` 목록: `notifications_via: rpc_owner_store_list` (SQL `meta.store_id` 필터)

---

## 로그

| 태그 | 용도 |
|------|------|
| `[owner-dashboard-perf-v2]` | route·cache·`order_counts_via`·`db_round_trips`·breakdown ms |
| `[order-counts-cold-breakdown]` | cold stage·`rpc_wall_ms` |
| `[hub-badge-breakdown]` | no-hub·`unread_parts_ms` |
| `[owner-store-ops-dashboard-snapshot-rpc-hit]` | snapshot 경로 |
| `[owner-dashboard-perf-v2] structural regression` | 구조 FAIL |
| `[owner-dashboard-perf-v2] rtt_limited` | local RTT WARN |

---

## 구현 요약

- **Order-counts:** `get_owner_store_ops_dashboard_snapshot` · 5s TTL + single-flight · `[order-counts-cold-breakdown]`
- **Hub:** wave1+cm 병렬 · no-hub fast path · 5s TTL
- **Notifications:** `count_notification_unread_segmented` 단일 RPC + 20s globalThis TTL/singleflight
- **Owner store list:** `get_owner_store_commerce_notifications` (220건 fetch+slice 제거)

마이그레이션 적용: `20260524120000_get_owner_store_ops_dashboard_snapshot_rpc.sql` (+ counts RPC).  
linked 수동: `npx supabase db query --linked` + `NOTIFY pgrst, 'reload schema'`.

---

## PR/CI 전

```bash
npm run measure:owner-dashboard-api
```

| 결과 | 조치 |
|------|------|
| `structural_pass: false` | **FAIL** — 구조 복구 후 재측정 |
| `rtt_limited: true` | **PASS exit 0** — 배포 동일 리전 측정, 코드 튜닝 금지 |
| `latency_pass: false` (prod) | **FAIL** — prod 인프라/리전 |
| `latency_pass: false` (local, cold > 350) | **FAIL** — 로컬 허용 상한 초과 |
