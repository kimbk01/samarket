# F4 설계 — 전화 OTP·주소 저장은 동의 뒤 (서버 확인) · 2026-11-27 PHT

- 지시: Owner 「F4 설계 작성」 (2026-11-27)
- 상태: **설계만. 코드·DB 변경 없음.** 승인 뒤 구현한다.
- 근거 코드: 운영 main `cf4fab651` (`git show origin/main:…` 로 읽음)
- 운영 DB: `ckdosyydvgzqwpbwuhon` 읽기 전용 조회 (2026-11-27 오후 PHT), 쓰기 없음
- 실기기·운영 사이트: 열지 않음 (실행 0회)

## 0. 작업자 정정 — 감사 F4 를 잘못 적었음

| 감사에 쓴 것 | 실제 | 근거 |
|---|---|---|
| 「`POST /api/me/phone-verification/send` 가 로그인만 보고 SMS 를 보낸다」 | 앱 화면은 이 경로를 **쓰지 않는다**(호출처 0). 앱이 쓰는 OTP 경로는 **`POST /api/account/phone/send-otp`·`verify-otp`** 다 | `PhoneVerificationBox.tsx:335,396` · `git grep` 결과 |
| 「중앙 게이트에서 동의 예외(`session_identity`)」 | `account/phone/*` 는 그보다 앞 단계인 **회원 상태 예외(EXEMPT)** 라서 중앙 게이트를 **통째로 건너뛴다**. 동의·가입 확인이 아예 돌지 않는다 | `member-action-policy.ts:42-61` · `enforce-api-member-mutation-policy.ts:149-153` |
| 「API 를 직접 부르면 번호가 SMS 업체로 간다」 | **화면으로도 닿는다.** 동의 화면 관문은 프로필 수정·주소 화면을 예외로 둔다. 미동의 회원이 `/mypage/profile/edit` 를 열면 그 화면의 전화 인증 상자가 위 경로로 SMS 를 보낸다(코드 경로 확인). 실기기 재현은 하지 않았다 — 하면 실제 번호로 SMS 가 나간다 | `profile-setup-flow.ts:63-70` · `mypage-mobile-nav-registry.ts:19-25` · `ProfileEditForm.tsx:668` |

판정은 그대로 **FAIL** 이다(계약 C4 B6 위반). 정정 내용은 구현 PR 에서 감사 문서 §F4 에도 반영한다.

## 1. 계약 (원문)

- **C4** `docs/dibay-first-entry-legal-consent-ssot.md:39` B6: 「동의가 항상 첫 단계(**전화 OTP·주소 저장은 동의 뒤, SG-06**)」
- **SG-06** `docs/dibay-auth-full-audit-ssot-design-2026-10-21.md:212` P2-2: 「미동의 사용자가 … 전화 OTP(개인정보 입력·SMS)를 동의보다 먼저 진행」 = 결함
- **C1** `auth-entry-phone-address-consent-design-2026-11-20.md:31`: 「동의 전 전화 인증 = 결함」
- **동의 예외 범주** `dibay-first-entry-legal-consent-ssot.md:29`: 「본인 프로필·주소 **정정**」 — 주소 수정·삭제는 동의 없이 허용. 새 주소 등록이 정정인지는 문구에 없다. C4 B6 이 「주소 **저장**은 동의 뒤」로 정했으므로 **새 등록(POST)은 동의 필요, 정정(PATCH·DELETE·사용 표시)은 지금처럼 예외**로 나눈다. 두 계약이 모두 지켜진다.

## 2. 지금 동작 (코드 근거)

| 경로 | 앱 호출처 | 중앙 게이트 | 라우트 자체 확인 | 결과 |
|---|---|---|---|---|
| `POST /api/account/phone/send-otp` | 전화 인증 상자(가입 전화 단계 + 프로필 수정) | 회원 상태 EXEMPT → 게이트 건너뜀 | 로그인·세션·발송 한도만 (`route.ts:12-18`) | **미동의도 SMS 발송** |
| `POST /api/account/phone/verify-otp` | 같음 | 같음 | 로그인·세션 | 미동의도 전화 인증 완료 |
| `POST /api/me/phone-verification/send` | 없음(옛 경로) | 동의 예외 `session_identity` (`member-consent-mutation-policy.ts:69`) | 로그인·세션·한도 | 미동의도 SMS 발송 |
| `POST /api/me/phone-verification/verify` | 없음 | 동의 예외 (`:70`) | 로그인·세션 | 미동의도 인증 완료 |
| `POST /api/me/addresses` | 주소 상세 화면 새 등록 (`AddressPlatformDetailClient.tsx:401-406`) | 동의 예외 `profile_address_correction` (`:90`) | 로그인 | **미동의도 주소 저장** |
| `PATCH·DELETE /api/me/addresses/[id]`, `…/mark-used` | 주소 수정·삭제 | 동의 예외 (`:91-93`) | 로그인·본인 행 | 계약상 정정 예외 — 그대로 둔다 |
| `POST /api/me/store-phone-verification/send·verify` | 입점 신청 | 동의 필요(예외 목록에 없음) | — | 이미 막혀 있음. 범위 밖 |

SMS 를 실제로 보내는 함수는 `sendPhoneOtpForUser`(`phone-otp-service.ts:276`) 하나이고, 위 OTP 경로 2개만 부른다. 입점용 OTP 는 별도 서비스이며 이미 동의를 확인한다.

## 3. 운영 데이터 (읽기 전용, 2026-11-27 오후 PHT)

| 항목 | 값 | 쿼리 |
|---|---|---|
| 지금 필수 버전 | 약관 `2026-11-07-terms` · 개인정보 `2026-11-20-registration` (둘 다 재동의형, 앞 버전 인정 없음) | `required_consent_versions('ko')` |
| 회원 수 | 85 | `profiles` |
| 필수 버전에 동의한 회원 | 31 | `terms_version`·`privacy_version` 집계 |
| 옛 버전 동의(재동의 필요) | 49 (`2026-04-store-review` 31 · 개인정보 `2026-11-07-contact` 18) | 같음 |
| 동의 기록 없음 | 5 — 이 중 OTP 요청 0 · 주소 0 | `terms/privacy_accepted_at is null` |
| 11-20 이후 동의 전 OTP·주소 저장 | 0 (감사에서 `member_consent_events` 로 확인) | 감사 §F4 |

지금까지 피해는 0건이다. 하지만 서버가 막지 않으므로 화면(프로필 수정)이나 API 로 언제든 생길 수 있다.

**바뀐 뒤 영향:** 동의가 필요한 54명(옛 버전 49 + 없음 5)은 다시 동의하기 전까지 OTP 발송·새 주소 등록이 거절된다. 이 54명은 지금도 일반 화면에서는 동의 화면으로 보내진다. 프로필 수정·주소 화면만 예외라서 차이가 생기는 곳은 그 두 화면뿐이다. 거절되면 동의 화면으로 보낸다(§4-3). 관리자(특권 역할)는 지금처럼 동의 판정을 통과한다(`resolve-member-consent-authority.ts:70,114`).

## 4. 설계

### 4-1. 서버 — OTP 4개 경로에 동의 확인 1개 추가

- **새 파일** `lib/auth/require-member-consent.server.ts`
  - `requireMemberConsent(userId): Promise<NextResponse | null>`
  - 판정은 중앙 게이트와 같은 `resolveMemberConsentAuthority(userId)` 를 쓴다(판정 식 하나).
  - 결과별 처리:
    - `CONSENTED`(동의 또는 특권 관리자) → `null`(통과)
    - `CONSENT_REQUIRED` → 403 `{ ok:false, error:"signup_incomplete", code:"signup_incomplete", message:"signup_incomplete", authenticated:true }`. `step` 이 없으므로 화면은 「가입 이어하기」가 아니라 **동의 화면 복구**로 간다.
    - `UNAVAILABLE` → 503 `consent_state_unavailable`(fail-closed, 중앙 게이트와 같은 코드)
  - 서버 한국어 문장은 새로 넣지 않는다(i18n SSOT). 문구는 화면이 코드로 고른다.
- **호출 위치**: 아래 4개 라우트에서 `validateActiveSession` 바로 뒤, **발송 한도(`enforcePhoneVerificationSendQuota`) 앞**. 거절된 요청이 한도를 쓰거나 SMS 업체로 가지 않게 한다.
  - `app/api/account/phone/send-otp/route.ts`
  - `app/api/account/phone/verify-otp/route.ts`
  - `app/api/me/phone-verification/send/route.ts`
  - `app/api/me/phone-verification/verify/route.ts`
- **중앙 게이트 분류는 바꾸지 않는다.**
  - `account/phone/*` 는 정지·차단 회원의 보안 복구용 EXEMPT(다른 계약)다. 이걸 PRODUCT_WRITE 로 옮기면 정지 회원 동작까지 바뀐다.
  - 대신 라우트에서 동의만 확인한다. 정지·차단 처리는 지금 그대로다.
- `member-consent-mutation-policy.ts:69-70` 의 `me/phone-verification` 예외 주석에 「동의는 라우트에서 `requireMemberConsent` 로 확인(F4)」을 적는다. 동작은 바뀌지 않는다.

### 4-2. 서버 — 새 주소 등록은 동의 필요

- `member-consent-mutation-policy.ts:90` `R("POST", "/api/me/addresses", "profile_address_correction")` **삭제**. 중앙 게이트가 동의를 확인하고, 미동의는 기존 403 `signup_incomplete` 로 거절한다.
- `member-action-registry.ts` 에 `W("POST", "/api/me/addresses", "manage")` **추가**.
  - 가입 3단계(대표 주소)가 이 경로를 쓰므로 가입 확인은 하면 안 된다(동의만 확인).
  - 표에 없으면 기본이 「가입 필요」라서 주소 단계가 막힌다. 계약 테스트가 표 누락을 잡는다.
- PATCH·DELETE·mark-used 는 예외 그대로 둔다(계약 「정정」).

### 4-3. 화면 — 거절되면 동의 화면으로

이미 있는 복구 함수 `redirectForBlockedAction`(`client-access-flow.ts:113-121`)을 쓴다. `signup_incomplete` 이면서 `step` 이 없으면 `buildConsentHref(지금 화면)` 로 이동하고, 동의 뒤 지금 화면으로 돌아온다. 새 문구·키는 없다.

- `components/mypage/profile/PhoneVerificationBox.tsx`
  - 발송(`:335`)·확인(`:396`) 실패 분기 맨 앞에서 `res.status === 403 && json.code === "signup_incomplete"` 이면 `redirectForBlockedAction(router, "signup_incomplete")` 를 부르고 끝낸다.
  - 오류 진동·오류 문구는 띄우지 않는다.
- `components/addresses/AddressPlatformDetailClient.tsx:409`: 같은 분기를 넣는다. 토스트·오류 문구 대신 동의 화면으로 보낸다.
- 화면 관문 예외 목록(`profile-setup-flow.ts`)은 바꾸지 않는다. 미동의 회원도 프로필·주소를 **보고 정정**할 수는 있다(계약 예외). 새 OTP·새 주소 등록을 누를 때만 동의로 보낸다.

### 4-4. 영향받는 화면·호출처 전부

| 화면/호출처 | 동의한 회원 | 미동의 회원 |
|---|---|---|
| 가입 2단계 전화 인증(`RegistrationPhoneStep` → `PhoneVerificationBox`) | 변화 없음 | 이 단계는 동의 뒤에만 열린다(`nextRegistrationStep`). 주소를 직접 쳐서 들어와도 발송을 누르면 동의 화면으로 간다 |
| 프로필 수정 전화 인증 | 변화 없음 | 발송 → 동의 화면 → 돌아와서 다시 발송 |
| 가입 3단계·주소 새 등록 | 변화 없음 | 저장 → 동의 화면 |
| 주소 수정·삭제·사용 표시 | 변화 없음 | 변화 없음(정정 예외) |
| 관리자 수동 전화 인증·관리자 화면 | 다른 경로(`/api/admin/**`) — 변화 없음 | — |
| 입점 OTP | 이미 동의 필요 — 변화 없음 | — |
| 개발용 `RegistrationKeyboardProofClient` | 같은 상자를 쓰므로 같은 동작 | — |

- 네이티브(Android·iOS) 파일 변경 없음. 통화 경로와 무관하다.
- 요청 수: 동의 판정 1회가 OTP 요청에 붙는다. 하루 OTP 는 10건 안팎(감사: 11-20 이후 9건)이라 예산 영향은 없다.

### 4-5. 시험 (구현 PR 에 함께)

- `lib/auth/__tests__/require-member-consent.test.ts`: 동의 → 통과 · 미동의 → 403 `signup_incomplete`(step 없음) · 관리자 → 통과 · 판정 불가 → 503
- 4개 OTP 라우트 시험: 미동의면 403, **SMS 함수·발송 한도 미호출**. 동의면 기존대로
- `member-consent-mutation-gate.test.ts`: `POST /api/me/addresses` 미동의 403 · PATCH·DELETE 는 계속 통과
- `member-action-registry-contract.test.ts`: `POST /api/me/addresses` = manage
- 화면 시험: `PhoneVerificationBox`·주소 저장이 403 `signup_incomplete` 를 받으면 동의 화면 주소로 이동하고 오류 문구는 없음
- 정적 시험: `sendPhoneOtpForUser`·`verifyPhoneOtpForUser` 를 부르는 모든 라우트가 `requireMemberConsent` 를 부르는지(새 경로가 생겨도 빠지지 않게)
- `member-p0-mutation-classification.csv` 는 회원 상태 분류만 담고 있어 바뀌지 않는다. 시험이 동의 열을 보면 함께 고친다.

### 4-6. 반영·운영 확인

- 분류: **웹만**(`lib/`·`app/api`·`components/`). DB·네이티브 변경 없음 → 운영 DB 승인 불필요, 앱 재빌드 없음.
- PR 1개(서버·화면·시험·감사 정정 함께) → `ci-ok` 자동 병합 등록.
- 운영 확인:
  1. `/api/app/web-version` = 병합 SHA
  2. 가입 완료 계정(Samsung `46a41536`)으로 기존 주소 **수정** PATCH 200(정정 예외 유지). 새 OTP 발송은 실제 SMS 가 나가므로 하지 않는다.
  3. Vercel 런타임 오류 0
  4. 미동의 거절 실측: 운영에 내가 쓸 수 있는 미동의 계정이 없다(미동의 5명은 실사용자 계정). **새 SNS 계정으로 로그인만 하고 동의 전 상태**에서 OTP 발송·주소 등록 API 가 403 이고 SMS 기록(`phone_verification_requested_at`)이 생기지 않는지 본다. 계정 생성은 Owner 허락이 필요하다 — 이 설계 승인에 포함해 주시면 시험 뒤 그 계정은 관리자 영구 삭제로 정리한다. 허락이 없으면 이 항목은 단위·라우트 시험으로만 확인하고 그렇게 보고한다.
- 롤백: PR 되돌리기(웹만). DB 변화가 없어 되돌릴 데이터도 없다.

## 5. 범위 밖 (보고만)

- 옛 경로 `/api/me/phone-verification/send·verify` 는 앱 호출처가 없다. 삭제는 이번 범위가 아니다(동의 확인만 붙인다).
- F1 `direct/start`(Owner 결정 필요) · F5 번호 없는 인증 13명 · §2 결정 7건은 이번에 손대지 않는다.

## 6. 구현 기록 (Owner 「승인, 구현 진행」 2026-11-27)

- 서버: `lib/auth/require-member-consent.server.ts` 새로 만듦 → OTP 라우트 4개에서 세션 확인 직후·한도 전에 호출. `POST /api/me/addresses` 동의 예외 삭제 + 규칙표 `manage` 추가
- 화면: `isConsentRequiredApiRejection`(`client-access-flow.ts`) → `PhoneVerificationBox` 발송·확인, `AddressPlatformDetailClient` 저장에서 `redirectForBlockedAction` (동의 화면 `/auth/onboarding/terms?next=…`)
- 시험: `otp-consent-required-f4.test.ts`(라우트 4개 · 503 · 동의/관리자 통과 · 정적 순서) · `consent-required-client-redirect-f4.test.ts` · `member-consent-mutation-gate.test.ts`(새 주소 등록 403, 정정 통과) · `member-action-registry-contract.test.ts`
- 로컬 검증 (최종 트리): `ci:static` · `check:i18n-quality` · `typecheck:build` · 전체 vitest(`test:ci` 2 샤드 12,627 + 13,174 통과) 모두 PASS
