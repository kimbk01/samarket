# Badge Rollback Audit — Commit Impact Map

**Date:** 2026-08-03  
**Mode:** AUDIT ONLY — no code change · no revert · no deploy  
**HEAD / origin/main / Production:** `f438f37e2`  
**Rebuild baseline:** `1e2a560c1`

---

## SHA gate

| Ref | SHA |
|-----|-----|
| HEAD | `f438f37e2e07b6c7dcb49faed37c72de0bbfbc8f` |
| origin/main | same |
| Production | same |
| Slice 2-6 | `e2cb00ec8` |
| Slice 2-6 test align | `f438f37e2` |

---

## Commit → surfaces touched

| Commit | Summary | Surfaces touched | Classification |
|--------|---------|------------------|----------------|
| `1e2a560c1` | Revert prior A/B/Owner axis preserve | Baseline already polluted (owner_intake→Bell/App Icon; owner rooms→App Icon) — see phase0/2a docs | **UNRELATED** as “stable restore target” — **not a clean baseline** |
| `ca86a20c1` | Slice 2-1 classification/identity tests + foundation | Contract/tests; product formulas not runtime-closed | **KEEP** |
| `d6dbb91d4` | Slice 2-2 separate member Bell authority | Server A · Bell digit path · inbox list filters · mark-all | **KEEP** (authority intent) / Bell **digit↔list** needs **revalidation** |
| `1a814053b` | mark-all all member stores | Bell mark-all | **KEEP** |
| `06bab8001` | Slice 2-3 B_member projection | Server B · Member App Icon formula · bottom chat | **KEEP** |
| `f3dd1bb5d` | room read reconcile | B_member read-clear | **KEEP** |
| `5ee177ca6` | Slice 2-4 B_store | Owner hub chat · Member App Icon exclusion | **KEEP** |
| `c78dd7a1e` / `c673ac444` | owner hub cache invalidate/refresh | B_store hub cache | **KEEP** |
| `aa2d46b09` | Slice 2-5 C_store | Owner ops / Hub C · not Member Bell/App Icon | **KEEP** |
| `e2cb00ec8` | Slice 2-6 Native/FCM echo | FCM `badge_count` resolver · always-send 0 · **comments only** on NativeBadgeSync/syncNativeBadgeCount · **no Bell UI files** | **REVERT_CANDIDATE** (FCM wire only) — **not DEFINITE** for Bell/list or Cap lag |
| `f438f37e2` | wire-test align for 2-6 | tests/identity scan only | **UNRELATED** to product symptoms |

---

## e2cb00ec8 — proof vs Bell surfaces

**Files in commit:** NativeBadgeSync (comments), sync-native-badge-count (comments), notify-push-dispatcher, fcm-data-payload-contract, domain-badge-read-ack, read-order-chat, campaign-send-user, pure authority module + tests/docs.

**Not in commit:**  
`PhilifeHeaderNotificationInbox.tsx`, `MyNotificationsView.tsx`, `MessengerNotificationCenterSheet.tsx`, `resolve-tier1-bell-surface.ts`, `member-notification-a-projection.ts`.

| Surface | Touched by e2cb00ec8? |
|---------|----------------------|
| Bell digit | **NO** |
| Bell popup / 중요 대화 | **NO** |
| `/my/notifications` list | **NO** |
| Server A / B / App Icon formulas | **NO** (reads existing totals for FCM) |
| Native Web→Cap path | **NO logic change** (comment-only) |
| FCM badge_count wire | **YES** |

**Conclusion:** Bell digit / popup / empty list **must not** be attributed to Slice 2-6. Reverting `e2cb00ec8` alone **cannot** fix Bell↔목록 불일치.

### e2cb00ec8 — Native path proof (git show)

| File | Diff type |
|------|-----------|
| `components/push/NativeBadgeSync.tsx` | **Comment block only** |
| `lib/push/native/sync-native-badge-count.ts` | **Comment block only** |
| `lib/push/dispatch/fcm-data-payload-contract.ts` | Logic: `if (badgeCount > 0)` omit → **always** `fields.badgeCount = String(badgeCount)` |
| `lib/notifications/pipeline/notify-push-dispatcher.ts` | Resolver wire to MemberAppIconTotal |
| Bell / list / popup components | **Absent from commit** |

---

## Classification legend

| Tag | Meaning |
|-----|---------|
| KEEP | Axis/intent should stay; optional revalidation of readers |
| REVERT_CANDIDATE | May revert later if that wire alone regresses; not required for Bell FAIL |
| DEFINITE_REVERT | Evidence forces revert for current FAIL — **none in this chain** |
| UNRELATED | Not a restore target / not causal for symptom |
| UNPROVEN | Symptom window unclear; not pinned to SHA |
