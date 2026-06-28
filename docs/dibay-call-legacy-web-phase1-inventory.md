# DIBAY Call — Legacy Web Phase 1 Inventory

Status: **Phase 1 complete (read-only)** — 2026-06-28  
Prerequisite: Native Call Runtime Android COMPLETE HARD LOCK (`008b235df5540d1576a65d281eb959ad57a8722f`)

**No product code changed in this phase.** No Legacy deletion. No detach.

## Phase 1 Verify Guards (all PASS — 2026-06-28)

| # | Command | Result |
|---|---|---|
| 1 | `npm run verify:native-voice-runtime-contract` | PASS |
| 2 | `npm run verify:native-video-runtime-contract` | PASS |
| 3 | `npm run verify:call-v4-incoming-fsi-fallback-boundary` | PASS |
| 4 | `vitest run lib/community-messenger/call-v4/__tests__/call-v4-import-guard.test.ts` | PASS (23 tests) |
| 5 | `npm run verify:call-v4-structure-lock` | PASS |
| 6 | Native→V4 Java import grep (`nativevoice|nativevideo|nativecall`) | **0 matches** |

## Classification Legend

| Class | Meaning |
|---|---|
| **ACTIVE** | Still reachable in production for call establishment or accept |
| **QUARANTINED** | Present but blocked when Native Runtime owns call (`legacy_web_handoff_blocked`, lane flags) |
| **DEAD** | No production dial/accept path; rollback reference or tests only |

Final Regression forbidden markers (all **0** at LOCK): `route_to_screen`, `CallV4Screen`, `screen_mounted`, `agora_join_success`, `visible_surface_owner_claimed`.

---

## W — Web / Capacitor

| ID | Path / surface | Class | Notes |
|---|---|---|---|
| W1 | `app/(main)/community-messenger/calls-v4/[callId]/page.tsx` | QUARANTINED | Legacy route; Native FCM skips pending Web route persistence |
| W1b | `app/(main)/community-messenger/calls/[sessionId]/page.tsx` | QUARANTINED | Session route; not Native establishment SSOT |
| W2 | `components/community-messenger/call-v4/CallV4Provider.tsx` | QUARANTINED | Provider mount; blocked for native-owned incoming |
| W2b | `components/community-messenger/call-v4/CallV4Screen.tsx` | QUARANTINED | `screen_mounted` marker source — **0 in Final Regression** |
| W2c | `components/layout/providers/CallIncomingChrome.tsx` | QUARANTINED | V4 chrome gated before V3; Native incoming bypasses Web sheet |
| W3 | `lib/community-messenger/call-v4/call-v4-agora-media.ts` | QUARANTINED | JS Agora join — forbidden `agora_join_success` **0** |
| W3b | `lib/community-messenger/call-v4/call-v4-video-*` | QUARANTINED | Video presenter / attach pipeline |
| W4 | `lib/community-messenger/call-v4/call-v4-actions.ts` | QUARANTINED | Web accept/outgoing actions; native-owned bypass |
| W4b | `lib/community-messenger/call-v4/call-v4-route.ts` | QUARANTINED | Web route replay / handoff |
| W4c | `lib/community-messenger/call-v4/call-v4-foreground-resume.ts` | QUARANTINED | Web resume; Native Runtime owns connected |
| W5 | Capacitor `NativeCallService` plugin + dial bridge | **ACTIVE (Native)** | Establishment SSOT — **not Legacy** |
| W5b | Web outgoing POST + `startNativeOutgoingEstablishment` | **ACTIVE (Native handoff)** | API create allowed; join Native-only |

**Production dial/accept ACTIVE Legacy count:** **0** (Native plugin + Native activities only).

---

## A — Android Native (non-Runtime Legacy bundle)

| ID | Path | Class | Notes |
|---|---|---|---|
| A1 | `DibayFirebaseMessagingService` → `IncomingCallPushDelivery` | QUARANTINED | Routes to Native voice/video when runtime flags on |
| A1b | `IncomingCallPushDelivery.java` | QUARANTINED | `native_*_pending_route_skipped` for Native Runtime |
| A2 | `MainActivity.java` | QUARANTINED | V3 replay suppressed; V4 lane markers present |
| A3 | `callv4/CallV4IntentHelper.java`, `CallV4Lane.java` | QUARANTINED | Legacy lane helpers; FCM native path skips Web handoff |
| A3b | `IncomingCallBackgroundNotifier.java` (V4 bundle) | QUARANTINED | FSI/fallback bundle — verify boundary PASS; not used for Native establishment |
| A3c | `IncomingCallSessionCleanup.java` | QUARANTINED | Bundle-scoped cleanup |

---

## X — Cross-import boundary

| ID | Check | Result |
|---|---|---|
| X1 | `nativevoice/*` → `call-v4|CallV4` | **0 imports** |
| X1b | `nativevideo/*` → `call-v4|CallV4` | **0 imports** |
| X1c | `nativecall/*` → `call-v4|CallV4` | **0 imports** |
| X2 | `verify:native-*-runtime-contract` quarantine tokens | PASS |

---

## Forbidden marker ↔ inventory mapping

| Forbidden marker | Legacy source (inventory) | Final Regression |
|---|---|---|
| `route_to_screen` | W4 Web handoff / pending route | 0 |
| `CallV4Screen` | W2b | 0 |
| `screen_mounted` | W2b | 0 |
| `agora_join_success` | W3 JS Agora | 0 |
| `visible_surface_owner_claimed` | Web duplicate surface (rollup) | 0 |

---

## Phase 1 Exit Criteria

- [x] Inventory W1–W5, A1–A3, X1 documented
- [x] ACTIVE vs QUARANTINED vs DEAD assigned
- [x] Verify guards 1–6 PASS
- [x] Forbidden markers mapped to Legacy sources
- [x] Phase 2 detach draft below

---

## Phase 2 Detach Draft (approval required — no implementation)

**Goal:** Remove dead Web establishment branches on paths already proven Native-only. **No file deletion in Phase 2.**

| Step | Scope | Action | Risk |
|---|---|---|---|
| P2-1 | `IncomingCallPushDelivery` | Delete unreachable Web pending-route branch after Native flag (keep logs) | Low — Native FCM PASS |
| P2-2 | Web dial bridge | Remove JS Agora fallback in outgoing hook; keep `startNativeOutgoingEstablishment` only | Medium — retest O2 |
| P2-3 | `CallV4Provider` incoming | ~~Hard-disable mount when native active~~ | **Removed** — Track ① sync-only + Track ③ guard delete |
| P2-4 | MainActivity pending replay | Remove V4 route replay for call push types owned by Native | Medium — needs lane audit |
| P2-5 | Docs/tests | Update import-guard tests to assert DEAD paths removed | Low |

**Phase 2 verify gate (once):** O2 outgoing isolated + incoming isolated + forbidden 0 — **not** full Final Regression unless red-team approves.

**Phase 3 (future):** Delete W2/W3/W4 files per SSOT deletion order — separate approval after 30-day prod zero-marker window.

---

## References

- Native Runtime HARD LOCK: `docs/dibay-call-native-runtime-hard-lock.md`
- Evidence: `docs/artifacts/dibay-call-native-runtime-hard-lock-evidence.json`
- SSOT deletion order: `docs/dibay-call-native-runtime-ssot.md`
