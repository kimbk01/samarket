# DIBAY i18n 마이그레이션 — 진행 상태

마스터 순서: [i18n-migration-roadmap.md](./i18n-migration-roadmap.md)

**현재 단계**: 12 (lib 공유) — 11 관리자 UI 마감 후 · **일시 중단 (2026-05-20, UI 우선 정책으로 재개)**  
**마지막 갱신**: 2026-05-20

### 재개 시 범위 (중요)

- **한다**: 사용자·사장님·관리자 **화면에 보이는** JSX·토스트·폼 검증/API `message`·목록 API 라벨(카드에 노출)
- **안 한다(별 트랙)**: DB canonical 한글(`work_category` 저장값 등), mock·주석만, dev 전용 내부 집계
- **게이트 우선**: `components/**` · `app/(main)/**` hardcoded 0 → 필요한 `lib`만 추가
- **카탈로그**: `npm run check:i18n` 유지 (~11860 keys ko/en, 2026-05-20)

**실행 순서 (배달·매장 주문 구매자 축은 마지막)**  
로드맵 번호와 달리 **6(매장·주문·배달 구매자)** 를 **12 직전**에 둡니다. 5번 채팅 허브는 **거래 채팅만** 먼저 하고, 주문 채팅 UI(`MemberOrder*`, `StoreOrderMessenger*`)는 **6번과 함께** 처리합니다.

| 순서 | 로드맵 | 이름 |
|------|--------|------|
| 1–3 | 0–3 | 인프라 · 셸 · 탭 · 내정보 ✅ |
| 4 | **4** | 거래·마켓 ✅ |
| 5 | **5** | 채팅 허브 (거래) ✅ — `StoreOrder*` 14건은 6번에서 |
| 6 | **7** | 사장님·비즈 |
| 7 | **8** | 커뮤니티 메신저 ✅ |
| 8 | **9** | Philife·커뮤니티 ✅ 1차 고정 |
| 9 | **10** | 가입·온보딩 ✅ |
| 10 | **11** | 관리자 ✅ |
| 11 | **12** | lib 공유 ← **현재** |
| 12 | **6** | **매장·주문·배달 (구매자) — 마지막 제품 축** |
| 13 | **13** | CI·마감 |

---

## 단계 체크리스트

- [x] **0** 인프라 — Provider, system/ko/en, API, `check:i18n`, 개발 규칙
- [x] **1** 셸·공통 에러·로딩 (범위 내 파일)
- [x] **2** 하단 탭·레이아웃
- [x] **3** 내정보·설정
- [x] **4** 거래·마켓
- [x] **5** 채팅 허브 (거래·통합; `StoreOrder*` 문구는 6에서 마감)
- [x] **10** 가입·온보딩 — `auth-ui`·`login-error-i18n`·로그인·동의·온보딩·전화 게이트
- [x] **6** 매장·주문·배달 (구매자) — `member-order-labels`·`MyStoreOrdersView` 상대 시각·구매자 UI 게이트 통과
- [x] **7** 사장님·비즈 — 운영 CRUD·상품·`resolveOwnerApiErrorMessage` 전역 표시·`components/stores/owner` 주문·알림
- [x] **8** 커뮤니티 메신저 — `cm_sys_order_*`·모임 뱃지·store-order-chat-service·게이트 통과
- [x] **9** Philife·커뮤니티 — 1차 고정 (`community-ui`·`philife` → `MESSAGES`, `components/community` 스캔 통과)
- [x] **10** 가입·온보딩 — `auth-ui`·`login-error-i18n`·로그인·동의·온보딩·전화 게이트
- [x] **11** 관리자 — `components/admin` 하드코딩 스캔 0건 (2026-05-19)
- [ ] **12** lib 공유 — 12a~12차 일부 완료(아래 표) · **UI 연결 lib만** 이어서 · 전체 lib 일괄 X
- [ ] **13** CI·마감

---

## 단계 4 완료 범위

| 영역 | 처리 |
|------|------|
| `components/write/trade/*`, `components/trade/*`, `components/home/*`, `components/search/*` | `trade_*`, `trade_write_*` |
| `app/(main)/market`, `post`, `write`, `products` | 라우트·클라이언트 문구 |
| 카탈로그 | `lib/i18n/catalog/trade.ts` (신규, ~139키) |

**게이트 (4)**

```bash
node scripts/check-hardcoded-korean.mjs app/(main)/market app/(main)/post app/(main)/write app/(main)/products components/home components/trade components/write/trade components/search
npm run check:i18n
```

---

## 단계 3 완료 범위

| 영역 | 처리 |
|------|------|
| `components/mypage/**`, `components/my/**` | `mypage_comp_*`, `my_*`, `my_phone_*`, `mypage_comp_nav_sec_*` |
| `app/(main)/mypage/**`, `app/(main)/my/**` | 라우트·로딩은 기존 i18n 패턴 유지 |
| 카탈로그 | `mypage-components.ts`, `settings-ui.ts`, `my.ts`, `mypage-hub.ts`, `mypage-routes.ts` |

**게이트 (3)**

```bash
npm run check:i18n
npm run verify:i18n-phase3-my-components
node scripts/check-hardcoded-korean.mjs app/(main)/mypage app/(main)/my components/mypage components/my
npx tsc --noEmit
```

---

## 단계 1 완료 범위

| 파일 | 처리 |
|------|------|
| `app/error.tsx` | `app_error_root_*`, `common_retry` |
| `app/(main)/error.tsx` | `app_error_*` |
| `app/(main)/community-messenger/error.tsx` | `app_error_messenger_*` |
| `app/(main)/post/[id]/error.tsx` | `post_error_*` (raw `error.message` UI 노출 제거) |
| `app/(main)/products/[id]/error.tsx` | `app_error_*` |
| `app/(main)/products/[id]/loading.tsx` | `RouteLoadingLabel` |
| `app/(main)/my/store-orders/loading.tsx` | `RouteLoadingInline` |
| `components/layout/WebConnectivityBanner.tsx` | `app_connectivity_offline` |

**공용 컴포넌트**: `components/i18n/RouteLoadingLabel.tsx`, `RouteLoadingInline.tsx`

**게이트 (1)**

```bash
npm run check:i18n
node scripts/check-hardcoded-korean.mjs app/error.tsx app/(main)/error.tsx app/(main)/community-messenger/error.tsx app/(main)/post/[id]/error.tsx app/(main)/products/[id]/error.tsx app/(main)/products/[id]/loading.tsx app/(main)/my/store-orders/loading.tsx components/layout/WebConnectivityBanner.tsx
```

---

## 단계 2 완료 범위

| 파일 | 처리 |
|------|------|
| `components/layout/BottomNav.tsx` | `nav_bottom_bar_aria` |
| `lib/main-menu/bottom-nav-config.ts` | 탭 `label` 영문 폴백, `labelKey` 단일 소스 |
| `components/navigation/AppBackButton.tsx` | 기본 `nav_back`, `ariaLabelKey` |
| `components/navigation/HistoryBackTextLink.tsx` | 기본 `nav_back`, `ariaLabelKey` |
| `components/layout/UnifiedTier1AddressPillHeading.tsx` | `layout_region_*`, `layout_address_manage_aria` |
| `components/layout/Tier1ExplorationTitleRow.tsx` | `layout_neighborhood_address_aria` |
| `RegionBar.tsx`, `FloatingAddButton.tsx`, `CommerceCartHeaderLink.tsx` | 기존 `t()` 유지, hardcoded 0 |

**카탈로그**: `navigation.ts` — `nav_back`, `layout_region_*`

**게이트 (2)**

```bash
npm run check:i18n
node scripts/check-hardcoded-korean.mjs components/layout/BottomNav.tsx components/layout/RegionBar.tsx components/layout/FloatingAddButton.tsx components/layout/CommerceCartHeaderLink.tsx components/layout/UnifiedTier1AddressPillHeading.tsx components/layout/Tier1ExplorationTitleRow.tsx components/navigation lib/main-menu/bottom-nav-config.ts
npx tsc --noEmit
```

---

## 단계 6 진행 범위 (2026-05-19)

| 영역 | 처리 |
|------|------|
| `lib/i18n/messages.ts` | `storeCommerceUiMessages` ko/en 병합 |
| `lib/i18n/catalog/store-commerce-ui.ts` | 구매자 UI·체크아웃·장바구니 키 확장 |
| `components/stores/**` (owner 제외) | `t("store_*")` — hardcoded 스캔 통과 |
| `components/stores/StoreCommerceCartPageClient.tsx` | 장바구니·체크아웃 UI·주문 오류 코드 매핑 |
| `components/member-orders/**` | 취소 사유·알림 설정·목록 카드 |
| `components/chats/StoreOrderBuyerChatTop.tsx` | 주문 채팅 상단 (5단계 잔여 마감) |
| `contexts/StoreCommerceCartContext.tsx` | 만료 토스트 `translate` |
| `lib/stores/validate-store-order-checkout.ts` | 한글 `message` 제거 → 클라 `error` 코드만 |
| `app/api/me/store-orders/route.ts` | POST 응답 한글 `message` 제거 · 장바구니 `error` 코드 매핑 확장 |
| `app/(main)/stores/[slug]/owner/notifications*` | RSC `translate` + `OwnerNotificationSettings` |
| `lib/stores/payment-methods-config.ts` | 결제 라벨 `store_pay_*` · `getRuntimeAppLanguage`/`lang` 인자 |
| `lib/stores/store-cart-policy.ts` | UI 문구 상수 제거(TTL·replace만) |

**게이트 (6, 구매자)**

```bash
npm run check:i18n
node scripts/check-hardcoded-korean.mjs components/stores app/(main)/orders components/member-orders components/chats/StoreOrderBuyerChatTop.tsx
```

**6·7단계 주문 축 게이트 (2026-05-19)**

```bash
npm run check:i18n
node scripts/check-hardcoded-korean.mjs components/stores/owner components/business/owner/OwnerStoreOrdersView.tsx components/business/owner/OwnerStoreOrderDeliveryActions.tsx
```

**7단계 확장 — 상품·주문 시트 (2026-05-19)**

| 파일 | 처리 |
|------|------|
| `OwnerOrderAcceptSheet`·`OwnerOrderRejectSheet` | `business_phase7_339–348` 등 |
| `OwnerStoreOrderChatModal` | `store_biz_order_chat_modal_body`·`store_owner_*` |
| `OwnerStoreAdminLeavePromptModal`·`StoresOwnerStackHeader` | `common_*`·`business_phase7_350–351` |
| `OwnerProductForm`·`OwnerProductOptionsTab`·`OwnerStoreMenuSectionPicker`·`OwnerProductImagesBlock` | `business_phase7_339–407`·`408–428`(허브) |
| `OwnerProductsHubClient` | 상품 목록·필터·토스트·삭제 확인 (`t` 섀도잉 `setTimeout` 변수명 수정) |

```bash
node scripts/check-hardcoded-korean.mjs components/business/owner
```

**7단계 확장 — 운영 CRUD (2026-05-19)**

| 파일 | 처리 |
|------|------|
| `OwnerStoreNoticesView`·`OwnerStoreBannersView` | 공지·배너 CRUD (`business_phase7_429–460`·`485`·`486`) |
| `OwnerStoreInquiriesView`·`OwnerStoreReviewsView` | 문의·리뷰 (`461–472`) |
| `OwnerMenuCategoriesClient`·`StoreMenuCategorySortableList` | 카테고리 (`473–483`) |
| `OwnerStoreAdminConfirmModal` | 기본 `cancel`/`confirm`/`processing` → `common_*` |

```bash
node scripts/check-hardcoded-korean.mjs components/business/owner
```

**7·6 마감 (2026-05-19)**

| 항목 | 처리 |
|------|------|
| `lib/business/owner-api-error-i18n.ts` | `resolveOwnerApiErrorMessage` — owner·stores/owner 표시 |
| `lib/member-orders/member-order-labels.ts` | `member_order_status_msg_*`·`member_order_payment_*` |
| `lib/admin/map-store-order-to-admin-delivery.ts` | `translate(lang, …)` 옵션·환불 카테고리·매장 폴백 (`lang?` 기본 `ko`) |

**8단계 메신저 마감 (2026-05-19)**

| 항목 | 처리 |
|------|------|
| `lib/shared-order-chat/chat-message-builder.ts` | `cm_sys_order_*` 키·`translate(lang)` |
| `store-order-chat-service.ts` | 컨텍스트 headline·결제 등록 시스템 줄 i18n |
| `philife-meeting-open-group-summaries.ts` | 뱃지 `host`/`member` 코드·부제 한글 제거 |
| `MessengerChatListItem`·home-state | `philifeMeetingMemberRoleLabel` 표시·검색 |
| `CommunityMessengerRoomPhase2Header` | 레거시 `roleLabel` ko 폴백 |
| `my.ts` | `member_order_chat_*`·목록/스텝퍼 잔여 키 |

```bash
node scripts/check-hardcoded-korean.mjs components/community-messenger lib/community-messenger "app/(main)/community-messenger"
npm run check:i18n
```

**10단계 가입·온보딩 마감 (2026-05-19)**

| 항목 | 처리 |
|------|------|
| `lib/i18n/catalog/auth-ui.ts` | 로그인·동의·온보딩·전화 게이트·Supabase 오류 (~98키 ko/en) |
| `lib/auth/login-error-i18n.ts` | 비밀번호·OAuth·Supabase fetch 메시지 매핑 |
| `app/login/LoginPageClient.tsx` | 전면 `t()` |
| `components/auth/*` | 폼·모달·SNS·동의·세션 교체 안내 |
| `components/onboarding/*` | 프로필·@아이디·주소 강제 단계 |

```bash
node scripts/check-hardcoded-korean.mjs app/login components/auth components/onboarding "app/(main)/onboarding"
npm run check:i18n
```

**11단계 관리자 1차 (2026-05-19)**

| 영역 | 처리 |
|------|------|
| `lib/i18n/catalog/admin-boards.ts` | 게시판 목록·생성 폼 |
| `lib/i18n/catalog/admin-business.ts` | 상점 목록·상세·이력·액션 |
| `lib/i18n/catalog/admin-categories.ts` | 카테고리·메뉴 폼·훅 토스트 |
| `lib/admin/categories/admin-category-label-keys.ts` | 타입·서브타입·post_type 라벨 키 |
| `app/admin/backup/[id]`, `app/admin/dr/[id]` | `titleKey` 헤더 |

```bash
node scripts/check-hardcoded-korean.mjs components/admin/boards components/admin/business components/admin/categories app/admin/backup app/admin/dr
npm run check:i18n
```

**11단계 2차 (2026-05-19)**

| 영역 | 처리 |
|------|------|
| `admin-menu.ts` | `title` 한글 제거·`resolveAdminMenuTitleKey`·누락 메뉴 키 11개 |
| `lib/i18n/catalog/admin-release.ts` | 릴리즈 노트·아카이브 |
| `lib/i18n/catalog/admin-ops-docs.ts` | 운영 문서 SOP |
| `components/admin/i18n/admin-*-label-keys.ts` | 릴리즈·ops 라벨 맵 |

```bash
node scripts/check-hardcoded-korean.mjs components/admin/release-notes components/admin/release-archive components/admin/ops-docs components/admin/admin-menu.ts
npm run check:i18n
```

**11단계 3차 (2026-05-19)**

| 영역 | 처리 |
|------|------|
| `lib/i18n/catalog/admin-settings.ts` | `admin_auth_*` (AuthLoginSettingsForm 잔여) |
| `lib/i18n/catalog/admin-menus.ts` | 메뉴·하단탭·서브토픽 (~152키) |
| `lib/i18n/catalog/admin-delivery-admin.ts` | 배달 하단탭·라이더 |
| `lib/i18n/catalog/admin-posts-management.ts` | 게시물 통합 관리 |
| `components/admin/settings/AuthLoginSettingsForm.tsx` | 전화 hint·정책/OAuth UI |

```bash
node scripts/check-hardcoded-korean.mjs components/admin/settings components/admin/menus components/admin/delivery components/admin/delivery-riders components/admin/posts-management
npm run check:i18n
```

**11단계 4차 (2026-05-19)**

| 영역 | 카탈로그 |
|------|----------|
| `delivery-alerts` | `admin-delivery-alerts.ts` (`admin_del_alert_*`) |
| `delivery-operations` | `admin-delivery-operations.ts` |
| `ops-console` | `admin-ops-console.ts` |
| `product-backlog` | `admin-product-backlog.ts` |

```bash
node scripts/check-hardcoded-korean.mjs components/admin/delivery-alerts components/admin/delivery-operations components/admin/ops-console components/admin/product-backlog
npm run check:i18n
```

**11단계 5차 (2026-05-19, 일부)**

| 영역 | 카탈로그 |
|------|----------|
| ops 7폴더 | `admin-ops-tools.ts` (`admin_ops_tools_*`) |
| recommendation 4폴더 | `admin-recommendation.ts` (`admin_rec_*`) |
| notifications·points 4폴더 | `admin-points-notifications.ts` |

```bash
node scripts/check-hardcoded-korean.mjs components/admin/ops-knowledge-graph components/admin/ops-learning components/admin/ops-routines components/admin/ops-runbooks components/admin/ops-maturity components/admin/ops-knowledge components/admin/ops-board components/admin/recommendation-monitoring components/admin/recommendation-automation components/admin/recommendation-reports components/admin/recommendation-experiments components/admin/notifications components/admin/points components/admin/point-policies components/admin/point-executions
```

**12단계 lib 12a (2026-05-19)**

| 영역 | 처리 |
|------|------|
| `messenger-room-action-error-messages.ts` | API 오류 코드 → `nav_messenger_*` 전부 `t()` |
| `navigation.ts` | 방 액션·파일·거래 오류 키 22개 추가 (ko/en/zh-CN) |

```bash
node scripts/check-hardcoded-korean.mjs lib/community-messenger/room/messenger-room-action-error-messages.ts
npm run check:i18n
```

**12단계 lib 12b — mock 제외 실사용 (진행 중, 2026-05-19)**

| 영역 | 처리 |
|------|------|
| `trade-review-tags` / `trade-situation-copy` / `sales-history-ui` | `labelKey` + `t()` 헬퍼, `trade-review.ts`·`post-ads-user.ts` 카탈로그 |
| `post-ad-label-keys` | `AD_*_LABELS` 제거, 광고 UI·관리자 API `formatAdminReviewTagKeys(t,…)` |
| `logout-client.ts` | `auth_logout_err_*` |
| `resolve-main-tier1.ts` | 제목·aria → `tier1_*` / `navigation_*` 키 (`RegionBar` `tt`) |
| `order-status-text.ts` | `member_*` / `owner_*` / `admin_*` 메시지 키 |

| `mypage-mobile-nav-registry.ts` | `labelKey` + `mypage-mobile-nav.ts` 카탈로그 |
| `shared-order-store.ts` | `shared-order-demo.ts` + `soT()` |
| `community-messenger/service.ts` | `cm-service-copy.ts` + `cm_svc_*` 키 |
| `jobs/form-options.ts` | `jobs-form.ts` + `job-label-keys.ts` |
| **6차** `service.ts` (거래 전송 오류·멤버보내기) | `cm_svc_trade_*` + `cmMgmtMemberKickContent` |
| **6차** `messenger-ia.ts` | `messenger-ia.ts` 카탈로그 + `messenger-ia-i18n.ts` |
| **6차** `types/category.ts` | `category-labels.ts` + `category-label-i18n.ts` (`labelKey` 옵션) |
| **6차** `post-list-preview-model.ts` | 환전·알바·스킨·부동산 가격·직거래 → `postPreviewT` / `postPreviewSkinLabel` |
| **7차** `service.ts` UI 잔여 | `cm-service-copy` 미리보기·방 설명·발신 라벨 → `cm_svc_*` / `cm_home_preview_*` |
| **7차** `release-archive-utils` | `release-archive-labels.ts` + `release-archive-label-i18n.ts` |
| **7차** `ad-utils` | `ad-application-labels.ts` + `ad-label-i18n.ts` |
| **7차** `launch-week-utils` | `launch-week-labels.ts` + `launch-week-label-i18n.ts` |
| **8차** `posts-management-utils` | `posts-management-label-i18n.ts` (탭·필터 값 배열) |
| **8차** `admin-permissions` | `admin-permissions-labels.ts` + `admin-permissions-label-i18n.ts` |
| **8차** `main-bottom-nav-presets` | 라벨 제거(값만) — UI는 기존 `admin-menus` 키 |
| **8차** `delivery-orders-admin/labels` | `do-admin-label-i18n.ts` (`admin_do_*` 키) |
| **8차** `launch-readiness-utils` · `ops-routines-utils` | 각 label-i18n + 카탈로그 |
| **9차** `production-migration-utils` | `production-migration-labels.ts` + `production-migration-label-i18n.ts` |
| **9차** `trade-post-ad-policy` | `trade-post-ad-labels.ts` + `trade-post-ad-policy-i18n.ts` (API `lang`) |
| **9차** `managed-my-section-ctas` | `my-managed-cta-labels.ts` + `managed-my-section-ctas-i18n.ts` |
| **9차** `messenger-friend-add-cta` | `cm-friend-add-cta-labels.ts` + 컴포넌트 `t(LabelKeys.*)` |
| **9차** `feed-emergency-state` | `feed-emergency-labels.ts` + `feed-emergency-label-i18n.ts` |
| **9차** `store-order-chat-summary-body` | `store-order-chat-summary-labels.ts` + `store-order-chat-summary-i18n.ts` |
| **9차** `my-business-nav` · `business-admin-page-title` | `business-admin-nav` 확장 + i18n 헬퍼 |
| **10차** `store-commerce-extras` · `store-delivery-eta-label` | `store-commerce-ui` ETA·배달비 키 16개 · `lang` 인자 · browse/home-feed/delivery-eta API `Accept-Language` |
| **11차** `owner-product-options-validate` · `owner-hub-menu-icons` | `owner-product-options` 카탈로그 17키 · `loadUserAppLanguage` · 사이드바 아이콘 `item.id` 매핑 |
| **12차** `server-store-summary` · `jobs/form-options` | `cm-monitoring-slo` SLO `labelKey` · 업종 DB값+`labelKey` · JobsWriteForm·상세·목록 |

```bash
node scripts/check-hardcoded-korean.mjs lib/stores/store-commerce-extras.ts lib/stores/store-delivery-eta-label.ts
node .tmp-lib-ko-real.mjs   # mock·catalog·test 제외 잔여 (~318 files, 2026-05-20)
npm run check:i18n          # 11860 keys (ko/en, 2026-05-20)
```

**12단계 lib 잔여 스냅샷 (참고, UI 아님 포함)** — `node .tmp-lib-ko-real.mjs` → ~316 files / ~1463 lines. 재개 시 **화면 연결 파일만** 골라 처리.
```

**5차 잔여(misc) (2026-05-19)**

| 영역 | 카탈로그 |
|------|----------|
| qa·런칭·리뷰·보안·피드·노출 등 | `admin-misc.ts` |
| dev-sprints | `admin-dev-sprint.ts` |
| operations hub | `admin-operations-hub.ts` |
| post-ads 테이블 | 기존 `admin_ads_*` 키 재사용 |

```bash
node scripts/check-hardcoded-korean.mjs components/admin
npm run check:i18n
```


---

## 단계 6·7 완료 범위 (주문·배달, 2026-05-19)

| 영역 | 처리 |
|------|------|
| `lib/stores/buyer-order-status-labels.ts` | `mypage_comp_order_status_*` 단일 소스 |
| `lib/stores/owner-order-ui-labels.ts` | 사장님 상태·탭·전환 |
| `store-order-process-criteria.ts` | `BUYER_ORDER_STATUS_LABEL` 제거, 타임라인 step 함수 export |
| 구매자·마이·채팅·API | `buyerOrderStatusLabel` + `loadNotificationUserLanguage` |
| `components/stores/owner/*` | 주문·알림·모달·채팅 셸 |
| `OwnerStoreOrdersView`·`OwnerStoreOrderDeliveryActions` | 비즈 주문함 |

---

## 전체 hardcoded 스냅샷 (참고)

```bash
npm run check:i18n-hardcoded
```

마지막 전체 스캔: 수천 건 — 단계별로 감소시킴.
