# DIBAY Notification Preference Consent — Fail-Closed HARD LOCK

**ACTIVE.** Cursor: `.cursor/rules/dibay-notification-preference-fail-closed-hard-lock.mdc`  
Evidence: `.tmp/notification-cd1-fail-closed/PRODUCTION_PROOF.json`  
Prior audit: `.tmp/notification-forensic-audit/AUDIT_CLOSURE_REPORT.md` (CD-1)

## FINAL AUTHORITY

| | |
|---|---|
| HEAD / ORIGIN / PRODUCTION | `2667426d154cd6818320230d19d3e8401de502c5` |
| DEPLOYMENT | `dpl_FK5jhtSMpWooWhRxNif6MNwhtRSu` |
| STATUS | Ready |
| ALIAS | `https://samarket.vercel.app` |

**CD-1 PREFERENCE CONSENT FAIL-CLOSED — HARD LOCKED**

## Locked contract

1. `dispatchPushForUser` settings gate: `shouldSendWebPushForUser(...).catch(() => false)` — never `true`.
2. `evaluateCampaignPushGate`: same fail-closed outer catch.
3. `maybeSinglePreferenceRow`: missing relation → `null` (no-row compat); **any other DB error → throw** (must not collapse to defaults-ON).
4. `skip_settings_gate` (call / system dismiss paths) **PRESERVED** — do not remove.

## First divergence (closed)

Outer `.catch(() => true)` + inner non-missing DB error → `null` → defaults ON → optional push could send despite unread/unavailable preference authority.

## Do not reopen without new evidence

- Do not restore fail-open catch.
- Do not treat non-missing preference read errors as absent-row.
- Do not bundle CD-2 (Cash charge notify) or SR-* into this lock.
- Call functional HARD LOCK and Android Page Navigation HARD LOCK remain separate and preserved.

## Change gate

Touch preference read / web-push settings gate / campaign push eligibility → regression-only on this HARD LOCK. Reopen only on Owner PRODUCT FAIL with a new first-divergence table.
