# P2 iOS Apple Native 실기기 QA 체크리스트

**STEP 2.7 배포 준비 완료 후** 진행. Native Apple Login **완료 선언**은 아래 PASS 전부 후에만.

## 사전 조건 (STEP 2.7)

- [ ] Apple Native 변경사항 **Vercel production/preview 배포** 완료
- [ ] Vercel env: `AUTH_APPLE_NATIVE_EXCHANGE_ENABLED=true` + aud env
- [ ] redeploy after env change
- [ ] `npm run cap:sync:ios` 완료
- [ ] Xcode Team + Sign in with Apple capability
- [ ] iPhone 실기기 Run

> WebView는 `https://samarket.vercel.app` — **배포 전 실기기 QA 무의미**.

## 1. Happy path — 신규 Apple 계정

- [ ] 로그인 화면 → Apple 버튼
- [ ] iOS Apple sheet 표시
- [ ] Face ID / Apple ID 인증
- [ ] Console: `apple_native_started` → `apple_native_success`
- [ ] Network: `POST /api/auth/native/exchange` → **200**
- [ ] Response: `sessionEstablished: true`, `signupComplete: false`
- [ ] signup gate(약관) 이동
- [ ] DB: `provider=apple`, `provider_user_id=sub`, synthetic auth email

## 2. Happy path — 기존 Apple 계정

- [ ] 동일 Apple ID 재로그인
- [ ] 기존 profile 연결 (신규 profile 미생성)
- [ ] `signupComplete=true`면 홈/ next 이동

## 3. 실패 케이스

| 케이스 | 기대 |
|--------|------|
| Sheet 취소 | `apple_native_cancelled`, OAuth lock release, 즉시 재시도 |
| token missing | `apple_native_token_missing`, session 없음 |
| aud mismatch (env off) | 401 `apple_token_invalid_audience`, profile 없음 |
| exchange disabled | 501, `auth_err_apple_native_not_ready` |
| network fail | session 없음, 재시도 가능 |

## 4. Session / logout

- [ ] SupabaseAuthSync session 인식
- [ ] `/api/me/signup-status` 정상
- [ ] 로그아웃 → 앱 종료 → 재실행 → session 미복구
- [ ] 뒤로가기 private 화면 미노출

## 5. A→B 수동 (iOS)

- [ ] Apple A 로그인 → private 화면
- [ ] 로그아웃 → B 로그인
- [ ] A private URL 접근 시 A 데이터 1프레임도 미노출

## 6. DB 금지 확인

- [ ] email만으로 기존 계정 병합 없음
- [ ] relay email 병합 없음
- [ ] verify 실패 후 profile 생성 없음

## 완료 판정

위 PASS + 코드 검증(`npm run verify:ios-apple-native-contract` 등) 후에만 **Native Apple Login 완료** 보고.

Kakao STEP 3는 Apple iOS 실측 완료 후.
