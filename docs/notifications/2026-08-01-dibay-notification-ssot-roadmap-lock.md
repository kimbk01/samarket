# DIBAY Notification SSOT Roadmap — FINAL LOCK

**Declared:** 2026-08-01  
**Change:** Forbidden without explicit team-lead override.

| Phase | Status | Mutate? |
|-------|--------|---------|
| 1 RoomUnread Authority | CLOSED | LOCK |
| 2 Badge SSOT | CLOSED | HARD LOCK |
| 3 Bell SSOT | CLOSED | HARD LOCK |
| 4 Legacy Cleanup | IN PROGRESS | 4-1 COMPLETE · 4-2 Batch A CODE+RUNTIME LOCK (`838d7a130`) · Commit B / Batch B+ WAIT · 4-3 / PRODUCT PASS not declared |

## Order (immutable)

```text
RoomUnread Authority
        ↓
Badge Authority
        ↓
Bell Authority
        ↓
Legacy Cleanup
```

## Phase 3 completion (all required)

1. **3-1 Explain Matrix** — digit explainable by kinds + event IDs  
2. **3-2 Writer Authority** — insert SSOT = 1; no projection bypass; no legacy writer  
3. **3-3 Lifecycle** — create / read / status / delete / missed / trade / order / role / deep link Runtime  
4. **3-4 Runtime Identity** — Bell Digit ≡ Inbox Unread ≡ Notification Event ≡ Destination  

## Phase 3 forbidden

Badge · RoomUnread · Projection (Badge) · Legacy delete · Heal · number-forcing · UI temp patches · Product PASS · LOCK (until closed)

## Phase 3 anti-pattern

Do **not** ship Bell-digit-only / Inbox-only / DeepLink-only / Read-only fragments as Phase complete.
