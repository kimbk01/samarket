# Phase 4-1 — Legacy Inventory & Reachability Audit

**Declared:** 2026-08-01  
**Scope:** Read-only classification. **No product deletes in this step.**  
**Locked (PRESERVE):** Phase 1 RoomUnread · Phase 2 Badge SSOT · Phase 3 Bell SSOT.

## Product SSOT (frozen)

```text
① RoomUnread  → unread origin (all room kinds)
② Badge       → RoomUnread projection → App Icon / Bottom / hubs / Native / FCM/APNS
③ Bell        → notification_events → Header → Inbox → DeepLink → Read → end
```

## Audit method

```text
Reference Graph → Caller → Import → Runtime Reachability
```

Product tree only (`lib/`, `app/`, `scripts/`). Exclude `.qa-logs/` / worktrees as evidence of LIVE.

Classes:

| Class | Meaning |
|-------|---------|
| **DELETE_CANDIDATE** | Importer-0 or test-only; unused → quarantine → runtime confirm → delete (Phase 4-2) |
| **QUARANTINE_KEEP** | Still referenced or policy/compat; isolate; do not delete this batch |
| **PRESERVE** | Authority / locked SSOT / ban evidence that must stay |

Reachability: **LIVE** | **DEAD** | **QUARANTINE** | **UNKNOWN**

---

## A. Strong DELETE_CANDIDATE (Batch A — first cleanup unit)

Prove again before delete: 0 product `app/` callers + no runtime wire.

| # | Path / symbol | Role | Callers (product) | Reach | Class |
|---|---------------|------|-------------------|-------|-------|
| A1 | `lib/notifications/heal-messenger-badge-derived-from-participants.ts` | Heal phantoms / targets / left-room events | 0 API/scripts; self only | DEAD | DELETE_CANDIDATE |
| A2 | `lib/notifications/heal-trade-store-order-badge-derived-from-participants.ts` | Align trade/buyer/owner targets | 0 product; 1 contract test | DEAD | DELETE_CANDIDATE |
| A3 | `lib/notifications/heal-stale-owner-order-intake-notification-events.ts` | Mark stale owner intake events read | 0 product; 1 SSOT test path read | DEAD | DELETE_CANDIDATE |
| A4 | `mergeInboxNotificationRows*` in `inbox-events-merge.ts` | Dual-read merge helper | Tests only; GET route events-only (`legacy_merge: false`) | DEAD product | DELETE_CANDIDATE |
| A5 | `isLegacyInboxCompatActive` | Sunset date helper | **0 callers** | DEAD | DELETE_CANDIDATE |
| A6 | `scheduleDomainBootstrapShadowFromLegacyHome` (`domain-bootstrap-shadow-bridge.ts`) | Orphan shadow schedule | **0 external callers** | DEAD | DELETE_CANDIDATE |
| A7 | `loadDomainBadgeTargetFacts` (`load-domain-badge-target-facts.ts`) | One-shot targets partition | Product HTTP builder **no longer imports**; tests only | DEAD product | DELETE_CANDIDATE |
| A8 | Split publishers `publishDomainBadgeShellToSurfaceStore` / `publishMissedCallToDomainBadgeSurface` | Banned App Icon axis writers | Tests + store definition; **0 product Apply** | QUARANTINE → delete exports after ban retained | DELETE_CANDIDATE |

**Batch A DO NOT include:** Authority Apply paths, `createNotificationEvent`, `applyNotificationBadgeProjection`, `applyBellBadgeProjection`.

---

## B. QUARANTINE_KEEP (compat / shadow / derived — later batches)

| # | Path / symbol | Role | Reach | Why keep |
|---|---------------|------|-------|----------|
| B1 | `legacy-inbox-compatibility-adapter.ts` (`legacyNotificationsSelect`) | Legacy table select | LIVE via `inbox-read-bridge` | PATCH/history IDs until table DROP |
| B2 | `inbox-read-bridge.ts` legacy mark-read/delete | Compat write on `notifications` | LIVE | Inbox PATCH still partitions legacy IDs |
| B3 | `app/api/me/notifications/route.ts` PATCH `.from("notifications")` | Mark-all / category / delete legacy | LIVE | Compat until DROP |
| B4 | `notify-store-commerce.ts` legacy `.update` | History clear mirror | LIVE | Not digit Authority |
| B5 | `countNotificationUnreadSegmentedLegacy` + RPC-miss fallback | COUNT `notifications` when RPC missing | LIVE fallback on `countNotificationUnreadSegmentedServer` → route `unread_count` | Digit invent risk; **remove fallback only after fail-closed + callers audited** |
| B6 | Engine shadow adapters + `runEnginePersistencePipeline` (`executed: false`) | Shadow compare, no persist | LIVE shadow | Contract: never second writer |
| B7 | Phase8/9 Domain shell / canary barrels | Isolated aggregators | QUARANTINE | Canary retirement separate |
| B8 | `notification_targets` bump/clear/count | Derived list presence | LIVE | Not App Icon / Bell origin |
| B9 | `Math.max(1, n)` in unread-from-targets helpers | List presence floor | LIVE | RoomUnread-adjacent; review only post-Authority OK |
| B10 | Import-ban / dead-wrapper bans for already-deleted files | Revive prevention | LIVE gate | Keep ban strings forever |
| B11 | `hub-r1-r4-measurement` / `phase-h-quarantine` | Ban evidence registry | DEAD product | Keep for verify |

---

## C. PRESERVE (LOCKED — Phase 4 must not open)

| Item | Role |
|------|------|
| RoomUnread Authority + participant loaders | Unread origin |
| `applyNotificationBadgeProjection` / complete App Icon snapshot / Badge Explain | Badge SSOT |
| `createNotificationEvent` / `applyBellBadgeProjection` / Bell Explain / `resolveTier1HeaderBellBadgeTotal` | Bell SSOT |
| `badge-writer-authority.ts` / `bell-writer-authority.ts` | Writer inventory SSOT |
| FCM/APNS / Cap Badge echo of `appIconTotal` | Native identity |
| Auth wipe `resetNotificationBadgeCountForAuthEpoch` / clear native | Wipe, not invent |

---

## D. Already DEAD (code gone — ban stays)

| Item | Note |
|------|------|
| Hub absolute CM writer | Deleted P0-2; `verify-badge-import-ban` |
| Header invent helpers (`storeUnread` / `rowUnread` / `supplementalUnread`) | Deleted; props may still be voided |
| Dual-read product GET merge | Removed; `legacy_merge: false` |
| Dead wrappers (`useNotificationBadgeCount`, `notification-unread-badge-store`, etc.) | Ban-only |

---

## Phase 4 execution order (approved charter)

```text
4-1 Legacy Inventory & Reachability Audit   ← THIS DOC (DONE when accepted)
        ↓
4-2 Legacy Cleanup (batches; unused only)
        ↓ Runtime: Xiaomi / Samsung / Web regression
        ↓
4-3 Final Product Validation
        App Icon · Bell · Bottom · Trade · Customer · Owner
        FCM/APNS · DeepLink · Logout/Login · Cold/Warm/Reconnect
        ↓
    PRODUCT PASS (only after 4-3)
```

### Delete protocol (every item)

```text
사용 안 함 → 격리 → Runtime 확인 → 삭제
```

No big-bang. No Heal-as-digit. No Authority reopen for cleanup convenience.

---

## Recommended first delete batch (4-2)

**Batch A:** A1–A3 heals (+ contract tests), A5 sunset helper, A6 orphan shadow file.  
→ **EXECUTED PASS** — see `2026-08-01-phase4-2-batch-a-cleanup.md`.  
Defer A4/A7/A8 and all of **B** until separate approve after Batch A Runtime PASS.

---

## Evidence notes (2026-08-01)

- `app/` has **zero** imports of heal-\* / `mergeInboxNotificationRows` / `isLegacyInboxCompatActive` / `scheduleDomainBootstrapShadowFromLegacyHome`.
- `countNotificationUnreadSegmentedServer` **is** called from `app/api/me/notifications` (`unread_count` mode) — legacy COUNT is **LIVE fallback**, not DEAD.
- Split App Icon publishers remain on disk for quarantine tests; product bridge must not call them (contract tests).

## Status

| Step | Status |
|------|--------|
| 4-1 Inventory & Reachability | **COMPLETE** |
| 4-2 Batch A Cleanup | **PASS — DELETED** |
| 4-2 Batch B+ | WAIT explicit approve |
| 4-3 Final Product Validation | NOT STARTED |
| PRODUCT PASS | NOT DECLARED |
