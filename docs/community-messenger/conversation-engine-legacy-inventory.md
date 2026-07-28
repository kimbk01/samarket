# Conversation Engine — Legacy Inventory Lock

**Date:** 2026-07-29  
**Baseline HEAD at inventory:** `d9b48103d` (home tip UPDATE patch — do not extend)  
**Authority after cutover:** `lib/community-messenger/conversation-engine/`

## Label legend

| Label | Meaning |
|-------|---------|
| KEEP | Room timeline, Domain canary (until domain selector cutover), Native call runtime |
| REPLACE | Hub list paint path after cutover |
| QUARANTINE | Banned from `conversation-engine/**` imports immediately |
| DELETE_AFTER_CUTOVER | Removed only after runtime PASS + zero product imports |

## Hub list writers / readers

| Path | Role | Label |
|------|------|-------|
| `lib/community-messenger/home-list-patch.ts` | Sole hub list reducer (`applyHomeListPatch`) | QUARANTINE → DELETE_AFTER_CUTOVER |
| `lib/community-messenger/home/patch-bootstrap-room-list-from-realtime-message.ts` | INSERT / call stub / sender echo helpers | QUARANTINE → DELETE_AFTER_CUTOVER |
| `lib/community-messenger/home/home-room-live-patch-from-realtime.ts` | Tip UPDATE normalizers (d9b48103d) | QUARANTINE → DELETE_AFTER_CUTOVER |
| `lib/community-messenger/home/use-community-messenger-home-realtime-bootstrap-list.ts` | Home RT + bus → list patch | QUARANTINE → DELETE_AFTER_CUTOVER |
| `lib/community-messenger/realtime/community-messenger-home-realtime-channels.ts` | rooms-in INSERT/UPDATE/tip fan-out | REPLACE (list fan-out removed after cutover; meta may KEEP) |
| `lib/community-messenger/call-chat-local-append.ts` | `cm.room.call_stub_preview` list bus publish | QUARANTINE list bus → DELETE_AFTER_CUTOVER list path |
| `lib/community-messenger/dev/cm-raf-home-list-patch.ts` | rAF list setData coalescer | QUARANTINE → DELETE_AFTER_CUTOVER |
| `lib/community-messenger/home/bootstrap-cache-bus-writer.ts` | Bus → list tip into bootstrap cache | QUARANTINE list kinds → DELETE_AFTER_CUTOVER |
| `lib/community-messenger/home/use-community-messenger-home-bootstrap.ts` | Cold/warm bootstrap + silent skip | REPLACE seed → ConversationStore; KEEP silent-skip until cutover |
| `components/community-messenger/CommunityMessengerHome.tsx` | Orchestrator; forced `source: "legacy"` | REPLACE readers |
| `lib/community-messenger/use-community-messenger-home-state.ts` | Derive unified list + pillars | REPLACE to ConversationStore selectors |
| `lib/community-messenger/stores/messenger-realtime-store.ts` | Room timeline | KEEP |
| `components/community-messenger/domain-shell-canary/domain-list-canary-realtime-patch.ts` | Trade/SO list writers | KEEP until Phase 4 domain cutover |
| `components/messenger/DomainRoomStateRealtimeHost.tsx` | Domain bus spine | KEEP spine; QUARANTINE hub cache dual-write after cutover |
| Native call runtime | FCM → Native Agora | KEEP (no list stub writer) |

## Forbidden during rewrite

- Silent hydrated `refresh(true)` re-enable
- Additional patch on d9b48103d tip path
- New parallel list writer beside ConversationStore
- `conversation-engine/**` importing QUARANTINE modules (enforced by `verify:conversation-engine-import-ban`)

## Cutover status (2026-07-29)

- Phase 0–4 wired in tree: engine + seed + bridge + server upsert + product paint overlay.
- `CONVERSATION_ENGINE_PRODUCT_PAINT=true` disconnects hub RT tip → `applyHomeListPatch`.
- **DELETE_AFTER_CUTOVER** file removal blocked until Xiaomi/Samsung runtime PASS (§19 scenarios).
- Tag target: `pre-conversation-engine-legacy-removal` before physical delete.

## Cutover order

1. Shadow engine (no product paint)  
2. Cut over hub GD+group readers  
3. Domain pillar/Gate together  
4. Tag `pre-conversation-engine-legacy-removal`  
5. Delete QUARANTINE modules when import graph is zero  
