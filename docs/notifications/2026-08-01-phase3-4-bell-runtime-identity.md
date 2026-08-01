# Phase 3-4 — Bell Runtime Identity

**Status:** PASS (2026-08-01)  
**Authority:** `bell_runtime_identity_v1`  
**Code:** `lib/notifications/bell-runtime-identity.ts`  
**Runtime:** `.qa-logs/badge-ssot-phase3/bell-runtime-identity.json`

## Locked identity (no structure change)

```text
Bell Digit
  == Explain Total
  == Notification Event Count (eligible unread)
  == Inbox Unread (same Authority IDs)
  == Destination Reachable Count
```

Read once → Event close → Explain −1 → Bell −1 → Inbox −1 (same generation).

## Runtime sample (asas55)

Baseline: **2 = 2 = 2 = 2 = 2**  
Create/read × kinds (General…Admin): identity holds; read restores baseline.  
Poll / Reconnect / Realtime / Cold / Warm rebuild: stable identity.  
Logout / Login: wipe → rebuild identity PASS.

**28/28 cases PASS.**

## Forbidden (held)

Bell structure change · Badge · RoomUnread · create-policy · Heal · Legacy · UI digit hacks · Product PASS before close
