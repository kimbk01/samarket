# Phase G — Domain push / sound / route (계약만)

**선행:** Phase F  
**상태:** **PASS** · **STOP** (Phase H 승인 전)

---

## 1. 산출

| 산출 | 경로 |
|------|------|
| Room / list hub route | `lib/chat-domain/push/domain-room-route.ts` |
| Sound eventKey map | `lib/chat-domain/push/domain-sound-event-key.ts` |
| Push envelope | `lib/chat-domain/push/domain-push-envelope.ts` |
| Tests | `lib/chat-domain/__tests__/four-domain-phase-g.test.ts` |

---

## 2. 범위 / 금지

| 함 | 안 함 |
|----|------|
| ChatDomain → 기존 sound **eventKey 문자열** 매핑 | notification-sound SSOT registry/resolver 수정 (Phase 1 LOCK) |
| Domain room/list route builder | FCM dispatch / Native Call 배선 |
| Push envelope 타입 | hub/bell/list Surface writer |
| | REMOVE 실삭제 |

---

## 3. Gate

| # | 조건 | 결과 |
|---|------|------|
| 1 | route/sound/envelope unit | PASS |
| 2 | sound SSOT / Native Call 미수정 | PASS |
| 3 | Surface/REMOVE 미변경 | PASS |
| 4 | `verify:chat-domain-file-lock` | PASS |

**판정:** `PASS` · **STOP**

---

## 4. Phase H 킥오프 (승인 후만)

```text
docs/community-messenger/2026-07-23-four-domain-phase-g.md 준수.
Phase H만. Bell/Bottom/AppIcon/Domain list → projection 1 writer.
poll/optimistic/hub 우회 quarantine 준비. REMOVE 실삭제·Native Call 금지. 끝나면 STOP.
```
