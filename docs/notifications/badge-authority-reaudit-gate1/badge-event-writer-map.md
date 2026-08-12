# Gate 1 — Event Writer Map

**Mode:** AUDIT ONLY · no code change · no revert · no deploy  
**HEAD:** `449e02771` (= `origin/main`)  
**Date:** 2026-08-03

---

## 1. Baseline

| Item | Value |
|------|--------|
| HEAD | `449e02771e1085201b6560c533bf2f239e5596c6` |
| origin/main | same |
| Dirty (badge-relevant) | `M components/philife/PhilifeHeaderNotificationInbox.tsx` (Step 8 → popup, **uncommitted**, Gate1 전 unauthorized) |
| Product status | **BADGE PRODUCT FAIL** (prior smoke PASS void) |

---

## 2. Event / badge writers

| Writer | 생성 이벤트 | recipient identity | 증가 대상 | 중복 가능성 | 유지/폐기 |
|--------|-------------|-------------------|-----------|-------------|-----------|
| `createNotificationEvent` (`notification-event-repository`) | `notification_events` row | `user_id` (member bucket) | A (if eligible) | dedupe_key; backfill incident proved contentIdentitySeed gap | **유지** (SSOT insert) |
| `notification-event-dispatcher` | same via create | member | A | medium if classification wrong | 유지 · 분류 감사 필수 |
| `notify-store-commerce` / append user notif | order/trade status | member `user_id` | A | supersede mark-read path | 유지 · A 적격만 |
| Owner ops → historically `notification_events` on owner user_id | store ops as member rows | **member bucket 오염** | Bell/A 위험 | high (legacy) | **폐기 대상** (C로 이전; Slice 2-5 계약 있음, live 잔존 가능) |
| Campaign / admin push | campaign notice | member | A if persistent | campaign dedupe | 유지 · push-only는 A 제외 |
| Missed-call pipeline | missed / orphan | member or room | A or B | room-bound vs orphan | 유지 · 이중 가산 금지 |
| Chat message insert → participants.unread | room unread | participant | B room / Hub / Bottom | single-flight room | **유지** (B SSOT) |
| Gate3 backfill scripts | A rows from legacy | member | A | **incident:** contentIdentitySeed 누락으로 dup 7건 발생 후 삭제 | 스크립트 유지 금지 조건 강화 · 재실행 주의 |
| FCM dispatcher `badge_count` | push payload echo | device token | OS shade | 권위 아님 | **echo only 유지** · 권위로 사용 금지 |
| Cap `Badge.set` / NativeBadgeSync | launcher digit | device | App Icon display | resume cache 경로 | **echo only 유지** |
| Local UI +1/-1 (금지) | — | — | 표면 | high | **폐기** 잔존 여부 Gate2에서 정적 금지 |

---

## 3. Notes

- Insert SSOT는 `createNotificationEvent`로 수렴되어 있다 → **원천 writer 전면 폐기 대상 아님**.
- 문제는 writer 부재가 아니라 **분류(A vs B vs C)·이중 projection·NC 셸 wiring**.
