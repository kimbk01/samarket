# 관리자 알림 수정 설계서 (2026-11-24)

- 근거 감사: `docs/audit/admin-notification-full-audit-2026-11-24.md`
- 상태: **설계 — Owner 승인 전 구현하지 않음.** 단계 2(DB 함수)는 운영 DB 적용 별도 승인.
- 배포 구분: 웹 + DB. 네이티브 변경 없음(앱 재빌드 없음).
- 통화·메신저 방·푸시 발송 경로는 건드리지 않는다.

## 0. 작업자 정정 (먼저 보고)

1차 보고에서 「배달 광고 운영 대기: 카드 3, 목록 **0**」이라고 했다. 이것은 틀렸다. 그때 조회한 것은 화면 없는 처리 Case 목록 함수(`admin_delivery_ad_action_queue_page` → 0건)였다.
카드 CTA 가 실제로 여는 화면(`/admin/delivery-ads/manage?view=actionable` → `admin_delivery_ad_campaigns_page`)은 **1건**을 보여준다. 운영 DB 재조회 결과는 아래와 같다.

| 구분 | 건수 | 내용 |
|---|---|---|
| 종·카드 숫자 | 3 | 처리 Case `WAITING_ADMIN` 3건, 캠페인 모두 `ENDED` (9월 QA) |
| CTA 목록 | 1 | 배너 `S2 banner ret` (`db9fd8db…`): `DRAFT`·`NOT_SUBMITTED`·임시 이미지·종료일 09-08 지남. 숫자 3건과 **겹치지 않는다** |

→ 결론은 같다(FAIL). 다만 실제로는 **양쪽 모두 틀렸다**. 숫자는 끝난 광고 3건을 세고, 목록은 사장님이 제출도 안 한 초안 1건을 「제작 필요」로 보여준다.

## 1. 계약 (원문 인용)

- `docs/dibay-global-notification-ssot-hard-lock.md` §1:
  > Category contract `lib/admin/admin-action-queue-registry.ts` (ownership · nextActor · total membership · permission · listHref · sidebar keys) … failure = `unavailable` (never 0) · caller permission scope … Forbidden: hand-listed cards/badges/total
- `lib/admin/admin-action-queue-registry.ts`:
  > `listHref` — Admin list that shows exactly the rows counted
  >
  > Permission rule: requiredPermission mirrors the permission the category's admin list/mutation API enforces
  >
  > Total rule: includeInTotal = nextActor === "admin"
- `docs/request-budget-ssot.md` §알림:
  > 관리자 알림 `request_budget_alert`(활성 관리자 전원, 푸시 포함), 하루 1건
  - 따라서 수신자 범위는 계약대로이며 수정 대상이 아니다.
- AGENTS.md 개발 프로세스 2번: 운영 DB 적용(함수 포함)은 Owner 별도 승인.

## 2. 설계 원칙 (규정으로 결정 — Owner 에게 넘기지 않음)

1. **숫자 = CTA 화면 기본 목록의 전체 건수.** 둘 중 어느 쪽을 고칠지는 아래 규칙으로 정한다.
   - 목록이 **처리 끝난 건까지 보여주는 경우**(전체 상태 기본): CTA 주소에 상태 필터를 붙인다. 웹만 바뀐다.
   - 목록이 **관리자가 처리할 수 없는 건을 올바르게 빼는 경우**(종료·삭제·미결제·샘플·초안): 숫자도 똑같이 뺀다. DB 함수가 바뀐다.
   - CTA 가 **다른 표·처리 못 하는 화면**을 여는 경우: 처리 화면으로 CTA 를 바꾼다.
2. **권한 = 목록 API 권한** (계약 원문). 권한 없는 관리자는 그 칸이 `forbidden` 이 되고 합계에서 빠진다.
3. **사이드바 배지 키 = 화면에 보이고 CTA 와 같은 경로를 여는 메뉴.**
4. 받은 알림은 **처리가 끝나면 그 건의 알림을 읽음 처리**한다(고객지원과 같은 방식).
5. 다시 틀어지지 않게, 카테고리마다 「숫자 조건 = 목록 조건」을 고정하는 **계약 시험**을 같은 PR 에 넣는다.

## 3. 단계 1 — 웹만 (DB 적용 없음 · PR 1개)

### 3-1. 처리 대기 카드 CTA (`lib/admin/admin-action-queue-registry.ts` `listHref`)

| 카테고리 | 지금 | 바꿀 주소 | 함께 바꿀 화면 | 근거 |
|---|---|---|---|---|
| `user_charges` | `/admin/point-charges` | `/admin/point-charges?status=open` | `AdminPointChargeListPage.tsx` `STATUS_VALUES` 에 `open` 추가 + 칩 「대기」 (카탈로그 ko·en) | API 는 이미 `open` = 3개 상태 (`lib/points/admin-point-charge-list-query.ts`). 지금은 화면 허용값에 없어 「전체」로 바뀐다 |
| `store_reports` | `/admin/store-reports` | `/admin/store-reports?status=open` | API `app/api/admin/store-reports/route.ts` 에 `status` 거름 추가, `AdminStoreReportsPage.tsx` 에 상태 칩(전체·접수) | 지금 상태 거름 없음 |
| `store_inquiry_open` | `/admin/store-inquiries` | `/admin/store-inquiries?status=open` | API `app/api/admin/store-inquiries/route.ts` `status` 거름, `AdminStoreInquiriesPage.tsx` 칩 | 같음 |
| `partner_pending` | `/admin/delivery-ads/partner` | `…/partner?status=PENDING_REVIEW` | 없음 (화면이 이미 읽음) | 기본 `open` 에 ACTIVE 등 섞임 |
| `coin_withdrawals` | `/admin/finance#coin-withdrawals` (40건 요약표) | `/admin/finance/withdrawals?status=REQUESTED` | 없음 (`AdminCoinWithdrawalsPanel` 이 `REQUESTED` 허용·페이지·처리 버튼 있음) | 40건 한도·처리 불가·`#` 이동 불확실 |
| `platform_popup_pending` | `/admin/platform-popup` (캠페인 표) | `/admin/advertising?family=popup&status=pending` | 없음 | 신청은 원장 `popup_request` 행. 구현 전 원장 `popup_req.ops='pending'` = `submitted·under_review` 인지 함수 본문으로 확인 |
| `trade_promo_pending` | `/admin/ad-applications?domain=trade` → 부스트 기본 「현재 노출」 | `/admin/advertising/boosts?domain=trade&status=pending` | `AdminAdvertisingWorkspace.tsx` 부스트 탭에 「확인중(pending)」 추가 | 지금 부스트 화면에 확인중 탭이 없어 센 건이 기본 화면에 0건 |
| `feed_ad_requests` | `/admin/ad-applications?domain=feed` (리다이렉트) | `/admin/advertising/applications?kind=feed_member&status=pending` | 없음 | 리다이렉트 한 번 줄이고 상태를 명시 |

`orders_attention`·`settlements_actionable`·`cash_charges`·`reports`·`messenger_actionable`·`support_actionable` 은 이미 일치하므로 CTA 를 바꾸지 않는다.

### 3-2. 권한 (`requiredPermission`)

| 카테고리 | 지금 | 바꿀 값 | 목록 API |
|---|---|---|---|
| `orders_attention` | null | `business` | `app/api/admin/store-orders/ops/route.ts` |
| `store_reports` | null | `reports` | `app/api/admin/store-reports/route.ts` |
| `messenger_actionable` | null | `chats` | `requireChatAdmin` |
| `support_actionable` | null | `support` | `app/api/admin/support/cases/route.ts` |
| `community_reports` | `reports` | **그대로** | 화면 권한은 `community(moderation)` 영역. 권한 키 체계가 달라(영역 vs 키) 레지스트리 한 칸으로 못 맞춘다. 화면 권한 통일은 범위 밖 — 보고만 |

- **영향**: 위 권한이 없는 관리자는 종 합계가 줄어든다. 의도한 변화다(계약 「caller permission scope」).
- 최고관리자는 변화 없다.
- `permitted()` 가 이미 `forbidden` 을 처리한다. 카드·배지는 `forbidden` 을 그리지 않는다.

### 3-3. 사이드바 배지

1. **접힌 묶음에도 합계 배지**
   - `components/admin/sidebar/AdminSidebarItem.tsx` 묶음 줄에 「자식 메뉴 키들의 합」 배지를 넣는다. 펼치면 숨긴다.
   - 합계는 `sumAdminQueueCountsForMenuKey` 를 자식 키 전체에 적용한다. 같은 카테고리가 두 자식에 걸리면 한 번만 센다(카테고리 key 기준 중복 제거).
   - 「확인 불가」 자식이 있으면 「!」.
2. **숨김 메뉴 키 교체** (`sidebarMenuKeys`)
   - `feed_ad_requests`: `ads-feed-applications`(숨김) → `ads-authority-applications`
   - `trade_promo_pending`: `ads-applications`(숨김) → `ads-authority-boosts`
   - `platform_popup_pending`: `promotion-popup`(캠페인 목록) → `ads-advertising-workspace`
   - `coin_withdrawals`: `finance-withdrawals` 유지 (새 CTA 와 같은 경로가 됨)
   - `cash_charges`: `store-finance-admin` 유지 + `delivery-ads-cash-queue` 추가. 구현 전 entryAlias 메뉴가 사이드바에 그려지는지 확인한다. 안 그려지면 추가하지 않는다.
3. `partner_pending`·`store_inquiry_open` 은 배지 없음 그대로 둔다. 계약상 `sidebarMenuKeys: []` 허용이고, partner 는 메뉴가 없다. 메뉴 신설은 범위 밖이다.

### 3-4. 받은 알림 CTA

| # | 종류 | 수정 | 파일 |
|---|---|---|---|
| C1 | 입점 신청 | `linkUrl` = `resolveAdminStoreApplicationHref(storeId)` (`/admin/business/<id>`) | `lib/stores/store-application-admin-notify.server.ts` |
| C1-b | 입점 신청 dedupe | `Date.now()` → 재시도 때 같은 키가 되도록 `storeId:kind:<신청 시각>` (`stores.updated_at` 또는 resubmit 시각) | 같은 파일 |
| C2 | 주소·위치 변경 | `linkUrl` = `/admin/business/<id>?tab=basic` | `lib/stores/owner-catalog/store-profile-core.server.ts` |
| C3 | 예산 경보 | 링크 = `/admin/performance` (기존 성능 화면; 구현 전 예산 표 표시 여부 확인, 없으면 링크 없이 둔다) + 받은 알림 각 줄에 「읽음」 버튼 (링크 없는 알림 포함) | `lib/perf/request-budget-watch.server.ts`, `components/admin/inbox/AdminInboxPageClient.tsx`, 기존 `/api/admin/inbox/read`(ids) 사용 |
| S8 | 고객 답장 알림 권한 | `requiredPermission: "support"` | `lib/support/support-case-service.ts` (생성부) |

- 이미 만들어진 알림 행의 `link_url` 은 바꾸지 않는다(운영 데이터 변경 = 별도 승인). 기존 행은 예전 링크 그대로다.

### 3-5. 받은 알림 자동 읽음 (S2)

처리 완료 지점에서 `markAdminNotificationsRead(sb, { workRef: { table, id }, kinds: [...] })` 를 **모든 수신 관리자** 대상으로 부른다.
- 고객지원의 `markSupportCaseNotificationsRead` 와 같은 방식이다. 함수가 「모든 수신자」를 지원하지 않으면 같은 서비스 파일에 work_ref 기준 일괄 처리를 추가한다.

| 종류 | 완료 지점 | 조건 |
|---|---|---|
| `store_application_submitted` | 입점 승인·반려 처리 (`execute-admin-store-patch-action.server.ts` approve/reject) | 결과가 `pending`·`under_review` 가 아닐 때 |
| `store_core_info_changed` | `confirm_core_info_reverified` 처리 (같은 파일) | 성공 시 |
| `settlement_commission_review` | 수수료 조정 결정 API (`admin_decide_store_commission_adjustment` 호출부) | 성공 시 |

- `settlement_financial_exception` 은 「확인 필요」 성격(해결 상태 정의 없음)이라 그대로 둔다.
- 운영 미읽음 3건(F2, obligation `52403a76…` = `refunded`)은 코드로는 지워지지 않는다. **데이터 정리 별도 승인 항목**(§6)으로 둔다.

### 3-6. 알림 cron 실패 표시 (S9)

- `app/api/cron/admin-notification-delivery/route.ts`: 단계 중 하나라도 실패(`ok:false`)면 **HTTP 500** 으로 응답한다. 그러면 Vercel cron 이 실패로 기록한다. 응답 본문은 그대로다.
- 영향: 재시도 정책 없음(Vercel cron 은 자동 재시도 안 함). 다음 5분 주기가 그대로 돈다.

### 3-7. 계약 시험 (재발 방지)

새 시험 `lib/admin/__tests__/admin-action-queue-count-list-parity.test.ts`:
- 레지스트리 카테고리마다 기대 표를 고정한다: `listHref` + 숫자 RPC 조건값(`buildAdminActionQueueCountsRpcParams`) + 목록 화면이 그 주소에서 쓰는 상태값.
  - 예: `user_charges` → `status=open` ↔ `POINT_CHARGE_OPEN_STATUSES` == `user_charge_statuses`.
- `requiredPermission` 이 목록 API 권한 표와 같은지 확인한다.
- `sidebarMenuKeys` 가 `sidebarPublic:false` 섹션 안의 키가 아닌지 확인한다(`admin-menu.ts` 순회).
- 기존 `admin-action-queue-registry-contract.test.ts` 의 `listHref` 정규식 검사는 유지한다.

### 3-8. 단계 1 영향·깨질 수 있는 것

| 바뀌는 것 | 영향받는 곳 | 처리 |
|---|---|---|
| `listHref` | CP `#action-queue`·`/admin` Action Center(`hrefDecorator` 로 returnTo 붙임)·`/admin/order-notifications` 카드 | 모두 레지스트리에서 읽음 → 자동 반영. `withAdminReturnTo` 가 쿼리 있는 주소에 `&` 로 붙는지 시험으로 확인 |
| 상태 칩 추가 (포인트·매장 신고·문의·부스트) | 해당 목록 화면 | 기본값은 그대로 두고(메뉴로 들어오면 지금과 같음), 카드에서 올 때만 필터. 문구는 `t()` 키 (i18n 규정) |
| 권한 | 종·사이드바·카드 | 기존 `forbidden` 경로 재사용 |
| 묶음 배지 | 사이드바 전체 | 펼친 상태에서는 자식 배지만 → 중복 표시 없음 |
| 알림 링크·자동 읽음 | 받은 알림 화면·헤더 숫자 | `ADMIN_INBOX_CHANGED_EVENT` 는 같은 탭만 갱신. 다른 관리자는 75초 폴링으로 반영 |
| `request_budget_alert` 링크 | 받은 알림 | 계약(수신자 전원)은 유지 |

- 검증(로컬 1회): `typecheck:build` · 관련 vitest(레지스트리·새 parity·inbox 계약·사이드바) · 변경 파일 eslint · `check:i18n-quality`.

## 4. 단계 2 — DB 함수 (Owner 운영 DB 적용 승인 후 · 마이그레이션 1개)

### 4-1. 배달 광고 목록 버킷 고치기 (`admin_delivery_ad_campaign_index`)

- 지금 버킷 순서: `review_unfunded` → **배너 임시 이미지면 무조건 `needs_creative`** → `review` → … → `ended`.
- 그래서 초안(DRAFT)·종료(ENDED) 배너도 「제작 필요」로 처리 목록에 나온다(운영 실례 `db9fd8db…`).
- 수정: `needs_creative` 조건에 `lifecycle_status IN ('SUBMITTED','UNDER_REVIEW','CHANGES_REQUESTED')` 와 펀딩 허용(= `review_unfunded` 가 아님)을 더한다.
  - 초안 배너는 버킷 NULL 이 된다(「전체」에만 나옴, 사장님 몫).
  - 종료 배너는 `ended` 가 된다.
- 영향: 같은 함수를 쓰는 허브 보기 전체(`actionable`·`history`·요약 숫자)가 바뀐다. 지금 `needs_creative` 1건이 빠지고, 종료 배너가 「이력」에 들어간다. 다른 버킷은 그대로다.

### 4-2. 처리 대기 숫자 조건 (`admin_action_queue_counts` — 운영 본문을 `pg_get_functiondef` 로 받아 해당 블록만 교체)

저장소 정의와 운영 정의가 다르다(`20271112200000` 주석). 그래서 저장소 파일로 덮어쓰지 않는다. **운영 본문 기준으로 아래 블록만 바꾼다.** 같은 방식이 이미 `moim_m1b` 에 쓰였다.

| 카테고리 | 지금 | 바꿀 조건 | 목록과 같아지는 이유 |
|---|---|---|---|
| `delivery_ad_ops` | Case `WAITING_ADMIN` 전부 | `count(*) FROM admin_delivery_ad_campaign_index(p->>'pending_asset') WHERE list_bucket IN ('needs_creative','review')` | CTA 화면 `view=actionable` 과 **같은 함수·같은 조건**. 운영 예상 숫자: 지금 3 → 0 (4-1 적용 후) |
| `feed_ad_requests` | `status='pending_review'` | 행 조회 대신 `count(*)` + `deleted_at IS NULL` + 연결 캠페인이 삭제되지 않음 | 원장 목록은 삭제 행을 뺀다. `held`·`submitted` 상태는 운영에 0건(11-24 조회) → 반대 방향 차이는 지금 없음 |
| `trade_promo_pending` | `domain='trade' AND order_status='pending_review'` | + `deleted_at IS NULL` | 원장은 삭제 주문 제외 |
| `store_applications` | `approval_status IN (pending, under_review)` | + `store_kind <> 'sample'` | 목록 `scope=review` 가 샘플 제외 |
| `community_reports` | 신고 **행** 수 | `count(DISTINCT (target_type, coalesce(target_id::text,'')))` + `target_type IN ('post','comment','user')` | 목록은 대상 묶음 수 (`admin_community_report_groups_page`). 관리자 처리 단위 = 대상 |

TS 쪽(웹, 같은 PR):
- `buildAdminActionQueueCountsRpcParams` 에 `pending_asset` 을 추가한다. RPC 가 실패하면 쓰이는 표별 조회(`loadAdminActionQueueRowsLegacy`)도 같은 조건으로 맞춘다.
  - `delivery_ad_ops` 는 legacy 에서 같은 index 함수 RPC 를 부른다.
  - 피드는 `deleted_at` 을 거른다.
- `delivery_alerts`: 목록 「미처리」 탭이 `open·acknowledged·muted` 이므로 숫자 조건값 `delivery_alert_statuses` 에 `muted` 를 더한다. **조건값만 바뀌어 DB 변경 없음.** 근거는 다음과 같다.
  - `muted` 는 소리만 끈 미종결 건이다(종결 = resolved).
  - 소리 결정(`shouldPlayAdminOpsSound`)은 숫자와 별개라 영향이 없다.

### 4-3. 받은 알림 DB 함수

| # | 함수 | 수정 |
|---|---|---|
| S10 | `admin_notification_delivery_health` | dead 집계를 최근 7일로 제한(`updated_at >= now() - 7 days`). 지금 dead 0건 → 표시 변화 없음 |
| S7 | `admin_notification_replay_support_replies` | 「현재 담당자에게 행이 없으면」 → 「같은 `dedupe_key` 의 알림이 **어느 관리자에게든** 있으면 건너뜀」. 담당 변경 시 과거 메시지 재알림·푸시 방지 |

### 4-4. 단계 2 영향·롤백

- 숫자 함수는 종·CP·Action Center·order-notifications·사이드바가 함께 쓴다. 바뀐 칸만 숫자가 달라진다.
  - 운영 예상(11-24 기준): 종 3 → 0. 나머지 칸은 지금 0이라 변화 없다.
- 성능: index 함수는 캠페인 수(운영 85행) 규모다. 75초 폴링 × 관리자 수 기준 추가 부하는 미미하다. 피드는 최대 2000행을 가져오던 것을 `count` 로 바꿔 줄어든다. 단 `request-budget` 예산(`lib/perf/request-budget.ts`)의 `admin-bell` 값을 확인한다.
- 롤백: 마이그레이션 파일에 바꾸기 전 운영 본문(`pg_get_functiondef` 결과)을 주석으로 저장한다. 문제가 생기면 같은 본문으로 `CREATE OR REPLACE` 한다.
- 적용 후 확인: §7 SQL.

## 5. 범위 밖 (고치지 않음 · 보고만)

- `support_case_assigned` 종류: 정의만 있고 생성이 없다. 배정 알림 신설은 기능 추가라 Owner 결정이 필요하다.
- 커뮤니티 신고 화면 권한(영역) ↔ 레지스트리 권한(키) 체계 차이.
- 받은 알림 헤더 1000건 한도·「모두 읽음」 범위·90일 보관 꺼짐: 운영 영향 0(관리자별 최대 미읽음 7, 90일 초과 0).
- 보관된 레거시 표(`member_admin_note_threads` 등) 실시간 구독: 8월 이후 새 행 0.
- 정산 알림 `open=` 이 첫 페이지 밖일 때 열림 여부(미확인).

## 6. 별도 승인 필요 — 운영 데이터 정리 (코드와 분리)

| 대상 | 내용 | 방법 |
|---|---|---|
| 받은 알림 미읽음 3건 (`settlement_commission_review`, obligation `52403a76…`, 이미 `refunded`) | 읽음 처리 | `update admin_notifications set read_at = now() where kind='settlement_commission_review' and work_ref_id='52403a76-5d62-4081-a857-6a3be9f2adbb' and read_at is null` — 백업 후, 「운영 시험 저장 규칙」 준수 |
| 종료된 QA 배달 광고 Case 3건 `WAITING_ADMIN` | **건드리지 않음** | 4-2 적용 시 숫자에서 자동으로 빠진다. Case 종결 처리는 별도 지시가 있을 때만 |

## 7. 검증

**로컬 (단계마다 1회)**
- `npm run typecheck:build`
- vitest: `admin-action-queue-registry-contract`, 새 `admin-action-queue-count-list-parity`, `lib/admin/notifications/__tests__/*`, 사이드바 계약
- 변경 파일 eslint
- `npm run check:i18n-quality`

**운영 DB (적용 후, 읽기 전용)**
- `admin_action_queue_counts(<화면과 같은 조건값>)` 의 카테고리별 숫자 = 각 CTA 목록 함수 total.
  - `delivery_ad_ops` ↔ `admin_delivery_ad_campaigns_page('all','actionable',…)`
  - `community_reports` ↔ `admin_community_report_groups_page(…'pending'…)` total
  - 나머지는 감사서 §2 의 대조 SQL
- 기대(11-24 데이터): 종 total 0. CTA 화면 `actionable` 0건.

**화면 (Owner 화면 기준)**
- 최고관리자 로그인으로 종 → CP `#action-queue` → 각 카드 클릭 → 목록 건수 = 카드 숫자인지 확인한다.
- 운영 사이트 브라우저 열기는 10회 상한에 포함된다(실기 시험 상한 규정).
- 화면 확인 전까지는 **NOT_PROVEN**.

## 8. 진행 순서

1. 단계 1 PR (웹) → 로컬 검증 → 자동 병합 등록. Owner 구현 지시가 있으면 반영까지 승인 범위다.
2. 단계 2 마이그레이션 + TS 조건값: **운영 DB 적용 승인 후**. 적용 → §7 SQL → 같은 PR 병합(자동 병합 예외: 「운영 DB 적용이 먼저 필요한 변경」).
3. §6 데이터 정리: 별도 승인 시에만.

## 9. 단계 1 구현 결과 (2026-11-24)

구현함: §3-1 CTA 8개 · §3-2 권한 4개 · §3-3 묶음 배지·배지 키 교체(`cash_charges` 에 `delivery-ads-cash-queue` 추가 — entryAlias 메뉴도 사이드바에 그려짐 확인: `filterMenuForPublicSidebar` 는 `sidebarPublic` 만 거른다) · §3-4 C1·C2·C3(줄별 「읽음」) · §3-5 자동 읽음 3곳 · §3-6 cron 500 · §3-7 계약 시험.

설계와 다르게 한 것 (구현 중 영향 확인 후 보류):
- **C1-b 입점 신청 dedupe 키 — 바꾸지 않음.** 신청은 매번 새 매장 행, 재제출은 `approval_status = revision_requested` 조건부 UPDATE 라 같은 요청 재시도는 409 로 끝나 알림이 두 번 나가지 않는다. 재제출이 여러 번이면 각각 알림이 맞다 → 실제 결함 아님.
- **S8 고객 답장 알림 `requiredPermission: "support"` — 보류.** 이 값을 넣으면 생성 시 권한 없는 담당자가 `skippedRecipients` 로 빠지고, 같은 함수의 자기 복구가 **문의를 미배정으로 되돌린다**(고객지원 배정 동작 변경). 알림 범위를 넘는 변경이라 Owner 결정 필요로 남긴다.
- **C3 예산 경보 링크 — 넣지 않음.** 예산 표를 보여주는 관리자 화면이 없다(`/admin/performance` 에 예산 표 없음). 줄별 「읽음」만 추가.
- 받은 알림 「모두 읽음」 범위·헤더 1000건 한도는 §5 그대로(범위 밖).
