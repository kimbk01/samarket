# 설계 괴리 분석 + 재설계안 (패치 금지)

**Date:** 2026-08-03  
**Mode:** 설계 보고 · 코드 미착수  
**목적:** 이전 설계 vs 깨진 현실 vs 팀장 확정 제품을 대조하고, **땜빵이 아닌 재설계**로 어떻게 갈지 고정한다.

---

## 0. 한 줄

이전 Gate2/3 설계는 **A/B/C 분리·NC 풀페이지·App Icon=A+B_member(Owner 제외)** 쪽이었다.  
팀장 확정 제품은 **Bottom에 거래·주문 포함 · App Icon에 Owner 포함 · 종=모달(미읽음)→알림보기(내역)** 이다.  

문제는 “숫자만 틀린 버그”가 아니라 **계약이 제품과 어긋난 채 일부만 구현·이중 권위를 남긴 설계 실패**다.  
따라서 Step8 한 줄 revert나 unified 필드만 지우는 패치로 끝내지 않는다.

---

## 1. 이전 설계가 무엇이었나

### 1.1 Phase 1 / Gate 2 권위 (문서상)

| 축 | 이전 설계 |
|----|-----------|
| A | Member 비채팅 알림 → Bell |
| B | 미읽음 **방** (+ missed) → 대화 표면 |
| C | store ops → Owner only |
| App Icon | **A + B_member** (Owner SO·C **제외**) |
| Bottom Chat | **GD + Group만** (Trade/Order는 Hub) |
| Bell UI | Gate2: **`/notifications` 풀스크린 NC** (팝업을 Bell 권위에서 제거) |

근거: `badge-authority-contract.md`, `notification-center-ui-contract.md`, Step8 classification.

### 1.2 Gate 3 Step 8이 한 일

```text
종 클릭: 팝업 토글 삭제 → router.push("/notifications")
모두 보기: /mypage/notifications → /notifications
팝업 리스트를 Bell 권위에서 DELETE
```

의도: “Bell 권위 = A, UI = Notification Center”.  
**하지 않은 일:** 앱 셸에서 `/notifications`에 OwnerLite·FAB 제외, 모달(미읽음) 계층 유지.

### 1.3 Slice 2-3 App Icon

```text
member path: owner SO 제외 → Cap ≈ 20
unified path: owner 포함 ChatAttention → 22
```

의도: Member Icon에서 Owner 분리.  
**남긴 것:** 두 합을 HTTP에 동시 노출 → 설계 cutover 미완.

---

## 2. 무엇이 틀어졌나 (설계 괴리 3층)

### 층 A — 이전 설계 vs 팀장 확정 제품 (계약 자체 불일치)

| 항목 | 이전 Gate 설계 | 팀장 확정 (현재 SSOT) | 괴리 |
|------|----------------|----------------------|------|
| Bottom Chat | GD+Group | GD+Group+**Trade+Order(오너 대화)** | **공식 변경** |
| App Icon Owner | **제외** | **포함** (종·배달·FAB와 동일하게 제거 가능) | **공식 변경** |
| Bell 1차 UI | `/notifications` 풀페이지 | **모달 = 미읽음만** | **IA 변경** |
| 읽음 내역 | NC 한 화면에 unread/read 혼재 가능 | **「알림 보기」도메인**에서 읽은 내역 | **IA 변경** |
| Owner 종 탭 | (모호/미잠금) | **해당 매장 어드민** | **라우팅 신설** |
| Owner 표시 | FAB·배달 중심 | **종 + 배달 + FAB 각각** + Icon | **표면 확장** |

→ 이전 설계를 “잘 구현만 하면” 되는 문제가 **아님**.  
**제품 계약을 팀장 기준으로 재잠금**해야 한다.

### 층 B — 이전 설계조차 제대로 안 맞은 구현 (구현/cutover 실패)

| 항목 | 설계 의도 | 실제 | 문제 |
|------|-----------|------|------|
| App Icon 단일 | A+B_member 하나 | 20과 22 동시 | 권위 이중 |
| NC 독립 | Member A only 화면 | OwnerLite+FAB 침범 | identity·셸 붕괴 |
| smoke | 실측 전 CODE만 | Product PASS 남용 | 게이트 붕괴 |
| `/mypage` → `/notifications` | 동일 A | 셸 클래스 달라짐 | 회귀 |

### 층 C — 지금 코드가 팀장 제품과도 불일치

| 팀장 제품 | 현재 코드 경향 |
|-----------|----------------|
| Bottom=+Trade+Order | Bottom=GD+Group |
| Icon에 Owner | Cap 경로 Owner 제외 / unified만 유사 포함 |
| 모달 미읽음 → 알림보기 내역 | Step8로 모달 제거, 풀페이지 NC |
| 종 주문 → 매장 어드민 | 미검증·미잠금 |

---

## 3. 문제의 본질 (왜 또 실수하는가)

1. **권위 문서와 UI 문서를 한 번에 freeze**하면서, 셸·모달·Bottom 공식을 제품과 재합의하지 않음.  
2. **cutover 중 dual field**를 “임시”로 남기고 smoke가 한쪽만 PASS.  
3. **경로만 바꾸고 셸 계약을 안 잠금** (pathname 제외 목록 누락).  
4. **패치 유혹:** Step8 revert만 / unified만 삭제 / FAB만 숨기기 → 공식·IA가 다시 어긋남.

이번엔 **계약 재잠금 → 단일 SSOT → 표면 adapter** 순으로만 간다.

---

## 4. 재설계안 (땜빵 금지)

### 4.1 원칙

```text
1. 제품 계약 문서가 SSOT (08 + 본 설계안)
2. Domain authority 한 곳 → Projection → Surface adapter → Native echo
3. UI는 권위를 만들지 않음 (모달은 A unread filter 뷰)
4. App Icon은 최상위 구성요소 합만 echo (직접 ±1 금지)
5. Owner identity = store:{id} ; 탭 라우트에 store_id 필수
6. Dual App Icon 필드 금지 (진단 필드는 이름·문서에 diagnostic only)
7. 검증 = 기기 UI 실측; API 합 ≠ Product PASS
```

### 4.2 권위 레이어 (재잠금)

```text
┌─ Member Notification A ─────────────────────┐
│  events: status / notice / community …       │
│  surfaces: Member Bell digit, Modal unread,  │
│            알림보기 목록(읽음 포함)           │
└──────────────────────────────────────────────┘

┌─ Member Conversation B ─────────────────────┐
│  rooms: GD, Group, Trade, CustOrder(대화)    │
│  row = messages; hub/bottom = room count     │
│  Bottom Chat = GD+G+Trade+CustOrder rooms    │
│  system status ≠ B (→ A)                     │
└──────────────────────────────────────────────┘

┌─ Store Owner O (store:{id}) ────────────────┐
│  O_bell / O_delivery / O_fab (각각 표시)     │
│  O_icon_term ⊆ App Icon (중복 제거 합)       │
│  O_bell item → store admin route             │
└──────────────────────────────────────────────┘

App Icon =
  A_unread
  + |B rooms in Bottom set|
  + O_icon_term
  (no double count across A/B/O)
```

### 4.3 Bell IA (재설계)

```text
[종]
  digit = A_unread (+ Owner 모드면 O_bell 정책 — identity에 따라)
  click → Modal
           data = unread only (badge set)
           actions = multi-select, mark-all, delete-all, per-item
           chrome = Starbucks palette, press states
           NO FAB, NO OwnerLite
           CTA 「알림 보기」→ Notification Domain page
                              data = read + unread history
                              filters, mark, delete
                              Owner order item → /stores/.../owner admin
```

이전 Gate2 “종=즉시 풀페이지 NC”는 **폐기**.  
NC/알림보기는 **2단계(내역)** 로 재정의.  
모달은 **1단계(미읽음 작업면)** — 권위는 같고 **filter view**만 다름.

### 4.4 Bottom / Hub (재설계)

```text
BottomChatRooms = GD ∪ Group ∪ Trade ∪ CustOrder(human)
Hub(domain) = |unread rooms in domain|
List(domain) : count(rows with msg unread>0) == Hub
Row = msg unread (system status excluded from B)
```

구계약 “Bottom=GD+Group only” **문서·코드·테스트 전부 개정**.

### 4.5 App Icon (재설계)

```text
Single field: memberOrCompositeAppIconTotal (이름 하나로 고정)
= A + BottomChatRooms + O_icon_term

O_icon_term = dedupe(O_bell ∪ O_delivery ∪ O_fab constituents)
Kill competing unifiedAttention.appIconTotal as authority
(diagnostic rename or strip from apply/native/fcm)
```

20/22는 “어느 임시 필드를 지울지”가 아니라 **O_icon_term 포함 단일식으로 재정의**.

### 4.6 셸 / 네이티브

```text
Notification modal & 알림보기 routes:
  showOwnerLiteStoreBar = false
  showFloat = false
  safe-area / 44pt touch / APK+iOS parity

Native Badge.set / FCM badge_count = App Icon SSOT only
```

---

## 5. 작업 스트림 (패치 단위 아님 · 계약→구현)

| Stream | 산출 | 금지 |
|--------|------|------|
| **S0 계약 개정** | Phase1/Gate2 Bottom·Icon·Bell IA 문서 개정 + 계약 테스트 갱신 | 코드 먼저 |
| **S1 Bell IA** | 모달 unread view + 알림보기 domain + 선택/읽음/삭제 + 스타벅스 UI + 셸 제외 | Step8만 revert하고 끝내기 |
| **S2 Conversation Bottom** | Bottom projection·BottomNav·테스트 = 새 방 집합 | Hub만 숫자 맞추기 |
| **S3 App Icon SSOT** | 단일 합 + O_icon_term + Native/FCM + dual 제거 | unified만 주석 처리 |
| **S4 Owner routing** | 종 항목 → store admin + store_id payload | 회원 NC에 OwnerLite로 대체 |
| **S5 Runtime** | 3기기 실측 매트릭스 후 PASS 언어 | smoke=Product |

순서: **S0 → S1∥S2 → S3 → S4 → S5** (S1/S2 병렬 가능, S3는 Bottom 확정 후).

---

## 6. “패치로 하면 또 실수”하는 예시 → 거절

| 땜빵 | 왜 거절 |
|------|---------|
| 종만 다시 `setOpen` | 알림보기·선택·삭제·오너 라우트·컬러 계약 누락 |
| `/notifications`에서 FAB CSS hide | OwnerLite·다른 경로 재발 |
| Cap만 20 고정 | Owner 포함 제품과 모순 / 22 잔존 |
| Bottom에 Trade만 +1 하드코드 | Order·시스템 제외·Hub 정합 붕괴 |
| API 필드 하나만 맞추고 기기 스킵 | 동일 실패 반복 |

---

## 7. 성공 조건 (설계 완료 정의)

1. 문서·코드·테스트의 Bottom / Icon / Bell IA가 **팀장 표와 동일 문장**.  
2. App Icon HTTP·Cap·런처 **한 숫자**.  
3. 종→모달(미읽음만)→알림보기(내역); FAB·매장메뉴 없음.  
4. Owner 종 주문 → 해당 매장 어드민.  
5. Hub 방 수 = 리스트 미읽음 방 개수.  
6. 3기기 실측 후에만 Product/Runtime 언어.

---

## 8. 가능 여부 · 리스크

| | |
|--|--|
| 가능 | Yes — 레이어는 이미 A/B/이벤트/참가자 unread가 있음. **공식·IA·셸을 재잠그면 됨** |
| 주 리스크 | 구 Gate2 NC 계약·Bottom=GD+G 테스트·dual HTTP를 안 지우고 새 코드만 얹는 것 |
| 완화 | S0에서 **구 계약을 SUPERSEDED** 명시 후 테스트 교체 |

---

## 9. 착수 전 팀장 승인 항목

1. 본 설계안(층 A 제품 변경 + 재설계 원칙) **승인**  
2. `O_icon_term` = 종∪배달∪FAB **중복 제거 합** 확정  
3. Gate2 “종=즉시 `/notifications`” **폐기** 승인  
4. 승인 후 **S0 계약 개정**부터 (구현은 S0 통과 후)

승인 전 코드 수정 없음.

---

## 10. 관련 SSOT

- 제품 공식: `08-product-formula-restated.md`  
- 할 일 요약: `09-master-plan-what-to-do.md`  
- 본 설계: `10-design-divergence-and-redesign.md` (본 파일)
