# DIBAY Admin 거래 — 전면 감사 및 독립 운영 통합 설계안 (v2 최종 보완)

- 작성: 2026-10-19 (PHT) · 상태: **Owner 승인 ① (2026-10-19) — O-2: 모든 활성 관리자 동일 최고 권한(거래 Admin 전체 업무) · O-8: 원인 미확인 숨김 20건 현행 유지(판매자 복원 유지), 신규 관리자 숨김·삭제는 판매자가 해제 불가**
- **v2 보완 (Owner 지시 7항)** — v1 감사 52건과 설계 방향은 유지하고, 아래만 실제 증거로 확인해 반영했다.
  1. 거래글 판정 기준 ↔ 사용자 앱 포함 기준 대조, 200건 무누락 보장 → **§F-1-0**
  2. hidden 20건 이관 재검토 → **§F-1-1-B** (v1 정정: 관리자 기록이 있는 숨김 글은 **0건**. v1 의 「5건」은 지금 노출 중인 다른 글 1개의 기록이었다)
  3. 판매 상태·관리자 노출·판매자 삭제 분리 + 완료·예약 보존, 완료 시각 임의 생성 금지 → **§F-1-1**, §E-4 (M3 철회)
  4. 홍보·포인트 트랜잭션 경계 (감사 기록 실패 포함) → **§G-0**
  5. 공통 충전·회원·채팅 사용 시 다른 영역 메뉴·권한 의존 제거 → **§B-4**
  6. 전 페이지 UI/UX/CTA 최종 대조 → **§D-5**
  7. Owner 결정의 권장안과 실제 위험 분리, O-2·O-8 자동 승인 대상 아님 → **§I**
- 기준: 저장소 main HEAD `54253481` (#87 병합 후) + 운영 DB(`ckdosyydvgzqwpbwuhon`) **읽기 전용 SELECT**
- 재사용 기준: `docs/admin/dibay-admin-community-audit-design.md` (커뮤니티 설계 v2, PR #86·#87 반영분) — 같은 화면 틀·CTA 표·권한 매핑 방식을 거래에 그대로 적용한다.
- 판정: **PASS / DEFECT / MISSING / DUPLICATE / IMPROVEMENT / NOT_PROVEN** · 우선순위 **P0**(보안·금전·데이터 무결성) **P1**(독립 운영 필수) **P2**(UI/UX/CTA·메뉴)
- 범위: **웹만.** `android/**`·`ios/**`·`capacitor.config.ts` 변경 없음 → 네이티브 재빌드 불필요 (구현 시 `verify:native-version-bump` 로 재확인).

---

## 0. 한눈에 보기

| 질문 | 답 |
|---|---|
| 지금 거래 Admin 만으로 독립 운영 가능한가 | **불가.** ① 관리자 목록·대시보드가 실제 거래글 200건 중 **55건만** 보인다(145건 누락). ② 관리자 「삭제」는 DB 제약 위반으로 **항상 실패**한다. ③ 카테고리 관리 쓰기는 RLS 에 막혀 **저장이 안 되는데 성공으로 표시**된다. ④ 홍보·포인트·문의·회원·제재는 광고·재무·고객지원·회원 화면으로 나가야 하고, 거래 전용 활동 제한은 존재하지 않는다 |
| 확인된 결함·누락 | **52건** (P0 9 · P1 22 · P2 21) — §A-4 |
| 화면 | 기존 **13개** 수정 + 신설 **6개** = 거래 워크스페이스 **19개 화면** (§B·§C) |
| DB 변경 | **필요** — 마이그레이션 6종 (§H-2, v2 에서 M1·M3 철회). 기존 데이터 삭제 없음, 판매 상태 값 변경 없음 |
| 공통 SSOT 재사용 | 회원(`profiles`·`admin_memberships`), 원장(`point_ledger`), 충전(`point_charge_requests`), 홍보 주문(`point_promotion_orders`), 고객지원(`support_cases`), 감사(`audit_logs`), 제재(`sanctions`) — **거래 전용 원장·주문 테이블은 만들지 않는다** |
| 승인 단계 | **승인 ①** 설계 → 구현·테스트 / **승인 ②** 검증 보고 → main 병합·운영 DB 마이그레이션·Production 배포 → 실측 → HARD LOCK |

### 운영 데이터 (2026-10-19 조회, 읽기 전용)

| 항목 | 값 | 설계에 주는 의미 |
|---|---|---|
| 거래글 `posts` | **200** (active 113 · reserved 4 · sold 63 · hidden 20 · deleted 0) | |
| └ `type='trade'` / `type IS NULL` | **55 / 145** (NULL 중 active 86) | 관리자 목록·대시보드는 `type='trade'` 만 집계 → **73% 누락** (D-01) |
| `posts.status` CHECK | `active, reserved, sold, hidden` — **`deleted` 없음** | 관리자 소프트 삭제 500 (D-02), 판매자 삭제는 `hidden` 으로 대체 저장 (D-03) |
| hidden 20건의 원인 근거 (v2 재조사) | 관리자 감사 **0/20** · 신고 **0/20** · 홍보 0/20 · 채팅방 있음 2/20 · 구매자 지정 0/20. (`post.hide` 감사 5건은 모두 지금 **노출 중인 글 1개**에 대한 반복 숨김·복원 기록) | 원인 확정 불가 → 「원인 미확인 숨김」으로 보존 (§F-1-1-B) |
| 사용자 앱 거래글 포함 기준 (v2) | `trade_category_id ∈ 활성 categories(type=trade)` AND `status IS NULL OR status NOT IN (hidden, sold)` — `type` 미사용. 운영 해당 **117** (active 113 + reserved 4) | 관리자 기준과 대조 (§F-1-0) |
| 거래 완료 시각 근거 (v2) | sold 63건 전부 `product_chats`(구매자 = `sold_buyer_id`) 의 `seller_completed_at` 존재 **63/63**, 중복 0 · reserved 4건 전부 `reserved_buyer_id` 있음 | 신규 `sold_at` 불필요, 기존 값만 표시 (M3 철회) |
| 판매 단계 `seller_listing_state` | inquiry 119 · negotiating 14 · reserved 4 · completed 63 | 숨김 20건은 모두 inquiry 로 덮어써짐 |
| 썸네일 | `thumbnail_url` 있음 140 (그중 `images[1]` 과 일치 139, 이미지 없이 썸네일만 1) · 이미지 있는데 썸네일 NULL 7 · 이미지 없음 53 | 사용자 앱·관리자 모두 `thumbnail_url → images[0]` → 실제 불일치 0건 |
| 지역 | `trade_lgu_id` 채움 **27/200** · `region/city` 레거시 코드(`manila/m2`, `quezon/q30`)와 자유 문자열(`Metro Manila/Quezon City`, `ncr/manila`) 혼재 · `dibay_regions` 0행 | 지역 통계는 LGU 기준 정규화가 선행돼야 함 (§F-5) |
| 카테고리 | `categories(type=trade)` 6 (모두 활성) · `trade_categories` **0행** (미사용 테이블) | |
| 거래 채팅 | `chat_rooms(room_type=item_trade)` 429 · `product_chats` 440 | |
| 거래 신고 | `reports` 전체 2 (chat_room 1 · user 1, 둘 다 반려) · `post_reports` 0 · `chat_reports` 0 | 데이터가 적어 결함이 아직 사고로 드러나지 않음 |
| 거래 후기 | `transaction_reviews` 29 (관리자 숨김 0) | |
| 제재 | `sanctions` 0행 · `user_moderation_events` 11 (정지 3 · 차단 3 · 해제 5) | 거래 활동 제한은 기록조차 없음 |
| 거래 홍보 | `point_promotion_orders(domain=trade)` 4 — **active 2건 모두 종료일 경과**(08-14, 09-26) · ended 2건 `ended_at`·사유·환급 없음 | 만료 처리 미작동 (D-07) |
| 레거시 `trade_post_ads` | 0행 (신규 쓰기 코드상 차단 `TRADE_POST_ADS_NEW_WRITES_ENABLED=false`) · 과거 hold 원장 3건 | 메뉴만 남은 레거시 |
| 원장 `point_ledger` | 음수 `balance_after` 11행 / 2명 — 그중 **`ad_hold/trade_post_ad` 로 잔액 −1** 1건(08-05) | 거래 홍보 보류 시 잔액 검사 누락 (D-08) |
| 충전 | 10건 (승인 7 · 반려 3) — 입금 확인(`verified_at`) 0/10 (#86 이전 데이터) | |
| 고객지원 | 34건 — **거래 카테고리·참조 유형 0** | 거래 문의 분류 불가 (D-29) |
| 관리자 (v2 정정) | `admin_memberships` 활성 **4명** (super_admin 2 · operator 2, 개별 권한 덮어쓰기 0) · 회수 6. `profiles.role` 은 전원 `user` | `profiles.role` 기반 RLS 화면은 전부 막힘. operator 기본 키에 `products·product_edit·reports·reviews·chats·users·ads·boards` 있음, **`point`·`settings` 없음** (§B-4) |

---

# A. 현재 구조

## A-1. 현재 거래 사이드 메뉴 (`components/admin/admin-menu.ts:651-700`)

| 메뉴 | URL | 실제 동작 | API·데이터 | 권한 | 판정 |
|---|---|---|---|---|---|
| 거래 허브 | `/admin/trade` | 서버 렌더 지표 8개 + 최근 8건 | `fetchAdminTradeOverviewCounts` → `posts(type=trade)`, `reports(product)`, `point_promotion_orders(trade)` | 페이지 자체 키 없음 (service role) | **DEFECT** D-01·D-11·D-12 |
| 게시물 관리 | `/admin/posts-management` | 서버 40건 + 5초 폴링, 탭·검색은 클라이언트 | `GET /api/admin/posts-management` (실패 시 브라우저 supabase 폴백) | `requireAdminApiUser` | **DEFECT** D-01·D-14·D-15 |
| 알바 관리 | `/admin/posts-management?tab=jobs` | 같은 목록의 탭 (카테고리 키워드 추정 분류) | 〃 | 〃 | **DUPLICATE** (탭으로 흡수) |
| 거래 신고 | `/admin/reports?domain=trade&target_type=product` | 통합 신고 목록(브라우저 RLS 읽기) | `reports`, 처리 `POST /api/admin/reports/[id]/action` | 읽기 RLS / 처리 `reports` | **DEFECT** D-19·D-20 |
| 거래 후기 | `/admin/reviews` | 후기 목록·숨김 | `/api/admin/transaction-reviews` | `requireAdminApiUser` (`reviews` 키 미사용) | DEFECT (권한) |
| 거래 진행 | `/admin/trade-flow` | `product_chats` 최근 200 + 판매취소·구매자 확정 | `POST /api/admin/trade-flow` | `products` | IMPROVEMENT (anon 폴백 D-40) |
| 거래 채팅 | `/admin/chats/trade` → `/admin/chats?type=trade` | 메신저 통합 방 목록 거래 필터 | `/api/admin/community-messenger/rooms` | `chats`/`products` | PASS (조치·열람 감사 있음) |
| 거래 광고 | `/admin/trade-post-ads` | 레거시 `trade_post_ads` (0행, 신규 쓰기 차단) | `/api/admin/trade-post-ads/[id]` | `requireAdminApiUser` · 감사 없음 | **DUPLICATE/레거시** |
| 광고 정책 | `/admin/trade-ad-policies` | `ad_products` 편집 | `/api/admin/trade-ad-products/[id]` | `requireAdminApiUser` | DEFECT (권한) |
| 찜 기록 | `/admin/favorites` | `favorite_audit_log` 최근 200, 필터 없음 | `/api/admin/favorite-audit` | `requireAdminApiUser` | IMPROVEMENT |
| 거래 회원 | `/admin/users?from=trade` | `from` 무시 → 일반 회원 목록 | — | `users` | **DEFECT** D-24 |
| 거래 기록 | `/admin/audit-logs?target_type=post` | 공통 감사 로그 | `/api/admin/audit-logs` | `isRouteAdmin` | IMPROVEMENT (신고 숨김·하드 삭제 누락) |
| 거래 메뉴/카테고리 | `/admin/menus/trade` | 카테고리 CRUD (브라우저 직접 쓰기) | `categories`·`category_settings` | RLS `profiles.role IN (admin,master)` | **DEFECT** D-05 |
| 거래 설정 | `/admin/trade/settings` | `admin_settings` upsert | `/api/admin/trade/settings` | `isRouteAdmin` · 감사 없음 | DEFECT (권한·감사) |
| **메뉴 없음** | `/admin/products/[id]` | 게시물 상세 (읽기 + 상태 패널) | `posts/[id]/status`, `trade-override` | `requireAdminApiUser` | IMPROVEMENT (수정 없음) |
| | `/admin/trade-prototype` | **목업 데이터** | 없음 | — | 제거 대상 |
| | `/admin/categories` | `/admin/menus/trade` 와 같은 훅 | 〃 | 〃 | DUPLICATE |
| | `/admin/products`, `/admin/post-ads`, `/admin/promoted-items`, `/admin/trade/feed-topics`, `/admin/chats/trade-complete` | 리다이렉트 | — | — | 유지 (URL 호환) |

**거래 업무지만 거래 밖에 있는 화면**: `/admin/advertising/boosts`(거래 홍보 주문 = 실제 운영 홍보), `/admin/ad-applications?domain=trade`(→ boosts), `/admin/point-charges`·`/admin/points/ledger`(충전·지급), `/admin/support`(문의), `/admin/users/[id]`(정지·차단·거래 탭), `/admin/chat/reports`(채팅 신고 — `chats` 권한만).

## A-2. 데이터·API·권한 흐름 (확인된 구조)

```
[앱 판매자] ─ /api/posts/** (owner-delete 등) ────────────────────────┐
     └─ ⚠ PostgREST 직접: RLS posts_update_own / posts_delete_own,      │
          authenticated 에 41개 전 컬럼 UPDATE (status·view_count 포함) ┤
                                                                       ▼
[Admin 목록]  /api/admin/posts-management ─ requireAdminApiUser ─ posts .eq(type,'trade') ⚠
[Admin 상태]  /api/admin/posts/[id]/status ─ requireAdminApiUser ─ status 덮어쓰기 + appendAuditLog(void)
[Admin 하드삭제] /api/admin/posts/bulk-delete ─ requireAdminApiUser ─ DELETE + 스토리지 삭제, 감사 없음 ⚠
[Admin 신고]  /api/admin/reports/[id]/action ─ reports ─ CAS · report_actions · sanctions(scope=platform, 강제 없음)
[Admin 카테고리] 브라우저 supabase ─ categories (RLS profiles.role) ⚠ 0행 갱신 = 거짓 성공
[Admin 홍보]  /api/admin/trade-promotion-orders/[id], advertising-workspace(boost_trade) ─ requireAdminApiUser ─ TS 직접 UPDATE ⚠
[Admin 포인트] /api/admin/points/adjust ─ point ─ RPC admin_adjust_user_points (#86, 원자·멱등·행위자) ✔
[Admin 충전]  /api/admin/point-charges/[id] ─ point ─ RPC approve_..._verified (#86) ✔
[Admin 문의]  /api/admin/support/cases ─ 거래 카테고리·참조 유형 없음 ⚠
```

## A-3. 정상으로 확인되어 유지할 구조 (재구현 금지)

| # | 정상 구조 | 근거 |
|---|---|---|
| K-1 | 사용자 앱 노출 정책 **내 지역 → 주변 → 전국, 블록 내 최신순** | `lib/trade/location/national/browse-location-tiers.ts`, `lib/trade/marketplace/assemble-marketplace-browse-order.ts:51` |
| K-2 | 썸네일 규칙 동일 (`thumbnail_url` → `images[0]`), 운영 불일치 0건 | `components/post/PostCard.tsx:161-163`, `admin-posts-management-data.ts:69`, 운영 조회 |
| K-3 | 신고 처리 CAS(처리 가능 상태 조건부 update, 선점 시 409) + `report_actions` 실패 시 상태 롤백 | `lib/admin-reports/applyReportActionDaangn.ts:126-152` |
| K-4 | 거래 채팅방 조치(차단·보관·읽기 전용·경고) 사유 필수·CAS·감사, 본문 열람 `chat_room.content_view` 감사 | `app/api/admin/chat/rooms/[id]/**` |
| K-5 | 포인트 단일 원장 `point_ledger` + 관리자 조정 RPC(행 잠금·멱등 키 unique·`actor_id`) + 충전 승인 RPC(입금 확인·1회 보장) | #86 M6·M7 |
| K-6 | 홍보 중지·재개·종료 RPC(행 잠금·귀책·비례 환급·환급 1회 unique) — 현재 커뮤니티만 사용 | `20270521120800_community_admin_m9_promotion_refund.sql` |
| K-7 | 사용자 피드와 관리자 카테고리 원천 동일 (`categories(type=trade)` ↔ `posts.trade_category_id` FK) | `trade-posts-category-filter.ts:29-40`, FK |
| K-8 | 회원 정지·차단은 플랫폼 게이트(`profiles.status`)가 모든 쓰기 API 에 적용 | `lib/auth/member-action-policy.ts` |
| K-9 | 커뮤니티 공용 UI 키트·조치 시트·기간 필터(PHT)·서버 페이지네이션 | `components/admin/community/kit/CommunityAdminKit.tsx`, `components/admin/chats/AdminChatActionSheet`, `lib/admin/pagination/parse-admin-list-page.ts`, `lib/admin/community-admin/community-admin-period.ts` |
| K-10 | 대시보드 count 실패 → `null` → 「확인 불가」(0 과 구분) | `admin-trade-overview-counts.ts:33`, Shell:33·105 |

## A-4. 결함·누락 전체 목록 (52건)

### P0 — 보안·금전·데이터 무결성 (9)

| ID | 판정 | 내용 | 근거 |
|---|---|---|---|
| **D-01** | DEFECT | **관리자 목록·대시보드가 거래글 73%를 못 본다.** 목록·KPI 가 `.eq("type","trade")` 로 거르는데 운영 200건 중 145건이 `type IS NULL`(active 86). 사용자 피드는 `type` 으로 거르지 않아 이 글들은 앱에 노출 중 → 관리자가 찾지도·숨기지도 못한다 | `admin-posts-management-data.ts:207`, `admin-trade-overview-counts.ts:41`, 운영 조회 |
| **D-02** | DEFECT | **관리자 「삭제」가 항상 실패한다.** API 는 `status='deleted'` 를 쓰지만 운영 CHECK 는 `active,reserved,sold,hidden` 만 허용 → 500. 대시보드 「삭제」 지표는 구조적으로 영원히 0 | `posts/[postId]/status/route.ts:10,129-170`, `posts_status_check` |
| **D-03** | DEFECT | **판매자 삭제·판매자 숨김·관리자 숨김이 모두 `status='hidden'`.** 판매자 삭제는 `deleted` 시도 → CHECK 위반 → `hidden` 으로 대체. 관리자 「복원」이 **판매자가 지운 글을 되살린다**. 현재 hidden 20건 모두 원인 기록 없음 (v2 정정) | `app/api/posts/[postId]/owner-delete/route.ts:89-101`, 운영 조회 |
| **D-04** | DEFECT | **판매자가 관리자 조치를 무력화할 수 있다.** ① 정식 API: 판매자 「다시 보이기」(`owner-status` active)가 숨김 원인을 보지 않아 **관리자 숨김도 해제** (v2 추가 근거, `app/api/posts/[postId]/owner-status/route.ts:96-104`). ② `posts_update_own`(user_id=auth.uid()) + `authenticated` 에 41개 전 컬럼 UPDATE 권한, 트리거 없음 → PostgREST 로 `status='active'` 를 보내면 관리자 숨김 해제, `view_count`·`favorite_count`·`chat_count`·`sold_buyer_id` 조작 가능. `posts_delete_own` 으로 **신고된 글 하드 삭제 → `reports.product_id` SET NULL, 채팅방 연결 SET NULL → 증거 소멸**. 커뮤니티 C-01 과 같은 구조 (커뮤니티는 #86 에서 차단) | 운영 `pg_policies`·`column_privileges`·FK `confdeltype='n'` |
| **D-05** | DEFECT | **카테고리 추가·수정·정렬·삭제가 저장되지 않는데 성공으로 표시.** 브라우저에서 `categories`/`category_settings` 직접 쓰기 → RLS 는 `profiles.role IN ('admin','master')` 요구, 관리자 6명 전원 `role='user'` → INSERT 오류, UPDATE/DELETE 0행·오류 없음 → 「성공」. 감사 기록 없음 | `lib/categories/updateCategory.ts:26-31`, `admin/{create,reorder,delete}Category.ts`, 운영 RLS·profiles |
| **D-06** | MISSING | **거래 Admin 쓰기 API 전체에 권한 키 미적용.** 게시물 상태·강제 완료·하드 삭제·홍보 승인/반려/종료·광고 상품·후기·설정이 「관리자 여부」만 확인. `products`·`product_edit`·`reviews`·`ads`·`settings` 키가 거래 쓰기에 쓰이지 않음 | `requireAdminApiUser` 사용처: `posts/bulk-delete:49`, `posts/[id]/status`, `trade-override`, `trade-promotion-orders/[id]:94`, `trade-ad-products/[id]:33`, `advertising-workspace/action:44(boost_trade)`, `transaction-reviews`, `trade/settings`(isRouteAdmin) |
| **D-07** | DEFECT | **거래 홍보 만료가 동작하지 않는다.** 만료 함수 `expire_point_promotion_orders()` 는 pg_cron 등록 시에만 실행되는데 운영에 `cron` 스키마 없음, 앱 호출처 0 → 종료일 지난 거래 홍보 2건이 `active`. 노출은 기간 조건으로 막히지만 목록·환급·상태 판단이 틀어짐 | `supabase/migrations/20260913110000_post_ads_expire_cron.sql`, 운영 조회 |
| **D-08** | DEFECT | **거래 홍보 포인트 처리가 원자적이지 않다.** ① 승인·반려: 상태 CAS 후 TS 에서 포인트 확정/해제 — 해제 실패 시 주문 `rejected` + 포인트 `held` 잔존. ② `spendUserPoints` 는 조회 후 INSERT(잠금 없음), `ad_hold`·`ad_purchase` 에 1회 unique 없음 → **운영에서 `ad_hold/trade_post_ad` 로 잔액 −1 발생** | `lib/promotion/apply-trade-paid-exposure.ts:194-274`, `lib/points/user-point-ledger.ts:224-258`, 운영 원장 |
| **D-09** | DEFECT | **하드 삭제가 감사·사유 없이 실행되고 복구 불가.** DELETE + 스토리지 이미지 삭제, 감사 0. CASCADE 로 찜·댓글·알바 지원·`trade_post_ads` 삭제, `reports.product_id`·`chat_rooms.item_id/related_post_id` SET NULL(신고·채팅 증거 연결 끊김), FK 없는 `product_chats`·`point_promotion_orders` 고아 | `app/api/admin/posts/bulk-delete/route.ts`, 운영 FK |

### P1 — 독립 운영 필수 (22)

| ID | 판정 | 내용 | 근거 |
|---|---|---|---|
| D-10 | DEFECT | 「복원」이 판매 상태를 파괴: 항상 `active`+`inquiry` → 판매완료·예약 글이 판매중으로, `sold_buyer_id` 는 남음 | `status/route.ts:131-133`, `confirm-admin-post-moderation.ts:141` |
| D-11 | DEFECT | 대시보드 카드 딥링크 `?status=` 를 목록이 읽지 않음 → 어느 카드든 전체 목록 | `load-trade-domain-dashboard.ts:95-119`, `AdminPostsManagementPage.tsx:51,65-67` |
| D-12 | MISSING | 대시보드 기간 필터(오늘·7일·30일·직접)·기간 지표·새로고침 없음 | `AdminDomainDashboardShell.tsx` |
| D-13 | DEFECT | 판매 상태와 관리자 노출 상태가 한 컬럼 (`status`) — 숨김이 판매 단계를 덮어씀. 판매자 숨김도 `seller_listing_state='inquiry'`·`reserved_buyer_id=null` 로 초기화 | `lib/trade/posts-listing-write-fields.ts:76-82`, 운영: hidden 20건 전부 inquiry |
| D-14 | DEFECT | 탭·건수·필터·검색이 현재 페이지 40건 안에서 클라이언트 계산 → 건수 오류, 페이지 수 불일치. 제목 검색은 API 지원인데 UI 미전송. 알바 탭은 `trade_type` 아닌 키워드 추정 | `AdminPostsManagementPage.tsx:155-175,290-311`, `posts-management-utils.ts:103` |
| D-15 | DEFECT | 필터·탭이 `useState` → 상세 다녀오면 초기화. 5초 폴링이 서버 부하·화면 흔들림 | `Page.tsx:57-67,148-153` |
| D-16 | MISSING | 관리자 게시물 수정(제목·본문·가격·카테고리·지역·이미지) 없음, 상태 변경 CAS 없음, 수정 전후 원본 보존 없음 | `AdminProductDetailPage.tsx`, `status/route.ts:145` |
| D-17 | DEFECT | 「끌올」: 브라우저 직접 `updated_at` UPDATE → RLS 로 0행, 「성공」 표시. 사용자 목록은 `created_at` 정렬이라 성공해도 효과 없음 | `updatePostAdmin.ts:56-70`, `trade-posts-range-query.ts:301` |
| D-18 | DEFECT | 상세 화면에서 삭제/숨김 상태 글 복원 불가, 행 메뉴는 상태와 무관하게 숨김·복구·삭제 모두 노출 | `AdminProductActionPanel.tsx:43-44`, `Table.tsx:686-705` |
| D-19 | MISSING | **거래 활동 제한 없음.** 신고 조치 `warn`·`chat_ban` 은 `sanctions` 기록만(강제 코드 0), `scope` 는 platform 고정, `source_report_id` 미기록. `sanctions.scope` CHECK = platform·community 만. 계정 단위 정지(MCC)만 가능 | `trade-report-action-policy.ts:23-27`, `applyReportActionDaangn.ts:173-176`, 운영 CHECK |
| D-20 | DEFECT | 같은 게시물의 다른 대기 신고가 함께 닫히지 않음, 숨김 실패해도 신고는 sanctioned 로 닫힘 | `applyReportActionDaangn.ts:156-170` |
| D-21 | DEFECT | 거래 홍보 관리자 종료: 사유·귀책·환급 없음(`void input.reason`), 재개 시 종료일 미연장 → 커뮤니티 M9 RPC 와 불일치. 운영 ended 2건 `ended_at`·사유 없음 | `lib/promotion/admin-boost-lifecycle.ts:81-128`, 운영 |
| D-22 | MISSING | 거래 홍보가 거래 워크스페이스에 없음 — `/admin/advertising/boosts`(광고 워크스페이스, 커뮤니티와 혼합)로 이동해야 함 | `app/admin/ad-applications/page.tsx:15-17` |
| D-23 | DEFECT | 레거시 `trade_post_ads` 관리 PATCH: 감사 0, `apply_status` 임의 지정(→ 보류 포인트 잔존), 차감 후 UPDATE 순서. 신규 쓰기는 차단돼 있으나 관리 쓰기는 열려 있음 | `trade-post-ads/[id]/route.ts:44-56,116-180` |
| D-24 | MISSING | 판매자·구매자 관리 화면 없음 — `/admin/users?from=trade` 는 `from` 무시. 회원 상세 「거래」 탭(`member-trade-tab.ts`)은 있으나 신고·제재·홍보·포인트가 분산 | `AdminUserListPage.tsx`, `lib/admin-users/member-trade-tab.ts:57-132` |
| D-25 | DEFECT | 하드 삭제 사전 검사가 sold·sold_buyer 만 확인 — 신고·채팅·홍보 연결 글도 삭제 가능 | `bulk-delete/route.ts` |
| D-26 | DEFECT | 감사 누락: 하드 삭제, 카테고리 CUD, 거래 설정 PUT, 끌올, `trade_post_ads` PATCH. 신고 숨김은 `trade_report` 로만 기록돼 게시물 이력에서 안 보임. `appendAuditLog` 가 `void` 호출 | 각 라우트 |
| D-27 | DEFECT | 카테고리 삭제 보호: 서버에서 글 수 확인 후 브라우저 DELETE(시점 차이), 하위 카테고리 미검사 | `admin/deleteCategory.ts:34` |
| D-28 | MISSING | 거래 이의신청 경로 없음 (`?type=appeal` 은 COMMUNITY_* 만) · 신고자 처리 결과 알림 없음 | `lib/support/support-community-filter.ts:33-34,58-63` |
| D-29 | MISSING | 거래 문의 분류 불가 — `support_cases` 참조 유형에 거래글·거래채팅 없음(알 수 없는 유형 거부), 카테고리에 거래 없음 | `lib/support/support-reference-authority.ts:41-59`, `support-category-registry.ts:88-104`, 운영 34건 중 0 |
| D-30 | MISSING | 거래 원장 조회 불가 — `promotion_order` 가 거래·커뮤니티 공용, `related_id` 형식 혼재(`{id}`·`hold:`·`capture:`·`release:`) → `point_promotion_orders.domain` 조인 필요. 커뮤니티 원장 API 도 `hold:`/`capture:` 행 누락 | `lib/promotion/promotion-point-hold-flow.ts:33-137`, `community/points/route.ts:71-81` |
| D-31 | MISSING | 거래 지역 관리·지역 통계·LGU 필터 없음. 관리자 지역 필터는 레거시 문자열 ilike(이스케이프 없음) | `admin-posts-management-data.ts:214-216` |

### P2 — 메뉴·UI/UX/CTA·통계 (21)

| ID | 판정 | 내용 |
|---|---|---|
| D-32 | DEFECT | 「판매중」 탭이 `status=active` 만 — reserved 가 어느 탭에도 없음 (사용자 앱은 판매중으로 봄, `public-listing-status.ts:37-43`) |
| D-33 | DEFECT | 대시보드 신고 지표 `target_type='product'` 만 vs 신고 목록은 post·comment 도 product 로 묶음 → 건수 불일치 |
| D-34 | DEFECT | count 실패 시 상단 경고 배너 없음 (`countExact` 가 예외 삼킴) |
| D-35 | IMPROVEMENT | 관리자 썸네일 원본 URL 로드·onError 없음 (앱은 리사이즈 URL·빈 슬롯) |
| D-36 | MISSING | 거래 공지·상단 고정 없음 (§C-9 에서 필요성만 판단) |
| D-37 | DUPLICATE | `?tab=jobs` 별도 메뉴, `/admin/categories` = `/admin/menus/trade` |
| D-38 | 제거 | `/admin/trade-prototype` 목업 · 데드 컴포넌트 `AdminProductListPage`/`FilterBar`/`Table`/`StatusLogList`, `lib/admin-posts/getAdminPosts.ts` · 빈 테이블 `trade_categories` |
| D-39 | IMPROVEMENT | 찜 기록 200건 고정·필터 없음 |
| D-40 | DEFECT | `trade-flow` 서비스 키 없으면 anon 폴백 조회 |
| D-41 | DEFECT | 채팅 신고 큐 `/api/admin/chat/reports` 가 `chats` 만 허용 — `products` 담당자 접근 불가 |
| D-42 | NOT_PROVEN | 신고 목록 닉네임을 `test_users` 에서 조회 (`getReportsFromDb.ts:99`) |
| D-43 | IMPROVEMENT | 신고 목록 읽기가 브라우저 RLS — 권한 키 `reports` 로 읽기 미통제 |
| D-44 | DEFECT | 후기 API `reviews` 키 미사용 |
| D-45 | IMPROVEMENT | 관리자 메뉴 라벨·화면 제목 불일치, 개발자 용어(`Cut A/S1`, `LISTING_OPS`, `sold_buyer_id 필요`) 오류문 노출 |
| D-46 | IMPROVEMENT | 버튼 위치·색·확인 팝업이 화면마다 다름 (posts-management 행 메뉴, 상세 패널, trade-flow, 신고 상세) |
| D-47 | IMPROVEMENT | 날짜 표시 혼재 (UTC ISO / 로컬) — PHT 단일화 필요 |
| D-48 | DEFECT | `users/[id]/points` 멱등 키 없으면 서버 무작위 키 → API 재시도 시 이중 지급 (UI 는 키 전송) |
| D-49 | IMPROVEMENT | `/admin/community/point-charges` 가 전체 충전 표시(도메인 구분 불가) — 거래도 같은 화면 공유가 정답 (§G-3) |
| D-50 | IMPROVEMENT | 지역 데이터 3형식 혼재 (`trade_lgu_id` 27/200) |
| D-51 | NOT_PROVEN | `void appendAuditLog` 서버리스 응답 후 유실 |
| D-52 | IMPROVEMENT | 거래 설정(`/admin/trade/settings`)·운영 정책(`ops_trade_policy`: 자동 확정·후기 기한) 두 화면으로 분산 |

### 원인 정리

1. **스키마 이원화 미정리** — `type` 컬럼 도입 이전 글(145)·`deleted` 상태 미반영 CHECK·`trade_lgu_id` 미백필·`trade_categories` 빈 테이블: 코드가 가정한 스키마와 운영 스키마가 다르다.
2. **하나의 `status` 에 세 가지 의미** — 판매 단계·관리자 노출·판매자 삭제가 한 값.
3. **브라우저 직접 쓰기 + `profiles.role` RLS** — 관리자 권한 원천은 `admin_memberships` 인데 RLS 는 `profiles.role` 을 본다 → 거짓 성공.
4. **권한 키 미적용** — 커뮤니티(#86)는 영역→키 매핑을 도입했으나 거래는 미적용.
5. **홍보 경로 이원화** — 커뮤니티는 M9 RPC, 거래는 TS 직접 UPDATE.

---

# B. 최종 메뉴

## B-1. 원칙

- 거래 운영자가 **거래 워크스페이스 안에서 모든 업무를 끝낸다.** 공통 데이터는 같은 API·테이블을 거래 필터로 재사용(새 원장·새 주문 테이블 없음).
- 기존 URL 은 유지하고, 신설은 `/admin/trade/*` 아래 둔다 (커뮤니티 `/admin/community/*` 와 같은 규칙).
- 커뮤니티 설계 §B 와 같은 그룹 순서: 운영 현황 → 신고·제재 → 게시물 → 채팅 → 회원 → 홍보 → 포인트·충전 → 문의 → 운영 설정 → 기록.

## B-2. 최종 메뉴 트리 (10 그룹 · 19 메뉴)

| 그룹 | 메뉴 | URL | 구분 |
|---|---|---|---|
| 운영 현황 | 거래 대시보드 | `/admin/trade` | 수정 |
| 신고·제재 | 거래 신고 | `/admin/trade/reports` (기존 `/admin/reports?domain=trade` 별칭 유지) | 수정 (거래 전용 목록·상세) |
| | 거래 활동 제한 | `/admin/trade/restrictions` | **신설** |
| | 이의신청 | `/admin/trade/support?type=appeal` | **신설** (문의 화면 필터) |
| 게시물 | 거래 게시물 | `/admin/posts-management` (알바는 같은 화면의 유형 탭, `?tab=jobs` 유지) | 수정 |
| | 게시물 상세 | `/admin/products/[id]` (메뉴 비노출, 목록에서 진입) | 수정 |
| | 거래 후기 | `/admin/reviews` | 수정 (권한) |
| 거래 채팅 | 거래 채팅방 | `/admin/chats?type=trade` (`/admin/chats/trade` 별칭) | 유지 |
| | 거래 진행·완료 | `/admin/trade-flow` | 수정 |
| | 채팅 신고 | `/admin/chat/reports?type=trade` | 수정 (권한 `chats|products`) |
| 회원 | 판매자·구매자 | `/admin/trade/members`, `/admin/trade/members/[userId]` | **신설** (`/admin/users?from=trade` → 리다이렉트) |
| 홍보 | 거래 홍보 | `/admin/trade/promotions` | **신설** (`point_promotion_orders domain=trade`) |
| | 홍보 상품·가격 | `/admin/trade-ad-policies` | 수정 (권한·감사) |
| 포인트·충전 | 포인트 | `/admin/trade/points` | **신설** (원장 거래 필터 + 지급·회수) |
| | 충전 | `/admin/community/point-charges` 와 같은 화면을 거래 메뉴에도 연결 (`/admin/point-charges`) | 유지 (전체 충전 = 공용, §G-3) |
| 문의 | 거래 문의 | `/admin/trade/support` | **신설** (`support_cases` 거래 필터) |
| 운영 설정 | 카테고리 | `/admin/menus/trade` | 수정 (서버 API 전환) |
| | 거래 정책 | `/admin/trade/settings` (+ `ops_trade_policy` 통합) | 수정 |
| | 지역 현황 | `/admin/trade/regions` | **신설** (읽기 전용 통계·LGU 필터) |
| 기록 | 운영 기록 | `/admin/trade/audit` (거래 대상 감사 + 찜 기록 탭) | 수정 (`/admin/favorites`·`/admin/audit-logs?target_type=post` 흡수, URL 유지) |

> 신설 수 6: restrictions · members · promotions · points · support · regions (audit 은 기존 감사 API 재사용 화면). 그룹 내 「충전」은 신규 화면이 아니라 기존 화면 연결.

## B-3. 메뉴 대응표

| 기존 | 처리 | 이유 |
|---|---|---|
| 거래 허브 | 유지·수정 → 「거래 대시보드」 | 실데이터·기간 필터 |
| 게시물 관리 + 알바 관리 | **통합** (탭) | 같은 목록 |
| 거래 신고 | 유지 → 거래 전용 화면 | 통합 신고 목록은 채팅·사용자 신고 혼합 |
| 거래 후기 · 거래 진행 · 거래 채팅 | 유지 | |
| 거래 광고(`trade-post-ads`) | **메뉴 제거** (URL 은 읽기 전용 이력으로 유지) | 레거시, 신규 쓰기 차단, 0행 |
| 광고 정책 | 유지 → 「홍보 상품·가격」 | |
| 찜 기록 | **운영 기록 탭으로 이동** | 운영 업무가 아닌 기록 |
| 거래 회원(`users?from=trade`) | **대체** → 판매자·구매자 | 기존 링크는 의미 없음 |
| 거래 기록 | 유지 → 운영 기록 | |
| 거래 메뉴/카테고리 · 거래 설정 | 유지 | |
| `trade-prototype` | **제거** (라우트 삭제) | 목업 |
| `/admin/categories` | 리다이렉트 → `/admin/menus/trade` | 중복 |

## B-4. 화면 독립성 × 데이터 SSOT 재사용 (v2)

원칙: 거래 운영자는 **거래 메뉴를 벗어나지 않는다.** 공통 기능은 「같은 API·같은 테이블·같은 조치 컴포넌트」를 거래 화면 안에 `scope="trade"` 로 띄운다. 다른 워크스페이스 화면으로의 링크·리다이렉트는 쓰지 않는다 (예외: 원문 확인용 「회원 전체 정보 열기」 보조 링크 1개, 업무 완료에 필요하지 않음).

| 공통 업무 | 거래 화면 | 재사용 API (SSOT) | 필요 키 | 활성 operator 기본 보유 | 막힘 위험 → 설계 |
|---|---|---|---|---|---|
| 회원 거래 이력 | 판매자·구매자 상세 | `/api/admin/users/[id]/trade` | `users` | 있음 | 없음 |
| 계정 정지·차단·해제 | 판매자·구매자 상세 조치 시트 | `/api/admin/users/[id]/moderation` (MCC 와 같은 API) | `users` | 있음 | MCC 화면 이동 불필요 |
| 거래 활동 제한 | 거래 활동 제한 | 신설 `/api/admin/trade/restrictions` (`sanctions`) | `reports` | 있음 | 없음 |
| 거래 채팅방 목록·조치·열람 | 거래 채팅방 | `/api/admin/community-messenger/rooms`, `/api/admin/chat/rooms/[id]/**` | `chats` 또는 `products` | 있음 | 없음 |
| 채팅 신고 큐 | 채팅 신고 | `/api/admin/chat/reports` | 현재 `chats` 만 → **`chats|products`** | 있음 | 수정 후 없음 |
| 홍보 승인·중지·종료·환급 | 거래 홍보 | 신설 거래 RPC (§G-0) | `ads` | 있음 | 없음 |
| 포인트 원장 조회 | 포인트 | `/api/admin/community/points` 와 같은 원장 조회 함수 + 거래 필터 | `point` | **없음** | §I O-2 |
| 포인트 지급·회수 | 포인트 | `/api/admin/points/adjust` (RPC) | `point` | **없음** | §I O-2 |
| 충전 입금 확인·승인·반려 | 충전 (거래 메뉴 안 같은 화면 컴포넌트) | `/api/admin/point-charges/[id]` (RPC) | `point` | **없음** | §I O-2 |
| 문의 답변 | 거래 문의 | `/api/admin/support/cases/**` | 현재 관리자 여부만 | — | 키 미적용 유지 (현행), 거래 필터만 추가 |
| 거래 정책 저장 | 거래 정책 | `/api/admin/trade/settings`, `ops-trade-policy` | `settings` | **없음** | §I O-2 |

- 사이드바는 지금 권한별로 숨기지 않는다 (`admin-menu.ts` 는 권한 키를 보지 않음). 거래 메뉴는 그대로 보이고, 키가 없으면 화면 진입은 되되 **조회 영역은 「권한 필요」 안내, 버튼은 비활성** — 다른 메뉴로 보내지 않는다.
- 금전 업무(`point`)를 operator 에게 열지 여부는 업무 막힘과 금전 위험의 교환이라 **자동으로 정하지 않는다** (O-2). 현재 이 업무는 super_admin 2명만 가능하다.

---

# C. 페이지별 운영 설계

공통 틀은 §D. 아래는 화면별 차이만 적는다.

## C-1. 거래 대시보드 `/admin/trade` → §E

## C-2. 거래 게시물 `/admin/posts-management`

| 요소 | 설계 |
|---|---|
| 데이터 범위 | **`posts` 전체 행** (조건 없음) — §F-1-0. `type='trade'` 조건 제거 (D-01). `type` 백필(M1)은 하지 않는다 (v2: 판정에 쓰지 않으므로 불필요한 데이터 변경) |
| 상태 탭 (서버 count) | 전체 · **앱 노출 중** · 판매중 · 예약중 · 거래완료 · 관리자 숨김 · 관리자 삭제 · 판매자 숨김 · 판매자 삭제 · **원인 미확인 숨김** · 신고됨(대기 신고 ≥1) · 분류 확인 필요(거래 카테고리 아님·비활성 카테고리) — **각 탭 숫자는 서버 count, 목록과 같은 쿼리 함수** |
| 유형 탭 | 전체 · 중고 · 알바(`trade_type='job'`) · (카테고리 select 로 세분) |
| 검색·필터 | 검색어(제목·본문·글 ID), 판매자(닉네임·DIBAY ID), 카테고리, 지역(LGU — 시·도/시·군), 기간(등록일), 가격 범위, 정렬(최신 등록 · 최근 수정 · 가격 · 신고 많은 순), 페이지 크기 20/50/100 |
| 목록 열 | 썸네일 · 제목(+가격) · 판매자 · 지역 · 카테고리 · 판매 단계 · 노출 상태 · 신고 · 채팅·찜 · 등록일 · 수정일 · 관리 |
| 썸네일 | 사용자 앱과 같은 함수 사용 (`thumbnail_url` → `images[0]`, 같은 sanitize·리사이즈 URL, 실패·없음 = 같은 빈 슬롯). 관리자 전용 대체 이미지 없음 |
| 행 버튼 | 상세 · (상태별) 숨김 / 숨김 해제 · 삭제 · 판매자 보기 — **상태에 맞는 버튼만** |
| 일괄 | 선택 숨김 · 선택 숨김 해제 (하드 삭제 일괄은 제거 → §F-1-4) |
| 폴링 | 5초 폴링 제거 → 「새로고침」 버튼 + 조치 후 해당 행만 갱신 |
| 상태 유지 | 모든 필터·탭·페이지·정렬을 URL 쿼리에 (커뮤니티 키트 `useAdminListQuery`) |

## C-3. 게시물 상세 `/admin/products/[id]`

- 상단: 썸네일 갤러리(사용자 앱과 같은 순서) · 제목 · 가격 · 판매 단계 · 노출 상태 · 판매자 링크 · 지역 · 카테고리 · 등록·수정일.
- 조치: **수정**(제목·본문·가격·카테고리·지역·이미지 삭제/대표 변경·거래 조건) · 숨김/숨김 해제 · 삭제 · 판매 단계 정정(판매취소·강제 완료 = 기존 `trade-override`) · 홍보 보기 · 신고 보기 · 판매자 제한.
- 탭: 수정 이력(전후 값) · 신고 · 채팅방(목록, 본문 열람은 채팅 Admin 정책) · 홍보 · 조치 기록.
- 동시 수정 방지: 저장 시 `expected_updated_at` 전달, 불일치 409 「다른 곳에서 먼저 수정됨 — 새로고침」.

## C-4. 거래 신고 `/admin/trade/reports`

- 대상: `reports` 중 `target_type IN (product, post)` + 거래 채팅·거래 사용자 신고(`room_id` 가 `item_trade` 방, 또는 거래글에서 접수된 사용자 신고).
- 탭: 대기(pending·reviewing) · 처리 완료 · 반려 — 서버 count.
- 상세 한 화면에서: 신고 내용 · 대상 글(썸네일·상태) · 대상 회원 · 같은 대상 다른 신고 · 처리.
- 처리: 반려(사유) · 게시물 숨김 · 경고 · 거래 활동 제한(기간) · 계정 정지 요청(→ MCC 링크, 권한 `users` 시 직접). **게시물 숨김 처리 시 같은 대상의 대기 신고를 함께 닫음**(D-20), 숨김 실패 시 신고도 롤백.
- 신고자·피신고자 알림 (커뮤니티 `notifyCommunitySanction` 패턴).

## C-5. 거래 활동 제한 `/admin/trade/restrictions` (신설)

- 데이터: 기존 `sanctions` 재사용 — `scope='trade'`, `sanction_type='trade_restriction'`, `restriction IN ('post','chat','all')`, `start_at/end_at`, `source_report_id`.
- 강제 지점: 거래글 작성·수정 API, 거래 채팅 시작·메시지 전송 API (커뮤니티 `community-write-restriction.ts` 와 같은 가드). **플랫폼 계정 정지와 분리** (정지는 `profiles.status`, MCC).
- 목록: 진행 중 · 만료 · 해제 / 회원·기간·사유·처리자. 버튼: 제한 추가 · 해제(사유).
- 기존 `chat_ban` 기록(0행)은 거래 제한으로 대체.

## C-6. 판매자·구매자 `/admin/trade/members` (신설)

- 목록: 거래 활동이 있는 회원(판매글·거래 채팅 참여) — 닉네임·DIBAY ID · 대표 지역 · 판매글 수 · 거래 완료 · 신고 받은 수 · 제한 상태 · 계정 상태.
- 상세: 기존 `/api/admin/users/[id]/trade`(member-trade-tab) + 신고·제한 · 홍보 주문 · 포인트 원장(거래 관련) · 문의.
- 조치: 거래 활동 제한/해제 · 계정 정지 요청(권한 `users` 보유 시 직접 MCC 처리) · 회원 상세(MCC) 링크.
- 개인정보: 전화·이메일 비노출 (커뮤니티 K-12 와 동일).

## C-7. 거래 채팅

- 거래 채팅방(`/admin/chats?type=trade`): 유지. 거래글 상세·회원 상세에서 `postId`·`sellerId`·`buyerId` 로 바로 진입(기존 파라미터).
- 거래 진행·완료(`/admin/trade-flow`): 서버 페이지네이션, anon 폴백 제거(D-40), 버튼을 CTA 표준으로.
- 채팅 신고: 권한 `chats|products` 허용(D-41), 거래 방만 필터.
- 본문 열람: 현행 유지 (거래방은 열람 허용 + `chat_room.content_view` 감사, 사유 선택). 사유 필수화는 **Owner 결정 O-6**.

## C-8. 거래 홍보 `/admin/trade/promotions` (신설) → §G-1

## C-9. 카테고리 `/admin/menus/trade`

- 쓰기를 **서버 API**(`/api/admin/trade/categories`, 권한 `boards`… 아래 §F 권한표)로 전환. 브라우저 직접 쓰기 제거 → 거짓 성공 제거(D-05).
- 목록: 이름 · 상위 · 정렬 · 활성 · 글 수(서버 count) · 홈 칩 노출.
- 삭제: 글·하위 카테고리 있으면 차단(DB 트랜잭션 안에서 확인), 대신 「비활성」 권장. 이동: 다른 카테고리로 일괄 이동(사유·감사).
- 공지·상단 고정: 데이터 모델 없음 → **신설하지 않음.** 필요성은 Owner 결정 O-4.
- 금지 품목·신고 유형: 기존 데이터 모델 없음 → 신설하지 않음 (O-4 에 포함).

## C-10. 거래 정책 `/admin/trade/settings`

- `admin_settings`(거래) + `ops_trade_policy`(자동 확정·후기 기한)를 한 화면 두 섹션으로 (D-52). 저장은 서버 API·권한 `settings`·감사(전후 값).

## C-11. 지역 현황 `/admin/trade/regions` (신설, 읽기 전용)

- 지역(LGU 시·군)별: 게시물(상태별) · 판매자 수 · 신고 · 활성 홍보. 클릭 → 해당 지역 필터 목록.
- 지역 기준: `trade_lgu_id` 우선, 없으면 레거시 `region/city` 를 LGU 로 매핑한 값 (M5 백필 후 단일화). **노출 정책(K-1)·배달 반경은 변경하지 않는다.** 지역별 제한 신설 없음.

## C-12. 포인트 `/admin/trade/points` (신설) → §G-2 · 문의 `/admin/trade/support` → §G-4 · 운영 기록 `/admin/trade/audit` → §F-4

---

# D. UI/UX/CTA SSOT

커뮤니티 키트(K-9)를 **도메인 중립 이름으로 승격**해 거래·커뮤니티가 같은 컴포넌트를 쓴다 (`components/admin/community/kit` → `components/admin/kit`, 커뮤니티는 재export 로 무변경).

## D-1. 화면 틀 3종

| 틀 | 구성 (위→아래) |
|---|---|
| 목록 | 제목(한 줄) · 상태 탭(서버 count) · 필터 줄(검색·select·기간 + 조회·초기화) · 결과 수·새로고침 · 표 · 페이지네이션 |
| 상세 | 대상 요약(썸네일·핵심 필드) · 조치 버튼 줄 · 탭(이력·관련) |
| 조치 시트 | 대상 · 영향 · 사유 입력 · 2단계 확인(위험 조치) · 결과 (`AdminChatActionSheet`) |

설명 문단·개발자 용어·장식 카드·중복 안내 제거. 남기는 안내: 삭제·제재·환급 확인 문구.

## D-2. 버튼 표준표

| 버튼 | 색·위치 | 동작 | 권한 | 서버 처리 | 오류 | 감사 |
|---|---|---|---|---|---|---|
| 조회 | 기본, 필터 줄 끝 | 필터를 URL 에 반영 → 서버 조회 (필터 변경만으로는 조회 안 함, select 는 즉시 조회) | 목록 권한 | GET | 오류 배너 + 재시도 | — |
| 초기화 | 보조 | 기본 필터로 URL 교체 | — | GET | — | — |
| 새로고침 | 아이콘, 결과 수 옆 | 현재 URL 그대로 재조회 (`cache: no-store`) | — | GET | 〃 | — |
| 상세 | 행 클릭/링크 | 상세 화면, 뒤로가기 시 목록 상태 복원 | 목록 권한 | — | 404 「삭제된 대상」 | — |
| 수정 | 보조 | 편집 폼 + 저장·취소, `expected_updated_at` | `product_edit` | PATCH | 409 충돌 안내 | 전후 값 |
| 승인 | 주색 | 확인 1회 | 영역 키 | RPC/CAS | 409 「이미 처리됨」 | ✔ |
| 반려 | 보조 | 사유 필수 | 영역 키 | RPC/CAS | 409 | ✔ |
| 숨김 | 경고색 | 사유 필수 | `products` | CAS | 409 | ✔ |
| 숨김 해제(복원) | 보조 | 판매 단계 보존, 판매자 삭제 글은 불가 | `products` | CAS | 409/422 | ✔ |
| 삭제 | 위험색, 맨 오른쪽 | 영향(채팅·신고·홍보 수) 표시 + 2단계 확인 + 사유 | `products` | 관리자 삭제 상태 (하드 삭제 아님) | 409 | ✔ |
| 제재(제한) | 위험색 | 대상·범위·기간·사유 + 2단계 | `reports` | INSERT sanctions | 409 중복 | ✔ |
| 해제 | 보조 | 기존 제한 표시 + 사유 | `reports` | UPDATE revoked | 409 | ✔ |
| 환급 | 위험색 | 원장 1회 보장 + 2단계 | `ads` (+ O-1) | RPC | 409 「이미 환급」 | ✔ + 원장 |
| 답변 | 주색 | 저장 시 상태 「답변 완료」 | `support` 계열 | 기존 support API | — | 케이스 이벤트 |

- 비활성: 권한 없음 → 숨김이 아니라 비활성 + 툴팁 「권한 없음」. 처리 중 → 스피너·중복 클릭 차단.
- 크기: 표 행 버튼 `sm`, 상세·시트 `md`. 위치: 위험 조치는 항상 오른쪽 끝.

## D-3. 상태 구분 (섞지 않는다)

| 상태 | 값 | 화면 표기 |
|---|---|---|
| 판매 단계 (원본) | `seller_listing_state`: inquiry · negotiating · reserved · completed + `reserved_buyer_id`/`sold_buyer_id` — **숨김·삭제가 건드리지 않는다** | 판매중 · 거래중 · 예약중 · 거래완료 |
| 관리자 노출 (신설 M2) | `moderation_state`: visible · admin_hidden · admin_deleted · legacy_hidden | 노출 · 관리자 숨김 · 관리자 삭제 · 원인 미확인 숨김 |
| 판매자 노출 (신설 M2) | `owner_state`: none · owner_hidden · owner_deleted | — · 판매자 숨김 · 판매자 삭제 |
| 노출 게이트 (호환) | `posts.status`: 노출 중이면 판매 단계 미러(active/reserved/sold), 위 둘 중 하나라도 숨김이면 `hidden` — **트리거가 계산** (§F-1-1) | 표시하지 않음 (내부 값) |
| 신고 상태 | pending · reviewing · resolved · rejected · sanctioned | 대기 · 검토중 · 처리 · 반려 · 조치 |
| 제한 상태 | 진행 · 만료 · 해제 | |
| 홍보 상태 | pending_review · active · paused · ended · expired · rejected · cancelled | |

## D-4. 표시 규칙

- 날짜: **PHT** `YYYY-MM-DD HH:mm`, 목록은 날짜만 + hover 시각. DB 는 UTC 유지.
- 금액: `₱1,234` (가격) / `1,234 P` (포인트), 무료 나눔은 「나눔」.
- 반응형: 태블릿 가로(1024)부터 표 고정 열(썸네일·제목·관리)만, 나머지 열은 상세로. 가로 스크롤·버튼 잘림·시트 가림 0 (CUT G 하드락 기준 재사용).

## D-5. 전 페이지 최종 대조 (v2)

**현재** 열은 코드 확인 결과, **목표** 는 D-1~D-4 표준. 표준 키트: URL 상태 `useAdminListQuery` · 탭 `AdminTabs`(서버 count) · 기간 `PeriodFilter`(PHT) · `Pagination`(서버) · 조치 `AdminChatActionSheet`(사유·2단계·409/404).

| 화면 | 조회·새로고침 | 상태 탭 | 날짜 필터 | 페이지네이션 | 상세 | 수정 | 확인 팝업 | 문구 정리 |
|---|---|---|---|---|---|---|---|---|
| 대시보드 | 현재: 서버 1회 렌더, 새로고침 없음 → 목표: 새로고침 버튼 | — | 없음 → 오늘·7일·30일·직접 | — | 지표 → 목록 딥링크 (현재 무시됨) | — | — | 「Cut A/S1」류 주석성 문구 노출 여부 확인, 「확인 불가」 표기 유지 |
| 거래 게시물 | 5초 폴링·클라이언트 필터 → 조회 버튼 + 새로고침, URL 유지 | 클라이언트 40건 count → 서버 count 12탭 | 없음 → 등록일 기간 | 서버 total + 클라이언트 필터 혼재 → 서버 | 행 → 상세, 복귀 시 상태 유지 | 없음 → 상세에서 수정 | 자체 Confirm 컴포넌트 → 표준 시트 | 「끌올」 제거, 오류문 「sold_buyer_id 필요」 → 「구매자를 선택하세요」 |
| 게시물 상세 | 없음 → 새로고침 | — | — | — | 읽기 전용 + 상태 패널 | 없음 → 수정 폼(저장·취소, 409) | 즉시 실행 → 표준 시트 | 개발 용어 제거 |
| 거래 신고 | 클라이언트 필터(브라우저 RLS) → 서버 API | 대기·처리·반려 서버 count | 접수일 기간 | 서버 | 같은 화면 상세 | — | 사유 입력 있음 → 표준 시트 | — |
| 거래 활동 제한 (신설) | 표준 | 진행·만료·해제 | 시작일 기간 | 서버 | 회원 링크 | — | 표준 시트(2단계) | — |
| 거래 후기 | 표준 아님 → 표준 | 노출·숨김 | 작성일 기간 | 서버 | 거래글·회원 링크 | — | 없음(즉시 숨김) → 사유+확인 | — |
| 거래 채팅방 | 메신저 Admin 표준 (유지) | 유지 | 유지 | 유지 | 유지 | — | 유지 (사유·CAS) | — |
| 거래 진행·완료 | 최근 200 고정 → 서버 페이지 | 진행·완료·취소 | 기간 | 서버 | 채팅방·거래글 링크 | — | 표준 시트 | 「product_chats」 등 테이블명 제거 |
| 채팅 신고 | 유지 (권한만 확대) | 유지 | 유지 | 유지 | 유지 | — | 유지 | — |
| 판매자·구매자 (신설) | 표준 | 전체·제한 중·정지 | 가입·활동 기간 | 서버 | 탭형 상세 | — | 표준 시트 | 전화·이메일 비노출 |
| 거래 홍보 (신설) | 표준 | 승인 대기·진행·중지·종료·반려 | 신청일 기간 | 서버 | 주문 상세(원장 행 포함) | — | 표준 시트(환급은 2단계 + 금액 미리보기) | — |
| 홍보 상품·가격 | 즉시 저장 → 수정·저장·취소 | 활성·비활성 | — | — | — | 폼 | 저장 확인 | — |
| 포인트 (신설) | 표준 | 지급·회수·홍보·충전·환급 | 기간 | 서버 | 원장 행 → 관련 주문 | — | 지급·회수 2단계 | — |
| 충전 | 기존 #86 화면 (표준 준수) | 유지 | 유지 | 유지 | 유지 | — | 유지 | — |
| 거래 문의 (신설) | 표준 | 미답변·답변 완료·종료·이의신청 | 접수일 | 서버 | 기존 케이스 상세 | 답변 | — | — |
| 카테고리 | 브라우저 직접 쓰기·자체 Modal → 서버 API·표준 시트 | 활성·비활성 | — | — | — | 폼 | 삭제·이동 2단계 | — |
| 거래 정책 | 즉시 저장 → 수정·저장·취소 | — | — | — | — | 폼 | 저장 확인 | — |
| 지역 현황 (신설) | 표준 | — | 기간 | — | 지역 → 게시물 목록 | — | — | — |
| 운영 기록 | 공통 감사 화면 → 거래 대상 필터 | 대상 유형 | 기간 | 서버 | 전후 값 | — | — | — |

공통 제거 대상: 기능 설명 문단, 「SSOT·RPC·RLS·CAS·service role·테이블명」 등 개발 용어, 같은 안내 반복, 장식용 카드 테두리. **유지**: 삭제·제재·환급·영구 처리 확인 문구.

---

# E. 대시보드

## E-1. 공통 기준

- 시간대: **Asia/Manila**. 「오늘」 = 마닐라 자정~다음 자정. 기간 `[from 00:00 PHT, to+1일 00:00 PHT)` — 시작 포함·끝 배타 (마지막 날 전체 포함).
- 기간: 오늘 · 최근 7일(오늘 포함 7일) · 최근 30일 · 직접 지정. URL `?period=` → 서버 API `GET /api/admin/trade/overview?from&to` (기존 라우트 확장, 페이지는 이 API 사용). 날짜 바꾸면 기간형 지표만 다시 조회.
- 「처리 대기」 = 기간 무관 현재 잔여 / 「기간 통계」 = 기간 내 발생 — **다른 영역에 따로 표시**.
- 실패 = 「확인 불가」 + 상단 배너, 0 과 구분 (K-10 유지 + D-34 보완).
- 모든 지표 클릭 → 같은 조건이 걸린 목록 URL. 지표 쿼리와 목록 쿼리는 **같은 함수**(`buildTradePostsQuery`)로 만들어 숫자 일치.
- 갱신: 진입 시·새로고침 버튼·기간 변경 시. 자동 폴링 없음.

## E-2. 처리 대기 (기간 무관)

| 지표 | 집계 | 목록 연결 |
|---|---|---|
| 미처리 거래 신고 | `reports` 거래 대상 `status IN (pending, reviewing)` | `/admin/trade/reports?tab=open` |
| 홍보 승인 대기 | `point_promotion_orders domain=trade, order_status='pending_review'` | `/admin/trade/promotions?status=pending_review` |
| 미답변 거래 문의 | `support_cases` 거래 필터 `status IN (OPEN, WAITING_ADMIN)` | `/admin/trade/support?status=open` |
| 진행 중 거래 제한 | `sanctions scope=trade, revoked_at IS NULL, end_at>now()` | `/admin/trade/restrictions` |
| 만료 지났는데 active 홍보 | `active AND end_at<now()` (M6 후 0 이어야 함) | 〃 promotions |

## E-3. 현재 상태 (지금 몇 개)

| 지표 | 조건 (§F-1-0 거래글 범위) | 목록 |
|---|---|---|
| 전체 게시물 | `posts` 전체 (운영 200) | `?tab=all` |
| 앱 노출 중 | 사용자 피드 조건과 같은 함수 (운영 117) | `?tab=visible` |
| 판매중 · 예약중 · 거래완료 | 노출 중 글의 판매 단계 (inquiry·negotiating / reserved / completed) | `?tab=selling` · `reserved` · `sold` |
| 관리자 숨김 · 관리자 삭제 | `moderation_state` | `?tab=admin_hidden` · `admin_deleted` |
| 판매자 숨김 · 판매자 삭제 | `owner_state` | `?tab=owner_hidden` · `owner_deleted` |
| 원인 미확인 숨김 | `moderation_state='legacy_hidden'` (운영 20, 신규 발생 0) | `?tab=legacy_hidden` |
| 활성 홍보 | `active AND start_at<=now()<end_at` | promotions |

## E-4. 기간 통계 (선택 기간)

| 지표 | 날짜 컬럼 | 비고 |
|---|---|---|
| 신규 게시물 | `posts.created_at` | |
| 거래 완료 | **기존 `product_chats.seller_completed_at`** (구매자 = `posts.sold_buyer_id` 인 채팅). 운영 sold 63건 모두 값 있음 → 신규 컬럼·백필 없음 (v2, M3 철회). 판매자 완료 절차 없이 관리자가 완료로 정정한 글은 완료 시각을 **만들지 않고** 「완료 시각 기록 없음」 + 관리자 처리 시각(감사)을 별도 표기, 기간 통계에서 제외하고 건수를 따로 표시 | 결제 완료와 혼합 금지 (DIBAY 거래는 앱 결제 없음) |
| 신고 접수 / 처리 | `reports.created_at` / `resolved_at` | |
| 거래 채팅 시작 | `chat_rooms(item_trade).created_at` | |
| 홍보 시작 · 종료 | `start_at` / `ended_at`(없으면 `end_at`) | |
| 홍보 포인트 사용 · 환급 | `point_ledger.created_at` + 주문 domain 조인 (§G-2) | |
| 문의 접수 | `support_cases.created_at` | |
| 관리자 조치 수 | `audit_logs` 거래 대상 | |

하단: 카테고리별·지역별(상위 10) 게시물 표(기간 내 신규), 최근 관리자 조치 10건.

## E-5. 집계 SSOT

- 위치: `lib/admin/trade-admin/trade-metrics.ts` (커뮤니티 `lib/admin/metrics/community-metrics.ts` 같은 구조). 각 지표 = {테이블, 조건, 날짜 컬럼, 목록 URL 생성기}.
- 검증: 각 지표 값 = 연결 목록의 서버 total (테스트 + 운영 실측 표).
- 성능: count 는 `head:true`, 인덱스 `posts(trade_category_id, status, created_at)`·`(trade_lgu_id)` 확인 후 필요 시 추가(M8).

---

# F. 거래 운영 업무

## F-1. 게시물

### F-1-0. 거래글 판정 기준 (v2 — 사용자 앱과 대조)

| 구분 | 기준 (코드 근거) | 운영 값 |
|---|---|---|
| 사용자 앱 목록 (홈·마켓·카테고리) | `trade_category_id ∈ 활성 categories(type=trade)` AND `status IS NULL OR status NOT IN (hidden, sold)` — `type` 미사용 (`lib/posts/trade-posts-category-filter.ts:13,29-40`, `trade-posts-range-query.ts:233`) | 117 |
| 사용자 앱 「판매완료」 필터 | 위 카테고리 조건 + `status='sold'` (`home-posts-query-server.ts:101-103`) | 63 |
| 판매자 본인 화면 | 본인 글 전체 (숨김 포함) | — |
| 현재 관리자 | `type='trade'` (`admin-posts-management-data.ts:207`) | **55 (145 누락)** |
| **v2 관리자** | **`posts` 전체 행, 조건 없음.** 사용자 앱 기준은 「앱 노출 중」 탭이 **앱과 같은 필터 함수**를 import 해서 계산 | 200 / 노출 117 |

- 관리자 범위를 앱 기준보다 넓게(전체) 잡는 이유: 앱 기준(카테고리·상태)은 노출 여부 판정이지 관리 대상 판정이 아니다. 숨김·판매완료·비활성 카테고리 글도 관리 대상이다. 거래 카테고리가 아니거나 카테고리가 비활성인 글은 「분류 확인 필요」 탭에 모은다 (운영 0건 — 200건 모두 활성 거래 카테고리, 하위 카테고리 0).
- `posts` 에 다른 도메인 글이 섞일 가능성: 코드에 `type='community'/'service'` 분기가 있으나(`home-posts-query-server.ts:197-199`) 운영 0건. 들어오면 「분류 확인 필요」로 보이므로 누락되지 않는다.
- **무누락 검증 (J-2)**: 관리자 전체 total = `count(*) from posts` (200) · 「앱 노출 중」 total = 앱 필터 함수 결과 수 (117) · 탭 합계 = 전체.

### F-1-1. 상태 모델 정리 (D-02·D-03·D-10·D-13) — v2 확정안

**원칙**: 판매 단계 원본(`seller_listing_state`·`reserved_buyer_id`·`sold_buyer_id`)은 숨김·삭제·복원이 **절대 건드리지 않는다.** 노출 원인은 별도 컬럼에 둔다. 기존 독자(앱 피드·유사 글·채팅 시작 검사 등)가 보는 `posts.status` 는 **호환용 노출 게이트**로 남겨 앱 코드 변경을 최소화한다.

| 컬럼 | 값 | 누가 바꾸나 |
|---|---|---|
| `seller_listing_state` (+ 구매자 id) | inquiry · negotiating · reserved · completed | 판매자 거래 흐름, 관리자 「판매 단계 정정」만 |
| `moderation_state` (신설) | visible · admin_hidden · admin_deleted · legacy_hidden | 관리자 API 만 |
| `owner_state` (신설) | none · owner_hidden · owner_deleted | 판매자 API 만 |
| `posts.status` (기존) | 트리거 계산: `moderation_state='visible' AND owner_state='none'` 이면 판매 단계 미러(inquiry·negotiating→active, reserved→reserved, completed→sold), 아니면 `hidden` | **직접 쓰기 금지** (트리거만) |

- `status` CHECK(`active,reserved,sold,hidden`)는 **그대로** — `deleted` 를 추가하지 않는다. 삭제는 `admin_deleted`/`owner_deleted` + `status='hidden'`.
- 숨김 → 복원 시 `status` 는 보존된 판매 단계에서 다시 계산 → **판매완료 글은 판매완료로, 예약 글은 예약으로 돌아온다** (D-10 해소).
- 판매자 숨김(`owner-status hidden`)은 `owner_state` 만 바꾸고, 지금처럼 `seller_listing_state='inquiry'`·`reserved_buyer_id=null` 로 초기화하지 않는다 (D-13).
- 판매자 「다시 보이기」는 `owner_state` 만 해제 → 관리자 숨김은 유지된다 (D-04 ①).
- 판매자 삭제(`owner-delete`)는 `owner_state='owner_deleted'` (CHECK 위반 → hidden 폴백 제거).
- 관리자 복원은 `moderation_state` 만 되돌린다 → 판매자가 숨기거나 삭제한 글은 관리자 복원으로 노출되지 않는다.
- 앱 피드 조건 (`status NOT IN (hidden, sold)`) 은 **변경 없음** — 트리거가 같은 의미의 `status` 를 계속 만든다. 검색·정렬·지역 순서 무변경.
- **기존 쓰기 경로 호환 (v2 확인)**: `posts.status` 를 쓰는 서버 경로 **약 20곳** (grep 기준 22개 파일, 전수 목록은 구현 첫 단계에서 확정) (판매 단계 7: `seller-listing-state`, `trade-lifecycle`, `owner-trade-update`, `chat/rooms/[roomId]/trade-status`, `seller-complete`, `buyer-confirm`, `maybe-auto-promote-trade-listing-negotiating` 외 · 숨김·삭제 5: `owner-status`, `owner-delete`, 관리자 `status`, `trade-override`, 신고 숨김 · 기타: `trade-flow/revert`, 가격 제안, 홍보 신청, 리셋 도구 등).
  - 판매 단계를 바꾸는 경로는 **수정하지 않는다** — 트리거가 `status` 로 들어온 판매 값(active/reserved/sold)을 `seller_listing_state` 와 대조해 받아들이고, 숨김 중이면 `status` 만 `hidden` 으로 유지 (판매 단계는 저장됨).
  - 숨김·삭제 경로 5곳만 노출 컬럼을 쓰도록 바꾼다. 바뀌지 않은 경로가 `status='hidden'` 을 직접 쓰면 트리거가 **오류로 거부** → 테스트에서 드러나고 운영에서 조용히 섞이지 않는다.

### F-1-1-A. 기존 데이터 이관 — 판매 상태 무훼손 (M2)

| 기존 행 | 이관 | 판매 단계·구매자 | `status` |
|---|---|---|---|
| active 113 · reserved 4 · sold 63 | `moderation_state='visible'`, `owner_state='none'` | 변경 없음 | 변경 없음 (트리거 결과 = 현재 값과 동일 — 마이그레이션 안에서 불일치 0 검증, 1건이라도 다르면 롤백) |
| hidden 20 | §F-1-1-B | 변경 없음 (현재 모두 inquiry, 이전 단계는 복구 근거 없음 → 추정해서 되살리지 않음) | `hidden` 유지 |

- 이관 전후 대조: `(status, seller_listing_state, reserved_buyer_id IS NULL, sold_buyer_id IS NULL)` 별 건수가 **완전히 같아야** 한다 (실측 표 J-6).
- 완료 시각: 새로 만들지 않는다. 표시는 `product_chats.seller_completed_at` 만 (63/63 존재).

### F-1-1-B. hidden 20건 — 원인 미확인 보존 (v2 정정)

- **근거 재조사 결과**: 20건 모두 관리자 감사 0 · 신고 0 · 신고 처리 기록 0 · 홍보 0 · 구매자 지정 0, 채팅방 있음 2건. 판매자 숨김(`owner-status`)·판매자 삭제(`owner-delete`)·관리자 숨김 모두 기록을 남기지 않던 경로라 **원인을 확정할 근거가 없다.** v1 의 「감사 있는 5건 → 관리자 숨김」은 잘못된 집계였다 (해당 기록은 현재 노출 중인 다른 글 1건의 기록).
- **처리**: 20건 모두 `moderation_state='legacy_hidden'`(원인 미확인), `owner_state='none'`, 판매 단계·`status` 변경 없음. → **앱 노출 상태는 지금과 동일(비노출).**
- 화면: 「원인 미확인 숨김」 탭에서만 보인다. 관리자 버튼은 「관리자 숨김으로 확정」(사유 필수)만 제공하고, **관리자 복원은 제공하지 않는다** (판매자가 지운 글을 되살릴 위험).
- 판매자 쪽: 지금은 판매자가 본인 숨김 글을 「다시 보이기」로 풀 수 있다. legacy_hidden 에 대해 이 동작을 유지할지 막을지는 **O-8** (자동 결정하지 않음).
- 신규 발생 0 보장: 트리거·API 가 `legacy_hidden` 을 새로 쓰지 못하게 한다 (마이그레이션에서만 설정).

### F-1-2. 판매자 직접 쓰기 차단 (D-04)

- `authenticated` UPDATE 권한을 판매자 편집 컬럼(제목·본문·가격·이미지·카테고리·지역·거래 조건)으로 축소, 상태·카운터·노출·구매자 컬럼은 서버 API(service role)만. `posts_delete_own` 정책 제거 (판매자 삭제는 API 소프트 삭제).
- 사전 확인: 앱의 판매자 쓰기 경로가 브라우저 직접 UPDATE 를 쓰는지 전수 조사 후 전환 (커뮤니티 C-01 과 같은 절차, 회귀 테스트 필수).

### F-1-3. 관리자 수정 (D-16)

- `PATCH /api/admin/trade/posts/[id]` — 허용 필드만, `expected_updated_at` CAS, 이전 값을 `trade_post_revisions`(M4, 커뮤니티 `community_post_revisions` 와 같은 구조)에 저장 + 감사.

### F-1-4. 삭제 (D-09·D-25)

- 관리자 「삭제」 = `moderation_state='admin_deleted'` (소프트, `status` 는 트리거가 `hidden`). 채팅·신고·홍보·후기 연결 보존, 앱 비노출, 판매 단계 보존.
- 관리자 「판매 단계 정정」(기존 `trade-override`·sold 지정)은 판매 단계 컬럼만 바꾸고 노출 컬럼은 건드리지 않는다. 판매자 완료 절차 없이 완료로 정정하면 완료 시각은 만들지 않는다 (§E-4).
- **하드 삭제(영구)**: 관리 화면에서 제거. 필요 시 super_admin 전용 + 연결(신고·채팅·홍보) 0 건 + 사유 + 감사. (Owner 결정 O-3)

### F-1-5. 끌올 (D-17)

- 사용자 앱 정렬이 `created_at` 이므로 관리자 끌올은 효과가 없다 → **버튼 제거.** 앱에 끌올 정책이 없으므로 신설하지 않는다.

## F-2. 판매자·구매자 → §C-6

## F-3. 신고·분쟁·제재

```
신고 접수(앱) → 대기 → [검토] → 반려(사유, 알림)
                         └→ 조치: 숨김(같은 대상 대기 신고 일괄 종료) / 경고 / 거래 활동 제한(scope=trade) / 계정 정지(MCC)
                                   └→ 알림(신고자: 처리 결과, 대상자: 조치·이의신청 안내)
이의신청(support_cases reference=TRADE_SANCTION) → 거래 문의 화면 appeal 탭 → 유지/해제
```

- 분쟁: 별도 테이블 없음. 거래 채팅 신고 + 거래 진행(trade-flow) + 문의(카테고리 `TRADE`)로 처리. **분쟁 전용 모델 신설은 하지 않는다** (O-5).
- 동시 처리: 신고·제한·홍보 모두 CAS(현재 상태 조건) + 409. 제한 중복은 partial unique(`user_id, scope, restriction` where 진행 중).

## F-4. 감사 기록

- 대상 타입 통일: `trade_post` · `trade_report` · `trade_restriction` · `trade_promotion` · `trade_category` · `trade_settings` · `transaction_review` · `room`.
- 모든 주요 조치: 대상·사유·처리자·시각·전후 값·결과. `appendAuditLog` 는 `await` (실패 시 조치 응답에 경고) — 커뮤니티 `community-admin-audit.ts` 재사용.
- 운영 기록 화면: 위 타입 필터 · 처리자 · 기간 · 대상 ID 검색 + 찜 기록 탭.

## F-5. 지역

- M5: `trade_lgu_id` NULL 173건 백필 — 레거시 코드(`manila/m2` 등)는 기존 매핑 테이블 `trade_local_area_lgu_map`(143행)로, 자유 문자열은 `trade_national_lgu_alias` 로 매칭, 실패 건은 목록으로 보고(수동 확인).
- 관리자 필터·통계는 LGU 기준. 앱 노출 정책(K-1)은 그대로.

---

# G. 홍보·금전 업무

## G-0. 트랜잭션 경계 (v2)

### G-0-1. 현재 경계 (확인)

| 경로 | 현재 처리 | 부분 성공 가능 지점 |
|---|---|---|
| 회원 즉시 구매 `purchase_member_content_promotion` | DB 함수 1개: 회원 행 `FOR UPDATE` → 잔액 검사 → 주문 INSERT(멱등 키 unique) → 원장 차감 | 없음 (PASS) |
| 회원 승인형 신청 `applyTradePaidExposurePending` | TS: 주문 INSERT → 보류(hold) 생성·원장 → 실패 시 주문 DELETE 로 되돌림 | 보류는 됐는데 주문 되돌림 실패 / 잔액 검사 없음 (운영 −1 사례) |
| 관리자 승인·반려 | TS: 주문 상태 CAS → 이어서 보류 확정(capture)/해제(release) | 상태만 바뀌고 포인트 미처리 |
| 관리자 중지·재개·종료 (거래) | TS 직접 UPDATE, 환급 없음, 사유 버림 | 감사 실패 시 무기록 |
| 관리자 중지·재개·종료 (커뮤니티 M9) | DB 함수: CAS·환급 1회 unique | 감사는 함수 밖 TS → 돈은 처리됐는데 감사 없음 가능 |
| 만료 | `expire_point_promotion_orders()` 호출처 없음 | 미실행 |
| 감사 기록 `appendAuditLog` | 조치 후 `void` 호출 | 조치 성공·감사 실패 |

### G-0-2. 설계: 「조치 1건 = DB 함수 1번 호출 = 트랜잭션 1개」

거래 홍보·포인트 조치는 전부 거래 전용 DB 함수로만 실행한다. API(TS)는 권한 확인 후 함수 하나만 호출하고, 그 뒤에 DB 쓰기를 하지 않는다.

함수 안 순서 (모든 함수 공통):

1. 주문 행 `SELECT … FOR UPDATE` → `domain='trade'` 확인 (아니면 거부).
2. 상태 조건 검사 (예: 승인은 `pending_review` 만). 맞지 않으면 **현재 상태를 돌려주고 아무것도 쓰지 않음** → API 409 「이미 처리됨」.
3. 금전 처리가 있으면 회원 포인트 행 `FOR UPDATE` → 잔액 검사(차감 시) → `point_ledger` INSERT. 원장 행은 `(related_type, related_id, entry_type)` unique 로 **같은 주문에 같은 종류 1회만**.
4. 보류(hold) 행 상태 변경 (`held → captured/released`, 조건부).
5. 주문 상태·종료 정보(`ended_at`, `end_reason_code`, `fault`, `refund_points`, `refund_ledger_id`) 갱신.
6. **`audit_logs` INSERT 를 같은 함수 안에서** (처리자·사유·전후 상태·금액). 감사 INSERT 가 실패하면 함수 전체가 롤백 → 「돈은 처리됐는데 기록 없음」이 생길 수 없다.
7. 결과 JSON 반환.

| 조치 | 함수 (신설) | 금전 | 중복 방지 |
|---|---|---|---|
| 회원 승인형 신청 | `request_trade_promotion_review` | 보류 (잔액 검사) | 멱등 키 unique + 보류 1회 unique |
| 승인 | `admin_trade_promotion_approve` | 보류 → 확정 | 상태 CAS + capture 1회 unique |
| 반려 | `admin_trade_promotion_reject` | 보류 → 해제 (전액) | 상태 CAS + release 1회 unique |
| 중지 · 재개 | `admin_trade_promotion_pause/resume` | 없음 (재개 시 종료일 연장) | 상태 CAS |
| 종료 (환급) | `admin_trade_promotion_end` | 귀책 기준 비례 환급 | 상태 CAS + 환급 1회 unique (기존 `uq_point_ledger_promotion_refund_once`) |
| 만료 | `expire_trade_promotion_orders` (cron 10분) | 없음 (기간 소진) | 행 단위 CAS, 처리자 `system` 감사 |
| 관리자 포인트 지급·회수 | 기존 `admin_adjust_user_points` (#86) | 지급·회수 | 기존 멱등 키 unique — 감사 INSERT 를 함수 안으로 옮기는 것만 추가 |

- 중지·재개·종료 함수는 **커뮤니티 M9 함수를 같은 트랜잭션 안에서 호출하는 거래 전용 래퍼**로 만든다 (도메인 검사 + 감사 추가). 커뮤니티 함수·화면 동작은 바꾸지 않는다.
- 재시도·더블클릭: API 는 화면이 만든 멱등 키를 그대로 넘긴다. 같은 키 재요청 → 첫 결과 반환. 다른 키라도 상태 CAS·원장 unique 가 두 번째 처리를 막는다 → 409.
- 알림(회원에게 승인·반려 안내)은 돈과 무관하므로 커밋 **후** 발송, 실패는 감사에 「알림 실패」로 남기고 조치는 유지.
- 레거시 `trade_post_ads` (0행, 신규 쓰기 차단): 관리자 쓰기 API 를 막고 읽기 전용 이력으로만 둔다 → 임의 상태 지정으로 보류가 남는 경로 제거 (D-23).
- 게시물·신고·제한 등 금전이 없는 조치도 같은 원칙: 상태 변경 + 감사를 한 DB 함수에서 (감사 실패 = 조치 실패). 지금의 `void appendAuditLog` 는 거래 Admin 에서 쓰지 않는다.

## G-1. 거래 홍보 `/admin/trade/promotions`

| 항목 | 설계 |
|---|---|
| 데이터 | `point_promotion_orders` `domain='trade'` (실제 운영 경로). 레거시 `trade_post_ads` 는 「이전 기록」 탭 읽기 전용 |
| 탭 | 승인 대기 · 진행 중 · 일시 중지 · 종료 · 반려·취소 (서버 count) |
| 열 | 게시물(썸네일·제목) · 신청자 · 위치(placement) · 기간 · 포인트 · 상태 · 환급 |
| 버튼 | 승인 · 반려(사유, 포인트 해제) · 일시 중지 · 재개(종료일 연장) · 종료(사유·귀책 → 비례 환급) |
| 처리 | §G-0-2 거래 전용 함수만 사용 (승인·반려·중지·재개·종료·만료) |
| 만료 | `expire_trade_promotion_orders()` 를 Vercel cron 라우트(`/api/cron/promotion-orders-expire`, 10분)에서 호출 (D-07). 운영 active 경과 2건(08-14, 09-26 종료)은 첫 실행에 `expired` + 감사. 커뮤니티 주문은 이 함수가 건드리지 않는다 |
| 실적 | 기존 노출·클릭 집계가 있으면 표시, 없으면 표시하지 않음 (NOT_PROVEN — 구현 전 확인) |

## G-2. 포인트 `/admin/trade/points`

- 원장: `point_ledger` 단일. 거래 관련 행 = `related_type='trade_post_ad'` ∪ (`related_type='promotion_order'` AND 주문 domain=trade, `related_id` 의 `hold:`/`capture:`/`release:` 접두 정규화 후 조인) — 공용 함수 `resolvePromotionLedgerOrderId()` 로 커뮤니티 원장 누락(D-30)도 함께 해소.
- 회원 잔액·원장 조회, 관리자 지급·회수 = 기존 RPC `admin_adjust_user_points`(K-5) 재사용, 멱등 키 필수(서버 무작위 생성 제거, D-48).
- 잔액 보호 (D-08): `ad_hold`·`ad_purchase`·`spend` 차감을 RPC(회원 행 잠금 + 잔액 검사 + `(related_type, related_id, entry_type)` unique)로 이전. 기존 음수 잔액 2명은 **조정하지 않고 보고**(커뮤니티 회수 −38 은 커뮤니티 정책 영역, O-7).

## G-3. 충전

- 충전은 도메인 구분 데이터가 없다(커뮤니티 설계 F-3-1 과 동일 결론) → **공용 충전 화면을 거래 메뉴에서도 연결**, 거래 전용 충전 목록은 만들지 않는다. 입금 확인·승인·반려는 #86 RPC 그대로.

## G-4. 거래 문의 `/admin/trade/support`

- `support_cases` 재사용. 참조 유형 추가: `TRADE_POST`, `TRADE_CHAT_ROOM`, `TRADE_SANCTION` · 카테고리 `TRADE` 추가 (레지스트리 + 앱 문의 진입점: 거래글 상세·거래 채팅 「문의하기」에서 참조 자동 첨부).
- 필터 `group=trade`: 위 참조 유형 ∪ `POINT_PROMOTION_ORDER`(주문 domain=trade) ∪ 카테고리 `TRADE`. 커뮤니티 필터에서 거래 홍보 문의 제외(D-29 반대편).
- 탭: 미답변 · 답변 완료 · 종료 · 이의신청. 담당자 배정·답변·재오픈은 기존 기능.

## G-5. 권한 (§14)

### G-5-1. 결정: 신규 키를 만들지 않고 기존 키로 대응 (커뮤니티 E-1 과 같은 방식)

| 영역 | 키 | 적용 API |
|---|---|---|
| 메뉴·목록·상세 조회 | `products` (또는 아래 영역 키 중 하나) | 거래 전 GET |
| 게시물 숨김·삭제·복원·판매 단계 정정 | `products` | posts status·override·삭제 |
| 게시물 내용 수정 | `product_edit` | PATCH posts |
| 신고 처리·거래 제한·해제 | `reports` | trade reports·restrictions |
| 후기 숨김 | `reviews` | transaction-reviews |
| 거래 채팅 | `chats` 또는 `products` | 기존 |
| 홍보 승인·반려·중지·종료(환급 포함) | `ads` (모든 활성 운영자 기본 — 기존 Owner 결정) | promotions·trade-ad-products |
| 포인트 지급·회수·충전 | `point` | 기존 |
| 카테고리 | `boards` | categories API |
| 거래 정책·설정 | `settings` | trade settings·ops policy |
| 계정 정지 | `users` | MCC (기존) |
| 영구 삭제 | super_admin | (O-3) |
| 감사 기록 조회 | 관리자 전원 (현행) | audit |

### G-5-2. 전환 절차 (운영 차단 방지)

1. **운영 확인 결과 (v2)**: 활성 4명 = super_admin 2 (키 검사 통과) + operator 2 (개별 덮어쓰기 없음 → 기본 키). operator 기본 키에 `products·product_edit·reports·reviews·chats·users·ads·boards` 가 이미 있으므로 **게시물·신고·후기·채팅·홍보·카테고리에 키를 적용해도 막히는 사람은 0명.** 일괄 부여 불필요.
2. 키 적용으로 새로 막히는 것은 없고, **원래부터 operator 에게 없는** `point`(포인트·충전)·`settings`(거래 정책)는 지금도 operator 가 못 한다 → 이를 열지 여부만 **Owner 결정 O-2** (금전 권한이라 자동 부여하지 않음).
3. 승인 ② 직전 같은 조회를 다시 실행해 보유 현황이 바뀌지 않았는지 확인 후 보고에 첨부.
3. 프런트: 권한 없는 버튼 비활성. 서버: 키 검사. DB: service role 경로만 (브라우저 직접 쓰기 0).

### G-5-3. 정책 충돌 보고

- **홍보 승인 권한(`ads`, 전원)과 환급(금전 지급)이 같은 키** — 종료 시 비례 환급이 자동으로 따라온다. 환급 금액 상한이 없다 (주문 포인트 이하로 RPC 가 제한). 분리할지 = **Owner 결정 O-1**.

---

# H. 구현 계획

## H-0. 승인 2단계

- **승인 ①** (이 문서): 구현·테스트 DB 적용·테스트 → 검증 보고.
- **승인 ②**: 검증 보고 승인 → main 병합(한 통합 PR) → 운영 DB 마이그레이션 → Production 배포 → 운영 실측 → HARD LOCK.

## H-1. 우선순위

| 단계 | 항목 | 결함 |
|---|---|---|
| **P0** | 거래글 범위(카테고리 기준) · 상태 모델 분리·삭제 정상화 · 판매자 직접 쓰기 차단 · 카테고리 서버 API · 권한 키 · 홍보 만료 cron · 홍보 승인/반려 RPC·차감 잔액 보호 · 하드 삭제 제거/통제 | D-01~09 |
| **P1** | 복원 판매 단계 보존 · 대시보드 실데이터·기간·딥링크 · 목록 서버 탭·검색·URL 상태 · 관리자 수정·이력 · 거래 제한(강제) · 신고 일괄 종료·알림 · 홍보 화면·M9 RPC · 판매자·구매자 · 감사 통일 · 이의신청·문의 분류 · 원장 거래 필터 · 지역 백필·필터 | D-10~31 |
| **P2** | 판매중 탭 정의 · 신고 지표 정의 · 오류 배너 · 썸네일 공용 함수 · 메뉴 정리·목업 제거 · 찜 기록 · anon 폴백 · 채팅 신고 권한 · 표시 규칙·문구 정리 | D-32~52 |

## H-2. DB 마이그레이션 (v2: 6종 · 기존 데이터 삭제 없음 · 판매 상태 변경 없음)

| ID | 내용 | 롤백 |
|---|---|---|
| ~~M1~~ | **철회 (v2)** — `type` 백필 불필요 (관리자 범위를 `posts` 전체로) | — |
| M2 | `moderation_state`·`owner_state` 추가 + `status` 계산 트리거 + 이관 (180건 visible/none, 20건 legacy_hidden) + **이관 전후 `(status, seller_listing_state, 구매자 id 유무)` 건수 동일 검증, 다르면 RAISE 로 전체 롤백** · `status` CHECK 유지 | 트리거·컬럼 drop (status 값은 바뀌지 않았으므로 복원 불필요) |
| ~~M3~~ | **철회 (v2)** — 완료 시각은 기존 `product_chats.seller_completed_at` (63/63) | — |
| M4 | `trade_post_revisions` (관리자 수정 원본) | drop |
| M5 | `trade_lgu_id` 백필 (매핑 성공분만, 실패 목록 보고) | 백필 ID 목록으로 NULL 복원 |
| M6 | `posts` 컬럼 권한 축소 (`status`·노출·카운터·구매자 컬럼 제외) + `posts_delete_own` 제거 | 권한 재부여 |
| M7 | `sanctions.scope` CHECK 에 `trade`, `sanction_type` 에 `trade_restriction`, `restriction` 에 `chat` + 진행 중 중복 partial unique | CHECK 원복 |
| M8 | §G-0-2 거래 홍보 함수 7종 + 차감 잔액 보호 + `point_ledger (related_type, related_id, entry_type)` 부분 unique (`ad_hold`·`capture`·`release`·`spend`) — 운영 기존 중복 0 확인 · `admin_adjust_user_points` 감사 함수 내 기록 | 함수 drop, 인덱스 drop |

> 카테고리 서버 API 는 service role 사용 → RLS 변경 불필요. `trade_categories`(0행) 는 이번에 drop 하지 않고 미사용 등록만.

## H-3. 영향 파일 (주요)

- 게시물: `lib/admin-products/admin-posts-management-data.ts`, `admin-trade-overview-counts.ts`, `components/admin/posts-management/*`, `app/api/admin/posts/**`, `app/api/posts/[postId]/owner-delete/route.ts`, `owner-status/route.ts`, `lib/trade/posts-listing-write-fields.ts`, `lib/admin-reports/applyReportActionDaangn.ts` (숨김 경로 5곳). **앱 피드·검색·정렬·지역 쿼리 파일은 변경 없음** (v2: `status` 호환 게이트 유지). 관리자 「앱 노출 중」 탭은 앱의 `buildTradePostsStatusAndCategoryAndFilter` 를 import 만 한다.
- 신고·제한: `lib/admin-reports/applyReportActionDaangn.ts`, 신규 `app/api/admin/trade/restrictions`, 거래 쓰기·채팅 API 가드.
- 홍보: `lib/promotion/admin-boost-lifecycle.ts`, `apply-trade-paid-exposure.ts`, `app/api/admin/trade-promotion-orders/**`, 신규 cron 라우트, `vercel.json`.
- 포인트: `lib/points/user-point-ledger.ts`, `app/api/admin/users/[id]/points/route.ts`.
- 카테고리: `lib/categories/**` → 신규 `app/api/admin/trade/categories`.
- 문의: `lib/support/support-reference-authority.ts`, `support-category-registry.ts`, 신규 `support-trade-filter.ts`.
- 메뉴·키트: `components/admin/admin-menu.ts`, i18n 키, `components/admin/kit/*`.

## H-4. 웹·네이티브

- **웹만.** 네이티브 파일 변경 없음 → 배포 후 앱 재시작으로 반영.

## H-5. 회귀 위험과 방어

| 위험 | 방어 |
|---|---|
| 앱 피드에서 글이 사라지거나 늘어남 | 피드 쿼리 무변경 + M2 가 `status` 값을 하나도 바꾸지 않음을 마이그레이션 안에서 검증 (노출 117 유지, hidden 20 비노출 유지) |
| 판매 단계 쓰기 경로가 트리거와 충돌 | 전수 목록의 각 경로를 테스트 DB 에서 호출 (판매중→예약→완료→취소, 숨김 중 완료 처리 등) — 트리거 거부·값 불일치 0 |
| 판매자 수정·예약·완료 기능 차단 (M6) | 판매자 쓰기 경로 전수 목록 + 각 경로 테스트, 테스트 DB 선적용 |
| 커뮤니티 키트 이동 시 커뮤니티 화면 회귀 | 재export, 커뮤니티 기존 테스트 전부 통과 |
| 거래 채팅·배달·메신저 | 변경 없음 (거래 제한 가드만 거래 채팅 시작·전송에 추가) |
| 권한 전환으로 운영자 차단 | G-5-2 사전 목록 |

## H-6. 검증 방법

- 로컬: `npm run typecheck:build` + 변경 관련 vitest + 변경 파일 eslint (1회).
- 테스트 DB: 마이그레이션 적용 → 각 버튼 실제 호출(권한 있음/없음/동시 처리 409).
- 운영 실측(승인 ② 후): 대시보드 지표 = 목록 total 대조표, 관리자 숨김 → 앱 비노출 → 복원 → 판매 단계 유지, 홍보 만료 cron 실행 결과, 카테고리 저장 후 앱 반영.

---

# I. Owner 결정 사항

각 항목은 **권장안**과 **그 권장안을 택했을 때 남는 실제 위험**을 나눠 적었다. 「자동 승인」 열이 「아니오」인 항목은 설계 승인 ①에 포함되지 않으며, Owner 가 항목별로 명시해야 구현에 반영한다. 명시가 없으면 **현행 유지**로 구현한다.

| ID | 결정할 것 | 권장안 | 권장안의 실제 위험 | 반대안의 실제 위험 | 결정 없을 때 구현 | 자동 승인 |
|---|---|---|---|---|---|---|
| O-1 | 홍보 **환급**을 `ads`(활성 operator 전원)와 분리할지 | 분리하지 않음 (커뮤니티와 동일) | operator 가 귀책 「운영자」로 종료하면 남은 기간 비례 포인트가 환급됨 — 주문 포인트 이하·1회로 제한, 감사·사유 필수 | 분리(`point` 요구) 시 operator 2명은 홍보 종료를 끝까지 처리 못 함 → super_admin 대기 | 분리하지 않음 (현행 `ads` 정책과 동일) | 예 (기존 Owner 결정 #86 의 연장) |
| **O-2** | operator 에게 **`point`(포인트 지급·회수·충전 승인)**·**`settings`(거래 정책)** 를 열지 | **열지 않음** | 포인트·충전·정책 변경은 super_admin 2명만 → 거래 운영자는 해당 화면을 보지만 처리 못 함 (독립 운영의 금전 부분은 super_admin 의존) | 열면 operator 가 임의 금액 지급·충전 승인 가능 — 금전 사고 범위 확대 | 열지 않음 (현행) | **아니오** |
| O-3 | 거래글 **영구 삭제** 유지 | 관리 화면에서 제거, super_admin + 연결(신고·채팅·홍보) 0건일 때만 | 개인정보 삭제 요청 등 영구 삭제가 꼭 필요할 때 super_admin 만 가능 | 유지 시 신고·채팅 증거 연결 끊김 (현 결함 D-09) | 화면에서 제거, API 는 super_admin 전용 | 아니오 |
| O-4 | 거래 공지·상단 고정·금지 품목 신설 | 이번 범위 제외 | 거래 공지 수단 없음 (현재와 같음) | 신설 시 앱 화면·데이터 모델 추가 → 범위 확대 | 제외 | 예 (현행 유지) |
| O-5 | 거래 **분쟁** 전용 모델 | 신설 안 함 | 분쟁은 신고·거래 진행·문의를 오가며 처리 | 신설 시 범위 확대 | 신설 안 함 | 예 (현행 유지) |
| O-6 | 거래 채팅 본문 열람 **사유 필수** | 현행 유지 (사유 선택 + 열람 감사) | 사유 없는 열람이 가능 (기록은 남음) | 필수화 시 긴급 확인이 한 단계 느려짐 | 현행 | 예 (현행 유지) |
| O-7 | 기존 음수 잔액 2명 | 조정하지 않고 신규 발생만 차단 | 음수 잔액 회원 1명(−38, 커뮤니티 회수)이 계속 음수 | 조정 시 원장 수동 행 발생 — 커뮤니티 영역 | 조정 안 함 | 예 (데이터 무변경) |
| **O-8** | 원인 미확인 숨김 20건 (§F-1-1-B) — 판매자 「다시 보이기」 허용 여부 | **현행 유지 (허용)** — 20건 모두 신고 0·관리자 기록 0 | 만약 그중 관리자 숨김이 있었다면 판매자가 다시 노출할 수 있음 (지금도 같은 상태) | 막으면 본인이 숨긴 판매자가 영영 다시 노출 못 함 → 문의 발생 | **현행 유지** (데이터는 legacy_hidden 으로 보존만, 앱 동작 무변경) | **아니오** |

- O-2·O-8 은 위험 비교가 남는 결정이라 승인 ① 에 묶이지 않는다. 결정 전에는 「결정 없을 때 구현」 열대로 **현재 운영 동작을 바꾸지 않는** 쪽으로만 구현한다.

---

# J. 완료 판정 기준 (HARD LOCK 조건)

| # | 기준 | 증거 |
|---|---|---|
| J-1 | 거래 업무(게시물·신고·제한·채팅·회원·홍보·포인트·충전·문의·카테고리·정책·기록)를 거래 메뉴 안에서 완료 | 메뉴→화면→조치 실행 기록 |
| J-2 | 관리자 전체 total = `count(*) posts` (현재 200), 「앱 노출 중」 total = 앱 필터 함수 결과 (현재 117), 탭 합계 = 전체 | 운영 조회 대조 |
| J-2a | M2 이관 전후 `(status, seller_listing_state, 구매자 id 유무)` 건수 완전 동일, 앱 노출 117 유지, legacy_hidden 20 | 마이그레이션 검증 쿼리 결과 |
| J-3 | 상태 탭 숫자 = 각 탭 목록 total, 대시보드 지표 = 연결 목록 total | 대조표 |
| J-4 | 기간 필터: 오늘/7일/30일/직접 — 기간형 지표 값 변화, 경계일 포함 확인 (PHT) | 실측 표 |
| J-5 | 썸네일: 표본 20건 앱·관리자 동일 URL | 표 |
| J-6 | 숨김·복원·삭제·수정·판매 단계 정정 — 판매 단계 보존, 409 충돌, 감사 기록 | 운영 실측 |
| J-7 | 판매자 PostgREST 직접 상태 변경·삭제 거부 | 운영 요청 결과 |
| J-8 | 카테고리 저장 → DB 반영 → 앱 반영 | 실측 |
| J-9 | 거래 제한: 작성·채팅 차단 / 해제 시 복구 | 실측 |
| J-10 | 홍보: 만료 자동 처리, 종료 비례 환급 1회, 승인·반려 원자 처리. 테스트 DB 에서 감사 INSERT 를 강제로 실패시켜 **주문·보류·원장이 모두 그대로**인지, 같은 요청 2회·동시 2건이 **1건만 처리**되는지 확인 | 원장·주문·감사 대조 |
| J-11 | 권한: 키 없는 계정 403, 버튼 비활성 | 실측 |
| J-12 | 회귀: 거래 앱 검색·정렬·지역·채팅, 커뮤니티 Admin, 배달 — 기존 테스트 + 실측 | CI + 실측 |
| J-13 | 확인 못 한 항목은 NOT_PROVEN 유지 | 보고서 |

**코드 테스트 PASS 만으로 완료 선언하지 않는다.** 브랜치 PASS / Production PASS / 실기기 PASS 를 구분 보고한다.

---

## 부록 — NOT_PROVEN 목록 (이번 감사)

- 카테고리 거짓 성공·끌올 0행 성공의 실제 화면 재현 (RLS·데이터로는 확정)
- 거래 홍보 실적(노출·클릭) 데이터 존재 여부
- `void appendAuditLog` 실제 유실 사례
- 신고 목록 `test_users` 닉네임 조회의 실제 표시 영향
- 판매자 앱의 브라우저 직접 `posts` UPDATE 경로 존재 여부 (M6 전 전수 조사 필요)
- (v2) hidden 20건 각각의 실제 원인 — 기록이 없어 확인 불가, 「원인 미확인 숨김」으로 보존
- (v2) 관리자 판매 완료 정정 글의 완료 시각 — 만들지 않음 (현재 해당 글 0건: sold 63건 모두 판매자 완료 시각 있음)
- Preview·Production 화면 동작 (이번 단계는 읽기 전용 코드·DB 감사)
