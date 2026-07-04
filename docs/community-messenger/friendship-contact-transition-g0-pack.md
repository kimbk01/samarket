# DIBAY Friend → Telegram-style Contact — G0 승인 패키지

**Status:** **G0 APPROVED** (2026-07-04) · **G1 merged** · **G1-I ✅** · **P1 ✅** · **P2 ✅** · **P3 ✅** · **P4 ✅** · **G4 ⏳ HOLD** · **G5 ⏳**
**Date:** 2026-07-04  
**Scope:** general friend DM only — Call · Native · Push · trade/delivery commerce **범위 외**

---

## 승인 Gate

| Gate | 조건 | 담당 | 현재 |
|------|------|------|------|
| **G0** | 본 패키지 §1–11 · §9 Design PASS · §10 Product 설계 변경 영향 서명 | Product + Eng **설계** 검토 | ✅ **2026-07-04** |
| **G1** | §1 LOCK amendment **Engineering 검토·승인** 완료 → `friendship-ssot-design.md` merge | Eng (LOCK 계약) | ✅ merge |
| **G1-I** | P1–P4 구현 범위 승인 (§4 예상 파일·§5 영향·rollback 확인) | Eng | ✅ |
| **G4** | P1–P4 완료 후 **승인 범위 = 실제 구현** 일치 검증 (§11) | Eng + Red Team | ⏳ HOLD |
| **G2** | PeerNotice QA matrix **실행** PASS (Device QA) | QA + Eng | **G4 PASS 후** |
| **G3** | Block bilateral hide QA matrix **실행** PASS (Device QA) | QA + Eng | **G4 PASS 후** |
| **G5** | 릴리스 직전 **Release Audit** — 릴리스 가능 상태 최종 감사 (§12) | Eng + Red Team | G2/G3 PASS 후 |

**절차 (생략 금지):**

```
G0 설계 승인
  → G1 LOCK amendment 검토·승인 → merge
  → G1-I 구현 범위 승인 (P1–P4)
  → P1–P4 구현
  → G4 Scope Verification
  → G2 / G3 Device QA PASS
  → G5 Release Audit
  → Production PASS → 릴리스
```

**Gate 역할 분리 (G4 · Device QA · G5):**

| Gate | 질문 |
|------|------|
| **G4** | 구현 결과가 승인 범위와 **일치**하는가? |
| **Device QA (G2/G3)** | 실제 기기에서 **정상**인가? |
| **G5** | **릴리스 가능**한 상태인가? |

**G0 승인 ≠ G1 merge ≠ P1 착수 ≠ G4 생략.** 각 Gate는 **별도 승인 기록**이 있어야 한다.

### Red Team Rule (DIBAY — scope creep 차단)

> **구현 완료 후에도** 승인되지 않은 기능이 **1개라도** 추가되면 해당 구현은 **FAIL**로 판정한다.  
> 기능이 좋아졌는지 여부와 **관계없이**, 승인 범위를 벗어난 구현은 **반드시 제거 또는 원복**한다.  
> G4 Scope Verification 에서 위반 1건 = **G4 FAIL** → QA(G2/G3)·Production 진행 **금지**.

**G0 승인 전 금지:** 코드 · DB migration · LOCK 본문 수정 · Native/Push/Call/Runtime · pending 제거 구현 · friend-request API 제거

---

## G0 확정 4항 (Product/Eng 승인안)

| # | 결정 |
|---|------|
| 1 | **pending 친구신청 모델 폐기** |
| 2 | **친구 목록 = viewer-local saved contact** (`user_social_relations.friend` 단방) |
| 3 | **A/B PeerNotice = first message sender / recipient** |
| 4 | **B 차단 시 A inbox에서도 방 hide** |

---

# 1. `friendship-ssot-design.md` LOCK Amendment 초안

> **본 문서는 초안이다.** `docs/community-messenger/friendship-ssot-design.md` **본문은 G1 승인 전 수정하지 않는다.**  
> G1 merge 시 아래 diff를 본문에 반영한다.

## 1-A. Goal (교체안)

**Before (현재 LOCK):**

> Friendship state must have one write SSOT … Accept/reject mutates one row in `community_messenger_friendships`.

**After (amendment):**

> General friend **Contact** state must have **one write SSOT and one read resolver** for viewer-local contact saves.  
> **Contact add** mutates **`user_social_relations`** (`relation_type=friend`, owner→target, **단방**).  
> Every UI surface (friend list, PeerNotice, room snapshot contact flags, bootstrap, home-sync) re-reads that SSOT via a single resolver — **no pending approval step**.  
> `community_messenger_friendships` is **legacy read-only** until backfill/deletion gate (L1–L7) completes; **no new pending writes**.

## 1-B. Core decisions (교체·추가)

| # | Before (approved 2026-06-30) | After (amendment) |
|---|------------------------------|-------------------|
| 1 | `community_messenger_friendships` sole SSOT | **`user_social_relations.friend` = Contact write/read SSOT** |
| 2 | Consumers must not compute friendship separately | Unchanged — **single `resolveContactPair` (or renamed resolver)** |
| 3 | Remove saved_by_me from final judgment | **Inverted:** saved_by_me **is** contact judgment; mutual = both directions saved |
| 4 | direct_key domain split | **Unchanged** |
| 5 | contextMeta.kind not for classification | **Unchanged** |
| 6 | Accept/reject one SSOT row | **Replaced:** `addContact(viewer, peer)` one row per owner; **no accept/reject** |
| **7 (new)** | — | **pending / FriendshipDirection pending branches deprecated** |
| **8 (new)** | — | **PeerNotice A/B asymmetric** via first-message sender/recipient |
| **9 (new)** | — | **Block bilateral hide:** blocker + blocked peer inbox hide |

## 1-C. State model (교체안)

### Contact storage SSOT

```ts
// user_social_relations — viewer-local contact
type ContactSsotRow = {
  owner_user_id: string;
  target_user_id: string;
  relation_type: "friend"; // Contact save
};
```

### Viewer-relative read output

```ts
type ContactPairState =
  | "none"           // viewer has not saved peer
  | "saved_by_me"    // viewer saved peer (in friend list)
  | "saved_by_peer"  // peer saved viewer (informational / badge only)
  | "mutual"         // both saved (derived, not stored)
  | "blocked";       // block SSOT active (either direction for comms gate)

// REMOVED from product:
// pending | accepted | outgoing_pending | incoming_pending | readd_cooldown (friend-request)
```

### Legacy (`community_messenger_friendships`)

| Status | Amendment rule |
|--------|----------------|
| `pending` | **No new writes**; read fallback until L2 gate |
| `accepted` | Read fallback only; map to `mutual` hint during migration if both saves missing |
| `blocked` / `removed` | Read-only; block comms still via `user_social_relations.blocked` |

## 1-D. Single read contract (교체안)

```
resolveContactPair(viewerId, peerId) → {
  state: ContactPairState;
  savedByMe: boolean;
  savedByPeer: boolean;
  blockedEitherWay: boolean;
  source: "social_relations" | "legacy_friendships" | "none";
}
```

**Resolver uniqueness:** `resolveContactPair` (name TBD at G1) is the **only** contact-pair judgment entry.  
`resolveFriendshipPair` becomes **deprecated alias** during migration, then deleted at L7.

## 1-E. PeerNotice (LOCK Phase 2-3A **supersedes**)

| Precondition | `roomType = direct` AND `generalFriendDirectRoomGate` |
| Branch | Rule |
|--------|------|
| `none` | viewer is **first message sender (initiator)** OR viewer **saved peer (contact)** OR trade/delivery |
| `add_contact` | viewer is **inbound recipient** AND not contact AND not blocked |
| `blocked` | `blockedByMe` (unblock CTA) |
| **REMOVED** | `pending_incoming`, `pending_outgoing_hidden`, friendshipDirection pending |

**Initiator/recipient SSOT:**

1. Primary: `isViewerRecipientOfInboundDirectChat(viewer, peer, messages)` — `lib/community-messenger/peer-notices.ts`
2. Fallback (zero chat messages): `room.created_by === viewer` → initiator; else if only one participant joined via direct/start from viewer session → initiator (QA matrix §2)

**Dot menu:** same initiator hide — no Add Contact row for initiator.

## 1-F. Friend list (교체안)

| Item | Rule |
|------|------|
| Source | `user_social_relations` where `owner_user_id = viewer` AND `relation_type = friend` |
| Sort / badges | Profile enrich; `isFriend` = **savedByMe** |
| Mutual badge | Optional when `savedByPeer` also true |
| **Forbidden** | Pending request sections; `community_messenger_friendships.status=pending` list |

## 1-F. Accept/reject flow (삭제)

```
REMOVED:
  UI Accept/Reject → applyFriendshipRequestAction → pending/accepted

REPLACED:
  UI Add Contact → addContactSaved(viewer, peer) → immediate friend list
```

## 1-G. LOCK preservation (amended)

| LOCK | Before | After |
|------|--------|-------|
| P0 T1 | Accepted general pair: no trade dock | **Unchanged** |
| Phase 2-3A | pending incoming/outgoing CTA | **Replaced** by add_contact + initiator hide (G2 QA) |
| Commerce direct_key | No PeerNotice | **Unchanged** |

## 1-H. Governance

Amendment merge = **G1 only**, after G0 sign-off.  
Until G1: existing LOCK text remains authoritative; **implementation that contradicts LOCK is forbidden**.

## 1-I. Change log entry (G1 merge 시 append)

| Date | Change |
|------|--------|
| 2026-07-04 | G0: Contact transition amendment draft — pending deprecated, viewer-local contact SSOT, A/B PeerNotice, bilateral block hide. |

---

# 2. A/B PeerNotice QA Matrix

**Reference implementation target:** `community-messenger-room-phase2-peer-notice-logic.ts`, `CommunityMessengerRoomPhase2PeerNotice.tsx`, `peer-notices.ts`

**Actors:** A = first sender (initiator), B = inbound recipient, general friend direct room only.

## 2-A. Preconditions (all cases)

- `roomType = direct`
- `generalFriendDirectRoomGate(room, viewer) = true`
- Not trade/delivery commerce direct_key
- Unless noted: no block, no contact save yet

## 2-B. Matrix

| ID | Scenario | Viewer | First msg sender | Contact | Block | Expected PeerNotice | Expected Dot menu Add | Pass criteria |
|----|----------|--------|------------------|---------|-------|---------------------|----------------------|---------------|
| PN-01 | A search → start chat → send 1st msg | A | A | none | — | **none** | **hidden** | No bar; no UserPlus |
| PN-02 | B opens same room after A msg | B | A | none | — | **Add Contact + Block** | Add visible | Bar + buttons |
| PN-03 | Empty room, A created via direct/start | A | (none) | none | — | **none** | hidden | created_by fallback = initiator |
| PN-04 | Empty room, B opens before any msg | B | (none) | none | — | **none** | hidden | No first msg yet; no bar |
| PN-05 | B adds contact | B | A | B→A | — | **none** | Friend | B friend list has A |
| PN-06 | After PN-05, A opens room | A | A | B→A only | — | **none** | Add still ok for A→B | A may add A→B separately |
| PN-07 | Mutual contact | either | * | both | — | **none** | Friend | Both lists |
| PN-08 | A blocked B (blockedByMe) | A | * | * | A→B | **blocked_by_me** unblock | — | Unblock works |
| PN-09 | B blocked by A (blockedByPeer) | B | A | * | A→B | **none** (peer block) | — | B cannot msg; bar policy per block UX |
| PN-10 | Legacy pending row exists | B | A | none | — | **Add Contact only** (no Accept/Reject) | Add | Pending UI **must not** appear post-G1 |
| PN-11 | trade_pc direct_key | either | * | * | — | **none** | trade menu | Commerce exclusion |
| PN-12 | store_order direct_key | either | * | * | — | **none** | delivery menu | Commerce exclusion |
| PN-13 | contextMeta.kind=trade on general pair | B | A | none | — | **Add Contact** (not trade dock) | general | SSOT contact, not legacy meta |
| PN-14 | B dismiss unknown peer (if wired) | B | A | none | — | hidden after dismiss | — | `community_messenger_peer_notices` |

## 2-C. API / snapshot assertions (device or API)

| ID | Assert |
|----|--------|
| PN-A1 | Room snapshot: initiator → no `pendingFriendshipRequestId` |
| PN-A2 | `friendshipDirection` pending values **not** used for PeerNotice branch post-amendment |
| PN-A3 | Add Contact POST → `user_social_relations` friend row owner=viewer |
| PN-A4 | After add, refresh snapshot → contact state `saved_by_me` / list membership |

## 2-D. FAIL conditions (auto-reject)

- Initiator (A) sees Add Contact or Accept/Reject after first send
- Recipient (B) sees Accept/Reject pending bar
- Pending outgoing hides bar for A **only because pending** — post-amendment must be initiator rule
- Trade room shows stranger/add contact bar

---

# 3. Block Bilateral Hide QA Matrix

**Reference:** `app/api/community-messenger/relations/block/route.ts`, `participant-block-hide.ts`, `direct-room-communication-gate.ts`, home-sync chat list

**Actors:** B blocks A from chat room (blockSource=chat_room).

## 3-A. Communication gate (existing — must remain PASS)

| ID | Action | Actor | Expected | Verify |
|----|--------|-------|----------|--------|
| BL-C01 | Send text | A → B after B blocked A | **403 blocked_target** | `sendCommunityMessengerMessage` + `assertDirectRoomCommunicationNotBlocked` |
| BL-C02 | Send text | B → A after B blocked A | **403 blocked_target** | either-way block |
| BL-C03 | Start voice call | A → B | **deny_blocked** | `canStartDirectCallBetweenUsers` |
| BL-C04 | Incoming call push | A → B | **suppressed** | existing SSOT_CONTRACT markers (Native unchanged) |
| BL-C05 | Unblock | B unblocks A | send OK | gate clears |

## 3-B. Inbox hide — **current vs target**

| ID | Viewer | Event | **Current** | **Target (G0 #4)** | Pass |
|----|--------|-------|-------------|-------------------|------|
| BL-H01 | B (blocker) | B blocks A | room hidden in B chat list | same | ✅ existing |
| BL-H02 | A (blocked) | B blocks A | room **may still show** | room **hidden** in A chat list | ❌ → fix Phase 3 |
| BL-H03 | A | B unblocks | — | A room **restored** in list | Phase 3 |
| BL-H04 | B | B unblocks | B room restored | same | ✅ existing |
| BL-H05 | A | deep link to room URL | — | redirect or empty/error; **no send** | Phase 3 |
| BL-H06 | A | search @B after block | — | start chat **denied** or no-op | `resolveDirectInteractionGuard` |

## 3-C. DB / participant assertions

| ID | Assert |
|----|--------|
| BL-D01 | After block: B participant row `blocked_hidden_at` set |
| BL-D02 | **Target:** A participant row `blocked_hidden_at` (or equivalent peer-suppressed flag) set |
| BL-D03 | Messages not deleted for either party |
| BL-D04 | Unblock clears hide flags for **both** viewers |

## 3-D. FAIL conditions

- A can send message after B blocked A
- A sees active thread in chat list after B blocked A (post-Phase 3)
- Block deletes message history
- Native/Push/Call code changed to achieve hide

---

# 4. 예상 수정 파일표

**Legend:** P1 Contact write · P2 Read/UI · P3 Block hide · P4 Notification cleanup · **⊘ 금지**

## 4-A. Write / API (P1 — G1 후)

| File | Change |
|------|--------|
| `lib/community-messenger/social-relations.ts` | `addContactSaved` as official Contact write; document SSOT |
| `lib/community-messenger/service.ts` | `sendCommunityMessengerFriendRequest` → contact add semantics; stop pending insert |
| `app/api/community-messenger/relations/friend/route.ts` | POST instant contact |
| `lib/community-messenger/friendship/community-messenger-friendships-ssot.ts` | pending insert paths **deprecated** (no delete yet) |
| `app/api/community-messenger/friend-requests/route.ts` | **Later phase:** deprecate response only (G0 forbids removal now) |
| `app/api/community-messenger/friend-requests/[requestId]/route.ts` | Same |
| `app/api/community-messenger/friend-requests/respond-incoming/route.ts` | Same |
| `app/api/community-messenger/friend-requests/cancel-outgoing/route.ts` | Same |

## 4-B. Read / resolver (P1–P2)

| File | Change |
|------|--------|
| `lib/community-messenger/friendship/resolve-friendship-pair.ts` | Contact states; pending deprecated |
| `lib/community-messenger/friendship-resolver.ts` | Delegate to contact resolver |
| `lib/community-messenger/friendship/list-community-messenger-friends-ssot.ts` | List from contact saves |
| `lib/community-messenger/friendship/bootstrap-accepted-friend-rows-from-ssot.ts` | Contact projection |
| `lib/community-messenger/friendship/room-snapshot-friendship-projection.ts` | Contact flags; drop pending id |
| `lib/community-messenger/get-community-messenger-home-sync-bundle.ts` | Friend list source |
| `lib/community-messenger/user-public-id-search.ts` | `isFriend` = savedByMe |
| `lib/community-messenger/messenger-friend-model.ts` | Remove pending sections |

## 4-C. PeerNotice / room UI (P2)

| File | Change |
|------|--------|
| `lib/community-messenger/peer-notices.ts` | Wire recipient/initiator into branch input |
| `components/community-messenger/room/phase2/community-messenger-room-phase2-peer-notice-logic.ts` | Remove pending branches; add initiator/recipient |
| `components/community-messenger/room/phase2/CommunityMessengerRoomPhase2PeerNotice.tsx` | Add Contact CTA; remove accept/reject |
| `components/community-messenger/room/phase2/MessengerUnknownPeerNoticeBar.tsx` | Remove pending_incoming variant |
| `components/community-messenger/room/phase2/CommunityMessengerRoomPhase2OneToOneDotMenu.tsx` | Initiator hide; remove requested state |
| `components/community-messenger/room/phase2/ChatRoomMoreMenu.tsx` | Remove pending row |
| `lib/community-messenger/room/messenger-room-friendship-sync.ts` | Contact patch paths |

## 4-D. Home / search / friend tab (P2)

| File | Change |
|------|--------|
| `components/community-messenger/MessengerFriendAddSheet.tsx` | Tap-to-enter; remove send button |
| `components/community-messenger/CommunityMessengerHome.tsx` | Inline search; remove request sections |
| `components/community-messenger/MessengerFriendsScreen.tsx` | Remove sent/received request UI |
| `components/community-messenger/friend-list/CommunityMessengerFriendSection.tsx` | Section labels |
| `components/community-messenger/MessengerFriendProfileSheet.tsx` | Instant add contact |
| `lib/community-messenger/messenger-friend-add-cta.ts` | Contact CTA labels |

## 4-E. Block bilateral hide (P3)

| File | Change |
|------|--------|
| `lib/community-messenger/participant-block-hide.ts` | Hide peer participant on block |
| `app/api/community-messenger/relations/block/route.ts` | Invoke bilateral hide |
| `lib/community-messenger/home-sync-snapshot-assemble.ts` (or chat list filter) | Filter blocked-hidden for both viewers |
| `app/api/community/block-relations/route.ts` | Align if shared entry |

## 4-F. Notification / badge (P4 — Web only)

| File | Change |
|------|--------|
| `components/community-messenger/GlobalIncomingFriendRequestHost.tsx` | Unmount / remove |
| `lib/community-messenger/use-incoming-friend-request-popup.ts` | Remove subscription |
| `lib/community-messenger/use-friend-request-notification-realtime.ts` | Remove |
| `lib/community-messenger/incoming-friend-request-popup-from-notification-row.ts` | Remove |
| `lib/community-messenger/partition-messenger-friend-requests.ts` | Remove pending badge |
| `lib/i18n/catalog/community-messenger-ui.ts` | Contact copy (new/changed keys only) |

## 4-G. Tests (post-implementation)

| File | Change |
|------|--------|
| `lib/community-messenger/__tests__/peer-notices.test.ts` | Initiator/recipient cases |
| `components/community-messenger/room/phase2/__tests__/community-messenger-room-phase2-peer-notice-logic.test.ts` | Replace pending tests |
| `lib/community-messenger/friendship/__tests__/resolve-friendship-pair.test.ts` | Contact states |
| `lib/community-messenger/__tests__/block-enforcement-hotfix-contract.test.ts` | Bilateral hide contract |

## 4-H. ⊘ 절대 수정 금지 (G0–G3)

| Path | Reason |
|------|--------|
| `android/**`, `ios/**`, `MainActivity*`, `AndroidManifest.xml` | Native lock |
| Native Voice/Video runtime, Call LOCK docs | dibay-call-native-runtime-ssot |
| FCM native payload / push bridge | Push lock |
| `docs/community-messenger/friendship-ssot-design.md` | **G1 전 merge 금지** (본 패키지가 초안) |
| `ensureGeneralFriendDirectRoom`, `messenger-room-domain.ts` direct_key | Room SSOT 유지 |
| `lib/community-messenger/direct-call-permission.ts` | Call policy lock (block-only change) |

---

# 5. 메신저 외·전체 기능 영향 분석 (G0 필수)

**목적:** G0 #2(친구 목록 = viewer-local contact)가 **메신저 전역·인접 도메인**과 충돌하지 않음을 사전에 증명한다.  
**판정 기준:** `accepted` / `isFriend` / `isAcceptedFriendPair` 를 읽는 경로는 **contact resolver + legacy read fallback** 으로 대체 가능해야 한다.

## 5-A. 기능별 영향표

| # | 기능 | `accepted` / mutual friend 사용 | contact 전환 영향 | 수정 필요 | Phase |
|---|------|--------------------------------|-------------------|-----------|-------|
| F-01 | **친구 목록 탭** | `listCommunityMessengerFriendsFromSsot` → `listAcceptedFriendshipPeersForViewer` | 목록 소스 = `user_social_relations.friend` (savedByMe) | **예** | P1–P2 |
| F-02 | **친구 검색·새 대화** (`MessengerFriendAddSheet`) | 검색 API `isFriend`; UI는 「메시지 보내기」 버튼 | `isFriend` = savedByMe; tap → direct/start 즉시 진입 | **예** | P2 |
| F-03 | **프로필 시트** (`MessengerFriendProfileSheet`) | `isFriend`, 친구 추가 CTA | 즉시 Add Contact; pending 배지 제거 | **예** | P2 |
| F-04 | **통화 버튼 노출** | `resolveDirectInteractionGuard` + `direct-call-permission` | 기본 `everybody` — ** stranger 통화 허용 유지**. `friends_only` 정책만 resolver가 savedByMe→accepted equivalent 로 판정 (**`direct-call-permission.ts` 본문 수정 금지** — resolver 위임) | **resolver만** | P1 |
| F-05 | **읽음·알림 (친구 요청)** | `notifyCommunityMessengerFriendRequest*`, inbox friend-request type | 친구 요청 알림·팝업 **폐기**; contact add 알림은 **범위 외**(P4 미포함 시 무알림) | **예** | P4 |
| F-06 | **@검색 결과** (`user-public-id-search`, `GET /users?q=`) | `isFriend` via `resolveDirectInteractionGuard` | savedByMe 반영 | **예** | P1 |
| F-07 | **홈·부트스트랩** | `full-bootstrap-snapshot-assemble`, `get-community-messenger-home-sync-bundle` | friends = contact; `requests` 섹션 제거 | **예** | P2 |
| F-08 | **그룹 생성·초대** | `validateGroupInviteTargets` → `isAcceptedFriendPair` | **viewer가 peer를 contact로 저장**했는지로 교체 (mutual 불필요) | **예** | P1 |
| F-09 | **커뮤니티 공유 대상** (`list-community-share-targets`) | `listCommunityMessengerFriends` (accepted) | contact 목록으로 교체 | **예** | P2 |
| F-10 | **즐겨찾기·숨김·뮤트** | `isFriend` / `toggleCommunityMessengerFavoriteFriend` | savedByMe 전제 유지 | **예** | P1 |
| F-11 | **PeerNotice·Dot menu** | pending + accepted 분기 | initiator/recipient + Add Contact (§2) | **예** | P2 |
| F-12 | **방 스냅샷 friendship projection** | `room-snapshot-friendship-projection` | contact flags; `pendingFriendshipRequestId` 제거 | **예** | P2 |
| F-13 | **친구 제거** | `removeFriendSaved` / `DELETE relations/friend` | **write 경로 동일** (contact row 삭제) | **최소** | P1 |
| F-14 | **차단** | `user_social_relations.blocked` (friendship과 분리) | 통신 gate 유지; **inbox hide 양측**만 추가 (§3) | **예** | P3 |
| F-15 | **신규 친구 24h 배지** | `friendshipAcceptedAt` from accepted rows | contact `saved_at` (또는 legacy fallback timestamp) | **예** | P2 |
| F-16 | **친구 추천** | — | **코드베이스에 전용 기능 없음** | **아니오** | — |
| F-17 | **거래 C2C** (`lib/trade`) | friendship 참조 **없음** | commerce `direct_key`·PeerNotice 제외 정책 **유지** | **아니오** | — |
| F-18 | **배달·스토어 B2C** (`store_order` direct) | friendship gate **없음** | commerce room PeerNotice **none** 유지 | **아니오** | — |
| F-19 | **Philife DM** | `lib/chats` 별도 | 메신저 contact SSOT **비적용** | **아니오** | — |
| F-20 | **관리자 CM** (`AdminCommunityMessengerPage`) | `community_friend_requests` Realtime·PATCH | legacy pending **read-only** 또는 UI 제거; 운영 정책 G0 확정 | **예** | P4 |
| F-21 | **Native / Call / Push** | block·policy only | establishment·payload **변경 0** (§4-H) | **아니오** | ⊘ |

## 5-B. 충돌 없음 논거 (요약)

1. **Write SSOT 이동**은 general friend **Contact** 판정에만 해당 — commerce `direct_key`, Call Native, FCM 은 G0 범위 밖.
2. **Legacy read fallback** (§8)으로 기존 `accepted` 사용자는 P1 migration 없이도 친구 목록 유지.
3. **그룹 초대**만 `accepted` → `savedByMe` 의미 변경 — Telegram-style과 일치(viewer contact만 있으면 초대 가능).
4. **거래·배달·Philife** 는 friendship resolver 미사용 — 회귀 surface 없음.

---

# 6. API·Consumer 영향도 (G0 필수)

**목적:** friend-request / accepted read 경로의 **모든 소비처**를 나열하고, 전환 후 **제거·유지·교체**를 고정한다.

## 6-A. HTTP API

| Route | 현재 역할 | G0 이후 | Phase |
|-------|-----------|---------|-------|
| `POST /api/community-messenger/relations/friend` | pending 또는 accept 경유 | **instant contact add** | P1 |
| `DELETE /api/community-messenger/relations/friend` | contact 제거 | **유지** | P1 |
| `GET /api/community-messenger/friend-requests` | pending 목록 | **UI consumer 제거** → route deprecate | P4 |
| `PATCH /api/community-messenger/friend-requests/[id]` | accept/reject/cancel | **consumer 제거** | P4 |
| `POST .../friend-requests/respond-incoming` | accept/reject by peer | **consumer 제거** | P4 |
| `POST .../friend-requests/cancel-outgoing` | 보낸 요청 취소 | **consumer 제거** | P4 |
| `GET /api/community-messenger/friends` | accepted list | **contact list** | P1–P2 |
| `GET /api/community-messenger/home-sync` | rooms + **requests** + friends | **requests 필드 제거** | P2–P4 |
| `GET /api/community-messenger/users?q=` | search + `isFriend` | resolver contact | P1 |
| `POST /api/community-messenger/direct/start` | stranger OK | **유지** (변경 없음) | — |
| `POST/PATCH /api/community-messenger/relations/block` | block | **유지** + P3 bilateral hide | P3 |
| `PATCH /api/admin/.../friend-requests/[id]` | admin pending 처리 | **read-only legacy** 또는 UI 제거 | P4 |

## 6-B. UI·컴ponent Consumer

| Consumer | API / data | 전환 후 | Phase |
|----------|------------|---------|-------|
| `MessengerFriendAddSheet` | search, `postCommunityMessengerFriendRequestApi`, direct/start | tap→chat; request CTA **제거** | P2 |
| `CommunityMessengerHome` | home-sync requests, accept/cancel PATCH, `postCommunityMessengerFriendRequestApi` | inline search; request 섹션 **제거** | P2 |
| `MessengerFriendsScreen` / `CommunityMessengerFriendList` | `partitionPendingMessengerFriendRequests` | pending 섹션·배지 **제거** | P2 |
| `CommunityMessengerRoomPhase2PeerNotice` | GET friend-requests, accept/reject, POST request | Add Contact only (§2) | P2 |
| `CommunityMessengerRoomPhase2OneToOneDotMenu` | POST relations/friend, requested state | initiator hide; instant add | P2 |
| `ChatRoomMoreMenu` | pending friendship row | **제거** | P2 |
| `MessengerFriendProfileSheet` | friend add / pending | instant contact | P2 |
| `MessengerFriendAddSheet` search chips | cooldown / outgoing labels | request chip **제거** | P2 |
| `GlobalIncomingFriendRequestHost` + `MainAppProviderTree` mount gate | PATCH accept/reject popup | **unmount** | P4 |
| `AdminCommunityMessengerPage` | admin friend-requests | legacy read-only or hide | P4 |
| `CommunityShareTargetPicker` | friends from accepted list | contact list | P2 |

## 6-C. Hook·lib Consumer

| Module | 역할 | 전환 후 | Phase |
|--------|------|---------|-------|
| `community-messenger-friend-request-client.ts` | POST / cancel client | **deprecate** (no UI callers) | P4 |
| `partition-messenger-friend-requests.ts` | badge·section split | **remove** | P4 |
| `use-friend-request-notification-realtime.ts` | Realtime → popup | **remove** | P4 |
| `use-incoming-friend-request-popup.ts` | popup state | **remove** | P4 |
| `incoming-friend-request-popup-from-notification-row.ts` | notification → popup | **remove** | P4 |
| `messenger-room-friendship-sync.ts` | room patch on accept | contact patch paths | P2 |
| `use-messenger-room-friendship-sync.ts` | subscribe friendship | contact sync | P2 |
| `friend-relation-presenter.ts` | pending_sent/received badges | **remove** pending statuses | P2 |
| `messenger-friend-model.ts` | sent/received request sections | contact-only model | P2 |
| `service.ts` — `sendCommunityMessengerFriendRequest` | pending insert | **stop write** → addContact | P1 |
| `service.ts` — `listCommunityMessengerFriendRequests` | pending read | UI unused → deprecate | P4 |
| `notifyCommunityMessengerFriendRequest*` | push/inbox | **stop emit** on new flows | P4 |

## 6-D. 유지·교체 요약

| 분류 | 항목 |
|------|------|
| **유지 (semantics only)** | `direct/start`, block/unblock, remove contact, stranger DM |
| **교체** | relations/friend POST, friends list read, search `isFriend`, group invite gate |
| **제거 (UI first, API later)** | friend-request GET/PATCH/respond/cancel **consumers** → P4 route deprecate → L7 hard removal |

---

# 7. 롤백 계획 (G0 필수)

**전제:** Friend SSOT **정책 변경** — G1 merge 후 phase별 배포. 문제 시 **해당 phase만** revert; Native/Call/Push touch 금지.

## 7-A. 롤백 트리거 (예)

| Phase | 트리거 예 | 조치 |
|-------|-----------|------|
| P1 | contact add 5xx, friend list empty regression | P1 revert |
| P2 | PeerNotice wrong branch (PN matrix FAIL) | P2 revert (P1 유지 가능) |
| P3 | A inbox not restored on unblock | P3 revert |
| P4 | 알림 회귀 | P4 revert |

## 7-B. API 롤백

| Phase | Revert 대상 | 복구 동작 |
|-------|-------------|-----------|
| P1 | `relations/friend` POST, `sendCommunityMessengerFriendRequest` | pending insert **재활성**; contact add semantics **되돌림** |
| P1 | `listCommunityMessengerFriendsFromSsot`, resolver | **accepted read** 경로 복구 |
| P2 | PeerNotice / search / home UI | pending·accept/reject UI **복구** |
| P3 | `participant-block-hide`, block route | blocker-only hide **복구** |
| P4 | GlobalIncomingFriendRequestHost mount | popup·badge **복구** |
| P4 | friend-requests routes | deprecate banner 제거; consumer **재연결** |

**Route 삭제(L7) 전**에는 friend-requests API가 코드에 남아 있어 API-only rollback 가능.

## 7-C. UI 롤백

| Surface | Rollback |
|---------|----------|
| Friend tab | sent/received request 섹션·배지 복구 |
| FriendAddSheet | 「메시지 보내기」 버튼 복구 |
| PeerNotice | `pending_incoming` / `pending_outgoing_hidden` 분기 복구 |
| Dot menu | requested / accept flow 복구 |
| Incoming popup | `GlobalIncomingFriendRequestHost` remount |

## 7-D. DB write 롤백

| Write 종류 | Rollback 정책 |
|------------|---------------|
| P1 `user_social_relations.friend` (신규 contact) | **자동 삭제하지 않음** — orphan contact는 무해; 필요 시 offline cleanup |
| P1 `community_messenger_friendships` pending **미기록** | rollback 후 pending insert 재개; gap 기간 요청만 유실(acceptable) |
| P1 legacy `accepted` rows | **절대 삭제하지 않음** |
| P3 `participants.blocked_hidden_at` (peer side) | rollback 시 **신규 peer-hide flag만 clear** script |
| Block / message rows | rollback **대상 아님** |

## 7-E. LOCK·문서 롤백

- G1 merge 커밋 revert → `friendship-ssot-design.md` prior LOCK 복구.
- 본 패키지(`friendship-contact-transition-g0-pack.md`)는 revert 대상 아님(역사 기록).

## 7-F. 권장 운영

- Phase별 **단일 PR** + **G4 PASS** 후 G2/G3 formal QA.
- Optional env `CM_CONTACT_TRANSITION` — Product 승인 시만; 미승인 시 기존 pending UX 유지.

---

# 8. 기존 데이터 전환 정책 (G0 확정 — migration 없음)

**전제:** G0–P1 단계에서 **DB schema migration·backfill job 실행하지 않음.**  
**목표:** prod에 이미 있는 `pending` / `accepted` rows 와 새 contact 모델이 **공존**할 때 UX를 G0에서 고정.

## 8-A. Legacy row 처리 (read-time)

| Legacy (`community_messenger_friendships`) | G0 read policy | UX |
|--------------------------------------------|----------------|-----|
| `pending` (outgoing/incoming) | **UI에 노출하지 않음**; Accept/Reject **미표시** | 발신 A: initiator PeerNotice 규칙(§2). 수신 B: DM 있으면 **Add Contact** bar (PN-10) |
| `accepted` (mutual row) | **Read fallback:** viewer 입장에서 peer가 accepted pair이면 **`savedByMe` equivalent** | **양쪽 친구 목록 유지** (contact row 없어도) |
| `blocked` / `removed` | 기존과 동일; comms block은 `user_social_relations.blocked` | 변경 없음 |
| `community_friend_requests` (legacy table) | friendships SSOT 우선; 잔존 row **UI 무시** | admin만 read-only optional |

## 8-B. Resolver fallback 규칙 (G1 LOCK에 merge)

```
if savedByMe(contact row) → saved_by_me / list member
else if legacy accepted pair for viewer → saved_by_me (source=legacy_friendships)
else → none
```

- **Mutual badge:** contact 양방향 save **또는** legacy accepted pair.
- **새 pending write:** P1부터 **금지** — legacy pending row는 stale; UI 미노출.

## 8-C. 사용자 시나리오

| 시나리오 | 표시 |
|----------|------|
| 예전 mutual accepted, contact row 없음 | **양쪽 친구 목록에 계속 표시** (fallback) |
| 예전 pending incoming (미수락) | 요청 UI 없음; B는 DM 시 Add Contact |
| P1 이후 B가 Add Contact | `user_social_relations` row 생성; fallback과 **중복 무해** |
| A가 contact remove | A 목록에서만 제거; B·legacy accepted fallback 정책은 Product **비대칭 remove** (Telegram-style) |

## 8-D. Backfill (G0 범위 밖 — L gate)

- **L2:** optional job — accepted pair → 양방향 `user_social_relations.friend` insert.
- **L7:** friendships table write removal + pending row archive.
- G0 승인 **≠** backfill 승인.

## 8-E. G0 Product 결정 (§10 서명과 연동)

§10 **설계 변경 영향 승인** 표의 D-1–D-4 와 동일. Product 서명은 **§10 일원**으로 기록.

| # | 결정 | 권장 |
|---|------|------|
| D-1 | Legacy accepted → list fallback 허용 | **Approve** |
| D-2 | Legacy pending UI 완전 제거 | **Approve** |
| D-3 | Contact remove 비대칭 (상대 목록 유지) | **Approve** (Telegram parity) |
| D-4 | P1 backfill 없이 fallback only | **Approve** |

---

# 9. 성공 기준 — PASS 단계 분리 (G0 필수)

**목적:** **설계 승인**과 **구현·QA·릴리스** PASS 를 혼동하지 않도록 단계를 분리한다.

| PASS 종류 | 시점 | G0 문서 역할 |
|-----------|------|--------------|
| **Design PASS** | G0 | 본 패키지·QA **시나리오**·범위 **승인** (코드·QA 실행 전) |
| **Implementation PASS** | P1–P4 완료 후 | §9-B 구현 완료 체크 |
| **Scope Verification PASS** | G4 | §11 — 승인 범위 vs 실제 diff **일치** (Red Team Rule) |
| **QA PASS** | G2 / G3 (G4 **후**) | §2·§3 matrix **실행** 결과 (Device QA) |
| **Release Audit PASS** | G5 (G2/G3 **후**) | §12 — 릴리스 직전 최종 감사 |
| **Production PASS** | 릴리스 GO | prod smoke · non-regression · rollback 준비 |

---

## 9-A. Design PASS (G0 승인 기준 — §9 Implementation과 **별개**)

| ID | 조건 | Verify |
|----|------|--------|
| D-PASS-01 | §1–11 문서 완비 (amendment·영향·rollback·데이터·§10·**G4 scope** 포함) | 본 패키지 |
| D-PASS-02 | §10 **설계 변경 영향** Product 서명 | §10 체크박스 |
| D-PASS-03 | §8-E 데이터 정책 4항 Product 확정 | D-1–D-4 |
| D-PASS-04 | §2 PeerNotice · §3 Block QA **시나리오** 승인 (실행은 G2/G3) | Product + QA review |
| D-PASS-05 | §4 예상 수정 파일표 · §5 영향 분석 Eng **1차 검토** | Eng sign-off |
| D-PASS-06 | §7 Rollback 계획 Eng 검토 | Eng sign-off |
| D-PASS-07 | Product 승인 · Eng 설계 승인 **별도 기록** | G0 minutes / ticket |

**G0 Design PASS** = D-PASS-01–07 **전부**.  
→ 이후 **G1 LOCK amendment Eng 검토·승인** (merge는 승인 **후**).

---

## 9-B. Implementation PASS (P1–P4 구현 완료 기준)

| ID | 조건 | Verify |
|----|------|--------|
| IMP-PASS-01 | 친구 탭 @검색 → **탭/버튼 1회**로 general direct room 진입 | E2E / manual |
| IMP-PASS-02 | First sender **A**: PeerNotice·Dot Add **없음** | PN-01, PN-03 |
| IMP-PASS-03 | Inbound **B**: **Add Contact + Block** only (Accept/Reject **없음**) | PN-02 |
| IMP-PASS-04 | B Add Contact → **즉시** B 친구 목록 반영 | PN-A3, PN-A4 |
| IMP-PASS-05 | A/B asymmetric contact 정상 | PN-05, PN-06 |
| IMP-PASS-06 | Mutual contact both lists | PN-07 |
| IMP-PASS-07 | Legacy pending row → request UI **0** | PN-10 |
| IMP-PASS-08 | Legacy accepted → 친구 목록 fallback (§8) | staging / prod sample |
| IMP-PASS-09 | trade / store_order room PeerNotice **none** | PN-11, PN-12 |
| IMP-PASS-10 | 친구 탭 sent/received request 섹션 **0** | UI audit |
| IMP-PASS-11 | Home pending friend badge **0** | home-sync |
| IMP-PASS-12 | `GlobalIncomingFriendRequestHost` **미마운트** | DOM |
| IMP-PASS-13 | friend-request Realtime **미구독** | network |
| IMP-PASS-14 | PeerNotice accept/reject API 호출 **0** | HAR |
| IMP-PASS-15 | B blocks A → A chat list hide | BL-H02 |
| IMP-PASS-16 | Unblock → A list restore | BL-H03 |
| IMP-PASS-17 | Block 후 A send **403** | BL-C01 |
| IMP-PASS-18 | Block 시 message **미삭제** | BL-D03 |
| IMP-PASS-19 | Group invite = viewer saved contact | F-08 |
| IMP-PASS-20 | Share picker = contact list | F-09 |
| IMP-PASS-21 | `friends_only` call → resolver contact | F-04 |
| IMP-PASS-22 | `npx tsc --noEmit` + 관련 vitest **PASS** | CI |

> 범위 일치(§4 vs diff)는 **G4 Scope Verification** (§11 · SCOPE-PASS)에서 판정. IMP 단계에서 선행 self-check 가능.

---

## 9-C. Scope Verification PASS (G4 — §11)

| ID | 조건 | Verify |
|----|------|--------|
| SCOPE-PASS-01 | 설계 승인 범위 **외** 파일 diff **0** | `git diff` vs §4 · G1-I 승인 목록 |
| SCOPE-PASS-02 | 실제 수정 파일 **==** 승인된 수정 파일 (±명시적 G1-I amendment) | PR file list |
| SCOPE-PASS-03 | Native / Push / Runtime / Call / LOCK(§4-H) diff **= 0** | path filter |
| SCOPE-PASS-04 | 예상 API 변경(§6) **==** 실제 API 변경 | route diff audit |
| SCOPE-PASS-05 | 예상 UI 변경(§6-B) **==** 실제 UI 변경 | component diff audit |
| SCOPE-PASS-06 | 승인되지 않은 기능 추가 **0** | Red Team Rule |

**G4 PASS** = SCOPE-PASS-01–06 **전부**. **1건이라도 FAIL → 구현 FAIL** (제거·원복 후 재검).

---

## 9-D. QA PASS (G2 / G3 — matrix **실행**, G4 **선행**)

| ID | 조건 | Gate |
|----|------|------|
| QA-PASS-01 | §2 PeerNotice matrix PN-01–14 **전건 PASS** | G2 |
| QA-PASS-02 | §2 API assertions PN-A1–A4 **PASS** | G2 |
| QA-PASS-03 | §2 FAIL conditions **0건** | G2 |
| QA-PASS-04 | §3 Block comms BL-C01–C05 **PASS** | G3 |
| QA-PASS-05 | §3 Inbox hide BL-H01–H06 **PASS** | G3 |
| QA-PASS-06 | §3 DB assertions BL-D01–D04 **PASS** | G3 |
| QA-PASS-07 | Trade C2C / store B2C / Philife smoke **회귀 0** | G2/G3 |

---

## 9-E. Production PASS (릴리스 GO)

| ID | 조건 |
|----|------|
| PROD-PASS-01 | Design + Implementation + **G4 Scope** + QA PASS + **G5 Release Audit** **선행 완료** |
| PROD-PASS-02 | **Native / Call / Push / MainActivity / Manifest diff = 0** |
| PROD-PASS-03 | `ensureGeneralFriendDirectRoom` · direct_key SSOT **unchanged** |
| PROD-PASS-04 | §7 Rollback runbook 팀 공유·담당자 지정 |
| PROD-PASS-05 | Legacy accepted prod **표본** IMP-PASS-08 재확인 |

## 9-F. Release GO / NO-GO

**GO** = D-PASS (G0) + G1 LOCK merged + G1-I + IMP-PASS + **SCOPE-PASS (G4)** + QA-PASS + **RELEASE-AUDIT-PASS (G5)** + PROD-PASS **전부**.

**NO-GO** = initiator Add 노출 · pending Accept/Reject 잔존 · A inbox hide 미구현 · Native diff ≠ 0 · **승인 범위 외 diff 1건+** (Red Team Rule) · G4 FAIL · G5 FAIL.

## 9-G. Release PASS — Contact UX 체크리스트 (G5 §12-C)

릴리스 GO 직전 **제품 관점** 최종 확인. Device QA PASS만으로는 릴리스하지 않는다 — **G5 Release Audit** 에서 재확인.

| 항목 | Pass 기준 |
|------|-----------|
| Friend Request UI/API consumer | **0** |
| Pending UI | **0** |
| Accept / Reject UI | **0** |
| Friend-request Popup / Badge | **0** |
| Telegram Contact UX | **100%** — search→chat · Add Contact · A/B PeerNotice · bilateral block hide |

---

# 11. G4 — Scope Verification (필수 Gate)

**시점:** P1–P4 구현 **완료 후**, G2/G3 QA **착수 전**.  
**목적:** Cursor·에이전트 구현 시 흔한 **scope creep** 을 릴리스 직전이 아닌 **QA 전**에 차단.

## 11-A. 검증 체크리스트

| # | 질문 | Pass 기준 | 근거 |
|---|------|-----------|------|
| SV-01 | 설계 승인 범위를 벗어난 파일이 없는가? | §4·G1-I 목록 **외** path diff = 0 | §4, G1-I minutes |
| SV-02 | 실제 수정 파일 == 승인된 수정 파일인가? | 집합 **동일** (사전 승인 amendment만 예외) | PR vs G1-I |
| SV-03 | Native / Push / Runtime / Call / LOCK diff = 0? | §4-H path **0 byte** | `git diff` filter |
| SV-04 | 예상 API 변경 == 실제 API 변경? | §6-A route add/remove/semantics **일치** | API audit |
| SV-05 | 예상 UI 변경 == 실제 UI 변경? | §6-B consumer add/remove **일치** | UI audit |
| SV-06 | 승인되지 않은 기능 추가가 없는가? | G0 §10·G1-I **외** product behavior = 0 | Red Team review |

## 11-B. 실행 방법 (권장)

1. `git diff <base>...HEAD --name-only` ↔ §4 표 · G1-I 승인 attachment
2. §4-H forbidden path glob diff scan (android, ios, direct-call-permission, friendship-ssot-design until G1 merged only via G1 commit)
3. §6 route·component consumer diff vs §6-A/B 표
4. Red Team 1명 **독립** sign-off (implementer ≠ verifier)

## 11-C. FAIL 시 조치

| FAIL 유형 | 조치 |
|-----------|------|
| 승인 외 파일 | revert 또는 G1-I **재승인** (재승인 없으면 revert) |
| 승인 외 기능 | **제거·원복** (기능 품질 무관) |
| LOCK/Native touch | **즉시 revert** + G4 재실행 |
| API/UI drift | §6 갱신 **금지** — 코드를 설계에 맞춤 |

## 11-D. Red Team Rule (재인용)

> 구현 완료 후에도 승인되지 않은 기능이 **1개라도** 추가되면 **FAIL**.  
> 좋아진 기능이라도 승인 범위 밖이면 **제거 또는 원복** — 예외 없음.

## 11-E. G4 기록

| 역할 | 이름 | 일자 | 결과 |
|------|------|------|------|
| Verifier (Red Team) | | | PASS / FAIL / HOLD |
| Eng lead | | | 조치 완료 확인 |

## 11-F. Housekeeping (G4/G5 판정 **외**)

`.qa-logs/**` 등 QA 산출물은 **제품 코드 scope creep 가 아니다**.  
Git working tree에 존재해도 G4 FAIL/HOLD 사유가 **아님**.  
커밋 전 **exclude 또는 restore** — Housekeeping 항목으로만 처리.

---

# 12. G5 — Release Audit (릴리스 직전 Gate)

**시점:** G2/G3 Device QA **PASS 후**, Production 릴리스 **직전**.  
**목적:** Friend System 전체를 **한 번 더 감사**하여 릴리스 가능 상태인지 확인.

> **G5 Release Audit does not authorize additional implementation.**  
> **Any issue found during G5 must be resolved through a new scoped change, followed by repeating G4 → Device QA → G5.**  
> **G5 is a release gate, not an implementation phase.**

G5에서 발견된 문제를 “김에 이것도 고치자” 식으로 범위를 넓히지 **않는다**. 수정은 **새 scoped change** → G4 → Device QA → G5 재실행.

## 12-A. Release Audit 체크리스트

| # | 항목 | Pass 기준 |
|---|------|-----------|
| RA-01 | `git diff --name-only` | 승인 파일만 수정 (§4 · G1-I) |
| RA-02 | Native | **0 diff** |
| RA-03 | Push | **0 diff** |
| RA-04 | Runtime (Call Native 등) | **0 diff** |
| RA-05 | Migration | **0 diff** |
| RA-06 | LOCK | G1 amendment **승인 범위만** |
| RA-07 | Admin | pending UI 제거 완료 (`AdminCommunityMessengerPage` 등) |
| RA-08 | dead code | cleanup 완료 (`friend-relation-presenter`, `room-snapshot-friendship-projection` 등) |
| RA-09 | Device QA | G2/G3 **PASS** |
| RA-10 | Production Build | **PASS** |

## 12-B. Release PASS (§9-G 재확인)

§9-G Contact UX 체크리스트 **전건 PASS** — Friend Request 0 · Pending UI 0 · Accept/Reject 0 · Popup/Badge 0 · Telegram Contact UX 100%.

## 12-C. FAIL / HOLD 시 조치

| 결과 | 조치 |
|------|------|
| RA-07 Admin 미완 | scoped Admin cleanup → **G4 재검** → Device QA → G5 |
| RA-08 dead code | scoped cleanup (동작 변경 없음) → **G4 재검** → G5 |
| RA-09 Device QA FAIL | 해당 matrix 수정·scoped fix → G4 → Device QA → G5 |
| 승인 범위 외 발견 | revert 또는 G1-I 재승인 — **G5에서 신규 구현 금지** |

## 12-D. G5 기록

| 역할 | 이름 | 일자 | 결과 |
|------|------|------|------|
| Release Auditor (Red Team) | | | PASS / FAIL / HOLD |
| Eng lead | | | 릴리스 GO 확인 |

---

## Implementation phase order (post-G0)

```
G0 Design PASS (§9-A + §10 Product 서명)
  → G1 LOCK amendment Eng 검토·승인 → merge
  → G1-I P1–P4 구현 범위 승인
  → P1 Contact write
  → P2 PeerNotice + list + search
  → P3 Bilateral hide
  → P4 Notification cleanup
  → G4 Scope Verification (§11) — FAIL/HOLD 시 scoped fix·재검
  → G2 PeerNotice QA PASS (Device QA)
  → G3 Block QA PASS (Device QA)
  → G5 Release Audit (§12) — FAIL 시 scoped fix → G4 → Device QA → G5
  → Production PASS → 릴리스
  → L7 Legacy friendships write removal (별도 gate)
```

---

# 10. 설계 변경 영향 승인 (Product — G0 필수)

**목적:** 본 전환의 **제품·정책 변경**을 Product가 명시적으로 승인했음을 기록한다.  
**G0 Design PASS(D-PASS-02)** 의 필수 첨부.

> Product는 아래 변경을 **승인하는 것으로 간주**한다.  
> (미체크 = G0 미완료 — G1·P1 착수 불가)

| # | 설계 변경 | 승인 |
|---|-----------|------|
| 1 | **Friend Request 개념 제거** — pending·accept/reject·보낸/받은 요청 UI 폐기 | ☐ |
| 2 | **Contact 개념으로 변경** — 단방 Add Contact, mutual은 파생 상태 | ☐ |
| 3 | **Friend List 의미 변경** — viewer-local saved contact (상대 목록과 비대칭 가능) | ☐ |
| 4 | **PeerNotice 정책 변경** — first-message sender/recipient 비대칭 (A 숨김, B Add+Block) | ☐ |
| 5 | **Block 정책 변경** — B 차단 시 A inbox에서도 방 hide (양측 hide) | ☐ |
| 6 | **기존 Pending 정책 종료** — legacy pending row UI 미노출; 신규 pending write 금지 | ☐ |

**부속 확정 (§8-E):**

| # | 데이터·운영 | 승인 |
|---|-------------|------|
| D-1 | Legacy accepted → 친구 목록 read fallback | ☐ |
| D-2 | Legacy pending UI 완전 제거 | ☐ |
| D-3 | Contact remove 비대칭 (Telegram-style) | ☐ |
| D-4 | P1 backfill 없이 fallback only | ☐ |

**서명 (G0 기록용):**

| 역할 | 이름 | 일자 | 비고 |
|------|------|------|------|
| Product | | | §10 상단 6항 + D-1–D-4 |
| Engineering (설계) | | | D-PASS-05–06 · LOCK amendment 검토 착수 |

*Eng LOCK merge 서명은 **G1** 별도 기록.*

---

## Final status

| 단계 | 상태 |
|------|------|
| G0 | ✅ |
| G1 | ✅ |
| G1-I | ✅ |
| P1 | ✅ |
| P2 | ✅ |
| P3 | ✅ |
| P4 | ✅ |
| G4 | ⏳ HOLD |
| Device QA (G2/G3) | ⏳ |
| G5 Release Audit | ⏳ |

**G4 HOLD 사유:** Admin pending UI 미정리 · legacy dead code 잔존 · Device QA 미실행.  
**Housekeeping:** `.qa-logs/**` — 커밋 전 exclude/restore (G4/G5 판정 외).

| 구성 | 상태 |
|------|------|
| §1 LOCK amendment 초안 | ✅ merged (G1) |
| §2 A/B PeerNotice QA | ✅ (실행 — G2 Device QA) |
| §3 Block bilateral hide QA | ✅ (실행 — G3 Device QA) |
| §4 예상 수정 파일표 | ✅ |
| §5–§8 | ✅ |
| §9 PASS 단계 분리 | ✅ |
| §10 설계 변경 영향 승인 | ✅ |
| §11 G4 Scope Verification | ⏳ HOLD |
| §12 G5 Release Audit | ✅ 정의 완료 (실행 — G2/G3 PASS 후) |

**남은 작업 (우선순위):**

1. Admin 경로 정리 (P4 정책 반영)
2. Legacy dead code cleanup
3. G4 재검 → PASS
4. Device QA (G2/G3)
5. G5 Release Audit
6. Production PASS

**진행 순서 (절차 생략 금지):**

> **G0** → **G1** → **G1-I** → **P1–P4** → **G4** → **G2/G3 Device QA** → **G5 Release Audit** → **Production** PASS

G0 승인만으로 G1 merge, P1 착수, QA 생략, G4/G5 생략을 **의미하지 않는다.**
