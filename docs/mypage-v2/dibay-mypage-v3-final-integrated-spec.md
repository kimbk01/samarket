# DIBAY 내정보 — 최종 통합 설계서 · 설계 대비 구현 차이표 · 확정 실행 계획

> **Owner 승인 2026-10-20 PHT — 권장안(★ 포함) 그대로 확정. 이 문서가 내정보 구현의 단일 실행 기준이다.**

- 작성: 2026-10-20 PHT · 기준 main `4e22876d` · 코드 수정 0
- 기준 문서 적용 순서: ① Owner 최초 요구·명시 승인 ② 확정 계약(03-NAVIGATION Motion·CTA, 04-DESIGN-SYSTEM, 08-HARDLOCK, LEGACY-IA 기능 보존표, 고객센터 SSOT, 마켓 UI-6 HARD LOCK, AGENTS.md) ③ v2.1 보완 설계 ④ v2 통합 설계 ⑤ 전면 재감사 증거
- 구성: **제1부** 충돌 판정표 → **제2부** 설계 대비 구현 차이표 → **제3부** 확정 실행 계획 → **제4부** 화면별 최종 설계(부록 A 공통·홈 / B S01–S19 / C S20–S47 / D S50–S65·API·SSOT·보존표)
- 화면별 설계는 모든 화면에 같은 항목(경로·구조·표시·컴포넌트·CTA·시트 흐름·SSOT·로딩/빈/오류·전환·복원·태블릿·성능·보존 조건·현재 차이·완료 검증·영향 파일)을 채웠다. 각 블록 머리에 판정(유지/수정/신규/선택적 원복)과 감사 판정이 있다.

---

## 제1부. 충돌 판정표 (우선순위 규칙으로 결정, Owner 확인 필요 항목 ★)

| # | 충돌 | 근거 | 결정(권장) | 확인 |
|---|---|---|---|---|
| X1 | 프로필 편집: 계약 "sheet 280ms = profile edit" vs v2.1 "편집 화면 1개(페이지)" | 03-NAVIGATION Motion, v2.1 S01, 현재 시트+페이지 2개 | **단일 표면 = 시트**(계약 우선). 시트에 S01 요구 전부 구현. `?setup=1` 필수정보 온보딩 페이지는 유지, 그 외 직접 URL은 `/mypage?edit=profile` | ★ |
| X2 | 전환 시간: 기존 슬라이드 440/360ms vs 계약 push/back 300ms | 03-NAVIGATION, `app/globals.css:833-864` | 내정보 경로만 300ms 신규 종류(`mypage-stack-forward/back`). 판매물품(`/mypage/products`)은 UI-6 소유로 440ms 유지. 타 도메인 불변 | — |
| X3 | 전역 `history.scrollRestoration="manual"` vs v2 §7.8 "전역 변경 금지" | 도입 `e23b9c0b`(10-16 통화 기능), 배달·거래도 사용 | **원복 안 함(유지)**. 내정보는 하위 목록 복원만 추가 | — |
| X4 | 언어: v2.1 선택 시트 vs 기능 보존표 toggle KEEP | LEGACY-IA | 토글 유지 + 현재 값 표시 | — |
| X5 | 관리자 메뉴 위치 | v2.1 "맨 끝", 컴포넌트 주석 "홈 하단", IA 계약은 위치 미지정 | 위험 그룹 뒤 맨 끝 | — |
| X6 | S18 버전: iOS·웹 비활성 업데이트 버튼 | v2.1 "버튼 없음" | Android에서만 렌더 | — |
| X7 | S21 구매 내역 | 마켓 UI-6 HARD LOCK | 제외 유지 | — |
| X8 | S20 판매 내역: v2.1 끌어올리기·예약중 탭·`/mypage/trade/sales` 단일 페이지 vs UI-6 | UI-6 "`/mypage/products` = 내 판매물품" | **UI-6 우선**: 필터 전체/판매중/판매완료/숨김/홍보·⋮ 수정/더 알리기/판매완료/숨김/삭제 유지. 허용: 스켈레톤·오류 화면·opt-in 커서·액션시트·토큰·문구. 끌어올리기·예약중 탭·탭 개수 추가 안 함. lock 문서의 "`/mypage/trade/sales` tabs UNCHANGED" 표기가 현 리다이렉트와 어긋남 | ★ |
| X9 | 로그아웃 확인: v2.1 확인 시트 vs 계약 modal | 03-NAVIGATION modal 200ms, logout 계약 | 계약대로 모달 | — |
| X10 | 시트 속도: 계약 280ms vs 공용 오버레이 CSS 300ms(전 도메인) | `MYPAGE_MOTION_MS.sheet` | 내정보 시트만 280ms 적용(공용 CSS 불변) | ★ |
| X11 | CSS: v2 "samarket-components.css 수정 금지" vs v2.1 "클래스 3종 추가" | v2 §7.10, v2.1 §3.3 | 추가만 허용, 기존 클래스 변경 금지 | — |
| X12 | 고객센터 허브의 포인트·충전 행: 설계 제거 vs 고객센터 SSOT LOCKED 유지 | `app-customer-center-ssot.md:14-24`, v2.1 S50 "현행" | **유지**(LOCK 우선) | ★ |
| X13 | 약관 허브: "기타 문서"까지 vs DB `app_legal_documents.kind` CHECK = terms/privacy | v2.1 S51 "현행" | 3행 허브(약관·개인정보·사업자정보), 홈 3행 유지 | ★ |
| X14 | 연결 로그인: v2 별도 화면 vs v2.1 기기 권한 안 | v2.1 S10 | 기기 권한 화면 안 독립 그룹(`#linked-login`), 해제 확인 시트 추가 | — |
| X15 | 알림 딥링크 `/mypage/notices/{id}`: v2 리다이렉트 vs LOCK | 알림 계약 | 경로 유지, 게시판 상세와 같은 컴포넌트로 렌더 | — |
| X16 | 게시판 고정글: 설계 고정 구역 vs `app_notices`에 고정 컬럼 없음 | DB 스키마 | DB·관리자 변경 승인 전까지 고정 구역 미표시 | ★ |
| X17 | 탭 URL 키: 설계 `?tab=` vs 기존 `?filter=`(UI-6)·`?fav=`·`couponTab`/`giftTab`(배달 커머스 허브 공용) | 각 화면 | 기존 키 유지(통일 이름은 신규 탭에만) | — |
| X18 | 기존 화면의 추가 탭(주문 '전체', 상품권 '받은') | 기능 삭제 금지 | 유지 | — |
| X19 | 주문 목록 색 토큰화가 배달 허브 공용 컴포넌트에 영향 | `MyStoreOrdersView` 공용 | 토큰 치환은 같은 값 매핑으로 배달 허브 시각 불변 확인 | — |
| X20 | 되돌리기: 숨김 글은 좋아요·저장 재등록 불가 / 찜 하트는 잠긴 마켓 `PostCard` 안 | 커뮤니티 API, UI-6 | S27은 DELETE를 5초 지연(되돌리기 시 취소), S22는 토글 재호출 | — |
| X21 | S41 충전 중복 방지 키 = DB 마이그레이션 필요(M6, 미승인) | v2 S41 | M6 승인 전까지 클라이언트 제출 방지만 | ★ |
| X22 | S47 혜택 정책에 사용처 필드 없음 | `member_benefit_policies` | 정책 종류로 목적지 결정(DB 변경 없음) | — |
| X23 | `/api/my/posts` 소비처 4곳(마켓·홍보·피드광고·e2e) | grep | 커서는 opt-in, 기존 응답 불변 | — |
| X24 | 신뢰도 이력 `/api/me/trust/events`: v2만 있음 | v2.1에 없음 | 범위 밖(v2.1 우선) | — |

**발견된 추가 결함(설계와 무관하게 수정 대상):** `verify-mypage-root-network-contract.cjs`가 현재 HEAD에서 실패(CI 미실행으로 방치) · S17 캐시 삭제가 `sessionStorage.clear()`로 거래 글쓰기 임시저장·주소 흐름·로그인 캐시까지 삭제 · S05 실제 무한 로딩 원인은 `MypageRequiredPhoneClient.tsx:100-102`·`PhoneVerificationBox.tsx:188-194`, 재전송 타이머가 줄지 않음 · 주문 상세 상태 문구가 시드에 수령 방식이 없어 항상 배달 문구 · 고객센터 공지 댓글 API도 실패 시 빈 성공 응답.

---

## 제2부. 설계 대비 구현 차이표

| 구역 | 화면 | 감사 판정 | 판정 | 핵심 작업 |
|---|---|---|---|---|
| 공통 | 디자인 토큰 | PARTIAL | 유지+수정 | 하드코딩 색 제거(주문 목록 28·확장 패널 38·주소·탈퇴·고객센터 18·`address-list-starbucks-styles`), 수식 클래스 3종 신규 |
| 공통 | 공통 부품 | NOT_IMPLEMENTED | 신규 | `components/mypage/ds/` MyScreen·MyGroup·MyRow·MyStateView·MyListPager·MyStickyCta·MyToggle·useMypageSubmitGuard·useMypageTabParam·formatMypageDate, 토스트 [되돌리기] |
| 공통 | 진입·복귀 전환 | NOT_IMPLEMENTED | 신규 | 내정보 300ms 우→좌·역방향 (X2) |
| 공통 | 스크롤·탭 복원 | PARTIAL | 수정·신규 | 하위 목록 복원, 홈 저장 TTL 30분 (X3 유지) |
| 공통 | 스켈레톤 | FAIL | 신규·수정 | 화면 유형별 구조 일치, `section/loading.tsx` 범용 블록 폐기 |
| 공통 | 성능 | PARTIAL | 수정 | 설정 화면 `loadMypageServerShell`, 재진입 캐시, 요청 예산 |
| 홈 | H0 | PARTIAL | 수정·신규 | 9그룹 순서, `/api/me/mypage-summary`(목적지 함수 재사용·실패는 빈 값), 필수정보 미완료 항목만, 전화·주소 결함, 관리자 맨 끝, 태블릿 40rem·20px |
| 프로필·계정 | S01 | FAIL | 수정 | 단일 시트(X1) + 사진 액션시트·실시간 검증·글자수·변경 시만 저장·미저장 확인 |
| | S02·S03·S04·S05 | PARTIAL | 수정 | S03 연결 로그인·가입일·번호 마스킹·스켈레톤 / S04 1회 변경 확인 시트 / S05 무한 로딩·타이머 |
| 주소 | S06·S07·S08 | PARTIAL | 수정 | 빈 목록 안내·재시도 / **S07 대표 주소 임의 변경 금지**·라벨 선택 / 검색 결과 없음·오류 |
| 설정 | S09·S13·S15·S16 | PASS | 유지 | 공통 부품·전환만 적용 |
| | S10·S11·S12·S14·S17·S18·S19 | PARTIAL | 수정(S12 유지) | 연결 로그인 그룹(X14) / 알림 실패 되돌림 / 해제 확인 시트 / 캐시 키 목록 / 버전 버튼(X6) / 탈퇴 확인 시트·하단 고정 |
| 거래 | S20 | FAIL | 수정(X8 범위) | UI-6 안에서 결함 수정 |
| | S21 | 제외 | 유지 | — |
| | S22·S24·S25 | PARTIAL | 수정 | 되돌리기 토스트·커서·탭 URL·보낸 후기 오류·날짜 묶음·전체 삭제 확인 |
| | S23 | FAIL | 수정 | 받은/보낸 탭, 거절 확인 |
| 커뮤니티 | S26·S27 | FAIL | 수정·신규 | 숨김 탭·⋯ 수정/삭제 / 댓글 삭제·좋아요·저장 해제(+DELETE API) |
| 주문 | S30·S31·S33·S34 | PARTIAL | 수정 | 토큰화·하단 고정 CTA·취소 사유 시트·즉시 취소 확인·수령 방식 문구·문의 행 링크·오류 코드 숨김 |
| | S32 | PASS | 유지 | — |
| 자산 | S40·S41·S43·S45·S47 | PARTIAL | 수정 | 충전 요청 취소 확인·오류 처리·상품권 상세 무한 로딩·혜택 목적지 |
| | S42·S46 | FAIL | 수정·신규 | 월별 소멸 예정 / 광고 탭·종류 시트·취소 확인 |
| | S44 | PASS | 수정(경미) | 스켈레톤 |
| 고객센터·정책 | S53·S60·S61·S62·S63 | PARTIAL | 수정 | 해제 확인 / 허브 색 / 게시판 더 보기·실패 5xx / 하단 댓글 바 / 상태 탭 |
| | S64 | PASS | 유지 | — |
| | S65 | FAIL | 수정 | 3행 허브(X13) |
| API | 신규 | — | 신규 | `GET /api/me/mypage-summary`, 커뮤니티 like/save DELETE |
| API | 변경 | — | 수정 | 커서: `/api/my/posts`(opt-in)·`/api/favorites/list`·후기 2종·커뮤니티 활동·내 글(`scope=own`)·문의 내역·공지 / 공지·공지 댓글 실패 시 5xx |
| 원복 | — | — | **선택적 원복 0건** | 감사 후보였던 전역 scrollRestoration은 내 변경이 아니고 타 도메인 의존 → 유지(X3). 보안·금액·DB·병합된 기능 변경 원복 없음 |

---

## 제3부. 확정 실행 계획

### 3.1 진행 원칙
- 승인 후 R1→R8을 멈추지 않고 끝까지 구현. 단계마다 새 승인 요청 없음. 설계 변경 없음(충돌 ★는 Owner 답에 따름, 답 전에는 권장안으로 진행).
- 반영: 단계별로 검증 1회 → 지정 브랜치 → PR 생성 즉시 병합(CI 대기 없음, 이 세션의 main 직접 푸시는 권한 검사로 막혀 PR 경로 사용). 단계 수 = PR 5개(R1+R2, R3, R4, R5, R6+R7).
- 매 단계 시작 전 `git fetch origin main`·충돌 파일 확인, 다른 세션 미커밋 작업 미접촉.
- 금지: 임의 타이머·강제 새로고침·캐시 강제 삭제·오류를 빈 목록/0으로 처리·가짜 숫자·기능 삭제로 테스트 통과.

### 3.2 구현 순서 · 영향 파일 · 검증

| 단계 | 내용 | 주요 영향 파일 | 검증 |
|---|---|---|---|
| R1 | 공통 부품·토큰·포맷 | 신규 `components/mypage/ds/*`, `components/mypage/MypageToastHost.tsx`(되돌리기), `lib/mypage/format-mypage-date.ts`, `app/samarket-components.css`(추가만) | 부품 렌더 테스트(스켈레톤 n행·빈·오류+재시도·더 보기 실패 재시도·변경 시만 활성·중복 제출 차단) |
| R2 | 홈 | `MyPageHomeDashboard.tsx`, `components/mypage/home/*`, `components/mypage/myinfo/*`, `lib/mypage/mypage-home-menu-config.ts`, 신규 `app/api/me/mypage-summary/route.ts` + `lib/mypage/mypage-summary.server.ts`, `lib/ui/mypage-home-starbucks-styles.ts`, `hooks/use-mypage-home-model.ts` | 숫자 = 목적지 화면 값 일치 테스트, 실패 시 빈 값, 홈 콜드부트 계약 테스트, `verify-mypage-root-network-contract` 복구 |
| R3 | 전환·복원 | `components/route-transition/route-transition-enter-kind.ts`·`route-transition-config.ts`·`AppRouteTransition`, `app/globals.css`(내정보 종류 추가만), 하위 목록 복원 훅 | 경로쌍별 전환 종류 단위 테스트(내정보 300ms, 타 도메인 기존 종류 불변 스냅샷) |
| R4 | S01–S19 | `components/mypage/profile-settings/*`, `components/my/edit/*`, `components/my/MyAccountContent.tsx`, `components/mypage/required/*`, `components/mypage/profile/PhoneVerificationBox.tsx`, `components/addresses/*`, `components/my/settings/*`, `components/account/AccountDeletionRequestForm.tsx`, `lib/mypage/clear-app-client-caches.ts`, `lib/platform/android-play-version-screen-cta.ts`, `MyPageItemRouteClient.tsx`, 섹션 페이지 `loadMypageServerShell` | 화면별 테스트(대표 주소 불변, 캐시 키 목록, 버전 버튼 플랫폼별, 1회 아이디 확인 시트) + 주소 HARD LOCK 계약 테스트 |
| R5 | S20–S47 | `components/mypage/products/*`(UI-6 범위), `components/favorites/*`, `components/offers/*`, `components/mypage/reviews/*`, `components/recent-viewed/*`, `components/mypage/community-activity/*`, 커뮤니티 like/save 라우트, `lib/community-feed/list-community-posts-for-user.ts`, `components/mypage/MyStoreOrders*`, `MyStoreOrderDetailView.tsx`, 주문 시드 캐시, `app/(main)/mypage/points/**`, `components/orders/customer-commerce/*`, `app/(main)/mypage/ads/*`, 혜택 | 화면별 테스트 + 마켓 UI-6·거래 홈 불변 계약·배달 허브·주문 금액 SSOT 테스트 |
| R6 | S50–S65 | `components/my/settings/LinkedLoginProvidersContent.tsx`, `components/mypage/cs/*`, `lib/mypage/customer-center-ui.ts`, `app/api/me/settings/notices/**`, `components/support/*`, `MyPageItemScreen.tsx`(약관 허브) | 화면별 테스트 + 고객센터 SSOT·알림 딥링크 계약 테스트 |
| R7 | 경량화 마무리 | 섹션 서버 로더, 재진입 캐시, 중복 라벨 테이블 정리, `toLocale*` 40곳 → 포맷 함수 | 화면별 요청 수 기록표 |
| R8 | 최종 검증 | — | 아래 3.3 |

### 3.3 검증 방법
1. **로컬(단계마다 1회):** `npm run typecheck:build` + 변경 관련 vitest + 변경 파일 eslint + 해당 `verify:*` 1회.
2. **회귀:** 관리자·거래(UI-6·홈 불변)·배달(커머스 허브·주문 SSOT)·메신저·주소 HARD LOCK 계약 테스트를 R5·R8에 포함.
3. **화면 증거:** 이 작업 환경에는 운영 DB 키가 없어 실데이터 화면 캡처 불가 → Playwright로 API 응답을 고정한 상태(로딩·빈·오류·정상 4상태)의 화면을 390px·820px로 캡처해 화면별 첨부. 실데이터 화면은 Preview/Production에서 Owner 확인.
4. **완료 판정표:** 제4부 각 화면 블록의 "완료 검증" 항목을 표로 PASS/FAIL 기록. 하나라도 FAIL·NOT_PROVEN이면 완료 보고 금지.

### 3.4 배포·앱 확인 방법
1. Git: 미커밋·미푸시 0, 브랜치 잔여 0, origin/main 포함 확인(`git log origin/main..branch`).
2. Production SHA·Ready: 세션 훅의 배포 상세 조회 차단을 이 확인 1회에 한해 해제(또는 Vercel 연결 권한 부여) → `dpl` SHA = main SHA·Ready 증명. 불가 시 Owner가 버전 화면의 웹 SHA 7자리 확인.
3. 운영 화면: 변경 화면을 운영 URL에서 확인(Owner 또는 접속 가능한 환경).
4. 앱: Android·iOS 모두 Production 웹 로드 구조(`capacitor.config.ts` `server.url`), 서비스워커 페이지 캐시 없음 → 재빌드 불필요. 앱 재시작 후 버전 화면 웹 SHA 일치 확인 = 최신 웹 증명.
5. 실기기: Samsung 폰·Xiaomi 태블릿·iPhone 14 Pro Max·웹 — 홈→프로필→거래→커뮤니티→주문→자산→설정→고객센터→뒤로 경로 점검표.

### 3.5 최종 완료 기준
1 화면별 설계 구현 완료(제4부 전 화면 PASS, S21 제외) · 2 UI·UX·CTA·SSOT 일치 · 3 진입·복귀 전환 정상 · 4 스켈레톤·오류·빈 상태 정상 · 5 경량화·재조회 제거 · 6 타 도메인 회귀 없음 · 7 Git·main·Production SHA 증명 · 8 Android·태블릿·iPhone·웹 실기기 확인. 하나라도 빠지면 완료 보고 금지.

### 3.6 Owner 승인 필요 항목
1. 이 설계서·차이표·실행 계획 승인
2. ★ 충돌 결정 확인: X1 프로필 편집 단일 시트 · X8 판매 내역 UI-6 범위 · X10 내정보 시트 280ms · X12 고객센터 포인트 행 유지 · X13 약관 3행 허브 · X16 게시판 고정글(DB·관리자 변경 필요 — 승인 시 별도 마이그레이션) · X21 충전 중복 방지 키 M6(DB)
3. 타 도메인 파일 수정 허용: 커뮤니티 like/save DELETE·`scope=own`, 거래 `/api/my/posts` opt-in 커서, 공용 전환 파일, 배달 허브 공용 주문 목록 토큰화
4. Production SHA 확인 수단(3.4-2)
5. 실기기 확인 담당(3.4-5)

---

# 제4부. 화면별 최종 설계 (부록 A–D)

(아래 부록의 K8 이후 번호는 각 파트 내부 번호이며, 제1부 X 번호가 최종 판정이다.)


---

# DIBAY 내정보 최종 통합 설계서 — Part A: 공통 규칙 · 홈(§5.1)

- 기준 트리: 로컬 HEAD `55004ef2c`(= 감사 기준). 코드 변경 0, 조회만 함.
- 우선순위: ① Owner 요구 ② 저장소 계약(03-NAVIGATION · 04-DESIGN-SYSTEM · 08-HARDLOCK · LEGACY-IA-* · `mypage-authority-contract.ts` · AGENTS.md · UI-6 HARD LOCK) ③ v2.1 ④ v2 ⑤ 감사 보고서(구현 차이 근거).
- 판정 표기: **유지**(현행이 기준과 일치) · **수정**(목적은 맞고 구현이 다름) · **신규**(코드 없음) · **선택적 원복**(Owner 승인 필요).
- K1–K7 은 `00-brief.md` 결론을 그대로 쓴다. 이 파트에서 새로 발견한 충돌은 §0 에 K8~K12 로 적는다.

---

## 0. 이 파트에서 새로 발견한 충돌·결함 (K1–K7 외)

| ID | 충돌·결함 | 근거 | 결정 |
|---|---|---|---|
| K8 | 로그아웃 확인 표면: v2.1 "로그아웃(확인 **시트**)" ↔ 계약 "Logout confirm = **modal only**" | v2.1 `dibay-mypage-v2.1-supplement.md:237` ↔ `lib/mypage/mypage-authority-contract.ts:76`, `03-NAVIGATION.md:12`(modal = logout), `components/my/settings/LogoutContent.tsx:5,95` | **계약 우선 → 모달 유지(200ms)**. 참고: 공용 확인 `MobileConfirmBottomSheet` 도 실제 표면은 `DibayConfirmDialog`(가운데 다이얼로그) — `components/ui/MobileConfirmBottomSheet.tsx:24`. 따라서 이 설계서의 "확인 시트" = `dibayConfirm`/`MobileConfirmBottomSheet` = 모달 200ms 로 통일 표기 |
| K9 | 시트 시간: 계약 sheet **280ms** ↔ 오버레이 디자인 시스템 `.dibay-overlay-sheet` **300ms**(전 도메인 공용, "do not invent alternate values") | `03-NAVIGATION.md:45` ↔ `app/dibay-overlay.css:1-4,207` | 공용 CSS 값은 바꾸지 않음(타 도메인 불변). **내정보 시트에만** 범위 한정 수식자 `data-motion-scope="mypage"`(→ 280ms) 추가. Owner 확인 항목 |
| K10 | 판매 행 동작: v2.1 S20 "⋯ 끌어올리기" · 감사 "끌어올리기 없음=FAIL" ↔ UI-6 HARD LOCK "DO NOT Restore 4-state / 끌올 / 판매취소 in UI-6 ⋮", "DO NOT Touch `/mypage/trade/sales`" | v2.1 `:270`(S20) · 감사 §4 S20 ↔ `.cursor/rules/dibay-marketplace-ui-6-my-listings-hard-lock.mdc` DO NOT | **HARD LOCK 우선**(우선순위 2). S20 담당 파트에서 끌어올리기 제외·`/mypage/trade/sales` 리다이렉트 불변으로 처리 필요. 홈은 판매 행 목적지만 영향(§2) |
| K11 | 홈 루트 네트워크 계약 검증기 **현재 FAIL**(CI 미포함이라 미발견) | `node scripts/verify-mypage-root-network-contract.cjs` → ① `MypageRequiredInfoSummary` 가 `useRepresentativeFullAddressLine` 호출(`MypageRequiredInfoSummary.tsx:120`) ② `useMypageHomeModel` 이 `resolveMypageHomeProfileRow` 대신 `…Result` 사용(`hooks/use-mypage-home-model.ts:105`) | ① 은 §2 필수정보 재설계로 해소(주소 줄 표시 제거). ② 는 검증기 정규식을 `resolveMypageHomeProfile(Row|Result)` 로 정정(같은 권위 함수 — `lib/mypage/resolve-mypage-home-profile.ts:60`). 홈 PR 에서 검증기 PASS 를 완료 조건에 포함 |
| K12 | v2 §7.10 "`samarket-components.css`·`design-tokens.css` 수정 없음" ↔ v2.1 §3.1·§3.3 "토큰 2개·수식 클래스 **추가만**" | v2 `:485` ↔ v2.1 `:93,126` | v2.1 우선(이미 토큰 2개 추가 반영 `app/design-tokens.css:150-151`). **기존 선택자·값 변경 금지, 추가만** |
| 참고 | `design-tokens.css:154` 주석 "Radius (8~16만 사용…)" 이 실제 값(4px)·C-2 개정과 불일치 | `app/design-tokens.css:154-171`, `04-DESIGN-SYSTEM.md:22` | 주석 1줄 정정(값 변경 0) |

---

## 1. 공통 규칙

### 1.1 디자인 SSOT — 판정: 유지(토큰) · 수정(하드코딩 잔존) · 신규(수식 클래스 3종)

**토큰 (값 변경 0, 사용 규칙만 고정)**

| 용도 | 토큰 / 유틸 | 값 | 근거 | 판정 |
|---|---|---|---|---|
| 시그니처(주 버튼·활성 탭 밑줄·토글 켜짐·선택 체크·행 아이콘·링크) | `--sam-primary` / `text-sam-primary` `bg-sam-primary` | `#0B421A` | `app/design-tokens.css:10,21,69` · `04-DESIGN-SYSTEM.md:20` LOCK | 유지 |
| 행 아이콘 원형 배경 | `--sam-icon-surface` / `bg-sam-icon-surface` | `#D4E9E2` | `design-tokens.css:150` · v2.1 §3.1 | 유지 |
| 행 눌림·선택 배경 | `--sam-pressed-surface` / `bg-sam-pressed-surface` | `#E8F3EE` | `design-tokens.css:151` | 유지 |
| 주 버튼 위 글자 | `--sam-icon-on-primary` | 크림 `#FFFCFC` | `design-tokens.css:152` | 수정: 언어 세그먼트 활성 `text-white`(`lib/ui/mypage-home-starbucks-styles.ts:107`) → 이 토큰 |
| 화면 배경 / 행 배경 | `bg-sam-app` / `bg-sam-surface` | 크림 / 흰색 | v2.1 §3.1 | 유지 |
| 제목 / 보조 / 메타 | `text-sam-fg` / `text-sam-muted` / `text-sam-meta` | 계약 | v2.1 §3.1 | 유지 |
| 구분선 | `border-sam-border-soft` | 계약 | 〃 | 유지 |
| 위험 / 위험 배경 | `--sam-danger` / `--sam-danger-soft` | `#d45252` / `#fdf0f0` | `design-tokens.css:38,79` | 유지 |
| 경고(필수정보) | `--sam-warning-soft` | 골드 혼합 | `design-tokens.css:77` | 유지 |
| 확인 다이얼로그 주 버튼 | `--overlay-primary` | `#085c3f` | `app/dibay-overlay.css:7` · v2.1 C-1 "오버레이 계약 소관 유지" | 유지(범위 밖) |

**반경 (C-2 기준표 — `04-DESIGN-SYSTEM.md:22`)**

| 요소 | 토큰 | 실제 |
|---|---|---|
| 화면에 붙은 그룹·카드·섹션·목록·버튼·입력·칩 | `rounded-ui-rect` (= `--sam-radius-sm`) | 4px |
| 바텀시트 위 모서리 | `--overlay-radius-xl` | 24px |
| 다이얼로그 패널 | `--overlay-radius-lg` | 16px |
| 시트·다이얼로그 안 버튼 | `--overlay-radius-md` | 12px |
| 아바타·토글·배지·FAB | `rounded-full` (`--sam-radius-pill`) | 999px |

- 금지: 내정보 코드에서 `rounded-lg`·`rounded-[14px]`·`rounded-xl` 등 임의 반경. (예: `components/addresses/AddressPlatformDetailClient.tsx:278` `rounded-[14px]` → 수정 대상.)

**글꼴·크기·간격·아이콘**

| 항목 | 규칙 | 근거 |
|---|---|---|
| 글꼴 | `font-sans` = `"Pretendard Variable", system-ui, …, "Noto Sans KR", "Apple SD Gothic Neo"` — 내정보 별도 글꼴 금지 | `app/globals.css:106-108`, `app/layout.tsx:101` |
| 화면 제목 | 17/600, 헤더 52px(`--sam-header-row-height`) | `design-tokens.css:42,199` · v2.1 §3.2 |
| 그룹 제목 | 11px bold uppercase tracking 0.08em `text-sam-muted` (현행) | `mypage-home-starbucks-styles.ts:22-23` · v2.1 §3.2 "현행" |
| 행 제목 / 오른쪽 값 / 메타 | 15/600 / **14** `text-sam-muted` / 12 | v2.1 §3.2. 현행 값 12px(`mypage-home-starbucks-styles.ts:39-40`) → 14 로 수정 |
| 입력 글자 | ≥16px | `design-tokens.css:51` · 계약 |
| 간격 | 화면 좌우 16(태블릿 20) · 그룹 간 8 · 행 내부 gap 12 · 섹션 제목 상16/하8 | `design-tokens.css:180-189` · v2 §7.1 |
| 터치 | 최소 44×44(`--sam-tap-min`), 메뉴 행 52px | `design-tokens.css:241` · `04-DESIGN-SYSTEM.md` A11y |
| 버튼 | 46px(`--sam-button-min-height`), 행 안 작은 버튼 40px | `design-tokens.css:243` |
| 아이콘 | lucide, 행 아이콘 18px·strokeWidth 2, 36px 원(`bg-sam-icon-surface text-sam-primary`); 위험 행은 `bg-sam-danger-soft text-sam-danger`; chevron 18px `text-sam-muted/45`. **1의미 1아이콘**(D18) — 홈 아이콘 중복 0 단위 테스트 | `mypage-home-starbucks-styles.ts:63-66` · v2.1 §3.2 · v2 D18 |

**상태 규칙 (7상태 — v2.1 §3.3 그대로, 구현 위치만 고정)**

| 요소 | 구현 위치(이것만 사용) | 비고 |
|---|---|---|
| 주/보조/위험 버튼 | `Sam.btn.primaryCombo/secondaryCombo/dangerCombo` (`lib/ui/sam-component-classes.ts:37`) | 로딩 = 버튼 안 스피너·폭 유지·재탭 차단 → `useMypageSubmitGuard` |
| 탭 | `Sam.tabs` (`.sam-tab` `app/samarket-components.css:540-610`) | 선택 = 그린 글자 + 3px 밑줄(현행) |
| 칩 | `Sam.chip` (`.sam-chip--active/inactive` `:702-724`) | **신규** `.sam-chip--disabled`(45%) |
| 토글 | **신규** `MyToggle` (현재 14개 파일 각자 구현 — v2.1 §3.5) | 실패 시 원위치 + 토스트 |
| 입력 | `Sam.input` | **신규** `.sam-input--error`(빨강 테두리 + 아래 안내) |
| 포커스 | **신규** `.sam-focus-ring` (2px `#0B421A` 바깥선, 2px 띄움) | `04-DESIGN-SYSTEM.md` "Focus visible 필수" |
| 메뉴 행 | `MyRow`(= `MyInfoMenuItem` 확장, §1.2) | 눌림 = `active:bg-sam-pressed-surface` 즉시(현행 `mypage-home-starbucks-styles.ts:52`) |
| 시트 | `DibayBottomSheet` / `MypageBottomSheetShell` | K9: 내정보 280ms |
| 확인 | `dibayConfirm` / `MobileConfirmBottomSheet` (= `DibayConfirmDialog`) | K8: 모달 200ms |

- 신규 3클래스는 `app/samarket-components.css` 에 **추가만**(K12). 구현 전 클래스명 기존 사용 0건 grep 확인.

**하드코딩 색 — 수정 대상 (2026-10-20 HEAD grep, hex/팔레트 클래스 개수)**

| 파일 | hex / 팔레트 | 비고 |
|---|---|---|
| `components/mypage/MyStoreOrderExpandPanel.tsx` | 38 / 42 | 주문 |
| `components/mypage/MyStoreOrdersView.tsx` | 28 / 29 | 주문(감사 `:164-167` 페이스북 색) — 배달 `BuyerDeliveryOrdersBody` 공용 → 배달 화면 동시 검증 |
| `lib/mypage/customer-center-ui.ts` | 18 / — | 고객센터 |
| `lib/ui/address-list-starbucks-styles.ts` | 14 / — | 주소(`#00704A` 등) |
| `components/mypage/MyStoreOrderDetailView.tsx` | 7 / 18 | 주문 상세 |
| `components/mypage/BuyerStoreOrderCompletedReviewBlock.tsx` | 9 / 13 | |
| `components/mypage/cs/CustomerCenterCommentsPanel.tsx` · `CustomerCenterBoardListClient.tsx` · `CustomerCenterHubClient.tsx` · `MemberCsNoteListClient.tsx` · `CustomerCenterBoardDetailClient.tsx` · `MemberCsNoteThreadClient.tsx` | 8/10 · 8/9 · 5/6 · 2/3 · 0/2 · 0/1 | |
| `components/addresses/AddressPlatformDetailClient.tsx` · `AddressManagementClient.tsx` · `AddressDesignationDupConfirmModal.tsx` | 1/8 · 0/3 · 1/0 | 주소 |
| `components/my/edit/ProfileReadonlyFields.tsx` | 4 / 4 | |
| `components/points/PointExpireList.tsx` · `PointChargeRequestList.tsx` · `PointPromotionOrderForm.tsx` · `PointChargeForm.tsx` · `app/(main)/mypage/points/promotions/page.tsx` | 0/3 · 0/3 · 0/1 · 0/1 · 0/3 | 자산 |
| `app/(main)/mypage/ads/MyAdsPageClient.tsx` · `ads/apply/MyAdsApplyPageClient.tsx` | 0/3 · 0/2 | |
| `components/mypage/TradeHubSideNav.tsx:29` · `components/mypage/tabs/CommunityTab.tsx` · `StoreOrderReviewForm.tsx` · `MyStoreInquiriesView.tsx` · `MyStoreCommerceSection.tsx` · `SummaryMenu.tsx` · `sales/SalesHistoryView.tsx` · `purchases/*` · `products/MyProductActions.tsx` | 1~3 각 | |
| `lib/mypage/store-order-receipt-image.ts` | 5 | **예외 처리**: 캔버스 이미지 생성이라 CSS 변수 직접 불가 → 한 곳 상수 + `getComputedStyle(document.documentElement)` 로 토큰 값 읽기 |

- **제외(건드리지 않음)**: `components/my/settings/VersionContent.tsx:47-48` `#D1D5DB/#6B7280`(Android 업데이트 HARD LOCK 색) · `lib/ui/admin-users-starbucks-styles.ts`(관리자) · `dibay-onboarding-starbucks-styles.ts`(온보딩) · `delivery-fab-christmas-starbucks-palette.ts`(배달). 감사가 지적한 탈퇴(`LeaveContent.tsx`)는 현재 grep 0 → S19 파트에서 재확인.
- 완료 판정: 위 파일 hex·`red-*`·`amber-*`·`gray-*`·`bg-white`·`[#…]` grep 0 + `npm run verify:design-system-hard-lock` 내정보 경로 0 위반.

### 1.2 공통 부품 목록 — 위치 `components/mypage/ds/` (내정보 전용, 관리자·타 도메인 import 금지)

| 부품 | 판정 | 목적 | props 요약 | 재사용·대체 | 파일 |
|---|---|---|---|---|---|
| `MySubpageHeader` | 유지 | 하위 화면 헤더(제목·뒤로: 히스토리 우선, 직접 진입 `backHref`) | `title/titleKey, backHref="/mypage", preferHistoryBack` | 47개 파일 사용 — API 변경 금지 | `components/my/MySubpageHeader.tsx:57` |
| `MyScreen` | 신규 | 하위 화면 골격: 헤더 + 본문 폭(§1.8) + 상태 슬롯 + 하단 CTA 슬롯 | `title, backHref, preferHistoryBack, template: "list"\|"detail"\|"form"\|"settings"\|"hub"\|"board"\|"asset"\|"static", state?: MyStateViewProps, stickyCta?: ReactNode, children` | `MyPageStackShell`(`components/mypage/mobile/MyPageStackShell.tsx`, 사용 3곳)을 **흡수·대체**(성능 마크 `dibayMyInfoPerfMark` 유지). 내부는 `MySubpageHeader` | `ds/MyScreen.tsx` |
| `MyGroup` | 신규(얇은 래퍼) | 그룹 제목 + 행 묶음 | `title?, children` | `MyInfoMenuSection`(`components/mypage/myinfo/MyInfoMenuSection.tsx:14`)을 그대로 감싸 이름만 통일. IA 권위 파일이므로 `MyInfoMenuSection` 자체는 유지 | `ds/MyGroup.tsx` |
| `MyRow` | 수정(확장) | 아이콘·제목·오른쪽 값·뱃지·chevron 한 행 | 기존 `MyInfoMenuItem` props + **신규** `value?: ReactNode`, `valueState?: "loading"\|"ready"\|"empty"`, `badge?: {count:number; tone:"danger"\|"primary"}`. 값과 chevron **동시 표시**(현행은 `trailing="value"` 시 chevron 숨김 `MyInfoMenuItem.tsx:66`) | `MyInfoMenuItem` 을 확장해 `MyRow` 로 export(별도 신규 행 금지). `MyPageMobileMenuRow`·`SettingsRow` 계열은 사용처 전환 후 삭제(v2.1 §3.5) | `myinfo/MyInfoMenuItem.tsx` + `ds/MyRow.ts`(re-export) |
| `MyToggle` | 신규 | 토글 스위치 1종 | `checked, onChange(next)→Promise<boolean>, disabled, ariaLabel` — 낙관 반영 → 실패 시 원위치 + `showMypageToast(…,"error")` | 14개 개별 구현 대체 | `ds/MyToggle.tsx` |
| `MyStateView` | 신규 | 스켈레톤 n행 / 빈 / 오류+재시도 | `kind: "loading"\|"empty"\|"error"`, `template`(스켈레톤 모양 §1.5), `rows=5`, `empty:{icon,title,body,cta?}`, `error:{message?, onRetry}` | 빈 = `SellerHubEmptyState`(`components/mypage/seller/SellerHubEmptyState.tsx`) 내부 사용. `MainFeedRouteLoading`(피드 모양) 내정보 사용 **금지** | `ds/MyStateView.tsx` |
| `MyListPager` | 신규 | 커서 더 보기(하단 자동 로드 + 실패 시 [다시 시도]) | `hasMore, loading, error, onLoadMore` | 내부 `runSingleFlight`(`lib/http/run-single-flight.ts:24`) | `ds/MyListPager.tsx` |
| `MyStickyCta` | 신규 | 하단 고정 주/보조 CTA, 키보드 위·safe-area, **변경 있을 때만 활성** | `primary:{label,onPress,disabled,loading}, secondary?, dirty` | `useFormKeyboardViewport`(`lib/ui/use-form-keyboard-viewport.ts`), `ProfileEditBottomSaveBar` 방식 | `ds/MyStickyCta.tsx` |
| `MobileConfirmBottomSheet` / `dibayConfirm` | 유지 | 파괴적·비가역 확인 | 현행 | 실제 표면 = `DibayConfirmDialog`(모달 200ms) | `components/ui/MobileConfirmBottomSheet.tsx`, `components/ui/dibay-overlay/DibayAppDialogProvider.tsx:181` |
| `DibayBottomSheet` · `DibayActionSheet` | 유지 | 짧은 입력 / 선택지 2~6 | 현행 | — | `components/ui/dibay-overlay/` |
| `MypageToastHost` | 수정 | 토스트 1개 + **[되돌리기] 액션** | `showMypageToast(message, tone, opts?: {action?: {label, onPress}})` | 현행 `lib/mypage/mypage-toast.ts:11` 확장. 변경점: 패널 `pointer-events:auto`(현행 전체 none `MypageToastHost.tsx:45`), 등장·퇴장 220ms, 위치 §1.3 | `components/mypage/MypageToastHost.tsx` |
| `CurrencyAmount` / `formatMoneyPhp` | 유지 | 포인트 / 페소 금액 | 현행 | `toLocaleString`·`₱` 직접 조합 금지(v2 §7.9) | `components/currency/CurrencyAmount.tsx`, `lib/utils/format.ts` |
| `SamarketThumbnail` | 유지 | 목록 썸네일(lazy) | 현행 | 감사 §5-6 PASS | `components/common/SamarketThumbnail.tsx` |
| `useMypageSubmitGuard` | 신규 | 중복 제출 방지(in-flight ref + 버튼 비활성) | `const {run, pending} = useMypageSubmitGuard(); run(async()=>…)` | 화면별 개별 구현 대체 | `lib/mypage/use-mypage-submit-guard.ts` |
| `useMypageTabParam` | 신규 | `?tab=` 유지(§1.4) | §1.4 | — | `lib/mypage/use-mypage-tab-param.ts` |
| `formatMypageDate` | 신규 | 날짜 포맷 SSOT(회원 언어 locale, 상대시간은 `formatRelativeTimeAgo`) | `formatMypageDate(iso, {style:"date"\|"datetime"\|"relative"})` | 44곳 개별 포맷 대체 | `lib/mypage/format-mypage-date.ts` |

- 사용하지 않는 v2 부품: `MyProfileHeader`·`MyAssetBar` — **미채택**. 근거: 자산 요약 바를 프로필 아래 두는 v2 §3.2(B) 는 기능 보존표 "points card | MOVE after store"(`LEGACY-IA-FEATURE-PRESERVATION.md:14`)·IA 순서(`LEGACY-IA-PHASE1-CONTRACT.md:13`)와 충돌. 프로필은 현행 `MypageProfileSummary` 를 수정 사용(§2).
- ESLint `no-restricted-imports`: `components/mypage/ds/*` 를 `components/admin/**`·`app/admin/**` 에서 import 금지(v2 §7.3).

### 1.3 화면 전환 — 판정: 신규(내정보 하위 push/back 300ms) · 수정(토스트 220ms, 시트 280ms) · 유지(모달 200ms)

**규칙 (Motion Contract `03-NAVIGATION.md:38-48` = `MYPAGE_MOTION_MS` `mypage-authority-contract.ts:44-52`)**

| 동작 | 시간·방향 | 적용 |
|---|---|---|
| push | 300ms, 새 화면이 **오른쪽→왼쪽** 진입, 이전 화면은 왼쪽으로 밀려 나감(트랙 동시 이동) | 내정보 경로 ↔ 내정보 경로, 깊이 증가 또는 같은 깊이 이동 |
| back | 300ms, push 의 역방향(이전 화면이 왼쪽→오른쪽 복귀) | 헤더 ←, Android 시스템 뒤로, 브라우저 뒤로, iOS 제스처 — 모두 같은 결과(`03-NAVIGATION.md:16-17`) |
| sheet | 280ms 아래→위 | 프로필 편집(K1)·내정보 시트 전부(K9 범위 한정) |
| modal | 200ms fade+scale | 로그아웃·확인 다이얼로그(현행 `--overlay-motion-enter: 200ms` `app/dibay-overlay.css:53` — 유지) |
| toast | 220ms(등장 opacity 0→1 + translateY 8px→0, 퇴장 역순) | `MypageToastHost` (현재 애니메이션 없음) |
| 쿼리만 변경(`?tab=`) | 전환 없음 | pathname 동일 → `kind="none"` (`route-transition-enter-kind.ts:162`) |
| 하단 탭 ↔ 내정보 홈 | **불변**(메인 셸 440ms) | `route-transition-config.ts:138` |
| reduced-motion | 모든 전환·토스트·시트 애니메이션 제거(즉시 표시) | `04-DESIGN-SYSTEM.md` Reduced Motion · 현행 `globals.css:880-904`, `dibay-overlay.css:465-472` 패턴 |

**구현 위치 — 공용 파일에 내정보 규칙만 추가(다른 도메인 분기 불변)**

1. `lib/mypage/mypage-stack-slide.ts` **신규**(`lib/trade/marketplace/marketplace-seller-hub-slide.ts` 와 같은 형태)
   - `isMypageStackPath(p)`: `/mypage`·`/mypage/**`·`/my`·`/my/**`.
   - `mypageStackDepth(p)`: `/mypage`(`/my`) = 0. 나머지는 접두 제거 후 세그먼트 수. 단 `section/<group>/<item>` 은 1단계로 센다(예: `/mypage/section/settings/notifications` = 1, `/mypage/store-orders/abc` = 2, `/mypage/store-orders/abc/review` = 3, `/mypage/points/charge` = 2).
2. `components/route-transition/route-transition-config.ts`
   - `RouteTransitionEnterKind`(`:20-42`)에 `"mypage-stack-forward" | "mypage-stack-back"` 추가.
   - `routeTransitionPushAxisForKind`(`:152`): forward→`"rtl"`, back→`"ltr"`.
   - `routeTransitionClassForKind`(`:208`): `mypage-stack-route-enter-forward` / `…-back`(reduced-motion·교차그룹 등 push 트랙을 못 쓰는 경로의 단일 화면 대체 애니메이션).
   - `routeTransitionExitClassForKind`(`:246`)·`ownerStackRouteTransitionClassForKind`(`:274`): 두 kind 모두 `null`(exhaustive switch 갱신).
   - `ROUTE_TRANSITION_ENTER_CLASSES`(`:184`)에 두 클래스 추가.
   - 상수 `MYPAGE_STACK_KINDS` + `isMypageMotionKind(kind)` = `{mypage-stack-*, profile-edit-*, address-platform-*}`.
3. `components/route-transition/route-transition-enter-kind.ts` `computeRouteTransitionEnterKind`(`:154`)
   - **삽입 위치**: `isStoresOwnerStackPath(nextPath)` 분기(`:293-294`) **다음**, `/mypage/section/store` popstate 분기(`:295`) **앞**.
   - **조건**: `isMypagePath(prevPath) && isMypagePath(nextPath)` (양쪽 모두 내정보일 때만). 한쪽이라도 다른 도메인이면 기존 분기 그대로.
   - **결정**: `opts.popstateBack` → `mypage-stack-back`; 아니면 `dNext < dPrev` → back, 그 외(깊어짐·같은 깊이) → forward(`lastForwardAxisRef.current="rtl"`).
   - 앞선 분기가 먼저 잡는 쌍은 **그대로 둠**: 프로필 편집(`:184-187`)·주소 플랫폼(`:188-197`) — kind 는 유지하되 시간만 300ms 로(아래 4·5). 판매자 허브 스택 `/mypage/products`·`/mypage/points/promotions`(`:211-232`, `marketplace-seller-hub-slide.ts:7-12`)는 거래 도메인 소유·UI-6 HARD LOCK 이므로 **불변(440ms)** — Owner 확인 항목으로만 표기.
   - `/mypage/section/store` 분기(`:295-308`)는 내정보↔내정보 쌍이 새 분기로 먼저 처리되므로, 남는 경우(다른 도메인 → 매장 섹션)만 기존대로.
4. `components/route-transition/AppRouteTransition.tsx` — 시간 주입 1곳(내정보 kind 한정)
   - push 세션 시간 계산(`:597-599`, 레거시 dual-panel `:447`)에서 `isMypageMotionKind(kind) ? MYPAGE_MOTION_MS.push : resolveMainShellPushDurationMs(…)`. 트랙 CSS 는 이미 `--main-shell-push-ms` 변수로 시간을 받음(`:866`).
   - `resolveMainShellPushDurationMs`(`lib/navigation/resolve-main-shell-push-duration-ms.ts`)는 **수정하지 않음**(거래 `/market` 250ms 규칙 보호).
   - 확인 필요: 내정보 하위 화면이 `hubChromeHeader` 폴백(`beginHubFallbackEnter` `:249`, CSS 440ms 고정)을 타는지 구현 첫 단계에서 `data-route-transition-kind` 로 확인. 탄다면 폴백 enter 에도 같은 `--main-shell-push-ms: 300ms` 를 내정보 kind 일 때만 지정.
5. `app/globals.css`
   - `.mypage-stack-route-enter-forward/back`(300ms, `cubic-bezier(0.25,0.9,0.35,1)`, 기존 keyframes `profile-edit-route-enter-*-kf` 재사용) 추가, reduced-motion 목록(`:880-904`)에 추가.
   - 프로필 편집·주소 플랫폼 클래스 시간 440/360 → 300/300(`:858,864,871,877`). 이 클래스는 내정보 경로에서만 쓰임(`isProfileEditPath`·`isMypageAddress*Path` = `/mypage/**` 전용 — `lib/mypage/mypage-mobile-nav-registry.ts:19-25`, `lib/addresses/mypage-addresses-return-to.ts:2-17`).
6. 테스트(`components/route-transition/route-transition-enter-kind.test.ts`)
   - 추가: `/mypage`→`/mypage/offers` forward, 역 popstate back, `/mypage/store-orders`→`/mypage/store-orders/x` forward, 같은 깊이 forward, `?tab=` 변경 none.
   - 회귀 고정(기대값 불변): 메인 탭 5종 왕복, `/mypage`↔`/stores/owner/apply`(`:256-273`), `/mypage`↔`/stores/owner`(`:276-293`), `/mypage/products`→`/post/x` none(`:174`), 판매자 허브, 배달·커머스 스택, 메신저 suppress.
   - 변경되는 기존 기대값 1건: `:327` "profile edit → mypage subsection keeps subtle" → `mypage-stack-back`(깊이 감소) — 의도된 변경으로 PR 에 명시.

**클라이언트 리다이렉트**: 내정보 안 클라이언트 리다이렉트(`MypageGuestSubrouteRedirect`, 레거시 탭 `MyContent` `guardedRouterReplace`)는 `router.replace` 유지. pathname 이 바뀌면 forward 가 한 번 재생될 수 있음 → 구현 시 리다이렉트 전용 경로는 서버 `redirect()`(HTTP) 우선(현행 `section/[section]/[item]/page.tsx:19-25` 방식).

**토스트 위치**: 하단 탭바가 보이는 화면 = 탭바 위 16px, 탭바 없는 하위 화면 = `safe-bottom + 16px`, `MyStickyCta` 있는 화면 = CTA 위 8px. 현행 고정 `bottom-[calc(76px+safe)]`(`MypageToastHost.tsx:45`) → 수정. 표시 3초(v2.1 §3.3), 버튼 최대 1개.

### 1.4 스크롤·탭·필터 복원 — 판정: 유지(K3 전역 manual) · 수정(홈 TTL) · 신규(하위 목록 복원·`?tab=`)

- **K3**: `history.scrollRestoration="manual"`(`lib/mypage/mypage-hub-scroll-restore.ts:28-38`) **유지**. 배달(`lib/dibay/delivery-list-scroll-restore.ts:62`)·거래(`lib/trade/location/trade-market-list-scroll-restore.ts:143`)가 같은 전제로 동작. v2 §7.8 "전역 변경 금지"(`dibay-mypage-v2-integrated-design.md:470`) 문구는 현실과 충돌로 표기만(원복 안 함).
- **홈 복원**: 현행 유지(클릭 시 저장+대기 표시, popstate 목적지가 홈일 때만 대기 — D21 이미 수정 `use-mypage-hub-scroll-restore.ts:24-31`). **수정 1건**: 저장 유효시간 60초(`mypage-hub-scroll-restore.ts:19`) → 30분. 근거: 하위 화면에서 60초 넘게 머물면 뒤로 와도 맨 위로 감(Owner 요구 "스크롤 유지" 위반). 복원 시점 = 메뉴 행이 정적이라 첫 렌더 직후 가능(현행 `useLayoutEffect`), 배너가 비동기로 끼면 위치가 밀리므로 배너는 §2 캐시 규칙으로 첫 렌더에 포함.
- **하위 목록 복원(신규)** `lib/mypage/use-mypage-list-restore.ts`
  - 키 = `pathname + "?" + 정렬된 search`(탭·필터 포함). 저장소 = `sessionStorage` `dibay:mypage-list:<key>` `{y, loadedPages, savedAt}`, 30분.
  - 저장: `subscribeAppShellScroll`(`lib/layout/main-app-scroll-root`) 스로틀 + 목록 행 링크 클릭 캡처 시.
  - 데이터: 목록 화면은 모듈 메모리 캐시(키별, 최근 10개, 5분)에 **이미 불러온 페이지 전체**를 보관 → popstate 복귀 시 캐시를 동기 렌더 → `restoreMypageHubScrollY`(`mypage-hub-scroll-restore.ts:110`) 재시도 방식으로 위치 복원 → 백그라운드 재검증(`useRefetchOnPageShowRestore` `lib/ui/use-refetch-on-page-show.ts:24`). 캐시가 없으면 첫 페이지 로드 후 저장 y 까지 `MyListPager` 로 추가 로드하지 않음(최대 1페이지 내에서만 복원, 넘으면 맨 위).
  - 새로 진입(푸시)할 때는 복원하지 않고 맨 위.
- **`useMypageTabParam` 설계**
  ```ts
  function useMypageTabParam<T extends string>(o: {
    values: readonly T[]; defaultValue: T; key?: string /* 기본 "tab", 쿠폰 호환 "couponTab" */;
  }): readonly [T, (next: T) => void]
  ```
  - 읽기: `useSearchParams().get(key)`; 목록 밖 값 → `defaultValue`(URL 은 건드리지 않음).
  - 쓰기: `window.history.replaceState(null, "", url)` — **replace**(탭 전환이 뒤로가기 기록을 쌓지 않음, 뒤로 = 화면 이탈). 기본값이면 파라미터 제거. 서버 컴포넌트 재요청을 피하려고 `router.replace` 대신 네이티브 history 사용(구현 전 `node_modules/next/dist/docs/` 의 `useSearchParams`·history 연동 절 확인).
  - 탭별 스크롤: 전환 직전 현재 탭 y 저장 → 새 탭 저장 y 복원(없으면 맨 위). 탭 데이터는 탭별 메모리 캐시 — 이미 불러온 탭으로 돌아가면 스켈레톤 없이 즉시.
  - 필터 칩도 같은 훅(`key:"filter"`)으로 유지.
  - 기존 쿠폰·상품권 `couponTab`(`components/orders/customer-commerce/CustomerCouponWalletBody.tsx:55-64`)은 동작 유지, 훅으로 이관만.

### 1.5 스켈레톤 규칙 — 판정: 신규(구조 일치) · 수정(section/loading 삭제)

| 화면 유형 | 스켈레톤 모양(실제 레이아웃과 같은 높이·간격) | 실제로 먼저 그리는 것 |
|---|---|---|
| T1 목록 | 행 5개: (썸네일 있는 목록) 56×56 4px 블록 + 제목 줄 60% + 메타 줄 40% + 오른쪽 값 48px / (텍스트 목록) 제목 70% + 메타 40% | 헤더, 탭 바(개수 없이 라벨만), 필터 칩 |
| T2 상세 | 요약 블록(상태 줄 40% + 제목 70%) + 섹션 2개(섹션 제목 + 행 3개) | 헤더. 하단 CTA 는 **데이터 전에는 그리지 않음**(가짜 버튼 금지) |
| T3 폼 | 라벨 + 46px 입력 상자 n개(값 자리만 회색) | 헤더, 라벨, 하단 저장 바(비활성) |
| T4 설정 | 행 제목은 실제 텍스트, 토글 자리만 51×31 pill 회색(비활성) | 헤더, 그룹 제목, 행 제목 |
| T5 허브 | 요약 칸만 스켈레톤 | 링크 행 전부 |
| T6 게시판 | T1 과 동일(텍스트 목록) | 헤더, 검색 |
| 자산(포인트 등) | 잔액 블록(120×28) + 소멸 예정 줄 + T1 행 5개 | 헤더, 탭 |

- 스켈레톤 블록 = `bg-sam-border-soft/70` `rounded-ui-rect`, 움직임 = `motion-safe:animate-pulse` 만(reduced-motion 이면 정지 — `04-DESIGN-SYSTEM.md` Skeleton LOCK).
- **보여주지 않는 경우**: 정적 화면(캐시 삭제·약관 허브·탈퇴 안내·결제정보 일반 회원 안내·언어·버전의 정적 부분) — 즉시 본문. 재진입 시 메모리/세션 캐시가 있으면 캐시를 그리고 조용히 재검증(스켈레톤 0). 탭 전환 시 이미 본 탭 = 즉시, 처음 보는 탭 = **목록 영역만** 스켈레톤(헤더·탭 유지). 저장·삭제 중 = 버튼 스피너만(화면 비우기 금지 — 감사 S01 "저장 후 깜빡임"). 재조회 = 기존 내용 유지 + 상단 2px 진행선(v2 §7.7).
- **`app/(main)/mypage/section/loading.tsx` 삭제** — 이유: ① 일반 블록 4개로 어떤 섹션 화면 구조와도 맞지 않음(`section/loading.tsx:27-32`), Owner 요구 "구조 일치" 위반 ② `loading.tsx` 는 params 를 받지 않아 화면 유형을 알 수 없음 ③ 페이지 RSC 가 데이터를 기다리지 않게 바꾸면(§1.7) 경계가 필요 없음 — 첫 페이인트는 `MyScreen`(실제 제목) + 레지스트리의 화면 유형 스켈레톤. 같은 이유로 `section/[section]/[item]/page.tsx:28` 의 `MainFeedRouteLoading` Suspense 폴백도 `MyStateView` 로 교체. 탭 직후 즉각 반응은 행 눌림 색(`active:bg-sam-pressed-surface`)과 300ms push 가 담당.
- `app/(main)/mypage/loading.tsx`(홈, `return null`)는 **유지**(하단 탭 전환에 스켈레톤 금지 계약 — 파일 주석).
- 화면 유형 SSOT: `lib/mypage/mypage-mobile-nav-registry.ts` 항목에 `template` 필드 추가(섹션 화면), 개별 라우트는 `MyScreen template` prop.

### 1.6 로딩·빈·오류·재시도 · 확인 vs 되돌리기 — 판정: 수정

| 상태 | 규칙 |
|---|---|
| 첫 로딩 | §1.5 스켈레톤. 무한 로딩 금지 — 모든 요청에 실패 경로(타임아웃 15초 → 오류 상태) |
| 빈 | `MyStateView kind="empty"`(아이콘 + 한 줄 제목 + 보조 문구 + 주 CTA 0~1). 필터·탭 결과 없음은 "이 탭에 항목이 없어요" 류 문구, 화면 전체 빈 화면과 구분 |
| 오류 | `MyStateView kind="error"` + [다시 시도]. **오류를 빈 목록·0 으로 표시 금지**(v2.1 `:247`). API 는 실패 시 5xx/오류 응답(빈 배열 성공 금지 — v2 §7.7). 남은 위반(감사 §1): 판매 내역·내가 쓴 글·홍보·광고·찜 매장 탭·보낸 후기·주소 검색·공지 API → 각 화면 파트에서 수정 |
| 부분 오류 | 화면의 보조 영역(개수·요약)만 실패 → 그 칸만 비우고 본문은 표시(오류 배너 금지) |
| 401 | 로그인 화면(복귀 경로 유지). 그 외 오류는 화면 내 오류 상태(로그인 이동 금지 — v2 §6.3) |
| 확인(모달 200ms) | **되돌릴 수 없거나 남에게 영향** 있는 동작: 탈퇴·로그아웃·주문 취소·제안 거절·아이디 확정(1회)·연결 로그인 해제·차단/숨김 해제·캐시 삭제·전체 삭제·글/댓글 삭제·충전 요청 취소·광고 취소. 위험 버튼 = 빨강, 취소 왼쪽 |
| 되돌리기 토스트(확인 없음) | **본인만 영향 + 같은 API 로 원상복구 가능**한 해제: 찜 해제·좋아요 해제·저장 해제(v2.1 `:247`). 동작 = 목록에서 즉시 제거(낙관) + 서버 해제 호출 → 토스트 "해제했어요 [되돌리기]" 3초 → [되돌리기] 시 같은 리소스 재등록 API 호출 후 원래 위치에 복귀. 서버 해제 실패 시 항목 복귀 + 오류 토스트 |
| 저장 | `useMypageSubmitGuard` + 버튼 스피너 → 성공 토스트 "저장했어요" → 이전 화면 또는 제자리(화면별) |

### 1.7 성능·캐시 — 판정: 수정

1. **설정·정적 화면은 내정보 전체 데이터를 기다리지 않음**
   - 서버: `section/[section]/[item]/page.tsx:44` `loadMypageServer()` → `loadMypageServerShell()`(`lib/my/load-mypage-server.ts:150`; 허브 extras·대시보드 개수·주소 스냅샷 3개 쿼리 제거, 같은 `cache()` 코어 1회).
   - 클라: `MyPageItemRouteClient.tsx:76-82` 의 `loading` 전체 가림 제거. 레지스트리 항목에 `needsProfile: boolean` — `false`(캐시·버전·언어·약관·탈퇴 안내·채팅 설정 등)는 즉시 렌더, `true` 는 `MyStateView` 스켈레톤을 본문에만.
2. **홈은 숫자용 요청 1회**: `GET /api/me/mypage-summary` 단일 비행(§2.2). 홈에서 `/api/me/points`(이력 30건까지 읽음 — `app/api/me/points/route.ts:66-90`)·`my_page_banners` 직접 조회(`MypageHomeCmsBanner.tsx:22-37`) 제거.
3. **요청 예산(첫 진입, 캐시 없음)**

   | 화면 | 첫 페인트 전 서버 대기 | 첫 페인트 후 클라 요청 |
   |---|---|---|
   | 홈 | 소형 시드 2개(`app/(main)/mypage/page.tsx:12-15`) | ≤4: 프로필(부트 캐시 없을 때만) · 주소 기본값 · summary · 관리자 확인 |
   | T1/T2/자산 | 0(파라미터만) | 본 데이터 1 + 보조(개수) ≤1 |
   | T3/T4 | 0 | ≤1 |
   | 정적 | 0 | 0 |
   | 재진입(5분 내) | 0 | 0 차단, 백그라운드 재검증 ≤1 |
4. **재진입 캐시**: 목록·상세·요약은 viewer 키 메모리 캐시(5분) + 홈 요약만 `sessionStorage` 스냅샷(§2.2). 로그아웃·계정 전환(`TEST_AUTH_CHANGED_EVENT`, auth 변경) 시 전부 삭제.
5. **중복 방지**: 같은 키 요청은 `runSingleFlight`. 탭·필터 전환은 이미 받은 탭 재요청 금지(명시적 당겨서 새로고침·화면 복귀 재검증만).
6. 성능 전용 검증은 AGENTS.md 규정대로 hot-path 변경(홈 summary·전환)에만 — 홈 요청 수 측정 1회.

### 1.8 모바일·태블릿 — 판정: 수정

| 구간 | 규칙 | 현재 | 근거 |
|---|---|---|---|
| 모바일 ≤767 | 1열, 좌우 16px, 행 52px | `px-4`(`mypage-home-starbucks-styles.ts:13`) 일치 | Phase1 §3 |
| 태블릿 768–1199 | **같은 1열**, 가운데 정렬, 본문 최대 폭 **40rem(640px)**, 행·본문 좌우 **20px** | 폭 `max-w-[42rem]…xl:max-w-[66rem]`(`lib/ui/app-content-layout.ts:12-13`), 행 패딩 `sm:px-5`(640px부터) | v2 §5 `:277`, v2.1 `:242`, Phase1 §3(2열 금지) |
| 데스크톱 ≥1200 | 태블릿과 동일 | 〃 | Phase1 §3 |

- 구현: `lib/ui/mypage-responsive-breakpoints.ts` 에 `MYPAGE_COLUMN_MAX_WIDTH_CLASS = "max-w-[40rem]"`, `MYPAGE_GUTTER_X_CLASS = "px-4 md:px-5"` 신설 → 홈 본문(`MYPAGE_HOME_BODY_CLASS`)·`MyContent` 래퍼(`app/(main)/my/MyContent.tsx:157`)·`MyScreen` 이 사용. `APP_MAIN_COLUMN_MAX_WIDTH_CLASS`(앱 공용)는 **수정 안 함**. 행 패딩 `sm:px-5` → `md:px-5`.
- Android·iPhone 은 운영 웹을 그대로 로드(감사 §3) → 코드 동일. 실기기 확인은 R9(Owner).

---

## 2. 홈 (§5.1)

### H0 내정보 홈 `/mypage` — 판정: 수정 (현재 감사 판정: PARTIAL)

- **경로 / 진입 메뉴**: 하단 탭 「내정보」 `/mypage`(`/my` 별칭). 하단 탭 재탭 = 맨 위 스크롤만(`mypage-authority-contract.ts:7`).
- **구조·콘텐츠 순서** (IA 계약 9그룹 — `LEGACY-IA-PHASE1-CONTRACT.md:10-18`, v2.1 `:226-238`)

  | # | 블록 | 행(표시 순서) → 목적지 | 오른쪽 값 | 판정 |
  |---|---|---|---|---|
  | 1 | 프로필 | 사진 56 · 닉네임 · @아이디 · 소개 1줄 · [프로필 수정] → **시트**(K1) / 매너 배터리 행 → `/mypage/trust` | 매너 `72%` | 유지(+K1) |
  | 1-a | 필수정보(**미완료 항목만**, 매너 행 아래 인라인) | 아이디 없음 → 아이디 시트 · 전화 미인증 → 전화 인증 시트 · 기본 주소 없음 → `/mypage/addresses` | CTA 문구 | 수정 |
  | 1-b | 관리자 배너(활성 1건, 닫기 가능 배너는 기기 저장) | 배너 링크 | — | 유지(위치·데이터 경로 수정) |
  | 2 | 활동 | 진행중 거래 → `/mypage/products` · 거래 채팅 → `/community-messenger/trade-chats` · 찜 → `/mypage/trade/favorites` · 가격 제안 → `/mypage/offers` · 최근 본 상품 → `/mypage/recent-viewed` · 거래 후기 → `/mypage/trade/reviews` · 내가 쓴 글 → `/mypage/community-posts` · 댓글·반응 → `/mypage/community-activity` | 판매중 n · 안읽음 배지 · n · 받은 대기 n · — · — · n · — | 수정(한 그룹으로 통합·값) |
  | 3 | 매장·주문 | [매장 신청 / 승인 진행 사항(뱃지) / 매장 진입](권한별) · 주문 내역 → `/mypage/store-orders` · 배달K 라이더 → `/mypage/section/store/rider` · 매장 문의 내역 → `/mypage/store-inquiries` | 심사 뱃지 · 진행중 n · — · — | 유지(+값) |
  | 4 | 자산 | 포인트 → `/mypage/points` · 쿠폰 → `/mypage/coupons` · 상품권 → `/mypage/gift-certificates` · 내 홍보/광고 → `/mypage/ads` · 충전 신청 → `/mypage/points/charge` · 회원 혜택 → `/mypage/benefits` | 잔액 · n장 · n장 · (S46 진행중 탭 구현 후) 진행 n · — · — | 유지(+값) |
  | 5 | 계정 | 계정 관리 → `/mypage/account` · 주소관리 → `/mypage/addresses` · 결제정보 → `/mypage/section/store/payment` · 개인/보안 → `/mypage/section/settings/device-permissions` · 알림 → `/mypage/section/settings/notifications` · 언어(토글, K4) | — · 대표 동네 · — · — · — · (세그먼트가 현재 값) | 유지(+값) |
  | 6 | 서비스 | 모아보는 사용자 · 차단한 사용자 · 숨긴 사용자 · 판매 글 동네 일괄 변경 · 채팅 설정 · 캐시 삭제 · 버전 정보 (자동재생·개인화·국가 = 홈 행 HIDE, C-4 `LEGACY-IA-FEATURE-PRESERVATION.md:23`) | 버전 행만 `1.2.4 (7)` | 유지(+값) |
  | 7 | 고객지원 | 고객센터 → `/mypage/customer-center` | — | 유지 |
  | 8 | 정책 | 이용약관 · 개인정보처리방침 · 사업자 정보 | — | 유지 |
  | 9 | 위험 | 탈퇴하기 → `/mypage/section/settings/leave` · 로그아웃(모달, K8) | — | 유지 |
  | 끝 | 관리자(권한자만) | 관리자 콘솔 | — | 수정(위치, K5) |

  - 구매 내역 행 없음(K7, UI-6 "DO NOT Restore buyer purchase list").
  - 「활동」 통합: v2.1 `:18`(§0.1 "커뮤니티는 활동 그룹 안") · `:230`. 현재 거래·커뮤니티 두 그룹(`MyPageHomeDashboard.tsx:95-96`). → `MyInfoTradeMenuSection` 이 `MYPAGE_HOME_TRADE_ITEMS` 다음에 `MYPAGE_HOME_COMMUNITY_ITEMS` 를 같은 그룹으로 렌더, 그룹 제목 신규 키 `mypage_comp_section_activity`(활동/Activity). `MyInfoCommunityMenuSection` export 는 비로그인·기존 import 호환용으로 남기되 홈에서는 렌더하지 않음. 검증기 요구 이름(`MyInfoTradeMenuSection`·`MYPAGE_HOME_TRADE_ITEMS` — `scripts/verify-mypage-authority-contract.mjs:49-58`) 유지.
  - 라벨: 기존 키 값 변경 금지(타 화면 공유). v2.1 명칭과 다른 3개만 **홈 전용 신규 키**: 거래 채팅(`nav_trade_hub_chat`="채팅" 공유 키 대신), 가격 제안("내 가격 제안" 대신), 댓글·반응("댓글/활동" 대신). 나머지는 현행 키 유지.
  - **K5 관리자 위치 = 맨 끝(위험 그룹 다음)**. 근거: ① IA 계약 9그룹에 관리자 없음 — 위치 미규정(`LEGACY-IA-PHASE1-CONTRACT.md:10-20`, 보존표에 행 없음) ② 계약 다음 우선 문서 v2.1 표에서 마지막 행(`:238`) ③ 컴포넌트 계약 주석 "내정보 홈 **하단**"(`components/mypage/MyPageAdminMenuEntry.tsx:82`), 설정 섹션도 목록 하단(`MyPageSectionMenuClient.tsx:50`) ④ 이 행은 클라이언트 이동 시 access-check 후 **늦게 나타남**(`MyPageAdminMenuEntry.tsx` 문서 시드 규칙) → 중간에 있으면 아래 3개 그룹이 밀리고 스크롤 복원이 어긋남; 맨 끝이면 이동 0. v2 §3.2 의 "위험 앞(J)"은 우선순위 4 라 채택 안 함. 표시 로직(`isRouteAdmin` 시드·재검증)은 변경 없음.
- **표시(프로필·숫자·상태)**
  - 이름 = `resolveMypageSelfDisplayName`(nickname SSOT, `lib/mypage/mypage-home-store.ts:76`), @아이디 = `evaluatePublicIdProfileView().atDisplay`, 소개 없으면 "소개를 추가해 보세요"(현행 `MypageProfileSummary.tsx:53-58`).
  - 매너 % = `buildMemberTrustSurface({trust_score, manner_score})`(`lib/trust/member-trust-surface.ts:45`) — `/mypage/trust` 와 같은 함수. **수정**: 세션 lite 로 그린 직후(`projection.profile=null`)에는 기본값으로 계산된 %가 잠깐 보였다가 바뀜(`MypageProfileSummary.tsx:60-63`, lite 에 trust 필드 없음 `mypage-home-store.ts:52-64`) → `profile` 이 없으면 % 자리 작은 스켈레톤, lite 스냅샷에 `trustScore/mannerScore` 2필드 추가.
  - 숫자 표시 규칙: 개수 `>0` 만 표시, 알려진 0 = 표시 안 함, 모름(실패·미응답) = 비움. **0 을 실패 대체값으로 쓰지 않음**. 포인트는 금액이라 0·음수 그대로 표시(`CurrencyAmount` `compactPoint`), 모름 = "—". 거래 채팅 안읽음 = 빨간 pill 숫자(99+), 나머지 = 14px 보조색 텍스트 + chevron.
- **필수정보 (1-a) 상세 — 수정**
  - 표시 조건(계약 `LEGACY-IA-PHASE1-CONTRACT.md:24-27`: 미완료 → 인라인, 완료 → 숨김): 항목별로 **미완료일 때만** 1줄. ① 아이디: `handle` 값 없음(복구 필요)일 때만 — 1회 변경 가능 상태는 요구사항이 아님(`lib/profile/member-account-status.ts:8` "HANDLE custom change is never an action requirement") → 홈에서 제거, S03 계정 화면 담당 ② 전화: `!phone.verified` ③ 주소: `!address.registered`. 셋 다 완료면 블록 자체 없음(현재 항상 3줄 카드 `MypageRequiredInfoSummary.tsx:102-104,199-304` → 감사 PARTIAL 해소).
  - 행 모양: `bg-sam-warning-soft` 줄, 왼쪽 경고 아이콘, 제목(예: "전화번호 인증이 필요해요"), 오른쪽 텍스트 버튼 1개([인증하기] / [주소 등록] / [아이디 복구]). 배지·값·힌트 3중 표기 제거.
  - **전화 "등록된 번호 없음"+"인증 완료" 모순 — 원인**: 인증 여부는 `hasVerifiedPhone`(관리자 권한자 면제 `lib/auth/post-login-profile-policy.ts:53-57`, `phone_verified`/`phone_verified_at` 플래그 `:58-60`, 관리자 수동 승인 `:66`)으로, 표시 번호는 `phone/phone_country_code/phone_number` 컬럼(`member-account-status.ts:50-59`)으로 **따로** 계산(`:74-77`). 플래그는 참·번호 컬럼은 비어 있는 계정(관리자 면제·수동 승인)에서 값="등록된 번호 없음"(`MypageRequiredInfoSummary.tsx:245-251`), 배지·힌트=둘 다 "인증 완료"(`:240-244,252-254`). **수정**: 홈은 인증 완료면 전화 줄을 아예 그리지 않음(모순 표시 경로 제거). 상태 함수에 `phone.presentation: "verified" | "verified_without_number" | "unverified"` 추가 — S03 계정 화면은 `verified_without_number` 를 "인증됨 · 번호 미등록"으로 1회만 표기(문구 확정은 S03 파트). 인증 판정 로직(`hasVerifiedPhone`)은 **변경 금지**(가입·게이트 공용).
  - **주소 "변경" 2번 — 원인**: 등록 완료 시 hint 와 CTA 가 같은 키 `mypage_required_change_action`(`MypageRequiredInfoSummary.tsx:289-290` 과 `:297-298`). **수정**: 등록 완료면 줄 없음(계약 `:27` "no duplicate home-complete + address-menu twin CTA"), 주소 변경은 계정 그룹 「주소관리」 행 하나로만. 미등록 줄은 제목 + [주소 등록] 1개.
  - 주소 줄 문구용 `useRepresentativeFullAddressLine`(`:120`) 호출 제거 → K11 ① 해소. 등록 여부는 `projection.addressStatus`(홈 모델이 소유하는 주소 기본값 1회 조회 `hooks/use-mypage-home-model.ts:42-59`)만 사용.
  - 상태 미확정(`phoneStatus/addressStatus="unknown"`) = **아무것도 그리지 않음**(완료 회원이 대부분이라 자리 예약 시 매번 빈칸 → 사라짐 흔들림). 확정 후 미완료면 그때 삽입(미완료 회원만 1회 이동). 조회 실패(`loadFailed`) = 프로필 블록 안 한 줄 "계정 정보를 불러오지 못했어요 [다시 시도]"(현행 `:146-160` 문구·동작 유지).
  - 탭 동작: 현행 시트 유지(아이디 `openSheet("dibay-id")`, 전화 `openSheet("phone")` — `MypageRequiredInfoSummary.tsx:234,265`), 주소 = `buildMypageAddressesHref("/mypage")` push.
- **배너 (1-b)**: 위치 = 프로필 블록(필수정보 포함) 바로 아래(v2.1 `:229`) — 현행 위치와 같음(`MyPageHomeDashboard.tsx:91`). 수정: 데이터는 summary 의 `banner` 필드로(별도 Supabase 조회 제거), 세션 스냅샷이 있으면 **첫 렌더에 포함**(늦게 끼어들며 메뉴를 밀어내는 흔들림·스크롤 복원 어긋남 제거). 닫기 기억은 현행 `lib/mypage/mypage-banner-dismissed.ts` 유지.
- **컴포넌트·토큰**: 프로필 = `MypageProfileSummary`(수정), 필수정보 = `MypageRequiredInfoSummary`(재작성), 그룹 = `MyGroup`(`MyInfoMenuSection`), 행 = `MyRow`(`MyInfoMenuItem` 확장), 언어 = `MyInfoLanguageToggleRow`, 로그아웃 = `LogoutActionTrigger variant="menu_row"`(계약 고정 `scripts/verify-mypage-authority-contract.mjs:46`), 관리자 = `MyPageAdminMenuEntry`. 자산 그룹은 현재 `MypagePointsAssetSummary`(행을 직접 그림 `MypagePointsAssetSummary.tsx:38-121`) → `MyGroup`+`MyRow` 로 교체하고 `useUserPointBalance` 호출 제거(포인트 값은 summary). 토큰은 §1.1.
- **CTA**
  - [프로필 수정](프로필 줄 전체 탭 포함) · 프로필 블록 오른쪽 · 항상 · 프로필 편집 시트 280ms(K1, Owner 확인 항목).
  - 필수정보 [인증하기]/[주소 등록]/[아이디 복구] · 각 줄 오른쪽 · 미완료 시 · 시트 또는 push.
  - 메뉴 행 · 행 전체(52px) · 항상(비로그인 = 로그인 후 원래 목적지 — 현행 `guestNav`) · push 300ms.
  - 매장 행: 승인 매장 진입 시 기존 `prepareStoreEnterNavigation`(캐시 무효화 `MyInfoHomeMenuSections.tsx:161-164`) 유지, 전환은 `store-enter-forward`(매장 도메인 소유, 불변).
  - 언어 세그먼트 [한국어][English] · 언어 행 오른쪽 · 항상 · 즉시 적용, 서버 저장 실패해도 기기 값 유지(D16 keepLocal) — K4.
  - 로그아웃 · 위험 그룹 마지막 · 로그인 회원만 · 모달 200ms → 확인 시 로그아웃(K8).
- **시트·모달·확인 흐름**: 프로필 편집·아이디·전화 = `MypageProfileSheetsHost`(`app/(main)/my/MyContent.tsx:171`) 시트 280ms(K9 범위 한정) / 로그아웃 = `LogoutConfirmModal` 200ms / 그 외 홈 확인 없음.
- **데이터·SSOT**: §2.2 표.
- **로딩(스켈레톤) · 빈 · 오류+재시도**
  - 메뉴 행·그룹 제목 = 정적 설정이라 **항상 즉시**(스켈레톤 금지). 값 자리만: 세션 스냅샷 있으면 스냅샷 값, 없으면 `valueState="loading"` 미니 스켈레톤(24×12, 값이 있는 행만) → 응답 후 값 또는 비움.
  - 프로필: 프로젝션 없을 때 현행 스켈레톤(`MypageProfileSummary.tsx:30-45`)을 실제 구조(아바타 56 원 + 이름 120×16 + 아이디 80×12 + 소개 160×12 + 매너 행 44px)로 맞춤.
  - 프로필 조회 실패 = 현행 오류 카드 + [다시 시도](`MyPageHomeDashboard.tsx:66-82`) 유지, 재로그인 필요 = `MypageSessionReloginCard` 유지.
  - summary 실패 = 값만 비움(포인트 "—"), 홈 오류 표시 없음, 다음 진입·화면 복귀(`visibilitychange`/`pageshow`) 때 재시도.
- **전환·복원**: 홈→하위 = push 300ms(§1.3), 하위→홈 back 300ms. 하단 탭 전환은 메인 셸 규칙 불변. 스크롤 복원 §1.4(유효 30분, popstate 목적지 홈일 때만). 배너·관리자 행으로 인한 위치 이동 0 이 복원 전제.
- **모바일·태블릿**: §1.8 — 태블릿 1열 40rem 가운데, 좌우 20px, 그룹 간 8px, 행 52px. 헤더(`MyPageHeader`)도 같은 폭.
- **성능·캐시**: 첫 페인트 전 서버 대기 = 시드 2개만(현행 `page.tsx:12-15`, 계약 "DO NOT await full hub extras / CMS / trade counts"). 클라 요청 ≤4(§1.7). summary 는 홈 모델과 **별도 훅** `useMypageHomeSummary`(계약 `scripts/verify-mypage-root-network-contract.cjs:37-39` — 홈 모델에서 개수·CMS 조회 금지). 재진입 = 스냅샷 즉시 + 백그라운드 재검증 1회(30초 이내 재진입이면 생략).
- **보존 조건**
  - 계약 검증: `verify:mypage-authority-contract`(현재 OK — 이름·testid `mypage-profile-manner-row`·`menu_row` 로그아웃 유지), `verify:mypage-root-network-contract`(K11 수정 후 PASS), `lib/mypage/__tests__/mypage-root-network-contract.test.ts:120-131`(testid `mypage-account-control-card` 는 필수정보 블록 루트에 유지, `stepIndex`·완료 카드 금지 유지), `mypage-home-store-owner-entry.test.ts`, `mypage-hub-scroll-restore.test.ts`, `mypage-banner-dismissed.test.ts`, `lib/ui/__tests__/mypage-responsive-breakpoints.test.ts`(2열 금지).
  - 기능 보존표 행 삭제 0(라이더·결제정보·지역 일괄변경 등 KEEP), C-4 3종 홈 HIDE 유지.
  - 매장 행 게이트(`resolveMypageHomeStoreOwnerEntry` + 시드 우선순위 `MyInfoHomeMenuSections.tsx:145-156`) 불변. 관리자 표시 권위 불변.
  - 비로그인 홈(`MyPageGuestHomeDashboard.tsx:57-62`) 구조 유지, 로그아웃·관리자·값 없음(v2.1 `:241`).
  - 하단 탭 재탭 = 스크롤만(`isMypageDomainHubPath`).
- **현재와의 차이 (감사 근거)**
  - 필수정보 항상 3줄 — `MypageRequiredInfoSummary.tsx:102-104`
  - 전화 모순 — `member-account-status.ts:74-77`, `MypageRequiredInfoSummary.tsx:240-264`
  - 주소 "변경" 중복 — `MypageRequiredInfoSummary.tsx:288-298`
  - 오른쪽 값 없음, summary API 없음 — `MyInfoHomeMenuSections.tsx:79-107`
  - 활동 2그룹 분리 — `MyPageHomeDashboard.tsx:95-96`
  - 관리자 위치 — `MyPageAdminMenuEntry.tsx` 사용 `MyPageHomeDashboard.tsx:104`
  - 태블릿 폭 42~66rem·패딩 `sm` 기준 — `app-content-layout.ts:12-13`, `mypage-home-starbucks-styles.ts:13,52`
  - 홈 스켈레톤 부분적 — `MypageProfileSummary.tsx:30-45`, 필수정보는 "확인 중" 글자 `MypageRequiredInfoSummary.tsx:132-171`
  - 포인트 행 "…" 글자 로딩 — `MypagePointsAssetSummary.tsx:48-49`
  - 배너 늦게 삽입 — `MypageHomeCmsBanner.tsx:21-41`
  - 스크롤 저장 60초 — `mypage-hub-scroll-restore.ts:19`
  - 루트 네트워크 검증기 FAIL — K11
- **완료 검증**
  - 캡처(웹 390px·768px·1024px 가로): 필수정보 완료/전화 미인증/주소 미등록/아이디 없음 4계정, 관리자·일반, 비로그인, summary 실패 주입(값 비고 포인트 "—"), 태블릿 40rem.
  - **숫자 일치 검사**: 각 값 = 목적지 화면 해당 탭 개수(판매중·찜·받은 대기·내 글·주문 진행중·쿠폰 사용 가능·상품권 보유·포인트 잔액) — 운영 계정 1개로 표 기록(AGENTS 규정 6: 운영 DB 읽기 전용 확인 포함).
  - 단위: summary 라우트(필드별 실패 → `unavailable`, 0 ≠ 실패, 401), `mypageStackDepth`, 전환 kind 표(§1.3-6), 홈 메뉴 순서 스냅샷(9그룹 + 관리자 끝), 아이콘 중복 0, 필수정보 표시 조건 표(8조합), `useMypageTabParam`.
  - 수동: 하위→뒤로 스크롤 위치(60초 이상 체류 포함), 하단 탭 재탭, reduced-motion.
  - 검증기 2종 PASS. 요청 수: 첫 진입 ≤4 / 재진입 0 차단.
- **영향 파일**: `components/mypage/MyPageHomeDashboard.tsx` · `components/mypage/myinfo/MyInfoHomeMenuSections.tsx` · `MyInfoMenuItem.tsx` · `MyInfoLanguageToggleRow.tsx` · `components/mypage/home/MypageRequiredInfoSummary.tsx` · `MypageProfileSummary.tsx` · `MypagePointsAssetSummary.tsx` · `MypageHomeCmsBanner.tsx` · `lib/mypage/mypage-home-menu-config.ts` · `lib/mypage/mypage-home-hub-links.ts`(판매 행 href) · `lib/mypage/mypage-home-store.ts` · `lib/mypage/mypage-home-snapshot.ts` · `lib/profile/member-account-status.ts` · `lib/mypage/mypage-hub-scroll-restore.ts` · `lib/ui/mypage-home-starbucks-styles.ts` · `lib/ui/mypage-responsive-breakpoints.ts` · `app/(main)/my/MyContent.tsx` · 신규 `app/api/me/mypage-summary/route.ts` · `lib/mypage/load-mypage-summary-server.ts` · `hooks/use-mypage-home-summary.ts` · 추출 대상(§2.2) · `lib/i18n/catalog/mypage-components.ts`(신규 키 4) · `scripts/verify-mypage-root-network-contract.cjs`.

### 2.1 판매 행 목적지

- 현행 `MYPAGE_HOME_TRADE_SALES_HREF="/mypage/trade/sales"`(`lib/mypage/mypage-home-hub-links.ts:5`) → 서버 `redirect("/mypage/products")`(`app/(main)/mypage/trade/sales/page.tsx`) 1회 경유.
- 결정: **홈 행은 `/mypage/products` 로 직접 연결**(리다이렉트 왕복 1회 제거, 300ms push 가 한 번만 재생). `/mypage/trade/sales` 리다이렉트 파일은 UI-6 "DO NOT Touch" 이므로 그대로 둠(K10). 상수 이름은 유지하고 값만 바꾸면 다른 사용처가 영향받으므로 **홈 설정 항목만** 새 상수 `MYPAGE_HOME_MY_PRODUCTS_HREF` 사용.
- 전환: `/mypage`→`/mypage/products` 는 판매자 허브 분기(거래 소유, 440ms)가 잡음 — §1.3 결정대로 불변, Owner 확인 항목.

### 2.2 `GET /api/me/mypage-summary` — 판정: 신규

**원칙**: 각 값 = **목적지 화면이 쓰는 같은 서버 함수**의 결과(중복 쿼리 작성 금지 — v2 §10.2 `:556`). 목적지 라우트 안에 쿼리가 인라인이면 먼저 `lib/**` 함수로 추출해 라우트와 summary 가 함께 호출. 기존 `loadMypageHomeDashboardCountsServer`(`lib/my/load-mypage-home-dashboard-counts-server.ts:89`)는 목적지와 다른 독자 count(예: 찜 = 삭제된 글 포함 `favorites` 행 수 `:60-72`) → **summary 에 쓰지 않음**.

**요청**: `GET`, 쿠키 세션. 파라미터 없음. `export const dynamic="force-dynamic"`, `runtime="nodejs"`.

**응답 200**
```ts
type Field<T> = { status: "ok"; value: T } | { status: "unavailable" } | { status: "hidden" };
type MypageSummaryResponse = {
  ok: true;
  viewerId: string;
  generatedAt: string;            // ISO, UTC
  fields: {
    salesActiveCount:        Field<number>;
    favoritesCount:          Field<number>;
    offersReceivedPending:   Field<number>;
    communityPostsCount:     Field<number>;
    storeOrdersActiveCount:  Field<number>;
    pointsBalance:           Field<number>;   // 음수 허용
    couponsAvailableCount:   Field<number>;
    giftCertificatesOwned:   Field<number>;
    adsActiveCount:          Field<number>;   // S46 진행중 탭 구현 전 = "hidden"
    trust:                   Field<{ trust_score: number | null; manner_score: number | null }>;
    banner:                  Field<MyPageBannerRow | null>;
  };
};
```
- `unavailable` = 그 필드 계산 실패·시간 초과 → 화면은 비움(포인트 "—"). `hidden` = 목적지에 해당 숫자가 아직 없음 → 값 슬롯 자체 없음. **어떤 실패도 0 으로 바꾸지 않음.**
- 401: `requireAuthenticatedUserId` 표준 응답. 503: 서비스 클라이언트 없음(전 필드 계산 불가) — 화면은 전부 비움.

**필드별 출처**

| 필드 | 홈 행 | 서버 함수(= 목적지와 동일) | 목적지 근거 | 선행 작업 |
|---|---|---|---|---|
| `salesActiveCount` | 진행중 거래 "판매중 n" | 추출 `loadMyPostsServer(sb, userId)`(현 인라인 `app/api/my/posts/route.ts:26-35`) → `filterMyProductsByListingAxis(rows,"active").length`(`lib/products/my-product-listing-filter.ts:102`) | 판매중 탭 = `MyProductsView.tsx:60` 같은 필터 | 라우트 인라인 쿼리 추출 |
| `favoritesCount` | 찜 n | 추출 `loadFavoritePostsServer(sb, userId)`(현 인라인 `app/api/favorites/list/route.ts`) → 결과 길이(상품 탭) | `FavoritesHubView` 상품 탭 | 추출. 매장 찜은 별도 탭이라 미포함 |
| `offersReceivedPending` | 가격 제안 "받은 대기 n" | `listPriceOffers(sb,{userId, role:"seller"})`(`lib/offers/price-offers.server.ts:751`) → `status==="pending"` 수 | `/api/offers/received/route.ts:21-23` | 없음 |
| `communityPostsCount` | 내가 쓴 글 n | `listCommunityPostsForUser(userId)`(`lib/community-feed/list-community-posts-for-user.ts:174`) 길이(게시중) | `/api/me/community-posts` | 현재 실패 시 `[]` 반환 → 실패를 0 으로 보이게 함. `{ok:true,posts}|{ok:false}` 결과형으로 변경(S26 오류=빈 목록 결함과 동일 수정, 커뮤니티 도메인 파일 — S26 파트와 한 번에) |
| `storeOrdersActiveCount` | 주문 내역 "진행중 n" | `loadBuyerStoreOrderTabCounts(sb, uid).counts.active`(`lib/delivery/customer/load-buyer-store-order-tab-counts.ts:9`) | `/api/me/store-orders/route.ts:5` 탭 개수 | 없음 |
| `pointsBalance` | 포인트 잔액 | `loadPointFinancialSummary(sb, uid).summary.balance`(`lib/points/project-point-financial-history.ts:528`) | `/api/me/points/route.ts:78` | 없음(이력 조회는 하지 않음) |
| `couponsAvailableCount` | 쿠폰 n장 | `loadCustomerCouponWalletCards(sb,{buyerUserId, tab:"all"})`(`lib/stores/load-customer-coupon-wallet-cards.ts:18`) → `customerWalletPresentationTab(c.bucket)==="held"` 수(`lib/stores/customer-coupon-wallet-view.ts:44`) | 쿠폰 화면 보유 탭 `CustomerCouponWalletBody.tsx:39,85` | 없음 |
| `giftCertificatesOwned` | 상품권 n장 | `loadGiftWalletOverviewSummary(sb, uid).summary.owned`(`lib/gift-certificate/load-gift-wallet.ts:385`) | `/api/me/gift-certificates/wallet?summary=1` | 상품권 화면 보유 탭 개수와 같은지 단위 테스트(보유 탭이 `loadGiftWallet` 기반이면 같은 상태 집합으로 정렬) |
| `adsActiveCount` | 내 홍보/광고 "진행 n" | S46 진행중 탭이 쓰는 함수(현재 탭 없음 — 감사 S46 FAIL) | — | S46 구현 전 `hidden` |
| `trust` | 매너 % | `profiles.trust_score, manner_score` 를 서비스 클라이언트로 읽음(트러스트 화면이 `/api/me/profile?fresh=1` 로 읽는 같은 컬럼 `app/(main)/mypage/trust/page.tsx:43-61`). 클라이언트가 같은 `buildMemberTrustSurface` 로 % 계산 | S02 | 없음 |
| `banner` | 배너 | `my_page_banners` `is_active=true order sort_order limit 1`, `MY_PAGE_BANNERS_SELECT`(현 `MypageHomeCmsBanner.tsx:25-31` 과 동일 조건, 서버로 이동) | 관리자 CMS(v2.1 §6) | 없음 |

**summary 에 넣지 않는 값(이미 있는 클라 SSOT — 추가 요청 0)**

| 홈 값 | 출처 |
|---|---|
| 거래 채팅 안읽음 | 허브 배지 스토어 `useOwnerHubBadgeBreakdown().chatUnread`(`lib/chats/use-owner-hub-badge-total.ts:35`; 도메인 배지 권위가 `tradeUnread` 를 기록 `lib/chats/owner-hub-badge-store.ts:2315-2334`) — 거래 채팅 목록 배지와 같은 값, Realtime 반영. 메신저 unread 정책 불변(AGENTS 메신저 경계) |
| 매장 심사 뱃지 | 기존 서버 시드 + OwnerLite(`MyInfoHomeMenuSections.tsx:126-158`) |
| 주소 대표 동네 | 홈 모델이 이미 읽는 주소 기본값 스냅샷 `peekFreshAddressDefaultsSnapshot()`(`lib/addresses/fetch-address-defaults-client.ts:72`) → `formatUserAddressPublic(master)`(`lib/addresses/user-address-display-ssot.ts:55`) |
| 언어 | `useI18n().languagePreference ?? language` |
| 버전 | `getCapacitorAppInstalledVersion()`(`lib/platform/android-play-in-app-update.ts:218`) → `버전 (빌드)`; 웹 = `NEXT_PUBLIC_WEB_DEPLOY_SHA` 7자리. S18 과 같은 포맷 함수 `formatInstalledVersionLabel` 을 추출해 공유(`components/my/settings/VersionContent.tsx:498` 주변) |

**서버 실행 규칙**
- `Promise.allSettled` 로 필드 병렬, 필드별 타임아웃 1.5초(초과 → `unavailable`). 전체 응답 목표 p95 ≤ 800ms(측정 후 기록 — 목표치는 NOT_PROVEN).
- 구매자 자동확정 스윕 등 **부수효과 있는 호출 금지**(예: `/api/my/trade-counts` 의 `applyBuyerAutoConfirmAllDue` `route.ts:27` 같은 것 불포함).
- `Cache-Control: private, no-store`(회원별·금액 포함).
- `"use client"` 파일에서 이 서버 모듈 import 금지(AGENTS 규정 4).

**클라이언트 훅 `hooks/use-mypage-home-summary.ts`**
- 홈 첫 페인트 **이후** 1회 단일 비행(`runSingleFlight("mypage:summary:"+viewerId)`). 홈 모델(`useMypageHomeModel`)과 분리(K11·계약).
- 캐시: 메모리 + `sessionStorage` `dibay:mypage-summary:<viewerId>`(10분). 진입 시 스냅샷 즉시 사용 → 30초 이상 지났으면 재검증. viewer 불일치·로그아웃·auth 변경 시 삭제.
- 무효화 후 재조회: `PROFILE_UPDATED_EVENT`(`lib/profile/profile-update-events.ts:2`), `POST_FAVORITE_CHANGED_EVENT`(`lib/favorites/post-favorite-events.ts:2`), 홈 복귀(`pageshow`/`visibilitychange`), 하위 화면 쓰기 성공 시 `invalidateMypageSummary()` 호출(주문 취소·제안 수락/거절·충전 요청 등 — 각 파트에서 호출 지점 지정).
- 콜드부트: 행은 정적 설정으로 즉시, 값은 스냅샷 또는 미니 스켈레톤 → 응답 후 채움(v2.1 `:240`).


---

# 파트 B — S01~S19 프로필·계정·설정 화면 최종 명세

- 작성: 2026-10-20 · 코드 수정 0 · 근거 file:line 은 작성 시점 저장소(`/home/user/samarket`)에서 직접 열어 확인한 것만 적음. 확인 못 한 것은 "확인 필요".
- 번호는 v2.1 §5.2 기준. 제목 괄호 = v2 통합 설계 §6.2 번호(별칭).
- 공통 전제(모든 블록에 적용, 블록에서는 다르게 정할 때만 적음)
  - 헤더 `MySubpageHeader`(52px, 제목 17/600, 뒤로 44×44) → `MyScreen` 이 감쌈. 본문 좌우 16px, 태블릿(≥768px) 20px, 1열 최대 폭 40rem 가운데 정렬(v2 §6.1·§6.2 머리말).
  - 전환(K2): 내정보 하위 경로 진입 = 우→좌 push 300ms, 뒤로 = 반대 방향 300ms, 시트 280ms, 확인 모달 200ms, 토스트 220ms(`docs/customer-platform/03-NAVIGATION.md` Motion Contract, `lib/mypage/mypage-authority-contract.ts` `MYPAGE_MOTION_MS`). 현재 프로필 편집·주소 경로만 440/360ms(`components/route-transition/route-transition-config.ts:35-41`), 그 외 하위 화면은 subtle(`route-transition-enter-kind.ts:197`). 구현 위치 = `route-transition-enter-kind.ts`·`route-transition-config.ts` 에 내정보 경로 규칙만 추가, 다른 도메인 규칙 불변.
  - 스크롤(K3): 전역 `history.scrollRestoration="manual"`(`lib/mypage/mypage-hub-scroll-restore.ts:31-32`) 유지. 화면별 스크롤·탭은 `sessionStorage` 키별 저장(v2 §7.8 두 번째 줄), 탭은 `useMypageTabParam`(`?tab=`).
  - 상태: 첫 로딩만 구조 일치 스켈레톤(`MyStateView` loading n행), 재조회는 내용 유지. 오류를 빈 화면·0 으로 표시 금지(v2 §7.7). 401 만 로그인 이동(v2 §6.3).
  - 저장·삭제: `useMypageSubmitGuard`(in-flight ref + 버튼 스피너), 결과는 `MypageToastHost` 토스트(3초, 하단 탭바 위 16px). 파괴적 동작 = `MobileConfirmBottomSheet`/`dibayConfirm`(danger).
  - 토글 = `MyToggle`(현재 파일마다 따로 그린 스위치, 예 `NotificationsSettingsContent.tsx:184-200`).
  - 색: 하드코딩 hex·`amber-*`·`red-*`·`bg-white`·`rounded-[NNpx]` → `sam-*` 토큰(v2.1 §3.1, §3.4). Android 업데이트 버튼 비활성 `#D1D5DB/#6B7280` 은 AGENTS HARD LOCK 이라 예외 유지.
  - 설정 화면(S09~S19 중 `/mypage/section/*` 경로)은 **내정보 전체 데이터를 기다리지 않는다**: 현재 서버 `loadMypageServer()` 전체 대기(`app/(main)/mypage/section/[section]/[item]/page.tsx:48`) + 클라 `useMypageHubModel` 로딩 동안 화면 전체를 "로딩" 글자로 막음(`components/mypage/MyPageItemRouteClient.tsx:77-83`). 최종: 서버는 `loadMypageServerShell`(`lib/my/load-mypage-server.ts:150-167`, 프로필·권한 core 만) 사용, 클라는 화면이 실제로 필요한 값만 기다림(정적 화면 S17·S18·S19·S12·S13·S15·S16·S10·S11 은 hub 데이터 대기 0, S09 만 `hasOwnerStore`/`ownerHubStoreId` 필요 → core 값으로 충분). 헤더는 즉시 그림.

---

### S01 프로필 편집 (v2 S01) — 판정: 수정  (현재 감사 판정: FAIL)
- 경로 / 진입 메뉴: **K1 적용 — 단일 표면 = 바텀시트** `EditPublicProfileSheet`(내정보 홈 위). 진입: 홈 프로필 [프로필 수정](`components/mypage/home/MypageProfileSummary.tsx:79` `openSheet("profile-edit")`), 프로필 설정 시트 하위 행(`ProfileSettingsSheet.tsx:92`), 계정 화면·매너 배터리 화면의 "프로필 수정" 링크. 직접 URL `/mypage/section/account/profile/edit`(쿼리 `setup=1` 없음)·`/mypage/profile/edit`·`/mypage/edit` → `/mypage?edit=profile` 로 1회 이동 후 홈에서 시트 자동 열기, 열린 뒤 `router.replace("/mypage")` 로 쿼리 제거. **`?setup=1`(로그인 직후 필수정보 온보딩, `lib/auth/profile-setup-flow.ts:4-5,21-28`)은 별도 기능으로 현행 `ProfileEditForm` 페이지 유지.** ⚠ **Owner 확인 필요**: v2.1 S01 "편집 화면 1개(페이지)"와 03-NAVIGATION "sheet 280ms = profile edit (유지 여부 LOCK)" 충돌 → 계약(우선순위 2) 우선으로 시트 단일화.
- 구조·콘텐츠 순서: 시트 제목 "프로필 수정" → 사진(96px 원, 카메라 배지) → 닉네임 입력(2~20자, 실시간 검증 문구) → 소개 입력(글자 수 `n/60`) → 동네(읽기 전용 한 줄 + "주소 관리에서 변경" 링크 → S06, v2 S01) → 하단 고정 [저장].
- 표시(프로필·숫자·상태): 닉네임 = `profiles.nickname`(v2.1 C-11), 사진 = `avatar_url`(없으면 기본 그림), 소개 = `bio`. 동네 = 대표 주소 공개 라벨(`formatUserAddressPublic` 수준, 본인 화면이라도 한 줄 요약).
- 컴포넌트·토큰: `DibayBottomSheet` 계열 현행 `MypageBottomSheetShell`(`DibayUsableAreaSheet` 기반) — 핸들 표시·아래로 끌어 닫기 추가(현재 `showHandle={false}`, `MypageBottomSheetShell.tsx:33`), `MyStickyCta`(시트 하단 고정, 키보드 위), 입력 오류 `.sam-input--error`(v2.1 §3.3 신설), 사진 선택 = `DibayActionSheet`, 확인 = `MobileConfirmBottomSheet`. `PROFILE_EDIT_PRIMARY_BTN_CLASS`(`lib/ui/profile-edit-starbucks-styles`) → `Sam.btn.primaryCombo`.
- CTA: [저장] · 시트 하단 고정 · **변경 있을 때만 활성**(닉네임·소개가 기준값과 다르고 검증 통과) · `updateMyProfile`(PATCH `/api/me/profile`, `expected` 동시성) → 서버 재조회 확인 → 토스트 "저장했어요" + 시트 닫기 + 홈 즉시 반영. 사진은 선택 즉시 업로드·저장(현행 `ProfileImageField` 방식 유지)이므로 [저장] 활성 조건에 넣지 않음.
- 시트·모달·확인 흐름: ① 사진 탭 → 액션시트 [앨범에서 선택] · [사진 촬영] · [기본 사진으로](사용자 사진일 때만) · [취소]. 촬영 = `<input capture="user">`(네이티브 카메라 권한은 기존 `device-permission-manager` 게이트 재사용). ② 변경 있는 상태에서 닫기(X·바깥 탭·끌어 닫기·Android 뒤로) → `MobileConfirmBottomSheet` "수정한 내용을 버릴까요?" [계속 수정]/[버리기](danger). ③ 409 → 최신값 다시 채우고 안내 "다른 기기에서 바뀌었어요. 최신 내용을 불러왔어요"(v2 S01).
- 데이터·SSOT: PATCH `/api/me/profile` → `profiles.nickname/bio`(M1b 트리거로 `display_name` 동기), 사진 POST `/api/me/profile/avatar`(D1 L1~L3 규칙, v2.1 §4). 저장 후 `applyFreshProfileEverywhere`(boot·Supabase 캐시·홈 projection 동시 갱신, `EditPublicProfileSheet.tsx:21-29`) 유지.
- 로딩(스켈레톤 형태) · 빈 · 오류+재시도: 열 때 `fetchMeProfileFresh` 동안 시트 안 스켈레톤(원 96 + 입력 2줄 + 버튼 바). 빈 상태 없음. 조회 실패 → `MyStateView` error "프로필을 불러오지 못했어요" [다시 시도](현행 `:150-160` 동작 유지, 모양만 교체). 저장 후 "로딩" 글자 깜빡임 금지(버튼 내부 스피너만).
- 전환·복원: 시트 등장 280ms(아래→위), 닫힘 역방향. `DibayUsableAreaSheet` 실제 시간이 280ms 인지 **확인 필요**(파일에 시간 상수 없음). 닫힌 뒤 홈 스크롤 위치 그대로.
- 모바일·태블릿: 폰 = 화면 폭 시트, 최대 높이 85%. 태블릿 = 시트 폭 최대 40rem 가운데. 키보드 열림 시 [저장] 이 키보드 위(`useFormKeyboardViewport`), 입력 글자 16px 이상(iOS 확대 방지).
- 성능·캐시: 시트는 동적 import(`MypageProfileSheetsHost.tsx:12-15`) 유지. 열 때 프로필 full 조회 1회(boot lite 금지 사유 `:34` 유지), 저장 시 PATCH 1 + 확인 GET 1.
- 보존 조건: D1 사진 경로 검사, 저장 후 서버 재조회 검증(`:112-136`), 409 처리, `?setup=1` 온보딩 페이지·`profile-setup-flow.test.ts`, `route-transition-enter-kind.test.ts:310-330`(프로필 편집 경로 판정 — 경로가 리다이렉트로 바뀌면 기대값 갱신), 공개 이름 = nickname.
- 현재와의 차이 (감사 근거 file:line):
  - 편집 표면 2개: 홈 시트(`MypageProfileSheetsHost.tsx:41-42`) + 별도 페이지 `ProfileEditForm`(`app/(main)/mypage/section/[section]/[item]/edit/page.tsx:35`, setup 없이도 렌더).
  - [저장] 항상 활성(비활성 조건이 `saving` 하나, `EditPublicProfileSheet.tsx:196-203`), 변경 없으면 그냥 닫힘(`:93-95`).
  - 사진 선택 시트 없음 — 아바타 탭이 바로 파일 선택(`components/my/edit/ProfileImageField.tsx:120-127,141-146`), 촬영 선택지 없음, "삭제"는 텍스트 버튼(`:158-171`).
  - 닉네임 실시간 검증 없음(저장 시에만 `:80-87`), 소개 글자 수 표시 없음(`maxLength={60}` 만 `:185`).
  - 미저장 확인 없음(`onClose` 직접, `:143-146`). 페이지판 `ProfileEditForm` 에는 있음(`ProfileEditForm.tsx:329-348`) → 그 로직(`isProfileEditFormDirty`/`captureProfileEditFormSnapshot`, `lib/profile/profile-edit-form-helpers.ts:74-86`) 재사용.
  - 로딩 = "로딩" 글자(`:148-149`).
  - `MYPAGE_PROFILE_EDIT_HREF = "/mypage"`(`lib/mypage/mypage-profile-routes.ts:3`) → 계정·매너 화면 링크가 홈으로만 가고 시트는 안 열림(`MyAccountContent.tsx:236,286`, `app/(main)/mypage/trust/page.tsx:113`).
- 완료 검증:
  - 캡처(390px·820px): 시트 기본 / 닉네임 1자 오류 / 소개 58/60 / [저장] 비활성·활성 / 사진 액션시트 / 미저장 확인 시트 / 저장 중 스피너 / 저장 토스트 / 로드 실패 재시도 / 키보드 열림(폰).
  - 단위 테스트: 변경 감지 → [저장] 활성 규칙(닉네임 공백·같은 값·2자 미만·21자), `/mypage?edit=profile` 진입 시 시트 열림 후 쿼리 제거, `section/account/profile/edit`(setup 없음) → 리다이렉트·`?setup=1` 은 페이지 유지, 닫기 시 dirty 면 확인 시트.
  - 수동: 연속 탭 저장 요청 1회, 409 재현(두 기기), 사진 촬영(Android·iPhone), 저장 후 홈 닉네임 즉시 반영, Android 뒤로 = 미저장 확인.
- 영향 파일: `components/mypage/profile-settings/EditPublicProfileSheet.tsx`, `MypageBottomSheetShell.tsx`, `MypageProfileSheetsHost.tsx`, `mypage-profile-sheets-context.tsx`, `components/my/edit/ProfileImageField.tsx`(액션시트 분기), `components/mypage/home/MypageProfileSummary.tsx`·홈 진입부(`?edit=profile` 처리), `app/(main)/mypage/section/[section]/[item]/edit/page.tsx`, `app/(main)/mypage/profile/edit/page.tsx`, `app/(main)/mypage/edit/page.tsx`, `lib/mypage/mypage-profile-routes.ts`, `lib/profile/profile-edit-form-helpers.ts`(재사용), `components/route-transition/route-transition-enter-kind.ts`(+test), i18n 카탈로그 내정보 키.

### S02 매너 배터리 (v2 S02) — 판정: 수정  (현재 감사 판정: PARTIAL)
- 경로 / 진입 메뉴: `/mypage/trust`. 진입 = 홈 프로필 매너 배터리 행. 레거시 `/mypage/section/settings/manner` → `/mypage/trust`(`lib/mypage/mypage-section-legacy-redirect.ts:44`, 유지).
- 구조·콘텐츠 순서: v2.1 S02 — 큰 배터리 아이콘 + `%` → 「이렇게 계산돼요」(계약 문구) → (하단) "프로필 수정" 텍스트 링크. v2 의 반영 내역 목록(`/api/me/trust/events`)은 v2.1 행에 없으므로 이번 범위 아님(우선순위 3 > 4).
- 표시: `buildMemberTrustSurface`(`lib/trust/member-trust-surface`) 1개 SSOT, `%` 하나만(`data-testid="mypage-trust-score"`). 문구는 이미 D15 정정됨(`lib/i18n/catalog/mypage-hub.ts:166-169` "최근 365일 · 바로 반영 · 50% 시작 · 신고만으로는 바뀌지 않음") — 유지.
- 컴포넌트·토큰: `MyScreen`, `MannerBatteryIcon`, 카드 그림자 제거(`shadow-sm` → 없음, v2 §7.2), 폭 `max-w-4xl`(`trust/page.tsx:87`) → 40rem.
- CTA: "프로필 수정" 텍스트 링크 · 설명 아래 · 항상 · `/mypage?edit=profile`(S01 시트 열기).
- 시트·모달·확인 흐름: 없음.
- 데이터·SSOT: GET `/api/me/profile?fresh=1` → `profiles.trust_score`(= `member_trust_snapshots` 투영). 세션 값은 첫 그림용, API 값 도착 후 덮어쓰고 세션이 다시 덮지 못함(현행 `authorityFromApiRef`, `trust/page.tsx:30-34` 유지).
- 로딩·빈·오류: 세션에 값 있으면 즉시 표시 + API 갱신. 세션 값도 없으면 아이콘·숫자 자리 스켈레톤(원형 + 숫자 바 1). 스냅샷 없음(신규 회원) → 50% + "아직 거래 기록이 없어요"(v2 S02). API 실패 → 숫자 유지 + 아래 한 줄 "최신 값을 불러오지 못했어요" [다시 시도] (현재는 조용히 무시).
- 전환·복원: push 300ms / back 300ms. 스크롤 복원 불필요(한 화면).
- 모바일·태블릿: 1열, 태블릿 40rem 가운데.
- 성능·캐시: 요청 1회(`fresh=1`). 재진입 시 마지막 성공 값 메모리 보관 후 즉시 표시.
- 보존 조건: 홈 매너 행과 같은 함수(`buildMemberTrustSurface`), Slice 4 계약 주석(세션이 API 값 덮지 않음), 관리자 Facts 와 같은 값.
- 현재와의 차이: 조회 실패 무시 — `if (!res.ok) return;`(`app/(main)/mypage/trust/page.tsx:44`), `catch {}`(`:65-67`). 프로필 링크가 홈으로만 이동(`:113`, S01 참조). 카드 그림자·폭(`:87-88`). 미사용 임베드 `MannerTrustEmbed`(`components/mypage/MyPageItemScreen.tsx:235-265`, 세션 `temperature` 사용)는 리다이렉트로 도달 불가 → 삭제 대상(범위 내 정리).
- 완료 검증: 캡처(390·820) 정상 72% / 신규 50% / API 실패 안내 / 세션 값 없음 스켈레톤. 단위: API 실패 시 오류 줄 표시·재시도 호출, 세션→API 순서에서 API 값 우선. 수동: 관리자 회원 화면 신뢰 점수 = 화면 % 일치.
- 영향 파일: `app/(main)/mypage/trust/page.tsx`, `components/mypage/MyPageItemScreen.tsx`(죽은 `MannerTrustEmbed` 제거), i18n 내정보 키(오류 줄·신규 회원 문구).

### S03 계정 (v2 S03) — 판정: 수정  (현재 감사 판정: PARTIAL)
- 경로 / 진입 메뉴: `/mypage/account`. 진입 = 홈 계정 그룹 [계정]. 레거시 `section/account/account-info`·`account:profile` → 여기(`mypage-section-legacy-redirect.ts:32-33`).
- 구조·콘텐츠 순서(v2.1 S03, T5 허브): 그룹 1 `MyGroup` "계정 정보" — 아이디(`@id` + "1회 변경 가능"/"변경 완료" 값) › S04 · 전화번호(마스킹 + 인증 뱃지) › S05 · 이메일 · 연동 로그인(제공자 아이콘 + 연결 수) › S10 연동 로그인 묶음 · 가입일 · 회원 상태. 그룹 2 "필수 정보"(미완료 항목이 있을 때만: 아이디·전화·주소 상태 행). 그룹 3 `ProfileVerificationCenter`(현행 기능 유지, 행 형태로). 상단 프로필 카드·"설정으로" 버튼은 홈과 중복이므로 제거(기능 삭제 아님: 동일 진입이 홈에 있음).
- 표시: 전화 = `+63 9** *** 1234` 형식(앞 3·뒤 4 노출, 나머지 `*`) — 마스킹 함수 신규 `maskProfilePhoneForDisplay`(`formatProfilePhoneForDisplay` 결과에 적용). 인증 여부와 번호 표시는 **같은 값에서 계산**(인증됨+번호 없음이면 "인증 완료"만, "번호 없음" 동시 표시 금지). 가입일 = `profiles.created_at`(`lib/profile/types.ts:92`) → `formatMypageDate`. 연동 로그인 = 기존 `LinkedLoginProvidersContent` 가 쓰는 연결 목록 API(경로 **확인 필요**)의 제공자 수.
- 컴포넌트·토큰: `MyScreen`, `MyGroup`, `MyRow`(kind link/value, 오른쪽 값·뱃지), `MyStateView`. `rounded-[20px]`·`shadow-sm`·`bg-[rgba(...)]`(`MyAccountContent.tsx:47-48,124,221,243`) 제거.
- CTA: 행 탭 = 이동만(T5). 아이디 → `/mypage/required/dibay-id`(변경 불가 상태면 값 행·chevron 없음), 전화 → `/mypage/required/phone`, 연동 로그인 → `/mypage/section/settings/device-permissions#linked-login`. 상단 "수정" 링크 제거(프로필 편집은 홈 시트).
- 시트·모달·확인 흐름: 없음.
- 데이터·SSOT: `/api/me/profile`(`getMyProfile`), 캐시 우선 `peekMeProfileCached`(`MyAccountContent.tsx:36-42`, #119 유지). 주소 상태 `useRepresentativeFullAddressLine`.
- 로딩·빈·오류: 캐시 없을 때 행 스켈레톤 6줄(값 자리 회색 바). 오류(캐시 없음) → `MyStateView` error [다시 시도]. 비로그인 → 현행 로그인 유도 유지(모양만 토큰화).
- 전환·복원: push/back 300ms. 하위(S04·S05) 갔다 오면 스크롤 위치 복원(화면 키 `account`).
- 모바일·태블릿: 1열, 값 긴 경우 말줄임(이메일). 태블릿 40rem.
- 성능·캐시: 재진입 캐시 즉시 표시 + 백그라운드 갱신 1회(현행). 연동 로그인 수는 화면 표시 후 지연 조회 1회(실패 시 행 값만 비움).
- 보존 조건: `slice6-account-route-merge.test.ts`, 회원 상태 문구(`memberStatusMessageKey`, `:51-65`), 약관 동의 상태 표시(`:313-315`), 실명 인증 표시, 이름 SSOT `resolveMypageSelfDisplayName`.
- 현재와의 차이: 연동 로그인·가입일 행 없음(`MyAccountContent.tsx:290-316` 목록에 없음). 번호 마스킹 없음 — 전체 번호(`:160-167,296`). 같은 화면에서 "번호 없음"(`:296` `account_missing_phone`)과 "인증 완료"(`:307`) 동시 가능. 로딩 = 글자(`:96-98`). 하드코딩 색·반경(`:47-48,124,137,221,243`).
- 완료 검증: 캡처(390·820) 정상 / 필수정보 미완료 / 인증됨+번호 없음 / 캐시 없음 스켈레톤 / 오류. 단위: 마스킹(+63 10자리·빈 값·국가코드 없음), 인증·번호 표시 조합 4경우, 가입일 포맷 ko/en. 수동: 행 이동 3종, 재진입 깜빡임 0.
- 영향 파일: `components/my/MyAccountContent.tsx`, `app/(main)/mypage/account/page.tsx`, `lib/profile/admin-phone-verification-sync.ts`(읽기만 — 마스킹은 신규 `lib/mypage/` 함수), 신규 `lib/mypage/format-mypage-date.ts`, `components/my/settings/LinkedLoginProvidersContent.tsx`(수 조회 재사용, 변경 최소), i18n.

### S04 아이디 확정 (v2 S04) — 판정: 수정  (현재 감사 판정: PARTIAL)
- 경로 / 진입 메뉴: `/mypage/required/dibay-id`(페이지) + 홈 프로필 설정 시트 `EditDibayIdSheet`(같은 `ProfileDibayIdSection` 공유). 진입 = S03 아이디 행, 홈 필수정보 인라인, 프로필 설정 시트. 두 진입은 같은 컴포넌트이므로 한 번 고치면 둘 다 반영.
- 구조·콘텐츠 순서: 현재 아이디(`@id`, 자동 배정이면 "자동 배정됨") → 규칙 안내(영문 소문자·숫자·`_`, 길이) → 입력 + 상태 줄(확인 중/사용 가능/이미 사용 중/예약어) → 하단 고정 [확정].
- 표시: 1회 변경 여부(`dibay_id_changed_once`, `dibay_id_locked`) → 변경 불가면 입력 숨기고 "이미 변경했어요" 안내만.
- 컴포넌트·토큰: `MyScreen`(페이지) / `MypageBottomSheetShell`(시트), `MyStickyCta`, `.sam-input--error`, `MobileConfirmBottomSheet`. `rounded-full` 버튼·`text-white`(`ProfileDibayIdSection.tsx:260,268,301`) → `Sam.btn.*`.
- CTA: [확정] · 하단 고정 · 입력 정규화 통과 + 자동 확인 결과 "사용 가능" + 진행 중 아님 · 탭 → **확인 시트** → `confirm()`(reserve → confirm). [중복 확인] 버튼 제거 → 입력 멈춘 뒤 400ms 자동 확인(`/api/me/dibay-id/reserve` 재사용, 마지막 입력만 반영).
- 시트·모달·확인 흐름: `MobileConfirmBottomSheet` 제목 "@{id} 로 확정할까요?" 본문 "아이디는 1회만 변경할 수 있어요" [취소]/[확정](primary). 성공 → 토스트 + 페이지는 `router.replace("/mypage")`(현행 `:43-45`), 시트는 닫힘.
- 데이터·SSOT: `/api/me/dibay-id/reserve`·`/confirm`·`/assign-auto` → RPC `confirm_dibay_id` → `profiles.dibay_id`. 확정 후 `invalidateMeProfileDedupedCache` + 홈 projection 갱신(현행 시트 `EditDibayIdSheet.tsx:37-54`, 페이지도 홈 projection 갱신 추가).
- 로딩·빈·오류: 프로필 조회 중 스켈레톤(제목 줄 + 입력 + 버튼). 조회 실패 → `MyStateView` error [다시 시도](현재 재시도 없음). 자동 확인 실패 → 상태 줄 오류 문구(기존 키 `profile_edit_dibay_id_err_check_*`).
- 전환·복원: 페이지 push/back 300ms, 시트 280ms.
- 모바일·태블릿: 입력 포커스 시 키보드 위로 스크롤(현행 `scrollInputAboveKeyboard`, `:105-111` 유지), [확정] 키보드 위.
- 성능·캐시: 자동 확인 요청은 디바운스 + 이전 요청 결과 폐기(순번 비교).
- 보존 조건: 확정 in-flight 방지(`inFlightRef`, `:113-115`), 자동 배정 복구(`recoverAutoId`, `:299-301`), `dibay-public-id-ssot` 규칙.
- 현재와의 차이: 1회 변경인데 확인 시트 없음 — [확정] 이 바로 `confirm()`(`components/my/edit/ProfileDibayIdSection.tsx:266-267,113`). 중복 확인이 수동 버튼(`:258-262`, v2.1 "자동"). 조회 실패 재시도 없음(`components/mypage/required/MypageRequiredDibayIdClient.tsx:53-58`, 시트 `EditDibayIdSheet.tsx:64-65`). 로딩 글자(`MypageRequiredDibayIdClient.tsx:50-52`).
- 완료 검증: 캡처(390·820) 입력 전 / 확인 중 / 사용 가능 / 이미 사용 / 확인 시트 / 변경 완료 상태 / 오류 재시도. 단위: 디바운스 마지막 값만 확인, 확인 시트 취소 시 요청 0, 확정 2연타 요청 1. 수동: 페이지·시트 두 진입 동일 동작.
- 영향 파일: `components/my/edit/ProfileDibayIdSection.tsx`, `components/mypage/required/MypageRequiredDibayIdClient.tsx`, `components/mypage/profile-settings/EditDibayIdSheet.tsx`, `app/(main)/mypage/required/dibay-id/page.tsx`, i18n.

### S05 전화 인증 (v2 S05) — 판정: 수정  (현재 감사 판정: PARTIAL)
- 경로 / 진입 메뉴: `/mypage/required/phone`(+ 시트 `PhoneVerificationSheet`, 같은 `PhoneVerificationBox`). 진입 = S03 전화 행, 홈 필수정보, 로그인 게이트(`returnTo`).
- 구조·콘텐츠 순서: 안내(관리자 설정 `guide_text`) → 번호 입력(+63) + [인증번호 받기] → 6자리 입력 + 재전송 타이머 → 하단 고정 [인증 완료].
- 표시: 인증된 번호는 마스킹 표시 + "인증 완료" 뱃지, [번호 변경] 시에만 입력 활성(현행 `allowEdit`).
- 컴포넌트·토큰: `MyScreen`, `MyStickyCta`, `.sam-input--error`, `MyStateView`.
- CTA: [인증번호 받기] · 번호 입력 오른쪽 · 유효 번호 + 쿨다운 0 + 전송 중 아님 · POST `/api/account/phone/send-otp`. [인증 완료] · 하단 고정 · 6자리 입력 + 진행 중 아님 · POST `/api/account/phone/verify-otp` → 성공 시 `returnTo` 또는 홈(현행 `handleRefresh`).
- 시트·모달·확인 흐름: 없음(실패는 입력 아래 문구, 실패 횟수 안내 — v2 S05).
- 데이터·SSOT: `/api/me/phone-verification`(설정: enabled·provider·쿨다운) + `/api/account/phone/*` → `profiles.phone*`. 인증 판정 `hasVerifiedPhone` 단일.
- 로딩·빈·오류: 프로필·설정 조회 중 스켈레톤(안내 2줄 + 입력 + 버튼). **조회 실패 → 오류 + [다시 시도]**(무한 로딩 금지). 기능 꺼짐 → 현행 안내 문구(`MypageRequiredPhoneClient.tsx:104-110`).
- 전환·복원: push/back 300ms.
- 모바일·태블릿: 6자리 입력 `inputMode="numeric"` `autocomplete="one-time-code"`(**확인 필요**: 현행 속성 유무), 키보드 위 버튼.
- 성능·캐시: 진입 시 요청 2개 병렬(현행), 설정 조회 single-flight(`runSingleFlight`, `:31`) 유지.
- 보존 조건: `phone-otp-contract`(`PHONE_OTP_CODE_LENGTH`), `resolvePhoneOtpUiError` 문구 매핑, 관리자 수동 인증 동기(`admin-phone-verification-sync.test.ts`), `returnTo` 안전 경로 검사(`sanitizeNextPath`).
- 현재와의 차이(감사 근거 정정 포함): 감사가 적은 `PhoneVerificationBox.tsx:100` 은 번호 정규화 코드다. 실제 무한 로딩 원인 2곳 — ① `MypageRequiredPhoneClient.tsx:100-102` `loading || !snapshot` → 프로필 조회 실패(null)면 영원히 "로딩", 또 `Promise.all` 안 `fetch` 거부 시 `setLoading(false)`(`:62`) 미도달. ② 설정 조회 실패 → `phoneSettings=null`(`:56-61`) → `PhoneVerificationBox.tsx:188-194` 가 영원히 "로딩 중". 추가: 재전송 타이머가 1초마다 갱신되지 않음 — 남은 초를 렌더 시점에만 계산(`PhoneVerificationBox.tsx:93-94`), `setInterval` 없음.
- 완료 검증: 캡처(390·820) 미인증 / 전송 후 타이머 / 오류 문구 / 인증 완료 / 조회 실패 재시도 / 기능 꺼짐. 단위: 프로필 null·설정 실패·fetch 거부 3경우 → 오류 화면, 타이머 1초 감소(가짜 타이머). 수동: 실기기 OTP 수신·자동 입력(Android SMS, iOS 코드 제안), 비행기 모드 진입 시 재시도 표시.
- 영향 파일: `components/mypage/required/MypageRequiredPhoneClient.tsx`, `components/mypage/profile/PhoneVerificationBox.tsx`, `components/mypage/profile-settings/PhoneVerificationSheet.tsx`(같은 상태 규칙), i18n.

### S06 주소 목록 (v2 S06) — 판정: 수정  (현재 감사 판정: PARTIAL)
- 경로 / 진입 메뉴: `/mypage/addresses`. 진입 = 홈 계정 그룹 [주소](오른쪽 값 = 대표 동네), S01 동네 링크, 레거시 `store:address`·`settings:address`(`mypage-section-legacy-redirect.ts:29-30`), 거래 글쓰기·배달 등 호출 컨텍스트(`member-address-caller-context`).
- 구조·콘텐츠 순서: 헤더 우측 [추가] → 검색 진입 행("주소 검색") + [현재 위치로 찾기] → 대표 주소(뱃지) 맨 위 → 나머지(최근 사용순, `sortAddressList` `lib/addresses/user-address-service.ts:65-75` 유지).
- 표시: 행 = 라벨(집/회사/기타/매장) · 주소 한 줄 · 상세 · 대표 뱃지. 매장 연결 행은 대표 지정 불가(현행 규칙).
- 컴포넌트·토큰: `MyScreen`, `MyRow`(행 ⋯), `DibayActionSheet`, `MobileConfirmBottomSheet`, `SellerHubEmptyState`, `MyStateView`. 스타일 상수 `lib/ui/address-list-starbucks-styles.ts:6-38`(#00704A 등)·`rounded-[24px]/[18px]`·`bg-white`·`amber-*`(`AddressManagementClient.tsx:299-313`) → 토큰.
- CTA: [추가] · 헤더 우측 · 항상 · 검색(S08). 행 ⋯ → 액션시트 [대표로 설정](대표·매장 행 제외) · [수정](S07) · [삭제](확인). 행 본문 탭 = 호출 컨텍스트가 있으면 그 주소 선택(현행 `confirmTradeRegionPick`), 없으면 수정.
- 시트·모달·확인 흐름: 삭제 → `dibayConfirm` danger(현행 `AddressManagementClient.tsx:170`) 유지, 실패는 토스트(현재 `dibayAlert`). 대표 지정 성공 → 토스트 "대표 주소로 설정했어요".
- 데이터·SSOT: `/api/me/addresses`(GET/POST), `/api/me/addresses/[id]`(PATCH/DELETE) → `user_addresses`. 클라 캐시 `address-list-client-cache`(`readCachedMeAddressList`) 유지, 변경 후 `commitUserAddressListAfterMutation` + `broadcastUserAddressesChanged`.
- 로딩·빈·오류: 캐시 없음 → 행 스켈레톤 3줄. **빈 목록 → `SellerHubEmptyState` "등록된 주소가 없어요" [주소 추가]**. 오류 → `MyStateView` error [다시 시도](마이그레이션 힌트는 오류 아래 보조 문구로 유지).
- 전환·복원: 목록↔검색↔편집 깊이 0/1/2(`route-transition-enter-kind.ts:67-71`) 유지하되 시간 440/360 → 300/300(K2). 편집에서 돌아오면 스크롤 위치 복원.
- 모바일·태블릿: 1열 40rem. ⋯ 터치 영역 48px.
- 성능·캐시: 캐시 신선하면 요청 0(`isMeAddressListCacheFresh`). 승인 매장 맵 조회는 매장 연결 행 있을 때만(현행).
- 보존 조건: `address-platform-hard-lock-contract.test.ts`(대표 뱃지 = `isDefaultMaster` `:107-110`, 대표 지정 PATCH 본문 `isDefaultMaster: true` `:454-458`, `if (row.isDefaultMaster)` `:286`), `mypage-address-flow-exit`·`member-address-caller-context` 복귀 흐름, 거래 지역 적용 핸드오프, 매장 사장님 하단탭 숨김(`pushStoreOwnerMainBottomNavSuppressed`).
- 현재와의 차이: 빈 목록이면 아무것도 안 그림 — `list.length === 0 && !loadErr ? null`(`AddressManagementClient.tsx:350`). 오류 박스에 재시도 없음(`:299-306`). 로딩 글자(`:346-349`). 행 버튼 3개 노출(`AddressRowCard.tsx:80-127`) — ⋯ 액션시트 아님. 하드코딩 색(위 목록).
- 완료 검증: 캡처(390·820) 0개 빈 / 1개(대표) / 4개 / ⋯ 시트 / 삭제 확인 / 오류 재시도 / 스켈레톤. 단위: 빈·오류·캐시 있음 상태 분기, 매장 행 ⋯ 에 대표 지정 없음. 수동: 거래 글쓰기에서 진입→선택→복귀, 대표 변경 후 홈 오른쪽 값 갱신.
- 영향 파일: `components/addresses/AddressManagementClient.tsx`, `AddressRowCard.tsx`, `AddressListRowBody.tsx`, `lib/ui/address-list-starbucks-styles.ts`, `lib/addresses/__tests__/address-platform-hard-lock-contract.test.ts`(소스 문자열 검사 갱신 필요 여부 확인), i18n.

### S07 주소 편집 (v2 S07) — 판정: 수정  (현재 감사 판정: PARTIAL)
- 경로 / 진입 메뉴: `/mypage/addresses/edit`(`?id=` 수정 / 없음 = 추가). 진입 = S06 [수정]·S08 결과 선택·현재 위치.
- 구조·콘텐츠 순서: 지도(핀 미세 조정) + 확정 주소 2줄 → 상세 주소(필수) → **라벨(집 · 회사 · 기타, 칩)** → 랜드마크 · 배달 메모 → **대표 주소 토글** → 하단 고정 [저장].
- 표시: 라벨 기본값 = 기존 행 값(추가 시 "기타"). 매장 연결 행은 라벨 "매장" 고정 표시, 토글 숨김(현행 `addr_ui_kind_shop`).
- 컴포넌트·토큰: `MyScreen`, `Sam.chip`(라벨), `MyToggle`, `MyStickyCta`, `.sam-input--error`. 기존 미사용 `components/addresses/AddressDesignationField.tsx`(home/office/custom/shop 프리셋, import 0)를 라벨 선택 로직으로 재사용 가능 — 모양은 칩으로. 하드코딩(`AddressPlatformDetailClient.tsx:240,265,274,278,284,292,301,309`) → 토큰.
- CTA: [저장] · 하단 고정(키보드 위, 현행 `data-form-keyboard-footer`) · 확정 주소 있음 + 확인 중 아님 + 상세 입력 + (수정 모드면) 변경 있음 · POST/PATCH. 성공 → 토스트 + `returnTo` 또는 목록(현행 `AddressEditorPageClient.tsx:198-205`).
- 시트·모달·확인 흐름: 변경 있는 상태에서 뒤로 → 미저장 확인 시트(현재 없음). 대표 토글을 끄는 것은 불가(대표가 이 주소 하나뿐이면 토글 잠금 + 안내 "다른 주소를 대표로 지정하면 바뀌어요").
- 데이터·SSOT: `user_addresses`. **수정 저장은 대표 주소를 바꾸지 않는다 — 사용자가 토글을 켰을 때만 `isDefaultMaster: true` 전송, 그 외에는 본문에서 `isDefaultMaster` 생략**(서버는 생략 시 기존 값 유지: `lib/addresses/user-address-service.ts:547-555` 는 `=== true` 일 때만 대표 변경). 추가 저장: 토글 기본 OFF, 첫 주소면 서버가 자동 대표 지정(`ensureSomeoneDefaultIfFirst` `:350-372`) → 화면에서도 첫 주소면 토글 ON·잠금 표시. 라벨: `labelType` = 선택값(`home|office|other`), 매장 행은 `shop` 유지. 신규 생성 후 닉네임 보정 PATCH(`:216-221`) 실패도 오류로 처리.
- 로딩·빈·오류: 진입 부트스트랩 스켈레톤(지도 240px 회색 + 입력 3줄)(현재 글자 `AddressEditorPageClient.tsx:160-168`). 확정 주소 없음 → 검색으로 1회 이동(현행 `:144-147`). 저장 실패 → 입력 위 오류 + 토스트.
- 전환·복원: 깊이 2, push/back 300ms(K2).
- 모바일·태블릿: 지도 높이 폰 240 / 태블릿 280. 하단 바 safe-area(`effectiveBottomInset`).
- 성능·캐시: 지도 지연 로드(`AddressFineTuneMapLazy`) 유지, 핀 이동 역지오코딩 400ms 디바운스(`:105`) 유지.
- 보존 조건: `address-platform-hard-lock-contract.test.ts:392-430`(DetailClient 사용·CURRENT PIN 규칙·저장 행 재수화), 매장 주소 대표 금지(`assertStoreAddressNotForcedAsMasterWhenGeneralExists`), `useForLife/Trade/Delivery` 현행값, 거래 지역 적용 흐름. **확인 필요**: 대표 동네 설정 목적으로 이 화면에 들어오는 호출 컨텍스트(거래 글쓰기 지역 등)가 "저장 = 대표"를 전제하는지 — 그런 컨텍스트면 토글 기본 ON 으로 시작.
- 현재와의 차이: **저장할 때마다 대표로 바뀜** — `isDefaultMaster: isShop ? false : true`(`components/addresses/AddressPlatformDetailClient.tsx:194`). 라벨 선택 없음 — 항상 `other`(`:135-136`). 대표 토글 없음. 미저장 확인 없음. 생성 후 보정 PATCH 결과 무시(`:216-221`).
- 완료 검증: 캡처(390·820) 추가(첫 주소 토글 잠금 ON) / 추가(두 번째, OFF) / 수정 / 라벨 칩 선택 / 키보드 열림 / 미저장 확인 / 저장 오류. 단위: 수정 저장 본문에 `isDefaultMaster` 없음(토글 미변경), 토글 ON 시 `true`, 매장 행 `false` 금지·생략, 라벨 매핑. 수동: 대표 아닌 주소 수정 후 목록 대표 그대로·홈 대표 동네 그대로.
- 영향 파일: `components/addresses/AddressPlatformDetailClient.tsx`, `AddressEditorPageClient.tsx`, `AddressDesignationField.tsx`(재사용 시), `lib/addresses/__tests__/address-platform-hard-lock-contract.test.ts`(신규 단언 추가), i18n.

### S08 주소 검색 (v2 S08) — 판정: 수정  (현재 감사 판정: PARTIAL)
- 경로 / 진입 메뉴: `/mypage/addresses/search`. 진입 = S06 검색 행·[추가], S07 확정 주소 없음.
- 구조·콘텐츠 순서: 검색창(자동 포커스) → 결과 목록(제목·부제) / 입력 2자 미만이면 검색 요령 4줄(현행) → [현재 위치로 찾기].
- 표시: 결과 행 = 장소명 + 주소 부제(`PlacePredictionRow`).
- 컴포넌트·토큰: `MyScreen`, `MyRow`, `MyStateView`(결과 영역만), `ADDR_BTN_TERTIARY_FULL` → `Sam.btn.secondaryCombo`.
- CTA: 행 탭 = 선택 → S07. [현재 위치로 찾기] · 하단 · 위치 조회 중 아님 · 권한 게이트 후 S07.
- 시트·모달·확인 흐름: 위치 권한 거부 → 기존 `requestLocationWithDiBaYGate` 안내 유지.
- 데이터·SSOT: Google Places Autocomplete(`lib/map/fetch-place-predictions-ph.ts`) → 결과는 서버 저장 없음.
- 로딩·빈·오류: 검색 중 결과 자리 스켈레톤 3줄. **2자 이상 + 0건 → "검색 결과가 없어요" + 요령 1줄**. **오류(지도 로드 실패·Places 상태 OK/ZERO_RESULTS 외) → "검색하지 못했어요" [다시 시도]** — 빈 결과와 구분.
- 전환·복원: 깊이 1, push/back 300ms. 뒤로 돌아오면 입력어 유지(**확인 필요**: 현재 유지 여부).
- 모바일·태블릿: 키보드 위 결과 스크롤, 태블릿 40rem.
- 성능·캐시: 220ms 디바운스(`AddressPlatformSearchClient.tsx:46-57`) + 취소 플래그 유지.
- 보존 조건: 필리핀 제한·언어 설정(`fetch-place-predictions-ph.ts:33-37`), `canonical-address-draft-storage` 초안 전달.
- 현재와의 차이: 오류를 빈 결과로 — `catch → setPredictions([])`(`AddressPlatformSearchClient.tsx:51-52`), Places 비정상 상태도 `[]`(`fetch-place-predictions-ph.ts:40` 이후, `:25-26`). 2자 이상 0건일 때 문구 없음(`:131` 은 2자 미만만 처리).
- 완료 검증: 캡처(390·820) 초기 요령 / 검색 중 / 결과 / 0건 / 오류 재시도. 단위: 상태 `ZERO_RESULTS` → 빈, `REQUEST_DENIED`·로드 실패 → 오류(조회 함수가 `{ok,rows}|{ok:false}` 구분 반환). 수동: 비행기 모드 검색 → 오류 표시.
- 영향 파일: `components/addresses/AddressPlatformSearchClient.tsx`, `lib/map/fetch-place-predictions-ph.ts`(반환형 — 다른 소비자 grep 후 함께 수정, **확인 필요**), i18n.

### S09 결제정보 (v2 별칭 없음 — v2 의 S09 는 개인정보·보안 허브로 다른 화면) — 판정: 유지  (현재 감사 판정: PASS)
- 경로 / 진입 메뉴: `/mypage/section/store/payment`. 진입 = 홈 계정 그룹 [결제정보].
- 구조·콘텐츠 순서: v2.1 S09 / C-5 — 일반 회원: "매장 주문은 주문할 때 매장에 직접 결제해요" 안내 → [주문 내역] → [매장 입점 안내]. 사장님: [매장 정산] → [매장 관리].
- 표시: 일반 회원 문구에 정산·캐시·Coin 없음(`components/mypage/tabs/StoreTab.tsx:61-62` 주석, `lib/i18n/catalog/mypage-components.ts:357`).
- 컴포넌트·토큰: `MyScreen`, `MyGroup`+`MyRow`(현 `MyPageQuickActions` → 행 목록, 동작 동일).
- CTA: 행 = 이동만.
- 시트·모달·확인 흐름: 없음.
- 데이터·SSOT: `hasOwnerStore`·`ownerHubStoreId` — core(`loadMypageServerShell`) 값으로 충분, hub extras 대기 금지.
- 로딩·빈·오류: core 로드 중 행 스켈레톤 2줄. core 실패 → `MyStateView` error.
- 전환·복원: push/back 300ms.
- 모바일·태블릿: 공통.
- 성능·캐시: 서버 `loadMypageServer` 전체 → `loadMypageServerShell`(공통 전제).
- 보존 조건: `store-commission-cash-settlement-ssot` §4(주문자 문구), `OwnerRoutes.finance` 경로.
- 현재와의 차이: 기능 PASS. 전체 데이터 대기(`MyPageItemRouteClient.tsx:77-83`, `page.tsx:48`)와 "로딩" 글자만 공통 수정.
- 완료 검증: 캡처(390·820) 일반 회원 / 사장님. 단위: 권한별 행 구성. 수동: 정산 이동.
- 영향 파일: `components/mypage/tabs/StoreTab.tsx`(payment 분기 모양), 공통 전제 파일.

### S10 기기 권한(개인/보안) (v2 S52 + S53) — 판정: 수정(경미)  (현재 감사 판정: PASS)
- 경로 / 진입 메뉴: `/mypage/section/settings/device-permissions`. 진입 = 홈 계정 그룹 [개인/보안], S03 연동 로그인 행(`#linked-login`).
- 구조·콘텐츠 순서(v2.1 S10): 안내 → 알림 · 카메라 · 사진 · 위치 상태 행(각 [설정 열기]/[허용]) → 그룹 "연동 로그인"(`LinkedLoginProvidersContent`). 현재는 연동 로그인이 맨 위(`DevicePermissionsSettingsContent.tsx:295-299`) → 아래로 이동.
- 표시: 권한 상태 = 허용/거부/묻기 전 텍스트 값(오른쪽).
- 컴포넌트·토큰: `MyScreen`, `MyGroup`, `MyRow`(value + 작은 버튼).
- CTA: [설정 열기]/[허용] · 행 오른쪽 · 상태별 · 기존 `device-permission-manager`. 연동 로그인 [연결]/[해제] — 해제는 확인 시트(v2 S53, 감사 S53 PARTIAL 항목; 세부는 파트 C S53 과 동일 규칙).
- 시트·모달·확인 흐름: 연동 해제 확인 시트, 권한 안내(기존 가이드).
- 데이터·SSOT: OS 권한(Capacitor/브라우저), 연동 로그인 기존 API(**확인 필요**: 경로명).
- 로딩·빈·오류: 권한 조회 중 값 자리 스켈레톤. 연동 목록 실패 → 그룹 안 오류 + [다시 시도](빈 목록 금지).
- 전환·복원: push/back 300ms. `#linked-login` 진입 시 해당 그룹으로 스크롤.
- 모바일·태블릿: 공통. 웹에서는 OS 설정 열기 불가 → 안내 문구(현행).
- 성능·캐시: hub 데이터 대기 0.
- 보존 조건: `device-permission-session-prefix` 세션 키(캐시 삭제에서도 보존), 네이티브 권한 흐름.
- 현재와의 차이: 기능 PASS. 순서(연동 로그인 위치), 연동 실패 시 빈 목록(감사 S53), 공통 대기·로딩 글자.
- 완료 검증: 캡처(390·820) Android 앱 / iPhone 앱 / 웹 / 연동 해제 확인. 단위: `#linked-login` 스크롤 앵커. 수동: 권한 거부 후 [설정 열기] → 복귀 시 상태 갱신.
- 영향 파일: `components/my/settings/DevicePermissionsSettingsContent.tsx`, `components/my/settings/LinkedLoginProvidersContent.tsx`.

### S11 알림 (v2 S50) — 판정: 수정  (현재 감사 판정: PARTIAL)
- 경로 / 진입 메뉴: `/mypage/section/settings/notifications`. 진입 = 홈 계정 그룹 [알림]. 레거시 `settings/notifications`·`quiet-hours`·`order-notifications`·`messenger:chat-alerts` → 여기.
- 구조·콘텐츠 순서(v2 S50): 전체 푸시 → 채팅 → 거래 → 주문 → 커뮤니티 → 마케팅 → 알림 이메일 → (현행 유지) 방해 금지 시간·소리.
- 표시: 토글 현재값, 이메일은 주소 + 인증 상태.
- 컴포넌트·토큰: `MyScreen`, `MyGroup`, `MyRow kind=toggle`, `MyToggle`(파일 안 스위치 14개 → 공통).
- CTA: 각 토글 · 행 오른쪽 · 저장 중 아님 · 낙관 반영 → PATCH → **실패 시 원래 값 복귀 + 토스트**. 전체 푸시는 두 저장소(`user_settings.push_enabled` + 도메인 `service_enabled`)를 함께 바꾸므로 둘 중 하나라도 실패하면 둘 다 복귀.
- 시트·모달·확인 흐름: 없음(마케팅 끄기 확인 없음 — v2 S50).
- 데이터·SSOT: `user_settings`(`updateUserSettings`, 실패 시 revert + `USER_SETTINGS_SAVE_FAILED_EVENT` → `MypageToastHost.tsx:29` 토스트, 이미 구현) + `/api/me/notification-settings`(도메인 토글) + `/api/me/profile/notification-email`.
- 로딩·빈·오류: 토글 비활성 스켈레톤 행 7개. 도메인 설정 조회 실패 → 그룹 안 오류 + [다시 시도](현행 `:334-341` 유지).
- 전환·복원: push/back 300ms, 스크롤 위치 복원.
- 모바일·태블릿: 공통.
- 성능·캐시: hub 데이터 대기 0. 도메인 GET single-flight(`invalidateMeNotificationSettingsGetFlight`) 유지.
- 보존 조건: `user-settings-save-failure-revert.test.ts`, 이벤트 `kasama:user-notification-settings-changed` 발행(`:165-167`), 관리자 언어 토글 keepLocal 동작.
- 현재와의 차이: 도메인 토글 실패 무시 — `patchDomain` 이 실패 시 아무것도 안 함(`components/my/settings/NotificationsSettingsContent.tsx:154-171`, `catch { /* ignore */ }`), 화면은 이미 바뀐 값 유지(예 `:352-355`). 전체 토글이 두 저장소를 따로 저장(`:191-194`) → 한쪽 실패 시 불일치.
- 완료 검증: 캡처(390·820) 기본 / 스켈레톤 / 도메인 오류 재시도 / 저장 실패 토스트. 단위: `patchDomain` 실패 → 해당 state 복귀 + 토스트 이벤트, 전체 토글 한쪽 실패 → 둘 다 복귀. 수동: 비행기 모드 토글 → 원위치.
- 영향 파일: `components/my/settings/NotificationsSettingsContent.tsx`, `lib/mypage/mypage-toast.ts`(호출만), 신규 `components/mypage/ds/MyToggle.tsx`.

### S12 언어 (v2 S54) — 판정: 유지 (K4)  (현재 감사 판정: PARTIAL)
- 경로 / 진입 메뉴: 홈 계정 그룹 [언어] 행 안 인라인 토글(`MyInfoLanguageToggleRow`). 레거시 `/mypage/settings/language` → `section/settings/language`(`LanguageSettingsContent`) 유지.
- 구조·콘텐츠 순서: **K4 — 토글 유지 + 현재 값 표시.** 행 제목 "언어" + 오른쪽 2칸 세그먼트 [한국어 | English], 선택된 칸 = 현재 값(이미 `aria-checked`, `MyInfoLanguageToggleRow.tsx:47-67`). v2.1 "선택 시트"는 기능 보존표 `language | toggle | KEEP`(우선순위 2)에 밀려 적용하지 않음.
- 표시: 현재 값 = `languagePreference ?? language`.
- 컴포넌트·토큰: `MyRow`(kind custom) + 세그먼트. `lib/ui/mypage-home-starbucks-styles` 세그먼트 상수 → 토큰.
- CTA: 세그먼트 탭 · 즉시 적용 · `setLanguage`.
- 시트·모달·확인 흐름: 없음.
- 데이터·SSOT: `user_settings.preferred_language`, 실패 시 기기 값 유지(`keepLocal`, `components/i18n/AppLanguageProvider.tsx:117,194`) — 이미 구현.
- 로딩·빈·오류: 없음(기기 값 즉시).
- 전환·복원: 홈 안이라 없음. 섹션 페이지는 push/back 300ms.
- 모바일·태블릿: 세그먼트 칸 터치 영역 44px 이상.
- 성능·캐시: 요청 = 서버 저장 1회(백그라운드).
- 보존 조건: `reconcile-user-settings-language.test.ts`, 관리자 언어 토글 동일 동작.
- 현재와의 차이: 기능 일치(K4 기준). 색 상수만 토큰화. 섹션 페이지 `LanguageSettingsContent.tsx:51-63` 의 `error` state 미사용(무해).
- 완료 검증: 캡처(390·820) 홈 행 ko/en. 단위: 탭 → `setLanguage` 1회, 같은 값 재탭 0회. 수동: 앱 재시작 후 유지, 오프라인 변경 후 재접속 동기.
- 영향 파일: `components/mypage/myinfo/MyInfoLanguageToggleRow.tsx`, `lib/ui/mypage-home-starbucks-styles.ts`(세그먼트 상수).

### S13 지역/국가 (v2 별도 행 없음, C-4) — 판정: 유지  (현재 감사 판정: PASS)
- 경로 / 진입 메뉴: `/mypage/section/settings/country`. **홈 행 숨김**(C-4, `LEGACY-IA-FEATURE-PRESERVATION.md` "읽는 기능 없는 설정 3종 … 홈 행 HIDE", 홈 config 에 행 없음 `lib/mypage/mypage-home-menu-config.ts:150-230`). 직접 URL·레거시 `settings/country` 로만 진입.
- 구조·콘텐츠 순서: 현행 국가 목록 유지.
- 표시: 선택 국가 체크.
- 컴포넌트·토큰: `MyScreen`, `MyRow`(선택 체크).
- CTA: 행 탭 = 즉시 저장(`updateUserSettings` revert).
- 시트·모달·확인 흐름: 없음.
- 데이터·SSOT: `user_settings.preferred_country`.
- 로딩·빈·오류: 공통 대기 제거, 저장 실패 토스트(공통 이벤트).
- 전환·복원: push/back 300ms.
- 모바일·태블릿: 공통.
- 성능·캐시: hub 대기 0.
- 보존 조건: 경로·데이터·레지스트리 KEEP(C-4).
- 현재와의 차이: 공통 대기·로딩 글자만.
- 완료 검증: 캡처(390) 1장. 단위: 홈 config 에 country 행 없음(스냅샷). 수동: 직접 URL 진입 저장.
- 영향 파일: `components/my/settings/CountrySettingsContent.tsx`(모양만).

### S14 관심·차단·숨김 사용자 (v2 S22·S23) — 판정: 수정  (현재 감사 판정: PARTIAL)
- 경로 / 진입 메뉴: `/mypage/section/account/favorite-users` · `blocked-users` · `hidden-users`. 진입 = 홈 서비스 그룹 3행(`mypage-home-menu-config.ts:196,201,206`), 레거시 `messenger:friends` → 관심(`mypage-section-legacy-redirect.ts:39`).
- 구조·콘텐츠 순서: 설명 한 줄 → 사용자 행(사진·닉네임·@ID) → 행 오른쪽 버튼.
- 표시: 이름 = nickname SSOT, @ID.
- 컴포넌트·토큰: `MyScreen`, `MyRow`, `SellerHubEmptyState`, `MyStateView`, `MobileConfirmBottomSheet`, 행 버튼 `Sam.btn.sm`(위험 아님 → 중립 보조 스타일; 현재 `text-sam-danger` `UserListContent.tsx:177`).
- CTA: 문구를 목록 종류별로 — 관심 [관심 해제] · 차단 [차단 해제] · 숨김 [숨김 해제] (현재 모두 "삭제" `:181-185`). 관심 해제 = 확인 없이 즉시 + 토스트 [되돌리기](되돌릴 수 있는 해제, v2.1 §5.2 공통). 차단·숨김 해제 = **확인 시트** 후 실행.
- 시트·모달·확인 흐름: 차단 해제 "○○님 차단을 해제할까요? 해제하면 다시 채팅·글이 보여요" [취소]/[해제]. 숨김 해제 동일 구조.
- 데이터·SSOT: `/api/me/relations/[type]` GET/DELETE(`app/api/me/relations/[type]/route.ts:207`). 되돌리기 = 같은 API POST(**확인 필요**: 관심 추가 POST 존재 여부 — 없으면 관심도 확인 시트로 대체하고 되돌리기 생략).
- 로딩·빈·오류: 스켈레톤 행 5. 빈 = 종류별 기존 문구(`mypage_comp_settings_users_empty_*`). 오류 = 현행 재시도(`:114-121`) 모양만 교체. 해제 실패 = 토스트(현재 목록 위 빨간 글자 `:131`).
- 전환·복원: push/back 300ms, 스크롤 복원.
- 모바일·태블릿: 공통.
- 성능·캐시: hub 대기 0, 목록 GET 1회.
- 보존 조건: `UserListContent` 는 `AccountTab`·`SettingsTab`·`CommunityTab`·`MyPageItemScreen` 공유 → 이웃(`neighbor`) 문구(`community_neighbor_follow_remove`) 동작 유지, 다른 화면 회귀 확인.
- 현재와의 차이: 해제 확인 없음 — 버튼이 바로 `handleDelete`(`components/my/settings/UserListContent.tsx:175-185`, `:89-108`). 문구 "삭제"(`:184`). 로딩 글자(`:110-112`). 카드 테두리 박스(`AccountTab.tsx:126,137,148`).
- 완료 검증: 캡처(390·820) 3종 목록 / 빈 / 차단 해제 확인 시트 / 관심 해제 토스트 / 오류. 단위: type 별 버튼 문구, blocked·hidden 은 확인 후에만 DELETE, 취소 시 요청 0. 수동: 차단 해제 후 상대 글 노출 확인.
- 영향 파일: `components/my/settings/UserListContent.tsx`, `components/mypage/tabs/AccountTab.tsx`, i18n(해제 문구 3종·확인 문구).

### S15 동영상 자동재생 · 개인화 (v2 별도 행 없음, C-4) — 판정: 유지  (현재 감사 판정: PASS)
- 경로 / 진입 메뉴: `/mypage/section/settings/video-autoplay` · `/personalization`. 홈 행 숨김(C-4). 직접 URL·레거시(`settings/autoplay`·`preferences`)로만.
- 구조·콘텐츠 순서: 현행 유지.
- 표시: 현재 모드/토글 값.
- 컴포넌트·토큰: `MyScreen`, `MyRow`, `MyToggle`.
- CTA: 즉시 저장(`updateUserSettings` revert, `VideoAutoplayContent.tsx:42`, `PersonalizationContent.tsx:32`).
- 시트·모달·확인 흐름: 없음.
- 데이터·SSOT: `user_settings`.
- 로딩·빈·오류: 공통.
- 전환·복원: push/back 300ms.
- 모바일·태블릿: 공통.
- 성능·캐시: hub 대기 0.
- 보존 조건: 경로·데이터 KEEP(C-4).
- 현재와의 차이: 공통 대기·로딩 글자만.
- 완료 검증: 캡처(390) 각 1장. 수동: 저장 실패 토스트.
- 영향 파일: `components/my/settings/VideoAutoplayContent.tsx`, `PersonalizationContent.tsx`(모양만).

### S16 채팅 설정 (v2 S51) — 판정: 유지  (현재 감사 판정: PASS)
- 경로 / 진입 메뉴: `/mypage/section/settings/chat-settings`. 진입 = 홈 서비스 그룹 [채팅](`mypage-home-menu-config.ts:216`). 잘못된 `settings/[section]` 값의 기본 이동 대상이기도 함(`app/(main)/mypage/settings/[section]/page.tsx:50`).
- 구조·콘텐츠 순서: 채팅 푸시 · 미리보기 → 거래 접속 상태(온라인 표시·마지막 접속 숨김·공개 범위).
- 표시: 토글·선택 값.
- 컴포넌트·토큰: `MyScreen`, `MyGroup`, `MyToggle`.
- CTA: 토글 즉시 저장 — `user_settings` revert, 거래 접속 상태 PATCH 실패 시 이전 값 복귀 + 오류(이미 구현 `ChatSettingsContent.tsx:96-111`) → 오류 표시는 토스트로 통일.
- 시트·모달·확인 흐름: 없음.
- 데이터·SSOT: `user_settings`, `/api/me/trade-presence`.
- 로딩·빈·오류: 스켈레톤 토글 행(현재 글자 `:232`). 접속 상태 조회 실패 → 그룹 안 오류 + 재시도.
- 전환·복원: push/back 300ms.
- 모바일·태블릿: 공통.
- 성능·캐시: hub 대기 0.
- 보존 조건: 메신저 접속 표시 계약(`trade-presence`).
- 현재와의 차이: 기능 PASS. 공통 대기·로딩 글자.
- 완료 검증: 캡처(390·820) 1장씩. 단위: presence 실패 복귀(기존 동작 회귀 테스트). 수동: 토글 후 상대 화면 접속 표시.
- 영향 파일: `components/my/settings/ChatSettingsContent.tsx`(모양·토글 공통화).

### S17 캐시 삭제 (v2 S55) — 판정: 수정  (현재 감사 판정: PARTIAL)
- 경로 / 진입 메뉴: `/mypage/section/settings/cache`. 진입 = 홈 서비스 그룹 [캐시 삭제](`mypage-home-menu-config.ts:222`).
- 구조·콘텐츠 순서: 지울 항목 설명(이미지·화면 임시 데이터·목록 캐시) → 지우지 않는 것(로그인·동의·언어·작성 중인 글) → 하단 [캐시 삭제].
- 표시: 설명만(용량 표시 없음).
- 컴포넌트·토큰: `MyScreen`, `MyStickyCta`(secondary), `dibayConfirm`.
- CTA: [캐시 삭제] · 하단 · 진행 중 아님 · 확인 → `clearAppClientCaches()` → 토스트(이미 구현 `CacheSettingsContent.tsx:15-35`). 진행 중 문구 "로딩" → 버튼 내부 스피너.
- 시트·모달·확인 흐름: 확인 시트(현행 유지).
- 데이터·SSOT: **캐시 키 레지스트리 1곳**(신규 `lib/mypage/client-cache-key-registry.ts`): 지울 localStorage 키 목록 · 지울 sessionStorage 키 접두 목록 · Cache Storage. 레지스트리에 없는 키는 지우지 않음. 반드시 보존: 로그인·세션(`lib/auth/get-current-user.ts`, `supabase-profile-cache.ts`, `profile-setup-defer.client.ts` 등 auth 키), 기기 권한 안내(`DIBAY_PERMISSION_SESSION_STORAGE_KEY_PREFIX`), **작성 중 초안**(`lib/posts/trade-write-form-session-draft.ts`, `lib/business/business-apply-form-session-draft.ts`, `jobs-exchange-write-meet-spot-staging.ts`, `trade-write-meet-spot-staging.ts`), 주소 흐름 컨텍스트(`member-address-caller-context.ts`, `canonical-address-draft-storage.ts`), 언어·동의.
- 로딩·빈·오류: 정적 화면 — 로딩 없음. 삭제 실패 → 오류 토스트(현행).
- 전환·복원: push/back 300ms.
- 모바일·태블릿: 공통.
- 성능·캐시: hub 대기 0, 서버 요청 0.
- 보존 조건: `clear-app-client-caches.test.ts`(레지스트리 기준으로 갱신), AGENTS「거래 글쓰기 임시저장·이어쓰기」(`discardTradeWriteStashedDraft` 외 경로로 초안 삭제 금지).
- 현재와의 차이: 키 목록 대신 정규식(`lib/mypage/clear-app-client-caches.ts:12`) + **sessionStorage 전체 삭제 후 권한 키만 복구**(`:31-40`) → 거래·매장 신청 작성 초안, 주소 흐름 컨텍스트, 세션 auth 캐시까지 지워짐(위 파일들이 sessionStorage 사용). 진행 중 "로딩" 글자(`CacheSettingsContent.tsx:47`).
- 완료 검증: 캡처(390·820) 기본 / 확인 시트 / 완료 토스트. 단위: 레지스트리 키만 삭제, 거래 초안·auth·권한·주소 컨텍스트 키 보존, 미등록 키 보존. 수동: 거래 글쓰기 작성 중 → 캐시 삭제 → 글쓰기 복귀 시 이어쓰기 유지, 로그인 유지.
- 영향 파일: `lib/mypage/clear-app-client-caches.ts`, 신규 `lib/mypage/client-cache-key-registry.ts`, `lib/mypage/__tests__/clear-app-client-caches.test.ts`, `components/my/settings/CacheSettingsContent.tsx`, i18n(보존 항목 설명).

### S18 버전 (v2 S56) — 판정: 수정 (K6)  (현재 감사 판정: PARTIAL)
- 경로 / 진입 메뉴: `/mypage/section/settings/version`. 진입 = 홈 서비스 그룹 [버전](오른쪽 값 `1.2.4 (7)` 형식).
- 구조·콘텐츠 순서: 앱 아이콘 80 → "버전 x.y.z (빌드)" → "웹 배포 SHA 7자리"(있을 때) → 상태 줄 → (Android 만) [업데이트].
- 표시: Android `versionName (versionCode)` + Play 상태. iOS `1.2 (빌드)` 만, **업데이트 버튼·App Store 언급 없음**(v2.1 §0.1·S18, B1 배포 채널 미확인). 웹 = "웹 버전" + SHA(`NEXT_PUBLIC_WEB_DEPLOY_SHA`), 앱 버전 줄 대신 "웹에서 실행 중".
- 컴포넌트·토큰: `MyScreen`, 버튼 `sam-btn`(Android 비활성 `#D1D5DB/#6B7280` 인라인 유지 — AGENTS HARD LOCK, `VersionContent.tsx:42-51`), `DibayConfirmDialog`(현행 업데이트 확인).
- CTA: [업데이트] · 하단 · **Android 네이티브에서만 렌더**, Play 가 업데이트를 제공할 때 활성 · 확인 다이얼로그 → Play 인앱 업데이트(현행 `runUpdate`). iOS·웹 = 버튼 렌더 0.
- 시트·모달·확인 흐름: 업데이트 시작·설치 확인 다이얼로그(현행 `:607-668`) 유지.
- 데이터·SSOT: `App.getInfo`(Capacitor), Android Play 인앱 업데이트 플러그인, 서버 정책 `fetchAndroidUpdateServerPolicy`(`app_meta` 운영 미존재 B2 → 현행 대체값), 빌드 env SHA.
- 로딩·빈·오류: 버전 읽는 중 숫자 자리 스켈레톤(현재 "확인 중" 글자 `:548-554`). Play 확인 실패 → 상태 줄 + [다시 확인](현행).
- 전환·복원: push/back 300ms.
- 모바일·태블릿: 가운데 정렬, 버튼 최대 폭 `max-w-sm`(현행).
- 성능·캐시: hub 대기 0. Play 확인은 Android 에서만 1회.
- 보존 조건: `android-play-version-screen-cta.test.ts`(비Android 기대값 갱신: `showPrimaryButton=false`), 통화 중 업데이트 차단(`:341-348`), `user_devices.app_version` 과 같은 「버전 (빌드)」 표기.
- 현재와의 차이: iOS·웹에 비활성 [업데이트] 버튼 표시 — 비Android 분기가 `showPrimaryButton: true`(`lib/platform/android-play-version-screen-cta.ts:94-100`) → `VersionContent.tsx:591-604` 렌더. iOS 안내 "iOS에서는 App Store 업데이트를 사용합니다"(`VersionContent.tsx:253-257`) — 채널 미확인 상태에서 App Store 언급(v2.1 결정 #9 "미확인 주소·버튼 금지" 위반) → "iOS 앱 버전" 표시로 정정.
- 완료 검증: 캡처(390·820) Android 최신 / Android 업데이트 있음 / iOS / 웹(SHA). 단위: 비Android → 버튼 없음, iOS 문구에 App Store 없음, 웹 SHA 표시. 수동: 실기기 Android `1.2.4 (7)`·iPhone `1.2 (7)` 표시 = `user_devices.app_version`.
- 영향 파일: `lib/platform/android-play-version-screen-cta.ts`(+`__tests__`), `components/my/settings/VersionContent.tsx`, i18n(`settings_version_ios_note`).

### S19 탈퇴 (v2 S57) — 판정: 수정  (현재 감사 판정: PARTIAL)
- 경로 / 진입 메뉴: `/mypage/section/settings/leave`(`MYPAGE_HOME_ACCOUNT_LEAVE_HREF`, `lib/mypage/mypage-home-hub-links.ts:32`). 진입 = 홈 위험 그룹 [탈퇴]. 자기참조 리다이렉트 금지 주석(`mypage-section-legacy-redirect.ts:45-50`) 유지.
- 구조·콘텐츠 순서: 사라지는 것(3줄) → 보관되는 것(3줄, 경고 토큰 배경) → 사유(선택, 2000자) → **동의 체크박스** "위 내용을 확인했고 탈퇴를 요청합니다" → 하단 고정 [탈퇴 요청](danger). 접수 후: 접수 완료 안내 + 요청 시각(`formatMypageDate`).
- 표시: 요청 시각 `toLocaleString()`(`AccountDeletionRequestForm.tsx:104`) → `formatMypageDate`.
- 컴포넌트·토큰: `MyScreen`, `MyGroup`, `MyStickyCta`(danger, 보조 [취소] 왼쪽), `MobileConfirmBottomSheet`(danger), 체크박스. `amber-*`·`red-*`·`emerald-*`·`bg-white`(`:67,87-95,99-112,128`) → `sam-warning-soft`·`sam-danger(-soft)`·`sam-success` 토큰.
- CTA: [탈퇴 요청] · **하단 고정** · 동의 체크 + 진행 중 아님 + 미접수 · 탭 → 확인 시트 → POST `/api/me/leave-request`. [취소] · 같은 바 왼쪽 · 홈으로.
- 시트·모달·확인 흐름: **단어 입력("계정삭제") 대신 확인 시트** — 제목 "정말 탈퇴를 요청할까요?" 본문 "요청 후 처리되면 되돌릴 수 없어요" [취소]/[탈퇴 요청](danger). 서버 계약은 그대로 둠: API 가 `confirmationText === "계정삭제"` 를 요구(`app/api/me/leave-request/route.ts:31`)하므로 확인 시트 승인 시 클라이언트가 공용 상수(신규 `ACCOUNT_DELETION_CONFIRMATION_TOKEN = "계정삭제"`, API 와 같은 상수 import)를 보낸다 — API·DB(`account_deletion_requests.confirmation_text`) 변경 0.
- 데이터·SSOT: `/api/me/leave-request` → `account_deletion_requests`.
- 로딩·빈·오류: 정적(로딩 없음). 실패 → 토스트 + 버튼 재활성. 서버 원문 오류(`requestError.message`, `route.ts:42-44`, 한국어 하드코딩 `:32`)는 화면에 그대로 노출하지 않고 i18n 문구(`ui_account_delete_submit_err`)로.
- 전환·복원: push/back 300ms. 동의·사유 입력 후 뒤로 → 미저장 확인 시트(T3).
- 모바일·태블릿: 사유 입력 시 하단 바 키보드 위, safe-area.
- 성능·캐시: hub 대기 0.
- 보존 조건: 같은 폼을 쓰는 공개 경로 `app/account/delete-request/AccountDeleteRequestPageClient.tsx`(스토어 정책용 삭제 요청 페이지) — 변경은 `source === "mypage_settings"` 분기에만 적용하고, 공개 경로는 현행 단어 입력·모양·동작 그대로 둔다. 로그아웃·탈퇴 CTA = Danger(`mypage-authority-contract.ts` CTA Authority).
- 현재와의 차이: 확인 시트 없이 단어 입력(`components/account/AccountDeletionRequestForm.tsx:14-24,87-97`), 동의 체크 없음, 버튼이 본문 끝 일반 배치(`:115-132`, 하단 고정 아님), 하드코딩 색(위), 날짜 `toLocaleString`(`:104`).
- 완료 검증: 캡처(390·820) 기본 / 동의 전 버튼 비활성 / 확인 시트 / 접수 완료 / 실패 토스트 / 키보드 열림. 단위: 동의 없으면 POST 0, 확인 시트 취소 → POST 0, 승인 → 본문 `confirmationText` = 공용 상수, 2연타 POST 1, 공개 경로(`source` 다름)는 기존 단어 입력 유지. 수동: 운영에서 실제 제출 금지(테스트 DB 금지 규정) → 요청 본문은 네트워크 가로채기(모의)로만 확인, 실제 접수는 **NOT_PROVEN**.
- 영향 파일: `components/account/AccountDeletionRequestForm.tsx`(mypage 분기), `components/my/settings/LeaveContent.tsx`, `app/api/me/leave-request/route.ts`(상수 import 만, 동작 불변), 신규 상수 파일(`lib/account/account-deletion-contract.ts`), i18n.

---

## 부록 — 이 파트에서 발견한 K1~K7 밖 충돌·감사 정정

1. **S10 연동 로그인 위치(v2.1 vs v2)**: v2.1 S10 은 기기 권한 화면 안에 "연동 로그인"을 포함, v2 S53 은 별도 화면으로 분리. 우선순위(v2.1 > v2)로 **S10 안 별도 그룹(아래쪽, `#linked-login`)** 으로 정함. 파트 C(S50~S65, 감사 S53 행)도 같은 해석이어야 함.
2. **S02 반영 내역 목록**: v2 S02 는 `/api/me/trust/events` 목록 포함, v2.1 S02 행에는 없음 → v2.1 우선으로 이번 범위 제외(감사 §2 "코드 없는 것" 목록과 다름을 표기).
3. **S19 단어 입력 제거 ↔ API 계약**: 서버가 `"계정삭제"` 문자열을 요구(`app/api/me/leave-request/route.ts:31`). API 변경 없이 공용 상수 전송으로 해결(위 S19).
4. **감사 근거 정정**: S05 "`PhoneVerificationBox.tsx:100` 무한 로딩"의 실제 위치는 `MypageRequiredPhoneClient.tsx:100-102` + `PhoneVerificationBox.tsx:188-194`.
5. **S17 범위 확대 위험**: 현재 캐시 삭제가 sessionStorage 전체를 지워 거래 글쓰기 초안(AGENTS 거래 글쓰기 규정)까지 삭제 — 감사 표의 "정규식" 지적보다 영향이 큼.


---

# 최종 통합 설계서 — 파트 C: S20–S47 (거래·커뮤니티·주문·자산)

- 작성: 2026-10-20 (PHT) · 코드 수정 0 · 근거 = file:line(작성 시점 `HEAD` 트리에서 직접 열어 확인)
- 번호: **v2.1 §5.2 번호(S20–S47)** 를 쓴다. v2 §6.2 번호와의 대응은 C.0.1 표.
- 우선순위: 00-brief.md 의 1→5. 충돌 해결 K1–K7 그대로 사용(이 파트에 직접 해당: K2 전환 300ms, K3 스크롤 복원 유지, K7 S21 제외).
- K1–K7 로 덮이지 않는 충돌은 **C.0.4 (C1–C8)** 에 모으고, 각 화면 블록에서 번호로 참조한다.

---

## C.0 이 파트 공통 규칙 (각 블록은 여기를 참조하고 차이만 적는다)

### C.0.1 번호 대응 (v2.1 ↔ v2)

| v2.1 | v2 §6.2 | 화면 | 경로 |
|---|---|---|---|
| S20 | S10 (+S17 지역 일괄변경) | 판매 내역 | `/mypage/products` (← `/mypage/trade/sales` 307) — C1 |
| S21 | S11 | 구매 내역 | 제외 유지(K7) |
| S22 | S12 | 찜 | `/mypage/trade/favorites` |
| S23 | S13 | 가격 제안 | `/mypage/offers` |
| S24 | S14 | 거래 후기 | `/mypage/trade/reviews` |
| S25 | S15 | 최근 본 상품 | `/mypage/recent-viewed` |
| S26 | S20 | 내가 쓴 글 | `/mypage/community-posts` |
| S27 | S21 | 댓글·반응 | `/mypage/community-activity` |
| S28 | S16 | 채팅 준비 | `/mypage/trade/chat/compose` |
| S30 | S30 | 주문 내역 | `/mypage/store-orders` |
| S31 | S31 | 주문 상세 | `/mypage/store-orders/[orderId]` |
| S32 | S34 | 주문 내역서(시트) | S31 안 |
| S33 | S32 | 주문 후기 | `/mypage/store-orders/[orderId]/review` |
| S34 | S33 | 매장 문의 내역 | `/mypage/store-inquiries` |
| S40 | S40 | 포인트 | `/mypage/points` |
| S41 | S41 | 충전 신청 | `/mypage/points/charge` |
| S42 | S42 | 소멸 예정 | `/mypage/points/expiring` |
| S43 | S43 | 홍보 이용 | `/mypage/points/promotions` |
| S44 | S44 | 쿠폰 | `/mypage/coupons` |
| S45 | S45+S46 | 상품권 + 상세 | `/mypage/gift-certificates`, `…/[instanceId]` |
| S46 | S47+S48+S49 | 내 광고 + 신청 2화면 | `/mypage/ads`, `/mypage/ads/apply`, `/mypage/ads/feed-request` |
| S47 | S4A | 회원 혜택 | `/mypage/benefits` |

### C.0.2 공통 UI·동작 계약 (v2.1 §5.2 공통 행 + v2 §6.1 T1/T2/T3)

| 항목 | 확정 규칙 |
|---|---|
| 셸 | `MyScreen`(= `MySubpageHeader` 52px + 본문 좌우 16px / 태블릿 20px · 최대 폭 40rem 가운데) — v2 §6.1 공통 |
| 뒤로 | 앱 내 이전 화면이 있으면 history back, 직접 진입이면 화면별 `backHref`(블록에 명시) |
| 전환 | K2: 내정보 하위 화면 진입 우→좌 300ms, 뒤로 좌→우 300ms (`route-transition-enter-kind.ts` 내정보 경로 규칙만 추가). 시트 280ms, 모달 200ms, 토스트 220ms(03-NAVIGATION) |
| 스크롤·탭 복원 | K3: 전역 `history.scrollRestoration="manual"` 유지. 화면별로 `sessionStorage` 키 `mypage:scroll:<path>?<tab>` 에 스크롤 Y·로드된 페이지 수를 저장하고, 뒤로 진입 시 캐시 목록 즉시 렌더 → 저장 Y 복원. 탭은 URL 쿼리(`useMypageTabParam(key)`, `router.replace(…, {scroll:false})`) |
| 상태 4종 | `MyStateView`: 로딩(화면 구조 일치 스켈레톤, 각 블록 정의) · 빈(`SellerHubEmptyState` 아이콘+문구+주 CTA 1) · 오류(i18n 문구+[다시 시도], **오류 코드·영문 메시지 노출 금지**, 빈 문구와 동시 표시 금지) · 401만 로그인 이동 |
| 더 보기 | `MyListPager`: 하단 [더 보기] 버튼(자동 무한 스크롤 아님, 기존 주문·포인트 패턴과 동일) · 진행 중 스피너 · 실패 시 같은 자리 "더 불러오지 못했어요"+[다시 시도] · `next_cursor=null` 이면 버튼 숨김(끝 표시 없음) |
| 커서 형식(신규) | 응답 `next_cursor: string \| null` = `"<ISO timestamp>|<id>"` (기존 `/api/me/store-orders` 와 동일 형식, `app/api/me/store-orders/route.ts:173-174`). 요청 `?cursor=<값>&limit=<n>`. 기본 20, 최대 50. 서버 keyset `(ts, id) < (cursor.ts, cursor.id)` 내림차순 |
| 파괴적 동작 | `MobileConfirmBottomSheet`(danger) 확인 후 실행. 행 ⋯ = `DibayActionSheet` (인라인 드롭다운 금지) |
| 되돌릴 수 있는 해제 | 확인 없이 즉시 목록에서 제거 + `MypageToastHost` 액션 토스트 "[되돌리기]" **5초**(일반 토스트 3초 `MypageToastHost.tsx:8` 유지). 액션 토스트는 `pointer-events-auto`, 하단 탭바 위. 구현 방식은 C6 |
| 제출 | `useMypageSubmitGuard`: 진행 중 버튼 비활성+스피너, 중복 탭 무시 |
| 날짜·금액 | `formatMypageDate`(PHT 표시, 저장값 UTC 불변 — AGENTS §9) · `formatMoneyPhp`/`CurrencyAmount` (`toLocaleString` 직접 호출 금지) |
| 색 | `sam-*` 토큰/`Sam.*` 시맨틱 클래스만. hex·`red-50/600`·`blue-50`·`amber-*`·`text-white` 직접 사용 금지(위험=`sam-danger`/`sam-danger-soft`, 정보=`sam-info*`, 경고=`sam-warning*`, 주색 위 글자=`sam-text-on-primary`) |
| 문구 | i18n 키만. 한국어 fallback 하드코딩 신규 추가 금지 |

### C.0.3 신규·변경 API (이 파트 전체 정의 — 블록에서 이름으로 참조)

| ID | API | 요청 | 응답 | 소유 도메인 / 다른 소비자 |
|---|---|---|---|---|
| A1 | `GET /api/my/posts` (변경, **옵트인**) | 기존 무인자 호출 = 현행 전체 목록 그대로. `limit`이 있으면 페이지 모드: `?limit=20&cursor=<updated_at|id>&filter=all\|active\|sold\|hidden&promoted=0\|1` | 페이지 모드 `{ posts: Product[], next_cursor }`. 오류 5xx `{ error:"my_posts_load_failed" }` | **거래 도메인 파일**. 다른 소비자: `components/trade/MarketplaceSellHubPage.tsx:51`, `hooks/usePromotionOrderTargets.ts:40`, `app/(main)/mypage/ads/feed-request/page.tsx:172`, e2e `tests/e2e/trade-category-form-runtime-closure.spec.ts:338` — 무인자 응답 불변(C2) |
| A2 | `GET /api/favorites/list` (변경) | `?limit=20&cursor=<created_at|id>&chip=all\|active\|sold\|gone&counts=1`(첫 페이지만) | `{ items, authenticated, next_cursor, counts?: {all,active,sold,gone} }` · 비로그인 200 `authenticated:false` 유지 · DB 오류 500(현행 `route.ts:45,63`) | 거래 찜 파일. 다른 소비자 0(관리자 문서 주석만 `app/api/admin/favorite-audit/route.ts:3`). 무인자 호출 = 현행 전체 응답 유지 |
| A3 | `GET /api/my/received-reviews`, `GET /api/my/written-reviews` (변경) | `?limit=20&cursor=<created_at|id>` · 무인자 = 현행 100건(`route.ts:34`) | `{ items, next_cursor }` · 오류 500 | 거래 후기 파일. 다른 소비자: 관리자 안내 문구만(`AdminReviewListPage.tsx:69-70`) |
| A4 | `GET /api/me/community-posts` (변경) | `?scope=own&status=active\|hidden&limit=20&cursor=<created_at|id>` · `scope` 없으면 현행(`limit` 1–20, 공개만) | `{ ok, posts: CommunityFeedPostDTO[] (+ isHiddenForOwner, hiddenReason?), next_cursor }` · 오류 500 `{ok:false}` (현행은 빈 배열 — `list-community-posts-for-user.ts:183-189`) | **커뮤니티 도메인 파일**(`lib/community-feed/list-community-posts-for-user.ts`에 owner 함수 추가, 기존 함수 불변). 다른 소비자: `components/mypage/tabs/CommunityTab.tsx:127`, `ads/feed-request/page.tsx:171` — 무 `scope` 응답 불변 |
| A5 | `GET /api/me/community-activity` (변경) | `?tab=comments\|reactions\|saved\|reports&limit=20&cursor=<created_at|id>` · `tab` 없으면 현행 5종 각 20건 묶음(`community-activity-load-server.ts:59-84`) | 탭 모드 `{ ok, tab, items, next_cursor }` · 오류 500 | 내정보 파일. 다른 소비자: `components/mypage/tabs/CommunityTab.tsx:228` — 무 `tab` 응답 불변 |
| A6 | `DELETE /api/community/posts/[postId]/like` · `DELETE /api/community/posts/[postId]/save` (신규 분기) | 본문 없음 | `{ ok:true, liked:false }` / `{ ok:true, saved:false }` · 행이 없어도 200(멱등) · 401 | **커뮤니티 도메인 파일**. 규칙: 본인 행 삭제는 글 공개 여부·차단 관계와 무관하게 허용(v2 D12). POST 토글 규칙·알림 불변(`save/route.ts:11-71`, `like/route.ts:41-112`). like 삭제 후 `like_count` 는 기존 트리거/집계 그대로(확인 필요: 카운트 갱신 주체) |
| A7 | `DELETE /api/community/posts/[postId]/comments/[commentId]` | 기존 라우트 사용(`…/comments/[commentId]/route.ts:52`) | 기존 | 변경 없음 — 화면에서 호출만 |
| A8 | `GET /api/me/points` (변경) | 동일 | `expiring` 에 `entries: [{ expiresAt, amount }]` 추가(잔액 상한 FIFO 배분, `computeExpiringPointsFromLedger` 와 같은 파일에 `allocateExpiringEntries` 추가). 소멸 조회 실패 시 `expiring:null` + `expiringError:true` (현행은 0 으로 남김 `route.ts:123-139`) | 내정보·포인트. 다른 소비자: 관리자 없음(확인: `rg "/api/me/points"`) |
| A9 | `POST /api/me/points/charge` (변경) | 헤더 `Idempotency-Key: <uuid v4>` | 같은 키 재요청 → 첫 응답 그대로 200 | **DB 컬럼 필요**(C7) |
| A10 | `GET /api/me/store-inquiries` (변경) | 동일 | 각 행에 `store_slug` 추가(현행 `store_name` 만 `route.ts:36-40`) | 매장 도메인 파일(조회 컬럼 1개 추가) |

### C.0.4 K1–K7 로 덮이지 않는 충돌 (권장 해결 포함)

| ID | 충돌 | 근거 | 권장 해결 (우선순위 근거) |
|---|---|---|---|
| **C1** | S20: v2.1 "판매 내역 `/mypage/trade/sales` 단일 화면 · 탭 [판매중·예약중·거래완료·숨김](개수) · ⋯ 끌어올리기 · 보조 [지역 일괄변경]" + v2 D8 "`MyProductsView` 를 `/mypage/trade/sales` 로 이동, `/mypage/products` 307" ↔ 마켓 UI-6 HARD LOCK "PRIMARY `/mypage/products` · 필터 전체/판매중/판매완료/숨김/홍보 · ⋮ 수정/더 알리기/판매완료/숨김/삭제 · 끌올/4-state 금지" | `docs/mypage-v2/dibay-mypage-v2.1-supplement.md:270`, v2 `:319,:502`, `docs/dibay-marketplace-ui-6-my-listings-hard-lock.md:61-80,108-117` | **HARD LOCK(우선순위 2) 우선.** 화면 = `/mypage/products` 유지, `/mypage/trade/sales` → `/mypage/products` 리다이렉트 유지(`app/(main)/mypage/trade/sales/page.tsx:4-6`). 예약중 탭·탭 개수·끌어올리기·화면 내 지역 일괄변경 버튼 **추가하지 않음**. 지역 일괄변경은 홈 6 서비스 그룹 행으로 유지(v2.1 §5.1). 단, UI-6 lock 문서는 "`/mypage/trade/sales` tabs PASS / UNCHANGED" 라고 적었으나 현재 트리는 리다이렉트만 있음 → 언제 바뀌었는지 **확인 필요**(로컬 이력 얕음: `git log` 1건 `e23b9c0b`). Owner 확인 항목 |
| **C2** | v2 D10 "`/api/my/posts` 소비자 = 내정보만" ↔ 실제 소비자 4곳(마켓 판매 허브·홍보 대상 훅·피드 광고 신청·e2e) | v2 `:504`, C.0.3 A1 근거 | 커서는 **옵트인**(`limit` 있을 때만). 무인자 응답 바이트 동일 유지 + 회귀 테스트 |
| **C3** | 공통 "탭 상태 `?tab=`" ↔ 이미 URL 유지 중인 다른 키: S20 `?filter=&promoted=`(UI-6 lock `lib/products/my-product-listing-filter.ts`), S22 `?fav=`(`FavoritesHubView.tsx:31`), S44/S45 `?tab=coupons&couponTab=` / `giftTab=`(배달 커머스 허브 `CommerceHubLegacyUrlSync.tsx:33-53`) | 각 file:line | 기존 키 유지(변경 시 공유 링크·다른 도메인 회귀). `useMypageTabParam(key)` 가 키 이름을 인자로 받는다. 신규 탭 화면만 `?tab=` |
| **C4** | 설계 탭 집합 ↔ 현재 기능이 더 많음: S30 [전체] 탭 추가 보유(`member-order-tab-status.ts:19` all/active/done/issue), S45 [받은] 탭 보유(`CustomerGiftWalletBody.tsx:352`), S40 설계 [전체·적립·사용·충전] ↔ API 필터 all/credit/debit + `view=charges` | 각 file:line | 기능 삭제 금지(우선순위 1) → **현재 상위집합 유지**, 설계 탭은 모두 포함되도록 매핑(블록에 명시) |
| **C5** | S30·S31 하드코딩 색 제거(`FB_*` 등) ↔ 같은 컴포넌트를 배달 도메인이 사용(`components/orders/customer-commerce/BuyerDeliveryOrdersBody.tsx:5`, `variant="deliveryHub"`), 상세의 채팅 버튼은 배달 토큰 `--delivery-*` 사용(`MyStoreOrderDetailView.tsx:627-631`) | 각 file:line | 색 토큰화는 공용 행에 적용(같은 값 의미 매핑) + **배달 허브 캡처를 완료 검증에 포함**. `isDeliveryHub` 분기 배경 `bg-[#f6f6f6]`(`MyStoreOrdersView.tsx:903`)은 배달 화면 고유 → 범위 밖(보고만) |
| **C6** | "되돌리기 토스트" 구현 ↔ 커뮤니티 like/save POST 는 숨김·삭제 글·차단 관계에서 404/403(`save/route.ts:29-35`, `like/route.ts:30-34`) → 해제 후 되돌리기(재등록)가 불가능 · 찜 하트는 마켓 공용 `PostCard`(UI-4 lock 대상) 안에서 즉시 토글(`FavoritePostCard.tsx:19-27`) | 각 file:line | 커뮤니티(S27): **지연 커밋** — 목록에서 즉시 제거, 5초 뒤(또는 `pagehide`/화면 이탈 시 즉시) A6 DELETE 실행, [되돌리기]는 서버 호출 없이 취소. 찜(S22): 하트가 이미 서버 토글을 끝낸 뒤 콜백 → [되돌리기] = 같은 `toggleFavorite(postId)` 재호출(찜 토글은 공개 여부 게이트 없음 `app/api/favorites/toggle/route.ts:85-110`) + 원래 위치에 다시 삽입. 사용자 체감은 동일 |
| **C7** | S41 "멱등 키" ↔ `point_charge_requests` 에 멱등 컬럼 없음(마이그레이션 grep 0), 승인된 DB 변경은 M1–M5 뿐 | `supabase/migrations/*point_charge*`, v2 §11 | 신규 마이그레이션(가칭 **M6**: `point_charge_requests.idempotency_key text` + `unique (user_id, idempotency_key) where idempotency_key is not null`) — **Owner 승인 필요**. 승인 전에는 클라이언트 제출 방지(`useMypageSubmitGuard`)만 적용하고 S41 판정은 PARTIAL 유지 |
| **C8** | S47 "행 → 사용처" ↔ 정책 레코드에 이동 대상 필드 없음(`lib/types/member-benefit.ts:11-30`: 할인율·가중치·권한 플래그만) | file:line | 필드에서 파생: `adDiscountRate>0`→`/mypage/ads`, `pointRewardBonusRate>0`→`/mypage/points`, `canAccessPremiumPromotion`→`/mypage/points/promotions`, `canOpenBusinessProfile`→`/mypage/business`, 노출 가중치(home/search/shopFeatured)→이동 없음(정보 행, chevron 없음). DB 변경 없음 |

---

## C.1 거래 (S20–S28)

### S20 판매 내역(내 판매물품) — 판정: 수정 (HARD LOCK 범위 내 결함 수정만)  (현재 감사 판정: FAIL)

- 경로 / 진입 메뉴: `/mypage/products` (홈 2 활동 "진행중 거래"/판매 행 → `MYPAGE_HOME_TRADE_SALES_HREF`=`/mypage/trade/sales` → 307 `/mypage/products`; `lib/mypage/mypage-home-hub-links.ts:5`, `app/(main)/mypage/trade/sales/page.tsx:4-6`). 다른 판매 경로 `/mypage/sales`→trade/sales→products(`app/(main)/mypage/sales/page.tsx`) — 리다이렉트 사슬 2단 → **홈 링크를 `/mypage/products` 로 직접 바꿔 1회 이동**(C1, v2.1 "다른 판매 경로는 1회 이동").
- 구조·콘텐츠 순서 (**UI-6 LOCK 그대로**): 헤더 "내 판매물품" → 고정 필터행 `MyProductFilter` [전체·판매중·판매완료·숨김] + 꼬리 [포인트 홍보] 토글(`MyProductFilter.tsx:62-103`) → 카드 목록(사진 → 가격 → 제목 → 지역 → 판매상태·시간 → 홍보 배지, `MyProductCard`) → 하단 고정 [상품 등록](`MyProductsView.tsx:405-416`).
  - **변경 금지(LOCK)**: 필터 종류·순서·문구, 카드 순서, ⋮ 항목(수정/더 알리기/판매완료/숨김/삭제), 판매완료 확인 문구(후기 유도 없음), 4-state 미노출, 끌올·판매취소 미노출, 2차 배너 없음, `PostSellerTradeStrip`, 더 알리기 URL `/mypage/points/promotions?postId=`.
  - **변경 허용(결함 수정)**: 로딩 스켈레톤, 오류 화면 분리, 커서 더 보기, ⋮ 메뉴 표면(인라인 드롭다운 → `DibayActionSheet`, 항목·순서·문구 동일), 하드코딩 색·문구 제거, 뒤로 목적지, 전환·스크롤 복원.
- 표시(프로필·숫자·상태): 상태 뱃지 = 기존 `resolveMarketplacePublicListingStatus` + `productStatusLabel`(`MyProductActions.tsx:8-11`) 그대로. 필터 개수 표시는 **추가하지 않음**(C1). 홈 "판매중 n" 은 summary API 가 A1 과 같은 서버 함수(`filter=active` 카운트)로 계산(파트 A 소관).
- 컴포넌트·토큰: `MyScreen`(기존 `MypageSubpageShell` 대체 가능 시) · `MyProductFilter`(LOCK) · `MyProductCard`(LOCK) · `DibayActionSheet` · `MobileConfirmBottomSheet` · `MyStateView` · `MyListPager` · `SellerHubEmptyState`(현행 `MyProductsView.tsx:264-377` 유지) · 삭제 문구 색 `text-red-600 hover:bg-red-50`(`MyProductActions.tsx:127`) → `text-sam-danger`.
- CTA:
  - [상품 등록] · 하단 고정(현행) · 항상 활성 · `openTradeWriteSheet("")`(`MyProductsView.tsx:253-257`) — 유지.
  - 카드 ⋮ → 액션 시트: [수정] `/products/{id}/edit` · [더 알리기](active·미판매만) 홍보 시트 · [판매완료]/[숨기기]/[다시 판매] 확인 시트(`dibayConfirm` → `MobileConfirmBottomSheet`, 문구 동일 `MyProductActions.tsx:45-56`) · [삭제] danger 확인 시트(`:58-69`).
  - 빈 상태 CTA(필터별) 현행 유지.
- 시트·모달·확인 흐름: 상태 변경·삭제 = 확인 시트(파괴적). 실패 시 `dibayAlert` 대신 오류 토스트(`showMypageToast(t("mypage_comp_product_network_change_failed"),"error")`); 서버 영문/한국어 원문 `data.error ?? "상태 변경에 실패했습니다."`(`MyProductsView.tsx:219`) 노출 금지.
- 데이터·SSOT: A1 페이지 모드 `GET /api/my/posts?limit=20&filter=<filter>&promoted=<0|1>&cursor=` — 서버가 `updated_at desc, id desc` keyset 으로 100행씩 읽고 **같은 술어** `filterMyProductsByListingAxis`(`lib/products/my-product-listing-filter.ts:102-113`, 서버 import 가능 — `"use client"` 없음)를 적용해 20건을 채움. `promoted=1` 이면 서버가 `point_promotion_orders` 활성 대상(`collectActivePromotionTargetIds` `:73-88`)을 같은 요청에서 계산. 판매 거래 행 `fetchTradeHistorySalesBySession`, 홍보 대상 `/api/me/points/promotion-orders` 는 현행 유지. 상태 변경 `POST /api/posts/[id]/owner-status`, 삭제 `POST /api/posts/[id]/owner-delete`(현행).
- 로딩(스켈레톤 형태) · 빈 · 오류+재시도:
  - 스켈레톤: 필터행은 실제 렌더(정적), 목록 = 카드 5개 [100×100 사진 블록 + 가격 1줄(40%) + 제목 2줄 + 지역 1줄(30%) + 상태 1줄] — 현재 "로딩" 글자(`MyProductsView.tsx:381-384`) 대체.
  - 빈: 현행 필터별 빈 상태 유지.
  - 오류: 현재 `!res.ok → []`(`MyProductsView.tsx:76`)·`catch → []`(`:130-136`) 로 빈 목록 표시 → `MyStateView` 오류 + [다시 시도]. 판매 거래 행 실패(`salesLoadFailed`)는 현행처럼 카드 단위 안내 유지.
- 전환·복원: 우→좌 300ms / 뒤로 반대(K2). 뒤로 목적지 `backHref="/market/sell"`(`MyProductsPageClient.tsx:53`) → **history 우선, 직접 진입 시 `/mypage`**. 필터는 `?filter=&promoted=` 유지(현행 `:33-47`, C3). 스크롤 Y·로드 페이지 수 복원(C.0.2).
- 모바일·태블릿: 390px 1열 카드, 820px 같은 1열·최대 폭 40rem 가운데(카드 사진 100×100 고정). 하단 고정 CTA 는 `MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS` 위(현행). ⋮ 시트는 태블릿에서도 바텀시트(가운데 최대 폭).
- 성능·캐시: 첫 진입 요청 3개(A1 페이지·promotion-orders·trade-history sales, 현행 동일 수). 재진입 시 `runSingleFlight` 키 `me:my-posts:{uid}:{filter}:{promoted}:{cursor}` 메모리 캐시 즉시 렌더 후 조용한 갱신. focus·visibility 재조회 현행 유지(`:146-169`), 단 이미 불러온 추가 페이지는 첫 페이지만 교체(주문 목록 패턴 `MyStoreOrdersView.tsx:643-653`).
- 보존 조건: UI-6 LOCK 전 항목(`docs/dibay-marketplace-ui-6-my-listings-hard-lock.md:61-80`) · 테스트 `lib/trade/__tests__/marketplace-ui-6-my-product-card.test.ts` · A1 무인자 응답(마켓 판매 허브 `MarketplaceSellHubPage.tsx:51`, `usePromotionOrderTargets.ts:40`, 피드 광고 신청 `:172`) · 마켓 `/market` 목록 불변조건 §9(이 화면은 `getPostsForHome` 미사용 — 접촉 없음) · 쓰기 시트 `TradeCategoryWriteForm` 경로.
- 현재와의 차이 (감사 근거 file:line): 오류=빈 목록 `MyProductsView.tsx:76,130-136` · 글자 로딩 `:381-384` · 더 보기 없음(전체 일괄, `app/api/my/posts/route.ts:26-32` limit 없음) · 인라인 드롭다운 ⋮ `MyProductActions.tsx:86-131` · 하드코딩 문구 `MyProductsView.tsx:219` · 하드코딩 색 `MyProductActions.tsx:127` · 뒤로 `/market/sell` `MyProductsPageClient.tsx:53` · 리다이렉트 2단 `sales/page.tsx`→`trade/sales/page.tsx`. (감사의 "예약중 탭·개수·끌어올리기·지역 일괄변경 없음"은 C1 에 따라 **결함 아님**으로 재판정.)
- 완료 검증: 캡처 390px·820px × {스켈레톤, 전체 목록, 판매중/판매완료/숨김/홍보 필터, 빈(전체·숨김), 오류(API 500 주입)+재시도, ⋮ 액션 시트, 삭제 확인 시트, 더 보기 2페이지} · 단위: A1 무인자 응답 스냅샷 불변, 페이지 모드 keyset·필터 술어 일치(같은 입력에서 전체 목록 필터 결과 = 페이지 합), `promoted=1` · UI-6 contract test PASS · 수동: Samsung·Xiaomi 에서 UI-6 lock 관찰 항목 재확인(카드 순서·⋮ 5항목·overflowX false), 뒤로 → 홈 스크롤 복원, 마켓 판매 허브 매물 수 변화 없음.
- 영향 파일: `components/mypage/products/MyProductsView.tsx`, `MyProductActions.tsx`(표면만), `MyProductsPageClient.tsx`, `app/api/my/posts/route.ts`(거래 도메인), `lib/products/my-product-listing-filter.ts`(서버 재사용, 로직 불변), `lib/mypage/mypage-home-hub-links.ts`, 신규 `components/mypage/ds/*`.

### S21 구매 내역 — 판정: 유지(제외)  (현재 감사 판정: 의도 제외)

- 경로 / 진입 메뉴: `/mypage/trade/purchases`·`/mypage/purchases` → 메신저 거래 채팅 목록 리다이렉트(`app/(main)/mypage/trade/purchases/page.tsx:4-7`, `app/(main)/mypage/purchases/page.tsx:4-7`). 홈 2 활동 "구매 내역" 행 = 거래 채팅 목록으로 이동.
- 구조·콘텐츠 순서: 별도 화면 없음. **사유: K7 + 마켓 UI-6 HARD LOCK "Reintroduce buyer purchase list" 금지(`docs/dibay-marketplace-ui-6-my-listings-hard-lock.md:117`), CUT E(구매 이력 = 메신저 거래 목록).** v2.1 S21·v2 §9 "구현" 행은 적용하지 않는다.
- 표시: 홈 행 오른쪽 값 "—"(v2.1 §5.1 표와 동일).
- 컴포넌트·토큰: 해당 없음(홈 `MyRow` 만).
- CTA: 홈 행 탭 → `TRADE_CHAT_MESSENGER_LIST_HREF`.
- 시트·모달·확인 흐름: 없음.
- 데이터·SSOT: `product_chats`(메신저 거래 목록 소관).
- 로딩·빈·오류: 메신저 소관.
- 전환·복원: 홈→메신저는 탭 간 이동 규칙(내정보 300ms 규칙 미적용 — 목적지가 내정보 밖).
- 모바일·태블릿: 해당 없음.
- 성능·캐시: 리다이렉트 1회(서버 `redirect`).
- 보존 조건: 두 리다이렉트 유지, 구매 목록 UI 재도입 금지, `/mypage/purchases/[chatId]` 기존 동작 불변.
- 현재와의 차이: 없음(의도 제외).
- 완료 검증: 수동 — `/mypage/purchases`, `/mypage/trade/purchases` 직접 진입 시 1회 리다이렉트로 거래 채팅 목록 도달(390px 캡처 1장). 단위: 없음(기존 라우트 테스트 유지).
- 영향 파일: 없음(홈 행 링크는 파트 A).

### S22 찜 — 판정: 수정  (현재 감사 판정: PARTIAL)

- 경로 / 진입 메뉴: `/mypage/trade/favorites` (홈 2 활동 "찜" 행, 오른쪽 값 n). 셸 = 거래 허브 레이아웃 `app/(main)/mypage/trade/layout.tsx` + `TradeHubSectionShell`(`trade/favorites/page.tsx:9-12`).
- 구조·콘텐츠 순서: 1단 탭 [상품 · 매장](개수) → 상품 탭: 칩 [전체·판매중·거래완료·삭제됨](개수) → 상품 카드 그리드(마켓 `PostCard`) → 더 보기 / 매장 탭: 매장 행 목록.
- 표시: 개수 = A2 `counts`(서버 전체 기준; 현재는 받은 목록 기준 `FavoriteProductsView.tsx:61`). 삭제됨 칩 = 숨김·삭제 상태 글(`getFavoriteManageTabId`). 글 행 자체가 없는(하드 삭제) 찜은 현행처럼 제외(`app/api/favorites/list/route.ts:75-76`).
- 컴포넌트·토큰: `TradeManagementTabBar`(현행) · `FavoritePostCard`→`PostCard`(마켓 공용, 수정 금지) · `FavoriteStoreRow` · `MyStateView` · `MyListPager` · `SellerHubEmptyState`(현행 자체 빈 블록 `:141-155` 대체) · `MypageToastHost`(액션).
- CTA: 하트 ♡ 해제 → 즉시 목록에서 제거 + 토스트 "찜을 해제했어요 [되돌리기]"(5초) → 되돌리기 = `toggleFavorite(postId)` 재호출 + 원래 인덱스 복원(C6). 매장 탭 하트 해제 동일(`useStoreFavoriteToggle` 재호출). 빈 화면 주 CTA [둘러보기] → 상품 `/market`, 매장 `/stores`(현행 embedded 에서 숨김 `:148`, `FavoriteStoresView.tsx:66` → 표시).
- 시트·모달·확인 흐름: 확인 시트 없음(되돌릴 수 있는 해제). 되돌리기 실패 시 오류 토스트.
- 데이터·SSOT: A2 `GET /api/favorites/list?limit=20&chip=&cursor=&counts=1` → `favorites`+`posts`(서버가 `filterFavoritesByTab` `lib/mypage/favorite-manage-tabs.ts:23` 술어 재사용). 매장: `/api/me/store-favorites/list`(현행, 커서 없음 — 운영 최대 건수 확인 필요). 토글 `POST /api/favorites/toggle`(현행).
- 로딩·빈·오류:
  - 스켈레톤: 탭바 실제 렌더 + 칩행 4개 회색 pill + 그리드 카드 6개(정사각 사진 + 가격·제목 2줄) / 매장 탭: 행 5개(48 원형 + 2줄).
  - 빈: 탭·칩별 문구(현행 키 `ui_fav_tab_empty_*`).
  - 오류: 상품 탭 현행 오류+재시도(`:130-139`) 유지·`MyStateView` 로 교체. **매장 탭: `getFavoritedStores` 가 실패를 `authenticated:false` 로 돌려 로그인 화면으로 보냄**(`lib/stores/get-favorited-stores-client.ts:22-28` + `FavoriteStoresView.tsx:50-59`) → 결과에 `error` 추가, 401 만 로그인 이동.
- 전환·복원: 300ms(K2). 1단 탭 `?fav=trade|store`(C3, 현행은 초기값만 읽고 변경 시 URL 미반영 `FavoritesHubView.tsx:31-34,61`), 칩 `?chip=all|active|sold|gone` 추가 — 둘 다 `router.replace`. 스크롤 복원.
- 모바일·태블릿: 390px 그리드 2열(`TRADE_FEED_PRODUCT_GRID_CLASS` 현행), 820px 같은 클래스의 태블릿 열 수(현행 값 유지 — 마켓 그리드와 동일해야 함).
- 성능·캐시: 첫 진입 = 개수 훅(`useMyFavoriteCount`) + A2 1회. `POST_FAVORITE_CHANGED_EVENT` 조용한 재조회는 첫 페이지만 교체. 매장 탭은 탭 최초 선택 시 지연 로드(현행 조건부 렌더 유지).
- 보존 조건: v2 D2 훅 순서 수정(`FavoriteProductsView.tsx:63-72`) · D11 401만 로그인 · `PostCard`/하트 컴포넌트(마켓 UI-4) 무변경 · 홈 거래내역 시트·패널이 같은 컴포넌트 사용(v2 D2 영향 범위).
- 현재와의 차이: 되돌리기 없음 `FavoritePostCard.tsx:25-30` · 탭 URL 미유지 `FavoritesHubView.tsx:61`, 칩 상태 로컬 `FavoriteProductsView.tsx:36` · 매장 탭 오류→로그인 이동 `get-favorited-stores-client.ts:22-28` · 글자 로딩 `FavoriteProductsView.tsx:103-119`, `FavoriteStoresView.tsx:76-83` · 전체 일괄 조회(커서 없음) `app/api/favorites/list/route.ts:34-38`.
- 완료 검증: 캡처 390/820 × {스켈레톤, 상품 전체, 칩 4종, 매장 탭, 빈(상품·매장), 오류(상품·매장 각각 500 주입), 해제 토스트[되돌리기], 더 보기} · 단위: A2 페이지·칩·counts, 무인자 응답 불변, 매장 클라이언트 500→error(로그인 이동 안 함), 되돌리기 시 인덱스 복원 · 수동: 해제→되돌리기→새로고침 후 찜 유지, `?fav=store` 공유 링크 진입.
- 영향 파일: `components/favorites/FavoritesHubView.tsx`, `FavoriteProductsView.tsx`, `FavoriteStoresView.tsx`, `FavoritePostCard.tsx`(콜백만), `lib/stores/get-favorited-stores-client.ts`, `lib/favorites/getFavoritedPosts.ts`, `app/api/favorites/list/route.ts`, `components/mypage/MypageToastHost.tsx`, `lib/mypage/mypage-toast.ts`.

### S23 가격 제안 — 판정: 수정  (현재 감사 판정: FAIL)

- 경로 / 진입 메뉴: `/mypage/offers?tab=received|sent` (홈 2 활동 "가격 제안" 행, 오른쪽 값 "받은 대기 n"). 기존 `/mypage/offers/received`·`/sent`·`/my/offers/*` → `/mypage/offers?tab=…` 리다이렉트(판매자 목록 링크 `OfferListSeller.tsx:235`, `OfferListSellerModal.tsx:53` 호환).
- 구조·콘텐츠 순서: 탭 [받은 제안 · 보낸 제안](대기 개수) → 행(상품 썸네일·제목 · 제안 금액 · 상태 뱃지 · 남은 시간/날짜) → 행 하단 액션.
- 표시: 상태 라벨 i18n(현재 한국어 하드코딩 맵 `MyOffersView.tsx:17-20`) · 금액 `formatMoneyPhp`. 기본 탭: `?tab` 없으면 받은 제안(홈 링크는 받은 대기>0 이면 `?tab=received`, 아니면 `?tab=sent` — summary 값 사용).
- 컴포넌트·토큰: `MyScreen` · 2탭 세그먼트(`TradeManagementTabBar`) · `MyRow` 변형(썸네일) · `MobileConfirmBottomSheet` · `MyStateView` · `SellerHubEmptyState`.
- CTA:
  - 받은·대기: [수락](주) · [거절](보조, **확인 시트 danger** "이 제안을 거절할까요?") — 현재 거절 즉시 실행(`MyOffersView.tsx:283-305`).
  - 보낸·대기: [제안 철회] 확인 시트(현행 `:325-333`, M4).
  - 보낸·수락: 채팅 이동(현행 `:219`). 보낸·거절/철회: 다시 제안(현행 `:238`).
  - 행 탭 → 상품 상세/채팅(현행 링크 유지).
- 시트·모달·확인 흐름: 거절·철회 = 확인 시트. 수락 = 즉시(되돌릴 수 없는 긍정 동작이나 v2.1 은 확인 요구 없음). 실패 = 오류 토스트(서버 원문 `json.error`·"네트워크 오류…" 하드코딩 `:262,272,294,304` 노출 금지).
- 데이터·SSOT: `GET /api/offers/received`, `GET /api/offers/mine`(현행), `POST /api/offers/[id]/accept|reject|withdraw` → `price_offers`. 커서: **미적용**(설계 §10.2 대상 아님) — `mine` 은 `limit` 지원(`app/api/offers/mine/route.ts:21-29`), 운영 1인 최대 건수 **확인 필요**; 100 초과 회원 발견 시 별도 과제.
- 로딩·빈·오류: 스켈레톤 = 탭 실제 + 행 5개(56 썸네일 + 2줄 + 우측 금액 블록) / 탭별 빈(현행 키 `mypage_offers_*_empty`) / 오류+재시도(현재 오류 문구와 빈 문구 조건 분기 `:158-170` → `MyStateView` 하나만).
- 전환·복원: 300ms. `?tab=` (`useMypageTabParam("tab")`), 탭 전환 시 탭별 스크롤 위치 각각 저장.
- 모바일·태블릿: 390px 버튼 2개 가로 반반, 820px 행 오른쪽 정렬 버튼.
- 성능·캐시: 탭별 1회 요청, `runSingleFlight("my-offers:{mode}")` 현행 + 탭 재방문 메모리 캐시. 수락·거절 후 `broadcastPriceOfferCreatedForProduct` 현행 유지.
- 보존 조건: M4 철회 · 판매자 상세의 제안 목록(`OfferListSeller`) 링크 동작 · 가격 제안 알림.
- 현재와의 차이: 탭 구조 없음(받은/보낸 별도 페이지 `app/(main)/mypage/offers/page.tsx:17-23`=보낸만, `received/page.tsx`) · 거절 확인 없음 `MyOffersView.tsx:283` · 하드코딩 한국어 `:17-20,98,104,262,272,294,304` · 글자 로딩 `:157`.
- 완료 검증: 캡처 390/820 × {스켈레톤, 받은(대기·수락·거절), 보낸(대기·철회), 거절 확인 시트, 철회 확인 시트, 빈 2종, 오류} · 단위: 리다이렉트 3경로→`?tab`, 기본 탭 규칙, 거절은 확인 후에만 API 호출 · 수동: 판매자 상세 "받은 제안" 링크 → 받은 탭.
- 영향 파일: `app/(main)/mypage/offers/page.tsx`, `offers/received/page.tsx`, `offers/sent/page.tsx`, `components/offers/MyOffersView.tsx`(거래 도메인 파일, 내정보 전용 소비 3곳뿐 — grep 확인), i18n 메시지.

### S24 거래 후기 — 판정: 수정  (현재 감사 판정: PARTIAL)

- 경로 / 진입 메뉴: `/mypage/trade/reviews?tab=received|written` (홈 2 활동 "거래 후기"). `/mypage/reviews` → 리다이렉트 유지.
- 구조·콘텐츠 순서: 탭 [받은 후기 · 보낸 후기](개수) → 후기 카드(평가 아이콘·태그 문구·상대 닉네임·날짜) → 카드 하단 [거래 채팅] [거래 보기](현행 `TradeReviewsManagementView.tsx:120-131`) → 더 보기.
- 표시: 개수 = 각 API 첫 응답의 `total`(A3 첫 페이지에 `total` 포함) — 현재 보낸 후기 개수용으로 보낸 목록을 **한 번 더** 전부 받음(`:170-174` + `MyWrittenReviewsView.tsx:162-165`). 금액 통화 기본값 `"KRW"`(`TradeReviewsManagementView.tsx:147`) → `formatMoneyPhp`.
- 컴포넌트·토큰: `TradeManagementTabBar` · `MyStateView` · `MyListPager` · `SellerHubEmptyState`.
- CTA: 카드 탭 → 해당 거래(판매=상품 상세, 구매=채팅, v2 S14). 버튼 링크 현행.
- 시트·모달·확인 흐름: 없음.
- 데이터·SSOT: A3 `GET /api/my/received-reviews?limit=20&cursor=` / `GET /api/my/written-reviews?limit=20&cursor=` → `transaction_reviews`.
- 로딩·빈·오류: 스켈레톤 = 탭 + 카드 4개(아이콘 원 + 3줄 + 하단 버튼 2개) / 탭별 빈 / 오류: 받은 탭 현행 OK(`:239-248`), **보낸 탭 오류=빈 목록**(`MyWrittenReviewsView.tsx:165-169`: `res.ok` 미확인, catch→`[]`) → 오류+재시도.
- 전환·복원: 300ms. 탭 `?tab=` (현재 로컬 state `:148`, `onChange={setTab}` `:252`).
- 모바일·태블릿: 1열 카드, 820px 최대 폭 40rem.
- 성능·캐시: 진입 시 활성 탭 1요청 + 다른 탭은 개수만(첫 페이지 `limit=1` 또는 A3 `total`) → 현행 3요청(받은 전체·보낸 전체·보낸 전체 재요청) → 2요청.
- 보존 조건: `WRITTEN_REVIEW_UPDATED_EVENT` 재조회, 관리자 후기 화면 안내 문구, 매너 배터리 계산(후기 테이블 읽기만).
- 현재와의 차이: 보낸 후기 오류=빈 `MyWrittenReviewsView.tsx:167-168` · 탭 URL 미유지 `TradeReviewsManagementView.tsx:148,252` · 100건 상한·더 보기 없음 `app/api/my/received-reviews/route.ts:34`, `written-reviews/route.ts:34` · KRW 기본 `:147` · 글자 로딩 `:232-234`.
- 완료 검증: 캡처 390/820 × {스켈레톤, 받은, 보낸, 빈 2종, 오류 2종(각 탭 500 주입), 더 보기} · 단위: A3 커서·무인자 호환, 보낸 탭 500→오류 상태 · 수동: 카드 → 거래 이동 후 뒤로 시 탭·스크롤 유지.
- 영향 파일: `components/mypage/reviews/TradeReviewsManagementView.tsx`, `MyWrittenReviewsView.tsx`, `app/api/my/received-reviews/route.ts`, `app/api/my/written-reviews/route.ts`(거래 후기 API).

### S25 최근 본 상품 — 판정: 수정  (현재 감사 판정: PARTIAL)

- 경로 / 진입 메뉴: `/mypage/recent-viewed` (홈 2 활동 "최근 본 상품").
- 구조·콘텐츠 순서: 헤더 오른쪽 [전체 삭제] → 날짜 묶음 제목(오늘·어제·이번 주·이전, PHT 기준) → 상품 행 → (삭제된 글) 회색 "삭제된 상품" 행.
- 표시: 묶음 기준 `viewed_at` → `formatMypageDate` 구간 함수(Asia/Manila). 삭제된 글: 현재 서버가 글 없는 기록을 버림(`lib/mypage/trade-recent-views.server.ts:68-71`) → `{ postId, viewedAt, deleted:true }` 로 포함, 화면은 회색 행(사진 자리 아이콘·"삭제된 상품"·⋯ 삭제만, 탭 비활성).
- 컴포넌트·토큰: `MyScreen`(헤더 rightSlot) · `PostCard`(마켓 공용, 무변경) · 묶음 제목 `MyGroup` · `DibayActionSheet`(행 ⋯ 삭제) · `MobileConfirmBottomSheet` · `MyStateView`.
- CTA: 헤더 [전체 삭제] → danger 확인 시트("최근 본 상품을 모두 지울까요?") → DELETE → 토스트. 행 ⋯ → [삭제] 즉시(단건 기록 삭제는 확인 없음 — 되돌리기 없음, v2.1 표가 확인 요구는 전체 삭제만). 현재 [전체 삭제]가 본문 밑줄 텍스트이고 확인 없이 즉시 실행(`RecentViewedList.tsx:83-87`), 단건은 카드 footer 텍스트(`:99-108`).
- 시트·모달·확인 흐름: 전체 삭제만 확인 시트. 실패 시 오류 토스트(현행 `:56`).
- 데이터·SSOT: `GET/DELETE /api/me/recent-views`(M3, 최대 100개 `TRADE_RECENT_VIEWS_MAX`) → `trade_post_recent_views`. 커서 **미적용**(설계 상한 100·90일 보관, v2 §9).
- 로딩·빈·오류: 스켈레톤 = 묶음 제목 바 1 + 그리드 카드 6 / 빈 "최근 본 상품이 없어요"(현행 키) + [둘러보기] `/market` / 오류+재시도(현행 `:65-73` 유지·`MyStateView` 교체). 비회원 = 로그인 유도(현재 빈 문구와 같은 화면 `:74-80` → 분리).
- 전환·복원: 300ms. 탭 없음. 스크롤 복원.
- 모바일·태블릿: 그리드 열 수 = 마켓 그리드 클래스 그대로.
- 성능·캐시: 1요청. 재진입 메모리 캐시(같은 세션) + 조용한 갱신.
- 보존 조건: 상세 조회 시 기록(`/api/posts/[id]/increment-view` 경로, v2 D7) · `lib/mypage/__tests__/trade-recent-views.test.ts`.
- 현재와의 차이: 날짜 묶음 없음 `RecentViewedList.tsx:89-114` · 삭제된 상품 표시 없음 `trade-recent-views.server.ts:68-71` · 전체 삭제 확인 없음 `RecentViewedList.tsx:85` · 글자 로딩 `:62-64`.
- 완료 검증: 캡처 390/820 × {스켈레톤, 묶음 4종 데이터, 삭제된 상품 행, 전체 삭제 확인 시트, 빈, 오류} · 단위: 묶음 구간(PHT 자정 경계·UTC 저장값), 삭제된 기록 포함 응답 · 수동: 상품 상세 열람→목록 최상단 "오늘".
- 영향 파일: `components/recent-viewed/RecentViewedList.tsx`, `app/(main)/mypage/recent-viewed/page.tsx`, `lib/mypage/trade-recent-views.server.ts`, `lib/mypage/format-mypage-date.ts`(신규).

### S26 내가 쓴 글 — 판정: 수정(숨김 탭·⋯ 신규 포함)  (현재 감사 판정: FAIL)

- 경로 / 진입 메뉴: `/mypage/community-posts?tab=active|hidden` (홈 2 활동 "내가 쓴 글", 오른쪽 값 n).
- 구조·콘텐츠 순서: 탭 [게시중 · 숨김됨](개수) → 글 행(제목 · 게시판(주제) · 댓글 n · 좋아요 n · 날짜) + 행 오른쪽 ⋯ → 더 보기. 숨김됨 행은 "숨김 처리됨" 뱃지(사유가 있으면 1줄).
- 표시: 개수 = A4 첫 페이지 `total`. 날짜 `formatMypageDate`. 현재 피드 카드(`CommunityPostCard`, `community-posts/page.tsx:32-36`)를 그대로 써서 설계의 간결 행이 아님 → `MyRow` 변형(썸네일 있으면 56 우측).
- 컴포넌트·토큰: `MyScreen`(현행 `MypageCommunityPostsChrome` 헤더 유지 가능) · 2탭 세그먼트 · `MyRow` · `DibayActionSheet` · `MobileConfirmBottomSheet` · `MyStateView` · `MyListPager` · `SellerHubEmptyState`.
- CTA: 행 탭 → `/philife/{id}`(게시중) / 숨김됨은 본인 열람 가능한 상세가 있으면 이동, 없으면 탭 비활성(**확인 필요**: 숨김 글 본인 상세 열람 허용 여부 — `isCommunityPostPubliclyVisible`). ⋯ → [수정] `/philife/write?edit={id}`(`app/(main)/philife/write/page.tsx:42`, 가져온 글·모임 글은 항목 숨김 — PATCH 거부 조건 `app/api/community/neighborhood-posts/[postId]/route.ts:127-135`) · [삭제] danger 확인 시트 → `DELETE /api/philife/neighborhood-posts/{id}`(`lib/philife/api.ts:30-32`) → 목록에서 제거 + 토스트. 빈 화면 주 CTA [글쓰기] → `/philife/write`.
- 시트·모달·확인 흐름: 삭제 = 확인 시트(되돌리기 없음). 실패 = 오류 토스트.
- 데이터·SSOT: A4 `GET /api/me/community-posts?scope=own&status=active|hidden&limit=20&cursor=` → `community_posts` where `user_id=me and is_deleted=false and status<>'deleted'`; `active` = 공개 가시(`isCommunityPostPubliclyVisible`), `hidden` = `is_hidden=true or status='hidden'`. 현재 쿼리는 `is_hidden=false` 고정(`list-community-posts-for-user.ts:43`). 신규 owner 함수 `listOwnCommunityPostsPage` 를 같은 파일에 추가(기존 `listCommunityPostsForUser` 불변 — 피드·공개 프로필 소비자 보호).
- 로딩·빈·오류: 스켈레톤 = 탭 + 행 6개(제목 1줄 70% + 메타 1줄 + 우측 56 사각) — 현재 커뮤니티 피드 스켈레톤 재사용(`MainFeedRouteLoading rows=6`, `page.tsx:13`) 대체 / 빈: 게시중 "아직 쓴 글이 없어요"+[글쓰기], 숨김됨 "숨김 처리된 글이 없어요" / 오류: 현재 Supabase 실패=빈 배열(`list-community-posts-for-user.ts:183-189`) → A4 는 500, 화면 오류+재시도. 비회원 = 현행 `MypageCommunityPostsGuestPanel`.
- 전환·복원: 300ms. `?tab=`. 수정 화면 다녀온 뒤 스크롤·탭 복원 + 해당 행만 재조회.
- 모바일·태블릿: 1열 행, 820px 최대 폭 40rem.
- 성능·캐시: 현재 RSC 에서 서버 조회 후 렌더(`page.tsx:20-22`) → 첫 화면은 RSC 로 첫 페이지(게시중) 렌더 유지, 탭 전환·더 보기만 클라이언트 A4. 재진입 메모리 캐시.
- 보존 조건: 커뮤니티 피드·공개 프로필의 `listCommunityPostsForUser` 결과 불변(`lib/community-feed/__tests__/list-community-posts-for-user.test.ts`, `community-post-ssot-contract.test.ts:24`) · `CommunityTab` 미리보기(`?limit=6`) · 피드 광고 신청의 글 선택(`?limit=20`) · 삭제 동의 정책 `lib/auth/member-consent-mutation-policy.ts:148,154`.
- 현재와의 차이: 숨김 탭 없음(쿼리 `is_hidden=false` `list-community-posts-for-user.ts:43`) · ⋯ 수정/삭제 없음(`CommunityPostCard` 그대로 `page.tsx:32-36`) · 오류=빈 `list-community-posts-for-user.ts:183-189` · 100건 상한·더 보기 없음 `:179` · 피드 스켈레톤 재사용 `page.tsx:13`.
- 완료 검증: 캡처 390/820 × {스켈레톤, 게시중, 숨김됨, ⋯ 시트(일반/가져온 글), 삭제 확인 시트, 빈 2종, 오류} · 단위: A4 owner 범위(타인 글 0, 삭제 글 0, 숨김 포함), 무 `scope` 응답 불변, 커서 · 수동: 수정 저장 후 돌아와 제목 갱신, 삭제 후 피드에서도 사라짐.
- 영향 파일: `app/(main)/mypage/community-posts/page.tsx`, `components/mypage/community/*`, `app/api/me/community-posts/route.ts`, `lib/community-feed/list-community-posts-for-user.ts`(**커뮤니티 도메인**, 함수 추가만).

### S27 댓글·반응 — 판정: 수정(해제 동작 신규)  (현재 감사 판정: FAIL)

- 경로 / 진입 메뉴: `/mypage/community-activity?tab=comments|reactions|saved|reports` (홈 2 활동 "댓글·반응"; v2 IA "저장한 글" → `?tab=saved`, `docs/mypage-v2/dibay-mypage-v2-integrated-design.md:132`).
- 구조·콘텐츠 순서: 탭 [댓글 · 좋아요 · 저장 · 신고] → 탭별 행 → 더 보기. 댓글 행: 원글 제목(없으면 "볼 수 없는 글") · 댓글 2줄 · 날짜 · ⋯. 좋아요/저장 행: 글 제목 · 날짜 · 오른쪽 [♥ 해제]/[저장 해제] 아이콘 버튼. 신고 행: 대상 · 사유 · **처리 상태 뱃지**(현재 사유 원문만 `CommunityActivityHubView.tsx:104-106`, 상태 미표시).
- 표시: 날짜 `formatMypageDate`(현재 `toLocaleString` `:15-19`). 신고 상태 라벨 = `community_reports.status`/`community_messenger_reports.status` i18n 매핑(접수·검토중·처리완료·반려 — 값 집합 **확인 필요**).
- 컴포넌트·토큰: 4탭 세그먼트(현재 탭 버튼 `bg-sam-primary text-white` `:42-44` → `Sam` 탭 클래스) · `MyRow` · `DibayActionSheet` · `MobileConfirmBottomSheet` · `MypageToastHost`(액션) · `MyStateView` · `MyListPager`.
- CTA:
  - 댓글 ⋯ → [삭제] danger 확인 시트 → A7 DELETE → 행 제거 + 토스트.
  - 좋아요 [해제] / 저장 [해제] → 확인 없음, 행 즉시 제거 + 토스트 "[되돌리기]" 5초 → 지연 커밋 A6 DELETE(C6). 숨김·삭제·차단 작성자 글도 해제 가능(A6 규칙).
  - 행 탭 → `/philife/{postId}`(볼 수 없는 글은 탭 비활성).
- 시트·모달·확인 흐름: 댓글 삭제 = 확인 시트 / 좋아요·저장 해제 = 되돌리기 토스트 / 연속 해제 시 이전 대기 건 즉시 커밋 후 새 토스트(동시 대기 1건).
- 데이터·SSOT: A5 `GET /api/me/community-activity?tab=&limit=20&cursor=` → 원본 5개 테이블(`community_comments`(삭제·숨김 제외 `community-activity-load-server.ts:56-57`) · `community_post_likes` · `community_post_saves` · `community_reports` · `community_messenger_reports`). 신고 탭 커서는 두 테이블 병합 정렬(`created_at|id`, 각 테이블에서 limit+1 읽고 병합). A6, A7.
- 로딩·빈·오류: 스켈레톤 = 탭 + 행 6개(댓글 탭: 소제목 1줄 + 본문 2줄 / 그 외 1줄 + 우측 아이콘 원) — 현재 피드 스켈레톤 재사용(`page.tsx:20`) 대체 / 탭별 빈(현행 키) / 오류: 현재 로더 throw 시 RSC 오류 경계로 페이지 전체 실패(`community-activity-load-server.ts:87-104`) → 첫 페이지 RSC 실패 시 클라이언트 `MyStateView` 오류+재시도(A5 재호출).
- 전환·복원: 300ms. `?tab=` — 현재 서버가 초기값만 읽고 전환은 로컬(`CommunityActivityHubView.tsx:125,141`) → `router.replace`. 탭별 스크롤 저장.
- 모바일·태블릿: 4탭 390px 균등(최소 터치 48px, 현재 `min-w-[5.5rem]` 4개 = 352px+gap — 390px 에서 넘치지 않는지 캡처로 확인), 820px 최대 폭 40rem.
- 성능·캐시: 첫 화면 RSC 1회(활성 탭만 — 현재는 5테이블 모두 `:50-85`), 탭 전환 시 A5 1회·탭별 메모리 캐시. 지연 커밋은 `navigator.sendBeacon` 불가(DELETE) → `fetch(…, {keepalive:true})`.
- 보존 조건: 피드 상세의 좋아요/저장 POST 토글·알림(`like/route.ts:89-103`) 불변 · `CommunityTab` 의 무 `tab` 응답(`favoritePosts`/`reactions` 별칭 `app/api/me/community-activity/route.ts:15-23`) 불변 · 차단 관계에서 새 좋아요 금지 규칙 불변.
- 현재와의 차이: 해제·삭제 동작 없음(행이 링크뿐 `CommunityActivityHubView.tsx:56-109`) · 20건 고정 `community-activity-load-server.ts:59-84` · 탭 URL 미반영 `:125` · 신고 상태 미표시 `:104-106` · 피드 스켈레톤 `page.tsx:20` · 하드코딩 `text-white` `:43`.
- 완료 검증: 캡처 390/820 × {스켈레톤, 4탭 데이터, 볼 수 없는 글 행, 댓글 삭제 확인 시트, 해제 토스트[되돌리기], 빈 4종, 오류} · 단위: A6 — 숨김 글·삭제 글·차단 작성자 글에서 DELETE 200, 행 없음 200, 타인 행 영향 0, POST 규칙 회귀 0 · A5 탭별 커서·신고 병합 정렬 · 지연 커밋(5초 경과 커밋 / 되돌리기 시 호출 0 / 이탈 시 즉시 커밋) · 수동: 해제 후 피드 상세에서 하트 꺼짐.
- 영향 파일: `app/(main)/mypage/community-activity/page.tsx`, `components/mypage/community-activity/CommunityActivityHubView.tsx`, `lib/mypage/community-activity-load-server.ts`, `lib/mypage/community-activity-types.ts`, `app/api/me/community-activity/route.ts`, **커뮤니티 도메인** `app/api/community/posts/[postId]/like/route.ts`·`save/route.ts`(DELETE 분기 추가만), `components/mypage/MypageToastHost.tsx`.

### S28 채팅 준비 — 판정: 유지  (현재 감사 판정: 해당 행 없음 — v2 S16 "기존 PASS")

- 경로 / 진입 메뉴: `/mypage/trade/chat/compose` (상품 상세 등에서 진입, 홈 행 없음).
- 구조·콘텐츠 순서: 현행 유지(v2.1 S28 "현행").
- 표시: 현행.
- 컴포넌트·토큰: 현행(거래 채팅 도메인).
- CTA: 현행.
- 시트·모달·확인 흐름: 현행.
- 데이터·SSOT: 현행(`product_chats`).
- 로딩·빈·오류: 오류 배너+재시도 현행(v2 S16 PASS).
- 전환·복원: 거래 채팅 도메인 규칙 그대로(내정보 300ms 규칙에 **포함하지 않음** — 경로가 `/mypage/` 아래이므로 K2 규칙 작성 시 `/mypage/trade/chat` 접두를 제외 목록에 명시).
- 모바일·태블릿: 현행.
- 성능·캐시: 현행.
- 보존 조건: 거래 채팅 생성 흐름·`docs/trade-chat-buyer-seller-process.md`.
- 현재와의 차이: 없음.
- 완료 검증: K2 전환 규칙 단위 테스트에 "`/mypage/trade/chat/*` 는 내정보 슬라이드 규칙 미적용" 케이스 1개 · 수동: 상품 상세 → 채팅하기 → 기존과 같은 전환.
- 영향 파일: 없음(전환 규칙 파일의 제외 항목만 — 파트 공통).

---

## C.2 주문·매장 (S30–S34)

### S30 주문 내역 — 판정: 수정  (현재 감사 판정: PARTIAL)

- 경로 / 진입 메뉴: `/mypage/store-orders?tab=all|active|done|issue` (홈 3 매장·주문 "주문 내역", 오른쪽 값 진행중 n).
- 구조·콘텐츠 순서: 탭 [전체 · 진행중 · 완료 · 취소·환불](개수, C4: 설계 3탭 + 기존 [전체] 유지) → 주문 카드(매장 사진·매장명·메뉴 요약·금액·프로세스 모델 상태·날짜, 하단 액션 셀) → 더 보기.
- 표시: 상태 = `store-order-process-model`(v2 D9 반영 완료 확인 대상), 금액 `formatMoneyPhp`, 탭 개수 = 첫 페이지 기준 / 100건 초과 시 서버 `tab_counts=1`(현행 `MyStoreOrdersView.tsx:656-664`).
- 컴포넌트·토큰: `MemberOrderTabs`(현행) · 주문 카드(현행 구조) · `MyStateView` · `MyListPager`(현행 더 보기 `:1054-1066` 를 공통 부품으로) · `MypageToastHost`(자체 토스트 `:918-921` 대체) · `MobileConfirmBottomSheet`.
  - **하드코딩 색 제거(28곳)**: `FB_MUTED`(`#65676B/#B0B3B8`)→`text-sam-muted` · `FB_BODY`(`#050505/#E4E6EB`)→`text-sam-fg` · `FB_HOVER_ROW`(`#3A3B3C`)→`hover:bg-sam-surface-muted`(다크는 토큰이 처리) · `FB_DIVIDER`/`divide-[#CED0D4]`(`#CED0D4/#3E4042`)→`border-sam-border`/`divide-sam-border` (`:164-172`) · 썸네일 자리 `bg-[#E4E6EB]`(`:324,339`)→`bg-sam-surface-muted` · 정보 뱃지 `bg-[#E7F3FF] text-[#1877F2]`(`:387`)→`bg-sam-info-soft text-sam-info` · 안읽음 점 `bg-[#F02849]`(`:395`)·취소 문구 `text-[#F02849]`(`:556,955`)→`bg-sam-danger`/`text-sam-danger` · 비활성 `text-[#BCC0C4]`(`:523`)→`text-sam-meta` · 카드 `dark:bg-[#242526]`·`ring-black/[0.06]`·`shadow-[0_1px_2px…]`(`:312,926,948,974-975,989`)→`bg-sam-surface shadow-[var(--sam-shadow-card)]` · 임베드 카드 `border-[#DDE5E0] bg-white rounded-[4px]`(`:311,988`)→`border-sam-border bg-sam-surface rounded-ui-rect` · 행 hover `#F6FAFC`(`:426,432`)→`hover:bg-sam-surface-muted` · 페이지 `dark:bg-[#18191A]`(`:906`)→`bg-sam-app` · 토스트 `bg-[#050505]`(`:919`)→공통 토스트. `bg-[#f6f6f6]`(`:903`, deliveryHub 전용)은 C5 로 범위 밖.
- CTA: 카드 탭 → S31 · 진행중 [주문 채팅] · 완료 [재주문] [후기 쓰기] · ⋯ [목록에서 숨기기] 확인 시트(현행 `dibayConfirm` `:871` → `MobileConfirmBottomSheet` danger) · 취소 가능 [주문 취소] 확인 시트(현행 `:841`, destructive) — 확인 흐름은 이미 있음, 표면만 공통 시트로.
- 시트·모달·확인 흐름: 숨기기·취소 = 확인 시트. 결과 = 공통 토스트.
- 데이터·SSOT: `GET /api/me/store-orders?cursor=`(기본 100, 현행 `app/api/me/store-orders/route.ts:130,159-179`) → `buyer_store_orders_list_snapshots` + `store-order-process-model`. 커서 = 현행 `created_at|id`. 페이지 크기 100 유지(배달 허브 동일 컴포넌트 — 축소 시 탭 개수 동작 변화).
- 로딩·빈·오류: 스켈레톤 = 탭 + 주문 카드 3개(40 원형 매장 사진 + 매장명·메뉴 2줄 + 우측 금액 + 하단 액션 셀 3칸) — 현재 글자 박스(`:924-930`) 대체 / 빈 + [매장 둘러보기] / 오류: 현재 `({state.message})` 로 **코드 노출**(`:955-957`) → i18n 문구만+[다시 시도]. `supabase_unconfigured` 안내(`:952-954`)는 문구 유지.
- 전환·복원: 300ms. 탭 `?tab=` (현재 로컬 `useState("all")` `:594`; 배달 허브는 `orderFilter` 쿼리 사용 `:578` — 내정보 경로에서만 `?tab=` 적용). 펼침 `?expand=` 현행(`:720-736`). 스크롤·로드 페이지 수 복원.
- 모바일·태블릿: 390px 액션 셀 3칸 균등(최소 44px 현행), 820px 최대 폭 40rem(현재 `max-w-none`).
- 성능·캐시: `fetchMeStoreOrdersListDeduped` 단일 비행·조용한 갱신 시 추가 페이지 보존(현행 `:643-653`) 유지. 탭 전환은 클라이언트 필터(추가 요청 0).
- 보존 조건: 배달 허브(`BuyerDeliveryOrdersBody.tsx:5`, `components/mypage/tabs/StoreTab.tsx:6`) 동작·탭 집합 · 상태 SSOT `docs/store-order-process-single-source.md` · 주문 채팅(`store_order`) 경계 · `verify:buyer-orders-list-snapshot-*` · 실시간 갱신.
- 현재와의 차이: 탭 URL 미유지 `:594` · 하드코딩 색 28줄 `:164-1000`(grep 28) · 오류 코드 노출 `:955-957` · 자체 토스트 `:918-921` · 글자 로딩 `:924-930`.
- 완료 검증: 캡처 390/820 × {스켈레톤, 4탭, 빈, 오류, 더 보기, 숨기기 확인 시트, 다크 모드 1장} + **배달 허브 주문 목록 390px(C5 회귀)** · 단위: `?tab` 파싱·복원, 색 grep `#[0-9A-Fa-f]{3,6}` 0건(deliveryHub 배경 1건 예외 주석), 상태 라벨 테스트(D9) 유지 · 수동: 상세 갔다 뒤로 → 탭·스크롤 유지.
- 영향 파일: `components/mypage/MyStoreOrdersView.tsx`(배달 도메인과 공유), `app/(main)/mypage/store-orders/page.tsx`, `components/mypage/MyStoreOrderExpandPanel.tsx`(hex 38곳 — 같은 카드 펼침 패널, 같은 매핑 적용).

### S31 주문 상세 — 판정: 수정  (현재 감사 판정: PARTIAL)

- 경로 / 진입 메뉴: `/mypage/store-orders/[orderId]` (S30 카드, 알림, 주문 채팅 헤더).
- 구조·콘텐츠 순서: 상태 단계(프로세스 모델) → 매장 → 메뉴·옵션 → 결제 금액(할인·상품권·배달비) → 배달/픽업 정보 → 주문번호·시각 → (취소/환불 요청 안내) → **하단 고정 `MyStickyCta`**.
- 표시: 시드(목록에서 넘어온 요약) 상태 문구에 **수령 방식 누락** — `buyerOrderStatusLabel(seed.order_status, language)`(`MyStoreOrderDetailView.tsx:424`) → `fulfillment_type` 전달(본문은 이미 전달 `:518`). 시각 `toLocaleString`(`:675,690,1032`) → `formatMypageDate`.
- 컴포넌트·토큰: `MyScreen` · 섹션 `MyGroup` · `MyStickyCta` · `DibayBottomSheet`(취소 사유) · `MobileConfirmBottomSheet` · `StoreOrderReceiptSheet`(S32) · `MyStateView`. hex 7곳(`:546,554,557,563,566,608,611`: `#DDE5E0`·`#E4E6EB`·`#6B7280`·`#123B4A`·`#EAF6FB`·`#f6f6f6`)·`text-red-600`(`:964,976,1073,1088`)·`blue-50/amber-50`(`:1051,1085`) → `sam-*` 토큰. 채팅 버튼 `--delivery-*`(`:627-631`)는 주문 채팅 공용 표현 → 유지(C5).
- CTA (하단 고정, 상태별 1주+1보조):
  - 진행중: 주 [주문 채팅] · 보조 [매장 보기].
  - 결제 전 취소 가능(`storeOrderAwaitingFirstPayment` `:511`): 주 [주문 취소] → danger 확인 시트("주문을 취소할까요?") → PATCH `{cancel:true}`. 현재 즉시 실행(`:1089-1096`).
  - 결제 후 취소 요청 가능(`canBuyerRequestStoreCancel` `:512`): 주 [취소 요청] → `DibayBottomSheet` 사유 시트(텍스트 2~500자, 기존 textarea `:1064-1071` 이동) → [요청 보내기] → PATCH `{request_cancel:true,cancel_reason}`.
  - 완료: 주 [재주문] · 보조 [주문 내역서](S32). [후기 쓰기]는 `BuyerStoreOrderCompletedReviewBlock`(`:892-912`) 현행 위치 유지.
  - 하단 텍스트 링크(`:1099-1108`) 제거(헤더 뒤로·고정 CTA 와 중복).
- 시트·모달·확인 흐름: 취소 = 확인 시트, 취소 요청 = 사유 시트(입력 있을 때만 활성, 미입력 닫기 확인 없음), 결과 토스트.
- 데이터·SSOT: `GET /api/me/store-orders/[id]` → `get_store_order_detail_snapshot`(`verify:store-order-detail-snapshot-*`). PATCH 현행(`patchMeStoreOrder`). 수수료·정산은 DB 트리거 전용(AGENTS) — 화면 무관.
- 로딩·빈·오류: 스켈레톤 = 상태 단계 바 + 매장 행 + 메뉴 3줄 + 금액 4줄 + 하단 CTA 자리(현재 글자 `:409-411`; 시드 있으면 시드 즉시 표시 현행 유지) / 없음·권한없음: "주문을 찾을 수 없어요" + [주문 내역으로] / 오류+재시도(현행 `:439-478` 유지·`MyStateView`).
- 전환·복원: 300ms(목록→상세 우→좌, 뒤로 좌→우). `preferHistoryBack` 현행(`page.tsx:17`).
- 모바일·태블릿: 고정 CTA 높이 56 + safe-bottom, 820px 최대 폭 40rem 가운데(CTA 바도 같은 폭).
- 성능·캐시: 시드 즉시 렌더 → 상세 1요청(현행). 재주문 payload 현행.
- 보존 조건: 주문 상태·채팅 단계 단일 정의 `lib/stores/store-order-process-model.ts` · 주문 채팅 딥링크 · 리뷰 상태 블록 · `SupportContextProvider`.
- 현재와의 차이: 하단 고정 CTA 아님(본문 중간 버튼들 `:620-645,1058-1097`) · 취소 사유가 인라인 textarea `:1058-1082` · 즉시 취소 확인 없음 `:1089-1096` · 시드 상태 문구 수령 방식 누락 `:424` · 하드코딩 색 위 목록.
- 완료 검증: 캡처 390/820 × {스켈레톤, 진행중, 결제 전(취소 확인 시트), 결제 후(사유 시트), 완료(재주문+내역서), 취소요청 대기, 없음, 오류} · 단위: 상태별 CTA 매트릭스(주/보조 조합), 시드 라벨에 배달/픽업 반영 · 수동: 취소 후 S30 탭 개수 갱신.
- 영향 파일: `components/mypage/MyStoreOrderDetailView.tsx`, `app/(main)/mypage/store-orders/[orderId]/page.tsx`.

### S32 주문 내역서 — 판정: 유지(토큰만 점검)  (현재 감사 판정: PASS)

- 경로 / 진입 메뉴: S31 완료 상태 [주문 내역서] → 바텀시트(`MyStoreOrderDetailView.tsx:1017-1046`).
- 구조·콘텐츠 순서: 매장명·주소 → 주문번호·일시 → 메뉴×수량·금액 → 할인·상품권·배달비 → 결제 수단·결제 금액 → "법정 영수증 아님" 안내(`StoreOrderReceiptSheet.tsx:27`).
- 표시: 금액 `formatMoneyPhp`, 일시 → `formatMypageDate`(현재 호출부 `toLocaleString` `MyStoreOrderDetailView.tsx:1032`).
- 컴포넌트·토큰: `StoreOrderReceiptSheet`(→ `DibayBottomSheet` 280ms) · `Sam.btn.primaryCombo`(`:145`).
- CTA: [닫기] · [이미지로 저장/공유](현행 `share()` `:65-93`).
- 시트·모달·확인 흐름: 시트 1단, 공유 실패 토스트(현행 `:92`).
- 데이터·SSOT: S31 응답 그대로(추가 조회 0).
- 로딩·빈·오류: 없음(데이터 동기 전달). 이미지 생성 중 버튼 스피너.
- 전환·복원: 시트 280ms, 닫으면 S31 스크롤 그대로.
- 모바일·태블릿: 시트 최대 폭 40rem 가운데.
- 성능·캐시: 이미지 렌더 클릭 시에만.
- 보존 조건: "법정 영수증 아님" 문구·공유 문구.
- 현재와의 차이: 일시 포맷 1곳만.
- 완료 검증: 캡처 390/820 × {시트 열림} · 단위: 기존 영수증 이미지 테스트 유지 · 수동: Android·iPhone 공유 시트.
- 영향 파일: `components/mypage/MyStoreOrderDetailView.tsx`(일시 전달값), `components/mypage/StoreOrderReceiptSheet.tsx`(변경 없음 예상).

### S33 주문 후기 — 판정: 수정(경미)  (현재 감사 판정: PARTIAL)

- 경로 / 진입 메뉴: `/mypage/store-orders/[orderId]/review` (S31 후기 블록, S30 [후기 쓰기]).
- 구조·콘텐츠 순서: 별점 → 메뉴별 좋아요 → 사진(최대 3) → 내용 → 사장님만 보기 → 하단 고정 [등록](현행 `StoreCommerceBottomActionShell` `StoreOrderReviewForm.tsx:232-248`).
- 표시: 별 색 `text-amber-400`(`:265`) → `text-sam-warning`.
- 컴포넌트·토큰: `MyScreen` · `StoreOrderReviewForm`(공유) · `useMypageSubmitGuard` · `MobileConfirmBottomSheet`(미저장 이탈).
- CTA: [등록] · 하단 고정 · 활성 = 내용 5자 이상 & 미제출 중(현행 `:243`) · POST `/api/me/store-reviews` → 상세로 `router.replace`(현행 `:219-220`).
- 시트·모달·확인 흐름: 입력 있는 상태에서 뒤로 → 미저장 확인 시트(T3 규칙, 현재 없음). 오류 = 필드/토스트(현행 키 매핑 `resolveStoreOrderReviewSubmitErrorKey`).
- 데이터·SSOT: `/api/me/store-reviews`, 사진 `/api/me/store-reviews/upload-image`. v2.1 "동작 NOT_PROVEN — 2b 첫 검증".
- 로딩·빈·오류: 주문 정보 로딩 스켈레톤(별 5 + 메뉴 행 2 + 사진 칸 1 + 입력 박스) / 후기 불가(이미 작성·기간 지남) 안내 + [주문 상세로].
- 전환·복원: 300ms. 키보드 위로 이동(`useFormKeyboardViewport`).
- 모바일·태블릿: 사진 칸 80×80, 820px 최대 폭 40rem.
- 성능·캐시: 진입 1요청.
- 보존 조건: 같은 폼을 `/orders/store/[orderId]/review`(배달 도메인)·`BuyerStoreOrderReviewSlidePanel` 이 사용 — 공용 props 불변.
- 현재와의 차이: 미저장 확인 없음 · 오류 코드 노출은 현재 매핑으로 해결됨(키 변환 `:212-213`) · 감사의 "오류 코드 그대로 노출"은 S34 쪽(아래)으로 확인됨.
- 완료 검증: 캡처 390/820 × {작성 전, 사진 3장, 제출 중, 오류, 미저장 확인 시트} · 단위: 제출 가드(연타 1회 호출) · 수동: **운영 계정 1건 실제 등록 성공(NOT_PROVEN 해소)** — 테스트 DB 사용 금지, Owner 지정 계정으로.
- 영향 파일: `components/mypage/StoreOrderReviewForm.tsx`(공유), `app/(main)/mypage/store-orders/[orderId]/review/page.tsx`.

### S34 매장 문의 내역 — 판정: 수정  (현재 감사 판정: PARTIAL)

- 경로 / 진입 메뉴: `/mypage/store-inquiries` (홈 3 매장·주문 "매장 문의 내역").
- 구조·콘텐츠 순서: 문의 행(매장명 · 제목 · 답변 상태 뱃지 · 날짜) — 본문·답변은 행 펼침(현재 항상 펼침 `MyStoreInquiriesView.tsx:116-131`) → 행 오른쪽 chevron.
- 표시: 상태 뱃지(답변 대기=`sam-warning-soft`, 답변 완료=`sam-success-soft`), 날짜 `formatMypageDate`.
- 컴포넌트·토큰: `MyScreen`(현재 `bg-background`, `max-w-4xl` `page.tsx:10,17` → 공통 셸) · `MyRow` · `MyStateView` · `SellerHubEmptyState`.
- CTA: 행 탭 → 매장 화면 `/stores/{store_slug}`(A10; **구매자용 문의 상세 경로는 존재하지 않음** — `find app -path "*stores*" -iname "*inquir*"` 는 사장님·API 만). 행 안 [답변 보기] 토글로 본문·답변 펼침. 빈 화면 [매장 둘러보기] `/stores`(현행).
- 시트·모달·확인 흐름: 없음.
- 데이터·SSOT: `GET /api/me/store-inquiries`(+`store_slug`) → `store_inquiries`. 커서 **미적용**(설계 미포함), 상한 100(`route.ts:27`) — 운영 1인 최대 건수 확인 필요.
- 로딩·빈·오류: 스켈레톤 = 행 5개(2줄 + 우측 뱃지) / 빈 현행 / 오류: 현재 `({state.message})` **코드만 빨간 글자로 노출**(`MyStoreInquiriesView.tsx:91-99`) → i18n 문구+[다시 시도].
- 전환·복원: 300ms, 스크롤·펼친 행 id 복원.
- 모바일·태블릿: 1열, 820px 최대 폭 40rem.
- 성능·캐시: 1요청, 재진입 캐시 + `useRefetchOnPageShowRestore` 현행.
- 보존 조건: 사장님 문의 화면·관리자 화면(같은 테이블) 무영향.
- 현재와의 차이: 행 링크 아님 `:116` · 오류 코드 노출 `:94` · 셸 폭·배경 상이 `page.tsx:10,17` · 글자 로딩 `:85-87`.
- 완료 검증: 캡처 390/820 × {스켈레톤, 목록(대기·완료), 펼침, 빈, 오류} · 단위: A10 `store_slug` 포함, 오류 상태 코드 미노출 · 수동: 행 → 매장 → 뒤로 스크롤 유지.
- 영향 파일: `app/(main)/mypage/store-inquiries/page.tsx`, `components/mypage/MyStoreInquiriesView.tsx`, `app/api/me/store-inquiries/route.ts`(매장 도메인).

---

## C.3 자산·혜택 (S40–S47)

### S40 포인트 — 판정: 수정  (현재 감사 판정: PARTIAL)

- 경로 / 진입 메뉴: `/mypage/points?tab=all|credit|debit|charges` (홈 4 자산 포인트 요약/행, 고객센터 `?from=customer-center`).
- 구조·콘텐츠 순서: 잔액 카드(`PointBalanceCard` — 음수 빨강·모르면 "—") → [충전](주) · [홍보 이용](보조) → 소멸 예정 줄(금액·가장 빠른 날짜 › S42) → 충전 요청 줄(대기 n ›, 대기 0이면 숨김) → 합계 2칸(총 적립·총 사용, 현행) → 탭 [전체 · 적립 · 사용 · 충전](C4: credit=적립, debit=사용, charges=현 `view=charges` 목록) → 내역 → 더 보기.
- 표시: 잔액 SSOT 원장 투영(`profiles.points`), 오류 시 "—"(D4). 대기 수 = `pending`·`waiting_confirm`만(현행 `page.tsx:184-186`, D19).
- 컴포넌트·토큰: `MyScreen` · `PointBalanceCard` · `MyRow`(소멸·요청 줄) · 탭 세그먼트 · `PointFinancialHistoryList` · `PointChargeRequestList` · `MyListPager` · `MyStateView` · `MobileConfirmBottomSheet`. 오류 배너 `border-red-100 bg-red-50 text-red-700`(`:202`)·`bg-signature text-white`(`:223`) → `sam-danger-soft/sam-danger`·`Sam.btn.primary`.
- CTA: [충전] → S41 · [홍보 이용] → S43 · 충전 요청 행 [요청 취소](대기·확인중만) → danger 확인 시트 → POST `/api/me/points/charge/{id}/cancel` → 토스트(실패 토스트). 현재 확인 없이 즉시(`:314-318`).
- 시트·모달·확인 흐름: 요청 취소 = 확인 시트. 내역 행 탭 → 상세 시트(현행 `selected` `:65`).
- 데이터·SSOT: `GET /api/me/points?filter=&limit=30&cursor=`(현행 커서 `app/api/me/points/route.ts:52-90`) → `point_ledger` 투영, `point_charge_requests`(최근 20 `:111`). `charges` 탭은 같은 응답의 `chargeRequests` 사용(추가 요청 0, 20건 상한 — 더 보기 없음, 운영 최대 건수 확인 필요).
- 로딩·빈·오류: 스켈레톤 = 잔액 카드(큰 숫자 블록) + 버튼 2 + 줄 2 + 탭 + 내역 행 6(좌 2줄·우 금액) — 현재 Suspense 는 커뮤니티 피드 스켈레톤(`page.tsx:37`) / 탭별 빈 / 오류: 잔액 "—" + 내역 영역 `MyStateView` 오류+재시도(현재 상단 배너 + 목록 숨김 `:201-218,348`) / 더 보기 실패 = `MyListPager` 재시도.
- 전환·복원: 300ms. `?tab=` 쓰기(현재 초기값만 읽음 `:48`, 전환은 `setTab` `:328`). `view=charges` → `?tab=charges` 로 정규화(기존 링크 호환).
- 모바일·태블릿: 버튼 2개 가로(현재 flex-wrap 4개 `:221-250` 중 [충전 신청]·[소멸 예정] 칩은 줄 행으로 이동), 820px 최대 폭 40rem.
- 성능·캐시: 탭 전환 시 기존 목록 유지 + 작은 로딩(현행 `:340-346`), `runSingleFlight` 키 현행. 재진입 메모리 캐시(감사 §5-4 "포인트 홈 줄 매번 로딩").
- 보존 조건: D4(음수·"—"), 고객센터 `from` 복귀(`resolveCustomerCenterBackHref` `:47`), `/mypage/points/ledger` 리다이렉트, 관리자 포인트 화면 무영향.
- 현재와의 차이: 요청 취소 확인 없음 `:314-318` · 탭 URL 미유지 `:328` · 설계 탭 [충전] 없음(별도 view) `:280-320` · 하드코딩 색 `:202,223` · 피드 스켈레톤 `:37`.
- 완료 검증: 캡처 390/820 × {스켈레톤, 양수·음수·"—" 잔액, 4탭, 요청 취소 확인 시트, 빈, 오류, 더 보기} · 단위: `?tab`·`view=charges` 정규화, 취소는 확인 후에만 호출 · 수동: 운영 음수 회원(-38P) 표시 확인(읽기 전용).
- 영향 파일: `app/(main)/mypage/points/page.tsx`, `components/points/PointChargeRequestList.tsx`, `PointBalanceCard.tsx`(토큰만).

### S41 충전 신청 — 판정: 수정  (현재 감사 판정: PARTIAL)

- 경로 / 진입 메뉴: `/mypage/points/charge` (S40 [충전]).
- 구조·콘텐츠 순서: 플랜 선택 → 결제 방법 안내 → 요청 확인 → 하단 고정 [충전 요청].
- 표시: 플랜 금액 `CurrencyAmount`.
- 컴포넌트·토큰: `MyScreen` · `PointChargeForm` · `MyStickyCta` · `useMypageSubmitGuard`.
- CTA: [충전 요청] · 하단 고정 · 활성 = 플랜 선택 & 미제출 중(현행 `PointChargeForm.tsx:175`) · POST `/api/me/points/charge` (+A9 `Idempotency-Key`: 화면 진입 시 1개 생성, 성공 전까지 재시도에 같은 키) → 성공 시 S40 `router.replace` + 토스트(현행 `charge/page.tsx:114`).
- 시트·모달·확인 흐름: 없음(요청은 관리자 확인 후 지급 — 취소 가능).
- 데이터·SSOT: `GET /api/me/point-plans`, `POST /api/me/points/charge` → `point_charge_requests`.
- 로딩·빈·오류: 스켈레톤 = 플랜 카드 3 + 안내 박스 / 플랜 0 = "지금은 충전할 수 있는 상품이 없어요" / 플랜 로드 오류+재시도 / 제출 실패 토스트.
- 전환·복원: 300ms, 뒤로 시 선택 플랜 미저장 확인 없음(입력 1개 — T3 예외로 둠).
- 모바일·태블릿: 플랜 1열, 820px 2열.
- 성능·캐시: 플랜 `runSingleFlight("me:point-plans:get")` 현행.
- 보존 조건: 관리자 승인 RPC(`20260912150000_user_point_charge_approve_rpc.sql`)·실시간 알림 무영향.
- 현재와의 차이: 멱등 키 없음(라우트 insert만 `app/api/me/points/charge/route.ts:86-112`) — C7 · 하단 고정 아님(확인 필요: `PointChargeForm` 버튼 위치).
- 완료 검증: 캡처 390/820 × {스켈레톤, 플랜 선택, 제출 중, 실패} · 단위: 같은 키 2회 POST → 행 1개(M6 승인 시), 연타 → 요청 1회 · 수동: 요청 후 S40 대기 n 증가.
- 영향 파일: `app/(main)/mypage/points/charge/page.tsx`, `components/points/PointChargeForm.tsx`, `app/api/me/points/charge/route.ts`, (M6 승인 시) 신규 마이그레이션.

### S42 소멸 예정 — 판정: 수정(월별 신규)  (현재 감사 판정: FAIL)

- 경로 / 진입 메뉴: `/mypage/points/expiring` (S40 소멸 예정 줄).
- 구조·콘텐츠 순서: 합계 카드(소멸 예정 총액 · 가장 빠른 소멸일) → 월별 행(`2026년 11월` · 금액) 목록 → 안내 1줄("잔액보다 많이 소멸되지 않아요").
- 표시: 월 = `expiresAt` 를 Asia/Manila 로 묶음(표시 단계 변환, DB UTC 불변). 금액 = A8 `entries`(잔액 상한 FIFO 배분 후).
- 컴포넌트·토큰: `MyScreen` · `PointExpiringCard`(합계) · `MyGroup`+`MyRow`(월별) · `MyStateView`. 오류 박스 `border-red-100 bg-red-50 text-red-700`(`expiring/page.tsx:96`) → 공통 오류.
- CTA: 없음.
- 시트·모달·확인 흐름: 없음.
- 데이터·SSOT: A8 `GET /api/me/points` 의 `expiring.entries` → `point_ledger`(`amount>0, expires_at>now, expired_amount is null`, `route.ts:124-133`).
- 로딩·빈·오류: 스켈레톤 = 합계 카드 + 월 행 3 / 빈(총 0): "소멸 예정 포인트가 없어요"(현재 0 카드만 보임) / 오류: 현재 **오류 배너와 0 카드 동시 표시**(`expiring/page.tsx:94-104`, `EMPTY_EXPIRING` `:22,57-63`) + API 가 소멸 조회 실패를 0 으로 응답(`route.ts:134-139`) → A8 `expiringError` 시 오류 화면만.
- 전환·복원: 300ms. 뒤로 = S40(고객센터 `from` 유지 `:37`).
- 모바일·태블릿: 1열.
- 성능·캐시: S40 과 같은 `runSingleFlight("me:points:get")` 키 공유(현행 `:46-48`) → S40 에서 넘어오면 추가 요청 0.
- 보존 조건: `computeExpiringPointsFromLedger` 결과(합계) 불변 — 월별은 같은 입력에서 합 = 합계.
- 현재와의 차이: 월별 없음(합계 카드만 `:102`) · 오류+0 동시 `:94-104` · API 오류→0 `route.ts:134-139` · 글자 로딩 `:100`.
- 완료 검증: 캡처 390/820 × {스켈레톤, 월 3개, 빈, 오류} · 단위: FIFO 배분(잔액 < 원장 합일 때 늦은 달부터 깎임), 월 경계 PHT(UTC 15:59/16:00), 합=합계 · 수동: 운영 회원 1명 값 읽기 전용 대조.
- 영향 파일: `app/(main)/mypage/points/expiring/page.tsx`, `components/points/PointExpiringCard.tsx`, `app/api/me/points/route.ts`, `lib/points/point-expire-utils.ts`.

### S43 홍보 이용 — 판정: 수정  (현재 감사 판정: PARTIAL)

- 경로 / 진입 메뉴: `/mypage/points/promotions` (S40 [홍보 이용], S20 ⋮ [더 알리기] `?postId=` — **URL·용어 UI-6 LOCK**).
- 구조·콘텐츠 순서: 잔액(로딩·오류 "—", 현행 `promotions/page.tsx:37-38`) → 홍보 신청 폼(대상 글 선택·기간) → 내 홍보 주문 목록.
- 표시: 주문 상태 라벨 i18n, 기간 `formatMypageDate`.
- 컴포넌트·토큰: `MyScreen` · `PointBalanceCard` · `PointPromotionOrderForm` · `PointPromotionOrderList` · `MyStateView` · `useMypageSubmitGuard`.
- CTA: [홍보 신청](폼 하단, 제출 방지) → POST `/api/me/points/promotion-orders` → 목록 갱신 + 토스트. 잔액 부족 문구 현행(`:21-29`).
- 시트·모달·확인 흐름: 없음(포인트 차감 확인은 폼 내 현행 유지 — 구현 시 확인).
- 데이터·SSOT: `GET/POST /api/me/points/promotion-orders`, 대상 글 = `usePromotionOrderTargets`(A1 무인자 호출 — 불변).
- 로딩·빈·오류: 스켈레톤 = 잔액 카드 + 폼 3행 + 목록 행 3 / 목록 빈 "아직 홍보한 글이 없어요" / **목록 오류=빈 목록**(`:53-62` `setOrders([])`) → 오류+재시도(폼은 계속 사용 가능).
- 전환·복원: 300ms. 뒤로: history 우선, 직접 진입 시 `postId` 있으면 `/mypage/products`, 없으면 `/mypage/points`(현재 항상 `/mypage/products` `:105`).
- 모바일·태블릿: 1열.
- 성능·캐시: 잔액 훅·대상·주문 3요청(현행).
- 보존 조건: CUT F promote writer/URL 불변(UI-6 LOCK) · 피드 노출 가중치 로직 무영향.
- 현재와의 차이: 목록 오류=빈 `:57-62` · 뒤로 고정 `:105` · 글자 로딩 `:129,146`.
- 완료 검증: 캡처 390/820 × {스켈레톤, 잔액 "—", 목록, 빈, 목록 오류} · 단위: 오류 시 빈 상태 미표시 · 수동: S20 ⋮ 더 알리기 → 대상 미리 선택됨 → 뒤로 S20.
- 영향 파일: `app/(main)/mypage/points/promotions/page.tsx`, `components/points/PointPromotionOrderList.tsx`.

### S44 쿠폰 — 판정: 수정(스켈레톤만)  (현재 감사 판정: PASS)

- 경로 / 진입 메뉴: `/mypage/coupons` → 커머스 허브 본문 `CustomerCommerceHubPage legacyAlias="coupons"`(`app/(main)/mypage/coupons/page.tsx:23`), URL 정규화 `?tab=coupons&couponTab=held|used`(`CommerceHubLegacyUrlSync.tsx:33-51`, C3).
- 구조·콘텐츠 순서: 탭 [사용 가능 · 사용·만료](개수) → 쿠폰 카드(혜택·조건·만료일) (현행).
- 표시: 현행.
- 컴포넌트·토큰: `CustomerCouponWalletBody` · `StoreCouponCustomerCard` · `CommerceEmptyState`(🎟️) — 배달 커머스 공용.
- CTA: 카드 [사용하기] → 쿠폰 인계 후 매장 이동(현행 `CustomerCouponWalletBody.tsx:137-147`).
- 시트·모달·확인 흐름: 없음.
- 데이터·SSOT: `GET /api/me/store-coupons?tab=all`(`:39`). 커서 없음(지갑 전체).
- 로딩·빈·오류: 스켈레톤 = 탭 + 쿠폰 카드 3(좌 금액 블록·우 2줄) — 현재 "…"(`:104-105`, 페이지 fallback `coupons/page.tsx:7-11`) / 빈·오류+재시도 현행(`:113-130`).
- 전환·복원: 300ms(내정보 경로 진입 시). `couponTab` 유지(현행).
- 모바일·태블릿: 현행.
- 성능·캐시: `useCommerceHubTabFetch` 현행.
- 보존 조건: 배달 허브 `/orders?tab=coupons` 동일 본문 · `commerce-hub-nav` 쿼리 키.
- 현재와의 차이: 스켈레톤 없음 `:104-105`.
- 완료 검증: 캡처 390/820 × {스켈레톤, 사용 가능, 사용·만료, 빈, 오류} · 단위: 없음(기존 유지) · 수동: 배달 허브 쿠폰 탭 회귀 캡처 1장.
- 영향 파일: `components/orders/customer-commerce/CustomerCouponWalletBody.tsx`(배달 공용 — 스켈레톤 블록만), `app/(main)/mypage/coupons/page.tsx`.

### S45 상품권 + 상세 — 판정: 수정  (현재 감사 판정: PARTIAL)

- 경로 / 진입 메뉴: 목록 `/mypage/gift-certificates` → 커머스 허브 `legacyAlias="gifts"`(`?tab=gifts&giftTab=owned|received|sent|used`, C3·C4) / 상세 `/mypage/gift-certificates/[instanceId]`(`OwnedGiftInstanceDetailView`).
- 구조·콘텐츠 순서: 목록 = 탭 [보유 · 받은 · 보낸 · 사용 완료](C4: 설계 3탭 + [받은] 유지) → 상품권 카드 → 상단 [상품권 사기] CTA(현행 `CustomerGiftWalletBody.tsx:273`). 상세 = 카드 비주얼 → 금액 → 번호(복사) → 유효기간 → 사용 내역 → 하단 고정 [주문에 사용하기](주) · [선물하기](보조, 양도 가능·ACTIVE 만).
- 표시: 상세 금액 `faceValue`·`purchasePrice`·사용액 `toLocaleString()`(`OwnedGiftInstanceDetailView.tsx:204,213,223,235,248`) → `formatMoneyPhp`. 유효기간 현행 포맷 함수.
- 컴포넌트·토큰: `CustomerGiftWalletBody`(배달 공용) · `GiftVisualCard` · `WalletGiftFriendPicker` · `MyStickyCta` · `MyStateView`.
- CTA: [번호 복사] → 클립보드 + 토스트 "복사했어요"(현재 실패 무시 `:141`) · [주문에 사용하기] → 매장/배달 탐색(현행 `useHref` `:59-64`) · [선물하기] → 친구 선택 시트(현행).
- 시트·모달·확인 흐름: 선물하기 시트 내 최종 확인(현행 피커 흐름 유지).
- 데이터·SSOT: `GET /api/me/gift-certificates/wallet`, `GET /api/me/gift-certificates/instances/[id]`.
- 로딩·빈·오류:
  - 목록: 스켈레톤 = 탭 + 카드 3(현재 "…" `CustomerGiftWalletBody.tsx:280-281`) / 빈·오류 현행(`:289-295`).
  - 상세: 스켈레톤 = 카드 비주얼 블록 + 4행 + 하단 CTA 자리. **네트워크·JSON 오류 시 `ready` 가 영영 false → 무한 "…"**(`OwnedGiftInstanceDetailView.tsx:38-53`: try/catch 없음, `res.json()` 예외) → try/catch + 오류+재시도. 403 수령 대기 안내 현행(`:83-89`). `ok:false`(없음)와 오류 구분: 404 → "상품권을 찾을 수 없어요"+[목록으로].
- 전환·복원: 목록→상세 300ms(현재 `CommerceChildSlideShell` 사용 여부 확인 필요), 뒤로 = 목록(`giftTab` 유지 `:30`).
- 모바일·태블릿: 상세 하단 CTA 56 + safe-bottom.
- 성능·캐시: 현행.
- 보존 조건: 배달 허브 상품권 탭 동일 본문 · 상품권 결제 차감 로직 무영향 · `data-*` 테스트 속성(`data-owned-gift-instance-detail` 등).
- 현재와의 차이: 상세 무한 "…" `:38-53,81-82` · 금액 포맷 `:204-248` · 하단 고정 CTA 아님 `:161-178` · 스켈레톤 없음.
- 완료 검증: 캡처 390/820 × {목록 스켈레톤·4탭·빈·오류, 상세 스켈레톤·정상·사용완료·수령대기(403)·없음(404)·오류(네트워크 차단)} · 단위: 상세 fetch reject → 오류 상태, 금액 포맷 · 수동: 번호 복사 토스트(Android·iPhone).
- 영향 파일: `components/gift-certificate/OwnedGiftInstanceDetailView.tsx`, `components/orders/customer-commerce/CustomerGiftWalletBody.tsx`(스켈레톤만).

### S46 내 광고 (+ 신청 2화면) — 판정: 수정(탭·종류 시트 신규)  (현재 감사 판정: FAIL)

- 경로 / 진입 메뉴: `/mypage/ads?tab=active|pending|ended` (홈 4 자산 "내 광고", 오른쪽 값 진행 n) · 신청: `/mypage/ads/apply`(포인트 홍보 신청, `MyAdsApplyPageClient`) · `/mypage/ads/feed-request`(피드 배너 요청, 1218행).
- 구조·콘텐츠 순서: 헤더 오른쪽 [광고 신청] → 탭 [진행중 · 대기 · 종료](개수) → 광고 행(종류 뱃지[포인트 홍보/피드 배너] · 제목/대상 · 기간 · 상태). 현재 두 소개 섹션(`MyAdsPageClient.tsx:267-341`) + 배너 상태 목록(`:342-`) 구조.
- 표시: 탭 분류 함수 `classifyMyAdTab(displayStatus)` 신규: 진행중 = `active`·`paused` / 대기 = `pending_review`·`scheduled` / 종료 = `rejected`·`cancelled`·`ended`(`lib/ads/feed-ad-member-presentation.ts:17-24`). 포인트 홍보 주문(`/api/me/post-ads`)은 같은 3분류로 매핑(상태 값 집합 **확인 필요**).
- 컴포넌트·토큰: `MyScreen`(rightSlot) · 탭 세그먼트 · `MyRow` · `DibayActionSheet`(광고 종류 선택) · `MobileConfirmBottomSheet` · `MyStateView` · `SellerHubEmptyState`.
- CTA:
  - 헤더 [광고 신청] → **종류 선택 시트**: [포인트로 글 홍보] → `/mypage/ads/apply` · [피드 배너 광고] → `/mypage/ads/feed-request`(배너 생성 제한 `canCreateBanner=false` 이면 비활성+사유 `:111-120`).
  - 행 [취소](대기·`pending_review`) → danger 확인 시트 → PATCH `/api/me/feed-ad-requests/{id}` `{action:"cancel"}` (현재 확인 없이 즉시 `:489-503`).
  - 행 [연장](진행중 배너) → 현행 연장 시트(`renewTarget` `:176-245`).
  - 종료 행 [다시 만들기] 현행(`:504-515`).
  - 빈 화면 주 CTA [광고 신청](같은 시트).
- 시트·모달·확인 흐름: 종류 선택 = 액션 시트, 취소 = 확인 시트, 연장 = 기존 시트(잔액 부족·재심사 문구 현행 `:211-225`).
- 데이터·SSOT: `GET /api/me/post-ads`, `GET /api/me/feed-ad-requests`, `PATCH /api/me/feed-ad-requests/[id]`, `POST /api/me/feed-ad-campaigns/[id]/renew`(기존 API). 커서 **미적용**(1회원 1현재 배너 규칙 `feed-ad-member-limit.ts:1-9`, 건수 소량).
- 로딩·빈·오류: 스켈레톤 = 탭 + 행 4(종류 뱃지 + 2줄 + 우측 상태) / 탭별 빈 / **오류=빈 목록**(`:96-129`: 401 외 실패·catch 모두 `setAds([])`) → 오류+재시도(401 만 로그인).
- 전환·복원: 300ms. `?tab=`. 신청 화면 다녀오면 대기 탭 선택.
- 모바일·태블릿: 1열.
- 성능·캐시: 2요청 병렬(현행), 탭 전환 클라이언트 분류.
- 보존 조건: 1회원 1배너 규칙 · 피드 광고 신청 폼 구조(v2 S49 "구조 유지, 공통 버튼·상태만 교체") · 관리자 심사 흐름 · `data-testid`(`feed-ad-cancel-*`, `revenue-hub-feed-ad-status`, `feed-ad-view-*`).
- 신청 2화면 하위 블록:
  - `/mypage/ads/apply`: T3 — 기존 폼 + 하단 고정 [신청](제출 방지), 잔액 "—" 처리. 오류 토스트.
  - `/mypage/ads/feed-request`: T3 — 1218행 구조 유지, 하단 버튼 `MyStickyCta`·상태 표시만 공통 부품. 글 선택은 A1·A4 **무인자** 호출 유지(`page.tsx:171-172`).
- 현재와의 차이: 탭 없음 · 종류 선택 시트 없음(소개 섹션 2개 링크 `:282,319`) · 취소 확인 없음 `:494` · 오류=빈 `:103-129`.
- 완료 검증: 캡처 390/820 × {스켈레톤, 3탭, 종류 시트(배너 가능/불가), 취소 확인 시트, 연장 시트, 빈, 오류, apply·feed-request 하단 CTA} · 단위: `classifyMyAdTab` 7상태, 오류 분기 · 수동: 신청 후 대기 탭 표시.
- 영향 파일: `app/(main)/mypage/ads/MyAdsPageClient.tsx`, `app/(main)/mypage/ads/apply/*`, `app/(main)/mypage/ads/feed-request/page.tsx`(하단 CTA·상태만), 신규 `lib/ads/my-ad-tab.ts`.

### S47 회원 혜택 — 판정: 수정  (현재 감사 판정: PARTIAL)

- 경로 / 진입 메뉴: `/mypage/benefits` (홈 4 자산 "회원 혜택" — 활성 정책 0건이면 홈 행 숨김, v2 S4A).
- 구조·콘텐츠 순서: 내 등급 카드(현재 `benefits/page.tsx:69-80`) → 적용 중 혜택 목록(혜택 항목별 행).
- 표시: 정책 1건이 여러 혜택 필드를 가지므로 행 = 값이 있는 필드마다 1행(광고 할인 n% · 포인트 적립 +n% · 프리미엄 홍보 · 비즈 프로필 · 노출 우선). 퍼센트 i18n 포맷.
- 컴포넌트·토큰: `MyScreen` · `MyRow`(chevron = 이동 대상 있을 때만) · `MyStateView`. 빈 문구 기본값 한국어 하드코딩(`MemberBenefitList.tsx:14`) → i18n.
- CTA: 행 → 사용처(C8 매핑). 이동 없는 행은 비활성(정보).
- 시트·모달·확인 흐름: 없음.
- 데이터·SSOT: `GET /api/me/benefits` → `member_benefit_policies`(운영 활성 3건) + `profiles.member_type`(`app/api/me/benefits/route.ts:22-45`). 매핑 함수 `resolveMemberBenefitRows(policy)` 신규(`lib/member-benefits/`).
- 로딩·빈·오류: 스켈레톤 = 등급 카드 + 행 4 / 빈 현행 키(`benefits_empty_list`) / 오류+재시도 현행(`:92-98`) 유지 / 비회원 로그인 유도 현행.
- 전환·복원: 300ms. 탭 없음.
- 모바일·태블릿: 1열.
- 성능·캐시: 1요청. 홈 행 표시 여부는 summary 응답 사용(파트 A).
- 보존 조건: 관리자 혜택 정책 화면·노출 가중치 계산 무영향(읽기만).
- 현재와의 차이: 행이 이동 안 함(`MemberBenefitCard` 카드만 `MemberBenefitList.tsx:24-30`) · 글자 로딩 `:72-73,99-100` · 하드코딩 빈 문구 `MemberBenefitList.tsx:14`.
- 완료 검증: 캡처 390/820 × {스켈레톤, 혜택 3정책 계정, 빈, 오류} · 단위: `resolveMemberBenefitRows` 필드→행·목적지 매핑 · 수동: 행 → 광고·포인트 이동 후 뒤로.
- 영향 파일: `app/(main)/mypage/benefits/page.tsx`, `components/member-benefits/MemberBenefitList.tsx`, `MemberBenefitCard.tsx`, 신규 `lib/member-benefits/resolve-member-benefit-rows.ts`.

---

## C.4 파트 C 일괄 완료 검증 (R5 단계 게이트)

1. 로컬 1회(AGENTS 효율 규정 2): `npm run typecheck:build` + 변경 관련 vitest(위 블록의 단위 항목 + 기존 `marketplace-ui-6-my-product-card.test.ts`, `list-community-posts-for-user.test.ts`, `community-post-ssot-contract.test.ts`, `trade-recent-views.test.ts`, `me-benefits.route.test.ts`, 주문 상태 라벨 테스트) + 변경 파일 eslint.
2. 회귀 계약: `verify:mypage-authority-contract`, `verify:design-system-hard-lock`(내정보 경로 hex 0 — C5 예외 1건 주석), `verify:buyer-orders-list-snapshot-*`, `verify:store-order-detail-snapshot-*`, `verify:routes`.
3. 캡처: 웹 390px·820px, 화면별 블록 목록 전부(라이트 + S30 다크 1장 + 배달 허브 회귀 2장).
4. 다른 도메인 회귀 수동 확인: 마켓 판매 허브 매물 수(A1), 필라이프 피드 좋아요/저장 토글(A6), 배달 허브 주문·쿠폰·상품권 탭(C5).
5. 판정 보고: 브랜치 PASS / Preview NOT_PROVEN(선택) / Production·실기기는 R9.

## C.5 Owner 확인 필요 (이 파트)

- C1: S20 = UI-6 LOCK 유지(예약중 탭·끌어올리기·탭 개수·화면 내 지역 일괄변경 미도입) 확정, 그리고 lock 문서의 "`/mypage/trade/sales` tabs PASS" 와 현재 리다이렉트 불일치 경위.
- C7: M6 마이그레이션(충전 멱등 키) 승인 여부.
- A4·A6·A10·A1: 다른 도메인 파일(커뮤니티·거래·매장 API) 변경 승인(감사 §8-6 과 동일 범주).


---

# 파트 D — 설정·고객센터·정책 화면(S50–S65) · API 표 · 데이터 SSOT 표 · 기존 기능 보존 표

- 작성: 2026-10-20 · 코드·DB 변경 0 (조회만) · 근거 = 저장소 file:line (HEAD 기준 직접 열어 확인)
- 우선순위: 00-brief §기준 문서 우선순위 1→5. 공통 충돌 K1–K7 은 brief 와 동일하게 적용. 이 파트에서 **새로 발견한 충돌은 K8–K12** 로 §0 에 정리.
- 번호: 화면 번호는 v2(§6.2) 번호를 쓰고, v2.1 번호가 따로 있는 화면은 별칭으로 표기.

---

## 0. 이 파트에서 새로 확인한 충돌 (K1–K7 밖) — 결정과 근거

| ID | 충돌 | 근거 | 결정 (우선순위 규칙 적용) | Owner 확인 |
|---|---|---|---|---|
| **K8** | S60 고객센터 허브의 포인트·충전 행: v2 "포인트 바로가기 제거"(§6.2 S60) ↔ **고객센터 SSOT(LOCKED)** 허브 항목 `inquiries \| inbox \| points \| charge \| notices` 명시 + v2.1 S50 "현행" | `docs/customer-platform/app-customer-center-ssot.md:14-24`, v2.1 `:292`, v2 `:380` | 우선순위 2(계약)·3(v2.1) 모두 유지 → **포인트·충전 행 유지**. 색 토큰화·`toLocaleString` 제거(→ `CurrencyAmount`)만 수정. brief 의 "remove points/charge rows per design" 은 v2(4순위)만의 요구라 적용하지 않음 | 필요(제거를 원하면 고객센터 SSOT 개정 승인) |
| **K9** | S65 약관 허브: v2 "`…/settings/terms` 허브로 확장, `app_legal_documents` 의 모든 문서" ↔ v2.1 S51 "현행"·홈 정책 그룹 3행 유지 + 보존표 `terms/privacy/business` 각각 KEEP. 또한 `app_legal_documents.kind` 는 DB CHECK 로 `terms`·`privacy` 2종뿐 → "기타 문서(위치기반 약관 등)" 는 존재할 수 없음 | v2 `:383`, v2.1 `:293`, 보존표 `LEGACY-IA-FEATURE-PRESERVATION.md:27-29`, `supabase/migrations/20261019120000_app_legal_documents.sql:6`, `lib/legal/app-legal-documents.ts:9` | v2.1(3순위) 우선 → **홈 3행 유지**. `settings/terms` 화면은 현재 "문단 1 + /terms 링크 1"(`MyPageItemScreen.tsx:198-209`)인 스텁이므로, 홈 행을 없애지 않는 **추가형 허브**(약관·개인정보·사업자정보 3행)로 정리하는 것은 보존표와 충돌 없음 → S65 = 3행 허브로 확정. "기타 문서" 행은 DB 에 종류가 없어 **만들지 않음**(kind 추가는 DB 승인 + 관리자 CMS 작업) | 필요(v2.1 "현행" 문구와 다르므로 1줄 확인) |
| **K10** | S53 연결 로그인 분리: v2 "device-permissions 안의 `LinkedLoginProvidersContent` 분리" ↔ v2.1 S10 "기기 권한 … · 연동 로그인"(같은 화면 유지) + v2.1 S03 계정 "연동 로그인" 행 | v2 `:369`, v2.1 `:258`(S03), `:265`(S10) | v2.1 우선 → **새 경로 만들지 않음**. 기기 권한 화면 안에서 **별도 그룹(`MyGroup` 제목 "연동 로그인", 앵커 `#linked-login`)으로 분리**, 계정(S03)에 "연동 로그인 n개" 행 → `device-permissions#linked-login`. 해제 확인 시트·오류 상태 추가 | 불필요(두 문서 모두 충족) |
| **K11** | 알림(벨) 공지 상세 경로: v2 §4.2 "`/mypage/notices/[noticeId]` → `/mypage/customer-center/notice/[id]` 리다이렉트" ↔ 고객센터 SSOT "Bell: unchanged deep links to `/mypage/notices/{id}`" + 공지 API 가 지금도 `href = buildAppNoticeDetailPath(id)`(구 경로)를 응답 | `app-customer-center-ssot.md:47-49`, `app/api/me/settings/notices/route.ts:77`, `lib/notices/app-notice-paths.ts:8-10`, `app/(main)/mypage/notices/[noticeId]/page.tsx` | 계약 우선 → **`/mypage/notices/[noticeId]` 경로 유지(리다이렉트 안 함)**. 단 상세 구현이 2개(`NoticeDetailPageClient` vs `CustomerCenterBoardDetailClient`)이므로, 구 경로 페이지가 **같은 상세 컴포넌트를 렌더**하도록 통일(경로 불변·구현 1개) | 불필요 |
| **K12** | S61 "고정글" 구역: v2 요구 ↔ `app_notices` 에 고정 컬럼 없음(선택 컬럼 목록·마이그레이션 모두 없음) | `lib/notices/customer-center-content.ts:66-67`, `supabase/migrations/20261018120000_app_notices.sql` · `20261030120000_…content_ssot.sql`(pin 0건) | 고정글은 **DB 컬럼 + 관리자 CMS 입력**이 필요 → 관리자 도메인 + DB 승인. 승인 전에는 **고정 구역을 그리지 않음**(가짜 고정 금지). 목록·더 보기·오류 계약은 먼저 구현 | 필요(DB·관리자 세션) |

부가 결함(충돌 아님, 수정 대상): 공지 목록 API 가 실패 시 빈 성공 응답(`notices/route.ts:28-30`, `:47-50`), 댓글 목록 API 도 DB 오류를 빈 성공 응답(`notices/[noticeId]/comments/route.ts:50-57`).

---

## 1. 화면 명세 (S01–S19 와 겹치지 않는 화면)

### 1.0 v2 번호 ↔ v2.1 번호 별칭 (중복 명세 금지 — 해당 파트 참조)

| v2 | v2.1 | 화면 | 이 파트 처리 |
|---|---|---|---|
| S50 알림 | S11 | `…/settings/notifications` | S11 명세 참조. 메모: v2 S50 의 "주문(구 order-notifications 통합)" 섹션은 v2.1 S11 구조 "전체·채팅·거래·주문·…" 와 동일 → 차이 없음 |
| S51 채팅 | S16 | `…/settings/chat-settings` | S16 참조 |
| S52 기기 권한 | S10 | `…/settings/device-permissions` | S10 참조. 연동 로그인 그룹은 아래 S53 |
| **S53 연동 로그인** | (S10 안 그룹 + S03 행) | — | **아래 1.1** |
| S54 언어 | S12 | 시트 | K4 적용(토글 유지 + 현재 값) — S12 참조 |
| S55 캐시 | S17 | `…/settings/cache` | S17 참조 |
| S56 버전 | S18 | `…/settings/version` | K6 적용 — S18 참조. 메모: v2 S56 의 "iOS `app_meta` 비교 → [App Store 에서 업데이트]"(v2 D17)는 v2.1 §0.1·B1 로 **폐기**(버튼 없음). v2 텍스트를 구현 근거로 쓰지 말 것 |
| S57 탈퇴 | S19 | `…/settings/leave` | S19 참조. 메모: v2 S57 데이터 `/api/me/leave-request`, v2.1 S19 `account_deletion_requests` — 같은 경로(API→테이블)이므로 충돌 아님 |
| S60–S65 | S50·S51(현행) | 고객센터·정책 | **아래 1.2–1.7** (K8·K9 적용) |

---

### 1.1 S53 연동 로그인 — 판정: 수정 (현재 감사 판정: PARTIAL)

- **경로 / 진입 메뉴:** 새 경로 없음(K10). ① 계정·설정 → 개인/보안 `…/section/settings/device-permissions` 화면 안 그룹 `#linked-login`(현재 위치 `components/my/settings/DevicePermissionsSettingsContent.tsx:296-299`) ② S03 계정 화면 "연동 로그인" 행(오른쪽 값 "n개 연결") → `device-permissions#linked-login`.
- **구조·콘텐츠 순서:** 기기 권한 화면 = [그룹 1 "기기 권한": 설명 → 알림·카메라·사진·위치 행] → [그룹 2 "연동 로그인": 설명 1줄(`mypage_linked_login_providers_desc`) → (웹이면) "앱에서만 연결 가능" 안내 → 제공자 행(`LINKABLE_AUTH_PROVIDERS` 순서)]. v2.1 S10 순서(권한 먼저, 연동 로그인 뒤)에 맞춰 현재 "연동 로그인 먼저"(`:296-299` 가 권한 소개 문단 `:301` 보다 위) 순서를 바꾼다.
- **표시:** 행 = 제공자 이름(`resolveProviderDisplayName`) · 상태("연결됨 · 연결일 `formatMypageDate(linkedAt)`" / "연결 안 됨"). 연결 1개뿐이면 해당 행 [해제] 비활성 + 보조 문구 "최소 1개는 유지돼요"(서버 409 `last_provider_unlink_blocked` 와 같은 규칙을 화면에서 미리 표시).
- **컴포넌트·토큰:** `MyGroup`, `MyRow`(kind=value, 오른쪽 버튼), 버튼 `Sam.btn.sm`(연결=primary, 해제=secondary·위험 아님), `MyStateView`(스켈레톤 3행/오류+재시도), `MobileConfirmBottomSheet`, `MypageToastHost`, `useMypageSubmitGuard`.
- **CTA:** [연결] 행 오른쪽 · 활성 조건 = 네이티브 앱 + 미연결 + 진행 중 아님 · 동작 = 네이티브 자격 수집 → `POST /api/auth/provider/link/complete` → 성공 토스트 "{제공자} 연결됨" → 목록 재조회. [해제] 행 오른쪽 · 활성 = 연결됨 + 연결 2개 이상 + 진행 중 아님 · 동작 = 확인 시트 → `DELETE /api/me/auth-providers/{provider}` → 성공 토스트 → 재조회.
- **시트·모달·확인 흐름:** 해제 = `MobileConfirmBottomSheet`(제목 "{제공자} 연결을 해제할까요?", 본문 "해제하면 이 방법으로 로그인할 수 없어요", 확인 = 해제, 취소 왼쪽). 연결 실패 = 토스트(현재 `setHint` 문단 대신). 409 = 토스트 "최소 1개의 로그인 방법은 유지해야 합니다".
- **데이터·SSOT:** `GET /api/me/auth-providers`(`app/api/me/auth-providers/route.ts:10-29`) → `user_auth_identities`(`lib/auth/provider-identity/repository.server.ts:10,27-38`). 해제 `DELETE /api/me/auth-providers/[provider]`(`…/[provider]/route.ts:20-34`, 400/409/501). 연결 `POST /api/auth/provider/link/complete`. S03 의 "n개" 는 같은 GET 응답의 `linked` 개수(별도 쿼리 금지).
- **로딩 · 빈 · 오류+재시도:** 로딩 = 제공자 행 모양 스켈레톤 3행(현재 "불러오는 중" 글자 `LinkedLoginProvidersContent.tsx:127-129`). 빈 = 해당 없음(제공자 목록은 상수). 오류 = 그룹 안 `MyStateView` error + [다시 시도] — **현재는 실패 시 빈 목록을 조용히 표시**(`:33-37`, `json.ok` 아니면 아무것도 안 함 → `rows=[]`). API 쪽도 `findIdentitiesByUserId` 예외를 잡지 않음(`route.ts:19`) → try/catch 후 `500 {ok:false,errorCode:"identities_load_failed"}`.
- **전환·복원:** 기기 권한 화면 진입 우→좌 300ms(K2), 뒤로 반대. S03 → `#linked-login` 진입 시 해당 그룹으로 스크롤. 시트 280ms 아님(확인 시트 = modal 200ms 계약 `03-NAVIGATION.md` Motion).
- **모바일·태블릿:** 1열, 태블릿 최대 40rem·좌우 20px. 행 52px, 버튼 터치 44 이상.
- **성능·캐시:** 화면 진입 시 GET 1회(`runSingleFlight("me:auth-providers")`), 연결/해제 후에만 재조회. 기기 권한 화면이 내정보 전체 데이터(`MyPageItemRouteClient.tsx:76-97`)를 기다리지 않도록 R7(`loadMypageServerShell`) 적용 대상.
- **보존 조건:** 기능 보존표 `security | device-permissions | KEEP`(`LEGACY-IA-FEATURE-PRESERVATION.md:17`) — 경로 유지. 마지막 1개 해제 차단 서버 규칙 불변. `logAuthProviderLinkEvent` 이벤트 이름 불변. 웹에서 연결 비활성(네이티브 전용) 유지.
- **현재와의 차이:** 기기 권한 안에 같은 카드로 섞임·순서 역전(`DevicePermissionsSettingsContent.tsx:296-301`), 해제 확인 없음(`LinkedLoginProvidersContent.tsx:154-162` 바로 실행), 409 외 해제 실패 무음(`:108-118`), 연결 예외 무음(`:90-92`), 조회 실패=빈 목록(`:33-37`), 연결일 미표시(`linkedAt` 받지만 미사용).
- **완료 검증:** 캡처(웹 폰·태블릿 폭): 그룹 분리·해제 확인 시트·1개 남았을 때 비활성. 단위: 조회 실패 → 오류 화면, 409 → 토스트, 해제 확인 취소 시 DELETE 0회. API 단위: identities 조회 예외 → 500. 실기기: Android·iPhone 연결/해제 1회(설치 버전 기록 후).
- **영향 파일:** `components/my/settings/LinkedLoginProvidersContent.tsx`, `components/my/settings/DevicePermissionsSettingsContent.tsx`, `app/api/me/auth-providers/route.ts`, S03 계정 화면(`components/my/MyAccountContent.tsx`), i18n 내정보 카탈로그(키 추가만).

---

### 1.2 S60 고객센터 허브 — 판정: 수정 (현재 감사 판정: PARTIAL)

- **경로 / 진입 메뉴:** `/mypage/customer-center`(`app/(main)/mypage/customer-center/page.tsx`) · 홈 고객지원 그룹 "고객센터"(`lib/mypage/mypage-home-menu-config.ts:239-240`) · 구 `section/settings/support` → 이곳(`mypage-section-legacy-redirect.ts:41-42`).
- **구조·콘텐츠 순서 (K8 적용, 고객센터 SSOT 순서):** ① 인사 영역(헤드셋 아이콘 + "무엇이 궁금하신가요?") + [문의하기] 주 버튼 ② 게시판 3칸(공지·시스템·이벤트) ③ 행 그룹: 상담 내역(안읽음 뱃지) · 이전 문의 기록 · 포인트(잔액) · 충전 신청. 현재 순서(`CustomerCenterHubClient.tsx:126-157, 177-229`)와 같음 — 순서 변경 없음.
- **표시:** 상담 내역 뱃지 = `useSupportRequesterUnread({audience:"MEMBER"})`(99+ 상한). 포인트 오른쪽 값 = `CurrencyAmount`(로딩 "…" 대신 값 자리 작은 스켈레톤, 실패 "—", 음수 그대로).
- **컴포넌트·토큰:** `MyScreen`(+`MySubpageHeader` backHref `/mypage`), `MyGroup`/`MyRow`(아이콘 원 `--sam-icon-surface`, 눌림 `--sam-pressed-surface`), 주 버튼 `Sam.btn.primaryCombo`, 게시판 3칸은 그룹 리스트 위 3칸 버튼(1행 3열 — 메뉴 카탈로그 아님, 기존 구조 유지). 하드코딩 → 토큰: `#0E5C3A`→`--sam-primary`(`#0B421A`), `#E8F7EF`→`--sam-pressed-surface`/`--sam-icon-surface`, `#1A2E24`→`--sam-text-primary`, `#8F9D95`→`--sam-text-secondary`, `rgba(14,92,58,…)`→`--sam-border-soft`, `rounded-2xl`→`rounded-ui-rect`(v2.1 §3.4, 화면에 붙은 요소 4px).
- **CTA:** [문의하기] 인사 영역 하단 전체 폭 · 항상 활성(카테고리 게이트 `SupportGenericHubInquireGate` 가 내부 처리) · 지원 시트 열기(현행). 행 = 이동만(T5).
- **시트·모달·확인 흐름:** [문의하기] → 기존 Support 모달(`SupportContextProvider` + `SupportGenericHubInquireGate`) 그대로. 허브 자체를 시트로 만들지 않음(SSOT Forbidden "Bottom sheet Customer Center").
- **데이터·SSOT:** 안읽음 = `support_cases.requester_unread_count` 합(`use-support-requester-unread`). 포인트 = `useUserPointBalance` → `GET /api/me/points` → `profiles.points`(원장 투영). 게시판 링크 = `buildCustomerCenterBoardListPath`.
- **로딩 · 빈 · 오류+재시도:** 허브는 정적 골격 즉시 표시(스켈레톤 불필요). 값 칸만 로딩 스켈레톤/오류 "—"(T5 "요약 로딩/오류는 요약 칸만"). 빈 상태 없음.
- **전환·복원:** 홈 → 허브 우→좌 300ms, 뒤로 반대(K2). 하위 화면은 `?from=customer-center` 로 진입해 뒤로 = 허브(`customer-center-paths.ts:84-97`) — 유지. 허브 스크롤은 짧아 복원 불필요.
- **모바일·태블릿:** 현재 열 `CUSTOMER_CENTER_LIST_COLUMN_CLASS`(`customer-center-layout.ts:52-53`, 태블릿 2xl~4xl) → 내정보 공통 폭(최대 40rem·좌우 20px)으로 통일(`MyScreen`). 1열 유지(IA 계약 §3).
- **성능·캐시:** 요청 2개(안읽음·포인트) 병렬, 포인트는 `useUserPointBalance` 캐시 재사용. 재진입 시 값은 캐시로 먼저 표시 후 갱신.
- **보존 조건:** 고객센터 SSOT(LOCKED) 허브 항목·전체 화면·`?from=customer-center` 복귀, `data-testid="customer-center-hub"`/`customer-center-boards`/`cc-board-tab-*`, `data-support-entry-ssot`, 사장님 강제 이동(`MypageCsOwnerCareBridge`)은 inquiries/inbox 쪽에서 유지.
- **현재와의 차이:** 포인트 값 `balance.toLocaleString(...)`(`CustomerCenterHubClient.tsx:115-119`) — 포맷 SSOT 위반·로딩 "…" 글자. hex 직접 사용 `:83-84, 100, 178, 202, 205-206` 및 상수 파일 `lib/mypage/customer-center-ui.ts:6-37`(18곳, 시그니처와 다른 그린 `#0E5C3A`). 카드 그림자·`rounded-2xl`(v2 §7.2 제거 대상).
- **완료 검증:** 캡처: 허브(폰·태블릿), 포인트 음수·실패 "—". grep: `customer-center-ui.ts`·허브 파일 hex 0. 단위: 포인트 값이 `CurrencyAmount` 출력과 동일. 회귀: 사장님 계정 고객센터 → 사장님 상담 이동 유지.
- **영향 파일:** `components/mypage/cs/CustomerCenterHubClient.tsx`, `lib/mypage/customer-center-ui.ts`(값→토큰 참조, 이 상수를 쓰는 CS 화면 전부 함께 바뀜: 목록·상세·댓글·문의 보관함), `lib/mypage/customer-center-layout.ts`(폭).

---

### 1.3 S61 고객센터 게시판(공지·시스템·이벤트) — 판정: 수정 (현재 감사 판정: PARTIAL)

- **경로 / 진입 메뉴:** `/mypage/customer-center/{notice,system,marketing}`(각 `page.tsx` → `CustomerCenterBoardListClient`) · 허브 3칸 · 구 `section/settings/notices` → `/mypage/customer-center/notice`(`app/(main)/mypage/section/settings/notices/page.tsx`).
- **구조·콘텐츠 순서:** 헤더(제목 = 게시판 이름 · 오른쪽 검색 아이콘) → 게시판 전환 칩(`CustomerCenterBoardSwitcher`) → (검색 열림 시) 검색창 → **[고정글 구역 — K12 승인 후에만]** → 날짜 묶음 목록(`groupCustomerCenterItemsByDate`) → `MyListPager` 더 보기.
- **표시:** 행 = 유형 아이콘 · 게시판 칩 · 날짜(`formatMypageDate`, 월/일) · 제목 1줄 · 본문 요약 1줄 · 이벤트만 썸네일(`CustomerCenterContentMedia`), 그 외 chevron. 조회수·댓글 수는 목록에 표시하지 않음(현행).
- **컴포넌트·토큰:** `MyScreen`, `Sam.chip`(전환 칩 — 선택 = 연그린+그린 테두리, v2.1 §3.3), 검색 입력 `sam-input`(16px 이상), `MyGroup`/`MyRow`, `MyStateView`, `MyListPager`, `SamarketThumbnail`(또는 기존 `CustomerCenterContentMedia` thumb — lazy 유지).
- **CTA:** 헤더 검색 아이콘(Icon CTA) · 탭 시 검색창 토글 · 입력 300ms 디바운스 후 **서버 검색**(`q=`) — 현재 클라이언트 필터(`:116-124`)는 최근 50건만 검색되어 오래된 글이 안 찾아짐. 행 탭 = 상세 이동.
- **시트·모달·확인 흐름:** 없음.
- **데이터·SSOT:** `GET /api/me/settings/notices?content_type=&q=&cursor=&limit=` → `app_notices`(`is_active`·미삭제·미보관·게시 기간). 변경: 커서(`published_at,id`), `q`(제목 ILIKE — 본문은 마크다운이라 제목+요약 컬럼 범위는 구현 시 인덱스 확인), 실패 시 5xx. 고정글은 K12.
- **로딩 · 빈 · 오류+재시도:** 로딩 = 행 모양 스켈레톤 5행(현재 "불러오는 중…" `:179-185`). 빈 = `SellerHubEmptyState`("게시글이 없습니다", CTA 없음) / 검색 결과 0 = "‘{q}’ 검색 결과가 없어요". 오류 = `MyStateView` error + [다시 시도] — 오류 문구는 i18n 키만(현재 서버 `json.error` 원문을 그대로 표시 `:86-88`). **API 가 오류를 빈 성공으로 응답하는 2곳 수정:** 서비스 클라이언트 없음 → `ok:true, notices:[]`(`app/api/me/settings/notices/route.ts:28-30`) → **503**; 테이블 없음 → `ok:true, notices:[]`(`:47-50`) → **503 `table_missing`**. 추가 로드 실패 = 목록 유지 + 하단 [다시 시도].
- **전환·복원:** 허브 → 목록 우→좌 300ms, 상세 → 목록 뒤로 반대. 목록 스크롤·검색어·로드한 페이지 수를 화면 키(`cc-board:{type}`)로 sessionStorage 저장 후 복귀 시 복원(v2 §7.8 일반화). 게시판 전환 칩은 경로 자체가 다르므로 `?tab=` 불필요.
- **모바일·태블릿:** 1열 최대 40rem. 이벤트 썸네일 56/64px 유지(`:247`).
- **성능·캐시:** 첫 페이지 20건(현재 50건 한 번에 `:40`). `runSingleFlight("me:cc:board:{type}:{q}:{cursor}")`. 재진입 시 마지막 첫 페이지를 메모리 캐시에서 즉시 표시 후 갱신(감사 §5-4 "게시판 매번 처음부터 로딩").
- **보존 조건:** `data-testid="cc-board-{type}"`, 응답 필드(`href`=구 경로 — K11, `canonicalHref`), 벨 통합과 분리("Content SSOT only (not Bell merge)" `route.ts:19-22`), 관리자 CMS 쓰기 경로 불변, 사장님 고객센터에서 같은 API 를 쓰는지 구현 착수 시 grep 확인 후 응답 하위 호환(`notices` 배열 유지 + `nextCursor` 추가).
- **현재와의 차이:** 고정 구역 없음(DB 컬럼 없음, K12), 더 보기 없음(50건 고정 `:40`), 클라이언트 검색(`:116-124`), 날짜 `toLocaleDateString("ko-KR"…)`(`:131-138`), hex `:153, 175, 208, 222, 227, 247, 252`, 오류 원문 노출(`:86-88`), API 빈 성공 2곳.
- **완료 검증:** API 단위: 서비스 없음 503 · 테이블 없음 503 · 커서 경계(0·1·20·21·마지막) · `q` 일치/불일치. 화면 테스트: 로딩/빈/검색 빈/오류/추가 실패 5상태. 캡처: 공지·시스템·이벤트(썸네일) 폰·태블릿. 복귀 시 스크롤 위치 오차 1행 이내.
- **영향 파일:** `app/api/me/settings/notices/route.ts`, `components/mypage/cs/CustomerCenterBoardListClient.tsx`, `components/mypage/cs/CustomerCenterBoardSwitcher.tsx`(칩 토큰), `lib/mypage/customer-center-date-sections.ts`(날짜 포맷을 `formatMypageDate` 로), (K12 승인 시) 마이그레이션 + 관리자 공지 폼(관리자 세션).

---

### 1.4 S62 게시글 상세(+댓글) — 판정: 수정 (현재 감사 판정: PARTIAL)

- **경로 / 진입 메뉴:** `/mypage/customer-center/{notice,system,marketing}/[id]`(`CustomerCenterBoardDetailClient`) · 벨 → `/mypage/notices/[noticeId]`(K11: 경로 유지, 같은 상세 컴포넌트 렌더로 통일) · 게시판 목록 행.
- **구조·콘텐츠 순서:** 헤더(게시판 이름 + 뒤로) → 게시판 칩 → 제목 → 메타(작성자 · 날짜 · 조회 n) → 대표 이미지 → 본문(`CustomerCenterSafeMarkdownBody`) → 댓글 제목 "댓글 n" → 댓글 목록(최신순) → 이전 댓글 더 보기 → **하단 고정 댓글 입력 바**(댓글 허용 글만).
- **표시:** 내 댓글만 ⋯ → 삭제. 게시 종료(`unavailable`) 글 = 대체 문구(`customerCenterContentUnavailableFallback`), 이미지·댓글 숨김(현행 `:196-213`).
- **컴포넌트·토큰:** `MyScreen`, `MyStateView`, `MyStickyCta` 변형(입력 바: textarea 자동 높이 1~4줄 + [등록], `useFormKeyboardViewport` 로 키보드 위, safe-bottom), `MyListPager`(댓글 커서 — API 이미 `cursor`·`nextCursor` 지원 `comments/route.ts:33-62`), `MobileConfirmBottomSheet`, `MypageToastHost`, `useMypageSubmitGuard`.
- **CTA:** [등록] 입력 바 오른쪽 · 활성 = 내용 1자 이상·2000자 이하·진행 중 아님 · 동작 = POST → 목록 맨 위에 추가 + 입력 비움 + 토스트 없음(목록에 바로 보임). 실패 = 입력 내용 유지 + 토스트(i18n). 댓글 ⋯ 삭제 → 확인 시트 → DELETE → 목록에서 제거 + 토스트 "삭제했어요"; 실패 = 토스트(현재 무음 `CustomerCenterCommentsPanel.tsx:117-131`).
- **시트·모달·확인 흐름:** 댓글 삭제 = `MobileConfirmBottomSheet`(danger). 입력 중 뒤로 = 미저장 확인 시트(T3 규칙, 내용 있을 때만).
- **데이터·SSOT:** `GET /api/me/settings/notices/[noticeId]`(404/500/503 분리 이미 정상 `[noticeId]/route.ts:32-53`) · 조회수 `POST …/view` · 댓글 `GET/POST …/comments`(`customer_center_comments`) · 삭제 `DELETE …/comments/[commentId]`.
- **로딩 · 빈 · 오류+재시도:** 로딩 = 제목 2줄·메타 1줄·본문 6줄 스켈레톤(현재 "불러오는 중" `:169-172`). 없음(404) = "삭제되었거나 없는 글이에요" + [목록으로]. 오류 = 문구 + **[다시 시도]**(현재 재시도 없음 `:173-174`, 서버 원문 표시 `:110-117`). 댓글 오류 = 댓글 영역만 오류+[다시 시도](현재 원문 빨강 글자 `CommentsPanel :165-166`). **댓글 API 빈 성공 수정:** DB 오류 시 `ok:true, comments:[], hint` → **500**(`comments/route.ts:50-57`).
- **전환·복원:** 목록 → 상세 우→좌 300ms, 뒤로 = `resolveNotificationAwareDetailBackHref`(벨 진입이면 알림으로) 유지. 뒤로 시 목록 스크롤 복원(S61).
- **모바일·태블릿:** 읽기 열 최대 40rem(현재 `CUSTOMER_CENTER_READING_COLUMN_CLASS` 2xl~4xl `customer-center-layout.ts:59`). 입력 바는 화면 폭 하단 고정, 태블릿은 본문 폭에 맞춤.
- **성능·캐시:** 상세 1 + 조회수 1(비동기) + 댓글 첫 페이지 30. 목록에서 넘겨받은 제목·날짜로 첫 화면 즉시(목록 캐시 peek), 본문은 상세 응답 후.
- **보존 조건:** `data-testid="cc-detail-{type}"`, `cc-comments`, 조회수 기록 1회, 안전 마크다운 렌더러(XSS 방지) 그대로, 댓글 비허용 글 입력 숨김(`commentEnabled`), 벨 딥링크(K11).
- **현재와의 차이:** 댓글 입력이 본문 아래 인라인(하단 고정 아님 `CommentsPanel :140-160`), 삭제 확인 없음, 상세 오류 재시도 없음, 날짜 `toLocaleDateString`/`toLocaleString`(`Detail :154-159`, `CommentsPanel :77-80`), hex(`Detail :176`, `CommentsPanel :142, 156, 163-172, 177`), 댓글 더 보기 없음(API 는 지원), 상세 2구현(K11).
- **완료 검증:** 캡처: 키보드 열림 시 입력 바 가림 0(Android·iPhone), 삭제 확인 시트. 단위: 댓글 GET DB 오류 → 500, 연속 [등록] 탭 → POST 1회, 삭제 취소 → DELETE 0회, 404 화면. 벨 → `/mypage/notices/{id}` → 같은 상세 → 뒤로 알림.
- **영향 파일:** `components/mypage/cs/CustomerCenterBoardDetailClient.tsx`, `components/mypage/cs/CustomerCenterCommentsPanel.tsx`, `app/api/me/settings/notices/[noticeId]/comments/route.ts`, `app/(main)/mypage/notices/[noticeId]/page.tsx`(K11 렌더 통일), `components/my/settings/NoticeDetailPageClient.tsx`(사용처 0 확인 후 정리).

---

### 1.5 S63 상담(문의) 내역 — 판정: 수정 (현재 감사 판정: PARTIAL)

- **경로 / 진입 메뉴:** `/mypage/support-history`(`app/(main)/mypage/support-history/page.tsx` → `MemberSupportHistoryClient`) · 허브 "상담 내역" 행(`?from=customer-center`).
- **구조·콘텐츠 순서:** 헤더 "상담 내역" → 상태 탭 [진행중 n · 완료](`Sam.tabs`, `?tab=active|done`) → 문의 행 목록 → 더 보기.
- **표시:** 행 = 접수번호(`public_case_no`, 없으면 카테고리 라벨 — `subject` 표시 금지 유지) · 안읽음 뱃지 · 상태 라벨 · 마지막 메시지 시각(`formatMypageDate`, 상대시간). 상태 문구 = `supportCaseStatusLabelMeta`(`lib/support/support-status-label.ts:18-37`) 3종(답변 대기·상담 중·상담 종료) 그대로. 탭 분류: **진행중 = OPEN·WAITING_ADMIN·WAITING_USER, 완료 = RESOLVED·ARCHIVED**(같은 파일의 "상담 종료" 판정과 일치).
- **컴포넌트·토큰:** `MyScreen`, `Sam.tabs`, `useMypageTabParam`, `MyRow`, `MyStateView`, `MyListPager`.
- **CTA:** 행 탭 = Support 모달로 해당 상담 열기(`deliverSupportOpen({caseId, source:"history"})` 현행). 빈 상태 CTA = [문의하기](허브와 같은 `SupportGenericHubInquireGate`).
- **시트·모달·확인 흐름:** Support 모달(기존) — 닫힐 때 목록 재조회(`SupportCasesHistoryList.tsx:59-67` DEF-16 유지).
- **데이터·SSOT:** `GET /api/support/cases?audience=MEMBER&status=active|done&cursor=&limit=20` → `listSupportCasesForRequester`(`lib/support/support-case-service.ts:479-507`, 현재 limit 50 상한 100·커서 없음) → `support_cases`. 탭 개수 = 같은 함수의 count 모드(진행중만 표시). 오류는 이미 5xx(`app/api/support/cases/route.ts:28-31`).
- **로딩 · 빈 · 오류+재시도:** 로딩 = 행 스켈레톤 5행(현재 page Suspense "…" `page.tsx:8`, 목록 "불러오는 중" `SupportCasesHistoryList.tsx:71-75`). 빈 = 탭별 문구(진행중: "진행 중인 상담이 없어요" + [문의하기] / 완료: "완료된 상담이 없어요"). 오류 = 현재 문구+[다시 시도] 정상(`:78-86`) → `MyStateView` 로 교체만.
- **전환·복원:** 허브 → 내역 우→좌 300ms, 뒤로 = 허브(`resolveCustomerCenterBackHref` `MemberSupportHistoryClient.tsx:18`). 탭 = `?tab=`(뒤로·새로고침 유지), 스크롤은 탭별 sessionStorage.
- **모바일·태블릿:** 1열 최대 40rem.
- **성능·캐시:** 첫 페이지 20, 탭 전환 시 탭별 캐시. 모달 닫힘 재조회는 현재 탭 첫 페이지만.
- **보존 조건:** `SupportCasesHistoryList` 는 **사장님 고객센터와 공유**(`components/business/owner/OwnerCustomerCenterView.tsx:8`) → 탭·커서는 prop(`audience==="MEMBER"` 또는 `withStatusTabs`)으로만 켜고 OWNER 렌더 불변. `data-support-history-unread` 속성, 고객 상태 3종 라벨 SSOT, `subject` 비표시(B5).
- **현재와의 차이:** 상태 탭 없음, 더 보기 없음(최대 50), 날짜 `toLocaleString(locale)`(`:145`), 글자 로딩.
- **완료 검증:** 단위: 상태 5종 → 탭 2종 분류표, 커서 경계, OWNER 렌더 스냅샷 불변. 캡처: 두 탭·빈·오류. `?tab=done` 직접 진입 → 완료 탭.
- **영향 파일:** `components/support/MemberSupportHistoryClient.tsx`, `components/support/SupportCasesHistoryList.tsx`(prop 추가), `app/api/support/cases/route.ts`, `lib/support/support-case-service.ts`(`listSupportCasesForRequester` 에 status·cursor 옵션 — 관리자 목록 함수 `:778` 불변), `app/(main)/mypage/support-history/page.tsx`(fallback 스켈레톤).

---

### 1.6 S64 이전 문의 보관함 — 판정: 유지 (현재 감사 판정: PASS)

- **경로 / 진입 메뉴:** `/mypage/inquiries`(+`[threadId]`), `/mypage/inbox`(+`[threadId]`) → `MypageCsOwnerCareBridgeSuspense`(사장님이면 사장님 상담으로 replace, 아니면 `MemberCsNoteListClient`/`MemberCsNoteThreadClient`). 허브 "이전 문의 기록" 행.
- **구조·콘텐츠 순서:** 현행 유지 — 상단 "이전 문의 보관함 — 새 문의는 고객센터" 안내(`support_legacy_archive_hint`) → 스레드 목록(읽기 전용, 작성 없음 `MemberCsNoteListClient.tsx:54`) → 행별 [보관].
- **표시:** 스레드 제목·마지막 시각(`toLocaleString` `:253` → `formatMypageDate`).
- **컴포넌트·토큰:** `MyScreen`, `MyRow`, `MyStateView`, 기존 `MobileConfirmBottomSheet`(보관 확인 `:283-299` 이미 있음). `CC_*` 상수 토큰화는 S60 상수 파일 변경으로 자동 반영.
- **CTA:** 행 [보관] → 확인 시트 → `PATCH /api/me/admin-notes/[threadId]`(`archive:true`) — 현행.
- **시트·모달·확인 흐름:** 현행(확인 시트 있음).
- **데이터·SSOT:** `GET /api/me/admin-notes?kind=inquiry|inbox`(`app/api/me/admin-notes/route.ts:22-26`, 오류 5xx 정상) · 새 작성 `POST` = 410(`:38`) 유지.
- **로딩 · 빈 · 오류+재시도:** 로딩 "불러오는 중"(`:220-221`) → 스켈레톤 4행. 오류 = 내부 코드 비노출 문구 + [다시 시도] 현행(`:150-160, 222-227`). 빈 = 현행 문구.
- **전환·복원:** 우→좌 300ms, 뒤로 = 허브(`?from=`). 스레드 → 목록 복귀 시 스크롤 복원.
- **모바일·태블릿:** 1열 최대 40rem.
- **성능·캐시:** 사장님 판별 `fetchMeStoresListDeduped` 1회(중복 제거) + 목록 1회. 판별 대기 중 `MainFeedRouteLoading` → 목록 모양 스켈레톤으로 교체.
- **보존 조건:** **Customer Communication HARD LOCK**(`MypageCsOwnerCareBridge.tsx:14-17` — 사장님은 사장님 상담으로, 비사장님은 `/mypage/inbox|inquiries` 유지), 벨 딥링크 `/mypage/inquiries/{id}`·`/mypage/inbox/{id}`(고객센터 SSOT `:47-49`), 작성 410.
- **현재와의 차이:** 스켈레톤·날짜 포맷·hex(공유 상수)뿐. 기능 차이 없음.
- **완료 검증:** 캡처 1장(목록) + 사장님 계정 리다이렉트 회귀 1회 + 날짜 포맷 단위.
- **영향 파일:** `components/mypage/cs/MemberCsNoteListClient.tsx`, `components/mypage/cs/MemberCsNoteThreadClient.tsx`(날짜·스켈레톤만), `components/mypage/cs/MypageCsOwnerCareBridge.tsx`(fallback 스켈레톤만).

---

### 1.7 S65 약관 및 정책 허브 — 판정: 수정 (현재 감사 판정: FAIL) — K9 적용

- **경로 / 진입 메뉴:** `/mypage/section/settings/terms`(`MyPageItemScreen.tsx:198-209`, `MyPageItemRouteClient` 경유) · 홈 정책 그룹 "약관"(`mypage-home-menu-config.ts:246-251`). **홈의 개인정보(`/privacy` `:255`)·사업자정보(`/business-info` `:260`) 행은 그대로 유지**(보존표 `:27-29`, v2.1 S51·§5.1 그룹 8).
- **구조·콘텐츠 순서:** T5 허브 1그룹 3행: ① 이용약관 → `/terms` ② 개인정보처리방침 → `/privacy` ③ 사업자 정보 → `/business-info`. 각 행 오른쪽 값 = 문서 `version`(약관·개인정보, 있을 때만). "기타 문서" 행 없음(DB kind 2종 — K9).
- **표시:** 행 제목 = CMS `title`(없으면 i18n 기본값), 오른쪽 = `version` 메타 12px. 시행일 = `formatMypageDate(effective_at)` 보조 줄(있을 때만).
- **컴포넌트·토큰:** `MyScreen`, `MyGroup`, `MyRow`(kind=link, value). 현재 박스 카드(`rounded-ui-rect border … p-4 sm:p-6`)·밑줄 링크(`text-signature underline`) 제거(v2 §7.2).
- **CTA:** 행 = 이동만(T5). 외부 브라우저 아님 — 같은 앱 내 push.
- **시트·모달·확인 흐름:** 없음.
- **데이터·SSOT:** 약관·개인정보 = `app_legal_documents`(`GET /api/legal/[kind]?locale=`, `app/api/legal/[kind]/route.ts:21-66`, 오류 500/503 정상) — 허브는 제목·버전만 필요하므로 **신규 API 없이** `/api/legal/terms`·`/api/legal/privacy` 2회 병렬(또는 서버 `loadPublishedAppLegalDocument` `lib/legal/load-published-legal-document.ts:16`). 사업자 = `app_platform_business_info`(`/api/business-info`) — 허브 행에는 값 불필요(조회 생략).
- **로딩 · 빈 · 오류+재시도:** 행 3개는 즉시 표시(제목 i18n 기본값), 버전 칸만 작은 스켈레톤 → 실패 시 버전 칸 비움(행 이동은 가능 — 목적지 화면이 자체 오류 처리). 빈 상태 없음.
- **전환·복원:** 홈 → 허브 우→좌 300ms, 허브 → 문서 동일, 뒤로 반대. `?from=customer-center` 진입 시 뒤로 = 허브(`MyPageItemRouteClient.tsx:35-38` 현행 유지).
- **모바일·태블릿:** 1열 최대 40rem(현재 `max-w-[40rem] md:max-w-[48rem]` → 40rem 통일).
- **성능·캐시:** **내정보 전체 데이터 대기 제거** — 현재 `MyPageItemRouteClient` 가 프로필·매장·CMS 전체 로드 후 렌더(`:76-97`). 허브는 데이터 의존 0이므로 R7 에서 정적 경로로 분리(`loadMypageServerShell`). 버전 조회 2건은 `runSingleFlight` + 세션 캐시.
- **보존 조건:** 경로 `settings/terms` 유지(보존표 `terms | settings/terms | MOVE`), `/terms`·`/privacy`·`/business-info` 공개 경로·비회원 접근 유지(보존표 `public`), Legal CMS LOCK(Slice 8 Phase 1·2 `SLICE8-CMS-STATUS.md`) — 읽기만, 동의 버전 해석(`resolve-required-consent-versions`) 불변.
- **현재와의 차이:** 허브 아님 — 문단 1(`mypage_comp_settings_terms_p1`) + `/terms` 링크 1(`MyPageItemScreen.tsx:198-209`). 전체 데이터 대기.
- **완료 검증:** 캡처: 허브 3행(폰·태블릿). 단위: 3행 순서·링크 스냅샷, 법무 API 실패 시 행 유지. 회귀: 홈 정책 그룹 3행 그대로(메뉴 스냅샷), 비로그인 `/terms` 열림.
- **영향 파일:** `components/mypage/MyPageItemScreen.tsx`(terms 분기 → 새 허브 컴포넌트 `components/mypage/settings/MyPolicyHub.tsx` 신규 1개), i18n 내정보 카탈로그(키 추가), (R7) `components/mypage/MyPageItemRouteClient.tsx` 정적 항목 분기.

---

## 2. API 표 — 내정보 전체(설계가 추가·변경하는 것)

공통 계약: 성공 `200 {ok:true,…}` · 인증 `401`(→ 로그인, 복귀 경로 유지) · 입력 `400` · 권한 `403` · 없음 `404` · 충돌 `409` · 서비스/테이블 없음 `503` · 그 외 `500`. **실패를 빈 배열·0 성공으로 응답 금지**(v2 §7.7, v2.1 §8). 오류 본문 `{ok:false,error:"<코드>"}` — 화면은 코드를 i18n 문구로 바꿔 표시(원문 노출 금지). 커서 = 불투명 문자열(`정렬키|id`), 응답 `nextCursor: string|null`. 캐시 = 모든 `/api/me/*` `dynamic="force-dynamic"`, 클라이언트 `cache:"no-store"` + `runSingleFlight` + 화면별 메모리 peek(재진입 즉시 표시 후 갱신).

| # | 메서드·경로 | 파라미터 | 응답 | 원본(SSOT) | 오류 코드 | 캐시 | 소유 도메인·파일 | 상태 |
|---|---|---|---|---|---|---|---|---|
| A1 | `GET /api/me/mypage-summary` | 없음 | `{ok,counts:{salesActive,tradeChatUnread,favorites,offersReceivedPending,communityPosts,storeOrdersActive,coupons,giftCertificates,adsActive},points:{balance\|null}}` — **항목별 실패는 그 값만 `null`**(화면은 비움, 포인트만 "—"), 전체 0 대체 금지 | 각 목적지 API 와 **같은 서버 함수** 호출(아래 열 참조) — 중복 쿼리 작성 금지 | 401 · 503(서비스 없음) · 500(전부 실패) | 서버 렌더 await 금지(콜드부트 계약 `verify:mypage-root-network-contract`), 클라 단일 비행 1회, 홈 재진입 30초 peek | 내정보 · `app/api/me/mypage-summary/route.ts`(신규), 집계 `lib/mypage/mypage-summary.server.ts`(신규) | **신규** |
| A1-a | └ salesActive | — | 판매중 개수 | `/api/my/sales?count_only=1` 의 `loadSalesHistoryRows`(`app/api/my/sales/route.ts:45-62`) | — | — | 거래 | 재사용 |
| A1-b | └ tradeChatUnread | — | 거래 채팅 안읽음 | 메신저 거래 unread 함수(`lib/chat/user-chat-unread-parts.ts` / `lib/messenger/trade/read-unread-badge.ts`) — 하단 탭 뱃지와 같은 값 | — | — | 메신저(읽기만) | 재사용 |
| A1-c | └ favorites / offersReceivedPending | — | 찜 수 / 받은 대기 제안 수(`pending` 만) | `/api/favorites/count` · `/api/offers/received` 와 같은 함수 | — | — | 거래 | 재사용 |
| A1-d | └ communityPosts | — | 내 게시중 글 수 | `listCommunityPostsForUser` count 모드(`lib/community-feed/list-community-posts-for-user.ts:176`) | — | — | 커뮤니티(읽기만) | 변경(count 옵션) |
| A1-e | └ storeOrdersActive | — | 진행중 주문 수 | `/api/me/store-orders?tab_counts=1`(`app/api/me/store-orders/route.ts:152-156`) | — | — | 주문 | 재사용 |
| A1-f | └ coupons / giftCertificates / adsActive | — | 사용 가능 쿠폰 수 / 보유 상품권 수 / 진행 광고 수 | `loadCustomerCouponWalletCards`(`app/api/me/store-coupons/route.ts:20`) · `loadGiftWalletOverviewSummary`(`…/gift-certificates/wallet/route.ts:3,19-25`) · 광고 목록 함수 | — | — | 자산 | 재사용 |
| A2 | `GET /api/me/points` | `filter`,`limit`,`cursor` | `{ok,balance,summary,history{items,nextCursor},expiring}` | `point_ledger` → `profiles.points`(`readUserPointBalanceResult` `lib/points/user-point-ledger.ts:79-89`) | 401·503(`points_service_unavailable`·`points_balance_unavailable`)·500 | no-store | 자산 · `app/api/me/points/route.ts` | **변경**: 소멸 예정 조회 실패를 무시(`:125-139` `if(!expRes.error)` → `expiring` 누락)하지 말고 `expiring:null` + `expiringError:true` 로 명시 |
| A3 | `GET /api/my/posts` | `cursor`,`limit`(기본 20),`status` | `{ok,items,nextCursor,counts}` | `posts` + `seller-listing-state` | 401·500(현재 500 정상 `:22,35`) | no-store | 거래 · `app/api/my/posts/route.ts` | **변경**(커서). **주의:** `MarketplaceSellHubPage.tsx:51` 도 소비 → 파라미터 없으면 기존 응답 형태 유지(하위 호환) |
| A4 | `GET /api/favorites/list` | `cursor`,`limit`,`tab` | `{ok,items,nextCursor}` | `favorites`+`posts` | 401(로그인 이동은 401만 — D11)·500 | no-store | 거래 · `app/api/favorites/list/route.ts` | **변경**(커서, `ok` 추가 — 현재 `{items,authenticated,error}` 500 `:45,63`) |
| A5 | `GET /api/my/received-reviews` · `/api/my/written-reviews` | `cursor`,`limit` | `{ok,items,nextCursor}` | `transaction_reviews` | 401·500 | no-store | 거래 · 각 `route.ts`(현재 `.limit(100)` `:34`) | **변경**(커서) |
| A6 | `GET /api/me/community-activity` | `tab=comments\|likes\|saves\|reports`,`cursor` | `{ok,items,nextCursor}`(탭별) — 기존 전체 응답은 `tab` 없을 때 유지 | 원본 5개 테이블(삭제·숨김 댓글 제외) | 401·500(정상 `:26-30`) | no-store | 내정보 · `app/api/me/community-activity/route.ts`, `lib/mypage/community-activity-load-server.ts`(현재 각 `.limit(20)` `:59-84`) | **변경**(탭·커서) |
| A7 | `GET /api/me/store-orders` | `tab`,`limit`,`cursor`,`tab_counts`,`hub_summary` | 현행 | `get_store_order_detail_snapshot` 등 | 401·503·500 | 현행 | 주문 · `app/api/me/store-orders/route.ts:130-174` | **있음**(커서 이미 구현) |
| A8 | `GET /api/me/community-posts` | `scope=own`,`tab=published\|hidden`,`cursor`,`limit` | `{ok,posts,nextCursor}` — `scope=own` 일 때 **본인 숨김 글 포함** | `community_posts`(본인 행) | 401·500 | no-store | 커뮤니티 · `app/api/me/community-posts/route.ts`(현재 limit 기본 5·최대 20, 커서·scope 없음 `:12-14`) | **변경** |
| A9 | `DELETE /api/community/posts/[postId]/like` | — | `{ok:true,liked:false}` | `community_post_likes` 본인 행 | 401·404(행 없음은 200 멱등)·500 | — | 커뮤니티 · `app/api/community/posts/[postId]/like/route.ts` | **신규 분기**. 현재 POST 토글만(`:41`), 공개 여부 게이트(`:28-31`)가 숨김 글 해제를 404 로 막음 → DELETE 는 **공개 여부·차단과 무관하게 본인 행 삭제**(v2 D12). POST 규칙 불변 |
| A10 | `DELETE /api/community/posts/[postId]/save` | — | `{ok:true,saved:false}` | `community_post_saves` 본인 행 | 401·503(`migration_required`)·500 | — | 커뮤니티 · `…/save/route.ts`(POST 토글만 `:11`, 게이트 `:29-31`) | **신규 분기** |
| A11 | `GET /api/me/trust/events` | `cursor`,`limit`(기본 20) | `{ok,items:[{type,deltaLabel,occurredAt}],nextCursor}` — 본인 이벤트만, 상대 식별정보 제외 | `trust_events`(`supabase/migrations/20260808145000_manner_battery_trust_ssot.sql:6`) | 401·503·500 | no-store | 신뢰 · `app/api/me/trust/events/route.ts`(신규) | **신규**(v2 §10.2) — S02 화면에서 쓰는지는 S02 파트 결정, API 계약만 고정 |
| A12 | `GET /api/me/settings/notices` | `content_type`,`q`,`cursor`,`limit`(기본 20) | `{ok,notices,nextCursor,source}` | `app_notices` | 401·**503**(서비스 없음·테이블 없음 — 현재 `ok:true` 빈 배열 `:28-30,47-50`)·500 | no-store, 클라 첫 페이지 peek | 고객센터 · `app/api/me/settings/notices/route.ts` | **변경** |
| A13 | `GET /api/me/settings/notices/[noticeId]/comments` | `cursor`,`limit` | 현행 | `customer_center_comments` | 401·400·503·**500**(현재 DB 오류 시 `ok:true` 빈 배열 `:50-57`) | no-store | 고객센터 · `…/comments/route.ts` | **변경** |
| A14 | `GET /api/support/cases` | `audience`,`storeId`,`status=active\|done`,`cursor`,`limit` | `{ok,cases,nextCursor,counts?}` | `support_cases` | 401·503·500(정상) | no-store | 지원 · `app/api/support/cases/route.ts`, `listSupportCasesForRequester` | **변경**(status·커서 — OWNER 기본 동작 불변) |
| A15 | `GET /api/me/auth-providers` | — | 현행 | `user_auth_identities` | 401·501·**500**(현재 조회 예외 미처리 `:19`) | no-store | 인증(읽기) · `app/api/me/auth-providers/route.ts` | **변경**(try/catch) |
| A16 | `DELETE /api/me/auth-providers/[provider]` | — | 현행 | 같음 | 400·409(`last_provider_unlink_blocked`)·501 | — | 인증 | **있음** |
| A17 | `GET /api/legal/[kind]` | `locale` | 현행 | `app_legal_documents` | 400·503·500(정상) | — | 정책 CMS | **있음**(S65 허브 재사용) |
| A18 | `GET/DELETE /api/me/recent-views` | `postId`(DELETE 개별, 없으면 전체) | 현행 | `trade_post_recent_views`(M3) | 401·503·500(정상 `:14-31`) | no-store | 내정보 | **있음** |
| A19 | `POST /api/offers/[id]/withdraw` | — | 현행 | `price_offers`(M4) | 401·403·409·500 | — | 거래 | **있음**(`app/api/offers/[id]/withdraw/route.ts`) |
| A20 | `GET /api/me/benefits` | — | `{ok,memberType,policies}` | `member_benefit_policies` | 401·503·500(정상 `:19-38`) | no-store | 자산 | **있음** |
| A21 | `PATCH /api/me/profile` · 공개 프로필 3곳 | — | 현행 | `profiles` | 400(사진 경로) 등 | — | 프로필 | **있음**(PR-1 D1·D3·D20 반영 — 이 파트 변경 없음) |

---

## 3. 데이터 SSOT 표 — 표시 데이터별 단일 기준

| 데이터 | 단일 기준(함수/테이블) | 쓰는 화면 | 현재 위반 → 수정 |
|---|---|---|---|
| 표시 이름(본인) | `profiles.nickname` → `resolveMypageSelfDisplayName`(`lib/mypage/mypage-self-display-name.ts:9-19`) | 홈 프로필(`lib/mypage/mypage-home-store.ts:76`), 계정(`MyAccountContent.tsx:152`), 사이드바, 본인 프로필 뷰 | 공용 `resolveDisplayName` 은 아직 `display_name` 우선(`lib/users/user-label.ts:32-46`) → 내정보 화면은 반드시 `resolveMypageSelfDisplayName` 만 사용(직접 `resolveDisplayName` 호출 grep 0). 공용 함수 순서 변경은 v2.1 C-11·M2 후(관리자 소비자 있음) |
| 표시 이름(타인) | `profiles.nickname` (`lib/users/public-member-identity.ts`) | 관심/차단/숨김, 후기, 제안 | 변경 없음 |
| 아바타 | `profiles.avatar_url`(쓰기 = `PATCH /api/me/profile` + M1a 트리거) | 홈(`mypage-home-store.ts:77` → `MypageProfileSummary.tsx:84`), 프로필 편집 시트(K1) | 없음 |
| 매너 배터리 | `member_trust_snapshots.manner_battery_percent` → `readMemberMannerBattery`(`lib/trust/member-trust-read.ts:17-32`) → `buildMemberTrustSurface`(`lib/trust/member-trust-surface.ts:45`) | 홈(`MypageProfileSummary.tsx:60-63`), `/mypage/trust`, 공개 프로필, 채팅 | `section/settings/manner` 임베드가 **다른 원본**(`getHydrationSafeCurrentUser().temperature` + `mannerRawToPercent`, `MyPageItemScreen.tsx:236-239`) → v2 D15 대로 `/mypage/trust` 리다이렉트, 임베드 삭제 |
| 포인트 잔액 | `point_ledger` 합 → `profiles.points` → `readUserPointBalanceResult`(`user-point-ledger.ts:79-89`) → `GET /api/me/points` → `useUserPointBalance` → `CurrencyAmount` | 홈 자산·S40·S43·고객센터 허브·A1 | 고객센터 허브 `balance.toLocaleString(...)`(`CustomerCenterHubClient.tsx:115-119`) → `CurrencyAmount`. `useUserPointBalance` 초기값 0(`hooks/useUserPointBalance.ts:25`) — 화면은 `loading` 동안 값을 그리지 않을 것(0 노출 금지). `readUserPointBalance`(실패→0, `:94-100`)는 표시용 사용 금지(grep 확인) |
| 소멸 예정 포인트 | `computeExpiringPointsFromLedger`(`app/api/me/points/route.ts:125-139`) | S40 줄·S42 | 조회 실패 무시 → A2 대로 `expiring:null` 명시 |
| 쿠폰 수 | `loadCustomerCouponWalletCards`(tab=available) | 홈 자산 바·S44·A1 | 홈 값 없음(A1 신설) |
| 상품권 수 | `loadGiftWalletOverviewSummary`(`/api/me/gift-certificates/wallet?summary=1`) | 홈·S45·A1 | 홈 값 없음(A1) |
| 상품권·주문 금액(₱) | `formatMoneyPhp`(`lib/utils/format.ts:39`) | S30·S31·S32·S45 | `₱` 직접 조합·`toLocaleString` 금지(v2 §7.9) — grep 확인 |
| 주문 상태 문구 | `store-order-process-model.processStatusLabel(status, fulfillment, "buyer")`(`lib/stores/store-order-process-model.ts:201`) ← 래퍼 `buyerOrderStatusLabel(status, lang, fulfillment)`(`lib/stores/buyer-order-status-labels.ts:26-31`) | S30 목록(`MyStoreOrdersView.tsx:139,381`), S31 상세(`MyStoreOrderDetailView.tsx:518`), 주문 채팅, 배달 도메인 목록 | **수령 방식 누락:** 상세의 시드(주문 직후) 화면이 `buyerOrderStatusLabel(seed.order_status, language)`(`MyStoreOrderDetailView.tsx:424`) — 3번째 인자 없음 → 기본값 `local_delivery`(`buyer-order-status-labels.ts:29`)로 **픽업 주문도 배달 문구**. 원인: 시드 타입에 `fulfillment_type` 없음(`lib/stores/store-order-detail-seed-cache.ts:10-23`). 수정: 시드에 `fulfillment_type` 추가 → 작성처 `buildStoreOrderDetailSeedFromPostSuccess`(호출 `components/stores/StoreCommerceCartPageClient.tsx:1696-1709`, **매장 도메인 파일** — 1필드 전달만) → `:424` 에 전달. 시드에 값이 없으면(구 세션 캐시) 상태 문구 대신 수령 방식 중립 문구 |
| 주문 상태 — 중복 표 | 위 단일 함수만 | — | **사용처 0 삭제:** `lib/mypage/mypage-comp-store-order-labels.ts` 전체(import 0 — grep 결과 없음), `lib/mypage/store-order-detail-i18n.ts` 의 `buyerOrderStatusLabels`(`:53-66`)·`fulfillLabels`(`:68-74`)(같은 파일 다른 함수는 상세 `:55-61`·확장 패널 `MyStoreOrderExpandPanel.tsx:31-34` 가 사용 → 파일 유지) |
| 수령 방식 문구 | `buyerFulfillmentLabel`(`lib/mypage/store-order-detail-i18n.ts:7`) | S31 | 매장 도메인 `StoreCommerceOrderDetailClient.tsx:55` 에 같은 이름 로컬 함수 중복 — 범위 밖, 보고만 |
| 판매 상태 | `seller-listing-state` | S20·A1-a | S20 파트 |
| 회원 혜택 | `member_benefit_policies` → `GET /api/me/benefits` | S47·홈 행 표시 조건 | 없음 |
| 고객 상담 상태 | `supportCaseStatusLabelMeta`(`lib/support/support-status-label.ts:18-37`) | S63·Support 모달 | 탭 분류도 이 함수 판정을 따름(§1.5) |
| 공지·게시판 | `app_notices`(`APP_NOTICES_CONTENT_SELECT` `lib/notices/customer-center-content.ts:66-67`) | S61·S62·벨 | API 빈 성공 2곳(A12) |
| 약관·개인정보 | `app_legal_documents`(kind 2종) | S65·`/terms`·`/privacy`·동의 | 없음 |
| 사업자 정보 | `app_platform_business_info`(`/api/business-info`) | `/business-info` | 없음 |
| 연동 로그인 | `user_auth_identities` | S53·S03 | 조회 실패=빈 목록(§1.1) |
| 홈 오른쪽 숫자 | A1 = 목적지 함수 | 홈 | `MyPageOverviewCounts` 는 `purchases·sales·storeAttention` 3개뿐(`components/mypage/types.ts:13-17`) → A1 응답 타입으로 대체(홈 행에 값 전달 `MyInfoHomeMenuSections.tsx:79-107`) |
| 날짜 | **`formatMypageDate`(신규 `lib/mypage/format-mypage-date.ts` — 현재 파일 없음)** — 회원 언어 locale, 상대시간은 `formatRelativeTimeAgo`(`lib/i18n/format-relative-time.ts:6`) 위임 | 내정보 전 화면 | 내정보 경로에 `toLocaleString`/`toLocaleDateString` **40곳**(`components/mypage`·`components/my`·`app/(main)/mypage` grep). 이 파트 해당: `CustomerCenterBoardListClient.tsx:131-138`, `CustomerCenterBoardDetailClient.tsx:154-159`, `CustomerCenterCommentsPanel.tsx:77-80`, `SupportCasesHistoryList.tsx:145`, `MemberCsNoteListClient.tsx:253`, `MyStoreOrderDetailView.tsx:435`(`toLocaleString(dateLocale)`). 기존 `lib/mypage/format-trade-datetime.ts` 는 거래 목록 전용 — `formatMypageDate` 로 흡수 여부는 구현 시 사용처 확인 |

---

## 4. 기존 기능 보존 표

근거: `LEGACY-IA-FEATURE-PRESERVATION.md`(보존표), `LEGACY-IA-PHASE1-CONTRACT.md`, `08-HARDLOCK.md`, `03-NAVIGATION.md`, `app-customer-center-ssot.md`, `lib/mypage/mypage-authority-contract.ts`, AGENTS.md(마켓 UI-6·메신저 경계), 00-brief.

| 보존 대상 (보존표 key / 계약) | 경로·위치 | 계획에서 지키는 방법 |
|---|---|---|
| trade active · purchases · favorites · offers · recent · reviews (KEEP, activity) | `/mypage/trade/sales`·구매(거래 허브)·찜·`/mypage/offers`·최근 본·후기 | 경로 유지, 홈 활동 그룹 순서 유지(v2.1 §5.1). **S21 구매 내역 실제 화면 재도입 안 함(K7, 마켓 UI-6 HARD LOCK — `/mypage/products` = 내 판매물품, 구매 목록 재도입 금지)**. A3 커서는 `MarketplaceSellHubPage` 하위 호환 |
| store register · store orders (KEEP) | `/stores/owner/apply`·`/mypage/store-orders` | 권한별 행(`resolveMypageHomeStoreOwnerEntry`) 불변, 주문 상태 문구 SSOT 통일(§3), 배달 도메인 공유 컴포넌트 회귀 테스트 |
| rider (KEEP, store_order) | `store/rider` | v2.1 §5.1 "배달K 라이더(계약 유지)" — v2 의 제거안 미적용 |
| points card (MOVE after store) | 자산 그룹 | 위치 유지, 값 = `CurrencyAmount`·실패 "—" |
| account · addresses · payment · security · notifications (KEEP) | 각 경로 | 경로 유지. payment = 일반 회원 문구 정정만(C-5). security = 기기 권한 + 연동 로그인 그룹(K10) |
| language (toggle KEEP) | 홈 행 | K4: 토글 유지 + 현재 값 표시 |
| region/country (KEEP) · 읽는 기능 없는 설정 3종 | `settings/country`·`video-autoplay`·`personalization` | C-4 개정 반영 행(보존표 `:20`): 경로·데이터·레지스트리 KEEP, 홈 행만 HIDE |
| service rows (KEEP) | `settings/*` | 관심·차단·숨김·지역 일괄변경·채팅·캐시·버전 유지(S14·S16·S17·S18) |
| notices (KEEP, support) | `section/settings/notices` → `/mypage/customer-center/notice` | 리다이렉트 유지, 게시판 개선(S61) |
| CS (KEEP) | `/mypage/customer-center` | 허브 항목 유지 **포함 포인트·충전(K8)**, 시트화 금지, `?from=customer-center` 복귀 |
| inquiries · inbox (KEEP) | `/mypage/inquiries`·`/mypage/inbox`(+thread) | 읽기 전용 보관함 유지(S64), 작성 410 유지, 사장님 강제 이동(Customer Communication HARD LOCK `MypageCsOwnerCareBridge.tsx:14-17`) |
| 벨 딥링크 | `/mypage/notices/{id}`·`/mypage/inquiries/{id}`·`/mypage/inbox/{id}` | 경로 유지(K11), 공지는 같은 상세 컴포넌트로 통일 |
| terms (MOVE to policy) · privacy · business (MOVE, public) | `settings/terms`·`/privacy`·`/business-info` | 홈 3행 유지 + `settings/terms` 를 3행 허브로(K9). 공개 경로·비회원 접근 불변, Legal/Business CMS LOCK(Slice 8) 읽기만 |
| leave (MOVE to danger) | `settings/leave` | S19 — 경로·`/api/me/leave-request` 유지 |
| logout (modal menu_row) | 홈 위험 그룹 | 확인 = modal 만(`MYPAGE_LOGOUT_PUSH_CONFIRM_PATHS` `/mypage/logout`·`/my/logout` → 홈 리다이렉트 유지), 변형 `danger_button\|menu_row` 만(`mypage-authority-contract.ts:17-38`), 비로그인 숨김 |
| required complete card (UI hide) · required incomplete (KEEP compact) | 홈 프로필 아래 | 완료 시 숨김, 미완료 항목만 인라인(IA 계약 §2) — 홈 파트 |
| 메뉴 순서 9그룹 | 홈 | identity→activity→store_order→assets→account→service→support→policy→danger(IA 계약 §1). 관리자 위치는 K5 결정 따름 |
| 반응형 1열 | 전 화면 | 태블릿·데스크톱도 1열·가운데·2열 메뉴 카탈로그 금지(IA 계약 §3). 고객센터 게시판 3칸은 메뉴 카탈로그 아닌 기존 진입 버튼(현행 유지) |
| Motion Contract | 전 화면 | push/back 300 · modal 200 · sheet 280(프로필 편집 — K1) · toast 220 · 스켈레톤 첫 페인트(`MYPAGE_MOTION_MS`). 내정보 경로 규칙만 추가(K2), 다른 도메인 전환 불변 |
| CTA 종류 6종 | 전 화면 | Primary·Secondary·Danger·Inline·Icon·Context 외 신규 종류 금지(`03-NAVIGATION.md` CTA Authority) — 이 파트 CTA 는 모두 기존 종류 |
| 더블탭 내정보 → 맨 위 | 하단 탭 | `isMypageDomainHubPath` 불변 |
| 스크롤 복원 | 홈·목록 | K3: 전역 `scrollRestoration="manual"` 유지, 화면별 복원만 추가 |
| 콜드부트 계약 | 홈 | A1 서버 렌더 await 금지, `verify:mypage-root-network-contract` 통과 |
| 계약 테스트·스크립트 | — | `verify:mypage-authority-contract`, `verify:mypage-legacy-render-ban`, `mypage-hub-scroll-restore.test.ts`, `verify:routes`, `admin-member-ops-ux-contract.test.ts` 매 PR |
| 공용 CSS·토큰 | `app/design-tokens.css`·`app/samarket-components.css` | 추가만(v2.1 §3.1·§3.3), 기존 선택자·값 변경 0 — 관리자·거래·배달·메신저 화면 변화 0 |
| 공유 컴포넌트 | `SupportCasesHistoryList`(사장님 고객센터), `MyStoreOrdersView`(배달 주문), `FavoriteProductsView`(홈 거래내역 시트), `MySubpageHeader`(46곳) | prop 으로만 확장·API 불변, 해당 타 화면 회귀 확인 |
| 채팅 3종 경계 | 메신저 | 내정보에서 네 번째 채팅 표현 금지, 거래 채팅 안읽음은 메신저 함수 읽기만(A1-b) |
| 매장 정산 SSOT | 결제정보 행 | 주문자 문구에 정산·캐시 금지(C-5), 수수료 TS 쓰기 0 |
| 삭제 = 0 원칙 | 전체 | "writer clone = 0 · route clone = 0"(보존표 `:36`). 이 파트의 삭제는 **사용처 0 확인된 코드만**(`mypage-comp-store-order-labels.ts`, `store-order-detail-i18n.ts` 미사용 2함수, `NoticeDetailPageClient` 는 K11 통일 후 사용처 0일 때만) |
