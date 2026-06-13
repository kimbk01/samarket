# Native SDK 적용 가능성 (DIBAY Auth P2)

코드베이스 진단 기준. **P0는 Supabase Web OAuth + Custom Tab 유지**, P2에서 provider별 Native SDK + 서버 검증을 단계 도입한다.

## 공통 원칙

1. 클라이언트 SDK token을 **신뢰하지 않는다** — `POST /api/auth/native/exchange` 에서 provider별 검증 후 Supabase 세션 생성
2. Web OAuth start와 Native exchange는 **`tryBeginOAuthFlow` mutex** 로 동시 실행 불가
3. Profile 연결은 기존 [`ensureUserProfile`](../lib/auth/ensure-user-profile.ts) 재사용
4. Google은 **Custom Tab 유지** (Sign-In SDK 중복·정책상 WebView 금지)

## Google

| 항목 | 판정 |
|------|------|
| Native SDK | **비권장** |
| 권장 | Android Custom Tab + Supabase PKCE (현재 구현) |
| 전제 | [`NativeOAuthLauncherPlugin.java`](../android/app/src/main/java/com/dibay/app/NativeOAuthLauncherPlugin.java) |

## Apple

| 항목 | 판정 |
|------|------|
| 가능성 | **가능** (iOS 신규 작업) |
| 선행 | Capacitor `ios/` 프로젝트, Sign in with Apple capability |
| 클라 | `ASAuthorizationAppleIDProvider` → `identityToken` + `authorizationCode` |
| 서버 | Apple JWT 검증 (Team ID, Key ID, Services ID, `.p8` client secret) |
| Supabase | `signInWithIdToken({ provider: 'apple', token })` 또는 Admin API |
| 오류 | `AuthorizationError 1001` — 사용자 취소 vs 설정 오류 구분 (P2) |
| Android | Supabase Web OAuth Custom Tab 유지 |

## Kakao

| 항목 | 판정 |
|------|------|
| 가능성 | **가능** |
| 클라 | Kakao SDK — 카카오톡 설치 시 앱 로그인, 미설치 시 계정 로그인 |
| 서버 | Kakao REST `/v1/user/access_token_info` 또는 OIDC id_token 검증 |
| 등록 | native app key, bundle id/package, Android key hash, iOS URL scheme |
| 오류 | 취소 / 네트워크 / 설정 — SDK error code 매핑 (P2) |
| Web fallback | Custom Tab Supabase OAuth는 Native SDK 미적용 기기·웹용으로 **유지** (mutex로 중복 방지) |

## Naver

| 항목 | 판정 |
|------|------|
| Native SDK | **없음** — server OAuth2 유지 |
| Native redirect | `https://samarket.vercel.app/auth/oauth/capacitor-return?provider=naver` (P1 정렬) |
| Naver Developers | callback URL에 https bridge 등록 필수 |

## Facebook

| 항목 | 판정 |
|------|------|
| 현재 | UI/DB 설정만, start **미연결** |
| P2 선택 | Supabase Facebook provider 연결 **또는** UI에서 영구 비활성 |

## 서버 API 스케치 (P2)

```
POST /api/auth/native/exchange
Content-Type: application/json
Cache-Control: no-store

{
  "provider": "apple" | "kakao",
  "idToken"?: string,
  "accessToken"?: string,
  "authorizationCode"?: string,
  "nonce"?: string
}

→ provider verify
→ ensureUserProfile
→ syncActiveSessionForUser
→ { ok: true, redirectTo: "/auth/onboarding/..." | POST_LOGIN_PATH }
```

구현 진입점: [`app/api/auth/native/exchange/route.ts`](../app/api/auth/native/exchange/route.ts), [`lib/auth/native/native-token-exchange.server.ts`](../lib/auth/native/native-token-exchange.server.ts)

## iOS 프로젝트

현재 `ios/` **부재** — Apple native는 Capacitor iOS add 후 진행.

## 관련

- [auth-provider-matrix.md](./auth-provider-matrix.md)
- [auth-account-linking-policy.md](./auth-account-linking-policy.md)
