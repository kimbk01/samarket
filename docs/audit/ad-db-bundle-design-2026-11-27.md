# 광고 DB 묶음 설계안 (A-DB · B-DB · C-DB) — 2026-11-27

> 근거 계획: `ad-process-defects-design-2026-11-26.md` §8 · `ad-pricing-notice-design-2026-11-26.md` §5·§8 3단계 · 재감사 R-24·R-35·R-37.
> 운영 DB 확인(읽기 전용 · 2026-11-27): 대상 함수 11개 존재·인자 확인 · `point_promotion_orders.product_revision` 열 **있음** · `point_promotion_order_extensions`·`feed_ad_request_renewals` 표 **없음** · `notifications` 표 있음 · 검토 중 배너 신청 **0건**.
> 적용은 **Owner 승인 후**. 도메인별 PR 3개(혼합 금지) · 각 PR = 마이그레이션 1개 + 코드. 순서: 마이그레이션 적용(옛 코드와 함께 동작) → 코드 병합.

## A-DB 상위노출

| ID | 지금(증거) | 설계 | 코드 |
|---|---|---|---|
| TB-07 | 연장 때 `purchase_member_community_promotion`·v2 가 주문 행 `duration_days`·`point_cost` 에 **더함** → 처음 결제 기록이 사라짐 | 새 표 `point_promotion_order_extensions(id, order_id, product_id, product_revision, days, points, ledger_id, created_at)` · 두 결제 함수의 연장 분기 = 연장 행 INSERT + 주문 행은 `end_at` 만 갱신 | 내 광고 줄 「연장 {n}회」 · 어드민 상세에 연장 내역. 환급은 지금처럼 원장 합계(변경 없음) |
| TB-11 | 커뮤니티 결제 INSERT 에 `product_revision` 없음(열은 있음 ✔) | 커뮤니티 결제 함수가 `product_revision` 기록 | 없음 |
| TB-09 | 만료 함수 2개(`expire_trade_promotion_orders`·`community_promotion_orders_expire`)는 상태만 바꿈 · 알림 0 | 주문 표에 `expiry_notice_at`·`ended_notice_at` 열 추가(중복 발송 방지) | 하루 1회 작업(`/api/cron/promotion-expiry-notify`, `CRON_TZ=Asia/Manila`): ① 24시간 안에 끝나는 주문 「상위노출이 내일 끝나요 · 연장하기」(결제 창 연장으로) ② 끝난 주문 「상위노출이 끝났어요」 — `appendUserNotification` · 요청 예산 등록 |

## B-DB 회원 배너

| ID | 지금(증거) | 설계 | 코드 |
|---|---|---|---|
| FB-06 (D-05·D-06) | `member_feed_ad_renew(…, p_expected_cost)` 금액만 대조 · 신청 행 `duration_days`·`point_cost`·`product_id` 를 **덮어씀** · 지금은 TS 가 기간을 먼저 대조(R-35·R-37 임시) | 새 인자 `p_expected_days` — **같은 키 확인 뒤**, 잠근 상태에서 금액·기간 대조 · 새 표 `feed_ad_request_renewals(request_id, campaign_id, product_id, days, points, ledger_id, key, created_at)` · 신청 행은 처음 값 유지(캠페인 `end_at` 만 연장) · 옛 5인자 함수는 코드 배포 뒤 삭제 | 연장이 기간을 DB 로 넘김 → TS 임시 대조 삭제 · 내 광고 「연장 내역」 |
| R-24 | 회원 취소 = 상태 변경 → 보류 해제(포인트 돌려줌)가 **따로**(TS) — 중간 실패면 「취소됨 + 포인트 묶임」 가능 | `member_cancel_feed_ad_request(p_user, p_request)` 한 트랜잭션: 검토 중·본인·검토 미시작(또는 10분 지난 claim)만 · 보류 해제(원장 기록) + 상태 cancelled · 보류가 이미 확정이면 거부 | 취소 라이브러리가 함수 1회 호출 → 임시 되돌리기 코드 삭제 |
| FB-12 (D-12) | 검토 중 신청이 포인트를 **무기한** 묶음(작업 없음) · 계획 두 문서가 묶음을 다르게 적음(코드 vs DB) | **권장: DB 함수** `system_expire_feed_ad_requests(p_days int default 7)` — 7일 지난 검토 중 = 반려 + 보류 해제 한 트랜잭션(관리자 반려 함수와 같은 처리 · 실행자 system) | 하루 1회 작업이 함수 호출 + 회원 알림 「배너 신청이 7일 동안 검토되지 않아 취소됐어요 · 포인트 돌려드렸어요」 · 신청 화면 「남은 자리 {n} · 검토 중 {m}」 |
| FB-03 | 연결 글이 숨김·삭제되면 배너는 노출에서 빠지는데 회원 화면은 「광고중」 · 기간은 계속 감 | 상위노출과 같은 규칙: 글 숨김 → 캠페인 `paused` · `paused_by='system'` (기간 멈춤) · 다시 공개 → 재개(멈춘 시간만큼 `end_at` 연장) · 삭제 → 종료(환급 없음 · 상위노출과 같은 고지). 거래·커뮤니티 글 상태 변경 트리거에서 호출(`community_promotion_sync_post` 와 같은 자리) | 회원 GET `destinationUnavailable` · 내 광고 「연결한 글이 숨김·삭제되어 광고가 멈췄어요」 |
| FB-09 | 승인·반려·자리 부족·운영 종료 알림 0 | DB 변경 없음 | 승인·반려·운영 종료 성공 직후 `appendUserNotification`(「배너 광고가 시작됐어요」 · 「반려됐어요 · 포인트 돌려드렸어요」 · 「운영자가 광고를 종료했어요」) · 알림 종류 1곳 `lib/ads/ad-notification-kinds.ts` |
| 참고 | 승인 중 실패 보상 경로가 환급 뒤 「검토 중」으로 되돌려 **보류 없는 검토 중** 신청이 남음 | 보상 경로는 `rejected`(사유 `system_failure`)로 끝냄 | 회원 알림 「처리 중 문제가 생겨 신청이 반려됐어요 · 포인트 돌려드렸어요」 |

## C-DB 매장 광고

| ID | 지금(증거) | 설계 | 코드 |
|---|---|---|---|
| SA-02 (D-02) | 요금 기록(스냅샷)을 TS 가 **먼저** 저장 → 차감 함수 실패해도 기록이 남음(지금은 R-69·R-73 대조로 잘못된 결제는 막힘) | `owner_submit_delivery_ad_with_business_cash` 새 인자(`p_package_id`·`p_final_payable_minor`·`p_duration_days`·견적 필드) — **요금 기록 INSERT + 차감 + 상태 전이 = 한 트랜잭션** · 차감 안 된 옛 기록은 같은 함수가 새 값으로 교체 · 이미 확보된 캐시가 있으면 그 기록 재사용(지금과 같음) | 제출 라우트가 스냅샷 INSERT 대신 함수에 값 전달 |
| SA-03 (D-03) | 매장 홍보는 **자리 검사 없이** 판매 · 노출은 최대 5개를 10분마다 순환(이번 PR) | 같은 함수 안에서: 같은 지면(업종은 같은 업종 대상)·기간이 겹치는 「심사 중·승인·예정·진행」 수 ≥ 정책 최대(홈 = `homePaidAdInsertion.max_items` 운영 5 · 업종 = 업종 정책 `max_insertion`)면 `capacity_full`(캐시 차감 없음) | 사장님 화면 「남은 자리 {n}」(이번 PR 에서 보류한 것) · 자리 가득 문구는 이미 있음 |
| SA-09 (D-10) | 파트너 가입이 회비 대조 없음 · 할인율·기간을 **승인 때** 정함(`admin_partner_membership_decide` 의 `p_period_days`) | `owner_apply_partner_membership` 새 인자 `p_expected_fee_minor` — 다르면 `price_changed` · 신청 때 회비·할인율·기간(30일 고정) 기록 · 승인 함수는 그 기록만 사용(`p_period_days` 무시) — 적용 전 `delivery_ad_partner_memberships` 열 확인 | 가입 화면이 본 회비 전송 · 409 안내 |

## 공통
- **옛 코드 호환**: 새 인자는 기본값을 두거나 새 함수로 만들고, 코드 배포 뒤 옛 함수 삭제(별도 마이그레이션). 마이그레이션만 먼저 적용해도 지금 코드가 그대로 동작해야 한다.
- **기존 데이터**: 광고 구매·신청 기록은 모두 시험 데이터(Owner 11-26) → 이력 옮기기(backfill) 없음. 시험 데이터 삭제는 운영 데이터 묶음(별도 승인).
- **롤백**: 마이그레이션마다 되돌리는 SQL(옛 함수 정의 복원 · 새 표·열 삭제)을 같은 PR 에 둔다.
- **검증**: 로컬(시험 함수 정의 문자열·라우트 시험) → 적용 후 운영 함수 정의 조회(읽기 전용) → 실기(Owner 계정) — 연장 내역 1줄·처음 행 불변 / 취소 후 포인트 복구 / 7일 반려 / 자리 가득 거부·잔액 불변 / 파트너 금액 변경 후 가입 409.
- **비용**: 새 작업 2개(하루 1회) · 화면 요청 증가 없음(요청 예산 주석 갱신).

## Owner 결정 필요
1. 이 설계로 **3개 PR(A-DB → B-DB → C-DB 순)** 진행 여부 — 마이그레이션은 PR 마다 운영 적용 승인.
2. FB-12 를 DB 함수로(권장) 할지.
3. FB-03 글 **삭제** 시 배너 종료·환급 없음(상위노출과 같은 규칙)으로 할지.
