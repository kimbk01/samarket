# 문서 G (Part 1) — 배달 오너 시스템 통합 수정 설계: 1단계 잔여 · 2단계 금전

- 작성 2026-10-21 (PHT) · 기준 코드 HEAD `28fd18fb` (P0 수정 `816b00fa` 포함) · **설계 문서만** — 저장소 파일·운영 DB·테스트 DB 변경/조회 0건.
- 입력: `docs/audit/delivery-owner-2026-10-20/` README·C·D·F + `appendix/*`. 각 블록의 file:line 은 HEAD 에서 다시 열어 확인했다(✓ 표시). 줄 번호가 감사 시점과 달라진 곳은 현재 값으로 고쳤다.
- 고정 정책(재질문 금지): **D-0** 클라이언트 직접 DB 쓰기 차단 · **D-1** 수수료 부과 ON, 소급 없음(기준 `2026-10-20 20:30 UTC`) · **D-5** 운영 과거 데이터는 개발·테스트 자료 → 정리·차감·환불·정정 **안 함**, 코드 결함(재발 방지)만 수정 · 고객은 매장에 직접 결제, 주문별 지급 없음.
- 배포 구분: 이 문서의 모든 항목은 **웹 / DB / 설정** 중 하나 이상이다. **네이티브 영향 항목 0건** (`android/**`·`ios/**`·`capacitor.config.ts`·브리지 변경 없음 → 앱 재빌드 불필요, main 반영 후 앱 재시작).

---

## 0. 요약

### 0-1. 항목 수

| 단계 | 대상 ID 수 | 설계 블록 수 (중복 병합 후) | 비고 |
|---|---|---|---|
| 0단계 완료 | 5 (P0-1~P0-5) | — | `816b00fa` 완료 표기만 |
| 1단계 · 병행 구현 중 (승인 1-A/1-B) | 9 (ORD-02, NTF-01, ORD-03, DLV-03, ORD-05, IA-01, IA-02, IA-03⊃ADS-07·FIN-14, ACC-03) | — | 1줄 요약만 |
| **1단계 · 이 문서 설계** | **28** (기존 23 + 신규 N-1~N-5) | **27** | DLV-04 를 ORD-07 에 병합(같은 원인). OPS-02⊃PRD-08 은 기존 병합 유지 |
| **2단계 · 이 문서 설계** | **22** | **20** | ADS-21·GFT-05(원자화 부분)를 FIN-05 에 병합(같은 원인). FIN-03=GFT-03, FIN-04⊃IA-22 기존 병합 유지 |
| 합계 설계 | **50 ID** | **47 블록** | |

심각도(현재 잔여 기준, ID 단위): 1단계 28 — P1 2 (PRD-03, PRD-04) · P2 18 · P3 8. 2단계 22 — P1 3 (FIN-02, FIN-03, FIN-04) · P2 8 · P3 11 (GFT-01 은 P1→P2, GFT-02·FIN-08 은 →P3 로 하향). D-5 로 데이터 정정이 빠진 GFT-01·GFT-02·FIN-08 은 "잔여 코드 결함" 기준으로 다시 매겼다(블록에 원 등급 병기).

### 0-2. 이번 설계에서 새로 나온 Owner 결정 (문서 F 의 D-0~D-23 에 없는 것)

| ID | 결정 사항 | 관련 | 차단 여부 | 결정 전 기본 동작(설계 확정) |
|---|---|---|---|---|
| **ND-1** | 관리자가 상품에 건 `hidden`·`sold_out`·`archived` 조치를 오너가 되돌릴 수 있는가 (현재 `blocked` 만 잠금) | PRD-07 연관 (appendix/PRD §7-4) | **비차단** | 현행 유지(오너 해제 가능). PRD-07 의 CAS 는 결정과 무관하게 구현 |
| **ND-2** | 승인 후 상호·주소·업종 변경 시 재심사(관리자 승인) 여부 | ACC-06 연관 (appendix/ACC-OPS §7-4) | **비차단** | 재심사 없음(현행). ACC-06 은 변경 감사 이력만 구현 |

그 외 이 문서 항목이 기다리는 결정은 모두 **문서 F 에 이미 있는 미결 결정**이다(신규 아님): D-2(FIN-03), D-3(FIN-13), D-4(FIN-04), D-6(DLV-01/02), D-17(ACC-04/05), D-20(GFT-04/05), D-21(게이트 ON 시점 — FIN-02 의 운영 의미), D-22(ORD-09). 각 블록 8번 항목에 "기존 D-x" 로 적고, 결정 없이 진행 가능한 기본안을 함께 적었다. **AGENTS 절대 금지 5번에 따라 설계로 정할 수 있는 것(PRD-03 `pending` 의미, PRD-05 숨김 카테고리 의미, N-5 처리, DLV-02 동기화 규칙 등)은 이 문서에서 정했다.**

### 0-3. 이 문서 작성 중 확인한 사항 (교차 정합)

1. **FIN-09(N-4) 회수 대상 중 서비스 롤 TS 작성자가 남은 테이블이 3개** — `business_cash_charge_requests`(`lib/stores/advertising/canonical-business-cash-writer.ts:223-260` service_role `.insert`), `store_settlements`(`lib/stores/adjust-store-settlement-on-refund.ts`·`cancel-store-settlement.ts`), `business_cash_conversion_rate_policies`(`lib/finance/conversion-policy.ts:100-170` 관리자 정책 수정). 감사 원안의 "service_role 까지 REVOKE" 를 그대로 적용하면 **캐시 충전 요청·환불 처리·전환율 정책 수정이 즉시 깨진다** → N-4 를 A(즉시)·B(FIN-04·FIN-06 이후)로 분할했다.
2. **`user_addresses` 쓰기 경로는 전부 service_role** (`app/api/me/addresses/route.ts:30,48`, `[id]/route.ts:25,70` → `tryGetSupabaseForStores`; `components/`·`hooks/` 직접 쓰기 0건) → N-2 는 P0-1 과 같은 REVOKE+트리거 방식으로 닫을 수 있다.
3. **`store_inquiries` 쓰기 경로도 전부 service_role** (`app/api/stores/[slug]/inquiries/route.ts:50,75`, `app/api/me/stores/[storeId]/inquiries/[inquiryId]/route.ts:37,67,84`) → N-1 은 기능 손상 없이 회수 가능.
4. **`internal.is_admin_user()` 는 저장소 마이그레이션 어디에도 없다**(grep 0) — `public.is_admin_user()` GRANT 만 존재. N-5 는 운영 드리프트이며 FIN-10 과 같은 계열이다.
5. **병행 구현(1-A) ORD-03 의 `accept_timeout` 과 GFT-01 의 미취소·상품권 역처리 7주문(전부 `pending`)이 겹친다.** ORD-03 설계는 "기존 정체 건 제외"이므로 7건은 자동 취소 대상이 아니어야 한다(D-5). 병행 작업 결과에서 제외 조건(생성 시각 ≥ 배포 시각)을 확인할 것 — 이 문서 범위 밖이라 **보고만**.
6. **P0-1 이 추가한 `public.block_client_role_direct_writes()`**(`supabase/migrations/20270602100000_delivery_owner_p0_store_write_lock.sql`)는 테이블 이름과 무관한 범용 트리거 함수다 → N-1·N-2·N-3·N-4 는 이 함수를 재사용한다(새 함수 0).

---

## 1. 공통 원칙 (모든 블록에 적용)

| 규칙 | 내용 |
|---|---|
| R-DB-1 운영 원문 대조 선행 | 운영에 저장소와 다른 객체가 있다(FIN-10, N-5, OPS-06 정책 드리프트). **DB 함수를 `CREATE OR REPLACE` 하기 전 운영 `pg_get_functiondef` 를 읽기 전용으로 받아 저장소 최신 정의와 diff** → 차이가 있으면 운영 원문을 기준으로 수정한다. 2단계 DB 블록은 전부 FIN-10 블록 이후. |
| R-DB-2 마이그레이션 파일 | 모든 DB 변경은 `supabase/migrations/2027060x…sql` 파일 + 롤백 주석(P0 파일 형식). 함수 본문에 비 ASCII 주석 금지(P0 파일 주의 사항 — 운영 적용 도구가 멈춤). |
| R-DB-3 운영 적용 | 파일 커밋은 웹 배포와 같음. **운영 DB 적용은 블록별 Owner 승인 후**(개발 프로세스 2번). 적용 후 카탈로그 재조회로 확인. |
| R-DB-4 검증 DB | 테스트 DB(`dibay-test`·`dibay-reset-qa`) 사용 금지. DB 동작 검증은 **운영 DB 롤백 트랜잭션**(`BEGIN; SET LOCAL ROLE …; …; ROLLBACK;`, P0-5 와 같은 방식, Owner DB 승인 범위 내)과 SQL 단위 시나리오로 한다. |
| R-D5 | 과거 데이터 정리·정정 SQL 은 작성하지 않는다. 무결성 검사가 과거 위반을 계속 보고하면, **기준 시각(`2026-10-20 20:30 UTC`) 이전 행은 "D-5 보존" 으로 분류만** 하고 알림 대상에서 뺀다(값은 바꾸지 않음). |
| R-HL | `create_store_order_atomic`·Recovery Chain(`restore_store_order_stock_atomic`) 변경은 `docs/dibay-delivery-product-hard-lock.md` reopen 대상 → `npm run verify:delivery-product-hard-lock`·`verify:store-order-create-atomicity`·`verify:store-order-recovery-integrity` 갱신. 같은 함수를 여러 결함이 고치면 **한 마이그레이션에서 1회** 재정의한다(블록별 표기). |
| R-검증 | 각 커밋: `npm run typecheck:build` + 관련 vitest + 변경 파일 eslint + 도메인 `verify:*` 1회 (AGENTS 개발 프로세스 3번). 성능 민감(캐시·목록 RPC)만 `verify:parity-gates`. 화면 실측은 NOT_PROVEN 으로 보고. |
| R-커밋 | 한 도메인 = 한 커밋 = main 1회 반영. 다른 도메인 혼합 금지. 하위 묶음(1-D…2-F)이 커밋 단위다. |
| R-병행 | 1단계 블록 중 `apply-store-order-status-transition.ts`·`order-status-transitions.ts`·`cancel-request/route.ts`·`orders/route.ts`·`getStoreIfOwner` 호출부를 건드리는 것은 **병행 1-A/1-B 커밋이 main 에 반영된 뒤** 그 위에서 시작한다(겹치는 파일은 관련 검증 1회 재실행). |

---

## 2. 0단계 · 완료

| ID | 내용 | 상태 |
|---|---|---|
| P0-1 / P0-2 | `stores`·`store_products` 클라이언트 직접 쓰기 회수 + 거부 트리거 | **완료** `816b00fa` · 운영 적용 |
| P0-3 | 배달 지역 IDOR | **완료** `816b00fa` |
| P0-4 | Storage 타 테넌트 삭제 | **완료** `816b00fa` |
| P0-5 | 수수료 트리거 재활성(소급 없음) | **완료** `816b00fa` · 운영 `tgenabled='O'` |

## 3. 1단계 · 병행 구현 진행 (승인 1-A / 1-B) — 설계 생략

| ID | 상태 | 1줄 요약 |
|---|---|---|
| ORD-02 (⊃NTF-01) | 1단계 · 구현 진행(승인 1-A) | `vercel.json` 에 자동 구매확정·접수 독촉 크론 등록 |
| ORD-03 | 1단계 · 구현 진행(승인 1-A) | SYSTEM `accept_timeout`(pending→cancelled) + SLA 스캔 크론, 기존 정체 건 제외 |
| DLV-03 | 1단계 · 구현 진행(승인 1-A) | `delivering` 장기 정체 독촉·관리자 큐 편입 |
| ORD-05 | 1단계 · 구현 진행(승인 1-A) | 오너 주문 목록 status/cursor/q/기간 + 더 보기 |
| IA-01 | 1단계 · 구현 진행(승인 1-B) | 보완요청·심사중 매장 신청 보완 경로 복구 |
| IA-02 | 1단계 · 구현 진행(승인 1-B) | 가드가 선택 매장(`?storeId`) 상태 기준으로 판정 |
| IA-03 (⊃ADS-07, FIN-14) | 1단계 · 구현 진행(승인 1-B) | 오너 쓰기 API 승인·정지 공통 게이트 `resolveOwnerStoreAccess` |
| ACC-03 | 1단계 · 구현 진행(승인 1-B) | 탈퇴·영구정지 시 매장 정지·비노출·판매권한 정지 |

이 문서의 1단계 블록은 위 커밋 위에서 시작한다(R-병행).

---

# 4. 1단계 — 주문·매장 권한·배달 상태 정상화 (이 문서 설계분)

### 1단계 내부 순서 (의존)

```
1-D 권한·DB 방어 (독립, 가장 먼저 — DB만)
   N-1 → N-3 → N-2 → N-4(A) → N-5        ※ N-4(B)는 2단계 FIN-04·FIN-06 이후
1-E 주문 상태·취소 원자성  (병행 1-A/1-B 반영 후)
   ORD-04 ─┐
   ORD-06 → ORD-09 → (1-F DLV-02 ④)
   NTF-05 · ORD-10 · ORD-11 (독립)
1-F 배달 상태:  DLV-01(표시) → DLV-02  (DLV-02 는 ORD-02 크론·ORD-06 함수 선행)
1-G 정보 노출:  ORD-07 ⊃ DLV-04   (1-D 와 같은 DB 커밋 가능 — 단 도메인이 주문이므로 별도 커밋)
1-H 알림·상세:  NTF-03 · NTF-04 · NTF-02 (NTF-02 는 ORD-02/03 의 SYSTEM 목적 확정 후)
1-I 매장 계약:  ACC-06 → ACC-04 → ACC-05(기능, D-17)   ※ N-3 이 ACC-05 의 권한 부분
1-J 상품:       PRD-04 → PRD-03 → PRD-05 → PRD-06 → PRD-07 → PRD-09 → OPS-02⊃PRD-08
                (PRD-03·05·06 의 주문 RPC 변경은 한 마이그레이션으로 1회)
```

---

## 4-D. 권한·DB 방어 (커밋 묶음 1-D · 배포 DB)

### N-1 (OPS-06) · `store_inquiries` 오너 RLS 가 고객 문의 원문 수정 허용
`배포: DB · 심각도: P2 · 증명: DB PROVEN(감사 시 pg_policies·grants), 악용 NOT_PROVEN · 선행: 없음`

1. **원인** — 운영 정책 `store_inquiries_update_owner`(UPDATE, qual/with_check 가 "매장 소유자" 만 확인, 컬럼 제한 없음) + `authenticated` 테이블 UPDATE GRANT (appendix/ACC-OPS §OPS-06). 정책은 저장소 마이그레이션에 없음(드리프트 — grep `store_inquiries` + policy/grant 0건). 앱 쓰기는 전부 service_role ✓: 고객 작성 `app/api/stores/[slug]/inquiries/route.ts:50,75`, 오너 답변·종료 `app/api/me/stores/[storeId]/inquiries/[inquiryId]/route.ts:37,67,84`.
2. **영향** — 주문자: 자기 문의 원문(`subject`·`content`·`from_user_id`·`created_at`)이 오너에 의해 바뀔 수 있음 → 분쟁 증거 위변조. 오너: 기능 영향 없음(답변은 API). 관리자: `/admin` 문의 큐가 위변조된 원문을 표시.
3. **수정** — 마이그레이션 `…_delivery_owner_1d_client_write_lock.sql`(N-1·N-2·N-3·N-4A 공용, 테이블별 절): `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.store_inquiries FROM anon, authenticated;` + `CREATE TRIGGER trg_store_inquiries_block_client_role_writes BEFORE INSERT OR UPDATE OR DELETE … EXECUTE FUNCTION public.block_client_role_direct_writes();` + `DROP POLICY IF EXISTS store_inquiries_update_owner` 및 운영에 있는 나머지 INSERT/DELETE 정책을 SELECT 정책만 남기도록 파일에 고정(운영 정책 목록은 적용 직전 읽기 전용 조회로 확정). 웹 코드 변경 0.
4. **연동** — 고객 문의 작성(구매자) → 오너 `/stores/owner/inquiries` 목록·답변 → `PATCH …/inquiries/[inquiryId]` service_role UPDATE(통과) → 관리자 `app/api/admin/store-inquiries/route.ts` 조회 → 구매자 `/api/me/store-inquiries` 에서 원문 그대로 + 답변 확인. 차단되는 것은 브라우저 JWT 의 PostgREST 직접 UPDATE 뿐.
5. **검증** — DB 롤백 트랜잭션: `SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims='{"sub":"<오너uid>"}'; UPDATE store_inquiries SET content='x' …;` → `42501 client_role_direct_write_forbidden`. `has_table_privilege('authenticated','public.store_inquiries','UPDATE')=false`, SELECT=true. 기존 vitest(문의 라우트) 회귀.
6. **보존** — SELECT 권한·SELECT 정책 유지(오너·구매자 조회, `count-open-store-inquiries.ts`). service_role 은 트리거 통과(`current_user` 판정).
7. **운영 데이터·정산** — 현재 0행. 데이터 변경 없음. 금전 무관.
8. **Owner 결정** — 없음 (D-0 범위). 운영 DB 적용 승인만.

### N-3 (ACC-05 정책 부분) · `store_business_verifications` 오너 UPDATE 가 자기 승인 허용
`배포: DB · 심각도: P2(잠재 — 기능 미사용) · 증명: DB PROVEN · 선행: 없음`

1. **원인** — 운영 정책 `store_biz_ver_update_owner_admin` qual=`(is_admin_user() OR owner_user_id = auth.uid())`, WITH CHECK 없음 → 오너가 `business_verification_status='approved'` 로 직접 변경 가능(appendix/ACC-OPS §ACC-05). 테이블 0행, 앱 코드 참조 0건 ✓(grep).
2. **영향** — 지금은 기능이 없어 실영향 0. ACC-05 서류 심사 기능을 붙이는 순간 오너 자기 승인 → 관리자 입점 심사 무력화 → 미검증 사업자 매장이 주문자에게 노출.
3. **수정** — 같은 마이그레이션 절: `REVOKE INSERT, UPDATE, DELETE, TRUNCATE … FROM anon, authenticated` + 거부 트리거 + 오너 UPDATE/INSERT 정책 DROP(SELECT 만 유지). 제출·심사 쓰기는 ACC-05 기능 도입 시 RPC 2개(`owner_submit_store_business_verification` — 서류 경로·번호만 / `admin_decide_store_business_verification` — 상태·사유, `is_platform_admin` 재확인)로만.
4. **연동** — (기능 도입 후) 오너 서류 제출 → `/stores/owner/…` 신청 화면 → 제출 RPC → 관리자 입점 심사 화면에서 서류 확인·결정 → `approve_store` 전 검증 완료 조건 → 주문자 노출. 지금은 연동 경로 없음.
5. **검증** — 권한 재조회 + 롤백 트랜잭션 UPDATE 거부(N-1 과 동일 절차).
6. **보존** — 사용처 0 → 손상 대상 없음. SELECT 정책 유지.
7. **운영 데이터·정산** — 0행. 영향 없음.
8. **Owner 결정** — 없음(권한 부분). 기능 자체는 기존 **D-17**(ACC-05 블록).

### N-2 (LOC-014) · 회원이 자기 `user_addresses.canonical_lgu_id` 직접 수정 가능
`배포: DB · 심각도: P3 (V2 매장 0 → 잠재) · 증명: DB PROVEN(감사), 코드 ✓ · 선행: 없음`

1. **원인** — RLS `user_addresses_update_own` + `authenticated` 컬럼 UPDATE GRANT(appendix/LOC §LOC-014). 판정은 저장값을 우선: `lib/delivery/service-area/resolve-member-canonical-lgu.ts:13-17` ✓(`persisted` 가 있으면 city/좌표 교차검증 없이 반환), 주문 라우트가 이를 사용 `app/api/me/store-orders/route.ts:620-621` ✓. 정상 쓰기는 전부 service_role(§0-3 2번) — 서버 쓰기 경로는 `resolveCanonicalLguIdForAddressWrite` 로 파생값만 저장(`lib/addresses/user-address-service.ts:57`).
2. **영향** — 주문자(악의): V2(LGU 지역) 매장에서 좌표는 지역 밖인데 LGU 만 위조해 주문 가능 → 오너는 배달 불가 지역 주문을 받음 → 관리자 분쟁. 현재 V2 활성 매장 0 → 실영향 0.
3. **수정** — 같은 마이그레이션 절: `user_addresses` 에 `REVOKE INSERT, UPDATE, DELETE, TRUNCATE FROM anon, authenticated` + 거부 트리거. 코드 변경 0(저장값이 서버만 쓸 수 있게 되므로 `resolveMemberCanonicalLguId` 의 "저장값 우선" 이 신뢰 가능해짐).
   - **사전 확인(적용 전 필수)**: ① `grep` 으로 브라우저 클라이언트(`getSupabaseClient`)의 `user_addresses` 쓰기 0 재확인(작성 시점 0건) ② 운영 `pg_proc` 에서 `prosecdef=false` 이면서 본문에 `user_addresses` 쓰기가 있는 함수 0건 확인(INVOKER 함수가 authenticated 로 호출되면 트리거에 걸림) — 있으면 그 함수만 DEFINER 로 전환하거나 이 절 보류.
4. **연동** — 주문자 주소 등록·수정(`/api/me/addresses` service_role, 통과) → 기본 주소 → 매장 상세·장바구니·체크아웃의 `evaluateDeliveryServiceArea`(같은 저장값) → 주문 생성 → 오너 주문 목록의 배송지 → 관리자 사용자 주소(`app/api/admin/users/[id]/addresses`) 조회. 바뀌는 것은 브라우저 직접 쓰기 차단뿐.
5. **검증** — 롤백 트랜잭션: authenticated 로 `UPDATE user_addresses SET canonical_lgu_id=…` → 42501. 기존 vitest `lib/addresses/__tests__/master-lgu-promote-persist-contract.test.ts` 회귀. `/api/me/addresses` POST/PATCH 회귀(라우트 테스트 있으면 실행).
6. **보존** — SELECT 정책 유지. 주소 API·마스터 LGU 승격 로직 불변.
7. **운영 데이터·정산** — 기존 행 무변경(D-5). 금전 무관.
8. **Owner 결정** — 없음.

### N-4 (FIN-09) · Coin·출금·상품권 매출 원장 등에 INSERT/UPDATE/DELETE/TRUNCATE 권한 잔존
`배포: DB · 심각도: P2 · 증명: 운영 SQL PROVEN(감사 role_table_grants) · 선행: A=없음 / B=FIN-04·FIN-06`

1. **원인** — 운영 `role_table_grants`: `store_economic_point_accounts`, `store_economic_point_ledger`, `coin_withdrawal_requests`, `gift_certificate_revenue_ledger`, `business_cash_charge_requests`, `business_cash_conversion_rate_policies`, `store_settlements` 에 anon/authenticated/service_role 쓰기·TRUNCATE (appendix/FIN §FIN-09). RLS 쓰기 정책은 없어 클라이언트 DML 은 지금도 거부되지만, ① 정책이 하나라도 생기면 즉시 열리고 ② TRUNCATE 는 RLS·행 트리거(원장 불변 트리거)를 우회하며 ③ service_role 은 RPC 없이 Coin 잔액·출금 상태를 바꿀 수 있다. Cash 계열은 F-02/F7 에서 회수 완료 — Coin 쪽만 누락.
2. **영향** — 현재 TS 직접 쓰기로 Coin 원장을 바꾸는 코드 0(✓ `lib/currency/coin-withdrawal-writer.ts:31,53,73` 전부 RPC). 방어 심층 결함: 서버 코드 실수 한 줄로 오너 Coin 잔액·출금 PAID 위변조 가능 → 오너 출금·관리자 지급 화면 불일치.
3. **수정** — 두 단계(§0-3 1번):
   - **N-4A (지금)**: 7개 테이블 전부 `REVOKE INSERT, UPDATE, DELETE, TRUNCATE FROM anon, authenticated` + `REVOKE TRUNCATE FROM service_role`. TS 작성자가 없는 4개(`store_economic_point_accounts`, `store_economic_point_ledger`, `coin_withdrawal_requests`, `gift_certificate_revenue_ledger`)는 `REVOKE INSERT, UPDATE, DELETE FROM service_role` 까지. 작성 RPC(`coin_withdrawal_request`·`_mark_paid`·`convert_store_economic_points_to_business_cash`·`credit_coin_from_confirmed_sale`·`reverse_coin_credits_for_order`·`gift_certificate_recognize_revenue_for_completed_order`)는 SECURITY DEFINER(postgres) 확인 후 적용 — 아니면 그 함수 먼저 DEFINER 화.
   - **N-4B (후속)**: `business_cash_charge_requests` 의 service_role 쓰기 회수는 FIN-04 의 `owner_create_business_cash_charge_request` RPC 전환 후, `store_settlements` 는 FIN-06 의 TS 수정 writer 제거 후. `business_cash_conversion_rate_policies` 는 관리자 정책 수정(`lib/finance/conversion-policy.ts:100-170`, service_role)이 쓰므로 **service_role 쓰기 유지**(이 문서 범위에서는 TRUNCATE 만 회수).
4. **연동** — 오너 Coin 출금 신청(`/stores/owner/finance`) → `coin_withdrawal_request` RPC(통과) → 관리자 `/admin/finance/withdrawals` 지급(`coin_withdrawal_mark_paid`, 통과) → 오너 Coin 잔액·출금 내역. 상품권 사용 완료 → `trg_store_orders_gift_revenue_recognition`(DEFINER, 통과) → 관리자 상품권 화면 조회(SELECT 유지).
5. **검증** — 권한 재조회 표(테이블×역할×권한) 전후 비교. 롤백 트랜잭션: service_role 로 `UPDATE store_economic_point_accounts …` → `permission denied`; 같은 트랜잭션에서 `coin_withdrawal_request` RPC 호출 성공. vitest: 출금·전환·충전 관련 기존 테스트 회귀. `npm run verify:currency-ssot-hard-lock`.
6. **보존** — SELECT 권한 전부 유지(관리자 재무·오너 재무 조회). DEFINER RPC 경로 불변. 관리자 전환율 정책 수정 유지.
7. **운영 데이터·정산** — 데이터 변경 0. 잔액·원장 수치 무변.
8. **Owner 결정** — 없음 (D-0 범위, 운영 적용 승인만).

### N-5 · 운영 `internal.is_admin_user()` 에 anon EXECUTE 없음 → anon 의 `stores`·`store_products` 직접 SELECT 오류
`배포: DB · 심각도: P3 · 증명: 운영 확인(2026-10-21, README) / 화면 영향 NOT_PROVEN · 선행: 없음`

1. **원인** — 운영 SELECT 정책이 `internal.is_admin_user()` 를 호출하는데 anon 에 EXECUTE(또는 `internal` 스키마 USAGE)가 없어 anon 직접 SELECT 가 `permission denied for function` 으로 실패. 이 함수·정책은 저장소에 없다(grep `internal.is_admin_user` 0건 — 드리프트, FIN-10 계열). 이번 변경 전부터 존재.
2. **영향** — 앱 공개 목록·상세는 service_role 서버 경유(`tryGetSupabaseForStores`)이고 `components/`·`hooks/` 의 `stores` 직접 조회 0건 ✓ → 주문자 화면 영향 확인 안 됨(NOT_PROVEN). 잠재: anon 키로 서버 컴포넌트가 직접 읽는 경로가 생기면 500.
3. **수정** — 설계로 확정(Owner 질문 불요): **anon 직접 조회는 제품 경로가 아니다(D-0 와 같은 방향)** → 동작은 그대로 두고 "우연한 함수 권한 오류" 를 "명시적 권한" 으로 바꾼다.
   - ① 운영 `internal.is_admin_user()` 정의·소유자·권한과 이를 참조하는 정책 목록을 읽기 전용으로 받아 **마이그레이션 파일로 고정**(드리프트 해소).
   - ② 적용 전 확인: Vercel 런타임 로그·코드에서 anon 키 서버 클라이언트의 `stores`/`store_products` 조회 0건, 공개 Realtime 구독 0건.
   - ③ 확인 0이면: `GRANT USAGE ON SCHEMA internal TO anon; GRANT EXECUTE ON FUNCTION internal.is_admin_user() TO anon;`(함수는 anon 에서 false 반환 → 정책이 정상 평가되어 기존 공개 정책대로 행 필터) — **anon 공개 노출 범위는 기존 정책 그대로**이며 오류만 사라진다. 공개 정책 자체가 승인·노출 조건(`approval_status='approved' AND is_visible`)을 갖는지 함께 확인하고, 없다면 GRANT 대신 `REVOKE SELECT … FROM anon` 으로 명시 거부를 택한다(노출 확대 금지 원칙).
4. **연동** — 주문자(비로그인) 매장 목록·상세 → 서버 API(service_role) → 응답. N-5 는 이 경로에 관여하지 않음. 관리자 화면 무관.
5. **검증** — 롤백 트랜잭션: `SET LOCAL ROLE anon; SELECT count(*) FROM stores;` → ③ 경로면 승인·노출 매장 수와 일치, REVOKE 경로면 `permission denied for table`. `npm run verify:schema-authority` 에 함수 존재·권한 항목 추가.
6. **보존** — authenticated·service_role 권한 불변. 공개 API 불변.
7. **운영 데이터·정산** — 없음.
8. **Owner 결정** — 없음.

---

## 4-E. 주문 상태·취소 원자성 (커밋 묶음 1-E · 배포 웹+DB) — 병행 1-A/1-B 반영 후

### ORD-04 · 관리자 개입이 화면에서 본 상태를 CAS 기대값으로 쓰지 않음
`배포: 웹 · 심각도: P2 · 증명: 코드 PROVEN ✓ / 운영 발생 NOT_PROVEN · 선행: 1-B 반영`

1. **원인** — `lib/stores/admin-store-order-intervention.ts:101-107` ✓ 은 읽은 값과 `expected_status` 만 비교하고, 이후 ops 함수 `adminForceCancelStoreOrder`(`apply-admin-store-order-operations.ts:33-68`)·`adminSetRefundRequestedStoreOrder`(`:80-122`)·`adminApproveStoreOrderCancelRequest`(`:125-168`)·`adminCompleteRefundStoreOrder`(`:382-428`)·`adminRejectRefundStoreOrder`(`:431-475`) 가 주문을 다시 읽어 `applyStoreOrderStatusTransition` 을 `expectedCurrentStatus` 없이 호출 ✓. ADMIN 그래프는 진행 중 거의 모든 상태에서 `cancelled` 허용(`lib/stores/order-status-transitions.ts:146-176` ✓). 문서 `docs/admin-store-orders-read-ssot.md` §5-5 와 불일치.
2. **영향** — 주문자: 매장이 취소요청을 반려해 `accepted` 로 돌아간 주문이 직후 관리자 승인으로 `cancelled`. 오너: 조리 중 주문 취소 + 조리 이후면 수수료 검토 플래그. 관리자: 감사로그 `before_json` 이 실제 직전 상태와 다를 수 있음.
3. **수정** — `runAdminStoreOrderIntervention` 이 `expected` 를 각 ops 함수 인자로 전달 → ops 함수는 `applyStoreOrderStatusTransition({ …, expectedCurrentStatus: expected })`. `adminApproveStoreOrderCancelRequest` 는 `adminForceCancelStoreOrder` 를 거치지 않고 `cancel_requested` 기대값으로 직접 적용. 409 는 `status_changed` 로 매핑(관리자 화면은 이미 409 재조회 처리). DB 변경 없음.
4. **연동** — 주문자 취소요청 → 오너 결정 화면(`OwnerOrderRequestDecision`)·관리자 주문 상세 「개입」 동시 → 둘 다 `applyStoreOrderStatusTransition` CAS(`.eq("order_status", expected)`) → 먼저 커밋한 쪽만 성공, 늦은 관리자 요청은 409 → 관리자 화면 재조회 → 주문자는 한 가지 결과만 알림 수신.
5. **검증** — vitest `lib/admin/store-orders/__tests__/admin-store-order-intervention.test.ts` 에 "확인 후 상태 변경 → 409 status_changed" 5개 액션 케이스 추가. `npm run verify:store-order-status-writer-authority`.
6. **보존** — 레거시 410 경로 불변. 정상(경합 없는) 개입 흐름·사유·감사 로그 불변. 수수료 트리거는 같은 UPDATE 에서 그대로.
7. **운영 데이터·정산** — 데이터 변경 없음. 경합 시 잘못된 취소가 없어져 수수료 검토 오생성이 줄어듦.
8. **Owner 결정** — 없음.

### ORD-06 · 오너 직접 취소·결정의 원장 쓰기가 상태 변경과 별도 트랜잭션
`배포: DB+웹 · 심각도: P2 · 증명: 코드 PROVEN ✓ / 유실 건수 NOT_PROVEN · 선행: 1-B(IA-03 게이트가 같은 라우트 수정)`

1. **원인** — 직접 취소: 상태 전이 후 `store_order_cancel_requests` INSERT, 실패 시 `console.error` 만 — `app/api/me/stores/[storeId]/orders/[orderId]/cancel-request/route.ts:87-117` ✓. 결정 승인·반려: 전이 후 UPDATE, 실패 로그만 — `lib/stores/owner-store-order-decision.ts:98-117, 124-145` ✓. 관리자 승인도 같은 패턴 `apply-admin-store-order-operations.ts:153-165`. 구매자 요청만 DB 함수(`store_order_buyer_cancel_request_atomic`)로 원자화됨.
2. **영향** — 주문자: 다음 취소 요청이 `idx_store_order_cancel_requests_one_pending` 로 `cancel_request_pending` 409(원장 pending 잔존 시). 오너: 취소 사유 유실 → 분쟁 근거 없음. 관리자: 취소 원장과 주문 상태 불일치.
3. **수정** — DB 함수 2개(SECURITY DEFINER, service_role EXECUTE 만):
   - `store_order_owner_cancel_atomic(p_order_id, p_store_id, p_owner_user_id, p_expected_status, p_reason, p_detail)` — 배달 행 `FOR SHARE` → 주문 `FOR UPDATE` → 소유·기대상태·픽업 잠금 확인(`store_order_deliveries_pickup_requires_dispatch` 규칙 재사용) → 원장 INSERT(`approved`, `requested_role='owner'`) + 상태 UPDATE(`cancelled`) 한 트랜잭션. 수수료 트리거는 같은 UPDATE 에서 동작.
   - `store_order_cancel_request_decide_atomic(p_order_id, p_store_id, p_actor_user_id, p_actor_role, p_expected_status, p_decision, p_restore_status, p_reason)` — 오너·관리자 공용. pending 원장 `FOR UPDATE` → 결정 + 상태 UPDATE.
   - TS: 위 두 라우트와 관리자 승인 경로가 RPC 호출 후 기존 부수효과(재고·쿠폰·상품권·이벤트·알림)를 실행. 상태 전이 규칙 SSOT(`order-status-transitions.ts`)와 SQL 허용 상태가 어긋나지 않도록 계약 테스트 추가(구매자 함수와 같은 방식).
4. **연동** — 오너 취소 시트(사유 필수) → `POST …/cancel-request` → RPC(원장+상태 1 TX, 수수료 트리거) → 관리자 주문 상세의 취소 원장·감사 → 주문자 주문 상세 `cancelled` + 알림(ORD-09 에서 사유 포함) + 재고·쿠폰·상품권 복원(2단계 2-C 에서 같은 TX 로 이동 예정).
5. **검증** — DB 롤백 트랜잭션: ① 정상 → 원장 1행+상태 cancelled ② 원장 INSERT 강제 실패(중복 pending 선삽입) → 상태 롤백 확인 ③ 기대상태 불일치 → `status_changed`. vitest: 라우트가 RPC 결과를 그대로 매핑. `verify:store-order-status-writer-authority`(새 writer 등록), `verify:store-order-process-model-contract`.
6. **보존** — 구매자 취소 요청 함수 불변. 픽업 이후 오너 취소 차단 규칙 동일(이제 잠금 아래에서 판정). 알림 dedupe 키 불변. 수수료 부과·검토 플래그는 트리거만(TS 금액 쓰기 없음 — AGENTS 매장 정산 규정).
7. **운영 데이터·정산** — 과거 유실 건 보정 안 함(D-5). 신규 취소부터 원장 정합. 수수료: 조리 이후 취소는 트리거가 검토 플래그 생성(D-1 기준 이후 주문만 의무 존재).
8. **Owner 결정** — 없음 (운영 DB 함수 적용 승인만).

### ORD-09 · 오너 직접 취소 사유가 구매자에게 전달되지 않음
`배포: 웹 · 심각도: P2 · 증명: PROVEN ✓ · 선행: ORD-06 (같은 라우트, 사유를 RPC 결과에서 사용)`

1. **원인** — 직접 취소가 사유를 원장에만 기록하고 `applyStoreOrderStatusTransition` 에 `eventMessage`/`eventMetadata` 로 넘기지 않음(`cancel-request/route.ts:87-100` ✓). 구매자 알림 `notifyBuyerStoreOrderOwnerStatus` 는 고정 문구(`lib/notifications/notify-store-commerce.ts:588-660` ✓). 구매자 API 는 취소 원장을 읽지 않음.
2. **영향** — 주문자: 왜 취소됐는지 모름 → 문의·분쟁. 오너: 입력한 사유가 무의미. 관리자: CS 증가.
3. **수정** — ORD-06 RPC 호출 후 상태 이벤트에 `eventMetadata: { source: "owner_direct_cancel", cancel_reason, cancel_detail }` 기록 → `notifyBuyerStoreOrderOwnerStatus` 에 `cancelReason` 인자 추가(반려 알림 `notifyBuyerStoreRefundRejected` 가 이미 사유를 싣는 방식과 동일, `notify-store-commerce.ts:749-`). `lib/stores/store-order-event-audience.ts:13` `isStoreOrderEventVisibleToBuyer` 에 `owner_direct_cancel` 사유 키 노출 허용. i18n 키 추가(ko/en/fil 사용 언어별 `notifySafeT`).
4. **연동** — 오너 취소 시트 사유 → RPC 원장 → 상태 이벤트 metadata → 구매자 푸시·인앱 알림 본문 + 주문 상세 이벤트 타임라인 → 관리자 주문 이력에 같은 사유 → 주문자 결과: 사유 확인.
5. **검증** — vitest: 오너 취소 후 알림 페이로드에 사유 포함, 구매자 이벤트 필터 통과. `npm run verify:delivery-notification-scope`.
6. **보존** — 알림 dedupe 키(`statusEv.inserted` 기반) 불변, 관리자 취소 문구(DEF-72) 불변, 알림 hard-lock 경로(handoff 크론) 불변.
7. **운영 데이터·정산** — 없음.
8. **Owner 결정** — 기존 **D-22**(원문 노출 vs 코드만). **기본안 확정**: 기존 반려 알림이 이미 매장 사유 원문을 구매자에게 보내므로 같은 원칙(원문, 500자 제한)으로 구현 → D-22 는 "이 기본안 유지 여부" 확인만, 신규 결정 아님.

### NTF-05 · 동시 환불 승인 시 부수효과 2회 실행
`배포: 웹 · 심각도: P3 · 증명: 코드 PROVEN ✓ · 선행: 없음 (2단계 FIN-05 와 같은 파일 — NTF-05 먼저)`

1. **원인** — `gift_certificate_refund_order_atomic` 이 두 번째 호출에서 `idempotent:true` 로 성공을 반환해도 TS 가 구분하지 않음: `lib/stores/apply-store-order-status-transition.ts:306-313` ✓(`refundRow.ok===false` 만 검사) → `:406-439` 재고·결제·정산조정·Coin 회수·쿠폰 복원을 다시 실행.
2. **영향** — 금전 중복은 각 부수효과의 멱등(재고 claims, 쿠폰 상태, Coin 멱등키)으로 막힘 → 주문자·오너 화면 영향 없음. 관리자: 감사·로그 이중 기록, 레거시 정산 스냅샷 이중 수정 가능(FIN-06).
3. **수정** — `refundRow.idempotent === true` 이면 즉시 `{ ok: true, order_status: "refunded", previous: current, idempotent: true }` 반환(부수효과·알림 생략).
4. **연동** — 관리자 환불 승인 2회 클릭/2명 동시 → 첫 요청만 부수효과 → 두 번째는 멱등 성공 응답 → 관리자 화면 동일 → 주문자 알림 1회.
5. **검증** — vitest: RPC mock 이 `idempotent:true` 반환 시 `restoreStockForOrder`·`reverseCoinCreditsForOrder`·`restore_store_coupon_entitlement` 미호출.
6. **보존** — 최초 환불 경로 불변.
7. **운영 데이터·정산** — 없음.
8. **Owner 결정** — 없음.

### ORD-10 · 오너 주문 컨텍스트가 주문 존재 여부 노출 (404/403)
`배포: 웹 · 심각도: P3 · 증명: PROVEN ✓ · 선행: 없음`

1. **원인** — `lib/business/load-owner-store-order-context.ts:20-40` ✓ 없는 주문 `not_found`, 남의 매장 주문 `forbidden` → `app/api/me/owner-store-order-context/route.ts:27-29` 가 404/403 으로 구분.
2. **영향** — UUID 추측이 사실상 불가해 실위험 낮음. 데이터 노출 없음.
3. **수정** — `forbidden` 도 `not_found`/404 로 통일(로그에는 구분 유지).
4. **연동** — 오너 알림 딥링크(`/stores/owner/orders?order_id=`) → 컨텍스트 API → 자기 주문은 200, 그 외 404 → 오너 화면 "주문을 찾을 수 없음". 주문자·관리자 경로 무관.
5. **검증** — vitest: 타 매장 주문 → 404.
6. **보존** — 정상 딥링크 200 불변(`OwnerStoreOrdersView.tsx` 단건 보강).
7. **운영 데이터·정산** — 없음.
8. **Owner 결정** — 없음.

### ORD-11 · 주문 생성 멱등 재응답이 저장값이 아닌 이번 요청 계산값 반환
`배포: 웹 (+DB 선택) · 심각도: P3 · 증명: 코드 PROVEN ✓ · 선행: 없음`

1. **원인** — `app/api/me/store-orders/route.ts:828-844` ✓ — `atomic.idempotent` 일 때 `total_amount`·`discount_amount`·`amount_before_gift` 를 이번 요청 계산값으로 반환(주문 ID·결제액만 DB 값), 그리고 `:788-826` 쿠폰 표시 스냅샷 UPDATE 를 멱등 재응답에서도 다시 실행.
2. **영향** — 주문자: 재시도 사이 가격·쿠폰이 바뀌면 완료 화면 금액 ≠ 실제 주문(오너 화면·영수증과 다름). 오너·관리자: 저장값만 보므로 영향 없음.
3. **수정** — 멱등 분기에서 `store_orders` 저장 금액 컬럼(`total_amount, discount_amount, payment_amount, gift_redemption_amount`)을 1회 SELECT 해 반환하고, 쿠폰 표시 스냅샷 UPDATE 를 건너뜀. (RPC 멱등 응답에 금액을 싣는 안은 HARD LOCK reopen 이 필요하므로 택하지 않음 — 웹만으로 해결.)
4. **연동** — 주문자 체크아웃 재시도(`clientOrderKeyRef`) → `POST /api/me/store-orders` 멱등 → 저장 금액 응답 → 주문 완료 화면 = 오너 주문 목록 금액 = 관리자 상세 금액.
5. **검증** — vitest: 멱등 응답 금액 = mock DB 행 값, 쿠폰 UPDATE 미호출. `npm run verify:store-order-create-atomicity`.
6. **보존** — 최초 생성 경로·RPC 불변.
7. **운영 데이터·정산** — 없음.
8. **Owner 결정** — 없음.

---

## 4-F. 배달 상태 (커밋 묶음 1-F · 배포 웹+DB)

### DLV-01 · 라이더 배달 체계는 코드만 있고 운영 0 — 관리자 메뉴·문서는 「정상」 표기
`배포: 웹(+문서) · 심각도: P2 · 증명: PROVEN(delivery_riders 0행) · 선행: 없음`

1. **원인** — `delivery_riders` 0행, `store_order_deliveries` 2행(감사 집계). 배달 상태 6종·라이더 API·POD 업로드 존재(`lib/stores/store-order-delivery-status.ts:1-35`). 실제 운영은 오너가 주문 상태를 직접 진행(자체배달). `docs/admin/dibay-admin-delivery-ops-audit-design.md:65` 는 라이더 메뉴를 「정상·유지」.
2. **영향** — 관리자: 운영되지 않는 메뉴를 정상으로 오인(배차 지연 감시 등 공백). 오너·주문자: 직접 영향 없음.
3. **수정** — 관리자 라이더·배차 메뉴 상단에 「미운영 — 배달 주체: 매장 자체배달(라이더 0)」 상태 배지(서버가 `delivery_riders` count 0 이면 표시) + 문서 65행 정정. 라이더 API 는 유지(삭제 안 함).
4. **연동** — 주문자 배달 주문 → 오너 상태 버튼(`ready_for_pickup→delivering→arrived→completed`) → `store_orders` → 관리자 주문·배달 화면(이제 "자체배달" 명시) → 주문자 상태 표시. 라이더 경로는 비활성 표기만.
5. **검증** — vitest: 배지 조건(라이더 0 → 표시). 화면 실측 NOT_PROVEN.
6. **보존** — 라이더 API·외부배달 웹훅 코드 불변(향후 D-6 도입 대비).
7. **운영 데이터·정산** — 없음.
8. **Owner 결정** — 기존 **D-6**. **기본안 확정**: 권장안(매장 자체배달 단일, 라이더 "미운영" 표시)으로 구현 — 라이더 도입은 D-6 결정 시 별도 설계.

### DLV-02 · 배달 상태와 주문 상태 미동기화 · 취소 시 배달 행 미종료 · CHECK 없음
`배포: DB+웹 · 심각도: P2 · 증명: PROVEN(코드 ✓ + 불일치 1건) · 선행: ORD-02(크론, 병행), ORD-06(취소 RPC), DLV-01`

1. **원인** — 오너 배달 패치 `lib/stores/store-order-delivery-service.ts:587-665` ✓ 는 `store_order_deliveries` 만 갱신(주문 전이 없음), POD 없이 `delivered` 가능(`:621-623` ✓), 직전 상태 CAS 없음(라이더 경로만 `.eq("delivery_status", prev)` `:1065` ✓). 주문 전이(`apply-store-order-status-transition.ts`)는 배달 행을 안 건드림. `delivery_status` CHECK 없음(pg_constraint).
2. **영향** — 주문자: 배달 완료 표시인데 주문 미완료(운영 1건) → 리뷰·완료 지연. 오너: 오너 직접 취소의 "픽업 이후 차단" 이 TS 사전 조회뿐이라 픽업과 동시 실행 시 우회 가능. 관리자: 배달 진행 화면과 주문 상태 불일치.
3. **수정** —
   - ① DB: `ALTER TABLE store_order_deliveries ADD CONSTRAINT store_order_deliveries_status_check CHECK (delivery_status IN ('waiting_rider','rider_assigned','pickup_in_progress','delivering','delivered','delivery_failed')) NOT VALID;` → 운영 2행 검사 후 `VALIDATE`.
   - ② 웹: 배달 행이 `delivered` 가 되면 주문을 SYSTEM(`systemPurpose:"delivery_sync"` 신설, 허용: `delivering→arrived`)으로 `arrived` 전이 → 기존 자동완료 타이머(`apply-store-order-status-transition.ts:223-231` ✓) 시작 → ORD-02 크론이 완료.
   - ③ 웹: 주문 `cancelled/refunded` 전이 시 열린 배달 행을 `delivery_failed`(`failure_reason='order_cancelled'`)로 닫음 — 2단계 2-C 에서 취소 DB 함수 안으로 이동.
   - ④ 오너 직접 취소의 픽업 확인은 ORD-06 RPC 의 잠금 아래에서(이미 ORD-06 에 포함).
   - ⑤ 오너 배달 UPDATE 에 `matchDeliveryStatus: prev`(`store-order-delivery-service.ts:162` 기존 옵션) 전달.
   - 설계 확정(D-6 무관): 배달 `delivered` = 주문 `arrived`(구매자 수령 확인·자동확정 대기), `completed` 로 바로 가지 않는다 — 기존 주문 상태 기계의 배달 경로와 일치.
4. **연동** — (라이더/외부배달) 배달 `delivered` → 주문 `arrived` → 오너 목록 "도착" → 자동확정 크론 → `completed` → 수수료(이미 조리 시 부과)·통화 인식·리뷰 가능 → 관리자 주문/배달 화면 일치 → 주문자 완료 알림. 취소 시: 주문 `cancelled` → 배달 행 `delivery_failed` → 관리자 배달 큐에서 사라짐.
5. **검증** — 상태 조합 불일치 SQL(배달 delivered & 주문 비종료/비arrived, 주문 종료 & 배달 열림) → 신규 데이터 0. vitest: 전이 그래프에 `delivery_sync` 추가, 오너 패치 CAS 409. 롤백 트랜잭션: CHECK 위반 INSERT 거부.
6. **보존** — 자체배달(라이더 없는) 경로: 배달 행이 없으므로 동작 불변. 오너 1탭 완료 정책 A 불변. 픽업 잠금 트리거(`trg_store_order_deliveries_pickup_requires_dispatch`) 불변.
7. **운영 데이터·정산** — 불일치 기존 1건은 정리 안 함(D-5). CHECK 는 `NOT VALID`→`VALIDATE` 전 기존 2행 위반 여부만 확인(위반 시 VALIDATE 생략, 신규 행만 강제).
8. **Owner 결정** — 없음(동기화 규칙은 위 설계로 확정). 라이더 도입 여부는 기존 D-6.

---

## 4-G. 정보 노출 (커밋 묶음 1-G · 배포 DB+웹)

### ORD-07 ⊃ DLV-04 · 내부 필드(`admin_note`·분쟁·수수료 기준액)·배달 증빙 경로가 오너·구매자 응답에 포함
`배포: DB+웹 · 심각도: ORD-07 P2 / DLV-04 P3 · 증명: 코드·정책 PROVEN, 실노출 데이터 0 · 선행: 없음`

**병합 근거**: 두 결함의 원인이 같다 — 오너·구매자 스냅샷 함수가 `to_jsonb(o.*)`·`to_jsonb(d.*)` 로 **전체 컬럼**을 반환하고, TS 정제가 라이더 경로에만 있다. 한 번에 "명시 컬럼 목록 + 공용 strip" 으로 고친다.

1. **원인** — ① `get_owner_store_orders_list_snapshot`(저장소 `supabase/migrations/20260526000000_owner_store_orders_list_snapshot.sql` 이후 운영 원문)이 `admin_note`·`admin_flagged`·`dispute_status`·`needs_admin_attention` 선택. ② `get_owner_store_order_detail_snapshot`·`get_buyer_store_order_detail_snapshot` 의 `to_jsonb(o.*)`·`to_jsonb(d.*)`. ③ 구매자 배달 정제 `sanitizeBuyerDeliveryPublic`(`lib/stores/store-order-detail-snapshot-assemble.ts:38-51` ✓)은 수령인 이름만 가림 → `delivered_proof_image_path`·`failure_proof_*`·증빙 좌표·배달 `admin_note` 포함. `stripDeliveryProofStorageFromClientRow`(`lib/stores/delivery-proof-admin-view.ts:11` ✓)는 라이더 라우트만 사용(`app/api/me/rider/orders/route.ts:54` ✓). ④ RLS `store_orders_buyer_select` + 테이블 단위 SELECT GRANT + Realtime 발행 → 구매자 세션이 `commission_base_amount`·`store_funded_amount`·`admin_note` 직접 수신 가능.
2. **영향** — 주문자: 매장 부담·수수료 기준액·관리자 메모 노출 가능. 오너: 관리자 내부 메모·분쟁 상태 노출. 관리자: 내부 메모 기밀성 상실. 증빙 경로는 비공개 버킷이라 경로만으로 열람 불가(DLV-04 = P3). 현재 `admin_note` 있는 주문 0건.
3. **수정** — **1차(이 블록)**:
   - DB: 세 스냅샷 함수를 명시 컬럼 목록으로 재정의 — 오너 목록에서 `admin_note` 제외(`admin_locked` 유지), 구매자 상세에서 내부 금액·관리자 컬럼 제외, 배달 행은 증빙 경로·`admin_note`·실패 좌표 제외. (`verify:owner-orders-list-snapshot-rpc`·`verify:store-order-detail-snapshot-rpc` 기대 키 갱신.)
   - 웹: 구매자·오너 상세 조립에 `stripDeliveryProofStorageFromClientRow` 공용 적용(방어 이중화). 증빙 열람은 기존 관리자 서명 URL API 만.
   - **2차(별도 설계, 이 블록 범위 밖으로 보류)**: 구매자 직접 SELECT·Realtime 의 컬럼 제한(보안 뷰 또는 컬럼 REVOKE)은 Realtime 의 컬럼 권한 처리 검증이 필요 — NOT_PROVEN 이므로 1차 반영 후 실측 설계로 분리. 1차만으로 앱 응답 경로는 닫힌다.
4. **연동** — 오너 주문 목록·상세(RPC) → 오너 화면(내부 필드 없음) → 관리자 상세는 관리자 전용 경로(`/api/admin/store-orders/[orderId]/detail`)라 그대로 전체 표시 → 구매자 상세(RPC+정제) → 주문자 화면. Realtime 행 패치 매핑(`lib/business/owner-store-order-delivery-row-rt.ts`)은 빠진 키를 무시하는지 확인(타입 `owner-store-order-list-row-bridge.ts` 정리).
5. **검증** — `verify:owner-orders-list-snapshot-rpc/-e2e`, `verify:store-order-detail-snapshot-rpc/-e2e` 응답 키 부재 확인. vitest: 상세 조립 결과에 `delivered_proof_image_path`·`admin_note` 키 없음. 롤백 트랜잭션: 각 RPC 결과 JSON 키 목록 비교.
6. **보존** — 화면이 쓰는 키는 전부 유지(키 목록 diff 를 화면 사용 grep 과 대조). 관리자 상세·증빙 서명 URL 불변. 목록 RPC 성능(r2-d1) — 컬럼 축소라 회귀 없음, 그래도 목록 RPC 변경이므로 `verify:parity-gates` 1회.
7. **운영 데이터·정산** — 데이터 변경 없음. 금액 컬럼 값 불변(응답에서만 제외).
8. **Owner 결정** — 없음(운영 DB 함수 적용 승인만).

---

## 4-H. 알림·상세 최신성 (커밋 묶음 1-H · 배포 웹)

### NTF-03 · 수락 알림에 조리 예상시간(ETA) 미포함
`배포: 웹 · 심각도: P3 · 증명: 코드 PROVEN ✓ · 선행: 없음`

1. **원인** — `notifyBuyerStoreOrderOwnerStatus` 는 `estimatedPrepMinutes` 를 받으면 ETA 문구·페이로드를 붙이지만(`notify-store-commerce.ts:596, 619-628, 651-652` ✓) 호출부가 넘기지 않음(`apply-store-order-status-transition.ts:684-702` ✓; 값은 `:184` 에서 `updatePayload.estimated_prep_minutes` 로 계산됨).
2. **영향** — 주문자: 접수 알림에 예상 시간 없음 → 상세를 열어야 함. 오너·관리자: 없음.
3. **수정** — 두 호출에 `estimatedPrepMinutes: nextStatus === "accepted" ? updatePayload.estimated_prep_minutes : undefined` 전달.
4. **연동** — 오너 수락 시트(1~180분) → 상태 전이 → `estimated_ready_at` 저장 → 구매자 알림 본문 "약 N분" → 주문 상세 ETA 와 일치. 관리자 무관.
5. **검증** — vitest: accepted 전이 시 알림 인자에 분 포함.
6. **보존** — 알림 dedupe·문구 키 불변.
7. **운영 데이터·정산** — 없음.
8. **Owner 결정** — 없음.

### NTF-04 · 구매자 상세 스냅샷이 상태 변경 직후 구 상태 반환 가능
`배포: 웹 · 심각도: P2 · 증명: 코드 PROVEN ✓ / 런타임 NOT_PROVEN · 선행: 없음`

1. **원인** — 무효화 표시가 인스턴스 메모리 `Set`(`lib/stores/store-order-detail-snapshot-cache.ts:7` ✓), 재생성은 응답 후 대기 없는 비동기(`store-order-detail-snapshot-refresh.ts:20-30` ✓), 만료 행도 1회 구 페이로드 반환(`store-order-detail-snapshot.ts:260-275`). 다른 인스턴스는 TTL(기본 8초)+1회 구 상태.
2. **영향** — 주문자: 접수·취소 알림을 받고 상세를 열었는데 이전 상태 표시 → 재문의. 오너·관리자: 각자 별도 경로라 무관.
3. **수정** — 상태 전이 성공 직후(같은 요청 안에서, `await`) `store_order_detail_snapshot` 행을 삭제(또는 `updated_at` 을 과거로 갱신)해 모든 인스턴스가 다음 조회에서 RPC 재조립하도록. 만료 행은 반환하지 않고 RPC 재조회. 근본 수정(AGENTS "채팅·Realtime·성능: 임시 조치 금지" — TTL 축소·폴링 증가가 아니라 무효화 계약 변경).
4. **연동** — 오너 상태 변경 → 전이 함수 → 스냅샷 행 무효화(DB) → 구매자 Realtime/알림 → 상세 재조회 → RPC 최신 → 주문자 결과 일치. 관리자 상세는 별도 경로.
5. **검증** — vitest: 전이 후 무효화 호출 순서(응답 전). `npm run verify:store-order-detail-snapshot-e2e`. 성능 민감(상세 hot path) → `verify:parity-gates`.
6. **보존** — 정상 캐시 히트(상태 변경 없을 때) 불변. 스냅샷 RPC 불변.
7. **운영 데이터·정산** — 캐시 행만 삭제(파생 데이터) — 원본 무변.
8. **Owner 결정** — 없음.

### NTF-02 · 시스템 처리(자동확정·결제실패·접수 타임아웃)를 「매장이 처리」 문구로 알림
`배포: 웹 · 심각도: P3 · 증명: PROVEN ✓ · 선행: 병행 ORD-02·ORD-03 반영(SYSTEM 목적 확정)`

1. **원인** — SYSTEM 전이도 `notifyBuyerStoreOrderOwnerStatus`(매장 처리 문구)로 발송, ADMIN 취소만 별도(`notify-store-commerce.ts:612` ✓). 전용 `notifyBuyerStoreOrderAutoCompleted`(`:810` ✓)는 제품 호출부 0. 결제실패는 `record-store-order-payment.ts` 의 실패 알림과 중복 가능. **병행 ORD-03 이 `accept_timeout` 을 추가하면 같은 문제가 하나 더 생김**("매장이 주문을 취소했습니다" 로 오표기).
2. **영향** — 주문자: 시스템 자동 처리를 매장 행위로 오인(특히 접수 타임아웃 취소). 오너: 하지 않은 취소로 평판 손상. 관리자: CS.
3. **수정** — `apply-store-order-status-transition.ts` 알림 분기에서 `actor === "SYSTEM"` 이면 `systemPurpose` 별: `auto_complete` → `notifyBuyerStoreOrderAutoCompleted`, `payment_failure` → 발송 생략(결제 실패 알림 단일화), `accept_timeout` → 신규 `notifyBuyerStoreOrderAcceptTimeout`("매장이 제한시간 내 접수하지 않아 자동 취소"), `delivery_sync`(DLV-02) → 매장 처리 문구 유지 불필요 → 도착 전용 문구. 알림 호출은 전이 함수 안에 두고 크론 라우트에는 두지 않음.
4. **연동** — 크론/결제 웹훅(SYSTEM) → 전이 → 목적별 알림 → 주문자 알림·상세 → 오너 목록(자동 처리 표기) → 관리자 이력(actor=SYSTEM).
5. **검증** — vitest: 목적별 알림 함수 호출 매트릭스. 기존 테스트 `lib/notifications/__tests__/commerce-notification-push-handoff-p2.test.ts:142`(크론 파일에 `notifyBuyerStoreOrderAutoCompleted` 문자열 없음) 유지 확인, `u3-buyer-order-cta.test.ts` 회귀. `verify:delivery-notification-scope`.
6. **보존** — OWNER·ADMIN 알림 문구·dedupe 키 불변. 알림 handoff 크론 경로 불변.
7. **운영 데이터·정산** — 없음.
8. **Owner 결정** — 없음.

---

## 4-I. 매장 계약 — 입점·감사 (커밋 묶음 1-I · 배포 웹+DB)

### ACC-06 · 오너 매장 정보 변경 이력(감사) 없음
`배포: 웹 · 심각도: P2 · 증명: 코드 PROVEN ✓ · 선행: 1-B(같은 PATCH 라우트에 게이트 추가)`

1. **원인** — 오너 PATCH `app/api/me/stores/[storeId]/route.ts` 는 `revision_requested→pending` 재제출 때만 `appendAuditLog`(`:369-389` ✓). 주소·좌표·전화·영업시간·최소주문·배달비(`business_hours_json` 내)·노출·영업 토글 변경은 기록 없음.
2. **영향** — 주문자: "주문 당시 최소주문·배달비" 분쟁 근거 없음. 오너: 자기 변경 이력 확인 불가. 관리자: 언제 누가 바꿨는지 추적 불가.
3. **수정** — PATCH 성공 후 `appendAuditLog({ actor_type:'user', actor_id, action:'store.owner_update', target_type:'store', target_id, before_json: 변경 키만 currentRow 에서, after_json: patch })`. 이미 `currentRow` 를 읽으므로(`:346` 근처) select 컬럼만 변경 대상 키로 확장. `is_open` 토글 포함(고빈도지만 운영 증빙 가치). `lib/audit` 는 서버 전용 — 라우트에서만 import(AGENTS 푸시 전 확인 4번).
4. **연동** — 오너 기본정보·영업 설정 저장 → PATCH → `stores` UPDATE(service_role) + `audit_logs` → 관리자 매장 상세 감사 탭(target_type='store') → 주문자 분쟁 시 관리자가 근거 제시.
5. **검증** — vitest: PATCH 시 audit 호출·before/after 키가 변경 키와 일치, 감사 실패해도 저장 결과 불변(감사는 best-effort가 아니라 실패 로그 + 응답 성공 — 기존 재제출 감사와 동일 정책).
6. **보존** — PATCH 동작·응답 불변. 재제출 감사 불변.
7. **운영 데이터·정산** — 신규 이력만 쌓임. 과거 이력 생성 안 함.
8. **Owner 결정** — 없음. (승인 후 핵심정보 변경 **재심사**는 신규 **ND-2** — 비차단.)

### ACC-04 · 반려 매장은 영구 종착 — 재신청·재심사 경로 없음
`배포: 웹 · 심각도: P2 · 증명: 코드 PROVEN ✓ · 선행: ACC-06(재신청 내용 변경도 감사)`

1. **원인** — 전이표에 `rejected` 출발 전이 없음(`lib/admin-business/admin-store-decision-rules.ts:15-23` ✓), 오너 PATCH 가 rejected 차단(`app/api/me/stores/[storeId]/route.ts:29` ✓ `BLOCKED_APPROVAL`), 1계정 1매장 UNIQUE 가 상태 무관(`app/api/me/stores/route.ts:128` ✓ 주석).
2. **영향** — 주문자: 없음. 오너: 오타·서류 미비 반려 후 영구 입점 불가 → 다계정 유도. 관리자: 재심사 수단 없음.
3. **수정** — 권장안(F D-17 의 데이터 모델 보존안): 관리자 전이 `reopen_application` 추가 — `ALLOWED_FROM.request_revision` 에 `"rejected"` 추가(rejected→revision_requested, 사유 필수·감사) → 이후 기존 보완 흐름(IA-01 로 복구된 수정 경로)으로 오너가 고쳐 재제출(`revision_requested→pending`). UNIQUE 인덱스·`stores` 행 그대로(같은 행 재심사). 관리자 매장 상세에 「재심사 열기」 CTA.
4. **연동** — 관리자 반려 → 오너 반려 안내 → (오너 문의) → 관리자 「재심사 열기」 → 오너 보완 화면에서 수정·재제출 → 관리자 심사 → 승인 → 주문자 노출.
5. **검증** — vitest: 전이표 rejected→revision_requested 허용, 그 외 rejected 출발 거부. 운영 rejected 0건 → 데이터 영향 없음.
6. **보존** — 1계정 1매장 UNIQUE 불변, 다른 전이 불변.
7. **운영 데이터·정산** — 없음.
8. **Owner 결정** — 기존 **D-17**(재신청 허용 방식). 기본안 = 위 관리자 재오픈(문서 F §3 "같은 행 재심사로 설계" 와 일치). 신규 아님.

### ACC-05 (기능 부분) · 사업자 정보·필수 서류 심사 기능 부재
`배포: 웹+DB · 심각도: P2(누락 기능) · 증명: PROVEN(코드 grep·SQL) · 선행: N-3(권한), ACC-04`

1. **원인** — 입점 신청 바디에 사업자 번호·대표자·인허가·서류 없음(`app/api/me/stores/route.ts:49-75`). `store_business_verifications` 0행·코드 참조 0.
2. **영향** — 주문자: 미검증 사업자 매장에서 주문. 오너: 서류 제출 수단 없음. 관리자: 심사 근거 없음.
3. **수정** — N-3 이 쓰기를 닫은 뒤, 서류 목록이 정해지면: 제출 RPC + 관리자 결정 RPC(N-3 §3) + 오너 신청 화면 섹션(매장 어드민 UI 셸) + 관리자 심사 화면의 서류 패널 + `approve_store` 전 "검증 완료" 조건(정책에 따라 경고/차단). Storage 는 비공개 버킷 + 서명 URL.
4. **연동** — 오너 신청·보완 화면 서류 업로드 → 제출 RPC → 관리자 입점 심사(서류 확인·결정 RPC) → 승인 전이 → 주문자 노출.
5. **검증** — RPC 롤백 트랜잭션(오너 상태 변경 불가, 관리자 결정만), vitest(신청 폼 검증).
6. **보존** — 기존 승인 매장 17곳은 소급 서류 요구 없음(정책상 유예) — 승인 조건은 신규 신청부터.
7. **운영 데이터·정산** — 없음.
8. **Owner 결정** — 기존 **D-17**(필수 서류 목록·미제출 시 차단 여부). **결정 전까지 기능 구현 보류**, 권한 부분(N-3)만 먼저 반영.

---

## 4-J. 상품 — 검수·가격·노출·재고·동시성·캐시 (커밋 묶음 1-J · 배포 웹+DB)

> 주문 RPC(`create_store_order_atomic`, 최신 정의 `supabase/migrations/20270117140000_gift_one_time_full_consumption.sql` → 운영 원문 대조 R-DB-1)를 고치는 PRD-03·PRD-05·PRD-06 은 **한 마이그레이션에서 1회 재정의**(R-HL).

### PRD-04 · 관리자 「가격 수정」이 할인가를 재계산·검증하지 않음 · DB CHECK 없음
`배포: 웹+DB · 심각도: P1 · 증명: 코드 PROVEN ✓ / 현재 불일치 0 · 선행: 없음`

1. **원인** — `lib/stores/admin-store-product-ops.ts:133-145` ✓ `correct_price` 가 `price` 만 patch(`discount_price`·`discount_percent` 유지). 주문 단가는 `discount_price < price` 면 할인가(`validate-store-order-checkout.ts:100-104`, RPC `v_live_base`). DB CHECK 는 `discount_price >= 0` 만. 오너 POST/PATCH 의 `discount_price` 직접 입력도 가격 대비 미검증(`products/route.ts:253-256`, `[productId]/route.ts:230-242`) — UI 폼은 항상 percent 를 보내 정상.
2. **영향** — 주문자: 정가 100·10% 상품을 관리자가 200 으로 정정하면 할인가 90 유지 → 실질 55% 할인 결제, 표시 10% 와 불일치. 오너: 매출 손실·수수료 기준액 동반 감소. 관리자: 의도와 다른 가격.
3. **수정** — 웹: `buildAdminStoreProductPatch("correct_price")` 가 현재 `discount_percent` 를 받아 `discountPriceFromPercent` 로 `discount_price` 재계산(percent 없고 `discount_price>=새 price` 면 null); 라우트의 행 조회 select 에 `discount_percent, discount_price` 추가. 오너 POST/PATCH 의 직접 `discount_price` 는 `< price` 아니면 400 `invalid_discount_price`. DB: `ALTER TABLE store_products ADD CONSTRAINT store_products_discount_lt_price CHECK (discount_price IS NULL OR price = 0 OR discount_price < price) NOT VALID; VALIDATE`(감사 시 위반 0).
4. **연동** — 관리자 상품 가격 정정 → `store_products` → 메뉴 스냅샷 무효화(관리자 bump) → 구매자 메뉴 가격·할인율 → 장바구니 → 체크아웃 `price_changed` 재확인(정상 fail-closed) → 주문 RPC 단가 → 오너 주문 상세·수수료 기준액.
5. **검증** — vitest `admin-store-product-ops` correct_price 재계산 케이스, 오너 라우트 400 케이스. 롤백 트랜잭션: CHECK 위반 UPDATE 거부(service_role 로).
6. **보존** — 오너 폼 percent 경로 불변. 할인 없는 상품 불변.
7. **운영 데이터·정산** — 현재 위반 0 → 데이터 변경 없음. 신규 가격 정정부터 정합.
8. **Owner 결정** — 없음 (DB 제약 적용 승인만).

### PRD-03 · 관리자 검수 반려 상품을 「수정 → active」 2단계로 재검수 없이 판매 재개
`배포: 웹+DB · 심각도: P1 · 증명: 코드 PROVEN ✓ · 선행: P0-2(완료 — REST 우회 경로 차단됨)`

1. **원인** — `app/api/me/stores/[storeId]/products/[productId]/route.ts:410-415` ✓ 는 **변경 전 행이 `rejected`** 일 때만 active/sold_out 차단, 같은 파일 `:477-484` ✓ 가 반려 상품 내용 수정 시 `pending` 으로 바꿈 → 다음 PATCH 는 차단 조건 미충족. 메뉴 RPC `get_store_menus_snapshot`·체크아웃 검증(`validate-store-order-checkout.ts:219-224`)·주문 RPC 모두 `admin_review_status` 미확인. UI(`OwnerProductsHubClient.tsx:275-281`)는 "승인 후 판매" 안내.
2. **영향** — 주문자: 관리자가 부적합 판정한 상품 주문 가능. 오너: 안내와 다른 동작. 관리자: 반려(DEF-65) 무력화.
3. **수정** — 설계 확정(Owner 질문 불요 — 코드 주석 `:476` "관리자가 「검수 승인」하면 판매 재개" 와 UI 안내가 이미 의미를 정함): **반려 이력에서 생긴 `pending`(재검수 대기)도 판매 불가**.
   - 웹: 차단 조건을 `["rejected","pending"].includes(prev.admin_review_status)` 로. 단 신규 상품 기본값은 `none` 이므로 일반 판매 흐름 영향 없음(`pending` 은 반려 후 수정에서만 생김 — 코드 grep 으로 다른 `pending` 작성처 0 확인 후 적용).
   - DB(R-HL 공용 마이그레이션): 메뉴 스냅샷 RPC 와 주문 RPC Pass1 에 `admin_review_status NOT IN ('rejected','pending')` 조건 → 위반 시 `product_not_available`. 체크아웃 TS 검증도 동일.
4. **연동** — 관리자 반려 → 오너 허브 "반려" → 오너 수정 저장(`pending`) → 판매 전환 시도 403 `admin_review_pending` → 관리자 「검수 승인」 → 오너 active → 구매자 메뉴 노출 → 주문 RPC 통과 → 오너 주문 수신.
5. **검증** — vitest: rejected→PATCH(title)→PATCH(active) 403, approve 후 200. 체크아웃 검증 케이스. DB 롤백 트랜잭션: 주문 RPC 에 pending 상품 → `product_not_available`. `verify:store-menus-snapshot-rpc`, `verify:delivery-product-hard-lock`, `verify:store-order-create-atomicity`.
6. **보존** — `none`/`approved` 상품 판매 불변. 관리자 검수 API 불변.
7. **운영 데이터·정산** — 운영 pending/rejected 상품 0건 → 데이터 영향 없음.
8. **Owner 결정** — 없음 (F 승인표의 PRD-03 메모 "pending 의미" 는 위 설계로 확정 — 기존 코드·UI 의미와 동일).

### PRD-05 · 숨김 카테고리 상품이 상세·주문 API 로 노출·주문 가능
`배포: 웹+DB · 심각도: P2(운영 숨김 0 → 잠재) · 증명: 코드 PROVEN ✓ · 선행: PRD-03 (같은 RPC 마이그레이션)`

1. **원인** — 숨김 필터가 메뉴 조립에만 있음(`lib/stores/store-menus-catalog-assemble.ts:70-76`). 상세 API `app/api/stores/products/[productId]/route.ts:41-52` 는 상태만, 체크아웃(`validate-store-order-checkout.ts:193-224`)·주문 RPC 는 섹션 미조회.
2. **영향** — 주문자: 메뉴판에 없는 상품을 재주문·직접 링크로 주문. 오너: 카테고리 숨김을 판매중지로 쓴 경우 원치 않는 주문. 관리자: 없음.
3. **수정** — 설계 확정: **노출 = 주문 가능 일치**(구매자가 볼 수 없는 상품은 주문할 수 없다 — 메뉴 SSOT 와 동일 규칙). 체크아웃·상세 API select 에 `store_menu_sections(is_hidden)` 추가 → `product_not_available`/404. 주문 RPC Pass1 에 `NOT EXISTS (… is_hidden)` 추가(공용 마이그레이션). 장바구니에 담긴 상품은 결제 시 기존 `product_not_available` 문구로 안내.
4. **연동** — 오너 카테고리 숨김(`menu-sections` PATCH) → 메뉴 스냅샷 → 구매자 메뉴·상세 404 → 장바구니 결제 거부 → 주문 RPC 거부 → 오너 주문 미수신.
5. **검증** — vitest: checkout hidden section 거부, 상세 API 404. 롤백 트랜잭션 RPC 거부.
6. **보존** — 섹션 없는 상품("기타 메뉴") 판매 불변. 숨김 해제 즉시 판매 재개.
7. **운영 데이터·정산** — 숨김 섹션 0 → 영향 없음.
8. **Owner 결정** — 없음 (위 규칙으로 확정).

### PRD-06 · 취소 재고복원이 수동 품절(오너·관리자)을 판매중으로 되돌림
`배포: DB+웹 · 심각도: P2 · 증명: DB 함수 PROVEN / 런타임 NOT_PROVEN · 선행: PRD-03(같은 RPC 마이그레이션)`

1. **원인** — `restore_store_order_stock_atomic`(저장소 `supabase/migrations/20270101140000_restore_store_order_stock_atomic.sql`, 운영 원문 대조) — `CASE WHEN p.product_status='sold_out' AND (p.stock_qty + v_line.qty) > 0 THEN 'active'`. 자동 품절과 수동 품절 구분 컬럼 없음.
2. **영향** — 주문자: 매장이 재료 소진으로 막은 메뉴가 다시 주문 가능 → 거절·취소. 오너: 수동 품절이 몰래 풀림. 관리자: 관리자 품절 조치 무력화.
3. **수정** — DB: `store_products.sold_out_reason text NULL CHECK (sold_out_reason IN ('stock','manual','admin'))`. 주문 RPC Pass2 가 재고 0 품절 시 `'stock'`, 복원 함수는 `sold_out_reason='stock'` 일 때만 active 전환 + reason NULL. 웹: 오너 PATCH 에서 `sold_out` 설정 시 `'manual'`, active 시 NULL; 관리자 ops `sold_out` 시 `'admin'`. 기존 sold_out 행은 reason NULL → **복원 시 자동 해제 안 함**(보수적 기본값 — 판매 재개는 사람이 함).
4. **연동** — 주문 → 재고 0 자동 품절(`stock`) → 취소 → 복원 시 active → 구매자 메뉴 재노출. 오너 수동 품절(`manual`) → 과거 주문 취소 → 재고만 증가, 품절 유지 → 오너 허브 "품절" 그대로 → 관리자 화면 동일.
5. **검증** — DB 롤백 트랜잭션 매트릭스(stock/manual/admin/NULL × 취소). `verify:store-order-recovery-integrity`, `verify:delivery-product-hard-lock` 갱신(Recovery Chain reopen 기록).
6. **보존** — 재고 수량 복원 로직 불변(상태 전환 조건만). 재고 추적 안 하는 상품 불변.
7. **운영 데이터·정산** — 컬럼 추가만, 기존 행 값 채우기 없음(D-5). 금전 무관.
8. **Owner 결정** — 없음 (HARD LOCK reopen 은 이 결함 수정 승인에 포함).

### PRD-07 · 오너 상품 수정에 낙관적 잠금 없음 — 주문 감산·관리자 조치 덮어씀
`배포: 웹 · 심각도: P2 · 증명: 코드 PROVEN ✓ · 선행: PRD-06(폼이 sold_out_reason 을 덮어쓰지 않도록)`

1. **원인** — 폼이 항상 전체 payload(`stock_qty`, `product_status` 포함) 전송(`components/business/owner/OwnerProductForm.tsx:510-528, 616-621`), 서버는 조건 없는 `.update(patch).eq(id).eq(store_id)`(`[productId]/route.ts:486` ✓). 관리자 측은 CAS 있음(`app/api/admin/store-products/[productId]/route.ts:97-111`) — 비대칭.
2. **영향** — 주문자: 재고 0 상품이 오너 저장으로 재고 5·active 로 부활 → 과판매·취소. 오너: 의도치 않은 상태. 관리자: 관리자 조치(품절·숨김) 유실.
3. **수정** — PATCH 바디 `expected_updated_at` 수용 → `.eq("updated_at", expected)` 조건부 UPDATE, 0행이면 409 `product_changed`(+최신 행 반환). 폼은 로드 시 `updated_at` 보관, **변경된 필드만 전송**(dirty 비교 — stock/status 미변경 시 생략). 허브 퀵 토글(단일 필드)은 `expected_updated_at` 선택적(없으면 기존 동작).
4. **연동** — 오너 편집 폼 로드 → (사이에 주문 재고 감산·관리자 품절) → 오너 저장 409 → 폼 "다른 곳에서 변경됨, 새로 불러오기" → 재편집 저장 → 메뉴 무효화 → 구매자 메뉴 정확.
5. **검증** — vitest: 불일치 409, 일치 200, dirty 필드만 patch.
6. **보존** — 퀵 토글·신규 등록 불변. 응답 스키마 확장만.
7. **운영 데이터·정산** — 없음.
8. **Owner 결정** — 없음. (관리자 숨김·품절을 오너가 되돌릴 수 있는지는 신규 **ND-1** — 비차단, 현행 유지.)

### PRD-09 · 오너 상품 목록 캐시(30s)가 주문 감산·관리자 조치·카테고리 삭제로 무효화 안 됨
`배포: 웹 · 심각도: P2 · 증명: 코드 PROVEN ✓ · 선행: PRD-07`

1. **원인** — `OWNER_PRODUCTS_LIST_CACHE_TTL_MS = 30_000`(`lib/stores/owner-products-list-snapshot.ts:59` ✓), `invalidateOwnerProductsListCache` 호출은 오너 POST/PATCH 뿐(`products/route.ts:428`, `[productId]/route.ts:522` ✓). 관리자 상품 PATCH·섹션 DELETE·주문 생성/취소 미호출. globalThis Map(인스턴스 로컬).
2. **영향** — 오너: 최대 30초 이전 재고·검수 상태를 보고 퀵 토글 → 잘못된 판단(PRD-07 의 409 로 덮어쓰기는 막힘). 주문자·관리자: 간접.
3. **수정** — 관리자 상품 PATCH(`admin/store-products/[productId]/route.ts:113-120`)·섹션 PATCH/DELETE(`menu-sections/[sectionId]/route.ts`)에 `invalidateOwnerProductsListCache(storeId)` 추가. 인스턴스 간 일관성은 OPS-02 의 공용 세대에 오너 목록 캐시 키도 포함(세대 값을 캐시 키에 접두)해 해결 — TTL 단축 같은 임시 조치 대신 무효화 계약 확장.
4. **연동** — 관리자 품절/숨김 → 오너 허브 즉시 반영 → 오너 판단 정확 → 구매자 메뉴(OPS-02) 일치.
5. **검증** — `npm run verify:owner-products-perf`(invalidate 단계에 관리자·섹션 케이스 추가), vitest.
6. **보존** — 캐시 히트 성능(r 계약 `docs/store-owner-products-perf-lock.md`) — 무효화 경로만 추가. 성능 문서 갱신.
7. **운영 데이터·정산** — 없음.
8. **Owner 결정** — 없음.

### OPS-02 ⊃ PRD-08 · 오너 쓰기가 인스턴스 공통 공개 캐시 세대를 올리지 않음
`배포: 웹 · 심각도: P2 · 증명: 코드 PROVEN ✓(호출처 grep) / 지연 실측 NOT_PROVEN · 선행: PRD-09`

1. **원인** — `bumpStorePublicSharedCacheGeneration`(`lib/stores/store-public-shared-cache-generation.ts` ✓) 호출처는 관리자 라우트 8곳뿐 ✓(grep: `app/api/admin/stores/[id]`, `store-products/[productId]`, `store-coupons`, `taxonomy` 등), 오너 라우트 0. 오너는 `invalidateStoreMenusSnapshotCacheByStoreId`(로컬 Map + DB counter 예약)·`afterCanonicalStoreLocationWrite`(로컬)만.
2. **영향** — 주문자: 다른 인스턴스에서 20~60초간 "영업중"·이전 메뉴·품절 미표시 → 결제 단계 `store_closed`/`product_not_available`(주문 무결성은 RPC 가 보장). 오너: "닫았는데 주문이 들어오려 함" 문의. 관리자: 없음.
3. **수정** — 오너 쓰기 성공 후 `bumpStorePublicSharedCacheGeneration("owner_store.<key>")` 1회: `/api/me/stores/[storeId]` PATCH(영업·영업시간·기본정보), `products` POST/PATCH, `menu-sections` CRUD, `banners`·`notices` 쓰기. 전역 purge 비용이 크면 세대를 매장 단위 태그(`store:{storeId}`)로 세분화 — **성능 민감 변경 → `verify:parity-gates` 필수**, 홈/브라우즈 캐시 히트율 회귀 확인.
4. **연동** — 오너 영업 종료 토글 → PATCH → `stores` + 세대 bump → 모든 인스턴스 다음 요청에서 재조회 → 구매자 목록·상세 "영업 종료" → 체크아웃 차단 → 관리자 매장 화면 일치.
5. **검증** — vitest: 각 라우트가 bump 호출. `npm run verify:parity-gates`, `verify:stores-browse-snapshot-e2e`, `verify:store-menus-snapshot-e2e`. 2인스턴스 재현은 NOT_PROVEN(Production 관찰).
6. **보존** — 관리자 bump 계약(DEF-64) 동일 사용. 로컬 무효화 유지(이중).
7. **운영 데이터·정산** — 없음.
8. **Owner 결정** — 없음 (PRD 부록의 "성능 영향 수용" 은 parity-gates PASS 를 기준으로 설계 판정 — 회귀 시 매장 단위 세대로 축소).

---

# 5. 2단계 — 결제·코인·캐시·상품권·정산

### 2단계 내부 순서 (의존)

```
2-0 FIN-10 (운영 원문·마이그레이션 기록 정합) ── 모든 2단계 DB 블록의 선행
2-A 캐시·미납:   FIN-02 → FIN-12 → FIN-04⊃IA-22 → (N-4B: charge_requests) → FIN-08 → FIN-11
2-B 플랫폼 보유분: FIN-03(=GFT-03, D-2) → GFT-02(재발 감지) ; FIN-13(D-3, 문서·정책)
2-C 취소·환불 원자화: [1-E ORD-06 함수] → FIN-05⊃ADS-21⊃GFT-05 → ADS-25
2-D 상품권:      GFT-01 → GFT-04 · GFT-06 · GFT-07 · GFT-08
2-E 쿠폰 분할:   ADS-22  (주문 RPC — 1-J 공용 마이그레이션 이후 별도 재정의)
2-F 레거시 정산·게이트: FIN-06 → (N-4B: store_settlements) → FIN-07 ; FIN-15 (주문 RPC)
```
D-21(게이트 ON)은 FIN-02 반영 전에는 켜지 않는다(블록 FIN-02 8번).

---

## 5-0. 선행

### FIN-10 · 운영 배포 상태 추적 불가 (마이그레이션 기록 누락 · 드리프트)
`배포: DB(메타)+문서 · 심각도: P2 · 증명: 운영 SQL PROVEN · 선행: 없음 — 2단계 DB 블록 전부의 선행`

1. **원인** — 운영 `supabase_migrations.schema_migrations` 최대 `20270520120000` 인데 `20270421120*`·`20270510120000`·`20270512*`·`20270515*`·`20270523*`·`20270601*` 의 함수가 운영에 존재(기록 누락). 저장소에 없는 운영 객체도 있음(N-5 `internal.is_admin_user`, OPS-06 정책). `docs/store-commission-cash-settlement-ssot.md:10` 은 "운영 미적용".
2. **영향** — 관리자·개발: 다음 마이그레이션의 재실행/누락 판단 불가, 트리거 비활성(P0-5) 같은 드리프트 미검출 → 2단계 함수 교체 시 운영 원문과 다른 저장소 정의로 덮어써 회귀할 위험(이 문서에서 가장 큰 공통 위험).
3. **수정** — ① 읽기 전용 스냅샷: 2단계 대상 함수 전부(`settle_store_sale_fee_obligations`, `approve_business_cash_charge_request`, `convert_store_economic_points_to_business_cash`, `admin_decide_store_commission_adjustment`, `gift_certificate_refund_order_atomic`, `gift_certificate_cancel_order_restore`, `gift_certificate_redemption_reverse`, `restore_store_coupon_entitlement`, `create_store_order_atomic`, `gift_certificate_purchase`, `reverse_coin_credits_for_order`)의 `pg_get_functiondef` 를 받아 저장소 최신 정의와 diff → 결과를 문서로 커밋. ② Owner 승인 후 실제 적용된 버전을 `schema_migrations` 에 INSERT(메타만). ③ `scripts/verify-schema-authority.mjs` 에 함수 본문 해시·트리거 `tgenabled` 비교 추가. ④ SSOT 문서 머리말 상태 갱신.
4. **연동** — 개발자 마이그레이션 작성 → 운영 원문 기준 수정 → 적용 → 메타 기록 → `verify:schema-authority` 로 드리프트 0 → 관리자 무결성 보고(`store_commission_integrity_report`)가 의도한 함수로 동작.
5. **검증** — `npm run verify:schema-authority` 가 diff 0 보고. 메타 INSERT 후 `select max(version)` 확인.
6. **보존** — 함수·데이터 변경 없음(메타 테이블만).
7. **운영 데이터·정산** — 업무 데이터 무변.
8. **Owner 결정** — 없음 (운영 메타 기록 적용 승인만).

---

## 5-A. 캐시·미납 (커밋 묶음 2-A · 배포 DB+웹)

### FIN-02 · 미납 상계 멱등 키 충돌 → 충전 승인·Coin 전환 전체 롤백
`배포: DB · 심각도: P1 · 증명: 정적 PROVEN(운영 함수+UNIQUE) / 재현 NOT_PROVEN · 선행: FIN-10`

1. **원인** — 운영 `settle_store_sale_fee_obligations` 의 `idempotency_key = 'sale_fee_settle:' || v_ob.id || ':' || v_pay`(저장소 `supabase/migrations/20261202120000_currency_cut_d_sale_fee_obligation.sql:240`) + `business_cash_ledger_idem_uidx UNIQUE`. 같은 의무에 같은 금액 부분 상계가 두 번이면 `unique_violation` → 호출자 `approve_business_cash_charge_request`·`convert_store_economic_points_to_business_cash` 전체 롤백.
2. **영향** — 오너: 미납 매장이 소액 분할 충전 시 두 번째 충전이 계속 실패 → 게이트 ON 시 주문 영구 차단. 관리자: 승인 실패 원인 불명(`rpc_failed`). 주문자: (게이트 ON 시) 해당 매장 주문 불가.
3. **수정** — 키를 `'sale_fee_settle:' || v_ob.id || ':' || v_ob.fee_paid_minor || ':' || v_pay`(상계 직전 누적 납부액 — 단조 증가라 유일)로 변경. 함수 외 변경 없음. D-1 이후 P0-5 로 의무가 다시 생기므로 **실제 발생 가능성이 이제 생겼다**(우선순위 근거).
4. **연동** — 조리 진입 → 트리거 수수료 의무(캐시 부족분 미납) → 오너 `/stores/owner/finance` 충전 요청 → 관리자 충전 승인 → 승인 RPC 내 상계(이번 수정) → 미납 감소·SETTLEMENT 원장 → 오너 정산 화면(`store_commission_ledger_page`)·관리자 `/admin/store-settlements` 동일 수치 → 게이트(OFF 유지) → 주문자 주문 가능.
5. **검증** — 운영 롤백 트랜잭션: 미납 10,000 의무 1건 가상 생성 → 충전 2,000 승인 ×2 → 2회 성공, SETTLEMENT 2행, `paid+outstanding=due`. 무결성 I2(납부액=원장 합) 위반 0. ROLLBACK.
6. **보존** — 기존 원장 행 키 불변(새 행부터 새 형식). 상계 순서(오래된 순)·금액 계산 불변.
7. **운영 데이터·정산** — 데이터 변경 없음. 정산 금액 계산 불변.
8. **Owner 결정** — 없음. (D-21 게이트 ON 은 **FIN-02 운영 적용 이후**로만 — 운영 순서 제약, 신규 결정 아님.)

### FIN-12 · 수수료 환급 승인으로 캐시가 늘어도 다른 미납을 상계하지 않음
`배포: DB · 심각도: P3 · 증명: 코드 PROVEN · 선행: FIN-02 (같은 상계 함수 호출)`

1. **원인** — `admin_decide_store_commission_adjustment`(저장소 `20270510120000_store_commission_cash_ssot.sql` §6)가 캐시 환급 후 `settle_store_sale_fee_obligations` 미호출 — 충전·전환과 규칙 불일치.
2. **영향** — 오너: 잔액 > 0 과 미납 > 0 이 동시에 표시(순잔액·게이트는 정상). 관리자: 미납 매장 목록에 남음.
3. **수정** — 결정 함수 끝(승인·환급 분기)에서 `settle_store_sale_fee_obligations(p_store_id, …)` 호출(충전·전환과 동일). AGENTS 규정상 수수료 환급은 이 함수로만 — 함수 내부 보강이므로 규정 준수.
4. **연동** — 조리 후 취소 → 트리거 검토 플래그 → 관리자 환급 승인 → 캐시 환급 + 다른 미납 상계(같은 TX) → 오너 정산 화면 미납 감소 → 관리자 화면 일치.
5. **검증** — 롤백 트랜잭션: 의무 A(검토) + 의무 B(미납) → A 환급 승인 → B 상계 원장 1행.
6. **보존** — 결정 원장(`store_commission_adjustments`) 불변 트리거 불변. 환급 금액 계산 불변.
7. **운영 데이터·정산** — 과거 결정 재처리 없음(D-5).
8. **Owner 결정** — 없음.

### FIN-04 ⊃ IA-22 · 캐시 충전이 입금 증빙 없이 적립 · 금전 CTA 멱등키 매번 새로 생성 · Coin 출금 확인창 없음
`배포: DB+웹 · 심각도: P1 · 증명: 코드·스키마 PROVEN ✓ / 중복 승인 사례 NOT_PROVEN · 선행: FIN-02, FIN-10`

1. **원인** — ① 키: `components/business/owner/OwnerBusinessCashView.tsx:185` ✓ `bc_topup:${storeId}:${php}:${Date.now()}`, `:231` ✓ 전환 키 동일, `components/business/owner/OwnerCoinWithdrawalPanel.tsx:106` ✓ 출금 키 동일, 서버 대체 키 `app/api/me/stores/[storeId]/business-cash/route.ts:144-146` ✓. ② `business_cash_charge_requests` 에 결제수단·참조번호·증빙 컬럼 없음, 금액 상한 없음, PENDING 중복 제한 없음, 요청 생성이 service_role TS INSERT(`lib/stores/advertising/canonical-business-cash-writer.ts:223-260` ✓). ③ 운영 `approve_business_cash_charge_request` 는 service_role 만 확인 — 관리자 신원·자기 매장 승인 금지 없음, 라우트 권한 `business`(`app/api/admin/business-cash-charges/route.ts:112`). ④ Coin 출금 신청 확인 모달 없음.
2. **영향** — 오너: 네트워크 재시도로 중복 요청. 관리자: 입금 대사 근거 없이 승인 → 중복 2건 모두 승인 시 무상 캐시 → 수수료·광고비로 소진(플랫폼 손실). 매장 소유 관리자가 자기 매장 승인 가능. 주문자: 간접(없음).
3. **수정** —
   - 웹(IA-22): 세 폼 모두 `useState(() => crypto.randomUUID())` 로 폼 단위 키, 성공 시에만 재생성(광고 `clientRequestId` 패턴). 서버 대체 키에서 `Date.now()` 제거 → 키 없으면 400. Coin 출금에 `OwnerStoreAdminConfirmModal`(금액·계좌 요약).
   - DB: 요청 테이블에 `payment_method`, `payment_reference`(매장 내 UNIQUE, NULL 허용 기간 후 NOT NULL), `proof_file_path`, `decided_reason` 추가. 신규 RPC `owner_create_business_cash_charge_request`(소유 확인·PENDING 동시 1건·상한 검사) → TS INSERT 대체(→ N-4B 회수 가능). 승인 RPC 에 `is_platform_admin(p_admin_user_id)` + `stores.owner_user_id <> p_admin_user_id` + 사유 저장.
   - 상한·입금 수단 값은 D-4 결정 전까지 **설정값으로 두고 기본 = 상한 없음·참조번호 선택** → 결정 시 설정만 변경(코드 재배포 불요).
4. **연동** — 오너 충전 요청(참조번호·증빙) → RPC → CD-2 알림 HARD LOCK 경로로 관리자 알림(불변) → 관리자 `/admin/delivery-ads/cash-charges` 에서 참조 확인·승인(자기 매장 금지) → 승인 RPC(적립 + FIN-02 상계) → 오너 캐시·미납 → 정산 화면 → 주문자 주문 가능(게이트).
5. **검증** — vitest: 같은 폼 2회 전송 → 같은 키. 롤백 트랜잭션: 같은 키 2회 → 요청 1행; 자기 매장 승인 거부; PENDING 2번째 거부. `docs/dibay-owner-cash-charge-notify-wire-hard-lock.md` 관련 verify(알림 와이어) 회귀.
6. **보존** — CD-2 알림 HARD LOCK 계약 불변(라우트 내부만). 기존 승인 20건·원장 불변. 전환·출금 RPC 의미 불변(키만 안정화).
7. **운영 데이터·정산** — 과거 승인 20건 ₱17,878 대사·회수 안 함(D-5). 컬럼 추가는 NULL 허용으로 기존 행 무변.
8. **Owner 결정** — 기존 **D-4**(입금 수단·참조 필수·상한·승인 등급). 비차단 — 위 설정값 기본으로 구현, 결정 시 값만 변경.

### FIN-08 · Cash/Coin 관리자 정정 경로 없음
`배포: DB+웹 · 심각도: 원 P2 → D-5 적용 후 P3(정정 수단 부재) · 증명: 운영 SQL PROVEN · 선행: FIN-04(같은 관리자 금전 화면), FIN-10`

1. **원인** — `business_cash_ledger.entry_kind` CHECK 에 `ADMIN_ADJUST` 가 있으나 작성 함수·API 없음(마이그레이션 정의에만 등장, TS 0). Coin `ADMIN_ADJUST` 동일. 레거시 조정 API 410.
2. **영향** — 관리자: 앞으로 생길 불일치를 증거 기반으로 정정할 수단이 없음. 무결성 보고의 기존 위반(₱225, Coin 초과 9,050)이 영구 알림. 오너·주문자: 직접 없음.
3. **수정** — **D-5: ₱225·Coin 초과 등 과거 데이터는 정정하지 않는다.** 코드 결함(수단 부재)만 해결:
   - `admin_adjust_business_cash(p_admin, p_store, p_direction, p_amount_minor, p_reason, p_evidence_ref, p_idem)`·`admin_adjust_store_coin(...)` — super_admin 재확인, 사유·증거 필수, 원장 1행 + `audit_logs`, 잔액 CHECK 유지, 정정 원장 전용(잔액 이동 0) 모드. 관리자 재무 화면에 정정 폼(이중 확인).
   - 무결성 보고(`store_commission_integrity_report`)에 R-D5 적용: 기준 시각 이전 위반은 `legacy_preserved` 로 분류해 예외 알림(`store_commission_enqueue_exception_notifications`)에서 제외 — 값은 그대로, 이후 신규 위반만 알림.
4. **연동** — (향후 불일치 발생) 무결성 알림 → 관리자 정정 폼 → RPC(원장+감사) → 오너 캐시/Coin 원장에 "관리자 정정" 행 → 오너 화면 사유 표시 → 정산 화면 일치.
5. **검증** — 롤백 트랜잭션: 정정 1건 → 원장·감사 1행, 비 super_admin 거부, 음수 잔액 거부. 무결성 보고: 과거 위반 `legacy_preserved`, 신규 0.
6. **보존** — 원장 불변 트리거·멱등 UNIQUE 불변. 기존 원장 행 무변.
7. **운영 데이터·정산** — **정리·정정 0건(D-5)**. 기존 위반 수치는 보고에 그대로 남고 알림만 분류.
8. **Owner 결정** — 없음 (D-5 로 정정 정책 확정 — 수단만 제공, 사용은 신규 사건부터).

### FIN-11 · 오너 재무 화면 미납 합계가 SQL 단일 함수가 아닌 TS 집계
`배포: 웹 · 심각도: P3 · 증명: 코드 PROVEN ✓ · 선행: 없음`

1. **원인** — `app/api/me/stores/[storeId]/finance/route.ts:19,68` ✓ `aggregateOpenSaleFeeObligations`(TS) vs 정산 화면 `store_cash_position`(SQL). AGENTS "Admin·Owner 는 같은 SQL 조회 함수만" 위반.
2. **영향** — 현재 숫자 차이 0(같은 테이블). SSOT 이원화 → 향후 규칙 변경 시 오너 재무·정산 화면 불일치 위험.
3. **수정** — `store_cash_position(p_store_id)` RPC 호출로 교체, TS 집계 함수는 사용처 0 이면 삭제.
4. **연동** — 수수료 의무 → `store_cash_position` → 오너 `/finance` = 오너 `/settlements` = 관리자 `/admin/store-settlements` 같은 값.
5. **검증** — vitest(라우트가 RPC 결과 매핑). 롤백 불요(읽기).
6. **보존** — 응답 필드명 유지.
7. **운영 데이터·정산** — 없음.
8. **Owner 결정** — 없음.

---

## 5-B. 플랫폼 보유분·Coin (커밋 묶음 2-B · 배포 DB+웹)

### FIN-03 (=GFT-03) · 플랫폼 보유분(상품권·플랫폼 쿠폰) 지급 경로 3곳 모순
`배포: DB+웹(+설정 env 확인) · 심각도: P1 · 증명: 코드·데이터 PROVEN ✓ / env 값 NOT_PROVEN · 선행: FIN-10`

1. **원인** — ① Coin 적립 = 상품권 **총액**: `lib/currency/recognize-order-currency-on-completed.ts:36-41` ✓ `platformHeldSaleAmountPhp = gift_redemption_amount + platform_funded_amount`, env `DIBAY_CURRENCY_SALE_RECOGNITION_LIVE` 로만 활성. ② gift rail = **순액(90%)** REVENUE_AVAILABLE + "coin_mint: deferred_to_sale_coin", 그러나 현금화·전환 API 410. ③ `store_platform_payable_page` 는 상품권을 `gift_rail`("여기서 지급 안 함")로 분류해 지급 의무에서 제외(`lib/stores/commission/store-commission-contract.ts:101-106` ✓). 플랫폼 쿠폰 ₱40 지급 수단 없음.
2. **영향** — 오너: 플래그 ON 이면 상품권 수수료 10% 를 돌려받고(플랫폼 손실) gift rail 잔액은 "지급 예정" 으로 남아 이중 지급 착시, OFF 면 상품권·플랫폼 쿠폰 금액을 받을 경로 없음(매장 손실). 관리자: 지급 책임 불명. 주문자: 없음.
3. **수정** — D-2 권장안(Coin 단일) 기준 설계: 민팅액 = Σ gift `merchant_net_amount` + `platform_funded_amount`(`platformHeldSaleAmountPhp` 를 redemption 순액 조회로 변경), 민팅 시 gift ledger 에 `CONVERTED_TO_COIN` 소진 행 기록(같은 TX — 민팅 RPC `credit_coin_from_confirmed_sale` 내부), `store_platform_payable_page` 의 `gift_rail` 분류를 "Coin 지급분" 으로, Coin 역분개(`reverse_coin_credits_for_order`) 금액도 순액 기준. 대안(B, gift rail 단일)은 D-2 결정 시 별도.
4. **연동** — 주문자 상품권 결제 → 주문 완료(오너 완료/자동확정) → gift 매출 인식 트리거 + Coin 민팅(순액) → 오너 `/finance` Coin = 관리자 지급 의무 화면(같은 SQL) → 오너 Coin 출금 → 관리자 지급(`coin_withdrawal_mark_paid`). 환불 시 같은 금액 역분개(2-C).
5. **검증** — 롤백 트랜잭션: 상품권 1,000 주문 완료 → Coin 900, gift ledger 소진 900, payable 항등식(직접 수령 + Coin 지급분 + payable = 매출). vitest `recognize-order-currency-on-completed`. `verify:currency-ssot-hard-lock`, `verify:gift-certificate-hard-lock`, `verify:three-currency-product`.
6. **보존** — 상품권 이중 사용 잠금·redemption 스냅샷 불변. COIN ≠ CASH ≠ POINT 분리 불변. env 플래그 이름 불변.
7. **운영 데이터·정산** — gift rail 잔여 10,700·쿠폰 ₱40·과거 Coin 은 **정리 안 함(D-5)** — 새 규칙은 반영 이후 완료 주문부터. 오너 Coin 증가 속도가 바뀌므로(총액→순액) 오너 고지 문구 필요(화면 안내 — 결정 아님).
8. **Owner 결정** — 기존 **D-2**(지급 레일 선택) — **차단**. 이 블록은 D-2 결정 전 구현하지 않는다. 함께 확인: env `DIBAY_CURRENCY_SALE_RECOGNITION_LIVE` 현재 값(Vercel 조회는 Owner/작업자 — 설정 변경 아님).

### GFT-02 · Coin 과다 발행(구매자 직접결제액 포함) 9건 8,750 — 데이터 정리 안 함, 재발 감지만
`배포: DB · 심각도: 원 P1 → D-5 적용 후 잔여 P3(재발 감지 부재) · 증명: 운영 PROVEN · 선행: FIN-03`

1. **원인** — 2026-09-01~09-15 당시 코드가 `payment_amount` 까지 민팅. 현 코드는 수정됨(`recognize-order-currency-on-completed.ts:36-41` ✓ gift+platform_funded 만). 남은 결함 = 민팅 금액 상한을 DB 가 강제하지 않고 무결성 보고도 검사하지 않음.
2. **영향** — 과거 9건: 오너 Coin 과다(출금 가능) — **D-5 로 회수 안 함**. 재발 시 감지 수단 없음 → 관리자 모름.
3. **수정** — **데이터 정리 안 함 — 코드 결함(재발 방지)만 수정**: ① 민팅 RPC `credit_coin_from_confirmed_sale` 에 상한 가드(민팅액 ≤ FIN-03 확정 산식 값, 초과 시 `coin_mint_exceeds_platform_held` 예외) ② 무결성 보고에 I-COIN(주문별 `sale_coin` ≤ 산식) 추가, 기준 이전 9건은 `legacy_preserved`(R-D5).
4. **연동** — 주문 완료 → 민팅 RPC(상한 검사) → 오너 Coin → 관리자 무결성 보고(신규 위반 0) → 이상 시 FIN-08 정정 수단.
5. **검증** — 롤백 트랜잭션: 산식 초과 민팅 호출 → 예외. 무결성 보고에서 9건 `legacy_preserved`, 신규 0.
6. **보존** — 정상 민팅 경로 불변.
7. **운영 데이터·정산** — **8,750 Coin 정정·회수 0(D-5)**.
8. **Owner 결정** — 없음 (D-5 로 확정).

### FIN-13 · 수수료 기준액에 배달비·상품권 포함 — 문서 미기재
`배포: 문서(+정책 결정 시 DB) · 심각도: P3 · 증명: SQL PROVEN · 선행: 없음`

1. **원인** — 기준액 = `payment_amount + gift_redemption_amount + platform_funded_amount`(운영 `store_commission_charge_order_internal`), `payment_amount` 는 배달비 포함. 상품권 사용분은 gift 수수료 10% + 판매 수수료 7% = 17%. SSOT 문서에 미기재.
2. **영향** — 오너: 수수료 산식을 문서로 확인 불가 → 이의. 관리자: 설명 근거 없음. 주문자: 없음.
3. **수정** — **현행 산식을 그대로 `docs/store-commission-cash-settlement-ssot.md` 에 명시**(코드·DB 변경 0). D-3 결정으로 산식이 바뀌면 트리거 함수 변경(D-1: 변경 시점 이후 의무만, 소급 없음).
4. **연동** — 조리 진입 → 트리거 산식 → 의무 → 오너 정산 화면 내역(`store_commission_breakdown`) = 문서 → 관리자 동일.
5. **검증** — 문서 산식과 함수 본문 대조(리뷰). 문서만이면 코드 검증 생략(개발 프로세스 3번).
6. **보존** — 산식 불변.
7. **운영 데이터·정산** — 없음.
8. **Owner 결정** — 기존 **D-3**(배달비 포함·17% 유지) — 비차단(문서화는 현행 기준으로 진행).

---

## 5-C. 취소·환불 부수효과 원자화 (커밋 묶음 2-C · 배포 DB+웹)

### FIN-05 ⊃ ADS-21 ⊃ GFT-05(원자화) · 취소·환불 시 Coin 역분개·쿠폰 복원·상품권 복원이 상태 트랜잭션 밖, 실패는 로그만
`배포: DB+웹 · 심각도: P2 · 증명: 코드 PROVEN ✓ / 누락 건 NOT_PROVEN(운영 불일치 0) · 선행: 1-E ORD-06(취소 DB 함수), FIN-03(역분개 금액), FIN-10`

**병합 근거**: 세 결함 모두 `applyStoreOrderStatusTransition` 이 상태 CAS 커밋 **후** 금전 부수효과를 별도 RPC 로 호출하고 결과를 확인하지 않는 같은 구조다 — `lib/stores/apply-store-order-status-transition.ts` ✓ 환불 분기 `:425-430`(Coin 역분개, 실패 `console.error`), `:434-437`(쿠폰 복원, 결과 미검사), 취소 분기 `:446-449`(쿠폰), `:450-475`(상품권 `gift_certificate_cancel_order_restore`, 실패 로그). 보정 크론은 보고 전용(`lib/currency/reconcile-order-currency.ts:33` ✓ `RECONCILE_WRITE_MODE_APPROVED=false`)이고 쿠폰 항목 없음.

1. **원인** — 위. 상품권 환불만 `gift_certificate_refund_order_atomic` 으로 원자화(G10)되어 있고 나머지는 비원자.
2. **영향** — 주문자: 취소됐는데 쿠폰·상품권이 복원 안 됨(구매자 금전 손실). 오너: 환불 주문 Coin 이 회수되지 않고 출금 가능(플랫폼 손실). 관리자: 불일치를 알 수단 없음(로그만).
3. **수정** — 원칙: **종료 전이(cancelled/refunded)의 금전 부수효과는 상태 UPDATE 와 같은 DB 트랜잭션**.
   - 환불: `gift_certificate_refund_order_atomic` 안에서 `reverse_coin_credits_for_order(p_order_id, 'coin_reversal:order:'||id, 'order_refund')`·`restore_store_coupon_entitlement(p_order_id, true)` 호출(멱등 키 기존과 동일) → TS 호출 제거.
   - 취소: 1-E 의 `store_order_owner_cancel_atomic`·`store_order_cancel_request_decide_atomic` 과 구매자 접수 전 취소·SYSTEM 취소(ORD-03 accept_timeout·payment_failure)가 공통으로 쓰는 `store_order_apply_cancel_side_effects(p_order_id)`(내부 전용, DEFINER)를 신설 — 쿠폰 복원 + 상품권 cancel restore + DLV-02 ③ 배달 행 종료 — 각 취소 함수가 상태 UPDATE 직후 같은 TX 에서 호출. TS 의 `:446-475` 제거.
   - 재고 복원(`restore_store_order_stock_atomic`)은 Recovery Chain HARD LOCK 계약상 claims 테이블로 이미 멱등 — 이번에는 TS 유지(범위 고정), 실패 시 기존 recovery 경로.
   - GFT-05 의 **만료 후 복원 처리**(만료된 상품권을 ACTIVE 로 복원하면 `gift_expired` 로 사용 불가)는 D-20 결정 사항 → 결정 전 기본: 현행(그대로 복원) 유지 + 복원 시 `valid_until < now()` 이면 이벤트에 `restored_expired=true` 표기(관리자 확인용).
4. **연동** — 주문자 취소/관리자 환불 → 취소·환불 DB 함수(상태+쿠폰+상품권+Coin+배달 행 1 TX, 수수료 트리거 동일 UPDATE) → 오너 주문 목록 cancelled/refunded + Coin 원장 역분개 → 관리자 주문 상세·Coin·쿠폰 화면 일치 → 주문자 쿠폰함·상품권함 복원 + 알림.
5. **검증** — 롤백 트랜잭션: ① 정상 환불 → 상태·REVERSAL·쿠폰 available 동시 ② 쿠폰 복원 강제 실패 → 상태 롤백 ③ 취소 → 상품권 restore + 쿠폰 + 배달 행 동시. vitest: TS 가 더 이상 개별 RPC 를 부르지 않음. `verify:gift-certificate-hard-lock`, `verify:currency-ssot-hard-lock`, `verify:store-order-recovery-integrity`.
6. **보존** — 각 RPC 의 멱등 키·결과 의미 불변(호출 위치만 이동). 상품권 이중 사용 잠금 불변. 쿠폰 체크아웃 잠금 불변. 알림은 TS 에서 커밋 후(기존).
7. **운영 데이터·정산** — 현재 취소·환불 주문의 미복원 0 → 데이터 변경 없음. 수수료 환급은 여전히 관리자 결정 함수로만(AGENTS).
8. **Owner 결정** — 없음(원자화). 만료 후 복원분 처리는 기존 **D-20**(비차단, 현행 유지).

### ADS-25 · 쿠폰 복원 시 사용 이력 삭제 · 종료 캠페인 예산 재가산
`배포: DB · 심각도: P3 · 증명: 코드(운영 함수) PROVEN · 선행: FIN-05⊃ADS-21 (같은 함수를 같은 마이그레이션에서)`

1. **원인** — `restore_store_coupon_entitlement`(저장소 최신 `supabase/migrations/20270421120300_finance_ssot19_d2_gift.sql`, 운영 원문 대조)이 `DELETE FROM store_coupon_redemptions WHERE order_id=…`, 캠페인 상태와 무관하게 `reserved_spend_php` 가산, 상태를 `restored` 가 아닌 `available` 로(enum `restored` 미사용).
2. **영향** — 관리자: 쿠폰 사용·복원 감사 추적 소실, 종료 캠페인 예산 지표 왜곡. 오너: 캠페인 성과 수치 부정확. 주문자: 복원 쿠폰 사용 가능(정상).
3. **수정** — redemption 행 DELETE 대신 `reversed_at`·`reversed_reason` 마킹(UNIQUE `buyer_user_id, campaign_id` 는 `WHERE reversed_at IS NULL` 부분 인덱스로 교체 — 재사용 허용 유지), 예산 재가산은 캠페인 `lifecycle_state='active'` 일 때만, 엔타이틀먼트 상태 `restored`(claim 시 `available` 과 동일 취급하도록 claim 조건에 포함).
4. **연동** — 주문 취소 → 쿠폰 복원(이력 보존) → 구매자 쿠폰함 재사용 가능 → 오너 쿠폰 운영 화면(사용/복원 건수) → 관리자 쿠폰 감사.
5. **검증** — 롤백 트랜잭션: 복원 후 redemption 행 존재(`reversed_at` 값), 같은 구매자 재사용 성공, 종료 캠페인 예산 불변.
6. **보존** — 쿠폰 체크아웃 잠금·1회 사용 규칙(활성 행 기준) 불변. ADS-24(`max_uses_per_user`)와 무관하게 현행 1 유지.
7. **운영 데이터·정산** — 과거 삭제 이력 복구 안 함(D-5). 인덱스 교체는 기존 행에 영향 없음(현재 전부 미역처리).
8. **Owner 결정** — 없음.

---

## 5-D. 상품권 (커밋 묶음 2-D · 배포 DB+웹)

### GFT-01 · 상품권 사용 역처리 함수에 주문 상태 가드 없음 (미취소 7주문 역처리 — 데이터 정리 안 함)
`배포: DB · 심각도: 원 P1 → D-5 적용 후 잔여 P2(재발 가능 경로) · 증명: 운영 데이터 PROVEN / 호출 주체 NOT_PROVEN · 선행: FIN-10`

1. **원인** — `gift_certificate_redemption_reverse(p_order_id)` 에 주문 상태 가드 없음 — 래퍼(`gift_certificate_cancel_order_restore`, `gift_certificate_refund_order_atomic`)만 가드. service_role 직접 호출로 진행 중 주문의 상품권 사용이 역처리됨(2026-09-17 6건 + 08-28 1건).
2. **영향** — 주문자: 상품권 복원 + 음식 수령(재발 시). 오너: 상품권 매출 없이 음식 제공(매장 손실). 관리자: 주문 결제액과 상품권 원장 불일치.
3. **수정** — **데이터 정리 안 함 — 코드 결함(재발 방지)만 수정**: 함수 첫 단계에 `SELECT … FROM store_orders WHERE id=p_order_id FOR UPDATE` + 상태가 `cancelled`/`refunded`(또는 `payment_status='failed'`)가 아니면 `{ok:false, error:'order_not_terminal'}` 반환. 래퍼는 상태 UPDATE 이후 같은 TX 에서 호출하므로 통과(FIN-05 의 원자화와 순서 정합 확인). `REVOKE EXECUTE … FROM service_role` 후 래퍼만 호출 가능하게 하는 안은 TS 직접 호출처 grep 결과 0 이면 함께 적용(방어 이중화).
4. **연동** — 주문자 상품권 결제 → 진행 중 → (오남용 호출) 역처리 거부 → 오너 매출 보존 → 관리자 상품권 원장 일치. 정상 취소·환불 → 래퍼 경유 역처리 성공.
5. **검증** — 롤백 트랜잭션: pending 주문에 직접 호출 → `order_not_terminal`; cancelled 주문 → 성공. 감사 SQL(역처리 & 미취소)이 **신규 0**(기존 7건은 그대로 — D-5).
6. **보존** — 래퍼 2개 동작·멱등 불변. 상품권 이중 사용 잠금 불변.
7. **운영 데이터·정산** — **7주문 정리·재차감·취소 0(D-5)**. 단 7건은 `pending` 이므로 병행 ORD-03 `accept_timeout` 대상에서 제외되어야 한다(§0-3 5번 — 보고).
8. **Owner 결정** — 없음 (D-5 로 데이터 처리 확정).

### GFT-04 · 1회 전액 소멸 정책인데 결제 화면에 소멸 고지 없음
`배포: 웹 · 심각도: P2 · 증명: 코드 PROVEN ✓ / 화면 NOT_PROVEN · 선행: 없음`

1. **원인** — `create_store_order_atomic` 이 `v_gift_forfeited := remaining - used` 후 FULLY_REDEEMED. 장바구니 패널 `components/stores/cart/StoreCartGiftApplyPanel.tsx:184-195` 는 "이번 주문 사용 ₱X" 만 표시, 소멸액 경고는 사용 후 상세(`OwnedGiftInstanceDetailView.tsx:262`)에만.
2. **영향** — 주문자: ₱1,000 상품권으로 ₱300 주문 시 ₱700 소멸을 모르고 결제 → 분쟁·환불 요청. 오너: CS. 관리자: 민원.
3. **수정** — 적용 미리보기에 `computeCheckoutGiftApplyPreview` 소멸액 표시 + 소멸 > 0 이면 확인 모달(동의 후 적용, 시트 오버레이 계약). i18n ko/en.
4. **연동** — 주문자 장바구니 상품권 적용 → 소멸 미리보기·동의 → 체크아웃 → RPC(서버 재계산, 정책 불변) → 오너 주문 상세 상품권 사용액 → 관리자 상품권 원장 소멸 기록 일치.
5. **검증** — vitest: 소멸 > 0 일 때 모달 표시, 0 이면 생략. `verify:store-cart-sheet-contract`, `verify:gift-certificate-hard-lock`.
6. **보존** — 전액 소멸 정책·RPC 불변(표시만).
7. **운영 데이터·정산** — 없음.
8. **Owner 결정** — 기존 **D-20**(소멸분 귀속 회계) — 고지 UI 는 비차단.

### GFT-06 · 오너 상품권 revenue API 가 아카이브 지갑(store_cash_*) 조회
`배포: 웹 · 심각도: P3 · 증명: 코드 PROVEN ✓ · 선행: 없음`

1. **원인** — `app/api/me/stores/[storeId]/gift-certificates/revenue/route.ts:41-50, 80, 107` ✓ `storeCashAccounts`·`storeCashLedger`·recovery obligations 조회·반환. 오너 UI 는 호출하지 않음. `dibay-gift-certificate-hard-lock.md` "archive-only … no active reader" 위반.
2. **영향** — 현재 화면 영향 없음. 향후 소비자가 붙으면 아카이브 잔액을 현행 잔액으로 오표시.
3. **수정** — 아카이브 필드 제거, `gift_certificate_revenue_ledger` 기반 값만 반환(소비자 0 확인 후 라우트 자체 410 도 가능 — grep 으로 호출처 0 이면 410).
4. **연동** — 오너 상품권 운영 화면(`OwnerGiftMoneyOpsPanel` — finance/redemptions/promo 사용) 불변 → 관리자 상품권 화면 불변.
5. **검증** — vitest/grep: 응답에 `storeCash*` 키 없음. `verify:gift-certificate-hard-lock`.
6. **보존** — 사용 중인 상품권 라우트 불변.
7. **운영 데이터·정산** — 없음.
8. **Owner 결정** — 없음.

### GFT-07 · 상품권 구매 멱등키가 사용자 비스코프(전역)
`배포: DB · 심각도: P3 · 증명: 코드(운영 함수) PROVEN · 선행: FIN-10`

1. **원인** — `gift_certificate_purchase`(저장소 `20261129230000_gift_certificate_purchase_mall_visible_gate.sql`, 운영 대조) unique_violation 처리에서 `related_id = v_key` 로 기존 인스턴스를 찾아 반환 → 다른 사용자 키와 충돌하면 **그 사용자의 인스턴스 정보** 반환 + 본인 미차감 "성공".
2. **영향** — 주문자: (충돌 시) 타인 상품권 번호 노출·본인 구매 실패를 성공으로 표시. 키가 클라 UUID 라 실확률 낮음.
3. **수정** — 함수 내부 키를 `buyer_user_id || ':' || p_idempotency_key` 로 스코프, 충돌 조회도 같은 사용자로 한정. 기존 행 키 형식은 그대로(신규부터).
4. **연동** — 주문자 상품권 구매(POINT 차감) → 인스턴스 생성 → 상품권함 → 매장 사용 시 redemption. 오너·관리자 화면 무관.
5. **검증** — 롤백 트랜잭션: 사용자 A·B 같은 키 → 각자 인스턴스 생성, A 재시도 → A 인스턴스 반환.
6. **보존** — 같은 사용자 재시도 멱등 불변. POINT 차감 원장 불변.
7. **운영 데이터·정산** — 기존 키 무변.
8. **Owner 결정** — 없음.

### GFT-08 · 상품 `issued_count` 와 실제 인스턴스 수 불일치 1건 — 데이터 정리 안 함
`배포: DB(검사만) · 심각도: P3 · 증명: 운영 PROVEN / 원인 NOT_PROVEN · 선행: 없음`

1. **원인** — 1개 상품의 카운터 불일치. 관리자 직접 발행·삭제 이력 추정(원인 NOT_PROVEN). `max_issuance` 초과는 0.
2. **영향** — 관리자: 발행 수 표시 오차. 발행 한도 판정이 카운터 기반이면 한도 계산 오차(현재 초과 0).
3. **수정** — **데이터 정리 안 함(D-5)**. 원인이 증명되지 않았으므로 코드 수정 대신 무결성 검사 추가(카운터 = 인스턴스 수, 기준 이전 1건 `legacy_preserved`) — 신규 불일치가 나오면 그때 작성 경로를 특정해 수정.
4. **연동** — 관리자 상품권 상품 화면 발행 수 → 무결성 보고.
5. **검증** — 검사 SQL 신규 0.
6. **보존** — 발행 RPC 불변.
7. **운영 데이터·정산** — 1건 그대로.
8. **Owner 결정** — 없음.

---

## 5-E. 쿠폰 비용 분할 (커밋 묶음 2-E · 배포 DB)

### ADS-22 · 쿠폰 비용 분할(store/platform funded)을 DB 가 재계산하지 않음
`배포: DB · 심각도: P3 · 증명: 코드·운영 PROVEN · 선행: 1-J 주문 RPC 마이그레이션(같은 함수 — 그 위에서 재정의), FIN-10`

1. **원인** — `create_store_order_atomic` 이 payload 의 `store_funded_amount`/`platform_funded_amount` 를 그대로 저장(할인액은 재계산하나 분할은 미검증). Coin 보전액이 `platform_funded_amount` 를 쓰므로(`recognize-order-currency-on-completed.ts:36-41`) 분할 오류가 Coin 민팅에 직결. 운영 분할합≠할인 2건(08-24 레거시 pending).
2. **영향** — 오너: 플랫폼 부담분 Coin 과소·과다. 관리자: 지급 의무 오차. 주문자: 결제액은 정상(할인액은 재계산).
3. **수정** — RPC 안에서 캠페인 `funding_mode`·`store_funded_amount` 로 분할 재계산 → payload 와 다르면 서버 값 사용(거절 대신 교정 — 클라 값 불신 원칙). 쿠폰 주문 한정 CHECK `(coupon_id IS NULL) OR (store_funded_amount + platform_funded_amount = discount_amount)` `NOT VALID`(기존 2건 위반 → VALIDATE 생략, 신규만 강제 — D-5).
4. **연동** — 주문자 쿠폰 적용 → RPC 할인·분할 재계산 → `store_orders` → 완료 시 Coin 민팅(FIN-03 산식) → 오너 Coin = 관리자 payable.
5. **검증** — 롤백 트랜잭션: 조작 payload 분할 → 저장값이 캠페인 기준. `verify:store-order-create-atomicity`, `verify:delivery-product-hard-lock`.
6. **보존** — 할인액 재계산·쿠폰 잠금 불변.
7. **운영 데이터·정산** — 기존 2건 무변(D-5).
8. **Owner 결정** — 없음.

---

## 5-F. 레거시 정산·게이트 (커밋 묶음 2-F · 배포 웹(+DB))

### FIN-06 · TS 가 레거시 `store_settlements` 의 수수료 환급액·상태를 계속 수정
`배포: 웹 · 심각도: P2 · 증명: 코드 PROVEN ✓ · 선행: NTF-05(같은 파일)`

1. **원인** — 환불 시 `adjustStoreSettlementOnRefund`(`lib/stores/adjust-store-settlement-on-refund.ts:92-139`)가 `commission_reversal_amount`·`net_settlement_amount`·`settlement_status` 기록, 취소 시 `cancelScheduledSettlementForOrder`(`lib/stores/cancel-store-settlement.ts:12-15`). 호출 `apply-store-order-status-transition.ts:419-423, 445` ✓. 생성 writer 는 꺼져 있음(`lib/stores/ensure-store-settlement.ts:18` ✓ `LEGACY_STORE_SETTLEMENT_WRITER_ENABLED=false`). SSOT §0-2 A·AGENTS "TS 에서 수수료 금액을 쓰거나 되돌리지 않는다" 위반.
2. **영향** — 관리자: 수수료 환급 숫자가 레거시 스냅샷과 `store_commission_adjustments` 두 곳에 다르게 생김. 돈은 안 움직임. 오너·주문자: 없음.
3. **수정** — 두 호출을 `LEGACY_STORE_SETTLEMENT_WRITER_ENABLED` 가드 아래로(=실행 안 됨). 함수 파일은 FIN-07 후 사용처 0 이면 삭제. 레거시 표시는 읽기 전용 유지.
4. **연동** — 환불·취소 → 상태 전이(레거시 스냅샷 무변) → 수수료 환급은 트리거 검토 → 관리자 결정 함수 → 오너·관리자 정산 화면(같은 SQL).
5. **검증** — vitest: 환불·취소 시 두 함수 미호출. `admin-delivery-r4c-fees-settings-contract.test.ts` 회귀.
6. **보존** — 수수료 환급 원장 경로 불변. 레거시 조회 화면 불변.
7. **운영 데이터·정산** — 레거시 501건 무변(D-5).
8. **Owner 결정** — 없음.

### FIN-07 · 관리자 일별·매장 재무제표·수수료 정책 개요가 레거시 스냅샷을 수치 원천으로 사용
`배포: 웹 · 심각도: P2 · 증명: 코드 + 운영 집계(10건) PROVEN · 선행: FIN-06, FIN-11`

1. **원인** — 일별 재무제표 `lib/finance/daily-statement/load-daily-statement.ts:59-73`, 매장 재무제표 `lib/admin/store-financial-statement/load-store-financial-statement.ts:176-185`, 정책 개요 `app/api/admin/store-fee-policies/overview/route.ts:305-311`, 재무 관제 `lib/admin/finance-control-plane/load-finance-control-plane.ts:567-588` 이 `store_settlements`(09-15 이후 정지) 기반 → 신규 완료 10건 누락. 레거시 API `/api/me/store-settlements`·`/api/admin/store-settlements` GET 은 UI 소비자 없이 생존.
2. **영향** — 관리자: 신규 주문이 재무제표에서 빠지고 수수료가 실제 부과(obligation)와 다르게 표시 → 재무 판단 오류. 오너: 없음(오너는 SSOT 화면).
3. **수정** — 주문·매출 = `store_orders`(완료, Asia/Manila 일자 — 표시 단계 변환, DB UTC 유지), 수수료 = `store_commission_breakdown`(오너·관리자 정산과 같은 SQL), 정책 개요 = `store_sale_fee_obligations.fee_snapshot`. 레거시 API 2개 410(소비자 0 grep 확인).
4. **연동** — 주문 완료·조리 진입 → 의무 원장 → 관리자 일별·매장 재무제표 = `/admin/store-settlements` 원장 합 = 오너 정산 화면.
5. **검증** — 같은 매장·기간 재무제표 수수료 합 = 원장 합(운영 읽기 전용 대조). vitest 로더 단위.
6. **보존** — 화면 컬럼·레이아웃 유지(원천만 교체). 레거시 501건은 "레거시(지급 의무 아님)" 별도 섹션 표시 유지.
7. **운영 데이터·정산** — 데이터 변경 없음. 관리자 숫자가 정상화로 바뀜(사전 고지 문구).
8. **Owner 결정** — 없음.

### FIN-15 · 주문 생성 차단 게이트 이원화 (`point_commerce_blocked` 잔존)
`배포: DB · 심각도: P3 · 증명: 운영 정의 PROVEN · 선행: 1-J·2-E 주문 RPC 마이그레이션(같은 함수, 순차)`

1. **원인** — `create_store_order_atomic` 에 레거시 `stores.point_commerce_blocked` 검사 잔존 + 신규 캐시 게이트 트리거(`trg_store_orders_cash_order_gate`). 레거시 플래그 작성 경로 없음, 현재 true 0곳. (P0-1 로 오너 직접 쓰기도 막혀 플래그는 이제 관리자 service_role 만 바꿀 수 있음.)
2. **영향** — 관리자: 차단 원인이 두 곳 → 운영 혼선. 오너·주문자: 현재 영향 0.
3. **수정** — RPC 에서 레거시 검사 제거(캐시 게이트 단일). 컬럼은 남김(관리자 화면 표시 사용처 grep 후 제거는 별건).
4. **연동** — 주문자 체크아웃 → RPC → 캐시 게이트 트리거(OFF 유지, D-21) → 오너 주문 수신.
5. **검증** — 롤백 트랜잭션: 플래그 true 매장 주문 → 성공(게이트 OFF), 게이트 ON(트랜잭션 내 설정) + 미납 → 거부. `verify:store-order-create-atomicity`.
6. **보존** — 캐시 게이트 동작 불변.
7. **운영 데이터·정산** — true 0곳 → 영향 없음.
8. **Owner 결정** — 없음.

---

## 6. 커밋·반영 계획 (도메인 1개 = main 1회)

| 순서 | 커밋 묶음 | 포함 | 배포 | 운영 DB 승인 필요 | 선행 |
|---|---|---|---|---|---|
| 1 | 1-D 권한·DB 방어 | N-1, N-3, N-2, N-4A, N-5 | DB | 예(권한·트리거·정책) | 없음 |
| 2 | 1-G 정보 노출 | ORD-07⊃DLV-04 | DB+웹 | 예(스냅샷 함수 3) | 없음 |
| 3 | 1-J 상품 | PRD-04, PRD-03, PRD-05, PRD-06, PRD-07, PRD-09, OPS-02⊃PRD-08 | 웹+DB | 예(CHECK·컬럼·주문 RPC·복원 함수 — HARD LOCK reopen) | 없음 |
| 4 | 1-E 주문 원자성 | ORD-04, ORD-06, ORD-09, NTF-05, ORD-10, ORD-11 | DB+웹 | 예(취소 함수 2) | 병행 1-A/1-B 반영 |
| 5 | 1-F 배달 | DLV-01, DLV-02 | DB+웹 | 예(CHECK) | 4, 병행 ORD-02 |
| 6 | 1-H 알림 | NTF-03, NTF-04, NTF-02 | 웹 | 아니오 | 병행 ORD-02/03, 5 |
| 7 | 1-I 매장 계약 | ACC-06, ACC-04 (ACC-05 기능은 D-17 후) | 웹 | 아니오 | 병행 1-B, 1 |
| 8 | 2-0 | FIN-10 | DB 메타+문서 | 예(메타) | — |
| 9 | 2-A 캐시 | FIN-02, FIN-12, FIN-04⊃IA-22, FIN-08, FIN-11 (+N-4B charge_requests) | DB+웹 | 예 | 8 |
| 10 | 2-C 원자화 | FIN-05⊃ADS-21⊃GFT-05, ADS-25 | DB+웹 | 예 | 4, 8 (FIN-03 이후면 역분개 금액 순액) |
| 11 | 2-D 상품권 | GFT-01, GFT-04, GFT-06, GFT-07, GFT-08 | DB+웹 | 예(GFT-01·07) | 8 |
| 12 | 2-E | ADS-22 | DB | 예(주문 RPC) | 3, 8 |
| 13 | 2-F 레거시 | FIN-06, FIN-07, FIN-15 (+N-4B store_settlements) | 웹+DB | 예(FIN-15·N-4B) | 9, 12 |
| 보류 | 2-B | FIN-03(=GFT-03) → GFT-02, FIN-13(문서는 즉시 가능) | DB+웹 | 예 | **D-2 결정** |
| 보류 | 1-I | ACC-05 기능 | 웹+DB | 예 | **D-17 결정** |

주문 RPC(`create_store_order_atomic`) 재정의는 3 → 12 → 13 순으로 3회(도메인 분리 원칙 때문). 각 회차는 직전 운영 원문을 기준으로 한다(R-DB-1). 횟수를 줄이려면 ADS-22·FIN-15 를 3번 커밋에 넣을 수 있으나 "다른 도메인 혼합 금지" 에 걸리므로 택하지 않았다.

## 7. 남은 위험 (이 설계 기준)

1. **운영 드리프트**: 저장소에 없는 운영 정책·함수(OPS-06 정책, `internal.is_admin_user`, 미기록 마이그레이션) — FIN-10 을 먼저 하지 않으면 2단계 함수 교체가 운영 원문을 덮어쓸 수 있다.
2. **D-2 미결**: FIN-03 이 막히면 2-C 의 Coin 역분개 금액(총액/순액)과 GFT-02 상한 산식도 임시값으로 남는다 → 2-C 는 "역분개 = 민팅된 원장 금액 그대로 반대 기입" 으로 설계해 산식과 독립시켰다(현 `reverse_coin_credits_for_order` 동작과 동일).
3. **Realtime 컬럼 노출(ORD-07 2차)**: 구매자 직접 SELECT·Realtime 경로는 이번 1차로 닫히지 않는다(NOT_PROVEN, 별도 실측 설계).
4. **병행 ORD-03 과 GFT-01 7주문** 겹침(§0-3 5번) — 병행 작업 결과 확인 필요.
5. 화면 실측 PASS 0 — 모든 블록의 화면 확인은 Owner·작업자 실측 전까지 NOT_PROVEN.
