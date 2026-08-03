# Phase 2 Implementation Slices

**Rule:** One slice → independent commit → tests → (optional gate) → CODE PASS for that slice → deploy/runtime proof → next.  
**Never** re-apply full A/B/Owner axis in one commit (`059b7dcbd` failure mode).

---

## Locked product formulas (input to all slices)

```text
MemberAppIcon = A_member + B_member
Owner chat surface = B_store
Owner operation surface = C_store
B_store, C_store ∉ Member Bell / Member App Icon / Native App Icon
```

---

## Slice 2-1 — Classification & Identity Foundation

- Runtime classifier types mirroring Phase 1 contract (still unused by live projection until switch)
- `user:` / `store:` identity types
- Compile/test bans on illegal axis mixes
- **No live projection switch yet**

**Revert unit:** classifier module only.

---

## Slice 2-2 — A Member Notification

- Exclude owner_intake / owner meta from Bell digit + A App Icon component  
- Persistent A source + read / mark-all / delete  
- Bell UI + notifications pages (notices domain start)  
- List digit invariant  

**Revert unit:** A/Bell attention filter + inbox routes. Must not regress RoomUnread.

---

## Slice 2-3 — B_member

- GD/Group/Trade/Customer truth + room sets  
- Bottom / Trade / Customer hubs  
- Missed → B_member  
- Member App Icon B = member rooms + missed  
- **Owner rooms still excluded**

**Revert unit:** member chat projection formula.

---

## Slice 2-4 — B_store

- `store:{id}` owner chat rooms  
- FAB chat / owner hub  
- Multi-store independence  
- Member App Icon hard block tests  

**Revert unit:** store chat projection consumers.

---

## Slice 2-5 — C_store

- Stop writing C as user_id A events (or stop counting them)  
- Action-required truth + accept/reject decrease  
- FAB ops / delivery bottom  
- FCM owner admin route + membership  

**Revert unit:** commerce notify + C projection.

---

## Slice 2-6 — FCM / Native

- badge_count = MemberAppIcon snapshot only  
- Native set-only (already mostly KEEP)  
- Remove any residual local ±1 if found  
- Boot/resume reconcile  

**Revert unit:** push payload + native sync wiring.

---

## Bell UI / notices scope (mostly 2-2)

Implement after A source clean:

- Bell popover, `/notifications`, detail routes  
- `/notices` new domain — **BLOCK** admin-inquiry reuse  
- optimistic unread/delete with rollback  

---

## Dependency graph

```text
2-1 → 2-2 → 2-3 → 2-4 → 2-5 → 2-6
         ↘ notices UI (with 2-2)
```

Do not start 2-3 until Bell no longer includes owner_intake (else App Icon A+B_member still polluted via A).
