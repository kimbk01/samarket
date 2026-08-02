# Slice 2-4 Final Report (CODE PASS)

## Verdict

**SLICE 2-4 B_STORE CODE PASS**  
**SLICE 2-4 DEPLOYED** — not yet (await push)  
**SLICE 2-4 RUNTIME PENDING**  
**Not declared:** C_STORE · NATIVE · PRODUCT · HARD LOCK  
**Slice 2-5:** not started

---

### Contract

```text
B_store = OwnerChatUnreadRoomCount(storeId)
identity = store:{storeId}
Hub/FAB = byStoreId[activeStoreId] room count
row = unread message count
```

Exclusions: Member Bell · Member App Icon · Bottom · Customer Hub · Native/FCM · C_store

### Changes

| Area | Change |
|------|--------|
| Pure projection | `store-communication-b-projection.ts` |
| Hub/FAB unit | `countOwnerStoreOrderMessengerUnreadForHubStore` → **room count** (was message sum) |
| Snapshot / legacy Hub | override FAB digit with active-store room count |
| Read clear | invalidate hub store-order memory on owner `readOrderChat` |
| Tests | projection + exclusion + structural |

### Reuse

`ownerOrderUnreadByStoreId` KEEP (storeId keys, room counts). No new global total.
