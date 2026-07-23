# Phase H — Surface projection 1 writer

**선행:** Phase G  
**상태:** **PASS (Hub slice-1 cutover)** · Bell/AppIcon/list `not_wired` · **STOP**

---

## 1. 산출

| Surface | Writer 경로 | 상태 |
|---------|-------------|------|
| Hub | `lib/chat-domain/projections/hub-badge-projection.ts` | **`ok` (slice-1 wired)** |
| Bell | `…/bell-badge-projection.ts` | `not_wired` |
| App Icon | `…/app-icon-badge-projection.ts` | `not_wired` |
| GD/group/trade/SO list | `lib/chat-domain/list/*-list-writer.ts` | `not_wired` |
| Quarantine 목록 | `projections/phase-h-quarantine.ts` (R1–R4) | 삭제 **안 함** |

---

## 2. Hub slice-1 (이번 cutover)

- `applyHubBadgeProjection` → `{ status: "ok" }`
- snapshot: `OwnerHubBadgeBreakdown` + `versionMs` + `source` + `totalUnread`
- `owner-hub-badge-store` 모든 apply(network/poll/optimistic/broadcast/cache) → projection → **registered sink**만 store mutate
- R1 optimistic / R2 poll **소스 유지** (측정 전 삭제 금지)

---

## 3. 범위 / 금지

| 함 | 안 함 |
|----|------|
| Hub 단일 apply 실배선 | Bell / App Icon 실배선 |
| store sink 등록 | Domain list / bootstrap cutover |
| | R1–R4 **실삭제** |
| | 7/14 trash 복원 · Native Call |

---

## 4. Gate

| # | 조건 | 결과 |
|---|------|------|
| 1 | Hub apply → ok · Bell/AppIcon/list not_wired | PASS |
| 2 | hub CM sync tests 회귀 | PASS |
| 3 | R1–R4 미삭제 | PASS |
| 4 | Native Call 0 | PASS |

**판정:** `PASS (Hub slice-1)` · **STOP**

---

## 5. 다음 (별도 승인)

- Domain list cutover **또는** Hub R1–R4 제거(측정 필수)
- Bell / App Icon cutover
