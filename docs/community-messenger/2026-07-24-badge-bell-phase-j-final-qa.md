# Phase J — Final 2-device QA (LOCK gate #4)

**Date:** 2026-07-24  
**Code changes:** none — QA only  
**Devices:** Xiaomi + Samsung (동일 항목)  
**Phase J LOCK:** **PENDING** until this matrix is fully PASS + explicit approval

Preceding gates (already PASS): J1 · J2a · J3 · J4 · Residual Review · Legacy Badge Authority 제거 · import-ban · 문서↔코드.

---

## Preflight

```bash
npm run verify:badge-import-ban   # must PASS
```

Deploy / build under test = HEAD with J1–J4. Do **not** promote LOCK from this file alone.

---

## Checklist (Xiaomi / Samsung 각각)

| 영역 | 확인 항목 | PASS |
|------|-----------|------|
| Header Bell | 미읽음 +1 / 읽음 −1 / 중복 증가 없음 | ☐ |
| Bottom Chat | General Direct + Group만 반영 · Trade·Store Order는 **0 유지** | ☐ |
| App Icon | 증가 / 감소 / Logout 시 **0** | ☐ |
| Push Badge | `badge_count` = `appIconTotal` 일치 | ☐ |
| Projection | Domain Projection과 모든 Surface 일치 | ☐ |
| Legacy | Legacy writer 호출 없음 | ☐ |
| Poll | Legacy poll 재활성화 없음 | ☐ |
| Regression | Bell · Bottom · App Icon 회귀 없음 | ☐ |

---

## Result table

| Device | Bell | Bottom | App Icon | Push | Projection | Legacy | Poll | Regression | Overall |
|--------|------|--------|----------|------|------------|--------|------|------------|---------|
| Xiaomi | | | | | | | | | PASS / FAIL |
| Samsung | | | | | | | | | PASS / FAIL |

**Combined:** `PASS` / `FAIL`

---

## On PASS (승인 시에만 승격)

동시에:

1. `PASS — PHASE J LEGACY REMOVAL VERIFIED`
2. `PASS — BADGE / NOTIFICATION DOMAIN INFRASTRUCTURE LOCKED`

그 전까지 LOCK = **보류(PENDING)**.

## On FAIL

LOCK 승격 금지. FAIL 영역 · 기기 · 재현만 기록.

---

## Official status (frozen)

| Item | Status |
|------|--------|
| J1–J4 · Residual Review | ✅ PASS |
| Residual delete targets | **0** |
| 2-device final QA | ⏳ PENDING |
| Phase J LOCK | ⏳ PENDING |
| Product code edits this gate | **none** |
