# Phase J — Quarantine → 증명 → 삭제 → 락

**선행:** Phase I chrome cutover  
**상태:** **PASS (slice-1 + slice-2)** · **STOP** (hub badge cutover 별도 승인)

---

## 1. 순서 (고정)

1. Quarantine / 호출 0 확인  
2. 증명 (`rg` + tests)  
3. 실삭제  
4. import-ban / forbidden-restore 강화  

---

## 2. slice-1 삭제 (호출 0)

| ID | 경로 |
|----|------|
| R10 | `CommunityMessengerRoomSegmentShellLayout.tsx` |
| R8b | `CommunityMessengerRoomStableEntryShellLight.tsx` |

---

## 3. slice-2 삭제 (chrome cutover 후 호출 0)

| ID | 경로 | 증명 |
|----|------|------|
| R5 | `CommunityMessengerRoomRouteEntryShell.tsx` | 제품 import 0 |
| R6 | `CommunityMessengerRoomPass0Shell.tsx` | 제품 import 0 |
| R7a | `CommunityMessengerRoomPass1StableShell.tsx` | 제품 import 0 |
| R8 | `CommunityMessengerRoomStableEntryShell.tsx` | Gate → `EntryEmpty`만 사용 |

---

## 4. 아직 삭제하지 않음

| ID | 이유 |
|----|------|
| R7b Pass1ComposerShell | `ComposerEarly` / `ComposerSurface` 호출 중 |
| R1 optimistic hub | participants-hub-sync 호출 중 |
| ShellChromeFrame | header seed **type**만 사용 (컴포넌트 first-paint 경로 0) |

---

## 5. 락 강화

- `FORBIDDEN_RESTORE_PATHS` + `verify:chat-domain-file-lock` — 삭제 파일 복원 FAIL  
- SegmentShellLayout **import** FAIL  
- R7b Pass1ComposerShell **존재 필수** (조기 삭제 방지)

---

## 6. Gate

| # | 조건 | 결과 |
|---|------|------|
| 1 | R5·R6·R7a·R8 삭제 · 복원 ban | PASS |
| 2 | R7b 유지 · file-lock | PASS |
| 3 | hub/optimistic/Native 미변경 | PASS |
| 4 | vitest phase-i/j + store-order entry | PASS |

**판정:** `PASS (slice-2)` · **STOP**

---

## 7. 다음 (별도 승인)

- **Hub badge cutover** (Bell/AppIcon/list 제외 가능 — 계획 §10)
- LayoutInlineShell / ShellChromeFrame 컴포넌트 정리 (호출 0 재증명 후)
