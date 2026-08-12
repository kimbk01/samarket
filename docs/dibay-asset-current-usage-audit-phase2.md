# DIBAY Current Usage Audit — Phase 2

| Field | Value |
|-------|--------|
| Status | **PHASE 2 PASS** (Evidence + Decision Queue) |
| Date | 2026-08-07 |
| References | [`docs/dibay-asset-contract-ssot.md`](./dibay-asset-contract-ssot.md) **v1.0 FROZEN** |
| Code / DB / API / UI changes | **0** |
| Usage Contract | **READY** (Phase 3 — Decision Queue만 처리) |
| Product PASS / Hard Lock | **NOT DECLARED** |

---

## 0. Scope

```text
Phase 2 = 현재 구현을 Asset ID로 분류한다.
Phase 2 ≠ 사용처 결정 (→ Phase 3 Usage Contract)
Phase 2 ≠ 구현 변경
Phase 2 ≠ Asset Contract 개정
```

감사 질문 (고정):

```text
이 기능이 mutate/read 하는 잔액·원장은 어느 Asset인가?

  AST-001  D-Point
  AST-002  Business Credit
  AST-003  Settlement
  UNCLASSIFIED
```

「광고 → 포인트」가 아니라 **「광고 → Target Asset?」** 으로만 기록한다.

### 용어 (본 문서)

| 열 | 의미 |
|----|------|
| **Current Binding** | 코드가 **실제로** 쓰는 Asset (증거) |
| **Object authority** | 기능이 다루는 대상의 소유 키 (member / store / order) — 참고만 |
| **Verdict** | PROVEN / UNCLASSIFIED / AUTHORITY_NOTE |
| **계약상 목표 Asset** | **본 Phase에서 확정하지 않음** (Phase 3) |

`AUTHORITY_NOTE`: Current Binding의 owner key와, 대상 객체의 owner key가 어긋날 수 있다는 **Evidence 플래그**.  
Usage Contract에서 목표 Asset을 정하기 전까지 **정책으로 승격하지 않는다.**

---

## 1. Registry (참조 only — Asset Contract SSOT)

| Asset ID | 명칭 | Authority |
|----------|------|-----------|
| AST-001 | D-Point | `user_id` |
| AST-002 | Business Credit | `store_id` |
| AST-003 | Settlement | `store_id` (+ settlement keys) |

---

## 2. Classification matrix (Current Binding)

| ID | 기능 | Current Binding | 현재 구현 (Evidence) | Object authority | Verdict |
|----|------|-----------------|----------------------|------------------|---------|
| U01 | 회원 포인트 잔액 조회 | AST-001 | `GET /api/me/points` · `profiles.points` cache · `point_ledger` | `user_id` | **PROVEN** |
| U02 | 회원 충전 신청 | AST-001 | `point_charge_requests` · `POST /api/me/points/charge` | `user_id` | **PROVEN** |
| U03 | 회원 충전 승인 | AST-001 | `approve_user_point_charge_request` RPC · admin point-charges | `user_id` | **PROVEN** |
| U04 | 회원 관리자 지급/차감 | AST-001 | `adjustUserPoints` · `PATCH /api/admin/users/[id]/points` | `user_id` | **PROVEN** |
| U05 | 커뮤니티 리워드 | AST-001 | `executePointRewardServer` → `creditUserPoints` · `community-point-bridge` | `user_id` | **PROVEN** |
| U06 | 커뮤니티 회수 | AST-001 | `executePointReclaimServer` → `spendUserPoints` | `user_id` | **PROVEN** |
| U07 | 회원 포인트 만료 | AST-001 | `point-expire-db` · `expireUserPointEntries` | `user_id` | **PROVEN** |
| U08 | 거래 상세 광고 차감/보류 | AST-001 | `charge-trade-post-ad-points` / `trade-post-ad-point-flow` · `trade_ad_point_holds` | advertiser `user_id` · target post | **PROVEN** |
| U09 | Philife/게시 광고 신청·환불 | AST-001 | `app/api/ads/apply` · admin ads refund `creditUserPoints` | `user_id` | **PROVEN** |
| U10 | 노출 프로모션 `product` | AST-001 | `point_promotion_orders` + `spendUserPoints` · post `user_id` 소유 검증 | post `user_id` | **PROVEN** |
| U11 | 노출 프로모션 `shop` | **AST-001** | 동일 회원 hub · `assertPromotionTargetOwned` → `stores` / `owner_user_id` | **대상 = `store_id`** | **PROVEN binding AST-001** + **AUTHORITY_NOTE** |
| U12 | 매장 포인트 잔액 조회 | AST-002 | `GET /api/me/stores/[storeId]/points` · `stores.point_balance` · `store_point_ledger` | `store_id` | **PROVEN** |
| U13 | 매장 충전 신청 | AST-002 | `store_point_charge_requests` · owner create API | `store_id` | **PROVEN** |
| U14 | 매장 충전 승인 | AST-002 | `approve_store_point_charge_request` RPC | `store_id` | **PROVEN** |
| U15 | 매장 관리자 조정 | AST-002 | `adjust_store_point_balance` RPC · admin adjust route | `store_id` | **PROVEN** |
| U16 | 주문 수락 수수료 차감 | AST-002 | `charge_store_points_on_order_accept` · `applyStoreOrderStatusTransition` | `store_id` | **PROVEN** |
| U17 | 매장 포인트 부족 주문 차단 | AST-002 | `point_commerce_blocked` · checkout `store_point_blocked` | `store_id` | **PROVEN** (상태 플래그; 잔액은 AST-002) |
| U18 | 주문 완료/결제 정산 원장 | AST-003 | `ensureStoreSettlement*` · `store_settlements` · `store_fee_policies` | `store_id` + order | **PROVEN** |
| U19 | 정산 취소(환불 등) | AST-003 | `cancelScheduledSettlementForOrder` | `store_id` + order | **PROVEN** |
| U20 | Admin CP overview 입금 큐 | AST-001 + AST-002 | `point_charge_requests` / `store_point_charge_requests` **건수 분리** (잔액 합산 없음) | n/a | **PROVEN** (큐만; Asset 합산 아님) |
| U21 | 회원 주문 결제에 포인트 할인 | — | checkout에 회원 spend 경로 **없음** | — | **UNCLASSIFIED / ABSENT** |
| U22 | 매장 광고를 AST-002 ledger로 차감 | — | `store_point_ledger` entry에 ad 차감 writer **없음** | — | **UNCLASSIFIED / ABSENT** |
| U23 | AST-001 ↔ AST-002 전환 | — | transfer 심볼 **ABSENT** (경계 테스트) | — | **ABSENT** |
| U24 | store_point `refund`/`bonus` entry | — | 타입·i18n만; writer **미확인** | `store_id`? | **UNCLASSIFIED** |

---

## 3. AUTHORITY_NOTE detail (Evidence only)

### U11 — 노출 프로모션 `shop`

| 항목 | 내용 |
|------|------|
| Current Binding | **AST-001** (`spendUserPoints` / `point_ledger.user_id`) |
| Object | `stores.id` (`store_id`) · owner 검증은 `owner_user_id === auth.userId` |
| Evidence | `lib/points/point-promotion-orders-db.ts` · `app/api/me/points/promotion-orders/route.ts` |
| Note | 대상 객체 authority는 store (`AST-002` 정의의 owner key와 동형). **잔액 mutate는 AST-001.** |
| Phase 2 판정 | Binding **PROVEN AST-001**. 목표 Asset은 **Phase 3에서만** 결정. |
| Phase 2에서 하지 않음 | “AST-002로 옮겨라” / 코드 수정 / Usage 확정 |

---

## 4. Surface map (read paths — Current Binding)

| Surface | Current Binding | Evidence |
|---------|-----------------|----------|
| `/mypage/points*` · `MypagePointsAssetSummary` | AST-001 | Member hub; Store balance 미포함 주석 |
| `/stores/owner/points?storeId=` | AST-002 | `OwnerStorePointsView` |
| Admin Member points / charges / ledger / expire / executions | AST-001 | `/admin/point-*` |
| Admin Store points / charges / ledger / policies | AST-002 | `/admin/store-point*` |
| Admin Store settlements / fee policies | AST-003 | `/admin/store-settlements` · fee policies |
| StoreTab payment → `/mypage/points` | AST-001 링크 | UI 맥락만; 잔액 합산 아님 — **용어/IA NOTE** (Usage 아님) |

---

## 5. Summary counts

| Current Binding | 기능 수 (표 §2) |
|-----------------|-----------------|
| AST-001 | U01–U11, U20(부분) |
| AST-002 | U12–U17, U20(부분) |
| AST-003 | U18–U19 |
| UNCLASSIFIED / ABSENT | U21–U24 |
| AUTHORITY_NOTE | U11 only (binding은 AST-001) |

Member↔Store **잔액/원장 공용 writer**: Evidence상 **없음** (U23).  
**정산(AST-003)과 Credit(AST-002) 잔액 동일시**: Evidence상 **없음**.

---

## 6. Explicit non-goals

```text
본 문서는 Usage Contract가 아니다.
본 문서는 Implementation Contract가 아니다.
Asset Contract v1.0 을 변경하지 않는다.

“앞으로 shop 프로모션은 AST-002” 같은 문장은
Phase 3 승인 전까지 쓰지 않는다.
```

---

## 7. Decision Queue (seed → Phase 3 Registry)

Phase 3는 감사를 다시 하지 않는다.  
DQ는 구현 TODO가 아니라 **제품 의사결정 레지스트리**로 이관한다.  
운영 SSOT: [`dibay-asset-usage-contract-phase3.md`](./dibay-asset-usage-contract-phase3.md)

**Phase 3 필수:** DQ는 현재 구현이 아니라 **제품(Product)** 이 결정한다.  
Current Binding은 결정 근거가 아니라 Evidence다.  
승인 기준: **UDC-01…07 전부 PASS** ([Usage Contract §2](./dibay-asset-usage-contract-phase3.md)).  
핵심 질문: *이 기능은 제품 관점에서 어느 Asset에 속해야 하는가?*

### Status vocabulary (Phase 3부터 필수)

| Status | 의미 |
|--------|------|
| OPEN | 아직 논의 전 |
| ANALYZING | 검토 중 |
| APPROVED | Usage Contract에 채택 |
| REJECTED | 채택하지 않음 |
| DEFERRED | 이후 Phase로 연기 |
| SUPERSEDED | 다른 결정으로 대체 |

```text
Phase 2 시점: 모든 DQ Status = OPEN, Target Asset = UNDECIDED
“AST-001이다 / AST-002다” 선결정 금지 → Phase 3
```

| DQ ID | Feature | Audit ref | Current Binding | Target Asset | Decision Owner | Status |
|-------|---------|-----------|-----------------|--------------|----------------|--------|
| **DQ-001** | Shop promotion (`target_type=shop`) | U11 | AST-001 | **UNDECIDED** | Phase 3 | **OPEN** |
| **DQ-002** | Member order discount (회원 주문 포인트 할인) | U21 | ABSENT | **UNDECIDED** | Phase 3 | **OPEN** |
| **DQ-003** | Store-facing ad / exposure charged on AST-002 ledger | U22 | ABSENT | **UNDECIDED** | Phase 3 | **OPEN** |
| **DQ-004** | Store point ledger `refund` / `bonus` writers | U24 | UNCLASSIFIED | **UNDECIDED** | Phase 3 | **OPEN** |
| **DQ-005** | AST-001 ↔ AST-002 transfer / convert | U23 | ABSENT | **UNDECIDED** | Phase 3 | **OPEN** |
| **DQ-006** | StoreTab payment → `/mypage/points` (IA/표면) | §4 | AST-001 link only | **UNDECIDED** | Phase 3 | **OPEN** |

### DQ detail cards

#### DQ-001 — Shop Promotion

| Field | Value |
|-------|--------|
| Feature | Shop Promotion |
| Current Binding | AST-001 |
| Target Asset | **UNDECIDED** |
| Decision Owner | Phase 3 |
| Status | **OPEN** |
| Note | AUTHORITY_NOTE only — do not pre-assign AST-002 |

#### DQ-002 — Member Order Discount

| Field | Value |
|-------|--------|
| Feature | Member Order Discount |
| Current Binding | ABSENT |
| Target Asset | **UNDECIDED** |
| Decision Owner | Phase 3 |
| Status | **OPEN** |

#### DQ-003 — Store ad on AST-002

| Field | Value |
|-------|--------|
| Feature | Store-facing advertisement / exposure via AST-002 |
| Current Binding | ABSENT |
| Target Asset | **UNDECIDED** |
| Decision Owner | Phase 3 |
| Status | **OPEN** |

#### DQ-004 — Store refund/bonus writers

| Field | Value |
|-------|--------|
| Feature | `store_point_ledger` refund / bonus writers |
| Current Binding | UNCLASSIFIED |
| Target Asset | **UNDECIDED** |
| Decision Owner | Phase 3 |
| Status | **OPEN** |

#### DQ-005 — Cross-asset transfer

| Field | Value |
|-------|--------|
| Feature | AST-001 ↔ AST-002 transfer / convert |
| Current Binding | ABSENT |
| Target Asset | **UNDECIDED** |
| Decision Owner | Phase 3 |
| Status | **OPEN** |

#### DQ-006 — StoreTab payment surface

| Field | Value |
|-------|--------|
| Feature | StoreTab payment section links member points |
| Current Binding | AST-001 (navigation only) |
| Target Asset | **UNDECIDED** |
| Decision Owner | Phase 3 |
| Status | **OPEN** |

**Proven bindings without OPEN DQ** (U01–U10, U12–U20): Current Binding만 기록됨.  
Phase 3에서 “현행 유지(AST-xxx)”를 Usage로 채택할지 여부는 Usage Contract 작성 시 **일괄 Confirm** 가능 — 새 DQ를 필수로 두지 않음.

---

## 8. Phase 2 exit

| 조건 | 상태 |
|------|------|
| 기능을 AST-001/002/003/UNCLASSIFIED로 분류 | **PASS** |
| Current Binding ≠ Target Asset 혼동 방지 | **PASS** |
| Decision Queue 작성 (UNDECIDED) | **PASS** |
| 정책 결정 안 함 | **PASS** |
| Asset Contract 변경 없음 | **PASS** |
| 코드/DB/API/UI 변경 0 | **PASS** |
| Phase 3 Usage Contract | **READY** |

---

```text
PHASE 1  Asset Contract           FROZEN PASS
PHASE 2  Current Usage Audit      PASS
         Decision Queue seed      PASS → Phase 3 Registry
PHASE 3  Usage Contract           IN PROGRESS (DQ all OPEN / UNDECIDED)

DOC CHAIN:
  Asset Contract → Usage Audit → Decision Registry → Usage Contract
  → Implementation (APPROVED DQ only)

ASSET CONTRACT: UNCHANGED (v1.0 FROZEN)
CODE MODIFICATION: 0

NEXT:
  Phase 3 — DQ-001부터 순서 처리 (제품 결정)
  Target Asset 선기재 금지
```
