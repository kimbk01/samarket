# Slice 2-3 Final Report

## Verdict

**SLICE 2-3 B_MEMBER CODE PASS** (`06bab8001`)  
**SLICE 2-3 READ-CLEAR FIX CODE PASS** (`f3dd1bb5d`)  
**SLICE 2-3 DEPLOYED** · Production SHA match YES  
**SLICE 2-3 B_MEMBER RUNTIME PASS**

**Not declared:** Native App Icon · B_store · C_store · PRODUCT · HARD LOCK  
**Slice 2-4:** not started

---

### Locked program state

| Slice | Status |
|-------|--------|
| 2-1 | CODE PASS |
| 2-2 | MEMBER NOTIFICATION RUNTIME PASS |
| 2-3 | B_MEMBER RUNTIME PASS |

---

### Read-clear fix

| Item | Detail |
|------|--------|
| Failure | Fixed open/open_tail idempotency key reused after tip advanced → stale `{ok, unread:0}` |
| Fix | Tip-scoped keys (`…:open:{tipId}`, `…:open_tail:{tipId}`) |
| Fix commit | `f3dd1bb5d` |
| Production | `https://samarket.vercel.app` → `dpl_rsj2fZrDvao2bBhcWea1HG58NDha` |
| SHA | `f3dd1bb5d0755d584de911ad47f5da1d2c0d97c5` · SHA_MATCH YES |

Evidence: `read-clear-failure-audit.md` · `slice2-3-runtime-report.md` · `.qa-logs/badge-authority-slice2-3-partb-2026-08-03/` (not committed)

---

### Part B runtime (clean fixture)

| Domain | Result |
|--------|--------|
| General Xiaomi / Samsung | PASS |
| Group Xiaomi | PASS |
| Trade Samsung | PASS (CM messenger send) |
| Customer Store Order Xiaomi | PASS |
| Missed call +1 / dedupe / seen 0 | PASS |
| Owner exclusion | maintained |
| Bell A regression | none |

Confirmed product behavior: list row = unread message count · Bottom/Hub = unread room count · tipId cursor advance · room set remove on read · resume holds · chat/missed do not pollute Bell A · owner order chat ∉ Member projection · Native App Icon out of scope.

---

### Formula (unchanged)

```text
MemberAppIconWeb = A + memberUnreadRoomCount + memberUnresolvedMissedCallCount
storeOrderForAppIcon = buyer only
Bell = A_member only
Native/FCM = unchanged (Slice 2-6)
```
