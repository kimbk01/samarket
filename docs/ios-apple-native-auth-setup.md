# iOS Apple Native Auth Setup (P2 STEP 2.5)

## 프로젝트 상태

| 항목 | 값 |
|------|-----|
| Xcode | `ios/App/App.xcodeproj` |
| Bundle ID | `com.dibay.app` |
| Capacitor server.url | `https://samarket.vercel.app` |
| 플러그인 | `ios/App/App/Plugins/NativeAppleAuthPlugin.swift` |
| Entitlements | `ios/App/App/App.entitlements` (Sign in with Apple) |

## 최초 설정

```bash
npm install
npx cap sync ios
npm run cap:open:ios
```

## Xcode (수동 — 실기기 QA 전 필수)

1. **Signing & Capabilities** → Team 선택
2. **Sign in with Apple** capability 확인 (entitlements 파일과 일치)
3. Bundle Identifier: `com.dibay.app`
4. iPhone 실기기 선택 → Run

Associated Domains는 Native Apple SDK 로그인에 **필수 아님**.

## Apple Developer

1. App ID `com.dibay.app` 에 **Sign in with Apple** 활성화
2. Provisioning Profile 자동 생성 확인

## Vercel env (production / preview)

```
AUTH_APPLE_NATIVE_EXCHANGE_ENABLED=true
AUTH_APPLE_NATIVE_CLIENT_ID=com.dibay.app
AUTH_APPLE_WEB_CLIENT_ID=com.dibay.login2
```

또는:

```
AUTH_APPLE_NATIVE_AUDIENCES=com.dibay.app,com.dibay.login2
```

`AUTH_APPLE_NATIVE_EXCHANGE_ENABLED` 가 `true`가 아니면 exchange **501**.

## Console 로그 필터

Xcode Console / Safari Web Inspector:

```
DIBAY_Apple
apple_native_started
apple_native_success
apple_native_cancelled
apple_native_token_missing
[oauth]
```

## 실기기 QA 체크리스트

상세: [auth-p2-ios-apple-device-qa.md](./auth-p2-ios-apple-device-qa.md)

## Capacitor 플러그인

`CAPBridgedPlugin` — App target compile 시 자동 등록. Android와 달리 AppDelegate `registerPlugin` 불필요.

JS: `NativeAppleAuth.signIn()` → `POST /api/auth/native/exchange`
