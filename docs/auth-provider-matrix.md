# DIBAY Auth Provider Matrix

**진행 순서 (P2):** [dibay-auth-roadmap.md](./dibay-auth-roadmap.md)

코드 기준 단일 정의. 운영·리뷰·QA는 이 표를 따른다.

> **2026-10-21 갱신 (auth 통합 SSOT, `docs/dibay-auth-full-audit-ssot-design-2026-10-21.md`):**
> - **Naver 로그인 비활성** — `/api/auth/naver/start`·`/callback` 은 항상 410 `naver_login_disabled` (이메일 기반 계정 재사용 경로 제거).
> - Google(Android)·Kakao(Android)·Apple(iOS) native exchange 는 **구현됨** (아래 표의 "501 stub" 표기는 이력).
> - `auth_providers.enabled=false` 인 공급자는 `/api/auth/oauth/start`·`/api/auth/native/exchange` 가 서버에서 403 `provider_disabled`.
> - Kakao native 토큰은 `KAKAO_APP_ID` env 설정 시 `app_id` 일치 필수 (미설정 시 경고 로그만).
> - 기존 owner 세션 재발급(교차 플랫폼·native)은 magiclink(`generateLink`+`verifyOtp`) 주경로 — owner 이메일·비밀번호를 덮어쓰지 않는다.

## P0 · P1 — 완료 (재작업 금지)

| 항목 | 결과 |
|------|------|
| P0 Auth 정책 · signupComplete · login/signup 분기 | **PASS** |
| 로그아웃 E2E · A→B E2E | **PASS** |
| Web OAuth (Google Custom Tab 등) | **동작 중** |
| Native SDK 로그인 | **미완료** — adapter 공통화 완료 · **완료 provider 없음** |

> **주의:** Native Auth **전체 완료 아님**. Apple = 서버 구현 유지 · **실기기 QA 전 완료 아님**.  
> Kakao/Google/Facebook native exchange = **501 stub** (STEP 3 Kakao SDK부터).

### P2 진행 순서

→ [dibay-auth-roadmap.md](./dibay-auth-roadmap.md) STEP 2 완료 · **STEP 3 Kakao Native SDK 최우선**

---

| Provider | 클라이언트 start | Native (현재) | Native SDK | 서버 세션 | 비고 |
|----------|------------------|---------------|------------|-----------|------|
| **Google** | `GET /api/auth/oauth/start?provider=google` | Custom Tab · **동작 중** | **Custom Tab 유지** (STEP 4) | Supabase PKCE | native exchange **501 stub** |
| **Apple** | iOS: `NativeAppleAuth.signIn()` → exchange · Web/Android: Web OAuth | iOS Native SDK shell | AuthenticationServices | **Apple adapter** JWKS + Admin session | env enable · QA 미완 |
| **Kakao** | Web OAuth + Custom Tab (web) · **Native SDK (Android/iOS)** | Kakao SDK | **adapter verify+session** | `AUTH_KAKAO_NATIVE_EXCHANGE_ENABLED` · `KAKAO_NATIVE_APP_KEY` |
| **Naver** | `GET /api/auth/naver/start` | route assign + capacitor-return | **native exchange 제외** | `/api/auth/naver/callback` | Supabase OIDC 아님 |
| **Facebook** | **미연결** · UI 숨김 | — | STEP 5 | native exchange **501 stub** | start 미연결 |
| **Email/Password** | `signInWithPassword` | — | — | Supabase | |
| **Native exchange** | `POST /api/auth/native/exchange` | — | provider adapter | Apple 구현 · Kakao/Google/Facebook **501** | Naver 제외 |

## Native exchange 공통 계약 (STEP 2)

```
provider: apple | kakao | google | facebook
→ NativeProviderAdapter.validateInput (400 native_exchange_bad_request)
→ stub: 501 native_provider_not_implemented
→ Apple: verify + establishSession
```

모듈: `lib/auth/native/native-exchange-types.server.ts`, `native-provider-adapter.server.ts`

## Native Android (현재)

```
fetch /api/auth/oauth/start?launch=native
  → Custom Tab (authorize URL)
  → https://samarket.vercel.app/auth/oauth/capacitor-return?code=...
  → dibay://auth/callback
  → /auth/callback (WebView PKCE exchange)
```

Naver native는 **선택 A** 유지.

## 금지 (회귀 방지)

- OAuth start 에 `@capacitor/browser` `Browser.open` 사용
- Android `Intent.ACTION_VIEW` 전체 Chrome fallback
- Facebook 버튼만 노출하고 start 경로 없음
- Web OAuth + Native SDK exchange **동시 in-flight** (`tryBeginOAuthFlow` mutex)
- Naver email 기반 auth user reuse를 일반 email merge 정책으로 확대
- native exchange stub provider에서 profile/session 생성

## 검증

- `npm run verify:native-oauth-redirect-contract`
- `npm run verify:auth-session-contract`
- `npm run verify:ios-apple-native-contract`
- `npx vitest run lib/auth/native`

## 관련 문서

- [dibay-auth-roadmap.md](./dibay-auth-roadmap.md)
- [auth-native-sdk-feasibility.md](./auth-native-sdk-feasibility.md)
- [secure-auth-oauth-setup.md](./secure-auth-oauth-setup.md)
- [dibay-session-policy.md](./dibay-session-policy.md)
