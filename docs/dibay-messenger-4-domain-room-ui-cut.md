# DIBAY Messenger 4-Domain Room UI CUT

**STATUS: CONTRACT FROZEN / HARD LOCK NOT DECLARED.**
**CURRENT PHASE: R5 TRADE-ONLY** (Marketplace listing chrome. Composer / general / order OUT.)
Date: 2026-08-18

This cut changes chat-window UI only: header chrome, timeline chip, visible identity.

It does not change room keys, DB schema, badge, notification, routes, or room merge/collapse writers.

## 0. Why this cut exists

Original product requirement:

- General chat = personal friend 1:1
- Trade chat = per-listing trade (same two people must not merge listings or merge into general)
- Order chat = customer and store (customer window shows store identity)
- Group chat = group

Same two people may have one general room, many trade rooms (one per listing), and many order rooms (one per order). Those windows must not look like one another.

Mid-cut divergence (must not continue):

- Factory was wired and fixture probe passed, but real trade rooms can still show the general 1:1 chip when `chatDomain` is wrong and a commerce key is present.
- Trade window identity was locked to peer-primary, which conflicts with per-listing window identity.
- Store list first-paint name is closed; this cut still owns the order window.

Revert of the existing 4-domain UX cut: no. Keep factory, hub list parity, and store_name snapshot. Fix forward.

HARD LOCK is not declared. Fixture probe PASS is not product PASS for this contract.

## 1. Four domains

| Domain | Meaning | Room identity (infra lock) | Chat window must show |
|---|---|---|---|
| `general_direct` | Friend 1:1 | sorted member pair | Peer member and general 1:1 label |
| `group` | Group | group id | Group name and member count |
| `trade` | Per listing buyer/seller | `trade_pc:` / `trade_item:` | Listing (product), trade-chat label, never general 1:1 |
| `store_order` | Customer and store | `store_order:{orderId}` | Customer: store name and order-chat label. Owner: customer and order-chat label. Never general 1:1 |

Trade: one listing = one room. Same members + different listings = separate rooms and separate windows. Window identity is the listing. Counterparty is secondary. Timeline must not add a member-count suffix.

Store order: one order = one room. Customer window identity is the store, not the owner's member nickname as a friend DM.

## 2. In / Out

In:

- Phase2 room timeline chip domain label
- Phase2 room header visible identity
- Chrome classification from existing snapshot facts
- Unit tests for the above

Out (new cut required):

- room key / domain_identity_key / chat_domain writers
- direct_key rewrite / DB migration / pollution quarantine SQL
- badge / notification / unread / routes
- room create / find / merge / collapse writers
- open_group bucket
- Native Call
- Feed Banner / Marketplace cuts
- Owner store-order list identity
- Composer / message input
- Telegram / Baemin layouts
- Facebook brand copy ("Marketplace")

## 3. Chrome classification (R1)

Use existing facts only. Do not mutate `chat_domain`.

Window chrome priority:

1. Group `roomType` → group chrome
2. Commerce `direct_key` (`trade_pc:` / `trade_item:` / `store_order:` / `trade_order:`) → that domain chrome even if `chatDomain` is `general_direct`
3. `chatDomain` trade or store_order → that domain chrome
4. Confirmed trade/delivery presentation gates (must not override a true pair-key friend DM)
5. Else general peer

Fail:

- Trade dock or `trade_pc:` present plus timeline general 1:1 with member suffix
- Order room customer header looking like general 1:1
- Two listings with the same two people sharing one window

Keep:

- True friend DM (pair `direct_key` + `chatDomain=general_direct`) stays general even if leftover trade contextMeta

## 4. Phases (do not skip)

- R0 this document + rule — freeze
- R1 chrome misclassification — done
- R2 trade header primary = listing — done
- R3 store-order customer window store identity on remaining header paths — done
- R4 data quarantine — done (window chrome only; no SQL / no key rewrite)
- R5 TRADE-ONLY Marketplace chrome — coded: header `{상대방} · {품목}`, listing banner, timeline origin, counterparty 판매자/구매자. Composer untouched. General/group/order layout not in this slice.

Do not start R3 inside R2.

R1 done when:

- `chatDomain=general_direct` + `trade_pc:` → trade-chat label, no member suffix
- pair-key friend DM + leftover trade meta → still general 1:1
- `chatDomain=general_direct` + `store_order:` → order-chat label, no member suffix
- related vitest PASS
- R1 needs no new i18n keys

R2 done when:

- chrome `profileKind` is listing
- header primary text is product
- header secondary is peer
- Phase2 header title is listing, subtitle is peer (and role)
- related vitest PASS

R3 done when:

- `store_order:` key opens store header even if `chatDomain` is `general_direct`
- customer title is store name from context/order card, never a bare member nickname
- store avatar does not steal the owner member photo
- related vitest PASS

R4 done when:

- the 4 quarantined room ids never get general 1:1 window chrome
- `chatDomain=trade` + pair `direct_key` stays trade listing chrome
- no `direct_key` rewrite, no merge, no SQL
- related vitest PASS

## 5. Authority

| Concern | Owner |
|---|---|
| Window chrome slots | `lib/messenger/contracts/domain-room-header-chrome.ts` |
| Phase2 chrome resolve | `components/community-messenger/room/phase2/resolve-messenger-room-phase2-domain-chrome.ts` |
| Domain facts (read) | snapshot `chatDomain` / `messengerDirectKey` / `contextMeta` |
| Room identity writers | locked, out of this cut |

## 6. Limits

- Do not declare HARD LOCK from fixture probe only
- Do not change `communityMessengerRoomIsConfirmedTrade` globally to fix chrome (list/badge side effects)
- Do not restore listing-primary inside R1
- Do not touch Marketplace cuts, Call, badge, or DB
- Do not merge trade rooms or treat store identity as a member nickname
