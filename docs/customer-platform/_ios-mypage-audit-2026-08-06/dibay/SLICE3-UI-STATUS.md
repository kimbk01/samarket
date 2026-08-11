# Slice 3 MyPage UI IA — status

```text
SLICE 1 FACTS LOCKED
SLICE 2 AUTHORITY LOCKED
SLICE 2.5 DESIGN SYSTEM HARD LOCKED
SLICE 3 UI CODE LOCKED
SLICE 3 DEPLOYED
APK PASS
Tablet PASS
Windows PASS
iOS PASS
CTA PASS
Logout Authority PASS
Scroll/Back PASS
Existing Feature Entry PASS
SLICE 3 UI RUNTIME PASS
SLICE 3 UI RUNTIME LOCK
```

## Deploy countermeasure

Dirty worktree → ~3.4GB Vercel upload fail.  
**Production deploy:** `git push origin main` → Vercel Git Integration only. CLI Production deploy is forbidden.  
`dpl_7XS5rZL1QGJeCrEhqZjBtck7BBvq` → `samarket.vercel.app` Ready  
Content base: `fa3e6b4a2` (scroll restore included)

## Runtime evidence

| Gate | Evidence |
|------|----------|
| APK | `.qa-logs/customer-platform-slice3-runtime-2026-08-06T06-32-55-709Z/` |
| Tablet | `.qa-logs/customer-platform-slice3-runtime-2026-08-06T06-35-27-086Z/` |
| Windows | `.qa-logs/slice3-runtime-windows.json` |
| iOS | `.qa-logs/customer-platform-slice3-ios-2026-08-06T06-47-41-800Z/SUMMARY.json` · script `scripts/qa/slice3-ios-webkit-hub-runtime.mjs` |

Password: env/manual only — **not** in code, commits, status docs, or SUMMARY.

## iOS checklist (PASS)

- `/mypage` · section order · profile/manner/trade/account/support
- logout `menu_row` → Danger modal (cancel)
- account entry → back · scroll restore
- My double-tap → top
- trade · privacy entry

## Next

Slice 4+ **forbidden** until explicit authorization.  
Slice 2/2.5 dirty HOLD remains uncommitted (untouched).
