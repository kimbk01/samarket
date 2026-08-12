# O01 Reverse Trace — Where the path breaks

**Status:** TRACE ONLY · **코드 수정 없음** · 롤백 없음  
**Date:** 2026-08-03  
**Input:** Wave1 O01 FAIL · run `wave1-o01fix-1785726575`  
**Identity:** `operation:f528df49-…:NEW_ORDER_PENDING:5200511d-…`  
**Runtime actionId:** `store:f528df49-…|NEW_ORDER_PENDING|5200511d-…`

---

## 0. 팀장 판정 (증거로만)

| Task | 판정 |
|------|------|
| N11 | **KEEP** |
| C01 | **KEEP** |
| O01 | **REBUILD 대상 확정** |

전면 롤백 / App Icon·Bell 단독 패치 / 추측 Projection 수정 = **하지 않음**.

증명된 한 줄:

```text
operation Task → Owner Pending ✅
               → Top Bell(O_bell) ❌
               → App Icon ❌
```

Publisher가 틀렸다고 **단정하지 않음**.  
끊긴 곳은 **Operation → (Bell/Icon으로 가는) Projection 경로**다.

---

## 1. 역추적 체인 (단계별)

```text
[1] Operation Task 생성 (DB)
        ↓
[2] C_store / Owner Operation 집합 (있으면)
        ↓
[3] Member Bell Projection 입력
        ↓
[4] Top Bell Digit (O_bell)
        ↓
[5] Member / Unified App Icon Projection 입력
        ↓
[6] App Icon Digit
```

---

## 2. 단계별 증거

### [1] Operation Task 생성 — **CONNECTED**

| 증거 | 값 |
|------|-----|
| insert | `store_orders` pending · status 201 |
| bible id | `operation:{storeId}:NEW_ORDER_PENDING:{orderId}` |
| pendingBefore → After | 0 → **1** |
| accept 후 | pending 복귀 (OwnerDown PASS) |

→ Task는 제품 DB에 **존재**한다. Writer(주문 pending)는 이 Trace에서 끊기지 않음.

### [2] Owner Pending / C_store 계산 가능 — **CONNECTED (별축)**

코드에 C_store Projection **모듈은 있음**:

- `lib/notifications/badge-authority-rebuild/store-operation-c-projection.ts`  
  `resolveOwnerOperationAttentionCountForStore` (pending+refund+cancel+inquiry)
- `c-store-authority-contract.ts` — `NEW_ORDER_PENDING` = C_store CONFIRMED

Wave1는 DB pending Δ로 Owner 축 **존재**를 확인.

### [3]→[4] Operation → Top Bell(O_bell) — **BROKEN (여기가 끊김)**

| 관측 | baseline | after O01 | Δ |
|------|----------|-----------|---|
| `bellTotal` (HTTP projection) | 0 | 0 | **0** |
| `explainBell` | 0 | 0 | **0** |
| `notificationAttention` | 0 | 0 | **0** |

코드 계약 (현재):

```text
bellTotal = A_member (memberUnreadNotificationCount only)
```

출처:

- `build-notification-badge-projection.ts` — Bell = A_member  
- `build-domain-badge-authority-http.ts` — Bell 입력 = `bellExplainRows` / notification events **만**  
- **같은 파일에서 `resolveOwnerOperationAttentionCountForStore` / C_store 호출 없음**

또한 C_store 계약이 **명시적으로 금지**:

```text
C_STORE_FORBIDDEN_SURFACES includes MEMBER_BELL
```

(`c-store-authority-contract.ts`)

**끊김 정의:**  
Operation identity가 Bell Projection **입력 집합에 들어가지 않는다**.  
Bell Surface가 “잘못 읽은” 것이 아니라, **투영할 Fact가 Bell 파이프에 없음**.

→ O_bell Oracle(R0.5-A) vs 현재 코드 = **제품 계약 충돌 · REBUILD**.

### [5]→[6] Operation → App Icon — **BROKEN (같은 끊김의 Icon 갈래)**

| 관측 | baseline | after O01 | Δ |
|------|----------|-----------|---|
| `memberAppIcon` | 19 | 19 | **0** |
| `unifiedAppIcon` | 21 | 21 | **0** |
| conversation keys / rooms | 동일 | 동일 | 방 목록 불변 |

코드 계약 (현재):

```text
Member App Icon = A_member + B_member(conversation rooms)
C_store / owner operation ∉ Member App Icon
```

출처:

- `member-app-icon-authority.ts` — `appIconTotal = A + conversation rooms` only  
- 테스트: “owner C does not affect appIconTotal”  
- `C_STORE_FORBIDDEN_SURFACES` includes `MEMBER_APP_ICON`  
- `native-fcm-member-app-icon-authority.ts` — C_store excluded  

`unifiedAttention`도 chat room ids + notification events — **operation pending 미포함**.  
(unified의 +2 vs member는 **owner chat rooms** — O01 operation과 무관 · 이번 Δ=0)

**끊김 정의:**  
Operation identity가 App Icon Projection **입력 집합에 들어가지 않는다**.

---

## 3. 끊김 한 장

```text
[1] store_orders.pending = Task ✅
[2] C_store 모듈/카운트 축 존재 ✅ (별도)
        ✖  연결 없음
[3] Bell 입력 = notification events only
[4] Bell Digit 불변 ❌
        ✖  연결 없음
[5] Icon 입력 = A + conversation rooms only
[6] App Icon 불변 ❌
```

**First break (증거 가능한 최상단):**

> **Operation Task → Member Bell / Member·Unified App Icon Projection 입력으로의 합성(composition)이 없다.**  
> (현재 코드는 C_store를 그 Surfaces에서 **금지**까지 함.)

이 단계에서 이미 끊기므로, 그 아래 Surface/Publisher/Native가 “숫자를 삼킨다”고 **추가 증명할 필요는 없음** (입력이 0).

Publisher 단독 실패로 **단정하지 않음** — Publisher는 없는 operation Fact를 Bell/Icon에 실어 나를 수 없음.

---

## 4. 아직 증명하지 않은 것

| 항목 | 상태 |
|------|------|
| FAB/Delivery UI가 C_store를 실제로 그리는지 | Wave1 Device SKIP · DB proxy만 |
| Owner hub attention RPC가 pending을 반환하는지 | 이번 Trace 미측정 (별도) |
| `notifyStoreOwnerNewOrder` 알림 행이 Bell에 잡히는지 | O01 Oracle은 **operation**이지 N 알림 대체가 아님 |
| Publisher 버그 여부 | **미단정** |
| N11/C01 파이프 이상 | Wave1 PASS · KEEP |

---

## 5. REBUILD 범위 (확정 가능한 것만)

O01 REBUILD = **Operation → O_bell + App Icon(∪1) Projection 연결**  
(R0.5-A Oracle · R0 IA · Bible Top Bell = \|N ∪ O_bell\| · Icon = \|N ∪ C ∪ O\|)

현재 Slice 2-5 `C_STORE_FORBIDDEN_SURFACES`(MEMBER_BELL / MEMBER_APP_ICON)는  
**제품 Oracle과 충돌** — REBUILD 시 이 계약을 제품 쪽에 맞출지 문서 충돌로 먼저 잠가야 함.

**하지 말 것 (지금):** 전면 롤백 · Icon/Bell 핫픽스 · N11/C01 손대기 · 추측 패치.

---

## 6. 한 줄

**O01은 Task까지는 산다. Bell·Icon Projection 입력에 operation이 안 실려서 끊긴다. Publisher 단정 금지. N11/C01 KEEP · O01 REBUILD.**
