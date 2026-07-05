# 10 — SSOT Design (one page)

> **Version:** 2026-07-05 · Design PASS; implementation via milestones M1a → M1b → M2.

## SSOT summary

```text
┌─────────────────────────────────────────────────────────────┐
│ Membership SSOT:  Server DB (participants.left_at)          │
│ List SSOT:        Server payload → Reducer → React `data`   │
│ Cache SSOT:       Reducer output mirror (read-through)      │
│ RT SSOT:          Event → PATCH kinds only                  │
│ UI:               derive only — no list mutate              │
└─────────────────────────────────────────────────────────────┘
```

## State invariant

```text
membership(LEFT) ⇒ list(roomId) = ABSENT
```

## Legal pipeline

```text
Event → [Authority gate] → Reducer(Pre) → mutate → Post → prime(cache) → UI
```

## File roles (target)

| File | Target role | As-Is violation |
|------|-------------|-----------------|
| `home-list-patch.ts` | Reducer ONLY | `primeBootstrapCache`; tombstone filter |
| `use-community-messenger-home-bootstrap.ts` | Load ONLY | direct `setData` merge paths |
| `use-community-messenger-home-realtime-bootstrap-list.ts` | Event ONLY | `refresh(true)`, summary HTTP, cache prime |
| `bootstrap-cache.ts` | Storage ONLY | multiple writers |
| `merge-bootstrap-room-summary-into-lists.ts` | reducer helper | INSERT if absent (M1b) |

## Known violations (KV)

| ID | Violation | Milestone |
|----|-----------|-----------|
| KV-1 | `critical_patch` `newRooms` INSERT | **M1a** |
| KV-2 | `merge_room_summary` absent INSERT | M1b |
| KV-3 | RT → home-summary → merge | M1b+ |
| KV-4 | cache direct remove | M2 |
| KV-5 | tombstone patch layer | post-SSOT removal |

## Milestone map

| Milestone | Scope | Out of scope |
|-----------|-------|--------------|
| **M1a** | `mergeCriticalRoomPatchesIntoLists` — unknown id DROP | tombstone, RT, cache, API, leave client |
| **M1b** | `merge_room_summary` no-op if absent | RT summary chain refactor |
| **M2** | cache prime single path; leave API unify | dead delete; service.ts split |

## M1a frozen statement

```text
M1a ≠ structural refactor
M1a = critical_patch must not ADD unknown roomId (block LEFT/NONE + CRITICAL_PATCH → ACTIVE)
Files: home-list-patch.ts + home-list-patch.test.ts only (2 files)
```

## References

- Compliance: [11-architecture-compliance-checklist.md](./11-architecture-compliance-checklist.md)
- M1a PASS: [12-m1a-acceptance-criteria.md](./12-m1a-acceptance-criteria.md)
- DB filter: `supabase/migrations/20260705120000_cm_bootstrap_hide_left_blocked_participants.sql`
- List owner verify: `npm run verify:messenger-home-list-owner`
