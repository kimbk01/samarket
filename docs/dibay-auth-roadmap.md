# DIBAY Auth 진행 순서 (Cursor 작업 순서)

**단일 기준 문서.** 다른 Auth 문서와 어긋나면 **본 파일을 먼저** 고친다.

## 원칙

- **P0 / P1을 다시 건드리지 않는다.**
- **한 번에 하나의 STEP만** 진행한다. 완료 후 다음 STEP으로 넘어간다.
- **순서를 건너뛰지 않는다.**
- **추측 금지** — 실제 코드·실측 기준으로만 판정한다.
- **Apple 완료 전 Kakao 작업 금지.**

## 최종 목표

배민 · 당근 · 요기요 · 카카오톡 수준의 **Native SDK 기반 Auth** 구조 완성

---

## P0 · P1 — 완료 (재작업 금지)

| 구분 | 상태 |
|------|------|
| P0 Auth 정책 | **완료** |
| signupComplete · login/signup 분기 | **PASS** |
| Web OAuth (Google Custom Tab · Apple/Kakao Web · Naver bridge) | **동작 중** |
| 로그아웃 E2E | **PASS** |
| A→B 계정전환 E2E | **PASS** (실행 Flaky — P2 중 재개 가능) |

P1 수동 QA 체크표(참고): [auth-p1-manual-qa-checklist.md](./auth-p1-manual-qa-checklist.md)

---

## 현재 Provider 상태

| Provider | 현재 | Native SDK |
|----------|------|------------|
| **Google** | Web OAuth + Custom Tab · **동작 중** | 미도입 (STEP 4 검토) |
| **Apple** | Web OAuth + **iOS Native SDK (STEP 1~2)** | **STEP 2.6~2.7** 실기기 QA · Vercel 배포 |
| **Kakao** | Web OAuth | **미구현** → STEP 3 (Apple 완료 후) |
| **Naver** | route assign + capacitor-return bridge | launch 통일 → STEP 5 |
| **Native exchange** | `POST /api/auth/native/exchange` — **Apple verify+session** (env enable) · Kakao **501** | STEP 2.7 배포 후 실기기 QA |

> Native SDK 로그인 **완료 아님** — Vercel 배포 + env + iPhone session 확인 전까지 완료 선언 금지.

---

## P2 진행 순서 (현재 작업)

```
STEP 1  Apple Native SDK
   ↓
STEP 2  /api/auth/native/exchange (apple)
   ↓
STEP 3  Kakao Native SDK
   ↓
STEP 4  Google Native SDK 검토
   ↓
STEP 5  Naver 통합
   ↓
STEP 6  iOS 프로젝트 · 실기기 QA
   ↓
배민·당근·요기요·카카오톡 수준 Auth
```

---

## STEP 1 — Apple Native SDK

**가장 먼저 Apple부터 구현한다.** Apple 완료 전 Kakao 작업 금지.

**현재:** Web OAuth + Custom Tab

**목표:** AuthenticationServices

```
ASAuthorizationAppleIDProvider
  ↓ identityToken
POST /api/auth/native/exchange
  ↓ Apple verify (서버)
Supabase session
  ↓
기존 DIBAY profile 연결
  ↓
로그인 완료
```

### 확인 (Apple Developer)

- Bundle ID · Team ID · Key ID · Services ID · Client Secret
- Associated Domains · callback URL

### 산출물

| 항목 | |
|------|--|
| 수정 파일 | |
| token verify 방식 | |
| session 생성 여부 | |
| iOS / Android 영향 | |

참고: [auth-native-sdk-feasibility.md](./auth-native-sdk-feasibility.md)

---

## STEP 2 — `/api/auth/native/exchange` 구현

**현재:** Apple identityToken JWKS verify + Supabase session (Admin + signInWithPassword). Kakao/Google **501**.

**코드:** `app/api/auth/native/exchange/route.ts` · `lib/auth/native/*`

**production enable:** `AUTH_APPLE_NATIVE_EXCHANGE_ENABLED=true` + aud env 필수.

```
provider token (클라)
  ↓ 서버 verify — token 직접 신뢰 금지
Apple 공개키 검증
  ↓
Supabase session 생성
  ↓
기존 profile 연결
  ↓
신규 회원 → signup flow / 기존 회원 → 로그인
```

### provider (STEP 2 범위)

| Provider | verify |
|----------|--------|
| **apple** | identityToken · Apple JWKS |

(Kakao · Google verify는 STEP 3 · 4 이후 확장)

### 요구

- provider token **직접 신뢰 금지**
- Web OAuth + Native exchange **동시 in-flight 금지** (mutex)

### 산출물

| 항목 | |
|------|--|
| 수정 파일 | |
| 보안 검증 | |
| 테스트 | |

---

## STEP 3 — Kakao Native SDK

**전제:** STEP 1 · 2 완료

```
Kakao SDK (Android · iOS)
  ↓ accessToken
POST /api/auth/native/exchange
  ↓ verify (서버)
Supabase session
  ↓
profile 연결
```

### 산출물

| 항목 | |
|------|--|
| 수정 파일 | |
| Android | |
| iOS | |
| 테스트 | |

---

## STEP 4 — Google Native SDK 검토

**현재:** Custom Tab 유지 **가능** (Google 정책상 허용)

**성급히 전환 금지.** 배민·당근 수준 UX와 비교 분석 후 결정.

| 안 | 내용 |
|----|------|
| **A안** | 현재 Web OAuth + Custom Tab **유지** |
| **B안** | Google Sign-In SDK → idToken → `/api/auth/native/exchange` |

### 산출물

| 항목 | |
|------|--|
| 결정 | A안 유지 **또는** B안 전환 |
| 근거 | |

---

## STEP 5 — Naver 통합

**현재 (선택 A):**

```
GET /api/auth/naver/start → capacitor-return bridge → /api/auth/naver/callback
```

**목표:** Google/Kakao와 **동일 UX**

```
launch page → Custom Tab → callback → session
```

### 산출물

| 항목 | |
|------|--|
| 수정 파일 | |
| Android | |
| iOS | |

---

## STEP 2.6 ~ 2.7 — Vercel 배포 · 실기기 QA

**STEP 2.7:** Apple Native 변경사항 커밋 · Vercel production/preview 배포 · env 설정.

**STEP 2.6:** iPhone 실기기 QA (배포+env **후**).

| 항목 | 상태 |
|------|------|
| 커밋 · push · Vercel build | STEP 2.7 |
| `AUTH_APPLE_NATIVE_*` env | Dashboard 수동 |
| Apple Sheet → exchange 200 → session | **실기기 QA 대기** |
| Native Apple Login 완료 | **아님** |

체크리스트: [auth-p2-ios-apple-device-qa.md](./auth-p2-ios-apple-device-qa.md)

---

## STEP 6 — iOS 프로젝트 · 실기기 QA (통합)

**실기기:** iPhone · iPad

| Provider | 검증 |
|----------|------|
| Apple · Kakao · Google · Naver | 로그인 · **취소** · **재시도** |
| 공통 | 로그아웃 · A→B 계정전환 · 앱 종료 후 재실행 · 뒤로가기 |

**PASS 기준:** 배민 · 당근 · 요기요 · 카카오톡 수준 UX

### 산출물

| 항목 | |
|------|--|
| iOS QA | PASS / FAIL |
| provider별 결과 | |
| 발견된 문제 | |

---

## 진행 현황 요약

| STEP | 내용 | 상태 |
|------|------|------|
| — | P0 · P1 (정책 · Web OAuth) | **완료** |
| **1** | Apple Native SDK (client · plugin · iOS shell) | **완료** |
| **2** | native exchange (apple verify + session) | **완료** (env enable) |
| **2.7** | 커밋 · Vercel 배포 · env | **진행** |
| **2.6** | iPhone 실기기 QA | **대기** (배포 후) |
| **3** | Kakao Native SDK | **금지** (Apple QA 전) |
| **4** | Google Native SDK 검토 | 미시작 |
| **5** | Naver launch 통합 | 선택 A (현재) |
| **6** | iOS provider 통합 QA | 미시작 |

---

## 관련 문서

| 문서 | 용도 |
|------|------|
| [auth-provider-matrix.md](./auth-provider-matrix.md) | Provider별 start · Native · SDK |
| [dibay-session-policy.md](./dibay-session-policy.md) | 세션·로그아웃·account switch (P0 — 변경 금지) |
| [auth-p1-manual-qa-checklist.md](./auth-p1-manual-qa-checklist.md) | P1 QA 참고 (완료) |
| [secure-auth-oauth-setup.md](./secure-auth-oauth-setup.md) | OAuth 운영 설정 |
| [auth-native-sdk-feasibility.md](./auth-native-sdk-feasibility.md) | Native SDK 타당성 |
| [auth-p2-ios-apple-device-qa.md](./auth-p2-ios-apple-device-qa.md) | Apple iOS 실기기 QA (배포 후) |
| [ios-apple-native-auth-setup.md](./ios-apple-native-auth-setup.md) | Xcode · entitlements · env |
| [native-oauth-device-qa.md](./native-oauth-device-qa.md) | 디바이스 OAuth QA |

**검증 명령 (P0 회귀 방지)**

```bash
npm run verify:auth-session-contract
npm run verify:native-oauth-redirect-contract
npm run verify:ios-apple-native-contract
```

---

## 부록 — P1 수동 QA (참고 · 필요 시 보완)

P1은 사실상 완료. 아래는 필요 시 보완용 체크리스트이다. **P2 STEP 진행을 막지 않는다.**

- Chrome / Edge / Firefox: 기존·신규 로그인 · logout · private URL · 새로고침
- Android Web OAuth: Google/Kakao/Naver · OAuth UX (더블탭 · 취소 · lock)
- A→B E2E Flaky 제거: `tests/e2e/auth-session-isolation.spec.ts`

상세: [auth-p1-manual-qa-checklist.md](./auth-p1-manual-qa-checklist.md)
