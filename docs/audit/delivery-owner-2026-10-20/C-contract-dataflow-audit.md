# 문서 C — 계약·데이터 흐름 감사서 (주문자 ↔ 매장 ↔ 관리자 ↔ 배달 주체 ↔ 금전)

- 감사일 2026-10-20 (PHT) · HEAD `8c151baa` · 운영 DB 읽기 전용.
- 결함 ID 는 문서 D. 근거 원문은 appendix.

## 0. 현행 계약의 전제 (코드·DB 로 확정)

| 항목 | 확정 내용 | 근거 |
|---|---|---|
| 결제 | 고객은 **매장에 직접 결제**(COD·매장 GCash·계좌). 플랫폼은 `payment_amount` 를 보유하지 않음 → **주문별 정산 지급 없음** | `docs/store-commission-cash-settlement-ssot.md`, appendix/FIN §0 |
| 플랫폼이 실제 보유하는 돈 | 상품권 사용액 + 플랫폼 부담 쿠폰 금액뿐 | appendix/FIN §0 |
| 수수료 | 조리 진입 시 DB 트리거가 1회 부과, 매장 **캐시**에서 차감, 부족분은 미납(`store_sale_fee_obligations`) | 동 문서 §A — **운영 트리거 비활성(P0-5)** |
| 자산 | **POINT**(회원 지갑, `user_id`) / **COIN**(매장, 정수, 출금 가능, 충전 불가, 음수 허용) / **CASH**(매장, centavo, 충전 가능, 출금 불가, CHECK ≥0) — 서로 다른 테이블·작성자 | appendix/FIN §0 |
| 배달 주체 | 실질 **매장 자체배달**(오너가 주문 상태를 바꿈). 라이더 체계는 코드만 있고 `delivery_riders` 0행 | appendix/ORD DLV-01 |
| 서비스 지역 | 직선거리(haversine), 반경 NULL=10km, V2(LGU 지역) 병행. 모든 진입점이 `evaluateDeliveryServiceArea` 단일 사용, 최종 배송 주소 = 회원 기본 주소 | appendix/LOC §2 |
| 1계정 1매장 | DB UNIQUE INDEX 로 강제 | appendix/ACC-OPS §2 |

## 1. 주문자 ↔ 매장: 상품 등록부터 완료까지

| 단계 | 권위 원천 | 주문자·매장이 같은 값을 보는가 | 실패 시 책임 | 판정 |
|---|---|---|---|---|
| 1 상품 등록 | `store_products` (오너 API) | — | — | **FAIL** — 오너가 REST 로 검수·판매권한 우회(P0-2), 반려 상품 재판매(PRD-03) |
| 2 주문자 노출 | 메뉴 스냅샷 캐시 | 오너 변경이 다른 인스턴스에 20~60초 늦게 반영(OPS-02), 숨김 카테고리 상품이 상세·주문 API 로 노출(PRD-05) | — | 부분 FAIL |
| 3 장바구니 | 클라 계산 | 상세·장바구니 사전 판정과 체크아웃 경계 차이(LOC-010) | 주문 시 서버 재검증 | PASS(서버가 최종) |
| 4 주소·서비스 지역 | `evaluateDeliveryServiceArea` | 모든 화면 같은 함수 | — | PASS, 단 설정 조회 실패·정책 OFF 시 fail-open(LOC-003), 좌표 없는 배달 매장 9곳(LOC-005) |
| 5 결제·주문 생성 | `create_store_order_atomic` (단일 트랜잭션: 매장 상태·가격·옵션·재고·쿠폰·상품권·최소주문) | 서버 재계산, 클라 가격 불신 | `price_changed` 반환 | PASS. 단 픽업/배달 플래그·자동 영업시간 미재검증(OPS-08), 검수 상태 미검사(PRD-03), 판정 스냅샷 미저장(LOC-004) |
| 6 매장 접수 | `applyStoreOrderStatusTransition` (CAS) | Realtime + 푸시 | 매장 | PASS. **접수 독촉 미가동(ORD-02), 타임아웃 없음(ORD-03)**, 목록 60건 한도로 대기 주문 비노출(ORD-05) |
| 7 준비(ETA) | `estimated_ready_at` | 수락 알림에 ETA 미포함(NTF-03), 수락 후 연장 불가(누락) | 매장 | 부분 FAIL |
| 8 배달 | 주문 상태(자체배달) / `store_order_deliveries`(라이더) | 두 상태 미동기화(DLV-02), 장기 정체(DLV-03) | 매장 | FAIL |
| 9 완료 | 오너 완료 또는 자동 구매확정 | 자동 확정 크론 미등록 → 영구 미완료 가능(ORD-02) | 시스템 | FAIL |
| 10 수수료·Coin·상품권 매출 | 트리거 3종 + TS 후처리 | 수수료 트리거 비활성(P0-5), 상품권 금액 3원천 모순(FIN-03) | 플랫폼 | FAIL |

### 취소·환불의 양측 일치

| 경로 | 원자성 | 주문자 표시 | 매장 표시 | 판정 |
|---|---|---|---|---|
| 접수 전 구매자 취소 | CAS | 일치 | 일치 | PASS |
| 진행 중 구매자 취소 요청 | DB 함수(원장+상태 1 TX, 픽업 잠금) | 일치 | 일치 | PASS |
| 매장 결정(승인/반려) | 상태 CAS 후 원장 별도(ORD-06) | 일치 | 원장 pending 잔존 가능 | 부분 FAIL |
| 매장 직접 취소 | 상태 후 원장 별도, 사유 미전달(ORD-06/09) | **사유 없음** | 사유 있음 | FAIL |
| 관리자 개입 | 사유·감사 있음, CAS 기대값 미전달(ORD-04) | 일치 | 반려 직후 덮어쓰기 가능 | 부분 FAIL |
| 환불 부수효과 | 상품권 환불 RPC 원자. 재고·쿠폰(ADS-21)·상품권 복원(GFT-05)·Coin 역분개(FIN-05)는 커밋 후 별도 | — | — | 부분 FAIL |
| 부분 취소·부분 환불 | 제품 정책상 미지원(`partialRefundSupported:false`) | — | — | 누락(정책) |

## 2. 매장 ↔ 플랫폼 관리자

| 계약 항목 | 관리자 조치 경로 | 사유·이력 | 오너 우회 가능성 | 판정 |
|---|---|---|---|---|
| 입점 승인·반려·보완·정지 | `app/api/admin/stores/[id]` 전이표 + 조건부 UPDATE + 감사 | 있음 | **REST 로 `approval_status` 직접 변경(P0-1)** | FAIL |
| 판매권한 | `store_sales_permissions` (관리자 전용 RLS) | 있음 | 매장 정지가 판매권한을 바꾸지 않음(ACC-01 연동) | 부분 |
| 사업자 서류 | 없음 (`store_business_verifications` 0행) | — | 오너 UPDATE 정책이 자기 승인 허용(ACC-05) | 누락 |
| 상품 검수 | 관리자 상품 ops | 있음 | REST 자기 승인(P0-2), 수정→active(PRD-03) | FAIL |
| 상품 가격 정정 | `correct_price` | 있음 | — | 할인가 미검증(PRD-04) |
| 주문 개입·취소 | 개입 서비스(사유·감사·expected_status) | 있음 | — | CAS 미전달(ORD-04) |
| 수수료 정책 | super_admin + 원자 교체 + 감사 | 있음 | — | PASS (기존 DEF-1~3 해소) |
| 수수료 환급 결정 | `admin_decide_store_commission_adjustment` | 불변 원장 | — | PASS. 트리거 비활성으로 검토 대상이 생기지 않음(P0-5) |
| 캐시 충전 승인 | `approve_business_cash_charge_request` | 감사 로그만 | 입금 증빙 없음·자기 매장 승인 금지 없음(FIN-04) | FAIL |
| Coin 출금 지급 | `coin_withdrawal_mark_paid`(참조번호 필수) | 있음 | 정지 매장도 출금 요청 가능(IA-03) | 부분 |
| Cash/Coin 정정 | **없음** | — | — | 누락(FIN-08) |
| 광고 승인·반려 | `*_transition` RPC | 있음 | 기간·인벤토리 PATCH 후 저가 과금(ADS-02), 관리자 API 권한키 없음(ADS-08) | FAIL |
| 쿠폰 통제 | 관리자 일시정지 | 있음 | 오너가 재개·상태 덮어씀(IA-04) | FAIL |
| 상품권 | 관리자 상품 생성·중지·유효기간 | 있음 | `redemption_reverse` 상태 가드 없음(GFT-01) | 부분 |
| 매장 위치·서비스 지역 | 관리자 override + 오너 편집 | 오너 변경 감사 없음(LOC-007) | **타 매장 지역 교체(P0-3)**, REST 좌표·반경 변경(P0-1) | FAIL |

**같은 데이터의 서로 다른 표현인가?**

| 화면 쌍 | 원천 | 판정 |
|---|---|---|
| 오너 `/settlements` ↔ 관리자 `/admin/store-settlements` | 같은 SQL 함수(`store_commission_ledger_page` 등) | 일치 |
| 오너 `/finance` 미납 합계 ↔ 정산 화면 | TS 집계 vs `store_cash_position` | 이원(FIN-11) |
| 관리자 일별·매장 재무제표 ↔ 수수료 원장 | 레거시 `store_settlements` vs `store_sale_fee_obligations` | **다른 원천**(FIN-07) |
| 오너 주문 목록 ↔ 관리자 주문 목록 | 오너 RPC(60건) vs 관리자 서버 페이지 | 노출 범위 다름(ORD-05) |
| 오너 주문 상세 ↔ 구매자 상세 ↔ 관리자 상세 | 모두 `store_order_items` 스냅샷 | 일치 |
| 오너 영업 카드 ↔ 구매자 영업 표시 | `is_open` 원값 vs 실효 스케줄 | 다름(OPS-04) |

## 3. 주문자 ↔ 매장 ↔ 배달 주체

| 상태 | 구현 | 전환 권한 | 판정 |
|---|---|---|---|
| 주문 상태(자체배달 경로) | `ready_for_pickup → delivering → arrived → completed` | 오너(전이표), SYSTEM 자동확정(**미가동**) | 동작, 정체 다수(DLV-03) |
| 배달 요청·배정 | `waiting_rider → rider_assigned` | 라이더 API | 코드만, 라이더 0 (DLV-01) |
| 픽업·이동·도착 | `pickup_in_progress → delivering → delivered` | 라이더 / 오너 배달 PATCH(POD 없이 delivered 가능, CAS 없음) | 주문 상태와 미동기화(DLV-02) |
| 배달 실패·재배달 | `delivery_failed` | 라이더 | 주문 취소 시 배달 행 미종료(DLV-02), 재배달 흐름 없음 |
| 실시간 위치 추적 | 라이더 위치 POST 만, 구매자·오너 UI 없음 | — | **미구현** |
| 외부 배달 | `/api/webhooks/external-delivery` (시크릿 + SYSTEM 전이) | 외부 | 코드 존재, 운영 사용 NOT_PROVEN |

결론: 현행 계약상 배달 주체는 **매장**이다. 라이더 모델은 존재하지 않는 운영 모델로 보고 설계 제안(문서 F 결정 D-6)으로 분리한다.

## 4. 금전 계약 — 주문별 금전 매트릭스

| 항목 | 보관 위치 | 상태 |
|---|---|---|
| 주문 금액(상품+옵션+배달비) | `store_orders.total_amount` | 있음 |
| 할인 합계 / 매장 부담 / 플랫폼 부담 | `discount_amount` / `store_funded_amount` / `platform_funded_amount` | 있음. 분할은 TS 계산, DB 미검증(ADS-22). 플랫폼 부담분 지급 레일 없음(FIN-03) |
| 상품권 사용액 / 상품권 수수료 / 매장 순액 | `gift_redemption_amount` / `gift_certificate_redemptions.platform_fee_amount` / `.merchant_net_amount` | 있음. Coin 적립은 총액(FIN-03) |
| 고객 결제액(매장 직접 수령) | `payment_amount` (배달비 포함) | 있음 |
| 배달비 | `delivery_fee_amount` (매장 수령) | 있음. 픽업 주문 19건에 배달비 부과(LOC 범위 밖 관찰, 2026-08-08) |
| 수수료 기준액 | `store_sale_fee_obligations.confirmed_revenue_php` (레거시 `commission_base_amount` 49건 불일치) | 이원. 배달비·상품권 포함이 문서에 없음(FIN-13) |
| 수수료 부과·납부·미납 | `store_sale_fee_obligations` | 있음 — **트리거 비활성(P0-5)** |
| 수수료 캐시 차감 | `business_cash_ledger` SALE_FEE / SALE_FEE_SETTLEMENT | 있음. 상계 키 충돌(FIN-02) |
| 수수료 환급 | `store_commission_adjustments` + SALE_FEE_REVERSAL | 있음. 레거시 스냅샷도 TS 가 수정(FIN-06) |
| 광고비 | `business_cash_ledger` AD_SPEND (캠페인 단위), `delivery_ad_order_attributions` | 주문 단위 연결 없음 |
| Coin 적립·역분개 | `store_economic_point_ledger` `sale_coin:{order}` / `coin_reversal:order:{order}` | 있음. 과거 과다 8,750(GFT-02), 비원자 역분개(FIN-05) |
| 고객 환불 금액 | **컬럼 없음** (전액 환불만) | 금액 필드 없음 |
| 매장 정산 지급 | 개념 없음. 레거시 `store_settlements` scheduled 501건 ₱3,119,420 = 지급 의무 아님 | 레거시 잔존, 용어 충돌(IA-13) |
| 플랫폼 원장(수익) | 통합 테이블 **없음** — 수수료 = obligations 합, 상품권 수수료 = redemptions 합 | 통합 원장 없음 |

### 원장 대조 결과 (운영 집계)

| 검사 | 결과 |
|---|---|
| Cash 잔액 = 원장 합 | 2계정 중 **1곳 −₱225 불일치** (SALE_FEE 체인 09-01~09-07 단절) — 정정 경로 없음(FIN-08) |
| Coin 잔액 = 원장 합 | 일치 |
| 원장 멱등키 중복 / NULL | 0 / 0 |
| 음수 Cash | 0 |
| 주문당 수수료 의무 중복 | 0 |
| 조리 이후 상태인데 의무 없음 | 528건 (대부분 SSOT 이전 주문) — 최근 40일 갱신 4건 포함 |
| 광고 펀딩 ↔ Cash 원장 | 1:1 일치 (지출 2,259,400 / 환불 580,400 minor) |
| 광고 미심사 만료 펀딩 | 4건 ₱480 미환불(ADS-01) |
| 상품권 역처리인데 주문 미취소 | 7건(GFT-01) |
| Coin 과다 적립 | 9건 8,750 Coin(GFT-02) |
| 레거시 `stores.point_balance` | 14곳 합 77,217,484 — 부채/소멸 미정 |

**금액이 맞아도 결함으로 분류한 항목**: 수수료 트리거 비활성(원장 자체가 생기지 않음), 플랫폼 보유분 지급 레일 부재(지급 책임 미정), 환불 시 Coin·쿠폰·상품권 역거래가 상태 트랜잭션 밖, Cash 정정 경로 부재.

## 5. 필수 예외 시나리오 판정

| 시나리오 | 판정 | 근거 |
|---|---|---|
| 동시 주문·동시 저장 | 주문 PASS(CAS·UNIQUE) / 상품 저장 FAIL(PRD-07) / 지역 교체 FAIL(LOC-006) | ORD, PRD, LOC |
| 중복 결제·중복 환불 | 주문 PASS(`client_order_key`) / 환불 부수효과 2회(NTF-05, 금전 중복 없음) / 충전 재시도 중복 FAIL(FIN-04) | ORD, FIN |
| 네트워크 중단·타임아웃 | 금전 CTA 키 재생성 FAIL(FIN-04) / 광고 신청 PASS(clientRequestId 고정) | IA, ADS |
| 접수 중 영업 종료 | PASS — 주문 RPC 가 매장 행 잠금 후 `is_open` 재확인. 자동 영업시간·플래그는 미재검증(OPS-08) | ACC-OPS |
| 주문 중 가격·옵션·주소 변경 | 가격·옵션 PASS(서버 재계산·스냅샷) / 주소: 최종 주소 = 기본 주소, 판정 스냅샷 미저장(LOC-004) | PRD, LOC |
| 서비스 지역 경계 | 사전 판정 vs 체크아웃 경계 차이(LOC-010), fail-open(LOC-003) | LOC |
| 승인·취소 상태 경합 | 오너 PASS / 관리자 FAIL(ORD-04) / 파트너 광고 FAIL(ADS-03) | ORD, ADS |
| 정산 확정 후 환불 | 주문별 지급 없음 → 수수료는 관리자 결정 원장으로만 환급(PASS), 단 트리거 비활성으로 검토 대상 미생성 | FIN |
| 광고비·코인·캐시 중복 차감 | 원장 멱등 UNIQUE PASS / 상계 키 충돌로 정상 거래 실패(FIN-02) | FIN |
| 상품권 중복 사용 | PASS(행 잠금) / 역처리 상태 가드 없음(GFT-01) | ADS-GFT |
| 매장 정지 후 API 직접 호출 | 주문 생성 PASS(RPC 차단) / 오너 쓰기 FAIL(IA-03) / **REST 로 정지 해제 P0-1** | IA, ACC |
| 다른 매장 데이터 접근 | 주문·상품·정산 PASS / **배달 지역 P0-3**, **Storage 삭제 P0-4** | LOC, PRD |
| 관리자와 오너 동시 변경 | 쿠폰 FAIL(IA-04) / 상품 FAIL(PRD-07) / 주문 FAIL(ORD-04) | IA, PRD, ORD |
