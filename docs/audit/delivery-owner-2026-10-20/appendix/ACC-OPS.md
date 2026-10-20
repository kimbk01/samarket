# ACC-OPS 감사 — 매장 계정·입점·계약·권한 + 매장 운영

- 감사일: 2026-10-20 (PHT) · 방식: 코드 정독 + 운영 DB(`ckdosyydvgzqwpbwuhon`) 읽기 전용 카탈로그/집계 SELECT
- 수정·커밋·DDL 없음. 관리자/사장님 화면 실로그인 불가 → 런타임 동작은 NOT_PROVEN 으로 구분.
- 운영 DB 규모(집계): `stores` 17행(전부 `approved`; visible 14 / 판매권한 approved 11), `store_orders` 836, `store_reviews` 417(사장님 답글 3), `store_inquiries` 0, `store_reports` 0, `store_business_verifications` 0, `store_order_daily_stats` 0.

---

## 1. 범위 및 조사 대상 목록 (총 71개)

### 1-A. 라우트/UI (16)
| # | 대상 |
|---|---|
| 1 | `app/(main)/stores/owner/apply/page.tsx` (입점 신청) |
| 2 | `app/(main)/stores/owner/ops-status/page.tsx` + `components/business/owner/OwnerStoreOpsStatusBody.tsx` |
| 3 | `app/(main)/stores/owner/settings/page.tsx` (노출 토글) |
| 4 | `components/business/admin/BusinessAdminOpenToggle.tsx` (영업 on/off) |
| 5 | `components/stores/owner/dashboard/OwnerHomeStoreStatusCard.tsx` |
| 6 | `components/business/OwnerStoreProfileForm.tsx` (영업시간·휴무 입력) |
| 7 | `components/stores/StoreDetailInfoPublic.tsx` (공개 휴무 표기) |
| 8 | `app/(main)/stores/owner/{reviews,inquiries,customer-care,notices,finance}` 목록 확인 |
| 9 | `app/admin/business/page.tsx`, `app/admin/business/[id]/page.tsx` (존재 확인) |
| 10–16 | `components/stores/{StoreDetailPublic,StoreSlugStickyBar,StoreProductPublic,StoreProductAddSheet,StoreCommerceCartPageClient}.tsx` 열림상태 소비처 (grep) |

### 1-B. API (27)
`app/api/me/stores/route.ts`(GET/POST) · `app/api/me/stores/[storeId]/route.ts`(PATCH) · `app/api/me/stores/[storeId]/**` 49개 route 소유자 게이트 전수 grep (getStoreIfOwner / getCachedStoreIfOwner) · `.../notices/route.ts`, `.../notices/[noticeId]`, `.../inquiries/[inquiryId]`, `.../banners/[bannerId]`, `.../menu-sections/[sectionId]`, `.../products/[productId]`, `.../reviews/[reviewId]/reply`, `.../points`(410), `.../point-charges`(410), `.../platform-inquiries`, `.../finance/withdrawals`, `.../gift-certificates/products` · `app/api/admin/stores/[id]/route.ts`(GET/PATCH) · `app/api/admin/stores/route.ts` · `app/api/admin/users/[id]/delete/route.ts` · `app/api/me/leave-request/route.ts` · `app/api/me/store-orders/route.ts` · `app/api/me/store-reviews/route.ts` · `app/api/stores/[slug]/route.ts` · `app/api/stores/[slug]/notices/route.ts` · `app/api/stores/route.ts` · `app/api/stores/home-feed/route.ts` · `app/api/business-info/route.ts` · `app/api/cron/stores-discovery-schedule-transitions` (vercel.json)

### 1-C. lib (16)
`lib/stores/classify-stores-insert-unique-violation.ts` · `lib/stores/owner-product-gate.ts` · `lib/stores/owner-store-ownership-cache.ts` · `lib/admin-business/admin-store-decision.ts` · `lib/admin-business/admin-store-decision-rules.ts` · `lib/stores/validate-store-order-checkout.ts` · `lib/stores/store-orderability-policy.ts` · `lib/stores/store-auto-hours.ts` · `lib/stores/serialize-store-business-hours-json.ts` · `lib/stores/store-commerce-extras.ts` · `lib/stores/store-discovery-eligibility.ts` · `lib/stores/get-approved-store-by-slug.ts` · `lib/stores/after-canonical-store-location-write.ts` · `lib/stores/store-public-shared-cache-generation.ts` · `lib/stores/store-first-listed-at.ts` · `lib/supabase/client.ts`

### 1-D. DB 객체 (12, 운영 카탈로그 검증)
테이블/정책: `stores`(인덱스 19·정책 4·트리거 3·컬럼 GRANT), `store_sales_permissions`(정책 2), `store_business_verifications`(정책 3), `store_inquiries`(정책 3), `store_products`(정책 2), `store_menu_sections`(정책 4), `store_reviews`(UNIQUE·트리거), `store_order_events`, `store_order_deliveries`, `store_cash_*`/`store_economic_point_*`(SELECT 전용 확인), `store_notices`(부재) · RPC `create_store_order_atomic`(SECURITY DEFINER, service_role 전용) · 트리거 함수 `ensure_store_sales_permission_row`, `stores_protect_first_listed_at`, `store_orders_enforce_cash_order_gate`, `trg_store_reviews_refresh_rating_aggregate` · 마이그레이션 `20270101120000_stores_one_owner_one_store_unique.sql`, `20260507141000_store_notices.sql`, `20260823190000_stores_first_listed_at_authority.sql`, `supabase_migrations.schema_migrations`, `audit_logs`(target_type='store' 집계)

---

## 2. 기능별 현황표

| 기능 | UI | API | DB | 업무 | 운영 | 판정 | 근거 |
|---|---|---|---|---|---|---|---|
| 1계정 1매장 | 신청 페이지가 기존 매장 표시 | POST 사전조회 409 | **UNIQUE INDEX `stores_one_owner_one_store_uidx`** (prod 확인) + 23505 분류 | OK | 중복 0 | PASS | `app/api/me/stores/route.ts:128-145`, `lib/stores/classify-stores-insert-unique-violation.ts:12-27`, pg_indexes |
| 입점 신청 생성 | apply 폼 | 필수값·슬러그·예약어·전화중복 검사 | **RLS `stores_insert_owner` 가 모든 컬럼 INSERT 허용**(approval_status 포함) | API 우회 시 심사 생략 | NOT_PROVEN | FAIL (ACC-01) | route.ts:85-327, pg_policies |
| 심사 전이(승인/반려/보완/중지/재개) | 관리자 화면 | 전이표+상태조건부 UPDATE+감사로그+알림 | DB 전이 강제 없음 | 반려=종착(재신청 불가) | approve 감사 2건/승인 17 | 부분 PASS / ACC-04 | `app/api/admin/stores/[id]/route.ts:221-307`, `admin-store-decision-rules.ts:16-24` |
| 판매권한 승인 | 관리자 | approve/reject/suspend_sales | RLS admin 전용 쓰기 | 매장 중지 시 판매권한 유지 | prod: approved+visible+sales pending 3곳 | PASS(별도 상태) | route.ts:733-786, pg_policies |
| 사장님 권한 분리(RLS) | – | API 는 service-role + owner_id 비교 | **`stores_update_owner_or_admin`: 컬럼 제한·WITH CHECK 없음, authenticated 전 컬럼 UPDATE GRANT** | 사장님이 승인·노출·포인트차단·추천·평점 직접 변경 가능 | NOT_PROVEN(악용 흔적 미조사) | FAIL P0 (ACC-01) | pg_policies, information_schema.column_privileges, `lib/supabase/client.ts:15-36` |
| owner 라우트 IDOR | – | 49 route 모두 소유자 게이트 + 하위리소스 `.eq("store_id")` | – | – | – | PASS | grep 결과, `owner-product-gate.ts:12-37` |
| 사업자 정보·필수 서류 | 없음 | 없음 | `store_business_verifications` 존재·0행·코드 미사용, owner UPDATE WITH CHECK 없음 | 서류 없이 승인 | 0행 | FAIL(누락) ACC-05 | grep 0건, SQL count |
| 계약 상태·변경 이력 | – | 관리자 결정만 감사로그 | `audit_logs` store 40행 | 사장님 매장정보 변경(주소·전화·영업·노출) 이력 없음 | approve_store 2 / 승인 매장 17 | FAIL ACC-06 | `app/api/me/stores/[storeId]/route.ts:330-389`, SQL |
| 회원 탈퇴/영구정지 시 매장 | – | 탈퇴 처리에 매장 처리 없음 | – | 탈퇴 사장 매장이 계속 주문 수신 | 현재 해당 0 | FAIL ACC-03 | `app/api/admin/users/[id]/delete/route.ts:100-160`, `validate-store-order-checkout.ts:150-180` |
| 승인 전/중지 후 주문 차단 | 상세 404 | TS 검증 + RPC 재검증 | RPC `FOR UPDATE` 후 approval/visible/is_open/point/sales 재검사 | OK (단 ACC-01 로 상태 자체 위조 가능) | – | PASS(조건부) | `app/api/me/store-orders/route.ts:296-306`, RPC 본문 |
| 스태프/부운영자 계정 | 없음 | 없음 | 없음 | – | – | 누락(설계) | grep: `lib/business/my-business-nav-types.ts:13` 타입만 |
| 매장정보·소개·사진 수정 | 폼 | PATCH (rejected/suspended 차단) | – | email 이 전화번호 정규화로 소실 | NOT_PROVEN | FAIL OPS-05 | `[storeId]/route.ts:189-197` |
| 영업시간(자동)·휴게 | 폼 | sanitize 후 저장 | NOT NULL 컬럼에 null 쓰기 경로 | 요일별·정기휴무·임시휴무 미지원 | 자동시간 적용 매장 1 | 부분 FAIL OPS-03 | `store-auto-hours.ts:65-187`, `StoreDetailInfoPublic.tsx:196-203` |
| 영업 on/off 토글 | 스위치(승인 매장만) | is_open PATCH | RPC 가 is_open 재확인 | 사장님 카드가 실효 상태(스케줄·휴게) 미반영 | – | 부분 FAIL OPS-04 | `BusinessAdminOpenToggle.tsx:27-60`, `OwnerHomeStoreStatusCard.tsx:24` |
| 노출(is_visible) 토글 | 승인 매장만 | **pending 등에서도 허용** | first_listed_at 트리거가 승인 무관 스탬프 | 신규매장 정렬 오염 | 0건 | FAIL P3 OPS-07 | `[storeId]/route.ts:29,203-207`, `settings/page.tsx:65-99`, 트리거 정의 |
| 바쁨 일시정지/준비시간 | 없음 | 없음 | 없음 | – | – | 누락(설계) | grep 0 |
| 최소주문금액 | 폼(business_hours_json) | TS 검증 | RPC `v_min_order_php` 재검증 | OK | – | PASS | `validate-store-order-checkout.ts:286-289`, RPC |
| 픽업/배달 지원 플래그 | 폼 | TS 검증 | RPC 미재검증 | 경합 시 플래그 무시 가능(ms) | – | P3 OPS-08 | `validate-store-order-checkout.ts:182-190`, RPC 텍스트 검색 |
| 매장 공지 | owner 공지 화면 | CRUD | **운영 DB 에 `store_notices` 테이블 없음** (마이그레이션은 적용 기록) | 작성 500, 조회 빈목록 위장 | 테이블 부재 | FAIL P2 OPS-01 | `notices/route.ts:37-51,97-116`, SQL |
| 리뷰·평점·답글 | 답글 UI | 소유자+store_id 범위, 알림 | 주문당 UNIQUE, 집계 트리거 | 평점 집계 정합 | 17매장 정합(공개 필터 기준) | PASS (P3 i18n) | `reviews/[reviewId]/reply/route.ts`, SQL |
| 고객 문의 | 목록/답변 | 소유자 게이트 | RLS owner UPDATE 가 고객 원문 변경 허용 | 원문 위변조 가능 | 0행 | FAIL P2 OPS-06 | pg_policies `store_inquiries_update_owner` |
| 신고 | – | buyer/admin 라우트 | admin SELECT 정책 | – | 0행 | NOT_PROVEN | `app/api/admin/store-reports/**` 존재 |
| 통계·매출 분석 | finance/settlements | – | `store_order_daily_stats` 0행·코드 미사용 | 일/주/메뉴별 분석 없음 | 0행 | 누락(설계) | grep 0 |
| 구매자 노출 영업상태 SSOT | 상세/홈/검색/장바구니 | `resolveStoreFrontOpen`·`resolveStoreDiscoveryEligibility` 공통 | browse 는 `discovery_schedule_state` 투영(5분 cron) | 사장님 쓰기 후 타 인스턴스 캐시 미무효화 | – | 부분 FAIL OPS-02 | `store-public-shared-cache-generation.ts:92`, grep bump 호출처 |
| "주문 도착 중 마감" 경합 | – | TS 검증 후 RPC | RPC 가 `stores` 행 `FOR UPDATE` 후 `is_open IS FALSE` 재검사 (사장님 UPDATE 와 직렬화) | 스케줄·휴게 마감은 RPC 미검사 | – | PASS(is_open) / P3(스케줄) | RPC 본문 |

---

## 3. 결함 목록

### ACC-01 — 사장님이 Supabase REST 로 `stores` 행을 전 컬럼 직접 수정·생성 가능 (심사·중지·차단·추천·평점 우회)
- 영역: 계정/계약 권한(RLS)
- 증상: 로그인한 사장님은 브라우저에 이미 있는 anon key + 본인 JWT(`lib/supabase/client.ts:15-36`, `createBrowserClient`)로 `PATCH /rest/v1/stores?id=eq.<내매장>` 를 호출해 `approval_status`, `is_visible`, `suspended_reason`, `point_commerce_blocked`, `point_balance`, `is_featured`/`featured_*`, `rating_avg`/`review_count`/`completed_orders_30d`, `owner_can_edit_store_identity`, `admin_internal_memo`, `owner_user_id` 등을 임의 값으로 바꿀 수 있다. 신규 가입자는 `POST /rest/v1/stores` 로 `approval_status='approved', is_visible=true` 행을 바로 만들 수 있다.
- 원인(운영 DB 확인):
  - `pg_policies`: `stores_update_owner_or_admin` UPDATE `qual=(owner_user_id = auth.uid()) OR internal.is_admin_user()`, **with_check NULL**; `stores_insert_owner` INSERT `with_check=(owner_user_id = auth.uid())` 만.
  - `information_schema.column_privileges`: `authenticated`·`anon` 에 `stores` **전 컬럼 INSERT/UPDATE** 권한.
  - `stores` BEFORE UPDATE 트리거는 `set_updated_at`, `stores_protect_first_listed_at`, `ensure_store_sales_permission_row` 뿐 — 보호 컬럼 가드 없음.
  - 이 정책들은 repo 마이그레이션에 정의가 없다(`grep stores_update_owner_or_admin supabase/` 0건) → 대시보드/수동 생성 드리프트.
- 영향:
  - 중지(suspended) 매장이 스스로 `approved`+`is_visible=true` 로 복귀 → `suspend_store` 는 판매권한을 건드리지 않으므로(`app/api/admin/stores/[id]/route.ts:268-273`) 판매권한이 approved 였던 매장은 **즉시 주문 재수신**(RPC 재검사는 위조된 값을 그대로 신뢰).
  - `point_commerce_blocked=false` 로 포인트 차단 자가 해제 → RPC 차단 우회.
  - `is_featured`(홈 추천 선반 `stores-home-composition-default-policy.ts:120`)·`rating_avg`·`completed_orders_30d`(discovery 정렬) 조작 → 유료/알고리즘 노출 부정.
  - 심사 없이 approved 상태 매장 생성(판매권한 행은 트리거로 pending 생성되어 주문은 불가하나 목록 노출·검색 노출 가능).
  - `owner_user_id` 를 다른 회원으로 변경(동의 없는 매장 이전) 가능.
- 심각도: **P0** (major authz bypass, 주문 무결성)
- 현행 동작: 앱 API 는 서비스롤로만 쓰고 필드 화이트리스트를 지키지만, DB 가 사용자 JWT 직접 쓰기를 막지 않음.
- 기대 동작: 사장님은 `stores` 에 직접 INSERT/UPDATE 불가(또는 운영 컬럼만), 상태·노출·포인트·추천·평점·소유자 컬럼은 서비스롤/관리자 RPC 만 변경.
- 수정 설계:
  1. 마이그레이션: `REVOKE INSERT, UPDATE, DELETE ON public.stores FROM anon, authenticated;` (앱 쓰기 경로는 전부 service-role: `tryGetSupabaseForStores`), 정책 `stores_insert_owner`·`stores_update_owner_or_admin` DROP. 관리자 브라우저 직접 쓰기 경로가 있으면 사전 grep(`getSupabaseClient().from("stores").update`) 후 API 이관.
  2. 다층 방어: `BEFORE INSERT OR UPDATE` 트리거 `stores_guard_protected_columns` — `current_setting('request.jwt.claim.role', true) IN ('anon','authenticated')` 인 경우 `approval_status, is_visible(승인 전), suspended_reason, rejected_reason, approved_at, point_*, is_featured, featured_*, rating_avg, review_count, completed_orders_30d*, view_count, favorite_count, owner_user_id, owner_can_edit_store_identity, admin_internal_memo, first_listed_at, discovery_*` 변경 시 예외.
  3. 같은 패턴 점검: `store_products_owner_all`(RLS 로 사장님이 판매권한·승인과 무관하게 `product_status='active'` 직접 설정 — API 의 `canOwnerSellProducts` 우회), `store_menu_sections_*`, `store_business_verifications`(ACC-05), `store_inquiries`(OPS-06) 도 authenticated 쓰기 REVOKE.
  4. 정책 정의를 마이그레이션으로 코드화(드리프트 제거).
- 연동 영향: 브라우저 Realtime/SELECT 는 영향 없음(SELECT 정책 유지). 사장님 화면 저장은 모두 `/api/me/stores/**` 경유라 영향 없음(NOT_PROVEN — 클라이언트 직접 쓰기 grep 필요).
- 검증 방법: 스테이징 아님(테스트 DB 금지) → 운영 적용 전 `has_column_privilege('authenticated','public.stores','approval_status','UPDATE')=false` 확인 SQL, 적용 후 동일 SQL + 사장님 계정 JWT 로 REST PATCH 403/42501 확인(Owner 승인 하 1회).
- Owner 승인 필요: 운영 DB 권한·RLS 변경(개발 프로세스 2번).
- 증명 상태: **DB 카탈로그로 PROVEN**(정책·GRANT·트리거). 실제 악용 여부·실 REST 호출은 NOT_PROVEN(실행 금지).

### ACC-02 — 사장님 직접 REST 로 `store_products` 판매 활성화(판매권한 미승인·매장 중지 상태 포함)
- 영역: 권한
- 원인: `store_products_owner_all` ALL 정책 `qual/with_check = is_admin_user() OR 소유자` (prod). API 는 `products/[productId]/route.ts:168,402` 에서 승인·판매권한을 검사하지만 RLS 는 무조건 허용.
- 영향: 주문 RPC 가 `store_sales_permissions`·`approval_status` 를 재검사하므로 **주문 생성은 막힘** → 영향은 메뉴 노출 상태 불일치(공개 RLS `store_products_public_active` 는 판매권한 조건 포함). 가격 변경 자체는 소유자 권한이므로 정상.
- 심각도: P2 (상태 불일치, ACC-01 수정 시 함께 처리)
- 수정 설계: ACC-01 의 3번 — `store_products` authenticated INSERT/UPDATE/DELETE REVOKE (API 경유 강제).
- 검증: `has_table_privilege('authenticated','public.store_products','UPDATE')=false`.
- Owner 승인: 운영 DB 권한 변경. · 증명: DB 카탈로그 PROVEN, 런타임 NOT_PROVEN.

### ACC-03 — 탈퇴(withdraw) 처리된 사장님의 매장이 계속 노출·주문 수신
- 영역: 계약 종료/탈퇴 데이터 처리
- 증상: 관리자 `withdraw` 는 `profiles` 패치·세션 무효화·푸시 토큰 비활성만 수행(`app/api/admin/users/[id]/delete/route.ts:100-160`). `stores.approval_status/is_visible`·판매권한은 그대로. 주문 검증(`validate-store-order-checkout.ts:150-180`)과 RPC 는 사장님 계정 상태를 보지 않는다. 사용자 탈퇴 요청(`app/api/me/leave-request/route.ts:36-55`)도 매장 미처리.
- 영향: 처리할 사람 없는 매장에 주문 접수 → 주문자 미처리·환불 분쟁(주문/매장/관리자).
- 심각도: P1
- 기대 동작: 탈퇴·영구정지 시 매장 `suspended`(사유 `owner_withdrawn`) + 판매권한 suspended + 진행 중 주문 관리자 큐 노출; 미처리 진행 주문이 있으면 탈퇴 차단 또는 경고.
- 수정 설계: withdraw 분기에 `stores` 조건부 UPDATE(`approval_status='approved'→'suspended'`, `is_visible=false`) + `store_sales_permissions` suspend + `appendAuditLog(action='store.owner_withdrawn_suspend')`; 진행 중 주문 수 사전 조회 → 응답에 `active_store_orders` 반환해 확인창. leave-request 접수 시 관리자 알림에 "매장 보유" 표기.
- 연동 영향: 정산·캐시(별도 도메인) 잔액 처리 정책 필요.
- 검증: vitest(withdraw 시 stores patch 호출), 운영 `SELECT count(*) FROM stores s JOIN profiles p ... WHERE p.deleted_at IS NOT NULL AND s.is_visible` = 0 (현재 0 확인).
- Owner 승인: 탈퇴 시 매장 처리 정책(아래 7절). · 증명: 코드 PROVEN, 운영 해당 사례 0(현재 피해 없음).

### ACC-04 — 반려(rejected) 매장은 영구 종착: 재신청·재심사 경로 없음
- 영역: 입점 심사
- 원인: 전이표에 `rejected` 출발 전이 없음(`admin-store-decision-rules.ts:16-24`), 사장님 PATCH 는 rejected 차단(`[storeId]/route.ts:29,120-125`), 신규 신청은 1계정 1매장 UNIQUE(`stores_one_owner_one_store_uidx`, 상태 무관) + API 사전조회(`app/api/me/stores/route.ts:128-145`, 주석 "상태와 무관"). 삭제 API 없음.
- 영향: 오타·서류 미비로 반려된 사업자는 계정을 새로 만들지 않으면 영원히 입점 불가(=다계정 유도 → 1계정 1매장 정책 취지 훼손).
- 심각도: P2
- 기대: `reject_store` 후 사장님 "재신청"(→ pending, 내용 수정 허용) 또는 관리자 `reopen_application`(rejected→revision_requested).
- 수정 설계: `ALLOWED_FROM.request_revision` 에 `"rejected"` 추가(관리자 재오픈) + 사장님 화면 안내. 또는 UNIQUE 를 partial(`WHERE approval_status <> 'rejected'`)로 바꾸는 안(데이터 다건 허용) — 정책 결정 필요.
- 검증: 전이표 단위 테스트, 운영 rejected 0건이라 데이터 영향 없음.
- Owner 승인: 정책 결정. · 증명: 코드 PROVEN.

### ACC-05 — 사업자 정보·필수 서류 심사 기능 부재(테이블만 존재, 쓰기 정책 취약)
- 영역: 입점/계약
- 증상: 입점 신청 바디에 사업자등록번호·대표자·영업신고증·정산계좌 서류 없음(`app/api/me/stores/route.ts:49-75`). `store_business_verifications` 테이블은 prod 존재(0행)·앱 코드 참조 0건. `app/api/business-info` 는 **플랫폼** 사업자 정보 공개 API 로 매장과 무관(`app/api/business-info/route.ts:1-50`).
- 추가 결함: 해당 테이블 정책 `store_biz_ver_update_owner_admin` 이 `qual=(is_admin_user() OR owner_user_id=auth.uid())`, with_check 없음 → 기능을 붙이는 순간 사장님이 `business_verification_status='approved'` 자가 승인 가능.
- 심각도: P2 (누락 기능 + 잠재 authz)
- 수정 설계: 기능 도입 시 owner 는 제출 RPC(서류 URL·번호만), 상태·검토 컬럼은 관리자 RPC 전용, authenticated UPDATE REVOKE. 승인(`approve_store`) 전 검증 완료 조건(정책에 따라).
- Owner 승인: 필리핀 DTI/BIR/Mayor's permit 등 요구 서류 정책. · 증명: PROVEN(코드 grep·SQL).

### ACC-06 — 사장님 매장 정보 변경 이력(감사) 없음 / 승인 후 핵심정보 무심사 변경
- 영역: 계약 변경 이력
- 원인: 사장님 PATCH 는 `revision_requested→pending` 재제출 때만 감사로그(`[storeId]/route.ts:364-389`). 주소·좌표·전화·영업시간·최소주문·배달비(`business_hours_json` 내)·노출·영업 토글 변경은 기록 없음. 운영 `audit_logs` target_type='store' 40행(관리자 액션만, approve_store 2건 vs 승인 매장 17 — 과거 승인은 기록 이전).
- 영향: 분쟁 시 "언제 최소주문/배달비/주소를 바꿨는지" 추적 불가(관리자·주문자).
- 심각도: P2
- 수정 설계: 사장님 PATCH 성공 후 `appendAuditLog({actor_type:'user', action:'store.owner_update', before_json: currentRow 의 변경 키 subset, after_json: patch})` — 이미 `currentRow` 를 읽고 있으므로 select 컬럼만 확장. 고빈도 `is_open` 은 동일 기록(운영 증빙 가치 큼).
- Owner 승인: 승인 후 주소·상호 변경 시 재심사 여부(정책). · 증명: 코드 PROVEN.

### OPS-01 — 운영 DB 에 `store_notices` 테이블이 없음 → 매장 공지 작성 500, 조회는 빈 목록으로 위장
- 원인: `supabase_migrations.schema_migrations` 에 `20260507141000 store_notices` 적용 기록 존재, 그러나 `to_regclass`/information_schema 에 테이블 없음(SQL 결과: notice 계열 테이블에 store_notices 부재). owner GET 은 missing 시 `{ok:true, notices:[], meta:{migration_pending:true}}` (`app/api/me/stores/[storeId]/notices/route.ts:47-51`), POST 는 `insErr.message` 500(`:97-116` 부근), 공개 GET 도 빈 목록(`app/api/stores/[slug]/notices/route.ts:36-41`).
- 영향: 사장님 공지 기능 전부 불능, 오류가 조용히 숨겨짐. `docs/customer-platform/original-goal-alignment-final-audit.md:36,216` 은 PROVEN 으로 기재(문서 불일치).
- 심각도: P2
- 수정 설계: 테이블 drop 경위 확인 후 마이그레이션 재적용(새 버전 파일로 `CREATE TABLE IF NOT EXISTS` + RLS service-role 전용), missing 시 `ok:true` 대신 503 `store_notices_unavailable` 로 노출.
- 검증: `select to_regclass('public.store_notices')` not null; owner POST 200.
- Owner 승인: 운영 DB 적용. · 증명: DB PROVEN, UI 런타임 NOT_PROVEN.

### OPS-02 — 사장님 쓰기(영업 on/off·영업시간·메뉴·공지 등)는 인스턴스 공통 공개 캐시 세대를 올리지 않음
- 원인: `bumpStorePublicSharedCacheGeneration` 호출처는 관리자 라우트뿐(grep: `app/api/admin/stores/[id]/route.ts:219,525`, admin products/coupons/taxonomy 등). 사장님 PATCH 는 `afterCanonicalStoreLocationWrite`(로컬 프로세스 캐시만, `lib/stores/after-canonical-store-location-write.ts:30-55`)와 클라이언트 `invalidateStorePublicCachesForSlug`만 호출. 문서 주석상 타 인스턴스는 TTL 20~60s 동안 이전 값 유지(`lib/stores/store-public-shared-cache-generation.ts:6-21`).
- 영향: 사장님이 "영업 종료"해도 다른 인스턴스 경유 구매자는 최대 수십 초 "영업중"·옛 메뉴를 봄 → 결제 단계에서 `store_closed`/`product_not_available` 오류(주문 무결성은 RPC 가 보장, 상태/UX 불일치).
- 심각도: P2
- 수정 설계: `/api/me/stores/[storeId]` PATCH·products·menu-sections·notices·banners 쓰기 성공 후 `bumpStorePublicSharedCacheGeneration('owner_store.<key>')` 1회(이미 DEF-64 에서 관리자에 적용한 동일 계약).
- 검증: vitest(라우트가 bump 호출), 운영 2인스턴스 재현은 NOT_PROVEN.
- 증명: 코드 PROVEN(호출처 grep).

### OPS-03 — 휴무일·임시휴무·요일별 영업시간이 주문 가능 판정에 반영되지 않음
- 원인: 판정 SSOT `resolveStoreFrontCommerceState` 는 단일 일일 open/close + 휴게 + `is_open` 만(`lib/stores/store-auto-hours.ts:65-93,149-187`). 휴무는 자유 텍스트(`OwnerStoreProfileForm.tsx:107,296-298` → 공개 `StoreDetailInfoPublic.tsx:196-203,378` 표기만). 주석 "임시휴무 반영"(`store-auto-hours.ts:146`)과 구현 불일치.
- 영향: "매주 월요일 휴무"라 적어도 월요일 주문 접수 → 사장님 거절·고객 불만. 사장님은 매번 수동 토글 필요.
- 심각도: P2
- 수정 설계: `business_hours_json.auto_business_hours` 에 `weekly: {mon..sun: [{open,close}]|null}`, `closed_dates: [YYYY-MM-DD]`, `temporary_closure: {from,to,reason}` 추가 → `isNowWithinAutoSchedule` 확장(타임존 Asia/Manila), discovery 투영(`compute-discovery-schedule-projection`) 동일 함수 사용, RPC 는 OPS-08 과 함께 서버 판정값 전달 또는 SQL 함수화.
- 증명: 코드 PROVEN. 운영: 자동시간 적용 매장 1곳, 휴무 텍스트 0곳.

### OPS-04 — 사장님 화면의 영업 상태는 DB `is_open` 원값, 구매자는 실효 상태(스케줄·휴게)
- 원인: `OwnerHomeStoreStatusCard.tsx:24` `parsePostgresBool(row.is_open, true)`, `BusinessAdminOpenToggle.tsx:11-14` 동일. 구매자/관리자는 `resolveStoreFrontOpen`(`app/api/stores/route.ts:117`, `store-discovery-eligibility.ts:60`, `load-business-control-center-detail.ts`).
- 영향: 휴게·영업시간 밖인데 사장님 카드 "영업중" → "왜 주문이 안 오지" 혼선.
- 심각도: P3
- 수정 설계: 카드에 `resolveStoreFrontCommerceState(business_hours_json, is_open)` 결과(영업중/휴게중/영업시간 외/수동마감)를 라벨로 표시, 토글은 수동 플래그임을 명시.
- 증명: 코드 PROVEN.

### OPS-05 — 사장님 이메일 저장 시 PH 휴대폰 정규화를 적용 → 이메일 소실
- 원인: `app/api/me/stores/[storeId]/route.ts:189-197` `const norm = normalizePhMobileDb(et); patch.email = norm;` (이메일 문자열은 휴대폰 형식이 아니므로 null 반환 가능 → 기존 이메일 null 로 덮어씀).
- 심각도: P3
- 수정: 이메일 검증(`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, 길이 ≤254) 후 소문자 저장, 실패 시 400 `invalid_email`.
- 검증: vitest — `email:"a@b.com"` → patch.email === "a@b.com".
- 증명: 코드 PROVEN — `lib/utils/ph-mobile.ts:106-110` 은 PH 휴대폰 정규식 불일치 시 `null` 반환 → 이메일은 항상 null 로 저장.

### OPS-06 — 고객 문의 원문을 사장님이 DB 직접 수정 가능
- 원인: `store_inquiries_update_owner` UPDATE qual/with_check 가 "매장 소유자" 만 확인, 컬럼 제한 없음 + authenticated UPDATE GRANT. 사장님이 `subject/content/from_user_id/created_at` 변경 가능.
- 영향: 분쟁 증거 위변조(주문자·관리자). 현재 0행.
- 심각도: P2
- 수정: authenticated UPDATE REVOKE(답변은 `/api/me/stores/[storeId]/inquiries/[inquiryId]` service-role 경유), 또는 컬럼 GRANT 를 `answer, status, answered_*` 로 한정.
- 증명: DB PROVEN.

### OPS-07 — 미승인(pending/under_review/revision_requested) 상태에서 API 가 노출 토글 허용 → `first_listed_at` 조기 스탬프
- 원인: API 차단 집합이 rejected/suspended 만(`[storeId]/route.ts:29,120`), `is_visible` 패치 허용(`:203-207`). UI 는 승인 매장만 허용(`settings/page.tsx` approval 체크). 트리거 `stores_protect_first_listed_at` 는 승인 여부 무관하게 false→true 시 최초 스탬프·이후 영구 보존.
- 영향: 승인 전 토글 → 승인 후 실제 공개일보다 이른 `first_listed_at` → `stores-home-composer.ts:349` "신규 매장" 정렬 왜곡. 구매자 노출 자체는 approved 조건으로 막힘.
- 심각도: P3
- 수정: API 에서 `is_visible` 은 `approval_status==='approved'` 일 때만(아니면 409 `store_not_approved_for_visibility`, 관리자 API 와 동일 코드), 트리거에도 `NEW.approval_status='approved'` 조건 추가.
- 증명: 코드·트리거 PROVEN, 운영 비승인+first_listed_at 0건.

### OPS-08 — 주문 RPC 가 픽업/배달 지원 플래그·자동 영업시간·휴게를 재검증하지 않음 (TOCTOU 잔여)
- 원인: `create_store_order_atomic` 는 `stores` 를 `FOR UPDATE` 후 approval/visible/`is_open IS FALSE`/point/sales/min_order 재검사, 그러나 `pickup_available`/`delivery_available`/`auto_business_hours` 문자열 미포함(SQL 본문 텍스트 검색 결과 false). 해당 검증은 TS(`validate-store-order-checkout.ts:168,182-190`)뿐.
- 영향: TS 검증~RPC 사이(ms) 사장님이 배달 끔/스케줄 마감 시 1건 통과 가능. 수동 `is_open` 마감은 직렬화되어 안전.
- 심각도: P3
- 수정: RPC 에 `v_store.pickup_available/delivery_available` 대비 `p_order->>'fulfillment_type'` 검사 추가, 스케줄은 SQL 함수(`store_front_open_at(business_hours_json, now())`)로 이관 시 함께.
- Owner 승인: 운영 DB 함수 변경. · 증명: DB 텍스트 검색 PROVEN.

### OPS-09 — 영업시간/갤러리 null 저장 경로가 NOT NULL 컬럼과 충돌
- 원인: 사장님 PATCH `business_hours_json === null → patch.business_hours_json = null`(`[storeId]/route.ts:248-249`), `gallery_images_json` 동일(`:262-263`), 관리자 `set_business_hours` 도 null 허용(`app/api/admin/stores/[id]/route.ts:536-547`). 운영 컬럼 `business_hours_json NOT NULL DEFAULT '{}'`, `gallery_images_json NOT NULL DEFAULT '[]'`.
- 영향: null 전송 시 500(사용자에게 원문 DB 메시지 노출). 최소주문·배달비·결제수단이 같은 JSON 에 있어 "초기화" 의도도 실패.
- 심각도: P3
- 수정: null → `{}`/`[]` 로 치환. 아울러 `business_hours_json` 은 사장님·관리자 전체 덮어쓰기(lost update) 구조이므로 `updated_at` 기반 낙관적 잠금(`.eq('updated_at', expected)`→409) 권장.
- 증명: 코드·컬럼 정의 PROVEN.

### OPS-10 — 리뷰 답글 알림 제목·본문 한국어 하드코딩
- 원인: `app/api/me/stores/[storeId]/reviews/[reviewId]/reply/route.ts:128` `title: "사장님이 리뷰에 댓글을 남겼어요"` — 관리자 결정 알림은 `notifySafeT(language, ...)` 사용(`admin-store-decision.ts:62-73`)과 불일치.
- 영향: 필리핀 영어 사용자에게 한국어 푸시. · 심각도: P3
- 수정: `loadNotificationUserLanguage` + i18n 키 `notify_store_review_owner_reply_title`.
- 증명: 코드 PROVEN.

### (참고·타 도메인) X-01 — 수수료 트리거 운영 비활성
- `pg_trigger`: `store_orders.trg_store_orders_commission_lifecycle` **tgenabled='D'**. 마이그레이션 `20270510120000_store_commission_cash_ssot.sql:657-658` 은 활성 생성, `schema_migrations` 에 해당 버전 기록 없음(수동 적용 후 비활성 추정). AGENTS.md "수수료 부과는 DB 트리거만" 과 운영 상태 불일치 → 정산/수수료 감사 담당에 이관(보고만).

---

## 4. 누락 기능 (배민·요기요·쿠팡이츠 사장님 기능 대비 — 설계 제안, 결함 아님)
1. **스태프/직원 계정**(주문 접수 전용 권한, 다기기 로그인) — 현재 owner 1명만, `my-business-nav-types.ts:13` 에 `"staff"` 타입 이름만 존재.
2. **바쁨 일시정지·주문 접수 일시중지(N분)**·**조리 예상시간 설정** — 없음.
3. **요일별 영업시간·정기휴무·임시휴무 기간·공휴일** — OPS-03.
4. **사업자 서류 제출·검증·정산계좌 인증** — ACC-05 (`store_sales_permissions.settlement_*`, `kyc_status` 컬럼은 존재하나 사장님 입력 경로 미확인 → NOT_PROVEN).
5. **매장 폐업/계약 해지 요청**(사장님 발의) 및 해지 후 데이터 보존/열람 정책.
6. **매출·주문 통계 대시보드**(일/주/월, 메뉴별, 시간대별, 재주문률) — `store_order_daily_stats` 0행·미사용.
7. **리뷰 신고·블라인드 요청**, 리뷰 답글 템플릿.
8. **자동 접수/미접수 자동취소 타이머** 사장님 설정 (주문 도메인과 공동).
9. **매장 정보 변경 재심사 요청 흐름**(상호·주소·업종 변경 시 관리자 승인).
10. **소유권 이전(양도)** 정식 절차 — 현재는 ACC-01 경로로 비정상만 가능.

---

## 5. SSOT 표

| 데이터 | 권위 소스 | 이탈 소비처 |
|---|---|---|
| 입점 승인 상태 | `stores.approval_status` (쓰기: `PATCH /api/admin/stores/[id]` 전이표) | **사장님 JWT 직접 UPDATE/INSERT(ACC-01)**; 사장님 PATCH 재제출 `revision_requested→pending` 은 정상 예외 |
| 판매 가능 | `store_sales_permissions(allowed_to_sell, sales_status)` | `store_products_owner_all` 직접 활성화(ACC-02); `suspend_store` 와 독립(정책 확인 필요) |
| 1계정 1매장 | `stores_one_owner_one_store_uidx` | 없음 (API 사전조회는 보조) |
| 구매자 노출 | `approval_status='approved' AND is_visible` | 사장님 API 가 미승인 노출 토글 허용(OPS-07) |
| 주문 가능(영업) | `resolveStoreFrontCommerceState(business_hours_json, is_open)` (TS) + RPC `is_open` | 사장님 카드·토글(OPS-04, 원값), browse 투영 `discovery_schedule_state`(5분 cron 지연), RPC(스케줄 미검사 OPS-08), 휴무 텍스트(OPS-03) |
| 최소주문·배달비·결제수단 | `stores.business_hours_json` 내 commerce extras (`parseCommerceExtrasFromHoursJson`) + RPC 재계산 | 없음 (단 lost update 위험 OPS-09) |
| 매장 평점/리뷰수 | `refresh_store_public_rating_aggregate` 트리거 (공개 visible 기준) | 사장님 직접 UPDATE 가능(ACC-01). 운영 17매장 정합 확인 |
| 매장 공지 | `store_notices`(마이그레이션) | **운영 테이블 부재(OPS-01)** |
| 공개 캐시 무효화 | `bumpStorePublicSharedCacheGeneration` | 사장님 쓰기 경로 전부 미호출(OPS-02) |
| 매장 변경 이력 | `audit_logs` (target_type='store') | 사장님 변경 미기록(ACC-06) |
| 소유자 | `stores.owner_user_id` (`getStoreIfOwner`) | 직접 UPDATE 로 변경 가능(ACC-01) |

---

## 6. 기존 문서와 구현 차이
1. `docs/customer-platform/original-goal-alignment-final-audit.md:36,216` — "Store 공지(`store_notices`) PROVEN" ↔ 운영 DB 테이블 부재(OPS-01).
2. `lib/stores/store-auto-hours.ts:146` 주석 "임시휴무 반영" ↔ 구현은 단일 일일 스케줄+휴게만(OPS-03).
3. `app/api/me/stores/[storeId]/route.ts:86-88` 주석 "슬러그·승인 상태·오너는 변경하지 않음" — API 는 지키나 DB RLS 는 동일 변경을 허용(ACC-01). `stores` RLS 정책 4개는 마이그레이션에 정의 없음(드리프트).
4. `lib/admin-business/admin-store-decision-rules.ts` 전이표 주석(관리자 L2 노출 켜기 사유 필수, `admin/stores/[id]/route.ts:166-171`) ↔ 사장님은 사유·관리자 없이 노출 on/off 가능(정책 정합 확인 필요 — 7절).
5. AGENTS.md / `docs/store-commission-cash-settlement-ssot.md` "수수료는 DB 트리거만" ↔ 운영 트리거 비활성(X-01, 타 도메인).
6. `supabase/migrations/20270510120000_store_commission_cash_ssot.sql` 이 `schema_migrations` 에 미기록인데 객체(`store_cash_position`, 트리거)는 존재 → 마이그레이션 이력 신뢰도 저하.

---

## 7. Owner 정책 결정 필요 사항
1. **반려 후 재신청** 허용 방식: (a) 관리자 재오픈 전이(rejected→revision_requested) (b) UNIQUE 를 rejected 제외 partial 로 (c) 현행 영구 차단 유지. — 설계 권장 (a): 1계정 1매장 데이터 모델 유지.
2. **매장 운영 중지(suspend_store) 시 판매권한·진행 중 주문** 처리: 판매권한 동시 중지 여부, 진행 주문 강제 완료/취소 주체.
3. **회원 탈퇴·영구정지 시 매장** 자동 중지 및 미정산·캐시 잔액 처리(ACC-03).
4. **승인 후 상호·주소·업종 변경**의 재심사 여부와 변경 이력 보존 기간(ACC-06).
5. **노출(is_visible) 권한 주체**: 사장님 자율 vs 관리자 L2 승인(현재 혼재).
6. **사업자 필수 서류 목록**(DTI/SEC, BIR 2303, Mayor's permit, 신분증, 정산계좌)과 미제출 시 승인 차단 여부(ACC-05).
7. ACC-01/02/OPS-06 **운영 DB 권한·RLS 변경 적용 승인**(P0, 우선 처리 권장), OPS-01 `store_notices` 재생성, OPS-08 RPC 변경 승인.
8. 스태프 계정 도입 여부·권한 범위(주문 접수만/메뉴 품절만 등).
