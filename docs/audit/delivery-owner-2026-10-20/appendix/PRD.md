# PRD — 배달 오너 상품/메뉴 도메인 감사 (AUDIT ONLY)

- 감사일: 2026-10-20 (PHT) · 대상 저장소: `/home/user/samarket` (수정 없음)
- DB 증거: 운영 Supabase `ckdosyydvgzqwpbwuhon` 읽기 전용 SELECT (pg_catalog / information_schema / pg_policies / 집계 COUNT만, 개인정보 컬럼 미조회)
- 런타임(오너·관리자 로그인 UI, 실제 PostgREST 호출) 증거는 없음 → 해당 항목은 **NOT_PROVEN(runtime)** 으로 구분
- 참조 문서: `docs/dibay-delivery-product-hard-lock.md`, `docs/dibay-stores-product-recovery-contract.md`, `docs/store-owner-products-perf-lock.md`, `.cursor/rules/dibay-delivery-product-hard-lock.mdc`

---

## 1. 범위 및 조사 대상 목록

### 1.1 페이지 라우트 (10)
| # | 경로 | 비고 |
|---|---|---|
| 1 | `app/(main)/stores/owner/products/page.tsx` | 허브(RSC bootstrap → `OwnerProductsHubClient`) |
| 2 | `app/(main)/stores/owner/products/new/page.tsx` | `OwnerProductForm mode=new` |
| 3 | `app/(main)/stores/owner/products/[productId]/edit/page.tsx` | `OwnerProductEditSupportShell` |
| 4 | `app/(main)/stores/owner/menu/page.tsx` | products 로 redirect |
| 5 | `app/(main)/stores/owner/menu-categories/page.tsx` | `OwnerMenuCategoriesClient` |
| 6-10 | `app/(main)/my/business/{products, products/new, products/[productId]/edit, menu, menu-categories}/page.tsx` | 전부 redirect-only (`redirectLegacyOwnerPage`, `OwnerRoutes.productEdit`) |

### 1.2 컴포넌트 (9)
`components/business/owner/` — `OwnerProductsHubClient.tsx`, `OwnerProductForm.tsx`, `OwnerProductOptionsTab.tsx`, `OwnerProductImagesBlock.tsx`, `OwnerMenuCategoriesClient.tsx`, `StoreMenuCategorySortableList.tsx`, `OwnerStoreMenuSectionPicker.tsx`, `OwnerProductNewStoreIdRedirect.tsx`, `OwnerMobileOpsMenuDrawer.tsx`

### 1.3 API Route (11 파일 / 17 핸들러)
| 파일 | 핸들러 |
|---|---|
| `app/api/me/stores/[storeId]/products/route.ts` | GET, POST |
| `app/api/me/stores/[storeId]/products/[productId]/route.ts` | GET, PATCH (DELETE 없음 — soft delete 는 PATCH `product_status=deleted`) |
| `app/api/me/stores/[storeId]/menu-sections/route.ts` | GET, POST |
| `app/api/me/stores/[storeId]/menu-sections/[sectionId]/route.ts` | PATCH, DELETE |
| `app/api/me/stores/[storeId]/upload-image/route.ts` | POST |
| `app/api/stores/[slug]/menus/route.ts` | GET (구매자 메뉴) |
| `app/api/stores/products/[productId]/route.ts` | GET (구매자 상품 상세) |
| `app/api/stores/product-categories/route.ts` | GET |
| `app/api/admin/store-products/[productId]/route.ts` | PATCH (관리자 상품 조치) |
| `app/api/me/store-orders/route.ts` | POST (주문 생성 — 가격/옵션 재계산 확인용) |
| (참고) `app/api/me/stores/[storeId]/banners/[bannerId]/route.ts`, `app/api/me/profile/route.ts` | 이미지 삭제 패턴 비교용 |

### 1.4 lib (주요 24)
`lib/stores/owner-product-gate.ts`, `owner-store-ownership-cache.ts`, `owner-products-list-snapshot.ts`, `owner-product-images.ts`, `owner-product-options-validate.ts`, `owner-product-options-json.ts`, `parse-product-options-json.ts`, `store-product-pricing.ts`, `owner-recommended-menu-limit.ts`, `admin-store-product-ops.ts`, `validate-store-order-checkout.ts`, `create-store-order-atomic.ts`, `restore-order-stock.ts`, `product-line-options.ts`, `modifiers/parse-json.ts`, `modifiers/validate.ts`, `store-menus-catalog-assemble.ts`, `store-menus-snapshot.ts`, `store-menus-snapshot-cache.ts`, `store-menus-snapshot-invalidate-by-store-id.ts`, `store-menus-public-server-cache.ts`, `store-public-shared-cache-generation.ts`, `owner/load-owner-store-read-bootstrap.ts`, `try-supabase-stores.ts`; `lib/media/canonical-image-lifecycle.server.ts`, `lib/media/canonical-image-path.ts`

### 1.5 DB (운영 조회)
- 테이블 7: `store_products`, `store_menu_sections`, `store_product_categories`, `store_order_items`, `store_order_item_options`, `store_sales_permissions`, `stores`(정책만)
- 함수 4: `create_store_order_atomic(uuid,uuid,text,jsonb,jsonb)`, `restore_store_order_stock_atomic(uuid)`, `get_store_menus_snapshot(text,uuid,text)`, `get_owner_store_order_detail_snapshot`(store_products 조인 여부)
- 트리거 3(관련 테이블): `store_products_updated_at`, `store_menu_sections_updated_at`, `store_product_categories_updated_at` (모두 `set_updated_at`; 메뉴 버전·가격 보호 트리거 없음)
- Storage: `storage.buckets`(`store-product-images`, `post-images`), `storage.objects` 정책 5건
- 옵션 그룹/옵션 **별도 테이블 없음** — `store_products.options_json`(jsonb) 단일 저장

---

## 2. 기능별 현황표

| 기능 | UI | API | DB | 업무 | 운영 | 판정 | 근거 |
|---|---|---|---|---|---|---|---|
| 상품 목록(오너) | 허브·섹션 필터 | 소유자 게이트+30s 캐시 | deleted 제외 | 주문/관리자 변경 시 캐시 미무효화 | NOT_PROVEN | FAIL(P2) | `owner-products-list-snapshot.ts:59,78-89,210`; 주문 RPC·`admin/store-products/[productId]/route.ts:113-120` 에 owner list invalidate 없음 |
| 상품 등록 | 폼 검증 | 소유자·approved·active→판매승인·섹션·썸네일·옵션 검증 | CHECK price≥0, stock≥0 | 멱등키 없음 | NOT_PROVEN | PASS(경미 P3) | `products/route.ts:183-432` |
| 상품 수정 | 전체 payload 전송 | 소유자·approved·blocked/rejected 상태변경 차단 | CAS/버전 없음 | stale 폼이 재고·상태 덮어씀, 반려→재검수 우회 | NOT_PROVEN | FAIL | `[productId]/route.ts:126-525`, `OwnerProductForm.tsx:510-528,616-621` |
| 상품 삭제 | confirm → status=deleted | PATCH soft delete | `store_order_items.product_id` FK **ON DELETE RESTRICT** | 주문 이력 보존 | 운영 orphan 0 | PASS | `OwnerProductsHubClient.tsx:636`; SQL: orphan=0 / 1512 items |
| 상품 복사 | 없음 | 없음 | — | — | — | 누락(설계 제안) | grep 결과 없음 |
| 메뉴 카테고리 CRUD | 목록·정렬·삭제 confirm | 소유자·approved·이름 1~80·unique | UNIQUE(store_id,name), 상품 FK SET NULL | 삭제 시 상품 비분류 안내 없음, 정렬 비원자 | NOT_PROVEN | PASS(P3 다수) | `menu-sections/[sectionId]/route.ts:118-163`, `OwnerMenuCategoriesClient.tsx:307-340`, i18n `business_phase7_477` |
| 카테고리 숨김(is_hidden) | 토글 | 저장 | 컬럼 | 메뉴에서만 숨김, 상세/주문 API는 허용 | 운영 사례 0 | FAIL(P2) | `store-menus-catalog-assemble.ts:70-76`, `api/stores/products/[productId]/route.ts:41-52`, `validate-store-order-checkout.ts:214-224` |
| 플랫폼 상품 카테고리 | 폼은 `category_id:null` 고정 | is_active 검증 | FK SET NULL | — | — | PASS | `products/route.ts:274-289`, `OwnerProductForm.tsx:520` |
| 옵션 그룹/옵션 (필수·min/max·추가금) | 폼 검증 | 서버 동일 검증기 | jsonb, 구조 CHECK 없음 | 주문 시 서버 재계산 | 293개 상품/920 옵션, 음수 0 | PASS(P3: 중복명) | `owner-product-options-validate.ts:31-182`, `modifiers/validate.ts:110-258` |
| 옵션 품절 | 체크 | 저장 | — | 주문 시 거부 | — | PASS | `modifiers/validate.ts:169,210` |
| 이미지 업로드 | 20MB/JPG·PNG·WebP | 소유자·승인상태·quota·MIME sniff, 경로 `${storeId}/uuid` | 버킷 public, storage 정책 없음(service role 전용) | — | — | PASS | `upload-image/route.ts:42-131`; SQL storage.policies |
| 이미지 교체/삭제 권한 | — | **URL 소유 검증 없이 service role 로 삭제** | — | 타 매장·커뮤니티 이미지 삭제 가능 | NOT_PROVEN(runtime) | **FAIL(P0)** | `[productId]/route.ts:258-263,279-297,493-519`, `canonical-image-lifecycle.server.ts:22-25,109-133` |
| 가격/할인 | 가격+할인율 동시 전송 | 할인율→할인가 서버계산; `discount_price` 직접 경로는 가격 대비 검증 없음 | CHECK discount≥0만, ≤price 없음 | 관리자 가격수정 시 할인가 미재계산 | 운영 불일치 0 | FAIL(P1) | `admin-store-product-ops.ts:133-145`, `products/route.ts:253-256`, `[productId]/route.ts:230-242` |
| 세금/단위 | 없음 | 없음 | 컬럼 없음 | — | — | 누락(정책) | `information_schema` 컬럼 목록 |
| 재고/품절/판매중지 | 토글 | 재고 절대값 SET | stock≥0 | 주문 감산 TX 내; 취소 복원이 수동 품절도 해제 | 1건 active+재고0 | FAIL(P2) | `create_store_order_atomic` Pass2, `restore_store_order_stock_atomic` |
| 최소/최대 주문수량 | 없음 | 오너 API 미지원 | min/max 컬럼+CHECK | 체크아웃 검증 | 기본 1/99 | PASS(누락 기능) | `validate-store-order-checkout.ts:226-230` |
| 노출 순서 | sort_order 입력 | 0~9999 clamp | — | 오너 목록 정렬 ≠ 구매자 정렬 | — | FAIL(P3) | `owner-products-list-snapshot.ts:220-223` vs `group-store-products-by-menu.ts:186-192` |
| 사장님 추천 6개 제한 | 표시 | count→insert 비원자 | 제약 없음 | 경합시 초과 | — | PASS(P3) | `products/route.ts:375-387` |
| 서버 가격 재계산 | — | TS 재계산 + RPC 재검증(가격·옵션 JSON 동일성·배달비·쿠폰) | FOR UPDATE | 클라 금액 불신 | — | PASS | `validate-store-order-checkout.ts:247-283`, `create_store_order_atomic` Pass1 |
| 품절/비활성 상품 직접 API 주문 | — | sold_out/비active 거부 | RPC 재검증 | 숨김 카테고리·검수대기 상품은 통과 | — | 부분 FAIL | 위 및 PRD-04/05 |
| 주문 라인 스냅샷 | — | 서버 title/unit/base/options 스냅샷 | `product_title_snapshot`, `price_snapshot`, `base_price_snapshot`, `options_snapshot_json`, `store_order_item_options` | 오너 상세 RPC 는 store_products 미조인 | subtotal 불일치 0, base 스냅샷 null 2(레거시) | PASS | RPC Pass3, SQL 집계 |
| 주문 중 가격 변경 | — | `price_changed` fail-closed | FOR UPDATE + 옵션 JSON 비교 | 구매자 재시도 필요 | — | PASS | RPC `IF abs(v_live_base - v_base) >= 1` |
| 오너 변경 → 구매자 반영 | — | 인스턴스 로컬 메모리 무효화만 | 메뉴 버전 트리거 없음 | 타 인스턴스 ≤60s stale | NOT_PROVEN | FAIL(P2) | `store-menus-snapshot-invalidate-by-store-id.ts:9-24`, `store-menus-public-server-cache.ts:13-14`, `store-public-shared-cache-generation.ts:92-101`(관리자만 호출) |
| 교차 매장 IDOR(API) | — | `.eq(store_id)` + 소유자 게이트 | — | — | — | PASS | `[productId]/route.ts:31-61,486`, `menu-sections/[sectionId]/route.ts:53-58,98-102` |
| 교차 권한(PostgREST 직접) | — | API 우회 | `store_products_owner_all` FOR ALL + authenticated 전 컬럼 UPDATE | 관리자 차단/검수/판매승인 우회 | NOT_PROVEN(runtime) | **FAIL(P0)** | `pg_policies`, `column_privileges` |
| 관리자 상품 조치 | — | 권한·사유·CAS(product_status)·감사·전역캐시 bump | — | 가격수정 할인 불일치, hide/sold_out 비고정 | — | 부분 FAIL | `admin/store-products/[productId]/route.ts:31-132` |
| 반려 상품 재판매 | 토스트 "승인 후 판매" | rejected 만 차단 | — | 수정→pending→active 가능 | 운영 사례 0 | **FAIL(P1)** | `[productId]/route.ts:409-415,477-484`, `OwnerProductsHubClient.tsx:275-281` |
| 서버 오류 메시지 | 코드→문구 매핑 | DB 에러 message 원문 반환 | — | — | — | FAIL(P3) | `products/route.ts:425`, `[productId]/route.ts:490`, `menu-sections/route.ts:128` |

---

## 3. 결함 목록

### PRD-01 · 상품 이미지 교체 시 타 매장·커뮤니티 Storage 원본을 service role 로 삭제 가능
- **영역**: 이미지/Storage 권한 (API)
- **증상**: 오너가 자기 상품의 `thumbnail_url`/`images_json` 에 **다른 매장 상품 이미지 URL(또는 `post-images` 버킷의 커뮤니티 게시글·프로필 이미지 URL)** 을 넣어 저장한 뒤 다시 다른 이미지로 교체(또는 `images_json: []`)하면, 서버가 "제거된 URL" 로 판단해 해당 Storage 원본+파생본을 삭제한다.
- **원인**:
  - URL 소유 검증 없음: `app/api/me/stores/[storeId]/products/route.ts:344-362` (POST), `[productId]/route.ts:258-263, 279-297` (PATCH) — `normalizeOwnerProductDetailImageUrls` 는 중복·개수만 검사 (`lib/stores/owner-product-images.ts:70-94`).
  - 삭제: `[productId]/route.ts:493-519` → `diffRemovedImageUrls` / `removeCanonicalImagesFromPublicUrls` (`lib/media/canonical-image-lifecycle.server.ts:52-58,109-133`) 는 버킷이 `post-images`·`store-product-images` 이고 확장자만 맞으면 **경로 접두(`{storeId}/`) 확인 없이** 삭제. `sb` 는 service role (`lib/stores/try-supabase-stores.ts:5-17`) → Storage 정책 무관.
  - 대조: 프로필 아바타 교체는 이미 같은 결함을 `isOwnProfileAvatarStoragePath` 필터로 막음 (`app/api/me/profile/route.ts:1202-1210`, 주석 "D1").
- **영향**: 타 매장 메뉴 이미지·커뮤니티/프로필 이미지 영구 삭제(타 테넌트 데이터 파괴). 승인된 매장 오너 1명이면 공개 URL 만으로 2회 PATCH 로 실행 가능.
- **심각도**: **P0** (other-tenant data access/파괴)
- **현행 동작**: 임의 URL 저장 허용 + 제거 diff 대상 무조건 삭제.
- **기대 동작**: (a) 저장 시 썸네일·상세 URL 은 `store-product-images/{storeId}/...` 또는 허용된 외부 정책 URL 만 허용, (b) 삭제 시 `bucket === store-product-images && path.startsWith(`${storeId}/`)` 인 것만, (c) 같은 매장 다른 상품이 같은 URL 을 참조하면 삭제 보류.
- **수정 설계**: `lib/stores/owner-product-images.ts` 에 `isOwnStoreProductImageUrl(storeId,url)` 추가 → POST/PATCH 정규화 단계에서 비소유 URL 거절(`image_url_not_owned` 400). `[productId]/route.ts:508` 의 `removed` 에 `.filter(isOwnStoreProductImagePath)` + `store_products` 참조 카운트(같은 store, 다른 id) 0 일 때만 삭제. 같은 패턴인 `banners/[bannerId]/route.ts:143-150,197`, `notices/[noticeId]/route.ts:103-105,154` 도 동일 가드 필요(범위 밖 — 보고만).
- **연동 영향**: 기존 데이터 중 외부 URL 썸네일(레거시)이 있으면 수정 저장이 거부될 수 있음 → 기존 값과 동일한 URL 은 허용(“unchanged pass”) 처리.
- **검증 방법**: 단위테스트 — 타 store 경로 URL 교체 시 `removeCanonicalImagesFromPublicUrls` 미호출; 자기 경로만 호출. 운영 SQL: `store_products.thumbnail_url` 중 경로 접두 ≠ store_id 건수 집계.
- **Owner 승인 필요**: 외부 URL(비 Supabase) 썸네일 허용 여부.
- **증명 상태**: 코드 증거 PROVEN / 런타임 재현 NOT_PROVEN.

### PRD-02 · `store_products` RLS(FOR ALL) + authenticated 전 컬럼 UPDATE 권한 → 오너가 PostgREST 로 API 검증 전부 우회
- **영역**: DB 권한 / 관리자 통제
- **증상**: 브라우저에 Supabase 세션(JWT)이 있는 오너는 공개 anon key 로 `PATCH /rest/v1/store_products?id=eq.X` 를 직접 호출해 `product_status='active'`(관리자 `blocked` 해제·판매 미승인 상태 무시), `admin_review_status='approved'`(자가 검수 승인), 임의 `discount_price`, 검증되지 않은 `options_json`, 썸네일 없이 active 등을 쓸 수 있다.
- **원인**:
  - SQL: `pg_policies` — `store_products_owner_all` cmd=ALL, roles={public}, USING/WITH CHECK = `is_admin_user() OR stores.owner_user_id = auth.uid()` (컬럼 제한 없음).
  - SQL: `information_schema.column_privileges` — `authenticated`·`anon` 에 store_products 33개 컬럼 전부 INSERT/UPDATE 권한.
  - 브라우저 클라이언트가 Supabase Auth 세션을 유지: `lib/supabase/client.ts:26-37` (`persistSession: true`).
  - `store_products` 에 상태 전이 보호 트리거 없음 (트리거는 `set_updated_at` 만).
- **영향**: 관리자 판매 차단·검수 반려·판매 승인(`store_sales_permissions`) 정책 무력화, 위반 상품 노출·주문 가능(주문 RPC 는 `product_status='active'` 만 확인). 운영 데이터에 API 검증을 통과할 수 없는 행 존재(active+썸네일 없음 1, active+섹션 없음 2, active+재고추적 재고0 1) — 원인 경로는 NOT_PROVEN(구버전 코드 가능).
- **심각도**: **P0** (major authz bypass)
- **현행/기대**: 현행 — DB 가 오너 직접 쓰기 허용. 기대 — 쓰기는 서버 API(service role) 전용, 클라이언트 역할은 SELECT 만.
- **수정 설계**: 마이그레이션: `REVOKE INSERT, UPDATE, DELETE ON public.store_products, public.store_menu_sections FROM anon, authenticated;` + `store_products_owner_all` 을 SELECT 전용 owner 정책으로 교체(`store_menu_sections_*_owner` INSERT/UPDATE/DELETE 정책도 동일 검토). 직접 쓰기 사용처가 없는지 `grep from("store_products")` (클라이언트 tsx 사용 0 확인함). 방어 심층화로 `admin_review_status`/`blocked` 전이를 막는 BEFORE UPDATE 트리거(`auth.role() <> 'service_role'` 시 거부) 추가 가능.
- **연동 영향**: 관리자 화면이 브라우저 클라이언트로 직접 쓰는 경로가 있으면 영향 → 확인 필요(관리자 API 는 service role 사용: `admin/store-products/[productId]/route.ts:65`).
- **검증 방법**: 마이그레이션 후 `has_table_privilege('authenticated','public.store_products','UPDATE') = false`; 스테이징이 아닌 로컬 DB 에서 오너 JWT 로 PATCH → 401/403.
- **Owner 승인 필요**: 운영 DB 권한 변경(마이그레이션 적용).
- **증명 상태**: DB 증거 PROVEN / 실제 PostgREST 호출 재현 NOT_PROVEN(쓰기 금지).
- **범위 밖 관찰(보고만)**: 같은 패턴이 `stores` 에도 있음 — 정책 `stores_update_owner_or_admin`(UPDATE, WITH CHECK 없음) + authenticated 가 `approval_status`, `is_visible`, `point_commerce_blocked` 컬럼 UPDATE 권한 보유(SQL). 오너 자가 승인/차단 해제 가능성 → 매장 관리 도메인 감사에서 별도 확인 필요.

### PRD-03 · 관리자 검수 반려 상품을 "내용 수정 → 상태 active" 2단계로 재검수 없이 판매 재개
- **영역**: 업무(관리자↔오너 상태 정합)
- **증상**: 반려(`admin_review_status='rejected'`, `product_status='hidden'`) 상품을 오너가 수정 저장하면 `admin_review_status='pending'` 이 되고, 다음 PATCH 로 `product_status='active'` 가 허용된다. UI 토스트는 "승인 후 판매할 수 있습니다" 라고 안내.
- **원인**: `app/api/me/stores/[storeId]/products/[productId]/route.ts:409-415` 는 **변경 전 행이 `rejected` 일 때만** active/sold_out 차단; 같은 파일 `477-484` 가 수정 시 `pending` 으로 바꿈 → 이후 요청에서는 차단 조건 미충족. 구매자 메뉴 RPC `get_store_menus_snapshot` 은 `product_status IN ('active','sold_out')` 만 필터(admin_review_status 미확인, SQL), 주문 RPC·`validate-store-order-checkout.ts:219-224` 도 미확인. UI 문구: `OwnerProductsHubClient.tsx:275-281`.
- **영향**: 관리자 반려(DEF-65) 무력화 — 부적합 상품 판매.
- **심각도**: **P1** (관리자 통제 우회, 금전 직접 손실 없음)
- **기대 동작**: `admin_review_status IN ('rejected','pending')` 인 경우 오너의 active/sold_out 전환 차단(관리자 `approve_review`/`activate` 후에만).
- **수정 설계**: 409행 조건을 `["rejected","pending"].includes(prev.admin_review_status)` 로 확장(단 `pending` 이 신규 등록 검수 대기 의미로도 쓰이는지 Owner 결정). 방어로 메뉴 RPC·주문 RPC 에 `admin_review_status <> 'rejected'` 추가 검토(주문 RPC 는 HARD LOCK — reopen 필요).
- **연동 영향**: 현재 운영에 pending/rejected 상품 0건(SQL) → 데이터 영향 없음.
- **검증 방법**: 단위테스트 — rejected→PATCH(title)→PATCH(active) 시 403.
- **Owner 승인 필요**: `pending` 상태 판매 허용 여부 정의.
- **증명 상태**: 코드 PROVEN / 런타임 NOT_PROVEN.

### PRD-04 · 관리자 "가격 수정"·오너 `discount_price` 직접 경로가 할인가를 재계산·검증하지 않음
- **영역**: 가격/할인 (금전)
- **증상**: 관리자 `correct_price` 는 `price` 만 바꾸고 `discount_price`/`discount_percent` 를 유지한다. 예: 정가 100·10%(할인가 90) 상품을 관리자가 200 으로 정정 → 할인가 90 유지 → 구매자는 90(실질 55% 할인) 결제, 화면 할인율 표기(10%)와 불일치. 반대로 가격 인하 시 할인가 ≥ 정가가 되면 할인이 조용히 사라짐.
- **원인**: `lib/stores/admin-store-product-ops.ts:133-145` (price 만 patch). 주문 단가는 `discount_price < price` 이면 할인가 사용 (`validate-store-order-checkout.ts:100-104`, RPC `v_live_base`). DB CHECK 은 `discount_price >= 0` 만 (`store_products_discount_price_check`), `discount_price <= price` 없음. 오너 POST `discount_price` 직접 경로도 가격 대비 미검증(`products/route.ts:253-256`), PATCH 동일(`[productId]/route.ts:230-242`) — 오너 폼은 항상 `discount_percent` 를 보내므로 UI 경로는 정상(`OwnerProductForm.tsx:504-522`).
- **영향**: 매장 매출 손실/과소 청구, 수수료 기준액(`commission_base_amount`) 동반 감소. 오너 UI 표시와 실제 결제가 불일치.
- **심각도**: **P1** (관리자 조치로 발생하는 금액 불일치; 운영 현재 불일치 0건 — SQL `pct_mismatch=0, disc_ge_price=0`)
- **기대 동작**: 가격 변경 시 `discount_percent` 가 있으면 `discountPriceFromPercent` 로 재계산, 없고 `discount_price` 만 있으면 `discount_price < price` 검증 또는 null 처리.
- **수정 설계**: `buildAdminStoreProductPatch("correct_price")` 에 현재 `discount_percent` 를 입력받아 `discount_price` 재계산(라우트 70-74 에서 이미 행 조회 → select 에 `discount_percent` 추가). DB 에 `CHECK (discount_price IS NULL OR discount_price < price OR price = 0)` 추가 검토(기존 데이터 0건 위반).
- **연동 영향**: 구매자 장바구니 단가 변경 → `price_changed` 로 1회 재확인 필요(정상 fail-closed).
- **검증 방법**: 단위테스트 `admin-store-product-ops` correct_price 시 discount_price 재계산.
- **Owner 승인 필요**: DB CHECK 추가(운영 DB 변경).
- **증명 상태**: 코드 PROVEN.

### PRD-05 · 숨김 카테고리(`store_menu_sections.is_hidden`) 상품이 상세 API·주문 API 로는 노출·주문 가능
- **영역**: 판매중지/노출 정합
- **증상**: 메뉴판에서만 숨겨지고, 상품 상세(`/api/stores/products/{id}`)·재주문·직접 POST `/api/me/store-orders` 로 주문 가능.
- **원인**: 메뉴 조립에서만 필터 `lib/stores/store-menus-catalog-assemble.ts:70-76`. 상세 API 는 `product_status IN (active,sold_out)` 만 (`app/api/stores/products/[productId]/route.ts:41-52`), 체크아웃 검증·RPC 는 섹션 미조회 (`validate-store-order-checkout.ts:193-224`, RPC Pass1).
- **영향**: 오너가 "카테고리 숨김"을 판매중지로 사용할 경우 의도치 않은 주문 접수.
- **심각도**: **P2** (운영 현재 숨김 섹션 0건 — 잠재)
- **기대 동작**: 숨김 섹션 상품 = 판매 불가(product_not_available).
- **수정 설계**: 체크아웃 상품 select 에 `store_menu_sections(is_hidden)` 추가 후 `product_not_available`; 상세 API 동일. (RPC 재검증까지 넣으려면 HARD LOCK reopen.)
- **연동 영향**: 장바구니 담긴 해당 상품은 결제 시 거부 → 오류 문구 필요.
- **검증 방법**: 단위테스트 checkout — hidden section product 거부.
- **Owner 승인 필요**: "카테고리 숨김" 의미(표시만 vs 판매중지) 결정.
- **증명 상태**: 코드 PROVEN.

### PRD-06 · 주문 취소 재고복원이 **수동 품절(오너·관리자)** 을 자동으로 판매중으로 되돌림
- **영역**: 재고/품절/판매중지
- **증상**: 재고추적 상품을 오너가 수동 `sold_out`(재료 소진 등) 또는 관리자가 `sold_out` 조치한 뒤, 과거 주문이 취소되면 `restore_store_order_stock_atomic` 가 `product_status='sold_out' AND stock>0` → `'active'` 로 변경.
- **원인**: SQL 함수 정의 `restore_store_order_stock_atomic` — `CASE WHEN p.product_status = 'sold_out' AND (p.stock_qty + v_line.qty) > 0 THEN 'active'`. 자동 품절(주문 RPC 가 재고 0 에 설정)과 수동 품절을 구분하는 컬럼 없음.
- **영향**: 판매중지한 메뉴가 고객에게 다시 주문 가능 → 매장 수락 불가/취소 증가.
- **심각도**: **P2**
- **기대 동작**: 자동 품절(재고 소진)만 복원 시 해제.
- **수정 설계**: `store_products.sold_out_reason text CHECK IN ('stock','manual','admin')` 추가; 주문 RPC Pass2 에서 `'stock'` 설정, 오너/관리자 sold_out 시 `'manual'/'admin'`; 복원 함수는 `sold_out_reason='stock'` 일 때만 active 전환. (Recovery Chain HARD LOCK reopen 필요.)
- **연동 영향**: Recovery Chain·주문 RPC 동시 변경 → `verify:delivery-product-hard-lock` 갱신.
- **검증 방법**: runtime matrix 에 "수동 품절 + 취소" 케이스 추가.
- **Owner 승인 필요**: HARD LOCK reopen, DB 마이그레이션.
- **증명 상태**: DB 함수 PROVEN / 런타임 NOT_PROVEN.

### PRD-07 · 오너 상품 수정이 낙관적 동시성 제어 없이 재고·상태를 통째로 덮어씀 (주문 감산·관리자 조치 유실)
- **영역**: 동시성/재고
- **증상**: 폼 로드(재고 5, active) → 그 사이 주문으로 재고 0·sold_out → 오너가 상품명만 고쳐 저장 → 폼이 `stock_qty:5, product_status:'active'` 를 전송해 재고·상태 부활(과판매).
- **원인**: 폼은 항상 전체 payload 전송 (`OwnerProductForm.tsx:510-528` — `stock_qty`, `product_status` 포함, 616-621 PATCH). 서버는 `updated_at` 비교 없이 `.update(patch).eq(id).eq(store_id)` (`[productId]/route.ts:486`). 관리자 측은 CAS 있음(`admin/store-products/[productId]/route.ts:97-111`) — 비대칭.
- **영향**: 실재고 초과 주문 → 매장 거절/취소, 구매자 불만.
- **심각도**: **P2**
- **기대 동작**: 로드 시점 `updated_at` 을 `If-Match`/`expected_updated_at` 로 보내 불일치 시 409 + 재로딩; 또는 변경된 필드만 전송.
- **수정 설계**: PATCH 바디에 `expected_updated_at` 허용, `.eq("updated_at", expected)` 조건부 업데이트 후 0행이면 `409 product_changed`. 폼은 dirty 필드만 전송(stock/status 미변경 시 생략).
- **연동 영향**: 허브 퀵 토글(`patchProduct`)은 단일 필드라 영향 적음.
- **검증 방법**: 단위테스트 — expected_updated_at 불일치 409.
- **Owner 승인 필요**: 없음.
- **증명 상태**: 코드 PROVEN / 런타임 NOT_PROVEN.

### PRD-08 · 오너 상품·카테고리 변경의 구매자 캐시 무효화가 처리 인스턴스 로컬 메모리에만 적용
- **영역**: 오너 변경 → 구매자 화면 반영
- **증상**: 오너 가격·품절·숨김 변경 후 다른 서버리스 인스턴스는 메뉴 메모리 캐시를 soft 15s / hard 60s 까지 이전 값으로 응답. (가격은 체크아웃에서 `price_changed` 로 막히므로 금전 손실은 없음, 품절 표시·가격 표시 지연.)
- **원인**: 오너 라우트는 `invalidateStoreMenusSnapshotCacheByStoreId` 만 호출 (`products/route.ts:428-429`, `[productId]/route.ts:521-522`, `menu-sections` 131/114/161) → 내부적으로 로컬 Map 무효화 + DB counter refresh 예약 (`store-menus-snapshot-invalidate-by-store-id.ts:9-24`, `store-menus-snapshot-cache.ts:8-13`). 인스턴스 공통 세대 bump `bumpStorePublicSharedCacheGeneration` 은 **관리자 라우트만** 호출 (grep 결과: admin/* 7곳, 오너 0곳; 정의 `store-public-shared-cache-generation.ts:92-101`). TTL: `store-menus-public-server-cache.ts:13-14`.
- **영향**: 구매자에게 품절 메뉴가 주문 가능처럼 보임 → 결제 단계 실패, 가격 표시 불일치.
- **심각도**: **P2**
- **기대 동작**: 관리자 변경과 동일하게 ≤2s 인스턴스 공통 반영.
- **수정 설계**: 오너 상품/섹션 쓰기 성공 후 `bumpStorePublicSharedCacheGeneration("owner_product.*")` 호출(전역 purge 비용이 크면 store 단위 tag `store-menus:{storeId}` 로 세분화). 주문 RPC 가 `sold_out_products` 를 반환할 때도 동일 무효화 필요(주문 라우트 — 범위 경계).
- **연동 영향**: 전역 purge 빈도 증가 → 홈/브라우즈 캐시 히트율 하락 가능(성능 트랙 확인 필요).
- **검증 방법**: 2 인스턴스 시나리오는 로컬 증명 불가 → Production 관찰 NOT_PROVEN.
- **Owner 승인 필요**: 성능 영향 수용 여부.
- **증명 상태**: 코드 PROVEN / 운영 지연 실측 NOT_PROVEN.

### PRD-09 · 오너 상품 목록 캐시(30s)가 주문 재고 감산·관리자 조치·카테고리 삭제로 무효화되지 않음
- **영역**: 오너 UI 정합
- **증상**: 오너 허브가 최대 30s 동안 이전 재고/상태/검수상태를 표시, 해당 값으로 퀵 토글 시 잘못된 판단.
- **원인**: `OWNER_PRODUCTS_LIST_CACHE_TTL_MS = 30_000` (`owner-products-list-snapshot.ts:59`), invalidate 호출은 오너 POST/PATCH 뿐(grep). 관리자 라우트(`admin/store-products/[productId]/route.ts:113-120`), 카테고리 삭제(`menu-sections/[sectionId]/route.ts:161` — owner list 미무효화), 주문 생성/취소 경로 미호출. 또한 globalThis Map 이라 인스턴스 로컬.
- **심각도**: **P2**
- **수정 설계**: 관리자 상품 PATCH·섹션 PATCH/DELETE 에 `invalidateOwnerProductsListCache(storeId)` 추가; 재고/상태는 TTL 단축 또는 updated_at 기반 조건부 응답.
- **검증 방법**: `verify:owner-products-perf` 의 invalidate 단계에 관리자/섹션 케이스 추가.
- **Owner 승인 필요**: 없음 (perf lock 문서 갱신 필요).
- **증명 상태**: 코드 PROVEN.

### PRD-10 · 재고 0 으로 수정해도 상태가 active 로 남아 구매자에게 주문 가능 표시
- **영역**: 재고/품절
- **증상**: `track_inventory=true`, `stock_qty=0`, `product_status='active'` 저장 허용 → 메뉴에는 판매중, 결제 시 `insufficient_stock`.
- **원인**: PATCH/POST 가 재고 0 과 상태를 연동하지 않음 (`[productId]/route.ts:243-252, 396-417`); 자동 sold_out 은 주문 감산 시에만(RPC Pass2). 운영 SQL: active+재고추적+재고0 = 1건.
- **심각도**: **P3** (UX/주문 실패, 금전 영향 없음)
- **수정 설계**: 저장 시 `track_inventory && stock_qty==0 && status=='active'` → `sold_out`(사유 stock) 자동 전환 또는 400 `stock_zero_active`.
- **증명 상태**: 코드+운영 데이터 PROVEN.

### PRD-11 · 카테고리 정렬 저장이 N개 병렬 PATCH 로 비원자적
- **영역**: 노출 순서
- **증상**: 일부 PATCH 실패 시 UI 는 이전 순서로 롤백하지만 서버엔 부분 반영 → 화면·실제 순서 불일치.
- **원인**: `OwnerMenuCategoriesClient.tsx:307-340` (`Promise.all` per-section PATCH, 실패 시 `setSections(previous)` 만).
- **심각도**: **P3**
- **수정 설계**: `PUT /api/me/stores/{id}/menu-sections/order` (id 배열) → 단일 SQL `UPDATE ... FROM unnest(...) WITH ORDINALITY`.
- **증명 상태**: 코드 PROVEN.

### PRD-12 · 오너 목록 정렬과 구매자 메뉴 정렬 기준 불일치
- **영역**: 노출 순서
- **원인**: 오너 `is_featured DESC, sort_order, created_at DESC` (`owner-products-list-snapshot.ts:220-223`) vs 구매자 `section sort, sort_order, title(ko)` (`lib/stores/group-store-products-by-menu.ts:186-192`).
- **영향**: 오너가 보는 순서 ≠ 고객 메뉴 순서 → 순서 편집 혼란.
- **심각도**: **P3**
- **수정 설계**: 오너 허브 정렬을 구매자 SSOT 함수(`sortStoreDetailProductCardsForDisplay`)와 동일하게.
- **증명 상태**: 코드 PROVEN.

### PRD-13 · 카테고리 삭제 시 소속 상품이 판매중인 채 "기타 메뉴" 로 이동 — 안내 없음
- **영역**: 카테고리 삭제/업무
- **원인**: FK `store_products_menu_section_id_fkey ... ON DELETE SET NULL` (SQL), 확인 문구는 "「{v1}」 카테고리를 삭제할까요?" 만 (`lib/i18n/catalog/business.ts:524`), 구매자 조립은 섹션 없는 상품 포함(`store-menus-catalog-assemble.ts:73-75`). 이후 그 상품 수정 시 `menu_section_id_required` 강제(`[productId]/route.ts:332-335`).
- **심각도**: **P3**
- **수정 설계**: DELETE 전 소속 상품 수 조회 → 0 이 아니면 409 `section_has_products` 또는 이동 대상 섹션 지정 필수.
- **증명 상태**: 코드+DB PROVEN.

### PRD-14 · 옵션 그룹 내 동일 옵션명 허용 — 주문 검증은 이름으로 첫 항목 매칭
- **영역**: 옵션
- **원인**: 오너 검증기 이름 중복 미검사(`owner-product-options-validate.ts:113-157`), 주문 검증 `g.options.find((o) => o.name === name)` (`lib/stores/modifiers/validate.ts:208`) — 같은 이름·다른 추가금이면 두 번째 옵션 선택이 첫 번째 가격으로 계산되거나 `price_changed` 로 주문 실패. 그룹 id 중복도 미검사(같은 `pick[key]` 가 두 그룹에 적용).
- **운영**: 중복명 그룹 1건(hidden 상품, 추가금 동일) — SQL.
- **심각도**: **P3**
- **수정 설계**: 검증기에 그룹 id·옵션명(그룹 내) 유일성 추가 + 주문 wire 를 item key 기반으로 전환(장기).
- **증명 상태**: 코드 PROVEN.

### PRD-15 · 입력 상한·세션 가드·오류 원문 노출 등 서버 검증 일관성 부족
- **영역**: 검증/오류 메시지
- **내용**:
  1. 상품명·요약 길이 상한 없음(POST `products/route.ts:223-226,392`; PATCH 181-188) — 섹션명은 80자 제한, 관리자 상품명 120자 제한(`admin-store-product-ops.ts:122`)과 불일치.
  2. 가격·옵션 추가금 상한 없음(`products/route.ts:228-231`, `owner-product-options-validate.ts:127-133`) — `stock_qty` 가 int 범위 초과 시 DB 에러.
  3. DB 에러 `message` 원문을 클라이언트에 반환 (`products/route.ts:425`, `[productId]/route.ts:490`, `menu-sections/route.ts:128`, `[sectionId]/route.ts:111,158`).
  4. POST 는 `validateActiveSession`+`requirePhoneVerified` (`products/route.ts:192-195`) 인데 PATCH·섹션 CRUD·업로드는 미적용(`[productId]/route.ts:130-133`, `menu-sections/*`, `upload-image/route.ts:26-29`).
  5. 상품 POST 멱등키 없음 — 재시도/더블탭 시 중복 상품(폼 `saving` 상태로만 방지).
  6. 사장님 추천 6개 제한 count→insert 비원자(`products/route.ts:375-387`, `[productId]/route.ts:443-455`).
  7. 오너 목록 API 가 `cursor` 를 받지만 쿼리에 미적용(`owner-products-list-snapshot.ts:195-223`) — 현재 클라 미사용, 잠재 무한 동일 페이지.
- **심각도**: **P3**
- **수정 설계**: 공용 `validateOwnerProductFields` (title≤120, summary≤500, price≤10,000,000, priceDelta≤1,000,000, stock≤999,999) 를 POST/PATCH 공용 사용; 500 응답은 `error: "db_error"` 고정 + 서버 로그; 오너 쓰기 라우트 가드 통일; POST `client_request_id` + unique index(선택).
- **증명 상태**: 코드 PROVEN.

### PRD-16 · 업로드 후 저장 실패 시 Storage 고아 객체
- **영역**: 이미지
- **원인**: 폼이 파일을 먼저 업로드(`OwnerProductForm.tsx:536-555`) 후 POST/PATCH; 실패·취소 시 업로드 객체 정리 없음(`upload-image/route.ts:21` "DB 미갱신"). soft delete 상품(운영 50건)도 이미지 유지(설계상 `canonical-image-lifecycle.server.ts:4-5`).
- **심각도**: **P3** (비용·정리 문제)
- **수정 설계**: 주기적 GC(store-product-images/{storeId}/ 중 어떤 행에서도 참조 안 되는 24h 경과 객체 삭제) — PRD-01 의 소유 경로 규칙 재사용.
- **증명 상태**: 코드 PROVEN / 고아 수량 NOT_PROVEN (storage.objects 집계 미실행).

---

## 4. 누락 기능 (배민·요기요·쿠팡이츠 오너 기능 대비 — 설계 제안, 결함 아님)
1. **메뉴 복사/복제** (옵션·이미지 포함) — 현재 없음.
2. **옵션 그룹 라이브러리(공용 옵션 그룹)** — `templateGroupId` 필드만 존재(`owner-product-options-json.ts:35`), 테이블·UI 없음. 옵션 일괄 품절(예: "치즈" 전 메뉴 품절) 불가.
3. **"오늘만 품절"/자동 재개 시각, 시간대별 판매(점심 메뉴)** — 없음.
4. **최소/최대 주문수량 편집** — DB 컬럼·체크아웃 검증은 있으나 오너 API/UI 없음.
5. **세금(VAT) 포함/별도, 판매 단위(인분·g)** — 컬럼 없음(필리핀 VAT 표시 정책 필요).
6. **기간 한정 할인(시작·종료)** — 할인율 상시 적용만.
7. **메뉴 일괄 편집(가격 일괄 변경·일괄 숨김·드래그 정렬)** — 상품 드래그 정렬 없음(섹션만).
8. **변경 이력(가격·품절 변경 로그)** — 오너 쓰기 감사 로그 없음(관리자만 `appendAdminRouteAudit`).
9. **메뉴 검수 상태 가시화(신규 상품 검수 요청 흐름)** — `admin_review_status` 기본 `none`, 오너 측 요청 버튼 없음.
10. **이미지 크롭/정렬 가이드, 대표 이미지 비율 강제** — 권장 512px 안내만.

---

## 5. SSOT 표

| 데이터 | 권위 소스 | 이탈 소비자 |
|---|---|---|
| 상품 판매 가능 여부 | `store_products.product_status='active'` + `store_sales_permissions` (`create_store_order_atomic`) | 메뉴 숨김 섹션(`store-menus-catalog-assemble.ts:70-76`)은 표시만; `admin_review_status` 는 어떤 판매 경로에서도 미반영(PRD-03) |
| 판매 단가 | `price`, `discount_price`(< price 일 때) — `productUnitPrice` / RPC `v_live_base` | `discount_percent` 는 표시용 파생값인데 관리자 가격수정 시 비동기(PRD-04); 장바구니 `resolveCartLineListUnitPhp` 는 percent 역산 |
| 옵션 정의 | `store_products.options_json` → `modifiers/parse-json.ts` | 오너 검증기는 `optionsJsonToFormGroups` 로 변환 후 검증(`required` 추론 규칙 상이: `minN>=1` 포함) — 저장은 raw 원본 |
| 주문 라인 금액·명칭 | `store_order_items.*_snapshot`, `store_order_item_options` | 없음(오너 상세 RPC 미조인 — PASS) |
| 재고 | `store_products.stock_qty`(RPC 감산·복원 함수) | 오너 PATCH 절대값 SET(PRD-07), 복원 시 수동 품절 해제(PRD-06) |
| 품절 사유 | **없음** | 자동/수동/관리자 구분 불가 |
| 메뉴 노출 순서 | 구매자: `sortStoreDetailProductCardsForDisplay` | 오너 허브 정렬(PRD-12) |
| 상품 이미지 소유 | 업로드 경로 `store-product-images/{storeId}/uuid` | 저장/삭제 시 경로 미검증(PRD-01) |
| 구매자 메뉴 캐시 세대 | `store-public-shared-cache-generation`(관리자) | 오너 쓰기는 로컬 무효화만(PRD-08) |
| 쓰기 권한 | 서버 API(service role) | DB RLS 가 오너 직접 쓰기 허용(PRD-02) |

---

## 6. 기존 문서와 구현 차이
1. `docs/dibay-delivery-product-hard-lock.md` §1 "TX revalidation for stock/price/sold-out/open" — RPC 는 가격·재고·상태·`is_open` 플래그는 재검증하나 **숨김 섹션·검수 상태**는 대상 아님(문서 범위 밖이나 판매중지 의미 공백). Recovery Chain 이 수동 품절을 해제(PRD-06) — 문서에 품절 사유 개념 없음.
2. `docs/store-owner-products-perf-lock.md` "PATCH/POST 후 첫 GET `products_list_cache_hit=0`" — 동일 인스턴스에서만 성립(globalThis). 관리자 조치·주문 재고 변경·섹션 삭제 후 무효화는 문서/코드 모두 없음(PRD-09).
3. `lib/stores/store-public-shared-cache-generation.ts:6-21` 주석은 "매장·상품·쿠폰 관리자 변경" 만 대상 — 오너 상품 변경은 동일 문제(인스턴스별 stale)를 가지나 미적용(PRD-08).
4. `app/api/me/stores/[storeId]/upload-image/route.ts:144` 오류 문구가 `20260322213000_storage_store_product_images_bucket.sql`(또는 `20250320210000`) 마이그레이션을 안내하나 저장소 `supabase/migrations/` 에 해당 파일 없음(grep). 버킷 정의·`store_products` 기본 테이블 생성 마이그레이션도 저장소에서 확인 불가(스키마 권위 출처 불명확).
5. `lib/media/canonical-image-lifecycle.server.ts` 는 "SOFT DELETE entities retain storage objects" 계약만 기술, **삭제 대상 소유 검증** 계약 없음 — 프로필은 별도 D1 가드로 보강됐으나 상품·배너·공지는 미보강(PRD-01).
6. `OwnerProductsHubClient.tsx:275-281` 안내("승인 후 판매") ≠ 서버 동작(PRD-03).
7. `docs/dibay-stores-product-recovery-contract.md` 는 HOME/CATEGORY 진열 계약으로 상품 CRUD 와 직접 충돌 없음.

---

## 7. Owner 정책 결정 필요 사항
1. **DB 권한 축소 승인**(PRD-02): `store_products`/`store_menu_sections` 클라이언트 쓰기 권한 회수 마이그레이션 적용. (범위 밖이나 `stores` 오너 UPDATE 정책도 동반 검토 권고.)
2. **외부 이미지 URL 허용 여부**(PRD-01): 자사 버킷 + 자기 매장 경로만 허용할지.
3. **검수 상태 의미**(PRD-03): `pending` 상품 판매 허용 여부, 신규 상품 사전 검수 도입 여부.
4. **관리자 hide/sold_out 의 고정성**: 현재 관리자 `hide`·`sold_out`·`archive` 는 오너가 즉시 되돌릴 수 있음(`[productId]/route.ts:396-417` 은 `blocked` 만 잠금) — 관리자 조치를 잠금으로 볼지.
5. **카테고리 숨김 의미**(PRD-05): 표시만 vs 판매중지.
6. **품절 사유 도입 + HARD LOCK reopen**(PRD-06): Recovery Chain/주문 RPC 변경 승인.
7. **할인 무결성 DB CHECK**(PRD-04) 및 가격·추가금 상한값(PRD-15).
8. **세금(VAT)·단위 표기 정책**(누락 4-5).
9. **오너 변경 캐시 전역 bump 의 성능 영향 수용**(PRD-08).

---

### 심각도 집계
| P0 | P1 | P2 | P3 | 합계 |
|---|---|---|---|---|
| 2 (PRD-01, 02) | 2 (PRD-03, 04) | 5 (PRD-05, 06, 07, 08, 09) | 7 (PRD-10~16) | 16 |
