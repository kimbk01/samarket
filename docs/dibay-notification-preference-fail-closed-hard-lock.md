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

## 설정 항목 판정 기록 (2026-10-27 · Reopen 기록)

Owner 승인(알림 전수 감사 N-10 · 재감사 문서 정리)으로 두 설정의 상태를 기록한다. fail-closed 계약(위 1~6)은 바꾸지 않는다.
재감사 계획의 「두 설정 모두 폐기」는 코드 확인 결과 `store_enabled` 에 대해 사실이 아니어서, 폐기가 아니라 **실제 상태**를 기록한다.

| 설정 | 실제 사용처 (2026-10-27 코드) | 화면 노출 | 판정 |
|---|---|---|---|
| `vibration_enabled` 「진동」 | 발송·기기·알림음 경로에서 읽는 곳 0건 (타입·저장·표시만) | 마이 알림 설정에서 숨김(`e71e0b022`). `MemberNotificationSettings`(주문 알림 설정)·`MessengerSettingsSheet` 에는 남아 있음 | **효과 없는 설정 — 폐기 대상.** 저장값·API 는 하위 호환으로 유지 |
| `store_enabled` 「매장·상점 알림」 | **2026-10-28 정정 · Owner D-Q3:** 이전 기록의 「인앱 알림음 판정은 읽음」은 사실과 달랐다(`notification-sound-gate.ts` domain 분기는 실행되지 않음). 이제 `resolveEffectiveNotificationPreference` 가 `STORE_SETTING_GOVERNED_META_KINDS`(관리자 매장 공지·매장 심사·주문 개입·광고 심사/상태) 의 **푸시와 앱 안 소리**를 끈다. 필수(금융)는 제외 | 세 화면 모두 노출 | **실제 동작** |

- 두 설정의 화면 노출이 세 화면에서 서로 다르다. 노출 정리·연결 여부는 별도 결정 사항이며, 이 기록은 동작을 바꾸지 않는다.
- 근거: `docs/audit/notification-system-full-audit-2026-10-27.md` (P03·P04) · `docs/audit/notification-full-reaudit-2026-10-27.md`.
