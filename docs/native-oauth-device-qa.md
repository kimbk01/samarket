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
| Redirect URLs (권장) | `dibay://**` |

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

### 필수 로그 (provider별)

OAuth 시작 직후:

```
[oauth] provider { value: "google" | "kakao" | "apple" }
[oauth] isNative { value: true, ... }
[oauth] redirectTo { value: "dibay://auth/callback?provider=..." }
[oauth] redirect_to { value: "dibay://auth/callback?provider=..." }
[oauth] authorizeHost { value: "<project>.supabase.co" }
```

앱 복귀:

```
[appUrlOpen] url { value: "dibay://auth/callback?code=..." }
[appUrlOpen] bridgedUrl { value: "https://samarket.vercel.app/auth/callback?code=..." }
[appUrlOpen] browser_close_ok
  또는
[appUrlOpen] browser_close_failed
[authCallback] exchange_success { provider: "..." }
```

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
| `redirect_to` null + launch 중단 | authorize URL 이상 — `[oauth] redirect_to_missing` |
| `appUrlOpen` 없음 | AndroidManifest / APK 구버전 |
| `appUrlOpen` O, `exchange_failed` | callback / code exchange |
| Custom Tab만 로그인됨 | `browser_close_failed` — 앱은 PASS 가능, UX 점검 |

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
