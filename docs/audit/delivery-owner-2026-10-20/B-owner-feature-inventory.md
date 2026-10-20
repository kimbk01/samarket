# 문서 B — DIBAY 배달 오너 기능 전수 목록

- 감사일 2026-10-20 (PHT) · HEAD `8c151baa` · 운영 DB 읽기 전용.
- 라우트 원본 표(렌더 종류·storeId 해석·셸)는 `appendix/IA.md` §1-2, 도메인별 5계층 현황표는 각 appendix §2.
- 판정은 **코드·DB 기준**이다. 화면 런타임(오너·관리자 로그인)은 확인하지 않았으므로 모든 행의 "운영(화면)" 계층은 **NOT_PROVEN** 이다.

## 1. 조사 규모

| 대상 | 수 | 비고 |
|---|---|---|
| 오너 라우트 | 77 | 캐노니컬 `/stores/owner/**` 45 페이지 + Route Handler 1 + 레이아웃 2 + 레거시 `/my/business/**` 20·`/mypage/business/**` 4(리다이렉트 전용) + 슬러그 `/stores/[slug]/owner/**` 3 |
| 오너 API 핸들러 파일 | 61 | `app/api/me/stores/[storeId]/**` 48 + `/api/me/stores` + 쿠폰·광고·팝업·이벤트·알림·고객센터 |
| 관리자 연동 API·화면 | 약 60 | 매장 심사·주문 개입·재무·광고·상품권·수수료 정책 (도메인 appendix §1) |
| 운영 DB 함수(정의 확인) | 90+ | 주문·수수료·캐시·Coin·광고·쿠폰·상품권·서비스 지역 |
| 운영 DB 테이블 | 80+ | 정책·권한·트리거·제약 조회 |
| 도메인 기능 행(5계층 판정) | 174 | 아래 §3 집계 |
| 결함 | 120 (중복 통합 후) | 문서 D |

## 2. 메뉴 → 화면 → 기능 → API → DB → 권한 → 상태

현행 메뉴 단일 정의: `lib/business/owner-nav-registry.ts` (하단 5탭·드로어 23항목·고객 허브·관리 허브). 메뉴 구조와 제안 IA 는 문서 E.

| 드로어 그룹 / 항목 | URL | 주요 기능 | 주요 API | 원천 DB | 서버 권한 | 상태 (결함 ID) |
|---|---|---|---|---|---|---|
| 운영 / 대시보드 | `/stores/owner` | 오늘 주문·대기·캐시·알림 요약, 매장 선택 | `/api/me/stores`, owner navigation summary | `stores`, `get_owner_store_ops_dashboard_snapshot` | 로그인 + 소유 | 동작. 보완요청 매장 CTA 차단 **IA-01(P1)** |
| 운영 / 주문 관리 | `/stores/owner/orders` | 신규·진행·완료·취소 탭, 접수(조리시간)·단계 진행·취소요청·결정 | `GET/PATCH /api/me/stores/[id]/orders/[orderId]`, `/cancel-request`, `/decide`, `/delivery` | `store_orders`, `store_order_items`, `store_order_cancel_requests`, `store_order_deliveries` | 소유 + 전이표 + CAS | 전이 PASS. **60건 한도 ORD-05(P1)**, 원장 비원자 ORD-06, 사유 미전달 ORD-09 |
| 운영 / 영업·운영 상태 | `/ops-status` | 영업 on/off, 노출, 상태 요약 | `PATCH /api/me/stores/[id]` | `stores.is_open/is_visible` | 소유(+승인) | 실효 상태 미반영 OPS-04, 캐시 OPS-02 |
| 상품 / 상품 관리·등록·수정 | `/products`, `/products/new`, `/products/[id]/edit` | 등록·수정·삭제·품절·노출, 옵션 그룹, 이미지 | `/api/me/stores/[id]/products(/[productId])` | `store_products` (옵션 JSON), Storage | 소유 + 판매권한 | **Storage 삭제 P0-4**, **직접 쓰기 P0-2**, 반려 재판매 PRD-03, 동시성 PRD-07 |
| 상품 / 카테고리 | `/menu-categories` | 섹션 추가·수정·삭제·정렬·숨김 | `/api/me/stores/[id]/menu-sections` | `store_menu_sections` | 소유 | 숨김 우회 PRD-05, 정렬 비원자 PRD-11 |
| 고객 / 고객 응대 허브 | `/customer-care` | 문의·채팅·리뷰 진입 | — | — | 소유 | 동작 |
| 고객 / 주문 채팅 | `/order-chats`, `/order-chat/[orderId]` | 주문별 채팅방 | `/orders/[orderId]/ensure-chat` | `community_messenger_rooms` (`store_order:<id>`) | 구매자·오너 외 403 | PASS |
| 고객 / 매장 문의 | `/inquiries` | 답변·종료 | `/api/me/stores/[id]/inquiries/[inquiryId]` | `store_inquiries` | 소유 | **RLS 원문 수정 OPS-06**, 실패 무음 IA-16 |
| 고객 / 리뷰 관리 | `/reviews` | 답글 작성·삭제 | `/reviews/[reviewId]/reply` | `store_reviews` | 소유 | 집계 PASS, 삭제 확인 없음 IA-15 |
| 매장 / 기본 정보 | `/basic-info` | 상호·주소·좌표·연락처·소개 | `PATCH /api/me/stores/[id]` | `stores` | 소유 + 필드별 승인 | 이메일 소실 OPS-05, 지도 핀·감사 없음 LOC-007/ACC-06 |
| 매장 / 매장 설정 | `/profile` | 영업시간·최소주문·배달/픽업·배달비·반경·**배달 지역 V2** | `PATCH /api/me/stores/[id]`, `/delivery-service-areas` | `stores`, `store_delivery_service_areas` | 소유 | **IDOR P0-3**, 비원자 LOC-006, 휴무 미반영 OPS-03 |
| 매장 / 설정(관리 허브) | `/settings` | 노출·영업·메신저 기능 토글, 관리 링크 | `PATCH /api/me/stores/[id]` | `stores` | 소유 | 토글 피드백 IA-17, 진입점 중복 IA-12 |
| 정산 / Coin·캐시 | `/finance?section=` (거래·주문별·수수료/미납·Coin·Cash·광고지출·전환·출금) | 충전 신청, Coin→Cash 전환, Coin 출금, 원장 | `/business-cash`, `/finance`, `/finance/withdrawals` | `business_cash_*`, `store_economic_point_*`, `coin_withdrawal_requests` | 소유 | **충전 증빙·멱등 FIN-04(P1)**, 상계 키 FIN-02(P1), 탭 중복·용어 IA-12/13 |
| 정산 / 정산 | `/settlements` | 수수료·캐시 원장, 플랫폼 지급 의무 | `/commission-ledger(/cash-ledger,/payable)` | `store_sale_fee_obligations`, `business_cash_ledger` (관리자와 같은 SQL 함수) | 소유 | 조회 PASS. **트리거 비활성 P0-5**, 지급 레일 모순 FIN-03 |
| 프로모션 / 쿠폰 | `/coupons` | 캠페인 생성·일시정지·재개·종료·재발행 | `/api/me/store-coupons/campaigns` | `store_coupon_campaigns`, `store_coupon_redemptions` | 소유 | **부활·덮어쓰기 IA-04**, 재발행 중복 IA-05 |
| 프로모션 / 상품권 | `/gift-certificates?view=` | 판매 신청, 사용 내역, 매출 | `/gift-certificates/applications`, revenue | `gift_certificate_*` | 소유 | 역처리 데이터 **GFT-01(P1)**, 아카이브 조회 GFT-06 |
| 프로모션 / 배너 | `/banners` | 매장 배너 CRUD | `/api/me/stores/[id]/banners` | `store_banners` | 소유(승인 미검사) | Storage 삭제 패턴(P0-4 동반), IA-03 |
| 프로모션 / 공지 | `/notices` | 매장 공지 CRUD | `/api/me/stores/[id]/notices` | **`store_notices` 운영에 없음** | 소유 | **OPS-01** |
| 성장 / 광고 | `/ads`, `/ads/new/*`, `/ads/[id]`, `/ads/partner`, `/ads/popup/[id]`, `/ads/event-promotions` | 매장 홍보·배너·글로벌 팝업·파트너·이벤트 프로모션 신청·관리 | `/delivery-ads/**`, `/api/me/delivery-ads/partner`, `/api/me/platform-popup-requests`, `/api/me/event-promotion-requests` | `delivery_ad_*`, `business_cash_ledger` AD_SPEND | 소유 | **기간 잠식·미환불 ADS-01**, **가격 우회 ADS-02**, 파트너 경합 ADS-03, 이벤트 진입점 없음 IA-18 |
| 시스템 / 고객센터 | `/customer-care/customer-center` | 플랫폼 문의·쪽지 | `/api/me/admin-notes`, platform-inquiries | 사용자 단위 | 로그인 | NOT_PROVEN |
| 시스템 / 알림함·알림 설정 | `/notifications`, `/notification-settings` (+ 슬러그 사본 2) | 매장 알림, 푸시·소리 설정 | `/api/me/notifications`, `/api/me/owner-notification-settings` | `notification_events`, `owner_notification_settings(user_id)` | 사용자 단위 | 정체성 불일치 IA-14, `stores[0]` IA-08 |
| (드로어 밖) 입점 신청 | `/apply` | 신청·보완 | `POST /api/me/stores` | `stores` (1계정 1매장 UNIQUE) | 로그인 | 1인1매장 PASS. **RLS 직접 INSERT P0-1**, 재신청 불가 ACC-04, 서류 심사 없음 ACC-05 |

### 메뉴에 없는 연동 기능 (오너 관련 백그라운드)

| 기능 | 위치 | 상태 |
|---|---|---|
| 수수료 자동 부과 | 트리거 `trg_store_orders_commission_lifecycle` | **운영 비활성 P0-5** |
| 캐시 부족 주문 차단 | 트리거 `trg_store_orders_cash_order_gate` + `store_cash_order_gate`(현재 off) | 동작, 정책 미결 |
| 상품권 매출 인식 | 트리거 `trg_store_orders_gift_revenue_recognition` | 동작, 지급 레일 모순 FIN-03 |
| 자동 구매확정 / 접수 독촉 | `/api/cron/store-orders-auto-complete`, `/store-order-accept-reminders` | **스케줄 미등록 ORD-02(P1)** |
| 미접수 타임아웃·SLA | 없음 / `scan_store_order_sla_warnings`(pg_cron 전제) | **ORD-03(P1)** |
| 광고 일정 전이 | `/api/cron/delivery-ads-schedule-transitions` (등록됨) | 동작, 승인 지연 보상 없음 ADS-01 |
| 통화 인식 보정 | `/api/cron/store-currency-recognition-reconcile` (보고 전용) | 쓰기 모드 미승인 |
| 주문 알림 푸시 | `/api/cron/commerce-notification-push-handoff` (등록됨) | PASS(부분) |
| 라이더 배차·위치 | `/api/me/rider/**`, `delivery_riders`(0행) | 미운영 DLV-01 |

## 3. 기능 판정 집계 (도메인 appendix §2 기능 행 기준)

| 도메인 | 기능 행 | PASS (코드·DB) | FAIL (부분 포함) | NOT_PROVEN | 누락·정책 |
|---|---|---|---|---|---|
| 계정·입점·매장 운영 (ACC-OPS) | 25 | 7 | 12 | 1 | 5 |
| 상품·메뉴 (PRD) | 28 | 13 | 13 | 0 | 2 |
| 위치·서비스 지역 (LOC) | 16 | 7 | 7 | 1 | 1 |
| IA·메뉴·CTA (IA) | 22 | 3 | 19 | 0 | 0 |
| 주문·배달·알림 (ORD) | 33 | 13 | 14 | 4 | 3 |
| 금전 (FIN) | 23 | 11 | 11 | 0 | 1 |
| 광고·쿠폰·상품권 (ADS-GFT) | 27 | 14 | 12 | 1 | 0 |
| **합계** | **174** | **68** | **88** | **7** | **12** |

- "PASS" 는 코드·DB 증거 기준 PASS 이며, 화면 실측 PASS 가 아니다(실측 0건).
- 위 표는 각 appendix §2 표의 판정 열을 센 값이다. 한 행에 복수 판정(예: "PASS(구조)/FAIL", "PASS(동시성)/FAIL(원장)")이 있으면 FAIL 쪽에 1회만 집계했으므로 열 합계가 행 수와 1~2건 다를 수 있다. ORD 는 appendix 자체 집계(PASS 13·FAIL 14·NOT_PROVEN 4·누락 3)를 따른다.

## 4. 중복·사용되지 않는 페이지 (요약)

| 구분 | 내용 | 처리 제안 (문서 E §3) |
|---|---|---|
| 레거시 리다이렉트 | `/my/business/**` 20, `/mypage/business/**` 4 — 전부 리다이렉트 전용, 쿼리 유실(IA-07) | 유지 + 쿼리 전체 보존 |
| 분기 사본 | `/stores/[slug]/owner/notifications`·`notification-settings` — 셸 밖 독립 렌더, 인바운드 링크 0 | 서버 리다이렉트로 교체 |
| 같은 렌더 | `/finance?section=transactions` ≡ `orders` | `orders` 탭 제거 |
| 같은 토글 3곳 | 노출/영업 토글: 헤더·`/ops-status`·`/settings` | `/settings` 단일, 나머지 표시만 |
| 고아 라우트 | `/ads/event-promotions`(진입점 없음) 등 3 | 광고 그룹에 진입점 추가 |
| 고아 컴포넌트 | 18개 (`MyStoreSettlementsPage` 등) | 삭제 승인 대상 |
| 레거시 API | `/api/me/store-settlements`, `/api/admin/store-settlements` GET (UI 소비자 없음) | 410 처리(FIN-07) |
