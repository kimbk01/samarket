# Community Messenger Friendship SSOT

**Status:** design approved — **design phase closed** — **implementation forbidden until separate approval**  
**Baseline QA:** `report-2026-06-30T03-58-36` (03:58 KST)  
**Scope:** general friend DM friendship state only — not Call, Notification, trade/delivery commerce policy

---

## Goal

Friendship state must have **one write SSOT and one read resolver**.  
Accept/reject mutates **one row** in `community_messenger_friendships`; every UI surface re-reads that SSOT.  
No consumer (friend list, PeerNotice, room snapshot, bootstrap, home-sync) computes friendship independently.

---

## Core decisions (approved)

| # | Decision |
|---|----------|
| 1 | Friendship judgment uses **`community_messenger_friendships` as the sole SSOT**. |
| 2 | Friend list, PeerNotice, room snapshot, bootstrap, and home-sync **must not each compute friendship state separately**. |
| 3 | **`saved_by_me` / `saved_by_peer` / `community_friend_requests` / RPC `accepted_friends`** are removed from **final judgment** (migration/backfill targets only). |
| 4 | **General / trade / store_order** are separated by **`messengerDirectKey` (direct_key) only**. |
| 5 | **Legacy `contextMeta.kind` is not used** for general vs trade classification. |
| 6 | **Accept/reject** changes **one SSOT row**; all UI reflects via **SSOT re-fetch** (no per-surface patch chains). |

---

## State model

### DB storage (`community_messenger_friendships`)

```ts
type FriendshipSsotStatus = "pending" | "accepted" | "blocked" | "removed";
```

Existing columns remain authoritative: `requester_user_id`, `addressee_user_id`, `status`, `accepted_at`, `removed_at`, `blocked_by_user_id`, `readd_blocked_until`, `updated_at`.

### Viewer-relative pair state (read API output)

```ts
type FriendshipPairState =
  | "none"
  | "pending"
  | "accepted"
  | "blocked"
  | "removed"
  | "readd_cooldown";
```

### Direction (PeerNotice / CTA only — derived from SSOT row + viewer)

```ts
type FriendshipDirection =
  | "none"
  | "outgoing_pending"   // viewer = requester_user_id, state = pending
  | "incoming_pending"   // viewer = addressee_user_id, state = pending
  | "mutual_accepted";   // state = accepted
```

**Not final judgment:** `PeerRelationLabel` values `saved_by_me`, `saved_by_peer`, `mutual_friend` when sourced from `user_social_relations` mutual save.  
Block remains on **`user_social_relations`** (separate block SSOT); friendship resolver may **compose** block + friendship for UI but must not treat social save as accepted friendship.

---

## Single read contract (to implement later)

```
resolveFriendshipPair(viewerId, peerId) → {
  state: FriendshipPairState;
  direction: FriendshipDirection;
  row: FriendshipSsotRow | null;
}
```

### Resolver uniqueness (mandatory)

**`resolveFriendshipPair()` is the only function in the project that returns friendship pair state.**

| Allowed | Forbidden |
|---------|-----------|
| One implementation (+ thin list projection helpers that **only** read SSOT rows, no state logic) | Any other function that re-implements **accepted**, **pending**, **blocked**, or **direction** calculation |
| Block compose inside resolver (block SSOT + friendship SSOT) | Parallel resolvers, merge helpers, or “compat” copies of friendship judgment |

If a new code path needs friendship state, it **calls `resolveFriendshipPair`** — it does not add a second judgment path.  
Violations are treated as **new legacy** and are forbidden.

| Rule | Detail |
|------|--------|
| Single entry | All server paths call `resolveFriendshipPair` (or list projection built from SSOT table only). |
| No consumer queries | Friend list / snapshot / bootstrap / home-sync / PeerNotice must not query legacy tables or RPC for friendship judgment. |
| Block compose | Block lookup is allowed inside resolver; it does not override SSOT accepted/pending for friendship row semantics. |

Reference (current, pre-migration — to be consolidated into single resolver): `lib/community-messenger/friendship-resolver.ts`, `lib/community-messenger/friendship/community-messenger-friendships-ssot.ts`.

---

## Friendship SSOT Enforcement (필수)

다음 행위는 **새로운 Legacy 생성**으로 간주하며 **금지**한다.  
(마이그레이션 기간 read-only fallback은 [Legacy handling principle](#legacy-handling-principle) 범위에서만 허용.)

| # | Forbidden | Rationale |
|---|-----------|-----------|
| E1 | `resolveFriendshipPair()`를 거치지 않고 친구 상태를 **계산**하는 코드 | Second judgment path |
| E2 | `accepted`, `pending`, `blocked`, `direction`을 **Consumer에서 재계산**하는 코드 | UI/API layer must not re-derive state |
| E3 | Friend List, Bootstrap, Home Sync, PeerNotice, Snapshot이 **서로 다른 기준**으로 친구 여부를 판단하는 코드 | Consumer drift |
| E4 | SSOT 결과를 **수정·덮어쓰는 overlay/merge** 코드 (migration read-only fallback 제외) | Bootstrap overlay anti-pattern |
| E5 | SSOT와 **별도로** friendship truth를 유지하는 **새 friend 캐시** | Stale cache = second SSOT |
| E6 | Big-bang 전환 — 한 PR에서 모든 Consumer + legacy 삭제 동시 수행 | Gate bypass |

**Enforcement (implementation phase):** contract test / grep deny-list in CI; code review checklist; `source=legacy_*` metric alarm if > 0 outside approved fallback window.

---

## Consumer criteria

### Friend list

| Item | Rule |
|------|------|
| Source | SSOT rows with `status = accepted` where viewer is requester or addressee |
| Peer id | The non-viewer party on the row |
| Sort / badges | Profile enrich only; `isFriend` **only** from SSOT accepted |
| Forbidden | Merge with RPC `accepted_friends`, `community_friend_requests`, mutual `user_social_relations` |

### Chat list

| Item | Rule |
|------|------|
| Room rows | Room table + unread/mute as today |
| Friendship badge | SSOT only (not inferred from chat membership) |
| Domain split | See [Direct key domains](#direct-key-domains) |

### PeerNotice

| Precondition | `roomType = direct` AND general friend direct_key |
| Branch (LOCK — Phase 2-3A) | |
| `blocked` | Block SSOT active |
| `pending_outgoing_hidden` | `direction = outgoing_pending` |
| `pending_incoming` | `direction = incoming_pending` (+ Accept/Reject CTA) |
| `none` | `state = accepted` |
| `stranger` | general pair, not accepted, not pending incoming/outgoing per above |
| Forbidden | Pending/accepted from `saved_by_me` / `saved_by_peer` or legacy requests |
| Unknown peer dismiss | `community_messenger_peer_notices` unchanged (not friendship SSOT) |

Reference: `components/community-messenger/room/phase2/community-messenger-room-phase2-peer-notice-logic.ts`.

### Room snapshot

Assembled **once per pair** via `resolveFriendshipPair`:

| Field | Source |
|-------|--------|
| `peerFriendshipState` | Mapped from `FriendshipPairState` |
| `friendshipDirection` | Explicit recommended (or derivable from row + viewer) |
| `pendingRequestId` | SSOT row `id` when pending |
| Optional | `requesterUserId`, `addresseeUserId` for CTA wiring |

Forbidden: separate legacy request / social-relations lookups inside snapshot builder.

### Bootstrap / home-sync

| Tier | Friends | Chats |
|------|---------|-------|
| critical / lite / full / home-sync | **Same SSOT accepted projection** | Room list (direct_key rules unchanged) |

Forbidden:

- Per-tier different friendship sources
- RPC `accepted_friends` overlay (`resolve-bootstrap-accepted-friend-rows` pattern)
- Client-only friend list patch without SSOT re-fetch after accept/reject

### Direct start

Friend-request send, accept, reject, and direct-room friendship gates must read/write **SSOT row only** via the same resolver contract — not legacy request tables for judgment.

### Realtime

Home/room refresh triggers on friendship change must subscribe to **`community_messenger_friendships`** (SSOT), not legacy `community_friend_requests`, once migration wiring is complete.

### Bootstrap overlay — scheduled deletion

`lib/community-messenger/friendship/resolve-bootstrap-accepted-friend-rows.ts` exists because RPC `accepted_friends` is not trusted and results are **patched on top**.  
That pattern is **incompatible with SSOT** and is **scheduled for deletion after migration completes**.

| Status | Rule |
|--------|------|
| Now | Document only — do not extend overlay |
| After all consumers read SSOT | **Delete** overlay module and all callers |
| Never in SSOT world | “RPC + live fetch + union merge” for friendship accepted rows |

---

## Direct key domains

Classification uses **`messengerDirectKey` / `direct_key` only** — not `contextMeta.kind`.

| Domain | direct_key pattern | PeerNotice | Notes |
|--------|-------------------|------------|-------|
| General friend DM | sorted `userId:userId` (two UUID segments) | Yes (SSOT rules) | `isMessengerGeneralFriendDirectKey` |
| Trade commerce | `trade_pc:`, `trade_item:` | No | Trade enrich / dock separate |
| Store order | `store_order:`, `trade_order:` | No | Delivery UX separate |

Reference: `lib/community-messenger/messenger-room-domain.ts`.

**Legacy `contextMeta.kind = trade` on a general pair room:** display/headline metadata only.  
If SSOT says `pending`, pending CTA still applies (Phase 2-3A LOCK — 03:58 PASS).

---

## Accept / reject flow

```
UI Accept or Reject
  → single API mutates community_messenger_friendships (one row)
  → optional cache invalidate for viewer + peer projection
  → client refetch: home-sync and/or room bootstrap (must agree on SSOT)
  → friend list, chat list, PeerNotice, snapshot all from refetch — no local-only hide
```

| Action | SSOT change |
|--------|-------------|
| Accept | `status = accepted`, `accepted_at = now` |
| Reject | `status = removed` (or agreed terminal status), `removed_at = now` |

Forbidden after accept/reject:

- Dual-write to `community_friend_requests`
- Bootstrap overlay / home-only merge without SSOT read
- PeerNotice-only dismiss simulating accept

---

## Legacy handling principle

**Do not delete legacy paths immediately.**  
Legacy removal is **not** the final step after a single QA PASS — it is the step **after proof** that no consumer reads legacy for friendship judgment anymore.

| Phase | Action |
|-------|--------|
| A | **Backfill** legacy accepted/pending into `community_messenger_friendships` |
| B | **Read-only fallback** — resolver logs when fallback used; SSOT is still write path for new actions |
| C | **Prove** every consumer reads SSOT only (see [Legacy removal gate](#legacy-removal-gate)) |
| D | **QA Matrix** full PASS under SSOT-only read paths |
| E | **Remove fallback** from judgment (still no file deletion yet) |
| F | **Delete** legacy code, queries, RPC, Realtime subscriptions, bootstrap overlay |

**Wrong gate:** “QA PASS → delete legacy.”  
**Correct gate:** “All consumers proven SSOT-only → QA Matrix PASS → remove fallback → delete legacy.”

---

## Legacy removal gate

Legacy code, RPC, query, and fallback deletion happens **only when all conditions below are satisfied**.

### Consumer SSOT proof (100% each)

Static analysis, runtime metrics, or integration tests must show **zero friendship judgment reads** from legacy sources per consumer:

| Consumer | SSOT-only criterion |
|----------|---------------------|
| **Friend List** | Accepted peers from SSOT projection / `resolveFriendshipPair` list — no RPC merge |
| **Home Sync** | Same SSOT projection as bootstrap — no separate friends source |
| **Bootstrap** | Friends from SSOT — no RPC `accepted_friends`, no overlay |
| **Room Snapshot** | `peerFriendshipState` / direction from `resolveFriendshipPair` only |
| **PeerNotice** | Branch from resolver output only — no `saved_by_me` / `saved_by_peer` judgment |
| **Direct Start** | Send/accept/reject gates SSOT row only |
| **Realtime** | Friendship-driven refresh from `community_messenger_friendships` events |

Proof artifacts (implementation phase): grep/contract test deny-list, `source=legacy_*` metric **= 0** in staging, cross-consumer parity test on same pair.

### QA Matrix

03:58-equivalent device/API matrix **full PASS**, including **acceptFriendsList**, with SSOT-only read paths active.

### Only then — deletion allowed

| Delete | When |
|--------|------|
| Legacy **fallback** branches in resolver | After consumer proof + QA Matrix PASS |
| Legacy **code** (merge helpers, dual-write) | After fallback removed and re-verified |
| Legacy **RPC** (`accepted_friends` etc.) | After bootstrap/home-sync proven SSOT-only |
| Legacy **queries** (`community_friend_requests`, mutual friend social relations for judgment) | After no caller remains |
| **Bootstrap overlay** (`resolve-bootstrap-accepted-friend-rows`) | After bootstrap proven SSOT-only |

---

## Legacy removal order (mandatory sequence)

| Step | Remove / change | Prerequisite |
|------|-----------------|--------------|
| L1 | Stop **writing** `community_friend_requests` on new send/accept/reject | SSOT APIs live |
| L2 | Remove **`community_friend_requests`** from friendship **judgment** (fallback off) | L1 + backfill + [removal gate](#legacy-removal-gate) |
| L3 | Remove **mutual `user_social_relations` friend** from friendship judgment | L2 + backfill + removal gate |
| L4 | Remove **RPC `social_graph.accepted_friends`** from bootstrap friends input | L3 + removal gate |
| L5 | **Delete bootstrap overlay** (`resolve-bootstrap-accepted-friend-rows`) | L4 + bootstrap 100% SSOT proof |
| L6 | Deprecate **`saved_by_me` / `saved_by_peer`** for friendship judgment | L5 + PeerNotice on `FriendshipDirection` + removal gate |
| L7 | Delete dead queries, Realtime on legacy tables, remaining legacy helpers | L6 + removal gate re-run |

---

## Migration / backfill (required items)

| Item | Required | Description |
|------|----------|-------------|
| Accepted backfill | **Yes** | Legacy accepted pairs → SSOT `status=accepted` rows (dedupe by sorted pair) |
| Pending backfill | **Yes** | Outstanding `community_friend_requests` pending → SSOT `status=pending` |
| Social mutual friend | **Yes** | Pairs with mutual `user_social_relations` friend only → SSOT accepted if no row |
| RPC / view | **Review** | Replace `accepted_friends` RPC with SSOT-backed view or remove after L4 |
| Realtime | **Review** | Subscribe `community_messenger_friendships` instead of `community_friend_requests` for home refresh |
| Schema | **Unlikely** | Existing SSOT table sufficient; API may add `friendshipDirection` projection field |

Backfill scripts must be **idempotent** and log counts: inserted, skipped, conflict.

---

## Implementation sequence (Gate 방식 — Consumer 단위 교체)

**원칙:** 한 번에 전환하지 않는다. **Consumer 단위로 교체**하고, **각 Gate PASS 후에만** 다음 Step으로 진행한다.  
Implementation approval 후 Step 1부터 시작. Step 0까지 완료.

```
Step 0  설계 승인                          ✅ 완료
          ↓
Step 1  Resolver 구현 (`resolveFriendshipPair` + list projection)
          ↓
Gate A  Resolver 단위 테스트 100% PASS
          ↓
Step 2  Friend List 교체 (SSOT read only)
          ↓
Gate B  Friend List QA PASS (+ SSOT chain for list)
          ↓
Step 3  Room Snapshot + PeerNotice 교체
          ↓
Gate C  QA Matrix PASS (03:58-equivalent; LOCK paths)
          ↓
Step 4  Bootstrap + Home Sync 교체 (+ Direct Start / Realtime wiring)
          ↓
Gate D  모든 Consumer SSOT 증명 (100% each — [removal gate](#legacy-removal-gate))
          ↓
Step 5  Legacy read 제거 (fallback off; still no file delete)
          ↓
Step 6  Legacy 코드 / RPC / query / overlay 삭제
```

| Gate | PASS 조건 | FAIL 시 |
|------|-----------|---------|
| **A** | Resolver unit: all states, directions, readd_cooldown, block compose; uniqueness contract | Step 2 금지 |
| **B** | Friend list = SSOT projection; accept 후 list에 peer; no legacy merge in list path | Step 3 금지 |
| **C** | Device/API QA Matrix: pending CTA, outgoing hidden, legacy meta CTA, P0 T1, reject | Step 4 금지 |
| **D** | 7 consumers 100% SSOT proof; cross-consumer parity; `source=legacy_*` = 0 | Step 5 금지 |

Backfill (Phase A–B in [Legacy handling](#legacy-handling-principle)) runs **before or in parallel with Step 1**, not after Gate D.

### Risk summary (by step)

| Step | Risk | Mitigation |
|------|------|------------|
| 1 | Wrong pair/direction mapping | Gate A matrix |
| 2 | List regression / acceptFriendsList | Gate B |
| 3 | PeerNotice LOCK regression | Gate C |
| 4 | Bootstrap/home-sync drift | Gate D parity tests |
| 5 | Premature fallback off | Gate D must pass first |
| 6 | Orphan callers | L1–L7 order + deny-list CI |

**Do not start Step 1 until explicit implementation approval.**

---

## Implementation phases (reference — superseded by Gate sequence above)

The table below is retained for risk notes only. **Authoritative order is [Implementation sequence](#implementation-sequence-gate-방식--consumer-단위-교체).**

| Phase | Work | Risk |
|-------|------|------|
| 1 | Resolver | Medium |
| 2 | Friend List | High |
| 3 | Snapshot + PeerNotice | High |
| 4 | Bootstrap + Home Sync + Realtime | High |
| 5 | Legacy read off | Medium |
| 6 | Legacy delete | Medium |

---

## LOCK preservation (must not regress)

These behaviors are **frozen** until SSOT work passes equivalent QA:

| LOCK | Criterion |
|------|-----------|
| **P0 T1** | Accepted general pair: no trade process dock, no stranger bar; `messengerDirectKey = sorted pair` |
| **Phase 2-1 / 2-2** | PeerNotice branch set unchanged in product intent |
| **Phase 2-3A** | B pending incoming CTA; A pending outgoing hidden; legacy trade meta on general pair still shows pending CTA when SSOT pending; reject path; trade_pc no PeerNotice |
| **Out of scope** | Native Call, Notification SSOT, trade/delivery commerce routing, `/market` hot path |

Allowed change **only if** same QA gate passes: friends list reflects SSOT after accept.

---

## Test criteria (acceptance)

### SSOT chain (primary — replaces per-layer-only checks)

Every acceptance test must assert the **same chain**:

```
DB community_messenger_friendships (row truth)
  ↓
resolveFriendshipPair(viewer, peer)
  ↓
identical friendship state at ALL consumers
```

| Step | Assert |
|------|--------|
| 1 | SSOT row `status` / direction matches expected after action |
| 2 | `resolveFriendshipPair` output matches row |
| 3 | Friend List, Home Sync, Bootstrap, Room Snapshot, PeerNotice branch, Direct Start gate, Realtime payload — **same state** for same viewer+peer |

**Deprecated as sole gate:** checking bootstrap, then home-sync, then UI **independently** without proving they equal resolver output.

### Unit

- `resolveFriendshipPair`: all states + directions + readd_cooldown
- **Uniqueness contract:** no other module exports friendship accepted/pending/blocked/direction judgment
- PeerNotice branch from resolver only — matches 03:58 matrix
- General vs commerce direct_key → PeerNotice `none`
- Cross-consumer parity: one pair → one resolver result → all consumer projections match

### API (no device)

- A → B request; B accept → SSOT `accepted`
- Resolver + friend list + home-sync + bootstrap + room snapshot **agree** on accepted + peer id
- No legacy `source` in resolver metrics

### Device QA (03:58 baseline infra — no CDP expansion)

Behavior matrix unchanged; results must be explainable via SSOT chain above.

| Check | Expected |
|-------|----------|
| B login | PASS |
| pending incoming CTA | PASS |
| pending outgoing hidden | PASS |
| legacy trade meta CTA | PASS |
| P0 T1 | PASS |
| acceptFriendsList | **Gate** — must PASS; SSOT row accepted + all consumers show peer |
| reject friends | PASS |

---

## DO NOT (until implementation approval)

- Modify product code for this design (ad hoc patches)
- Extend QA CDP / apk-webview-cdp helpers
- Patch PeerNotice, bootstrap overlay, or home-sync merge ad hoc
- Touch P0 / Phase 2-1 / 2-2 / 2-3A LOCK paths outside Gate C–controlled SSOT rollout
- Change Native Call, Notification, trade/delivery policy
- Skip Gates A–D or big-bang all consumers in one change
- Remove legacy tables, RPC, fallback, or overlay before [removal gate](#legacy-removal-gate) satisfied
- Violate [Friendship SSOT Enforcement](#friendship-ssot-enforcement-필수) (E1–E6)

---

## Related code (reference — do not change now)

| Area | Path |
|------|------|
| SSOT table helpers | `lib/community-messenger/friendship/community-messenger-friendships-ssot.ts` |
| Pair resolver (pre-cleanup — consolidate to single `resolveFriendshipPair`) | `lib/community-messenger/friendship-resolver.ts` |
| Bootstrap overlay (**migration 완료 후 삭제 예정**) | `lib/community-messenger/friendship/resolve-bootstrap-accepted-friend-rows.ts` |
| PeerNotice logic | `components/community-messenger/room/phase2/community-messenger-room-phase2-peer-notice-logic.ts` |
| Direct key domain | `lib/community-messenger/messenger-room-domain.ts` |
| Relation label (legacy) | `lib/community-messenger/peer-relation-label.ts` |

---

## Friendship SSOT 원칙

Community Messenger에서 친구 상태를 **계산**하는 로직은 **`resolveFriendshipPair()` 하나만** 존재한다.

모든 Consumer(Friend List, Chat List, PeerNotice, Room Snapshot, Bootstrap, Home Sync, Realtime, Direct Start)는 **반드시 이 Resolver만** 사용한다.

동일한 Friendship 상태를 다른 위치에서 **다시 계산**하거나 **merge**하는 코드는 **새로운 Legacy**로 간주하며 **금지**한다.

Legacy 삭제는 QA PASS만으로 하지 않는다. **모든 Consumer가 더 이상 Legacy를 읽지 않는 것이 증명된 후** fallback 제거 → 코드/RPC/query/overlay 삭제 순으로 진행한다.

---

## Red team verdict (current)

| Item | Status |
|------|--------|
| 설계 문서 | ✅ 승인 가능 |
| 구현 보류 | ✅ 적절 |
| Legacy 삭제 방향 | ✅ 적절 (증명 후 삭제) |
| 구현 진행 방식 | ⚠️ **반드시 Gate A–D** — Consumer 단위 교체 |
| 지금 할 일 | ❌ 추가 패치 금지 — 별도 승인 후 Step 1부터 SSOT 구현 프로젝트 |

**결론:** 이 설계를 기준으로 Friendship SSOT 구현을 **새 프로젝트**로 시작하는 것이 가장 안전하다.  
현 시점에서는 문서만 유지하고 코드 변경하지 않는다.

---

## Friendship SSOT Governance (설계 변경 금지)

**설계 단계 종료.** 이 문서는 Community Messenger Friendship의 **기준 문서**이다.

버그를 고치다가 설계가 암묵적으로 바뀌는 것이 지금까지 가장 큰 문제였다.  
**설계 변경 = 별도 작업** — 구현 중 임의 변경 금지.

### 설계 변경으로 간주 (구현 중 임의 변경 금지)

| # | Change type |
|---|-------------|
| G1 | Friendship 상태 **enum** 변경 |
| G2 | Resolver 계약 (`resolveFriendshipPair`) 변경 |
| G3 | Friend List / Chat List / PeerNotice / Bootstrap / Home Sync가 **서로 다른 판단 기준**을 갖도록 변경 |
| G4 | Friendship 판단에 **새 overlay, merge, cache** 추가 |
| G5 | **새 Legacy fallback** 추가 |
| G6 | **direct_key** 기반 도메인 분리 규칙 변경 |

위 항목은 **버그 수정으로 처리하지 않는다.**

### 설계 변경 절차 (필수)

```
1. 설계 문서 수정 (this file)
2. 영향 범위 분석
3. QA Matrix 수정
4. 구현 승인
5. 구현
```

**설계 문서를 수정하지 않은 구현은 설계 위반**으로 간주한다.

### 설계 단계 상태

| Item | Status |
|------|--------|
| Friendship SSOT 설계 | ✅ 승인 — 설계 단계 **종료** |
| Legacy 제거 전략 | ✅ 승인 |
| Consumer 단일 Resolver | ✅ 승인 |
| Gate 기반 구현 순서 | ✅ 승인 |
| Enforcement (E1–E6) | ✅ 승인 |
| Governance (본 절) | ✅ 포함 — 장기 유지 |

다음 작업은 **별도 구현 승인** 후 Step 1 (Resolver)부터 Gate A–D 순으로만 진행한다.

---

## Change log

| Date | Change |
|------|--------|
| 2026-06-30 | Design approved; document created. Implementation forbidden pending separate approval. |
| 2026-06-30 | Red team: legacy removal gate (consumer SSOT proof), resolver uniqueness, bootstrap overlay deletion schedule, SSOT-chain QA, Friendship SSOT 원칙. |
| 2026-06-30 | Friendship SSOT Enforcement (E1–E6); Gate A–D implementation sequence; consumer 단위 교체; red team verdict. |
| 2026-06-30 | Friendship SSOT Governance — 설계 변경 절차; **설계 단계 종료**. |
| 2026-06-30 | **Step 1 + Gate A:** `resolve-friendship-pair.ts` — `resolveFriendshipPair`, list projection; `friendship-resolver` delegates; unit tests PASS. |
| 2026-06-30 | **Step 2 + Gate B:** `list-community-messenger-friends-ssot.ts`; `GET /api/community-messenger/friends` SSOT accepted only; home-sync/bootstrap path unchanged. |
| 2026-06-30 | **Step 3 + Gate C:** `room-snapshot-friendship-projection.ts`; general direct room snapshot + PeerNotice pending branch from `resolveFriendshipPair` / `friendshipDirection` only. |
| 2026-06-30 | **Step 4 + Gate D:** `bootstrap-accepted-friend-rows-from-ssot.ts`; home-sync + bootstrap friends SSOT projection; overlay caller removed from snapshot assemble. |
