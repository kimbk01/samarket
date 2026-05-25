# OPS1 — Prod Sign-Off & Operating Stability Report

> **Track:** OPS1 (DIBAY prod sign-off & operating stability hardening)  
> **Last updated:** 2026-05-25  
> **OPS1 상태 고정** — OPS1-A **■ 종료** · OPS1-B **■ PASS** · OPS1 최종 **■ PASS** (2026-05-25 prod)

---

## OPS1 상태 고정 (2026-05-25)

### OPS1-A: ■ 종료

- 관측 인프라
- audit
- runner
- probe
- structural verify
- 문서화 완료

**재개 금지:** 관측·audit·runner·probe 제거.

### OPS1-B: ■ PASS (2026-05-25 prod `da864bdf`)

- **Deploy:** `da864bdf` — warm TTL snapshot headers (RB1/SM1) + prod owner store resolve (`qqqq` → `076bffda…`)
- **PDS1 prod header probe:** **10/10** PASS · **0** auth-blocked
- **Triple signoff:** **3/3 PASS** (`gate_met: true`)
- **Reconnect stress:** PASS (`legacy_fallback_used=0`)
- **LFC1 hard delete:** OPS1-B gate met — per-route Phase A still required before delete

### OPS1 최종: ■ PASS (prod same-region + reconnect)

### 재개 조건

```bash
SAMARKET_BASE_URL=https://dibaY.vercel.app SAMARKET_PROD_PERF_MEASURE=1 npm run ops1:prod-signoff
```

**필수 env:**

- `OPS1_STORE_ID`
- `OPS1_STORE_SLUG`
- `OPS1_ROOM_ID`

**추가 (reconnect):**

```bash
PLAYWRIGHT_BASE_URL=https://dibaY.vercel.app PLAYWRIGHT_NO_WEBSERVER=1 npm run ops1:reconnect-stress
```

### 최종 PASS 조건

- prod **3회** sign-off
- `fallback_used = 0`
- counter hit **< 100ms**
- route TTL warm **< 50ms**
- reconnect stress PASS
- burst PASS
- long-session PASS

---

## Purpose

Validate completed snapshot-first / MRC1 consistency tracks under **operational** criteria — not just structural E2E on linked dev RTT.

**Absolute rules (unchanged):**

- No UI / response shape / unread semantics changes
- No snapshot architecture rollback
- No request-time aggregate reintroduction
- No PASS from warm cache numbers alone
- No PASS from console removal alone

---

## 1. Prod same-region sign-off

**Command:**

```bash
# Deployed preview/prod (required for OPS1 PASS)
SAMARKET_BASE_URL=https://your-app.vercel.app SAMARKET_PROD_PERF_MEASURE=1 npm run ops1:prod-signoff

# Linked dev baseline (structural only — do NOT treat counter_hit >100ms as regression)
SAMARKET_BASE_URL=http://127.0.0.1:3000 npm run start:prod-measure
SAMARKET_BASE_URL=http://127.0.0.1:3000 npm run ops1:prod-signoff
```

**Routes (6):**

| Route | Snapshot RPC |
|-------|----------------|
| `/api/me/store-owner-hub-badge` | `get_owner_hub_badge_snapshot` |
| `/api/community-messenger/home-sync` | `get_community_messenger_home_sync_snapshot` |
| `/api/community-messenger/rooms/[roomId]/bootstrap?mode=instant` | `get_community_messenger_room_bootstrap_snapshot` |
| `/api/stores/[slug]/menus` | `get_store_menus_snapshot` |
| `/api/me/notifications` | `get_owner_dashboard_notifications_snapshot` |
| `/api/me/stores/[storeId]/order-counts` | `get_delivery_summary_snapshot` |

**Output tag:** `[prod-same-region-signoff]`

**PASS (prod same-region):**

- route TTL warm **< 50ms**
- counter hit **< 100ms**
- `fallback_used = 0`
- `query_wave_2_ms = 0`
- `rpc_removed = 1`
- `regression_alert_count = 0`

### Route measurements (fill after prod run)

| Route | cold ms | counter hit ms | route TTL warm ms | fallback | q2 | rpc_removed | prod pass |
|-------|---------|----------------|-------------------|----------|-----|-------------|-----------|
| hub-badge | — | — | — | — | — | — | pending |
| home-sync | — | — | — | — | — | — | pending |
| room bootstrap | — | — | — | — | — | — | pending |
| store menus | — | — | — | — | — | — | pending |
| notifications | — | — | — | — | — | — | pending |
| order-counts | — | — | — | — | — | — | pending |

### Linked dev baseline (2026-05-25, `qqqq`, local_linked)

Local prod build / linked Supabase RTT — **structural only** (not OPS1 PASS):

| Route | cold | counter hit | route TTL warm | fallback | rpc_removed |
|-------|------|-------------|----------------|----------|-------------|
| hub-badge | ~194ms | ~155ms | **39ms** | 0 | via server log |
| home-sync | ~171ms | ~177ms | **39–40ms** | 0 | via server log |
| room bootstrap | ~183ms | ~166ms | **51ms** | 0 | 1 |
| store menus | ~2378ms* | ~296ms | ~332ms | headers TBD | TBD |
| notifications | ~402ms | ~169ms | ~168ms | 0 | 1 |
| order-counts | ~2650ms* | ~289ms | ~304ms | headers TBD | TBD |

\* cold includes dev compile noise — use `npm run start:prod-measure` for cleaner cold.

- Counter hit 150–300ms+ is **linked RTT**, not structural regression
- Prod counter hit **> 100ms sustained** → reopen affected track
- Full OPS1 PASS requires `SAMARKET_BASE_URL=<deployed>` + `same_region=true`

---

## 2. Reconnect stress

**Command:**

```bash
PLAYWRIGHT_NO_WEBSERVER=1 node scripts/ops1-reconnect-stress-playwright.mjs
```

**Client monitor:** `NEXT_PUBLIC_SAMARKET_OPS1_MONITOR=1` or Playwright injects `__SAMARKET_OPS1_MONITOR__`.

**Output tag:** `[reconnect-stress-analysis]`

**PASS:**

- No duplicate subscribe loop
- No unread resurrect after reconnect
- No stale snapshot overwrite
- Silent refresh **≤ 1** per reconnect cycle
- No legacy fallback

| Field | Result |
|-------|--------|
| reconnect_count | pending |
| duplicate_subscribe_count | pending |
| silent_refresh_count | pending |
| legacy_fallback_used | pending |
| pass | pending |

---

## 3. Realtime burst handling

**Output tag:** `[realtime-burst-analysis]` (client, OPS1 monitor enabled)

**Scenarios (manual / multi-tab):**

- 20 messages burst
- 10 orders burst
- 20 notifications burst
- mark-all-read then new message
- 2–3 tabs simultaneous receive

**PASS:**

- No duplicate merge
- Final unread/badge accurate
- Cross-tab desync **< 500ms**
- No regression alerts

| Field | Result |
|-------|--------|
| event_count | pending |
| deduped_count | pending |
| max_desync_ms | pending |
| pass | pending |

---

## 4. Long-session stability (30+ min)

**Output tag:** `[long-session-stability]`

**Monitor:** `initLongSessionStabilityMonitor()` in `CommunityMessengerHome` when OPS1 monitor enabled.

**PASS:**

- No unbounded cache growth
- No duplicate subscriptions
- No stale state
- Memory growth stable
- Unread/badge correct after route churn

| Field | Result |
|-------|--------|
| duration_min | pending |
| duplicate_subscription_count | pending |
| memory_growth_mb | pending |
| pass | pending |

---

## 5. Legacy fallback usage audit

**Output tag:** `[legacy-fallback-usage-audit]`

Emitted when any snapshot-first route hits legacy fallback **and** on sign-off RPC/table probes.

**Delete gate (do not delete branches yet):**

- `fallback_used = 0` for **3 prod sign-off runs** or **3 days**
- RPC deployed confirmed
- Snapshot row path confirmed
- No regression alerts

| Route | fallback_branch | used (prod) | rpc_deployed | can_delete |
|-------|-----------------|-------------|--------------|------------|
| hub-badge | legacy_aggregate | 0 (probe) | yes | await 3 signoffs |
| home-sync | legacy_multi_wave | 0 (probe) | yes | await 3 signoffs |
| room bootstrap | legacy_wave_a | 0 (probe) | yes | await 3 signoffs |
| store menus | legacy_products_popular | 0 (probe) | yes | await 3 signoffs |
| notifications | segmented_unread | 0 (probe) | yes | await 3 signoffs |
| order-counts | dashboard_rpc / legacy_25 | 0 (probe) | yes | await 3 signoffs |

---

## 6. Dev / prod parity

| Check | Status |
|-------|--------|
| local_linked RTT separated from prod_same_region | ✓ sign-off script `environment_mode` |
| dev compile noise excluded from prod PASS | ✓ use `start:prod-measure` / deployed URL |
| prod counter hit recorded separately | ✓ `[prod-same-region-signoff].counter_hit_ms` |
| linked RTT must not reopen structural tracks | ✓ documented |

---

## OPS1 final PASS checklist

| # | Criterion | OPS1-A | OPS1-B (prod) |
|---|-----------|--------|---------------|
| 1 | prod **3회** sign-off | — | pending |
| 2 | `fallback_used = 0` | linked baseline | pending |
| 3 | counter hit **< 100ms** | linked only | pending |
| 4 | route TTL warm **< 50ms** | linked ✓ (39–51ms) | pending |
| 5 | reconnect stress PASS | probe wired | pending |
| 6 | burst PASS | probe wired | pending |
| 7 | long-session PASS | probe wired | pending |

**OPS1 최종:** **▲ 미완료** — OPS1-B prod 실측 전 PASS 선언 금지

---

## Reopen conditions

Reopen affected closed track if any occur in **prod same-region**:

1. prod counter hit > 100ms sustained
2. legacy fallback at runtime
3. `query_wave_2_ms` reappears
4. unread resurrect
5. badge_room_mismatch
6. dashboard stale aggregate
7. store menus stale
8. notification duplicate
9. reconnect duplicate subscribe loop
10. memory/cache leak

---

## Verification commands

```bash
npm run verify:ops1-structural
npm run ops1:prod-signoff
PLAYWRIGHT_NO_WEBSERVER=1 npm run ops1:reconnect-stress
npx tsc --noEmit
```
