# 배달 오너(매장 사장님) — 정보구조(IA)·사이드 메뉴·페이지 정체성·UI/UX/CTA 감사 (IA-)

- 감사일: 2026-10-20 (PHT) · 방식: 코드 정적 분석 + 운영 DB(`ckdosyydvgzqwpbwuhon`) 읽기 전용 집계 SQL
- 수정·커밋 없음. 오너 화면 로그인 불가 → **런타임 동작은 전부 NOT_PROVEN**, 판정은 코드/DB 근거
- 운영 DB 집계(2026-10-20): `stores` 17개 **전부 approved**, 오너 17명 **모두 매장 1개**, 승인+비승인 혼합 오너 0, 쿠폰 lifecycle active 54 / paused 10 / ended 3 / revoked 2, 오너 쿠폰 10초 내 동일 제목 중복 생성 쌍 0
  → 아래의 "다매장·미승인" 결함은 **현재 운영 영향 0 (잠재)** 이며, 신규 입점·다매장 오너가 생기는 순간 발현한다.

---

## 1. 범위 및 조사 대상 목록

### 1-1. 라우트 (총 **77개**: 페이지 74 + Route Handler 1 + 레이아웃 2)

| 구분 | 수 | 경로 |
|---|---|---|
| 캐노니컬 `/stores/owner/**` 페이지 | 45 | 아래 1-2 표 |
| `/stores/owner/order-chat/[orderId]` Route Handler | 1 | `route.ts` (307 → 메신저 방) |
| 레이아웃 | 2 | `app/(main)/stores/owner/layout.tsx`(+`StoresOwnerLayoutClient.tsx`), `app/(main)/my/business/layout.tsx`(passthrough) |
| 레거시 `/my/business/**` (리다이렉트 전용) | 20 | apply, banners, basic-info, edit, inquiries, menu, menu-categories, notices, ops-status, (hub), products, products/new, products/[productId]/edit, profile, reviews, settings, settlements, store-order-chat/[orderId], store-orders |
| 레거시 `/mypage/business/**` (리다이렉트 전용) | 4 | (hub), apply, orders, profile |
| 슬러그 `/stores/[slug]/owner/**` | 3 | notifications, notification-settings (렌더), orders (redirect) |
| next.config.js `redirects()` | 0 | 오너 경로 없음 (`next.config.js:114-172`) |
| proxy.ts | — | 오너 경로는 인증 게이트 + `x-sam-owner-path` 요청 헤더 주입만 (`proxy.ts:64-74`, `lib/auth/guest-browse-access-policy.ts:63,118-122`) |

### 1-2. 캐노니컬 라우트 인벤토리 (`app/(main)/stores/owner/`)

| URL | 페이지 컴포넌트 | 렌더 종류 | storeId 해석 | 셸 |
|---|---|---|---|---|
| `/stores/owner` | `MyBusinessPage` (`page.tsx:910`) | RSC+client, 서버 시드 | cookie→resolver | Guard `enforce=false` |
| `/apply` | page 자체(363줄) `BusinessApplyForm` | client | 없음 | `StoresOwnerApplyShell`(Guard 없음) |
| `/profile` | `OwnerStoreProfileForm` | client | **URL 필수** | Guard+Shell, 하단탭 숨김 |
| `/basic-info` | `OwnerStoreBasicInfoForm` | client | **URL 필수** | 동일 |
| `/ops-status` | `OwnerStoreOpsStatusBody` | client | **URL 필수** | 동일 |
| `/settings` | `OwnerStoreSettingsContent` | client | **URL 필수** | 동일 |
| `/edit` | redirect → `/stores/owner/profile` (**storeId 유실**) | RSC | — | — |
| `/orders` | `OwnerStoreOrdersView`(1094줄) | client | URL→resolver | Guard(정지 매장 허용) |
| `/order-chats` | `OwnerStoreOrderChatsView` | RSC wrapper | URL | Guard(정지 허용) |
| `/order-chat/[orderId]` | route.ts → `resolveOwnerOrderChatEnsureDocument` | Route Handler | 주문 기준 | 셸 미마운트 |
| `/products` | `OwnerProductsHubClient` | RSC 부트스트랩 | **URL 필수**(RSC) | Guard+Shell |
| `/products/new` | `OwnerProductForm` | RSC | **URL 필수** | 하단탭 숨김 |
| `/products/[productId]/edit` | `OwnerProductEditSupportShell` | RSC | **URL 필수** | 하단탭 숨김 |
| `/menu` | redirect → products (storeId 없으면 안내문) | RSC | URL 필수 | — |
| `/menu-categories` | `OwnerMenuCategoriesClient` | RSC | **URL 필수** | Guard+Shell |
| `/coupons` (+`?create=1`, `?campaign=`) | `OwnerStoreCouponsView` | client | URL→resolver | 동일 |
| `/gift-certificates` (+`?view=` 13종) | `OwnerGiftCertificatesView` | client | URL→resolver | 동일 |
| `/banners` | `OwnerStoreBannersView` | client | URL→resolver | 동일 |
| `/notices` | `OwnerStoreNoticesView` | client | URL→resolver | 동일 |
| `/reviews` | `OwnerStoreReviewsView` | client | URL→resolver | 동일 |
| `/inquiries` (매장 문의) | `OwnerStoreInquiriesView` | client | URL→resolver | 동일 |
| `/customer-care` | `OwnerCustomerCareHubView` | client | URL→resolver | 동일 |
| `/customer-care/customer-center` | `OwnerCustomerCenterView` | client | 사용자 단위(`/api/me/admin-notes`) | 동일 |
| `/customer-care/messages` · `/inquiries` | `OwnerCareListRedirect` (클라 replace) | client | URL | 동일 |
| `/customer-care/messages/[threadId]` · `/inquiries/[threadId]` | `OwnerCareAdminNotesThread` | client | 사용자 단위 | 동일 |
| `/finance` (+`?section=` 8종) | `OwnerStoreFinanceView` | client | **URL 필수** | 동일 |
| `/settlements` | `OwnerStoreSettlementsView` | client | **URL 필수** | 동일 |
| `/business-cash`, `/points` | redirect → `/finance` | RSC | 보존 | — |
| `/ads` | `OwnerDeliveryAdsHubView` | client | URL→resolver(다매장 목록) | 동일 |
| `/ads/new/store-sponsored` · `/banner` · `/platform-popup` | 각 CreateView | client | URL 또는 eligible 1개 자동 | 하단탭 숨김 |
| `/ads/[campaignId]` | `OwnerDeliveryAdDetailPageBody` | client | 캠페인 | 동일 |
| `/ads/partner` | `OwnerDeliveryAdPartnerView` | client | URL | 동일 |
| `/ads/popup/[requestId]` | `OwnerPlatformPopupRequestDetailView` | client | 요청 | 동일 |
| `/ads/event-promotions` | page 자체 + `OwnerEventPromotionListClient` | client | URL → **`stores[0]`** | 동일 |
| `/ads/event-promotions/[requestId]` | `OwnerEventPromotionDetailClient` | client | 요청 | 동일 |
| `/notifications` | `OwnerStoreNotificationsView` | client | URL → **`list[0]`** | 동일 |
| `/notification-settings` | `OwnerStoreNotificationSettingsView` | client | URL→resolver (실제 설정은 **사용자 단위**) | 동일 |

### 1-3. 내비게이션 정의 (조사 파일)

| 파일 | 역할 |
|---|---|
| `lib/business/owner-nav-registry.ts` (506줄) | **단일 권한** — 하단 5탭, 드로어 23항목, 고객 허브, 관리 허브 |
| `lib/business/business-admin-nav.ts`, `business-admin-nav-ids.ts` | 사이드바 파생·활성 판정 |
| `lib/business/my-business-nav-i18n.ts` | 레거시 허브 카드 그룹(레지스트리 파생) |
| `components/business/admin/BusinessAdminSidebar.tsx` | 드로어 본문 렌더 |
| `components/business/admin/BusinessAdminShell.tsx` (925줄) | 헤더·드로어·하단탭·뒤로가기·제목 |
| `components/business/owner/OwnerMobileOpsMenuDrawer.tsx` | 우측 드로어 포털 |
| `components/stores/owner/OwnerMobileBottomNav.tsx` (376줄) | 하단 5탭 |
| `components/finance/OwnerFinanceNav.tsx` | Finance 내부 8탭 |
| `lib/delivery/owner/owner-bottom-nav-active.ts`, `owner-home-hub-navigation.ts`, `owner-mobile-bottom-nav-layout.ts` | 하단탭 활성·홈 재탭 |
| `lib/business/owner-stack-back-href.ts`, `owner-bottom-nav-eligibility.ts`, `business-admin-page-title-i18n.ts`, `owner-routes.ts`, `redirect-legacy-owner-page.ts`, `lib/stores/store-business-hub-nav-intercept.ts` | 뒤로가기·하단탭 숨김·제목·URL 계약·레거시 매핑·모달 인터셉트 |
| `app/owner-compact-shell.css` | 드로어/데스크톱 브레이크포인트 (`:207-280`) |
| `components/business/StoreBusinessGuard.tsx`, `StoreBusinessBlockedModal.tsx`, `store-business-blocked-copy.ts`, `lib/stores/store-admin-access.ts` | 접근 가드 |

### 1-4. API (오너 화면이 호출, 총 **61개 핸들러 파일**)

- `app/api/me/stores/[storeId]/**` 48개 + `app/api/me/stores/route.ts` (권한: `getStoreIfOwner`/`getCachedStoreIfOwner` = `stores.owner_user_id === userId`, `lib/stores/owner-product-gate.ts:12-38`)
- `/api/me/store-coupons/campaigns` (`assertOwnedStore`, `route.ts:15-26`)
- `/api/me/delivery-ads/**`, `/api/me/platform-popup-requests/**`, `/api/me/event-promotion-requests/**`, `/api/me/notifications`, `/api/me/owner-notification-settings`, `/api/me/admin-notes`, `/api/owner/ads/statements`
- 410 제거된 엔드포인트 3개: `gift-certificates/cash-outs`, `point-charges`, `points`

### 1-5. DB 확인 (SQL)
`stores`(approval_status 분포·오너당 매장 수), `store_coupon_campaigns`(lifecycle 분포·중복 재발행 쌍), 개인정보 컬럼 미조회.

### 1-6. UI 컴포넌트
`components/business/**`, `components/stores/owner/**`, `components/finance/**` 전수 grep(색·반경·확인창·토스트·고아). 고아 컴포넌트 18개 식별(§3 IA-18).

---

## 2. 기능별 현황표

| 기능 | UI | API | DB | 업무 | 운영 | 판정 | 근거 |
|---|---|---|---|---|---|---|---|
| 레거시 URL → 캐노니컬 리다이렉트 | 서버 redirect | — | — | storeId 외 쿼리 유실, `/edit` 은 storeId 유실 | NOT_PROVEN | **FAIL** | `owner-routes.ts:148-157`, `stores/owner/edit/page.tsx:4-6`, `my/business/store-order-chat` → `/stores/owner/order-chat`(페이지 없음) `owner-routes.ts:131` |
| 오너 접근 가드 (승인 상태) | 클라이언트 Guard | API는 소유만 검사 | approval_status | 계정 단위 판정, 선택 매장 무관 | 운영 매장 전부 approved | **FAIL**(잠재) | `StoreBusinessGuard.tsx:58-65,191-227`, `store-admin-access.ts:17-31` |
| 심사중/보완요청 → 프로필 수정 | 허브 CTA·모달 링크 | — | — | Guard 가 profile 차단 → 진입 불가 | 현재 0건 | **FAIL**(잠재) | `StoresOwnerLayoutClient.tsx:58-62`, `MyBusinessPage.tsx:316-358`, `StoreBusinessBlockedModal.tsx:52-59` |
| 드로어(사이드 메뉴) | 우측 드로어 ≤∞ px (PC 고정 사이드바 없음) | — | — | 레지스트리 단일화 OK | NOT_PROVEN | PASS(구조)/FAIL(활성·라벨) | `owner-nav-registry.ts:122-351`, `owner-compact-shell.css:239-280` |
| 하단 5탭 | 홈·주문·상품·고객·관리 | — | — | 알림 계열 탭 미귀속 | NOT_PROVEN | 부분 FAIL | `owner-bottom-nav-active.ts:52-89` |
| 페이지 제목 | 헤더 pageTitle | — | — | 쿠폰·광고·알림은 "매장 어드민" | NOT_PROVEN | **FAIL** | `business-admin-page-title-i18n.ts:35-111` |
| 뒤로가기 | resolveOwnerStackBackHref | — | — | 일부 부모 오류 | NOT_PROVEN | 부분 FAIL | `owner-stack-back-href.ts:14-66` |
| 주문 상태 변경 CTA | 확인/접수 시트, busy | PATCH 전이 검증·admin_locked | `applyStoreOrderStatusTransition` | 정지 매장 진행 주문 허용(의도) | NOT_PROVEN | PASS | `OwnerStoreOrderCardStepperWithActions.tsx:51-131`, `orders/[orderId]/route.ts:335-420` |
| 취소·환불 결정 CTA | 사유·expected_status | `/decide` | — | — | NOT_PROVEN | PASS(코드) | `patch-owner-store-order-status.ts:66-80` |
| 쿠폰 운영 CTA | 목록 즉시실행/상세 확인 | PATCH 상태검사 미흡 | 무결성 체크 없음 | 종료 쿠폰 부활 가능 | 중복 0쌍 | **FAIL** | `OwnerStoreCouponsView.tsx:116-230`, `store-coupons/campaigns/route.ts:149-245` |
| 배너·공지 CRUD | 확인 모달·busy | 소유 검사, 승인 검사 없음 | — | 정지 매장 직접 API 가능 | NOT_PROVEN | 부분 FAIL | `OwnerStoreBannersView.tsx:256-322,676-690`, `OwnerStoreNoticesView.tsx:148-210` |
| 리뷰 답글 | busy, 삭제 확인 없음 | PATCH reply | — | 오류 시 목록 소실 | NOT_PROVEN | 부분 FAIL | `OwnerStoreReviewsView.tsx:101-217` |
| 매장 문의 답변/종료 | busy, 종료 확인 | PATCH | 캐시 무효화 | 실패 무음 | NOT_PROVEN | 부분 FAIL | `OwnerStoreInquiriesView.tsx:121-177` |
| 노출/영업 토글 | busy·낙관 UI | PATCH stores | — | 실패 무음 | NOT_PROVEN | 부분 FAIL | `BusinessAdminOpenToggle.tsx` |
| 메신저 기능 토글 | busy 없음 | PATCH stores | — | 실패 무음 | NOT_PROVEN | FAIL(P3) | `settings/page.tsx:88-120`, `OwnerStoreSettingsContent.tsx:145-162` |
| Coin 환전 신청 | busy, **확인창 없음** | 멱등키 필수 | — | 멱등키가 클릭마다 새로 생성 | NOT_PROVEN | **FAIL** | `OwnerCoinWithdrawalPanel.tsx:90-129`, `finance/withdrawals/route.ts:44-48` |
| Coin→Cash 전환 / Cash 충전 | 확인창 有, busy | 멱등키 | — | 멱등키 `Date.now()` | NOT_PROVEN | 부분 FAIL | `OwnerBusinessCashView.tsx:164-265,438` |
| 광고 신청 | clientRequestId 상태 고정 | storeId 소유 검사 | — | 진입 링크 storeId 누락 | NOT_PROVEN | 부분 FAIL | `OwnerStoreSponsoredCreateView.tsx:157,417-444`, `OwnerDeliveryAdsHubView.tsx:561-578` |
| 상품권 판매 신청 | busy | 소유 검사 | — | 멱등키 없음 | NOT_PROVEN | 부분 FAIL | `OwnerGiftCertificatesView.tsx:258-290` |
| 알림함/알림 설정 | 매장 페이지처럼 보임 | 사용자 단위 | `owner_notification_settings(user_id)` | 페이지 정체성 불일치 | NOT_PROVEN | FAIL(P3) | `OwnerNotificationSettings.tsx:47-160`, `app/api/me/owner-notification-settings/route.ts:65,158` |
| 정산/재무 IA | Finance 8탭 + 별도 정산 | commission-ledger | 원장 | "주문별 정산" 용어가 SSOT와 충돌 | NOT_PROVEN | FAIL(P3) | `OwnerFinanceNav.tsx:7-16`, `OwnerStoreFinanceView.tsx:266-311` |
| 디자인 토큰·반경 | 혼재 | — | — | — | — | FAIL(P3) | §3 IA-19 |

---

## 3. 결함 목록

> 공통: 증명 상태 = 코드 근거 PROVEN(정적) / 런타임 NOT_PROVEN, 운영 영향 = SQL 근거.

### IA-01 · 보완요청·심사중 매장의 "수정하기/프로필 보기" CTA가 가드 모달로 막힘 (온보딩 경로 단절)
- 영역: 접근 가드 / 업무
- 증상: 허브(`/stores/owner`)에서 `revision_requested` 매장의 **[수정하기]**·`pending` 매장의 **[매장 정보 보기]** → `/stores/owner/profile?storeId=` 로 이동 → `StoreBusinessGuard(enforce=true)` 가 `blocked` 판정 → 차단 모달 재표시. 모달의 **[프로필 보기]** 링크는 `onClick={onClose}` 이고 `onClose = router.push("/mypage")` 라 링크 이동과 `/mypage` 이동이 경합.
- 원인: `app/(main)/stores/owner/StoresOwnerLayoutClient.tsx:58-62` (허브만 `enforce=false`), `components/business/StoreBusinessGuard.tsx:214-227`, `lib/stores/store-admin-access.ts:22-30`(승인 매장 없으면 pending), `components/business/MyBusinessPage.tsx:316-331,344-358`, `components/business/StoreBusinessBlockedModal.tsx:52-59`. 정책 문서 `lib/stores/store-business-hub-nav-intercept.ts:14-16` 은 apply/profile/basic-info 를 예외로 명시 → **가드와 정책 불일치**.
- 영향: 보완요청을 받은 신규 매장이 정보 수정 불가 → 재심사 진행 불가(매장·관리자). 금전 무관.
- 심각도: **P1** (핵심 온보딩 흐름 차단) · 운영: 현재 비승인 매장 0건(SQL) → 잠재
- 현행: 허브 CTA → 차단 모달 → /mypage.
- 기대: profile·basic-info·ops-status 는 비승인 상태에서도 열림(정책 문서와 동일), 정지(suspended)만 orders/order-chat 허용 유지.
- 수정 설계: `StoreBusinessGuard` 에 `isPreApprovalAllowedOwnerPath(pathname)` (= `shouldInterceptBusinessHubHref(pathname) === false` 재사용) 추가, `pending/revision_requested` 일 때 해당 경로 children 렌더 + 상단 상태 배너. 모달 Link 는 `onClick` 에서 `router.push('/mypage')` 를 호출하지 않도록 `onDismiss`/`onNavigate` 분리.
- 연동 영향: 가드 단위 테스트(`lib/business/__tests__/owner-admin-scroll-shell-contract.test.ts`) 갱신, 서버 PATCH `/api/me/stores/[storeId]` 의 승인 전 수정 가능 필드 정책(`route.ts` 10개 approval 분기)과 일치 확인.
- 검증: 비승인 매장 fixture로 허브 → 수정하기 → 폼 렌더 vitest/RTL.
- Owner 승인: 보완요청 매장이 편집 가능한 필드 범위 확정.
- 증명: 코드 PROVEN / 런타임 NOT_PROVEN

### IA-02 · 가드가 "계정에 승인 매장 1개라도 있으면 통과" — 선택 매장(`?storeId`)의 상태 무시
- 원인: `StoreBusinessGuard.tsx:58-65`(`getOwnerStoreGateState(stores)`), 정지 판정이 `stores[0]` 기준(`store-admin-access.ts:24`). 선택 매장은 `BusinessAdminShell.tsx:314-320` 이 별도 해석.
- 증상: 다매장 오너가 A(승인)+B(정지/심사중)일 때 `?storeId=B` 로 전체 메뉴(쿠폰·배너·광고·상품) 접근. 반대로 stores[0]이 정지이고 다른 매장 승인 시 정지 배너 미노출.
- 영향: 정지 매장 상품·배너·광고 편집(매장/관리자). P2 · 운영: 다매장 오너 0명(SQL) → 잠재
- 기대/설계: Guard 를 `resolveOwnerActiveStoreRow(stores,{routeStoreId})` 결과 1건 기준으로 판정. 서버 측은 IA-03.
- 검증: 2매장 fixture 단위 테스트. 증명: 코드 PROVEN

### IA-03 · 오너 변경 API 대부분이 매장 승인/정지 상태를 검사하지 않음 (UI 가드 의존)
- 원인: 변경 메서드 보유 32개 라우트 중 approval/suspended 참조 0회: banners, notices, delivery-ads(5), delivery-service-areas, business-cash, finance/withdrawals, gift-certificates/applications·conversions, inquiries, reviews reply, platform-inquiries, orders(의도적 허용) 등 (grep 결과, `lib/stores/owner-product-gate.ts:12-38` 은 소유만 검사). 쿠폰 `store-coupons/campaigns/route.ts:15-26` 도 소유만.
- 영향: 정지 매장이 직접 API 호출로 배너·공지·쿠폰·광고 초안 생성 가능. 고객 노출은 매장 비노출로 차단될 가능성 높음 → P2. 광고 RPC 내부 상태 검사 여부 NOT_PROVEN(`createOwnerSponsoredDraft` 내부 미확인).
- 설계: `getStoreIfOwner` 옆에 `assertOwnerStoreWritable(store, {allowSuspended:['orders','order-chat','finance-read']})` 공통 게이트 추가, 라우트별 정책 표(SSOT) 작성.
- Owner 승인: 정지 매장에 허용할 쓰기 목록(정산 조회·Coin 환전 허용 여부 등).
- 증명: 코드 PROVEN / DB 함수 내부 NOT_PROVEN

### IA-04 · 쿠폰 PATCH 상태 전이 검사 누락 — 종료 쿠폰 부활 가능, 오류 무시
- 원인: `app/api/me/store-coupons/campaigns/route.ts:168-180` `pause`·`end` 는 현재 상태 검사 없이 update, 결과 error 미확인 후 항상 `ok:true`. `resume` 은 `paused` 만 검사(`:181-190`) → **ended → pause → resume → active** 경로 성립.
- 영향: 종료(ended)·revoked 쿠폰을 오너가 다시 활성화 → 매장 부담 할인 재발생(매장 금전) / 관리자 revoke 무력화 가능(revoked도 pause 허용). P2
- 기대: pause 는 active 만, end 는 active/paused 만, revoked/ended 는 불변. DB 오류 시 500.
- 설계: `.update(...).eq('id',id).in('lifecycle_state',[허용상태]).select('id')` 로 조건부 갱신, 0행이면 409 `invalid_transition`.
- 검증: 라우트 vitest(ended/revoked 에 pause → 409). 운영: revoked 2·ended 3 존재(SQL) → 부활 대상 존재.
- 증명: 코드 PROVEN

### IA-05 · 쿠폰 재발행(reissue) 중복 생성 위험 — 멱등성·확인창·busy 부재
- 원인: 목록에서 `onReissue={(id)=>void act(id,"reissue")}` 확인 없이 즉시(`OwnerStoreCouponsView.tsx:206-212`); 상세 확인 모달에 `busy` 미전달(`:179-196`) → `OwnerStoreAdminConfirmModal` 버튼이 비활성화되지 않음(`OwnerStoreAdminConfirmModal.tsx:45-61`); 서버 reissue 는 매 호출 INSERT(`route.ts:197-243`, 멱등키 없음).
- 영향: 더블클릭·재시도 시 동일 매장부담 쿠폰 캠페인 중복 → 예산 2배 노출(매장 금전). P2 · 운영 중복 0쌍(SQL)
- 설계: 클라 `actBusy` 상태 + 모달 `busy`; 목록 pause/reissue 도 확인 모달 경유(상세와 동일); 서버 `clientRequestId` 필수 + `(store_id, source_campaign_id, client_request_id)` 유니크.
- 증명: 코드 PROVEN

### IA-06 · 쿠폰 화면 오류·성공 피드백 없음
- 원인: `act()` 실패 시 메시지 없음(`:116-128`), 목록 로드 실패 시 빈 목록으로 표시(`:83-84`, `res.json()` 예외 미처리).
- 영향: 오너가 실패를 성공으로 오인. P3 · 설계: 공통 Owner 토스트(IA-19) + 오류 띠.

### IA-07 · 레거시 리다이렉트가 쿼리·storeId 유실, 존재하지 않는 경로로 매핑
- 원인: `buildLegacyOwnerRedirectHref` 는 `storeId` 만 보존(`owner-routes.ts:148-157`) → `?tab=`, `?view=`, `?create=`, `?order_id=` 유실. `/my/business/edit?storeId=X` → `/stores/owner/edit?storeId=X` → `redirect("/stores/owner/profile")` **storeId 유실**(`stores/owner/edit/page.tsx:4-6`) → profile 은 `need_store_id` 막다른 안내(`profile/page.tsx` + `OwnerStorePagePhaseGate.tsx:28-36`). `/my/business/menu` 는 2홉. `mapLegacyOwnerPath('/my/business/store-order-chat')` → `/stores/owner/order-chat`(페이지 없음, `owner-routes.ts:131`).
- 반면 `/mypage/business/orders` 는 전체 쿼리 보존(`mypage/business/orders/page.tsx`) → 레거시 2계열 간 동작 불일치.
- 영향: 북마크·알림 딥링크가 목적 화면이 아닌 곳으로. P3
- 설계: `buildLegacyOwnerRedirectHref` 가 전체 searchParams 보존, `/stores/owner/edit` 는 `OwnerRoutes.profile(storeId)`, `/menu` 레거시는 1홉 매핑 표로.
- 검증: `owner-routes` 단위 테스트에 쿼리 보존 케이스. 증명: 코드 PROVEN

### IA-08 · 매장 컨텍스트(storeId) 해석 규칙이 페이지마다 다름
- 3가지 방식 혼재:
  1. **URL 필수(없으면 막다른 안내)**: profile, basic-info, ops-status, settings, products, products/new, products/[id]/edit, menu, menu-categories, finance, settlements (`finance/page.tsx:12-16`, `settlements View :118`, `menu-categories/page.tsx:22-27` 등)
  2. **URL → 활성매장 resolver**: coupons, banners, notices, reviews, inquiries, gift-certificates, ads, customer-care, notification-settings (`resolveOwnerActiveStoreIdFromOwnedList`)
  3. **URL → 목록 첫 매장(`stores[0]`)**: `/ads/event-promotions` (`page.tsx`: `json.stores?.[0]?.id`), `/notifications` (`OwnerStoreNotificationsView.tsx:37` `list[0]`) — 레이아웃 계약 "never invent stores[0]"(`layout.tsx:12`)과 충돌
- 추가: 광고 신청 진입 링크가 storeId 없이 이동(`OwnerDeliveryAdsHubView.tsx:561,569,578`) → 다매장 시 신청 화면에서 매장 재선택 필요(`OwnerStoreSponsoredCreateView.tsx:180-184`).
- 영향: 다매장 오너가 다른 매장 데이터를 보거나 막다른 화면. P3(잠재)
- 설계: Shell 이 이미 계산한 `selectedRow`(`BusinessAdminShell.tsx:314-320`) 를 `useBusinessAdminStore()` 로 모든 페이지가 사용, URL 없으면 `router.replace(withStoreId)` 로 정규화(한 곳). 광고 링크는 `withStoreId`.
- 증명: 코드 PROVEN

### IA-09 · 페이지 제목·메뉴 라벨 불일치 / 제목 누락 / 오타
- 제목 누락(기본값 "매장 어드민"): `/coupons`, `/ads`(+new/*, [campaignId], partner, popup, event-promotions), `/notifications`, `/notification-settings` (`business-admin-page-title-i18n.ts:35-111` 에 분기 없음)
- 라벨 불일치 표:

| URL | 드로어 라벨 | 헤더 제목 | 기타 표기 |
|---|---|---|---|
| /ops-status | 영업·운영 상태 | 운영 · 심사 | 운영·심사 상태(my_biz) / 운영·심사(설정 버튼) |
| /profile | 매장 설정 | 매장 설정 | /settings 제목 "설정", 하단탭 "관리" |
| /menu-categories | 카테고리 | 메뉴 카테고리 | — |
| /products | 상품 관리 | **"상품 관리 , 등록"** (오타, `catalog/business-admin-nav.ts:174`) | 하단 "상품" |
| /gift-certificates | 상품권 | 상품권 사용 · 수익 | Finance "출금" vs 상품권 "환전" |
| /finance | Coin · 캐시 | Coin · 캐시 | 내부탭 "Cash"(영문) |
| /settlements | 정산 ("주문별 매출·수수료·**지급** 현황") | 정산 | Finance탭 "주문별 정산" |
| /inquiries | 매장 문의 | 매장 문의 | /customer-care/inquiries = "1:1 문의"(플랫폼 CS) — 같은 `inquiries` 세그먼트 |
| /notifications | 알림함 ("…· 알림음 설정") | 매장 어드민 | 별도 "알림음·진동 설정" 항목 존재 |
- 영향 P3. 설계: 레지스트리 항목에 `titleKey` 추가 → 제목 함수가 레지스트리에서 파생(라벨=제목 SSOT).

### IA-10 · 활성 상태(하이라이트) 누락
- 드로어: `isBusinessAdminNavHrefActive` 는 경로 **완전일치**만(`business-admin-nav.ts:59-82`) → `/products/[id]/edit`, `/ads/*` 하위, `/customer-care/*` 하위, `/gift-certificates?view=`, `/finance?section=` 에서 부모 메뉴 비활성.
- 하단탭: `/notifications`, `/notification-settings` 는 어떤 탭에도 귀속되지 않음(`owner-bottom-nav-active.ts:52-73`) → 활성 탭 null, 그러나 레지스트리는 `manage_hub` 노출(`owner-nav-registry.ts:337-349`).
- P3 · 설계: prefix 매칭 + 레지스트리 `activePrefixes` 필드.

### IA-11 · 뒤로가기 부모 오류
- `/ads/event-promotions/[id]` → 허브(기대: 이벤트 목록) — 정규식 `/ads/[^/]+$` 가 2세그먼트 미매칭(`owner-stack-back-href.ts:41`)
- `/inquiries`, `/reviews` → 허브(기대: `/customer-care`, 고객 탭 소속)
- `/order-chats` → `/orders`(`:56-58`) 이지만 드로어·하단탭은 "고객" 그룹(`owner-nav-registry.ts:192-201`, `owner-bottom-nav-active.ts:46`)
- `/notifications` → 허브, `/settings` 하위 화면(profile/basic-info/ops-status) → 허브(설정에서 진입했어도)
- P3 · 설계: 레지스트리에 `parentId` 도입, back resolver 를 레지스트리 파생.

### IA-12 · 중복·중첩 진입점
- 노출/영업 토글 3곳: 드로어 헤더(`BusinessAdminShell.tsx:716-722`), `/settings`(`OwnerStoreSettingsContent.tsx:48-58`), 허브/모바일 헤더 storeOps. `/settings` 에는 `sr-only` + `aria-hidden` 죽은 버튼 잔존(`:66-76`).
- `/finance?section=transactions` 와 `section=orders` 가 **동일 내용** 렌더(`OwnerStoreFinanceView.tsx:266`), `cash`·`ads` 도 공유 섹션(`:399`) → 탭 2개가 사실상 중복.
- `/finance`(Coin·캐시) vs `/settlements`(수수료·캐시 원장): Finance 내 "주문별 정산" 탭은 정산 원장 링크 버튼만 표시.
- `OwnerRoutes.customerCareInquiries` ≡ `customerCareCsInquiries` 동일 URL(`owner-routes.ts:50-54`); `/customer-care/messages`·`/inquiries` 는 클라이언트 replace 리다이렉트 페이지(2홉, `OwnerCareListRedirect.tsx`).
- `/stores/[slug]/owner/notifications`·`notification-settings` 가 캐노니컬 `/stores/owner/notifications` 와 **분기된 사본**(셸 밖, `OwnerSubpageDetailHeader`, 서버 slug 해석). 앱 내 진입 링크 0 — `buildOwnerStoreNotificationsHref` 호출처 0(grep).
- P3 · 통합안은 §IA 통합 계획.

### IA-13 · 정산 용어가 SSOT 와 충돌
- `docs/store-commission-cash-settlement-ssot.md:36` "주문별 정산 큐 폐지", AGENTS.md "주문별 지급(정산 버튼) 없음" ↔ 오너 Finance 탭 **"주문별 정산"**(`OwnerFinanceNav.tsx:9`), 드로어 설명 "주문별 매출·수수료·**지급** 현황"(`catalog/business-admin-nav.ts` `biz_nav_settlements_desc`), Finance 카드 "플랫폼 지급 의무"(`OwnerStoreFinanceView.tsx:291`).
- "출금"(Finance 탭) / "Coin 환전 신청"(패널 문구) / "수익금 환전 신청"(상품권 제목, 그러나 cash-outs API 410 제거) 혼재.
- P3 · Owner 결정: 오너용 정식 용어(정산 → "수수료·캐시 원장", 출금 → "Coin 환전").

### IA-14 · 알림 설정 페이지 정체성 불일치
- 설정은 **사용자 단위**(`owner_notification_settings` `onConflict:user_id`, `route.ts:158`)인데 화면은 매장별 URL·`?storeId` 로 진입, **storeId UUID 를 font-mono 로 노출**(`OwnerNotificationSettings.tsx:139-141`). 메뉴명 "알림음·**진동** 설정" 이나 토글은 푸시·소리 2개뿐(`:149-158`). 토글 busy 없음·실패 시 조용히 재로드(`:98-115`).
- P3 · 설계: 페이지 제목 "알림 설정(전체 매장 공통)", UUID 제거, 진동 문구 제거 또는 기능 추가 결정.

### IA-15 · 리뷰 답글 UX
- 답글 삭제 확인 없음(`OwnerStoreReviewsView.tsx:197-205`, 규칙 §6 위반); 저장 실패 시 `err` 로 **목록 전체가 오류문구로 대체**(`:164`) + 재시도 버튼 없음; 원시 `order_id`·`status` 노출(`:179-185`); 날짜 `toLocaleDateString("ko-KR")` 고정(`:175`); `bg-white`·`text-red-600`·`text-amber-700` 하드코딩. P3

### IA-16 · 매장 문의 답변 UX
- 답변 실패 무음(`OwnerStoreInquiriesView.tsx:136` `if (!json?.ok) return;`), `res.json()` 예외 미처리; 종료(close) 결과 미확인(`:157-166`); 매 처리 후 `load()` 가 `loading` 으로 리셋 → 목록 깜박임(`:65`). 서버 목록 캐시는 인스턴스 메모리(`owner-store-inquiries-list-cache.ts`) — 다른 인스턴스 TTL 동안 구 데이터 가능(NOT_PROVEN). P3

### IA-17 · 설정 화면 토글 피드백
- 메신저 기능 토글: busy 없음, 실패 시 재로드만(`settings/page.tsx:88-120`); 노출/영업 토글 실패 메시지 없음(`BusinessAdminOpenToggle.tsx` `if (!j?.ok) { setPendingUi(null); return false; }`). 노출 OFF 는 고객 노출 중단인데 확인창 없음. P3

### IA-18 · 고아 코드·고아 라우트
- 고아 컴포넌트 18개(import 0): `components/business/admin/dashboard/BusinessDashboard{OwnerCardMenu,QuickRow,Insights,PriorityCards,KpiStrip,MobileBar}.tsx`, `components/business/{BusinessProductList,MyStoreSettlementsPage,BusinessProfileEditForm,BusinessProfileView}.tsx`, `components/business/owner/{OwnerStoreOrderDetailPanel,OwnerStoreOrderCardFooterActions,OwnerOrderStatusTimeline,OwnerStoreOrderModalSellerToolbar,OwnerProductNewStoreIdRedirect,OwnerStoreOrdersPageFallback}.tsx`, `components/business/owner/ads/OwnerDeliveryAdApplicationWizardShell.tsx`, `components/stores/owner/dashboard/OwnerQuickActions.tsx` (하드코딩 색 상위 파일 `OwnerStoreOrderDetailPanel` 32건도 고아)
- 진입 링크 없는 라우트: `/stores/owner/ads/event-promotions`(자기 자신 상세만 링크, `OwnerEventPromotionListClient.tsx:62,104`), `/stores/[slug]/owner/notifications`·`notification-settings`.
- P3 · 설계: 제거 또는 레지스트리 등록(Owner 결정).

### IA-19 · 디자인 토큰·반경·피드백 일관성
- 오너 UI 내 arbitrary hex 186건, Tailwind 팔레트/`bg-white` 369건, 비표준 반경(`rounded-lg/xl/md`) 42건(grep). 상위: `OwnerStoreOrderDetailPanel`(고아) 32, `OwnerStoreOrderMockCard` 21, `OwnerDeliveryAdsHubView` 14(+`#0A823E`·`#BDBDBD`·`bg-white`, 브랜드 `--sam-primary #0B421A` 아님, `:530-538`), `OwnerStoreOrdersMobileBody` 13, `OwnerStoreOrderChatsView` 13.
- 사이드바·드로어는 `--biz-*` 토큰 계열(`BusinessAdminSidebar.tsx:76-103`) — `--sam-*` 와 별도 팔레트.
- 셸 적용 현황: `OwnerStoreAdminDashSection` 미사용 = reviews, inquiries, finance, settings, ops-status, notifications, ads hub, event-promotions, products hub(목록형). 하단 저장바 패턴은 profile/basic-info/product form/menu-categories/banner create 만.
- 토스트: 상품 허브만 자체 toast(`OwnerProductsHubClient.tsx:150-235`), 나머지는 인라인 문구 또는 무음 → 성공/실패 피드백 비일관.
- `/order-chat/[orderId]` 실패 시 스타일 없는 원시 HTML(`owner-order-chat-ensure-document.ts:86-93`).
- P3

### IA-20 · PC/태블릿 레이아웃 — 고정 사이드바 없음, 드로어 접근성
- `.owner-ops-desktop-sidebar { display:none !important }`(`owner-compact-shell.css:276-279`) — 1025px 이상도 우측 햄버거 드로어(280px) + 하단 5탭. 문서 규칙(`.cursor/rules/samarket-store-admin-ui-shell.mdc` "운영 사이드 메뉴")은 사이드바 언급.
- 드로어 ESC 는 scrim 포커스일 때만(`OwnerMobileOpsMenuDrawer.tsx:75-81`), 포커스 트랩 없음.
- P3(설계 제안 성격 포함)

### IA-21 · 드로어 항목의 승인 조건 비일관
- `ads` 만 `requireApproved` 없음(`owner-nav-registry.ts:322-330`), `basic_info`·`store_settings` 는 의도적으로 없음 → 비승인 매장에 노출되나 IA-01 가드로 진입 시 차단 → "보이는데 못 들어감". P3

### IA-22 · 금전 CTA 멱등키가 클릭마다 새로 생성 + Coin 환전 확인창 없음
- `OwnerCoinWithdrawalPanel.tsx:106` `idempotencyKey: coin_withdrawal:${storeId}:${amount}:${Date.now()}`, `OwnerBusinessCashView.tsx:185,231` 동일 패턴 → 네트워크 타임아웃 후 재클릭 시 서버 멱등이 작동하지 않음. Coin 환전 신청은 확인 모달 없음(파일 내 ConfirmModal 0건) — Coin→Cash 전환은 확인 있음(`:438`).
- 영향: 중복 환전 신청·중복 충전 요청 생성 가능(관리자 검토 단계 존재 여부·잔액 홀드 여부 NOT_PROVEN). **P2**
- 설계: 폼 마운트 시 `useState(()=>crypto.randomUUID())` 키 고정, 성공 시에만 재생성(광고 신청 `clientRequestId` 패턴과 동일). Coin 환전에 `OwnerStoreAdminConfirmModal`(금액·계좌 요약).
- 검증: 동일 키 재전송 → 서버 1행. 증명: 코드 PROVEN / 서버 홀드 NOT_PROVEN

### IA-23 · 주문 단계 변경 실패 시 메시지 없음(일부 경로)
- `OwnerStoreOrderCardStepperWithActions.tsx:68-69` `onPatchOrderRow` 미주입 경로에서 실패 시 `return false` 만 → 확인 다이얼로그 유지·사유 미표시. P3

**심각도 합계 (23건): P0 0 · P1 1 (IA-01) · P2 5 (IA-02, IA-03, IA-04, IA-05, IA-22) · P3 17 (IA-06~21, IA-23)**

---

## 3-A. CTA 매트릭스

| 화면 | 버튼 | 핸들러 | API | 서버 권한/검증 | 비활성 조건 | 확인창 | 성공/실패 메시지 | 이중클릭 방지 | 저장 후 갱신 | 사유 필수 | 판정 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 주문 | 접수(조리시간) | `onConfirmAccept`→`runPatch('accepted')` | PATCH `/orders/[id]` | 소유+전이+admin_locked+409 | busy | 접수 시트 | 경로별(runOwnerStoreOrderPatch) / 일부 무음(IA-23) | busy | onUpdated+reconcile | — | PASS |
| 주문 | 단계 진행(조리·배달·완료) | `onStepClick`→`runPatch` | 동일 | 동일 | busy | 확인 다이얼로그 | 동일 | busy | 동일 | — | PASS |
| 주문 | 취소 요청(조리 후) | `postOwnerStoreOrderCancelRequest` | POST `/cancel-request` | 소유+정책 | — | 시트 | 오류코드 | 컴포넌트별 | — | reason | PASS(코드) |
| 주문 | 취소·환불 승인/반려 | `postOwnerStoreOrderDecision` | POST `/decide` | 소유+expected_status | — | 결정 UI | 오류코드 | — | — | 반려 사유 | PASS(코드) |
| 주문채팅 | 채팅 열기 | 링크 | GET `/stores/owner/order-chat/[id]` | ensure(소유 검증) | — | — | 실패 시 원시 HTML(IA-19) | — | — | — | 부분 |
| 상품 | 저장/등록 | `OwnerProductForm` submit | POST/PATCH products | 소유+판매권한(approval 3분기) | !dirty·saving | 이탈 확인 | 인라인 | saving | router.push 목록 | — | PASS |
| 상품 | 삭제 | 확인 모달 | PATCH/DELETE product | 소유 | deleting | 有(busy) | 인라인 | 有 | push 목록 | — | PASS |
| 상품허브 | 품절/노출 | `busyId` 토글 | PATCH product | 소유 | busy | 없음 | **toast** | 有 | 로컬 갱신 | — | PASS |
| 카테고리 | 추가/수정/삭제/정렬 | `OwnerMenuCategoriesClient` | menu-sections POST/PATCH/DELETE | 소유(+approval 1~2) | saving·reorderBusy | 삭제 有 | 인라인 | 有 | reload | — | PASS |
| 쿠폰 | 생성 | CreatePanel | POST `/api/me/store-coupons/campaigns` | assertOwnedStore | 폼 | — | 패널 | 패널 내부 | load+목록 | — | NOT_PROVEN |
| 쿠폰 | 일시정지/재개 (목록) | `act` 즉시 | PATCH | 소유, **상태검사 미흡(IA-04)** | 없음 | **없음** | **없음** | **없음** | load | — | FAIL |
| 쿠폰 | 종료 | 확인 모달 | PATCH end | 동일 | — | 有(busy 없음) | 없음 | **없음** | load | — | FAIL |
| 쿠폰 | 재발행 | 목록 즉시 / 상세 확인 | PATCH reissue(INSERT) | 소유, **멱등 없음** | 없음 | 목록 없음 | 없음 | **없음** | push 상세 | — | FAIL(IA-05) |
| 배너 | 등록/수정 | `saveEditor` | POST/PATCH banners | 소유만 | busy | — | 인라인 오류 | busy | load | — | PASS(P3: 승인검사 없음) |
| 배너 | 삭제 | 확인 모달 | DELETE | 소유 | busy | 有 | 실패 무음 | 有 | load | — | 부분 |
| 공지 | 등록/수정/삭제 | 동일 | notices | 소유 | busy | 삭제 有 | 저장 인라인/삭제 무음 | 有 | load+public 캐시 무효화 | 제목 | 부분 |
| 리뷰 | 답글 저장 | `saveReply` | PATCH reply | 소유 | busy·빈값 | — | 실패 시 목록 대체(IA-15) | 有 | load | 내용 | 부분 |
| 리뷰 | 답글 삭제 | `deleteReply` | PATCH reply="" | 소유 | busy | **없음** | 동일 | 有 | load | — | FAIL(P3) |
| 매장 문의 | 답변 등록 | `sendAnswer` | PATCH inquiry | 소유 | busy·빈값 | — | **실패 무음** | 有 | load+배지 | 내용 | FAIL(P3) |
| 매장 문의 | 종료 | 확인 모달 | PATCH close_only | 소유 | busy | 有 | 결과 미확인 | 有 | load+배지 | — | 부분 |
| 설정/헤더 | 노출 ON/OFF·영업 ON/OFF | `applyOpen`/Visible | PATCH stores | 소유+approval | busy·미승인 | **없음** | 실패 무음 | 有 | onUpdated | — | 부분 |
| 설정 | 음성메시지/음성·영상통화 | `toggleMessengerFeature` | PATCH stores | 소유 | 미승인 | 없음 | 무음 | **없음** | setPhase/load | — | FAIL(P3) |
| 기본정보/매장설정 | 저장·취소 | 폼 submit / 하단바 | PATCH `/api/me/stores/[id]` | 소유+필드별 approval | !dirty | 이탈 확인 | 상단 오류 띠 | saving | invalidate+load | — | PASS(셸 기준 화면) |
| 상품권 | 판매 신청 | submit | POST gift-certificates/applications | 소유(캐시) | busy·!formValid | 확인 단계(view=confirm) | 인라인 | busy | 재로드 | — | 부분(멱등 없음) |
| Finance | Cash 충전 신청 | `OwnerBusinessCashView` | POST business-cash | 소유 | busy | — | 인라인 | busy | load | — | 부분(IA-22) |
| Finance | Coin→Cash 전환 | 확인 모달 | POST business-cash | 소유+quote version | busy | 有 | 인라인 | busy | load | — | 부분(IA-22) |
| Finance | Coin 환전 신청 | submit | POST finance/withdrawals | 소유+멱등키 필수 | busy | **없음** | notice/오류 | busy | history 재로드 | 계좌 | FAIL(P2, IA-22) |
| 정산 | 새로고침·필터 | load | GET commission-ledger(+cash-ledger, payable) | 소유 | loading | — | 401/403/오류 문구 | — | — | — | PASS |
| 광고 | 매장홍보/배너 신청 | create→actions | POST delivery-ads + actions | 소유, clientRequestId | !canSubmit·busy | — | 인라인 | 有+키 고정 | push | — | PASS(진입 storeId 누락 P3) |
| 광고 | 초안 삭제 | 확인 모달 | DELETE delivery-ads/[id] | 소유 | draftDeleteBusy | 有 | — | 有 | 재로드 | — | PASS |
| 광고 | 파트너 신청 | submit | POST `/api/me/delivery-ads/partner` | NOT_PROVEN | busy | — | — | busy | — | — | NOT_PROVEN |
| 광고 | 글로벌 팝업 신청 | submit | POST platform-popup-requests | idempotencyKey 고정 | busy | — | — | 有 | — | — | PASS(코드) |
| 광고 | 이벤트 프로모션 신청 | `OwnerEventPromotionListClient` | POST event-promotion-requests | NOT_PROVEN | busy | — | — | busy | `window.location.href`(풀 리로드) | — | 부분 |
| 알림함 | 읽음/모두 읽음 | `markOneRead`/`markAllForStoreRead` | PATCH `/api/me/notifications` | 사용자 단위 | markBusy | — | — | single-flight | 로컬+broadcast | — | PASS |
| 알림설정 | 푸시/소리 토글 | `patch` | PATCH owner-notification-settings | 사용자 단위 | — | — | 실패 시 재로드 | **없음** | 로컬 | — | 부분 |
| 고객센터 | 문의 작성/쪽지 | Support Modal | admin-notes / platform-inquiries | 사용자/소유 | — | — | — | — | — | — | NOT_PROVEN |

---

## 3-B. 현재 메뉴 트리 (as-is)

**하단 5탭** (`owner-nav-registry.ts:73-99`): 주문(/orders) · 상품(/products) · **홈**(/stores/owner, 중앙) · 고객(/customer-care) · 관리(/settings)

**드로어(전 해상도 공통, 우측)** — 섹션 순서 `owner-nav-registry.ts:357-365`
```
운영      대시보드(/stores/owner) · 주문 관리(/orders, 배지) · 영업·운영 상태(/ops-status)
상품      상품 관리(/products) · 상품 등록(/products/new) · 카테고리(/menu-categories)
고객      고객 응대(/customer-care) · 주문 채팅(/order-chats) · 매장 문의(/inquiries) · 리뷰 관리(/reviews)
매장      기본 정보(/basic-info) · 매장 설정(/profile) · 공개 매장 페이지(미리보기 모달)
정산      Coin · 캐시(/finance) · 정산(/settlements)
프로모션  쿠폰(/coupons) · 상품권(/gift-certificates) · 배너 관리(/banners) · 공지 관리(/notices)
성장      광고(/ads)
시스템    고객센터(/customer-care/customer-center?from=owner-care) · 알림함(/notifications) · 알림음·진동 설정(/notification-settings)
하단      내 정보로(/my)
```
**드로어에 없는 화면**: /settings(하단 "관리"만), /order-chat/[id], /products/[id]/edit, /ads/new/*, /ads/[id], /ads/partner, /ads/popup/[id], /ads/event-promotions(진입점 없음), /customer-care/messages|inquiries(+[threadId]), /gift-certificates?view=*, /finance?section=*, /apply, 슬러그 알림 2종.

**관리 허브(/settings 내부 `OwnerManageHubLinks`)**: 레지스트리 `manage_hub` 표면 = 영업·운영 상태, 쿠폰, 상품권, 배너, 공지, 기본 정보, 매장 설정, Coin·캐시, 정산, 광고, 알림함, 알림음 설정.

**Finance 내부 탭**(`OwnerFinanceNav.tsx:7-16`): 거래내역 · 주문별 정산 · 수수료/미납 · Coin · Cash · 광고 지출 · 전환 · 출금

---

## 3-C. 제안: 통합 12그룹 IA (URL 보존)

| # | 그룹 | 포함 URL (기존 그대로) | 하단탭 | 비고 |
|---|---|---|---|---|
| 1 | 홈 | `/stores/owner` | 홈 | 대시보드 |
| 2 | 주문 | `/orders`, `/order-chats`, `/order-chat/[orderId]` | 주문 | 주문 채팅함은 주문 하위(뒤로가기 현행과 일치) — 고객 그룹에서 제거 |
| 3 | 상품 | `/products`, `/products/new`, `/products/[id]/edit`, `/menu-categories`, (`/menu` 레거시) | 상품 | |
| 4 | 매장운영 | `/ops-status`, `/basic-info`, `/profile`, `/settings`(노출·영업·메신저 기능), 공개 매장 미리보기 | 관리 | 노출/영업 토글 SSOT = `/settings` + 드로어 헤더 표시만 |
| 5 | 배달관리 | `/profile` 의 배달 섹션 앵커(`#delivery`), `delivery-service-areas` 편집 화면(현재 profile 내부) | 관리 | 신규 URL 없이 앵커로 진입 — 독립 페이지는 설계 제안 |
| 6 | 매출·정산 | `/settlements`(수수료·캐시 원장), `/finance?section=outstanding`, `/finance?section=transactions` | 관리 | "주문별 정산" 탭 폐지(SSOT) |
| 7 | 코인·캐시 | `/finance?section=coin|cash|convert|withdraw|ads`, (`/business-cash`,`/points` 레거시) | 관리 | |
| 8 | 광고·홍보 | `/ads`, `/ads/new/*`, `/ads/[campaignId]`, `/ads/partner`, `/ads/popup/[id]`, `/ads/event-promotions(/[id])`, `/coupons`, `/banners`, `/notices` | 관리 | 쿠폰·배너·공지를 "프로모션"에서 이동, 이벤트 프로모션 진입점 신설 |
| 9 | 상품권 | `/gift-certificates`(+`?view=`) | 관리 | 수익 정산은 7번 링크 |
| 10 | 고객관리 | `/customer-care`, `/inquiries`, `/reviews` | 고객 | |
| 11 | 알림 | `/notifications`, `/notification-settings`, (`/stores/[slug]/owner/*` 레거시) | 관리 | 사용자 단위 명시 |
| 12 | 설정 | `/customer-care/customer-center`(+messages/inquiries/[threadId]), `/apply`, 내 정보로 | 관리 | 플랫폼 고객센터는 "고객관리"(매장↔고객)와 분리 |

구현 방식: `OWNER_NAV_REGISTRY` 의 `drawerSection` 값을 12개로 교체하고 `parentId`·`titleKey`·`activePrefixes` 를 추가 → 드로어·제목(IA-09)·활성(IA-10)·뒤로가기(IA-11)를 모두 레지스트리에서 파생. URL 변경 0.

## 3-D. 중복 통합 계획

| 중복 | 현재 형태 | 캐노니컬 | 근거(진입점·데이터 소스) | 조치 |
|---|---|---|---|---|
| `/my/business/*` vs `/stores/owner/*` | 리다이렉트 전용(20 페이지) | `/stores/owner/*` | `owner-routes.ts:1-13` 계약, 셸·가드 전부 캐노니컬 | 유지하되 쿼리 전체 보존(IA-07) |
| `/mypage/business/*` | 리다이렉트 4 | `/stores/owner/*` | 동일 | 공통 `redirectLegacyOwnerPage` 로 통일 |
| `/stores/[slug]/owner/notifications`·`notification-settings` | **분기 사본**(셸 밖 렌더) | `/stores/owner/notifications`, `/notification-settings` | 인바운드 링크 0, 데이터는 사용자 단위 API 동일 | 서버 redirect(slug→storeId 쿼리)로 교체, 빌더 함수 삭제 |
| `/stores/[slug]/owner/orders` | redirect(storeId 유실) | `/stores/owner/orders?storeId=` | — | slug→storeId 보존 |
| `/stores/owner/edit` | redirect(storeId 유실) | `/profile` | — | storeId 보존 |
| `/menu` | redirect | `/products` | `OwnerRoutes.menu` 이미 products | 유지 |
| `/business-cash`, `/points` | redirect | `/finance` | — | `section` 지정(cash/coin) |
| `/customer-care/messages`·`/inquiries` | 클라 replace | `/customer-care/customer-center?tab=` | — | 서버 redirect 로 변경, OwnerRoutes 중복 헬퍼 1개 제거 |
| `/finance?section=transactions` ≡ `orders` | 같은 렌더 | `transactions` | 동일 컴포넌트 분기 | `orders` 탭 제거(또는 settlements 로 이동) |
| 노출/영업 토글 3곳 | 동일 컴포넌트 | `/settings` | 동일 PATCH | 드로어 헤더는 상태 표시+설정 링크 |
| `/profile`(매장 설정) vs `/settings`(설정) | 다른 화면, 유사 이름 | 둘 다 유지 | profile=영업시간·배달 폼, settings=운영 스위치 허브 | 이름 변경: profile → "영업·배달 설정", settings → "매장 관리" |

---

## 4. 누락 기능 (배민·요기요·쿠팡이츠 사장님앱 대비 — 설계 제안, 결함 아님)
1. PC 전용 좌측 고정 사이드바(현재 PC도 햄버거 드로어) — 배민 사장님광장 PC 레이아웃
2. 임시 영업중지(시간 지정 자동 재개) — 현재 영업 ON/OFF 즉시 토글만
3. 직원(서브 계정)·권한 — `my_biz_staff` "준비 중" 문구만 존재(`catalog/business-admin-nav.ts`)
4. 메뉴 일괄 품절/재고 수량·옵션 그룹 품절
5. 배달 지역·배달팁 독립 화면(현재 프로필 폼 내부)
6. 매출 리포트(일/주/월 그래프, 메뉴별 판매) — 현재 수수료 원장 중심
7. 리뷰 신고·블라인드 요청, 리뷰 통계
8. 단골·고객 관리(재주문 고객 목록), 고객 쿠폰 타겟팅
9. 알림 진동 설정(라벨만 존재)
10. 영수증/주문서 프린터 연동 설정
11. 매장 휴무일·브레이크타임 캘린더(영업시간 폼 내 존재 여부 NOT_PROVEN)

## 5. SSOT 표

| 데이터 항목 | 권위 소스 | 이탈 소비자 |
|---|---|---|
| 오너 URL | `lib/business/owner-routes.ts` `OwnerRoutes` | 하드코딩 `/stores/owner/profile?…`(`MyBusinessPage.tsx:327,355`, `StoreBusinessBlockedModal.tsx:54`, `OwnerStoreSettingsContent.tsx:85-103,191`), `DELIVERY_AD_OWNER_ROUTES`·`PLATFORM_POPUP_OWNER_ROUTES`(storeId 미지원), 이벤트 프로모션 경로 하드코딩 |
| 메뉴 항목·라벨 | `lib/business/owner-nav-registry.ts` | 페이지 제목 `business-admin-page-title-i18n.ts`(독립 분기), 뒤로가기 `owner-stack-back-href.ts`(독립), 하단탭 활성 `owner-bottom-nav-active.ts`(독립 경로 목록) |
| 활성 매장 | `resolveOwnerActiveStoreRow` (`lib/delivery/owner/resolve-owner-active-store.ts`) + Shell `selectedRow` | `stores[0]` 사용: event-promotions page, `OwnerStoreNotificationsView.tsx:37`; 가드 `store-admin-access.ts:24` |
| 오너 접근 가능 여부 | (부재) — UI `StoreBusinessGuard` / 정책 문서 `store-business-hub-nav-intercept.ts` | 두 규칙 불일치(IA-01), API `getStoreIfOwner` 승인 미검사(IA-03) |
| 매장 노출/영업 | `stores.is_visible`/`is_open` via PATCH `/api/me/stores/[id]` | 3개 UI 진입점(IA-12) |
| 정산 용어·구조 | `docs/store-commission-cash-settlement-ssot.md` | `OwnerFinanceNav` "주문별 정산", 드로어 "지급 현황" |
| 알림 설정 | `owner_notification_settings(user_id)` | 매장 단위 UI(IA-14) |
| 확인창 | `OwnerStoreAdminConfirmModal` (규칙 §6) | 쿠폰(busy 미전달), 리뷰 답글 삭제·Coin 환전(미사용) |
| 피드백(토스트) | (부재) | 상품 허브 자체 toast만 |
| 색·반경 | `app/design-tokens.css` `--sam-*`, `rounded-ui-rect` | `--biz-*` 사이드바, hex 186·팔레트 369·반경 42건 |

## 6. 기존 문서와 구현 차이
1. `.cursor/rules/samarket-store-admin-ui-shell.mdc` "운영 사이드 메뉴 … `#dbedf5` 톤" ↔ 실제 활성색 `--biz-header-bg`(`BusinessAdminSidebar.tsx:100-102`), PC 사이드바는 CSS 로 숨김(`owner-compact-shell.css:276-279`).
2. 같은 규칙 §6 "삭제·종료 확인은 ConfirmModal" ↔ 리뷰 답글 삭제·쿠폰 목록 일시정지/재발행·Coin 환전 확인 없음.
3. `lib/stores/store-business-hub-nav-intercept.ts:1-3` (신청·프로필·기본정보 예외) ↔ `StoreBusinessGuard` 는 예외 없음.
4. `docs/store-commission-cash-settlement-ssot.md:36` "주문별 정산 큐 폐지" ↔ 오너 Finance "주문별 정산" 탭.
5. `app/(main)/stores/owner/layout.tsx:12` "never invent stores[0]" ↔ event-promotions·notifications.
6. `owner-routes.ts:8-9` "옛 경로는 /stores/owner/* 로 서버 리다이렉트" ↔ 쿼리 유실·`/order-chat` 무효 매핑.
7. `OwnerStoreNotificationsView.tsx:14` "slug path remains compatibility" ↔ slug 경로는 리다이렉트가 아닌 분기 렌더.
8. `owner-nav-registry.ts:10-11` "Drawer is a COMPLETE management map" ↔ /settings, 광고 하위, 이벤트 프로모션 미포함.

## 7. Owner 정책 결정 필요 사항
1. 보완요청·심사중 매장에서 열람/수정 허용할 화면·필드 (IA-01)
2. 정지 매장에서 허용할 쓰기 API 목록(주문·주문채팅 외: Coin 환전? 정산 조회? 광고 초안?) (IA-03)
3. 종료·revoked 쿠폰의 재활성 금지 여부, 재발행 시 원본 상태 요건 (IA-04/05)
4. 오너용 정식 용어: "정산" vs "수수료·캐시 원장", "출금" vs "Coin 환전", "Cash" vs "캐시" (IA-13)
5. 12그룹 IA 채택 및 하단 5탭 유지 여부, PC 고정 사이드바 도입 여부 (3-C, IA-20)
6. 고아 라우트(이벤트 프로모션 목록, 슬러그 알림) 노출/삭제, 고아 컴포넌트 18개 삭제 (IA-18)
7. 알림 설정을 사용자 단위로 유지(문구 수정) vs 매장 단위로 전환, 진동 기능 추가 여부 (IA-14)
8. 노출 OFF·영업 OFF 에 확인창 요구 여부 (IA-17)
