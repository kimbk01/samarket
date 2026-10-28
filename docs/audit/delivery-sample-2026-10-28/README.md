# DIBAY 배달 — 전체 재감사 · 정식 샘플 운영 체계 설계안 (2026-10-28 PHT)

**상태: 1단계 감사 + 2단계 설계안. Owner 승인 전 — 코드·운영 DB·데이터·배포·실기기 변경 0.**

- 기준: 로컬 HEAD `8d9b4c7cb`(origin/main `9a26e4e58`) · 운영 DB `ckdosyydvgzqwpbwuhon` **읽기 전용 SELECT** (개인정보 컬럼 미조회, 오너는 아이디·닉네임만) · 테스트 DB 미사용.
- 재사용: 배달 오너 감사 [`docs/audit/delivery-owner-2026-10-20/`](../delivery-owner-2026-10-20/README.md) — 130건 중 해결 122 · 운영 실측 불가 6 · 제외 2 · **HARD LOCK(2026-10-22, 문서 P)**. 이번 감사는 오너 영역을 다시 분석하지 않고, **샘플 체계가 오너·금전 경로에 미치는 영향**만 확인했다.
- 화면 실측: **이번 작업에서 앱·브라우저 화면을 열지 않았다** → 화면 판정은 전부 NOT_PROVEN. PASS/FAIL 은 코드·DB 근거 기준이다.

---

## A. 감사 결과

### A-1. 고객 웹/앱

| # | 감사 항목 | 현재 구현 | 판정 | 발견 결함 | 근거 | 조치 |
|---|---|---|---|---|---|---|
| C1 | 배달 홈 진입 | `/stores` → `StoresHub` → `StoresHomeHub`, 데이터 `/api/stores/home-feed` | 코드 PASS · 화면 NOT_PROVEN | **D-01** | `app/(main)/stores/page.tsx:29` | YES (D-01) |
| C2 | 업종 카테고리 | `store_categories`(8)·`store_topics`(35)·`store_subtopics`(0), `/api/stores/taxonomy` 10분 캐시 | PASS | 업종 미지정 매장 2곳(`store_category_id NULL`, `business_type` 문자열 매칭으로 분류) | DB · `lib/stores/load-store-taxonomy-rows.ts:61` | NO (테스트 매장이라 숨김으로 해소) |
| C3 | 매장 목록 | `/api/stores/browse` → 스냅샷 RPC `get_stores_browse_snapshot` / 랭킹 RPC `get_store_discovery_shadow_wave`. 노출 조건 `approval_status='approved' AND is_visible=true` | PASS | — | `app/api/stores/browse/route.ts:159`, `20260823220000_…sub_filter_contract.sql:66-200` | NO |
| C4 | 주소·배달 지역 필터 | 저장 주소 회원(`saved_address`)만 범위 밖 매장 **제외**. 비로그인·주소 미등록 = 필터 없음(정렬만) | PASS | 샘플 전 지역 노출은 현재 불가능(설계 §B-8) | `store-list-delivery-origin.ts:144-218`, `delivery-list-oor-policy.ts:27-46`, `stores-browse-build.ts:882-889` | 샘플 설계 |
| C5 | 매장 상세 | `getApprovedStoreBySlug` — 승인·노출 아니면 404 화면 「store_not_found_short」 | PASS | — | `lib/stores/get-approved-store-by-slug.ts:62-100`, `StoreDetailPublic.tsx:1916` | NO |
| C6 | 메뉴·옵션 | 옵션은 `store_products.options_json` 단일 원천(radio/checkbox/quantity, 품절 옵션) | PASS | — | `20260430200000_options_single_source_options_json.sql`, `lib/stores/modifiers/` | NO |
| C7 | 장바구니 | localStorage `kasama_store_commerce_cart_v1` + 서버 재검증 `/api/me/store-cart/revalidate` | 코드 PASS · 화면 NOT_PROVEN | — | `store-commerce-cart-storage.ts:12` | NO |
| C8 | 주문서·결제 | `/api/me/store-orders` → `validateStoreOrderCheckout` → `create_store_order_atomic`(행 잠금, `store_unavailable`·`store_closed`·`store_not_selling` 차단) | PASS (배달 제품 HARD LOCK) | — | `app/api/me/store-orders/route.ts:230-696` | NO |
| C9 | 주문 완료·내역·상태·취소 | 상태 작성자 단일(`applyStoreOrderStatusTransition`), 취소·환불 원자화 | PASS (오너 감사 HARD LOCK 재사용) | — | 문서 K·P | NO |
| C10 | 매장·상품 검색 | `searchDeliveryDomain` — `approved`·`is_visible` **+ `delivery_available=true`** | 부분 FAIL | **D-02** 목록과 검색의 후보 조건 불일치(픽업 전용 매장은 목록에 보이고 검색에 안 나옴) | `lib/delivery/search/search-delivery.ts:220,286,360` | YES (정책 확인 후) |
| C11 | 광고·홍보 배너 | 슬롯 3종(HERO 39:16 · HOME_INLINE 2:1 · CATEGORY_TOP 2:1), 현재 **노출 중 0건**(전부 ENDED/DRAFT) | 코드 PASS · 운영 비어 있음 | 배너 없음 = 슬롯 접힘(정상 설계) | DB `store_banner_ad_campaigns` | 샘플 광고 설계 |
| C12 | 뒤로가기·복귀 | 오너 IA-20·배달 슬라이드 스택 계약 존재 | NOT_PROVEN (화면 미측정) | — | `delivery-consumer-stack-slide.ts` | 실기기 시나리오에 포함 |
| C13 | 로딩·빈 화면·오류 | 상세 404 문구, 빈 슬롯 접힘, 로드 오류 상태 | 코드 PASS · 화면 NOT_PROVEN | — | `delivery-load-error-status.ts` | NO |
| C14 | 모바일·태블릿 UI/CTA | 배너는 단일 비율(기기별 비율 금지 계약) | NOT_PROVEN | — | `docs/dibay-delivery-advertising-ssot.md:50` | 실기기 시나리오 |
| C15 | 실주문 가능 매장 | 운영 17곳 중 좌표 있는 매장 2곳뿐 → 나머지 배달 주문은 체크아웃에서 `missing_store_coords` 차단 | 정책대로 동작 | 운영 대기 항목(주소 HARD LOCK 문서 「Store geo pin 9」) | `docs/dibay-delivery-address-service-area-final-ssot-hard-lock.md` | NO (범위 밖, 보고만) |

**D-01 (고객 노출 결함, 데이터)** — 홈 섹션 제목 재정의(`store_composition_policy_overrides.title_ko/subtitle_ko`)에 QA 문자열이 남아 있다. `stores-home-shelf-product-resolve.ts:95-97` 은 재정의 값이 있으면 기본 제목 대신 그대로 쓰므로 **한국어 사용자 홈에 그대로 보인다**(화면 미측정이지만 코드·DB 로 확정).

| slot | 현재 title_ko / subtitle_ko | 기본값 복귀 시 |
|---|---|---|
| `slot0Food` | `QA-PR-HOME-TITLE 지금 주문` / `QA-PR-HOME-SUB` | 정의 기본값 |
| `slot2Food` | `QA-PR-HOME-TITLE 맛집` | 〃 |
| `campaignFood` | `QA-PR-HOME-TITLE 브랜드` | 〃 |
| `slot6NearbyStores` | `금방 도착666` | 〃 |
| `slot6RestStores` | `DIBAY_CUT9_QA_1787588665247_HOME` | 〃 |

> 갱신(같은 날 재조회): 17:17 PHT 관리자 저장으로 `slot2Food` 제목은 「주문이 많은 매장」으로 바뀌었고 `slot0Food` 제목은 「신규 배장 」이 됐다. 남은 QA 문자열과 Production 화면 확인 결과는 **§E H-01** 이 최신이다.

조치안: 관리자 HOME 관리 화면(`/admin/stores-home-shelves`)의 기존 저장 경로로 5개 슬롯의 `title_ko`·`subtitle_ko` 를 비움(NULL) → 기본 제목 복귀. 코드 변경 없음, 운영 데이터 변경이라 Owner 승인 필요(결정 **O-6**).

**D-02** — 검색만 `delivery_available=true` 를 요구한다. 목록은 픽업 전용 매장도 보여 준다. 「픽업 전용 매장은 검색 제외」가 의도인지 문서 근거가 없다. 샘플 매장은 배달·픽업 플래그가 모두 꺼져 있으므로(§B-9) 이번 설계에서는 검색 쿼리에 샘플 분기만 추가하고, 픽업 전용 매장 처리는 바꾸지 않는다(보고만 — 범위 밖).

### A-2. 매장 오너 (HARD LOCK 재사용 + 샘플 영향만)

| # | 감사 항목 | 판정 | 근거 | 샘플 체계 영향 | 조치 |
|---|---|---|---|---|---|
| W1~W8 | 등록·수정·운영 상태 · 업종 · 메뉴 CRUD·숨김 · 이미지·가격·옵션 · 품절 · 주문 접수~완료 · 정산 · 영업시간·배달 설정 | PASS (문서 K 해결 122 / 운영 실측 불가 6) | 문서 K·P | **없음** — 샘플 매장은 오너 계정이 없고(§B-5) 오너 API 는 `owner_user_id = 로그인 사용자` 매장만 연다 | NO |
| W9 | 고객 화면 ↔ 오너 설정 동기화 | PASS | `bumpStorePublicSharedCacheGeneration` 공통 | 샘플도 같은 무효화 경로 사용 | NO |
| W10 | 관리자 ↔ 오너 권한 충돌 | PASS (P0-1·P0-2 직접 쓰기 회수) | 문서 K §3 | 샘플 카탈로그 쓰기는 관리자 전용 — 실매장은 지금처럼 오너 전용 유지 | NO |
| W11 | 샘플의 매출·정산·통계·알림 혼입 | 설계로 차단 | 주문 3중 차단(§B-9) → 주문·정산·수수료·알림 행 자체가 생기지 않음 | — | 설계 |

### A-3. 통합 관리자 — 배달

| # | 감사 항목 | 현재 구현 | 판정 | 결함/공백 | 근거 | 조치 |
|---|---|---|---|---|---|---|
| A1 | 매장 전체 목록 | `/admin/stores` — 승인 상태·검색(q)만 | 부분 | **G-01** 업종 필터·유형(실제/샘플/테스트) 필터 없음 | `app/api/admin/stores/route.ts:40-41,383` | YES |
| A2 | 업종 관리 | `/admin/stores/application-settings` 택소노미 편집·이미지 | PASS | — | `app/api/admin/stores/taxonomy/route.ts` | NO |
| A3 | 매장 상세·상태·노출 | 인라인 패널, `set_store_visible`·승인 액션 CAS·감사 로그 | PASS | — | `app/api/admin/stores/[id]/route.ts:145-385` | NO |
| A4 | 메뉴·옵션 관리 | 상태·검수·이름·가격 정정만 | 부분 | **G-02** 관리자가 상품 생성·옵션·이미지 편집 불가 (실매장은 정상 정책 — 샘플 운영에는 공백) | `lib/stores/admin-store-product-ops.ts:11-21` | YES (샘플 한정) |
| A5 | 이미지 관리 | 오너 업로드 전용(`guardOwnerCatalogWrite`) | 부분 | G-02 와 같음 | `app/api/me/stores/[storeId]/upload-image/route.ts` | YES (샘플 한정) |
| A6 | 매장 생성 | 관리자 경로 없음(오너 신청만) | 공백 | **G-03** | `app/api/admin/stores/route.ts`(GET 만) | YES (샘플 한정) |
| A7 | 실제/샘플/테스트 구분 | 컬럼 없음 | 공백 | **G-04** | DB·코드 grep | YES |
| A8 | 광고·배너 관리 | `/admin/delivery-ads` — 1st-party 배너 작성기(무과금, 승인 상태로 생성, 감사 로그) | PASS | **G-05** 샘플 광고 구분값 없음 · 1st-party 노출·클릭이 성과 통계에 그대로 기록됨 | `delivery-ad-admin-first-party-writer.ts`, `load-store-banner-ad-campaigns.ts:189-203` | YES |
| A9 | 주문·정산·통계 | 대시보드 RPC·수수료 원장·재무제표 | PASS | 샘플은 주문이 생기지 않으므로 필터 추가 불필요 | 문서 K | NO |
| A10 | 권한·감사 이력 | `audit_logs`(target_type=store, before/after) | PASS | — | `lib/audit/append-audit-log.ts:19` | NO |
| A11 | 고객 반영·캐시 | 공유 태그 `store-public-read-caches` + 슬러그·홈피드·스냅샷 무효화 | PASS | 새 「샘플 전체 노출」 스위치는 무효화 연결 필요 | `store-public-shared-cache-generation.ts:23,97` | 설계 |
| A12 | 사전 초기화(prelaunch reset) | 명시 storeId 만, 운영 execute 상시 차단, `stores` 행 삭제 안 함 | PASS | 테스트 식별 기능 없음 → 이번 분류 컬럼이 필요 | `lib/admin/prelaunch-reset/presets.ts:52-62` | NO |

---

## B. 샘플 설계안

### B-1. 기존 테스트 매장 전수 조사 (운영 DB, 2026-10-28)

운영 매장 **17곳**, 상품 380(active 327), 주문 836(미종료 138), 최근 30일 주문 3건.

| # | 매장 | 업종(DB) | 오너 아이디 / 닉네임 | 노출 | 상품(active) | 주문 | 미종료 | 정산 | 리뷰 | 쿠폰 | 상품권 상품 | 광고 | 판정 근거 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 만두네집 | (NULL) 식당 | wwww / w테스트1 | 노출 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 21+2 | 「테스트」 닉네임 |
| 2 | 맛업는식당 | (NULL) 식당·한식 | qqqq / q테스트1 | 노출 | 3 | 26 | 9 | 1 | 0 | 0 | 0 | 0 | 「테스트」 닉네임 |
| 3 | JTV | 식당 | asas11 / 참이슬 | 노출 | 44 | 133 | 14 | 86 | 65 | 2 | 0 | 0 | QA 계정 계열 asas11~55 (문서 K 실측 오너) |
| 4 | 나의 오른손딸방 | 식당·양식 | aa11 / 테스트1 | 노출 | 7 | 144 | 61 | 42 | 2 | 64 | 29 | 12 | 「테스트」 닉네임 |
| 5 | CRYSTAL CLEAR | 미용·헤어 | asas22 | 노출 | 18 | 33 | 4 | 21 | 19 | 0 | 0 | 0 | QA 계정 계열 |
| 6 | MANDOO CHOO.. | 카페·커피 | dibay_b05e9e / Babelyn Kim | 노출 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **실명형 닉네임 — Owner 확인 필요** |
| 7 | MAN-CHOO FOOD HUB | 식당·한식 | zxzx11 | 노출 | 16 | 38 | 2 | 32 | 31 | 0 | 0 | 0 | QA 계정 계열 zxzx11~44 |
| 8 | CCM CLOTHING LINE | 마트·로컬마트 | asas55 | 노출 | 45 | 95 | 16 | 55 | 49 | 0 | 0 | 0 | QA 계정 · 업종과 이름 불일치 |
| 9 | VERGIE NI TEA | 식당·양식 | asas33 | 노출 | 33 | 70 | 7 | 54 | 50 | 5 | 0 | 10 | QA 계정 |
| 10 | TAP SILOG | 식당·양식 | asas44 | 노출 | 30 | 97 | 8 | 66 | 66 | 0 | 0 | 0 | QA 계정 |
| 11 | MARKET MARKET | 마트·한인마트 | zxzx22 | 노출 | 67 | 93 | 12 | 72 | 65 | 0 | 0 | 0 | QA 계정 |
| 12 | ZERO PHARMACY | 공구류·수공구 | zxzx33 | 노출 | 41 | 70 | 1 | 59 | 54 | 0 | 0 | 0 | QA 계정 · 업종과 이름 불일치 |
| 13 | MOTORTRADE CENTER | 공구류·전동공구 | zxzx44 | 노출 | 23 | 40 | 4 | 28 | 17 | 0 | 0 | 0 | QA 계정 |
| 14 | CM KIM FOOD MART | 식당·한식 | lynlyn / Lyn Kim | 노출 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **실명형 닉네임 — Owner 확인 필요** |
| 15 | 개장수 | 식당·한식 | sinjinkim / 김양수 | **숨김** | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | **실명형 닉네임 — Owner 확인 필요** |
| 16 | R5매장pfsjpy | 식당·분식 | dibay_41ad53 / R5QApfsjpy | **숨김** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | QA 자동 생성 |
| 17 | R5매장pftn7p | 식당·분식 | dibay_fe41be / R5QApftn7p | **숨김** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | QA 자동 생성 |

- 모든 매장 `approval_status='approved'`. 판매권한 승인 11곳 / 미승인 6곳(1·6·14·15·16·17).
- 좌표 보유 2곳(4·5)뿐. 업종별: 식당 9(+NULL 2 포함 11) · 마트 2 · 공구류 2 · 카페 1 · 미용 1 · 펫샵 0 · 학원 0 · 서비스 0.
- **근거로 확정 가능한 테스트 매장 14곳**(1~5, 7~13, 16, 17). **판정 보류 3곳**(6·14·15 — 상품·주문 0, 실명형 닉네임) → 결정 **O-1**.
- 매장 상세 배너(`store_banners`) 중 JTV 행의 제목이 「CM KIM KOREAN MART」(다른 매장명) — 테스트 데이터 흔적, 숨김으로 고객 노출 해소.

### B-2. 숨김 대상과 영향 분석

**숨김 방식 = 기존 노출 SSOT `stores.is_visible=false` 를 기존 관리자 액션 `set_store_visible` 경로(CAS·`audit_logs`·캐시 무효화)로 기록.** 새 숨김 메커니즘을 만들지 않는다. 유형(`store_kind='legacy_test'`)은 분류만 하고, 노출은 `is_visible` 하나로 판정한다.

| 영향 경로 | 숨김 후 동작 | 위험 | 대응 |
|---|---|---|---|
| 고객 목록·검색·홈·배너 대상 | 전부 제외(모든 RPC·쿼리가 `is_visible=true` 조건) | 없음 | — |
| 매장 상세 직접 URL | 404 화면 | 과거 주문의 「매장 보기」 링크가 404 | 수용(테스트 데이터) — 실기기 확인 항목 |
| 주문 내역·상세(구매자) | 주문 행은 그대로 | 주문 상세가 매장 조회에 `getApprovedStoreBySlug` 를 쓰는지 **NOT_PROVEN** | 구현 단계에서 코드 확인, 깨지면 별도 결함 보고 |
| 미종료 주문 138건 | 오너 화면·관리자 개입·자동 취소 크론 그대로 | 오너 API 는 노출과 무관(소유 게이트) | 데이터 정리는 D-5 원칙대로 하지 않음 |
| 쿠폰 73·상품권 상품 29·상품권 인스턴스 | 행 유지, 매장 숨김으로 사용처 접근 불가 | 테스트 계정 보유분만 | 수용(정리·환불 없음) |
| 광고 캠페인 | 이미 전부 ENDED/DRAFT/REJECTED | 없음 | — |
| 수수료·캐시·정산 원장 | 변경 없음 | 없음 | — |
| 재노출 실수 | 관리자가 `is_visible=true` 로 되돌릴 수 있음 | 테스트 매장 재노출 | `set_store_visible` 에 가드: `legacy_test` 는 노출 불가(유형을 `real` 로 바꾸는 별도 감사 액션 후에만) |

### B-3. 현재 업종 목록 (운영 `store_categories`, 전부 활성)

| 순서 | 업종 | slug | 하위(store_topics) |
|---|---|---|---|
| 0 | 식당 | restaurant | 한식·중식·양식·분식·치킨·피자·디저트 |
| 10 | 마트 | mart | 한인마트·로컬마트·과일·정육·수산·반찬 |
| 20 | 공구류 | hardware | 수공구·전동공구·철물·건축자재·안전용품 |
| 30 | 펫샵 | pet | 사료·간식·용품·미용·병원연계 |
| 40 | 카페 | cafe | 커피·베이커리·브런치 |
| 50 | 미용 | beauty | 헤어·네일·스킨케어 |
| 60 | 학원 | academy | 어학·음악·운동 |
| 70 | 서비스 | life | 세탁·청소·수리 |

업종 신설·변경 없음. 샘플 매장은 위 8업종 × 2 = **16곳**, 각 매장에 기존 하위 업종을 지정한다.

### B-4. 업종별 샘플 매장 구성표 (매장명은 가상 — 실존 브랜드·상호와 겹치지 않게 등록 전 검색 확인)

| 업종 | 매장 A (하위) | 매장 B (하위) | 메뉴 형태(`item_type`) |
|---|---|---|---|
| 식당 | 소담한식 (한식) | 바삭치킨하우스 (치킨) | menu |
| 마트 | 우리장터 한인마트 (한인마트) | 프레시데이 마켓 (로컬마트) | product |
| 공구류 | 튼튼공구상회 (전동공구) | 홈픽스 철물·안전 (철물) | product |
| 펫샵 | 멍냥펫마트 (사료) | 포근펫살롱 (미용) | product / service |
| 카페 | 모닝브루 커피 (커피) | 브레드앤브런치 (베이커리) | menu |
| 미용 | 헤어살롱 루미 (헤어) | 데이지 네일&스킨 (네일) | service |
| 학원 | 잉글리시랩 어학원 (어학) | 하모니 음악·운동교실 (음악) | service |
| 서비스 | 깨끗세탁 (세탁) | 홈케어 청소·수리 (청소) | service |

매장 공통: 대표 이미지(프로필 1:1) + 커버 이미지 + 소개문 + 영업시간(실매장과 같은 `business_hours_json` 형식) + 메뉴 섹션. 메뉴 수는 업종 화면을 체험할 만큼(음식·마트·공구 11~13, 펫 7~10, 서비스업 6~7). **총 약 150개 메뉴.**

### B-5. 매장별 메뉴·옵션·가격 구성표 (가격 ₱, 옵션 = `options_json` 그룹)

**식당 A 소담한식** — 섹션: 대표 · 찌개 · 밥·덮밥 · 분식·사이드 · 음료
| 메뉴 | 가격 | 옵션 |
|---|---|---|
| 김치찌개 | 320 | 맵기(순한/보통/매운, 필수) · 추가(공기밥 +40, 라면사리 +50) |
| 된장찌개 | 300 | 공기밥 +40 |
| 순두부찌개 | 320 | 맵기(필수) · 계란 추가 +20 |
| 제육볶음 | 380 | 양(보통/곱빼기 +100) |
| 불고기 정식 | 420 | — |
| 비빔밥 | 300 | 그릇(일반/돌솥 +50) · 계란 추가 +30 |
| 김치볶음밥 | 280 | 치즈 추가 +40 |
| 떡볶이 | 220 | 맵기(필수) |
| 김밥 | 180 | 종류(야채/참치 +40/치즈 +30) |
| 군만두 6개 | 200 | — |
| 공기밥 | 40 | — |
| 콜라 | 60 | — |
| 식혜 | 80 | **품절 상태 체험용** |

**식당 B 바삭치킨하우스** — 섹션: 치킨 · 사이드 · 음료
| 후라이드 590 · 양념 620 · 간장 620 (각 옵션: 뼈/순살 +80, 소스 추가 +30) · 반반 620 (조합 선택 필수: 후라이드+양념/후라이드+간장/양념+간장) · 치킨텐더 320 · 감자튀김 150 · 치즈볼 5개 180 · 콘샐러드 80 · 치킨무 30 · 콜라 1.5L 120 · 맥주 120 (**숨김 상태 체험용 — 고객 미노출**) |
|---|

**마트 A 우리장터 한인마트** — 섹션: 라면·즉석 · 김치·장류 · 간식·음료 · 냉동
| 신라면 5입 320 · 짜파게티 4입 300 · 즉석밥 210g 110 (수량 묶음: 1/3개 300) · 포기김치 1kg 450 · 고추장 500g 280 · 된장 500g 260 · 참기름 320ml 350 · 조미김 10봉 250 · 바나나맛 우유 90 · 떡볶이떡 500g 180 · 냉동만두 1kg 420 · 계란 30구 330 |
|---|

**마트 B 프레시데이 마켓** — 섹션: 과일 · 정육 · 채소·곡물 · 생활
| 망고 1kg 220 · 바나나 1송이 90 · 수박 1통 250 · 사과 4입 240 · 삼겹살 500g 280 (두께: 구이용/수육용) · 불고기용 소고기 500g 480 · 생닭 1마리 260 · 양파 1kg 160 · 감자 1kg 120 · 쌀 5kg 380 · 생수 6L 90 · 식용유 1L 150 |
|---|

**공구류 A 튼튼공구상회** — 섹션: 전동공구 · 수공구 · 보관·기타
| 충전 드릴 2,800 (배터리 1개/2개 +900) · 앵글 그라인더 2,200 · 직소 2,600 · 드라이버 세트 450 · 망치 320 · 줄자 5m 180 · 펜치 250 · 몽키스패너 380 · 공구함 950 · 실리콘건 220 · 알루미늄 사다리 2,500 · 작업 장갑 80 |
|---|

**공구류 B 홈픽스 철물·안전** — 섹션: 철물 · 페인트 · 안전용품 · 전기
| 못 세트 120 · 나사 세트 150 · 자물쇠 350 · 경첩 2입 140 · PVC 파이프 1m 180 · 수성 페인트 1L 450 (색상 필수: 화이트/아이보리/그레이) · 붓·롤러 세트 220 · 안전모 380 · 보안경 150 · 소화기 1,200 · 멀티탭 4구 350 · LED 전구 120 |
|---|

**펫샵 A 멍냥펫마트** — 섹션: 사료 · 간식 · 용품
| 강아지 사료 3kg 1,200 (연령: 퍼피/어덜트/시니어 필수) · 고양이 사료 2kg 950 · 강아지 저키 간식 250 · 고양이 짜먹는 간식 4개입 180 · 고양이 모래 10L 480 · 배변패드 50매 420 · 공 장난감 150 · 하네스 450 (사이즈 S/M/L 필수) · 스테인리스 밥그릇 220 · 반려동물 샴푸 320 |
|---|

**펫샵 B 포근펫살롱 (service)** — 섹션: 강아지 · 고양이 · 추가 관리
| 목욕(소형견) 600 (체중: ~5kg / 5~10kg +200) · 전체 미용 1,200 · 부분 미용 700 · 발톱 정리 200 · 귀 청소 200 · 고양이 목욕 900 · 스파 추가 400 |
|---|

**카페 A 모닝브루 커피** — 섹션: 커피 · 논커피 · 디저트
| 아메리카노 140 (HOT/ICE 필수 · 사이즈 R/L +30 · 샷 추가 +40) · 카페라떼 170 (우유: 일반/오트 +40) · 바닐라라떼 190 · 카라멜마키아토 200 · 콜드브루 180 · 녹차라떼 180 · 망고 스무디 190 · 레몬에이드 160 · 크루아상 120 · 치즈케이크 180 · 초코 머핀 110 |
|---|

**카페 B 브레드앤브런치** — 섹션: 빵 · 브런치 · 음료
| 소금빵 90 · 크림치즈 베이글 150 · 바게트 130 · 단팥빵 80 · 에그 베네딕트 320 · 프렌치토스트 280 · 클럽 샌드위치 290 · 시저 샐러드 260 · 팬케이크 세트 300 (시럽: 메이플/초코/베리 필수) · 카페라떼 170 · 오렌지주스 150 |
|---|

**미용 A 헤어살롱 루미 (service)** — 섹션: 커트 · 펌·염색 · 케어
| 남성 커트 350 · 여성 커트 500 · 펌 2,500 (기장: 숏/미디엄 +500/롱 +1,000 필수) · 염색 2,000 (기장 필수) · 클리닉 1,200 · 드라이 300 · 두피 스케일링 800 |
|---|

**미용 B 데이지 네일&스킨 (service)** — 섹션: 네일 · 스킨케어
| 젤네일 기본 800 (아트 추가 +300) · 페디큐어 900 · 젤 제거 250 · 기본 페이셜 1,200 · 수분 집중 관리 1,500 · 속눈썹 펌 900 |
|---|

**학원 A 잉글리시랩 어학원 (service)** — 섹션: 성인 · 어린이 · 무료
| 1:1 영어회화 4회 4,000 (방식: 방문/온라인 필수) · 그룹 회화 8회 6,000 · IELTS 대비 8회 9,000 · 어린이 영어 8회 5,000 · 한국어 기초 8회 4,500 · 레벨 테스트 0 |
|---|

**학원 B 하모니 음악·운동교실 (service)** — 섹션: 음악 · 운동 · 체험
| 피아노 4회 3,500 · 기타 4회 3,200 · 보컬 4회 3,800 · 수영 8회 4,800 · 태권도 월 3,000 · 1회 체험 수업 500 |
|---|

**서비스 A 깨끗세탁 (service)** — 섹션: 세탁 · 드라이클리닝 · 특수
| 일반 세탁 1kg 80 (최소 3kg) · 셔츠 드라이 150 · 정장 한 벌 450 · 이불 500 (사이즈: 싱글/퀸 +150) · 운동화 세탁 350 · 다림질 1벌 60 |
|---|

**서비스 B 홈케어 청소·수리 (service)** — 섹션: 청소 · 수리·점검
| 원룸 청소 1,500 · 2BR 청소 2,500 · 에어컨 청소 1,200 (대수: 1/2대 +1,000) · 수도 수리 출장 800 · 전기 점검 900 · 입주·이사 청소 4,000 |
|---|

상태 체험: 식당 A 「식혜」 = `sold_out`, 식당 B 「맥주」 = `hidden`(관리자 화면에서만 보임). 그 외 전부 `active`.

### B-6. 이미지 구성·저장 방식

| 항목 | 내용 |
|---|---|
| 수량 | 매장 프로필 16 · 커버 16 · 메뉴 약 150 · 샘플 광고 12 = **약 194장** |
| 출처·권한 | 상업 이용·무출처 표기 허용 라이선스의 무료 사진(Unsplash License / Pexels License)에서 메뉴명과 일치하는 사진만 선택. **사진마다 원본 URL·작가·라이선스·내려받은 날짜를 매니페스트에 기록**(`docs/audit/delivery-sample-2026-10-28/image-manifest.md`). 상표·로고·사람 얼굴이 식별되는 사진 제외 |
| 저장 위치 | 외부 URL 직접 연결 금지. 기존 업로드 파이프라인(`processOwnerProductImageBuffer` → `uploadStoreProductWithHeroDerivative`)으로 `store-product-images/{sampleStoreId}/…` 원본+파생본 생성. 광고 이미지는 기존 1st-party 배너 업로드(`/api/admin/delivery-ads/upload-banner-image`) |
| 표시 | 기존 `DeliveryMediaImage`·이미지 로더 그대로 — 실매장과 같은 크롭·비율 |
| 이미지 없는 카드 방지 | 샘플 매장·메뉴 등록 시 이미지 필수 검사(관리자 샘플 카탈로그 API 서버 검증) |
| 고아 파일 | 기존 `store-product-images-orphan-gc` 크론 적용 대상 그대로 |

### B-7. 고객 목록·상세 표시

| 화면 | 표시 |
|---|---|
| 목록 카드(업종·홈) | 배지 행에 **「샘플 매장」** 배지(신규 배지 종류 `sample`, `resolveStoreListCardBadges` — 상태 배지 앞). 배달비·ETA·최소주문 줄 대신 「서비스 체험용 · 실제 주문 불가」 한 줄. 무료배달·쿠폰 배지 숨김 |
| 상세 헤더 | 매장명 옆 「샘플 매장」 배지 + 상단 안내 띠 「서비스 체험용 매장입니다. 실제 주문·결제는 되지 않습니다.」 |
| 메뉴 | 실매장과 같은 섹션·이미지·가격·설명·옵션·품절 표시 (현재 `canSell=false` 면 메뉴 전체를 「판매 중지」로 가리는 분기 → 샘플은 메뉴 표시) |
| 숨기는 CTA | 찜·문의·채팅·리뷰 작성·쿠폰 받기 (통계·알림 원천 차단) |
| 정렬 | 실매장 뒤에 배치(평점·주문수 가짜 값 없음). 실매장이 입점하면 자연히 아래로 밀림 |

### B-8. 주소 무관 노출 정책 — 처리 위치와 근거

- 현재 SSOT: 후보 = `approved AND is_visible` (두 RPC + 검색 쿼리), 범위 판정 = `store_delivery_coverage` + `store_discovery_shadow_in_range`, 제외 = `saved_address` 일 때 TS `shouldExcludeOutOfRangeFromNormalList`.
- 설계: **샘플은 「범위 판정 대상이 아닌 별도 후보군」**으로 같은 RPC 안에서 처리한다. 좌표·반경·`covers_all` 을 조작하지 않는다(샘플 매장은 좌표 NULL, 배달·픽업 플래그 OFF).

| 지점 | 변경 |
|---|---|
| `get_store_discovery_shadow_wave` · `get_stores_browse_snapshot` | 후보 조건에 `store_kind <> 'legacy_test'`(방어) 추가. `store_kind='sample'` 행은 전체 스위치 ON 일 때만 포함, 범위 판정·적격 순위 계산을 건너뛰고 **실매장 뒤** 정렬 키로 붙임. 업종·하위 필터는 동일 적용 |
| TS 범위 밖 제외 (`stores-browse-build.ts:882`, `load-store-discovery-ranked-live.ts`) | `isSample` 행은 제외·「범위 밖」 배지 대상에서 빠짐 |
| 홈 피드(`/api/stores/home-feed`) | 「매장」·「더 많은 매장」 선반만 샘플 포함. 평점·인기·할인·가까운 매장 선반은 실데이터 전용(가짜 지표 금지 계약 유지) |
| 검색(`searchDeliveryDomain`) | 매장·메뉴 검색에 `store_kind='sample' AND 스위치 ON` 분기 추가(배달 가능 조건 대신) |
| 상세 직접 접근 | `getApprovedStoreBySlug` 그대로(승인·노출) + 스위치 OFF 면 샘플도 404 |
| 캐시 | 스냅샷 키에 스위치 리비전 포함. 스위치 변경 = `bumpStorePublicSharedCacheGeneration` + 홈 피드·스냅샷 무효화 |
| 로그인·비로그인·주소 없음·주소 변경 | 샘플 포함 여부는 출처(origin)와 무관 → 모든 상태에서 동일 |
| 페이지네이션 | 한 RPC 결과에서 슬라이스 → 중복 없음(별도 API·병합 없음) |

이 변경은 Discovery 후보 원천 변경이므로 `docs/dibay-stores-composition-contract.md` 위반이 아니다(Composition 은 손대지 않음). 주소·서비스 지역 HARD LOCK 의 판정 함수(`evaluateDeliveryServiceArea`)·체크아웃 차단은 **변경 없음**.

### B-9. 실제 주문 차단과 체험 범위

**권장 체험 범위: 메뉴 상세 → 옵션 선택 → 금액 합계 확인까지. 「담기」·「주문하기」 버튼은 「샘플 매장 · 주문 불가」 비활성.** 장바구니에 넣지 않으므로 localStorage 장바구니·서버 재검증·주문서 경로에 샘플 데이터가 섞이지 않는다(결정 **O-2**).

3중 차단 (배달 제품 HARD LOCK RPC 무변경):

| 층 | 차단 | 근거 |
|---|---|---|
| 1 UI | `StoreOrderability` 에 `isSample` → 담기·바로주문·체크아웃 CTA 비활성 + 토스트 | 자기 매장 차단과 같은 경로 |
| 2 API | `validateStoreOrderCheckout`·장바구니 재검증에서 `store_sample_no_order` 반환 | 업무 규칙은 TS 검증 계층이라는 HARD LOCK 계약 |
| 3 DB | 샘플 매장의 `store_sales_permissions` 는 항상 미승인 — 트리거로 승인 전환 거부. 기존 RPC 가 `store_not_selling` 으로 거부 | `create_store_order_atomic` 기존 검사(174-182) 재사용, RPC 수정 없음 |

정산·수수료·Coin·상품권·통계: 주문 행이 생기지 않으므로 원장 경로 변경 없음.

### B-10. 관리자 제어

| 기능 | 방식 | 신규/재사용 |
|---|---|---|
| 유형·노출 구분 | 목록에 「유형」(실제/샘플/기존 테스트)·「노출」(노출/숨김) 두 열 + 필터(유형·업종·노출) | 기존 `/admin/stores` 확장 |
| 샘플 매장 추가·수정 | `/admin/stores` 에 「샘플 매장」 탭: 생성(업종·하위·이름·소개·영업시간·이미지)·수정 | 신규 관리자 API 1개(샘플 한정) |
| 메뉴·옵션·가격·이미지 | 샘플 매장 한정 관리자 카탈로그 편집. 오너 상품 저장의 서버 검증·이미지 파이프라인 **함수를 공유**(복사 금지) | 신규 라우트, 기존 코어 재사용 |
| 매장·메뉴 노출·숨김 | 기존 `set_store_visible` · 기존 상품 `hide/activate/sold_out` 액션 | 재사용 |
| 샘플 전체 노출 | 「샘플 전체 노출」 스위치 1개 (`admin_settings` 키) — 정식 오픈 시 OFF 한 번으로 전부 내림 | 재사용 테이블 |
| 테스트→실제 전환 | `store_kind` 변경 감사 액션(사유 필수) | 신규 액션 |
| 이력 | 전부 `audit_logs`(before/after·사유) | 재사용 |
| 샘플 광고 | 기존 `/admin/delivery-ads/first-party/new` 에 「샘플 광고」 체크 | 재사용 |

실매장 카탈로그는 지금처럼 오너 전용 — 관리자 샘플 편집 API 는 `store_kind='sample'` 이 아니면 403.

### B-11. 샘플 광고·배너

| 슬롯 | 비율 | 수량 | 연결 |
|---|---|---|---|
| 배달 홈 히어로 `stores_home_hero` | 39:16 | 3 (식당 A·카페 A·마트 A) | 각 샘플 매장 상세 |
| 홈 중간 `stores_home_inline` | 2:1 | 1 (펫샵 B) | 샘플 매장 상세 |
| 업종 상단 `stores_browse_top` | 2:1 | 8 (업종별 1, 그 업종 샘플 매장 A) | 샘플 매장 상세 |

- 원천: `store_banner_ad_campaigns`, `campaign_source='DIBAY_FIRST_PARTY'`(무과금·기존 작성기), **`is_sample=true`**.
- 표시: `DeliveryAdBanner` 의 `adLabel` 을 「광고」 대신 **「샘플 광고」**.
- 통계 분리: 로더가 `is_sample` 캠페인에 노출 토큰을 발급하지 않음 → 노출·클릭·전환 이벤트 0, 성과 RPC 무변경. 과금은 기존 1st-party 가드로 이미 0.
- 기간: 시작=적용일, 종료=정식 오픈 예정일(미정이면 90일 후 — 기존 연장 경로로 연장). 전체 스위치 OFF 시 샘플 광고도 함께 미노출.

### B-12. 기존 SSOT 재사용 여부

| SSOT | 재사용 |
|---|---|
| 매장·메뉴 테이블·옵션 `options_json`·메뉴 섹션 | 그대로 |
| 노출 `approval_status`+`is_visible` | 그대로(샘플도 승인·노출 필요) |
| Discovery 두 RPC·검색 | 조건 추가만(별도 샘플 API 없음) |
| 주문 RPC·상태 작성자·원장 | 무변경 |
| 관리자 매장 PATCH·감사 로그·캐시 무효화 | 그대로 + 가드 1개 |
| 이미지 파이프라인·Storage 버킷 | 그대로 |
| 1st-party 배너 작성기·슬롯 | 그대로 + 플래그 1개 |
| `is_sample_data` 선례(커뮤니티) | 명명 참고 — 매장은 3유형이라 `store_kind` |

### B-13. DB·API·UI 변경 목록

| ID | 구분 | 변경 | 필수 | 근거 |
|---|---|---|---|---|
| M-1 | DB | `stores.store_kind text NOT NULL DEFAULT 'real' CHECK IN ('real','sample','legacy_test')` + 부분 인덱스 | 필수 | 유형 구분 컬럼 없음(G-04) |
| M-2 | DB | `stores.owner_user_id` NOT NULL 해제 + `CHECK (owner_user_id IS NOT NULL OR store_kind='sample')` | 필수 | 1계정 1매장 유니크 + NOT NULL → 샘플 16곳에 가짜 계정 16개가 필요해짐(계정 생성 금지). 실매장은 CHECK 로 기존과 동일하게 오너 필수 |
| M-3 | DB | 트리거: 샘플 매장 판매권한 승인 거부 · 샘플 `delivery_available`/`pickup_available` true 거부 · `legacy_test` 노출 전환 거부 | 필수 | 주문 차단 3층 · 재노출 실수 방지 |
| M-4 | DB | `store_banner_ad_campaigns.is_sample boolean NOT NULL DEFAULT false` + `CHECK (NOT is_sample OR campaign_source='DIBAY_FIRST_PARTY')` | 필수 | 샘플 광고 구분(G-05). `campaign_source` 값 확장은 기존 `='DIBAY_FIRST_PARTY'` 가드 전부 수정이 필요해 제외 |
| M-5 | DB | `get_store_discovery_shadow_wave`·`get_stores_browse_snapshot` 후보·정렬 조건 | 필수 | §B-8 |
| M-6 | 데이터 | `admin_settings` 키 `delivery_sample_exposure_enabled`(기본 false) | 필수 | 전체 스위치 |
| W-1 | API | 관리자 매장 목록 필터(유형·업종·노출) | 필수 | G-01 |
| W-2 | API | 관리자 샘플 매장 생성·수정 · 샘플 카탈로그(메뉴·옵션·이미지) · 유형 변경 액션 | 필수 | G-02·G-03 |
| W-3 | API | 검색 샘플 분기 · `validateStoreOrderCheckout` 샘플 차단 · 홈 피드 선반 포함 규칙 | 필수 | §B-8·B-9 |
| W-4 | API | 샘플 배너 노출 토큰 미발급 · 1st-party 작성기 `is_sample` | 필수 | §B-11 |
| U-1 | UI | 카드 배지 `sample` · 상세 배지·안내 띠 · 메뉴 표시 분기 · CTA 비활성 · 찜/문의 숨김 | 필수 | §B-7 |
| U-2 | UI | 관리자 목록 열·필터 · 샘플 탭 · 스위치 · 광고 체크박스 | 필수 | §B-10 |
| X-1 | 데이터 | D-01 홈 섹션 QA 제목 5개 비움 | 결함 수정 | §A-1 |
| X-2 | 데이터 | 테스트 매장 분류(`legacy_test`) + 숨김 | 승인 대상 | §B-1·B-2 |
| X-3 | 데이터 | 샘플 매장 16·메뉴 약 150·이미지 약 194·샘플 광고 12 생성 | 승인 대상 | §B-4~B-11 |

네이티브 변경 없음 → 앱 재빌드 불필요(웹 배포 후 앱 재시작).

### B-14. 회귀 위험

| 위험 | 가능성 | 방지·검증 |
|---|---|---|
| `owner_user_id` NULL 을 가정한 코드가 샘플에서 오류(오너 캐시 무효화·알림·캐시 계정 FK) | 중 | 구현 전 `owner_user_id` 사용처 전수 grep → 샘플이 닿는 경로만 null 처리. 샘플은 주문·정산 경로를 타지 않음 |
| Discovery RPC 변경으로 실매장 순서·필터 변화 | 중 | 실매장 결과 동일성 테스트(스위치 OFF 시 RPC 결과 = 변경 전), 격리 DB(로컬 PG) 스위트 |
| 검색·목록 캐시 키 불일치로 스위치 반영 지연 | 중 | 스위치 리비전을 키에 포함, 반영 시간 측정 |
| 테스트 매장 숨김 후 구매자 주문 상세 링크 404 | 낮(테스트 데이터) | 실기기 확인 |
| 카드 배지·상세 분기로 실매장 UI 변화 | 낮 | `isSample=false` 경로 스냅샷 테스트, IA-19 래칫 |
| 배달 제품 HARD LOCK(RPC) 침범 | 없음 | RPC 무변경, `verify:delivery-product-hard-lock` 실행 |

### B-15. 배포·검증 방법

- 커밋 2개(도메인 분리): ① 배달 샘플 체계(웹+DB 파일) ② 없음 — D-01·X-2·X-3 은 데이터 작업이라 커밋 없음.
- 로컬: `typecheck:build` + 변경 관련 vitest + eslint + `verify:delivery-product-hard-lock` + `verify:routes`, 격리 DB 스위트(RPC 실매장 동일성·트리거).
- 운영 DB: 마이그레이션 적용(Owner 승인) → md5·`schema_migrations` 확인 → 데이터 작업은 관리자 화면·API 경로로 실행(직접 SQL 쓰기 금지) → 읽기 전용 대조.
- Production: main 반영 SHA 확인 후 고객·관리자 화면 확인. 실기기는 시나리오 승인 후.

---

## C. 단계별 실행 계획 (승인 후)

| 단계 | 내용 | 데이터 변경 | 검증 | 롤백 |
|---|---|---|---|---|
| 1 결함 | D-01 홈 섹션 제목 정정 | 5행 `title_ko/subtitle_ko` → NULL (관리자 화면) | 홈 제목 확인 | 이전 값 감사 로그로 복원 |
| 2 구조 | M-1~M-5 마이그레이션 + W-1~W-4 + U-1·U-2 → main 반영 | 스키마만(기존 행 `store_kind='real'`) | 로컬 1회 + 격리 DB, 스위치 OFF = 기존 동작 | 스위치 OFF 유지 시 고객 영향 0 · 마이그레이션 역방향 파일 준비 |
| 3 분류·숨김 | 테스트 매장(O-1 확정분) `legacy_test` + `is_visible=false` | 최대 17행(이미 숨김 3 포함) | 고객 목록 0, 관리자 목록 유지 | 유형 변경 액션 + `set_store_visible` |
| 4 샘플 생성 | 16매장·메뉴·이미지·광고 12 (스위치 OFF 상태로 등록) | 신규 행만 | 관리자 화면 검수 | 샘플 행 숨김(삭제 불필요) |
| 5 공개 | 스위치 ON | 설정 1행 | Production 고객 화면·검색·광고 | 스위치 OFF |
| 6 실기기 | 시나리오 작성 → Owner 승인 → 샤오미·삼성·iPhone | — | 승인 행렬 | — |

---

## D. Owner 승인이 필요한 결정

| ID | 결정 | 권장안 |
|---|---|---|
| **O-1** | 판정 보류 3곳(MANDOO CHOO.. / CM KIM FOOD MART / 개장수 — 실명형 닉네임, 상품·주문 0)을 테스트 매장으로 분류·숨김할지 | 3곳 모두 `legacy_test` + 숨김(정식 입점 시 유형 변경 액션으로 `real` 전환) |
| **O-2** | 샘플 체험 범위 | 메뉴·옵션 선택·금액 확인까지, 장바구니·주문서 진입 없음 |
| **O-3** | `owner_user_id` NOT NULL 해제(샘플 한정 CHECK) | 승인 — 가짜 계정 16개 생성 대안보다 안전 |
| **O-4** | 샘플 구성표(§B-4·B-5 매장명·메뉴·가격·옵션) | 표대로, 수정 지시 시 반영 |
| **O-5** | 이미지 출처 | Unsplash/Pexels 라이선스 사진 + 매니페스트 기록 |
| **O-6** | D-01 홈 섹션 QA 제목 5개 정정(운영 데이터) | 승인 — 기본 제목 복귀 |
| **O-7** | 운영 DB 마이그레이션 M-1~M-5 적용 및 데이터 작업 X-2·X-3 실행 | 단계 C 순서대로 승인 |

| **O-8** | E절 홈 구성·배너 결함 H-01~H-12 수정 범위 | E-4 표의 수정안대로, 샘플 체계와 **별도 커밋**(배너·홈 구성 도메인) |

범위 밖 보고(수정 안 함): D-02 검색의 픽업 전용 매장 제외 · 업종 미지정 매장 2곳 · 운영 매장 좌표 미설정(실주문 배달 차단 — 주소 HARD LOCK 운영 대기) · 레거시 `platform_ads` 12행 중 기간 지난 `is_active=true` 9행(현재 배달 슬롯 로더 원천이 아님 — 영향 NOT_PROVEN).

---

## E. 추가 감사 — 관리자 HOME 구성(`/admin/stores-home-shelves`) · 배너 반영·상위 노출 (2026-10-28 PHT)

- 근거: 코드(HEAD `8d9b4c7cb`) · 운영 DB 읽기 · **Production 고객 공개 API·화면 실측**(비로그인, `https://samarket.vercel.app/stores`, 2026-10-28 PHT). 관리자 화면은 로그인이 필요해 열지 않음 → 관리자 화면 판정 NOT_PROVEN.
- 운영 DB 기록: HOME 구성은 오늘 **17:17 PHT**(09:17 UTC)에 관리자 저장이 있었다. 저장값(인기 선반 제목 「주문이 많은 매장」)은 Production 고객 API 에 바로 나왔다 → **서버 경로는 즉시 반영 PASS**. 반영이 안 되는 곳은 배너·앱 화면 쪽이다(아래).

### E-1. 계약 대조 — 정상(PASS)

| 항목 | 근거 |
|---|---|
| 선반 저장 → 서버 즉시 반영 | `home-feed` 가 매 요청 `loadHomeFeedCompositionPolicyMeta` 를 DB 에서 새로 읽음(메모리 캐시 적중 시에도 `finalizeHomeFeedJsonPayload` 가 재조회, `route.ts:144-159,221`) + 저장 시 `bumpStorePublicSharedCacheGeneration` |
| HOME 단일 작성자 | 구 작성자 `PUT /api/admin/stores-composition-policy`(surface=home) 409 거부 유지 |
| CAS(동시 저장 충돌) | `expectedRevision` → 409 `stale_revision` |
| 히어로 비율·캐러셀 | DB `delivery_ad_inventories` 39:16 = 코드 · 5초 자동 · 최대 5장(`banner-placement-capacity-ssot.ts`) |
| 「매장」·「금방 도착」 선반 | DB `enabled=true` 지만 카탈로그 `unavailable`(CUT 2 제거·보류) → 고객 미노출. 결함 아님(의도된 잠금) |

### E-2. 결함

| ID | 등급 | 결함 | 근거 | 실측 |
|---|---|---|---|---|
| **H-01** | P1 | **고객 홈에 QA 문자열 제목 노출** — 「QA-PR-HOME-TITLE 브랜드」(할인·프로모 선반), 「DIBAY_CUT9_QA_1787588665247_HOME」(더 많은 매장 선반). 「지금 주문」 선반은 부제 「QA-PR-HOME-SUB」, 제목은 오늘 저장값 「신규 배장 」(오탈자·끝 공백, 「신규 매장」 선반과 이름 중복) — 이 선반은 현재 데이터가 없어 미노출 | DB `store_composition_policy_overrides` · `stores-home-shelf-product-resolve.ts:95-97` | **Production 화면 FAIL 확인**(비로그인 홈) |
| **H-02** | P1 | **배너 변경이 앱 화면에 즉시 반영 안 됨** — 히어로·홈 중간 배너는 컴포넌트가 처음 그려질 때 **1회만** 조회(`useEffect(…, [])`). 당겨서 새로고침·앱 복귀 재조회는 매장 피드(`loadFeed`)만 다시 받고 배너는 그대로 → 관리자가 배너를 등록·종료·순서 변경해도 배달 홈을 벗어났다 돌아오거나 앱을 다시 열 때까지 이전 배너 | `StoresHomeHeroBanner.tsx:25-44`, `StoresHomeBeforeRestBanner.tsx:18-41`, `StoresHomeHub.tsx:329-356` | 코드 확정 · 실기기 NOT_PROVEN |
| **H-03** | P1 | **새 배너가 관리자 지정 순서를 무시하고 맨 앞으로 올라감** — 새 캠페인 `sort_order` = 0(1st-party 작성기 하드코딩, DB 기본값 0). 정렬은 `sort_order` 오름차순 → 같으면 **시작일이 늦은(새) 배너 우선** → 관리자가 1번(0)으로 둔 배너 앞에 새 배너가 끼어듦 | `delivery-ad-admin-first-party-writer.ts:244`, DB 기본값, `store-banner-ad-campaign-authority.ts:72-81` | 코드·DB 확정 |
| **H-04** | P2 | **배너 순서 저장이 원자적이지 않고 대상 검증 없음** — 행마다 개별 UPDATE(트랜잭션·CAS 없음, 중간 실패 시 순서 섞임) · 히어로가 아닌 배너 ID 도 받아들임 · 일부만 보내면 나머지와 순번 충돌 | `lib/admin/ads-exposure/reorder-hero-banners.ts:50-63` | 코드 확정 |
| **H-05** | P1 | **배너를 만들어도 슬롯이 꺼져 있으면 보이지 않고 경고도 없음** — Production: 홈 중간 슬롯 `homeBannerBeforeRest` = **OFF**, 업종 상단 `bannerAds` = 기본 **OFF**(식당 행도 false). 1st-party 작성기는 두 슬롯에 ACTIVE·APPROVED 로 생성하지만 고객 API 는 `physicalEnabled:false` 로 빈 목록. 슬롯 스위치가 화면 3곳에 흩어짐(히어로 = 스위치 없음 · 홈 중간 = 광고 배치 정책 패널 · 업종 상단 = 카테고리 정책 화면), HOME 관리 화면에는 배너 정보 0 | `delivery-ad-admin-first-party-writer.ts:50-54`, `home-before-rest-banners/route.ts:17-20`, `browse-top-banners/route.ts:41-44`, `delivery-ad-stage2-surface-contract.ts:159` | Production API `physicalEnabled:false` 확인 |
| **H-06** | P2 | **홈 중간 배너 위치를 올릴 수 없음** — 배너 슬롯의 `section_order`(9)를 무시하고 「더 많은 매장」 선반 렌더 분기 안에서만 그림 → 그 선반이 꺼지거나 매장이 0이면 배너도 사라짐, 상위 배치 불가 | `StoresHomeHub.tsx:447-454,487-494` | 코드 확정 |
| **H-07** | P2 | **배너 스위치가 다른 선반 순서를 덮어씀 + 권한 불일치** — 홈 중간 배너 ON/OFF 저장이 4개 슬롯 순서를 기본값으로 재정렬(HOME 관리에서 바꾼 「더 많은 매장」 순서가 조용히 되돌아감). 권한은 `isRouteAdmin`(관리자 누구나) — HOME 관리 저장은 `business` 권한 필요 | `stores-home-before-rest-banner/route.ts:22-27,96-99,58` vs `stores-home-shelves/route.ts:122` | 코드 확정 |
| **H-08** | P2 | **선반 저장이 원자적이지 않고 같은 열을 두 번 씀** — ① CAS 구성 저장 후 ② 선반별 개별 upsert 13회(제목·표현·설정)가 CAS 밖에서 `enabled`·`section_order` 를 다시 씀. ② 중간 실패 시 리비전만 올라가고 제목 일부만 저장, 동시 저장 시 ② 끼리 덮어쓰기 | `stores-home-shelves/route.ts:178-213`, `stores-home-shelf-product-db.ts:84-122` | 코드 확정 |
| **H-09** | P3 | **앱 재진입 시 이전 구성이 먼저 보였다가 바뀜** — 홈 피드 클라이언트 캐시(메모리 10분·세션 45초)를 먼저 그리고 뒤에서 재검증 → 관리자 변경 직후 첫 화면에 예전 제목·순서가 잠깐 보임(그 뒤 정상) | `store-home-feed-client-cache.ts:10-12`, `StoresHomeHub.tsx:206-257` | 코드 확정 |
| **H-10** | P3 | **배너 없을 때 화면 밀림** — 히어로는 로딩 동안 140px 빈 자리를 잡았다가 0건이면 접힘. Production 히어로 0건 → 홈 진입마다 콘텐츠가 위로 튐 | `StoresHomeHeroBanner.tsx:63-79` · Production API `hero:0` | 코드 확정 · 화면 NOT_PROVEN |
| **H-11** | P3 | **배너 조회에 매장 목록과 같은 위치 값이 안 넘어감** — 주석(ADC-04)은 「목록과 같은 origin」이지만 배너 fetch 는 쿼리 없이 호출 → 비로그인 좌표 사용자는 목록과 다른 기준 | `StoresHomeHeroBanner.tsx:29`, `home-hero-banners/route.ts:21` | 코드 확정 |
| **H-12** | P3 | **계약 문서·DB 값 불일치(SSOT 이중화)** — 광고 SSOT 문서는 홈 중간 `FUTURE/false`·업종 상단 `3:1 FUTURE` 인데 DB·코드는 `ACTIVE`·`2:1`. DB `max_active_campaigns`(히어로 10·업종 상단 5)는 런타임이 쓰지 않는 값으로 코드 수용량(5·3)과 다름. HOME SSOT 문서 §12 선반 ID(`popular`·`delivery_fee_discount`·`promo_campaign`)가 카탈로그(`popular_menu`·`delivery_fee_benefit`·`editorial_promo`)와 다름 | `docs/dibay-delivery-advertising-ssot.md:39-48`, DB `delivery_ad_inventories`, `docs/dibay-stores-home-category-current-ssot.md` §12 | DB·문서 확정 |

### E-3. 「즉시 반영 안 됨」 원인 정리

| 변경 | 서버 | 고객 앱 화면 | 판정 |
|---|---|---|---|
| 선반 제목·순서·ON/OFF | 즉시(다음 요청) | 재진입 시 예전 구성 잠깐 표시 후 갱신(H-09) | 서버 PASS · 화면 지연 |
| 배너 등록·종료·순서 | 즉시(캐시 없음, `no-store`) | **화면을 벗어날 때까지 그대로**(H-02) · 새 배너가 맨 앞에 끼어듦(H-03) | **FAIL** |
| 홈 중간·업종 상단 배너 | 슬롯 OFF 면 항상 빈 목록 | 만들어도 안 보임(H-05) | **FAIL (운영 설정 + 경고 부재)** |

### E-4. 수정안 (승인 후 구현 — 지금은 미구현)

| ID | 근본 수정 | 변경 | 배포 |
|---|---|---|---|
| H-01 | 운영 데이터: 3개 QA 제목·부제 비움(기본 제목 복귀) + 「지금 주문」 제목 기본값 복귀. 저장 시 제목 앞뒤 공백 제거 | 데이터(관리자 화면) + 웹 1줄 | O-6 와 합침 |
| H-02 | 히어로·홈 중간 배너를 **홈 피드 응답 한 번에 포함**(이미 있는 `meta.homeInsertions` 경로) → 새로고침·복귀·재진입이 배너까지 한 번에 재검증. 배너 전용 개별 fetch 제거 | 웹 | 웹만 |
| H-03 | 배너 생성 시 같은 슬롯 `max(sort_order)+1` 부여(작성기 3곳 공통 함수), 동률 정렬은 먼저 등록된 배너 우선 | 웹 | 웹만 |
| H-04 | 순서 저장을 단일 DB 함수(트랜잭션 + 슬롯 검증 + 전체 목록 필수 + 갱신 시각 CAS)로 | DB 함수 + 웹 | 웹+DB |
| H-05 | 배너 작성기가 대상 슬롯 OFF 면 「슬롯 꺼짐 — 고객 미노출」 경고 반환·표시. HOME 관리 화면에 배너 3슬롯 상태(ON/OFF·노출 중 개수·바로가기) 읽기 전용 표시 | 웹 | 웹만 |
| H-06 | 홈 중간 배너를 독립 구성 슬롯으로 렌더(자기 `section_order` 위치) — HOME 관리 화면 순서 편집에 포함 | 웹 | 웹만 |
| H-07 | 배너 스위치는 `enabled` 만 변경(순서 재정렬 삭제), 권한 `business` 로 통일 | 웹 | 웹만 |
| H-08 | 구성 + 선반 필드를 단일 DB 함수 한 트랜잭션·한 CAS 로 저장 | DB 함수 + 웹 | 웹+DB |
| H-09 | 응답 `meta` 에 구성 리비전 포함, 캐시 리비전이 다르면 캐시 선표시 대신 재검증 결과로 그림 | 웹 | 웹만 |
| H-10 | 히어로 빈 자리는 직전 응답에 배너가 있었을 때만 예약(H-02 와 함께 피드 응답으로 판단) | 웹 | 웹만 |
| H-11 | H-02 로 해소(피드와 같은 요청·같은 위치 값) | — | — |
| H-12 | 광고 SSOT·HOME SSOT 문서를 운영 DB·코드 값으로 갱신, 쓰이지 않는 DB `max_active_campaigns` 를 코드 수용량과 맞추거나 「미사용」 주석 | 문서 + 데이터 | 문서만 |

회귀 위험: H-02·H-06 은 홈 화면 렌더 순서·첫 화면 속도에 닿음 → 홈 피드 단일 응답 계약(`stores-home-feed-load-policy.ts`)·첫 카드 지표 유지 확인, 실기기(샤오미·삼성·iPhone)에서 배너 등록 → 당겨서 새로고침 → 즉시 표시 확인. H-04·H-08 은 DB 함수라 운영 적용 Owner 승인 필요(O-7 와 같은 절차).

---

## F. 재판정 — 임시·땜빵·중복 구조 검증 (2026-10-28 PHT, Owner 「설계안 미승인」 지시)

**이 절이 B·D·E-4 의 해당 내용을 대체한다.** 기존 감사 PASS 를 재사용하지 않았다. 이번에 직접 본 것은 코드·운영 DB(읽기)·Production 비로그인 고객 홈/공개 API 뿐이다. 코드·DB·데이터·배포 변경 0.

### F-0. 이번에 새로 확인한 구조 사실

| 사실 | 근거 |
|---|---|
| 고객 노출 조건 `approved AND is_visible` 이 **TS 30개 파일 + SQL 함수 18개 마이그레이션**에 각각 작성돼 있다(기존 중복) | `grep` 집계 |
| 랭킹 RPC `get_store_discovery_shadow_wave` 는 배달 불가·좌표 없음 매장도 후보에 넣는다(`v_gi=1` ORDERABLE·배달 OFF, 3~5 휴식·마감·미정). 범위 밖 판정은 순위용 | `20260823220000_…sub_filter_contract.sql:100-118` |
| 범위 밖 **제외**는 TS 단일 정책 `resolveListDistanceOutOfRange`/`shouldExcludeOutOfRangeFromNormalList` 하나를 목록·홈·검색·배너 6곳이 공유. 좌표 없는 매장은 `missing_store_coords` → 주소 등록 회원에게서 제외 | `lib/delivery/delivery-list-oor-policy.ts:27-46` + 사용처 6 |
| 검색만 후보를 별도 쿼리로 만들고 `delivery_available=true` 를 추가 요구 | `search-delivery.ts:286,360` |
| 주문 가능 판정 TS 단일 함수 `resolveStoreOrderability` 를 상세·상품·장바구니 메타·체크아웃 검증이 공유. 최종 차단은 `create_store_order_atomic`(판매권한 미승인 → `store_not_selling`) | `store-orderability-policy.ts` + 사용처 5 |
| 메뉴 표시 여부는 `canSell`(판매권한) 하나로 결정 — false 면 메뉴 전체를 「판매 중지」로 가림 | `fetch-store-summary-public.ts:69-75`, `StorePublicMenuList.tsx:201` |
| `stores.owner_user_id` 참조: **TS 171개 파일**(그중 `String(owner_user_id)` 형 변환 99줄 — NULL 이면 문자열 `"null"`), **DB 함수 31개**(주문 RPC·Realtime 접근·오너 스냅샷·광고·캐시), RLS 정책 약 50개 | grep · `pg_proc` · `pg_policies` |
| 오너 상품 등록·수정 로직은 **라우트 핸들러 안에 직접 작성**(519줄·648줄) — 관리자 경로가 공유할 코어 함수 없음 | `app/api/me/stores/[storeId]/products/route.ts`, `[productId]/route.ts` |
| 광고 노출 토큰은 공통 함수 1개(`issueEligibleDeliveryAdExposure`)를 **5개 로더**가 호출, 기록은 RPC `delivery_ad_record_impression/click` 1쌍 | grep |
| HOME 구성 저장 CAS 는 RPC `save_store_composition_policy_surface_cas` 1개. 선반 제목 등은 그 밖에서 개별 upsert | `stores-composition-policy-db.ts:121`, `stores-home-shelf-product-db.ts:84-122` |
| 홈 피드·배너 모두 좌표 쿼리를 보내지 않음(같은 기준) | `stores-home-feed-query-gate.ts`, 배너 fetch |

### F-1. 판정표

| ID | 현재 구조 | 최초 원인 | 임시·땜빵 여부 | 제안 설계의 적합성 | 필요한 조치 |
|---|---|---|---|---|---|
| S-1 `store_kind` | 매장 「유형」 축 없음. `business_type`·업종 ID 는 업종 축, 노출은 `is_visible` | 실제/샘플/테스트 구분 원천 부재 | — | **정상** (업종·노출과 다른 축, 충돌 없음). 단 `legacy_test`→노출 금지 트리거는 「유형이 노출을 결정」하는 두 번째 노출 규칙 | `store_kind` 유지. 테스트 매장 재노출 방지는 트리거 대신 **관리자 노출 액션 1곳**(`set_store_visible`)의 확인 단계로 — 노출 원천은 `is_visible` 하나 |
| S-2 `owner_user_id` NULL | NOT NULL + 1계정 1매장 유니크 | 샘플에 실제 오너가 없음 | NULL 허용 + CHECK 는 **원인 미해결 상태의 모델 변경** — 171파일·31함수가 오너 존재를 가정 | **NOT_PROVEN → 현 설계 철회** | 구현 전 **오너 ID 사용처 전수 조사**(171파일·31함수·RLS)로 ① NULL 허용 ② 시스템 운영 계정 중 하나를 증거로 결정. 결정 전 샘플 구현 착수 불가 |
| S-3 Discovery 샘플 분기 | 후보 = RPC(이미 배달 불가 매장 포함) · 제외 = TS 단일 정책 · 검색 = 별도 쿼리 | 샘플이 빠지는 지점은 **TS 범위 밖 정책 1곳 + 검색 쿼리 1곳**뿐 | 기존안(RPC 2개 수정·정렬 키·스위치 조건)은 **중복 구조** — 30곳 노출 조건에 샘플 조건을 퍼뜨림 | **철회** (M-5 RPC 수정 불필요) | ① 범위 밖 정책 함수 1곳에 「샘플 = 주소 판정 대상 아님」 입력 추가(6곳 자동 상속) ② 검색은 D-02(배달 전용 후보) 정책 결정과 함께 — 검색 후보를 목록과 같게 맞추면 샘플 전용 분기 0 |
| S-4 주문 차단 | UI·검증 = `resolveStoreOrderability` · DB = 판매권한 | 샘플 판정 원천 없음 | 기존안의 「`canSell=false` 여도 샘플은 메뉴 표시」 예외는 **땜빵**(판매권한 의미를 화면에서 뒤집음) | **변경** | `resolveStoreOrderability` 결과에 사유(`own_store`·`not_selling`·`sample`) 추가 → 메뉴 표시·CTA·체크아웃이 같은 사유를 읽음. 샘플 판매권한은 실제 상태 그대로 미승인 → 기존 RPC 가 최종 차단(HARD LOCK RPC 무변경). 승인 전환 금지 트리거 1개 |
| S-5 관리자 샘플 메뉴 편집 | 관리자 = 상태·검수만, 오너 등록·수정은 라우트 내부 로직 | 공유 코어 부재 | 「공유 함수 재사용」 주장은 **근거 없음** — 그대로 만들면 **중복 구조**(오너 로직 복제) | **철회** | 먼저 오너 카탈로그 쓰기 코어(검증·저장·이미지·캐시 무효화)를 라우트에서 분리 — 오너 HARD LOCK 영역 리팩터라 Owner 승인·회귀 테스트(P1J 등) 필요. 이후 오너·관리자 라우트는 게이트만 다르고 같은 코어 호출 |
| S-6 샘플 광고 | 광고 원천 `campaign_source`, 이벤트 RPC 1쌍 | 샘플 여부는 「목적지 매장이 샘플인가」로 이미 결정됨 | 기존안 `is_sample` 컬럼은 **중복 구조**(매장 유형과 이중 원천) | **철회** | 라벨·통계 제외 모두 목적지 `store_kind` 에서 파생. 통계 제외는 기록 RPC 1곳에서(5개 로더 무변경) |
| S-7 전체 노출 스위치 | 노출 원천 `is_visible` | — | 스위치는 30곳 노출 조건에 들어가야 하는 **두 번째 노출 원천** | **철회** | 관리자 「샘플 일괄 노출/숨김」 = 샘플 매장들의 `is_visible` 일괄 변경(감사 로그). 우선순위 문제 자체가 사라짐 |
| H-01 QA 제목 | 운영 데이터 | 테스트 저장값 잔존 | — | 정상 조치(데이터) | 관리자 화면에서 정정 |
| H-02 배너 반영 | 배너 2종이 화면 최초 1회만 조회, 홈 새로고침·복귀 수명주기 밖 | **배너가 홈 로드 수명주기에 속하지 않음** | 「배너 화면만 강제 재조회」면 땜빵 | 기존안(피드 응답에 포함)은 원인 제거하나 히어로 선표시·피드 단일 페이로드 핫패스에 영향 — **NOT_PROVEN(성능)** | 홈 허브의 단일 로드 수명주기(마운트·새로고침·복귀)가 배너도 함께 갱신하도록 소유권 이동. 요청 분리/합침은 홈 첫 화면 측정 후 결정 |
| H-03 새 배너 끼어들기 | 작성기 3곳 `sort_order=0`, DB 기본 0, 동률 최신 우선 | 순번 부여 책임이 작성기마다 흩어짐 | 기존안 「작성기마다 max+1」은 **중복 구조** | **변경** | 순번은 DB 1곳(삽입 시 같은 슬롯 끝 번호)에서 부여, 작성기 하드코딩 제거 |
| H-04 순서 저장 | 행별 UPDATE, 검증·CAS 없음 | 트랜잭션 경계 없음 | — | **적합** | DB 함수 1개(슬롯 검증·전체 목록·CAS) |
| H-05 슬롯 꺼짐 배너 | 슬롯 게이트는 슬롯별 단일 소유(계약) — 작성기·관리 목록이 게이트를 모름 | 작성기가 런타임 게이트를 읽지 않음 | 기존안 「경고 문구」는 증상 표시 | **변경** | 런타임 게이트 함수(`homeBannerBeforeRestPolicyEnabled`·`resolveBrowseScopePolicy().bannerAds`)를 관리 목록·작성기가 그대로 호출해 「미노출(슬롯 꺼짐)」 상태 표시. 새 규칙 없음 |
| H-06 홈 중간 배너 위치 | 「더 많은 매장」 직전 고정 | Stage 2 계약(「rest_stores 앞 경계」)대로 | — | **결함 철회** — 계약상 정상. 「상위 노출」은 계약 변경 요청 | 결함 대상 아님. 단 DB `section_order=9` 는 소비처 없는 값 → 표시하지 않도록 정리(H-12 와 함께) |
| H-07 배너 스위치 순서 재정렬 | 토글 API 가 4개 슬롯 순서를 기본값으로 덮어씀 | 과거 순서 이전(Stage 2)용 보정 코드가 런타임 경로에 남음 | **땜빵 확인** | 적합(삭제) | 재정렬 코드 삭제(현 운영 순서 9·10·11·12 정합 확인), 권한을 `business` 로 통일 |
| H-08 HOME 저장 | CAS RPC 1개 + CAS 밖 개별 upsert 13회가 같은 열 재기록 | 저장 책임 2분할 | **중복 구조 확인** | 적합 | 선반 필드를 기존 CAS RPC 한 호출·한 트랜잭션으로 |
| H-09 재진입 선표시 | 캐시 먼저 → 재검증 교체 | 의도된 SWR(체감 성능 계약) | — | **결함 철회 (정상)** | 조치 없음 |
| H-10 히어로 빈 자리 | 로딩 140px 예약 후 접힘 | 데이터 전 공간 예약 | — | H-02 소유권 이동과 함께 | 직전 결과 기준 예약 |
| H-11 배너 위치 값 | 홈 피드·배너 모두 좌표 미전달 | — | — | **결함 철회 (정상)** — 같은 기준 | 조치 없음 |
| H-12 문서·DB 이중 값 | 수용량 코드 5·3 vs DB 10·5, 문서 슬롯 상태·비율 구버전 | 런타임이 안 쓰는 DB 값 잔존 | **중복 구조 확인** | 적합 | 수용량 원천을 코드 SSOT(Owner LOCK)로 확정, DB 값 정렬·문서 갱신 |
| D-02 검색 후보 | 검색만 `delivery_available` 요구 | 검색 후보 쿼리가 목록과 별도 작성 | **중복 구조** | — | Owner 정책 결정 필요(픽업 전용 매장 검색 포함 여부). S-3 ② 와 연결 |

### F-2. 3개 영역 감사 완료 여부 — 재판정: **미완료**

| 영역 | 이번에 실제로 확인 | 판정 |
|---|---|---|
| 고객 | 코드 + Production 비로그인 홈·공개 API(제목·배너·노출 매장) | 홈 일부만 확인. 장바구니·주문서·주문·취소·검색·상세·뒤로가기·태블릿 **NOT_PROVEN** |
| 오너 | 이번 라운드 확인 없음(이전 HARD LOCK 재사용 안 함) | 전 항목 **NOT_PROVEN** |
| 관리자 | 코드·DB만, 화면은 로그인 필요로 미확인 | 화면 전 항목 **NOT_PROVEN** |

A절의 「코드 PASS」는 코드 근거일 뿐 프로세스 완료 판정이 아니다.

### F-3. 요약

- **확인된 땜빵:** H-07(이전용 순서 보정이 런타임에 남음). 기존 설계안 중 S-4 「canSell 예외」.
- **확인된 중복 구조:** H-08(HOME 저장 2분할) · H-12(수용량 이중 값) · D-02(검색 후보 별도) · 기존 노출 조건 30곳 분산(기존 구조, 이번 범위에서 늘리지 않음). 기존 설계안 중 S-3(RPC 분기)·S-5(메뉴 편집 복제)·S-6(`is_sample`)·S-7(스위치)·H-03(작성기별 순번).
- **철회:** M-2(NULL 오너 — 판정 보류) · M-4(`is_sample`) · M-5(RPC 2개) · M-6(전체 스위치) · 정렬 키 · canSell 예외 · H-06·H-09·H-11 결함 판정.
- **유지(정상 구조):** `store_kind`(S-1) · 노출 원천 `is_visible` 단일 · 주문 RPC 무변경 · 범위 밖 TS 단일 정책 · 1st-party 무과금 배너 · CAS RPC · H-04·H-08·H-12 수정 방향.
- **샘플 구현 전 반드시 해결:** S-2 오너 ID 전수 조사 → 모델 결정 · S-5 오너 카탈로그 쓰기 코어 분리(Owner 승인) · D-02 검색 후보 정책 결정 · H-01 QA 제목.
- **샘플 구현과 함께 처리 가능:** S-3 ①·S-4·S-6·S-7·H-03·H-05·H-12.
- **샘플과 무관 — 별도 커밋(배너·HOME):** H-02·H-04·H-07·H-08·H-10.
- **판정 불가(NOT_PROVEN):** S-2 · H-02 성능 영향 · 숨김 매장 주문 상세 동작 · 관리자 화면 전부 · 오너·고객 프로세스 실행.

### F-4. 최종 판정

**현재 설계안(B·D·E-4)으로는 「기존 배달 서비스 안정성을 보존한 정식 운영 구조」라고 판정할 수 없다.** 중복 구조 5건을 철회·변경하면 샘플은 기존 SSOT(노출 `is_visible`, 범위 밖 정책 1곳, 주문 판정 1곳, 주문 RPC 무변경, 1st-party 배너)를 그대로 타는 구조가 된다. 그러나 **S-2(오너 없는 매장)·S-5(메뉴 쓰기 코어)** 두 선행 과제는 지금 근거로 안전성을 증명할 수 없어, 이 둘의 조사·설계를 먼저 승인받아야 한다.

#### Owner 승인 요청 (이 절 기준으로 교체)

| ID | 승인 요청 |
|---|---|
| P-1 | F-1 판정(철회·변경·유지)을 정정 설계안의 기준으로 확정 |
| P-2 | S-2 선행 조사 착수(오너 ID 사용처 171파일·31함수·RLS 전수 — 읽기만, 결과로 모델 결정안 제출) |
| P-3 | S-5 선행 설계 착수(오너 카탈로그 쓰기 코어 분리 설계 — 오너 HARD LOCK 영역, 설계만) |
| P-4 | D-02 정책: 검색 후보를 목록과 같게(픽업 전용·샘플 포함) 할지 |
| P-5 | 배너·HOME 결함(H-02·H-04·H-07·H-08·H-10·H-12) 별도 수정 설계 진행. H-02 는 홈 첫 화면 측정 포함 |
| P-6 | H-01 QA 제목 운영 데이터 정정 |
