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

## Logcat 설정

Android Studio → Logcat → 필터:

```
oauth|appUrlOpen|authCallback
```

또는 Chrome Remote Debugging → WebView console (Capacitor Inspect)

## Native OAuth 시작 흐름 (fetch-then-open)

Capacitor 앱은 **PKCE 쿠키가 WebView에 있어야** `/auth/callback` code exchange가 성공합니다. Custom Tab에 start URL만 열면 PKCE가 분리되어 실패합니다.

1. 로그인 버튼 → `useOAuthLogin` → `setOAuthPending`
2. WebView `GET /api/auth/oauth/start?provider=...&launch=native` (`Accept: application/json`, `credentials: include`)
3. 서버 `signInWithOAuth({ skipBrowserRedirect: true })` → JSON `{ authorizeUrl }` + PKCE `Set-Cookie`
4. WebView `Browser.open(authorizeUrl)` → Custom Tab provider UI
5. provider → `dibay://auth/callback?code=...` → `appUrlOpen` → HTTPS `/auth/callback` 브릿지 → exchange

웹/PWA는 동일 start route를 **302**로 provider authorize URL에 리다이렉트합니다 (`location.assign`).

### 필수 확인 (provider별)

OAuth 시작 직후:

- WebView fetch: `/api/auth/oauth/start?provider=...&launch=native`
- 응답: `{ ok: true, authorizeUrl, provider, redirectTo }`
- `redirectTo`: `dibay://auth/callback?provider=...`
- 2초 안에 Custom Tab 표시

앱 복귀:

- `appUrlOpen` 이 `dibay://auth/callback?code=...` 수신
- 앱 WebView가 `/auth/callback?...` 으로 replace
- Supabase 세션 authenticated

## PASS / FAIL 기준

### PASS

- `redirectTo` = `dibay://auth/callback?provider=...`
- `redirect_to` = `dibay://auth/callback?provider=...` (동일 scheme)
- `appUrlOpen` 이 `dibay://auth/callback?...` 수신
- `[authCallback] exchange_success` 출력
- 앱 내부 로그인 상태 (프로필·보호 화면 접근)
- Chrome/Custom Tab에 `samarket.vercel.app` 로그인 완료 화면 **잔류 없음**
- 앱 완전 종료 후 재실행 → 로그인 유지
- 로그아웃 후 guest, OAuth 찌꺼기 없음

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

## 관련 문서

- [secure-auth-oauth-setup.md](./secure-auth-oauth-setup.md)
- [store-review-auth-setup-checklist.md](./store-review-auth-setup-checklist.md)

## npm

```bash
npm run verify:native-oauth-redirect-contract
```

코드 계약 자동 검증 (실기기 E2E 대체 아님).
