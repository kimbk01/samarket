# Phase H — Surface projection 1 writer

**선행:** Phase G  
**상태:** **PASS (Hub + Domain list + Bell/AppIcon slice-1)** · R2 keep · R3/R4 poll·supplement **소스 유지**(삭제 금지) · **STOP**

---

## 1. 산출

| Surface | Writer 경로 | 상태 |
|---------|-------------|------|
| Hub | `lib/chat-domain/projections/hub-badge-projection.ts` | **`ok` (wired)** |
| Bell | `…/bell-badge-projection.ts` | **`ok` (slice-1 wired)** |
| App Icon | `…/app-icon-badge-projection.ts` | **`ok` (Bell total mirror)** |
| GD/group/trade/SO list | `lib/chat-domain/list/*-list-writer.ts` | **`ok` (dual-write + chatDomain paint)** |
| Quarantine 목록 | `projections/phase-h-quarantine.ts` (R1–R4) | R1 **removed** · R2/R3/R4 **keep** (소스) |

---

## 2. Bell / App Icon slice-1 (이번 cutover)

- `applyBellBadgeProjection` → `{ status: "ok" }` → registered sink → `notification-badge-count-store` snap mutate
- fetch / read_patch / optimistic_admin 모두 store → `applyBellBadgeProjection` 경유 (직접 snap set 금지)
- App Icon: Bell sink가 `totalUnread` 를 `applyAppIconBadgeProjection(..., source: "bell_mirror")` 로 미러
- `NativeBadgeSync` 는 기존처럼 badge-count `total` 구독 (SSOT 동일)
- **안 함:** `notification-unread-badge-store` 다중 surface 재배선 · R3 45s poll 삭제 · R4 adminNotice supplement 삭제 · Native Call

---

## 3. 범위 / 금지

| 함 | 안 함 |
|----|------|
| Bell/AppIcon 단일 apply 실배선 | Domain list 행 소스 UI cutover |
| badge-count → Bell → App Icon mirror | unread multi-surface 통합 |
| | R2/R3/R4 **실삭제** |
| | 7/14 trash 복원 · Native Call · backfill SQL |

---

## 4. Gate

| # | 조건 | 결과 |
|---|------|------|
| 1 | Hub/Bell/AppIcon apply → ok | PASS |
| 2 | badge-count funnel + App Icon mirror test | PASS |
| 3 | R2–R4 미삭제 | PASS |
| 4 | Native Call 0 | PASS |

**판정:** `PASS (Bell/AppIcon slice-1)` · **STOP**

---

## 5. 다음 (별도 승인)

- Domain projection 행 소스 렌더
- `chat_domain` backfill
- R2 hub poll 재평가 (측정)

## 6. 관련 (증상 1 · list unread)

- `local-read-guard` high-water: soft TTL만으로 stale unread 재통과 금지 (newer `lastMessageAt`만 허용). 2026-07-23.
