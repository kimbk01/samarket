# Slice 4 — Profile / Trust STATUS

```text
SLICE 4 PROFILE/TRUST CODE LOCKED
SLICE 4 DEPLOYED
SLICE 4 RUNTIME PASS (Member trust page + home manner parity)
SLICE 4 LOCK
```

## Production

| Item | Value |
|------|-------|
| Code SHA | `2b9346c53` (on `2471fb0b4` HOLD) |
| Deploy | `dpl_7J33CdbZMoVGqyfUG5p9KkGiEtVi` |
| Alias | `https://samarket.vercel.app` |
| Evidence | `.qa-logs/customer-platform-slice4-trust-runtime-2026-08-06T07-16-49-697Z/` |

## Runtime (read-only)

| Check | Result |
|-------|--------|
| Member `/api/me/profile?fresh=1` trust_score | **68.22** |
| Admin `/api/admin/users/:id` trust_score | **68.22** |
| DB `profiles.trust_score` | **68.22** |
| `/mypage/trust` HTTP | 200 |
| `/mypage` HTTP | 200 |
| Accounts | Member `asas55` · Admin `aaaa` |

## Code

- `lib/trust/member-trust-surface.ts` — home ↔ trust page SSOT surface
- `/mypage/trust` — `?fresh=1`, no session temperature clobber after API
- Battery high tiers → `#0B421A` (`--dibay-green`)
- Script: `scripts/qa/slice4-profile-trust-runtime.mjs`

## Out of scope (unchanged)

Activity · Account IA · Admin Projection · Auth / Messenger / Call / Badge

## Password

Env / manual / service-role magiclink bootstrap only — never in docs, commits, QA JSON values beyond scores.
