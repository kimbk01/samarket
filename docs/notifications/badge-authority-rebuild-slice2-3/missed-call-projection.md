# Missed Call Projection (Slice 2-3)

```text
memberUnresolvedMissedCallCount = distinct unresolved call_id (session)
```

Include: incoming unresolved missed · policy-matched cancel/busy when product marks missed  
Exclude: connected · other-device accept · duplicate terminal · caller self · already seen  

Dedupe: `missed:{sessionId}:{userId}` / `orphanCallIds`  
Room-bound missed: list `byRoom` / room unread — do **not** also add to App Icon B_missed when room already in unread set (orphan Fact drives B_missed today; primary writer always has roomId).

Seen → `read_at` / unread false → B_missed -1 · Bell unchanged.

Module: `load-orphan-missed-call-facts.ts` + `resolveMissedCallIdForBMember`
