# 재가입 직후 내정보 「내 프로필」·「필수 정보」 스켈레톤 고착 — 원인 감사 (2026-11-27)

판정: **FAIL** — Owner iPhone · 운영 `2203d00` · 08:57 PHT · 재가입 계정 `0d08ec52`(수현강, Google) · 앱 재시작하면 정상 (Owner 확인).
증거 캡처: `registration-keyboard-cta-2026-11-27/app-prod-2203d00/owner-iphone-mypage-skeleton-0857.jpg`

## 1. 원인 (한 줄)
로그아웃이 남기는 「로그아웃 직후 프로필 복원 막기」 표시(`sessionStorage samarket:post_logout_guard=1`)가
iOS 웹 로그인(서버 콜백) → 가입 단계 화면(`/auth/onboarding/*`) 경로에서는 **지워지지 않아**, 로그인 사용자 캐시(`getCurrentUser()`)가 끝까지 비고,
내정보 카드 조회 훅이 「사용자 id 없음」으로 조회를 시작하지 않아 스켈레톤에 머문다. 재시작하면 표시가 사라져 정상.

## 2. 운영 기록 대조 (PHT)
| 시각 | 기록 | 출처 |
|---|---|---|
| 08:53:43 | 로그아웃 → 세션 401 → `/login` | Vercel |
| 08:55:10 | `/auth/oauth/capacitor-return` → `/auth/callback` 307 (iOS = 웹 로그인, 서버 콜백) · 새 회원 생성 `user_signedup` (iPhone UA) | Vercel · Supabase auth |
| 08:55:12~13 | `/auth/onboarding/terms` 문서 · 앱 진입 2회(`/api/telemetry/entry`) · `/api/me/profile` 200 (부팅 프로필) | Vercel |
| 08:55:27 / 08:56:19 / 08:56:57 | 동의 · 전화 인증 · 주소 저장 | 운영 DB |
| 08:56:59 | 가입 완료 토큰 갱신 · `/home` **앱 안 이동**(새 문서 아님 — 진입 기록 없음) | Supabase auth · Vercel |
| 08:57:02 | MY: `mypage-summary` 만 요청 · **`/api/me/profile`·`/api/me/address-defaults` 0건** | Vercel |

## 3. 코드 연결 (운영 main `2203d00`)
1. 로그아웃(또는 탭 계정 전환) → `wipeClientSessionState(..., { setPostLogoutGuard: true })` (`lib/auth/reset-auth-state.ts:10`, `components/auth/SupabaseAuthSync.tsx:118`).
2. 표시가 있으면 `setSupabaseProfileCache(profile)` 무시 (`lib/auth/supabase-profile-cache.ts` `isPostLogoutProfileRehydrateBlocked`). 앱 부팅 프로필(하단 탭 사진)은 따로 채워진다.
3. 표시를 지우는 곳은 둘뿐: `runCommonAuthClientCompletion`(앱 안 로그인 완료 — Android 네이티브 Google·아이디 로그인) · `PostLogoutBfcacheGuard` 의 부팅 준비 이벤트(**`(main)` 트리에만 마운트** `MainAppProviderTree.tsx:211`).
   iOS Google = 웹 로그인(`isNativeGoogleLoginAvailable` = Android 만) → 서버 콜백 → `/auth/onboarding/terms`(루트 레이아웃만) → 둘 다 실행 안 됨.
4. 가입 단계 → `/home` 은 앱 안 이동이라 부팅 준비 이벤트가 다시 나지 않음 → 표시 유지 · 캐시 null.
5. MY: 회원 판정 member 라 화면은 켜지나 `use-mypage-home-model.ts:169-170` `if (!viewerId) return;` → 조회 0 · `projection=null` · 오류/재로그인도 아님 → 두 카드 스켈레톤. 다시 도는 조건은 `enabled` 변화·로그인 변경 신호뿐.

## 4. 재현 (실제 모듈, 로컬 vitest jsdom)
`app-prod-2203d00/repro-signup-mypage-skeleton.test.tsx.txt` — 표시 설정 → 부팅 프로필·캐시 넣기 → `PostLogoutBfcacheGuard` 나중 마운트 → `useMypageHomeModel(true)`.
결과: `getCurrentUser()=null`, 표시 유지, `{"projection":null,"needsRelogin":false,"loadFailed":false}`, fetch 0건. 표시를 지우면 캐시 정상(= 재시작 결과와 같음).

## 5. 최근 변경 때문인가 — 아니다 (이력)
| 연결 고리 | 들어온 때 |
|---|---|
| 표시 지우는 컴포넌트 `(main)` 에만 마운트 | 06-06 `363279879` |
| 로그아웃 때 표시 설정 | 06-12 `7ec0e03f1` |
| 표시가 있으면 캐시 넣기 무시 | 06-13 `7c6782947` |
| 서버 콜백 → `/auth/onboarding/terms` | 06-11 기준 파일부터 |
| 내정보 훅 「id 없으면 조회 안 함」 | 07-29 `39fd9f108` |
| 동의 뒤 앱 안 이동(`guardedRouterReplace`) | 11-20 이전과 같음 |
11-20·11-24 가입 SSOT, 11-27 #643(가입 화면 v3) 는 이 연결의 어느 고리도 바꾸지 않았다(diff 확인). 같은 앱 세션에서 로그아웃 → iOS(웹 로그인) → 가입 단계를 거치는 회원 — 이번 재가입 시험이 처음 밟은 경로다.

## 6. 로그인 방식별 판정 (경로 = `lib/auth/oauth/oauth-native-routing.ts:62-131`)
표시를 지우는 곳: 앱 안 완료 `runCommonAuthClientCompletion`(`finishClientAuthLogin` → 79행) · `(main)` 의 `PostLogoutBfcacheGuard`(부팅 준비 신호).

| 방식 | iOS | Android | 웹 브라우저 |
|---|---|---|---|
| Google | 웹 로그인(서버 콜백) → **FAIL** (Owner iPhone 08:57 실측) | 앱 안 SDK → 완료 처리에서 삭제 → 정상 | 서버 콜백 → **FAIL**(같은 구조) |
| Apple | 앱 안 SDK(AuthenticationServices) → 정상 | 웹 로그인(서버 콜백) → **FAIL** | 서버 콜백 → **FAIL** |
| 카카오 | 웹 로그인(서버 콜백, `ios_kakao_web_oauth_by_design`) → **FAIL** | 앱 안 SDK → 정상 | 서버 콜백 → **FAIL** |
| 아이디 | 앱 안 완료 → 정상 | 앱 안 완료 → 정상 (Samsung w테스트1 09:00 MY 정상 화면) | 정상 |

FAIL 조건 = ① 같은 앱 실행에서 로그아웃(또는 계정 전환) ② 서버 콜백 경로 ③ 가입 단계(`/auth/onboarding/*`)를 거침(신규 회원·단계 미완료 회원).
가입이 끝난 기존 회원은 서버 콜백이 메인 화면 문서로 바로 보내 `PostLogoutBfcacheGuard` 가 먼저 붙고 부팅 준비 때 표시를 지운다 → 정상(시험 C).
판정 근거: 실측은 iOS Google(FAIL)·Android 아이디(정상)만. 나머지 칸은 경로 코드 + 실제 모듈 시험(`repro-login-paths.test.tsx.txt` A·B·C) — 기기 실측 아님.
최근 30일 신규 가입: 아이디(email) 32 · 카카오 13 · Google 3 · Apple 1 (운영 DB).

- 내정보 외: `getCurrentUser()` 를 쓰는 다른 화면도 같은 세션에서 사용자 없음으로 볼 수 있음 — 미조사.

## 7. 수정 방향 (Owner 승인 전 — 코드 변경 없음)
- 근본: 「새 로그인 세션이 확정되면 표시를 지운다」를 로그인 경로와 무관하게 한 곳에서(루트 `SupabaseAuthSync` 의 SIGNED_IN/INITIAL_SESSION 사용자 확정 또는 부팅 준비 — 루트 레이아웃에 있는 쪽) 처리하고 그 직후 캐시를 채운다.
- 내정보 훅이 사용자 id 가 늦게 생겨도 다시 조회하도록(로그인 변경 신호 구독은 있으나 캐시 채움이 신호를 못 내는 경우 포함) 보완할지는 설계 때 판단.
