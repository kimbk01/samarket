/**
 * Bridge Exit 조건 LOCK — 제거 실행이 아님.
 * HS5 / Mirror / Legacy create / S2 등은 아래가 모두 증명되기 전 삭제·끊기 금지.
 *
 * STRUCTURAL AUTHORITY LOCK PASS (2026-08-07)는 Bridge **유지**를 포함하며 제거를 승인하지 않음.
 * docs/trade-community-structural-authority-lock.md
 * Order: exit criteria locked → (later) prove exit → remove → re-verify.
 */

export const TRADE_BRIDGE_IDS = [
  "HS5_LEGACY_UNREAD",
  "CM_TO_ITEM_TRADE_MIRROR",
  "LEGACY_PRODUCT_CHAT_CREATE_OR_GET",
  "CHAT_DETAIL_TRADE_PROCESS_UI",
  "TRADE_STATUS_ROOM_API",
  "CHAT_CREATE_ROOM_API",
] as const;

export type TradeBridgeId = (typeof TRADE_BRIDGE_IDS)[number];

/** Exit gates — all must be proven before bridge removal. */
export const TRADE_BRIDGE_EXIT_CONDITIONS = {
  HS5_LEGACY_UNREAD: {
    id: "HS5_LEGACY_UNREAD" as const,
    module: "lib/community-messenger/enrich-messenger-trade-unread-with-legacy-trade.ts",
    authorityTarget: "U1_participants",
    require: [
      "All LIVE trade rooms have community_messenger_room_id link",
      "Trade list row unread === participant unread (no max-with-legacy)",
      "Trade hub badge Facts already participant-only (unchanged)",
      "home-sync / bootstrap no longer call enrichMessengerTradeUnreadWithLegacyTrade",
    ],
  },
  CM_TO_ITEM_TRADE_MIRROR: {
    id: "CM_TO_ITEM_TRADE_MIRROR" as const,
    module: "lib/trade/mirror-community-messenger-text-to-item-trade-ledger.ts",
    authorityTarget: "C3_runtime_plus_U1",
    require: [
      "Badge / push / hub unread do not read item_trade chat_messages counters",
      "No product caller depends on mirrored chat_rooms last_message for trade",
      "Post-ack effects can omit mirror without unread regression",
    ],
  },
  LEGACY_PRODUCT_CHAT_CREATE_OR_GET: {
    id: "LEGACY_PRODUCT_CHAT_CREATE_OR_GET" as const,
    module: "lib/chat-domain/use-cases/legacy-product-chat-create-or-get.ts",
    authorityTarget: "item_trade_start_core",
    require: [
      "trade-chat-entry-resolve never needs product_chats-first fallback",
      "POST /api/chat/create-room unused or redirects to entry/resolve",
      "All clients use item_trade start + CM ensure",
    ],
  },
  CHAT_DETAIL_TRADE_PROCESS_UI: {
    id: "CHAT_DETAIL_TRADE_PROCESS_UI" as const,
    module: "components/chats/ChatDetailView.tsx",
    authorityTarget: "S1_CM_TradeProcessSection",
    require: [
      "No LIVE trade room opens ChatDetailView for process CTA",
      "tradeHubChatRoomHref / surface SSOT only CM rooms",
      "TradeFlowBanner only mounted via CommunityMessengerTradeProcessSection for trade",
    ],
  },
  TRADE_STATUS_ROOM_API: {
    id: "TRADE_STATUS_ROOM_API" as const,
    module: "app/api/chat/rooms/[roomId]/trade-status/route.ts",
    authorityTarget: "L1_seller_listing_state",
    require: [
      "Zero in-repo and known external clients",
      "Posts listing fields already go through L1 mapping helpers",
      "Docs no longer list as seller process primary API",
    ],
  },
  CHAT_CREATE_ROOM_API: {
    id: "CHAT_CREATE_ROOM_API" as const,
    module: "app/api/chat/create-room/route.ts",
    authorityTarget: "entry_resolve",
    require: [
      "Zero clients; README marks deprecated",
      "Legacy create-or-get exit conditions met",
    ],
  },
} as const;

export function tradeBridgeRemovalAllowed(_id: TradeBridgeId, proven: readonly string[]): boolean {
  const spec = TRADE_BRIDGE_EXIT_CONDITIONS[_id];
  if (!spec) return false;
  return spec.require.every((r) => proven.includes(r));
}
