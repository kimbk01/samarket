# Native / FCM Runtime Map (Phase 2A)

**HEAD:** `1e2a560c1` · Runtime edits: none

Contract: FCM/Native are **transport + absolute set** of Member App Icon snapshot (`A_member + B_member`). Never authority. Never +1/−1 locally. Never B_store/C_store on Native until separate owner-mode product (**BLOCK**).

---

## Server push embed

| File | Symbol | Behavior | Verdict |
|------|--------|----------|---------|
| `lib/notifications/pipeline/notify-push-dispatcher.ts` | push build | `badge_count` / `badgeCount` = `domain.projection.appIconTotal` | **ROUTE** — echo MemberAppIcon only after formula fix |
| `lib/push/dispatch/push-payload-types.ts` | types | badge_count field | **KEEP** field; meaning ROUTE |
| APNS sender | `aps.badge` | same total | **ROUTE** |

---

## Client sync

| File | Symbol | Behavior | Local ±1? | Verdict |
|------|--------|----------|-----------|---------|
| `lib/push/native/sync-native-badge-count.ts` | `syncNativeBadgeCount` | absolute `Badge.set` / clear + Delivery Adapter apply | **No** (absolute set) | **KEEP** set-only |
| `components/push/NativeBadgeSync.tsx` | subscribe surface store | pushes appIconTotal | No | **KEEP**; source ROUTE |
| `clearNativeBadgeCount` | logout wipe | set 0 | No | **KEEP** |
| Boot | `ensureInitialBadgeSnapshotForBoot` | HTTP COMPLETE → Apply → Native | No | **KEEP** trigger |

---

## Android

| File | Behavior | Local ±1? | Verdict |
|------|----------|-----------|---------|
| `DibayAppIconDeliveryAdapter.java` | summary `setNumber(total)` absolute | No compute | **KEEP** echo |
| `DibayFirebaseMessagingService.java` | domain child `setNumber(0)`; summary via adapter | child not absolute total | **KEEP** carrier contract |
| `MainActivity.java` | Cap cache → adapter | | **KEEP** |

---

## iOS

| File | Behavior | Local ±1? | Verdict |
|------|----------|-----------|---------|
| `DibayAppIconDeliveryAdapter.swift` | `setBadgeCount` / `applicationIconBadgeNumber` absolute | No | **KEEP** |

---

## Risks to DELETE if found later

| Pattern | This audit |
|---------|------------|
| Read current badge then +1 on FCM receive | **NOT FOUND** in primary Delivery Adapter / syncNativeBadgeCount (absolute set documented) |
| UI enter → Native −1 without server | **NOT FOUND** in sync path; other paths **UNPROVEN** — Slice 2-6 must re-scan |
| Cache TTL inventing totals | badge-count poll dirty-gated — **KEEP** pattern; must not invent |

---

## BLOCK

- Store B/C on Native App Icon  
- Marketing ephemeral affecting badge_count  
- Using Native value to infer server authority  

---

## Slice

**2-6 FCM/Native Projection** last — after A/B_member formula correct.
