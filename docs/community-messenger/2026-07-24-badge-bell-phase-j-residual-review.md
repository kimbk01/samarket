# Phase J — Residual Review (final classification)

**Date:** 2026-07-24  
**J4:** `PASS — PHASE J4 UNUSED BADGE PATH REMOVAL VERIFIED` (승인)  
**Phase J LOCK:** **보류** — 본 분류 완료 + 2기기 QA 후 **별도 승인**

판정 규칙: 각 residual은 **삭제 대상 0** 또는 **삭제 금지(활성 Domain / 활성 non-Badge)** 중 하나로만 남긴다.

---

## Residual 최종 분류

| ID | Item | 분류 | 근거 |
|----|------|------|------|
| R-INBOX-BRIDGE | `inbox-read-bridge` | **삭제 금지 — 활성 inbox 경로** | `app/api/me/notifications` GET merge + PATCH read/delete 제품 호출. legacy `notifications` 테이블 행과 `notification_events`를 함께 처리하는 **목록·읽음 adapter**. Bell/App Icon/Bottom **digit writer 아님** (읽음 후 `invalidateNotificationBadgeCache`만). Badge Authority Legacy 삭제 대상 **아님**. 별도 inbox 마이그레이션 트랙. |
| R-LIST-75 | Notification list 75s poll | **삭제 금지 — 활성 list UX** | `MyNotificationsView` / `OwnerNotificationList` / admin lists가 `NOTIFICATION_SYNC_POLL_MS`로 **목록 재로드**. J2a에서 badge surface poll만 제거. Badge digit / App Icon과 무관. |
| R-SO-DUAL | buyer_order + owner_order_chat | **삭제 금지 — 제품 의미론 추적** | 코드 Legacy writer 아님. 동일 계정 dual-role attention. Badge LOCK 재개 사유 아님. |
| R-TRADE-MULTI | multi-trade unread / room-read | **삭제 금지 — QA·clear-scope 추적** | snapshot miss 아님(기증명). harness/다중 unread. Badge LOCK 재개 사유 아님. |

### 삭제 대상 residual

**0건.**

---

## Badge Authority — Legacy vs Domain (제품 설명 가능 여부)

| 종류 | 상태 |
|------|------|
| Digit writer / formula | Domain projection only (LOCK) |
| Legacy badge poll / noop / events SUM / inert hooks | J1–J4 삭제 · `verify:badge-import-ban` |
| Active Domain bridges | NativeBadgeSync · Apply · 45s badge-count · Push appIconTotal |
| Active non-Badge | inbox-read-bridge · list 75s · hub 180s |

→ 제품 코드에서 Legacy **Badge Authority** 는 **호출 0** 이거나 **삭제됨**. 남은 residual은 Badge digit Authority가 아님.

---

## Phase J LOCK 승인 체크리스트

| # | 조건 | 상태 |
|---|------|------|
| 1 | Residual = 삭제0 또는 삭제금지로 전부 분류 | **PASS** (본 문서) |
| 2 | Legacy Badge Authority = call-0 또는 Domain | **PASS** (J1–J4 + import-ban) |
| 3 | import-ban PASS (residual 포함 · bridge/list는 ban 대상 아님) | **PASS** (`npm run verify:badge-import-ban`) |
| 4 | 2기기 QA Bell/Bottom/App Icon 회귀 없음 | **PENDING** — runbook: `2026-07-24-badge-bell-phase-j-final-qa.md` |
| 5 | 문서 ↔ 코드 일치 | **PASS** (본 문서 + j4-complete) |

**LOCK 승격은 #4 완료 + 사용자 명시 승인 후에만:**

- `PASS — PHASE J LEGACY REMOVAL VERIFIED`
- `PASS — BADGE / NOTIFICATION DOMAIN INFRASTRUCTURE LOCKED`

자동 승격 금지.

---

## Active keepers (재확인)

```
Domain snapshot → loaders → buildNotificationBadgeProjection → Apply
  → Bell / App Icon(appIconTotal) / Bottom(GD+group)
NativeBadgeSync · badge-count 45s · hub 180s · list 75s · inbox-read-bridge (list/read)
```
