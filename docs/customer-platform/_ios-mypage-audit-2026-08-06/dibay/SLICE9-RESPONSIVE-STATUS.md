# Slice 9 — Responsive / Multiplatform STATUS

```text
SLICE 1–8 LOCKED (유지)
SLICE 9 RESPONSIVE / MULTIPLATFORM AUTHORIZED
SLICE 9 PHASE 1 APPROVED
SLICE 9 PHASE 1 CODE LOCKED
SLICE 9 PHASE 1 DEPLOYED (Git Auto Deploy)
SLICE 10–12 NOT AUTHORIZED
```

## Phase 1 deliverables

| Item | Path |
|------|------|
| Breakpoint SSOT | `lib/ui/mypage-responsive-breakpoints.ts` (767 / 1025) |
| Hub consumer | `components/mypage/MyPageHomeDashboard.tsx` |
| Unit test | `lib/ui/__tests__/mypage-responsive-breakpoints.test.ts` |
| Runtime harness | `scripts/qa/slice9-multiform-runtime.mjs` |

## Contract (no visual change)

| Band | Width | Hub menu |
|------|-------|----------|
| mobile | ≤767 | single column (`md:hidden`) |
| tablet | 768 … &lt;1025 | 2-col (`md:max-[1025px]`) |
| desktop | ≥1025 | 3-col (`min-[1025px]`) |

## Deploy

| Item | Value |
|------|-------|
| Product SHA | `4447038d25288b4b5148d919c22892b6d5f2dc54` |
| Deploy | `dpl_9C5bHxXiwRetHXKr7fqV35XjBX7J` |
| Source | **git** |
| Alias | `https://samarket.vercel.app` · Ready |

## Runtime matrix (honest)

| Surface | Status | Evidence |
|---------|--------|----------|
| Windows Chromium 1280 | **PASS** | `…09-52-26-961Z` |
| Tablet viewport 900 | **PASS** | `…09-52-38-629Z` |
| APK (Samsung RFCY40PY2CA) | **PASS** | `…09-52-56-731Z` |
| iOS WebView CDP | **NOT_RUN** | `…09-53-06-570Z` (no ios_webkit_debug_proxy / page) |
| a11y / animation | smoke recorded on Windows·tablet (non-gating) | |

## Current verdict

```text
SLICE 9 PHASE 1 HARNESS PASS
SLICE 9 MULTIPLATFORM RUNTIME LOCK — NOT ELIGIBLE
Reason: iOS NOT_RUN
```

**Lock rule:** Windows + tablet PASS alone ≠ LOCK. APK PASS + iOS PASS required.

## Next

1. Start `ios_webkit_debug_proxy`, open DiBaY WebView on device
2. `SLICE9_TARGET_SHA=4447038d2 SLICE9_RT_PLATFORM=ios node --env-file=.env.local scripts/qa/slice9-multiform-runtime.mjs`
3. If iOS PASS → docs tip `SLICE 9 MULTIPLATFORM RUNTIME LOCK`
