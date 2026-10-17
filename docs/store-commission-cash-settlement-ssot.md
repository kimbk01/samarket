# 매장 정산 · 수수료 · 매장 캐시 SSOT (감사 + 설계)

**상태:** 구현 완료 (코드·마이그레이션) — 운영 DB 적용 전  
**마이그레이션:** `supabase/migrations/20270510120000_store_commission_cash_ssot.sql`  
**계약 코드:** `lib/stores/commission/store-commission-contract.ts`  
**Writer:** `lib/stores/commission/store-commission-writer.ts`  
**Loader (Admin = Owner):** `lib/stores/commission/load-store-commission-ledger.ts`  
**UI (공용 컴포넌트):** `components/stores/commission/StoreCommissionLedgerParts.tsx`  
**테스트:** `lib/stores/commission/__tests__/store-commission-ssot.test.ts`

---

## 0. 한 줄 요약

DIBAY 는 **고객이 매장에 직접 결제**(COD·매장 GCash·계좌이체)하는 구조인데, 기존 정산은 **플랫폼이 돈을 받아 매장에 지급하는 배민식 "정산 지급" 모델**로 만들어져 있었다.
그래서 어드민이 "지급할 돈이 없는" 주문을 한 건씩 `정산(지급)` 처리하는 화면이 생겼고, 정작 플랫폼이 받아야 할 **수수료는 캐시에서 거의 차감되지 않고 있었다.**

---

## 1. 감사 결과 (2026-10-17, 운영 DB 읽기 전용 집계 + 코드)

| # | 질문 | 감사 전 실제 동작 | 근거 |
|---|---|---|---|
| A1 | 조리 시작 시 수수료가 캐시에서 자동 차감되는가? | **아니오.** 차감 시점은 `completed`(주문 완료) 뿐이었고, 그마저 env `DIBAY_CURRENCY_SALE_RECOGNITION_LIVE` 가 켜져야 실행. 운영: 완료 519건 중 수수료 차감 12건. 최근 완료 주문(9/28, 10/12)은 차감 0 → **플래그 꺼짐** 상태로 판단 | `apply-store-order-status-transition.ts`(completed 분기), `recognize-order-currency-on-completed.ts` |
| A2 | 어드민 정산 = 주문 하나하나 "정산" 클릭? | **예.** `store_settlements` 가 완료 주문마다 `scheduled` 로 생성되고, 어드민이 건별로 `paid/held/processing` 을 PATCH. 운영: `scheduled` **501건 / ₱3,119,420** 이 "지급 예정" 으로 쌓임 (실제로는 매장이 이미 현금으로 받은 돈) | `ensure-store-settlement.ts`, `api/admin/store-settlements/[id]` |
| A3 | 캐시 잔액이 없어도 주문이 들어오는가? | **예. 아무 차단이 없다.** 주문 생성·노출·수락 어디에서도 캐시/미납을 읽지 않는다. 레거시 `point_commerce_blocked` 는 writer 가 폐기되어 항상 false | `validate-store-order-checkout.ts`, `store-point-commerce-block.ts` |
| A4 | 모자란 부분이 (-) 마이너스로 처리되는가? | **잔액 컬럼은 0 미만 불가**(CHECK). 부족분은 `store_sale_fee_obligations` 에 미납(open)으로 남고, 충전·Coin 전환 시 오래된 순으로 자동 정산된다. 즉 회계상으로는 "잔액 − 미납" 이 실질 마이너스인데 **화면 어디에도 순잔액(마이너스)이 표시되지 않았다** | `20261202120000_currency_cut_d_sale_fee_obligation.sql` |
| A5 | 이후 주문부터 비활성화되는가? | **아니오** (A3) | — |
| A6 | 취소·환불 시 빠진 수수료가 정확히 돌아오는가? | 환불(`refunded`)은 **자동 전액 환급**(`reverse_sale_fee_for_order`): 실제 차감된 금액은 캐시로 복원, 미납은 취소. 정확하지만 **수동 판단 여지 없음**. 취소(`cancelled`)는 차감 전이라 영향 없음. 요청하신 "취소·환불은 수동 처리" 와 불일치 | `apply-store-order-status-transition.ts`(refunded 분기) |
| A7 | 어드민 정산과 오너 정산이 일치하는가? | 같은 테이블이지만 **표시가 불일치**: ① 어드민 "플랫폼 수수료" = 정률+고정(배달수입·환급 미반영), 오너 = 정률+고정+배달수입−환급 ② "미지급" 집계 범위 다름 ③ 오너 배달수입 칸 항상 0 ④ 오너 목록 500건 절단 | `aggregate-settlement-ops.ts`, `summarize-owner-store-settlements.ts` |
| A8 | (추가 발견, P0) 매출 Coin 이중 지급 위험 | 완료 시 `sale_coin` 으로 **payment_amount 전액**을 출금 가능한 Coin 으로 적립. 매장은 고객에게 이미 현금을 받았으므로 **플래그를 켜는 순간 매장에 매출을 두 번 지급**. 운영: SALE_EARN 15건 중 주문과 매칭되는 9건(전부 COD)에 11,750 Coin 적립 — 이 중 **8,750 은 고객 직접 결제분(과다 적립)**, 3,000 만 플랫폼 보유분 | `confirmed-sale-revenue.ts`, `credit_coin_from_confirmed_sale` |

---

## 2. 배민 · 요기요 · 쿠팡이츠 정산 방식과 DIBAY 의 차이

| 항목 | 배민 / 쿠팡이츠 / 요기요 (온라인 결제) | 만나서결제(현장결제) 건 | **DIBAY** |
|---|---|---|---|
| 돈의 흐름 | 고객 → **플랫폼(PG)** → 수수료 공제 후 매장 지급 | 고객 → **매장**. 플랫폼은 수수료를 별도로 회수 | 고객 → **매장** (COD·매장 GCash·계좌이체 100%) |
| 수수료 회수 | 정산금에서 **자동 공제** (중개이용료·결제수수료·배달비·VAT) | 다른 온라인 정산금에서 **상계**, 부족하면 이월·청구 | 정산금이 없음 → **선불 캐시에서 자동 차감**이 유일한 방법 |
| 정산 실행 | 일 단위 자동 집계 → 영업일 기준 D+3(배민)·D+4(쿠팡이츠) 자동 지급. **주문 건별 수동 승인 없음** | 상계 자동 | 지급 대상 자체가 없음 → **건별 "정산" 버튼이 존재하면 안 됨** |
| 수수료 인식 시점 | 주문 처리 시 인식, 취소 시 미부과 | 동일 | 요청: **조리 시작 시** (취소 노쇼 방지 → 접수 후 조리 들어간 순간 확정) |
| 취소·환불 | 플랫폼 정책에 따라 정산서에서 조정(다음 정산에 반영). 플랫폼 장애 등 예외는 운영 판단으로 보상 | 동일 | 조리 후 취소·환불 → **관리자가 환급 여부 결정**(매장 귀책이면 유지) |
| 잔액 부족 | 정산금 마이너스 → 다음 정산에서 차감 이월 | 미수금 청구 | **순잔액 마이너스 표시 + (정책 ON 시) 신규 주문 차단**, 충전 시 미납 우선 정산 후 자동 재개 |

> 업계 공통 원칙 3가지를 DIBAY 에 적용했다:
> 1. **정산은 자동** — 사람이 건별로 누르는 단계가 없다.
> 2. **수수료는 주문 단위 원장(1주문 1행, 멱등)** 으로 남고, 집계는 원장에서만 계산한다.
> 3. **예외(취소·환불)만 사람 판단** — 판단 결과도 원장에 기록되어 매장에 그대로 보인다.
>
> 참고 자료: 배민 정산 주기 3영업일(부산일보 2022), 쿠팡이츠 매출일+4영업일 정산·취소 주문 보상(헤럴드경제·뉴스핌 2026-10), 배민·쿠팡이츠 수수료 구조(전자신문/디지털데일리 2025). 공식 사장님 사이트(ceo.baemin.com 등)는 이 환경에서 접속이 차단되어 기사·공개 계산기 자료로 교차 확인함.

---

## 3. 목표 설계 (구현됨)

### 3.1 상태 × 돈 이동 표 (SSOT)

| 이벤트 | 돈 이동 | 비고 |
|---|---|---|
| 접수 `pending → accepted` | 없음 | 접수 후 조리 전 취소는 수수료 0 |
| **조리 시작 `accepted → preparing`** | **수수료 = 정책(정률·고정·배달수입) × 기준액** 을 캐시에서 차감. 캐시 부족분 → 미납(open) | 키 `sale_fee:order:{id}` 1주문 1회. 정책·금액은 이 순간 `fee_snapshot` 으로 동결 |
| 완료 `completed` | 수수료: 안전망 재호출(같은 키 → 중복 0) · Coin: **플랫폼 보유분(상품권 사용액 + 플랫폼 부담 쿠폰)만** 적립 | 고객 직접 결제분은 Coin 미적립 (A8 수정) |
| 조리 후 `cancelled` / `refunded` | **자동 환급 없음** → `adjustment_status = review_required` | 어드민 액션센터 "수수료 검토" 큐 |
| 어드민 "수수료 환급" | 실제 차감액 → 캐시 복원(`SALE_FEE_REVERSAL`), 미납분 → 취소 | 사유 필수, 단일 트랜잭션 RPC |
| 어드민 "환급 안 함" | 이동 없음, 미납이 있으면 계속 청구 | 사유 필수 (매장에도 표시) |
| 캐시 충전 승인 / Coin→캐시 전환 | 가장 오래된 미납부터 자동 정산 | 기존 `settle_store_sale_fee_obligations` |

### 3.2 마이너스 처리와 주문 차단

- **잔액 컬럼은 그대로 0 이상**(원장 무결성: `amount_minor` = 실제 이동액).
- **순잔액 = 캐시 잔액 − 미납 합계** → 부족하면 정확히 마이너스. Admin·Owner 모두 이 값을 `-₱38.00` 형태로 표시.
- 주문 차단 정책 `admin_settings.store_cash_order_gate`:
  - `off` (기본): 마이너스여도 주문 접수 — 배포 즉시 전 매장이 막히지 않도록.
  - `block_when_not_positive`: **순잔액 ≤ 0 이면 신규 주문 거부.** 어드민 정산 화면 상단 토글로 전환(감사 로그 기록).
- 차단의 권한은 DB: `store_orders` **BEFORE INSERT 트리거** → `store_cash_insufficient`. 체크아웃 API 의 사전 확인은 친절한 오류용일 뿐.
- 이미 들어온 주문은 계속 처리(조리 시작 시 미납으로 쌓임). 충전 → 미납 정산 → 순잔액 > 0 이 되는 즉시 자동 재개(별도 해제 작업 없음).
- 고객에게는 매장 재무 정보를 노출하지 않고 "지금은 준비 중이라 주문할 수 없습니다" 문구.

### 3.3 Admin = Owner 일치

- 한 loader(`loadStoreCommissionLedger`), 한 summary(`summarizeStoreCommissionRows`), 한 상태 함수(`resolveStoreCommissionRowState`), 한 컴포넌트 세트.
- 검증식: **부과 = 캐시 차감 + 미납 + 캐시 환급 + 미납 취소** (화면 하단에 ✓ 표시). 환급 후에도 원래 부과액(`original_fee_due_minor`)이 보존되어 계산이 맞는다.

### 3.4 UI / UX / CTA

| 화면 | 구성 | CTA |
|---|---|---|
| 어드민 `/admin/store-settlements` (배달 → 정산) | 정산 규칙 4줄 · 차단 정책 토글 · 매장별 캐시 현황(잔액/미납/순잔액/접수 가능·차단, 순잔액 오름차순) · 수수료 합계 · 상태 칩 필터(전체/검토 대기/미납/차감 완료/환급/환급 없음) · 주문별 원장 | **검토 대기 행에만 `수수료 처리`** (환급 / 환급 안 함 + 사유). 건별 지급 버튼 없음 |
| 오너 `/stores/owner/settlements` | 캐시·수수료 현황(같은 카드) · 합계 · 주문별 수수료 | `캐시 충전` · `주문 관리` (조회 전용) |
| 액션센터 | "수수료 검토 (취소·환불)" 카드 — `review_required` 건수 | `/admin/store-settlements?state=review_required` |

### 3.5 폐기한 것

- `PATCH /api/admin/store-settlements/[id]` (건별 paid/held/processing) → **410 `settlement_payout_retired`**.
- 운영 콘솔의 정산 보류/지급 모달·버튼.
- 구 `AdminStoreSettlementsPage.tsx`.
- `store_settlements` 테이블은 **완료 주문의 수수료 스냅샷(재무제표·리포트 호환)** 으로만 유지. 조리 시작 때 동결된 정책을 그대로 사용하도록 변경.

---

## 4. 운영 적용 순서 (배포 체크리스트)

1. 마이그레이션 `20270510120000_store_commission_cash_ssot.sql` 적용 (차단 정책 기본 `off`).
   - 이미 취소·환불됐는데 수수료가 살아 있는 건은 **검토 큐로만 이동**(돈 이동 없음).
2. 웹 배포 (네이티브 변경 없음).
3. 어드민 정산 화면에서 매장별 순잔액 확인 → 매장에 충전 안내.
4. 준비되면 정책을 `순잔액 0 이하이면 신규 주문 차단` 으로 전환 (확인창에 즉시 차단될 매장 수 표시).
5. 기존 `scheduled` 501건은 "지급 대상"이 아니다(매장 직접 수령). 화면에서 사라졌으며 데이터는 재무제표 호환용으로 남는다.
6. `DIBAY_CURRENCY_SALE_RECOGNITION_LIVE` 는 이제 **플랫폼 보유분 Coin 적립에만** 영향. 수수료 차감은 플래그와 무관하게 동작.

## 5. 범위 밖 / 후속

- 기존 과다 적립 Coin(COD 9건, 8,750 Coin)의 회수 여부 — 출금·전환 여부 확인 후 운영 판단 필요(자동 회수하지 않음).
- 매장 목록/상세에 "일시 주문 불가" 배지 노출(현재는 체크아웃 시점 차단).
- 부분 환불 (현재 계약: 전액 환불만).
