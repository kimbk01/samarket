# Phase J2 — 75s Poll Inventory (audit only · no code changes)

**Status:** INVENTORY ONLY — quarantine/삭제 미승인  
**Parent:** J1 `PASS — PHASE J1 LEGACY NOOP REMOVAL VERIFIED`  
**LOCK:** `PASS — BADGE / NOTIFICATION DOMAIN AUTHORITY LOCKED`  
**Date:** 2026-07-24

상수: `NOTIFICATION_SYNC_POLL_MS = 75_000` (`lib/notifications/notification-events.ts`)

---

## 1. 판정 요약 (구현 전)

| 질문 | 답 |
|------|----|
| 75s poll이 **Header Bell digit** 인가? | **아니오** — digit SSOT는 Domain `badge-count.total` (`resolveTier1HeaderBellBadgeTotal`이 `storeUnread` 무시) |
| 75s poll이 **App Icon** 인가? | **아니오** — `NativeBadgeSync` = Domain `appIconTotal` / App Icon projection |
| 75s poll이 **Bottom Chat** 인가? | **아니오** — Bottom = hub CM room-count (R2 180s + live) |
| Projection과 **중복 writer**인가? | digit writer로는 **아님**. 다만 **병렬 unread cache + 네트워크 poll** + **Stores placeholder digit** 로 LOCK 표면과 **시각적 경합** 가능 |
| 지금 바로 삭제해도 되나? | **아직 불가** — 제품이 Header에서 store를 **구독**해 poll을 arm하고, mark-read 후 `refresh`/`refreshActiveSurface…`를 호출함. 호출 관계 정리 후 quarantine |

---

## 2. 75s가 실제로 쓰는 것 (표면별)

### A. Badge-adjacent surface poll (핵심 J2 대상)

| 모듈 | Interval | Endpoint | Snapshot 용도 |
|------|----------|----------|----------------|
| `notification-unread-badge-store` | 75s (+ visibility / `KASAMA_NOTIFICATIONS_UPDATED` coalesce) | `GET /api/me/notifications?unread_count_only=1&badge_surface=…` → **notification_targets surface count** | 로컬 `snap: number \| null` only |
| `myBottomNavNotificationUnreadStore` | 동일 75s (pathname=`bottom_nav_my`일 때만 arm) | legacy exclude query (chat/commerce 제외) | 동일 — **훅 제품 호출자 0** |

**데이터 경로:** segmented/targets surface unread → store snap. **Domain projection apply 없음.** Bell/App Icon store에 write 안 함.

### B. Notification **list** poll (같은 상수 · 다른 역할)

| 화면 | 역할 |
|------|------|
| `MyNotificationsView` | 목록 재로드 |
| `OwnerNotificationList` | 목록 재로드 |
| `AdminNotificationList` | 목록 재로드 |
| `AdminStorePointPendingProvider` | admin pending poll |

→ **Bell digit / App Icon과 무관.** J2 badge 슬라이스에서 상수·목록 poll을 함께 지우면 안 됨. (상수 rename 또는 list-only 유지 후보)

### C. Domain Bell poll (비교 · **KEEP / R3**)

| 모듈 | Interval | Endpoint | 용도 |
|------|----------|----------|------|
| `notification-badge-count-store` | **45s** | `/api/me/notifications/badge-count` | Domain projection → Header Bell |

---

## 3. 제품 호출 관계 (현재)

```
MessagingGlobalChrome / NotificationsBadgeRealtimeBridge
  └─ reconcileTier1BellSurfacePolling(pathname)     # active surface만 75s arm

PhilifeHeaderNotificationInbox
  ├─ getSurfaceNotificationUnreadStore(surface)     # subscribe → 75s arm
  ├─ storeUnread → resolveTier1HeaderBellBadgeTotal  # IGNOREd (LOCK)
  ├─ badgeCountSnap.total → Bell digit               # Domain SSOT
  ├─ badgeStore.refresh after mark/delete            # legacy snap only
  └─ refreshActiveSurfaceNotificationUnreadStores    # RT/read 후 75s store

StoresHomeHeaderNotificationInboxLazy
  └─ deliveryBellUnreadStore snap → placeholder badge digit  # ⚠️ 유일한 UI digit 소비자

NotificationsBadgeRealtimeBridge
  └─ INSERT → refreshActiveSurfaceNotificationUnreadStores + KASAMA event

hooks/useMyNotificationUnreadCount
hooks/useOwnerCommerceNotificationUnreadCount(+Deferred)
  └─ 제품 import/호출 0 (정의만) → J4 후보

NativeBadgeSync / Bottom hub
  └─ 75s store 미사용
```

### UI digit 소비자

| Surface | 숫자 소스 | 75s 의존? |
|---------|-----------|-----------|
| Header Bell (loaded) | Domain `badge-count.total` | 구독만 (digit 아님) |
| Stores home Bell placeholder | **75s surface snap** | **예 — LOCK 경합** |
| App Icon | Domain appIcon | 아니오 |
| Bottom Chat | hub GD+group | 아니오 |

---

## 4. Projection 중복 writer 판정

| Writer | Bell | App Icon | Bottom | 75s store |
|--------|------|----------|--------|-----------|
| `buildNotificationBadgeProjection` / apply funnel | ✅ | ✅ (독립) | — | — |
| 45s badge-count poll | network → Bell | via App Icon path | — | — |
| 75s unread store | ❌ digit 미적용 | ❌ | ❌ | ✅ snap only |
| Stores placeholder | 임시 digit | — | — | ✅ **표시** |

→ **Authority 중복 writer는 아님.** J2 목적은 “Bell 공식 변경”이 아니라 **병렬 poll·placeholder·불필요 구독 제거**.

---

## 5. 권장 다음 슬라이스 (승인 후 · 아직 미실행)

**J2a (권장 첫 실행 단위)**  
1. Stores placeholder digit → Domain Bell total 또는 `0`/skeleton (75s 표시 금지)  
2. Philife: Bell digit 경로에서 surface store **subscribe 제거** (refresh 필요 여부 재증명)  
3. Realtime bridge: Bell digit용 `refreshActiveSurface…` 축소 여부 재증명  
4. 호출 0 → import-ban 확장 → store/poll 삭제 가능 시만 삭제  

**J2 비범위**  
- 목록 75s (`MyNotificationsView` 등)  
- 45s Domain poll (R3 KEEP)  
- 180s hub poll (R2 KEEP)  
- Push / Target writer / Domain loader  

---

## 6. J2 완료 전 Gate (구현 시)

기존 Phase J 순서 유지: Inventory ✅ → 호출 관계 증명 ✅(본 문서) → Quarantine → 호출 0 → Import Ban → 삭제 → Gate → (해당 슬라이스) LOCK

**현재 단계 종료 조건:** inventory 승인만. 코드 변경 없음.
