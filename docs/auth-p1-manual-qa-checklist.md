# DIBAY Auth P1 수동 QA 체크리스트

**상태:** P0 · P1 **사실상 완료** — P2는 [dibay-auth-roadmap.md](./dibay-auth-roadmap.md) STEP 1~6

**판정:** 이전 사용자 정보가 **1프레임이라도** 보이면 FAIL. private route는 login/gate/403/404 처리.

---

## P0 · P1 최종 판정 (완료)

| 항목 | 결과 | 비고 |
|------|------|------|
| P0 Auth 정책 | **PASS** | account switch wipe · OAuth mutex · session contract |
| signupComplete 정책 | **PASS** | `deriveDibaySignupStatus` · client gate 정렬 |
| 기존 로그인 / 신규 회원가입 분기 | **PASS** | terms/id/profile gate 분기 |
| 로그아웃 E2E | **PASS** | confirm modal → `/api/auth/logout` → public route |
| A→B 계정전환 E2E | **PASS** | B 세션에서 A private URL · label · localStorage leak 없음 |
| A→B E2E 실행 안정성 | **Flaky** | CSR hydrate·dev cold start·연속 실행 시 간헐 FAIL (제품 leak 아님) |
| Chrome / Edge / Firefox 수동 QA | **미실행** | 아래 표 ☐ 유지 |
| Android OAuth / 로그아웃 수동 QA | **미실행** | 아래 표 ☐ 유지 |
| Native SDK 로그인 | **미완료** | P2 STEP 1~6 |

### P2 (현재 작업)

→ [dibay-auth-roadmap.md](./dibay-auth-roadmap.md) — STEP 1 Apple Native SDK

---

## 사전 준비

- `npm run dev` (웹) 또는 Android debug build
- 테스트 계정 A / B (서로 다른 Supabase user)
- 시크릿/일반 창 분리 권장

---

## Playwright 자동화 (Chromium proxy)

```bash
# 터미널 1
npm run dev

# 터미널 2 — B 계정 env 없으면 A→B SKIP (PASS 아님)
E2E_TEST_USERNAME=aaaa \
E2E_TEST_PASSWORD=1234 \
E2E_TEST_USERNAME_B=bbbb \
E2E_TEST_PASSWORD_B=1234 \
PLAYWRIGHT_NO_WEBSERVER=1 \
npx playwright test tests/e2e/auth-session-isolation.spec.ts -g "A logout B" --trace on
```

**자동화 결과 (2026-06-14):**

| 테스트 | 결과 |
|--------|------|
| logout clears bound user | **PASS** |
| logout from private room / history back | **PASS** |
| A logout B login (session isolation) | **PASS** (Flaky — 단독·warm dev 권장) |

실패 시: `test-results/` 하위 `trace.zip`, screenshot 확인. (`playwright.config.ts` video off — `--video on` CLI 미지원)

---

## Chrome / Edge / Firefox (각 브라우저 반복)

| # | 시나리오 | PASS | FAIL 메모 |
|---|----------|------|-----------|
| 1 | 신규 SNS 로그인 → signup gate (terms/id/profile) | ☐ | |
| 2 | 기존 SNS 로그인 → 홈 또는 미완 gate | ☐ | |
| 3 | `/mypage/logout` → confirm → `/` 또는 `/login` | ☐ | |
| 4 | 로그아웃 후 **뒤로가기** — private 화면/skeleton 없음 | ☐ | |
| 5 | 로그아웃 후 private URL 직접 입력 → login/gate | ☐ | |
| 6 | **새로고침** — 이전 사용자 정보 없음 | ☐ | |
| 7 | 브라우저 **완전 종료 후 재시작** — session 복구 없음 | ☐ | |

---

## A→B 계정 전환 (수동)

**A:** 로그인 → 채팅방 → 주문 상세 → 프로필 → owner/admin(가능 시)  
**로그아웃 → B 로그인**

| # | 시나리오 | PASS | FAIL 메모 |
|---|----------|------|-----------|
| 1 | B 로그인 후 A 닉네임/프로필 미노출 | ☐ | |
| 2 | A 채팅 URL 직접 입력 | ☐ | |
| 3 | A 주문 URL 직접 입력 | ☐ | |
| 4 | A 프로필 URL 직접 입력 | ☐ | |
| 5 | owner/admin URL 직접 입력 | ☐ | |
| 6 | 뒤로가기 — A 데이터 flash 없음 | ☐ | |

---

## Android 앱

| # | 시나리오 | PASS | FAIL 메모 |
|---|----------|------|-----------|
| 1 | Google 로그인 시작/복귀 | ☐ | |
| 2 | Google **취소** → 재시도 가능 (lock 없음) | ☐ | |
| 3 | Kakao 로그인 시작/복귀 | ☐ | |
| 4 | Kakao **취소** → 재시도 가능 | ☐ | |
| 5 | Naver 로그인 (선택 A: route assign + bridge) | ☐ | |
| 6 | 로그아웃 → 앱 **종료** → **재실행** | ☐ | |
| 7 | 뒤로가기 — private 화면 없음 | ☐ | |
| 8 | 이전 채팅 URL 직접 접근 | ☐ | |

---

## OAuth UX

| # | 시나리오 | PASS | FAIL 메모 |
|---|----------|------|-----------|
| 1 | provider 버튼 **더블탭** — 중복 authorize 없음 | ☐ | |
| 2 | OAuth 시작 후 **취소/뒤로가기** — 30~45s lock 잔존 없음 | ☐ | |
| 3 | 다른 provider 연속 클릭 — mutex 동작 | ☐ | |

---

## Native SDK (코드 기준 — **미완료**)

> **주의:** Native SDK 로그인은 **아직 구현 완료가 아니다.**  
> 현재 Google / Kakao / Apple은 **Web OAuth + Custom Tab** 기반이다.

| Provider | 방식 | Native SDK |
|----------|------|------------|
| Google | Web OAuth + Custom Tab | SDK **미도입** (Custom Tab = Google 권장 패턴) |
| Apple | Web OAuth + Custom Tab | **Native SDK 미구현** (P2) |
| Kakao | Web OAuth + Custom Tab | **Native SDK 미구현** (P2) |
| Naver | 선택 A: `/api/auth/naver/start` + capacitor-return bridge | launch page Custom Tab 통일 **P2** |
| Native exchange | `POST /api/auth/native/exchange` | **501 스텁** (P2 token verify) |

**Native SDK 로그인 구현 완료: 아니오**
