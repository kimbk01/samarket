# Gate 3 Start Preconditions (LOCKED)

**Status:** Gate 3 **APPROVED** (Authority rebuild) · 2026-08-03  
**Progress:** Steps 1–3 started — see `docs/notifications/badge-gate3-impl/gate3-mid-report-01.md`  
**Gate 1:** `AUTHORITY REBUILD REQUIRED`  
**Gate 2:** `BADGE AUTHORITY CONTRACT READY`

---

## Start sequence (mandatory)

```text
1. Authority Contract Test 작성
2. 현재 HEAD에서 FAIL 증명
   Bell Digit set == Bell Unread List set == mark-all target set
3. Writer Inventory Freeze
   App Icon / Bell / Bottom / Trade / Order / Owner
   — 현재 HEAD writer 개수·경로 목록을 freeze 문서로 고정
4. 구현 시작 (아래 순서만)
```

Freeze 목적: 구현 중 writer를 **삭제·잔존 개수로 추적** (예: Bell writers 5 → 3 삭제 → 2 유지).  
없으면 수개월 후 “Bell +2” 회귀를 설명·차단할 수 없다.

---

## Implementation order (after freeze only)

```text
1. Identity
2. Bell A
3. Conversation B
4. App Icon (A+B components + authorityVersion)
5. Owner C
6. Notification UI (/notifications)
7. Push routing/read
```

### Forbidden order

```text
UI first
App Icon first
patch filters on dual authority
```

---

## Hard contracts that must not reopen

```text
Member: A notification · B conversation
Store: C owner
App Icon = A + B
Missed call XOR (room→B / orphan→A)
Bell authority = /notifications only (no popup chat authority)
Legacy: backfill + temp read adapter · dual-write end
```

---

## Not declarable yet

```text
CODE PASS
RUNTIME PASS
PRODUCT PASS
HARD LOCK
```

---

## Current freeze (process)

```text
구조 위험: 높음 (권위 혼합은 Gate1이 증명)
구현 위험: 없음 (코드 미변경)
회귀 위험: 낮음 (코드 미변경)
```

Gate 3 **명시 승인** 전에는 위 1–3도 실행하지 않을 수 있다.  
승인 시 1→2→3→Identity 순으로만 진행한다.
