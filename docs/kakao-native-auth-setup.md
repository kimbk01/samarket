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
6. `NativeKakaoAuthPlugin` — `loginWithKakaoTalk` → (talk 실패·취소 제외) `loginWithKakaoAccount` 자동 전환
7. `AuthCodeHandlerActivity` — `android:launchMode="singleTask"`

Key hash 생성 (debug):
```bash
keytool -exportcert -alias androiddebugkey -keystore ~/.android/debug.keystore -storepass android -keypass android | openssl sha1 -binary | openssl base64
```

## iOS

1. Kakao Developers — iOS bundle **`com.dibay.app`**
2. **제품 경로 (2026-08-04):** iOS Capacitor 카카오는 **Supabase Web OAuth + Custom Tab** (`web_oauth_start`).  
   Native `loginWithKakaoTalk` 복귀는 실측상 `open_url handled=1` 이후 token callback 미도착 → 사용 중단. Google iOS 와 동일 계열.
3. Android 만 Native Kakao SDK (`Talk → Account fallback`) 유지.
4. `Kakao.local.xcconfig` / Info.plist scheme 은 Android·향후 Native 재개용으로 유지 가능.

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

## Android talk 로그인 실패 (2026-06 실제 사례)

| 항목 | 내용 |
|------|------|
| **증상** | `KakaoTalk is installed but not connected to Kakao Developers` → UI `kakao_native_key_hash_required` |
| **오해** | 키 해시 미등록 — Logcat `Utility.getKeyHash` 와 콘솔 값은 **일치**했음 |
| **실제 원인** | **코드 버그** — talk 실패 시 `loginWithKakaoAccount` fallback 미구현. 카카오 공식 샘플은 talk 실패(취소 제외) 시 account 경로 재시도 |
| **수정** | `NativeKakaoAuthPlugin` (Android/iOS) talk → account 자동 전환 |
| **iOS** | 동일 패턴 적용. iOS는 key hash 대신 **Bundle ID**(`com.dibay.app`) 등록 — Kakao Developers DIBAY iOS 플랫폼 키 |

talk만 실패하고 account로 성공하면 Logcat: `kakao_native_talk_fallback_account` → `kakao_native_account_login` → `kakao_native_success`.

## 안정성 (double-check)

| 항목 | Android | iOS |
|------|---------|-----|
| talk → account fallback | ✅ | ✅ |
| `pendingCall` — me()/exchange 완료까지 유지 | ✅ | ✅ |
| Activity destroy / plugin deinit 시 reject | `handleOnDestroy` | `deinit` |
| 중복 signIn | `kakao_native_in_flight` | 동일 |
