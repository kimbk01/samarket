# 문서 K — 배달 오너 감사 결함 최종 대조 (2026-10-21 PHT)

- 대상: 문서 D 120건(중복 통합 후) + 추가 발견 9건(N-4B · N-5 · J-1 · J-2 · J-3 · X-1 · X-2 · X-3 · X-4).
- 기준: main `e8664fb6` + 최종 수정 `0e9b50ff`(J-1·J-2·J-3·X-1) + 최종 마무리 `dd98ff10`·`23786c52`(X-3·VALIDATE·PRD-16·검사 오탐) + FIN-10 검사 `18f7381c`.
- 근거 원천: 단계 커밋(아래 SHA), 결함 ID 를 인용하는 테스트(`lib/ app/ components/ supabase/tests/`), 마이그레이션 `2027060*`, 문서 G·G-1·G-2·H·I·J, 오늘 운영 DB 읽기 전용 확인 결과(재조회 안 함).
- 이 문서는 대조만 한다. 코드·DB 변경 0.

## 0. 판정 기준

| 상태 | 기준 |
|---|---|
| **해결** | main 에 코드·DB 변경이 들어갔고, 자동 테스트(L1)·격리 DB 스위트(L2 로컬 PG16)·운영 읽기 전용 확인(L4·적용 md5) 중 하나 이상이 결함의 결정적 지점을 증명 |
| **미증명(NOT_PROVEN)** | 변경은 main 에 있으나 결정적 증거가 화면 실측(L5)·브라우저 e2e(L3)·운영 실행 기록·실트래픽 층에 있음 — 그 층을 표기 |
| **제외** | 결함이 아니거나(미사용 기능·사업 정책) 지시로 정리 대상에서 뺀 과거 데이터 |
| **미해결** | 변경 없음, 또는 결정으로 보류(D-5 데이터 정리 미승인, D-17 등 Owner 결정 대기), 또는 범위 밖 |

엄격 적용: 화면에서 보이는 결함을 단위 테스트(RTL 포함)만으로 확인했으면 **미증명(L5)**. 서버·계약·DB 결함만 L1/L2 로 해결 판정했다.

## 1. 집계 (최종 마무리 + 샤오미 실기기·Production 확인 반영 2026-10-21 PHT)

- Production: `b1d822127` READY(`samarket.vercel.app`, Cursor 확인) · 운영 `sla_scan` 하트비트 20:45 PHT `vercel_cron` — 문서 L A 단계 PASS.
- 실기기(샤오미 1.2.4 (7), 오너 계정): IA-07·08·09·10·11·12·13·14·16·17·21·23·OPS-04 PASS → 해결 13건 전환. IA-20 은 실기기 FAIL(안드로이드 뒤로가기로 드로어 미닫힘) → 코드 수정 후 재실측 대기.

| 구분 | 해결 | 미증명 | 제외 | 미해결 | 합계 |
|---|---|---|---|---|---|
| P0 | 5 | 0 | 0 | 0 | 5 |
| P1 | 13 | 3 | 0 | 0 | 16 |
| P2 | 33 | 7 | 1 | 0 | 41 |
| P3 | 52 | 6 | 0 | 0 | 58 |
| **감사 결함 소계 (문서 D)** | **103** | **16** | **1** | **0** | **120** |
| 추가 발견 (N-4B · N-5 · J-1~3 · X-1~4) | 8 | 0 | 1 | 0 | 9 |
| **전체** | **111** | **16** | **2** | **0** | **129** |

- **미증명 16건** = 개발·자동 검증 완료, 실측 층만 남음: IA-20 재실측 1(실기기 FAIL → 수정 반영) · 오너 화면 중 대상 데이터·저장·미승인 매장이 필요한 것 7(IA-06·IA-15 확인창, PRD-12·PRD-13, LOC-007, IA-01·IA-02) · 관리자·주문자 화면 4(ACC-04·LOC-011·DLV-01·GFT-04) · 운영 크론 실행 기록 3(ORD-02·ORD-03·DLV-03 — 기준 이후 주문 0건) · 실트래픽 1(NTF-04).
- **제외 2건**: ACC-05(서류 심사 의무화는 사업 정책 — 기존 승인 절차 결함 아님, §9 최소 설계) · X-2(라이더 기능 운영 미사용 — 라이더 0명).
- **미해결 0건** — 개발 결함은 모두 해결. X-4 는 운영 누락분만 최소 보완 적용(`1380b9159`).
- 과거 데이터 **제외**(D-5, 해결 판정과 별개): GFT-02 Coin 11건 · ADS-01 ₱480 4건 · GFT-01 7주문 · FIN-08 −₱225 · GFT-08 1건 · LOC-005 9매장 · DLV-02 1건 · PRD-16 과거 고아 파일.
- 화면 실측(L5)·L3 는 전 구간 미실행 — 해결 판정 행에도 화면 확인은 포함되지 않는다.

## 2. 약어

커밋: `816b00fa` P0 · `04623692`(=`dafa4371`) 1-A · `b3d5e837`(=`0d7d1c1f`) 1-B · `1f8a4c35`/`5cae6ca9` 1-E·F·H · `2788457d`/`031a55b8` 1-G · `2f50fe5e`/`a541d329` 1-J · `bc179a4d` 1-I · `661924df` 1-D · `99735be3` 2-0 · `6f8d135c` 2-A · `7ab4f8bd` 2-B · `e2a0b1e7` 2-C · `a1f286d9` 2-D · `cf1a3a88` 2-E/F · `c64de134` 3-A · `e649c0bb` 3-RPC · `e61a9e9c` 3-B · `87364cce`/`515f2383` 3-C · `2f060663` 3-D1 · `872d89e4` 3-D2 · `4dc8b557` 3-E · `957a23cc` 4-1·4-7 · `27443a4e` 4-0·4-4 · `0199fc16` 4-2·4-3·4-5 · `909808af` 4 후속 · `5a175e09` 4-6 · `2ff823db` IA-13 · `c8386b68`/`5035f33d` 5단계 L1.

격리 DB(L2 로컬 PG16): `iso:<폴더>` = `supabase/tests/isolated/<폴더>/run.sh`.
운영 확인: `운영:적용md5` = 해당 마이그레이션 운영 적용·함수 md5 = 파일(문서 G·README) · `L4:I-n` = 문서 J 불변식(위반 0) · `운영:정책` = 7개 쓰기 정책 DROP 완료, `store_business_verifications`·`store_inquiries`·`user_addresses` 에 SELECT 정책만 남음.
테스트 경로 접두: `S1`~`S10` = `lib/stage5/__tests__/s0n-*.test.ts`, `G1` = `lib/stores/__tests__/apply-store-order-status-g1-stage1.test.ts`, `DN` = `lib/stores/__tests__/store-order-g1-stage1-delivery-notify.test.ts`, `P1J` = `app/api/me/stores/[storeId]/products/[productId]/__tests__/owner-product-patch-1j.route.test.ts`, `FB` = `components/business/owner/__tests__/owner-stage4-screen-feedback.test.tsx`, `NAV` = `lib/business/__tests__/owner-nav-registry-stage4.test.ts`, `RT4` = `lib/business/__tests__/owner-stage4-routes.test.ts`.

## 3. P0 (5)

| ID | 영역 | 상태 | 근거 (SHA · 테스트 · 운영 확인) | 남은 층 / 사유 |
|---|---|---|---|---|
| P0-1 (ACC-01=LOC-002) | 매장 직접 쓰기 | 해결 | `816b00fa` · `20270602100000` · `iso:p0` · 운영: authenticated UPDATE `permission denied`, service_role 쓰기 OK | 화면 L5 미측정(동작 무변경 경로) |
| P0-2 (PRD-02⊃ACC-02) | 상품 직접 쓰기 | 해결 | `816b00fa` · 같은 마이그레이션 · `iso:p0` · 운영 권한 실측 | — |
| P0-3 (LOC-001) | 배달 지역 IDOR | 해결 | `816b00fa` · `app/api/me/stores/[storeId]/delivery-service-areas/__tests__/owner-gate.route.test.ts`(타인 403·없는 매장 404) · S7 게이트 매트릭스 | — |
| P0-4 (PRD-01) | Storage 타 테넌트 삭제 | 해결 | `816b00fa` · `lib/stores/__tests__/store-owned-image-urls.test.ts`(6건) | — |
| P0-5 (FIN-01=ORD-01) | 수수료 트리거 | 해결 | `816b00fa` · `20270602100100` · 운영 `tgenabled='O'`(L4:I-7) · 롤백 실측(기준 이후 주문 의무 1건 ₱73) · L4:I-2 | I-1 대상 주문 0건 — 자연 트래픽 부과는 미관측 |

## 4. P1 (16)

| ID | 영역 | 상태 | 근거 | 남은 층 / 사유 |
|---|---|---|---|---|
| ORD-02 (⊃NTF-01) | 자동 구매확정·독촉 크론 | 미증명 | `04623692` · `vercel.json` 크론 등록 · S2(크론 due 1회·미도래 건너뜀·기준 이전 미대상) | 운영 크론 실행 기록 미확인 |
| ORD-03 | 미접수 자동 취소 | 미증명 | `04623692` · `lib/stores/__tests__/owner-lifecycle-and-write-gate.test.ts`(전이 그래프·범위) | 운영 크론 실행 기록 미확인. 과거 pending 54건은 D-5 로 미처리 |
| ORD-05 | 오너 목록 60건 한도 | 해결 | `04623692` · `20270602110000` · `lib/business/__tests__/merge-owner-store-order-list-rows.test.ts` · 운영 롤백 실측(미종료 61 전부 첫 페이지, 중복 0) | 「이전 주문 더 보기」 화면 L5 |
| IA-01 | 심사 중 매장 수정 불가 | 미증명 | `b3d5e837` · NAV(「onboarding routes stay open for pending」) | 가드·안내 띠·모달 경쟁은 화면 L5 |
| ACC-03 | 탈퇴 사장 매장 영업 | 해결 | `b3d5e837` · S7(withdraw → 비노출·판매권한 suspended·감사·삭제 라우트 호출) | 현재 해당 0 |
| PRD-03 | 반려 상품 재판매 | 해결 | `2f50fe5e`/`a541d329` · `20270602130000` · `iso:store-products-1j` · P1J · 운영:적용md5 | — |
| PRD-04 | 할인가 검증 | 해결 | 같은 커밋 · `app/api/admin/store-products/[productId]/__tests__/admin-store-product-1j.route.test.ts` · 운영 CHECK `convalidated=true` | — |
| LOC-003 | 배달 판정 fail-open | 해결 | `c64de134` · `lib/delivery/__tests__/loc-003-serviceability-fail-closed.test.ts` · S8 7진입점×8상태 56셀 | — |
| FIN-02 | 상계 멱등키 충돌 | 해결 | `6f8d135c` · `20270603110000` · `iso:stage2-2a`(운영 본문으로 재현 → 수정 후 2회 성공) · 운영:적용md5 | — |
| FIN-03 (=GFT-03) | 상품권 지급 레일 | 해결 | `7ab4f8bd` · `20270603120000`/`120100` · `iso:stage2-2b`(H 사례·이중 지급 동시성) · `lib/stores/commission/__tests__/stage2b-money-rails.test.ts` | 관리자 지급 폼 화면 L5 |
| FIN-04 (⊃IA-22) | 충전 증빙·멱등·자기 승인 | 해결 | `6f8d135c` · `20270603110100` · `iso:stage2-2a`(동시성 3종) · `lib/stores/advertising/__tests__/stage2a-cash-charge-fin04-fin08.test.ts` · S10 · 운영: 2인자 승인 함수 DROP 완료 | 출금 확인창 화면 L5. D-4(상한·수취 계좌) 설정값 미결 |
| ADS-01 | 광고 기간 잠식·미환불 | 해결 | `2f060663` · `20270604140000` · `iso:stage3-3d1` · 운영:적용md5 · L4:I-11 | 과거 미심사 4건 ₱480 은 D-5 로 미환불 |
| ADS-02 | 광고 가격 스냅샷 | 해결 | `2f060663` · `iso:stage3-3d1` · `lib/stores/advertising/__tests__/delivery-ad-stage3-3d1.test.ts` | — |
| ADS-03 | 파트너 반려 경합 | 해결 | `872d89e4` · `20270604150000` · `iso:stage3-3d2`(경합 4종) | — |
| GFT-01 | 상품권 역처리 가드 | 해결 | `a1f286d9` · `20270603140000` · `iso:stage2-2d`(67 단언) · L4:I-6 | 기존 7주문 정리는 D-5 로 미처리 |
| GFT-02 | Coin 8,750 과다 발행 | 해결 | 현재 발행 로직: `7ab4f8bd` 민팅 상한 · `iso:stage2-2b` · 운영 `store_commission_integrity_report` → `sale_coin_le_platform_coupon` 위반 0 (2026-10-21 재확인) | 과거 11건 `legacy_preserved` 는 **제외**(D-5 과거 테스트 데이터 — 정정·회수 안 함) |

## 5. P2 (41)

| ID | 영역 | 상태 | 근거 | 남은 층 / 사유 |
|---|---|---|---|---|
| IA-03 (⊃ADS-07·FIN-14) | 정지 매장 API 쓰기 | 해결 | `b3d5e837` · S7(19 라우트 × 상태 게이트 95건 + 통과 19건) · `owner-lifecycle-and-write-gate.test.ts` | 목록·검색 SQL 제외는 L3 |
| IA-02 | 가드 계정 단위 판정 | 미증명 | `b3d5e837` · `lib/delivery/owner/__tests__/owner-active-store-cut2-restoration.test.ts`(`stores[0]` 금지) | 선택 매장 기준 가드 화면 L5 |
| IA-04 (=ADS-20) | 쿠폰 부활·관리자 정지 재개 | 해결 | `87364cce` · `20270604130000` · `iso:stage3-3c` · `owner-coupon-transition-route.test.ts` · L4:I-12 | — |
| IA-05 | 쿠폰 재발행 중복 | 해결 | `87364cce`/`515f2383` · `iso:stage3-3c`(UNIQUE·같은 키 멱등) · `owner-coupon-transition-route.test.ts` | 확인창 busy 화면 L5 |
| ACC-04 | 반려 매장 재심사 경로 | 미증명 | `bc179a4d` · `20270602140100` · `iso:store-contract` · `app/api/admin/stores/[id]/__tests__/admin-store-reopen-reverify.route.test.ts` | 관리자 「재심사 열기」→오너 재제출 흐름 화면 L5 |
| ACC-05 | 사업자 서류 심사 | 제외 | 권한 부분은 N-3 로 해결(`661924df`, 운영:정책). 운영 확인: 승인 매장 17곳 모두 서류 없이 기존 승인 절차로 승인, `store_business_verifications` 0행 — 기존 승인 절차에 서류 단계가 없어 동작 결함 아님 | 서류 의무화는 사업 정책 결정(D-17). 최소 설계는 §9 |
| ACC-06 | 오너 변경 감사·재검증 | 해결 | `bc179a4d` · `lib/stores/__tests__/owner-store-update-audit.test.ts` · `owner-store-patch-audit-reverify.route.test.ts` · `iso:store-contract` | — |
| OPS-01 | `store_notices` 테이블 부재 | 해결 | `e61a9e9c` · `20270604120100` 운영:적용md5 · `iso:stage3-3b` · `notices/__tests__/store-notices-unavailable.route.test.ts` | 공지 작성 화면 L5 |
| OPS-02 (⊃PRD-08) | 오너 쓰기 캐시 세대 | 해결 | `bc179a4d`/`a541d329` · S1 · `menu-sections-1j.route.test.ts`(bump) | — |
| OPS-03 | 요일별·임시휴무 판정 | 해결 | `e61a9e9c` · `20270604120200` · `iso:stage3-3b`(fixture 89건) · `store-front-commerce-open-weekly-parity.test.ts` | 오너 편집기 화면 L5 |
| OPS-06 (=N-1) | 문의 원문 수정 RLS | 해결 | `661924df` · `20270602140000` · `iso:store-contract` · 운영:정책 | — |
| PRD-05 | 숨김 구역 상품 주문 | 해결 | `2f50fe5e` · `iso:store-products-1j` · `public-product-detail-1j.route.test.ts` | — |
| PRD-06 | 취소 복원이 수동 품절 해제 | 해결 | `2f50fe5e` · `iso:store-products-1j`(`sold_out_reason` 단언 10) · P1J | — |
| PRD-07 | 상품 PATCH 낙관적 잠금 | 해결 | `a541d329` · P1J(stale → 409) | — |
| PRD-09 | 오너 상품 목록 캐시 | 해결 | `a541d329` · `lib/stores/__tests__/owner-products-list-shared-purge.test.ts` | — |
| LOC-004 | 주문 시 판정 스냅샷 | 해결 | `e649c0bb` · `20270604110100` 운영:적용md5 · `iso:stage3-rpc` · `loc004-order-serviceability-snapshot.test.ts` · L4:I-8 | I-8 대상 0건(자연 주문 미관측). 관리자 표시는 J-3 |
| LOC-005 | 좌표 없는 배달 매장 | 해결 | `c64de134` · `20270604100000` · `iso:stage3-3a` · L4:I-9 | 기존 9매장 행은 D-5 로 그대로(LOC-003 으로 배달 불가 판정) |
| LOC-006 | 지역 교체 비원자 | 해결 | `c64de134` · `20270604100100`(Owner 적용, md5 일치) · `iso:stage3-3a` · `loc-006-replace-contract.route.test.ts` | — |
| LOC-007 | 위치 이동 검증 | 미증명 | `c64de134` · `owner-store-patch-location-guards.route.test.ts`(1km·LGU 409, 감사) | 확인창 화면 L5. 지도 핀은 누락 기능(문서 D §6)으로 미구현 |
| LOC-008 (=ORD-08) | 종료 주문 연락처 | 해결 | `c64de134` · `lib/stores/__tests__/mask-buyer-contact-for-owner.test.ts` | — |
| ORD-04 | 관리자 개입 CAS | 해결 | `5cae6ca9` · `lib/admin/store-orders/__tests__/admin-store-order-intervention.test.ts` · S5 | 409 문구 화면 L3 |
| ORD-06 | 취소 원장 원자화 | 해결 | `1f8a4c35`/`5cae6ca9` · `20270602120000` 운영:적용md5 · `iso:store-orders`(롤백·동시성) | — |
| ORD-07 (⊃DLV-04) | 내부 필드 노출 | 해결 | `2788457d`/`031a55b8` · `20270602140200` · `iso:store-contract` · 운영 실주문 응답에 `admin_note`·`commission_base_amount` 없음 | — |
| ORD-09 | 오너 취소 사유 전달 | 해결 | `5cae6ca9` · G1 · DN · S4 | 접수 전 거절 경로 누락은 J-1 로 별도 |
| DLV-01 | 라이더 체계 표기 | 미증명 | `5cae6ca9` · DN(「미운영」) | 라이더 화면 「미운영」 표시 L5. 운영 라이더 테이블 드리프트는 X-2 |
| DLV-02 | 배달↔주문 동기화 | 해결 | `1f8a4c35`/`5cae6ca9` · `20270602120100` · `iso:stage2-2c` · G1 · DN | CHECK `store_order_deliveries_status_check` 운영 NOT VALID 유지(위반 0, VALIDATE 는 Owner 승인 대기). 과거 1건 D-5 |
| DLV-03 | 배달 정체 SLA 스캔 | 미증명 | `04623692` · `20270602110000` · 운영 롤백(과거 주문 플래그 0) | 운영 크론 실행 기록 미확인 |
| NTF-04 | 상태 변경 직후 구 스냅샷 | 미증명 | `5cae6ca9` · G1 · DN | 다중 인스턴스 실트래픽(원래 NOT_PROVEN 결함) |
| FIN-05 (⊃ADS-21·GFT-05 계열) | Coin 역분개 원자화 | 해결 | `e2a0b1e7` · `20270603130000` · `iso:stage2-2c`(경합 6종) · `lib/currency/__tests__/coin-reversal-cut-b.test.ts` · L4:I-5 | — |
| FIN-06 | 레거시 정산 TS 수정 | 해결 | `e2a0b1e7` · `cf1a3a88`(N-4B 권한 회수) · G1 · `iso:stage2-2ef` | — |
| FIN-07 | 재무제표 원천 | 해결 | `cf1a3a88` · `lib/finance/__tests__/fin07-statements-commission-ssot.test.ts` · 운영 대조(매출 ₱15,200·순수수료 ₱722 = 원장) | 관리자 재무 화면 L5 |
| FIN-08 | Cash/Coin 정정 경로 | 해결 | `6f8d135c` · `20270603110200`/`125000` · `iso:stage2-2a` · L4:I-3 | 기존 −₱225 1곳은 D-5 로 미정정(`legacy_preserved`) |
| FIN-09 (=N-4A) | 원장 테이블 쓰기 권한 | 해결 | `661924df` · `20270602140000` · `iso:store-contract` · 운영: 10개 테이블 클라이언트 쓰기 0·트리거 10 | — |
| FIN-10 | 운영 마이그레이션 기록·드리프트 | 해결 | `99735be3` 함수 md5 + 최종 `verify:prod-schema-drift`(테이블·컬럼·함수, 운영 스냅샷 `fin10-prod-schema-snapshot.json`, `prod-schema-drift.test.ts` 9건) | 검사 결과 운영 누락 32개 → X-4 로 등재(문서 I §4) |
| ADS-04 | 파트너 신청 중복·고아 | 해결 | `872d89e4` · `20270604150000` · `iso:stage3-3d2` | — |
| ADS-05 | 멤버십 만료 처리 | 해결 | `872d89e4` · `iso:stage3-3d2` · `delivery-ad-3d2-partner-atomic.test.ts` | 기존 만료 ACTIVE 1건 행은 D-5 로 불변(읽기 파생으로 「기간 만료」) |
| ADS-06 | 배너 매장 자격 | 해결 | `2f060663` · `delivery-ad-stage3-3d1.test.ts`(ADS-06 3건) · S9 | — |
| ADS-08 | 광고 승인 권한키 | 해결 | `2f060663` · `delivery-ad-stage3-3d1.test.ts` · S9 | — |
| ADS-21 | 쿠폰 복원 원자화 | 해결 | `e2a0b1e7` · `iso:stage2-2c` · G1 · L4:I-5 | — |
| GFT-04 | 상품권 소멸 고지 | 미증명 | `a1f286d9` · `components/stores/cart/__tests__/store-cart-gift-forfeit-consent.test.tsx`(RTL) | 결제 화면 고지·동의 모달 L5 |
| GFT-05 | 상품권 복원 원자화 | 해결 | `e2a0b1e7` · `iso:stage2-2c` · G1 | — |

## 6. P3 (58)

| ID | 영역 | 상태 | 근거 | 남은 층 / 사유 |
|---|---|---|---|---|
| OPS-04 | 오너 영업 카드 실효 상태 | 해결 | `e61a9e9c` · `store-ops-3b-weekly-hours.test.ts` · 실기기 PASS 2026-10-21 PHT(샤오미 1.2.4 (7), 오너 계정, Production `b1d822127`, 문서 L C 단계 · 증거 `/tmp/dibay-check/owner/`) | — |
| OPS-05 | 이메일(GCash) 저장 소실 | 해결 | `e61a9e9c` · `owner-store-patch-ops-3b.route.test.ts`(400, null 덮어쓰기 금지) | — |
| OPS-07 | 미승인 노출 토글 | 해결 | `e61a9e9c` · `20270604120000` · `iso:stage3-3b` | — |
| OPS-08 | 주문 RPC 영업·플래그 재검증 | 해결 | `e649c0bb` · `20270604110000`/`110100` · `iso:stage3-rpc` · `store-front-commerce-open-sql-twin-parity.test.ts` | — |
| OPS-09 | null 저장 500 | 해결 | `e61a9e9c` · `owner-store-patch-ops-3b.route.test.ts` | — |
| OPS-10 | 답글 알림 한국어 고정 | 해결 | `e61a9e9c` · `review-reply-notification-i18n.route.test.ts` | — |
| PRD-10 | 재고 0 active | 해결 | `4dc8b557` · `owner-product-3e.route.test.ts` | — |
| PRD-11 | 카테고리 정렬 비원자 | 해결 | `4dc8b557` · `20270604160000` · `iso:stage3-3e` · `menu-sections-3e.route.test.ts` | — |
| PRD-12 | 오너/구매자 정렬 불일치 | 미증명 | `4dc8b557` · `lib/stores/__tests__/owner-products-3e.test.ts` | 오너 허브 표시 순서 L5 |
| PRD-13 | 카테고리 삭제 무안내 | 미증명 | `4dc8b557` · `menu-sections-3e.route.test.ts`(409 section_has_products) | 이동 대상 선택 화면 L5 |
| PRD-14 | 옵션명 중복 | 해결 | `4dc8b557` · `owner-products-3e.test.ts` · P3E | — |
| PRD-15 | 서버 검증 비일관 | 해결 | `4dc8b557` · `owner-product-3e.route.test.ts`(상한·멱등·500 원문 미노출) | — |
| PRD-16 | Storage 고아 객체 | 해결 | 현재 교체·삭제: 상품 PATCH 저장 성공 후 이 매장 원본 중 빠진 것만 정리, 다른 매장·외부 URL 무삭제, 409 시 무삭제 — `owner-product-image-replace-prd16.route.test.ts` 4건 · GC 크론 `4dc8b557`(dry-run) | 과거 고아 파일 일괄 삭제는 **제외**(지시: 하지 않음) |
| LOC-009 | V2 LGU 오류 코드 | 해결 | `41547859`(감사 이후) · `lib/stores/__tests__/resolve-store-checkout-client-error.test.ts` | — |
| LOC-010 | 경계 판정 차이 | 해결 | `c64de134` · `loc-003-serviceability-fail-closed.test.ts`(0,0 거부) · `cart-address-change-policy.test.ts` · S8 | — |
| LOC-011 | 거리정책 레거시 값 | 미증명 | `c64de134` · `lib/delivery/__tests__/loc-011-distance-policy-raw-diff.test.ts` | 관리자 「저장 시 정규화」 안내 화면 L5. 운영 값은 관리자 저장 전까지 그대로 |
| LOC-012 | 라이더 위치 토글 | 해결 | `c64de134` · `rider-location-toggle.route.test.ts` | — |
| LOC-013 | 저장마다 ETA 재계산 | 해결 | `c64de134` · `owner-store-patch-location-guards.route.test.ts` | — |
| LOC-014 (=N-2) | 주소 LGU 직접 수정 | 해결 | `661924df` · `20270602140000` · `iso:store-contract` · 운영:정책 | — |
| IA-06 | 쿠폰 화면 피드백 | 미증명 | `87364cce` · `owner-store-coupons-view-feedback.test.tsx`(RTL) | 화면 L5. 토스트 전환은 범위 밖(인라인 띠 유지) |
| IA-07 | 레거시 리다이렉트 쿼리 | 해결 | `0199fc16` · RT4 · 실기기 PASS 2026-10-21 PHT(샤오미 1.2.4 (7), 오너 계정, Production `b1d822127`, 문서 L C 단계 · 증거 `/tmp/dibay-check/owner/`) | — |
| IA-08 | storeId 해석 | 해결 | `0199fc16` · RT4(셸 정규화) · 실기기 PASS 2026-10-21 PHT(샤오미 1.2.4 (7), 오너 계정, Production `b1d822127`, 문서 L C 단계 · 증거 `/tmp/dibay-check/owner/`) | — |
| IA-09 | 제목·라벨·오타 | 해결 | `957a23cc` · NAV(44행 표·ko/en 키) · 실기기 PASS 2026-10-21 PHT(샤오미 1.2.4 (7), 오너 계정, Production `b1d822127`, 문서 L C 단계 · 증거 `/tmp/dibay-check/owner/`) | — |
| IA-10 | 하위 화면 활성 | 해결 | `957a23cc` · NAV(44행 활성) · 실기기 PASS 2026-10-21 PHT(샤오미 1.2.4 (7), 오너 계정, Production `b1d822127`, 문서 L C 단계 · 증거 `/tmp/dibay-check/owner/`) | — |
| IA-11 | 뒤로가기 부모 | 해결 | `957a23cc` · NAV(IA-11 쿼리 보존) · 실기기 PASS 2026-10-21 PHT(샤오미 1.2.4 (7), 오너 계정, Production `b1d822127`, 문서 L C 단계 · 증거 `/tmp/dibay-check/owner/`) | — |
| IA-12 | 중복 진입점 | 해결 | `0199fc16` · RT4 · 실기기 PASS 2026-10-21 PHT(샤오미 1.2.4 (7), 오너 계정, Production `b1d822127`, 문서 L C 단계 · 증거 `/tmp/dibay-check/owner/`) | — |
| IA-13 | 정산 용어 | 해결 | `0199fc16`/`2ff823db` · RT4 · 실기기 PASS 2026-10-21 PHT(샤오미 1.2.4 (7), 오너 계정, Production `b1d822127`, 문서 L C 단계 · 증거 `/tmp/dibay-check/owner/`) | — |
| IA-14 | 알림 설정 단위 표기 | 해결 | `27443a4e`/`909808af` · FB · 실기기 PASS 2026-10-21 PHT(샤오미 1.2.4 (7), 오너 계정, Production `b1d822127`, 문서 L C 단계 · 증거 `/tmp/dibay-check/owner/`) | — |
| IA-15 | 리뷰 답글 실패 UX | 미증명 | `27443a4e` · FB | 화면 L5 |
| IA-16 | 문의 답변 실패 무음 | 해결 | `27443a4e` · FB · 실기기 PASS 2026-10-21 PHT(샤오미 1.2.4 (7), 오너 계정, Production `b1d822127`, 문서 L C 단계 · 증거 `/tmp/dibay-check/owner/`) | — |
| IA-17 | 설정 토글 피드백 | 해결 | `27443a4e` · FB · 실기기 PASS 2026-10-21 PHT(샤오미 1.2.4 (7), 오너 계정, Production `b1d822127`, 문서 L C 단계 · 증거 `/tmp/dibay-check/owner/`) | — |
| IA-18 | 고아 컴포넌트·라우트 | 해결 | `0199fc16` · RT4 (import 0 컴포넌트 삭제, URL 삭제 0·진입점 추가) | — |
| IA-19 | hex·팔레트·반경 | 해결 | `5a175e09` · `lib/business/__tests__/owner-ui-token-ratchet.test.ts`(위반 0 래칫) | 시각 확인 L5 미측정 |
| IA-20 | PC 고정 사이드바 | 미증명 | `957a23cc`/`909808af` · NAV · `owner-mobile-ops-menu-drawer-a11y.test.tsx` | 실기기 FAIL 2026-10-21(샤오미: 안드로이드 뒤로가기로 드로어 미닫힘, ESC 는 PASS) → 드로어를 INAPP-07 오버레이 백 스택에 등록(`useOverlayHardwareBack`), RTL 테스트 추가. 재실측 대기 |
| IA-21 | 드로어 승인 조건 | 해결 | `957a23cc` · NAV(상태×노출 = 1-B 게이트) · 실기기 PASS 2026-10-21 PHT(샤오미 1.2.4 (7), 오너 계정, Production `b1d822127`, 문서 L C 단계 · 증거 `/tmp/dibay-check/owner/`) | — |
| IA-23 | 주문 단계 실패 메시지 | 해결 | `27443a4e` · FB(409·코드 매핑) · 실기기 PASS 2026-10-21 PHT(샤오미 1.2.4 (7), 오너 계정, Production `b1d822127`, 문서 L C 단계 · 증거 `/tmp/dibay-check/owner/`) | — |
| ORD-10 | 404/403 구분 노출 | 해결 | `5cae6ca9` · DN | — |
| ORD-11 | 멱등 재응답 값 | 해결 | `5cae6ca9` · DN | — |
| DLV-04 (⊂ORD-07) | 배달 증빙 경로 노출 | 해결 | `2788457d` · `iso:store-contract`(30_order_snapshot_keys) · `store-order-detail-snapshot-assemble-strip.test.ts` | — |
| NTF-02 | 시스템 처리 문구 | 해결 | `5cae6ca9` · G1 · DN | — |
| NTF-03 | 수락 알림 ETA | 해결 | `5cae6ca9` · G1 · S2 | — |
| NTF-05 | 동시 환불 부수효과 2회 | 해결 | `5cae6ca9`/`e2a0b1e7` · G1(RPC idempotent) · `iso:stage2-2c` | — |
| FIN-11 | 미납 합계 TS 집계 | 해결 | `6f8d135c` · `20270603110300` · `iso:stage2-2a`(40_fin11) | — |
| FIN-12 | 환급 후 미상계 | 해결 | `6f8d135c` · `iso:stage2-2a`(10_fin02_fin12) | — |
| FIN-13 | 수수료 기준액 문서·percent | 해결 | `7ab4f8bd` · `20270603120300` · `iso:stage2-2b` · SSOT 문서 산식 | — |
| FIN-15 | 주문 차단 게이트 이원화 | 해결 | `cf1a3a88` · `20270603150000` · `iso:stage2-2ef` | — |
| ADS-09 | 광고 기여 fire-and-forget | 해결 | `872d89e4` · `delivery-ad-3d2-event-ids.test.ts` | — |
| ADS-10 | 노출 eventId 클라 지정 | 해결 | `872d89e4` · `delivery-ad-3d2-event-ids.test.ts` | — |
| ADS-11 | 일시중지 종료일 | 해결 | `2f060663` · `iso:stage3-3d1` | — |
| ADS-12 | 미펀딩 신청 큐 | 해결 | `2f060663` · `iso:stage3-3d1` · `delivery-ad-stage3-3d1.test.ts` | — |
| ADS-13 | 팝업 제출 비원자 | 해결 | `872d89e4` · `20270604150100` · `iso:stage3-3d2` · `lib/platform-popup/__tests__/ads13-owner-submit-atomic.test.ts` | — |
| ADS-22 | 쿠폰 비용 분할 | 해결 | `cf1a3a88` · `20270603150000` · `iso:stage2-2ef`(조작 payload 5종) | — |
| ADS-23 | 쿠폰 상태 이중 컬럼 | 해결 | `87364cce` · `iso:stage3-3c` · `store-coupon-effective-state.test.ts` | — |
| ADS-24 | max_uses_per_user 충돌 | 해결 | `87364cce` · `iso:stage3-3c` · `owner-create-funding-route.contract.test.ts` | — |
| ADS-25 | 복원 시 이력 삭제 | 해결 | `e2a0b1e7` · `iso:stage2-2c` · 운영: 2단계 잔여 DROP 4줄(옛 UNIQUE 제거·부분 UNIQUE 재생성) 적용 | — |
| GFT-06 | 아카이브 지갑 조회 | 해결 | `a1f286d9` · `stage2-2d-gift-contract.test.ts`(라우트 410) | — |
| GFT-07 | 구매 멱등키 스코프 | 해결 | `a1f286d9` · `20270603140100` · `iso:stage2-2d`(20_gft07) | — |
| GFT-08 | issued_count 불일치 | 해결 | `a1f286d9` · `20270603140200` · `iso:stage2-2d`(30_gft08) | 기존 1건은 D-5 `legacy_preserved` |

## 7. 추가 발견 (9)

| ID | 영역 | 상태 | 근거 | 남은 층 / 사유 |
|---|---|---|---|---|
| N-4B | 레거시 정산·충전요청 쓰기 권한 | 해결 | `cf1a3a88`/`6f8d135c` · `20270603150100`/`20270603110400` · `iso:stage2-2ef`(20_n4b) | — |
| N-5 | `internal.is_admin_user()` 드리프트·anon SELECT | 해결 | `661924df` · `20270602140000`(운영 원문 고정·anon SELECT 명시 회수) · `iso:store-contract` | — |
| J-1 | 접수 전 거절 사유 유실 (`OwnerStoreOrderDeliveryActions.tsx`) | 해결(최종 수정) | `0e9b50ff` · `owner-delivery-actions-reject-reason.test.tsx` | 메신저 오너 액션바·판매자 패널 화면 L5 |
| J-2 | 오너 PATCH `accepted→cancelled` 원장 없음 (`orders/[orderId]/route.ts`) | 해결(최종 수정) | `0e9b50ff` · `s04-owner-direct-cancel.test.ts` (pending·accepted PATCH 400, 사유 RPC) | — |
| J-3 | 관리자 주문 상세 「주문 당시 판정」 없음 (`load-admin-store-order-detail.ts`) | 해결(최종 수정) | `0e9b50ff` · `admin-order-checkout-judgement.test.ts` | 관리자 화면 표시 L5 |
| X-1 | 운영 `store_order_deliveries.failure_reason` 없음 → 관리자 `delivery_failed` 503 | 해결(최종 수정) | `0e9b50ff` · 마이그레이션 `20270605100000` · 운영 컬럼 적용 확인 2026-10-21 | 관리자 배달 실패 처리 화면 L5 |
| X-2 | 운영 `delivery_riders` 관리자 센터 드리프트(`20260517120000`: `admin_status`·`admin_note`·`suspended_at`·`suspended_by`·`admin_delivery_riders_operations_snapshot`) | 제외 | 운영 확인 2026-10-21: 라이더 0명·배정 0건(매장 자체 배달) — 현재 배달 운영에서 미사용 → 구조 복구 안 함 | 라이더 도입 시 위 마이그레이션의 `delivery_riders` 부분 적용 필요. 관리자 라이더 화면은 그 전까지 오류 |
| X-3 | `cancel_requested` 주문 관리자 강제 취소 시 구매자 요청 pending 잔존(ND-3 C6.4) | 해결 | `dd98ff10` — 결정 미지정 관리자·오너 취소를 `store_order_cancel_request_decide_atomic` 승인으로 처리(주문·요청·부수효과 1 TX) · `final-cancel-requested-admin-cancel.test.ts` 3건 · 운영 확인: 과거 발생 0건 | 관리자 화면 L5 |
| X-4 | 운영 DB 스키마 누락(FIN-10 검사, 배달·관리자 관련): 관리자 배달 운영 상태·복구(`admin_delivery_operations_health`·`admin_delivery_operation_recovery_execute`·하트비트·복구 로그) · 관리자 쿠폰 강제 회수 `revoke_campaign_active_entitlements` | 해결 | `1380b9159` — 운영 적용 `20270605100200`~`100500`(누락분만, 함수 md5 = 파일, 실행 권한 service_role 전용, 클라이언트 쓰기 회수) · 운영 `admin_delivery_operations_health()` 실행 확인 · `iso:x4-ops-coupon` 20 PASS(복구 액션·비관리자 거부·회수 2건·멱등·권한) · SLA 크론 하트비트 `sla-scan-heartbeat.route.test.ts` 3건 | 관리자 운영 콘솔·쿠폰 회수 화면 L5. `alert_sync`·`auto_action_runner` 는 운영에 실행 크론 자체가 없어 상태 화면에 stale 로 정확히 표시됨 |

참고: N-1·N-2·N-3·N-4A 는 신규가 아니라 OPS-06·LOC-014·ACC-05(권한)·FIN-09 의 재묶음이라 해당 행에 반영했다. ND-1(관리자 잠금)·ND-2(핵심 정보 재검증)는 Owner 결정으로 PRD-03~07·ACC-06 행에 포함된다.

## 8. 남은 위험

- **화면 실측(L5)·브라우저(L3) 0건** — 미증명 29건 중 25건(L5 24 · L3 1)은 Owner·작업자 화면 확인만 남았다. 해결 판정 행의 화면 동작도 실측되지 않았다.
- **운영 크론 실행 기록 미확인** — ORD-02·ORD-03·DLV-03(및 ADS-05·ADS-01 만료 처리 크론). 결과는 배포 후 실행 로그로만 확인 가능.
- **ND-3 미결** — 시나리오 단위 DB 쓰기 회귀(L2)는 단계별 격리 스위트 13개 외 NOT_PROVEN.
- **D-5 과거 데이터 유지** — 해결 행의 과거 운영 데이터는 정리하지 않았다(GFT-02 는 그 자체가 결함이라 미해결).
- **드리프트** — FIN-10 대조 수단은 함수 md5 만 다룬다. X-1(해결)·X-2(미해결)처럼 테이블·컬럼 누락은 잡지 못한다.
- **`store_order_deliveries_status_check` NOT VALID** — 위반 0, VALIDATE 는 Owner 승인 후.
- HARD LOCK 완료 선언 없음.

## 9. ACC-05 최소 설계 (사업 정책으로 서류 심사를 의무화할 때만)

- 새 테이블·새 화면 없음. 기존 `store_business_verifications`(운영에 있음, 0행)를 매장 1:1 로 쓴다.
- 오너: 기존 입점 신청(`/apply`)·기본정보 화면에 서류 섹션(사업자번호·사업자등록증·통장 사본 업로드) — 서버 라우트(service_role)만 쓰기(클라이언트 쓰기 정책은 이미 회수됨).
- 관리자: 기존 매장 승인 화면(`PATCH /api/admin/stores/[id]` 전이표)에 서류 확인 상태 표시 + 승인 전이 조건 `business_verification_status = 'verified'` 를 **설정 플래그로만** 추가(플래그 OFF = 현재 동작). 기존 승인 매장 17곳은 D-5 로 소급 요구하지 않음.
- 검증: 전이표 vitest(플래그 ON/OFF), 서류 없는 신청 승인 거부 409.

## 10. 기존 검증 스크립트 7종 (최종 정리 `cc93a92ea`, 2026-10-21 PHT)

| 스크립트 | 실패 내용 | 판정 | 조치 | 결과 |
|---|---|---|---|---|
| `verify:delivery-product-hard-lock` | `store-order-structure-optimization` 재고 복원 일괄 조회 | 노후 기준 | 주문당 `restore_store_order_stock_atomic` RPC(현행 승인 구조) 또는 일괄 조회 인정, 혼용은 실패 | PASS 5/5 |
| `verify:owner-admin-scroll-shell-contract` | 5건 | 노후 기준 4 + 실제 결함 1(경로 주석 유실) | 현행 셸(`OwnerAdminPageScrollShell`·`--owner-content-top`) 기준으로 갱신, 주석 복원 | PASS |
| `verify:admin-real-operation-cut-e-control-plane-hard-lock` | 광고 허브 URL view | 노후 기준 | R7 `useAdminListQuery` 의 `?view=` 인정 | PASS |
| `verify:three-currency-product` | 「Store Cash」 문구 | 실제 결함 | canonical Cash 문구로 수정(관리자 충전 큐·광고 상세·원장 탭·카탈로그 3) | PASS |
| `verify:store-auto-hours-contract` | 옛 함수명 요구 | 노후 기준 | 세대 bump(전 공개 캐시) + `afterCanonicalStoreLocationWrite` 조합 인정, 무효화 자체는 계속 필수(고의 파손 시 FAIL 확인) | PASS |
| `verify:delivery-customer-owner-boundary` | 고객 화면 2파일(`CommerceHubStoreOwnerEntryCta`·`MyInfoHomeMenuSections`)이 오너 `use-owner-lite-store` 런타임 import | 구조 경계 위반(기능 동작 정상) | 미수정 — 고객용 매장 조회 훅 신설이 필요(마이페이지 설계 변경). 예외 목록 추가·우회는 하지 않음 | **FAIL 유지** |
| `scripts/verify-test-production-isolation-p0.mjs` | 27건 | 기능 미병합 | TEST 환경 격리 구현이 `dibay-test` 브랜치에만 있음(`docs/dibay-test-production-execution-status.md`) — 병합·네이티브 재빌드 필요 | **FAIL 유지**(이 감사 범위 밖) |

- 위 2건은 129건 대조 밖 항목이다(배달 오너 감사 결함 아님). 검사는 삭제·완화하지 않았다.
- `verify:prod-schema-drift`(FIN-10 신규): X-4 대상 객체는 운영에 적용(스냅샷 재채취 전이라 스크립트 결과는 FAIL 그대로). 남는 누락 = `delivery_riders` 관리 컬럼·함수(X-2 제외 결정) + 메신저·커뮤니티·스티커 등 이 감사 범위 밖 객체(문서 I §4).
- CI `npm run ci` 구성 스크립트 전부 PASS.

## 11. Owner 화면 실측 목록 (미증명 29건 — 로그인 화면 접근 불가로 남은 것)

앱 재시작(웹 변경만) 후, 오너 계정·관리자 계정·주문자 계정으로 아래를 한 번에 확인한다. 각 행 「확인 방법」대로 보이면 PASS.

| 계정 | 화면 | 확인 방법 | 결함 ID |
|---|---|---|---|
| 오너 | 오너 홈·드로어·PC(≥1280px) | 메뉴 12그룹·현재 화면 강조·뒤로가기가 상위 화면으로 감·제목 일치·PC 좌측 고정 사이드바·드로어 ESC 닫힘 | IA-09·10·11·20·21 |
| 오너 | 북마크·알림 링크(예전 주소) | 예전 `/my/business/...` 주소 진입 시 쿼리 유지하며 새 주소로 이동, storeId 없는 주소는 자동 보정 | IA-07·08 |
| 오너 | 매장 관리 `/settings`·헤더 | 노출·영업 토글은 매장 관리에서만, 끌 때 확인창, 실패 시 원복+토스트 | IA-12·17·OPS-04 |
| 오너 | 정산 `/settlements`·Finance | 「수수료·캐시 원장」「Coin 환전」 용어, orders 탭 없음 | IA-13 |
| 오너 | 알림 설정 | 「내 계정 알림 설정(전체 매장 공통)」, UUID·진동 문구 없음 | IA-14 |
| 오너 | 리뷰·문의 | 답글 삭제 확인창, 실패 시 목록 유지+오류, 문의 답변 실패 토스트 | IA-15·16 |
| 오너 | 주문 카드·메신저 액션바 | 단계 변경 실패 시 다이얼로그 오류 띠, 접수 전 거절 시 선택 사유가 주문자 알림에 표시 | IA-23·J-1 |
| 오너 | 쿠폰 화면 | 일시정지·종료·재발행 결과 띠 | IA-06 |
| 오너 | 상품 허브·카테고리 | 오너 정렬 = 구매자 메뉴 정렬, 카테고리 삭제 시 이동 대상 선택 | PRD-12·13 |
| 오너 | 기본정보 | 위치 1km 초과 이동 확인창, 심사 중 매장 수정 가드·안내 띠 | LOC-007·IA-01·IA-02 |
| 관리자 | 매장 승인 | 반려 매장 「재심사 열기」 → 오너 재제출 | ACC-04 |
| 관리자 | 주문 상세 | 「주문 당시 판정(저장값)」 표시, 배달 실패 처리(사유 입력) 정상 | J-3·X-1 |
| 관리자 | 운영 콘솔 | 배달 운영 상태 표시, 복구 액션 실행, 쿠폰 강제 회수 성공 | X-4 |
| 관리자 | 거리정책·라이더 | 저장 시 정규화 안내, 라이더 「미운영」 표기 | LOC-011·DLV-01 |
| 주문자 | 결제 화면 | 상품권 소멸 고지·동의 | GFT-04 |
| 운영 기록 | 크론 실행 | 미접수 자동 취소·자동 구매확정·SLA 스캔이 실제 실행됐는지 운영 기록(SLA 스캔은 이제 하트비트로 관리자 운영 상태에 표시) | ORD-02·ORD-03·DLV-03 |
| 운영 트래픽 | 다중 인스턴스 | 상태 변경 직후 다른 인스턴스 구 스냅샷 노출 여부 | NTF-04 |
