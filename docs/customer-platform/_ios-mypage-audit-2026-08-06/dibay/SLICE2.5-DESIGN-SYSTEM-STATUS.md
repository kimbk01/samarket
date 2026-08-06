# Slice 2.5 Design System + Accessibility — status

```text
SLICE 1 FACTS LOCKED
SLICE 2 AUTHORITY LOCKED
SLICE 2.5 DESIGN SYSTEM + ACCESSIBILITY HARD LOCK
SLICE 3 UI LOCKED (hub IA) — see SLICE3-UI-STATUS.md
```

## Implemented (contract only — no MyPage IA redesign)

| Item | Evidence |
|------|----------|
| Hard-lock SSOT | `lib/ui/design-system-hard-lock.ts` |
| Doc LOCK table | `docs/customer-platform/04-DESIGN-SYSTEM.md` |
| Brand | `--dibay-green` `#0B421A` · karrot orange forbidden |
| A11y | contrast ≥ 4.5:1 · tap ≥ 44px · input ≥ 16px · reduced-motion |
| Component vocabulary | `Sam.*` / `samarket-components.css` (no new dual tree) |
| verify | `npm run verify:design-system-hard-lock` PASS |
| vitest | `lib/ui/__tests__/design-system-hard-lock.test.ts` PASS |
| tsc | PASS |

## Explicitly not done (Slice 3+)

- MyPage home IA 전면 재배치
- Admin/타 도메인 visual restyle beyond token lock
- E2E logout path rewrite (Authority contract already redirects; E2E expect adjust is separate)

## Next

~~Slice 3 UI~~ → **LOCKED** (`SLICE3-UI-STATUS.md`).
