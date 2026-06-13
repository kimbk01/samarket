# DIBAY Native OAuth — Android 실기기 QA

카카오톡·배민·당근 수준 **앱 로그인 UX** 검증용 체크리스트입니다.

## 사전 준비

### 1. Vercel 배포

- [ ] 최신 웹 코드가 `https://samarket.vercel.app` 에 배포됨
- [ ] 로그인 화면에서 OAuth 관련 JS 번들이 최신 커밋 반영

### 2. Supabase Redirect URLs

Dashboard → Authentication → URL Configuration

| 항목 | 값 |
|------|-----|
| Site URL | `https://samarket.vercel.app` |
| Redirect URLs (필수) | `https://samarket.vercel.app/**` |
| | `http://localhost:3000/**` |
| | `dibay://auth/callback` |
| | `dibay://auth/callback/**` |

### 3. Android APK 재빌드

```bash
npm install
npm run cap:sync:android
```

Android Studio → Open `android/` → Run on device

- [ ] `@capacitor/browser` 포함 확인 (cap sync 로그)
- [ ] AndroidManifest `dibay://auth/callback` intent-filter 유지

## A-plan 기준 (PASS 로그 — `NATIVE_OAUTH_PASS_LOG_EVENTS`)

코드 단일 정의: `lib/auth/oauth/native-oauth-contract.ts`

| 순서 | 이벤트 | 의미 |
|------|--------|------|
| 1 | `native_start_ok` | redirectTo = https capacitor-return |
| 2 | `capacitor_return_bridge` | Custom Tab https → dibay:// |
| 3 | `callback_app_url_open` | 앱 deep link 수신 |
| 4 | `callback_navigate` | WebView `/auth/callback` 이동 |
| 5 | `exchange_success` | Supabase 세션 확정 |

**Chrome Custom Tab UI는 PASS 조건이 아님.** FAIL은 `dibay://` 복귀·세션 exchange 실패.

## Logcat 설정

Android Studio → Logcat → 필터:

```
oauth|DIBAY_OAuth|NativeOAuthLauncher
```

또는 Chrome Remote Debugging → WebView console (Capacitor Inspect)

## Native OAuth 시작 흐름 (fetch-then-open)

Capacitor 앱은 **PKCE 쿠키가 WebView에 있어야** `/auth/callback` code exchange가 성공합니다. Custom Tab/Chrome에 start URL만 열면 PKCE가 분리되어 실패합니다.

**A안 UX (기본):** Google OAuth는 embedded WebView 금지. **앱 태스크 안 Custom Tab**(Chrome 엔진·상단 툴바)이 정상입니다.  
전체 Chrome 앱 전환(`ACTION_VIEW`)은 사용하지 않습니다. `OAuthCustomTabsLauncher`는 Capacitor `Browser.java` 와 동일하게 서비스 bind·session·provider 패키지를 사용합니다.

1. 로그인 버튼 → `useOAuthLogin` → `setOAuthPending`
2. WebView `GET /api/auth/oauth/start?provider=...&launch=native` (`Accept: application/json`, `credentials: include`)
3. 서버 `signInWithOAuth({ skipBrowserRedirect: true })` → JSON `{ authorizeUrl, redirectTo }` + PKCE `Set-Cookie`
4. `redirectTo` = `https://samarket.vercel.app/auth/oauth/capacitor-return?provider=...` (native — Custom Tab용 https 브릿지)
5. `NativeOAuthLauncher.open(authorizeUrl)` → Chrome/Custom Tab provider UI
6. provider → Supabase → `capacitor-return?code=...` → JS `dibay://auth/callback?code=...` → `appUrlOpen` / `DIBAY_OAuth intent_received` → HTTPS `/auth/callback` 브릿지 → exchange

웹/PWA는 동일 start route를 **302**로 provider authorize URL에 리다이렉트합니다 (`location.assign`).

### 필수 확인 (provider별)

OAuth 시작 직후:

- WebView fetch: `/api/auth/oauth/start?provider=...&launch=native`
- 응답: `{ ok: true, authorizeUrl, provider, redirectTo }`
- `redirectTo`: `https://samarket.vercel.app/auth/oauth/capacitor-return?provider=...`
- 2초 안에 Custom Tab 표시

앱 복귀:

- `appUrlOpen` 이 `dibay://auth/callback?code=...` 수신
- 앱 WebView가 `/auth/callback?...` 으로 replace
- Supabase 세션 authenticated

## PASS / FAIL 기준

### PASS

- `redirectTo` = `https://samarket.vercel.app/auth/oauth/capacitor-return?provider=...`
- Logcat: `custom_tabs_service_connected` · `custom_tabs_launch package=...` · `oauth_external_launch method=custom_tabs`
- **전체 Chrome 앱 전환은 FAIL** (`action_view` 로그가 있으면 구 APK)
- Logcat/WebView: `[oauth] native_start_ok` · `redirectTo=https://samarket.vercel.app/auth/oauth/capacitor-return...`
- Custom Tab: `[oauth] capacitor_return_bridge` (https → dibay:// 핸드오프)
- Logcat/WebView: `[oauth] callback_app_url_open` 또는 `DIBAY_OAuth intent_received`
- Logcat/WebView: `[oauth] callback_bridge` → `[oauth] callback_navigate`
- `[oauth] exchange_success` 출력
- 앱 내부 로그인 상태 (프로필·보호 화면 접근)
- `/mypage` 또는 `next` 경로 이동
- pending OAuth 상태 삭제

### FAIL

| 증상 | 원인 |
|------|------|
| Chrome에 `samarket.vercel.app` 로그인 완료, 앱 guest | redirect whitelist / deep link 미복귀 |
| `redirectTo` dibay + `redirect_to` https | Supabase Redirect URLs |
| 둘 다 https | native 감지 실패 |
| Custom Tab 미오픈 | Browser plugin / APK 구버전 / 기기 정책 |
| `fetch` start 실패 | 네트워크·서버 start route |
| `appUrlOpen` 없음 | AndroidManifest / APK 구버전 |
| `appUrlOpen` O, `exchange_failed` | callback / code exchange |
| Custom Tab만 로그인됨 | Browser.close 실패 가능 — 앱 복귀/session 기준으로 판정 |

## Provider별 기록표

| Provider | redirectTo dibay | redirect_to dibay | appUrlOpen | exchange_success | Chrome 잔류 없음 | 재실행 유지 | 결과 |
|----------|------------------|-------------------|------------|------------------|------------------|-------------|------|
| Google | | | | | | | PASS / FAIL |
| Kakao | | | | | | | PASS / FAIL |
| Apple | | | | | | | PASS / FAIL |

테스트 일자: ___________  
기기: ___________  
APK 빌드: ___________  
Vercel 배포: ___________

## Naver native 선택 A(P0)

- 현재 Naver는 Google/Kakao/Apple과 같은 `/auth/oauth/launch` Custom Tab fetch flow가 아니다.
- start는 기존 `window.location.assign('/api/auth/naver/start')` 경로를 유지한다.
- native 요청일 때 Naver `redirect_uri`만 `https://samarket.vercel.app/auth/oauth/capacitor-return?provider=naver` 로 맞춘다.
- launch page 통일은 P1에서 별도 구현한다.

## Provider별 참고

### Google

- Custom Tab에서 Google 계정 선택 OK
- WebView 내부 Google OAuth 금지 (disallowed_useragent 방지)

### Kakao

- KakaoTalk 설치 시 앱 전환 가능 (Kakao 페이지 정책)
- 미설치 시 Kakao Account 웹 인증 fallback OK
- Kakao SDK 미사용 — KakaoTalk 우선은 **보장되지 않음**

### Apple

- Android: 웹 인증 fallback OK
- iOS native Apple Sign-In: 별도 트랙 (미구현)

## 로그아웃 후 찌꺼기 확인

- [ ] 로그아웃 → 로그인 화면 guest
- [ ] Chrome/Custom Tab 열리지 않음
- [ ] 재로그인 시 이전 세션 간섭 없음

## Auth 시나리오 매핑 (§10)

| 시나리오 | 자동 테스트 | Device QA |
|----------|-------------|-----------|
| 신규/기존 Google·Kakao·Apple | `native-oauth-contract`, callback route | A-plan PASS 로그 |
| Naver native | `naver/start` route assign + capacitor-return redirect | **선택 A(P0)**: start는 web route assign 유지, redirect bridge만 통일 |
| 회원가입 중 앱 종료 | `dibay-signup-status` unit | 약관/@id gate 재진입 |
| 로그아웃 후 뒤로가기 | `auth-session-isolation` E2E | bfcache guard |
| 로그아웃 후 private URL | E2E + proxy | guest redirect |
| A→B 계정 전환 | `auth-session-isolation-contract` | 이전 채팅/주문 미노출 |
| OAuth callback 중복 | `OAuthReturnListener` test | double tap |
| Apple/Kakao 취소 | P2 native error mapping | 조용히 닫기 |
| Native SDK exchange | `native-token-exchange` (501 stub) | P2 device |

## 관련 문서

- [secure-auth-oauth-setup.md](./secure-auth-oauth-setup.md)
- [auth-provider-matrix.md](./auth-provider-matrix.md)
- [auth-session-contract](../scripts/verify-auth-session-contract.mjs) — `npm run verify:auth-session-contract`
- [store-review-auth-setup-checklist.md](./store-review-auth-setup-checklist.md)

## npm

```bash
npm run verify:native-oauth-redirect-contract
```

코드 계약 자동 검증 (실기기 E2E 대체 아님).
