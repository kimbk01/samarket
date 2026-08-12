# DIBAY Cache / Cookie / Storage SSOT HARD LOCK

**HARD LOCK (2026-08-13).** Incident: Community list showed stale `author_name=JTV KOREAN MART` from `philife_neighborhood_feed_v3_persistent` while detail/server returned `참이슬`.

## Principle

```text
SERVER DATA = AUTHORITY
CLIENT CACHE = PERFORMANCE OPTIMIZATION
```

Client persistent snapshots must never outrank server identity / commerce / notification authority.

## First break (this incident)

| Layer | Result |
|---|---|
| Server `/api/philife/neighborhood-feed` | `author_name=참이슬` |
| Detail | server fetch → 참이슬 |
| List first paint | localStorage v3 snapshot → JTV |
| List after network | `patchNeighborhoodFeedRows` **reused prev row** because equality ignored `author_name` → JTV persisted + re-written |
| App data delete | PASS (cache wiped) — **not an acceptable product fix** |

## Community feed SSOT (KEEP)

| Concern | Decision |
|---|---|
| Storage key | `philife_neighborhood_feed_v4_persistent` |
| Schema | `{ schemaVersion: 4, entries: { [queryId]: snapshot } }` |
| Query id | `locationKey + category + neighborOnly + viewerSig + sort` |
| Fresh TTL | 30m (paint hint) |
| Stale max | 7d prune |
| Legacy v3 | ignored + removed on read/write/wipe |
| Row merge | `author_name` / `author_id` / engagement counts **must** differ → replace row |
| Nickname PATCH | invalidate feed persistent + short TTL; CommunityFeed listens `PROFILE_UPDATED` |
| Logout / account switch | `clearAllPhilifeFeedPersistentCaches` via session wipe |

Authority modules:

- `lib/community/community-feed-cache-ssot.ts`
- `lib/community/philife-feed-session-cache.ts`
- `lib/community/neighborhood-feed-row-merge.ts`

## Inventory (Phase A summary — product code)

### A. Auth / security

| Key / mechanism | Type | Notes |
|---|---|---|
| Supabase auth cookies / SSR | cookie HttpOnly (Supabase) | wipe via signOut |
| `kasama_dev_uid_pub` | cookie (dev/E2E) | not prod identity |
| `dibay:auth_bound_user_id` | localStorage | account isolation |
| `DIBAY_APP_MARKER` | cookie | Capacitor platform marker |
| Owner active store cookie | cookie | owner console |

### B. Server data cache (risk class)

| Key | Type | Risk / action |
|---|---|---|
| `philife_neighborhood_feed_v4_persistent` | localStorage | **FIXED** — schema + merge |
| `philife_neighborhood_feed_v3_persistent` | legacy | **CUTOVER ignore** |
| `philife_neighborhood_topic_options_v1` | localStorage | topic chips; cleared on logout |
| Trade feed client cache | memory | invalidate on auth exit |
| Store home feed client cache | memory | invalidate on hub refresh |
| CM room snapshots | IndexedDB | cleared on auth exit |
| Messenger bootstrap cache | memory/session | cleared on wipe |

### C. UI preference

| Key | Type |
|---|---|
| `community_hub_state_v1` | sessionStorage |
| App language cookie / storage | cookie + localStorage |
| Debug flags `samarket:debug:*` | localStorage |

### D. Offline / draft

| Key | Type |
|---|---|
| Trade write drafts | localStorage + sessionStorage |
| Meet-spot staging | session + local |
| Stickers recent | localStorage |
| User settings `_*_userId` | localStorage |

### Next cache

| Path | Notes |
|---|---|
| `unstable_cache` bottom nav / delivery nav / trade chips | tagged; admin routes `revalidateTag` |
| Community topic admin | `revalidatePath("/philife")` |
| Neighborhood-feed route | dynamic / no durable Next Data Cache for author labels |

### Service Worker

| Status | Notes |
|---|---|
| Present for **Web Push** (`/sw.js`) | notification delivery — not HTML/API feed cache authority |
| CapacitorCookies | not used as feed cache; auth cookie durability separate (`android-cookie-durability`) |

## DO NOT (without reopen)

- Require app data delete / reinstall as the Identity or feed fix
- `localStorage.clear()` as product fix
- Reintroduce equality that ignores `author_name` on feed merge
- Read v3 feed key as authority after cutover
- Store Member Identity strings as permanent offline truth without SWR replace
- Mix auth cookies into UI snapshot keys

## Gate

```bash
npx vitest run lib/community/__tests__/community-feed-cache-ssot.test.ts
```
