# Telegram List Authority — Writer Audit Freeze

**Baseline commit:** `770bafadaa9afe205985937519a052f114f63cde`  
**Date:** 2026-07-24  
**Scope:** chat list paint + row mutation only (3 surfaces)

## Surface paint SSOT (baseline)

| Surface | Paint SSOT | Conflict writers |
|---------|------------|------------------|
| general_direct + group | `applyHomeListPatch` + bootstrap React state | remount `refresh(true)` silent critical→partial; dual-write trade/SO |
| trade | Domain Trade canary sessionStorage + Gate | TTL remount fetch; hub prefetch always revalidate; CM dual-write |
| store_order | Domain SO canary sessionStorage + Gate | same |

## Writer inventory (KEEP / MERGE / DELETE)

| Writer | Path | Surface | Remount? | Verdict |
|--------|------|---------|----------|---------|
| applyHomeListPatch | `lib/community-messenger/home-list-patch.ts` | GD+group | seed only | **KEEP** sole hub reducer |
| layout/warm bootstrap_full_seed | `use-community-messenger-home-bootstrap.ts` | GD+group | yes | **KEEP** memory paint |
| remount silent refresh(true) | same ~1567 | GD+group | yes | **DELETE** |
| silent critical_patch + partial_upsert | same ~863–881 | GD+group | via silent | **DELETE on remount**; cold/pull only MERGE |
| home_return_cold refresh control | `home-return-timing.ts` | GD+group | yes | **DELETE heal use**; remount hydrated = no-op |
| refresh(false) cold empty | bootstrap | GD+group | cold only | **KEEP** cold/pull |
| Home RT row patches | `use-community-messenger-home-realtime-bootstrap-list.ts` | GD+group | no | **KEEP** via applyHomeListPatch |
| bootstrap-cache-bus-writer | `bootstrap-cache-bus-writer.ts` | cache | mirror | **KEEP** warm fuel (not remount net) |
| dual-write-domain-list-from-rooms | `lib/chat-domain/list/dual-write-domain-list-from-rooms.ts` | trade/SO proj | every hub patch | **DELETE** paint authority |
| domain-list-writers readers | badge/bottom | trade/SO | — | **MERGE** → canary peek |
| DomainTradeListCanaryGate mount fetch | Gate useEffect | trade | yes | **DELETE** if hydrated; cold/empty/pull only |
| Domain SO Gate mount fetch | Gate useEffect | SO | yes | **DELETE** if hydrated |
| isDomain*CacheFresh TTL skip+fetch | canary-cache | trade/SO | yes | **DELETE** remount network rewrite |
| hub prefetch always revalidate | `domain-list-canary-hub-prefetch.ts` | trade/SO | hub enter | **DELETE** always; miss-only seed |
| domain-list-canary-realtime-patch | realtime-patch.ts | trade/SO | no | **KEEP** sole row writer |
| DomainRoomStateRealtimeHost bus | DomainRoomStateRealtimeHost.tsx | trade/SO+spine | no | **KEEP** entry; mutate via canary patch only |
| mark_read applyOptimisticRoomRead | use-messenger-room-open-mark-read-effect.ts | all | enter | **KEEP**; unread→list must not be blocked by viewport early return |
| participant hub sync | use-cm-participants-hub-sync.ts | Bottom+cache | no | **KEEP** unread fact; Domain unread-only patch |

## Event → allowed fields (target)

| mutationType | Fields |
|--------------|--------|
| MARK_READ | unreadCount |
| PARTICIPANT_UNREAD | unreadCount |
| MESSAGE_RECEIVED | preview, lastMessageAt, unreadCount, position if newer LMA |
| MESSAGE_SENT | preview, lastMessageAt, position if newer LMA |
| METADATA_HYDRATE | avatar/title/product/store meta only |
| SERVER_FETCH_MERGE | fields only if server LMA newer |

## Remount contract

Hydrated store → paint only. Zero: fetch, silent bootstrap, critical_patch, partial_upsert, TTL fetch, full replace, multi-row tip rewrite.

## Implementation notes (2026-07-24)

- `applyLocalUnreadToLists` had dead `hit` check before `map` — MARK_READ never mutated hub rows; fixed as part of list authority.
- Prefetch / Domain Gate: cache **present** (not TTL-fresh) ⇒ no network.
- Hub remount: any `memoryFresh` ⇒ no silent resume `refresh(true)`.
