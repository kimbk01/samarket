# Badge Rollback Audit — Verdict

**Date:** 2026-08-03  
**Mode:** AUDIT ONLY — no revert executed · no product patch · no deploy  
**HEAD / origin/main / Production:** `f438f37e2e07b6c7dcb49faed37c72de0bbfbc8f`

---

## VERDICT

# NO ROLLBACK — SOURCE/FILTER FIX REQUIRED

---

## Why not FULL ROLLBACK REQUIRED

Baseline `1e2a560c1` is **already FAIL** (phase0 maps):

- `owner_intake` on owner `user_id` → Bell + App Icon notification axis
- Owner rooms → Member App Icon ChatAttention
- Prior runtime: `RUNTIME_PARTIAL_OR_FAIL`

Full reset ≠ stable product. **전체 롤백 금지 조건 충족 → REJECT.**

---

## Why not SLICE 2-6 SELECTIVE REVERT REQUIRED

| Claim | Evidence |
|-------|----------|
| e2cb causes Bell digit FAIL | **False** — no Bell UI / digit / list files in `e2cb00ec8` |
| e2cb causes empty `/my/notifications` | **False** — list path owned by Slice 2-2 (`d6dbb91d4`) |
| e2cb causes Cap lag | **Unproven** — NativeBadgeSync / syncNativeBadgeCount = **comment-only** in e2cb |
| e2cb changes FCM wire | **True** — always-send badgeCount + MemberAppIconTotal resolver |

Selective revert of `e2cb00ec8` is **REVERT_CANDIDATE** for FCM wire only. It is **not REQUIRED** to explain or fix the observed Bell 3 / list empty / popup mismatch.

**User lean (“Slice 2-6 선택 리버트 가능성 높음”):** accepted as **optional FCM candidate after separate FCM regression proof**, not as the fix for current Bell Product FAIL.

---

## Why NO ROLLBACK — SOURCE/FILTER FIX REQUIRED

Observed Product FAIL clusters:

1. **Bell digit > 0 + list empty** → digit reader (`badgeCountTotal` / A) vs list reader (`/api/me/notifications` + `exclude*` + `filterMemberNotificationAInboxRows` + pushKind tabs) — **identity/filter break**
2. **Popup “중요 대화”** → messenger summary path, **not** Server A list
3. **Bell ≠ App Icon** (e.g. 3 vs 23, 7 vs 9) → **can be contract-correct** (`App Icon = A + B_member`)
4. **Cap ≠ server App Icon** → refresh/stale surface — **not pinned to e2cb logic**

A/B/C **authority formulas** are not proven wrong by these symptoms. Rolling them back would **reopen owner/chat pollution**.

---

## A/B/C keep stance (this audit)

| Axis | Stance |
|------|--------|
| A_member classification intent | **KEEP** pending list/digit identity fix |
| B_member / MemberAppIconTotal | **KEEP** |
| B_store / C_store exclusion | **KEEP** |
| Slice 2-6 FCM | **REVERT_CANDIDATE** only if FCM-specific regression proven worse than pre-2-6 |

---

## Forbidden declarations (this phase)

- PRODUCT PASS · HARD LOCK · Bell UI complete  
- Full git reset · working tree clean · deploy · number force · cache TTL patch  

---

## Next (approval-gated — not started)

See `rollback-plan.md`. Fix target is **source/filter/reader identity**, not wholesale axis revert.
