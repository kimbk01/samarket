# Slice 2-6 — Native / FCM CODE PASS

**Date:** 2026-08-03  
**Scope:** Member App Icon absolute echo to Native / FCM only  
**Locked axes untouched:** A_member · B_member · B_store · C_store  
**Bell UI:** not modified  
**PRODUCT / HARD LOCK:** not declared

---

## Verdict

```text
SLICE 2-6 NATIVE_FCM CODE PASS
```

---

## A. 수정 파일

| Path | Change |
|------|--------|
| `lib/notifications/badge-authority-rebuild/native-fcm-member-app-icon-authority.ts` | Pure contract + resolver |
| `__tests__/native-fcm-member-app-icon-authority.test.ts` | Contract tests |
| `lib/notifications/pipeline/notify-push-dispatcher.ts` | FCM badge = MemberAppIconTotal |
| `lib/admin/notification-campaigns/campaign-send-user.ts` | same |
| `lib/notifications/pipeline/domain-badge-read-ack.ts` | nativeBadgeTotal resolver |
| `lib/order-domain/read-order-chat.ts` | nativeBadgeTotal resolver |
| `lib/push/dispatch/fcm-data-payload-contract.ts` | always send badgeCount (incl. 0) |
| `components/push/NativeBadgeSync.tsx` | Slice 2-6 comments |
| `lib/push/native/sync-native-badge-count.ts` | Slice 2-6 comments |
| tests: surface-writer + web-push payload | contract updates |
| docs under `badge-authority-rebuild-slice2-6/` | audit + CODE report |

**Android/iOS Java/Swift:** no formula change (already absolute `setNumber` / `setBadgeCount`).

---

## B. Native 변경

- Cap / Delivery path remains **absolute replace** of surface `appIconTotal` (Web Member total).
- No native +1/-1 / accumulate introduced.
- Comments lock Slice 2-6 echo contract.

## C. FCM 변경

- `badge_count` / `badgeCount` = `resolveMemberAppIconTotalForNativeFcm(memberAppIconWebTotal, appIconTotal)`.
- Prefer `memberAppIconWebTotal`; fallback `appIconTotal`.
- **Always encode** `badgeCount` string including `"0"`.

## D. Android

- Adapter unchanged (absolute echo).
- Receives FCM `badgeCount` including 0 for clear.

## E. iOS

- Adapter unchanged (absolute `aps.badge` / setBadgeCount).
- APNS gets badge when data includes `badgeCount` (now always present).

## F. Runtime 영향

| Surface | Effect |
|---------|--------|
| Member App Icon (Native) | Absolute MemberAppIconTotal |
| FCM / APNS badge | Absolute MemberAppIconTotal |
| Bell / A / B_member / B_store / C_store / Bottom / Hub | **unchanged formulas** |

## G. 테스트

Related vitest (contract + push payload + surface writer) — see run log.

## H. CODE PASS

**YES** — `SLICE 2-6 NATIVE_FCM CODE PASS`

## I. Runtime 미실행 여부

**YES — device Runtime not executed in this step**

## J. 다음 단계

Deploy → Xiaomi/Samsung/iOS Runtime (boot/resume/push/read) → then **NATIVE RUNTIME PASS** only.  
**Do not** auto-start Bell UI / PRODUCT / HARD LOCK.
