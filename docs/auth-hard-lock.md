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
