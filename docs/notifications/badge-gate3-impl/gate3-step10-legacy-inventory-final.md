# Gate 3 Step 10 — Legacy inventory final

근거: Gate 1 audit · Writer Freeze · Gate 2 cutover contract · HEAD product paths (2026-08-03).

| Legacy 경로 | 데이터 의미 | Canonical 대응 | 중복 키 | 분류 | 제거 시점 |
|-------------|-------------|----------------|---------|------|-----------|
| `public.notifications` rows (A-eligible) | 과거 member inbox | `notification_events` A | `legacy:notifications:{id}` | **BACKFILL SOURCE** | after dry-run apply (prod later) |
| `public.notifications` chat rows | chat unread history | Conversation B cursors | n/a (not cloned to A) | **NON-BADGE KEEP** (archive) | table DROP separate approval |
| `public.notifications` owner commerce | owner_intake / store ops | Owner C `store:{id}` | n/a | **NON-BADGE KEEP** / C source | C writers; not Member A |
| `public.notifications` marketing | push-only promo | delivery_only (no A) | n/a | **DELETE** as A authority | never backfill to A |
| GET `/api/me/notifications` legacy merge | dual list | events-only (`legacy_merge:false`) | dedupe on merge helper | **DELETE** (product) | already off product Bell |
| `mergeInboxNotificationRowsEventsPrimary` | historical merge helper | quarantine / tooling | event dedupe_key | **TEMPORARY READ ADAPTER** tooling | when remainingLegacyCount=0 |
| `legacyNotificationsSelect` read | id lookup / adapter | events primary | — | **TEMPORARY READ ADAPTER** | adapter expiry / drain |
| PATCH `mark_all_read` → legacy update | dual mark-all | `markAllNotificationEventsRead` | — | **DELETE** (Step 10) | **removed** |
| PATCH owner/chat mark → legacy update | dual mark | events mark helpers | — | **DELETE** (Step 10) | **removed** |
| `patchInboxNotificationIdsRead` legacy update | dual read | events `markNotificationRead` | — | **DELETE** (Step 10) | **removed** |
| `patchInboxNotificationIdsDelete` legacy delete | hard delete | soft `deleted_at` on events | — | **DELETE** (Step 10) | **removed** |
| `markPriorBuyerOrderStatus…` legacy update | dual read | `markOrderNotificationsRead` | — | **DELETE** (Step 10) | **removed** |
| `fetch-segmented-unread-count-server` legacy counts | deprecated fallback | Domain / targets / events | — | **DELETE** (Step 13) | RPC-only; no `notifications` COUNT fallback |
| INSERT into `notifications` | legacy create | `createNotificationEvent` | — | **DELETE** | write-ban test PASS |
| Cap resume legacy total | stale paint | App Icon snapshot+version | — | **BLOCKED** (Runtime prep) | residual risk step |
| room identity `*:room:{uuid}` | fallback key | domain identity | — | **BLOCKED** (Runtime prep) | residual risk step |

```text
Backfill SOURCE = A-eligible persistent only
Adapter = read-only non-backfilled A shape
Dual-write badge paths = DELETE (this step)
Production apply / table DROP = NOT this step
```
