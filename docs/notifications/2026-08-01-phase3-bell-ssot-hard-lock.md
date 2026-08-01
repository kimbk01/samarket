# PHASE 3 — BELL SSOT HARD LOCK

**Declared:** 2026-08-01  
**Parent close:** `docs/notifications/2026-08-01-phase3-bell-ssot-closed.md`

## LOCK

Bell Authority is **closed**. Do not reopen Explain / Writer / Lifecycle / Identity for digit hacks.

### Allowed after LOCK

| Allowed | Example |
|---------|---------|
| Bug fix | Crash / broken wire that breaks proven identity |
| Badge linkage check | Prove Bell read does not corrupt Badge (neighbor LOCK) |
| Runtime regression fix | Restore same Authority commit path |

### Forbidden

| Forbidden |
|-----------|
| Feature / structure change to Bell |
| Heal as product digit fix |
| Legacy delete (Phase 4 only) |
| Bell digit → App Icon coupling |
| RoomUnread reopen |

Order remains:

```text
Phase 1 RoomUnread → Phase 2 Badge → Phase 3 Bell → Phase 4 Legacy
```
