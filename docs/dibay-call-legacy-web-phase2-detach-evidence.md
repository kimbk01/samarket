# DIBAY Call — Legacy Web Phase 2 Detach Evidence

Status: **P2-1 + P2-5 complete**, **P2-2 complete (QA PASS)**, **P2-3 complete (QA PASS)** — 2026-06-28  
Prerequisite: Phase 1 inventory (`60f4d17e`), Native Runtime HARD LOCK (`008b235d`)

**Scope:** Partial Phase 2. **P2-4 not implemented** (red-team hold).

---

## P2-1 + P2-5 (complete — `5fe759a6`)

| Step | File | Action |
|---|---|---|
| P2-1 | `IncomingCallPushDelivery.java` | Unreachable Legacy Web pending-route detached |
| P2-5 | verify scripts + import-guard + this doc | DEAD path asserts |

Device QA: **skipped** (Native Runtime unchanged).

---

## P2-2 — Android native outgoing JS Agora fallback detach

**Goal:** On Android native shell only, native handoff failure must not fall through to Web `/calls-v4` + JS Agora.

| File | Action |
|---|---|
| `lib/community-messenger/call-v4/call-v4-actions.ts` | `isAndroidNativeOutgoingShell()` fail-fast after handoff failure |
| `lib/call/native/native-outgoing-bridge.ts` | Export `isAndroidNativeOutgoingShell` |
| Tests + verify + this doc | Regression guards |

### Android fail-fast (P2-2)

After `startNativeOutgoingEstablishment` fails on Android:

- `native_establishment_unavailable` (when ok/nativeOwned both false)
- `native_outgoing_failed`
- `resetToIdle`, `{ ok: false, userMessage }`
- **No** `routeToCallV4Screen`, **no** `outgoing_ringing`, **no** `callV4PatchCancel`

### Non-Android / Desktop

Legacy Web outgoing route **unchanged** (out of P2-2 scope).

### O2 LOCK

No Android Runtime / plugin / token / join changes — Web TS dial bridge only.

### P2-2 verify (unit + contract)

```bash
npm run verify:native-voice-runtime-contract
npm run verify:native-video-runtime-contract
vitest run lib/community-messenger/call-v4/__tests__/call-v4-outgoing-native-fallback.test.ts
vitest run lib/community-messenger/call-v4/__tests__/call-v4-create-outgoing.test.ts
vitest run lib/community-messenger/call-v4/__tests__/call-v4-import-guard.test.ts
```

### P2-2 device QA (O2 outgoing isolated only)

| Case | callId | Result (2026-06-28) |
|---|---|---|
| Voice outgoing isolated | `887be882-b352-40b7-8cca-51b1f81cf7a6` | **PASS** |
| Video outgoing isolated | `98ae60fd-32a4-4132-9088-33f2c38250f6` | **PASS** |

**PASS markers (both):** `caller_outgoing_start`, `token_fetch_done`, `agora_native_join_success`, `state_connected` — all 1  
**Forbidden (both):** `route_to_screen`, `outgoing_ringing`, `CallV4Screen`, Web `agora_join_start`, Web `agora_join_success` — all 0

Reports: `.qa-logs/native-call-voice-outgoing-isolated/report.json`, `.qa-logs/native-call-video-outgoing-isolated/report.json`

---

## P2-3 — Android native-owned Web V4 UI quarantine (sync-only)

**Goal:** On Android Capacitor shell, when Native owns the call, block Web V4 UI mount / navigation / `/calls-v4` screen entry. Web sync-only (`native_connected_received`, store hydrate, terminal watch) **unchanged**.

| File | Action |
|---|---|
| `lib/call/native/native-owned-web-v4-ui-guard.ts` | Block SSOT + `web_v4_ui_mount_blocked` (peek/sync included) |
| `CallV4Provider.tsx` | Skip `router.replace` on native accept when blocked |
| `call-v4-route.ts` | `routeToCallV4Screen` Android guard |
| `call-v4-foreground-resume.ts` + `use-call-v4-foreground-resume.ts` | Foreground resume skip + async block |
| `CallV4Screen.tsx` + `calls-v4/[callId]/page.tsx` | Mount / page entry guard |
| Tests + import-guard + this doc | Regression guards |

### P2-3 verify (unit + contract)

```bash
npm run verify:native-voice-runtime-contract
npm run verify:native-video-runtime-contract
npm run verify:call-v4-incoming-fsi-fallback-boundary
vitest run lib/call/__tests__/native-owned-web-v4-ui-guard.test.ts
vitest run components/community-messenger/call-v4/__tests__/call-v4-provider-native-route.test.ts
vitest run lib/community-messenger/call-v4/__tests__/call-v4-foreground-resume.test.ts
vitest run lib/community-messenger/call-v4/__tests__/call-v4-import-guard.test.ts
```

### P2-3 device QA (isolated 3 cases only — no Final Regression)

**Incoming isolated PASS (Voice / Video):** Native chain PASS · Web sync PASS · Forbidden 0 · `CallV4Screen` 0 · Web `route_to_screen` 0 · Web `agora_join_*` 0.  
`web_v4_ui_mount_blocked = 0` **allowed** when no Web route/mount/resume attempt (Native `pending_route_skipped` + `legacy_web_handoff_blocked`).

**Foreground resume isolated PASS:** resume attempt confirmed · `web_v4_ui_mount_blocked` or `call_v4_foreground_resume_skip` ≥ 1 · `route_to_screen` 0 · `CallV4Screen` 0 · Web agora 0.

| Case | callId | Result (2026-06-28) |
|---|---|---|
| Voice incoming accept isolated | `f6c1eab5-e080-4e68-bb32-5fbfc8c41dfb` | **PASS** |
| Video incoming accept isolated | `8beb9399-b2db-49e5-a125-7b57b8842f5d` | **PASS** (block marker 0 — no Web UI attempt; normal) |
| Outgoing connected → foreground resume isolated | `e3e57d52-c603-41d8-82cd-599df95b6e2e` | **PASS** |

Reports: `.qa-logs/native-call-voice-incoming-isolated/report.json`, `.qa-logs/native-call-video-incoming-isolated/report.json`, `.qa-logs/native-call-foreground-resume-isolated/report.json`

---

## Hold (not in scope)

| Step | Reason |
|---|---|
| P2-4 MainActivity pending replay | Route replay regression risk — separate approval |
| Desktop web outgoing policy | Separate product decision |
| Orphan session cancel on handoff fail | O4/terminal boundary — not P2-2 |

## References

- Phase 1: `docs/dibay-call-legacy-web-phase1-inventory.md`
- Native HARD LOCK: `docs/dibay-call-native-runtime-hard-lock.md`
