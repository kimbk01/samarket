# Phase I — Domain entry · chrome 1단 계약 (준비만)

**선행:** Phase H  
**상태:** **PASS** · **STOP** (Phase J 승인 전)

---

## 1. 산출

| 산출 | 경로 |
|------|------|
| Entry plan | `lib/chat-domain/room-chrome/domain-room-entry.ts` |
| Single chrome plan | `…/domain-room-chrome.ts` |
| Header/dock | `…/domain-room-header-dock.ts` (`not_wired`) |
| REMOVE prep R5–R10 | `…/phase-i-remove-prep.ts` |
| Tests | `lib/chat-domain/__tests__/four-domain-phase-i.test.ts` |

---

## 2. 범위 / 금지

| 함 | 안 함 |
|----|------|
| Domain별 entry/chrome/header/dock **계약** | `CommunityMessengerRoomPhase2` / Pass 셸 **교체** |
| REMOVE 후보 목록 + **파일 존재** 검증 | R5–R10 **실삭제** |
| chromeMode=`legacy_multi_shell` 명시 | Native Call · hub cutover |

제품 진입은 기존: `PageClientEntry` → `RouteEntryShell` → Gate → Pass0/1 → Stable → Body.

---

## 3. Gate

| # | 조건 | 결과 |
|---|------|------|
| 1 | entry/chrome/header/dock not_wired unit | PASS |
| 2 | REMOVE 후보 파일 전부 존재 | PASS |
| 3 | 제품 셸 트리 미변경 | PASS |
| 4 | Native Call 0 | PASS |
| 5 | `verify:chat-domain-file-lock` | PASS |

**판정:** `PASS (contract)` · **STOP**

---

## 4. Phase J 킥오프 (승인 후만)

```text
docs/community-messenger/2026-07-23-four-domain-phase-i.md 준수.
Phase J만. Quarantine → 호출 0 증명 → 실삭제 → import-ban 강화.
순서 변경 금지. Native Call·hub 추측 배선 금지. 끝나면 STOP.
```
