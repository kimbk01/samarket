# DIBAY Chat + Call — CURRENT NORMAL HARD LOCK

**Status:** HARD LOCK ACTIVE (Phase 0 freeze)  
**Declared:** 2026-09-09  
**Mode that created this:** DOCUMENTATION / RULE FREEZE ONLY (no product implementation)  
**SSOT DESIGN:** ACCEPTED (Owner)

Master audit (design evidence):  
`.recovery/a3e514b-runtime-align-20260908-204646/chat-call-ssot-hard-lock-master-audit-20260909/DIBAY_CHAT_CALL_CURRENT_NORMAL_BASELINE_SSOT_HARD_LOCK_MASTER_AUDIT.md`

Cursor rule: `.cursor/rules/dibay-chat-call-current-normal-hard-lock.mdc`

This document is the **umbrella CURRENT NORMAL authority**. It does **not** replace detailed CUT/O2–O4/domain docs — it freezes which of them are HARD LOCK and how change is gated. Do not invent a second parallel Call SSOT.

---

## 1. Baseline freeze

| Role | Value | Rule |
|---|---|---|
| **Owner NORMAL authority** | `4b093a61645a3eedac1c5ca42a9fc09a401bf4f5` | Product NORMAL Call authority for this freeze |
| Tree at freeze (informational) | `5da86a3fa83a8aed6dc07892c529865c3e0d6a66` | Exists after NORMAL; **not** auto PASS promotion by the SSOT audit |
| Dirty (not PASS) | `android/.../NativeOutgoingRingbackOwner.java` | Not CURRENT NORMAL evidence |

```text
4b093a616 = NORMAL AUTHORITY
5da86a3   = CURRENT TREE (do not conflate with NORMAL PASS expansion)
SSOT audit PASS expansion = FORBIDDEN
HISTORICAL PASS ≠ CURRENT PASS (unless Owner evidence board updates a cell)
```

Production cutover remains: `git push origin main` → Vercel Git Integration only  
(`docs/dibay-build-deploy-hard-lock.md`).

---

## 2. Owner evidence board (freeze-time)

Cells below are the **CURRENT NORMAL evidence board** for this HARD LOCK.  
WAVE-1 / master-audit snapshots that differ are **HISTORICAL** unless listed here.

| Cell | Freeze status | Evidence class |
|---|---|---|
| Android Voice/Video core | PASS LOCK | HISTORICAL WAVE-1 + Owner NORMAL |
| Missed 30s | PASS LOCK | HISTORICAL WAVE-1 |
| PiP enter | PASS LOCK | HISTORICAL WAVE-1 |
| **PiP return** | **PASS (Owner)** | **Owner evidence update 2026-09-09** — supersedes WAVE-1 FAIL/HOLD for this board (no re-harness this freeze turn) |
| Android Eligibility E1–E4 | PASS LOCK | HISTORICAL WAVE-1 |
| **iOS Eligibility E1 / E2** | **PASS (Owner)** | Cross-platform device proof `APK_IOS_VOICE_OWNER_STOP.md` (E1/E2) + **Owner confirmation at freeze** — supersedes WAVE-1 rollup “iOS Eligibility NOT_PROVEN” for E1/E2 only |
| iOS Eligibility E3 / E4 | NOT_PROVEN | Do not expand |
| Cross-platform full matrix | NOT CLOSED | Do not expand |
| Audio interruption / C7 / C10 | NOT fully CLOSED / NOT_PROVEN | HISTORICAL audio matrix — do not reopen Native for cleanup |
| CALL PRODUCT CLOSED | **NO** | Full product closed claim still forbidden |

```text
Do not rewrite WAVE-1 historical FAIL files.
Do not treat Owner PiP-return / iOS E1–E2 updates as license to edit Native.
```

---

## 3. HARD LOCK grades

### HARD LOCK A — Native / CallKit / PushKit / RTC

**Canonical detail:** `docs/dibay-call-native-runtime-ssot.md` · `docs/dibay-call-native-runtime-hard-lock.md` · O2/O3/O4 · iOS packageClassList lock · PiP restore lock.

Includes (non-exhaustive): Android Voice/Video Runtime, Activities/Services, FCM incoming, RingOwner, RingbackOwner, PiP, eligibility; iOS Voice/Video Runtime, CallKit, PushKit, VoIPPushRegistry, Incoming/Outgoing Coordinators, CallKitProvider, eligibility, AVAudioSession/RTC ownership; Agora Native lifecycle.

**Without Owner approval: DO NOT modify.**

Especially forbidden without Owner + Native Change Gate (§7):

- refactor / cleanup / duplication removal  
- Voice/Video “unify”  
- Native → Web ownership move  
- CallKit / PushKit / RTC lifecycle changes  

**P0a dual terminal proposers:** Native/JS/V4 may remain proposers. **Do not merge/remove proposers** under “SSOT cleanup.” Server CAS is the single winner today. `P0 ≠ implement now`.

### HARD LOCK B — Server Call session SSOT

**Canonical detail:** `docs/dibay-call-authority-lock.md`

Sole canonical session writer:

`updateCommunityMessengerCallSession` (`lib/community-messenger/service.ts`)

Only this writer owns:

`status` · `answered_at` · `connected_at` · `ended_at` · `ended_reason` · `answered_device_id`

Native / JS / V4 / cleanup cron / admin may **propose** PATCH/actions. They must not become a second canonical writer. CAS contract HARD LOCK. SQL stale cleanup remains detect-only (CUT1).

### HARD LOCK C — Call → Chat projection

**Canonical detail:** `docs/dibay-call-authority-lock.md` (CUT4/CUT5) · `call-chat-projection-authority.ts` · `call-timeline-policy.ts`

```text
CALL SESSION = canonical lifecycle
CALL STUB / CALL HISTORY / NOTIFICATION = projection / attention only

SESSION → STUB / HISTORY / NOTIFICATION
```

Reverse direction forbidden. Stub/history/notification must not decide Call session terminal state.

### HARD LOCK D — Presentation

**Canonical detail:** `call-terminal-reason-authority.ts` · `call-event-presentation.ts`

```text
DB STATUS  ≠  TERMINAL REASON  ≠  DISPLAY LABEL
```

Do not collapse caller cancel / callee decline / missed / busy / failed / connected end / answered elsewhere into one raw status label in UI. Presentation **consumes** canonical terminal reason only.

### Chat four-domain

**Canonical detail:** `docs/dibay-messenger-domain-group-hard-lock.md` · `lib/chat-domain/four-domain-freeze.ts`

```text
general_direct ≠ group ≠ trade ≠ store_order
```

Shared UI/transport OK. Shared authority FAIL for room identity, message writer, participant, unread, notification, deeplink, call entry.

---

## 4. Related locks (still in force — not duplicated)

| Doc | Role under this umbrella |
|---|---|
| `docs/community-messenger/call-lifecycle-ssot.md` | Lifecycle step owners (start/accept/end/cleanup) |
| `docs/dibay-call-o2-outgoing-hard-lock.md` | Outgoing establishment |
| `docs/dibay-call-o3-connected-ownership-hard-lock.md` | Connected ownership |
| `docs/dibay-call-o4-end-ownership-hard-lock.md` | End / local cleanup |
| `docs/dibay-call-ios-outgoing-package-classlist-hard-lock.md` | iOS Cap plugin list |
| `docs/dibay-call-android-native-video-pip-restore-hard-lock.md` | Android PiP/surface restore |
| `docs/dibay-call-legacy-web-shutdown-lock.md` | Android Web establishment removed |
| `.cursor/rules/dibay-call-native-runtime-ssot.mdc` | Agent Native runtime SSOT |

---

## 5. Future Native Change Gate (mandatory before code)

Any future work that would edit HARD LOCK A files must report **before** changing code:

```text
WHY NATIVE CHANGE REQUIRED
FIRST DIVERGENCE
WHY WEB/SERVER FIX INSUFFICIENT
EXACT NATIVE OWNER
VOICE IMPACT
VIDEO IMPACT
ANDROID IMPACT
IOS IMPACT
CALLKIT/PUSHKIT IMPACT
RTC IMPACT
SERVER SESSION IMPACT
CHAT PROJECTION IMPACT
REQUIRED TEST
REQUIRED DEVICE MATRIX
ROLLBACK BOUNDARY
```

Owner approval required. No PRODUCT FAIL first divergence → no NORMAL Call lifecycle change.

---

## 6. HARD LOCK violation — STOP

If an agent proposes changing HARD LOCK A/B/C for:

- “구조 정리” / “중복 제거” / “리팩터링” / “SSOT 개선” / “공통화”

→ **STOP.** Document only. Do not edit product code.

Also forbidden under this freeze unless Owner opens a separate implementation phase:

- P0/P1 product fixes (room-bump, retention, proposer removal, audio interruption, concurrent-call, Windows Call)  
- Native/Server/DB/API/Chat product code changes “for tests”

---

## 7. Phase order after this freeze (design only)

```text
0. HARD LOCK freeze ← THIS DOCUMENT (ACTIVE)
1. Document dual proposers / verify CallClient PATCH contract (docs/tests — Owner gate)
2. Optional room-bump on terminal stub (server — Owner gate)
3. Retention/pagination for call_logs (Owner gate)
4. Concurrent call product + device matrix (Owner gate)
5. Audio interruption (Native only after device FAIL + §5 gate)
6. Voice/Video twin migration (LAST)
```

```text
NORMAL CALL FIRST.
SSOT SECOND.
REFACTOR LAST.
```

---

## 8. Freeze declaration line

```text
CURRENT NORMAL HARD LOCK: ACTIVE
HARD LOCK A (Native/CallKit/PushKit/RTC): FROZEN
HARD LOCK B (Server session writer): FROZEN
HARD LOCK C (Call→Chat projection): FROZEN
HARD LOCK D (Presentation layers): FROZEN
CHAT FOUR-DOMAIN: FROZEN (existing lock linked)
DUPLICATE AUTHORITY: NO — umbrella points at existing canonical docs
PRODUCT CODE CHANGE THIS FREEZE: NONE
```
