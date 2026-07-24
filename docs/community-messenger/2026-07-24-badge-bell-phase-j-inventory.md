# Phase J — Badge/Bell Legacy inventory (step 1 only)

**Status:** J1–J4 PASS · residual `2026-07-24-badge-bell-phase-j-residual-inventory.md` · **Phase J LOCK 미승격**  
**Parent LOCK:** `2026-07-24-badge-notification-domain-authority-lock.md`  
**Date:** 2026-07-24


---

## Locked SSOT (do not quarantine)

`notification_targets` Domain snapshot → Domain loaders → `buildNotificationBadgeProjection` → Apply funnel → Bell / App Icon / Bottom GD+group.

Keepers: `build-notification-badge-projection.ts`, `build-domain-badge-authority-http.ts`, `fetchDomainBadgeAuthorityPayload`, `badge-count/route.ts`, `applyNotificationBadgeProjection`, projection sinks, B3 Bottom RPC filter, `NativeBadgeSync` (independent).

---

## A. Already quarantined / no-op (delete after call-0)

| path | symbol | role | still_called? | Phase J action |
|------|--------|------|---------------|----------------|
| `lib/notifications/tier1-admin-notice-bell-supplement.ts` | `resolve*` / `clear*` | quarantine noop | — | **J1 deleted** + import-ban |
| `lib/notifications/tier1-header-inbox-sync.ts` | `syncTier1HeaderInboxUnreadFromRows` | quarantine noop | — | **J1 deleted** |
| `lib/notifications/tier1-header-inbox-sync.ts` | `computeTier1HeaderInboxDisplayUnread` | legacy unused | — | **J1 deleted** |
| `lib/chats/owner-hub-badge-store.ts` | `applyCommunityMessengerUnreadOptimistic` | R1 noop | — | **J1 deleted** |
| `lib/chat-domain/projections/phase-h-quarantine.ts` | R1–R4 registry | registry | tests/docs | R1+R4 `deleted`; R2–R3 keep |

---

## B. Competing writers (priority)

| path | symbol | role | still_called? | conflicts LOCK? | action |
|------|--------|------|---------------|-----------------|--------|
| `lib/notifications/pipeline/notify-push-dispatcher.ts` | events `badge.total` → FCM badge | OS badge writer | — | — | **J3 → Domain appIconTotal** |
| `lib/notifications/pipeline/notify-badge-service.ts` | `fetchNotificationBadgeCount` | events SUM | — | — | **J3 deleted** |
| `lib/notifications/notification-badge-count-store.ts` | `applyNotificationBadgeCountFromReadResponse` | legacy read patch | — | — | **J3 deleted** |
| `lib/messenger/contracts/domain-badge-authority-product-bridge.ts` | half-publish Nav/AppIcon | half-publish | — | — | **J3 deleted** |
| `lib/notifications/inbox-read-bridge.ts` | legacy `notifications` dual-write | writer | yes (PATCH route) | partial | defer (not App Icon) |

---

## C. Poll paths

| path | symbol | role | still_called? | conflicts LOCK? | action |
|------|--------|------|---------------|-----------------|--------|
| `notification-badge-count-store` 45s → `/badge-count` | Domain poll | poll | yes (Header) | no if `domain_badge` | **keep** (R3) |
| `notification-unread-badge-store` 75s surface poll | parallel unread | poll | — | digit writer 아님 | **J2a deleted** + import-ban |
| `owner-hub-badge-store` 180s hub poll | hub breakdown | poll | yes | partial (Bottom) | keep until hub cutover (R2) |
| `NotificationsBadgeRealtimeBridge` | refresh surface stores | trigger | yes | partial | stop Bell-adjacent surface refresh |
| `StoresHomeHeaderNotificationInboxLazy` | placeholder digit | display | yes | yes while loading | 0 / projection only |

---

## D. Optimistic paths

| path | symbol | role | still_called? | conflicts LOCK? | action |
|------|--------|------|---------------|-----------------|--------|
| `notification-events-read-resync.ts` | mark-all / missedCall optimistic | optimistic | yes | partial (Builder rebuild) | keep iff always followed by Domain resync |
| `owner-hub-badge-store` CM room-count absolute | Bottom optimistic | optimistic | yes | no (Bottom path) | keep; ban Bell/App Icon |
| `cm-participant-surface-sync` unread-zero | Bottom/list | optimistic | yes | partial | keep Bottom boundary |

---

## E. Dead / unused (fast delete candidates)

| path | note |
|------|------|
| `hooks/useMyNotificationUnreadCount.ts` | call-0 |
| `hooks/useNotificationBadgeCount.ts` | Header bypasses |
| `resolveTier1InboxBellLegacyUnreadUrl` | unused |
| `clearRoomMissedCallBadge` / `getRoomMissedCallBadgeCount` | call-0 |
| `samarket-messenger-notification-regulations` dead aliases | delete aliases |

---

## Recommended Phase J slice order (after this inventory approval)

1. **Slice J1:** Strip noop callers (`syncTier1HeaderInboxUnreadFromRows`) + delete noop supplement + import-ban tests  
2. **Slice J2:** Stop surface-unread poll as Bell digit / Stores placeholder  
3. **Slice J3:** Push `badge_count` ← Domain `appIconTotal` (replace events SUM)  
4. **Slice J4:** Prove call-0 on half-publish helpers + unused hooks → delete  
5. Gate + 2-device regression  

Each slice: quarantine → call-0 proof → import-ban → delete → gate. **No bulk delete.**

---

## Explicit non-goals this inventory

- Do not unlock Badge/Bell formulas  
- Do not delete R2 hub 180s poll without hub cutover plan  
- Do not “fix” R-SO-DUAL / R-TRADE-MULTI inside LOCK reopen  
