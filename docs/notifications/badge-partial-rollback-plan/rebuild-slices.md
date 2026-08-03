# Rebuild Slices (R1–R10)

**Mode:** PLAN ONLY · starts only after P0 approval + baseline gates  
**Contract:** unchanged (A/B/C, App Icon = A+B_member, clear rules)

---

## Order (fixed)

| Phase | Name | Exit criteria |
|-------|------|---------------|
| **R0** | Quarantine / freeze | No new dual patches; PASS docs REFERENCE_ONLY; DELETE list owned |
| **P0** | Git revert 2-6 pair | `f438`+`e2cb` reverted; tsc on touched paths; **stop for confirm** |
| **R1** | A event ID SSOT | `AUnreadEventIds(userId)` server function + payload field; digit = \|set\| |
| **R2** | Bell digit/Popup/List/Read/Delete unify | Same ID set on all A surfaces; popup A only (중요대화 removed or moved to chat chrome); mark-all/delete target = same set; **no legacy dual** |
| **R3** | App Icon membership proof | Response includes A IDs + room IDs + missed IDs; total = sum of sizes; B_store/C/owner_intake/ads excluded at set stage |
| **R4** | B_member surface reconnect | Bottom/Trade/Customer/row use same room sets as App Icon B |
| **R5** | B_store / C_store regression | FAB chat rooms; Ops Action Complete; member surfaces unchanged; hub cache REVIEW |
| **R6** | Native fresh snapshot | auth → fresh snapshot → version check → absolute set → lastApplied; resume: success apply / fail **no stale Cap authority** |
| **R7** | Bell UI/UX | Chrome only after A SSOT stable |
| **R8** | Full product Runtime | Same-account matrix all surfaces |
| **R9** | PRODUCT PASS | Only after R8 |
| **R10** | HARD LOCK | Only after R9 |

---

## R1 detail — `AUnreadEventIds`

```text
AUnreadEventIds(userId) ⊆ notification_events.id
  where unread ∧ A-eligible ∧ ¬dismissed
  ¬chat ¬missed ¬owner_intake ¬marketing ¬owner ops
```

| Consumer | Must use |
|----------|----------|
| Bell digit | `count(AUnreadEventIds)` or equivalent \|set\| |
| Popup A | render those IDs (or empty) |
| Full list unread | same IDs (read history may be separate **read** query, not digit) |
| mark-all / delete | operate on same ID set |
| App Icon A | \|AUnreadEventIds\| |

**Forbidden:** attention-key digit · parallel list-only filter as authority · legacy mark-all.

---

## R3 detail — membership

```text
MemberAppIconTotal = |AUnreadEventIds|
                   + |MemberUnreadRoomIds|
                   + |UnresolvedMissedCallIds|
```

Payload must expose the three sets (or explain arrays), not total alone.

---

## R6 detail — Native order

```text
authenticated session
  → fresh MemberAppIcon snapshot (with version/timestamp)
  → validate
  → Native absolute set
  → record lastApplied
```

Resume failure: **do not** `applyFromCapBadgeCache` as authority reconfirm.

---

## Independence / revertability

Each R1–R6 lands as **new commits** on top of P0.  
If Rk fails: revert **only Rk commits**, not P0 or contracts.  
Never auto-inherit old Slice RUNTIME PASS.
