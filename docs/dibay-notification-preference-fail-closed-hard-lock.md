# DIBAY Notification Preference Consent — Fail-Closed HARD LOCK

**ACTIVE.** Cursor: `.cursor/rules/dibay-notification-preference-fail-closed-hard-lock.mdc`  
Evidence: `.tmp/notification-cd1-fail-closed/`  
Prior audit: `.tmp/notification-forensic-audit/AUDIT_CLOSURE_REPORT.md` (CD-1)

## FINAL AUTHORITY

Recorded at slice close (see latest `PRODUCTION_PROOF.json` / git log for current Production SHA).

**CD-1 PREFERENCE CONSENT FAIL-CLOSED — HARD LOCKED** (includes mandatory preservation on READ_FAILED)

## Locked contract

1. `dispatchPushForUser` settings gate: `shouldSendWebPushForUser(...).catch(() => false)` — never `true`.
2. `evaluateCampaignPushGate`: same fail-closed outer catch.
3. `maybeSinglePreferenceRow`:
   - missing relation → `null` (**NO_ROW** — existing defaults preserved)
   - **any other DB error → throw** (`notification_preference_read_failed:…`) — **READ_FAILED ≠ NO_ROW**
4. `shouldSendWebPushForUser` on READ_FAILED:
   - **optional** → `false` (fail-closed)
   - **mandatory** (P2-A2 `isMandatoryPreferencePolicy`) → `true` (existing mandatory contract preserved)
5. `skip_settings_gate` (call / system dismiss paths) **PRESERVED** — do not remove.
6. Preference gate failure skips **Push only** — does not block `notification_events` inbox create.

## First divergence (closed)

Outer `.catch(() => true)` + inner non-missing DB error → `null` → defaults ON → optional push could send despite unread/unavailable preference authority.

## Do not reopen without new evidence

- Do not restore fail-open catch.
- Do not treat non-missing preference read errors as absent-row.
- Do not fail-close mandatory events on READ_FAILED.
- Do not bundle CD-2 / SR-* / Admin Push / Call into this lock.
- Call functional HARD LOCK and Android Page Navigation HARD LOCK remain separate and preserved.

## Change gate

Touch preference read / web-push settings gate / campaign push eligibility → regression-only on this HARD LOCK. Reopen only on Owner PRODUCT FAIL with a new first-divergence table.
