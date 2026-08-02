# Slice 2-4 Start Baseline

**Date:** 2026-08-03  
**Status:** implementation in progress → CODE PASS pending gates

| Item | Value |
|------|-------|
| HEAD / origin/main | `c89caaddb` |
| Production product SHA (GitHub Production deploy) | `f3dd1bb5d` (read-clear; docs `c89caaddb` did not redeploy) |
| Alias | `https://samarket.vercel.app` |
| Dirty | existing untracked `.qa-logs/**`, rules, android probe — **not touched** |

## ownerOrderUnreadByStoreId audit

| Check | Result |
|-------|--------|
| key = storeId | PASS (`orderStoreById` → store id) |
| value = unread **room** count | PASS (`+1` per owner room) |
| not owner userId sum as identity | PASS (partition by owner_user_id match, bags keyed by store) |
| customer partitioned out | PASS |
| room dedupe via Set | PASS (`owner` Set) |

## Pre-fix Hub unit bug (fixed in this slice)

`countOwnerStoreOrderMessengerUnreadForHubStore` previously **summed message unread_count**.  
Slice 2-4 requires Hub/FAB = **room count** → rewritten to count rooms with unread > 0.
