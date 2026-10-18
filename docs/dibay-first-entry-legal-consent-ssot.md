# DIBAY FIRST ENTRY + ADMIN LEGAL CMS — 약관 동의 SSOT (2026-10-18)

**근거:** OWNER 실행 지시 2026-10-18 (계약 준수 복구) · 감사 B1–B11 · B3 API 전수 분류.
**원칙:** 새 정책 아님. 기존 계약(`docs/auth-account-linking-policy.md` §가입 완료, `docs/DIBAY_APP_LIFECYCLE_SSOT.md` §6,
`docs/permissions/dibay-legacy-call-receive-policy.md` Post-login UX, `lib/legal/*` 버전 계약)을 이행한다.

## 1. 동의 판정 — 단일 권위

| 항목 | SSOT |
|---|---|
| 필수 버전 | 게시된 ko `app_legal_documents.version` (시행일 도래분) — `resolveRequiredConsentVersions` / `…Strict` |
| 게시본 없음 | STORE_* fallback (`2026-04-store-review`) — **정상** |
| CMS 읽기 실패 | 마지막 성공값 유지. 한 번도 못 읽었으면 Strict 는 예외(API 게이트 503), Lenient 는 STORE_* |
| 판정 함수 | `hasStoreTermsConsent(profile, required)` — 모든 지점이 **같은 required** 사용 |
| 서버 지점 | proxy HTML 게이트 · `getOnboardingStatus` (→ `requiredConsent` 동봉) · signup-status · `resolvePostLoginRoute` · legal-consent · 중앙 API 게이트 · `confirm_dibay_id` RPC(마이그레이션 `20270512120000`) |
| 클라이언트 지점 | `lib/legal/client-required-consent` (root layout · signup-status 응답으로 수신) → DibaySignupGate · `isClientSignupComplete` · client-access-flow · MyAccountContent |
| 실행 중 앱 | 앱 복귀(visible) 시 signup-status 재조회(≥60s 간격). 버전 변경 시 세션 판정 초기화 후 게이트 재실행. 강제 로그아웃 없음 |

## 2. 동의 기록

- `PATCH /api/me/legal-consent` — 화면이 표시한 `termsVersion/privacyVersion` 동봉. 서버 필수 버전과 다르면 **409 `consent_version_stale`** → 화면이 새 버전으로 갱신·체크 해제·재동의 요청. 버전 미동봉(구 클라이언트)은 기존 동작.
- 서버 필수 버전을 확정할 수 없으면 503 (추정 버전 기록 금지).
- 기록: `profiles.terms_/privacy_{accepted_at, version}` (기존 구조 유지). 미동의 회원 자동 동의 처리 없음.

## 3. 중앙 API 동의 게이트 (B3)

- 위치: `proxy.ts` → `enforceApiMemberMutationPolicy` (PRODUCT_WRITE 변이) → 생애주기 검사 후 동의 검사.
- 판정: `resolveMemberConsentAuthority` (CMS 버전 · 특권 관리자 = 가입완료). 실패 → **503 `consent_state_unavailable`** (동의로 위장 금지). 미동의 → **403 `signup_incomplete`**.
- 예외: `lib/auth/member-consent-mutation-policy.ts` 의 **메서드+경로 정확 일치 규칙만**. 범주: 동의 처리 · 세션/본인 확인 · 탈퇴 · 기기/알림 수신 거부·기기 등록 · 본인 프로필·주소 정정 · **이미 성립한 주문 이행(매장·라이더)** · 주문 취소·환불·정산 출금 · 신고·차단·고객지원 · 나가기·숨김 · 본인 콘텐츠 삭제 · 읽음 처리 · **이미 시작된 통화 세션**(수락·시그널·종료) · 게스트 분석/텔레메트리/410.
- 관리자·cron·webhook(NON_MEMBER)·기존 생애주기 예외 13건은 게이트 진입 전 통과. 전화 인증·프로필·세션·RLS 검사는 각 라우트에서 그대로.
- 주문 배달 주소: 주문 생성 시 주문 행에 저장(`create_store_order_atomic*`), 이후 프로필 주소 변경과 무관 — 변경 없음.

## 4. 최초 진입 순서 보호

- B1: Lifecycle restore / Safe Entry 는 `/auth/*`·`/login`·`/signup`·`/onboarding/*` 로 부팅된 문서를 덮지 않는다 (`isLifecycleAuthSurfacePath`).
- B2: Lifecycle accountKey = `@supabase/ssr` 세션 쿠키의 user id (localStorage 세션은 legacy fallback).
- B4: 알림 OS 프롬프트·FSI 유도·푸시/VoIP 기기 등록은 **최초 동의 이후**. 버전 개정으로 재동의가 필요한 기존 회원의 수신은 끊지 않는다(신규 쓰기만 B3 로 차단).
- B5: FSI 설정 유도는 알림 허용(`receiveReady`)일 때만, **로그인당 1회**(user-scoped localStorage, 로그아웃 wipe 시 초기화).
- B6: 약관 화면은 단계 배지 없음(가입 = 약관 1단계).

## 5. 전화 인증 (B7·B8·B9)

- OTP 발송은 프로필의 번호·인증 상태를 바꾸지 않는다. 요청 번호는 `phone_otp_challenges` 에만, 프로필 반영은 verify 성공 시. unique 경합은 409 `phone_duplicate`.
- B9: 재검증 결과 서버(`state.phoneVerified` = `hasVerifiedPhone`)와 UI 판정 일치 — 코드 변경 없음.

## 6. Admin Legal CMS

| 상태 | 허용 | 금지 |
|---|---|---|
| 임시저장(draft) | 모든 필드 편집 · 임시저장 · 게시(확인 필수) | — |
| 게시(published) | 같은 버전 본문/제목 수정(「재동의 없음」 확인 필수, 감사 로그 본문 해시) · 게시 중단(확인 필수, 별도 CTA) | 종류·언어·버전·시행일 변경(새 버전은 새 문서) · 임시저장으로 내리기 |

- 권한: 쓰기 = `requireAdminPermission("settings")` (최고 관리자 항상 허용). 조회 = 관리자.
- 감사: `audit_logs` `legal_document.*` (before/after: 식별자·버전·상태·본문 sha256·길이).
- 동시 수정: `updated_at` CAS → 409 `stale_document`. 버전 중복 → 409 `version_conflict`.
- 시행일 입력: 관리자 로컬 시간 ↔ UTC 정확 변환.
- 재동의 여부: 계약대로 **버전 문자열**로 결정 — 게시 확인 팝업이 "재동의 필요/불필요"를 명시. 경미한 수정만 같은 버전, 법적 내용·필수 항목·개인정보 처리 변경은 새 버전(운영 지침).
- 회원 반영: 본문 화면 force-dynamic + no-store(즉시) · 동의 판정 30초 인스턴스 캐시(게시 인스턴스는 즉시 초기화).
