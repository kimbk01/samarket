# 문서 K — 배달 오너 감사 결함 최종 대조 (2026-10-21 PHT)

- 대상: 문서 D 120건(중복 통합 후) + 추가 발견 7건(N-4B · N-5 · J-1 · J-2 · J-3 · X-1 · X-2).
- 기준: main `e8664fb6` + 최종 수정 커밋(J-1·J-2·J-3·X-1, 이 문서와 함께 준비 중 — SHA 는 반영 보고에서 확정).
- 근거 원천: 단계 커밋(아래 SHA), 결함 ID 를 인용하는 테스트(`lib/ app/ components/ supabase/tests/`), 마이그레이션 `2027060*`, 문서 G·G-1·G-2·H·I·J, 오늘 운영 DB 읽기 전용 확인 결과(재조회 안 함).
- 이 문서는 대조만 한다. 코드·DB 변경 0.

## 0. 판정 기준

| 상태 | 기준 |
|---|---|
| **해결** | main 에 코드·DB 변경이 들어갔고, 자동 테스트(L1)·격리 DB 스위트(L2 로컬 PG16)·운영 읽기 전용 확인(L4·적용 md5) 중 하나 이상이 결함의 결정적 지점을 증명 |
| **미증명(NOT_PROVEN)** | 변경은 main 에 있으나 결정적 증거가 화면 실측(L5)·브라우저 e2e(L3)·운영 실행 기록·실트래픽 층에 있음 — 그 층을 표기 |
| **미해결** | 변경 없음, 또는 결정으로 보류(D-5 데이터 정리 미승인, D-17 등 Owner 결정 대기), 또는 범위 밖 |

엄격 적용: 화면에서 보이는 결함을 단위 테스트(RTL 포함)만으로 확인했으면 **미증명(L5)**. 서버·계약·DB 결함만 L1/L2 로 해결 판정했다.

## 1. 집계

| 구분 | 해결 | 미증명 | 미해결 | 합계 |
|---|---|---|---|---|
| P0 | 5 | 0 | 0 | 5 |
| P1 | 12 | 3 | 1 | 16 |
| P2 | 32 | 7 | 2 | 41 |
| P3 | 38 | 19 | 1 | 58 |
| **감사 결함 소계 (문서 D)** | **87** | **29** | **4** | **120** |
| 추가 발견 (N-4B · N-5 · J-1~3 · X-1 · X-2) | 6 | 0 | 1 | 7 |
| **전체** | **93** | **29** | **5** | **127** |

- 미증명 29건의 층: L5 화면 실측 24 · 운영 크론 실행 기록 3(ORD-02·ORD-03·DLV-03) · L3 브라우저 이동 1(IA-07) · 다중 인스턴스 실트래픽 1(NTF-04).
- 미해결 5건: GFT-02(D-5 정정 미승인) · ACC-05(D-17 대기) · FIN-10(기록 누락 정정 안 하기로 결정, 테이블·컬럼 대조 수단 없음) · PRD-16(실삭제 env 승인 대기) · X-2(운영 드리프트, 보고만).
- 해결 판정이어도 D-5 로 **과거 운영 데이터는 그대로**다(ADS-01 ₱480 4건, GFT-01 7주문, FIN-08 −₱225, GFT-08 1건, LOC-005 9매장, DLV-02 1건 등). 이 표의 해결은 「코드·DB 결함 제거」이고 「과거 데이터 정리」가 아니다.
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
| GFT-02 | Coin 8,750 과다 발행 | 미해결 | 재발 방지만: `7ab4f8bd` 민팅 상한 · `iso:stage2-2b` · 무결성 키 과거 11건 `legacy_preserved` | 과다 발행분 정정은 D-5(데이터 정정) 미승인 — 정정 수단(FIN-08)은 있음 |

## 5. P2 (41)

| ID | 영역 | 상태 | 근거 | 남은 층 / 사유 |
|---|---|---|---|---|
| IA-03 (⊃ADS-07·FIN-14) | 정지 매장 API 쓰기 | 해결 | `b3d5e837` · S7(19 라우트 × 상태 게이트 95건 + 통과 19건) · `owner-lifecycle-and-write-gate.test.ts` | 목록·검색 SQL 제외는 L3 |
| IA-02 | 가드 계정 단위 판정 | 미증명 | `b3d5e837` · `lib/delivery/owner/__tests__/owner-active-store-cut2-restoration.test.ts`(`stores[0]` 금지) | 선택 매장 기준 가드 화면 L5 |
| IA-04 (=ADS-20) | 쿠폰 부활·관리자 정지 재개 | 해결 | `87364cce` · `20270604130000` · `iso:stage3-3c` · `owner-coupon-transition-route.test.ts` · L4:I-12 | — |
| IA-05 | 쿠폰 재발행 중복 | 해결 | `87364cce`/`515f2383` · `iso:stage3-3c`(UNIQUE·같은 키 멱등) · `owner-coupon-transition-route.test.ts` | 확인창 busy 화면 L5 |
| ACC-04 | 반려 매장 재심사 경로 | 미증명 | `bc179a4d` · `20270602140100` · `iso:store-contract` · `app/api/admin/stores/[id]/__tests__/admin-store-reopen-reverify.route.test.ts` | 관리자 「재심사 열기」→오너 재제출 흐름 화면 L5 |
| ACC-05 | 사업자 서류 심사 | 미해결 | 권한 부분만 N-3 로 해결(`661924df`, 운영:정책) | 서류 심사 기능은 D-17 Owner 결정 대기 |
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
| FIN-10 | 운영 마이그레이션 기록·드리프트 | 미해결 | 부분: `99735be3` 함수 md5 스냅샷·`verify:prod-function-drift`(23개 MATCH) | 기록 누락 118건은 「보고만」 결정(문서 I). 테이블·컬럼 드리프트 대조 수단 없음 → X-1·X-2 를 잡지 못함 |
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
| OPS-04 | 오너 영업 카드 실효 상태 | 미증명 | `e61a9e9c` · `store-ops-3b-weekly-hours.test.ts` | 홈 카드 표시 L5 |
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
| PRD-16 | Storage 고아 객체 | 미해결 | `4dc8b557` GC 크론(기본 dry-run) · `owner-products-3e.test.ts` | 실삭제는 env 승인 대기 — 고아 객체 그대로 |
| LOC-009 | V2 LGU 오류 코드 | 해결 | `41547859`(감사 이후) · `lib/stores/__tests__/resolve-store-checkout-client-error.test.ts` | — |
| LOC-010 | 경계 판정 차이 | 해결 | `c64de134` · `loc-003-serviceability-fail-closed.test.ts`(0,0 거부) · `cart-address-change-policy.test.ts` · S8 | — |
| LOC-011 | 거리정책 레거시 값 | 미증명 | `c64de134` · `lib/delivery/__tests__/loc-011-distance-policy-raw-diff.test.ts` | 관리자 「저장 시 정규화」 안내 화면 L5. 운영 값은 관리자 저장 전까지 그대로 |
| LOC-012 | 라이더 위치 토글 | 해결 | `c64de134` · `rider-location-toggle.route.test.ts` | — |
| LOC-013 | 저장마다 ETA 재계산 | 해결 | `c64de134` · `owner-store-patch-location-guards.route.test.ts` | — |
| LOC-014 (=N-2) | 주소 LGU 직접 수정 | 해결 | `661924df` · `20270602140000` · `iso:store-contract` · 운영:정책 | — |
| IA-06 | 쿠폰 화면 피드백 | 미증명 | `87364cce` · `owner-store-coupons-view-feedback.test.tsx`(RTL) | 화면 L5. 토스트 전환은 범위 밖(인라인 띠 유지) |
| IA-07 | 레거시 리다이렉트 쿼리 | 미증명 | `0199fc16` · RT4 | 실제 브라우저 이동 L3 |
| IA-08 | storeId 해석 | 미증명 | `0199fc16` · RT4(셸 정규화) | 화면 L5 |
| IA-09 | 제목·라벨·오타 | 미증명 | `957a23cc` · NAV(44행 표·ko/en 키) | 화면 L5 |
| IA-10 | 하위 화면 활성 | 미증명 | `957a23cc` · NAV(44행 활성) | 화면 L5 |
| IA-11 | 뒤로가기 부모 | 미증명 | `957a23cc` · NAV(IA-11 쿼리 보존) | 화면 L5 |
| IA-12 | 중복 진입점 | 미증명 | `0199fc16` · RT4 | 화면 L5. 홈 대시보드 카드 토글은 범위 밖 잔여 |
| IA-13 | 정산 용어 | 미증명 | `0199fc16`/`2ff823db` · RT4 | 화면 L5 |
| IA-14 | 알림 설정 단위 표기 | 미증명 | `27443a4e`/`909808af` · FB | 화면 L5 |
| IA-15 | 리뷰 답글 실패 UX | 미증명 | `27443a4e` · FB | 화면 L5 |
| IA-16 | 문의 답변 실패 무음 | 미증명 | `27443a4e` · FB | 화면 L5 |
| IA-17 | 설정 토글 피드백 | 미증명 | `27443a4e` · FB | 화면 L5 |
| IA-18 | 고아 컴포넌트·라우트 | 해결 | `0199fc16` · RT4 (import 0 컴포넌트 삭제, URL 삭제 0·진입점 추가) | — |
| IA-19 | hex·팔레트·반경 | 해결 | `5a175e09` · `lib/business/__tests__/owner-ui-token-ratchet.test.ts`(위반 0 래칫) | 시각 확인 L5 미측정 |
| IA-20 | PC 고정 사이드바 | 미증명 | `957a23cc`/`909808af` · NAV · `owner-mobile-ops-menu-drawer-a11y.test.tsx` | ≥1280px 화면 L5 |
| IA-21 | 드로어 승인 조건 | 미증명 | `957a23cc` · NAV(상태×노출 = 1-B 게이트) | 드로어 표시 L5 |
| IA-23 | 주문 단계 실패 메시지 | 미증명 | `27443a4e` · FB(409·코드 매핑) | 다이얼로그 오류 띠 L5 |
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

## 7. 추가 발견 (7)

| ID | 영역 | 상태 | 근거 | 남은 층 / 사유 |
|---|---|---|---|---|
| N-4B | 레거시 정산·충전요청 쓰기 권한 | 해결 | `cf1a3a88`/`6f8d135c` · `20270603150100`/`20270603110400` · `iso:stage2-2ef`(20_n4b) | — |
| N-5 | `internal.is_admin_user()` 드리프트·anon SELECT | 해결 | `661924df` · `20270602140000`(운영 원문 고정·anon SELECT 명시 회수) · `iso:store-contract` | — |
| J-1 | 접수 전 거절 사유 유실 (`OwnerStoreOrderDeliveryActions.tsx`) | 해결(최종 수정) | `0e9b50ff` · `owner-delivery-actions-reject-reason.test.tsx` | 메신저 오너 액션바·판매자 패널 화면 L5 |
| J-2 | 오너 PATCH `accepted→cancelled` 원장 없음 (`orders/[orderId]/route.ts`) | 해결(최종 수정) | `0e9b50ff` · `s04-owner-direct-cancel.test.ts` (pending·accepted PATCH 400, 사유 RPC) | — |
| J-3 | 관리자 주문 상세 「주문 당시 판정」 없음 (`load-admin-store-order-detail.ts`) | 해결(최종 수정) | `0e9b50ff` · `admin-order-checkout-judgement.test.ts` | 관리자 화면 표시 L5 |
| X-1 | 운영 `store_order_deliveries.failure_reason` 없음 → 관리자 `delivery_failed` 503 | 해결(최종 수정) | `0e9b50ff` · 마이그레이션 `20270605100000` · 운영 컬럼 적용 확인 2026-10-21 | 관리자 배달 실패 처리 화면 L5 |
| X-2 | 운영 `delivery_riders` 관리자 센터 드리프트(`20260517120000` 미적용: `admin_status`·`admin_note`·`suspended_at`·`suspended_by`·`admin_delivery_riders_operations_snapshot`) | 미해결 | 운영 읽기 전용 확인(2026-10-21) | 보고만 — 운영 적용은 Owner 승인 필요. 운영 라이더 0(DLV-01) |

참고: N-1·N-2·N-3·N-4A 는 신규가 아니라 OPS-06·LOC-014·ACC-05(권한)·FIN-09 의 재묶음이라 해당 행에 반영했다. ND-1(관리자 잠금)·ND-2(핵심 정보 재검증)는 Owner 결정으로 PRD-03~07·ACC-06 행에 포함된다.

## 8. 남은 위험

- **화면 실측(L5)·브라우저(L3) 0건** — 미증명 29건 중 25건(L5 24 · L3 1)은 Owner·작업자 화면 확인만 남았다. 해결 판정 행의 화면 동작도 실측되지 않았다.
- **운영 크론 실행 기록 미확인** — ORD-02·ORD-03·DLV-03(및 ADS-05·ADS-01 만료 처리 크론). 결과는 배포 후 실행 로그로만 확인 가능.
- **ND-3 미결** — 시나리오 단위 DB 쓰기 회귀(L2)는 단계별 격리 스위트 13개 외 NOT_PROVEN.
- **D-5 과거 데이터 유지** — 해결 행의 과거 운영 데이터는 정리하지 않았다(GFT-02 는 그 자체가 결함이라 미해결).
- **드리프트** — FIN-10 대조 수단은 함수 md5 만 다룬다. X-1(해결)·X-2(미해결)처럼 테이블·컬럼 누락은 잡지 못한다.
- **`store_order_deliveries_status_check` NOT VALID** — 위반 0, VALIDATE 는 Owner 승인 후.
- HARD LOCK 완료 선언 없음.
