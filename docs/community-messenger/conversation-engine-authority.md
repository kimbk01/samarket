# Conversation Engine Authority (LOCK)

**Status (2026-07-29):** Runtime cutover wired — hub GD+group paint from `ConversationStore`. Legacy tip writers disconnected when `CONVERSATION_ENGINE_PRODUCT_PAINT=true`. Full file deletion pending Xiaomi/Samsung device PASS.

## Sole writer

`applyConversationEvent` → `ConversationStore` is the only hub list tip writer after cutover.

## Snapshot

HTTP bootstrap / home-sync → `reconcileConversationStoreFromBootstrap` / `seedConversationStoreFromBootstrap`.

## Events

- Client: postgres home hints + `cm_conversation_upsert` broadcast → `ConversationEvent`
- Server: `publishConversationUpsertAfterTipWrite` after message tip + call stub tip

## Paint

`useConversationEngineHomePaint` overlays `chats`/`groups` for `MessengerChatsScreen` / `useCommunityMessengerHomeState`.

## Domain isolation

Trade / store_order never enter hub GD scroll list. Domain canary remains until pillar selector cutover.

## KEEP

- Room timeline `messenger-realtime-store`
- Native call runtime
- Domain list canary (trade/SO)

## QUARANTINE (do not extend)

See `conversation-engine-legacy-inventory.md`. Import ban: `npm run verify:conversation-engine-import-ban`.

## Verdict labels

- Shadow only: `NEW CONVERSATION ENGINE SHADOW PASS / CUTOVER PENDING`
- Runtime cutover, legacy files present: `NEW CONVERSATION ENGINE RUNTIME PASS / LEGACY REMOVAL PENDING`
- Full delete + locks after device PASS: `LEGACY CONVERSATION LIST REPLACEMENT PRODUCT PASS`
