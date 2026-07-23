# Phase E — Domain realtime envelope + dedupe

**선행:** Phase D · migration remote 적용 확인  
**상태:** **PASS** · **STOP** (Phase F 승인 전)

---

## 1. 산출

| 산출 | 경로 |
|------|------|
| Envelope + dedupe | `lib/chat-domain/realtime/domain-realtime-envelope.ts` |
| Bump wire optional domain | `room-bump-broadcast-server.ts` · `publish-messenger-room-bump.ts` |
| 수신 dedupe | `use-messenger-room-bump-broadcast-subscription.ts` → `resolveRoomBumpDedupeKey` |
| List SELECT domain 컬럼 | `service.ts` (migration 적용 후 재활성) |
| Tests | `lib/chat-domain/__tests__/four-domain-phase-e.test.ts` |

---

## 2. Wire 계약

Bump v2 payload **optional** 필드:

- `chatDomain`, `domainIdentity`, `eventId` (messageId 우선)
- 미dual-write / null → **omit** → 수신은 legacy `${from}|${mid}|${at}` dedupe

Domain dedupe: `` `${chatDomain}\0${domainIdentity}\0${eventId}` `` (+ seq)

---

## 3. 목록 직접 조작 payload 제거 — **계획만 (실행 = Phase H)**

| 현재 | 목표 (H) |
|------|----------|
| home RT `realtime_message_insert` → `applyHomeListPatch` | Domain envelope 신호만 → Domain list writer |
| bus `cm.room.incoming_message` → 동일 | 동일 |
| bump는 방 UI catch-up | 유지 · 목록 writer와 분리 |

**Phase E에서 `applyHomeListPatch` 미교체.**

---

## 4. Gate

| # | 조건 | 결과 |
|---|------|------|
| 1 | Envelope + dedupe unit | PASS |
| 2 | bump optional domain (unknown = 구 v2) | PASS |
| 3 | applyHomeListPatch / hub / bell 미교체 | PASS |
| 4 | REMOVE 0 · Native Call 0 | PASS |
| 5 | `verify:chat-domain-file-lock` | PASS |

**판정:** `PASS` · **STOP**

---

## 5. Phase F 킥오프 (승인 후만)

```text
docs/community-messenger/2026-07-23-four-domain-phase-e.md 준수.
Phase F만. 방 단위 원자 read; stale snapshot 복원 방지 version.
optimistic이 authority 되지 않게. Surface/REMOVE/Native 금지. 끝나면 STOP.
```
