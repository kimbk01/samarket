# Legacy Fallback Cleanup Lock (LFC1)

> **트랙:** LFC1 — Legacy Fallback Cleanup  
> **상태:** 진행 중 (soft-disable + audit; hard delete는 OPS1-B PASS 후)  
> **관련:** [legacy-fallback-cleanup-report.md](./legacy-fallback-cleanup-report.md)

## 목표

Structural PASS snapshot-first 트랙에서 **legacy multi-wave / request-time aggregate fallback** 을 단계적으로 제거하고 **snapshot-only** 운영으로 수렴한다.

## 절대 금지 (재도입)

| 금지 | 설명 |
|------|------|
| PostgREST embed inner join | snapshot RPC로 대체된 join chain |
| multi-wave `Promise.all` aggregate | room+profile+trade+order request-time 재조립 |
| sequential `await` on independent queries | wave 2+ 재발 |
| reconnect legacy fetch | MRC1 reconnect stale discard 위반 |
| fallback masking | snapshot miss 시 silent legacy without audit |
| `query_wave_2_ms > 0` on snapshot path | wave 2 재도입 |
| `rpc_removed = 0` on snapshot path | monolith RPC chain 재도입 |

## 허용 RTT / round trips (snapshot path)

| Tier | RTT | round_trips |
|------|-----|-------------|
| counter hit | 0 (memory/table PK) | 0–1 |
| cold unified RPC | 1 | 1 |
| route memory TTL | 0 | 0 |

## 삭제 게이트 (fallback hard delete)

1. RPC deployed  
2. snapshot path active  
3. `fallback_used = 0` (e2e + prod audit)  
4. `query_wave_2_ms = 0`  
5. `rpc_removed = 1`  
6. **OPS1-B prod sign-off ≥ 3회 PASS**  
7. manual UI scenarios PASS  
8. reconnect stress PASS  
9. burst stress PASS  
10. long-session stale 없음  

**OPS1-B 미충족 시:** hard delete 금지 — `SAMARKET_LFC1_SNAPSHOT_ONLY=1` soft-disable만 허용.

## 환경 변수

| Env | 의미 |
|-----|------|
| `SAMARKET_LFC1_SNAPSHOT_ONLY=1` | 전 route legacy block (soft-disable) |
| `SAMARKET_LFC1_SNAPSHOT_ONLY_ROUTES` | comma-separated route allowlist |
| `SAMARKET_LFC1_HARD_DELETED_ROUTES` | OPS1-B gate 후 hard-delete 표시 (코드 제거 전) |
| `SAMARKET_OPS1B_SIGNOFF_PASS_COUNT` | prod sign-off PASS 횟수 |
| `SAMARKET_LEGACY_FALLBACK_AUDIT=0` | audit log off (verify 제외) |

## Cleanup 순서 (route 단위)

1. verify/dev-only fallback 제거  
2. temporary reconnect fallback 제거  
3. legacy monolith fetch 제거 (`fetch-*-legacy.ts`)  
4. request-time aggregate builder 제거  
5. unused PostgREST join helper 제거  
6. unused multi-wave instrumentation 제거  

**한 번에 전부 제거 금지** — route cleanup → verify RPC → verify E2E → reconnect/burst.

## Reconnect / consistency (MRC1 유지)

- `snapshot_version` monotonic merge  
- reconnect stale discard  
- active room unread guard  
- cross-tab consistency  
- duplicate realtime discard  

## Regression alert

`[legacy-cleanup-regression-alert]` — `lib/ops/legacy-fallback-cleanup-regression-guard.ts`

1. fallback branch reintroduced  
2. `query_wave_2_ms > 0`  
3. `rpc_removed` reverted  
4. legacy builder invoked  
5. reconnect triggered legacy  
6. request-time aggregate detected  
7. stale overwrite  
8. duplicate realtime merge  

## Registry

단일 소스: `lib/ops/legacy-fallback-cleanup-policy.ts` → `LEGACY_FALLBACK_ROUTE_REGISTRY`

## Rollback

1. `SAMARKET_LFC1_SNAPSHOT_ONLY=0` (default)  
2. legacy module restore from git (hard delete 전에는 branch 유지)  
3. `docs/samarket-performance-track-state.md` LFC1 blocker 기록  
