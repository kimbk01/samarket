# DIBAY Auth Provider Matrix

**진행 순서 (P2):** [dibay-auth-roadmap.md](./dibay-auth-roadmap.md) — STEP 1 Apple Native SDK부터

코드 기준 단일 정의. 운영·리뷰·QA는 이 표를 따른다.

## P0 · P1 — 완료 (재작업 금지)

| 항목 | 결과 |
|------|------|
| P0 Auth 정책 · signupComplete · login/signup 분기 | **PASS** |
| 로그아웃 E2E · A→B E2E | **PASS** |
| Web OAuth (Google Custom Tab 등) | **동작 중** |
| Native SDK 로그인 | **미완료** — Apple exchange·iOS shell **코드 완료** · **실기기 QA 대기** |

> **주의:** Native Apple Login **완료 아님** (Vercel 배포 + env + iPhone session 확인 전).  
> Google = Web OAuth + Custom Tab · Apple iOS = Native SDK + exchange (env enable) · Kakao exchange = **501**

### P2 진행 순서

→ [dibay-auth-roadmap.md](./dibay-auth-roadmap.md) STEP 1~6

---

| Provider | 클라이언트 start | Native (현재) | Native SDK | 서버 세션 | 비고 |
|----------|------------------|---------------|------------|-----------|------|
| **Google** | `GET /api/auth/oauth/start?provider=google` | Custom Tab · **동작 중** | STEP 4 검토 | Supabase exchange | Custom Tab 유지 가능 |
| **Apple** | iOS: `NativeAppleAuth.signIn()` → exchange · Web/Android: Web OAuth | iOS Native SDK **배포됨** | AuthenticationServices | JWKS verify + session | `AUTH_APPLE_NATIVE_EXCHANGE_ENABLED` |
| **Kakao** | 동일 (`provider=kakao`) | Web OAuth | **STEP 3** Kakao SDK | native exchange **501** | Apple QA 후 |
| **Naver** | `GET /api/auth/naver/start` | route assign + capacitor-return bridge | **STEP 5** launch 통일 | `/api/auth/naver/callback` | Supabase OIDC 아님 |
| **Facebook** | **미연결** | — | — | — | UI 노출 금지 |
| **Email/Password** | `signInWithPassword` | — | — | Supabase | |
| **Native exchange** | — | — | Apple **구현** · Kakao **501** | Apple JWKS + Admin session | env enable 필수 |

## Native Android (현재)

```
fetch /api/auth/oauth/start?launch=native
  → Custom Tab (authorize URL)
  → https://samarket.vercel.app/auth/oauth/capacitor-return?code=...
  → dibay://auth/callback
  → /auth/callback (WebView PKCE exchange)
```

Naver native는 **선택 A** 유지. **launch page Custom Tab 통일은 STEP 5** 작업이다.

## 금지 (회귀 방지)

- OAuth start 에 `@capacitor/browser` `Browser.open` 사용
- Android `Intent.ACTION_VIEW` 전체 Chrome fallback
- Facebook 버튼만 노출하고 start 경로 없음
- Web OAuth + Native SDK exchange **동시 in-flight** (`tryBeginOAuthFlow` mutex)
- Naver email 기반 auth user reuse를 일반 email merge 정책으로 확대

## 검증

- `npm run verify:native-oauth-redirect-contract`
- `npm run verify:auth-session-contract`
- `npm run verify:ios-apple-native-contract`

## 관련 문서

- [dibay-auth-roadmap.md](./dibay-auth-roadmap.md)
- [auth-p1-manual-qa-checklist.md](./auth-p1-manual-qa-checklist.md)
- [secure-auth-oauth-setup.md](./secure-auth-oauth-setup.md)
- [auth-native-sdk-feasibility.md](./auth-native-sdk-feasibility.md)
- [auth-p2-ios-apple-device-qa.md](./auth-p2-ios-apple-device-qa.md)
- [ios-apple-native-auth-setup.md](./ios-apple-native-auth-setup.md)
- [native-oauth-device-qa.md](./native-oauth-device-qa.md)
- [dibay-session-policy.md](./dibay-session-policy.md)
