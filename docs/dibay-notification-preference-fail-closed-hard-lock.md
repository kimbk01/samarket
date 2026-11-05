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

## 광고성 알림 동의 판정 (2026-11-05 · 제한 Reopen 기록)

Owner 승인 범위: **시스템 기본 ON 회원이 광고성 알림을 받지 않도록 하는 것만.** 위 계약 1~6 은 바꾸지 않는다.

### 최초 분기 (first divergence)

| 단계 | 기대 | 실제 (변경 전) |
|---|---|---|
| 동의 저장 | 회원이 직접 켠 경우만 `marketing_enabled=true` | 2026-11-03 기존 회원 일괄 `marketing_enabled=true` · `marketing_consent_source='existing_member_default'` |
| 판정 (`resolveMemberSnapshot`) | 직접 동의만 마케팅 ON | `marketing_enabled === true` 만 보고 출처를 보지 않음 → 기본값도 동의로 판정 |
| 마케팅 캠페인 알림함 | 동의 회원만 | 대상 전원에게 알림함 행 생성 (회원 판정 없음) |
| 공지·시스템 캠페인 | 광고 내용 없음 | 내용 판정 없음 — 광고를 공지로 보내면 동의와 무관하게 전원 발송 |

운영 DB 읽기 (2026-11-05 19:06 PHT): `existing_member_default` + true = 129명, `settings` + true = 1명, 그 외 0명.
2026-11-03 09:33 UTC 일괄 ON 이후 마케팅 캠페인 푸시 발송 0건 (운영 DB `admin_notification_campaigns`·발송 기록 조회).

### 변경 (판정만 · 저장값·출처·이력은 바꾸지 않음)

- 직접 동의 = `marketing_enabled === true` **그리고** `marketing_consent_source ∈ {signup, settings}` (`lib/legal/marketing-consent-validity.ts`). 정규화(`resolveMemberSnapshot`)가 이 값으로 `marketingEnabled`·`marketingPushEnabled` 를 만든다. 설정 읽기 SELECT 에 `marketing_consent_source` 추가.
- 마케팅 캠페인(`type=marketing`)은 알림함 행도 직접 동의 회원만 만든다(`sendCampaignToUser`). 설정을 못 읽으면 만들지 않는다(fail-closed · `policy_filtered`). 미리보기 알림함 인원도 같은 판정.
- 공지·시스템 캠페인은 작성자 「광고 내용 없음」 확인(`target_payload.non_promotional_attested`)이 있어야 저장·발송된다. 광고 표지어 검사는 보조 단계이며 단독 판정이 아니다(`campaign-promotional-guard.ts`). 발송 직전(즉시·예약·반복·테스트) 다시 판정.
- 내정보 설정 GET 의 `marketing_enabled` = 실제 수신 여부(직접 동의), `marketing_consent_source` 함께 반환.

### 바꾸지 않은 것

- 계약 1~6 (`.catch(() => false)` · READ_FAILED ≠ NO_ROW · 필수 알림 READ_FAILED 시 발송 · `skip_settings_gate` · 일반 알림함 생성).
- 공지·시스템 캠페인 알림함·푸시 규칙, 마케팅 외 도메인 판정, 통화·네이티브 코드.
- 회원 저장값·동의 출처·동의 시각·기록 (데이터 변경 없음).
