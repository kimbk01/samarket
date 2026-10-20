# LOC — 매장 위치 / 배달 주소 / 배달 가능 지역(Service Area) 감사

- 기준 트리: `8c151baa97a6b83a3aa28dd674f416cfbfdea187` (2026-10-20)
- 운영 DB: `ckdosyydvgzqwpbwuhon` — 읽기 전용 SELECT(카탈로그·집계)만 수행. 개인정보 컬럼 조회 없음.
- 증거 구분: **CODE**(file:line) / **DB**(카탈로그·집계 SQL 결과) / **RUNTIME**(로그인 실행, 본 감사에서는 전부 NOT_PROVEN)
- 참고: `docs/dibay-delivery-address-service-area-final-ssot-hard-lock.md` 의 HARD LOCK「Change gate」가 적용되는 영역이다. 이 문서는 **감사 보고만** 하며, 수정 설계는 "regression only on the touched invariant" 원칙에 맞춰 작성했다.

---

## 1. 범위 및 조사 대상 목록

### 1.1 문서 (4)
| # | 문서 |
|---|---|
| 1 | docs/dibay-delivery-address-service-area-final-ssot-hard-lock.md |
| 2 | docs/dibay-address-platform-hard-lock.md |
| 3 | docs/ph-address-redesign-manual-checklist.md |
| 4 | supabase/migrations/20270103120000_delivery_service_area_v2_regional_lgu.sql (Service Area V2 정의) |

### 1.2 API 라우트 (11)
| # | 라우트 | 역할 |
|---|---|---|
| 1 | app/api/me/store-orders/route.ts (POST) | 주문 생성 + 서버측 배달 가능 판정 |
| 2 | app/api/me/stores/[storeId]/route.ts (PATCH) | Owner 매장 주소·좌표·반경·배달 ON/OFF |
| 3 | app/api/me/stores/[storeId]/delivery-service-areas/route.ts (GET/PUT/POST) | Owner V2 LGU 지역 편집·V2 활성화 |
| 4 | app/api/admin/stores/[id]/route.ts (`set_store_location`/`set_delivery_radius`/`set_store_delivery_distance`) | Admin 위치·반경·매장 거리 정책 |
| 5 | app/api/admin/stores/[id]/delivery-service-areas/route.ts | Admin V2 지역 편집 |
| 6 | app/api/admin/delivery/settings/route.ts | 전역 거리 정책·매장 override·라이더 위치 토글 |
| 7 | app/api/stores/[slug]/delivery-serviceability/route.ts | 상세·장바구니 판정 API |
| 8 | app/api/stores/home-feed/route.ts | HOME 판정 |
| 9 | app/api/me/stores/[storeId]/orders/[orderId]/route.ts | Owner 주문 상세(구매자 주소 노출) |
| 10 | app/api/me/rider/location/route.ts | 라이더 자기 위치 업로드 |
| 11 | app/api/webhooks/delivery-rider-location/route.ts | 외부 라이더 위치 웹훅 |

### 1.3 lib (28)
`lib/delivery/service-area/{evaluate-delivery-service-area, authority, load-store-service-area-runtime-map, store-delivery-service-areas, resolve-member-canonical-lgu}.ts`,
`lib/delivery/{evaluate-delivery-serviceability, load-delivery-serviceability-runtime, delivery-ops-settings, store-delivery-radius, delivery-list-oor-policy, store-order-serviceability-snapshot-ready}.ts`,
`lib/delivery/search/search-delivery.ts`,
`lib/stores/{build-store-location-patch, store-location-patch-consistency, after-canonical-store-location-write, sync-store-orders-checkout-geo, store-list-delivery-origin, stores-browse-build, fetch-store-delivery-serviceability-client, delivery-ordering-eligibility, validate-store-order-checkout, owner-product-gate, compute-store-order-checkout-eta-snapshot, browse-list-user-origin-coords, store-order-delivery-service}.ts`,
`lib/stores/discovery/resolve-discovery-oor-with-service-area.ts`,
`lib/addresses/{delivery-routable-address, pick-address-row-for-delivery-routing}.ts`

### 1.4 UI (5)
`components/business/OwnerStoreBasicInfoForm.tsx`, `components/business/OwnerDeliveryServiceAreaEditor.tsx` + `components/delivery/DeliveryServiceAreaEditorCore.tsx`, `components/stores/StoreCommerceCartPageClient.tsx`, `components/stores/StoreDetailPublic.tsx`, `components/stores/StoreProductPublic.tsx`

### 1.5 DB (운영 카탈로그로 확인)
- 테이블 9: `stores`, `store_orders`, `store_delivery_service_areas`, `user_addresses`, `admin_settings`, `store_delivery_coverage`, `delivery_riders`, `store_order_deliveries`, `store_products`
- 함수 3: `create_store_order_atomic`(SECURITY DEFINER, authenticated/anon EXECUTE 없음), `store_charged_delivery_fee_php`, `stores_compute_location_geog`(generated column `stores.location_geog`)
- 트리거 8 (stores/store_orders/user_addresses): `stores_updated_at`, `stores_ensure_sales_perm`, `trg_stores_first_listed_at`, `store_orders_updated_at`, `trg_store_orders_cash_order_gate`, `trg_store_orders_commission_lifecycle`(**disabled 'D'**), `trg_store_orders_gift_revenue_recognition`, `user_addresses_updated_at`
- RLS 정책 10 (stores 4, store_orders 2, user_addresses 4), 컬럼 권한(stores: anon/authenticated 69개 컬럼 전부 INSERT/UPDATE)
- CHECK 제약: `stores_delivery_radius_km_positive`, `stores_delivery_service_area_authority_check`, `store_orders_fulfillment_type_check`, `store_orders_order_status_check`; 인덱스 `user_addresses_one_master`

**합계: 문서 4 · API 11 · lib 28 · UI 5 · 테이블 9 · 함수 3 · 트리거 8 · RLS 10 = 78**

### 1.6 운영 DB 집계 결과 (근거로 인용)
| 항목 | 값 |
|---|---|
| `admin_settings.delivery_distance_policy` | `{"enabled":true,"source":"straight","defaultMaxKm":60,"overDistanceBehavior":"deprioritize"}` (updated 2026-08-22) |
| `delivery_store_distance_overrides.stores` | 1건, mode=`enabled` |
| `delivery_rider_location_enabled` | 행 없음(=false) |
| stores 전체 | 17 — 전부 `legacy_radius` |
| approved·visible·**delivery_available=true** | 11, 그중 **lat/lng NULL 9** |
| delivery_radius_km 범위 (delivery 11) | 10 ~ 60 km |
| `store_delivery_service_areas` | 8 rows (V2 활성 매장 0) |
| store_orders local_delivery | 639 — `checkout_serviceability_*` **639건 전부 NULL**, `checkout_store_latitude` 639건 NULL |
| local_delivery 주문 중 현재 매장 반경 초과 직선거리 | 43건(정책 활성 2026-08-22 이후 4건, 최대 11.12km; 해당 매장 이후 수정됨 → 판정 불가) |
| local_delivery `delivery_fee_amount>0` | 0건 / pickup `delivery_fee_amount>0` 19건(2026-08-08 02:04~02:18, 합계 950) |
| user_addresses | 177, `canonical_lgu_id` 보유 6, 좌표 없음 0, PH bbox 밖 0 |
| delivery_riders | 0 / store_order_deliveries 2 (rider 0, proof 좌표 0) |
| store_delivery_coverage | 15 rows, 반경 불일치 3, coverage 없는 매장 2 |

---

## 2. 기능별 현황표

| 기능 | UI | API | DB | 업무 | 운영 | 판정 | 근거 |
|---|---|---|---|---|---|---|---|
| 매장 주소·좌표 입력(Owner) | 좌표 = 십진수 텍스트 입력 2칸(지도 핀 없음) | PATCH 일관성 검사(Policy A) | lat/lng CHECK 없음, 직접 UPDATE 가능 | 승인·감사 없음 | 9개 배달매장 좌표 없음 | **FAIL** | OwnerStoreBasicInfoForm.tsx:974-990, :735-768; app/api/me/stores/[storeId]/route.ts:268-301; DB 컬럼 권한 |
| 매장 위치 변경 권한(Owner/Admin) | Owner·Admin 모두 즉시 반영 | Owner: getStoreIfOwner+BLOCKED_APPROVAL / Admin: business 권한+감사 | RLS `stores_update_owner_or_admin` 컬럼 무제한 | Owner 변경 감사로그 없음 | — | **FAIL** (LOC-002, LOC-007) | route.ts:116-125, :334-405; admin/stores/[id]/route.ts:448-530 |
| 주소-좌표 정합성 | 저장 시 기존 좌표 자동 재전송 | identity 변경 시 좌표 동시 필수만 검사, 근접성·역지오코딩 검증 없음 | — | 주소만 바꾸면 핀은 옛 위치 | NOT_PROVEN(PII 비교 불가) | **FAIL** (LOC-007) | store-location-patch-consistency.ts:38-63; OwnerStoreBasicInfoForm.tsx:753-768 |
| 위치 변경 후 재계산 | — | afterCanonicalStoreLocationWrite + 진행 주문 ETA 재계산 | — | 라이브 재평가로 목록·상세·주문 반영 | NOT_PROVEN | PASS (코드) | after-canonical-store-location-write.ts:30-52; sync-store-orders-checkout-geo.ts:25-99 |
| 구매자 대표주소 = 최종 배달주소 | 체크아웃 master 자동 | master 외 주소 거부(`delivery_user_address_not_master`) | 주문 스냅샷 컬럼 | 일치 | — | PASS | app/api/me/store-orders/route.ts:522-532, :571-587 |
| 반경 계산(haversine, 기본 10km) | — | haversine only, NULL→10 | `delivery_radius_km>0` CHECK, 상한 없음 | — | 10~60km | PASS (상한은 정책 미정) | evaluate-delivery-serviceability.ts:1-12, store-delivery-radius.ts:12-48 |
| Service Area V2 (LGU) | Owner·Admin 동일 편집기 | Owner 라우트 **소유 검증 무력화** | 테이블 RLS on·권한 없음(서비스롤만) | V2 활성 0 | 8 rows | **FAIL** (LOC-001, LOC-006) | delivery-service-areas/route.ts:44-45,77-78,152-153 |
| HOME/BROWSE/SEARCH/ORDER NOW 동일 판정 | — | 모두 `evaluateDeliveryServiceArea`(직접/어댑터) + `resolveListDistanceOutOfRange` | — | 동일 함수 | NOT_PROVEN | PASS (코드) | home-feed/route.ts:352,578; stores-browse-build.ts:505; search-delivery.ts:443; resolve-discovery-oor-with-service-area.ts:86 |
| 장바구니 vs 최종 결제 동일 판정 | 장바구니·상세 = serviceability API | 주문 = 같은 evaluator | — | 경계 케이스 차이(0,0 / 좌표 없음) | — | PASS (경미 차이 LOC-010) | delivery-serviceability/route.ts:55-102; store-orders/route.ts:609-668 |
| 주문 생성 서버 강제 | — | 라우트에서 강제 | RPC는 authenticated EXECUTE 없음, store_orders INSERT 정책 없음 → 직접 우회 불가. DB 함수 자체는 위치 미검증 | 정책 OFF·설정 조회 실패 시 **fail-open** | 정책 enabled=true | **FAIL** (LOC-003) | delivery-ops-settings.ts:40-45,196-205; evaluate-delivery-serviceability.ts:57-59,86-95 |
| 주문 시 판정 스냅샷 | — | 플래그 false로 저장 생략 | 컬럼 존재 | 사후 분쟁 증거 없음 | 639/639 NULL | **FAIL** (LOC-004) | store-order-serviceability-snapshot-ready.ts:6; store-orders/route.ts:847-859 |
| 배달비 계산 | 매장 설정 고정금액·무료 기준 | DB 함수와 동일 | `store_charged_delivery_fee_php` 거리 무관 | 거리별 요금 없음 | delivery 주문 배달비 0건 | PASS(설계상 고정) / 거리요금 누락 | 함수 정의(SQL) |
| 배달 위치 표시·PII | Owner 주문상세 | 상태 무관 전체 반환 | RLS owner select 전체 컬럼 | 완료·취소 후 무기한 | — | **FAIL** (LOC-008) | orders/[orderId]/route.ts:217-224; pg_policies `store_orders_owner_select` |
| 실제 배달 주체·위치 원천 | — | 매장 자체/courier label, 라이더 모듈 존재 | delivery_riders 0 | 매장 자체 배달 | — | NOT_PROVEN(운영 실사용) | store-order-delivery-service.ts:8-38 |
| GPS 없음·권한 거부·지연 | 회원은 GPS 미사용(master 주소만) | 게스트 GPS는 판정 미반영 | — | 일관 | — | PASS | store-list-delivery-origin.ts:146-218; delivery-list-oor-policy.ts:27-39; lib/map/geolocation.ts:23-76 |
| 실시간 배달 추적 | 구매자·Owner 화면 없음(관리자 라이더 페이지만) | 라이더 위치 API·웹훅 존재 | delivery_riders.current_lat | — | 라이더 0 | **ABSENT(확인)** | grep `current_lat` → components/admin/delivery-riders 만 |

---

## 3. 결함 목록

### LOC-001 — Owner 배달지역(V2) API 소유자 검증 무력화 (IDOR)
- **영역**: API / 권한
- **증상**: 로그인한 아무 사용자가 **다른 매장의** 배달 LGU 목록을 조회·교체하고 `activateV2:true` 로 V2 권한 전환까지 할 수 있다.
- **원인**: `getStoreIfOwner()` 는 실패해도 `{ ok:false, status, error }` 객체를 반환한다(lib/stores/owner-product-gate.ts:16-28). 라우트는 `if (!owned)` 로만 검사 → 객체는 항상 truthy라 차단되지 않는다.
  - app/api/me/stores/[storeId]/delivery-service-areas/route.ts:44-45 (GET), :77-78 (PUT), :152-153 (POST)
  - 같은 함수의 정상 사용 예: app/api/me/event-promotion-requests/[requestId]/upload-image/route.ts:59-62 (`!owned.ok`)
  - 추가로 suspended/rejected 매장 차단(`BLOCKED_APPROVAL`)도 없다.
- **영향**: 경쟁 매장에 `geoIdentities:[]` + `activateV2:true` → `empty_selected_areas` → 그 매장 배달 주문 전면 불가(evaluate-delivery-service-area.ts:170-183). 반대로 임의 LGU를 넣어 배달 지역을 넓히는 것도 가능. 매장·주문자 영향, 매출 손실. 감사 로그 없음.
- **심각도**: **P0** (타 테넌트 데이터 변경·권한 우회)
- **현행 동작**: 비소유자 요청도 200 + 저장.
- **기대 동작**: 비소유자 403, 정지·반려 매장 403.
- **수정 설계**: 3곳 모두 `if (!owned.ok) return NextResponse.json({ok:false,error:owned.error},{status:owned.status})`; PUT에는 `BLOCKED_APPROVAL.has(owned.store.approval_status)` → 403 추가; PUT 성공 시 `appendAuditLog(store.delivery_service_areas_replace, before/after)`. 회귀 테스트: 비소유자 PUT 403, 소유자 PUT 200.
- **연동 영향**: Owner 편집기(DeliveryServiceAreaEditorCore.tsx:359)는 소유자만 호출하므로 영향 없음. Admin 라우트는 별도 권한으로 영향 없음.
- **검증 방법**: vitest 라우트 테스트(getStoreIfOwner mock `{ok:false,status:403}`) → 403 기대. 운영에서 다른 계정으로 PUT 시 403.
- **Owner 승인 필요**: 없음(버그 수정). 단 HARD LOCK 영역이라 Change gate 1~3 준수.
- **증명 상태**: CODE PROVEN (실제 공격 실행은 안 함 → RUNTIME NOT_PROVEN)

### LOC-002 — `stores` 테이블 Owner 직접 UPDATE/INSERT 허용(PostgREST) → 위치·반경·승인상태 API 검증 우회
- **영역**: DB(RLS·권한)
- **증상**: 매장 Owner가 브라우저 Supabase 클라이언트(anon key + 본인 JWT)로 `stores` 행을 직접 UPDATE/INSERT 할 수 있다.
- **원인 (DB 증거)**:
  - 정책 `stores_update_owner_or_admin` (UPDATE, qual `owner_user_id = auth.uid() OR internal.is_admin_user()`, with_check 없음), `stores_insert_owner` (INSERT, with_check `owner_user_id = auth.uid()`)
  - `information_schema.column_privileges`: anon·authenticated 가 69개 전 컬럼에 UPDATE/INSERT (lat, lng, delivery_radius_km, delivery_service_area_authority, delivery_available, **approval_status**, is_visible 포함)
  - stores 트리거 3개 중 이 컬럼들을 막는 것 없음
  - 저장소 migrations 에 위 정책 정의가 없다(grep 결과 0) → 문서·코드에서 관리되지 않는 운영 전용 정책
  - 브라우저 클라이언트 존재: lib/supabase/client.ts
- **영향**: (1) `assertStoreLocationPatchConsistent`, `storeHasCanonicalDeliveryOrigin`(route.ts:303-315), 반경 검증, `afterCanonicalStoreLocationWrite`·진행 주문 ETA 재계산, 감사 로그 모두 우회. (2) 좌표 없는 매장 `delivery_available=true`, 반경 9999km 설정 가능. (3) **`approval_status='approved'` 자기 승인·정지 해제**, 승인된 상태로 새 매장 INSERT 가능 → 플랫폼 권한 우회. 위치 도메인을 넘어서는 문제라 STORE/AUTH 도메인과 같이 봐야 한다.
- **심각도**: **P0** (큰 권한 우회)
- **현행 동작**: 이 정책·권한 아래에서는 Owner 직접 UPDATE가 통과된다.
- **기대 동작**: 매장 쓰기는 서버 API(service role)로만 가능.
- **수정 설계**: 새 마이그레이션 — `REVOKE INSERT, UPDATE ON public.stores FROM anon, authenticated;` 그리고 `stores_update_owner_or_admin`·`stores_insert_owner` DROP. 다른 클라이언트 직접 쓰기 경로가 있으면 먼저 grep(`from("stores").update` 을 클라이언트 번들에서 검색)으로 확인. 반대 방법(정책을 유지할 때): BEFORE UPDATE 트리거로 `auth.role()='authenticated'` 이면 approval_status·lat·lng·delivery_*·owner_user_id 변경 거부.
- **연동 영향**: 서버 라우트는 service-role(`tryGetSupabaseForStores`) 이므로 영향 없음. 클라이언트에서 stores 를 직접 쓰는 코드가 있으면 깨진다(사전 grep 필수).
- **검증 방법**: 적용 후 `has_table_privilege('authenticated','public.stores','UPDATE')=false`; 스테이징이 아닌 로컬 테스트에서 anon 클라이언트 UPDATE → 42501.
- **Owner 승인 필요**: **운영 DB 마이그레이션 적용**(AGENTS.md 개발 프로세스 2번).
- **증명 상태**: DB PROVEN (정책·권한·트리거). 실제 직접 UPDATE 실행은 안 함 → RUNTIME NOT_PROVEN.

### LOC-003 — 배달 가능 판정 fail-open: 전역 정책 OFF·매장 override disabled·설정 조회 실패 시 좌표 없는 매장도 주문 가능
- **영역**: API(판정 SSOT) / 업무
- **증상**: HARD LOCK 문서는 "null-geo store → not orderable (missing_store_coords)"라고 했지만, evaluator는 정책이 적용되지 않으면 **좌표 검사 전에** `eligible:true` 를 반환한다.
- **원인**:
  - evaluate-delivery-serviceability.ts:57-59, :86-95 — `!policy.enabled` 또는 override `disabled` 이면 바로 eligible
  - evaluate-delivery-service-area.ts:131-150 — V2도 같다
  - delivery-ops-settings.ts:40-45 기본값 `enabled:false`; :196-205 — admin_settings 조회 **오류 시 기본값(OFF)로 대체** → 일시적 DB 오류에 eligibility 가 열린다
  - 주문 라우트 app/api/me/store-orders/route.ts:609-668 도 같은 evaluator 사용
- **영향**: 운영에서 배달 가능 매장 11개 중 **9개가 좌표 NULL**(DB). Admin이 거리 정책을 끄거나(admin/delivery/settings), 매장 override 를 disabled 로 바꾸거나, 설정 조회가 실패하면 그 순간 9개 매장이 거리·좌표 무관하게 전 회원에게 주문 가능해진다. 주문 무결성·배달 불가 주문 발생.
- **심각도**: **P1**
- **현행 동작**: policy_off → eligible.
- **기대 동작**: (a) `missing_store_coords` 는 정책 ON/OFF와 무관하게 local_delivery 차단(문서 불변식). (b) 설정 조회 실패는 fail-closed(503) 또는 마지막 성공값 사용.
- **수정 설계**: `evaluateDeliveryServiceability`/`evaluateDeliveryServiceArea` 맨 앞에 "store coords 없음 → `{eligible:false, applies:true, reason:'missing_store_coords'}`" 추가(정책 분기보다 먼저). `fetchDeliveryDistanceSettingsFromDb` 오류 시 기본값이 아니라 throw → 주문 라우트에서 503 `delivery_policy_unavailable`; 목록 라우트는 마지막 메모리 값 사용.
- **연동 영향**: 목록 OOR(`resolveListDistanceOutOfRange`)은 이미 missing_store_coords 를 OOR 로 처리하므로 일관. 정책 OFF 운영 모드에서 좌표 없는 매장이 목록에서 빠지는 변화가 있다(의도).
- **검증 방법**: vitest — policy.enabled=false + storeLat null → eligible=false. 설정 조회 오류 mock → 주문 503.
- **Owner 승인 필요**: "전역 거리정책 OFF일 때 좌표 없는 매장 차단" 정책 확인(문서 불변식과 같은 내용이라 확인만 필요).
- **증명 상태**: CODE PROVEN, DB(9개 매장) PROVEN. 실제 fail-open 주문 발생은 NOT_PROVEN(현재 enabled=true).

### LOC-004 — 주문 시 배달 가능 판정 스냅샷이 저장되지 않음 + 매장 이동 후 주문의 직선거리 덮어쓰기
- **영역**: DB / 업무(분쟁 증거)
- **증상**: `checkout_serviceability_eligible/max_km/reason`, `checkout_store_latitude/longitude` 가 운영 local_delivery 주문 **639건 전부 NULL**.
- **원인**: lib/delivery/store-order-serviceability-snapshot-ready.ts:6 `STORE_ORDER_SERVICEABILITY_SNAPSHOT_READY = false`. 운영 DB에는 컬럼이 이미 있다(information_schema 확인). store-orders/route.ts:847-859 에서 저장을 생략한다. 또 저장도 주문 생성 RPC 이후 별도 UPDATE(비원자), idempotent 재시도 경로(:828-845)에서는 실행되지 않는다.
  - 추가: sync-store-orders-checkout-geo.ts:73-84 — 매장 좌표 변경 시 진행 주문의 `checkout_straight_distance_meters` 를 **새 매장 좌표로 다시 계산해 덮어쓴다**(주문 시점 근거 소실). 문서(address-platform-hard-lock "Store lat/lng change may refresh ETA only")와 다르다.
- **영향**: 범위 밖 주문 분쟁·감사에서 "주문 당시 판정"을 증명할 수 없다. 실제로 반경 초과로 보이는 43건(정책 활성 후 4건)을 판정할 수 없었다(관리자·금전 분쟁).
- **심각도**: **P2**
- **현행 동작**: 판정 결과는 응답 거부에만 쓰이고 저장되지 않는다.
- **기대 동작**: 주문 행에 판정 스냅샷이 원자적으로 저장된다.
- **수정 설계**: 플래그를 true로 바꾸고, 스냅샷을 `createStoreOrderAtomic` 의 `order` jsonb 에 넣어 같은 트랜잭션에서 INSERT(RPC가 해당 키를 받는지 확인 필요, 받지 않으면 RPC 마이그레이션). 매장 이동 재계산에서는 `checkout_straight_distance_meters` 를 제외하고 ETA 필드만 갱신.
- **연동 영향**: RPC 시그니처 변경 시 DB 마이그레이션 필요. 화면 영향 없음.
- **검증 방법**: 주문 1건 생성 후 `checkout_serviceability_reason IS NOT NULL` 집계.
- **Owner 승인 필요**: RPC 변경 시 운영 DB 적용 승인.
- **증명 상태**: CODE + DB PROVEN.

### LOC-005 — `delivery_available=true` + 좌표 NULL 매장 9개 (불변식이 API 쓰기 시점에만 있고 DB 제약 없음)
- **영역**: DB / 운영 데이터
- **증상**: 문서 불변식 "delivery_available=true → requires canonical stores.lat/lng"이 운영 데이터와 다르다(9/11).
- **원인**: 검사는 `patch.delivery_available === true` 일 때만 한다(app/api/me/stores/[storeId]/route.ts:303-315, admin/stores/[id]/route.ts:563-571). 이미 켜진 매장, LOC-002 직접 UPDATE는 검사를 거치지 않는다. stores CHECK 제약에 이 조건이 없다(DB). 문서는 9건을 "pin 확인 대기(운영)"로 분류했다.
- **영향**: 게스트·좌표 없는 회원 목록에는 정상 매장처럼 보이고 체크아웃에서 `delivery_store_coords_required` 로 거부된다(UX). LOC-003 과 결합하면 실제 주문 가능.
- **심각도**: **P2**
- **현행 동작**: 9개 매장 배달 ON, 좌표 없음.
- **기대 동작**: 배달 ON 매장은 항상 좌표가 있다.
- **수정 설계**: 데이터 정리(9개 매장 Owner 핀 입력 또는 delivery_available=false — 문서상 "Allowed later work") 후 `ALTER TABLE stores ADD CONSTRAINT stores_delivery_requires_geo CHECK (NOT delivery_available OR (lat IS NOT NULL AND lng IS NOT NULL)) NOT VALID;` → 정리 후 VALIDATE.
- **연동 영향**: 좌표 없는 상태에서 배달 ON 저장 시 DB 오류 → API는 이미 같은 오류를 반환하므로 영향 작음.
- **검증 방법**: `select count(*) from stores where delivery_available and (lat is null or lng is null)` = 0.
- **Owner 승인 필요**: 9개 매장 처리 방식(OFF 전환 vs Owner 핀 요청), DB 제약 적용.
- **증명 상태**: DB PROVEN.

### LOC-006 — V2 지역 교체가 비원자적(delete → insert)이고 입력 LGU 검증·감사·동시성 제어 없음
- **영역**: API / DB
- **원인**: lib/delivery/service-area/store-delivery-service-areas.ts:102-157 — 주석은 "atomically"라 했지만 DELETE 후 별도 INSERT, 그다음 별도 stores UPDATE. `geo_identity` 를 카탈로그(`getPlatformPhLguDisplayNameById`)에 없어도 id 그대로 저장(:120-121). Owner 라우트 감사 로그 없음. Owner/Admin 동시 저장은 마지막 저장이 이김(버전 검사 없음).
- **영향**: INSERT 실패 시 V2 매장은 `empty_selected_areas` 로 전면 주문 불가. 잘못된 id 는 어떤 회원에게도 매칭되지 않음. 현재 V2 매장 0 → 실제 피해 없음.
- **심각도**: **P2** (V2 활성화 전 수정 필요)
- **수정 설계**: SECURITY DEFINER RPC `replace_store_delivery_service_areas(p_store_id, p_ids text[], p_activate bool, p_source, p_expected_updated_at)` 로 한 트랜잭션 처리, 카탈로그에 없는 id 거부(서버에서 사전 검증), audit 추가, `expected_updated_at` 불일치 시 409.
- **검증 방법**: INSERT 실패 주입 테스트 → 기존 행 유지.
- **Owner 승인 필요**: RPC 마이그레이션 운영 적용.
- **증명 상태**: CODE PROVEN.

### LOC-007 — Owner 매장 위치 변경: 지도 핀 없음·주소-좌표 근접성 검증 없음·감사 로그 없음·승인 없음
- **영역**: UI / API / 업무
- **원인**:
  - UI는 위도·경도를 직접 숫자로 입력한다(OwnerStoreBasicInfoForm.tsx:974-990). 비어 있으면 "매장" 연결 주소록 좌표, 그다음 기존 좌표를 **항상** 보낸다(:735-768) → API Policy A(주소 변경 시 좌표 필수)가 형식적으로 늘 통과 → 주소만 바꾸면 핀은 옛 위치(문서 Policy B가 인정한 동작).
  - 좌표가 주소(city/region)와 맞는지 검사 없음. region/city 변경은 identity 변경으로 보지 않는다(store-location-patch-consistency.ts:23-30).
  - Owner PATCH 는 감사 로그를 재제출(resubmit) 때만 남긴다(route.ts:366-389). Admin `set_store_location` 은 남긴다(admin/stores/[id]/route.ts:504-514).
  - 승인된 매장의 위치 변경에 관리자 검토가 없다.
- **영향**: 오타 좌표 하나로 배달 가능 지역 전체가 옮겨지고(legacy radius) 추적할 수 없다. 주문자·매장 영향.
- **심각도**: **P2**
- **수정 설계**: (1) Owner PATCH에서 lat/lng 가 바뀌면 `appendAuditLog(store.owner_location_change, before/after)`. (2) 좌표가 저장된 city 의 LGU(`resolveStoreHomeLguId`)와 맞지 않거나 기존 좌표에서 X km 넘게 이동하면 400 `store_location_far_from_address`(확인 플래그로 재전송 허용). (3) UI 숫자 입력 대신 기존 지도 핀 컴포넌트 재사용 — Owner 결정 사항.
- **검증 방법**: 라우트 테스트(좌표 변경 → audit 1건).
- **Owner 승인 필요**: 이동 허용 거리 X, 승인 매장 위치 변경 시 관리자 검토 여부.
- **증명 상태**: CODE PROVEN.

### LOC-008 — Owner가 구매자 배달주소·좌표·전화번호를 주문 상태와 관계없이 무기한 조회
- **영역**: API / DB(RLS) / 개인정보
- **원인**: app/api/me/stores/[storeId]/orders/[orderId]/route.ts:217-224 가 `buyer_phone, delivery_formatted_address, delivery_detail_address, delivery_latitude, delivery_longitude` 등을 상태 조건 없이 반환. RLS `store_orders_owner_select`(DB)도 Owner 직접 SELECT에 전체 컬럼을 허용한다.
- **영향**: 완료·취소·환불 후에도 무기한 고객 위치·연락처 열람. IDOR은 아니다(store_id 필터 :223 확인).
- **심각도**: **P2** (개인정보 최소화 정책 부재)
- **수정 설계**: `completed/cancelled/refunded` 이후 N일이 지나면 응답에서 좌표·상세주소·전화 마스킹하는 공용 helper; RLS owner select 는 컬럼 권한으로 제한하거나 서버 API 전용으로 전환.
- **Owner 승인 필요**: 보관·마스킹 기간 N(필리핀 Data Privacy Act 기준).
- **증명 상태**: CODE + DB PROVEN.

### LOC-009 — V2 `missing_lgu_identity` 거부 시 오류 코드가 "좌표 필요"로 잘못 매핑
- 원인: app/api/me/store-orders/route.ts:646-653 — `missing_lgu_identity` → `delivery_customer_coords_required`.
- 영향: 주소에 좌표가 있는데 "좌표 필요" 안내 → 고객이 고칠 방법을 모른다(V2 활성 시). **P3**.
- 수정: `delivery_address_lgu_unresolved` 코드 + i18n 카피. 증명: CODE PROVEN.

### LOC-010 — 상세·장바구니 사전 판정과 체크아웃 판정의 경계 차이
- 원인: delivery-serviceability/route.ts:59 는 `isDeliveryRoutableMasterAddress`(0,0 거부) 를 적용하지만 주문 라우트(store-orders/route.ts:575-587, :625-637)는 적용하지 않는다. `isDeliveryDistanceOrderBlocked` 는 `missing_customer_coords` 를 차단하지 않는다(fetch-store-delivery-serviceability-client.ts:132) → 장바구니에서는 주문 가능, 결제 시 400.
- 영향: 현재 운영 주소 좌표 누락·(0,0) 0건(DB) → 실질 영향 없음. **P3**.
- 수정: 주문 라우트에서도 `isDeliveryRoutableMasterAddress` 로 고객 좌표 검사, 장바구니에서 `missing_customer_coords` 는 "주소 좌표 필요" CTA로 표시. 증명: CODE PROVEN.

### LOC-011 — 운영 `delivery_distance_policy` JSON의 레거시 값이 코드와 다름
- 원인: 운영 값 `defaultMaxKm:60`, `overDistanceBehavior:"deprioritize"`(DB) ↔ 코드는 `exclude` 고정·defaultMaxKm 무시(delivery-ops-settings.ts:83-90, store-delivery-radius.ts:7-9).
- 영향: 관리자 화면이 이 값을 그대로 보여주면 잘못된 운영 이해. UI 표시는 NOT_PROVEN. **P3**.
- 수정: 관리자 설정 저장 시 normalize 값으로 덮어쓰기(운영 데이터 변경 → 승인 필요).

### LOC-012 — 라이더 자기 위치 API가 `delivery_rider_location_enabled` 토글을 무시
- 원인: app/api/me/rider/location/route.ts → riderSelfPostLocation(store-order-delivery-service.ts:771-805) 에 토글 검사 없음. 웹훅(app/api/webhooks/delivery-rider-location/route.ts:41-45)은 검사.
- 영향: 관리자가 끈 상태에서도 위치 저장. 라이더 0명이라 현재 영향 없음. **P3**. 수정: 같은 `loadDeliveryRiderLocationEnabled` 검사 추가.

### LOC-013 — 기본정보 저장 때마다 좌표를 보내 진행 주문 ETA 재계산·discovery 무효화가 실행됨
- 원인: OwnerStoreBasicInfoForm.tsx:760-768 이 좌표 변경이 없어도 lat/lng 을 보낸다 → route.ts:399-405 `storeLocationPatchTouchesCoords` true.
- 영향: 전화번호만 바꿔도 진행 중인 모든 배달 주문 행을 UPDATE(LOC-004 덮어쓰기와 결합). **P3**.
- 수정: 서버에서 `patch.lat === current.lat && patch.lng === current.lng` 이면 좌표 키 제거.

### LOC-014 — 회원이 자기 `user_addresses.canonical_lgu_id` 를 직접 수정 가능 (V2 판정 위조 가능성)
- 원인: RLS `user_addresses_update_own` + authenticated 컬럼 UPDATE 권한(DB). `resolveMemberCanonicalLguId` 는 저장된 값을 우선하고 city/좌표와 교차 검증하지 않는다(resolve-member-canonical-lgu.ts:13-15).
- 영향: V2 매장(현재 0개)에서 좌표는 지역 밖인데 LGU만 위조해 주문 가능. **P3** (V2 활성화 전 수정).
- 수정: 주문 라우트에서는 저장값 대신 city/province 로 다시 해석하고 일치할 때만 사용하거나, 컬럼 UPDATE 권한 회수 후 서버 쓰기 경로에서만 설정.

### 범위 밖 관찰 (보고만)
- `trg_store_orders_commission_lifecycle` 트리거가 운영에서 **disabled('D')** (pg_trigger). 수수료 도메인 — AGENTS.md "수수료 부과는 DB 트리거만" 규정과 관련, 해당 도메인 감사에서 확인 필요.
- pickup 주문 19건에 `delivery_fee_amount>0`(2026-08-08 14분 사이, 합계 950). 현재 `store_charged_delivery_fee_php` 는 pickup → 0 반환이라 과거 데이터로 보인다. 금액 도메인에서 환불 여부 확인 필요.

---

## 4. 누락 기능 (설계 제안 — 결함 아님, 배민·요기요·쿠팡이츠 대비)
1. **거리별·구간별 배달비** — 현재 매장 고정금액 + 무료배달 기준만(`store_charged_delivery_fee_php`).
2. **지도 핀 + 주소 검색으로 매장 위치 설정** — 현재 Owner는 숫자 좌표 입력.
3. **폴리곤/도로거리 기반 배달 지역** — 현재 직선 반경 또는 LGU 단위(V2).
4. **반경 최소·최대 정책** — `parseStoreDeliveryRadiusKmForWrite` 는 상한 없음(주석 "until Owner sets MIN/MAX").
5. **구매자·Owner 실시간 배달 추적 지도** — 라이더 위치 저장만 있고 고객 화면 없음.
6. **매장 위치 변경 이력 화면**(Owner·Admin).
7. **주문 시 다른 배달 주소 선택** — 현재 master 주소만(설계상 의도, 문서와 일치).
8. **배달 불가 지역 안내·가까운 대체 매장 추천**.

---

## 5. SSOT 표

| 데이터 | 권위 원천 | 다르게 쓰는 소비처 |
|---|---|---|
| 매장 좌표 | `stores.lat/lng` (`location_geog` 는 generated) | `store_delivery_coverage.coverage_geog`(랭킹 전용, 3건 반경 불일치·2매장 행 없음 — 라이브 재평가로 보정) |
| 매장 반경 | `stores.delivery_radius_km` (NULL→10) | 운영 `delivery_distance_policy.defaultMaxKm=60`(무시되지만 남아 있음, LOC-011) |
| 배달 가능 판정 | `evaluateDeliveryServiceArea` (evaluate-delivery-service-area.ts:106) | HOME/Search는 deprecated 어댑터 `evaluateStoreDeliveryServiceability`(reason 매핑으로 결과 동일) |
| 판정 권한 모드 | `stores.delivery_service_area_authority` | Owner V2 라우트 IDOR(LOC-001), 직접 UPDATE(LOC-002) |
| V2 선택 지역 | `store_delivery_service_areas` | — |
| 회원 배달 원점 | `user_addresses` master(`is_default_master`) | 게스트 GPS(`explicit_coords`)는 판정에 쓰이지 않음(의도) |
| 회원 LGU | `user_addresses.canonical_lgu_id` → 없으면 city/province 해석 | 사용자가 직접 수정 가능(LOC-014) |
| 주문 배달주소 | `store_orders.delivery_*` 스냅샷 | — |
| 주문 시 판정 | `store_orders.checkout_serviceability_*` | **저장 안 됨**(LOC-004) |
| 배달비 | `store_charged_delivery_fee_php` (DB) / `resolveChargedDeliveryFeePhp` (TS) | — |
| 전역 거리 정책 | `admin_settings.delivery_distance_policy.enabled` | 조회 실패 시 OFF로 대체(LOC-003) |

---

## 6. 기존 문서와 구현 차이

| 문서 | 문서 내용 | 구현/운영 | 관련 |
|---|---|---|---|
| final-ssot-hard-lock | "null-geo store → not orderable" | 정책 OFF·override disabled·설정 조회 실패 시 주문 가능 | LOC-003 |
| final-ssot-hard-lock | "delivery_available=true → requires canonical stores.lat/lng" | 운영 9/11 위반, DB 제약 없음(문서는 9건을 운영 대기로 분류) | LOC-005 |
| final-ssot-hard-lock | "Owner·Admin selector parity LOCKED" | Owner 라우트 소유 검증 무력화 | LOC-001 |
| address-platform-hard-lock | "Owner/Admin patch stores via PATCH /api/me/stores/:id" | DB가 Owner 직접 UPDATE/INSERT 허용, 해당 정책이 migrations 에 없음 | LOC-002 |
| address-platform-hard-lock | "Store lat/lng change may refresh ETA only" | 직선거리 스냅샷도 덮어씀 | LOC-004 |
| store-delivery-service-areas.ts 주석 | "Replace selected areas atomically" | delete→insert 비원자 | LOC-006 |
| delivery-ops-settings.ts:26 주석 | "Detail/cart/checkout: evaluateDeliveryServiceability" | 실제는 `evaluateDeliveryServiceArea` (주석만 오래됨) | 문서 정리 |
| ph-address-redesign-manual-checklist | 수동 항목 ☐ 다수 | 실행 증거 없음 | RUNTIME NOT_PROVEN |
| store-order-serviceability-snapshot-ready.ts | "migration 적용 후 true" | 운영에 컬럼 있음, 플래그는 false | LOC-004 |

---

## 7. Owner 정책 결정 필요 사항
1. 전역 거리정책 OFF일 때도 **좌표 없는 매장은 배달 차단** 유지할지(문서 불변식 확인) — LOC-003.
2. 좌표 없는 배달 ON 매장 9개 처리: 배달 OFF 전환 vs Owner 핀 입력 요청 — LOC-005.
3. `stores` 직접 쓰기 권한 회수 마이그레이션 운영 적용 승인 — LOC-002.
4. 승인된 매장의 위치 변경 시 관리자 검토 필요 여부, 자동 거부 이동거리 기준 — LOC-007.
5. 배달 반경 최소·최대값(현재 상한 없음, 운영 최대 60km).
6. Owner의 구매자 주소·전화 열람 기간(주문 종료 후 N일 마스킹) — LOC-008.
7. 거리별 배달비 도입 여부 — 누락 기능 1.
8. V2(LGU) 활성화 전에 LOC-001·006·009·014 선행 수정을 조건으로 둘지.
