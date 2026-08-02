# Slice 2-4 — Cross-isolate Hub cache HIT refresh

**Date:** 2026-08-03  
**Commit intent:** `fix(badge): refresh owner chat count on hub cache hit`

## Problem

Owner read invalidates Hub route cache **only on the handling isolate**.  
Another serverless isolate can still serve a 12s cached payload with stale `storeOrderChatUnread`.

Observed:

- byStore authority: 5→6  
- Hub (stale cache): 6→6  
- `hubBadgeBypass=1`: strict 5/5  

## Fix

On Hub route **cache HIT**:

1. Reuse cached non-chat owner fields  
2. Recompute `storeOrderChatUnread` = active store unread **room** count  
3. Return `{ ...cached, storeOrderChatUnread: fresh }` without mutating the cache entry  

TTL unchanged (12s). No full cache bypass. No SQL message-sum fallback.

## Multi-store

`MULTI_STORE_RUNTIME = NOT_APPLICABLE`  
Current product: one owner account → one store application. Future multi-store = separate Slice.

## Out of scope

C_store · Native/FCM · Bell · Member App Icon · Slice 2-5 · 1-account-1-store policy change
