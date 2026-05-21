# Messenger bootstrap lite — performance lock (회귀 방지)

`GET /api/community-messenger/bootstrap?lite=1` 첫 화면 성능 계약. **동작·unread·response shape 는 이 문서가 바꾸지 않는다** — 관측·검증·dev 경고만.

관련 구현:

- `lib/community-messenger/bootstrap-lite-performance-lock.ts`
- `lib/community-messenger/bootstrap-lite-performance-lock.baseline.json`
- `app/api/community-messenger/bootstrap/route.ts` — `[cm-bootstrap-lite-perf-lock]` warn
- `scripts/_verify-bootstrap-lite-rooms-3run.mjs`

## PASS baseline (2026-05-21, warm run 2+)

`community_messenger_bootstrap_lite_my_rooms_bundle` RPC 배포 후 `?lite=1&fresh=1` ×3 측정.

| Metric | Baseline (warm) | Hard max (lock) |
|--------|-----------------|-----------------|
| `bootstrap_lite_rooms_fetch_path` | `bundle_rpc` | **must** `bundle_rpc` |
| `total_api_ms` | 310 | ≤ **500** |
| `rooms_query_ms` | 281 | ≤ **300** |
| `profiles_query_ms` | 12 (bundle `profile_labels` + miss-only fetch) | ≤ **50** |
| `parallel_initial_wall_ms` | 282 | ≤ 320 (warn only in script) |
| `trade_enrich_ms` | 2 | ≤ **20** |
| `enrich_trade_middle_ms` | 0 | **=== 0** |
| `bootstrap_lite_trade_heavy_pipeline_skipped` | true | **true** |
| `friends_query_ms` + favorite + discoverable + call log | 0 | **0** |
| `payload_kb` | 23.3 | ≤ **35** |
| `room_count` | 22 | ≥ 1 (목록 붕괴 방지) |

Cold run 1 (`total_api_ms` ~900)는 컴파일·콜드 영향 — **warm latency 게이트는 run 2+ 만** 적용.

## 고정 계약 (회귀 시 즉시 FAIL)

1. **Rooms:** `bootstrap_lite_rooms_fetch_path === "bundle_rpc"` — legacy 3RTT·embed 폴백 금지.
2. **Trade enrich:** fast path + `heavy_pipeline_skipped === true` + `middle_pipeline_blocked === true` + `enrich_trade_middle_ms === 0`.
3. **Social defer:** lite parallel wall 에 friends / requests / favorite / discoverable / call log fetch **0ms**.
4. **Payload:** `payload_kb <= 35` (slim rooms + deferred social + bundle `profile_labels`).
5. **Profiles:** `profiles_query_ms <= 50` warm — participant+viewer only; no social-graph `profiles.in` on lite first paint.
6. **Shape:** `room_count >= 1` (테스트 계정 기준 baseline 22 — 급감 시 조사).

### Appendix — room prefetch / owner hub badge (관측만)

- **Room prefetch** (`cm-bootstrap-tier`, `room-prefetch-queue`): hover/touch 시 동일 `roomId` bootstrap 은 클라 singleflight·짧은 TTL 캐시로 중복 HTTP 를 줄인다. lite list bootstrap 과 별 경로 — list 병목은 `bundle_rpc` + `profile_labels`.
- **Owner hub badge** (`unread_parts_ms` ~522 vs `cm_unread_ms` ~249): wave1 `unread_parts` RPC 와 wave2 `cm_unread` RPC 가 **다른 소스**를 읽는다. unread **의미·합산** 변경 없이 동일 bundle 재사용은 후속(허브 전용 memory stage 는 이미 run2 memory hit).

## `[cm-bootstrap-v2]` 로그 필드 (lite)

| Field | Purpose |
|-------|---------|
| `total_api_ms` | 라우트 벽시계 |
| `full_payload_ms` | monolith 대기 |
| `parallel_initial_wall_ms` | lite: 주로 rooms |
| `rooms_query_ms` | `fetchMyRoomsPayload` |
| `bootstrap_lite_room_ids_rpc_ms` | bundle RPC wall (≈ rooms_query) |
| `bootstrap_lite_rooms_meta_fetch_ms` | bundle: 0 |
| `bootstrap_lite_participants_join_ms` | bundle: 0 |
| `bootstrap_lite_last_message_fetch_ms` | room 행 포함, 항상 0 |
| `bootstrap_lite_room_payload_map_ms` | `byRoomId` map |
| `bootstrap_lite_rooms_query_slowest_stage` | rooms 서브 병목 |
| `bootstrap_lite_rooms_fetch_path` | `bundle_rpc` \| `legacy` |
| `profiles_query_ms` | lite first-paint hydrate |
| `bootstrap_lite_profiles_fetch_ms` | same as profiles_query_ms |
| `bootstrap_lite_profiles_bundle_embedded_count` | bundle RPC labels hit |
| `bootstrap_lite_profiles_miss_fetch_count` | extra `profiles.in` ids |
| `bootstrap_lite_rooms_rpc_cache_hit` | 프로세스 캐시 hit |
| `bootstrap_lite_rooms_cache_bypass` | `fresh=1` |
| `friends_query_ms` / `requests_query_ms` | lite: 0 |
| `trade_enrich_ms` | fast enrich |
| `bootstrap_lite_trade_enrich_fast_path` | true |
| `bootstrap_lite_trade_heavy_pipeline_skipped` | true |
| `bootstrap_lite_middle_pipeline_blocked` | true |
| `bootstrap_lite_missing_only_batch_ms` | 0 유지 |
| `bootstrap_lite_direct_keys_*` | mega prefetch (건드리지 말 것) |
| `bootstrap_lite_social_graph_source` | cache \| empty |
| `payload_kb` / `room_count` | shape·크기 |

## `[cm-bootstrap-breakdown]` 추가

| Field | Lock use |
|-------|----------|
| `enrich_trade_direct_keys_ms` | ≤ ~20 warm |
| `enrich_trade_middle_ms` | === 0 |
| `enrich_trade_posts_fetch_ms` | 0 |
| `enrich_trade_category_fetch_ms` | 0 |

## Dev 회귀 경고

`NODE_ENV=development` 이고 lite 부트스트랩이 lock 을 깨면 **요청당 1회**:

```text
[cm-bootstrap-lite-perf-lock] {"pass":false,"regression_codes":"...","failures":[...]}
```

`SAMARKET_MESSENGER_TRACE_LOG=1` 와 함께 쓰면 `[cm-bootstrap-v2]` 직후 확인.

## 검증

```bash
# dev + trace
$env:SAMARKET_MESSENGER_TRACE_LOG = "1"
npm run dev

node scripts/_verify-bootstrap-lite-rooms-3run.mjs
```

Exit code **0 = PASS**, **1 = FAIL**. Warm = run 2·3.

## Baseline 갱신 절차

1. 의도적 개선 후 `?lite=1&fresh=1` ×3 재측정.
2. `bootstrap-lite-performance-lock.baseline.json` 의 `baseline`·`recordedAt` 갱신.
3. 이 문서 표 갱신.
4. PR 에 lock PASS 스크립트 출력 첨부.

## 절대 역행 (리뷰 체크)

- `bootstrap_lite_rooms_fetch_path` → `legacy` 복귀
- lite `Promise.all` 에 social fetch 재포함
- trade full enrich / middle pipeline / missing-only batch 재활성
- `bootstrap_rooms` fat RPC on lite without bundle
