# Telegram List Authority — Writer Audit (lock)

**Baseline:** `06217a10b` + follow-up firm lock  
**Date:** 2026-07-24

## Product contract

Remount hydrated → memory paint only. Zero: silent `refresh(true)`, critical→partial tip rewrite, Host cache wipe, dual paint (canonical overlay), dual-write trade/SO.

| Surface | Paint store | Sole row reducer |
|---------|-------------|------------------|
| GD+group hub | React `data` + session bootstrap cache | `applyHomeListPatch` |
| trade | Domain trade canary session | `domain-list-canary-realtime-patch` |
| store_order | Domain SO canary session | same |

## DELETED / forbidden

| Item | Status |
|------|--------|
| `dual-write-domain-list-from-rooms.ts` | file deleted; ESLint+verify forbid import |
| `tryClaimInitialForegroundBootstrap` | deleted (blank-list root) |
| Host `clearBootstrapCache` on viewer null | deleted |
| Gate TTL remount fetch | deleted |
| Prefetch always-revalidate | deleted |
| Canonical/dual as product paint | forced `source: "legacy"` in Home |
| Silent refresh when list hydrated | skip in `refresh(true)` |
| social_sync → `refresh(true)` | → `hydrateMessengerFriends` only |
| `isDomain*CacheFresh` TTL remount helpers | deleted |
| Tablet split hub pillar for trade/SO | → `MessengerPillarChatsSegment` canary |

## KEEP

| Item | Role |
|------|------|
| `applyHomeListPatch` | hub sole reducer |
| bootstrap cache prime/peek | remount fuel |
| Domain canary + Gate | trade/SO paint (mobile **and** tablet split) |
| `MessengerPillarChatsSegment` | sole trade/SO mount (mobile page + `MessengerSplitListPane`) |
| DomainRoomStateRealtimeHost | bus entry → surface patch once |
| cold `refresh(false)` | empty cache / membership mutation only |
| PTR `runMessengerHomePullRefresh` | explicit full reload |

## Remount blank-list lock (proven)

1. Cache wipe on Host cleanup + session claim → refresh skipped → empty forever. Fixed.  
2. Regression: `hub-list-remount-blank-lock.test.ts` + `verify:telegram-list-authority`.
