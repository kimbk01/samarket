# DIBAY PTR Reveal HARD LOCK

**Status:** PTR REVEAL HARD LOCK (verified scope)  
**Locked at:** 2026-10-15  
**Production SHA:** `12d58a582387226ef75d2ef99fd90776ee2499dc`  
**SSOT:** `docs/dibay-ptr-reveal-final-ssot.md`  
**Companion rule:** `.cursor/rules/dibay-ptr-reveal-hard-lock.mdc`  
**Integrity evidence:** `tests/e2e/.artifacts/ptr-integrity-final-20261015/`  
**iPhone runtime:** `tests/e2e/.artifacts/ptr-ios-live3-20261015/IPHONE-FINAL.json`

---

## 0. LOCK verdict

| Gate | Result |
|---|---|
| main · Production tip match | **PASS** (`origin/main` == `12d58a582…`) |
| Core contracts + unit tests | **PASS** (45) |
| BLOCKER | **0** |
| Confirmed DEFECT (PTR serve/ops contract) | **0** |
| Audience / auth leak (serve path) | **0** |
| Material performance bottleneck (evidence-based) | **0** |
| Regression in PTR mount surfaces (code boundary) | **0** |
| SSOT ↔ Production | **MATCH** |
| QA campaign paused + allowlist | **PASS** |
| Unverified items isolated | **YES** (iPad · Safe Area metrology · public `all` · shared events API E2E security) |

**HARD LOCK: PASS — verified scope only.**  
**Explicit:** PASS does **not** certify shared `/api/platform-popup/events`(+suppress) end-to-end security.

---

## 1. KEEP (without Owner reopen)

| Concern | Decision |
|---|---|
| Presentation | `ptr_reveal` only for this product |
| Creative | `ptr_band` · variants `default`(required) / `tablet` / `logo` |
| Source pixels | **1280×320** / **2560×320** / **256×256** |
| Slot / threshold | max **106** · threshold **58** · tablet viewport ≥ **600** |
| Layout authority | `computePtrBandLayout` (app + admin preview) |
| New campaign audience | default **allowlist + empty** (fail-closed) |
| Copy audience | preserve mode + UIDs |
| Serve gate | approved ∧ status∈{active,scheduled} ∧ window ∧ surface ∧ audience ∧ ready default band |
| Allowlist | empty / anon → nobody |
| close_only | same-surface hold; leave surface to reset |
| Client cache | TTL 5m · fetch 4s · idle prefetch · never block PTR refresh |
| Resolve path | `/api/platform-popup/ptr-reveal` only (not interruptive resolve) |
| QA campaign | `5f811614-…` stays **paused + allowlist** until Owner says otherwise |
| Tip SHA | reopen required to intentionally change locked contracts |

## 2. DO NOT (without reopen)

- Flip QA or production campaigns to `audience=all` without Owner approval
- Serve `paused` / `pending_review` / empty-allowlist as if public
- Enlarge phone band onto tablet when tablet creative missing
- Change band source pixels / max 106 / threshold 58 / tablet 600 without measured reopen
- Merge interruptive popup and PTR into one resolve pipeline
- Bypass admin `requireAdminApiUser` for mutating PTR admin APIs
- Claim iPad or Safe Area metrology as PASS
- Redeploy / invent Preview·TEST as Production substitute for this lock
- Speculative redesign, feature deletion, or unrelated domain edits “for PTR”

## 3. Authority map

| Concern | Owner |
|---|---|
| Band SSOT | `lib/platform-popup/ptr-reveal-contract.ts` |
| Physics | `lib/ui/ptr/dibay-ptr-ssot.ts` |
| Audience | `lib/platform-popup/ptr-reveal-audience.ts` |
| Client | `lib/platform-popup/ptr-reveal-client.ts` |
| Payload | `lib/platform-popup/ptr-reveal-payload.ts` |
| Admin patch | `lib/platform-popup/ptr-reveal-admin-patch.ts` |
| Writer / loader | `admin-campaign-writer.ts` · `admin-campaign-loader.ts` (scope ptr) |
| UI runtime | `components/ptr/*` |
| Admin UI | `components/admin/ptr-reveal/*` · `app/admin/ptr-reveal-ads/**` |
| Resolve API | `app/api/platform-popup/ptr-reveal/route.ts` |

## 4. Explicitly out of this LOCK

| Item | Class |
|---|---|
| iPad device runtime | NOT_PROVEN |
| iPhone Safe Area numeric audit | NOT_PROVEN |
| Production `audience=all` rollout | NOT DONE (forbidden without Owner) |
| Shared `/api/platform-popup/events` (+ suppress) campaign-existence scoping | IMPROVEMENT — **PTR HARD LOCK PASS ≠ 공유 events API 전체 보안 보증** |
| PTR admin campaign-delete button | IMPROVEMENT (draft delete API exists) |

## 5. Reopen condition

Owner explicit reopen **or** a new Production contradiction against this SSOT with Current evidence (not historical).
