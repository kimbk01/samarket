# 11 — Architecture Compliance Checklist

> **Version:** 2026-07-05 · **PR review / `git add` gate** — not post-hoc QA.

## Purpose

Any change to CM home list must be checked against contracts **before merge**. Violation = **FAIL**.

## Contract violation matrix

| ID | Contract | Forbidden | Check method | Automation |
|----|----------|-----------|--------------|------------|
| **C-01** | Ownership — list | New list writer outside Reducer path | Watched files: no direct `chats`/`groups` mutate | ✅ `npm run verify:messenger-home-list-owner` |
| **C-02** | Reducer — PATCH | PATCH performs ADD (unknown id) | No `newRooms` push in `mergeCriticalRoomPatchesIntoLists` | ✅ M1a unit test; (optional) verify script |
| **C-03** | Reducer — PATCH | `merge_room_summary` INSERT absent id | Bucket length increase without id | ⚠️ **KV-2** — M1b |
| **C-04** | State transition | `LEFT/NONE + CRITICAL_PATCH → ACTIVE` | Unit: base ∌ id + critical_patch → unchanged count | ✅ M1a TC |
| **C-05** | Cache | Cache semantic list change | `prime*` after manual list assembly outside reducer | Manual PR + rg |
| **C-06** | Cache | Cache → List INSERT | peek → UI without patch | Manual PR |
| **C-07** | RT | RT → summary HTTP → INSERT | `scheduleHomeMissingRoomSummaryMerge` | ⚠️ **KV-3** — M1b+ |
| **C-08** | RT | RT → refresh → critical ADD | RT hook diff review | Manual PR |
| **C-09** | Membership | Client changes membership | New leave API; client DB write in home | rg + PR |
| **C-10** | Event | New leave API route | `app/api/**/leave` new files | diff |
| **C-11** | Reducer | `setData` bypasses patch | Watched file rules | ✅ `verify:messenger-home-list-owner` |
| **C-12** | Dead code | Delete structure-violation as "dead" | tombstone etc. with live imports | Manual — 5-condition gate |
| **C-13** | Scope | Milestone file whitelist exceeded | `git diff --name-only` | ✅ required |
| **C-14** | Native/Call | Call / Native / Push touch | `android/`, native call paths | Manual |

## M1a PR — allowed diff (whitelist)

```text
lib/community-messenger/home-list-patch.ts
tests/unit/home-list-patch.test.ts
```

Optional (explicit approval only):

```text
scripts/verify-cm-critical-patch-no-insert.mjs
package.json  (single verify script line)
```

**Any other path → C-13 FAIL.**

## M1a PR — forbidden diff

| Pattern | Reason |
|---------|--------|
| `app/api/**` | C-10 |
| `lib/community-messenger/service.ts` | scope |
| `bootstrap-cache.ts` | C-05 |
| `use-community-messenger-home-bootstrap.ts` | bootstrap |
| `use-community-messenger-home-realtime-bootstrap-list.ts` | C-07, C-08 |
| `private-group-left-room-tombstone.ts` | patch layer |
| `leave-private-group*.ts` | leave client |
| `merge-bootstrap-room-summary-into-lists.ts` | C-03 — M1b |
| `CommunityMessengerHome.tsx` | C-01 |
| `supabase/migrations/**` | DB |
| Native / Call / Push paths | C-14 |
| Dead file deletion | C-12 |

## Automated commands (M1a minimum)

```bash
git diff --name-only
npm run verify:messenger-home-list-owner
vitest run tests/unit/home-list-patch.test.ts
vitest run lib/community-messenger/home/__tests__/patch-bootstrap-room-list-truth-version.test.ts
npx tsc --noEmit
```

## Manual reviewer checklist (~60s)

- [ ] All list changes go through `applyHomeListPatch`?
- [ ] PATCH kinds do not add unknown `roomId`?
- [ ] No `primeBootstrapCache` new paths in M1a diff?
- [ ] Tombstone / optimistic remove not presented as root fix?
- [ ] No `service.ts` split or unrelated refactor?
- [ ] No dead delete without 5-condition proof?

## Known violations (design PASS, code As-Is)

| ID | Violation | Contract | Resolved |
|----|-----------|----------|----------|
| KV-1 | `critical_patch` `newRooms` | C-02, C-04 | **M1a** |
| KV-2 | `merge_room_summary` INSERT | C-03 | M1b |
| KV-3 | RT summary merge chain | C-07 | M1b+ |
| KV-4 | cache direct remove | C-05 | M2 |
| KV-5 | tombstone layer | structure | post-SSOT |

**M1a PR:** must fix KV-1 only; touching KV-2–5 without approval = **FAIL**.

## Dead code deletion (unchanged gate)

All five required before delete:

1. static import = 0  
2. dynamic import = 0  
3. production trace = 0  
4. test dependency = 0  
5. documentation dependency = 0  

**Structure violation ≠ dead code.**

## Structure violation vs dead code

| Item | Type | Action |
|------|------|--------|
| `private-group-left-room-tombstone` | Structure violation (live) | Remove in SSOT track — **not** M1a dead delete |
| `syncMessengerHomeAfterPrivateGroupLeave` | Dead candidate | 5-condition; test blocks today |
