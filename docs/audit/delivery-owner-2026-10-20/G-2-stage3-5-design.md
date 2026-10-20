# 문서 G (Part 2) — 통합 정상화 설계: 3단계 광고·매장 운영·위치·고객 응대 / 4단계 메뉴·UI/UX/CTA·SSOT / 5단계 전 구간 회귀 검증

- 작성 2026-10-21 PHT · 설계 문서만(저장소·DB 변경 없음). 기준: `origin/main` `816b00fa`(P0-1~P0-5 반영) 코드 재확인. 감사 근거 원문: `docs/audit/delivery-owner-2026-10-20/` D·E·F·C, `appendix/{ADS-GFT,ACC-OPS,LOC,PRD,IA}.md`.
- 고정 Owner 정책(재질문 금지): **D-0**(직접 DB 쓰기 차단, 적용 완료) · **D-1**(수수료 ON, `2026-10-20 20:30 UTC` 이전 생성 주문 소급 없음) · **D-5**(과거 운영 데이터는 테스트 자료 → 정리·환불·정정 금지, 코드만 수정) · URL 보존 · 12그룹 IA 채택.
- 병렬 구현 중(설계 대상 아님, 참조만): ORD-02 · ORD-03 · ORD-05 · DLV-03 · IA-01 · IA-02 · IA-03 · ACC-03. 이 문서에서 **「1-B 게이트」** = IA-01~03 구현이 만드는 공통 오너 접근 함수(`resolveOwnerStoreAccess` / `assertOwnerStoreWritable`)를 뜻한다.

## 머리말 — 집계

| 단계 | 결함(ID 기준) | 중복 원인 통합 후 작업 단위 | 심각도 | 배포 구분 |
|---|---|---|---|---|
| **3단계** 광고·매장 운영·위치·고객 응대 | **43** (ADS 14 · IA-04(=ADS-20)·IA-05·IA-06 3 · OPS 8 · LOC 11 (LOC-008=ORD-08) · PRD-10~16 7) | 근본 원인 통합 **9건**(RC-1~RC-9) → 작업 묶음 5개(3-A~3-E) | P1 4 (ADS-01·ADS-02·ADS-03·LOC-003) · P2 13 · P3 26 | 웹 + DB (설정 변경 없음 — 기존 `delivery-ads-schedule-transitions` 크론 재사용) |
| **4단계** 사이드 메뉴·UI/UX/CTA·SSOT | **16** (IA-07~IA-21, IA-23) + 12그룹 레지스트리 명세 + 오너 화면 **44행** 일관성 명세 | 근본 원인 통합 **3건**(RC-10 레지스트리 파생 · RC-11 공통 피드백·상태 부재 · RC-12 매장 컨텍스트 해석 분기) → 작업 묶음 8개(4-0~4-7) | P3 16 | 웹만 |
| **5단계** 주문자↔오너↔관리자 회귀 | 시나리오 **10군 31케이스** · 검증 층 5개(L1~L5) · 운영 읽기 전용 불변식 SQL 12개 | — | — | 검증 전용(배포 없음) |

**[배포 구분] 웹 + DB (네이티브 없음)** — 3·4단계의 모든 변경은 `app/`·`components/`·`lib/`·`supabase/migrations/` 이다. `android/**`·`ios/**`·`capacitor.config.ts`·Capacitor 의존성 변경 없음 → 앱 재빌드·버전 증가 불필요, main 반영 후 앱 재시작으로 확인. 운영 DB 적용 항목은 항목별 Owner 승인(개발 프로세스 2번 — 정책 결정이 아니라 절차 승인).

### 신규 Owner 정책 결정 (기존 D-0~D-23 에 없는 것만)

| ID | 결정 사항 | 권장안 | 막히는 항목 |
|---|---|---|---|
| **ND-3** | **격리 환경 쓰기 회귀 테스트 실행 지시** — 5단계 L2(DB 계약 테스트)·L3(Playwright 쓰기 시나리오)는 DB 쓰기가 필요하다. 운영 DB 쓰기 금지, `dibay-test`·`dibay-reset-qa` 는 명시 지시 없이 사용 금지(절대 금지 1번), 새 Supabase 프로젝트 생성도 금지. 어느 격리 DB 를 쓸지(또는 쓰기 테스트를 하지 않을지) Owner 지시가 필요하다. 아울러 Vercel Preview 가 어느 Supabase 를 가리키는지 NOT_PROVEN — 운영을 가리키면 Preview 대상 쓰기 e2e 도 금지 | `dibay-test` 1곳을 「5단계 회귀 전용」으로 명시 지시 + Preview 는 읽기 시나리오만 | 5단계 L2·L3 쓰기 케이스 전부, OPS-08/LOC-004 RPC 변경의 SQL 회귀 |

그 외 이 문서 범위의 정책 쟁점은 **설계로 확정**했거나(근거를 각 항목 8번에 기록) **기존 미결 결정**(D-9·D-10·D-11·D-12·D-13·D-14·D-15·D-17·D-18·D-19·D-23)에 이미 포함된다. 기존 미결 결정은 항목마다 권장안을 적어, Owner 가 「권장안대로」 한 줄로 승인할 수 있게 했다.

### D-5 적용 원칙 (이 문서 전체 공통)

과거 운영 행을 고치는 대신 **(a) 읽기 시점 파생**(예: 기간 지난 ACTIVE 를 화면·판정에서 종료로 해석) 또는 **(b) 기준 시각 이후 행에만 자동 전이** 를 쓴다. (b) 는 P0-5 와 같은 패턴 — 마이그레이션 상수 `c_apply_from constant timestamptz := '<적용 시각>'` 를 두고 `created_at/submitted_at >= c_apply_from` 인 행만 크론·트리거가 처리한다. 운영 기존 행(₱480 미심사 광고 4건, 만료 ACTIVE 파트너 1건, 만료 active 쿠폰 40건, 좌표 없는 배달 매장 9곳, 판정 스냅샷 NULL 639건, `defaultMaxKm:60` 설정값)은 **변경하지 않는다**.

---

# 3단계 — 광고 · 매장 운영 · 위치 · 고객 응대

## 3-0. 선행 조건

| 선행 | 이유 | 상태 |
|---|---|---|
| 0-B(P0-1·P0-2 REVOKE) | 오너 쓰기가 API 경유로만 가능해야 API 검증 추가가 의미 있음 | 완료 `816b00fa` |
| 0-A(P0-3·P0-4) | LOC-006·LOC-007 은 소유 검사 정상화 후, PRD-16 은 `lib/stores/store-owned-image-urls.ts` 재사용 | 완료 |
| **1-B 게이트**(IA-01·02·03, ACC-03) | 3단계 오너 쓰기 라우트(쿠폰·광고·공지·지역)는 공통 게이트 1개를 호출해야 한다. 3단계는 게이트를 **호출만** 하고 정의하지 않는다 | 구현 중 — 3-C·3-D 착수 전 main 반영 필요 |
| 2-E(PRD-03~09, OPS-02) | 3-E(PRD-10~16)가 `sold_out_reason`(PRD-06)·`expected_updated_at`(PRD-07)·공용 캐시 세대(OPS-02)를 사용 | 승인 대기 — 3-E 는 2-E 뒤 |
| 주문 RPC 최신 정의 | OPS-08·LOC-004 가 `create_store_order_atomic` 을 재정의. PRD-03(2-E)도 같은 함수를 바꾼다 → 3단계 마이그레이션은 **운영 `pg_get_functiondef` 최신본**에서 시작(저장소 파일과 드리프트 가능, FIN-10) | 착수 시 확인 |

## 3-1. 근본 원인 통합 (중복 원인 병합)

| RC | 공통 근본 원인 | 묶인 결함 |
|---|---|---|
| RC-1 | 「배달 ON ⇒ 매장 좌표 있음」 불변식이 API 쓰기 순간에만 있고 판정 함수·DB 에 없음 | LOC-003, LOC-005 |
| RC-2 | 매장 좌표 쓰기가 「변경 여부」와 「주문 당시 근거」를 구분하지 않음(항상 재전송 → 진행 주문 직선거리 덮어씀, 판정 스냅샷 미저장) | LOC-004, LOC-013 |
| RC-3 | 주문 가능 「실효 영업 상태」가 TS 한 곳(`resolveStoreFrontCommerceState`)에만 있고 오너 화면·주문 RPC·휴무 입력이 각자 다른 값 사용 | OPS-03, OPS-04, OPS-08 |
| RC-4 | 오너 매장 PATCH(`app/api/me/stores/[storeId]/route.ts`)의 필드별 검증 누락 | OPS-05, OPS-07, OPS-09 (+LOC-007·LOC-013 은 같은 파일이지만 RC-2·위치 도메인으로 분리 커밋) |
| RC-5 | 광고 수명주기 SQL(`admin_delivery_ad_transition`·`delivery_ad_system_schedule_transition`)이 기간(`end_at`)·펀딩을 상태 전이 조건으로 쓰지 않음 | ADS-01, ADS-11, ADS-12 |
| RC-6 | 광고 가격 스냅샷과 캠페인 기간·인벤토리가 독립 컬럼(SSOT 이탈) | ADS-02 |
| RC-7 | 금전이 걸린 다단계 쓰기를 TS 에서 순차 실행(보상 삭제·2단계 커밋) | ADS-03, ADS-04, ADS-13 (+ADS-05 는 같은 파트너 writer 의 만료 판정) |
| RC-8 | 쿠폰 상태 권위가 `lifecycle_state` 와 `is_active` 둘이고, 오너 전이에 상태표·CAS·멱등이 없음 | IA-04(=ADS-20), IA-05, IA-06, ADS-23, ADS-24 |
| RC-9 | 노출·이벤트 집계가 매장 자격·서버 발급 식별자를 쓰지 않음 | ADS-06, ADS-09, ADS-10 |

나머지 단독 원인: ADS-08(관리자 권한키), OPS-01(운영 테이블 부재), OPS-10(i18n), LOC-006·007·008·009·010·011·012, PRD-10~16.

## 3-2. 작업 묶음과 순서 (의존성 순)

| 순서 | 묶음 (= main 반영 1회) | 결함 | 선행 | 배포 |
|---|---|---|---|---|
| 1 | **3-A 위치·배달 판정** | LOC-003 → LOC-005 → LOC-010·LOC-009 → LOC-013 → LOC-004 → LOC-006 → LOC-007 → LOC-008 → LOC-011 → LOC-012 | 0-A·0-B | 웹 + DB(LOC-004 RPC, LOC-005 트리거, LOC-006 RPC, LOC-008 RLS) |
| 2 | **3-B 매장 운영** | OPS-09·OPS-05·OPS-07(RC-4) → OPS-03 → OPS-04 → OPS-08 → OPS-01 → OPS-10 | 3-A 의 주문 RPC 마이그레이션과 **같은 RPC 재정의 1회로 합침**(OPS-08+LOC-004) | 웹 + DB |
| 3 | **3-C 쿠폰** | IA-04 → IA-05 → IA-06 → ADS-23 → ADS-24 | 1-B 게이트 | 웹 + DB(인덱스·컬럼 1) |
| 4 | **3-D 광고** | ADS-08 → ADS-06 → ADS-01·ADS-11·ADS-12(RC-5) → ADS-02 → ADS-03·ADS-04·ADS-05 → ADS-09·ADS-10 → ADS-13 | 1-B 게이트 | 웹 + DB |
| 5 | **3-E 상품 P3** | PRD-15 → PRD-10 → PRD-14 → PRD-11 → PRD-12 → PRD-13 → PRD-16 | 2-E | 웹 (+DB: PRD-11 RPC 1) |

> 주문 RPC 재정의(OPS-08·LOC-004)는 **주문 도메인 커밋 1회**로 분리해 3-A 와 3-B 사이에 둔다(다른 도메인 혼합 금지 원칙 + 같은 함수 2회 재정의 방지). HARD LOCK `docs/dibay-delivery-product-hard-lock.md` reopen 대상이며 `npm run verify:delivery-product-hard-lock` 을 갱신한다.

---

## 3-A. 위치·배달 판정

### LOC-003 · 배달 가능 판정 fail-open — **P1 · 웹** (RC-1)
1. **원인**: `lib/delivery/evaluate-delivery-serviceability.ts:57` `if (!policy.enabled)` 와 매장 override `disabled`(`:86-95`)가 좌표 검사보다 먼저 `eligible:true` 반환. V2 동일(`lib/delivery/service-area/evaluate-delivery-service-area.ts:131-150`). 설정 조회 오류 시 기본값 OFF 로 대체(`lib/delivery/delivery-ops-settings.ts:190-205` `loadDeliveryDistanceSettings` → `console.error` 후 기본값).
2. **영향**: 주문자 — 배달 불가 매장에 주문 성립. 오너 — 배달할 수 없는 주문 수신→거절. 관리자 — 거리정책 OFF·DB 일시 오류 순간 좌표 없는 9곳이 전 회원에게 열림.
3. **수정**: (a) 두 evaluator 맨 앞에 `fulfillment=local_delivery && 매장 좌표 없음 → {eligible:false, applies:true, reason:'missing_store_coords'}` (정책 분기보다 먼저). (b) `loadDeliveryDistanceSettings` 가 오류 시 `throw DeliveryPolicyUnavailable` — 주문 라우트(`app/api/me/store-orders/route.ts` 판정 구간)는 503 `delivery_policy_unavailable`, 목록·상세는 프로세스 내 마지막 성공값(없으면 fail-closed). DB 변경 없음.
4. **연동**: 주문자 장바구니·체크아웃 → `evaluateDeliveryServiceArea` 단일 판정(HOME/BROWSE/SEARCH/ORDER NOW/상세/장바구니/체크아웃 공용, 호출부 불변) → 주문 RPC 미호출 → 오너 주문 없음 → 관리자 `/admin/delivery/settings` 표시 불변 → 주문자는 「배달 불가(매장 위치 미등록)」 안내.
5. **검증**: vitest — `policy.enabled=false + storeLat=null → eligible=false`, override disabled 동일, 설정 로더 오류 mock → 주문 503·목록 마지막값. 5단계 S08.
6. **보존**: 좌표 있는 매장의 판정 결과는 정책 ON/OFF 모두 현행과 동일(테스트 고정). 목록 OOR(`resolveListDistanceOutOfRange`)은 이미 missing_store_coords 를 OOR 로 처리 → 일관.
7. **운영 데이터·정산**: 데이터 변경 0. 좌표 NULL 배달 매장 9곳은 배달 주문 불가가 된다(픽업은 불변) — D-5 상 테스트 자료이므로 의도된 결과. 금전 영향 없음.
8. **Owner 결정**: 없음 — 문서 불변식 「null-geo store → not orderable」(`docs/dibay-delivery-address-service-area-final-ssot-hard-lock.md`) 그대로 구현. F 의 1-C 선행 「D-5(9곳 처리)」는 D-5 확정(정리 안 함)으로 해소.

### LOC-005 · 배달 ON + 좌표 NULL 을 DB 가 막지 않음 — **P2 · DB** (RC-1)
1. **원인**: 검사가 `patch.delivery_available === true` 인 요청에서만(`app/api/me/stores/[storeId]/route.ts:303-315`, `app/api/admin/stores/[id]/route.ts:563-571`). `stores` 에 해당 CHECK 없음.
2. **영향**: 주문자 — 목록엔 보이고 체크아웃에서 `delivery_store_coords_required`. 오너·관리자 — 정합 깨진 매장이 계속 생길 수 있음.
3. **수정**: `CHECK … NOT VALID` 는 **쓰지 않는다** — PostgreSQL 은 NOT VALID 여도 기존 행 UPDATE 시 검사하므로 9곳 오너가 전화번호만 바꿔도 저장 실패한다. 대신 `BEFORE INSERT OR UPDATE` 트리거 `stores_guard_delivery_requires_geo`: `NEW.delivery_available AND (NEW.lat IS NULL OR NEW.lng IS NULL)` 이면서 **(INSERT 이거나 `delivery_available`·`lat`·`lng` 중 하나가 바뀐 경우)만** 예외 `delivery_store_coords_required`. 마이그레이션 파일 1개.
4. **연동**: 오너 기본정보 저장 → API 400(기존 코드와 같은 오류 코드) → DB 이중 방어 → 관리자 `set_store_location`·`set_delivery_radius` 동일 → 주문자 판정은 LOC-003 으로 이미 차단.
5. **검증**: 격리 DB(ND-3) 트리거 4케이스(INSERT 위반·배달 ON 전환 위반·좌표 삭제 위반·무관 컬럼 UPDATE 통과). 운영 적용 후 `pg_trigger` 존재 확인(읽기).
6. **보존**: 무관 컬럼 저장은 9곳 포함 전부 통과. service_role 쓰기도 동일 규칙(관리자 오류 코드 동일).
7. **운영 데이터·정산**: 기존 9행 변경 0(D-5). 금전 무관.
8. **Owner 결정**: 없음(운영 DB 적용 절차 승인만).

### LOC-010 · 장바구니 사전 판정 vs 체크아웃 경계 차이 — **P3 · 웹**
1. **원인**: `app/api/stores/[slug]/delivery-serviceability/route.ts:59` 는 `isDeliveryRoutableMasterAddress`(0,0 거부) 적용, 주문 라우트(`app/api/me/store-orders/route.ts:575-587, 625-637`)는 미적용. `lib/stores/fetch-store-delivery-serviceability-client.ts:132` `isDeliveryDistanceOrderBlocked` 가 `missing_customer_coords` 를 차단으로 보지 않음.
2. **영향**: 주문자 — 장바구니 「주문 가능」 → 결제 400. 오너·관리자 영향 없음(운영 해당 주소 0).
3. **수정**: 주문 라우트에도 `isDeliveryRoutableMasterAddress` 적용(같은 helper), 클라 helper 가 `missing_customer_coords` 를 차단+「주소 좌표 필요」 CTA(주소 편집 링크)로 표시.
4. **연동**: 주문자 장바구니 → serviceability API → 체크아웃 → 같은 거부 사유 코드 → 오너·관리자 무변.
5. **검증**: vitest(0,0 주소 → 사전·최종 모두 거부, 동일 코드).
6. **보존**: 정상 주소 판정 불변.
7. **운영 데이터**: 없음.
8. **Owner 결정**: 없음.

### LOC-009 · V2 `missing_lgu_identity` 오류 코드 오매핑 — **P3 · 웹**
1. **원인**: `app/api/me/store-orders/route.ts:651` `missing_lgu_identity → delivery_customer_coords_required`.
2. **영향**: 주문자 — 좌표가 있는데 「좌표 필요」 안내(V2 매장 0 → 잠재).
3. **수정**: 신규 코드 `delivery_address_lgu_unresolved` + i18n(ko/en/fil) + 장바구니 클라 매핑. 
4. **연동**: 주문자 → 주문 라우트 → 오류 코드 → 클라 문구. 오너·관리자 무변.
5. **검증**: vitest 매핑 테이블.
6. **보존**: 기존 코드 값 유지(추가만).
7. **운영 데이터**: 없음. 8. **Owner 결정**: 없음.

### LOC-013 · 기본정보 저장마다 좌표 재전송 → 진행 주문 ETA 재계산·discovery 무효화 — **P3 · 웹** (RC-2)
1. **원인**: `components/business/OwnerStoreBasicInfoForm.tsx:760-768` 가 좌표 미변경에도 lat/lng 전송 → `app/api/me/stores/[storeId]/route.ts:401` `storeLocationPatchTouchesCoords` true → `afterCanonicalStoreLocationWrite`·`refreshStoreOrdersCheckoutGeoAfterStoreLocationChanged`.
2. **영향**: 오너 — 전화번호만 바꿔도 진행 배달 주문 전부 UPDATE(LOC-004 덮어쓰기 유발). 주문자 — ETA 표시가 의도 없이 바뀜. 관리자 — 원인 추적 불가.
3. **수정**: 서버에서 `patch.lat === current.lat && patch.lng === current.lng`(소수 7자리 비교)면 좌표 키 제거 후 `touchesCoords` 판정. 클라도 dirty 필드만 전송(이미 `currentRow` 보유).
4. **연동**: 오너 저장 → PATCH → (좌표 실변경일 때만) 위치 후처리 → 주문자 ETA·목록.
5. **검증**: 라우트 vitest — 동일 좌표 PATCH 시 후처리 미호출, 변경 시 1회.
6. **보존**: 실제 좌표 변경 경로(ETA 재계산·discovery 무효화)는 그대로.
7. **운영 데이터**: 없음. 8. **Owner 결정**: 없음.

### LOC-004 · 주문 시 판정 스냅샷 미저장 + 매장 이동 시 진행 주문 직선거리 덮어쓰기 — **P2 · 웹+DB** (RC-2)
1. **원인**: `lib/delivery/store-order-serviceability-snapshot-ready.ts:6` `STORE_ORDER_SERVICEABILITY_SNAPSHOT_READY = false`(운영 컬럼은 존재) → `app/api/me/store-orders/route.ts:847-859` 저장 생략, 저장도 RPC 이후 별도 UPDATE(비원자). `lib/stores/sync-store-orders-checkout-geo.ts:83` `update(eta)` 가 `computeStoreOrderCheckoutEtaSnapshot` 결과 전체(`checkout_straight_distance_meters` 포함, `compute-store-order-checkout-eta-snapshot.ts:44-54`)를 덮어씀.
2. **영향**: 주문자·오너 분쟁 시 「주문 당시 배달 가능 근거」 없음. 관리자 — 반경 초과 의심 주문 판정 불가.
3. **수정**: (a) 주문 라우트가 판정 결과 `{eligible,max_km,reason,store_lat,store_lng}` 를 `create_store_order_atomic` 의 `p_order` jsonb 에 넣고, RPC 가 같은 INSERT 에서 `checkout_serviceability_*`·`checkout_store_latitude/longitude` 기록(**주문 RPC 재정의 1회 — OPS-08 과 합침**). 플래그 true, 사후 UPDATE 제거. 멱등 재시도 경로(`:828-845`)는 기존 행 반환이라 자동 일치. (b) `sync-store-orders-checkout-geo.ts` 는 ETA 필드만 갱신하도록 `checkout_straight_distance_meters`·`checkout_route_distance_meters` 를 update 객체에서 제외.
4. **연동**: 주문자 체크아웃 → 판정 → RPC 원자 INSERT → 오너 주문 상세(스냅샷 읽기 전용 표시 선택) → 관리자 주문 상세에 「주문 당시 판정」 표기 → 주문자 상세 불변.
5. **검증**: vitest(라우트가 jsonb 에 스냅샷 포함). 격리 DB(ND-3) RPC 테스트: 주문 1건 → 컬럼 NOT NULL. 운영 반영 후 읽기 SQL: 반영 시각 이후 local_delivery 주문 `checkout_serviceability_reason IS NULL` = 0(불변식 I-8).
6. **보존**: RPC 의 기존 검증 순서·잠금·반환 형태 불변(키 추가만). `verify:delivery-product-hard-lock` 갱신.
7. **운영 데이터**: 기존 NULL 639건 변경 0(D-5). 금전 무관.
8. **Owner 결정**: 없음(운영 DB 함수 적용 절차 승인).

### LOC-006 · V2 지역 교체 비원자·LGU 미검증·감사·동시성 없음 — **P2 · 웹+DB**
1. **원인**: `lib/delivery/service-area/store-delivery-service-areas.ts:106-157` `replaceStoreDeliveryServiceAreas` — DELETE → INSERT → `stores` UPDATE 3단계, 카탈로그에 없는 `geo_identity` 도 그대로 저장(`:120-121` display fallback = id), 버전 검사 없음, 오너 라우트 감사 없음.
2. **영향**: INSERT 실패 시 V2 매장 전면 주문 불가(주문자·오너), 잘못된 id 는 매칭 0. 관리자 — 누가 바꿨는지 모름. V2 매장 0 → 잠재.
3. **수정**: SECURITY DEFINER RPC `replace_store_delivery_service_areas(p_store_id, p_ids text[], p_activate bool, p_source text, p_actor uuid, p_expected_updated_at timestamptz)` — `stores` FOR UPDATE → 버전 불일치 409 → DELETE/INSERT/authority 한 TX. 서버는 호출 전 `getPlatformPhLguDisplayNameById` 로 id 검증(없으면 400 `unknown_lgu`). 오너·관리자 라우트 모두 RPC 사용, 성공 시 `appendAuditLog(store.delivery_service_areas_replace, before/after)`. 오너 라우트는 1-B 게이트(정지·반려 403).
4. **연동**: 오너·관리자 편집기(`DeliveryServiceAreaEditorCore`) → RPC → `evaluateDeliveryServiceArea` V2 분기 → 주문자 판정.
5. **검증**: vitest(미등록 id 400, 409 매핑). 격리 DB(ND-3) 실패 주입 → 기존 행 유지.
6. **보존**: 테이블·판정 함수·편집기 UI 불변. P0-3 소유 검사(`owner-gate.route.test.ts`) 유지.
7. **운영 데이터**: 8행 변경 0. 8. **Owner 결정**: 없음.

### LOC-007 · 매장 위치 변경 감사·근접성 검증 없음 — **P2 · 웹**
1. **원인**: 좌표 숫자 입력(`OwnerStoreBasicInfoForm.tsx:974-990`), 주소 변경 시 기존 좌표 재전송(`:735-768`), 근접성 검사 없음(`lib/stores/store-location-patch-consistency.ts:23-63`), 오너 PATCH 감사는 재제출 때만(`[storeId]/route.ts:364-389`).
2. **영향**: 오타 좌표 1건으로 배달 지역 전체 이동(주문자 판정 변화·오너 주문 급감), 관리자 추적 불가.
3. **수정**: (a) 좌표 실변경 시 `appendAuditLog({actor_type:'user', action:'store.owner_location_change', before, after})`. (b) 기존 좌표 대비 이동거리 > **1 km** 또는 저장된 city 의 LGU(`resolveStoreHomeLguId`)와 불일치면 409 `store_location_move_confirm_required` → 폼이 확인창(`OwnerStoreAdminConfirmModal`, 이동거리·주소 표시) 후 `confirmLocationMove:true` 재전송. 지도 핀(D-10)은 범위 밖.
4. **연동**: 오너 저장 → 확인창 → PATCH → 감사 → (LOC-013) 실변경 시 위치 후처리 → 주문자 판정 → 관리자 매장 상세 감사 이력.
5. **검증**: 라우트 vitest(감사 1건, 1km 초과 409, 확인 플래그 200).
6. **보존**: 관리자 `set_store_location`(감사 있음) 불변, 1km 이내 저장 UX 불변.
7. **운영 데이터**: 없음. 8. **Owner 결정**: 없음 — 1 km 확인창은 차단이 아닌 확인이라 설계로 확정. 「승인 매장 이동 시 관리자 검토」 같은 신규 승인 절차는 도입하지 않는다(현행 계약 유지). 지도 핀은 기존 D-10.

### LOC-008 (=ORD-08) · 종료 주문 구매자 전화·주소·좌표 무기한 열람 — **P2 · 웹+DB**
1. **원인**: `app/api/me/stores/[storeId]/orders/[orderId]/route.ts:220` select 에 `buyer_phone, delivery_formatted_address, delivery_detail_address, delivery_latitude, delivery_longitude` 무조건 포함. RLS `store_orders_owner_select` 전체 컬럼.
2. **영향**: 주문자 개인정보 장기 노출. 오너는 종료 후 연락 필요성 낮음. 관리자 — DPA(필리핀) 대응 근거 없음.
3. **수정**: 공용 helper `maskBuyerContactForOwner(row, now)` — 상태 `completed/cancelled/refunded` 이고 종료 시각 + N일 경과 시 전화 끝 4자리 외 마스킹, 상세주소·좌표 null. 오너 상세·목록 API·주문 채팅 헤더가 모두 사용. RLS: `store_orders` 오너 직접 SELECT 를 서버 API 전용으로 전환하려면 Realtime 영향이 있으므로 1차는 **API 마스킹만**, RLS 컬럼 제한은 Realtime 구독 컬럼 확인 후 별도 마이그레이션.
4. **연동**: 주문자 주문 → 오너 진행 중 전체 열람(불변) → 종료+N일 후 오너 API 마스킹 → 관리자 화면은 마스킹 없음(권한) → 주문자 무변.
5. **검증**: vitest(상태·경과일 매트릭스). L3 읽기 e2e(오너 종료 주문 상세 마스킹).
6. **보존**: 진행 주문 처리(배달 주소·전화)는 불변 — 마스킹은 종료 상태에서만.
7. **운영 데이터**: 데이터 변경 0(읽기 마스킹). 금전 무관.
8. **Owner 결정**: 기존 **D-15**(N일) 미결 — 권장안 **종료 후 30일**(감사에서 「30일 경과 638건」 기준 사용).

### LOC-011 · 운영 거리정책 JSON 레거시 값(`defaultMaxKm:60`, `deprioritize`) — **P3 · 웹**
1. **원인**: 운영 `admin_settings.delivery_distance_policy` 값 ↔ 코드 무시(`lib/delivery/delivery-ops-settings.ts:83-90`, `lib/stores/store-delivery-radius.ts:7-9`).
2. **영향**: 관리자 — 화면이 원값을 보여주면 오해(표시 NOT_PROVEN). 주문자·오너 판정 영향 없음.
3. **수정**: 관리자 설정 GET 이 **정규화 값**(코드가 실제 쓰는 값)을 반환하고 원값과 다르면 「저장 시 정규화됨」 표기. 다음 관리자 저장 시 정규화 값으로 기록(정상 운영 행위).
4. **연동**: 관리자 설정 화면 ↔ 판정 함수 동일 값.
5. **검증**: vitest(정규화 함수).
6. **보존**: 판정 결과 불변.
7. **운영 데이터**: 자동 덮어쓰기 없음(D-5). 8. **Owner 결정**: 없음.

### LOC-012 · 라이더 위치 API 가 토글 무시 — **P3 · 웹**
1. **원인**: `app/api/me/rider/location/route.ts` → `riderSelfPostLocation`(`lib/stores/store-order-delivery-service.ts:771-805`) 토글 미검사. 웹훅은 검사(`app/api/webhooks/delivery-rider-location/route.ts:41-45`).
2. **영향**: 관리자가 끈 위치 수집이 계속 저장(라이더 0명 → 잠재).
3. **수정**: `loadDeliveryRiderLocationEnabled` 검사 → false 면 409 `rider_location_disabled`.
4. **연동**: 라이더 → API → (OFF) 저장 안 함 → 관리자 라이더 화면 무변.
5. **검증**: vitest. 6. **보존**: ON 일 때 동작 불변. 7. **운영 데이터**: 없음. 8. **Owner 결정**: 없음(D-6 배달 주체 정책과 무관한 버그 수정).

---

## 주문 RPC 재정의 (OPS-08 + LOC-004) — 주문 도메인 커밋 1회 · DB

- `create_store_order_atomic` 에 (1) `v_store.pickup_available/delivery_available` 대비 `p_order->>'fulfillment_type'` 검사(`fulfillment_not_supported`), (2) 실효 영업 SQL 함수 `store_front_commerce_open(business_hours_json, is_open, now())` 검사(`store_closed`), (3) LOC-004 스냅샷 컬럼 INSERT 를 추가한다. 기존 Pass1~3 순서·`FOR UPDATE`·반환 형태 불변.
- (2)의 SQL 함수는 OPS-03 의 확장 모델(요일·휴무일·임시휴무)을 TS 와 **같은 고정 fixture 표**로 검증한다: TS 는 vitest, SQL 은 격리 DB(ND-3). ND-3 미결이면 (1)·(3)만 먼저 배포하고 (2)는 대기(TS 판정이 이미 막고 RPC 는 `is_open` 직렬화로 수동 마감은 안전 — 잔여 위험은 스케줄 경계 ms 창).

## 3-B. 매장 운영

### OPS-09 · 영업시간·갤러리 null 저장이 NOT NULL 충돌 500 — **P3 · 웹** (RC-4)
1. **원인**: `app/api/me/stores/[storeId]/route.ts:248-249`(`business_hours_json = null`), `:262-263`(`gallery_images_json`), 관리자 `set_business_hours`(`app/api/admin/stores/[id]/route.ts:536-547`). 컬럼 `NOT NULL DEFAULT '{}'/'[]'`.
2. **영향**: 오너 — 500 + DB 원문 노출. 관리자 동일. 최소주문·배달비·결제수단이 같은 JSON → 「초기화」 실패.
3. **수정**: null → `{}`/`[]` 치환(오너·관리자 공용 정규화 함수). `business_hours_json` 전체 덮어쓰기 lost update 방지: PATCH 바디 `expected_updated_at` 허용 → `.eq('updated_at', expected)` 0행이면 409 `store_changed`(PRD-07 과 같은 계약).
4. **연동**: 오너 저장 → PATCH → 주문자 영업·최소주문 판정(`parseCommerceExtrasFromHoursJson`) → 관리자 매장 상세 동일 JSON.
5. **검증**: vitest(null 치환, 409).
6. **보존**: 정상 JSON 저장 경로 불변. `expected_updated_at` 미전송 요청은 현행처럼 허용(점진 적용 — 오너 폼 2종부터 전송).
7. **운영 데이터**: 없음. 8. **Owner 결정**: 없음.

### OPS-05 · 이메일 저장 시 PH 휴대폰 정규화로 소실 — **P3 · 웹** (RC-4)
1. **원인**: `app/api/me/stores/[storeId]/route.ts:195-196` `const norm = normalizePhMobileDb(et); patch.email = norm;` → 이메일은 항상 null(`lib/utils/ph-mobile.ts:106-110`).
2. **영향**: 오너 — 이메일 저장 불가(조용히 삭제). 관리자 — 연락처 누락. 주문자 무관.
3. **수정**: 이메일 검증(`^[^\s@]+@[^\s@]+\.[^\s@]+$`, ≤254) → 소문자 저장, 실패 400 `invalid_email`.
4. **연동**: 오너 기본정보 → PATCH → 관리자 매장 상세 이메일.
5. **검증**: vitest(`a@b.com` 저장, 잘못된 형식 400).
6. **보존**: 전화번호 정규화(`:181`) 불변.
7. **운영 데이터**: 과거 null 된 이메일 복구 안 함(D-5). 8. **Owner 결정**: 없음.

### OPS-07 · 미승인 매장 노출 토글 허용 → `first_listed_at` 조기 기록 — **P3 · 웹+DB** (RC-4)
1. **원인**: API 차단 집합이 `rejected/suspended` 만(`[storeId]/route.ts:29`), `is_visible` 패치 허용(`:203-207`). 트리거 `stores_protect_first_listed_at` 가 승인 무관 스탬프.
2. **영향**: 주문자 홈 「신규 매장」 정렬 왜곡(`stores-home-composer.ts:349`). 노출 자체는 approved 조건으로 막힘.
3. **수정**: API — `is_visible` 변경은 `approval_status==='approved'` 일 때만, 아니면 409 `store_not_approved_for_visibility`(관리자 API 와 같은 코드). 트리거 — `NEW.approval_status='approved'` 조건 추가.
4. **연동**: 오너 `/settings` 토글(UI 는 이미 승인 매장만) → API → 트리거 → 홈 정렬 → 관리자 승인 시 최초 노출일.
5. **검증**: vitest(pending 매장 409). 격리 DB(ND-3) 트리거.
6. **보존**: 승인 매장 토글 동작 불변.
7. **운영 데이터**: 비승인+first_listed_at 0건 — 변경 없음. 8. **Owner 결정**: 없음 — UI 와 관리자 API 가 이미 같은 규칙.

### OPS-03 · 요일별 영업시간·휴무일·임시휴무가 주문 가능 판정에 미반영 — **P2 · 웹** (RC-3)
1. **원인**: `lib/stores/store-auto-hours.ts:65-93,149-187` 은 단일 일일 open/close + 휴게 + `is_open` 만. 휴무는 자유 텍스트(`components/business/OwnerStoreProfileForm.tsx:107,296-298` → `components/stores/StoreDetailInfoPublic.tsx:196-203`). 주석 「임시휴무 반영」(`:146`) 불일치.
2. **영향**: 주문자 — 「월요일 휴무」 매장에 월요일 주문. 오너 — 수동 토글 반복·거절. 관리자 — 거절·취소 증가.
3. **수정**: `business_hours_json.auto_business_hours` 확장 — `weekly:{mon..sun:[{open,close}]|null}`, `closed_dates:[YYYY-MM-DD]`. `isNowWithinAutoSchedule` 를 Asia/Manila 기준으로 확장(기존 단일 open/close 는 `weekly` 미설정 시 그대로 해석 — 하위 호환). discovery 투영(`compute-discovery-schedule-projection`)·공개 표시·RPC(SQL 함수)가 같은 모델. 오너 프로필 폼에 요일 행·휴무일 선택(매장 어드민 셸 §3 컨트롤).
4. **연동**: 오너 프로필 저장 → `business_hours_json` → 주문자 상세·목록·장바구니(`resolveStoreFrontCommerceState`) → 주문 RPC(SQL 함수) → 오너 홈 카드(OPS-04) → 관리자 매장 상세 동일 판정.
5. **검증**: vitest fixture 표(요일·휴무일·자정 넘김·휴게 겹침), 동일 표를 SQL 함수에 적용(ND-3). 5단계 S07 확장.
6. **보존**: 기존 자동시간 매장 1곳·휴무 텍스트 0곳 — `weekly` 없으면 현행 해석 동일(회귀 fixture 고정).
7. **운영 데이터**: JSON 마이그레이션 없음(신규 키 선택). 8. **Owner 결정**: 없음 — 임시 영업중지(자동 재개)·바쁨 모드는 기존 **D-9**(이 결함 수정에 포함하지 않음).

### OPS-04 · 오너 영업 카드가 `is_open` 원값 — **P3 · 웹** (RC-3)
1. **원인**: `components/stores/owner/dashboard/OwnerHomeStoreStatusCard.tsx:24`, `components/business/admin/BusinessAdminOpenToggle.tsx:11-14` 가 `parsePostgresBool(row.is_open, true)`. 구매자·관리자는 `resolveStoreFrontOpen`.
2. **영향**: 오너 — 휴게·시간 외인데 「영업중」. 주문자·관리자와 다른 상태.
3. **수정**: 카드·헤더가 `resolveStoreFrontCommerceState` 결과(영업중/휴게중/영업시간 외/휴무일/수동 마감) 라벨 표시, 토글 라벨은 「주문 받기(수동)」로 수동 플래그임을 명시.
4. **연동**: 오너 홈·헤더 ↔ 주문자 상세 ↔ 관리자 컨트롤센터 동일 함수.
5. **검증**: vitest(상태별 라벨), L5 오너 실측.
6. **보존**: 토글 PATCH 계약 불변.
7. **운영 데이터**: 없음. 8. **Owner 결정**: 없음.

### OPS-08 · 주문 RPC 가 픽업/배달 플래그·자동 영업시간 미재검증 — **P3 · DB** (RC-3)
1. **원인**: `create_store_order_atomic` 이 `pickup_available/delivery_available/auto_business_hours` 미검사, TS(`lib/stores/validate-store-order-checkout.ts:168,182-190`)만.
2. **영향**: TS~RPC ms 창에 배달 OFF·스케줄 마감 시 1건 통과 → 오너 거절.
3. **수정**: 위 「주문 RPC 재정의」 참조.
4. **연동**: 주문자 결제 → RPC 재검증 → 오너 수신 없음 → 주문자 `fulfillment_not_supported`/`store_closed` 안내.
5. **검증**: 격리 DB(ND-3) 경합 시뮬레이션(플래그 OFF 후 RPC 직접 호출).
6. **보존**: 기존 거부 코드·순서 불변(추가 검사는 마지막 단계).
7. **운영 데이터**: 없음. 8. **Owner 결정**: 없음.

### OPS-01 · 운영에 `store_notices` 테이블 없음 → 공지 작성 500, 조회 빈 목록 위장 — **P2 · DB+웹**
1. **원인**: `schema_migrations` 에 `20260507141000` 기록, 테이블 부재(`to_regclass` NULL). 오너 GET 이 missing 시 `{ok:true, notices:[], meta:{migration_pending:true}}`(`app/api/me/stores/[storeId]/notices/route.ts:47-51`), 공개 GET 빈 목록(`app/api/stores/[slug]/notices/route.ts:36-41`).
2. **영향**: 오너 — 공지 기능 전면 불능을 성공처럼 봄. 주문자 — 공지 안 보임. 관리자 — 원인 모름.
3. **수정**: 새 버전 마이그레이션 `CREATE TABLE IF NOT EXISTS public.store_notices`(원 정의 재사용) + RLS(공개 SELECT: 게시 상태, 쓰기: service_role 만 — D-0 원칙) + 인덱스. API 는 테이블 부재 시 `ok:true` 대신 503 `store_notices_unavailable`. 오너 쓰기는 1-B 게이트.
4. **연동**: 오너 공지 작성 → API(service_role) → 테이블 → 공개 매장 상세 공지 → 주문자. 관리자 조회 화면이 있으면 같은 테이블.
5. **검증**: 운영 적용 후 `to_regclass('public.store_notices')` NOT NULL(읽기), 오너 POST 200(L5). vitest(503 매핑).
6. **보존**: P0-4 이미지 정리 가드(`notices/[noticeId]/route.ts`) 유지.
7. **운영 데이터**: 신규 빈 테이블 — 기존 데이터 변경 없음. 8. **Owner 결정**: 없음(운영 DB 적용 절차 승인).

### OPS-10 · 리뷰 답글 알림 한국어 하드코딩 — **P3 · 웹**
1. **원인**: `app/api/me/stores/[storeId]/reviews/[reviewId]/reply/route.ts:128` `title: "사장님이 리뷰에 댓글을 남겼어요"`.
2. **영향**: 영어·필리핀어 주문자에게 한국어 푸시.
3. **수정**: `loadNotificationUserLanguage(buyer)` + `notifySafeT` 키 `notify_store_review_owner_reply_title/body`(관리자 결정 알림 `admin-store-decision.ts:62-73` 패턴).
4. **연동**: 오너 답글 → 알림 append → 주문자 언어별 푸시·알림함.
5. **검증**: vitest(언어별 문구). 6. **보존**: 알림 hard-lock 계약(딥링크·dedupe) 불변. 7. **운영 데이터**: 없음. 8. **Owner 결정**: 없음.

---

## 3-C. 쿠폰 (RC-8)

### IA-04 (=ADS-20) · 오너 쿠폰 상태 전이 검사·CAS·오류 확인 없음 — **P2 · 웹**
1. **원인**: `app/api/me/store-coupons/campaigns/route.ts:173-178`(pause)·`:180-185`(end) 상태 조건 없이 UPDATE, 오류 미확인 후 `ok:true`; `:187-195` resume 은 `paused` 면 무조건 active → ended→pause→resume 부활, 관리자 일시정지(`app/api/admin/store-coupons/route.ts:153`, 같은 `paused`)도 오너가 재개. `validateActiveSession` 없음.
2. **영향**: 오너 — 종료 쿠폰 재발생(매장 부담 할인). 관리자 — revoke·일시정지 통제 무력화, 감사 흔적 훼손. 주문자 — 회수된 쿠폰 재노출.
3. **수정**: 상태 전이표(서버 상수) — pause: `active→paused`, resume: `paused(오너가 건 것)→active`, end: `active|paused→ended`, revoked·ended 불변. `.in('lifecycle_state', from)` + `.select('id')` CAS, 0행 409 `invalid_transition`, DB 오류 500. 관리자 일시정지 구분: 컬럼 `paused_by text CHECK IN ('owner','admin')`(DB 1컬럼, 기본 NULL; 관리자 pause 가 'admin' 기록) — `paused_by='admin'` 이면 오너 resume 403. `is_active` 는 같은 UPDATE 에서 lifecycle 파생값으로만 기록. `coupon_audit_events` 기록, `validateActiveSession`, 1-B 게이트.
4. **연동**: 오너 쿠폰 화면 → PATCH(CAS) → `store_coupon_campaigns` → 주문자 claim·체크아웃(`claim_store_coupon`, `create_store_order_atomic` 잠금 불변) → 관리자 쿠폰 화면(lifecycle 기준)·감사.
5. **검증**: 라우트 vitest(ended/revoked pause→409, admin-paused resume→403, DB 오류 500). 운영 읽기: revoked 2·ended 3 상태 불변 확인.
6. **보존**: 체크아웃 잠금·1회 사용·발급 한도 불변. 정상 pause/resume/end 응답 형태 불변.
7. **운영 데이터**: 기존 5건 변경 0. 관리자 기존 paused 10건은 `paused_by` NULL → **오너 재개 허용 유지**(과거 행 해석 불변, D-5). 금전: 부활 경로 차단으로 매장 부담 할인 오발생 방지.
8. **Owner 결정**: 기존 **D-18** 미결 — 권장안(종료·revoked 재활성 금지, 관리자 일시정지는 오너 재개 금지)을 그대로 구현.

### IA-05 · 쿠폰 재발행 중복 생성(확인창·busy·서버 멱등 없음) — **P2 · 웹+DB**
1. **원인**: 목록 `onReissue` 즉시 실행(`components/business/owner/OwnerStoreCouponsView.tsx:206-212`), 상세 확인 모달 `busy` 미전달(`:179-196`), 서버 reissue 매번 INSERT(`campaigns/route.ts:197-243`).
2. **영향**: 오너 — 더블탭 시 매장 부담 캠페인 2개(예산 2배). 주문자 — 같은 쿠폰 2종. 관리자 — 중복 캠페인 정리 부담.
3. **수정**: 클라 `actBusy` + 모달 `busy`, 목록 pause/reissue/end 모두 확인 모달 경유. 서버 `clientRequestId` 필수, 컬럼 `client_request_id` + UNIQUE `(store_id, source_campaign_id, client_request_id)`, 충돌 시 기존 행 반환(200, `idempotent:true`). 키는 폼 단위 고정(4-0 `useOwnerFormIdempotencyKey`).
4. **연동**: 오너 → reissue(1회) → 주문자 claim 대상 1개 → 관리자 목록 1개.
5. **검증**: vitest(같은 키 2회 → 1행), RTL(busy 중 재클릭 무시).
6. **보존**: 재발행 필드 복사 규칙 불변.
7. **운영 데이터**: 중복 0쌍 — 변경 없음. 8. **Owner 결정**: 없음.

### IA-06 · 쿠폰 화면 오류·성공 피드백 없음 — **P3 · 웹**
1. **원인**: `act()` 실패 무음(`OwnerStoreCouponsView.tsx:116-128`), 목록 로드 실패를 빈 목록으로(`:83-84`, `res.json()` 예외 미처리).
2. **영향**: 오너 — 실패를 성공으로 오인. 관리자 문의 증가.
3. **수정**: 4-0 공통 피드백(토스트·오류 띠·`OwnerStateView` error) 적용, 실패 시 서버 코드 → `owner-api-error-i18n` 문구. 4-0 미반영 시점이면 매장 어드민 셸 §4 상단 붉은 띠 마크업으로 우선 구현하고 4-0 에서 교체.
4. **연동**: 오너 화면 ↔ IA-04 신규 오류 코드(409/403/500).
5. **검증**: RTL(실패 시 띠 표시, 로드 실패 시 재시도 버튼).
6. **보존**: 성공 흐름 불변. 7. **운영 데이터**: 없음. 8. **Owner 결정**: 없음.

### ADS-23 · 쿠폰 상태 이중 권한(`lifecycle_state`/`is_active`)·종료 미반영 — **P3 · 웹**
1. **원인**: claim 은 두 값 모두 요구, 관리자는 lifecycle 기준. 운영: active+`end_at<now()` 40건, active+`is_active=false` 13건.
2. **영향**: 주문자 — 기간 지난 쿠폰이 목록에 보일 수 있음(claim 시 거부). 오너·관리자 — 상태 숫자 불일치.
3. **수정**: 읽기 파생 함수 `effectiveCouponState(row, now)` = lifecycle + 기간(`end_at<=now → ended`)를 오너·관리자·구매자 노출 로더가 공용 사용. 쓰기 경로는 IA-04 에서 `is_active` 를 lifecycle 파생값으로만 기록. 종료 자동 전이는 기존 크론에 `end_at >= c_apply_from` 조건으로만(과거 40건 미변경).
4. **연동**: 오너 목록·관리자 목록·주문자 쿠폰함 같은 상태 표시 → claim RPC 결과와 일치.
5. **검증**: vitest(파생 함수), 운영 읽기 SQL: 파생 상태 기준 「표시 active인데 claim 불가」 0.
6. **보존**: claim RPC 조건 불변.
7. **운영 데이터**: 53건 변경 0(D-5, 읽기 파생). 8. **Owner 결정**: 없음.

### ADS-24 · (잠재) `max_uses_per_user>1` 과 redemptions UNIQUE 충돌 — **P3 · 웹**
1. **원인**: UNIQUE `store_coupon_redemptions_buyer_campaign_unique`, `claim_store_coupon` 의 `max_uses_per_user`. 현재 전부 1.
2. **영향**: 값 2 이상 캠페인 생성 시 두 번째 사용에서 DB 오류.
3. **수정**: 1인 다회 사용은 현재 제품 계약(쿠폰 1회 사용)에 없음 → 오너·관리자 생성 검증에서 `max_uses_per_user=1` 고정(400 `unsupported_max_uses`). 인덱스 변경 없음.
4. **연동**: 오너·관리자 생성 → 검증 → claim → 체크아웃.
5. **검증**: vitest(campaign validation). 6. **보존**: 기존 캠페인 값 1 그대로. 7. **운영 데이터**: 없음. 8. **Owner 결정**: 없음(다회 쿠폰은 누락 기능 범주).

---

## 3-D. 광고

### ADS-08 · 관리자 광고 승인·반려(환불) API 권한키 없음 — **P2 · 웹**
1. **원인**: `app/api/admin/delivery-ads/[campaignId]/actions/route.ts:24`·`partner/memberships/route.ts:25,93`·`app/api/admin/platform-popup-requests/[requestId]/actions/route.ts:19` 가 `requireAdminApiUser()` 만(`refund_orphan_funding` 만 `:47` business). 쿠폰·상품권은 `requireAdminPermission("business")`.
2. **영향**: 관리자 — CS 권한 스태프도 광고 승인·반려(=Cash 환불) 가능. 오너·주문자 간접.
3. **수정**: 세 라우트 쓰기 핸들러를 `requireAdminPermission("business")` 로 통일(GET 조회는 현행 유지).
4. **연동**: 관리자 광고 큐 → actions → `admin_delivery_ad_transition`/`*_reject_with_refund`(RPC 내부 `is_platform_admin` 유지) → 오너 광고 상세 상태.
5. **검증**: 라우트 vitest(권한 없음 403). 6. **보존**: business 권한 관리자 동작 불변. 7. **운영 데이터**: 없음. 8. **Owner 결정**: 없음.

### ADS-06 · 홈 히어로·물리 인벤토리 배너가 매장 자격 미검사 — **P2 · 웹** (RC-9)
1. **원인**: `lib/stores/advertising/banner-home-hero-exposure.ts:65`, `banner-physical-inventory-exposure.ts:85` `void c.storeId;`. 스폰서드·검색상단은 오가닉 풀 fail-closed.
2. **영향**: 주문자 — 정지·비노출 매장 배너 클릭 → 주문 불가 매장. 오너(정지) — 노출 지속. 관리자 — 정지 효과 불완전.
3. **수정**: 두 로더가 `stores.approval_status='approved' AND is_visible` 맵(검색상단 `banner-search-top-exposure.ts:82-85` 패턴 재사용)으로 게이트 사유 `store_eligible` 추가.
4. **연동**: 관리자 매장 정지 → 다음 노출 요청부터 배너 제외 → 주문자 홈 → 오너 광고 상세(상태 불변, 노출만 0).
5. **검증**: vitest(정지 매장 배너 제외). 5단계 S07.
6. **보존**: 정상 매장 배너 노출·순서 불변. 공용 캐시 TTL 범위 내 반영.
7. **운영 데이터**: 캠페인 상태 변경 없음. 기간 보상 없음. 8. **Owner 결정**: 정지 시 캠페인 자동 일시중지·기간 보상은 기존 **D-23**(이 수정은 노출 차단만).

### ADS-01 · 승인 지연이 유료 노출 기간 잠식 · 만료 미심사 신청 자금 동결 — **P1 · DB+웹** (RC-5)
1. **원인**: 운영 `admin_delivery_ad_transition` approve 분기 — `start_at>now → SCHEDULED` 아니면 ACTIVE, `end_at` 미검사·기간 미재계산. `delivery_ad_system_schedule_transition` end_due 는 ACTIVE/SCHEDULED 만. 환불은 반려에만. 초안 시작=now+60초(`lib/stores/advertising/owner-delivery-ad-commercial-bind.ts:40-52`).
2. **영향**: 오너 — 7일 결제 2.78일 노출, 만료 신청 Cash 동결. 관리자 — 큐에 만료 신청 잔류. 주문자 — 영향 없음.
3. **수정**: (a) approve: OWNER_PAID 는 `start_at = max(now, 요청 시작)`, `end_at = start_at + commercial_snapshot.duration_days_snapshot`; 승인 시점에 이미 `end_at<=now` 인 원 신청은 `period_expired` 거절. (b) 시스템 크론에 `expire_unreviewed` — SUBMITTED/UNDER_REVIEW/CHANGES_REQUESTED + 원 `end_at` 경과 + **`submitted_at >= c_apply_from`** 만 → 같은 TX 에서 `business_cash_delivery_ad_refund` + lifecycle `REJECTED`(review_notes `period_expired`). 기존 `delivery-ads-schedule-transitions` 크론(`vercel.json`) 재사용.
4. **연동**: 오너 제출(Cash 차감) → 관리자 승인(기간 재계산) → 노출 서빙(기존 end_at 강제) → 오너 상세 기간 표시 → 만료 시 자동 반려·Cash 원장 `bc_refund:*` → 오너 Cash 잔액·알림.
5. **검증**: 격리 DB(ND-3) SQL: 승인 지연 시 end_at 재계산, 만료 신청 자동 반려 환불 1회(멱등). vitest(라우트 오류 코드 매핑). 5단계 S09.
6. **보존**: 제출=차감·반려=환불 단일 TX, 펀딩↔원장 1:1(I-10), 종료 후 노출 차단 불변.
7. **운영 데이터·정산**: 기존 4건 ₱480 은 `submitted_at < c_apply_from` → **자동 환불 안 함**(D-5). 이후 신청부터 Cash 원장 AD_REFUND 발생.
8. **Owner 결정**: 기존 **D-19** 미결 — 권장안 「승인 시점 기준 기간 재계산 + 만료 미심사 자동 반려·전액 환불(상태명 REJECTED 재사용)」.

### ADS-11 · 일시중지 캠페인 종료일 처리 누락·재개 시 end_at 미검사 — **P3 · DB** (RC-5)
1. **원인**: `owner_delivery_ad_transition` 배너 재개 end_at 미검사, `admin_delivery_ad_transition` PAUSED_ADMIN→ACTIVE 미검사, end_due 가 PAUSED_* 미포함.
2. **영향**: 오너·관리자 화면 상태가 「일시중지」로 영구 잔류(노출은 서빙단 차단 → 주문자 무영향).
3. **수정**: 모든 →ACTIVE 전이에 `end_at > now` 검사(`period_ended`), end_due 대상에 PAUSED_OWNER/PAUSED_ADMIN 포함하되 `end_at >= c_apply_from`.
4. **연동**: 오너·관리자 재개 버튼 → RPC 거부 코드 → 화면 문구.
5. **검증**: 격리 DB(ND-3). 6. **보존**: 기간 내 재개 불변. 7. **운영 데이터**: 과거 PAUSED 잔류 행 변경 0(화면은 읽기 파생으로 「기간 종료」 표시). 8. **Owner 결정**: 없음.

### ADS-12 · 미펀딩 레거시 신청이 관리자 심사 큐 잔류 — **P3 · 웹** (RC-5)
1. **원인**: UNDER_REVIEW 1건이 canonical·레거시 펀딩 모두 없음. 큐 쿼리가 펀딩 조인 없음(문서 §11.1 위반).
2. **영향**: 관리자 — 승인 시 `funding_required` 로만 막히는 무의미 행.
3. **수정**: 관리자 큐 쿼리에 펀딩 존재 조인, 미펀딩 행은 별도 「레거시·미펀딩(조치 불요)」 버킷으로 분리 표시.
4. **연동**: 관리자 큐만. 5. **검증**: vitest(큐 쿼리 빌더). 6. **보존**: 펀딩된 신청 큐 불변. 7. **운영 데이터**: 1건 반려 처리 안 함(D-5). 8. **Owner 결정**: 없음.

### ADS-02 · 가격 스냅샷이 기간·인벤토리와 미결합(저가 장기·복수 노출) — **P1 · 웹+DB** (RC-6)
1. **원인**: `lib/stores/advertising/owner-store-sponsored-writer.ts:525-552`(기간·인벤토리 자유 PATCH), `app/api/me/stores/[storeId]/delivery-ads/[campaignId]/actions/route.ts:145,202`(`inventoryKeys[0]` 만 견적), `owner-delivery-ad-commercial-bind.ts:92-118`(펀딩 존재 시 스냅샷 재사용), DB upsert·제출 RPC 가 스냅샷 기간 미검사.
2. **영향**: 오너(악용 시) 7일 가격으로 장기·다중 인벤토리. 플랫폼 광고 매출 손실, 다른 오너 인벤토리 잠식. 주문자 무영향.
3. **수정**: OWNER_PAID 캠페인은 `start_at/end_at` PATCH 금지(패키지 선택 시 서버 산출), 인벤토리 **1개 강제**(현 과금이 첫 인벤토리만이므로 과금 계약과 일치). `owner_submit_delivery_ad_with_business_cash` 에 `end_at-start_at <= duration_days_snapshot` 및 junction 인벤토리 = snapshot.inventory_key 검사 → 실패 `quote_stale`. 관리자 `/extend` 경로는 별도 스냅샷 생성 유지.
4. **연동**: 오너 신청 폼(기간 표시만) → PATCH 거부 → 제출 RPC 검증 → Cash 차감 → 관리자 심사 화면에 스냅샷 기간·인벤토리 표시 → 노출.
5. **검증**: vitest(PATCH 400, 다중 인벤토리 400). 격리 DB(ND-3) 제출 RPC 불일치 거부. 운영 읽기: 스냅샷 대비 기간 초과 0(I-11).
6. **보존**: 정상 단일 인벤토리 신청·재제출 흐름 불변.
7. **운영 데이터**: 운영 23건 모두 정상 — 변경 없음. 8. **Owner 결정**: 없음 — 다중 인벤토리 판매는 기존 D-19 의 신규 상품 옵션(결함 수정과 분리).

### ADS-03 · 파트너 반려 「환불→상태변경」 비원자 — **P1 · DB+웹** (RC-7)
1. **원인**: `lib/stores/advertising/delivery-ad-partner-membership-writer.ts:386-441` 반려가 `business_cash_delivery_ad_refund` 커밋 후 `.eq("status","PENDING_REVIEW")` UPDATE, 승인(`:301-379`)은 별도 UPDATE.
2. **영향**: 동시 처리 시 ACTIVE+환불 완료(플랫폼 금전). 오너 혼란, 관리자 원장 불일치.
3. **수정**: SECURITY DEFINER `admin_partner_membership_decide(p_admin, p_id, p_action, p_reason)` — 멤버십 FOR UPDATE → 상태 검사 → (승인) 펀딩 SECURED 재확인·ACTIVE / (반려) 환불 + REJECTED, 같은 TX + 감사. writer 는 RPC 호출만.
4. **연동**: 오너 신청(Cash 차감) → 관리자 결정(단일 RPC) → 오너 파트너 화면·Cash 원장 → 광고 할인 적용(catalog).
5. **검증**: 격리 DB(ND-3) 동시 호출 2세션 → 한쪽만 성공. 운영 읽기: REJECTED↔REFUNDED, ACTIVE↔SECURED 일치(I-10).
6. **보존**: 환불 함수·멱등키 형식 불변.
7. **운영 데이터**: 현재 REJECTED 1 = REFUNDED 1 일치 — 변경 없음. 8. **Owner 결정**: 없음(운영 함수 적용 절차 승인).

### ADS-04 · 파트너 신청 중복·고아 펀딩 — **P2 · DB+웹** (RC-7)
1. **원인**: 열린 멤버십 partial UNIQUE 없음, `ownerApplyPartnerMembership`(`:150-257`) 비잠금 조회 → insert → 차감 실패 시 delete 보상.
2. **영향**: 오너 — 이중 차감·고아 펀딩. 관리자 — 수동 회수.
3. **수정**: partial UNIQUE `(store_id) WHERE status IN ('PENDING_REVIEW','ACTIVE','CANCEL_PENDING')` + 신청 단일 RPC `owner_apply_partner_membership(p_store, p_owner, p_plan, p_request_id)`(행 생성+차감 한 TX, 멱등키). 관리자 큐에 고아 펀딩 조회(`fundings LEFT JOIN memberships … IS NULL`) 표시.
4. **연동**: 오너 신청 → RPC → Cash 원장 → 관리자 심사(ADS-03 RPC).
5. **검증**: 격리 DB(ND-3) 동시 신청 → 1건. 인덱스 생성 전 운영 읽기로 중복 열린 행 0 확인(있으면 인덱스 생성 실패 → 착수 전 확인).
6. **보존**: 기존 멤버십 행 불변.
7. **운영 데이터**: 변경 없음. 8. **Owner 결정**: 없음.

### ADS-05 · 파트너 멤버십 만료 자동 처리 없음 — **P2 · 웹**
1. **원인**: 만료 전이 없음, `loadOpenPartnerMembershipForStore`(`:83-97`)가 기간 무관 ACTIVE 를 「열림」으로 → `canApply=false`.
2. **영향**: 오너 — 만료 후 「이용 중」·재가입 불가(운영 1건). 관리자 — 상태 오표시.
3. **수정**: 열림 판정에 `period_end > now()` 추가(읽기 파생, 할인 판정 `delivery-ad-commercial-catalog.ts:153-155` 와 동일 규칙). 상태 전이는 기존 스케줄 크론에 `ACTIVE/CANCEL_PENDING AND period_end<=now AND period_end >= c_apply_from → ENDED`(감사 기록).
4. **연동**: 오너 파트너 화면(재신청 가능) → 관리자 화면 「만료」 → 광고 할인 미적용(기존).
5. **검증**: vitest(open 판정). 6. **보존**: 기간 내 멤버십 불변. 7. **운영 데이터**: 만료 ACTIVE 1건 상태 변경 없음(읽기 파생으로 재신청 허용). 8. **Owner 결정**: 없음 — 자동 갱신은 기존 D-19.

### ADS-09 · 주문 광고 기여가 응답 후 fire-and-forget — **P3 · 웹** (RC-9)
1. **원인**: `app/api/me/store-orders/route.ts:953` `void reconcileDeliveryAdAttributionForOrder(...)`.
2. **영향**: 오너 성과 리포트 누락(과금 미출시라 금전 무관).
3. **수정**: `after()`(next/server, 서버 라우트이므로 허용)로 감싸 응답 후 완료 보장. AGENTS 「use client 파일이 next/server after import 금지」 해당 없음(라우트 파일).
4. **연동**: 주문자 주문 → 기여 기록 → 오너 광고 성과.
5. **검증**: vitest(after 호출). 6. **보존**: 주문 응답 지연 0(동기화하지 않음). 7. **운영 데이터**: 없음. 8. **Owner 결정**: 없음.

### ADS-10 · 노출 eventId 클라 지정 — **P3 · 웹** (RC-9)
1. **원인**: `app/api/stores/ads/impression/route.ts:27-29` 같은 토큰으로 eventId 만 바꿔 반복 POST.
2. **영향**: 오너 노출 지표 부풀림(현재 과금 없음).
3. **수정**: dedupe 키를 서버 계산 `(exposure_token_hash, viewer_session_hash)` 로, 클라 eventId 는 보조. 토큰당 1회 집계.
4. **연동**: 주문자 노출 → 집계 → 오너 성과.
5. **검증**: vitest(같은 토큰 2회 → 1). 6. **보존**: 정상 노출 1회 집계. 7. **운영 데이터**: 과거 29건 불변. 8. **Owner 결정**: 없음.

### ADS-13 · (잠재) 오너 플랫폼 팝업 제출 비원자 — **P3 · DB+웹** (RC-7)
1. **원인**: `lib/platform-popup/owner-request-writer.ts` `submitPlatformPopupOwnerRequest` 키 바인딩→차감→상태변경 TS 순차. `OWNER_PLATFORM_POPUP_NEW_SALES_ENABLED=false`(`lib/platform-popup/owner-popup-new-sales-gate.ts:8`).
2. **영향**: 판매 재개 시 SECURED 펀딩 + draft 상태(오너 금전).
3. **수정**: 제출 단일 RPC(ADS-04 와 같은 패턴). **판매 재개 전 필수 조건**으로 게이트 파일 주석·verify 에 고정.
4. **연동**: 오너 신청 → RPC → 관리자 팝업 심사.
5. **검증**: 격리 DB(ND-3). 6. **보존**: 판매 중지 상태 유지. 7. **운영 데이터**: 기존 승인 3건 불변. 8. **Owner 결정**: 없음.

---

## 3-E. 상품 P3 (선행: 2-E)

### PRD-15 · 서버 입력 상한·세션 가드·오류 원문 노출 비일관 — **P3 · 웹**
1. **원인**: 상품명·요약 상한 없음(`app/api/me/stores/[storeId]/products/route.ts:223-226`), 가격·추가금 상한 없음(`:228-231`, `lib/stores/owner-product-options-validate.ts:127-133`), DB 원문 반환(`products/route.ts:425`, `[productId]/route.ts:490`, `menu-sections/route.ts:128`), POST 만 `validateActiveSession`+`requirePhoneVerified`(`:192-195`), POST 멱등키 없음, 추천 6개 count→insert 비원자(`:375-387`), 목록 cursor 미적용(`lib/stores/owner-products-list-snapshot.ts:195-223`).
2. **영향**: 오너 — DB 원문 오류, 더블탭 중복 상품. 관리자 상품명 120자 규칙과 불일치. 주문자 — 비정상 가격 노출 가능.
3. **수정**: 공용 `validateOwnerProductFields`(title≤120 — 관리자와 동일, summary≤500, price≤10,000,000, priceDelta≤1,000,000, stock≤999,999) POST/PATCH 공용. 500 응답 `error:"db_error"` 고정 + 서버 로그. 오너 상품·섹션·업로드 쓰기 가드 통일(세션·1-B 게이트). POST `client_request_id`(폼 고정 키) + UNIQUE `(store_id, client_request_id)` — DB 1인덱스. 추천 제한은 INSERT 후 재카운트 > 6 이면 롤백(409). cursor 는 미사용 파라미터 제거.
4. **연동**: 오너 폼 → API 검증 → `store_products` → 주문자 메뉴.
5. **검증**: vitest(상한 경계, 멱등 2회 1행, 500 원문 미노출).
6. **보존**: 기존 상품 값이 상한 초과면 **수정 저장 시에만** 검증(미수정 필드 통과 — 운영 초과 여부 착수 시 읽기 확인).
7. **운영 데이터**: 변경 없음. 8. **Owner 결정**: 없음 — 상한은 관리자 기존 120자 기준에 맞춰 설계로 확정(F 의 「PRD-04 CHECK·상한」 중 상한 부분 해소).

### PRD-10 · 재고 0 인데 active 유지 — **P3 · 웹**
1. **원인**: PATCH/POST 가 재고 0 과 상태 미연동(`[productId]/route.ts:243-252, 396-417`). 자동 품절은 주문 감산 때만.
2. **영향**: 주문자 — 판매중 표시 → 결제 `insufficient_stock`. 오너 — 혼란.
3. **수정**: 저장 시 `track_inventory && stock_qty==0 && status=='active'` → `sold_out` + `sold_out_reason='stock'`(2-E PRD-06 컬럼). 응답에 `auto_sold_out:true` → 오너 토스트 안내.
4. **연동**: 오너 저장 → 상품 상태 → 공용 캐시 세대(2-E OPS-02) → 주문자 품절 표시 → 재고 복원 시 `stock` 사유만 자동 해제(PRD-06).
5. **검증**: vitest. 6. **보존**: 재고 미추적 상품 불변. 7. **운영 데이터**: 기존 1건 불변(다음 저장 시 적용). 8. **Owner 결정**: 없음.

### PRD-14 · 옵션 그룹 내 동일 옵션명 허용 — **P3 · 웹**
1. **원인**: `owner-product-options-validate.ts:113-157` 중복 미검사, 주문 검증 이름 매칭(`lib/stores/modifiers/validate.ts:208`), 그룹 id 중복 미검사.
2. **영향**: 주문자 — 두 번째 옵션 선택이 첫 번째 가격으로 계산 또는 `price_changed`. 오너 — 의도와 다른 금액.
3. **수정**: 검증기에 그룹 id 유일·그룹 내 옵션명 유일(대소문자·공백 정규화) 추가 → 400 `duplicate_option_name`. 주문 wire 키 전환은 장기(범위 밖).
4. **연동**: 오너 옵션 저장 → 주문자 선택 → RPC 옵션 JSON 비교 불변.
5. **검증**: vitest. 6. **보존**: 기존 저장 옵션은 수정 시에만 검증. 7. **운영 데이터**: hidden 상품 1건 불변. 8. **Owner 결정**: 없음.

### PRD-11 · 카테고리 정렬 N개 병렬 PATCH 비원자 — **P3 · 웹+DB**
1. **원인**: `components/business/owner/OwnerMenuCategoriesClient.tsx:307-340` `Promise.all` per-section PATCH.
2. **영향**: 오너 화면과 주문자 메뉴 순서 불일치(부분 반영).
3. **수정**: `PUT /api/me/stores/[storeId]/menu-sections/order`(id 배열) → SECURITY DEFINER `reorder_store_menu_sections(p_store, p_ids uuid[])` 한 문장(`UPDATE … FROM unnest WITH ORDINALITY`, 매장 소속 아닌 id 있으면 예외).
4. **연동**: 오너 정렬 → 단일 TX → 공용 캐시 세대 → 주문자 메뉴 순서.
5. **검증**: vitest(라우트), 격리 DB(ND-3) 함수.
6. **보존**: 개별 섹션 PATCH 유지. 7. **운영 데이터**: 없음. 8. **Owner 결정**: 없음.

### PRD-12 · 오너 목록 정렬 ≠ 구매자 메뉴 정렬 — **P3 · 웹**
1. **원인**: 오너 `is_featured DESC, sort_order, created_at DESC`(`owner-products-list-snapshot.ts:220-223`) vs 구매자 `section sort, sort_order, title`(`lib/stores/group-store-products-by-menu.ts:186-192`).
2. **영향**: 오너가 보는 순서와 고객 순서가 달라 편집 혼란.
3. **수정**: 오너 허브 기본 정렬을 구매자 SSOT(`sortStoreDetailProductCardsForDisplay`)로, 「추천 우선」은 필터 칩으로 분리.
4. **연동**: 오너 허브 ↔ 주문자 메뉴 동일 순서.
5. **검증**: vitest(같은 입력 → 같은 순서). `verify:owner-products-perf` 재실행(목록 hot path). 6. **보존**: 목록 캐시 키 불변. 7. **운영 데이터**: 없음. 8. **Owner 결정**: 없음.

### PRD-13 · 카테고리 삭제 시 판매중 상품 「기타 메뉴」 이동 무안내 — **P3 · 웹**
1. **원인**: FK `ON DELETE SET NULL`, 확인 문구가 이름만(`lib/i18n/catalog/business.ts:524`), 이후 수정 시 `menu_section_id_required`(`[productId]/route.ts:332-335`).
2. **영향**: 주문자 — 상품이 「기타」로 이동. 오너 — 다음 수정 저장 실패.
3. **수정**: DELETE 전 소속 상품 수 조회 → >0 이면 409 `section_has_products` + 확인창에서 이동 대상 섹션 선택 후 `moveTo` 파라미터로 재요청(한 요청에서 상품 이동 후 삭제).
4. **연동**: 오너 삭제 → 상품 이동 → 공용 캐시 → 주문자 메뉴.
5. **검증**: vitest. 6. **보존**: 빈 섹션 삭제 UX 불변. 7. **운영 데이터**: 없음. 8. **Owner 결정**: 없음.

### PRD-16 · 업로드 후 저장 실패 시 Storage 고아 객체 — **P3 · 웹**
1. **원인**: 선업로드(`components/business/owner/OwnerProductForm.tsx:536-555`) 후 실패·취소 시 정리 없음(`upload-image/route.ts:21`).
2. **영향**: 저장소 비용(주문자·관리자 무영향).
3. **수정**: 일 1회 GC 라우트 — `store-product-images/{storeId}/` 중 어떤 상품·배너·공지 행에서도 참조되지 않고 24h 경과 객체 삭제. 소유 경로 판정은 P0-4 `lib/stores/store-owned-image-urls.ts` 재사용. **기본 dry-run(삭제 0, 목록만)** 으로 배포, 실삭제 전환은 Owner 승인(Storage 데이터 삭제는 D-5 운영 데이터 변경 성격).
4. **연동**: 없음(백오피스).
5. **검증**: vitest(참조 집합 계산). 6. **보존**: soft delete 상품 이미지 보존 계약(`canonical-image-lifecycle.server.ts:4-5`) — 삭제 상품 참조도 「참조 중」으로 집계. 7. **운영 데이터**: dry-run 동안 0. 8. **Owner 결정**: 없음(실삭제 전환은 절차 승인).

---

# 4단계 — 사이드 메뉴 · UI/UX/CTA · SSOT

## 4-선행

| 선행 | 이유 |
|---|---|
| 1-B 게이트(IA-01~03, 구현 중) | 상태 화면 「권한 없음/정지/심사중」 과 서버 authz 열이 같은 `resolveOwnerStoreAccess` 결과를 써야 한다 |
| 3단계 3-C·3-D·3-B | 쿠폰·광고·공지·문의 화면의 신규 오류 코드가 4-0 공통 피드백의 입력 |
| 결정 D-11·D-12·D-13·D-14 | 4-7(PC 사이드바)·4-5(고아 삭제)·4-3(용어)·4-4(토글 확인창)만 막힘. 나머지는 결정 없이 진행 |

## 4-1. 근본 원인 통합

| RC | 원인 | 결함 |
|---|---|---|
| RC-10 | 레지스트리(`lib/business/owner-nav-registry.ts`)가 메뉴만 정의하고 제목(`business-admin-page-title-i18n.ts`)·활성(`business-admin-nav.ts:59-82`, `owner-bottom-nav-active.ts`)·뒤로가기(`owner-stack-back-href.ts`)·승인 조건이 각자 다른 파일·규칙 | IA-09, IA-10, IA-11, IA-21 (+IA-12·IA-14 의 라벨 부분) |
| RC-11 | 오너 화면 공통 피드백·상태 화면·멱등 키 primitive 부재 → 화면마다 무음·자체 토스트 | IA-06(3단계), IA-15, IA-16, IA-17, IA-23, IA-19(토스트 부분) |
| RC-12 | 매장 컨텍스트(storeId) 해석 3방식 + 레거시 리다이렉트가 storeId 외 쿼리 폐기 | IA-07, IA-08 |

## 4-2. 12그룹 IA — 레지스트리 단일 정의 명세 (URL 변경 0)

`OwnerNavItem` 에 필드 추가: `group`(12값) · `parentId` · `titleKey` · `activePrefixes: string[]` · `activeQuery?: {key, values}` · `bottomTab` · `access: 'approved' | 'preApproval' | 'suspendedAllowed' | 'any'`(1-B 게이트 값과 같은 열거형). 드로어·헤더 제목·활성 하이라이트·하단탭 활성·뒤로가기·드로어 노출 조건을 **이 표에서만 파생**한다. 아래 표가 레지스트리 데이터 그 자체의 설계값이다.

| 그룹 | 항목 id | URL(기존) | parentId | 제목(titleKey 값, ko) | activePrefixes | 하단탭 | access |
|---|---|---|---|---|---|---|---|
| 01 홈 | home | `/stores/owner` | — | 대시보드 | `/stores/owner`(정확일치) | 홈 | any |
| 02 주문 관리 | orders | `/orders` | home | 주문 관리 | `/orders` | 주문 | suspendedAllowed |
| 〃 | order_chats | `/order-chats` | orders | 주문 채팅 | `/order-chats`, `/order-chat/` | 주문 | suspendedAllowed |
| 03 상품 관리 | products | `/products` | home | 상품 관리 | `/products`(하위 포함) | 상품 | approved |
| 〃 | product_new | `/products/new` | products | 상품 등록 | `/products/new` | 상품 | approved |
| 〃 | product_edit | `/products/[id]/edit` | products | 상품 수정 | (products 하위) | 상품 | approved |
| 〃 | menu_categories | `/menu-categories` | products | 메뉴 카테고리 | `/menu-categories` | 상품 | approved |
| 04 매장 운영 | store_manage | `/settings` | home | 매장 관리 | `/settings` | 관리 | approved |
| 〃 | ops_status | `/ops-status` | store_manage | 운영·심사 상태 | `/ops-status` | 관리 | preApproval |
| 〃 | basic_info | `/basic-info` | store_manage | 기본 정보 | `/basic-info` | 관리 | preApproval |
| 〃 | public_preview | (미리보기 모달) | store_manage | 공개 매장 미리보기 | — | — | approved |
| 05 배달 관리 | delivery | `/profile#delivery` | store_manage | 영업·배달 설정 | `/profile` | 관리 | preApproval |
| 06 매출·정산 | settlements | `/settlements` | home | 수수료·캐시 원장(D-13 권장안) | `/settlements`, `/finance?section=outstanding|transactions` | 관리 | suspendedAllowed(조회) |
| 07 코인·캐시 | finance | `/finance` | home | Coin · 캐시 | `/finance?section=coin|cash|convert|withdraw|ads` | 관리 | approved(쓰기)·suspendedAllowed(조회) — D-16 결과 반영 |
| 08 광고·홍보 | ads | `/ads` | home | 광고 | `/ads`(하위 전부) | 관리 | approved |
| 〃 | ads_event | `/ads/event-promotions` | ads | 이벤트 프로모션 | `/ads/event-promotions` | 관리 | approved |
| 〃 | coupons | `/coupons` | ads | 쿠폰 | `/coupons` | 관리 | approved |
| 〃 | banners | `/banners` | ads | 배너 관리 | `/banners` | 관리 | approved |
| 〃 | notices | `/notices` | ads | 공지 관리 | `/notices` | 관리 | approved |
| 09 상품권 | gift | `/gift-certificates` | home | 상품권 | `/gift-certificates` | 관리 | approved |
| 10 고객 관리 | care | `/customer-care` | home | 고객 응대 | `/customer-care`(customer-center 제외) | 고객 | approved |
| 〃 | inquiries | `/inquiries` | care | 매장 문의 | `/inquiries` | 고객 | approved |
| 〃 | reviews | `/reviews` | care | 리뷰 관리 | `/reviews` | 고객 | approved |
| 11 알림 | notifications | `/notifications` | home | 알림함 | `/notifications` | 관리 | any |
| 〃 | notif_settings | `/notification-settings` | notifications | 내 계정 알림 설정 | `/notification-settings` | 관리 | any |
| 12 설정·지원 | cs_center | `/customer-care/customer-center` | home | 플랫폼 고객센터 | `/customer-care/customer-center`, `/customer-care/messages/`, `/customer-care/inquiries/` | 관리 | any |
| 〃 | apply | `/apply` | home | 입점 신청 | `/apply` | — | any(셸 밖) |
| 〃 | my | `/my` | — | 내 정보로 | — | — | any |

규칙: (1) 활성 = 가장 긴 `activePrefixes` 일치 항목 + 그 조상 전부. (2) 뒤로가기 = `parentId` 의 URL(`?storeId` 보존). (3) 드로어 노출 = `access` 를 1-B 게이트 결과로 평가(보이면 들어갈 수 있다 — IA-21). (4) 하단탭 활성 = 항목 `bottomTab`(알림 계열은 「관리」). (5) 제목 = `titleKey`, 미등록 경로는 빌드 시 vitest 가 실패(누락 방지).

## 4-3. 결함별 설계 (8필드)

### IA-09 · 제목 누락·라벨 불일치·오타 — **P3 · 웹** (RC-10)
1. **원인**: `lib/business/business-admin-page-title-i18n.ts:35-111` 분기에 `/coupons`·`/ads/*`·`/notifications`·`/notification-settings` 없음(기본 「매장 어드민」), 오타 「상품 관리 , 등록」(`lib/i18n/catalog/business-admin-nav.ts:174`), 드로어·헤더·허브 라벨 상이(appendix IA §3 표).
2. **영향**: 오너 — 현재 위치 식별 불가. 주문자·관리자 무영향.
3. **수정**: 제목 함수를 레지스트리 `titleKey` 파생으로 교체, 오타 수정, 라벨=제목 단일 키.
4. **연동**: 오너 화면 내부(헤더·드로어·허브 카드·관리 허브 링크).
5. **검증**: vitest — 모든 캐노니컬 경로(44행 표)에 제목 존재·드로어 라벨과 동일.
6. **보존**: i18n 키 값 변경은 해당 키만, URL 불변.
7. **운영 데이터**: 없음. 8. **Owner 결정**: 용어 2개(정산/원장, 출금/환전)만 기존 **D-13**(권장안 「수수료·캐시 원장」「Coin 환전」).

### IA-10 · 하위 화면 활성 하이라이트 누락 — **P3 · 웹** (RC-10)
1. **원인**: `lib/business/business-admin-nav.ts:59-82` 완전일치만, `lib/delivery/owner/owner-bottom-nav-active.ts:52-73` 알림 미귀속.
2. **영향**: 오너 — 상품 수정·광고 하위·상품권 view·Finance section 에서 메뉴 비활성.
3. **수정**: 4-2 규칙 (1)(4).
4. **연동**: 드로어·하단탭.
5. **검증**: vitest 경로→활성 항목 표(44행).
6. **보존**: 하단 5탭 구성·홈 재탭 동작(`owner-home-hub-navigation.ts`) 불변.
7. **운영 데이터**: 없음. 8. **Owner 결정**: 없음.

### IA-11 · 뒤로가기 부모 오류 — **P3 · 웹** (RC-10)
1. **원인**: `lib/business/owner-stack-back-href.ts:41`(`/ads/[^/]+$` 2세그먼트 미매칭), `:56-58`(order-chats→orders 지만 메뉴는 고객 그룹), inquiries·reviews·notifications→허브.
2. **영향**: 오너 — 예상과 다른 화면으로 이동, 필터 상태 유실.
3. **수정**: back resolver = `parentId` 파생(order_chats 는 12그룹 IA 에서 주문 하위로 이동 → 현행 뒤로가기와 일치). 부모 URL 에 `storeId`·부모 화면의 마지막 쿼리(sessionStorage, try/catch) 보존.
4. **연동**: 셸 헤더 뒤로가기·안드로이드 하드웨어 백(웹 히스토리 기반, 네이티브 변경 없음).
5. **검증**: vitest 경로→부모 표.
6. **보존**: 폼 이탈 가드(`owner-basic-info-guard.ts`) 순서 불변 — 가드가 먼저.
7. **운영 데이터**: 없음. 8. **Owner 결정**: 없음.

### IA-21 · 드로어 항목 승인 조건 비일관 — **P3 · 웹** (RC-10)
1. **원인**: `owner-nav-registry.ts:322-330` `ads` 만 `requireApproved` 없음, basic_info·store_settings 는 의도적으로 없음 → 보이는데 가드에서 차단.
2. **영향**: 비승인 오너 — 「보이는데 못 들어감」.
3. **수정**: `access` 열거형으로 교체(4-2 표), 1-B 게이트와 같은 판정 함수 사용.
4. **연동**: 드로어 ↔ 가드 ↔ 서버 게이트 동일 규칙.
5. **검증**: vitest — 상태(pending/revision/approved/suspended)×항목 노출 매트릭스 = 1-B 접근 매트릭스.
6. **보존**: 승인 매장 메뉴 구성 불변.
7. **운영 데이터**: 전 매장 approved → 현재 영향 0. 8. **Owner 결정**: 없음(D-16 결과를 값으로 사용).

### IA-07 · 레거시 리다이렉트 쿼리·storeId 유실, 무효 경로 매핑 — **P3 · 웹** (RC-12)
1. **원인**: `lib/business/owner-routes.ts:148-157` `buildLegacyOwnerRedirectHref` storeId 만 보존, `app/(main)/stores/owner/edit/page.tsx:4-6` storeId 유실, `owner-routes.ts:131` `/my/business/store-order-chat` → 존재하지 않는 `/stores/owner/order-chat`, `/my/business/menu` 2홉.
2. **영향**: 오너 — 북마크·알림 딥링크가 막다른 화면.
3. **수정**: 전체 searchParams 보존, `/edit` → `OwnerRoutes.profile(storeId)`, store-order-chat → `/stores/owner/order-chat/[orderId]`(경로 파라미터 매핑), 레거시 1홉 매핑표 상수. `/stores/[slug]/owner/*` 3종은 서버 redirect(slug→storeId) — IA-12 와 같은 커밋.
4. **연동**: 알림 딥링크(`owner-store-order-notification-href.ts`) → 레거시 → 캐노니컬.
5. **검증**: vitest 매핑표(24 레거시 + 3 슬러그 × 쿼리 보존). `npm run verify:routes`(라우트 구조 변경 시 `npm run build` 1회).
6. **보존**: URL 삭제 0 — 모든 레거시 경로 유지.
7. **운영 데이터**: 없음. 8. **Owner 결정**: 없음.

### IA-08 · storeId 해석 3방식(일부 `stores[0]`) — **P3 · 웹** (RC-12)
1. **원인**: URL 필수(profile·basic-info·ops-status·settings·products·menu-categories·finance·settlements), resolver(쿠폰·배너·공지·리뷰·문의·상품권·광고·고객응대·알림설정), `stores[0]`(`/ads/event-promotions` page, `components/.../OwnerStoreNotificationsView.tsx:37`) — `app/(main)/stores/owner/layout.tsx:12` 「never invent stores[0]」 위반. 광고 신청 링크 storeId 누락(`OwnerDeliveryAdsHubView.tsx:561,569,578`).
2. **영향**: 다매장 오너(현재 0) — 다른 매장 데이터·막다른 화면.
3. **수정**: 셸 `selectedRow`(`BusinessAdminShell.tsx:314-320`)를 `useBusinessAdminStore()` 로 전 화면 공용, URL 에 storeId 없으면 셸 한 곳에서 `router.replace(withStoreId)` 정규화. `stores[0]` 2곳 제거, 광고 링크 `withStoreId`.
4. **연동**: 셸 → 각 화면 → API(`/api/me/stores/[storeId]/**`, 소유 검사 불변).
5. **검증**: vitest(2매장 fixture, storeId 없는 진입 → 정규화).
6. **보존**: 1매장 오너 동작 불변(정규화 결과 동일 매장).
7. **운영 데이터**: 없음. 8. **Owner 결정**: 없음.

### IA-12 · 중복 진입점(노출/영업 토글 3곳, Finance 탭 중복, CS 경로 중복) — **P3 · 웹**
1. **원인**: 토글 3곳(`BusinessAdminShell.tsx:716-722`, `OwnerStoreSettingsContent.tsx:48-58`, 허브 헤더) + `/settings` 죽은 버튼(`:66-76`), `OwnerStoreFinanceView.tsx:266` transactions≡orders, `owner-routes.ts:50-54` 동일 URL 헬퍼 2개, `/customer-care/messages|inquiries` 클라 replace 2홉.
2. **영향**: 오너 — 같은 기능 다른 위치·다른 피드백.
3. **수정**: 토글 SSOT=`/settings`, 헤더·ops-status 는 상태 칩+「매장 관리에서 변경」 링크, 죽은 버튼 제거. Finance `orders` 탭 제거(`?section=orders` 는 `transactions` 로 서버 정규화 — URL 보존). CS 2경로 서버 redirect, 헬퍼 1개.
4. **연동**: 오너 `/settings` PATCH(불변) → 주문자 노출·영업.
5. **검증**: vitest(section 정규화), RTL(헤더 토글 대신 링크).
6. **보존**: 토글 API·확인 흐름 불변, URL 보존.
7. **운영 데이터**: 없음. 8. **Owner 결정**: 없음.

### IA-13 · 정산 용어가 SSOT 와 충돌 — **P3 · 웹**
1. **원인**: `components/finance/OwnerFinanceNav.tsx:9` 「주문별 정산」, `biz_nav_settlements_desc` 「…지급 현황」, `OwnerStoreFinanceView.tsx:291` 「플랫폼 지급 의무」 ↔ `docs/store-commission-cash-settlement-ssot.md:36` 「주문별 정산 큐 폐지」·AGENTS 「주문별 지급 없음」.
2. **영향**: 오너 — 플랫폼이 판매대금을 지급한다고 오해(분쟁). 관리자 — 문의 증가.
3. **수정**: 탭 제거(IA-12), 설명문 「수수료 부과·캐시 차감·미납 원장」, 「지급 의무」 카드는 플랫폼 보유분(FIN-03, D-2 결정 후 표기)만. 「출금/환전」 단일화.
4. **연동**: 오너 `/settlements` ↔ 관리자 `/admin/store-settlements`(같은 SQL 함수, 불변).
5. **검증**: i18n 키 grep 0(「주문별 정산」「지급 현황」).
6. **보존**: 데이터·API 불변(문구만).
7. **운영 데이터**: 없음. 8. **Owner 결정**: 기존 **D-13**(권장안 채택 시 그대로).

### IA-14 · 알림 설정 페이지 정체성 불일치 — **P3 · 웹**
1. **원인**: 설정은 사용자 단위(`app/api/me/owner-notification-settings/route.ts:158` `onConflict:user_id`), 화면은 매장 URL·UUID 노출(`components/.../OwnerNotificationSettings.tsx:139-141`), 「진동」 라벨인데 토글은 푸시·소리 2개(`:149-158`), busy 없음·실패 재로드(`:98-115`).
2. **영향**: 오너 — 매장별 설정이라 오해, 진동 기대.
3. **수정**: 제목 「내 계정 알림 설정(전체 매장 공통)」, UUID 제거, 「진동」 문구 제거(기능 미구현 — 라벨을 실제 기능에 맞춤), 토글 busy+실패 토스트(4-0).
4. **연동**: 알림 hard-lock 경로 불변(설정 읽기만).
5. **검증**: RTL. 6. **보존**: API·저장 단위 불변. 7. **운영 데이터**: 없음. 8. **Owner 결정**: 없음 — 진동 기능 추가는 누락 기능(별도).

### IA-15 · 리뷰 답글 UX — **P3 · 웹** (RC-11)
1. **원인**: `components/.../OwnerStoreReviewsView.tsx:197-205` 삭제 확인 없음, `:164` 저장 실패 시 목록 전체를 오류문구로 대체·재시도 없음, `:179-185` 원시 order_id·status 노출, `:175` `ko-KR` 고정, 하드코딩 색.
2. **영향**: 오너 — 실수 삭제, 실패 시 목록 소실. 주문자 — 답글 의도치 않은 삭제.
3. **수정**: 삭제 `OwnerStoreAdminConfirmModal`(danger, busy), 실패는 항목 인라인+토스트(목록 유지), 주문번호 표시는 `order_no`, 날짜 사용자 locale, 토큰 클래스.
4. **연동**: 오너 답글 → API → 알림(OPS-10) → 주문자 리뷰 화면.
5. **검증**: RTL(실패 시 목록 유지, 삭제 확인). 6. **보존**: API 불변. 7. **운영 데이터**: 없음. 8. **Owner 결정**: 없음.

### IA-16 · 매장 문의 답변 실패 무음 — **P3 · 웹** (RC-11)
1. **원인**: `OwnerStoreInquiriesView.tsx:136` `if (!json?.ok) return;`, `res.json()` 예외 미처리, `:157-166` 종료 결과 미확인, `:65` 재로드마다 loading 리셋(깜박임).
2. **영향**: 오너 — 답변 전송 실패를 모름. 주문자 — 답변 없음.
3. **수정**: 4-0 공통 `ownerFetchJson`(예외·코드 매핑) + 토스트, 재로드는 배경 갱신(stale 유지).
4. **연동**: 오너 → 문의 API → 주문자 문의 화면.
5. **검증**: RTL. 6. **보존**: API 불변. 7. **운영 데이터**: 없음(문의 0행). 8. **Owner 결정**: 없음.

### IA-17 · 설정 토글 피드백·확인 없음 — **P3 · 웹** (RC-11)
1. **원인**: 메신저 기능 토글 busy 없음·실패 재로드(`app/(main)/stores/owner/settings/page.tsx:88-120`), 노출/영업 실패 무음(`BusinessAdminOpenToggle.tsx` `if (!j?.ok) { setPendingUi(null); return false; }`), 노출 OFF 확인 없음.
2. **영향**: 오너 — 노출 OFF 를 실수로 눌러 주문 0. 주문자 — 매장 사라짐.
3. **수정**: busy+실패 시 원복+토스트. 노출 OFF·영업 OFF 확인창은 D-14 결과에 따라 켜는 플래그(기본: 확인창 사용 — 권장안).
4. **연동**: 오너 `/settings` → PATCH → 주문자 목록·상세.
5. **검증**: RTL. 6. **보존**: PATCH 계약 불변. 7. **운영 데이터**: 없음. 8. **Owner 결정**: 기존 **D-14**(권장안 「노출 OFF·영업 OFF 모두 확인창」).

### IA-23 · 주문 단계 변경 실패 메시지 누락(일부 경로) — **P3 · 웹** (RC-11)
1. **원인**: `components/.../OwnerStoreOrderCardStepperWithActions.tsx:68-69` `onPatchOrderRow` 미주입 경로에서 실패 시 `return false` 만.
2. **영향**: 오너 — 확인 다이얼로그 유지·사유 미표시, 반복 클릭.
3. **수정**: 실패 시 `runOwnerStoreOrderPatch` 와 같은 코드→문구 매핑을 다이얼로그 내부 오류 띠로 표시, 409(상태 변경됨)는 목록 재조회.
4. **연동**: 오너 → PATCH(CAS) → 주문자 상태(실패 시 불변).
5. **검증**: RTL(409 → 메시지+재조회). 6. **보존**: 정상 경로·알림 불변. 7. **운영 데이터**: 없음. 8. **Owner 결정**: 없음.

### IA-18 · 고아 컴포넌트 18·고아 라우트 3 — **P3 · 웹**
1. **원인**: import 0 컴포넌트 18(appendix IA §3 IA-18 목록), 진입 링크 없는 `/ads/event-promotions`, 슬러그 알림 2종.
2. **영향**: 유지보수(토큰 위반 상위 파일 `OwnerStoreOrderDetailPanel` 32건 포함).
3. **수정**: 라우트는 삭제하지 않고 진입점 부여(이벤트 프로모션 → 그룹 08) 또는 서버 redirect(슬러그 → IA-07). 컴포넌트 18개는 D-12 결과에 따라 삭제.
4. **연동**: 없음. 5. **검증**: `tsc`·import 그래프 0 재확인 후 삭제, `npm run verify:routes`. 6. **보존**: URL 보존. 7. **운영 데이터**: 없음. 8. **Owner 결정**: 기존 **D-12**(권장안 삭제).

### IA-19 · hex 186·팔레트 369·비표준 반경 42, `--biz-*` 별도 톤 — **P3 · 웹**
1. **원인**: 오너 UI 하드코딩(상위: `OwnerStoreOrderMockCard` 21, `OwnerDeliveryAdsHubView` 14 — `#0A823E`·`#BDBDBD`·`bg-white` `:530-538`, `OwnerStoreOrdersMobileBody` 13, `OwnerStoreOrderChatsView` 13), 사이드바 `--biz-*`(`BusinessAdminSidebar.tsx:76-103`), `/order-chat/[orderId]` 실패 원시 HTML(`lib/business/owner-order-chat-ensure-document.ts:86-93`).
2. **영향**: 오너 — 화면마다 다른 색·반경, 다크모드 깨짐.
3. **수정**: `--sam-*`·`Sam.*`·`rounded-ui-rect` 치환(원·pill 만 `rounded-full`), `--biz-*` 는 `--sam-*` 브리지 변수로 재정의(값 통일, 클래스 유지), 실패 문서는 토큰 CSS 인라인 최소 셸. 화면 단위로 4-3 의 44행 표 순서대로.
4. **연동**: 없음(표시).
5. **검증**: grep 카운트 감소 스크립트(변경 파일 0 목표), 화면 실측 L5.
6. **보존**: 브랜드 `--sam-primary #0B421A` 고정, 레이아웃 치수 불변.
7. **운영 데이터**: 없음. 8. **Owner 결정**: 없음(AGENTS UI 토큰 규정 적용).

### IA-20 · PC 고정 사이드바 없음·드로어 접근성 — **P3 · 웹**
1. **원인**: `app/owner-compact-shell.css:276-279` `.owner-ops-desktop-sidebar{display:none !important}`, 드로어 ESC 는 scrim 포커스일 때만(`OwnerMobileOpsMenuDrawer.tsx:75-81`), 포커스 트랩 없음.
2. **영향**: PC 오너 — 매 이동마다 햄버거. 키보드 사용자 탈출 불가.
3. **수정**: 접근성(ESC 전역·포커스 트랩·복귀)은 결정 없이 수정. ≥1280px 좌측 고정 사이드바(12그룹, 접기)+하단탭 숨김은 D-11 승인 시 같은 레지스트리로 렌더.
4. **연동**: 셸만. 5. **검증**: RTL 키보드, 반응형 스냅샷. 6. **보존**: 폰 레이아웃 불변. 7. **운영 데이터**: 없음. 8. **Owner 결정**: 기존 **D-11**(권장안 도입).

## 4-4. 공통 기반 4-0 (RC-11 해소 primitive — 신규 컴포넌트 최소)

| primitive | 위치(신규 파일 1개씩) | 계약 |
|---|---|---|
| `OwnerStateView` | `components/business/owner/OwnerStateView.tsx` | `kind: loading(스켈레톤) | empty(다음 행동 CTA 1개) | error(재시도) | no_permission | suspended | under_review | revision_requested` — 뒤 4종은 1-B 게이트 결과의 사유·허용 화면 링크를 표시. 토큰: `bg-sam-surface`·`text-sam-fg`·`border-sam-border`·`rounded-ui-rect` |
| `useOwnerToast` | `components/business/owner/OwnerToastHost.tsx` | 성공·실패 2종, 셸 1곳 마운트, 상품 허브 자체 토스트(`OwnerProductsHubClient.tsx:150-235`) 이관 |
| `OwnerStoreAdminConfirmModal` | 기존 | `busy` 필수 prop(미전달 시 타입 오류), danger/primary |
| `useOwnerFormIdempotencyKey` | `lib/business/owner-form-idempotency-key.ts` | 마운트 시 `crypto.randomUUID()` 1회, 성공 시에만 재생성(광고 `clientRequestId` 패턴) — 쿠폰 재발행·상품 등록·상품권 신청에 사용(FIN-04 Cash/Coin 은 2-A 소관) |
| `ownerFetchJson` | `lib/business/owner-fetch-json.ts` | `res.json()` 예외·네트워크 오류·HTTP 코드 → `owner-api-error-i18n` 문구, 401/403 은 `OwnerStateView` 전환 |

## 4-5. 오너 화면별 UI/UX/CTA 일관성 명세 (12그룹 전 화면)

범례 — 셸: **F**=매장 어드민 폼 셸(섹션 카드 `OwnerStoreAdminDashSection`+하단 저장/취소 바) / **L**=목록 셸(섹션 카드+목록, 하단 바 없음) / **H**=허브(카드 링크). 상태: L·E·Er·P = 로딩·빈·오류·권한(정지·심사중 포함) 화면 `OwnerStateView`. 확인창: 위험 작업만 `OwnerStoreAdminConfirmModal`(busy). 피드백: T=토스트, B=폼 상단 오류 띠. 멱등: K=폼 고정 키(서버 UNIQUE), C=CAS(`expected_*`). 서버 authz: O=소유, A=승인 필요, S=정지 허용, R=정지 시 조회만(1-B 게이트 값). 토큰은 전 화면 공통(`--sam-*`·`rounded-ui-rect`) — 열 생략, 현행 위반은 「현행 결함」 열에 표기.

| # | URL | 그룹 | 셸 | 상태 4종 | 확인창(대상) | 피드백 | 멱등 | 서버 authz | 현행 결함(ID) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `/stores/owner` | 01 | H | L·E(첫 주문 안내)·Er·P(심사중 배너) | — | T | — | O | IA-01(구현 중), 카운트=ORD-05 서버 필터 |
| 2 | `/apply` | 12 | F(apply 원형) | L·Er | 제출 | B | K(1계정1매장 UNIQUE) | 로그인 | — |
| 3 | `/orders` | 02 | L(탭 신규·진행·완료·취소/환불) | L·E·Er·P(정지=허용 배너) | 거절·취소·취소결정 | T+다이얼로그 내 B | C(`expected_status`) | O·S | IA-23, ORD-05(구현 중), 토큰 13(`OwnerStoreOrdersMobileBody`) |
| 4 | `/order-chats` | 02 | L | L·E·Er·P | — | T | — | O·S | 토큰 13, IA-11 |
| 5 | `/order-chat/[orderId]` | 02 | (Route Handler) | Er(토큰 셸 문서) | — | — | — | O·S(주문 당사자) | IA-19 원시 HTML |
| 6 | `/products` | 03 | L | L·E(첫 상품 등록 CTA)·Er·P | 삭제·노출 OFF | T(기존 이관) | C(PRD-07) | O·A | PRD-12, PRD-09 |
| 7 | `/products/new` | 03 | F | L·Er·P | 이탈 | B | K(PRD-15) | O·A | PRD-15, PRD-16 |
| 8 | `/products/[id]/edit` | 03 | F | L·Er·P | 이탈·삭제 | B | C(PRD-07) | O·A | PRD-10, PRD-14, PRD-03(2-E) |
| 9 | `/menu` (redirect) | 03 | — | — | — | — | — | — | IA-07(1홉) |
| 10 | `/menu-categories` | 03 | F | L·E·Er·P | 삭제(상품 이동 선택) | B+T | 정렬 단일 RPC | O·A | PRD-11, PRD-13 |
| 11 | `/settings` | 04 | H+토글 | L·Er·P | 노출 OFF·영업 OFF(D-14) | T(실패 원복) | — | O·A | IA-12 죽은 버튼, IA-17 |
| 12 | `/ops-status` | 04 | L | L·Er·P(심사 사유 표시) | — | — | — | O·preApproval | OPS-04 라벨, 토글→링크 |
| 13 | `/basic-info` | 04 | F | L·Er·P | 이탈·위치 1km 이동 | B | C(OPS-09) | O·preApproval | OPS-05, LOC-007, LOC-013 |
| 14 | `/profile` (영업·배달 설정) | 05 | F | L·Er·P | 이탈·배달 OFF | B | C(OPS-09) | O·preApproval | OPS-03, OPS-09 |
| 15 | `/profile#delivery` 지역 편집 | 05 | F 섹션 | L·Er | 지역 교체 저장 | B | C(LOC-006 `expected_updated_at`) | O·A | LOC-006 |
| 16 | `/edit` (redirect) | 04 | — | — | — | — | — | — | IA-07 storeId 유실 |
| 17 | `/settlements` | 06 | L | L·E·Er·P | — | — | — | O·R | IA-13 용어 |
| 18 | `/finance?section=outstanding|transactions` | 06 | L(탭) | L·E·Er | — | — | — | O·R | IA-12(`orders` 탭 중복) |
| 19 | `/finance?section=coin|cash|convert|withdraw|ads` | 07 | L+폼 | L·E·Er·P | 충전·전환·Coin 환전 | B+T | K(FIN-04, 2-A) | O·A(쓰기)·R | FIN-04/IA-22(2-A), IA-13 |
| 20 | `/business-cash`, `/points` (redirect) | 07 | — | — | — | — | — | — | section 지정 보존(IA-07) |
| 21 | `/ads` | 08 | L | L·E(첫 광고 CTA)·Er·P | — | T | — | O·A | 토큰 14, IA-08 storeId 링크 |
| 22 | `/ads/new/store-sponsored` | 08 | F | L·Er·P | 제출(Cash 차감 금액 표시) | B | K(clientRequestId 기존) | O·A | ADS-02 |
| 23 | `/ads/new/banner` | 08 | F | L·Er·P | 제출 | B | K | O·A | ADS-02 |
| 24 | `/ads/new/platform-popup` | 08 | F | P(판매 중지 안내) | — | B | K | O·A | ADS-13(재개 전) |
| 25 | `/ads/[campaignId]` | 08 | L | L·Er·P | 일시중지·종료·초안 삭제 | T | C(RPC CAS 기존) | O·A | ADS-01·11 기간 표시 |
| 26 | `/ads/partner` | 08 | F | L·Er·P | 신청(회비 표시) | B | K(ADS-04 RPC) | O·A | ADS-04·05 |
| 27 | `/ads/popup/[requestId]` | 08 | L | L·Er | — | — | — | O | — |
| 28 | `/ads/event-promotions` | 08 | L | L·E·Er·P | — | T | K | O·A | IA-08 `stores[0]`, IA-18 진입점 |
| 29 | `/ads/event-promotions/[requestId]` | 08 | F | L·Er | 제출 | B | K | O·A | IA-11 부모, 풀 리로드 제거 |
| 30 | `/coupons` (+`?create=1`, `?campaign=`) | 08 | L+F | L·E·Er·P | 일시정지·종료·재발행 | T+B | C(IA-04)+K(IA-05) | O·A | IA-04·05·06, ADS-23 |
| 31 | `/banners` | 08 | L+F | L·E·Er·P | 삭제 | T | — | O·A | 실패 무음, IA-03(구현 중) |
| 32 | `/notices` | 08 | L+F | L·E·Er(503 unavailable)·P | 삭제 | T | — | O·A | OPS-01 |
| 33 | `/gift-certificates` (+`?view=`) | 09 | L+F | L·E·Er·P | 판매 신청 | B | K | O·A | 멱등 없음, GFT-04(2-C) |
| 34 | `/customer-care` | 10 | H | L·Er·P | — | — | — | O | IA-11 |
| 35 | `/inquiries` | 10 | L | L·E·Er·P | 종료 | T | — | O·A | IA-16 |
| 36 | `/reviews` | 10 | L | L·E·Er·P | 답글 삭제 | T(목록 유지) | — | O·A | IA-15, OPS-10 |
| 37 | `/notifications` | 11 | L | L·E·Er | — | T | single-flight 기존 | 사용자 | IA-08 `list[0]`, IA-09 제목 |
| 38 | `/notification-settings` | 11 | F(토글) | L·Er | — | T(실패 원복) | — | 사용자 | IA-14 |
| 39 | `/customer-care/customer-center` | 12 | L | L·E·Er | 문의 전송 | B | K | 사용자 | — |
| 40 | `/customer-care/messages|inquiries` (redirect) | 12 | — | — | — | — | — | — | IA-12 클라 2홉 |
| 41 | `/customer-care/{messages,inquiries}/[threadId]` | 12 | L | L·Er | — | T | — | 사용자 | — |
| 42 | `/stores/[slug]/owner/notifications`·`notification-settings` | 11 | (redirect 전환) | — | — | — | — | — | IA-07·IA-18 분기 사본 |
| 43 | `/stores/[slug]/owner/orders` | 02 | (redirect) | — | — | — | — | — | storeId 보존(IA-07) |
| 44 | `/my/business/*`(20)·`/mypage/business/*`(4) | — | (redirect) | — | — | — | — | — | IA-07 쿼리 보존 |

PASS 기준(화면 1행): 위 열이 모두 충족 + 문서 E §6 CTA 8기준 + 4-2 레지스트리 제목·활성·뒤로가기 일치. 판정은 L1(RTL·vitest) PASS 와 L5(오너 실측) PASS 를 구분해 기록하고, 실측 전은 NOT_PROVEN.

## 4-6. 작업 묶음

| 순서 | 묶음 | 결함 | 결정 | 검증 |
|---|---|---|---|---|
| 4-0 | 공통 primitive | RC-11 기반 | 없음 | vitest·RTL |
| 4-1 | 레지스트리 파생(12그룹) | IA-09·10·11·21 | D-13(라벨 2개) | 44행 경로 표 테스트 |
| 4-2 | 매장 컨텍스트·리다이렉트 | IA-07·08 (+슬러그 redirect) | 없음 | 매핑표·`verify:routes`·`npm run build` 1회 |
| 4-3 | 중복·용어·알림 설정 | IA-12·13·14 | D-13 | i18n grep |
| 4-4 | 화면 피드백 | IA-15·16·17·23 (+IA-06 교체) | D-14 | RTL |
| 4-5 | 고아 | IA-18 | D-12 | import 그래프 |
| 4-6 | 토큰 | IA-19 | 없음 | grep 카운트 |
| 4-7 | PC 레이아웃·접근성 | IA-20 | D-11 | 반응형 |

각 묶음 배포 구분 **웹**. 성능 민감 경로 아님(오너 셸) — `verify:parity-gates` 불요. 예외: 4-2 는 라우트 구조 변경이므로 `npm run build` 1회.

---

# 5단계 — 주문자 ↔ 오너 ↔ 관리자 전 구간 회귀 검증

## 5-0. 원칙

- **PASS = 5홉 일치**: 같은 주문(또는 같은 매장·캠페인·요청) ID 를 **주문자 행동 → 오너 화면 → 서버·DB → 관리자 화면 → 주문자 결과** 로 추적해 상태·금액·사유·알림이 모두 같은 값일 때만 PASS. 한 층만 통과하면 「부분 PASS(층 이름)」로 보고한다.
- 결과 표기 구분: 로컬 검증 PASS / Preview PASS / Production PASS / 실기기 PASS — 측정하지 않은 층은 NOT_PROVEN.
- 수수료 기준: 주문 `created_at >= 2026-10-20 20:30:00+00` 만 조리 진입(`preparing`) 시 의무 1행(7%). 이전 생성 주문은 0행(D-1, 마이그레이션 `20270602100100` `c_charge_from`).
- 과거 운영 데이터는 기대값 비교 대상에서 제외(D-5) — 불변식 SQL 은 「적용 시각 이후」 행만 본다.

## 5-1. 검증 층

| 층 | 방법 | 쓰기 | 실행 조건 |
|---|---|---|---|
| L1 | vitest(라우트·lib 단위, Supabase mock) + RTL | 없음 | 항상, 각 묶음 로컬 1회 |
| L2 | DB 계약 테스트 — 격리 DB 에서 `BEGIN … ROLLBACK` SQL 시나리오(RPC·트리거·RLS) | 격리 DB 만 | **ND-3 지시 필요**. 운영 DB 는 롤백 트랜잭션이라도 이 계획에서는 사용하지 않는다. `dibay-test`·`dibay-reset-qa` 는 명시 지시 없이 금지 |
| L3 | Playwright e2e(`playwright.config.ts`, `tests/e2e/`) — 주문자·오너·관리자 3 브라우저 컨텍스트 | 읽기 시나리오만 Preview, 쓰기는 격리 DB 연결 환경만 | Preview 의 Supabase 대상 NOT_PROVEN → 운영이면 쓰기 금지. 쓰기 케이스는 ND-3 |
| L4 | 운영 읽기 전용 불변식 SQL(SELECT 만, 개인정보 컬럼 제외) — 배포 후 자연 발생 트래픽 대상 | 없음 | 배포 후 1회(반복 폴링 금지) |
| L5 | 수동 실측 — 오너(앱 재시작 후)·관리자·주문자 계정 | 운영 실거래 | Owner·작업자. 설치 버전은 `public.user_devices.app_version` 으로 먼저 확인 |

## 5-2. 시나리오 매트릭스

각 표의 5행이 5홉이다. 속성 줄: **원천**(데이터 SSOT) · **권한** · **상태 변화** · **알림** · **금전 기록** · **검증** · **PASS**.

### S01 상품 등록·수정 → 주문자 메뉴 (3케이스: 등록 / 가격·옵션 수정 / 품절·숨김)
| 홉 | 기대 |
|---|---|
| 주문자 행동 | 매장 메뉴·상품 상세 열람, 장바구니 담기 |
| 오너 화면 | `/products/new`·`/edit` 저장 → 허브에 서버 값(가격·상태·검수) 표시, 실패 시 B 띠 |
| 서버·DB | `POST/PATCH /api/me/stores/[storeId]/products*`(service_role) → `store_products` 1행, 공용 캐시 세대 +1(OPS-02), 직접 REST 쓰기 42501(P0-2) |
| 관리자 화면 | 관리자 상품 목록 같은 가격·상태, 검수 반려 상품은 오너가 active 불가(PRD-03) |
| 주문자 결과 | 2초 내(공용 세대) 새 가격·품절 반영, 체크아웃 RPC 가 같은 가격으로 재계산(`price_changed` 없음) |
- 원천 `store_products` · 권한 O·A + 관리자 business · 상태 product_status · 알림 없음 · 금전 없음(주문 시 스냅샷) · 검증 L1(라우트), L3(오너 저장→주문자 메뉴 읽기, 쓰기는 ND-3), L5 · **PASS**: 오너 허브·관리자 목록·주문자 메뉴·주문 라인 스냅샷 가격 4곳 동일.

### S02 주문 생성 → 접수 → 조리(수수료) → 배달 → 완료 (3케이스: 기준 이후 주문 정상 완료 / 자동 구매확정(ORD-02) / 기준 이전 생성 주문 상태 전이)
| 홉 | 기대 |
|---|---|
| 주문자 행동 | 체크아웃(배달 가능 판정 PASS) → 주문 생성, 상태 추적 |
| 오너 화면 | `/orders` 신규 탭에 즉시(Realtime+푸시) — 60건 넘어도 노출(ORD-05) → 접수(조리시간) → 조리 시작 → 배달 출발 → 배달 완료 |
| 서버·DB | `create_store_order_atomic`(LOC-004 스냅샷 컬럼 NOT NULL) → `applyStoreOrderStatusTransition` CAS 전이 → `preparing` 진입 TX 에서 트리거가 `store_sale_fee_obligations` 1행(7%)+캐시 차감/미납 → 완료 시 Coin 인식 |
| 관리자 화면 | 관리자 주문 상세 같은 상태·타임라인, `/admin/store-settlements` 에 의무 1행(오너 `/settlements` 와 같은 SQL 함수) |
| 주문자 결과 | 각 단계 알림(수락 시 ETA), 완료 후 리뷰 가능 |
- 원천 `store_orders.order_status`·`store_sale_fee_obligations`·`business_cash_ledger` · 권한 오너 O·S(정지 매장도 진행 주문 처리) · 알림 단계별 1회(dedupe) · 금전 수수료 의무 1행 + SALE_FEE 원장 1행(또는 미납) · 검증 L1(전이 그래프), L2(트리거: 기준 이후 1행/이전 0행, ND-3), L3, L4(I-1·I-2), L5 · **PASS**: 오너·관리자·주문자 상태 동일 + 기준 이후 주문 의무 정확히 1행·금액 7% + 기준 이전 주문 0행 + 오너·관리자 원장 화면 합계 동일.

### S03 구매자 취소 (3케이스: 접수 전 즉시 취소 / 접수 후 취소 요청 → 오너 승인 / → 오너 반려)
| 홉 | 기대 |
|---|---|
| 주문자 행동 | 접수 전: 취소 버튼 / 접수 후: 사유 입력 취소 요청 |
| 오너 화면 | 접수 전: 신규 탭에서 사라짐(CAS — 동시 접수 시 한쪽만) / 요청: 취소·환불 탭에 표시 → 승인 또는 반려(사유 필수) |
| 서버·DB | 접수 전 CAS `pending→cancelled` + 재고 복원 / 요청 DB 함수(원장+상태 1 TX) → `/decide` `expected_status` CAS(ORD-06 원장 원자성) / 조리 이후 승인 시 수수료 검토 플래그(트리거) |
| 관리자 화면 | 같은 상태·사유, 조리 후 취소면 수수료 검토 큐(`admin_decide_store_commission_adjustment` 대상) |
| 주문자 결과 | 취소 완료 또는 반려 사유 알림, 쿠폰·상품권 복원(S06) |
- 원천 `store_orders`·취소 원장 · 권한 구매자 본인/오너 O·S · 알림 구매자·오너 각 1 · 금전 조리 전 취소: 의무 없음 / 조리 후: 검토 플래그만(자동 환급 없음 — SSOT) · 검증 L1, L2(경합 2세션), L3, L5 · **PASS**: 3홉 상태 일치 + 반려 사유가 주문자에게 원문(또는 D-22 결과 형식)으로 도달 + 원장 pending 잔존 0.

### S04 오너 직접 취소 (2케이스: 접수 후 재료 소진 / 조리 후)
| 홉 | 기대 |
|---|---|
| 주문자 행동 | 대기 |
| 오너 화면 | 주문 카드 「주문 취소」 → 사유 선택·입력 → 확인창(busy) |
| 서버·DB | 상태 CAS + 취소 원장 같은 TX(ORD-06) + 재고 복원(수동 품절 유지 — PRD-06) + 조리 후면 수수료 검토 플래그 |
| 관리자 화면 | 사유·주체(매장) 표시, 조리 후면 검토 큐 |
| 주문자 결과 | 「매장이 취소했습니다 — 사유」 알림(ORD-09), 쿠폰·상품권 복원 |
- 금전: 의무 행 유지 + 검토 플래그(TS 가 금액 수정 금지) · 검증 L1, L2(ND-3), L5 · **PASS**: 사유 문자열 오너·관리자·주문자 3곳 동일 + 원장·상태 원자(한쪽만 존재 0).

### S05 관리자 개입이 오너 결정을 덮어쓰는 경우 (3케이스: 오너 반려 직후 관리자 강제 취소 / 관리자 권한 없는 스태프 / 정상 개입)
| 홉 | 기대 |
|---|---|
| 주문자 행동 | 취소 요청 후 반려 통지 수신 상태 |
| 오너 화면 | 반려 완료 표시 → 관리자 개입 후 「관리자 처리」 배지·사유 표시, 오너 CTA 잠김(`admin_locked`) |
| 서버·DB | `runAdminStoreOrderIntervention` 이 확인 시점 상태를 `expectedCurrentStatus` 로 전달(ORD-04) → 오너 반려로 상태가 바뀌었으면 409 `status_changed`, 관리자가 재확인 후 재실행. 사유 필수·`audit_logs` 1행 |
| 관리자 화면 | 409 시 「상태가 바뀌었습니다」 + 최신 상태, 권한 없는 스태프는 403(권한키) |
| 주문자 결과 | 최종 처리 1회 알림(시스템/관리자 주체 문구 — NTF-02), 중복 부수효과 0(NTF-05) |
- 권한 관리자 권한키 + 사유 필수 · 금전 조리 후면 검토 플래그 1회 · 검증 L1(`lib/admin/store-orders/__tests__/admin-store-order-intervention.test.ts` 확장), L2(ND-3), L5 · **PASS**: 오너 결정이 「몰래」 덮어써지지 않음(409 또는 감사 1행+사유가 오너·주문자 화면에 표시) + 알림 1회.

### S06 환불 — 쿠폰·상품권·Coin 역거래 (4케이스: 매장 부담 쿠폰 / 플랫폼 부담 쿠폰 / 상품권 사용 / 완료 후 환불로 Coin 역분개)
| 홉 | 기대 |
|---|---|
| 주문자 행동 | 환불 요청(또는 취소 결과) |
| 오너 화면 | 환불 승인 → 주문 금액·할인 분할 표시 |
| 서버·DB | 상태 전이와 **같은 TX** 에서 `restore_store_coupon_entitlement`(ADS-21)·`gift_certificate_cancel_order_restore`/`gift_certificate_refund_order_atomic`(GFT-05)·`reverse_coin_credits_for_order`(`coin_reversal:order:{id}`, FIN-05) |
| 관리자 화면 | 쿠폰 사용 이력(삭제 아닌 reversed), 상품권 원장 역처리 1행, Coin 원장 역분개 1행 |
| 주문자 결과 | 쿠폰함에 쿠폰 복원(만료 전), 상품권 잔액 복원(만료 상품권은 D-20 결과), 결제액 환불 안내(매장 직접 결제 — 플랫폼 환불 아님) |
- 금전: 각 역거래 정확히 1회(멱등키) · 검증 L2(실패 주입 → 상태도 롤백, ND-3), L4(I-5·I-6), L5 · **PASS**: 상태 refunded/cancelled 인데 복원 미실행 0 + 복원 실행인데 주문 미취소 0(GFT-01 가드) + 3원장 금액 합 = 주문 할인·상품권·Coin 금액.

### S07 매장 정지·승인(관리자) → 오너 접근·주문자 노출 (4케이스: 승인 / 정지 / 정지 해제 / 오너 탈퇴(ACC-03))
| 홉 | 기대 |
|---|---|
| 주문자 행동 | 홈·검색·상세·배너·장바구니 결제 시도 |
| 오너 화면 | 정지: `OwnerStateView suspended`(사유) + 진행 주문·주문 채팅만 허용(D-16) / 승인: 전 메뉴 / 심사중·보완: 프로필·기본정보 편집 가능(IA-01) |
| 서버·DB | 관리자 `PATCH /api/admin/stores/[id]` 전이표+감사, 오너 쓰기 API 는 1-B 게이트(403 `store_suspended`), 오너 REST 직접 해제 42501(P0-1), 주문 RPC 정지 거부 |
| 관리자 화면 | 매장 상태·감사 이력, 진행 주문 목록 |
| 주문자 결과 | 정지 매장 목록·검색·히어로/물리 배너(ADS-06) 미노출, 직접 URL 결제 거부, 진행 주문은 계속 처리됨 |
- 알림 오너 1(i18n) · 금전 없음(광고·쿠폰 처리는 D-23) · 검증 L1(게이트 매트릭스), L3(읽기: 정지 후 주문자 목록·배너), L5 · **PASS**: 관리자 상태 = 오너 화면 상태 = 서버 게이트 판정 = 주문자 노출 4곳 일치, 공용 캐시 TTL 내 반영.

### S08 서비스 지역 변경 → HOME/BROWSE/SEARCH/상세/장바구니/체크아웃 판정 (4케이스: 반경 축소 / 좌표 이동 1km 초과 / V2 지역 교체 / 좌표 없는 매장·정책 OFF·설정 조회 실패)
| 홉 | 기대 |
|---|---|
| 주문자 행동 | 같은 대표 주소로 홈·브라우즈·검색·ORDER NOW·상세·장바구니·체크아웃 |
| 오너 화면 | 기본정보·영업·배달 설정 저장(1km 초과 확인창, LOC-007), V2 편집기 저장(409 동시 저장) |
| 서버·DB | PATCH(좌표 실변경일 때만 후처리, LOC-013) → 감사 1행 → `replace_store_delivery_service_areas` 원자(LOC-006) → `evaluateDeliveryServiceArea` 단일 판정(fail-closed, LOC-003) → 주문 시 판정 스냅샷 저장(LOC-004), 진행 주문 직선거리 불변 |
| 관리자 화면 | 매장 위치·지역·감사 이력, 주문 상세 「주문 당시 판정」 |
| 주문자 결과 | 7개 진입점 판정 동일(경계 0,0·좌표 누락 포함 LOC-010), 거부 사유 코드 정확(LOC-009) |
- 금전: 배달비 `store_charged_delivery_fee_php` 불변 · 검증 L1(판정 매트릭스: 진입점 7 × 케이스 4 = 28셀 같은 결과), L2(RPC·트리거, ND-3), L3(읽기 진입점 비교), L4(I-8), L5 · **PASS**: 28셀 모두 같은 eligible·reason + 주문 행 스냅샷 = 체크아웃 판정.

### S09 광고 제출·승인·반려·환불 (5케이스: 정상 승인 / 지연 승인(기간 재계산) / 반려 환불 / 만료 미심사 자동 반려(신청 기준 이후) / 파트너 동시 결정)
| 홉 | 기대 |
|---|---|
| 주문자 행동 | 노출 영역에서 광고 열람·클릭 |
| 오너 화면 | 신청(기간·인벤토리 서버 산출, ADS-02) → 제출 시 Cash 차감 금액 확인 → 상세 기간·상태 |
| 서버·DB | 제출 RPC(Cash 차감+스냅샷 검증) → 관리자 승인 RPC(기간 재계산, ADS-01) / 반려 RPC(환불 같은 TX) / 크론 `expire_unreviewed`(신청 기준 이후만) / 파트너 결정 RPC(ADS-03) |
| 관리자 화면 | business 권한만 승인·반려(ADS-08), 큐에 미펀딩 분리(ADS-12) |
| 주문자 결과 | 승인 기간에만 노출, 정지 매장 미노출 |
- 금전: AD_SPEND 1·AD_REFUND 0/1(멱등) · 검증 L1, L2(ND-3), L4(I-10·I-11), L5 · **PASS**: 오너 Cash 원장 = 펀딩 행 = 관리자 화면 금액, 노출 기간 = 스냅샷 기간.

### S10 캐시 충전·Coin→Cash 전환·Coin 출금 (3케이스)
| 홉 | 기대 |
|---|---|
| 주문자 행동 | (해당 없음 — 조리 진입 수수료가 캐시에서 차감되는 S02 와 연동) |
| 오너 화면 | 충전 신청(참조번호, 폼 고정 키) / 전환(확인창·견적 버전) / Coin 환전(확인창·계좌) |
| 서버·DB | `owner_create_business_cash_charge_request`(PENDING 1건 제한) → `approve_business_cash_charge_request`(관리자 신원·자기 매장 금지, 미납 상계 `settle_store_sale_fee_obligations` FIN-02 키) / `convert_store_economic_points_to_business_cash` / `coin_withdrawal_requests` → `coin_withdrawal_mark_paid`(참조번호) |
| 관리자 화면 | 충전 승인 큐·출금 지급 큐, 감사 |
| 주문자 결과 | — (다음 주문 수수료 차감 시 미납 0) |
- 금전: 각 1회(멱등키 재전송 1행) · 검증 L1(키 고정), L2(ND-3: 같은 금액 2회 부분 상계 UNIQUE 충돌 없음), L4(I-3·I-4), L5 · **PASS**: 오너 잔액 = 원장 합 = 관리자 화면, 재시도 중복 0.

## 5-3. 운영 읽기 전용 불변식 SQL (L4, SELECT 만, 적용 시각 이후 행)

| ID | 불변식 | 기대 |
|---|---|---|
| I-1 | 기준(`2026-10-20 20:30 UTC`) 이후 생성 + 조리 이후 상태인데 수수료 의무 없는 주문 | 0 |
| I-2 | 기준 이전 생성 주문에 기준 이후 생성된 의무 | 0 |
| I-3 | Cash 계정 잔액 ≠ 원장 합(기존 1곳 −₱225 는 D-5 제외 목록으로 고정) | 신규 불일치 0 |
| I-4 | 원장 멱등키 중복·NULL | 0 |
| I-5 | refunded/cancelled 인데 redeemed 쿠폰·미역처리 상품권(적용 이후 주문) | 0 |
| I-6 | 상품권 역처리인데 주문 미종료(적용 이후) | 0 |
| I-7 | `pg_trigger` 수수료 lifecycle `tgenabled='O'` | true |
| I-8 | 적용 이후 local_delivery 주문 `checkout_serviceability_reason IS NULL` | 0 |
| I-9 | 적용 이후 `delivery_available AND lat IS NULL` 로 **바뀐** 매장 | 0 |
| I-10 | 광고 펀딩 ↔ Cash 원장 1:1, REJECTED↔REFUNDED, ACTIVE↔SECURED | 불일치 0 |
| I-11 | 적용 이후 OWNER_PAID 캠페인 `end_at-start_at > duration_days_snapshot` | 0 |
| I-12 | 적용 이후 쿠폰 lifecycle 이 ended/revoked → active 로 바뀐 감사 이벤트 | 0 |

## 5-4. 단계별 회귀 게이트

| 반영 묶음 | 재실행 시나리오 | 필수 층 |
|---|---|---|
| 3-A 위치 | S08 전체, S02(체크아웃 판정·스냅샷) | L1 + L4(I-8·I-9) (+L2 는 ND-3) |
| 주문 RPC 재정의 | S02, S03, S08 | L1 + L2(ND-3 필수 — 미결 시 (2) 영업 SQL 함수 배포 보류) |
| 3-B 매장 운영 | S07(영업 판정), S01(캐시) | L1 + L5 |
| 3-C 쿠폰 | S06(쿠폰), S07(정지 시 쿠폰 쓰기 403) | L1 + L4(I-12) |
| 3-D 광고 | S09, S07(배너) | L1 + L4(I-10·I-11) (+L2) |
| 3-E 상품 | S01 | L1 + `verify:owner-products-perf` |
| 4단계 각 묶음 | 4-5 표 해당 행 + S07(권한 화면) | L1(RTL) + L5 |
| 단계 종료 | S01~S10 전체 | L1 전부 + L4 1회 + L5 Owner 확인 |

## 5-5. 보고 형식 (각 반영 1회)

첫 줄 `npm run verify:native-version-bump` 의 `[배포 구분]`(예상: 웹 — 네이티브 없음) → 원인 · 수정 · 검증(L1 PASS / L2 NOT_PROVEN(ND-3 대기) / L3 NOT_PROVEN / L4 결과 / L5 NOT_PROVEN) · 배포 SHA · 남은 위험. 운영 주소(samarket.vercel.app)는 main 반영 전에는 바뀌지 않는다. CI·배포 결과는 기다리지 않는다.

## 부록 — 남은 위험

1. ND-3 미결이면 DB 함수·트리거 변경(LOC-004/005/006, OPS-07/08, ADS-01~05·11·13, PRD-11, IA-05 인덱스)의 회귀 증거가 L1(mock)뿐 — 운영 적용 후 L4 불변식으로만 확인 가능.
2. 주문 RPC 는 3개 묶음(2-E PRD-03, OPS-08, LOC-004)이 같은 함수를 재정의 — 순서 위반 시 앞 변경 유실. 착수마다 운영 `pg_get_functiondef` 기준선 비교 필수.
3. 4단계 화면 실측 PASS 0 — 모든 화면 판정은 Owner·작업자 실측 전 NOT_PROVEN.
4. 기존 미결 결정(D-9·10·11·12·13·14·15·17·18·19·23)은 권장안 기준 설계 — 다른 선택 시 해당 항목 3·5번만 바뀐다.
