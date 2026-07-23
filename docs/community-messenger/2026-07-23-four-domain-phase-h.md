# Phase H — Surface projection 1 writer (계약 · not_wired)

**선행:** Phase G  
**상태:** **PASS** · **STOP** (Phase I 승인 전)

---

## 1. 산출

| Surface | Writer 경로 | 상태 |
|---------|-------------|------|
| Hub | `lib/chat-domain/projections/hub-badge-projection.ts` | `not_wired` |
| Bell | `…/bell-badge-projection.ts` | `not_wired` |
| App Icon | `…/app-icon-badge-projection.ts` | `not_wired` |
| GD/group/trade/SO list | `lib/chat-domain/list/*-list-writer.ts` | `not_wired` |
| Quarantine 목록 | `projections/phase-h-quarantine.ts` (R1–R4) | 삭제 **안 함** |

---

## 2. 범위 / 금지

| 함 | 안 함 |
|----|------|
| TARGET 경로에 단일 apply API 신설 | `owner-hub-badge-store` / bell / app-icon **실배선** |
| quarantine 후보 문서화 (R1–R4) | optimistic/poll **실삭제** |
| applyHomeListPatch KEEP | list writer cutover |
| | REMOVE 셸 삭제 · Native Call · 뱃지 추측 패치 |

**이유:** 7/14 이후 뱃지 multi-writer 추측 수정이 실패한 전례 — cutover는 **별도 승인 + 측정** 후.

---

## 3. Gate

| # | 조건 | 결과 |
|---|------|------|
| 1 | 7 writer 파일 존재 · apply → not_wired | PASS |
| 2 | legacy store / applyHomeListPatch 미교체 | PASS |
| 3 | REMOVE 실삭제 0 | PASS |
| 4 | Native Call 0 | PASS |
| 5 | `verify:chat-domain-file-lock` | PASS |

**판정:** `PASS (contract)` · **STOP**

---

## 4. Phase I 킥오프 (승인 후만)

```text
docs/community-messenger/2026-07-23-four-domain-phase-h.md 준수.
Phase I만. 진입 경로 Domain별; 방 chrome 1단; Domain header/dock.
Pass/Deferred REMOVE 실행 준비만·실삭제 금지. Native Call 금지. 끝나면 STOP.
```

## 5. Hub cutover (별도 승인 · H 연장 아님)

```text
applyHubBadgeProjection 실배선 + R1–R4 quarantine 증명.
측정 없이 optimistic 제거 금지.
```
