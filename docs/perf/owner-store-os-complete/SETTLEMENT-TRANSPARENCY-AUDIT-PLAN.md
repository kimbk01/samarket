# DIBAY — Admin · Owner Admin 정산 투명성 감사 & 계획

**MODE:** AUDIT + PLAN ONLY (구현 없음)  
**Date:** 2026-09-06  
**Authority:** 주문별 매출·수수료·net·Cash 잔액·Coin 전환 시각이 사람·CTA로 명확해야 함

---

## A. 한 줄 결론

- **주문 정산 축(gross / 수수료 / net / 지급상태)** 은 Admin·Owner가 **동일 SSOT** (`loadStoreSettlementFinancialFacts` → `store_settlements`)로 이미 강함.
- **Cash 잔액·Coin→Cash 전환** 은 Finance/Cash 축으로 **분리**되어 있고, **주문 한 줄에서 끝까지 이어지는 스토리보드(매출→수수료→net→Cash/Coin 영향→전환 시각)** 는 **없다**.
- 사용자가 묻는 「이익」「Cash 발란스가 남은 이유」「언제 Coin이 전환됐는지(주문과 연결)」는 제품 정의·UI 연계가 **부분만** 있고, 투명성 요구 대비 **공백**이 있다.

---

## B. 돈의 축 (혼동 금지)

| 축 | 의미 | Owner 표면 | Admin 표면 |
|---|---|---|---|
| **PHP 주문 정산** | 완료 주문 스냅샷: 매출−수수료−…→지급 net | `/stores/owner/settlements` | `/admin/store-settlements` |
| **Coin (매장)** | 판매 적립 등 포인트 원장 | `/stores/owner/finance` | `/admin/finance` · store-finance |
| **Cash (매장)** | 광고·수수료 납부 등 운영 캐시 | Finance + `#cash-manage` | `/admin/delivery-ads/cash-charges` · Finance CP |
| **판매수수료 의무** | 미납 fee obligation | Finance 합계만 | Finance CP + statement |

**규칙(KEEP):** Point ≠ Coin ≠ Cash ≠ PHP settlement 잔액 병합 금지.

---

## C. 사용자 질문 ↔ 현재 코드

| 질문 | Owner | Admin | 판정 |
|---|---|---|---|
| 어떤 주문의 **얼마 매출(gross)** | Settlements 행 `gross_amount` | 동일 + buyer | **충족** |
| **얼마 수수료** 빠짐 | `platform_fee` + fixed + rate 라인 | 동일 + policy snapshot | **충족** |
| **얼마 net / 지급** | `net_settlement_amount` 히어로 | 동일 + paid/held CTA | **충족** |
| **얼마 이익(profit)** | 없음 (원가 SSOT 없음) | 없음 | **미정의** |
| **Cash 잔액이 얼마 남았는지** | Finance Cash 카드 + 원장 | store-finance / statement | **잔액·원장 충족** |
| **그 Cash가 이 주문과 어떻게 연결되는지** | 주문↔Cash impact 없음 | 주문 중심 타임라인 없음 | **공백** |
| **언제 Coin이 전환됐는지** | CONVERT_* 원장 + 시각 | CP/statement 이력 | **전환 이벤트 충족** |
| **전환이 어느 주문/적립과 연결인지** | related_id/order 미노출 | 동일 한계 | **공백** |

**Net 식 (SSOT):**  
`gross − platform_fee − fixed_fee − store_funded − refund − delivery_income`  
(`lib/stores/store-order-financial-fact.ts`)

---

## D. Owner Admin 감사 요약

| 영역 | 상태 | 증거 |
|---|---|---|
| Settlements 주문별 gross/fee/net/status | KEEP | `OwnerStoreSettlementsView`, `GET /api/me/store-settlements` |
| Finance → 정산 CTA | KEEP | `data-owner-finance-settlements-cta` |
| Cash/Coin 잔액 서버 권위 | KEEP | `GET .../finance`, `business_cash_*` |
| Coin→Cash convert + quote | KEEP | `POST .../business-cash` `op: convert` |
| 요약 배달수익 셀 | REWORK | `mapFinancialSummaryToOwner` `deliveryIncome: 0` 고정 |
| 미납 수수료 주문별 목록 | REWORK | API `saleFeeObligations.rows` 있는데 UI 합계만 |
| Coin/Cash 원장 ↔ 주문 딥링크 | REWORK | ledger에 주문 링크 UI 없음 |
| Finance trunc vs Settlements round | REWORK | 표기 불일치 |
| Profit | NEED_PRODUCT | 정의·원가 없음 |
| 주문별 Cash impact | NEED_PRODUCT | Cash≠정산 축 |
| 기간 축 UI (매출 vs 정산 vs 지급) | NEED_PRODUCT | API `period_basis` vs Owner UI 고정 |

---

## E. Admin 감사 요약

| 영역 | 상태 | 증거 |
|---|---|---|
| 주문 정산 금액 SSOT (Owner 공유) | KEEP | `loadStoreSettlementFinancialFacts` |
| 지급 확정 CTA + net 금액 오버레이 | KEEP | `PATCH /api/admin/store-settlements/[id]` |
| Finance CP (큐 합성, 잔액 병합 금지) | KEEP | `load-finance-control-plane.ts` |
| Coin→Cash Admin 실행 | KEEP(계약) | 이력만; 실행은 Owner |
| IA 분산 (Delivery 정산 / Ads Cash / Finance 허브) | REWORK or NEED_PRODUCT | 발견성 |
| Cash/Coin 승인 금액 재확인 모달 | REWORK | Settlement만 강함 |
| 주문 1건 end-to-end 머니 스토리보드 | NEED_PRODUCT | statement는 기간 단위 |

---

## F. 투명성 목표 (제품 문장)

오너·어드민이 **같은 주문**에 대해 아래를 **한 흐름**으로 읽을 수 있어야 한다.

1. 주문 식별 (order_no)  
2. 매출(gross)  
3. 빠진 수수료(종류·금액·적용율 스냅샷)  
4. 쿠폰/환불/배달 관련 차감(해당 시)  
5. 지급 net · 상태 · 지급일  
6. (정의 시) 이익  
7. 이 주문으로 생긴 Coin 적립 / 미납 수수료 의무  
8. Cash 잔액 변화와의 관계(해당 시)  
9. Coin→Cash 전환이 있었다면 **시각·금액·환율 버전**

지금은 **1–5는 Settlements로 대체로 가능**, **7–9는 Finance에 흩어짐**, **6·주문↔Cash/Coin 연결은 공백**.

---

## G. 계획 (구현 착수 전 — 승인 게이트)

### Phase 0 — 제품 결정 (코딩 금지까지)

| ID | 결정할 것 | 옵션 스케치 |
|---|---|---|
| P0-1 | **이익**을 노출할지 | (A) 미노출 유지 (B) gross−fee−store_funded 등 “운영 이익” 정의 (C) 원가 도입 후 진짜 이익 |
| P0-2 | **주문↔Cash** 스토리 | (A) “정산≠Cash” 카피만 강화 (B) 주문 상세에 Cash 무관 명시 (C) 특정 이벤트만 Cash 연동 |
| P0-3 | **주문↔Coin** | (A) SALE_EARN related_id 노출+딥링크 (B) 정산 행에 Coin 적립 금액 요약 |
| P0-4 | Admin IA | 정산·Cash·Finance를 Finance 허브로 모을지, 크로스링크만 할지 |

### Phase 1 — 투명성 REWORK (결정 후, shared SSOT만)

1. Owner: 미납 수수료 **주문별** 목록 CTA  
2. Owner: Coin/Cash 원장 **주문/관련 링크** (필드 있으면)  
3. Owner: 요약 `deliveryIncome` 0 버그/라벨 정리  
4. Owner/Admin: 금액 **반올림 표기 통일**  
5. Admin: Cash/Coin 승인 전 **금액 재확인** CTA  
6. Admin: Finance ↔ Settlements ↔ Cash queue **발견 링크**

### Phase 2 — 주문 중심 “정산 카드” (P0 승인 후)

- Admin·Owner 공통: 주문 1건 **머니 스토리보드** 패널 (정산 fact + obligation + coin earn + convert 이벤트 타임라인)
- 신규 잔액 축 발명 금지; 기존 ledger/settlement SSOT 조합만

### Phase 3 — 인간 증명

- Owner: 특정 주문 금액 대조 (gross/fee/net = DB)  
- Owner: Coin 전환 1건 시각·잔액  
- Admin: 동일 주문 대조 + 지급 CTA 금액  
- CLOSED 금지: 문서·Ready만으로 끝내지 않음

---

## H. 하지 말 것 (이번 감사)

- Shell/Product presentation과 정산 투명성 섞어 고치기  
- Cash와 PHP settlement 잔액 합치기  
- 제품 정의 없이 “이익” UI 발명  
- 광범위 리팩터·Admin ARO 전면 재설계

---

## I. 상태

`SETTLEMENT_TRANSPARENCY_AUDIT = COMPLETE`  
`IMPLEMENTATION = NOT STARTED`  
`NEXT = 제품 결정(P0) 승인 후 Phase 1만`
