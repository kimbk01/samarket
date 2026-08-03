# Gate 3 Step 5 — Conversation Authority B

**Verdict:**

```text
CONVERSATION AUTHORITY B CODE PASS
```

| Declaration | Status |
|-------------|--------|
| CONVERSATION AUTHORITY B CODE PASS | **YES** |
| Badge Authority CODE PASS | **NO** |
| RUNTIME / PRODUCT / HARD LOCK | **NO** |
| Step 6 App Icon entry | **ALLOWED** (B CODE only) |

---

## 1. HEAD에서 증명한 B 계약 실패

Evidence: `docs/notifications/badge-gate3-impl/gate3-step5-head-b-fail-proof.md`

| ID | Failure |
|----|---------|
| F1 | No canonical `rooms[]` with unreadMessageCount → parent counts inventable separately from rows |
| F2 | Bottom/Trade/Order helpers took independent numbers (not one B set) |
| F3 | Slice 2-3 `bMemberTotal` included orphan missed (Gate 3 B = rooms only) |
| F4 | No `resolveMemberConversationAuthority` / domainIdentityKey / authorityVersion |
| F5 | Optimistic UI / resume writers could clear surfaces without ACK |

---

## 2. 수정 파일

| Path | Role |
|------|------|
| `member-conversation-b-authority.ts` | Canonical B resolver + message/read apply + missed XOR |
| `conversation-b-from-participant-facts.ts` | Fact bags → B room inputs |
| `member-communication-b-projection.ts` | Re-export + `projectMemberConversationSurfacesFromRooms` |
| `build-domain-badge-authority-http.ts` | Expose B authority; Bottom from B surfaces; **App Icon total unchanged** |
| `__tests__/member-conversation-b-authority.test.ts` | Contract tests |
| `gate3-step5-head-b-fail-proof.md` | HEAD fail evidence |
| `gate3-step5-b-writer-classification.md` | Writer KEEP/ROUTE/ADAPTER/DELETE |
| `gate3-step5-conversation-b-report.md` | This report |

---

## 3. Canonical B resolver 경로

```text
participant unread Facts (messengers + trade + customer order)
  → conversationRoomInputsFromParticipantFacts
  → resolveMemberConversationAuthority(memberId, rooms)
       → { general/group/trade/orderUnreadRooms, totalUnreadRooms, rooms[], authorityVersion, computedAt }
            ├── Bottom = general + group
            ├── Trade Hub = trade
            ├── Order Hub = order (customer)
            └── B = totalUnreadRooms
```

Module: `lib/notifications/badge-authority-rebuild/member-conversation-b-authority.ts`

---

## 4. 도메인별 unread room 수

```text
generalUnreadRooms = count(general_direct where unreadMessageCount > 0)
groupUnreadRooms   = count(group …)
tradeUnreadRooms   = count(trade …)
orderUnreadRooms   = count(store_order_customer …)
totalUnreadRooms   = sum of the four
```

Owner `store_order_owner` excluded.

---

## 5. 방별 unread message 수

```text
rooms[i].unreadMessageCount  → Room Row badge
```

Parent never equals Σ messages (`sumUnreadMessages` ≠ `totalUnreadRooms` proven in tests).

---

## 6. Bottom / Trade / Order projection 공식

```text
Bottom Chat = generalUnreadRooms + groupUnreadRooms
Trade Hub   = tradeUnreadRooms
Order Hub   = orderUnreadRooms
B           = totalUnreadRooms
```

`projectSurfacesFromConversationAuthority`.

---

## 7. read ACK 경로

| Layer | Path |
|-------|------|
| Canonical clear | `applyReadAckToConversationRooms` only when `serverAckOk: true` → unread N→0 |
| Production ACK | `markRoomReadAtomic` / domain atomic mark_read (**KEEP**) |
| Forbidden | route enter / push tap / UI −1 without ACK (`serverAckOk: false` leaves count) |

---

## 8. 제거·route·유지 writer

See `gate3-step5-b-writer-classification.md`.

Summary: participant unread + server ACK **KEEP**; surface helpers **ROUTE** via canonical B; orphan-in-B_member **ADAPTER** until Step 6; owner rooms **ROUTE** to C; UI invent **DELETE**.

---

## 9. duplicate / replay 방지

| Mechanism | Key |
|-----------|-----|
| Room set dedupe | `domainIdentityKey` (first wins) |
| Sender exclusion | `senderId === memberId` → no unread bump |
| Read idempotent | ACK twice → still 0 rooms |
| Message replay | same room 1→2 bumps row only; domain room count unchanged |

---

## 10. missed call XOR 증거

| Case | Result |
|------|--------|
| Room-bound | Room unread → B only (`includesRoomBoundMissedCall` on room) |
| Orphan | Not in room inputs → B=0; XOR helper fails if same id in orphan + roomBound |
| A | Step 4 orphan → A; B mutations do not change A event ids |

---

## 11. A 비회귀

```bash
npx vitest run …/authority-a-set-contract.test.ts …/member-notification-a-projection.test.ts
# PASS — digitEventIds = unreadListEventIds = markAllTargetEventIds
```

B apply/read tests assert A snapshots unchanged.

---

## 12. 테스트 수와 결과

| Suite | Result |
|-------|--------|
| `member-conversation-b-authority.test.ts` | 13 PASS |
| A contract + projection + mark-all + identity + B projection + inbox-bell | 57 PASS |
| **Total this gate run** | **70 PASS** |

---

## 13. 전체 tsc / lint

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | **PASS** |
| `npm run lint` (`eslint . --quiet`) | **PASS** |

(Fixed TS2322 on A/B `memberKey` narrowing — same-step.)

---

## 14. B 외 영역 무변경 증거

| Area | Evidence |
|------|----------|
| App Icon formula / Native / Cap | `memberAppIconWebTotal` / `appIconTotal` still Slice 2-3 path; no android/ios edits |
| Owner C | owner bags excluded from B inputs; no C modules changed |
| Push routing | untouched |
| DB migration / backfill / deploy / APK | none |
| Notification Center UI redesign | none |

---

## 15. 남은 위험

1. HTTP bag identity fallbacks use `*:room:{uuid}` until loaders always pass Gate 2 `domain_identity_key` (count still correct per roomId).
2. App Icon still adds orphan missed (Step 6 must cut over to A+B rooms-only).
3. Optimistic list/hub writers still ADAPTER — must resync from Facts after ACK.
4. Runtime/device not proven.

---

## 16. Step 6 진입 가능 여부

**YES** — Conversation Authority B is CODE PASS.  
Next: App Icon = A + B wiring only. Do **not** declare Badge Authority / Runtime / Product / Hard Lock.
