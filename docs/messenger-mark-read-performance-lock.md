# Messenger PATCH `mark_read` — performance lock (구조 회귀 방지)

`PATCH /api/community-messenger/rooms/[roomId]` · `action: "mark_read"` · `flushOpen: true` (cold unread open) 및 warm duplicate 경로.

**상태 (2026-05-21): 구조 병목 제거 완료.** 남은 지연은 주로 **Supabase linked DB RTT** (`mark_read_combined_rpc_ms` ~384ms). RTT 와 구조 회귀를 **분리**해서 판정한다.

**이 문서·락은 동작·unread·response JSON·realtime·UI·combined RPC SQL 을 바꾸지 않는다** — 관측·검증·dev 경고만.

## 관련 구현

| 영역 | 파일 |
|------|------|
| Combined open_tail RPC | `supabase/migrations/20260524150000_community_messenger_apply_room_read_mark_open_tail_rpc.sql` |
| Mark handler | `lib/community-messenger/service.ts` — `markCommunityMessengerRoomAsRead` |
| Permission (경량) | `lib/community-messenger/server/messenger-room-canonical-resolve-core.ts` |
| Permission API | `lib/community-messenger/server/messenger-room-canonical-resolve-api.ts` |
| Membership cache | `lib/community-messenger/server/messenger-room-membership-cache.ts` (`globalThis` 단일 Map) |
| Route + `[dev-api-perf]` | `app/api/community-messenger/rooms/[roomId]/route.ts` |
| Lock evaluator | `lib/community-messenger/mark-read-performance-lock.ts` |
| Baseline JSON | `lib/community-messenger/mark-read-performance-lock.baseline.json` |
| 검증 스크립트 | `scripts/_verify-mark-read-permission.mjs` |

## 고정 구조 (PASS baseline)

### Permission / cache

1. Bootstrap 또는 room `GET` 성공 후 동일 `userId` + URL `roomId` 로 membership **seed**.
2. 다음 PATCH: `permission_source === "membership_cache"`, `membership_cache_hit === 1`, `permission_query_ms === 0` (목표 0~5ms).
3. Permission cold path 는 **`messenger-room-canonical-resolve-core`만** — `messenger-room-canonical-resolve-api.ts` 에서 **`import("@/lib/community-messenger/service")` 금지** (과거 ~699ms 원인).
4. Membership Map 은 **`globalThis.__samarket_cm_room_membership_cache_v1__`** — 라우트 번들 간 공유.

### Cold unread open (`flushOpen`, 커서 없음, 미읽음)

1. **`mark_read_fetch_existing_ms === 0`** — open 전 participant SELECT 제거.
2. **`mark_read_combined_rpc_used === 1`** — `community_messenger_apply_room_read_mark_open_tail` 단일 RPC.
3. **`mark_read_db_round_trips === 1`**.
4. **`response_before_broadcast === 1`** — broadcast 는 `after()` (HTTP 응답 후).

### Warm / duplicate / dual-tab

1. 동일 커서·unread 0: duplicate skip, combined RPC 미사용 허용.
2. **`patch_room_response_wall_ms` ≤ 50ms** (local_linked 목표), **≤ 100ms** hard FAIL.
3. Dual-tab 동시 PATCH: **`patch_room_inflight_dedupe_hit === 1`** 또는 second wall ≤ 50ms.

## SLO — 환경 분리

### `local_linked` (기본 dev · 원격 Supabase linked)

| Metric | PASS | WARN only | FAIL (구조) |
|--------|------|-----------|-------------|
| `permission_query_ms` (seeded A/B) | ≤ **50** | — | > 50 또는 `membership_cache_hit=0` |
| `permission_query_ms` (cold no-seed) | ≤ **250** | — | > 250 + cache miss 원인 조사 |
| `mark_read_db_round_trips` (cold open) | **1** | — | > 1 |
| `mark_read_fetch_existing_ms` (cold) | **0** | — | > 0 |
| `mark_read_combined_rpc_used` (cold unread) | **1** | — | **0** |
| `mark_read_combined_rpc_ms` | — | > **400** (`mark_read_combined_rpc_rtt`) | — |
| `patch_room_response_wall_ms` (cold) | — | > **500** (RTT) | — |
| Warm duplicate wall | ≤ **50** | 50–100 | > **100** |
| `response_before_broadcast` | **1** | — | ≠ 1 |

**해석:** cold wall ~411ms · `combined_rpc_ms` ~384ms 는 **linked RTT** — 구조 PASS + RTT WARN.

### `prod_same_region` (배포·동일 리전 재측정)

| Metric | Target | Hard FAIL |
|--------|--------|-------------|
| Cold open `patch_room_response_wall_ms` | **150–200ms** | > **250ms** |
| `permission_query_ms` | ≤ **10ms** | > 10ms (seeded miss 포함) |
| Warm duplicate | ≤ **50ms** | > **100ms** |

설정: `SAMARKET_PERF_ENV=prod_same_region` (스크립트·락 evaluator).

## `[dev-api-perf]` PATCH mark_read 필드

### Permission breakdown

| Field | Lock use |
|-------|----------|
| `permission_query_ms` | Seeded ≤50; cold no-seed ≤250 |
| `membership_cache_hit` | Seeded route must be 1 |
| `permission_source` | Seeded: `membership_cache` |
| `permission_cache_reason` | Seeded: `hit` |
| `permission_cache_lookup_ms` | Hit: ~0 |
| `permission_db_query_ms` | Hit: 0 |
| `permission_room_fetch_ms` | Hit: 0 |
| `permission_canonical_build_ms` | Hit: 0 |

### Mark / DB

| Field | Lock use |
|-------|----------|
| `mark_read_combined_rpc_used` | Cold unread: 1 |
| `mark_read_combined_rpc_ms` | RTT (local WARN >400) |
| `mark_read_fetch_existing_ms` | Cold: 0 |
| `mark_read_db_round_trips` | Cold: 1 |
| `mark_read_cold_open_path` | Cold open flag |
| `patch_room_response_wall_ms` | Warm ≤50; prod cold target |
| `response_before_broadcast` | Must be 1 |
| `patch_room_inflight_dedupe_hit` | Dual-tab D |
| `patch_room_duplicate_ack_skipped` | Warm C |

## Dev 회귀 경고 (요청당 1회)

`NODE_ENV=development` 이고 **구조 FAIL** 또는 **local_linked RTT WARN** 시:

```text
[cm-mark-read-perf-lock] {"pass":false,"structure_pass":false,"perf_environment":"local_linked","regression_codes":"...","failures":[...],"warnings":[...]}
```

- **구조 FAIL** → `regression_codes` 에 `db_round_trips`, `combined_rpc_used`, `membership_cache_miss_after_seed` 등.
- **RTT WARN only** → `mark_read_combined_rpc_rtt` — `prod_same_region` 재측정 안내.

## 검증

```bash
# dev 서버 실행 중
$env:CM_VERIFY_ROOM_ID = "<canonical-room-uuid>"   # optional
$env:SAMARKET_PERF_ENV = "local_linked"            # default
$env:BOOTSTRAP_DEV_TERMINAL_LOG = "<path-to-dev-terminal.txt>"

node scripts/_verify-mark-read-permission.mjs
```

Exit code **0 = 구조 PASS** (RTT WARN 은 exit 0, 로그에 표시).

시나리오:

| ID | Steps | Lock expectations |
|----|-------|-------------------|
| **A** | room bootstrap → PATCH open | Seeded permission; cold combined if unread |
| **B** | room GET → PATCH open | Seeded permission |
| **C** | PATCH open repeat | Warm wall ≤50 (≤100 fail) |
| **D** | 2× parallel PATCH | `inflight_dedupe_hit` or fast second |

## FAIL 조건 (구조 회귀 — 즉시 조사)

- Bootstrap/GET 후 `membership_cache_hit === 0`
- `messenger-room-canonical-resolve-api.ts` 에 `service.ts` dynamic import 재등장
- `mark_read_db_round_trips > 1` (cold open)
- `mark_read_fetch_existing_ms > 0` (cold)
- `mark_read_combined_rpc_used === 0` (cold unread, non-duplicate)
- `response_before_broadcast !== 1`
- Warm duplicate `patch_room_response_wall_ms > 100`
- Dual-tab inflight dedupe 실패 + both slow

## 절대 역행 (리뷰 체크)

- Cold open 에 participant SELECT + legacy `apply_room_read_mark` 2RTT 복귀
- Permission path 에 `import("@/lib/community-messenger/service")` 복귀
- Module-local membership `Map` (번들 분리) 복귀
- Bootstrap/GET seed 제거
- Broadcast 를 PATCH handler 동기 대기로 되돌림
- unread semantics · response JSON · realtime payload 변경 (별 PR·문서)

## Baseline 갱신

1. 의도적 구조 개선 후 A–D 재측정.
2. `mark-read-performance-lock.baseline.json` · 이 문서 표 갱신.
3. `prod_same_region` 측정 시 `SAMARKET_PERF_ENV` 명시 후 PR 에 숫자 첨부.

## 홈 수동 읽음 optimistic mark-read (2026-05-28 라운드 마감)

**상태:** 홈 수동 읽음 optimistic 적용 **완료**. 클라이언트는 방 입장과 동일 계약으로 PATCH 전 목록·배지 0을 먼저 반영한다 (`applyCmHomeOptimisticMarkRead` → `markRoomRead` in `CommunityMessengerHome.tsx`).

### 검증 가능한 실제 표면 (TEST SURFACE)

| 표면 | 개별 `roomId` + swipe/read 검증 | 비고 |
|------|--------------------------------|------|
| **`/community-messenger/delivery-chats`** (`?filter=unread` 권장) | **적합** | `[data-cm-unread-badge='true']` 행 · `읽음` 버튼 enabled |
| **`/community-messenger?section=chats` (인박스 홈)** | **부적합** | 거래·배달 미읽음은 **묶음 행**(`data-messenger-pillar-row`)만 표시; 개별 방 UUID·스와이프 읽음 없음 |
| **`/community-messenger/trade-chats`** | **부적합 (본 계정)** | API 미읽음 방(배달)과 목록 행 불일치; visible 행 `displayedUnreadCount === 0` → 읽음 disabled |

인박스에서 `테스트1 (@aa11)` 제목 fuzzy 매칭은 **오탐** — 묶음 행 preview 와 겹칠 뿐 `roomId` 가 DOM에 없다.

### 실측 (delivery-chats, `aaaa@manual.local`, production-like `build` + `start`)

디버그: `NEXT_PUBLIC_CM_READ_BADGE_DEBUG=1`, `NEXT_PUBLIC_CM_READ_UI_DEBUG=1`.

| 항목 | 결과 |
|------|------|
| API `bootstrap` / `home-sync` | 미읽음 5방 — `unreadCount > 0` (예: `8545493c-…` unread **5**); critical·full 페이로드에 동일 ID·count 포함 (**cap 누락 아님**) |
| DOM selector | 행 `[data-messenger-chat-row='true']`, 배지 `[data-cm-unread-badge='true']`, 읽음 `button` (텍스트 `읽음`) |
| `home_mark_read_optimistic_zero` | **발생** |
| `mark_read_patch_start` 이전 badge 0 | **확인** (낙관 로그 → PATCH start 순서) |
| PATCH RTT | **~693 ms** (`local_linked`) |
| PATCH 후 해당 방 unread | **재상승 없음** (클릭 행 badge `5` → 0) |
| 다른 미읽음 행 | **유지** (동일 목록에 badge 4건 잔존 — 단일 방 읽음 정상) |

### 결론

- 이전 E2E **FAIL** 은 **제품 코드 실패가 아님** — 테스트 표면(인박스/trade-chats)과 **IA(묶음 행 vs 개별 행)** 불일치.
- 홈 수동 읽음 **perceived latency 개선** — delivery-chats 실측 기준 **PASS** (낙관 → PATCH, 해당 방만 0).

### 라운드 최종 상태

| Gate | Status |
|------|--------|
| CODE | **PASS** |
| TSC | **PASS** |
| BUILD | **PASS** |
| BEHAVIOR | **PASS** |
| TEST SURFACE | **FIXED** (`/community-messenger/delivery-chats`) |

## Changelog

구조 변경 시 `docs/trade-perf-hot-path-changelog.md` 에 한 줄 append (mark_read·permission 분리 추적).

- **2026-05-28:** 홈 수동 읽음 optimistic mark-read 라운드 마감 · 검증 표면 `delivery-chats` 고정 (위 절).
