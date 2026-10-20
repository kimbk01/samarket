# 문서 F — 단계별 수정 계획 및 Owner 승인표

- 상태: 0-A·0-B·0-C(P0-1~P0-5) **완료**(2026-10-21, Owner 승인 D-0·D-1·P0-3·P0-4). D-5 = 운영 데이터 정리 안 함(과거 자료는 개발·테스트). 그 외 단계는 **승인 대기**.
- 원칙(AGENTS.md 개발 프로세스): 한 작업 = main 1회 반영, 다른 도메인 혼합 금지, 검증은 최종 HEAD 1회, 운영 DB 변경은 항목별 Owner 승인, 결함 수정만(개선 과제 무한 추가 금지).
- 배포 구분: 전 단계 **웹 + DB** 다. 네이티브(`android/**`·`ios/**`·`capacitor.config.ts`) 변경은 없다 → 앱 재빌드 불필요, main 반영 후 앱 재시작으로 확인.

## 1. 단계 (수정 순서)

| 단계 | 묶음 (도메인 1개 = 커밋·반영 1회) | 결함 | 선행 조건 | 영향 파일·DB | 회귀 위험 | 검증 | 배포 |
|---|---|---|---|---|---|---|---|
| **0-A** | 오너 API 소유 검사 · Storage 삭제 범위 | P0-3, P0-4 (+배너·공지 동일 패턴) | 없음 | `app/api/me/stores/[storeId]/delivery-service-areas/route.ts`, `products/[productId]/route.ts`, `banners/*`, `notices/*`, `lib/stores/owner-product-images.ts`, Storage 삭제 헬퍼 | 정상 오너의 이미지 교체 실패(경로 접두 규칙) | 타인 storeId 403 테스트, 타 버킷 URL 저장 400, 자기 이미지 교체 회귀 vitest | 웹 |
| **0-B** | `stores`·`store_products` 직접 쓰기 차단 | P0-1, P0-2 (+ACC-02) | **D-0 승인** · 클라이언트가 두 테이블에 직접 쓰는 코드 0 확인(grep) | 마이그레이션: `authenticated`/`anon` INSERT·UPDATE REVOKE, 보호 트리거, 운영 정책을 파일로 고정 | 클라 직접 쓰기 잔존 시 기능 중단 → 사전 grep·Realtime SELECT 유지 확인 | 오너 JWT 로 PATCH 거부, 기존 API 회귀, `verify-schema-authority` | DB |
| **0-C** | 수수료 트리거 재활성 | P0-5 (+FIN-10 메타, I7 무결성 검사) | **D-1 승인** | `ALTER TABLE … ENABLE TRIGGER`, 무결성 보고 I7, `schema_migrations` 기록 | 정책 미설정 매장 조리 진입 409(현재 0곳), 캐시 0 매장 미납 누적 | `pg_trigger` = O, 다음 조리 주문 의무 1행 | DB |
| **0-D** | 기타 RLS·권한 정리 | OPS-06, ACC-05(정책), LOC-014, FIN-09, ORD-07(1단계: RPC 컬럼) | D-0 | `store_inquiries`, `store_business_verifications`, `user_addresses`, Coin·출금·gift 원장 grants, 오너 목록 RPC | Realtime·구매자 조회 영향 | 권한 재조회, 오너·구매자 응답 JSON 키 확인 | DB |
| **1-A** | 주문 운영: 크론·타임아웃·목록 | ORD-02, ORD-03, ORD-05, DLV-03 | **D-7** (제한시간·주기) | `vercel.json`, `order-status-transitions.ts`, 새 크론 라우트, `orders/route.ts`, `fetch-store-orders-list-deduped.ts`, `OwnerStoreOrdersView` | 첫 실행 시 만기 주문 일괄 처리 → 기존 정체 건은 제외 조건 | 전이 그래프 단위테스트, 61번째 이후 취소요청 노출, `verify:parity-gates`(성능 민감) | 웹+설정 |
| **1-B** | 오너 접근 게이트 단일화 | IA-01, IA-02, IA-03(⊃ADS-07, FIN-14), ACC-03 | **D-16** (정지 매장 허용 쓰기) | 신규 `resolveOwnerStoreAccess`, `StoreBusinessGuard`, `getStoreIfOwner` 호출부 일괄, 탈퇴 라우트 | 정지 매장 진행 주문 처리 막힘 → 허용 목록으로 보존 | 상태별(심사중·보완·정지·탈퇴) 접근 매트릭스 테스트 | 웹 |
| **1-C** | 배달 가능 판정 fail-closed | LOC-003, LOC-005, LOC-004 | **D-5**(좌표 없는 9곳 처리) | `evaluate-delivery-serviceability.ts`, `delivery-ops-settings.ts`, 주문 판정 스냅샷 플래그, CHECK 제약 | 9곳 즉시 배달 불가 | 경계·설정 실패 단위테스트 | 웹+DB |
| **2-A** | 캐시·Coin 원장 | FIN-02, FIN-04(⊃IA-22), FIN-08, FIN-05, FIN-11, FIN-12 | **D-4**, **D-5** | `settle_store_sale_fee_obligations`, 충전 요청 스키마·RPC, 정정 함수, `OwnerBusinessCashView`, Coin 출금 패널 | 충전 승인 흐름 변경(CD-2 알림 HARD LOCK 유지) | 롤백 트랜잭션 시나리오, 같은 폼 2회 전송 1건 | DB+웹 |
| **2-B** | 플랫폼 보유분 지급 레일 | FIN-03(=GFT-03), GFT-02, FIN-13(문서) | **D-2**, **D-3**, **D-5** | `recognize-order-currency-on-completed.ts`, `store_platform_payable_page`, gift revenue 함수, 정정 원장 | Coin 잔액 변동(오너 고지 필요) | 상품권 1,000 주문 → 매장 수령 한 레일 900 | DB+웹 |
| **2-C** | 상품권 정합성 | GFT-01, GFT-05, GFT-04, GFT-06, GFT-07 | **D-5**(7건), **D-20** | `gift_certificate_redemption_reverse` 가드, 취소 복원 원자화, 결제 고지 | 취소 흐름 | 위 SQL 0건, 취소 원자성 DB 테스트 | DB+웹 |
| **2-D** | 광고 | ADS-01, ADS-02, ADS-03, ADS-04, ADS-05, ADS-06, ADS-08 | **D-19**, **D-5**(₱480) | 광고 전이 RPC, 가격 스냅샷, 파트너 RPC, 배너 자격, 관리자 권한키 | 광고 노출 기간 변경 | 승인 지연 시나리오, 다중 인벤토리 가격 | DB+웹 |
| **2-E** | 상품 검수·가격·동시성 | PRD-03, PRD-04, PRD-05, PRD-06, PRD-07, PRD-09, OPS-02(⊃PRD-08) | 없음(PRD-03 은 D-0) | 상품 PATCH, 주문 RPC 검수 검사, 할인가 CHECK, 재고 복원 함수, 공용 캐시 세대 | 메뉴 노출 변화 | 검수 반려 판매 불가, If-Match 409 | 웹+DB |
| **3-A** | 주문 취소·개입 원자성 | ORD-04, ORD-06, ORD-09, DLV-02, NTF-02~05, ADS-21, ORD-10, ORD-11, DLV-04 | **D-22**, D-6 | 개입 ops, 취소 DB 함수 2종, 배달 동기화, 알림 | 취소 흐름 전반 | 경합·롤백 테스트 | DB+웹 |
| **3-B** | 쿠폰 운영 | IA-04(=ADS-20), IA-05, IA-06, ADS-22~25 | **D-18** | `store-coupons/campaigns/route.ts`, 쿠폰 화면 | 운영 쿠폰 5건 상태 | 전이표 테스트 | 웹 |
| **3-C** | 매장 계약·운영 | ACC-04, ACC-05(기능), ACC-06, OPS-01, OPS-03, OPS-04, OPS-05, OPS-07~10, LOC-006, LOC-007 | **D-17**, OPS-01 은 운영 테이블 생성 승인 | 매장 PATCH, 감사 로그, `store_notices` 마이그레이션 적용, 영업시간 판정 | 영업 판정 변화 | 휴무일 주문 차단, 공지 CRUD | 웹+DB |
| **3-D** | 레거시 정산 정리 | FIN-06, FIN-07, FIN-15 | 없음 | 레거시 writer 제거, 재무제표 원천 교체, 레거시 API 410 | 관리자 재무 숫자 변동(정상화) | 재무제표 수수료 합 = 원장 합 | 웹 |
| **4** | IA·UI·CTA 통합 | IA-07~21, IA-23, PRD-10~16, LOC-009~013, DLV-01(표시) | **D-11~D-14**, 문서 E 승인 | `owner-nav-registry.ts` 및 파생 파일, 오너 화면 전반, 토큰 | 시각 회귀 | 화면별 체크리스트(실측은 Owner·작업자) | 웹 |
| **5** | 누락 기능 | 문서 D §6 | 해당 결정 | 기능별 별도 설계 | — | — | 결정 후 |

PASS 기준: 각 단계는 로컬 `typecheck:build` + 관련 vitest + 변경 파일 eslint (+ 도메인 `verify:*`) 1회. 운영 DB 적용 항목은 적용 후 카탈로그 재조회로 확인. 화면 실측 PASS 는 Owner 확인 전까지 NOT_PROVEN 으로 보고한다.

## 2. Owner 승인표 — 정책 결정

| ID | 결정 사항 | 선택지(권장 먼저) | 관련 결함 |
|---|---|---|---|
| **D-0** | 오너의 `stores`·`store_products` 등 직접 DB 쓰기 차단 | **(권장) 전면 REVOKE + 보호 트리거, 쓰기는 서버 API만** | P0-1, P0-2, 0-D |
| **D-1** | 수수료 트리거 재활성 시점과 비활성 기간 주문 | **(권장) 즉시 재활성, 비활성 기간 주문은 소급하지 않고 목록만 보존** / 소급 부과 | P0-5 |
| D-2 | 플랫폼 보유분(상품권·플랫폼 쿠폰) 지급 레일 | **(권장) Coin 단일 — 금액은 상품권 순액 + 플랫폼 쿠폰** / gift rail 현금화 재개 | FIN-03 |
| D-3 | 수수료 기준액 범위 | 배달비 포함 여부, 상품권 사용분 7% 추가 부과(총 17%) 유지 여부 | FIN-13 |
| D-4 | 캐시 충전 입금 방식 | 플랫폼 계좌/GCash, 참조번호 필수, 1회·월 상한, 승인 등급(business vs super_admin) | FIN-04 |
| D-5 | 운영 데이터 정리 (각 건 별도 승인) | ₱225 Cash 정정 · Coin 과다 8,750(+출처 불명 분) · 상품권 역처리 7주문 · 미심사 만료 광고 ₱480 환불 · 정체 주문(pending 54·delivering 10·accepted 11·cancel_requested 53) · 좌표 없는 배달 매장 9곳 · 레거시 `point_balance` 14곳 | FIN-08, GFT-01/02, ADS-01, ORD-03, LOC-005 |
| D-6 | 배달 주체 정책 | **(권장) 매장 자체배달 단일 확정, 라이더 메뉴 "미운영" 표시** / 플랫폼 라이더 도입 | DLV-01/02 |
| D-7 | 미접수 자동 취소 제한시간·크론 주기 | 예: 접수 5~10분, 자동확정 10분 주기 | ORD-02/03 |
| D-8 | 직원(서브) 계정 | 도입 여부·역할(주문 처리만 등) | 누락 |
| D-9 | 임시 영업중지(자동 재개)·바쁨 모드 | 도입 여부 | 누락 |
| D-10 | 배달 관리 독립 화면·지도 핀 | 도입 여부 | LOC-007 |
| D-11 | PC 좌측 고정 사이드바 | 도입 여부(문서 E §2) | IA-20 |
| D-12 | 고아 컴포넌트 18·고아 라우트 3 삭제 | 삭제 / 보존 | IA-18 |
| D-13 | 오너 정식 용어 | "정산" vs "수수료·캐시 원장", "출금" vs "Coin 환전" | IA-13 |
| D-14 | 노출 OFF·영업 OFF 확인창 | 요구 / 불요 | IA-17 |
| D-15 | 종료 주문 구매자 전화·주소 보존 기간·마스킹 | 예: 종료 후 N일 마스킹 | LOC-008 |
| D-16 | 정지 매장에서 허용할 쓰기 | 진행 주문·주문 채팅만 / +조회 / +Coin 환전 | IA-03 |
| D-17 | 반려 매장 재신청, 사업자 서류 심사 | 도입 여부·필수 서류 | ACC-04/05 |
| D-18 | 쿠폰 상태 규칙 | 종료·revoked 재활성 금지, 관리자 일시정지 쿠폰 오너 재개 금지 | IA-04 |
| D-19 | 광고 | 승인 지연 시 기간 재계산 vs 일할 환불, 만료 미심사 자동 반려·환불, 다중 인벤토리 가격, 파트너 갱신 | ADS-01~05 |
| D-20 | 상품권 | 1회 전액 소멸 고지·낙전 귀속, 만료 후 복원분 처리 | GFT-04/05 |
| D-21 | 캐시 부족 주문 차단 게이트 ON 시점 | 현재 ON 하면 17곳 중 16곳 즉시 차단 | FIN |
| D-22 | 매장 취소 사유를 구매자에게 원문 노출 | 원문 / 사유 코드만 | ORD-09 |
| D-23 | 매장 정지 시 진행 광고·쿠폰·판매 중 상품권 | 자동 일시중지·기간 보상 | ADS-06 |

## 3. 기존 정상 기능 보존 계획

| 보존 대상 | 보존 방법 |
|---|---|
| 1계정 1매장 UNIQUE INDEX | 변경 없음. 재신청(D-17)은 같은 행 재심사로 설계 |
| 주문 생성 원자 RPC·멱등키 | 검사 추가만, 기존 순서·잠금 유지 |
| 서비스 지역 단일 판정 `evaluateDeliveryServiceArea` | 함수 내부 fail-closed 만, 호출부 불변 |
| 수수료 원장·관리자 결정 함수·수수료 정책 권한 | 변경 없음 (트리거 활성만) |
| 광고 제출·반려 단일 트랜잭션, 펀딩↔원장 1:1 | 변경 없음, 파트너·팝업만 같은 패턴으로 |
| 쿠폰 체크아웃 잠금·1회 사용 | 변경 없음 |
| 상품권 이중 사용 잠금 | 변경 없음 |
| 오너 URL 전부 | 리다이렉트 유지·쿼리 보존, URL 삭제 0 |
| CD-2 캐시 충전 알림 HARD LOCK, 메신저·통화·알림 hard-lock | 해당 경로는 내부 보강만, 계약 불변 |
| 주문 목록 성능 계약(r2-d1) | ORD-05 는 `verify:parity-gates` 로 재측정 |

## 4. 운영 확인이 필요한 미증명 항목 (작업자·Owner 실측)

| 항목 | 이유 |
|---|---|
| 오너·관리자 화면 전부의 실제 렌더·CTA 동작 | 로그인 실측 불가 |
| `DIBAY_CURRENCY_SALE_RECOGNITION_LIVE` 현재 값 | Vercel env 미조회 |
| 수수료 트리거를 끈 주체·시점 | DB 감사 로그 필요 |
| P0-1·P0-2 실제 악용 흔적 | `stores`·`store_products` 변경 이력 대조 필요 |
| 단기 중복 주문 158쌍(구매자 8명) | QA 데이터 여부 확인 |
| 푸시 실수신·Realtime 지연 | 실기기 |
