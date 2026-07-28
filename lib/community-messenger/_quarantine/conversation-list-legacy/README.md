# Quarantine — legacy conversation list tip writers

Physical deletion of these modules is **blocked** until Xiaomi/Samsung device PASS after cutover.

Tagged checkpoint: `pre-conversation-engine-legacy-removal`

Still present in-tree (QUARANTINED headers; tip live path disconnected via `CONVERSATION_ENGINE_PRODUCT_PAINT`):

- `lib/community-messenger/home-list-patch.ts` (structural leave/archive still used)
- `lib/community-messenger/home/patch-bootstrap-room-list-from-realtime-message.ts`
- `lib/community-messenger/home/home-room-live-patch-from-realtime.ts`
- `lib/community-messenger/home/use-community-messenger-home-realtime-bootstrap-list.ts` (routes tips to engine when flag on)
- `lib/community-messenger/dev/cm-raf-home-list-patch.ts`
- list tip kinds in `bootstrap-cache-bus-writer.ts`
- `cm.room.call_stub_preview` list bus consumers

Authority: `docs/community-messenger/conversation-engine-authority.md`
