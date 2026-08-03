# Contract Test Plan (Gate 2) — SPEC ONLY

**No product code changes in Gate 2.**  
Tests to be added in Gate 3 alongside implementation.

---

## Cases

| ID | Assertion | Current failing path (Gate 1) | Future canonical path |
|----|-----------|-------------------------------|------------------------|
| T01 | Bell digit set = unread Bell list set (event ids) | digit=`attentionKeys.length`; list=event rows | A = count unread events; list same filter |
| T02 | mark-all target set = Bell unread set | dual legacy+events; units differ | canonical events only |
| T03 | deleted event excluded from A | dismiss path uneven | `deleted_at` excludes |
| T04 | push-only promotion excluded from A | marketing may leak if misclassified | delivery_only · no event |
| T05 | Trade message excluded from A | chat types filtered but events exist | B room only |
| T06 | Trade status excluded from B | generally OK | A event only |
| T07 | Order message excluded from A | same as T05 | B_order only |
| T08 | Order status excluded from B | generally OK | A only |
| T09 | Owner event excluded from member A/B | owner_intake on user_id + filter | store C only · no user_id A write |
| T10 | same user, two stores isolated | Hub active store; verify | C(S1)↛C(S2)/A |
| T11 | room 0→1 increments parent once | B projection | same commit |
| T12 | room 1→N does not increment parent | row only | same |
| T13 | room N→0 decrements parent once | multi-path mark_read gaps | single ACK commit |
| T14 | App Icon = explicit A+B components | keys + rooms + orphan missed mix | payload components sum |
| T15 | Native adapter no arithmetic | absolute set OK; Cap resume stale | versioned apply only |
| T16 | resume cannot publish older authorityVersion | `applyFromCapBadgeCache` | reject stale |
| T17 | missed call cannot increment A and B both | orphan in B count + A exclude uneven | XOR policy |

---

## Harness notes (later)

- Pure unit tests for classification + A count from fixtures first.  
- No device RUNTIME PASS from this document.
