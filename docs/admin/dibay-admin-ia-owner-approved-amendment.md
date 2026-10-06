# DIBAY Admin IA — Owner-Approved Amendment (Design SSOT)

**Status:** OWNER APPROVED · TRACK B U1–U4 menu implementation authorized separately · **NOT** Commit/Deploy/Production alone  

**Date:** Owner authorization (decision checkpoint)  
**Companion CUT J:** `docs/dibay-admin-real-operation-cut-j-ia-separation-hard-lock.md` · `lib/admin/admin-real-operation-cut-j-ia-separation-hard-lock.ts`  
**Does not declare:** function-preservation PASS · HARD LOCK complete · L2–L4 PASS · TRACK A PASS

---

## Owner decisions

| ID | Decision |
|---|---|
| M1 Labels (입점 심사 / 매장 운영) | **APPROVED** |
| M2 Ads ↔ Promotion deep-link cards | **APPROVED** |
| M3 IA doc correction | **APPROVED** |
| M5 Dashboard → members/users shortcut | **APPROVED** |
| J-AMD-1 `members` after `dashboard` | **APPROVED** (CUT J clause add) |
| M4 system-internal reorder | **HELD** |
| J-AMD-2 full reorder | **REJECTED** |
| B-X1 single ads+promotion parent | **REJECTED** |
| CUT J full unlock | **FORBIDDEN** |
| Product code menu impl · DB · Commit · Push · Deploy | **NOT APPROVED** |
| TRACK A | **BLOCKED** |

---

## M1 — Store onboarding vs store ops labels (design)

| Menu key | Path (preserve) | Approved display intent (ko / en) |
|---|---|---|
| `stores-commerce` | `/admin/stores` | 입점 심사 / Store onboarding review |
| `business-shops` | `/admin/business` | 매장 운영 / Store operations |

- Do **not** merge menus, APIs, or writers.
- i18n catalog / sidebar wiring = **future implementation** (not this amendment).

---

## M2 — Ads / Promotion deep-link structure (design)

| From | To | Kind |
|---|---|---|
| `/admin/advertising` (ads hub) | `/admin/platform-promotion` | UI deep-link card only |
| `/admin/platform-promotion` (promotion hub) | `/admin/advertising` | UI deep-link card only |

- Keep top-level `ads` and `promotion` **siblings** (B-X1 rejected).
- No registry/writer merge (CUT C).
- Hub UI wiring = future implementation.

---

## M3 — IA document correction

- `docs/admin/platform-admin-ia-lock.md` §D updated to describe **live CUT J** workspaces and this Owner amendment (not the obsolete HOME/CP/GROWTH-only tree as live authority).
- Phase-0 non-change of API/DB/writer remains.

---

## M5 — Dashboard member shortcut (design)

- Approved: dashboard (`/admin`) exposes a clear shortcut to `/admin/users` (and optionally members workspace root after J-AMD-1 menu impl).
- No new workspace beyond J-AMD-1.
- Quick-link adapter code = future implementation.
- Compatible with J-AMD-1 (not mutually exclusive).

---

## M4 — HELD

- Do **not** apply system-internal `system-members` reorder in this amendment.
- After J-AMD-1 menu implementation, M4 is largely redundant.

---

## J-AMD-1 — CUT J limited amendment (approved)

See CUT J doc § J-AMD-1 and companion constants `CUT_J_J_AMD_1_*`.

Summary:

1. Insert workspace `members` **immediately after** `dashboard`.
2. Preserve relative order of all other workspaces.
3. Preserve member URL quartet (below); no API/DB/permission-gate change in this SSOT step.
4. Remove duplicate primary leaves from `system` when menu is later implemented (J19).
5. Live `admin-menu.ts` **not** changed until a separate implementation authorization.

### Members leaves (URL preserve)

| key | path |
|---|---|
| users | `/admin/users` |
| global-reports | `/admin/reports` |
| reports-logs | `/admin/reports/log` |
| audit-logs | `/admin/audit-logs` |

---

## Explicit non-claims

- reports-logs function preservation: **NOT_PROVEN**
- promotion-home hub runtime: **NOT_PROVEN**
- L2–L4 permissions: **NOT_PROVEN**
- TRACK A / P0 / isolated DB: **BLOCKED**
- Full admin IA implementation complete: **NO**
