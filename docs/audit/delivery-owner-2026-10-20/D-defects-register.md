# 문서 D — 배달 오너 시스템 결함·누락 통합 대장

- 감사일: 2026-10-20 (PHT) · 기준 HEAD `8c151baa` · 운영 DB `ckdosyydvgzqwpbwuhon` **읽기 전용** (카탈로그·집계 SELECT만, 개인정보 컬럼 미조회). 테스트 DB 미사용.
- 상세 근거(파일:줄, SQL, 수정 설계 전문, 검증 방법)는 `appendix/<도메인>.md` 의 같은 ID 절에 있다. 이 문서는 **중복을 합친 단일 대장**이다.
- 증명 상태: **PROVEN** = 코드 또는 운영 DB 로 확정 / **NOT_PROVEN** = 정적 근거만 있고 런타임 재현 안 함. 관리자·오너 화면 로그인 실측은 하지 않았다 → 화면 실측 PASS 는 이 대장에 하나도 없다.
- 배포 구분: **웹** = `app/`·`components/`·`lib/` · **DB** = 운영 DB 함수·RLS·권한·트리거·데이터(Owner 승인 필수) · **설정** = `vercel.json` 등 배포 설정.

## 0. 집계

| 구분 | 원본(도메인 합) | 중복 통합 후 |
|---|---|---|
| 전체 | 130 | **120** |
| P0 | 7 | **5** |
| P1 | 17 | **16** |
| P2 | 46 | **41** |
| P3 | 60 | **58** |

중복 통합 10건: ACC-01=LOC-002 · PRD-02⊃ACC-02 · ORD-01=FIN-01(=ACC X-01) · ORD-08=LOC-008 · IA-03⊃ADS-07+FIN-14 · FIN-03=GFT-03 · IA-04=ADS-20 · OPS-02⊃PRD-08 · FIN-04⊃IA-22.

**통합 시 정정 1건**: `appendix/ACC-OPS.md` 기능표 "owner 라우트 IDOR — 49 route 모두 소유자 게이트 PASS" 는 틀렸다. `app/api/me/stores/[storeId]/delivery-service-areas/route.ts` 3개 핸들러가 게이트 결과를 잘못 판정한다(P0-3). 통합 감사자가 `getStoreIfOwner` 호출 55곳을 전수 확인한 결과 오용은 이 파일 3곳뿐이다.

**통합 감사자 직접 재확인(교차 검증)**: P0-1(운영 pg_policies·column_privileges), P0-2(동일), P0-3(코드), P0-4(코드), P0-5(운영 pg_trigger `tgenabled='D'`), P1-ORD-02/03(`vercel.json`·pg_extension·pending 54건), OPS-01(`to_regclass('public.store_notices')` = NULL), LOC-005(좌표 없는 배달 매장 9곳), PRD-04(현재 할인가>정가 0건).

---

## 1. P0 — 금전 손실 · 타 테넌트 접근 · 중대한 권한 우회 (5)

| ID (별칭) | 영역 | 결함 | 영향 | 원인 핵심 | 증명 | 수정 설계 요약 | 배포 |
|---|---|---|---|---|---|---|---|
| **P0-1** ACC-01 (=LOC-002) | 매장 계약·권한 | 오너가 Supabase REST 로 자기 `stores` 행 **전 컬럼** 직접 UPDATE/INSERT — `approval_status`·`is_visible`·`point_commerce_blocked`·`is_featured`·평점·좌표·반경·`owner_user_id` 포함. 정지 매장 자기 해제, 승인 상태로 INSERT 가능 | 심사·정지·추천·위치 통제 전면 우회, 주문 무결성 | 운영 정책 `stores_update_owner_or_admin`(WITH CHECK 없음)·`stores_insert_owner`, `authenticated`/`anon` 69컬럼 UPDATE·INSERT GRANT, 보호 트리거 없음. **이 정책들은 저장소 마이그레이션에 없음(운영 드리프트)** | PROVEN(정책·권한) / 악용 흔적 NOT_PROVEN | `authenticated`/`anon` 의 `stores` INSERT·UPDATE REVOKE → 오너 쓰기는 기존 API(service-role)만. 보호 트리거 `stores_guard_privileged_columns`(BEFORE UPDATE: 비관리자면 승인·노출·추천·평점·소유자 컬럼 변경 거부)로 이중화. 정책을 마이그레이션 파일로 고정 | DB |
| **P0-2** PRD-02 (⊃ACC-02) | 상품 | `store_products` RLS `store_products_owner_all`(FOR ALL) + 33컬럼 UPDATE/INSERT GRANT → 오너가 `admin_review_status` 자기 승인, 관리자 차단 해제, 판매권한 미승인 상태에서 판매 활성화 | 관리자 검수·판매권한 통제 우회 | 운영 pg_policies·grants | PROVEN(정책) / 악용 NOT_PROVEN | 오너 직접 쓰기 REVOKE(조회만), 상품 쓰기는 API 경유. 관리자 전용 컬럼 보호 트리거 | DB |
| **P0-3** LOC-001 | 배달 지역 | `delivery-service-areas` GET/PUT/POST 의 소유 검사 `if (!owned)` — `getStoreIfOwner` 는 `{ok:false}` 객체를 반환하므로 **항상 통과** → 로그인 사용자 누구나 타 매장 배달 지역 교체·V2 활성화. 빈 목록이면 그 매장 배달 주문 전면 불가 | 타 매장 데이터 변경, 영업 방해 | `app/api/me/stores/[storeId]/delivery-service-areas/route.ts:44-45, 77-78, 152-153` | PROVEN(코드) / 런타임 재현 안 함 | `const gate = await getStoreIfOwner(...); if (!gate.ok) return 403/404` + 승인·정지 검사(P2 IA-03 공통 게이트). 회귀 테스트: 타인 storeId 403 | 웹 |
| **P0-4** PRD-01 | 상품 이미지·Storage | 상품 이미지 교체 시 "제거된 URL" 을 service-role 로 **버킷·경로 제한 없이** 삭제. 오너가 타 매장·커뮤니티(`post-images`) 공개 URL 을 자기 상품에 넣었다가 바꾸면 원본 영구 삭제 | 타 테넌트 데이터 파괴 | `app/api/me/stores/[storeId]/products/[productId]/route.ts:493-519` → `removeCanonicalImagesFromPublicUrls`(URL 에서 bucket/path 파싱 후 삭제). 저장 시 URL 소유 검사 없음 `lib/stores/owner-product-images.ts:70-94`. 배너·공지 라우트도 같은 패턴(보고) | PROVEN(코드) | 저장 시 URL 이 `store-products/{storeId}/` 접두 버킷 경로인지 검증(아니면 400), 삭제 시 같은 접두만 허용. 프로필 아바타의 기존 가드(`app/api/me/profile/route.ts:1202-1210`) 재사용. 배너·공지 동일 적용 | 웹 |
| **P0-5** FIN-01 (=ORD-01, X-01) | 수수료 | 운영 `trg_store_orders_commission_lifecycle` **비활성(`tgenabled='D'`)** → 조리 진입 시 7% 수수료 미부과, 조리 후 취소·환불의 검토 대기 미생성. 화면은 "부과 0" 을 정상처럼 표시 | 플랫폼 수익 누락. 단 10-17 이후 상태 전이 0건 → 현재 실손 0, 다음 전이부터 누락 | 저장소에 DISABLE 코드 없음 → 운영 수동 비활성 추정(주체·시점 NOT_PROVEN). 무결성 보고에 트리거 상태 검사 없음 | PROVEN(pg_trigger) | Owner 승인 후 `ENABLE TRIGGER` 를 마이그레이션 파일로 남겨 적용. 무결성 보고에 I7(조리 이후인데 의무 없음)·트리거 enabled 검사 추가. `verify-schema-authority` 에 `enabled='O'` 고정. 비활성 기간 주문 소급 여부는 Owner 결정(자동 소급 금지) | DB |

---

## 2. P1 — 주문 처리 실패 · 취소/환불 불일치 · 핵심 운영 불능 · 금전 정합성 (16)

| ID (별칭) | 영역 | 결함 | 원인 핵심 | 증명 | 수정 설계 요약 | 배포 |
|---|---|---|---|---|---|---|
| ORD-02 (⊃NTF-01) | 주문 수명주기 | 자동 구매확정·접수 독촉 크론이 **스케줄 미등록** — 만기 주문 미완료(10-01 만기 1건), 독촉 이벤트 0건 | `vercel.json` crons 에 두 경로 없음, 운영 pg_cron 없음 | PROVEN | `vercel.json` 에 `/api/cron/store-orders-auto-complete`(*/10), `/api/cron/store-order-accept-reminders` 등록(요금제 제약 시 독촉은 알림 지연 큐) | 설정 |
| ORD-03 | 주문 수명주기 | 미접수 주문 타임아웃·자동취소 없음, SLA 스캔 미실행 — `pending` 54건(최고 2026-07-07) 방치 | SYSTEM 전이에 accept_timeout 없음, `scan_store_order_sla_warnings` 는 pg_cron 전제 | PROVEN | SYSTEM `accept_timeout`(pending→cancelled) + 크론, SLA 스캔은 크론 라우트에서 RPC 호출. 기존 정체 건은 목록 제출 후 Owner 결정 | 웹+설정 |
| ORD-05 | 주문 목록 | 오너 주문 목록 **최근 60건 고정**, 검색·필터·페이지 없음 → 진행 중 65건(취소요청 18·pending 29 등) 비노출 | API 가 RPC 의 status·cursor 를 안 넘김 `app/api/me/stores/[storeId]/orders/route.ts:211-215` | PROVEN | status/cursor/q/기간 파라미터 + 「더 보기」. 성능 민감 → `verify:parity-gates` | 웹 |
| IA-01 | 온보딩 | 보완요청·심사중 매장이 「수정하기/프로필 보기」 → 가드 모달로 다시 차단 + `/mypage` 동시 push 경쟁 → **신청 보완 불가** | `StoreBusinessGuard` 예외 없음 vs 정책 `store-business-hub-nav-intercept.ts` 예외 | PROVEN(코드) / 현재 비승인 매장 0 → 잠재 | 가드에 신청·프로필·기본정보 예외를 정책 파일 단일 정의로 적용, 모달 링크 경쟁 제거 | 웹 |
| ACC-03 | 계약 종료 | 회원 탈퇴 처리 시 매장 미처리 → 탈퇴 사장 매장이 노출·주문 수신 | `app/api/admin/users/[id]/delete/route.ts` 에 매장 처리 없음 | PROVEN(코드) / 현재 해당 0 | 탈퇴·영구정지 시 매장 `suspended`+비노출+판매권한 정지, 진행 주문 처리 규칙 | 웹 |
| PRD-03 | 상품 검수 | 관리자 반려 상품을 "수정→active" 2단계로 **재검수 없이 판매 재개** | 상태 PATCH 경로, 주문 RPC·메뉴 스냅샷이 `admin_review_status` 미검사 | PROVEN(코드) | 반려 상품 active 전환 금지(재검수 요청 상태로), 주문 RPC 에 검수 상태 검사 | 웹+DB |
| PRD-04 | 상품 가격 | 관리자 「가격 수정」이 할인가를 재계산·검증하지 않음, DB 에 `discount_price<=price` CHECK 없음 | `lib/stores/admin-store-product-ops.ts:133-145` | PROVEN(코드) / 현재 불일치 0 | 가격 수정 시 할인가 동시 검증, CHECK 제약 추가 | 웹+DB |
| LOC-003 | 배달 가능 판정 | 전역 거리정책 OFF·매장 override disabled·**설정 조회 실패** 시 좌표 검사 전 eligible(fail-open). 좌표 없는 배달 매장 9곳 | `evaluate-delivery-serviceability.ts:57-59,86-95`, `delivery-ops-settings.ts:196-205` | PROVEN | 설정 조회 실패는 fail-closed, 좌표 없는 매장은 정책과 무관하게 배달 불가 | 웹 |
| FIN-02 | 미납 상계 | 상계 멱등키 `sale_fee_settle:<의무>:<금액>` → 같은 금액 2회 부분 상계 시 UNIQUE 위반으로 **충전 승인·Coin 전환 전체 롤백** | 운영 `settle_store_sale_fee_obligations` | PROVEN(정적) | 키에 상계 직전 누적 납부액 포함 | DB |
| FIN-03 (=GFT-03) | 플랫폼 보유분 지급 | 상품권 금액을 Coin 적립(총액), gift rail(순액 90%), 지급의무 분류(gift_rail 제외) 3곳이 다르게 취급 → 플래그 ON 이면 상품권 수수료 10% 매장 반환, OFF 면 지급 경로 없음(gift 10,700, 쿠폰 ₱40) | `recognize-order-currency-on-completed.ts:36-42`, gift 현금화 API 410, `store-commission-contract.ts:101-106` | PROVEN(코드·데이터) / env 플래그 값 NOT_PROVEN | Owner 결정: Coin 단일(순액 기준) 또는 gift rail 단일 → payable 항등식 수정 | 웹+DB |
| FIN-04 (⊃IA-22) | 캐시 충전·Coin 출금 | 캐시 충전이 **입금 증빙 없이** 승인·적립, 클라 멱등키 `Date.now()` 로 재시도마다 새 요청, 승인 RPC 가 관리자 신원 재확인·자기 매장 승인 금지 없음. Coin 출금도 클릭마다 새 키·확인창 없음 | `OwnerBusinessCashView.tsx:185`, `business-cash/route.ts:144-146`, 운영 `approve_business_cash_charge_request` | PROVEN(코드·스키마) | 참조번호·증빙 컬럼, PENDING 1건 제한, 폼 단위 고정 키, 승인 RPC 권한·자기승인 금지·사유 저장, 출금 확인창 | 웹+DB |
| ADS-01 | 광고 기간 | 승인 지연이 유료 노출 기간을 잠식(7일 결제 → 2.78일 노출 사례), 기간 지난 미심사 유료 신청 4건 ₱480 **영구 미환불** | 승인 시 기간 재계산·만료 자동반려 없음 | PROVEN(운영) | 승인 시점 기준 기간 재계산 또는 일할 환불, 만료 미심사 자동 반려+환불 | 웹+DB |
| ADS-02 | 광고 가격 | DRAFT/CHANGES_REQUESTED 에서 기간·인벤토리 PATCH 가능, 제출 시 묶인 패키지 가격(첫 인벤토리만) 과금 → **7일 가격으로 장기·복수 노출** | 가격 스냅샷이 기간·인벤토리와 미결합 | PROVEN(코드) / 운영 악용 없음 | 제출 시 기간·인벤토리로 가격 재산정, 스냅샷에 기간·인벤토리 고정 | 웹+DB |
| ADS-03 | 파트너 광고 | 파트너 반려가 「환불 → 상태변경」 비원자 → 승인과 경합 시 **ACTIVE + 환불 완료** | TS 2단계 | PROVEN(코드) | 반려·환불 단일 RPC(상태 CAS) | DB |
| GFT-01 | 상품권 | **미취소 주문 7건**의 상품권 사용이 역처리(6건 pending·결제액 0/260) → 매장 처리 시 상품권 매출 없이 음식 제공 | `gift_certificate_redemption_reverse` 에 주문 상태 가드 없음, 직접 호출(QA 추정, 주체 NOT_PROVEN) | PROVEN(운영 데이터) | 함수에 주문 FOR UPDATE + 종료 상태 가드. 7건 정리는 Owner 결정 | DB |
| GFT-02 | Coin | 09-01~09-15 Coin 적립 9건에 구매자 직접결제액 포함 → **8,750 Coin 과다 발행** 미정정 | 당시 코드(현 코드는 수정됨), 정정 원장 없음(FIN-08) | PROVEN(운영) | 주문별 차액 정정 원장(`coin_correction:sale:{orderId}`) — FIN-08 정정 함수 필요 | DB |

---

## 3. P2 — 기능 누락 · 목록/상태/알림 불일치 · 방어 심층 (41)

| ID (별칭) | 영역 | 결함 | 배포 |
|---|---|---|---|
| IA-03 (⊃ADS-07, FIN-14) | 권한 | 오너 쓰기 API 대부분(배너·공지·광고·쿠폰·상품권 신청·리뷰 답글·문의·충전·전환·Coin 출금)이 **소유만 확인, 승인·정지 상태 미확인** → 정지 매장 직접 API 쓰기 가능 | 웹 |
| IA-02 | 권한 | 가드가 "계정에 승인 매장 1개라도 있으면 통과", 정지 검사는 `stores[0]` — 선택 매장(`?storeId`) 무시 | 웹 |
| IA-04 (=ADS-20) | 쿠폰 | 쿠폰 PATCH 상태 전이 검사·CAS·오류 확인 없음 → 종료·revoked 쿠폰 부활(운영 5건 대상), 관리자 일시정지를 오너가 재개 | 웹 |
| IA-05 | 쿠폰 | 재발행 확인창·busy·서버 멱등 없음 → 매장 부담 캠페인 중복 생성(운영 0) | 웹 |
| ACC-04 | 입점 | 반려 매장 재신청·재심사 경로 없음(반려=종착, 1인1매장 인덱스가 상태 무관) | 웹+DB |
| ACC-05 | 입점 서류 | 사업자 서류 심사 기능 없음 — `store_business_verifications` 0행·미사용, 오너 UPDATE 정책이 자기 승인 허용 | 웹+DB |
| ACC-06 | 감사 | 오너의 주소·전화·영업시간·최소주문·노출 변경 감사 이력 없음, 승인 후 핵심정보 무심사 변경 | 웹 |
| OPS-01 | 매장 공지 | 운영에 **`store_notices` 테이블 없음**(마이그레이션은 적용 기록) → 공지 작성 500, 조회는 빈 목록 위장. 기존 문서는 PROVEN 으로 기재 | DB |
| OPS-02 (⊃PRD-08) | 캐시 | 오너 쓰기(영업 on/off·영업시간·메뉴·카테고리·공지)가 공용 캐시 세대를 올리지 않음 → 다른 인스턴스 20~60초 구 상태 | 웹 |
| OPS-03 | 영업시간 | 휴무일 자유 텍스트, 요일별·임시휴무가 주문 가능 판정에 미반영 | 웹+DB |
| OPS-06 | 고객 문의 | RLS `store_inquiries_update_owner` 가 오너의 **고객 원문 수정** 허용 | DB |
| PRD-05 | 상품 노출 | 숨김 카테고리 상품이 상세·주문 API 로 노출·주문 가능(운영 숨김 0 → 잠재) | 웹+DB |
| PRD-06 | 재고 | 취소 재고복원이 수동 품절(오너·관리자)을 active 로 되돌림 | DB |
| PRD-07 | 상품 동시성 | 오너 상품 PATCH 에 낙관적 잠금 없음 → 주문 감산·관리자 조치 덮어씀(과판매) | 웹 |
| PRD-09 | 캐시 | 오너 상품 목록 캐시(30s)가 주문 감산·관리자 조치·카테고리 삭제로 무효화 안 됨 | 웹 |
| LOC-004 | 서비스 지역 | 주문 시 배달 가능 판정 스냅샷 미저장(플래그 false, 639건 NULL) + 매장 이동 시 진행 주문 직선거리 덮어쓰기 | 웹+DB |
| LOC-005 | 매장 위치 | `delivery_available=true` + 좌표 NULL 매장 9곳, DB 제약 없음 | DB |
| LOC-006 | 서비스 지역 V2 | 지역 교체가 delete→insert 비원자, LGU 검증·감사·동시성 없음 | 웹+DB |
| LOC-007 | 매장 위치 | 지도 핀 없음(좌표 직접 입력), 주소-좌표 근접 검증·감사·승인 없음 | 웹 |
| LOC-008 (=ORD-08) | 개인정보 | 종료 주문의 구매자 전화·주소·좌표를 오너가 **무기한** 조회(30일 경과 638건) | 웹+DB |
| ORD-04 | 관리자 개입 | 관리자 개입이 본 상태를 CAS 기대값으로 쓰지 않음 → 매장 반려 직후 관리자 취소가 덮어씀(문서 §5-5 와 불일치) | 웹 |
| ORD-06 | 취소 원장 | 오너 직접 취소·결정의 원장 쓰기가 상태 변경과 별도 트랜잭션, 실패는 로그만 → 사유 유실·pending 원장 잔존 | DB+웹 |
| ORD-07 | 정보 노출 | `admin_note`·분쟁 상태 등이 오너 목록 응답 포함, 구매자도 RLS·Realtime 으로 내부 금액 필드 수신 가능(현재 데이터 0) | DB+웹 |
| ORD-09 | 알림 | 오너 직접 취소 사유가 구매자에게 전달 안 됨 | 웹 |
| DLV-01 | 배달 주체 | 라이더 체계는 코드만, 운영 라이더 0 → 실제는 매장 자체배달인데 관리자 메뉴·문서는 「정상」 표기 | 웹 |
| DLV-02 | 배달 상태 | 배달 상태 ↔ 주문 상태 미동기화(배달 delivered·주문 미완료 1건), 취소 시 배달 행 미종료, CHECK 없음 | DB+웹 |
| DLV-03 | 배달 상태 | `delivering` 10건·`ready_for_pickup` 7건 장기 정체 — 자동완료 타이머가 `arrived` 에서만 시작 | 웹+설정 |
| NTF-04 | 구매자 상세 | 상태 변경 직후 구 상태 스냅샷 반환 가능(인스턴스 메모리 무효화) — NOT_PROVEN | 웹 |
| FIN-05 | Coin 역분개 | 환불 시 Coin 역분개가 상태 트랜잭션 밖, 실패는 로그만 | DB+웹 |
| FIN-06 | 레거시 정산 | TS 가 레거시 `store_settlements` 의 수수료 환급액·상태를 계속 수정(SSOT·AGENTS 위반) | 웹 |
| FIN-07 | 관리자 재무 | 일별·매장 재무제표·정책 개요가 레거시 스냅샷 기반 → 신규 완료 10건 누락 | 웹 |
| FIN-08 | 원장 정정 | Cash/Coin 관리자 정정 경로 없음 → ₱225 Cash 불일치·Coin 초과 상시 위반 | DB+웹 |
| FIN-09 | DB 권한 | Coin·출금·상품권 매출 원장·충전요청 테이블에 쓰기·TRUNCATE 권한 잔존(Cash 는 회수됨) | DB |
| FIN-10 | 운영 추적 | 운영 `schema_migrations` 기록 누락(함수는 존재) → 드리프트 검출 불가, SSOT 문서는 "운영 미적용" | DB+문서 |
| ADS-04 | 파트너 광고 | 파트너 신청 DB 유일성 없음 + insert→차감→delete 보상 → 중복·고아 펀딩 | DB |
| ADS-05 | 파트너 광고 | 멤버십 만료 자동 처리 없음 → 만료 후 "이용 중"·재가입 불가(운영 1건) | 웹+설정 |
| ADS-06 | 광고 노출 | 홈 히어로·물리 인벤토리 배너가 매장 자격(정지·비노출) 미검사 | 웹 |
| ADS-08 | 관리자 권한 | 배달 광고 관리자 승인·반려 API 에 권한키 검사 없음 | 웹 |
| ADS-21 | 쿠폰 복원 | 취소·환불 시 쿠폰 복원이 커밋 후 best-effort, 결과 미확인·재처리 없음 | DB+웹 |
| GFT-04 | 상품권 | 1회 전액 소멸 정책인데 결제 화면 잔액 소멸 고지 없음 | 웹 |
| GFT-05 | 상품권 | 취소 시 상품권 복원이 상태 커밋 후 별도 호출, 만료 후 복원은 사용 불가 상태 | DB+웹 |

---

## 4. P3 — UI/UX/CTA · 표시 · 경미한 정합성 (58)

| 도메인 | ID · 요약 |
|---|---|
| 매장 운영 (6) | OPS-04 오너 영업 카드가 `is_open` 원값(실효 스케줄 미반영) · OPS-05 이메일 저장 시 PH 휴대폰 정규화로 소실 · OPS-07 미승인 상태 노출 토글 허용→`first_listed_at` 조기 기록 · OPS-08 주문 RPC 가 픽업/배달 플래그·자동 영업시간 미재검증 · OPS-09 영업시간·갤러리 null 저장이 NOT NULL 충돌 500 · OPS-10 리뷰 답글 알림 한국어 하드코딩 |
| 상품 (7) | PRD-10 재고 0 인데 active 유지 · PRD-11 카테고리 정렬 N개 병렬 PATCH 비원자 · PRD-12 오너/구매자 정렬 기준 불일치 · PRD-13 카테고리 삭제 시 판매중 상품 "기타 메뉴" 이동 무안내 · PRD-14 옵션 그룹 내 동일 옵션명 허용(주문 검증 이름 매칭) · PRD-15 입력 상한·오류 원문 노출 등 서버 검증 비일관 · PRD-16 저장 실패 시 Storage 고아 객체 |
| 위치·지역 (6) | LOC-009 V2 `missing_lgu_identity` 오류 코드 오매핑 · LOC-010 상세·장바구니 vs 체크아웃 경계 차이 · LOC-011 운영 거리정책 JSON 레거시 값(`defaultMaxKm` 60) · LOC-012 라이더 위치 API 가 토글 무시 · LOC-013 기본정보 저장마다 ETA 재계산·discovery 무효화 · LOC-014 회원이 자기 주소 `canonical_lgu_id` 직접 수정 가능 |
| IA·UI·CTA (17) | IA-06 쿠폰 화면 피드백 없음 · IA-07 레거시 리다이렉트 쿼리·storeId 유실, 무효 경로 매핑 · IA-08 storeId 해석 3가지(일부 `stores[0]`) · IA-09 제목 누락·라벨 불일치·오타 · IA-10 하위 화면 활성 하이라이트 누락 · IA-11 뒤로가기 부모 오류 · IA-12 중복 진입점(노출/영업 토글 3곳, Finance 탭 중복) · IA-13 정산 용어가 SSOT 와 충돌("주문별 정산", "지급 현황") · IA-14 알림 설정이 사용자 단위인데 매장 단위처럼 표시 · IA-15 리뷰 답글 실패 UX · IA-16 문의 답변 실패 무음 · IA-17 설정 토글 피드백 없음 · IA-18 고아 컴포넌트 18·고아 라우트 3 · IA-19 hex 186·팔레트 369·비표준 반경 42 · IA-20 PC 고정 사이드바 없음 · IA-21 드로어 항목 승인 조건 비일관 · IA-23 주문 단계 변경 실패 메시지 누락(일부) |
| 주문·배달·알림 (6) | ORD-10 주문 존재 여부 노출(404/403 구분) · ORD-11 멱등 재응답이 계산값 반환 · DLV-04 배달 증빙 경로가 구매자·오너 응답 포함 · NTF-02 시스템 처리를 "매장 처리" 문구로 알림 · NTF-03 수락 알림에 ETA 미포함 · NTF-05 동시 환불 승인 시 부수효과 2회 |
| 금전 (4) | FIN-11 오너 미납 합계 TS 집계(SQL 단일 함수 아님) · FIN-12 수수료 환급 후 다른 미납 미상계 · FIN-13 수수료 기준액에 배달비·상품권 포함이 문서에 없음 · FIN-15 주문 차단 게이트 이원화(`point_commerce_blocked` 잔존) |
| 광고·쿠폰 (9) | ADS-09 주문 광고 기여 fire-and-forget · ADS-10 노출 eventId 클라 지정 · ADS-11 일시중지 상태 종료일·재개 시 end_at 미검사 · ADS-12 미펀딩 레거시 신청 심사 큐 잔류 · ADS-13 팝업 제출 비원자(잠재) · ADS-22 쿠폰 비용 분할 DB 미재계산 · ADS-23 쿠폰 상태 이중 컬럼·종료 미반영 · ADS-24 `max_uses_per_user>1` 과 unique 충돌(잠재) · ADS-25 복원 시 사용 이력 삭제·예산 재가산 |
| 상품권 (3) | GFT-06 오너 revenue API 가 아카이브 지갑 조회 · GFT-07 구매 멱등키 사용자 비스코프 · GFT-08 `issued_count` 불일치 1건 |

---

## 5. 결함이 확인되지 않은 영역 (감사 완료 근거)

| 영역 | 확인 내용 | 근거 위치 |
|---|---|---|
| 1계정 1매장 | DB UNIQUE INDEX `stores_one_owner_one_store_uidx` + 23505 분류, 운영 중복 0 | appendix/ACC-OPS §2 |
| 주문 생성 원자성 | `create_store_order_atomic` 이 매장 상태·가격·옵션·재고·쿠폰·상품권을 한 트랜잭션에서 재검증, 주문 RPC 는 사용자 EXECUTE 불가·`store_orders` INSERT 정책 없음 | appendix/ORD §2, LOC §2 |
| 중복 주문 | `client_order_key` UNIQUE | appendix/ORD §2 |
| 이중 수락·구매자 취소 vs 수락 경합 | CAS 로 한쪽만 성공 | appendix/ORD §2 |
| 서버 가격 재계산 | 클라 가격 불신, 품절·비활성 주문 RPC 거부 | appendix/PRD §2 |
| 주문 품목 스냅샷 | `store_order_items` 에 이름·가격·옵션 복사, 상품 삭제는 RESTRICT, 고아 0 | appendix/PRD §2 |
| 서비스 지역 판정 단일화 | HOME/BROWSE/SEARCH/ORDER NOW/상세/장바구니/체크아웃이 `evaluateDeliveryServiceArea` 단일 사용, 최종 주소 = 회원 기본 주소 | appendix/LOC §2 |
| 원장 불변·중복 | Cash·Coin 원장 UPDATE/DELETE 금지 트리거, 멱등키 중복 0, 음수 Cash 0, 주문당 수수료 의무 중복 0 | appendix/FIN §1-7 |
| 수수료 정책 권한 | super_admin·감사·원자 교체 — 기존 DEF-1/2/3/10 해소 확인 | appendix/FIN §6 |
| 광고 결제 | 제출=차감, 반려=환불 각 단일 트랜잭션, 펀딩↔Cash 원장 1:1, 종료일 이후 노출 차단(서빙 쿼리) | appendix/ADS-GFT §2 |
| 쿠폰 사용 | 체크아웃 시 DB 가 쿠폰 잠금·할인 재계산·1회 사용 강제 | appendix/ADS-GFT §2 |
| 상품권 이중 사용 | 행 잠금으로 차단 | appendix/ADS-GFT §2 |
| 주문 채팅·알림 딥링크 | 구매자·오너 외 403, dedupe, 정확한 주문으로 이동 | appendix/ORD §2 |
| 리뷰 | 주문당 UNIQUE, 17매장 평점 집계 정합 | appendix/ACC-OPS §2 |

## 6. 누락 기능 (설계 제안 — 결함 아님)

도메인별 상세는 각 appendix §4. 통합 우선순위는 문서 F §4.

- 주문: 접수 제한시간·자동 거절(ORD-03 과 연동), 조리시간 연장·지연 안내, 거절 사유 코드, 주문 검색·기간·CSV, 부분 취소, 주문서 출력, 바쁨 모드
- 매장: 직원(서브) 계정·역할, 임시 영업중지(자동 재개), 휴무 캘린더, 사업자 서류 심사, 반려 후 재신청
- 상품: 메뉴 복사, 옵션 그룹 라이브러리, 일괄 품절, 판매 시간대
- 금전: 정산·수수료 CSV/월 명세, 수수료 영수증(BIR), 출금 계좌 등록·변경 승인, 캐시 충전 입금 대사, 플랫폼 보유분 지급 레일
- 광고·상품권: 광고 기간 보장/보상, 성과 리포트, 파트너 자동 갱신, 미사용 상품권 환불, 매장 폐업 시 상품권 처리
- 배달: 배달 지역·배달팁 독립 화면, 지도 핀, 라이더/실시간 추적(정책 결정 후)
- 고객: 리뷰 신고·통계, 단골 관리, 안심번호
