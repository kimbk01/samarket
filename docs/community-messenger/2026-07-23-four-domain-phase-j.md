# Phase J — Quarantine → 증명 → 삭제 → 락 (슬라이스 1)

**선행:** Phase I  
**상태:** **PASS (slice-1)** · **STOP** (Phase K / J-slice-2 별도 승인)

---

## 1. 순서 (고정)

1. Quarantine / 호출 0 확인  
2. 증명 (`rg` + tests)  
3. 실삭제  
4. import-ban / forbidden-restore 강화  

---

## 2. 이번 슬라이스에서 삭제 (호출 0)

| ID | 경로 | 증명 |
|----|------|------|
| R10 | `CommunityMessengerRoomSegmentShellLayout.tsx` | 제품 import 0 (e2e name 문자열만) |
| R8b | `CommunityMessengerRoomStableEntryShellLight.tsx` | SegmentShellLayout 전용 소비자 → 동시 삭제 |

---

## 3. 이번 슬라이스에서 **삭제하지 않음** (호출 잔존)

| ID | 이유 |
|----|------|
| R5 RouteEntryShell | PageClientEntry / RoomClient 사용 중 |
| R6 Pass0 / R7 Pass1 / R8 StableEntry | Phase2·Gate 사용 중 |
| R1 optimistic hub | participants-hub-sync 호출 중 |
| R9 Deferred entry | PageClientEntry dynamic 사용 중 |

→ chrome 1단 cutover **후** J-slice-2.

---

## 4. 락 강화

- `FORBIDDEN_RESTORE_PATHS` + `verify:chat-domain-file-lock` — 삭제 파일 복원 FAIL  
- SegmentShellLayout **import** FAIL  
- 잔여 Pass/RouteEntry는 **존재 필수** (조기 삭제 방지)

---

## 5. Gate

| # | 조건 | 결과 |
|---|------|------|
| 1 | R10·R8b 삭제 · 복원 ban | PASS |
| 2 | 잔여 셸 호출부 유지 · 파일 존재 | PASS |
| 3 | hub/optimistic/Native 미변경 | PASS |
| 4 | vitest phase-i + file-lock | PASS |

**판정:** `PASS (slice-1)` · **STOP**

---

## 6. 다음 (별도 승인)

- **Phase K** Gate/배포 문서, 또는  
- **J-slice-2** chrome cutover 후 R5–R8 삭제 (측정·배선 선행 필수)
