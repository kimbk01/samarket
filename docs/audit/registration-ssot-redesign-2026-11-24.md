# 회원 가입 SSOT 재설계 — 발생 원인별 · 가입 방법별 · 수동 회원 (2026-11-24 PHT)

- 지시 (Owner 2026-11-24): 「회원 가입 및 첫진입의 전화번호 인증부분이 입력을 하지 않아도 바로 내정보를 넘어 가는부분이다 … 비로그인시 일반적인 확인 읽기는 가능 … 회원 가입 및 첫진입시에는 전화 번호 주소 인증 … 필리핀 이면 +63 … 이외의 지역은 +82」
  · 「땜빵 설계안으로 수정을 반복 … 끝까지 원인 … 터지지 않는 회원 가입 부분의 ssot … 발생원인별. 각각의 회원 가입, 수동 회원의 시의 유지 관리」
- 근거: 코드 main `5299d2c` · 운영 DB 읽기 전용 조회(2026-11-24) · 기존 계약 `.cursor/rules/cm-hub-navigation-contract.mdc`. 운영 변경 없음.

## 0. 내 잘못 먼저
1. 2026-11-20 Owner 「앱을 사용 못하게 하는 부분은 원하지 않는다, 읽기는 가능」을 **로그인한 미완료 회원도 건너뛸 수 있다**로 해석해 전화·주소 단계에 [나중에 하기]를 넣었다. Owner 의 뜻은 「비로그인은 읽기 가능」이었다. 이것이 지금 증상의 직접 원인이다.
2. 그 설계에서 「앱을 막는 관문 = 동의만」 계약(아래 C-5)을 그대로 두고 전화·주소를 별도의 「안내」 장치로 얹었다. 그래서 가입 완료의 판정은 하나인데 **화면을 막는 장치가 둘**(동의 = 강제, 전화·주소 = 안내)로 갈라졌다. 반복 수정의 구조 원인이다.

## 1. 운영 실측 (2026-11-24, 탈퇴 제외)
| 가입 방법 | 전체 | 동의 | 전화 인증 | 대표 주소 | 가입 완료 | 관리자 |
|---|---|---|---|---|---|---|
| 구글 | 71 | 54 | 31 | 37 | 25 | 0 |
| 수동(관리자 생성) | 38 | 36 | 38* | 17 | 16 | 2 |
| 카카오 | 24 | 24 | 13 | 13 | 12 | 2 |
| 이메일(옛 가입) | 21 | 12 | 12 | 11 | 11 | 1 |
| 애플 | 12 | 11 | 7 | 8 | 7 | 0 |
- \* 수동 회원 38명 중 **20명은 전화번호가 비어 있는데 「인증 완료」**(생성 API 가 번호 없이도 `phone_verified=true`).
- 동의를 마친 회원 137명 중 가입 완료 71명 · 미완료 66명(관리자 제외 전 수치).
- 11-21 이후 가입 3명: 카카오 1명 완료 · 구글 2명(11-23 07:01·07:32 PHT) 동의 화면에서 멈춤 — 멈춘 이유는 기록이 없어 NOT_PROVEN.
- 「인증 회원」 저장값이 세 군데라 서로 어긋난다: `profiles.status` 11건, `profiles.member_status` 4건(전화 인증했는데 내정보에 「SNS 회원」 표시)이 실제 인증(`hasVerifiedPhone`)과 다르다.
- 전화 인증 설정: 켜짐(`auth_phone_settings.enabled=true`, 필리핀 Semaphore). 한국 Solapi 키 이름은 Vercel 에 있음(적용 환경은 NOT_PROVEN).

## 2. 발생 원인별 결함
| # | 원인 | 결과 | 근거 |
|---|---|---|---|
| C-1 | 전화·주소 단계에 [나중에 하기] | 누르면 `next` 로 이동, 로그인 직후 `next` 기본값이 `/mypage` → **입력 없이 내정보** | `RegistrationPhoneStep.tsx` `onLater` · `RegistrationAddressStep.tsx` · `post-login-path.ts` `POST_LOGIN_PATH="/mypage"` |
| C-2 | 「세션당 1회 안내」 | 단계 화면을 한 번 보면(`deferProfileSetupForSession`) 그 로그인 동안 다시 안 보냄 | `RegistrationPhoneStep.tsx` useEffect · `MandatoryAddressGate.tsx:192` |
| C-3 | 재동의 분기 | 약관 개정 재동의(`priorConsent`) 뒤에는 다음 단계를 묻지 않고 원래 화면으로 | `AuthConsentForm.tsx` `if (!priorConsent)` |
| C-4 | 실패 시 통과 | 동의 저장 뒤 다음 단계 조회 실패 → `target = next` (전화 단계 건너뜀) | 같은 곳 |
| C-5 | **관문 계약 = 동의만** (구조) | 서버 HTML 관문(`proxy-signup-gate`)·화면 관문(`DibaySignupGate`) 모두 `consentComplete` 만 본다. 전화·주소는 안내 장치(`MandatoryAddressGate`)뿐 | `dibay-signup-status.ts` `SSOT_CONTRACT: dibay-signup-consent-only-gate` · `cm-hub-navigation-contract.mdc` 「절대 금지: HTML gate signupComplete 에 @id·프로필 다시 묶기 → /mypage 가 방·통화 deep route 덮음」(2026-06-21 사고) |
| C-6 | 미완료 회원 기본 목적지 | 목적지가 비면 `/mypage` — 가입 단계가 아니라 내정보 | `resolvePostLoginRoute` · `resolveDibaySignupRoute` |
| C-7 | 국가번호 고정 | 기본값 항상 +63(저장 번호가 +82 일 때만 +82). 접속 지역을 보는 코드가 없음 | `PhoneVerificationBox.tsx:212` · `phone-country-codes.ts` |
| C-8 | 수동 회원 생성 | 전화 선택 입력인데 항상 `phone_verified=true` · 주소 선택 · 주소 저장 실패는 경고만 · **동의를 관리자가 대신 기록**(`terms_accepted_at=now`) | `app/api/admin/users/create/route.ts` 143·190·305·321·352 |
| C-9 | 인증 저장값 3중 | `phone_verified` · `status`(sns_pending/verified_user) · `member_status`(pending/active/…) 를 각자 쓰고, 내정보 「회원 상태」는 `member_status` 로 표시 | `store-member-policy.ts` `deriveStoreMemberStatus` · `member-access.ts` · `phone-otp-service.ts` |

정상인 것(바꾸지 않음):
- 로그인 직후 목적지는 가입 방법과 무관하게 한 함수로 모인다 — 구글·카카오·애플 앱 로그인(`*-native-session.server.ts`), 웹 OAuth(`auth/callback`), PC QR, 아이디 로그인(`signup-status`) → `resolveCommonAuthDestination` / `resolvePostLoginRoute`.
- 판정 재료는 DB 함수 하나의 같은 열(`member_onboarding_facts` · `member_write_gate_snapshot`: 프로필 + `user_addresses.is_active AND is_default_master` + 관리자 멤버십), 전화 판정은 `hasVerifiedPhone` 하나.
- 서버 쓰기 관문(글쓰기·주문·채팅 등 「새로 하기」 행동)은 가입 미완료면 막는다(11-21 반영).

## 3. SSOT — 하나의 정의
| 항목 | 단일 정의 | 소유 파일 |
|---|---|---|
| 가입 완료 | **본인 동의 + 전화 인증 + 대표 주소** (관리자 멤버십 = 전화·주소 면제, 동의는 기존 규칙) | `lib/auth/dibay-registration-steps.ts` `nextRegistrationStep` |
| 재료 | DB 함수 `member_onboarding_facts` 1회 | `get-onboarding-status.ts` |
| 전화 인증 판정 | `hasVerifiedPhone` 만 (`status`·`member_status` 는 판정·표시에 쓰지 않음) | `post-login-profile-policy.ts` |
| 비로그인 | 읽기 가능(기존 `guest-browse-access-policy` 그대로) | 변경 없음 |
| 로그인 + 미완료 | **빠진 단계 화면으로만** 이동. 건너뛰기 없음. 둘러보려면 [로그아웃하고 둘러보기] | 관문 2곳(아래) |
| 화면 관문 | 서버 `proxy-signup-gate` + 화면 `DibaySignupGate` — 둘 다 `nextRegistrationStep` 결과로 같은 단계 화면 | 두 파일 |
| 관문 예외 | 로그인·`/auth/*`(단계 화면)·약관 문서·고객센터·탈퇴·**통화 화면 전부**(`isCallSurfacePath`) | `dibay-signup-status.ts` `isDibaySignupGateExcludedPath` 한 곳 |
| 단계 순서 | 동의 → 전화 → 주소. 단계 화면은 들어올 때마다 서버가 다시 판정(`enforceRegistrationStepPage`) | 기존 |
| 완료 후 | 원래 가려던 화면(`next`, 방·통화 등 deep route 유지). `next` 없으면 홈 | `resolvePostLoginRoute` |
| 쓰기 관문 | 기존 그대로(최후 방어) | `enforce-api-member-mutation-policy.ts` |
| 국가번호 기본값 | ① 저장된 번호의 나라 ② 접속 나라 PH → +63 ③ 그 밖 나라 → +82 ④ 모름·한국 발송 불가 → +63. 사용자가 바꿀 수 있음 | 서버 `/api/me/phone-verification` 가 `default_dial_code` 로 내려줌 (Vercel `x-vercel-ip-country`) |

## 4. 가입 방법별 흐름 (수정 후)
| 방법 | 회원 행 생성 | 로그인 직후 | 동의 | 전화 | 주소 |
|---|---|---|---|---|---|
| 카카오·구글·애플(앱) | `*-native-session.server.ts` | `resolveCommonAuthDestination` → 빠진 첫 단계 | 본인 | 본인 OTP | 본인 |
| 구글·카카오(웹 OAuth) | `auth/callback` | 같음 | 본인 | 본인 OTP | 본인 |
| 아이디 로그인(이메일·수동) | 기존 행 | `signup-status` → 같음 | 본인 | 본인 OTP 또는 관리자 등록 번호 | 본인 또는 관리자 등록 |
| PC QR | 기존 행 | 같음 | — | — | — |
| 관리자 수동 생성 | `admin/users/create` | 첫 로그인 때 위와 같음 | **본인(첫 로그인)** | 관리자가 번호 입력 = 인증(필수) | 관리자 등록(필수) |
- 같은 사람이 다른 방법으로 로그인해 새 계정이 생기면 전화 단계에서 「이 번호로 가입된 계정」 안내 + 빈 계정 지우기(11-21 반영) — 변경 없음.

## 5. 수동(관리자 생성) 회원 유지 관리
| 항목 | 지금 | 수정 후 |
|---|---|---|
| 생성 시 전화 | 선택 · 없어도 「인증 완료」 | **필수** (PH 09…/KR +82). 번호 없는 「인증 완료」 생성 금지 |
| 생성 시 주소 | 선택 · 실패는 경고 | **필수** · 대표 주소 저장 실패면 생성 취소(회원·Auth 삭제, 기존 실패 정리 경로) |
| 동의 | 관리자가 대신 기록 | 기록하지 않음 → 본인이 첫 로그인 때 동의(법적 동의 = 본인) |
| 기존 38명 | 번호 없음 20 · 주소 없음 21 | 다음 로그인 때 빠진 단계(전화 OTP·주소)를 본인이 입력. 관리자 회원 상세에 「가입 단계: 전화 없음/주소 없음」을 같은 판정으로 표시 → 관리자가 대신 등록 가능 |
| 판정 | `provider=admin_manual` 이면 번호 없어도 전화 인증 | `admin_manual` 은 **번호가 있을 때만** 전화 인증 (`hasVerifiedPhone` 1곳 수정) |
| 관리자(멤버십) | 전화·주소 면제 | 그대로 |
- 앱 심사 계정(수동 회원)은 번호·주소가 이미 있어야 심사 때 단계 화면이 안 뜬다 → 반영 전 해당 계정 상태 확인(운영 읽기)·필요 시 관리자 화면에서 등록.

## 6. 단계별 구현 (각 단계가 끝난 상태에서 화면이 깨지지 않게)
| 단계 | 내용 | 바뀌는 파일 | 영향·같이 처리 |
|---|---|---|---|
| S1 화면 관문 통합 (웹) | ① [나중에 하기] 삭제 → [로그아웃하고 둘러보기] ② 「세션당 1회」 삭제 ③ `DibaySignupGate` 가 `signup-status` 의 `registration.nextStep` 까지 보고 단계 화면으로 ④ `AuthConsentForm` 은 재동의 포함 항상 서버에 다음 단계를 묻고, 실패하면 단계 화면(서버가 다시 판정) ⑤ `MandatoryAddressGate` 의 이동 역할 제거(주소 변경 알림만) ⑥ 미완료 기본 목적지 = 단계 화면 | `RegistrationPhoneStep`·`RegistrationAddressStep`·`RegistrationStepLater`·`DibaySignupGate`·`AuthConsentForm`·`MandatoryAddressGate`·`profile-setup-flow`·`resolve-post-login-route`·계약 `dibay-signup-status.ts` 표지·`ssot-source-contract-registry.ts`·`cm-hub-navigation-contract.mdc`·i18n | 통화 화면은 예외 목록으로 덮지 않음(06-21 사고 방지 조건 유지) · 방 deep link 는 단계 완료 뒤 `next` 로 복귀 |
| S2 서버 관문 (DB+웹) | 토큰 클레임 `dibay_m` 에 가입 재료(전화 인증 열·`has_default_master`) 추가 → `proxy-signup-gate` 가 같은 `nextRegistrationStep` 으로 판정. 클레임이 「완료」면 DB 0회, 아니면 `member_onboarding_facts` 1회 | `custom_access_token_hook` 마이그레이션 · `member-token-claims.ts` · `proxy-signup-gate.ts` | 운영 DB 적용 = Owner 승인 · 완료 회원 Supabase 호출 증가 0 · 미완료 회원만 화면 이동마다 1회 |
| S3 국가번호 (웹) | `default_dial_code` 응답 · 화면 기본값 순서 §3 | `app/api/me/phone-verification/route.ts` · `PhoneVerificationBox.tsx` · `phone-country-codes.ts` | 내정보 전화 인증 화면도 같은 기본값(같은 컴포넌트) |
| S4 수동 회원 (웹) | 생성 필수값·동의 미기록·`hasVerifiedPhone` admin_manual 번호 조건·관리자 상세 가입 단계 표시 | `admin/users/create/route.ts` · 관리자 생성 폼 · `post-login-profile-policy.ts` · 관리자 회원 상세 | 번호 없는 수동 회원 20명 → 다음 로그인 때 전화 단계 |
| S5 저장값 정리 (웹) | 내정보 「회원 상태」를 `hasVerifiedPhone` 으로 표시. `status`·`member_status` 는 판정·표시에 쓰지 않음(열은 유지, 데이터 변경 없음) | `store-member-policy.ts` `deriveStoreMemberStatus` · `MyAccountContent.tsx` | 어긋난 15건 표시가 실제와 맞음 |
- 통화 규정: S1 은 관문 예외에 통화 화면을 **그대로 두는** 변경이라 통화 경로 동작 무변경. 다만 관문 파일이 통화 deep route 계약 대상이라 S1 PR 에 통화 영향 분석(받기 배너·수락·PiP·진행 중 통화 복귀)과 실기 항목을 넣는다.
- 배포: S1·S3·S4·S5 = 웹(앱 재시작) · S2 = DB 적용 후 웹. 네이티브 빌드 없음.

## 7. 수정 후 회원별 결과 (실측 기준)
- 가입 완료 71명: 변화 없음.
- 미완료 66명(+ 수동 회원 중 번호 없는 20명이 전화 미완료로 바뀜): **다음 로그인·화면 이동 때 빠진 단계 화면**. 로그아웃하면 비로그인처럼 읽기 가능.
- 관리자: 전화·주소 면제 그대로.

## 8. 남은 위험
| 위험 | 대응 |
|---|---|
| 미완료 회원이 받은 통화·알림을 누를 때 | 통화 화면 = 예외(그대로 받음). 채팅 알림 → 단계 화면 → 완료 뒤 그 방으로 |
| VPN·로밍으로 국가번호 기본값이 다름 | 사용자가 바꿀 수 있음 |
| 클레임(S2)이 1시간 동안 옛 값 | 「완료」만 신뢰 → 막 완료한 회원은 DB 로 판정(통과). 완료 뒤 주소를 지워 미완료가 되는 경우만 최대 1시간 통과(쓰기 관문이 막음) |
| 심사 계정이 단계 화면에 걸림 | 반영 전 계정 상태 확인 |

## 9. Owner 확인 필요 (설계 규정 7번 — 기존 계약과 충돌)
- `cm-hub-navigation-contract.mdc` 「HTML gate 에 프로필 다시 묶기 금지」를 **「가입 단계(전화·주소)는 묶되 통화 화면·단계 화면은 예외, 목적지는 `/mypage` 가 아닌 단계 화면 → 완료 뒤 원래 화면」**으로 고친다. (06-21 사고 원인 = 목적지 `/mypage` 가 방·통화를 덮은 것 → 이번 설계는 그 두 조건을 막는다.)
- 11-20 「읽기 가능」 범위를 비로그인으로 한정(이번 지시 기준).

## 10. NOT_PROVEN
- 11-23 구글 가입 2명이 동의 화면에서 멈춘 이유.
- 회원이 실제로 [나중에 하기]를 누른 횟수(지난 화면 기록 없음).
- Solapi 키의 Production 적용 여부.
- 운영에서 Vercel `x-vercel-ip-country` 가 앱(WebView) 요청에 붙는지 — S3 반영 뒤 1회 확인.

## 11. 구현 기록 (2026-11-24 · Owner 「설계대로 진행」)
| 단계 | 구현 | 파일 |
|---|---|---|
| S1 | [나중에 하기]·세션당 1회 삭제 · 가입 관문 1곳(`registration-gate.ts`, 이동 주인 `DibaySignupGate`) · `MandatoryAddressGate` 는 재료 읽기만 · 동의 뒤 항상 서버 판정(실패 → 단계 화면) · 단계 화면 기본 next `/` · 계약 개정(`cm-hub-navigation-contract` 문서·규칙, 마커 `dibay-registration-gate-step-destination`) | `components/auth/*`, `components/addresses/MandatoryAddressGate.tsx`, `lib/auth/registration-gate.ts`, `lib/auth/registration-pending-state.client.ts`, `lib/auth/registration-step-page.server.ts`, `lib/auth/profile-setup-flow.ts`(1회 안내 함수 삭제), `lib/auth/profile-setup-defer.client.ts`(삭제) |
| S2 | 토큰 클레임 가입 재료(`reg`·`has_phone`·`has_default_master` 등, 번호 자체는 넣지 않음) · proxy 가 동의 뒤 같은 판정 | `supabase/migrations/20271124120000_*.sql`, `lib/auth/member-token-claims.ts`, `lib/auth/proxy-signup-gate.ts` |
| S3 | `default_dial_code`(Vercel `x-vercel-ip-country`) · 화면 기본값 순서 | `app/api/me/phone-verification/route.ts`, `lib/phone/phone-country-codes.ts`, `lib/mypage/load-phone-verification-state.ts`, `PhoneVerificationBox.tsx` |
| S4 | 생성 시 전화·주소 필수 · 주소 실패 = 생성 취소 · 동의·혜택 동의 대신 기록 안 함 · 수동 회원 번호 규칙 · 관리자 상세 가입 단계 표시 | `app/api/admin/users/create/route.ts`, `CreateMemberForm.tsx`, `admin-create-member-fields.ts`, `app/api/admin/users/[id]/route.ts`, `AdminMemberAlertStrip.tsx` |
| S5 | 전화 인증 판정 구현 1개(`verifiedPhoneVerdict`) — `hasVerifiedPhone`·회원 상태 표시·인증 회원 기능 모두 사용 | `lib/auth/store-member-policy.ts`, `lib/auth/post-login-profile-policy.ts`, `lib/auth/member-access.ts` |

설계와 다르게 한 것 (이유):
1. [로그아웃하고 둘러보기] 대신 기존 [로그아웃] + 안내 문구 — 로그아웃 뒤 이동은 Auth HARD LOCK(`docs/auth-hard-lock.md`)이 `/login` 으로 고정, 문구가 실제 동작과 다르면 안 됨.
2. 서버 관문(S2)은 회원 전용 화면만 — proxy 는 비로그인도 보는 공개 화면(홈·마켓 등)에서 성능 때문에 로그인을 확인하지 않는다(동의 관문과 같은 범위). 공개 화면은 화면 관문이 담당.
3. 동의 관문 예외 목록은 그대로(통화 화면 미포함) — 동의 안 한 회원의 통화 동작을 바꾸지 않기 위해(통화 규정). 가입 관문 예외 = 동의 관문 예외 + 통화 화면 (`isRegistrationGateExemptPath` 한 곳).
4. 감사 중 추가 발견 → S5 에 포함: `canUseVerifiedMemberFeatures`(메시지 보내기·제안 등)가 `member_status` 를 같이 봐서, 가입 관문은 통과한 수동 회원(member_status=pending)이 보내기에서 막혔다(운영 4명 중 번호 있는 2명). 판정을 `hasVerifiedPhone` 하나로.
5. 수동 회원 아닌 「번호 없는 인증 완료」 13명(구글 6·카카오 4·이메일 3)은 설계 범위(admin_manual) 밖이라 그대로 — 보고만.
6. 로그인 직후 next 가 없을 때 `auth/callback` 은 `/mypage` 를 넘긴다(Auth HARD LOCK) → 그 경우 단계 완료 뒤 내정보. 건너뛰기는 아니므로 그대로 둠.

## 12. 통화 영향 (통화 규정 1·3번 — 통화 코드 무변경 확인)
| 경로 | 영향 |
|---|---|
| 받은 통화 화면·수락(`/community-messenger/calls*`, `incoming-call-accept-gateway`) | 가입 관문 예외(`isCallSurfacePath`) — 이동 없음. 통화 코드·푸시·네이티브 파일 무변경 |
| 수신 배너(전역) | 단계 화면 위에서도 그대로 뜸(관문은 경로 이동만 함) |
| 통화 걸기 | 기존 그대로 전화 인증 필요(`call_start: ["phone_verified"]`) — 수동 회원 번호 없음 20명은 전화 인증 뒤 가능 |
| 통화 종료 뒤 방으로 복귀 | 미완료 회원이면 방 대신 단계 화면(next=방) — 완료 뒤 방 |
- 실기기 확인 항목(배포 뒤): 미완료 계정으로 수신 통화 받기(단계 화면 중) · 완료 계정 통화 정상.

## 13. 적용 순서
1. 운영 DB 마이그레이션 `20271124120000` 적용(Owner 승인) — 기존 코드는 새 키를 읽지 않아 먼저 적용해도 안전.
2. PR 병합(Owner 「병합」).
- ~~마이그레이션 전에 병합되면: S2 proxy 판정·수동 회원 번호 규칙만 꺼진 상태로 동작~~ — **정정(재감사2, 2026-11-25)**: PR #576(R2)이 「번호 모름 → 예전 판정」 분기를 지웠으므로, 마이그레이션 없이 배포하면 DB 함수가 `phone` 을 주지 않아 번호 있는 수동 회원도 전화 미인증이 된다. 운영은 마이그레이션을 #575 병합 전(2026-11-24)에 적용·확인해 실제 영향 없음. 이후 같은 종류 변경은 **DB 적용 → 병합** 순서를 지킨다.

## 14. 재감사 (2026-11-24 · 운영 `e32d53a` 기준 · Owner 「설계대로 진행」)
내 잘못: ① 심사 계정 확인(§5)을 병합 전에 하지 않음 ② Auth HARD LOCK 개정 없이 클레임 변경 ③ 판정 함수 입력을 호출처 19곳이 따로 만들어 10곳이 번호를 빠뜨림.

| # | 결함 (직접 확인) | 수정 |
|---|---|---|
| A | 심사 계정 `appreview01`·`playreview` = 번호 없는 수동 회원 → 전화 미인증(운영 값 재현) | R1 관리자 화면에서 번호 등록(데이터, 서로 다른 실제 번호 2개 — `profiles_phone_unique_idx`) |
| B | 전화 인증 입력에 번호를 빠뜨린 호출처 → 관문마다 판정이 다름 | R2 `StoredPhoneFact` 필수 타입 — 컴파일러가 찾은 16곳 수정 · 「모름」 분기 삭제 |
| C | 가입 완료 뒤 토큰 갱신 전까지 proxy 가 요청마다 DB 3회 | R3 「빠진 단계 → 완료」 순간 기존 단일 비행 갱신 1회 (Auth HARD LOCK Amendment 2026-11-24) |
| D | 서버 「terms」를 사본에 「완료」로 적음 → 동의 직후 관문 꺼짐 가능 | R4 「terms」 = 「모름」 |
| E | 「완료」 표시 뒤 세션 동안 재판정 안 함 | R5 재료 변경(전화·주소·로그아웃) 때 완료 표시 지우고 재판정 |
| F | proxy next 에 검색어 빠짐 | R6 경로 + 검색어(`_rsc` 제외), 동의 관문 포함 |
| G | HARD LOCK 개정 기록 없음 | `docs/auth-hard-lock.md` Amendment 2026-11-24 |

통화 영향(통화 규정 1·3): R2 로 공용 관문 `requireProfileFieldsForAction` 의 판정이 바뀌어, `/api/community-messenger/calls/redial-room`(다시 걸기 방 만들기)도 **번호 없는 수동 회원**(운영 18명, 실사용은 심사 계정뿐)에게 전화 인증을 요구한다. Owner 지시 「통화 부분은 전화 번호 안내쪽으로」와 같은 방향이며 그 밖 회원·통화 코드는 무변경.


## 15. 재감사2 (2026-11-25 · 운영 `44f65e4` 기준 · Owner 「설계대로 진행」)
내 잘못: ① R3 를 화면 관문 컴포넌트에 넣어 가입 단계 화면(관문 없음)에서 전환을 놓쳤다 ② 그 테스트가 문자열만 봐서 통과했다 ③ §13 적용 순서 문구가 R2 이후 틀렸다(위 정정).

| # | 결함 (직접 확인) | 수정 |
|---|---|---|
| 1 | 가입 완료 순간 토큰 갱신이 표준 흐름에서 안 됨 → 토큰 만료까지 proxy DB 3회/요청 | 전환 기억을 모듈 상태로 · 루트 설치 감시가 1회 갱신 · **동작 테스트** |
| 2 | 「빠진 단계」 사본 10분 → 다른 기기 완료 뒤 화면마다 단계 화면 왕복 | 빠진 단계 15초(완료는 10분) |
| 3 | 사장님 운영 화면에서 관문이 지연 규칙을 무시해 요청 +1 가능 | 사장님 화면은 `MandatoryAddressGate` 지연 응답을 기다림 |
| 4 | 설정 화면 「닫기」 → `/mypage` | 앱 홈 `/` |
| 5 | 관리자 목록 「검토 필요」 = `member_status=pending`(예전 전화 미인증 사본, 65명) | 「검토 필요」 = `member_status=review` 만 · 목록·상세에 **가입 단계**를 앱 판정(`nextRegistrationStep`)으로 표시(목록 쪽당 대표 주소 1회 조회) |
- 확인 결과 결함 아님: 번호 원값·복원값 차이(`phone` 비고 `phone_number` 만 있는 행 운영 0건, 2026-11-25 조회).
