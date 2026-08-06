# 08 — HARD LOCK

최종 게이트. **PRODUCT PASS 이후 — FINAL HARD LOCK (2026-08-06).**

## 체크리스트

- [x] Architecture LOCK 6계약 TBD = 0 — `ARCHITECTURE-LOCK.md`
- [x] Design System + Accessibility HARD LOCK — Slice 2.5
- [x] User Facts Trust SSOT 단일 — Slice 1 / 4
- [x] Domain Contract 전 Domain 표 완성 — `02-DOMAIN-CONTRACT.md`
- [x] Navigation / CTA / Motion 코드·verify 강제 — Slice 2 · `verify:mypage-authority-contract`
- [x] Runtime Contract boot/logout/deep link 실측 — Slice 9 · 11 (logout CTA · redirect authority)
- [x] CMS 단일 권위 · i18n key 미노출 — Slice 8 Legal/Business · Slice 11 smoke
- [x] Dead path 0-ref 제거 — Slice 10 Bundle A–C (`DEAD_CANDIDATE=0`)
- [x] Multi-platform Runtime PASS — Slice 9 LOCK · Slice 11 Windows/Tablet/APK/iOS PASS
- [x] 문서·verify 스크립트 고정 · 회귀 금지 주석 — Foundation · Slice status · harnesses

## FINAL HARD LOCK

```text
DIBAY MY PAGE PRODUCT PASS
FINAL HARD LOCK
```

| Item | Value |
|------|-------|
| Product SHA (runtime) | `6a4c414e4ae020e201c850003622f0b2766d81f8` |
| Deploy | `dpl_2vBqxdDzqCEs1Mr5BZ37oC27R86s` |
| Alias | `https://samarket.vercel.app` |
| Slice 11 evidence | `.qa-logs/customer-platform-slice11-runtime-2026-08-06T10-54-45-269Z` |
| Status index | `_ios-mypage-audit-2026-08-06/dibay/SLICE12-PRODUCT-PASS-STATUS.md` |

위반 시 구현 되돌림 + changelog 기록.  
Auth / Messenger / Call / Badge 는 본 HARD LOCK 범위 밖 (별도 프로그램).
