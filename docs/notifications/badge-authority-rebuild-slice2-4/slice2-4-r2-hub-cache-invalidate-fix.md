# Slice 2-4 R2 — Owner Hub route-cache invalidate after room read

**Date:** 2026-08-03  
**Status:** CODE FIX (runtime re-verify required)  
**Commit intent:** `fix(badge): invalidate owner hub badge after room read`

## Root cause

`OrderDomain.readOrderChat` owner success previously called only:

`invalidateHubStoreOrderUnreadMemory(userId, storeId)`

It did **not** call `invalidateOwnerHubBadgeCache(userId)`.

`GET /api/me/store-owner-hub-badge` keeps a **12s** in-process route cache (`owner-hub-badge-cache.ts`) that includes `storeOrderChatUnread` (Hub/FAB digit).

Observed R2 pattern:

1. Clean owner read → byStore authority fresh (e.g. 5)
2. Hub route cache still stale-high (e.g. 6)
3. New unread room → byStore 5→6, Hub 6→6 (strict `hubPlus1` fails)

`hubBadgeBypass=1` reproduced **5/5** strict pass → room-count formula OK; invalidate gap only.

## Fix

On owner read success (after cursor clear confirmed):

`invalidateOwnerHubBadgeCache(userId)` once.

This clears Hub route cache and store-order unread memory (per cache helper contract). Customer read does not call it.

## Out of scope (this commit)

- `owner-hub-badge-snapshot.ts` SQL→room-memory hardening (separate if needed)
- C_store / Native / FCM / Slice 2-5
- Cache TTL changes, Hub ±1 patches, setTimeout refresh
