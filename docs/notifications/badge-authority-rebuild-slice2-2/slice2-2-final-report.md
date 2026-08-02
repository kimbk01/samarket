# Slice 2-2 Final Report

## Verdict

**SLICE 2-2 MEMBER NOTIFICATION CODE PASS**  
**RUNTIME PASS:** not declared  
**PRODUCT / HARD LOCK:** not declared  
**Slice 2-3:** not started

## A–R

### A. HEAD / Slice 2-1 / origin

| Item | Value |
|------|-------|
| Start baseline | `1e2a560c1` |
| Slice 2-1 commit | `ca86a20c19f0451f608073b2287a79dcc93b5d8c` |
| Working HEAD at CODE | `ca86a20c1` + **uncommitted** Slice 2-2 |
| origin/main | `1e2a560c1` (branch ahead 1 = Slice 2-1 only) |

### B. Dirty tree

Unrelated untracked: `.qa-logs/`, Phase0/1/2a docs, misc scripts — **excluded** from Slice 2-2.

### C. A source / projection

`lib/notifications/badge-authority-rebuild/member-notification-a-projection.ts`  
`deriveMemberUnreadNotificationCount` / list filter helpers.

### D. NotificationAttentionTotal

Kept for App Icon notification axis. Bell ROUTE uses A only — not “subtract from total”.

### E. owner_intake Bell 제거

Classifier + A projection + mark-all + list filters exclude owner commerce / intake. Writer **kept**.

### F. Bell API/UI

HTTP total / bellTotal = A; Header + My inbox A-only list; mark-all A-only.

### G–H. Read / delete

Existing mark-one / mark-all / dismiss APIs; mark-all A-gated; dismiss via `display_payload.deleted_at`.

### I. 공지·광고

`admin_notice` ∈ A; `admin_marketing_banner` ∉ A / Bell. Dedicated `/notices` domain deferred.

### J. Routes

`/my/notifications` (existing). No new `/notices` migration.

### K. Migration / RLS

None this slice.

### L. Modified files (Slice 2-2)

- `member-notification-a-projection.ts` (+ tests)
- `build-domain-badge-authority-http.ts`
- `build-notification-badge-projection.ts`
- `apply-badge-count-authority-response.ts`
- `resolve-tier1-bell-surface.ts` (+ test)
- `inbox-read-bridge.ts`
- `PhilifeHeaderNotificationInbox.tsx`
- `MyNotificationsView.tsx`
- isolation verify allowlist (+ slice2-1 isolation test allowlist)
- `docs/notifications/badge-authority-rebuild-slice2-2/*`

### M. Tests / tsc / lint / build

80 PASS · isolation PASS · tsc PASS · eslint PASS · build PASS

### N. App Icon / FCM / Native / B unchanged

No diff under android/ios/FCM dispatcher/native badge sync/domain-app-icon formula rewrite.

### O. commit / push / deploy

Slice 2-2 **uncommitted**. **No push. No deploy.**

### P. Device 실측

Not run.

### Q. Residual risk

- List A filter is client-side after fetch (server may still return broader rows)
- Phase B App Icon still polluted by owner_intake / owner rooms
- Digit = server A count (pagination ≠ badge)

### R. 판정

**CODE PASS** — Bell = A_member wiring complete. Stop before Slice 2-3.
