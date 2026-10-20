# 문서 G — 배달·매장 오너·플랫폼 관리자 통합 정상화 실행 설계 (2026-10-21 PHT)

- 기준: 감사 패키지(이 폴더 A~F) · P0 수정 `816b00fa` · 1-A/1-B 수정(이 문서와 같은 커밋).
- 상세 설계(결함마다 8개 항목: 원인·영향·수정 파일·연동·검증·보존·운영 데이터·Owner 결정): **[G-1 1·2단계](G-1-stage1-2-design.md)** · **[G-2 3·4·5단계](G-2-stage3-5-design.md)**.
- 고정 정책(재질문 안 함): D-0 직접 DB 쓰기 차단 · D-1 수수료 ON·소급 없음(`2026-10-20 20:30 UTC`) · D-5 과거 운영 데이터는 정리·차감·환불·정정 안 함(코드 결함만 수정) · URL 보존 · 12그룹 IA 기준 · DEF-71 정지 매장은 주문·주문 채팅만.
- **구분**: 「승인 범위 수정 완료」(P0 5건 + 1-A/1-B 8건)와 「전체 시스템 정상화 완료」는 다르다. 1단계 잔여는 §2-2 로 반영(2026-10-21 Owner 승인). 2~5단계는 **설계·승인 대기**이며 구현·DB 적용·배포하지 않았다.

## 1. 재분류 결과 (중복 없이)

| 구분 | 건수 | 위치 |
|---|---|---|
| 감사 결함 전체(중복 통합 후) | 120 | 문서 D |
| 완료 — P0 | 5 | `816b00fa` |
| 완료 — 1-A/1-B (이번) | 8 (ORD-02⊃NTF-01, ORD-03, ORD-05, DLV-03, IA-01, IA-02, IA-03⊃ADS-07·FIN-14, ACC-03) | §2 |
| **잔여 감사 결함** | **107** | G-1 49 · G-2 59 (아래 주) |
| 신규 발견 | 1 (N-5: 운영 `internal.is_admin_user()` anon EXECUTE 없음 — anon 직접 SELECT 실패, 기존부터 존재) | G-1 |
| 잔여 합계 | **108** | |

주: G-1 의 N-1~N-4 는 신규가 아니라 기존 결함(OPS-06 문의 원문 RLS · LOC-014 주소 LGU · ACC-05 서류 정책 · FIN-09 Coin 원장 권한)을 「직접 DB 수정 권한」 묶음으로 다시 묶은 것이다(지시서: 직접 DB 수정 권한·정지 매장 쓰기 문제를 대장에 포함). 같은 원인 병합으로 블록 수는 G-1 47 · G-2 작업 묶음 13(근본 원인 RC-1~RC-12).

## 2. 이번 반영 — 1단계 일부 (1-A 주문 운영 · 1-B 오너 접근 게이트)

### 원인 → 수정 → 검증

| 결함 | 원인 | 수정 | 자동 검증 | 운영 DB 검증 |
|---|---|---|---|---|
| ORD-02 자동 구매확정·접수 독촉 미가동 | `vercel.json` 에 크론 없음, 운영 pg_cron 없음 | `vercel.json` 크론 4개 등록(자동확정 5분·독촉 1분·미접수 취소 1분·SLA 5분). 모든 크론은 **기준 시각 이후 생성 주문만** 처리(`lib/stores/store-order-lifecycle-automation.ts`, D-5 — 과거 pending 54건 등 손대지 않음) | vitest | 크론 실행 결과 NOT_PROVEN(배포 후) |
| ORD-03 미접수 자동 취소 없음 | SYSTEM 전이에 접수 제한 없음 | SYSTEM `accept_timeout`(pending→cancelled만), 크론 `/api/cron/store-orders-accept-timeout` — 접수 제한 **10분**, `expectedCurrentStatus: pending` CAS(오너 접수와 경합 시 한쪽만), 재고·쿠폰·상품권 복원은 기존 `applyStoreOrderStatusTransition` 경로. 구매자 알림 「{n}분 안에 접수되지 않아 자동 취소」(매장 취소 문구 아님) + 오너 알림 신설, 관리자 감사 라벨 `cron_accept_timeout_cancel` | vitest(전이 그래프·범위) | — |
| DLV-03 배달 정체 | SLA 스캔이 pg_cron 전제라 미실행 | 크론 `/api/cron/store-orders-sla-scan` → `scan_store_order_sla_warnings`(배달 60분 초과 critical·관리자 주의). 함수에 기준 시각 조건 추가(`20270602110000`) | — | 롤백 실행: 과거 주문 플래그 추가 0 |
| ORD-05 오너 목록 60건 한도 | 목록 RPC 가 최근 60건만 반환 | 첫 페이지에 **미종료 주문 전부(상한 300)** 포함(`get_owner_store_orders_list_snapshot`, 운영 적용) + 완료·취소 탭 「이전 주문 더 보기」(커서, 캐시 미경유 `?history_cursor=`) + 조용한 새로고침 때 불러온 이력 유지 | vitest(커서·병합) | 최다 매장(144건·미종료 61) 롤백 실측: 첫 페이지 106 = 최근 60 + 미종료 46, 미종료 61 전부 포함, 중복 0, 다음 페이지 60 |
| IA-01 심사 중 매장 수정 불가 | 가드가 온보딩 화면도 차단 + 모달 링크와 `/mypage` 이동 경쟁 | 심사 중·보완 요청 매장은 신청·프로필·기본정보 화면 허용(정책 파일 `store-business-hub-nav-intercept` 와 같은 규칙) + 안내 띠. 모달 링크는 별도 `onLinkClick` | 기존 계약 테스트 통과 | 화면 NOT_PROVEN |
| IA-02 가드가 계정 단위 판정 | 「승인 매장 하나라도」·`stores[0]` | 선택 매장(`?storeId`→세션 선호→리졸버) 상태로 판정, 경로 변경 시 재판정 | CUT 2 `stores[0]` 금지 계약 통과 | — |
| IA-03 정지·미승인 매장 API 쓰기 | 쓰기 API 가 소유만 확인 | 공통 게이트 `ownerStoreOperationalWriteBlock`(승인 매장만, 정지=`store_suspended` 403 — DEF-71 화면 규칙과 동일) 적용: 배너·공지·광고(매장 홍보·배너·이미지·메시지)·파트너 신청·이벤트 프로모션·쿠폰 생성/변경·상품권 신청·리뷰 답글·문의 답변·캐시 충전/전환·Coin 출금. 배달 지역 편집은 `ownerStoreProfileWriteBlock`(승인·심사 중 허용, 반려·정지 차단 = 매장 정보 PATCH 와 동일). 주문 처리·주문 채팅·플랫폼 문의는 제외(정지 매장도 가능). 상품·카테고리·매장 정보·이미지 업로드는 기존 승인 검사 유지 | vitest(게이트 표, 쿠폰 정지 403) | — |
| ACC-03 탈퇴 사장 매장 영업 | 탈퇴 처리에 매장 처리 없음 | 탈퇴·영구 삭제 시 회원 제재(DEF-68)와 같은 경로로 판매 중지 + 매장 비노출, 감사 로그에 매장 id. 자동 재개 없음 | 기존 테스트 통과 | 현재 해당 0 |

### 연동 확인 (주문자 → 오너 → 서버·DB → 관리자 → 주문자)

| 흐름 | 결과 (코드·DB 근거) | 실측 |
|---|---|---|
| 주문 생성 → 10분 미접수 | 오너: 독촉 알림(30·60초 버킷) → 10분 경과 시 SYSTEM 취소(CAS) → 재고·쿠폰·상품권 복원 → 구매자 「자동 취소」 알림 + 오너 「미접수 자동 취소」 알림 → 관리자 감사 로그·이벤트. 수수료: 조리 전이라 부과 없음 | NOT_PROVEN |
| 오너 접수와 자동 취소 경합 | 둘 다 `pending` CAS — 한쪽만 성공(다른 쪽 `transition_conflict`) | 코드 근거 |
| 배달 60분 정체 | SLA 스캔 → `needs_admin_attention` → 관리자 주문 큐 | NOT_PROVEN |
| 미종료 주문이 많은 매장 | 오너 목록·탭·배지 숫자 일치(미종료 전부 첫 페이지) | 롤백 실측(DB) |
| 관리자 매장 정지 | 오너 화면: 주문·주문 채팅만(기존) / 서버: 운영 쓰기 403 / 주문자: 기존대로 주문 불가(RPC) | 코드 근거 |
| 회원 탈퇴(사장) | 매장 판매 중지·비노출 → 주문자 노출·주문 차단 → 관리자 매장 상세에 판매 중지 사유 | 코드 근거 |

검증: 로컬 `typecheck:build` PASS · vitest 818 파일 6,377건 PASS · 변경 파일 eslint 오류 0 · `verify:store-order-status-writer-authority`·`owner-store-orders-list-contract`·`canonical-owner-routes`·`delivery-notification-scope`·`legacy-owner-render-ban`·`store-order-process-model-contract`·`owner-badge-boundary`·`routes` PASS. (`verify:delivery-customer-owner-boundary` 는 이번 변경과 무관한 기존 파일에서 실패 — 보고만.)

## 2-2. 1단계 잔여 반영 (Owner 승인 2026-10-21) — 주문·배달 동기화·관리자 CAS·취소 원장·상품 검수·가격 보호·직접 DB 쓰기

### 원인 → 수정 → 자동 검증 → 운영 반영

| 묶음 | 결함 | 원인 | 수정 | 자동 검증 | 운영 DB |
|---|---|---|---|---|---|
| 1-E 취소 원장 | ORD-06 · ORD-09 | 상태 UPDATE 후 원장 INSERT/UPDATE 를 별도 호출, 실패는 로그만 | `store_order_owner_cancel_atomic`·`store_order_cancel_request_decide_atomic`(1 TX, 배달 FOR SHARE → 주문 FOR UPDATE, service_role 전용). 오너 취소 사유 원문(≤500)을 이벤트·구매자 알림에 전달 | 격리 PG16 `store-orders`: 정상·원장 실패 롤백·기대상태 불일치·중복 pending·수수료 실패 롤백·동시성 2종(픽업↔취소) PASS | `20270602120000` 적용, md5 = 파일 |
| 1-F 관리자 개입 | ORD-04 · ORD-10 · ORD-11 · NTF-05 | 관리자 조작이 화면 상태를 확인하지 않음 | 모든 관리자 ops 가 `expectedCurrentStatus` CAS → 경합 409 `status_changed`. 타 매장 주문 404 통일, 멱등 재응답은 저장 금액 | vitest | — (웹) |
| 1-H 배달↔주문 | DLV-01 · DLV-02 · NTF-02~04 | 배달 행과 주문 상태가 따로 움직임, 배달 상태 값 제약 없음 | SYSTEM `delivery_sync`(delivering→arrived), 취소·환불 시 열린 배달 행 종료, 오너 배달 패치 CAS, `store_order_deliveries_status_check` **NOT VALID**(과거 행 미검증·미정정, D-5). 라이더 화면 「미운영」 표시 | vitest · 격리 DB `20_dlv02` | `20270602120100` 적용(`convalidated=false`) |
| 1-G 정보 노출 | ORD-07 ⊃ DLV-04 | 스냅샷 RPC 가 `to_jsonb(o.*)`·`(d.*)` 전체 행 반환 | 오너·구매자 스냅샷 3종 명시 컬럼(관리자 메모·분쟁·플래그·증빙 경로/좌표, 구매자에겐 수수료 기준액·부담액 제외) + 웹 `stripStoreOrderDeliveryForClient` 이중 방어 | vitest · 격리 DB | `20270602140200` 적용, md5 = 파일. 운영 실주문 조회: 오너·구매자 응답에 `admin_note`·`commission_base_amount` 없음, 타 사용자 `forbidden`, 목록 106건 유지 |
| 1-J 상품 검수·가격 | PRD-03~07 · PRD-09 · OPS-02 · **ND-1** | 검수 반려·대기·숨김 구역 상품이 주문 가능, 품절 사유 없음, 할인가 ≥ 판매가 허용, 동시 편집 덮어쓰기 | 주문 RPC Pass1 에서 검수 `rejected/pending`·숨김 구역 → `product_not_available`, 재고 소진 품절만 `sold_out_reason='stock'` → 취소 복원 시에만 자동 재판매. `admin_status_lock`(관리자 숨김·품절·차단 → 오너 변경 403, 관리자 activate 로만 해제). 할인가 CHECK(과거 위반 0 → VALIDATE). 편집은 변경 필드만 + `expected_updated_at` → 409. 오너 쓰기 후 공개 캐시 세대 bump | vitest · 격리 DB `store-products-1j`(단언·동시성·NOT VALID) | `20270602130000` 적용, 함수 3개 md5 = 파일, CHECK 3개 `convalidated=true`. 롤백 프로브: 없는 상품 `invalid_product`, 가격 불일치 `price_changed`, 복원 멱등 `idempotent` |
| 1-I 매장 계약 | ACC-04 · ACC-06 · OPS-02 · **ND-2** | 반려 매장 재신청 경로 없음, 오너 변경 감사 없음, 승인 후 주소·좌표 변경 무검증 | 관리자 「재심사 열기」(rejected→revision_requested, CAS·감사·알림). 오너 PATCH 감사(바뀐 키만). 승인 매장의 주소·좌표 변경은 즉시 반영 + `core_info_review_status='pending_reverification'` + 관리자 알림, 관리자 「재검증 완료」(CAS). 단순 운영 정보는 재심사 없음 | vitest · 격리 DB `store-contract` | `20270602140100` 적용(컬럼 5·CHECK 2) |
| 1-D 직접 DB 쓰기 | N-1(OPS-06) · N-2(LOC-014) · N-3(ACC-05 권한) · N-4A(FIN-09) · N-5 | 클라이언트 역할 INSERT/UPDATE/DELETE 권한·정책 잔존 | 10개 테이블 anon/authenticated 쓰기·TRUNCATE 회수 + `block_client_role_direct_writes` 트리거. TS 작성자 0인 Coin·출금·상품권 매출 원장 4개는 service_role 쓰기도 회수(작성 함수 전부 DEFINER·postgres — 운영 조회로 INVOKER 작성자 0 확인). N-5 관리자 판정 함수 원문 고정 | 격리 DB `store-contract`(거부·허용·재GRANT 방어) | `20270602140000` 적용. 권한 조회: 10개 테이블 클라이언트 쓰기 0, 트리거 10개. 쓰기 정책 7개 DROP 완료(Owner 수동 실행) |

연동(주문자 → 오너 → DB → 관리자 → 주문자): 오너 취소·취소요청 결정은 상태·원장·수수료가 한 트랜잭션(어느 하나 실패 시 전부 롤백) → 구매자 알림에 오너 사유 원문 → 관리자 취소 원장과 같은 행. 관리자 조작은 화면 상태 CAS 로 오너 동시 조작과 한쪽만 성공. 관리자 상품 숨김·품절·차단은 오너가 되돌릴 수 없고, 주문 RPC·메뉴 스냅샷·공개 상세가 같은 검수 조건으로 거부. 실측(화면): NOT_PROVEN.

배포 순서: DB(위 6개) 먼저 운영 적용 완료 → 웹 main 반영. 새 웹 코드가 읽는 새 컬럼은 `130000`·`140100` 뿐이며 둘 다 적용됨. 구 웹은 새 DB 에서 그대로 동작(추가 컬럼·응답 축소만).

## 3. 단계별 통합 실행 설계 (승인 대기)

| 단계 | 내용 | 선행 조건 | 영향 범위 | 배포 |
|---|---|---|---|---|
| **1단계 잔여** — 주문·매장 권한·배달 상태 (**반영 완료 §2-2**) | 관리자 개입 CAS(ORD-04) · 취소 원장 원자화(ORD-06) · 내부 필드 노출(ORD-07⊃DLV-04) · 취소 사유 전달(ORD-09) · 배달↔주문 상태 동기화(DLV-01/02) · 알림 문구·ETA·스냅샷 최신성(NTF-02~05) · 반려 재신청·서류 심사·변경 이력(ACC-04~06) · 상품 검수·가격·동시성·캐시(PRD-03~09, OPS-02) · 직접 DB 수정 권한 묶음(N-1~N-4) · N-5 | 1-A/1-B main 반영(이번) | 주문 상태 writer·주문 RPC·취소 원장·배달 행·알림·상품 API·RLS | 웹+DB |
| **2단계** — 결제·코인·캐시·상품권·정산 | 상계 키(FIN-02) · 플랫폼 보유분 지급 레일 단일화(FIN-03, D-2) · 충전 증빙·멱등·자기 승인 금지(FIN-04) · 환불 역분개·쿠폰·상품권 복원 원자화(FIN-05⊃ADS-21·GFT-05) · 레거시 정산 writer 제거·재무제표 원천 교체(FIN-06/07) · 정정 함수(FIN-08, 과거 데이터 정정은 안 함) · 마이그레이션 기록(FIN-10) · 상품권 역처리 가드(GFT-01) 등 | **FIN-10 운영 원문 대조**(드리프트) | 금전 원장·DB 함수·관리자 재무 화면 | DB+웹 |
| **3단계** — 광고·매장 운영·위치·고객 응대 | 3-A 위치·배달 판정(LOC-003 fail-closed 등) → 주문 RPC 1회 재정의(OPS-08+LOC-004) → 3-B 매장 운영(영업시간·휴무 실효 상태 단일화, 공지 테이블) → 3-C 쿠폰 상태표(IA-04/05) → 3-D 광고 기간·가격·파트너 원자화(ADS-01~13) → 3-E 상품 P3 | 1-B 게이트(완료) · 2-E | 판정 함수·주문 RPC·광고 SQL·쿠폰 API | 웹+DB |
| **4단계** — 사이드 메뉴·UI/UX/CTA·SSOT | 12그룹 레지스트리(제목·활성·뒤로가기 파생, URL 변경 0) · 공통 상태 화면 4종·확인창·토스트·멱등 · 오너 화면 44행 일관성 명세(G-2) | 1~3단계(API 동작 확정) | 오너 화면 전반 | 웹 |
| **5단계** — 전체 회귀 | 시나리오 10군 31케이스 × 5홉 일치, 검증 층 L1~L5, 운영 읽기 전용 불변식 SQL 12개, 묶음별 회귀 게이트 | 각 단계 반영 | 검증 전용 | — |

## 4. Owner 승인 요청

| # | 요청 | 비고 |
|---|---|---|
| 1 | ~~1단계 잔여 구현 승인~~ — **승인·반영 완료**(§2-2) | 정책 DROP 7줄 Owner 실행 완료 |
| 2 | **2단계 구현 승인** + **D-2**(권장 A: 레일 분리 — 상품권은 상품권 매출 원장 지급, 플랫폼 쿠폰 부담분은 Coin) · **D-3**(권장: 현행 계약 유지·문서화, `delivery_fee_mode='percent'` 저장 거부) · **D-4**(충전 입금 확인 방식 세부) — 계산 사례 [문서 H](H-stage2-money-policy.md) | 승인 전 구현 안 함 |
| 3 | **3단계 구현 승인** + 기존 미결 D-9·D-10·D-17·D-18·D-19·D-23 — 「권장안대로」 한 줄 승인 가능(G-2 각 항목) | |
| 4 | **4단계 구현 승인** + D-11(PC 고정 사이드바)·D-12(고아 삭제)·D-13(용어)·D-14(토글 확인창) | 권장안 G-2 |
| 5 | ~~ND-1·ND-2~~ — **Owner 결정·반영 완료**: ND-1 오너는 관리자 숨김·품절·차단을 되돌릴 수 없음(`admin_status_lock`) · ND-2 핵심 정보(주소·좌표) 변경은 재검증, 단순 운영 정보는 재심사 없음 | §2-2 |
| 6 | **신규 결정 ND-3 — 쓰기 회귀 테스트 환경 지정**: 5단계의 DB 쓰기 회귀(L2·L3)를 어느 격리 DB 에서 할지. 테스트 DB 는 지시 없이 사용 금지라 지시가 필요. 운영 DB 는 읽기 전용 + 롤백 트랜잭션 확인만(P0·1-A 에서 사용한 방식) | 미지정 시 회귀 증거는 L1(vitest)·운영 롤백 확인·화면 실측(Owner)뿐 |

## 5. 남은 위험

- 화면 실측(오너·관리자 로그인) 전부 NOT_PROVEN — 1-A/1-B 의 「이전 주문 더 보기」·가드 안내 띠·자동 취소 알림 포함.
- 크론은 배포 후에 동작한다. Vercel 요금제의 1분 크론 허용은 기존 1분 크론(`notification-push-handoff`) 존재로 판단 — 실제 실행 기록은 NOT_PROVEN.
- 접수 제한 10분은 권고안 값이다(문서 F D-7). 변경은 상수 1곳(`STORE_ORDER_ACCEPT_TIMEOUT_MINUTES`).
- 주문 RPC(`create_store_order_atomic`)는 2·3단계 여러 결함이 같은 함수를 바꾼다 → 착수 때마다 운영 원문 대조(G-1 R-DB-1).
- ~~(1단계 잔여) `20270602140000` 의 정책 DROP 7개~~ — **2026-10-21 Owner 가 SQL 편집기에서 실행 완료.** 세 테이블에 SELECT 정책 3개만 남음(쓰기 정책 0, 운영 조회 확인).
- (1단계 잔여) `store_order_deliveries_status_check` 는 NOT VALID(과거 행 미검증). VALIDATE 는 과거 행 위반 0 확인 + Owner 승인 후.
- (기존) 운영 `store_order_deliveries.failure_reason` 컬럼 없음(저장소 `20260517120000` 미적용 드리프트) → 관리자 `delivery_failed` 503. 이번 범위 밖, 보고만.
