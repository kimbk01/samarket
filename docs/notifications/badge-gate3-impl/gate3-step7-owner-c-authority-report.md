# Gate 3 Step 7 — Owner Authority C

**Verdict:**

```text
OWNER AUTHORITY C CODE PASS
```

| Declaration | Status |
|-------------|--------|
| OWNER AUTHORITY C CODE PASS | **YES** |
| Badge Authority CODE PASS | **NO** |
| RUNTIME / PRODUCT / HARD LOCK | **NO** |
| Notification Center / Push / Legacy / Deploy | **NOT STARTED** (next sequence) |

---

## 1. HEAD C 실패 증거

`gate3-step7-head-owner-c-fail-proof.md` — F1~F5 (no unified snapshot, sum risk, owner_intake, push store gate, A/B/App Icon leak).

---

## 2. 수정 파일

| Path | Role |
|------|------|
| `store-owner-c-authority.ts` | `resolveStoreOwnerAuthority` · surfaces · isolation / push / A·B·App Icon asserts |
| `__tests__/store-owner-c-authority.test.ts` | Contract tests |
| `gate3-step7-*.md` | HEAD fail · writer class · this report |

Existing Slice 2-4/2-5 C_store / B_store modules **KEEP** as Fact helpers (no Cap/push/UI redesign).

---

## 3. Canonical C resolver 경로

```text
store:{storeId}
  + operational counts (pending/refund/cancel/inquiry)
  + owner chat rooms (unreadMessageCount > 0)
      → resolveStoreOwnerAuthority
           → C_operational, C_chat
           → Owner FAB / Admin Hub / Row projections
           → authorityVersion (c1|rev|contentKey)
```

---

## 4. 증명 결과

| Requirement | Result |
|-------------|--------|
| Same userId · multiple stores isolated | PASS (`resolveStoreOwnerAuthoritiesByStore` · active store only) |
| New order ∉ Member Bell A | PASS (`assertNewOrderExcludedFromMemberA` · A count 0) |
| Owner customer msg ∉ Member B | PASS (`assertOwnerChatExcludedFromMemberB`) |
| Owner C ∉ App Icon A+B | PASS + `publish… OWNER_C_FORBIDDEN` |
| Owner push → matching store only | PASS (`assertOwnerPushRecipientStore`) |
| userId forbidden as C identity | PASS |

---

## 5. Surface 공식

```text
Owner FAB orders   = pending + refund + cancel
Owner FAB store    = open inquiries
Owner FAB order chat / Admin Hub chat = C_chat
Admin Hub ops      = C_operational
Owner Row          = that room unreadMessageCount (≠ hub room count)
```

---

## 6. Writer 분류

`gate3-step7-owner-c-writer-classification.md` — canonical publisher **1** per store.

---

## 7. A/B/App Icon 비회귀

A set equality · B room vs row · App Icon A+B tests **PASS** (93 tests in gate run including prior suites).

---

## 8. 정적 검증

| Command | Result |
|---------|--------|
| Related vitest (C + A/B/App Icon + identity) | **93 PASS** |
| `npx tsc --noEmit` | **PASS** |
| `npm run lint` | **PASS** |

---

## 9. 금지 범위 준수

| Forbidden | Status |
|-----------|--------|
| Notification Center UI | untouched |
| Push full rebuild | untouched (pure recipient assert only) |
| Legacy backfill | not run |
| Cap resume prefs | untouched |
| room identity fallback | untouched |
| Deploy / device QA | not done |

---

## 10. 남은 위험 (유지)

```text
Cap resume prefs 무버전 paint
room identity fallback
Runtime 미증명
```

---

## 11. 다음 순서 (승인 후)

```text
Notification Center UI
→ Push Routing
→ Legacy cutover/backfill
→ 잔여 위험 제거
→ 전체 정적 게이트
→ 배포
→ 3기기 Runtime
```

Do **not** declare Badge Authority CODE PASS / Runtime / Product / Hard Lock.
