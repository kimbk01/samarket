# Kakao Native Auth Setup (STEP C)

## 목표 UX

카카오 로그인 버튼 → **Chrome/Custom Tab 없음** → 카카오톡 앱 또는 카카오 계정(SDK) → DIBAY 복귀 → `POST /api/auth/native/exchange` → `sessionEstablished=true`

## 환경변수 주입 경로

| 위치 | 변수 | 주입 방법 |
|------|------|-----------|
| **Vercel (production)** | `AUTH_KAKAO_NATIVE_EXCHANGE_ENABLED` | 선택 — 기본 **활성**. `false`만 명시 시 비활성 |
| **Vercel** | `SUPABASE_SERVICE_ROLE_KEY` | exchange Admin upsert + session (필수) |
| **로컬 Next.js** | `.env.local` | `AUTH_KAKAO_NATIVE_EXCHANGE_ENABLED` (선택), service role |
| **Android 빌드** | `KAKAO_NATIVE_APP_KEY` | `export KAKAO_NATIVE_APP_KEY=...` 또는 `android/local.properties` |
| **iOS 빌드** | `KAKAO_NATIVE_APP_KEY` | `ios/App/App/Kakao.local.xcconfig` (example 복사) 또는 `KAKAO_NATIVE_APP_KEY=... xcodebuild` |

Native app key는 **서버 env에 넣지 않음** — Android Gradle / iOS Info.plist 빌드 시만 주입.

## Android

1. Kakao Developers — Native app key 발급
2. 플랫폼 등록: package **`com.dibay.app`**, **key hash** (debug/release 각각)
3. `android/local.properties.example` → `local.properties` 복사 후 key 설정
4. Gradle `resValue`: `kakao_login_scheme` = **`kakao{NATIVE_APP_KEY}`** (key 없으면 빈 scheme → plugin `kakao_native_config_error`)
5. `DibayApplication` — `KakaoSdk.init`
6. `NativeKakaoAuthPlugin` — `loginWithKakaoTalk` → `loginWithKakaoAccount`

Key hash 생성 (debug):
```bash
keytool -exportcert -alias androiddebugkey -keystore ~/.android/debug.keystore -storepass android -keypass android | openssl sha1 -binary | openssl base64
```

## iOS

1. Kakao Developers — iOS bundle **`com.dibay.app`**
2. `Kakao.local.xcconfig.example` → `Kakao.local.xcconfig` (gitignored)
3. `Info.plist`: `KAKAO_NATIVE_APP_KEY` = `$(KAKAO_NATIVE_APP_KEY)`, URL scheme = **`kakao$(KAKAO_NATIVE_APP_KEY)`**
4. `AppDelegate` — `AuthController.handleOpenUrl` (카카오톡 + 계정 로그인 oauth)
5. Xcode SPM: `kakao-ios-sdk` (project.pbxproj)

## 서버 exchange

클라 `accessToken` → Kakao REST `access_token_info` + `/v2/user/me` → `provider_user_id` → Admin user upsert → `signInWithPassword` → profile bootstrap → onboarding gate → cookies.

## 로그아웃 / A→B

`logoutCurrentDevice` → `NativeKakaoAuth.signOut()` → `wipeClientSessionState`

## 검증

```bash
npm run verify:kakao-native-contract
npx vitest run lib/auth/native
npx cap sync android
npx cap sync ios
```

## Production 501 제거 (Kakao)

| errorCode | 원인 |
|-----------|------|
| `native_provider_not_implemented` | **Kakao 해당 없음** (Google/Facebook stub만) |
| `native_exchange_session_unavailable` | `SUPABASE_SERVICE_ROLE_KEY` 미설정 |
| `kakao_native_exchange_disabled` | `AUTH_KAKAO_NATIVE_EXCHANGE_ENABLED=false` |
| `kakao_native_session_failed` | Admin upsert 후 `signInWithPassword` 실패 |
| `native_exchange_verify_failed` | Kakao token invalid / REST 401 |

배포: Vercel에 최신 `/api/auth/native/exchange` + service role 필요. WebView는 `samarket.vercel.app` 원격 로드.
