# Gate 3 Step 10 — Legacy Cutover

**Verdict:**

```text
LEGACY CUTOVER CODE PASS
```

| Declaration | Status |
|-------------|--------|
| LEGACY CUTOVER CODE PASS | **YES** (code + fixture dry-run) |
| LEGACY CUTOVER READY (live prod dry-run) | **NO** — Production apply forbidden; live row counts not taken |
| Badge Authority CODE PASS | **NO** |
| RUNTIME / PRODUCT / HARD LOCK | **NO** |

---

## 1. Inventory

`gate3-step10-legacy-inventory-final.md`

## 2. Backfill 대상 / 제외

| Include (A) | Exclude |
|-------------|---------|
| persistent notice / trade / buyer order status / orphan missed | chat → B |
| | owner commerce → C |
| | push-only marketing |
| | deleted/dismissed |
| | already canonical dedupe |

## 3. Dedupe

```text
legacy:notifications:{legacyId}
```

Identity compare — never count-only dedupe.

## 4. Dry-run (fixture)

From `legacy-cutover-contract.test.ts` FIXTURE (7 rows; unknown L7 excluded for READY):

| Metric | Count |
|--------|------:|
| legacy total | 6 (ready set) / 7 (with unknown) |
| eligible A | 2 |
| eligible B (chat) | 1 |
| eligible C (owner) | 1 |
| push-only | 1 |
| deleted | 1 |
| already canonical | 0 (first pass) |
| unknown | 0 (ready) / 1 (with L7) |
| identity contamination | 0 |

**Live production dry-run:** not executed (Step 10 forbids prod apply).

## 5. Unknown / contamination

- Fixture with unknown → `cutoverReady=false` (auto-apply blocked)
- Fixture cleaned → `cutoverReady=true`
- Live unknown: **unknown** until ops dry-run

## 6. Temporary adapter

- Module: `legacy-temporary-read-adapter.ts`
- Role: read-only canonical shape for non-backfilled A rows
- `adapterRemovalCondition`: remainingLegacyCount===0 OR all A-eligible backfilled
- `adapterExpiry`: 2026-09-01T00:00:00.000Z
- Digit: `adapterDoesNotContributeToAuthorityDigit` — never sums into A

## 7. 제거한 dual-write

- PATCH `mark_all_read` legacy update
- PATCH owner / chat / excluding_owner_commerce legacy updates
- `patchInboxNotificationIdsRead` legacy `is_read`
- `patchInboxNotificationIdsDelete` legacy hard delete
- `markPriorBuyerOrderStatusNotificationsRead` legacy update

## 8. NON-BADGE KEEP

- `notifications` table archive (chat/owner history) — no DROP
- `fetch-segmented-unread-count-server` legacy fallback — blocked for blind DELETE
- Cap resume / room identity — residual Runtime prep

## 9. Canonical-only write 증거

Static tests in `legacy-cutover-contract.test.ts` + `legacy-notification-write-ban.test.ts`  
Member A mark-all / Center delete / Push dispatcher: no legacy insert/update.

## 10. 멱등 backfill

`assertBackfillIdempotent` → secondInserts=0 PASS

## 11–13. 비회귀 / tests / tsc-lint

See end report in chat.

## 14. Production migration 적용

**NO**

## 15. 남은 위험

- Cap resume versionless paint
- room identity fallback
- live backfill unknown rate
- segmented unread legacy fallback call sites

## 16. 잔여 위험 단계 진입

**YES** — next: Cap resume · room identity · static gates · then prod backfill/deploy/Runtime
