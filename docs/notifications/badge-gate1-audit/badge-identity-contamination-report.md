# Gate 1 — Identity Contamination Report

**Mode:** AUDIT ONLY · HEAD `f438f37e2`  
**명령서:** `member:{userId}` ≠ `store:{storeId}` · 합산 금지

---

## 검사 항목

| 오염 유형 | 결과 | 증거 |
|-----------|------|------|
| member_id와 store_id 혼용 | **YES (부분)** | `notifyStoreOwner*` → recipient = owner **`user_id`**, meta에 `store_id` · C 진실은 **`store_id` RPC** |
| sender/recipient 반전 | 주경로에서 **체계적 반전 UNPROVEN** | 별도 전수 미실시 |
| buyer/seller 반전 | **UNPROVEN** 전수 | trade notify는 counterparty 패턴 KEEP 후보 |
| customer/owner 반전 | **UNPROVEN** 전수 | — |
| 같은 userId의 여러 storeId 합산 → member Bell | **의도적 방지 시도** · Hub는 active store | FAB chat = active store room count PROVEN · member App Icon에 owner rooms **제외 시도** (A-path) |
| general/trade/order 동일 room 취급 | **파티션 존재** | B projection domain split · 오분류 UNPROVEN |
| push token을 사용자 권위로 사용 | **NO** (주경로) | badge는 Domain total echo |
| 기기별 Cap/badge를 서버 권위로 사용 | **YES (resume)** | `applyFromCapBadgeCache`가 launcher에 Cap prefs 재적용 — **서버 truth 대체 위험 PROVEN** |
| Bell에 채팅 identity | **YES** | Popup `important_room` = room id · digit는 A filter로 chat type 제외 |
| attention key ≠ event id를 동일 권위로 취급 | **YES** | digit=keys · list=events |
| legacy `notifications` id ↔ `notification_events` id | **YES dual** | mark-all/delete bridge |

---

## 명령서 identity vs 현재

| 명령서 | 현재 |
|--------|------|
| Owner 신규주문 → `store:{storeId}` only | events는 `user:{ownerId}`에 기록 · UI/digit에서 필터 | **오염 writer 생존** |
| Member App Icon에 Owner 업무 합산 금지 | C RPC는 별도 · owner_intake이 A 필터 실패 시 누수 위험 | **완화됨, 제거 아님** |
| FCM payload에 recipient_scope member\|store | 일부 payload 필드 존재 · **전수 계약 미검증** | UNPROVEN complete |
| 선택 store만 owner UI | Hub active store | PROVEN 방향 |

---

## 오염이 제품 FAIL에 주는 영향 (사실만)

1. Owner ops 이벤트가 member 테이블 네임스페이스에 존재 → filter/classifier에 의존 (한 곳 빠지면 Bell 오염).  
2. Cap resume가 member App Icon을 기기 캐시로 재확정 가능.  
3. Bell Popup이 room identity를 알림 identity처럼 표시.

**실계정 누수 수치(몇 건이 Bell에 섞였는지):** 이번 Gate1에서 **미계측 → 단정 금지**.
