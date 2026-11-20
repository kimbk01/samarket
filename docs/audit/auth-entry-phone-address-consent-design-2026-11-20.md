# 회원 가입 = 동의 + 전화 인증 + 대표 주소 — 감사·수정 설계 v3 (2026-11-20)

상태: **v3 승인(Owner 2026-11-20 「승인, 구현 진행」) → 구현 PR (`feat/registration-phone-address`). 배포 전 보고 · Owner 「병합」 뒤 병합.** (v1·v2 는 같은 파일을 덮어씀)

구현 중 설계 대비 정한 것 (설계 범위 안):
- 라우트 서버 게이트(19곳)는 대표 주소 DB 확인을 **기존 4개 행동만** 유지(`SERVER_ROUTE_ADDRESS_CHECK_ACTIONS`) — 메시지 전송 등 다른 행동은 중앙 쓰기 게이트가 같은 DB 함수 1회로 집행 → 라우트 조회 수·통화 API 불변.
- 가입 검사 예외는 동의 예외 + 정확 경로 목록(`lib/auth/member-registration-mutation-policy.ts`): 통화 API 전체·기존 매장 운영·진행 중 거래/제안/모임 관리·설정·결제 완료 확인·계측.
- 세션당 1회 안내의 팝업 표식(`addressGate`)은 기존 의미(대표 주소 없음) 그대로.
조회 조건: 저장소 `main` HEAD `e4d4679bc` 코드 직접 읽음 · 운영 DB `ckdosyydvgzqwpbwuhon` 읽기 전용 조회(2026-11-20 PHT).

## 0. Owner 지시 원문 (2026-11-20)

1차: 「auth 첫 진입시 전화 번호, 주소 입력 - 동의 화면 … 인증 안된 부분은 로그인시 인증 … 동의 화면 형식 … 내정보에서 지금 처럼 변경도 가능」
2차: 「회원 가입시 해당 회원의 정보를 입력 하는 시스템 … 순서 … 너의 권장 사항을 따른다 … 남은 위험이 없도록 … 내정보 변경은 기존 유지 … 전화 번호, 주소를 입력 해야 가입 되어야 한다는 목적」
3차: 「비로그인 회원도 앱을 볼수는 있는 부분이다, 글쓰기 주문 채팅 부분이 안되는 부분이고 로그인을 유도 하는 부분이지. **앱을 사용 못하게 하는 부분은 원하지 않는** 부분이다 **읽기는 가능** … 계약을 확인 해라」

4차: 「지금 의 한국 필리만 되는 전화, 주소 인증 방법은 결함이 없는 한 변경을 원하지 않는 부분이다」 → 전화 인증(필리핀 Semaphore·한국 Solapi)·주소 등록 방법은 **바꾸지 않고 그대로 재사용**한다. v3 초안의 「주소 시/군 직접 선택」 추가는 결함 증거가 없어 **삭제**(§4-6).

v2 정정: v2 §3-3 ②「가입 완료 전에는 앱 사용 불가(모든 화면 이동 시 단계 화면으로 강제)」는 **3차 지시와 계약에 어긋난다** → v3 에서 폐기.

## 1. 확인한 계약 (열람 vs 행동)

| 계약 | 내용 | 근거 |
|---|---|---|
| 비회원 열람 | 홈·필라이프/커뮤니티·마켓·상품·매장 목록 등 공개 화면은 비회원도 열람. 글쓰기·내 활동 화면만 차단 | `lib/auth/guest-browse-access-policy.ts` `isGuestPublicBrowsePath` |
| 비회원 행동 → 로그인 유도 | 글쓰기·댓글·좋아요·채팅·주문·통화 등 버튼 → `requireAuthAction` → 로그인 시트 | `lib/auth/require-auth-action.ts` (`DIBAY_LOGIN_REQUIRED_EVENT`) |
| 로그인 회원 행동 → 부족 정보 유도 | 같은 `requireAuthAction` 안에서 ① 미동의 → 동의 화면 ② 행동별 필요 정보(전화·주소·표시 이름) 부족 → 안내 창(`MissingProfileInfoModal`) → 해당 입력 화면 → 원래 화면 복귀 | `require-auth-action.ts`, `lib/profile/profile-requirements.ts` `ACTION_PROFILE_REQUIREMENTS`, `components/profile/MissingProfileInfoModal.tsx` |
| 서버 행동 게이트 | 19개 라우트가 같은 행동표로 서버에서도 검사(`requireProfileCompletion` 서버판). 중앙 쓰기 게이트는 동의만 검사 | `lib/profile/require-profile-completion.server.ts` 사용처 19곳, `lib/auth/enforce-api-member-mutation-policy.ts:197` |
| 로그인 직후 필수정보 안내 | 대표 주소 없으면 **로그인 세션당 1회** 내정보로 이동, 이후 열람 자유 (Owner 11-09) | `components/addresses/MandatoryAddressGate.tsx` |
| 미동의 로그인 회원 | 공개 화면이라도 동의 화면으로 보냄 (P2-1 SG-05, 2026-10-21 인증 감사). 동의 화면에 [로그아웃] 있음 → 로그아웃하면 비회원으로 열람 가능 | `components/auth/DibaySignupGate.tsx`, `docs/dibay-auth-full-audit-ssot-design-2026-10-21.md:211` |
| 동의 전 전화 인증 = 결함 | 「미동의 사용자가 메신저 액션에서 전화 OTP(개인정보 입력·SMS)를 동의보다 먼저 진행」을 결함 P2-2(SG-06)로 기록·수정 | 같은 문서 :212 |

**결론**: 이 앱의 계약은 「**열람은 열어 두고, 행동할 때 필요한 단계(로그인 → 동의 → 정보)로 유도**」다. 이번 변경은 이 구조를 그대로 쓰고, 「행동에 필요한 정보」를 **가입 조건(전화 + 대표 주소)** 으로 통일하는 것이다.

## 2. 순서 — 약관 동의 → 전화 인증 → 대표 주소 (2차 지시로 작업자 권장안 채택)

- 필리핀 개인정보보호법(RA 10173) §3(b): 동의는 「알고 하는」 의사 표시 → 전화번호를 SMS 업체로 보내기 전에 처리방침 동의가 먼저.
- 만 14세 확인(생년월일)이 동의 화면에 있음 → 14세 미만 번호·주소를 먼저 받지 않음.
- 이 앱은 이미 「동의 전 전화 OTP」를 결함(SG-06)으로 판정했다.
- 당근은 전화번호가 로그인 수단이라 인증이 먼저이고 동네는 나중(공개 자료 기준, 실측 아님). DIBAY 는 SNS 로그인으로 계정이 먼저 생기므로 「동의 → 정보 입력」, 주소(동네)가 마지막인 점은 같다.

## 3. 회원 상태 3단계 (새 정의)

| 상태 | 조건 | 열람 | 글쓰기·댓글·좋아요·채팅·주문·통화 걸기·친구 추가 |
|---|---|---|---|
| 비회원 | 로그인 안 함 | 공개 화면 (지금 그대로) | 로그인 시트 (지금 그대로) |
| **가입 진행 중** (신규) | 로그인 + (동의·전화·대표 주소 중 하나라도 없음) | **회원과 같게 열람** — 공개 화면 + 내 채팅 기록·내정보 등 본인 화면 읽기 | 「가입 이어하기」 안내 → 빠진 단계 화면 → 끝나면 원래 화면으로 돌아와 그 행동 이어서 |
| 회원 (가입 완료) | 동의 + 전화 인증 + 대표 주소 | 전체 | 전체 (행동별 추가 요구는 표시 이름 등 기존 그대로) |

- 미동의 회원은 지금 계약(P2-1) 그대로 동의 화면으로 간다(로그아웃하면 비회원 열람). 동의는 개인정보 처리의 법적 전제라 이 부분은 바꾸지 않는다 — §6 C-2 확인.
- 특권 관리자는 지금처럼 전부 면제. 관리자 생성 계정(`admin_manual`)은 지금처럼 전화 인증으로 인정.

## 4. 수정 설계

### 4-1. 판정 단일 정의

신규 `lib/auth/dibay-registration-steps.ts`:
```
REGISTRATION_STEP_ORDER = ["terms", "phone", "address"]
nextRegistrationStep(facts) → 첫 미완료 단계 | null
  terms   = !consentComplete   (기존 hasStoreTermsConsent)
  phone   = !phoneVerified     (기존 hasVerifiedPhone)
  address = !addressComplete   (기존 is_active AND is_default_master)
registrationComplete = (nextRegistrationStep === null)
```
- `getOnboardingStatus`·`/api/me/signup-status` 응답에 `registrationComplete`·`nextStep` 추가. 같은 DB 함수 1회(`member_onboarding_facts`)가 이미 세 값을 읽음 → **추가 조회 0**.
- 기존 `consentComplete`·`signupComplete`(=동의) 의미·이름은 유지 — proxy 동의 게이트·D5 토큰 클레임·재동의 판정이 여기에 묶여 있다.

### 4-2. 가입 화면 (동의 화면과 같은 형식)

| 경로 | 내용 |
|---|---|
| `/auth/onboarding/terms` (기존) | 그대로. 저장 후 이동만 `nextRegistrationStep` 으로 |
| `/auth/onboarding/phone` (신규) | `DibayOnboardingOverlayShell` + 기존 `PhoneVerificationBox surface="overlay"` · 기존 발송·확인 API |
| `/auth/onboarding/address` (신규) | 같은 틀 + 기존 주소 등록 흐름(`/mypage/addresses/search·map·edit`)을 `returnTo` 로 사용 — 새 저장소·API 없음 |

- 전화·주소 화면에 **[나중에 하기]** — 누르면 원래 화면으로 가서 열람 계속(3차 지시 「앱 사용 막지 않음」). 동의 화면은 지금처럼 [로그아웃]·고객센터·탈퇴.
- 각 페이지는 들어올 때 단계를 다시 계산해 맞는 단계로 보냄. `next`(원래 화면·원래 행동)는 끝까지 유지.

### 4-3. 언제 가입 화면이 나오는가

| 시점 | 동작 |
|---|---|
| 신규 가입 (SNS 첫 로그인) | 로그인 직후 서버 목적지 = 동의 → 전화 → 주소 순서대로. **가입 과정에서 정보를 입력하는 흐름**(1·2차 지시). 전화·주소에서 [나중에 하기]를 누르면 가입 진행 중 상태로 열람 |
| 기존 회원 로그인 (빠진 항목 있음) | 로그인 직후 빠진 단계부터 같은 화면 (1차 「로그인시 인증」). [나중에 하기] 가능 |
| 이미 로그인된 채 앱 실행 | 지금의 「세션당 1회 안내」(Owner 11-09)를 그대로 쓰되, 이동 목적지만 내정보 → **빠진 단계 화면**으로, 대상에 **전화 미인증 추가**. 1회 뒤에는 열람 자유 |
| 글쓰기·댓글·좋아요·채팅·주문·통화 걸기·친구 추가 누를 때 | `requireAuthAction` → 가입 진행 중이면 「가입을 마치면 이용할 수 있어요」 안내 → 빠진 단계 화면 → 완료 후 원래 행동 이어서 (지금의 로그인 시트·정보 부족 창과 같은 방식) |

변경 지점:
- 로그인 직후: `resolveDibaySignupRoute`(서버 목적지 — 웹·네이티브·QR 공통), 아이디 로그인 `resolveImmediateLoginTarget` 은 signup-status 응답의 `route` 사용.
- 앱 실행 1회 안내: `MandatoryAddressGate` 의 판정·목적지 교체(호출 API 를 signup-status 로 바꿔 HTTP 수 그대로 — 구현 때 `request-budget` 수치로 확인).
- 행동 시: `ACTION_PROFILE_REQUIREMENTS` 에서 회원 행동(글쓰기·댓글·좋아요·북마크·신고·거래 채팅·구매·메신저 새 채팅·전송·친구 추가·친구 채팅·장바구니·주문·주문 채팅·입점 신청·통화 걸기)의 공통 요구를 `phone_verified + default_address` 로 통일(표시 이름 등 기존 추가 요구는 유지). 안내 창 목적지는 내정보 → 가입 단계 화면으로. 서버판 19개 라우트도 같은 표를 쓰므로 함께 적용.
- `DibaySignupGate`(동의) — 변경 없음.

### 4-4. 서버 최종 방어 (화면을 우회한 쓰기 차단)

- 중앙 쓰기 게이트에 「가입 완료」 검사 추가: 가입 진행 중 회원의 상품 쓰기 → 403 `signup_incomplete` + `step` (기존 코드 재사용 → 구 클라이언트도 동의 화면으로 갔다가 맞는 단계로 다시 이동).
- **읽기 API 는 막지 않는다** (3차 「읽기 가능」).
- 예외 = 지금의 동의 예외 목록 그대로(전화 OTP·주소·프로필 정정·읽음 처리·기기/알림 등록·이미 성립한 주문 이행·취소·환불·신고·차단·고객지원·탈퇴·이미 시작된 통화) + 아래 추가:
  - **통화 API 전체**(시작 포함) — 통화 API 동작 변화 0. 통화 걸기는 화면 행동 게이트(4-3)에서 막힌다.
  - **매장 사장님 운영 API** — 가입 진행 중인 사장님 1명(운영 DB: 매장 소유 17명 중 1명)의 매장 운영이 끊기지 않게. 새 입점 신청은 지금처럼 전화·주소 필요.
- 판정 데이터: DB 함수 `member_write_gate_snapshot` 에 `phone_verified·phone_verified_at·provider·auth_provider·email·has_default_master` 추가(함수 1건 변경) → 쓰기당 추가 조회 0. DB 적용 먼저 → 코드 병합. 필드가 없으면 기존 조회로 한 번 더 읽어 판정(통과로 간주하지 않음).
- proxy HTML 게이트는 동의만 유지(열람은 막지 않으므로 등록 검사 불필요).

### 4-5. 통화 (통화 변경 규정 범위)

통화 코드·통화 API·푸시는 바꾸지 않는다. 열람을 막지 않으므로 통화 화면을 덮는 강제 이동이 없다. 바뀌는 것은 「통화 걸기 버튼」 행동 게이트의 요구 정보(전화 → 전화 + 주소)뿐 → 규정 3번 영향 분석 대상으로 승인받고, 실기에서 가입 진행 중 회원의 수신·수락·종료(변화 없음)와 발신 시 안내를 확인.

### 4-6. 남은 위험 처리

| 위험 | 확인 결과 | 처리 |
|---|---|---|
| 다른 나라 번호 | 필리핀(Semaphore)·한국(Solapi, 11-20 성공) 인증 가능, 그 외 거절 — 인증 방법은 그대로 둔다(4차) | 인증 방법·발송 코드 변경 없음. 가입 화면 안내 문구에 지원 나라 명시 + 「다른 나라 번호」 → 고객센터 → 관리자 수동 인증(기존 기능). 그동안도 **열람은 가능** |
| SMS 장애 | Solapi 실패 8건 실제 발생(마지막 11-09) | 다시 받기·고객센터 안내 + 관리자 수동 인증. 장애 중에도 열람 가능 |
| 중복 번호 | 탈퇴 계정 번호는 지워짐. 번호만 있고 미인증인 5건은 모두 관리자 생성 계정(인증 인정) | 409 안내: 「이미 다른 계정에서 쓰는 번호 · 그 계정으로 로그인 또는 고객센터」 |
| 주소 시(city) 미확정 | 코드상 Google 이 시를 못 주면 저장되지 않는다(`city_required`). 그러나 **실제로 실패한 기록은 찾지 못했다** — 운영 대표 주소 84건 정상 저장(28건은 Google 장소 ID 없이 지도 핀으로 저장). 결함 증거 없음 | 4차 지시대로 **주소 방법 변경 안 함**. 실기 검증에서 주소 단계 저장을 확인하고, 실패가 실제로 나오면 그때 결함으로 보고·별도 승인 |
| 개인정보처리방침 | 전화 = 「인증이 필요한 기능 이용 시」, 주소 = 「주소록에 등록하는 경우」로 적혀 있음 | 「가입 시 필수: 전화번호(인증)·대표 주소」로 새 버전 게시(ko·en) → 기존 회원 재동의(기존 흐름) |
| 스토어 심사 | 비회원 열람 유지 → 계정 없이 둘러보기 요건 유지. 관리자 생성 계정 38명 중 22명 대표 주소 없음 | 배포 전 심사용 아이디 계정의 대표 주소 확인·등록 |
| 기존 회원 쓰기 중단 | 가입 진행 중 회원 92명은 배포 뒤 쓰기 시 가입 단계 안내 | 의도된 변경(2차 지시). 열람·받은 통화·주문 이행은 그대로 |
| 마지막 주소 삭제·관리자 전화 인증 취소 | 가입 진행 중 상태로 돌아감 | 내정보 기능은 그대로. 다음 행동 때 해당 단계 안내 — 정상 동작으로 문서화 |
| 요청 수 | 안내 API 1회 교체·쓰기 게이트 함수 필드 추가 | 구현 때 `lib/perf/request-budget.ts` 로 증감 확인 |

### 4-7. 변경 파일 (예상) · 배포 구분

- 판정: `lib/auth/dibay-registration-steps.ts`(신규) · `dibay-signup-status.ts` · `get-onboarding-status.ts` · `resolve-post-login-route.ts` · `finish-client-auth-login.client.ts` · `app/api/me/signup-status/route.ts`
- 행동 게이트: `lib/profile/profile-requirements.ts` · `lib/auth/require-auth-action.ts` · `components/profile/MissingProfileInfoModal.tsx`
- 화면: `app/auth/onboarding/{terms,phone,address}/page.tsx` · `components/auth/` 신규 2개 · `components/addresses/MandatoryAddressGate.tsx` · `lib/auth/profile-setup-flow.ts`
- 서버: `lib/auth/enforce-api-member-mutation-policy.ts` · `lib/auth/load-member-write-gate-snapshot.ts` · `lib/auth/member-consent-mutation-policy.ts`
- 전화 인증·주소 등록 코드: **변경 없음** (기존 화면·API 재사용만)
- DB: 마이그레이션 1건(`member_write_gate_snapshot` 필드 추가, 표 변경 없음)
- i18n·계약 문서(`auth-account-linking-policy.md` §가입 완료, `dibay-first-entry-legal-consent-ssot.md`, 본 설계서)·테스트
- `[배포 구분]` 웹 + DB 함수 1건. 네이티브 빌드 없음(`android/`·`ios/` 에 온보딩 경로 하드코딩 0건 확인).

### 4-8. 반영 순서

1. Owner 승인 → 2. 개인정보처리방침 새 버전 게시 → 3. DB 함수 운영 적용·확인 → 4. 코드 PR(한 PR) → `ci-ok` → 병합(= 운영 배포) → 5. 실기 검증 → 보고

### 4-9. 검증

- 코드: `typecheck:build`·`typecheck:test`·변경 vitest(판정표: 3단계 × 관리자/관리자 생성 계정, 행동표, 쓰기 게이트 예외)·eslint·`check:i18n-quality`·`verify:routes`·`verify:call-surface-cta-ssot`·주소 계약 테스트.
- 실기(운영, 실행 10회 상한, Android·iPhone): 신규 가입 전 과정 · [나중에 하기] 후 열람 가능 · 가입 진행 중 회원이 글쓰기/채팅/주문 누를 때 안내 → 완료 후 원래 행동 · 비회원 열람·로그인 시트(변화 없음) · 가입 진행 중 회원의 받은 통화 · 주소 단계 저장(필리핀 주소) · 필리핀·한국 번호 인증 · 내정보 변경(기존 동일).

## 5. 운영 DB 수치 (2026-11-20, 탈퇴 2·특권 관리자 2 제외 회원 160명)

전화 인증 없음 56 · 대표 주소 없음 78 · 둘 다 없음 42 · **가입 진행 중이 될 회원 92** · 약관 미동의 27 · 매장 사장님 17명 중 가입 진행 중 1 · 라이더 0 · 최근 60일 SMS: Semaphore 성공 23, Solapi 성공 7·실패 8.

## 6. Owner 승인 필요

- C-1 순서 동의 → 전화 → 주소 (2차 지시로 권장안 채택 — 확인만)
- C-2 미동의 로그인 회원은 지금 계약대로 동의 화면으로 이동(로그아웃 시 비회원 열람) 유지
- C-3 가입 진행 중 회원 = 열람 가능, 회원 행동(글쓰기·댓글·좋아요·채팅·주문·통화 걸기·친구 추가) 불가 → 가입 이어하기 안내 (§3 표)
- C-4 개인정보처리방침 새 버전 게시 → 동의 완료 회원 133명 재동의
- C-5 운영 DB 함수 `member_write_gate_snapshot` 필드 추가 적용
- C-6 심사용 아이디 계정 확인·대표 주소 등록

## 7. 확인하지 못한 것 (NOT_PROVEN)

다른 앱 가입 화면 실측(공개 자료만) · Google 이 시를 못 주는 실제 빈도 · 요청 수 증감 정확한 값(구현 때 측정).

출처: [RA 10173](https://www.privacy.gov.ph/data-privacy-act/) · [IRR of RA 10173](https://privacy.gov.ph/wp-content/uploads/2023/06/IRR_RA-10173-as-amended.pdf) · [당근 클론 개발 기록](https://velog.io/@open_h/React-Native-KiwiMarket-2) · [당근 이용 가이드](https://braindetox.kr/posts/danggeun_market_usage_guide.html)
