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
