# DIBAY 계정 연결·중복 방지 정책

DB·서버 코드 기준. 자동 병합 **금지** — 운영자 수동 처리.

## 식별 우선순위

[`ensureUserProfile`](../lib/auth/ensure-user-profile.ts):

1. `auth.users.id` === `profiles.id`
2. `auth.identities` `(provider, provider_id|sub)` === `profiles.provider + profiles.provider_user_id`
3. `email` (진단·경고만 — 자동 merge 없음)
4. `phone` (앱 레벨 duplicate check)

## DB unique 제약

| 제약 | 대상 |
|------|------|
| `profiles_provider_user_id_unique_idx` | `(provider, provider_user_id)` WHERE NOT NULL |
| `profiles_phone_unique_idx` | `(phone)` WHERE NOT NULL |
| `profiles_dibay_id_lower_unique_idx` | 확정 @id |
| Supabase `auth.users.email` | Auth 레벨 unique |
| `profiles.email` | **non-unique** (중복 진단 view만) |

## 동일 이메일 · 다른 provider

- **email만으로 자동 병합하지 않는다**
- `duplicateWarning=true` + `duplicateCandidates` → 운영 로그
- **예외 없음 (2026-10-21)**: Naver 로그인은 비활성(410) — 과거의 email 기반 `auth.users` 재사용 예외는 제거됨.
- 웹에서 Supabase 가 같은 이메일로 identity 를 자동 연결해도, 이번 로그인 identity 에 SSOT row 가 없고 기존 회원이면 `provider_email_conflict` (기존 계정 진입 금지).
- 연결 stash 토큰은 충돌 대상 회원에 묶인다 — 다른 세션에서 쓰면 거부. 연결 해제는 최근 로그인(10분) 재인증 필수 · 마지막 1개 identity 해제 금지.

## Apple Private Relay

- `@privaterelay.appleid.com` 전용 DB 분기 **없음** — relay 주소 그대로 저장
- relay 이메일 ≠ 사용자 실제 이메일 — **별도 계정**으로 취급될 수 있음
- 동일인 연결은 `provider + provider_user_id` (Apple sub) 기준
- relay 이메일은 일반 email 병합 기준으로 쓰지 않는다
- relay와 일반 이메일 **자동 merge 금지**

## 전화번호

- DB: `profiles_phone_unique_idx`
- OTP: [`phone-otp-duplicate-check.ts`](../lib/auth/phone-otp-duplicate-check.ts) — 타 profile 중복 차단

## 가입 완료 (`signupComplete`)

[`deriveDibaySignupStatus`](../lib/auth/dibay-signup-status.ts):

- **약관·개인정보 동의** (`terms` + `privacy`, version `2026-04-store-review`) — 법적 최소, post-login gate 유일 조건
- 확정 DIBAY ID (`dibay_id_locked`) — **기능 gate** (친구 추가 등), signupComplete 아님
- `display_name` / `avatar_url` — **기능 gate** (글쓰기 등), signupComplete 아님
- `onboarding_completed_at`은 `legacyCompleted` 내부 신호일 뿐, 동의 미완료 상태의 gate 통과 기준이 아니다

**SNS OAuth 직후** Supabase session 생성 → 약관만 완료하면 앱 진입. mutation API는 [`requireSignupCompleteForUser`](../lib/auth/require-signup-complete-api.ts) 로 **약관 미동의** 403.

**중앙 집행 (2026-10-18):** 회원 API 변이는 proxy 중앙 게이트(`enforceApiMemberMutationPolicy` → 동의 검사)가 **약관 미동의 403 `signup_incomplete`** 로 일괄 집행한다. 예외(프로필·주소 정정, 기존 주문 이행, 취소·환불, 신고·차단·지원 등)는 `lib/auth/member-consent-mutation-policy.ts` 의 명시 규칙만. 상세 `docs/dibay-first-entry-legal-consent-ssot.md`.

@id·프로필·주소·전화는 [`requireProfileCompletion`](../lib/profile/require-profile-completion.ts) 기능 gate.

## 진단 SQL

[`supabase/scripts/diagnose-duplicate-members.sql`](../supabase/scripts/diagnose-duplicate-members.sql)

## 관련

- [auth-provider-matrix.md](./auth-provider-matrix.md)
- [dibay-session-policy.md](./dibay-session-policy.md)
