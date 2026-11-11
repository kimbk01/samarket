# DIBAY Auth HARD LOCK

**Status:** AUTH HARD LOCK  
**Locked at:** 2026-08-05  
**HEAD / Production:** `0d6da8324` (`0d6da83241498bbba6e53208c22928e2d62a521e`)  
**Product code change at lock:** 0  
**Code First Break:** NO / NOT PROVEN  

This document is the final operational freeze for the Auth program through Slice 9.  
It does **not** redesign Auth. It freezes Authority, SSOT, evidence, and reopen policy.

Companion rule: `.cursor/rules/dibay-auth-hard-lock.mdc`  
Evidence bundle: `.qa-logs/auth-slice10-hard-lock-2026-08-05/`

---

## 0. Program status at LOCK

| Stage | Status |
|---|---|
| Phase A | LOCK |
| Phase B | LOCK |
| Slice 1 | LOCK |
| Slice 2 | RUNTIME PASS / CLOSED |
| Slice 3 (Kakao) | BLOCKED / CLOSED |
| Slice 4 (Google) | PARTIAL_EXTERNAL_CLOSED |
| Slice 5 (Apple) | PARTIAL_EXTERNAL_CLOSED |
| Slice 6 (Common Completion) | DEPLOYED RUNTIME PASS / CLOSED |
| Slice 7 (Profile Writer) | RUNTIME PASS WITH EXISTING EXTERNAL LIMITATIONS / CLOSED |
| Slice 8 (State Machine) | DEPLOYED RUNTIME PASS / CLOSED |
| Slice 9 (Member Product) | AUTH MEMBER PRODUCT PASS WITH OPS LIMITATIONS / CLOSED |
| Slice 10 | **AUTH HARD LOCK** |

### Product PASS scope (Slice 9)

Directly verified PASS:

- Android Google (Samsung / Xiaomi)
- Session / Profile / Completion / Client Sync / Navigation (×1)
- Cold / Resume / Logout / Restore block
- A→B Account Isolation

Existing External (unchanged; not product FAIL):

- Kakao → BLOCKED / CLOSED
- Apple → PARTIAL_EXTERNAL_CLOSED
- Google iOS → PARTIAL_EXTERNAL_CLOSED

OPS NOT_RUN (Slice 9; not product FAIL):

- Email Admin/QA
- Windows Web

---

## 1. Authority LOCK

| Concern | Owner (final) | SSOT / modules |
|---|---|---|
| Session Lifecycle | `dibay-session-manager` / `DibaySessionPhase` | `lib/auth/dibay-session-manager.ts`, `lib/auth/dibay-session-policy.ts`, `lib/auth/state/auth-session-lifecycle-ownership-contract.ts` |
| Common Completion (client) | `finishClientAuthLogin` → `runCommonAuthClientCompletion` | `lib/auth/finish-client-auth-login.client.ts`, `lib/auth/completion/run-common-auth-client-completion.client.ts` |
| Profile Writer | `ensureAuthProfileForLogin` (+ Google hard gate `ensureProfileForUserId`) | `lib/auth/completion/ensure-auth-profile-for-login.server.ts`, Slice 7 contracts |
| Destination | `resolveCommonAuthDestination` | `lib/auth/completion/resolve-common-auth-destination.server.ts` |
| Client Sync | `syncCommonClientSessionAfterAuth` | Slice 6 Client Sync owner |
| Thin Handoff | `buildNativeAuthCompletionHandoff` | `lib/auth/completion/build-native-auth-completion-handoff.client.ts` |
| Identity | Provider login + `user_auth_identities` (PLAN_I2 boundary) | Slice 7-4 identity I2 contracts |
| State Boundary | PLAN_B4 · NO_MEGA_FSM | `lib/auth/state/auth-state-boundary-contract.ts` |
| Provider Boundary | Adapter / native start → Thin Handoff only | `lib/auth/state/auth-completion-provider-ui-boundary-contract.ts` |
| Observability | `auth-lifecycle-trace` (PLAN_T1; non-driving) | `lib/auth/oauth/auth-lifecycle-trace.ts`, Slice 8-2 contract |
| UI Presentation | loading / error / handoff forward only | Slice 8-4 UI forwarders |
| QA External Classification | QA tokens ≠ product enums | `lib/auth/state/auth-external-classification-contract.ts` |

### Forbidden under HARD LOCK (without reopen)

- Unified mega Auth FSM
- Dual Completion pipelines for the same request
- Provider/UI owning Destination / Profile / Session phase
- Trace / QA tokens driving product Auth meaning
- Reopening Slice 6–9 “to tidy” without Reopen Policy (§4)

---

## 2. SSOT LOCK

| SSOT | Location | Slice closed |
|---|---|---|
| Completion | `lib/auth/completion/*`, `COMMON_AUTH_COMPLETION_OWNERS` | 6 |
| Profile Writer | `ensureAuthProfileForLogin` + Google hard gate contracts | 7 |
| State Boundary | `lib/auth/state/auth-state-boundary-contract.ts` (+ 8-2…8-5) | 8 |
| External Classification | `lib/auth/state/auth-external-classification-contract.ts` | 8-5 |
| Product Acceptance | `.qa-logs/auth-slice9-member-product-pass-2026-08-05/` | 9 |

Architecture fixed: **NO_MEGA_FSM** · Boundary strategy **PLAN_B4** · Trace naming **PLAN_T1**.

Verify scripts (do not delete or hollow out without reopen):

- `verify:auth-state-boundary-contract`
- `verify:auth-lifecycle-trace-observability-contract`
- `verify:auth-session-lifecycle-ownership-contract`
- `verify:auth-completion-provider-ui-boundary-contract`
- `verify:auth-external-classification-contract`
- Related Slice 6/7 completion / profile / thin-handoff / identity contract tests

---

## 3. Evidence LOCK

| Bundle | Path |
|---|---|
| Program status | `.qa-logs/auth-program-status-2026-08-05/` |
| Slice 6 Deployed Runtime | `.qa-logs/auth-slice6-7-deployed-runtime-2026-08-05/` |
| Slice 7 Deployed Runtime | `.qa-logs/auth-slice7-6-deployed-runtime-2026-08-05/` |
| Slice 8 Deployed Runtime | `.qa-logs/auth-slice8-6-deployed-runtime-2026-08-05/` (`SLICE8-6-REPORT.*`) |
| Slice 9 Product PASS | `.qa-logs/auth-slice9-member-product-pass-2026-08-05/` (`SLICE9-REPORT.*`) |
| This HARD LOCK | `.qa-logs/auth-slice10-hard-lock-2026-08-05/` |

Frozen facts:

- HEAD = origin/main = Production alias target at lock: **`0d6da8324`**
- Slice 8-6 / 9 deploy gate: Production `dpl_FcH1fDQAWggLMvrpmfUmQLtQwCZF` · `samarket.vercel.app`
- Product code change for Slice 8–10 lock path: **0**
- Runtime PASS: Android Google Samsung/Xiaomi (login, completion chain ×1, cold/resume/logout, restore block)
- Product PASS: Slice 9 matrix (plus A→B isolation PASS)
- External + OPS scopes: as in §0

---

## 4. Reopen Policy

Auth may be reopened **only** when at least one applies:

1. New Provider addition
2. Product Auth contract change (Destination / Completion / Session / Profile meaning)
3. New **Code First Break** directly proven in Runtime (product path)
4. Security requirement change forcing Auth contract edit
5. Platform policy change that requires contract modification

### Do **not** reopen for

- QA environment differences
- External auth automation limits
- Instrumentation / CDP / tooling limits
- OPS **NOT_RUN** rows (Email Admin/QA, Windows Web)
- Maintaining **PARTIAL_EXTERNAL_CLOSED** / **BLOCKED/CLOSED** external judgments
- Cosmetic refactors, dead-code sweeps, or “cleanup” without a reopen trigger above

### Reopen procedure (mandatory)

1. Explicit user approval citing which reopen trigger applies
2. Record First Break / contract delta before any product edit
3. Do not silently reopen Slice 6–9
4. After change: new contract + Runtime/Product evidence as required; update this HARD LOCK or supersede with dated amendment

---

## 5. AUTH HARD LOCK declaration

```
AUTH HARD LOCK

HEAD / Production: 0d6da8324
Authority LOCK: YES (§1)
SSOT LOCK: YES (§2)
Runtime Evidence LOCK: YES (§3)
Product PASS: AUTH MEMBER PRODUCT PASS WITH OPS LIMITATIONS / CLOSED (Slice 9)
External scope: Kakao BLOCKED/CLOSED; Apple & Google iOS PARTIAL_EXTERNAL_CLOSED
OPS limitations: Email Admin/QA NOT_RUN; Windows Web NOT_RUN
Code First Break: NO / NOT PROVEN
Reopen Policy: §4
Product implementation under lock: FORBIDDEN without §4 reopen
```

**AUTH HARD LOCK — DECLARED.**

---

## Amendment 2026-10-18 — consent version single authority (Reopen §4 trigger 3: Code First Break)

OWNER execution approval 2026-10-18 (DIBAY FIRST ENTRY + ADMIN LEGAL CMS 계약 준수 복구).
First Break (audit B11): `resolvePostLoginRoute` (Destination) and `/api/me/signup-status` re-derived consent
with STORE_* constants while `getOnboardingStatus` used the CMS-required version — after an Admin publish of a
new version the destination disagreed with the server gate.
Contract delta: **none in meaning** — Destination still = consent-only gate; it now judges with
`OnboardingStatus.requiredConsent` (the same CMS versions). Session / Completion / Profile writer unchanged.
SSOT: `docs/dibay-first-entry-legal-consent-ssot.md`.

---

## Amendment 2026-10-21 — auth 통합 SSOT (Reopen §4 trigger 3 Code First Break · trigger 4 보안)

OWNER 승인 2026-10-21: `docs/dibay-auth-full-audit-ssot-design-2026-10-21.md` 7개 묶음 일괄 구현.
Contract delta:
- Identity: Naver 비활성 · 이메일 일치로 기존 계정 세션 발급 금지(웹 자동 연결 포함) · native 로그인은 owner 자격 증명을 덮어쓰지 않음 · owner 세션 재발급 = magiclink 주경로.
- Completion 입력: 아이디(password) 로그인도 `consentComplete` 를 Destination 에 전달 (Destination 의미 불변 — 동의 1조건).
- Session: 다른 탭 명시적 로그아웃 broadcast → 같은 wipe + 하드 리로드 · 탭 단위 A→B 감지 wipe · logout-all 이전 발급 토큰의 registry 자동 재등록 금지.
- 불변: NO_MEGA_FSM · PLAN_B4 · Thin Handoff · resolveCommonAuthDestination 단일 Destination.

---

## Amendment 2026-10-30 — 관리자 가드 요청당 1회 조회 (Owner 승인 2026-10-30 「1단계 진행」)

OWNER 승인 2026-10-30: 요청 증폭 근본 수정 1단계 (설계: `docs/audit/supabase-request-fanout-root-fix-design-2026-10-30.md` §2 A-1).
First Break (운영 `pg_stat_statements` 7.86일): 관리자 API 1회가 `profiles` 3회 · `admin_memberships` 4회를 조회
(`requireAdminApiUser` → `requireAdmin` 후 `requireAdminApiActor` 가 같은 행을 다시 읽음). admin_memberships 94,691회.
Contract delta: **판정 의미 없음** — 같은 요청에서 이미 읽은 행을 재사용만 한다.
- `requireAdmin(userId, { profile })` — 세션 확인이 읽은 profile 재사용, 판정과 membership 행을 `loadPrivilegedAdminMembership` 1회로 함께 얻음
  (판정식 = `hasActiveAdminMembershipOrLegacyRole` 와 동일: 활성 membership role 이 admin·super_admin).
- `requireAdminApiUser` 가 profile·membership 을 반환 → `requireAdminApiActor` 재조회 0회. 정지 운영자 차단(AD-07)·최고관리자 예외·직원 권한 로드 불변.
Session / Destination / Completion / Profile writer 불변. 회원 공통 가드(proxy) 변경 없음.

---

## Amendment 2026-10-30 (2) — 세션 확인 반복 중지 (Owner 승인 2026-10-30 「2-A·2-C 진행」)

First Break: `components/auth/AuthSessionBoundary.tsx` 의 `/api/auth/session` 1초 probe 가 「로그인됨」 확인 뒤에도 멈추지 않음
(effect 의존성에 `sessionApiAuthenticated` 누락 — 컴포넌트 테스트 재현: 10초 11회).
Contract delta: **없음** — probe 는 확인 전 1초 간격 그대로, 확인되면 중지. `sessionApiAuthenticated` 는 기존과 같이 true 로만 바뀐다.
Session / Destination / Completion / Profile 불변.

---

## Amendment 2026-10-30 (3) — 회원 쓰기 검사 1회 조회 (Owner 승인 2026-10-30 「2-A·2-C 진행」·「적용 허용·진행」)

First Break (운영 `pg_stat_statements` 7.86일): proxy PRODUCT_WRITE 검사가 회원 상태(profiles status·deleted_at)·동의 행(profiles terms·privacy·role)·
활성 관리자(admin_memberships)를 각각 조회 — 쓰기 1회당 서버→DB 직렬 왕복 3~4회(왕복당 42~117ms).
Contract delta: **판정 의미 없음** — DB 함수 `member_write_gate_snapshot(p_user_id)` 1회로 같은 행을 읽고, 판정은 기존 TS
(`resolveMemberAccountLifecycle`·`assertMemberProductAction`·`hasStoreTermsConsent`·`isPrivilegedAdminRole`) 그대로.
- P0-R3 유지: 캐시 없이 매 쓰기 요청 DB 새로 읽기, 조회 실패·프로필 없음·형식 오류 → 503 fail-closed.
- 약관 필수 버전은 기존 단일 권위 `resolveRequiredConsentVersionsStrict` (Amendment 2026-10-18) 그대로.
- 차이 1건(오류 코드만): 이전에는 상태 조회 성공 후 동의 조회만 실패하면 `consent_state_unavailable`, 이제 한 번에 읽으므로 같은 상황이 `account_state_unavailable` — 둘 다 503 fail-closed.
- 운영 DB 적용 2026-10-30 · 전 회원 137명 대조: 프로필 129명 9개 값 일치, 프로필 없음 8명 `found=false` 일치, 실행 권한 service_role 만.

---

## Amendment 2026-10-31 — 로그아웃 후 재로그인 401 · 세션 실패 응답 공유 (Reopen §4 trigger 3: Runtime 에서 증명된 Code First Break)

1. **로그아웃 후 같은 기기 재로그인 → 최대 5분 `/api/auth/session` 401** (2026-10-31 07:53~08:05 PHT Android `qqqq` 실기 · Vercel 로그 · 운영 `user_sessions`)
   - 원인: 단일 로그아웃(`app/api/auth/logout`)은 registry 행만 무효화하고 `profiles.active_session_id` 를 남겼다.
   - 재로그인 `syncActiveSessionForUser` 가 같은 기기에서 그 id 를 재사용했다. 300초 throttle 안이라 registry upsert 를 건너뛰어 무효화된 행이 남았다.
   - Contract delta: 로그아웃 시 `profiles.active_session_id` 를 **로그아웃한 id 와 같을 때만** null (logout-all 과 같은 정리). 무효화 행 재활성화 금지 정책은 그대로다.
2. **동시 세션 검증 실패 시 「failed to pipe response」 500** (2026-10-31 00:25 UTC 운영 POST messages)
   - 원인: `validateActiveSessionLightDeduped` 의 single-flight 가 실패 Response 1개를 합류한 호출자에게 같이 돌려줬다.
   - Contract delta: 실패 내용(status·본문·헤더)만 공유하고 응답은 호출자마다 새로 만든다. status·본문 불변.
Session / Destination / Completion / Profile 의미 불변.

---

## Amendment 2026-10-31 (2) — 쿠키 없는 요청의 공용 세션 번호 `"∅"` 제거 (Reopen §4 trigger 3 · Owner 승인 2026-10-31 「1단계 진행」)

First Break (운영 `user_sessions`): 활성 세션 쿠키가 없으면 세션 번호로 `"∅"` 를 그대로 써서, 전역 UNIQUE `session_id` 한 줄을
사용자끼리 덮어썼다 (같은 행이 iPhone `w테스트1` → Android `q테스트1` 로 바뀜). 설계: `docs/audit/auth-cookieless-session-sentinel-design-2026-10-31.md` 1단계.
Contract delta: 쿠키 없는 요청의 세션 번호 = 사용자별 `cookieless:<userId>` (`/api/auth/session` · `ensureApiRouteAuthGate` · 매장 상품 API).
판정 불변 — 쿠키 없는 요청은 지금처럼 등록 후 통과, 전체 로그아웃 이후 발급 토큰 검사(P2-5)·무효화 행 재활성화 금지 그대로.

---

## Amendment 2026-11-01 — 필수 약관 버전을 버전 번호만 1회로 읽기 (Owner 승인 2026-11-01 「순서 2 진행」)

근거: 운영 edge_logs 10-31 24시간 `app_legal_documents` 3,237회 — 쓰기 검사·회원 접근 판정마다 약관·개인정보를 각각
최대 20행 **본문 포함**(약 11KB) 읽고 버전만 썼다. 30초 기억은 서버 인스턴스별이라 거의 무효. 설계: `docs/audit/supabase-request-fanout-full-root-cause-2026-11-01.md` 순서 2.
Contract delta: `readRequiredConsentVersions` 가 `required_consent_versions('ko')` 1회로 버전만 받는다. 고르는 규칙은 기존
`pickCurrentPublishedLegalDoc` 와 같다(종류별 적용 시각 최신 20행 → 적용 시각 없음 또는 지난 것 → 적용·게시 시각 최신).
호출 실패·예외 → 기존 문서 읽기 경로. 게시 문서 없음 → STORE_* fallback, 읽기 실패 시 lastGood·strict fail-closed 그대로.
판정 불변 — 동의 버전 비교·재동의 판정·관리자 판정 변경 없음.

---

## Amendment 2026-11-01 (2) — 가입 상태 확인 1회 조회 · 필요 항목 없는 기능 게이트 조회 생략 (요청 증폭 근본 수정 순서 4 · Owner 「순서 4 진행」)

1. `getOnboardingStatus` 의 프로필 · 기본 주소 · 활성 관리자 조회(DB 3회)를 DB 함수 `member_onboarding_facts` 1회로 묶었다
   (마이그레이션 `20271101030000`, 실행 권한 service_role 만). 함수가 없거나 실패하면 기존 표별 조회로 넘어간다.
   - 판정(동의 버전·@id·전화·관리자 면제·가입 완료)은 TS 그대로. 관리자 판정 = 활성 membership role 만 (기존과 같음, 사용자당 활성 1행 unique).
   - 차이 1건: 기존 주소 조회의 900ms 시간 제한은 함수 경로에 없다(같은 1회 왕복 안에서 읽음). 함수 실패 시 기존 경로는 시간 제한 그대로.
   - 운영 대조 2026-11-01: 전 회원 137명 — 프로필 129명 21개 값 일치 · 프로필 없음 8명 일치 · 주소 137/137 · 관리자 137/137.
2. `requireProfileFieldsForAction` 은 필요한 항목이 없는 기능(`messenger_open` — 메신저 bootstrap·home-sync·방 목록 GET)이면 프로필·주소를 읽지 않고 통과.
   - 차이 1건: 이전에는 이 경우에도 프로필 조회 오류면 500 이었다(판정에는 쓰지 않는 값). 이제 통과. 계정 상태 차단은 P2-6 읽기 정책이 그대로 담당.
Session / Destination / Completion / Profile 의미 불변.

---

## Amendment 2026-11-01 (3) — 접속 상태 하트비트 쓰기를 P0-R3 EXEMPT 로 (Owner 「설계대로 구현」 · 설계 `docs/audit/presence-write-gate-exempt-design-2026-11-01.md`)

- Contract delta: `POST /api/community-messenger/presence` 를 `MEMBER_MUTATION_EXEMPT_RULES` 에 추가 — EXEMPT 인벤토리 **13 → 14**, DENY(쓰기 검사) 경로 279 → 278 (`lib/auth/__fixtures__/member-p0-mutation-classification.csv`).
- Contract delta (2026-11-12, Owner 「옛 모임 전부 삭제」): 옛 모임 API(`/api/community/meetings/**`·`/api/philife/meetings/**`·`meeting-ensure-participant`) 23행 삭제 — DENY(쓰기 검사) 경로 279 → 256.
- 이유: 12초 하트비트마다 쓰기 검사 DB 함수(`member_write_gate_snapshot`) 1회 — 24h 약 5,300건. 본인 접속 상태 행 1개만 쓰고 상품·다른 회원 데이터 쓰기 없음. 동의 검사는 이미 제외(`telemetry_or_removed`).
- 상태별: 차단·탈퇴 = 로그인 금지·세션 회수라 라우트 로그인 확인(401)에서 막힘(변화 없음). 정지 = 로그인·열람 허용 상태라 접속 상태 기록 허용(앱을 켜면 「온라인」). 정지 회원의 메시지·글 등 다른 쓰기는 그대로 403.
- 불변: 하트비트 12초·신선도 15초(NEW-22)·온라인/자리비움 판정·같은 방 푸시 억제·자동 읽음·라우트 로그인 확인·요청 제한(180/분)·다른 모든 쓰기의 검사.
Session / Destination / Completion / Profile 의미 불변.

---

## Amendment 2026-11-02 — 관리자 판정 조회 캐시 (Owner 「15초 허용·구현」 · 설계 `docs/audit/admin-membership-read-cache-design-2026-11-02.md`)

- Contract delta: 관리자 **판정** 경로(`loadPrivilegedAdminMembership` · `hasActiveAdminMembershipOrLegacyRole` / `resolveEffectiveAdminRole`)가 활성 membership 행을 서버 프로세스 메모리에 재사용 — **있음 15초 · 없음 60초** · 같은 사용자 동시 조회 1회 · 조회 오류는 캐시하지 않음(가드는 지금처럼 deny).
- **반영 지연 (Owner 허용 2026-11-02):** 권한 회수는 처리한 서버 인스턴스에서 즉시, **다른 인스턴스에서는 최대 15초** 늦게 거부된다. 권한 부여는 다른 인스턴스에서 최대 60초 늦게 통과. 정지 운영자 차단(AD-07, profile 판정)·강제 로그아웃(세션 회수)은 캐시 대상이 아니라 즉시.
- 변경·대상 확인 경로(`loadActiveAdminMembership` 직접 — 권한 부여·회수·회원 삭제·제재 대상 확인·`/api/admin/me`·관리자 알림 수신자)는 캐시 없이 매번 DB. `upsertActiveAdminMembership`·`revokeActiveAdminMembership` 성공 직후와 권한 부여·회수 시작 시 대상 사용자 캐시 무효화.
- 이유: 24h `admin_memberships` 3,474건(관리자 계정 2,230 · 일반 회원 1,244) — 요청마다 같은 행 재조회.
- 불변: 판정식(활성 membership role 이 admin·super_admin) · 최고관리자 예외 · 직원 권한 로드 · 세션 확인 · DB·RLS.
Session / Destination / Completion / Profile 의미 불변.

---

## Amendment 2026-11-08 — Windows 셸 로그인을 기본 브라우저로 (Reopen §4 trigger 5: 플랫폼 정책 · Owner 「W2 구현」)

- **First Break:** Windows 데스크톱 셸(WebView2, W0 빌드)에서 Google 로그인 시 Google 이 「보안 코드」를 요구 → 정상 로그인 불가 (노트북 실기 화면 2026-11-08). 근거: Google OAuth 정책 — 앱이 제어하는 임베디드 user-agent 금지.
- **Contract delta:** Windows 셸(브리지 v2 이상)에서만 `web_oauth_start` 의 실행 위치를 「앱 창 안」 → 「기본 브라우저」로 바꾼다.
  - 서버 경로는 Android Custom Tab 과 같다: `launch=native` → `capacitor-return` → `dibay://auth/callback` → 셸 `auth.return` → `deliverNativeOAuthReturnUrl(…, "windows_shell")` → `/auth/callback`.
  - Destination·Completion·Session·Profile 의미는 무변경이다.
  - 방식 결정표(`oauth-native-routing.ts`) 무변경. 서버·Supabase 설정 무변경.
  - Android·iOS·브라우저 경로 무변경 (분기 조건 `isDibayWindowsShell()` + 셸 v2).
- **계획서:** `docs/audit/windows-shell-w2-login-plan-2026-11-08.md`
- **Evidence:** 코드 PASS(계약 테스트 19건 · 인증 테스트 · 타입검사). 실기 W2-1~7 은 노트북 셸 0.2.0.0 설치 후 — 그 전까지 NOT_PROVEN.

## Amendment 2026-11-08 (2) — Windows 셸 기본 브라우저 로그인(W2) 되돌림 (Owner 「W2 되돌리기」)

- 노트북 실기: Google 로그인 시 크롬 창이 열리는 동작이 Owner 가 원하는 화면이 아님 → Owner 지시로 W2(`a86a303c3`) 전체를 되돌린다.
- 결과: Windows 셸 로그인은 W0 상태(앱 창 안 웹 OAuth)로 돌아간다. 카카오·Apple 은 앱 창 안, **Google 은 Google 정책(임베디드 로그인 금지)으로 보안 코드 요구 — 미해결**. Windows 앱의 Google 버튼 처리는 Owner 결정 대기.
- 인증 계약은 W2 이전과 같다. Android·iOS·브라우저 무변경(W2 때도 무변경).

## Amendment 2026-11-08 (3) — Windows 셸 Google 로그인만 기본 브라우저 (Owner 「구글은 다른 창이 뜨는 부분이면 그렇게 해야지」)

- Owner 결정: Google 버튼을 숨기지 않는다. Google 은 Google 정책(임베디드 로그인 금지)상 같은 창이 불가하므로 **Google 만** 기본 브라우저로 로그인한다. 카카오·Apple 은 같은 창(W0)을 유지한다.
- 내용: W2(`a86a303c3`) 코드를 다시 넣되, 분기 조건을 `provider === "google"` 로 좁혔다. 셸 `Program.cs` 빌드 오류 CS0029 를 고쳤다. 셸 0.4.0.0.
- Contract delta 는 Amendment 2026-11-08 과 같다(Google 한정). Android·iOS·브라우저 무변경.
- Evidence: 코드 PASS. 실기(Google 브라우저 로그인 → 앱 복귀)는 노트북 셸 0.4.0.0 설치 후 — NOT_PROVEN.

## Amendment 2026-11-08 (4) — PC QR 로그인 (Reopen §4 trigger 2: 새 로그인 방식 · Owner 「그래 만들어」)

- **계약 변경점:** 로그인된 휴대폰 디바이 앱이 PC(Windows 앱) 로그인 요청을 승인하면, PC 에 **그 회원의 세션**을 1회 발급한다.
- **세션 발급 방식은 새로 만들지 않았다:** 네이티브 로그인과 같은 `mintNativeOwnerSessionViaMagicLink`(메일 발송 없음)를 쓴다.
- **로그인 뒤 처리도 같다:** 탈퇴 회수 → `resolveCommonAuthDestination` → `syncActiveSessionForUser`. 클라 완료는 `finishClientAuthLogin`(Set-Cookie 동기화 = 네이티브 교환과 같은 경로)이다.
- Destination·Completion·Session·Profile 의미는 무변경이다. 완료 경로를 둘 만들지 않았다.
- **보안 장치:**
  - 2분 만료
  - 승인·소비 각 1회(조건부 UPDATE)
  - QR 의 nonce 와 PC httpOnly 쿠키 비밀값을 분리 — 해시만 저장
  - 휴대폰 확인 화면(기기·시각·위치)
  - 차단·탈퇴 회원 거부(정지는 로그인 허용 규칙 그대로)
  - IP·회원별 횟수 제한
  - 감사 기록 `auth.pc_qr_login_approve` · `auth.pc_qr_login`
- **중앙 변경 게이트:** `POST /api/auth/qr-login/start`·`approve` 를 EXEMPT 로 추가했다(14 → 16). 라우트가 자체 판정한다 — 다른 로그인 라우트와 같은 방식이다.
- **DB:** `public.pc_login_requests`(RLS 강제·service_role 전용). **운영 적용은 Owner 별도 승인이다.** 적용 전에는 QR 영역이 숨겨진다(시작 API 503).
- **설계:** `docs/audit/windows-qr-login-design-2026-11-08.md`

## Amendment 2026-11-08 (5) — 앱 로그인 응답 활성 세션 쿠키 운반 (Reopen §4 trigger 3: Code First Break · Owner 「묶음 1 진행」)

- **First Break (테스트 재현):** `POST /api/auth/native/exchange` 최종 응답이 Supabase 세션 쿠키만 싣고, 로그인 처리가 임시 응답에 쓴 `samarket_active_session_id` 를 버렸다. 탈퇴 거절 응답도 쿠키 삭제를 싣지 않았다.
- **Contract delta:** 임시 응답을 쿠키 운반 응답으로 두고 최종 응답에 옮긴다.
  - 성공: 전부 옮긴다.
  - 실패: 삭제 쿠키만 옮긴다 — 실패한 로그인이 세션 쿠키를 남기지 않는다.
- Destination·Completion·Session·Profile 의미는 무변경이다. 웹 OAuth·PC QR·비밀번호 경로는 이미 같은 응답에 쓰므로 무변경이다.
- **Evidence:** `app/api/auth/native/exchange/__tests__/route-active-session-cookie.test.ts` (성공 200 에 활성 세션 쿠키, 탈퇴 403 에 삭제만). 앱 실기 NOT_PROVEN.
- **감사:** `docs/audit/post-plan-backlog-audit-2026-11-08.md` B-3

## Amendment 2026-11-08 (6) — `/api` 게이트 갱신 없는 서명 검증 · proxy 만료 임박 캐시 건너뛰기 (Reopen §4 trigger 2: Session 계약 변경 · Owner 「3-1 승인 (조건 2)」)

- **First Break:** 운영 증명 결함 없음 — 최근 3일 auth 로그 갱신 충돌 `refresh_token_already_used` 0건. trigger 3 이 아니라 trigger 2(세션 갱신 소유권 정의, Owner D3 원칙 승인 → 3-1 조건 2 인용 승인)로 재개.
- **근거(운영·문서):**
  - 세션 갱신의 64~84% 가 서버에서 발생 (11-05 483/577 · 11-06 208/277 · 최근 24h 287/459, auth 로그 `referer` 로 구분).
  - Supabase 갱신 한도는 IP 단위 1,800회/시·순간 30회 (`guides/auth/rate-limits`) — 서버 갱신은 공유 Vercel IP 로 몰림.
  - `/api` 게이트는 쿠키를 쓸 수 없어 갱신 결과를 버렸다 (`setAll` 무동작).
- **Contract delta:**
  - `/api` read·mutation 게이트(`resolveApiIdentity`)는 쿠키의 access token 을 `getClaims(token, { allowExpired: true })` 로 **서명만** 검증해 사용자를 식별한다 — 세션 로드·갱신 0. 토큰을 못 읽거나 검증 실패 시 기존 경로로 폴백.
  - proxy 화면 문서·RSC 경로는 서버 측 유일 갱신자로 유지. 12초 신원 캐시가 적중해도 토큰이 만료 90초 이내면 캐시를 쓰지 않고 갱신한다(RSC 갱신 유실 경로 제거).
  - Route Handler 의 인증·갱신, 401 계약, Session Lifecycle 소유(`dibay-session-manager`)는 **무변경**.
- 보안 수준 동일: 기존 `getClaims()` 로컬 검증도 세션 폐기를 확인하지 않았다. 만료 토큰으로 식별한 사용자도 최종 인증은 Route Handler 가 한다. 차단·탈퇴 판정 규칙 무변경.
- **설계:** `docs/audit/phase3-auth-request-structure-design-2026-11-08.md` §3-1
- **Evidence:** `lib/auth/__tests__/read-access-token-from-cookies.test.ts`, `lib/auth/__tests__/api-gate-no-refresh.test.ts`. Production: auth 로그 서버 갱신 비중 감소·`already_used` 0 유지로 판정 (배포 후 측정).

## Amendment 2026-11-08 (7) — `/api` 세션 신선도 관문 (Reopen §4 trigger 2: Session 계약 변경 · Owner 「3-2a 승인 (조건 2)」)

- **First Break:** 운영 증명 결함 없음 (갱신 충돌 0건). trigger 2 로 재개 — 세션 갱신 시점 계약 변경.
- **근거(코드·운영):**
  - 앱이 보이게 되면 SDK 는 잠금을 잡고 `_recoverAndRefresh()` 로 만료 임박 세션을 갱신한다 (`@supabase/auth-js GoTrueClient.ts:3230-3261`).
  - 같은 순간 다른 리스너(복귀 감지 파일 73개)의 `/api` 요청은 갱신 완료를 기다리지 않고 만료 토큰으로 나가 Route Handler 가 서버에서 갱신 → 서버 갱신 64~84%·공유 IP 한도 위험.
- **Contract delta:**
  - 같은 출처 `/api/*` 요청은 브라우저 쿠키 토큰이 만료 90초 이내(또는 만료)일 때만 `auth.getSession()`(SDK 잠금 = 갱신 완료 대기, 단일 비행)을 기다린 뒤 나간다. 상한 3초 후·관문 오류 시 그대로 보낸다.
  - 제외: 통화 경로(`call` 포함, 통화 규정) · `/api/auth/*`(세션 관리자 경로, 잠금 교착 방지) · `/api/telemetry/*` · `/api/app/web-version`.
  - 설치: `components/app/AppBootProvider.tsx` 모듈 로드 시 1회 (`lib/auth/session-freshness-fetch-gate.client.ts`).
  - 무변경: 세션 수명 소유(`dibay-session-manager`), Route Handler 인증·갱신, 401 계약, Amendment (6) 게이트.
- **설계:** `docs/audit/phase3-auth-request-structure-design-2026-11-08.md` §7
- **Evidence:** `lib/auth/__tests__/session-freshness-fetch-gate.test.ts`. Production: auth 로그 서버 갱신 비중(목표 20% 이하)·`already_used` 0·`/api` 401 불변·C8 해제 시각 악화 없음 (배포 후 측정).
