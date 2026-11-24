# 관리자 알림 전체 감사 — 구조 결함·CTA 결함 (2026-11-24)

- 범위: 관리자 종(처리 대기 수) · 처리 대기 카드(CP `#action-queue` · `/admin` · `/admin/order-notifications`) · 사이드바 배지 · 실시간·소리·토스트 · 받은 알림(`/admin/inbox`).
- 방법: 코드 읽기 + 운영 DB(`ckdosyydvgzqwpbwuhon`) 읽기 전용 조회 (`begin read only … rollback`). 2026-11-24 PHT.
- 화면: 운영 관리자 화면은 브라우저로 열지 않았다 → 화면 표시 판정은 전부 **NOT_PROVEN** (코드·DB 근거만).
- 수정: 없음 (보고만).

## 0. 공통 원인 (구조)

처리 대기 **숫자**는 `admin_action_queue_counts` 한 함수가 「상태값 하나」로 센다. 카드 CTA 가 여는 **목록**은 도메인마다 따로 만든 화면·API 이고 기본 탭·삭제·종료·결제·샘플·페이지 한도를 각자 적용한다. 두 조건을 같은 정의에서 가져오는 장치가 없어서, 아래 결함 대부분이 같은 모양(숫자 ≠ 목록)으로 반복된다. 레지스트리 주석은 「`listHref` = 센 행을 정확히 보여주는 목록」이라고 약속하지만 검사(테스트)는 없다.

## 1. 지금 운영에서 실제로 틀린 것 (FAIL · 운영 DB 확인)

| # | 위치 | 증상 | 증거 |
|---|---|---|---|
| F1 | 배달 광고 운영 대기 (`delivery_ad_ops`) | 종·카드 **3**, CTA 목록 **1** (겹치는 건 없음) — 정정: 처음엔 「목록 0」으로 적었으나 그것은 화면 없는 Case 함수 결과였다 | `admin_action_queue_counts` → `delivery_ad_ops=3` (9월 QA, 캠페인 모두 `ENDED`) · CTA 화면 `admin_delivery_ad_campaigns_page(view=actionable)` → total 1 = DRAFT·미제출 QA 배너(임시 이미지라 「제작 필요」로 잡힘) |
| F2 | 받은 알림 · 수수료 검토 (`settlement_commission_review`) | 이미 끝난 일인데 미읽음 3건이 11-03 부터 남음 | 3건 모두 obligation `52403a76…` · `adjustment_status = refunded` (검토 대기 아님) |
| F3 | 받은 알림 · 요청 예산 경보 (`request_budget_alert`) | 미읽음 20건(관리자 4명, 11-19~11-24 매일 1건) · 링크 없음 → 「모두 읽음」 외에는 지울 방법 없음 | `admin_notifications` 미읽음 집계 |
| F4 | Point 충전 카드 CTA (`/admin/point-charges`) | 목록 기본 = **전체 상태**. 지금 대기 0인데 목록에 처리 끝난 24건이 보임 | 대기 0 / 전체 24 |

## 2. 처리 대기 숫자 ↔ CTA 목록 불일치 (코드 확인 · 지금 해당 행 0건이라 숫자는 안 틀어짐 = 잠재 FAIL)

| 카테고리 | 숫자 조건 | CTA 목록이 실제 보여주는 것 | 결함 |
|---|---|---|---|
| `delivery_ad_ops` | `WAITING_ADMIN` 전부 | 종료·미결제(OWNER_PAID)·승인/진행 중 캠페인 제외, Case 없는 검토 캠페인 포함 | 양방향 불일치 (F1 원인) |
| `platform_popup_pending` | `platform_popup_owner_requests` submitted/under_review | `/admin/platform-popup` = **캠페인 표** 목록. 신청은 승인 전엔 캠페인이 없어 **절대 안 보임** | 다른 표를 여는 CTA. 맞는 곳 = `/admin/advertising?family=popup` |
| `trade_promo_pending` | `pending_review` | `/admin/advertising/boosts?domain=trade` 기본 탭 **「현재 노출(live)」**, 탭에 「확인중」 자체가 없음 | 센 행이 기본 화면에 0건 |
| `user_charges` | pending·waiting_confirm·on_hold | 기본 전체 상태 · `?status=open` 도 화면 허용값에 없어 무시됨 | F4 |
| `store_reports` | `open` | 상태 거름 없음(전체) | 처리 끝난 신고 섞임 |
| `store_inquiry_open` (사장님 몫·합계 밖) | `open` | 상태 거름 없음 | 답변 끝난 문의 섞임 |
| `partner_pending` | `PENDING_REVIEW` | 기본 = ACTIVE·PAST_DUE·CANCEL_PENDING 포함, 100건 한도·페이지 없음 | 정상 회원 섞임·잘림. `?status=PENDING_REVIEW` 필요 |
| `coin_withdrawals` | `REQUESTED` | `/admin/finance#coin-withdrawals` 요약표 40건 한도·처리 버튼 없음. 실제 처리 화면은 `/admin/finance/withdrawals`(기본 전체 상태) | 잘림 · 처리 화면 아님 · `#` 이동은 비동기 렌더 후라 안 될 가능성(미확인) |
| `community_reports` | 신고 **행** 수 | 대상(글·댓글·회원) **묶음** 수 · `target_type` NULL 행은 목록 불가 | 같은 글 신고 3건 → 숫자 3, 목록 1 |
| `delivery_alerts` | open·acknowledged | 기본 탭이 `muted` 까지 포함 | 목록 ≥ 숫자 |
| `feed_ad_requests` | `pending_review` (삭제 여부 안 봄) | 삭제된 신청·연결 캠페인 상태 우선 · `held`/`submitted` 는 목록에만 | 양방향 가장자리 불일치 |
| `store_applications` | pending·under_review | 샘플 매장(`store_kind='sample'`) 제외 | 샘플 매장 신청은 세지만 안 보임 |

일치(행 기준 MATCH): `settlements_actionable` · `cash_charges` · `reports` · `messenger_actionable` · `support_actionable` · `orders_attention`.

## 3. 권한 결함 — 숫자는 보이는데 목록은 403

레지스트리 `requiredPermission` 이 목록 API 권한과 다르다 (권한 없는 관리자도 종 숫자에 포함되고, 눌러도 못 연다).

| 카테고리 | 레지스트리 | 목록 API·화면 실제 |
|---|---|---|
| `orders_attention` | 없음 | `business` |
| `store_reports` | 없음 | `reports` |
| `messenger_actionable` | 없음 | `chats` |
| `support_actionable` | 없음 | `support` |
| `community_reports` | `reports` | 화면 `community(moderation)` |
| `reports` | `reports` | `/admin/trade/reports` 는 관리자 누구나 (반대 방향, 행 영향 없음) |

## 4. 사이드바 배지 결함

- **묶음(상위 메뉴)에 배지 없음**: 배지는 맨 끝 메뉴에만 그려지고, 묶음은 현재 화면이 그 안일 때만 펼쳐진다 → 접힌 묶음 안의 대기 건은 사이드바에서 안 보임 (`AdminSidebarItem.tsx` 183~225).
- **숨김 메뉴에 걸린 배지**: `feed_ad_requests` → `ads-feed-applications`, `trade_promo_pending` → `ads-applications` 둘 다 `ads-legacy`(`sidebarPublic:false`) 안 → 배지가 절대 안 보임 (11-07 `delivery-ads-control` 과 같은 결함).
- **배지 없음**: `partner_pending`(메뉴 자체 없음) · `store_inquiry_open`.
- **목록과 다른 메뉴에 배지**: `cash_charges` → `/admin/finance`(목록 메뉴 `delivery-ads-cash-queue` 따로 있음) · `coin_withdrawals` → `/admin/finance/withdrawals`(CTA 는 `/admin/finance#…`) · `platform_popup_pending` → 캠페인 목록 메뉴.

## 5. 받은 알림(`/admin/inbox`) 구조 결함

| # | 결함 | 근거 |
|---|---|---|
| S1 | `support_case_assigned` 종류는 정의만 있고 만드는 곳 없음 (배정 알림 안 감) | `admin-notification-kinds.ts` · 배정 함수에 생성 없음 |
| S2 | 일이 끝나도 미읽음 유지 — 고객지원만 자동 읽음. 입점 신청·주소 재검증·정산은 처리해도 그대로 | F2 가 운영 실례 |
| S3 | 예산 경보: 권한 무관 모든 관리자에게 · 링크 없음 · 행별 읽음 버튼 없음 | F3 |
| S7 | 고객지원 담당자 변경 시 72시간 내 고객 메시지가 새 담당자에게 다시 알림·푸시될 수 있음 | 재전송 함수 조건 (코드 해석, 데이터 미확인) |
| S8 | `support_customer_replied` 권한 미지정 → `support` 권한 없는 담당자도 받음, 눌러도 403. 입점 신청 dedupe 키에 `Date.now()` → 재시도 시 중복 | 코드 |
| S9 | 알림 cron(5분) 실패해도 HTTP 200 → Vercel 이 실패로 안 잡음 | `app/api/cron/admin-notification-delivery/route.ts` |
| S10 | 실패(dead) 발송이 1건이라도 생기면 최고관리자 헤더가 기간 제한 없이 영구 「!」, 비우는 화면 없음 | **지금 dead 0건** → 잠재 |
| S4·S5·S6 | 헤더 미읽음 1000건 한도 · 「모두 읽음」이 안 보이는 행까지 읽음 처리 · 90일 지난 행 보관 꺼짐 | 지금 관리자별 최대 미읽음 7건 · 90일 초과 0건 → 영향 없음 |

## 6. 받은 알림 CTA 결함

| # | 종류 | 링크 | 결함 |
|---|---|---|---|
| C1 | 입점 신청 | `/admin/stores?status=actionable&store=<id>` | 화면이 `store` 를 안 읽음 → 해당 매장이 안 열림. 표준 링크는 `/admin/business/<id>` |
| C2 | 매장 주소·위치 변경 | `/admin/business/<id>` | 기본 「개요」 탭. 재검증 완료 버튼은 「기본정보(basic)」 탭에만 → `?tab=basic` 필요 |
| C3 | 예산 경보 | 없음 | F3 |
| C4 | 정산 | `…&order_no=&open=<id>` | 주문번호 없을 때 빈 값 · 대상이 첫 페이지에 없으면 안 열릴 수 있음 (미확인) |

## 7. 정상 확인 (PASS — 코드·DB)

- 종 숫자 = CP 카드 합계 = `/admin/order-notifications` 합계: 같은 응답(`/api/admin/admin-bell`) 하나를 공유. 실패 칸은 0 이 아니라 「확인 불가」, 종은 「!」.
- 받은 알림 숫자와 처리 대기 숫자는 합치지 않음 (따로 표시).
- 실시간 구독 13개 표 모두 운영 `supabase_realtime` 발행에 있고, 관리자 SELECT 정책 있음. `RT_REQUIRED` 카테고리는 전부 구독됨. 나머지는 75초 폴링.
- 실시간 토스트 링크 대상 페이지 전부 존재, 파라미터(`rid`·`request`) 읽음.
- 고객지원·정산 받은 알림 링크 정상.

## 8. 레거시 잔여 (낮음)

- 보관 처리된 `member_admin_note_threads`·`platform_admin_inquiries`·`store_point_charge_requests` 를 여전히 실시간 구독하고 새 행에 소리·토스트를 낸다. 숫자에는 안 들어간다. 운영 마지막 생성 8월 → 현재 영향 없음.

## 9. 확인 못 함 (NOT_PROVEN)

- 운영 관리자 화면 실제 표시 (브라우저 미사용).
- 운영 `admin_action_queue_counts` 본문 전체와 저장소 정의의 일치 — `delivery_ad_ops` 부분만 운영 정의에서 직접 확인(상태값만 비교).
- `coin_withdrawals` `#` 이동 · 정산 `open=` 첫 페이지 밖 동작 · S7 실제 발생 여부.
