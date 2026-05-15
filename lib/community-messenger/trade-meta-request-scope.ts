import { AsyncLocalStorage } from "node:async_hooks";
import type { TradeChatCategoryMetaLike } from "@/lib/community-messenger/trade-chat-list/category-menu-label";

export type TradeMetaBridgeRequestSnapshot = {
  productChatsByPcIds?: Map<string, Array<Record<string, unknown>>>;
  itemTradeLedgerByRoomIds?: Map<string, Array<Record<string, unknown>>>;
  chatRoomsFallbackByRoomIds?: Map<string, Array<Record<string, unknown>>>;
};

export type TradeMetaRequestScopeStore = {
  categoryById: Map<string, TradeChatCategoryMetaLike>;
  bridge: TradeMetaBridgeRequestSnapshot;
};

const tradeMetaRequestScope = new AsyncLocalStorage<TradeMetaRequestScopeStore>();

function newStore(): TradeMetaRequestScopeStore {
  return {
    categoryById: new Map(),
    bridge: {
      productChatsByPcIds: new Map(),
      itemTradeLedgerByRoomIds: new Map(),
      chatRoomsFallbackByRoomIds: new Map(),
    },
  };
}

export function getTradeMetaRequestScope(): TradeMetaRequestScopeStore | undefined {
  return tradeMetaRequestScope.getStore();
}

/** POST trade-chat-list-meta·home-sync enrich — 동일 HTTP 요청 내 category/bridge 재조회 금지 */
export function runWithTradeMetaRequestScope<T>(fn: () => Promise<T>): Promise<T> {
  const parent = tradeMetaRequestScope.getStore();
  if (parent) return fn();
  return tradeMetaRequestScope.run(newStore(), fn);
}

export function peekBridgeProductChatsRequest(key: string): Array<Record<string, unknown>> | undefined {
  return getTradeMetaRequestScope()?.bridge.productChatsByPcIds?.get(key);
}

export function setBridgeProductChatsRequest(key: string, rows: Array<Record<string, unknown>>): void {
  getTradeMetaRequestScope()?.bridge.productChatsByPcIds?.set(key, rows);
}

export function peekBridgeItemTradeLedgerRequest(key: string): Array<Record<string, unknown>> | undefined {
  return getTradeMetaRequestScope()?.bridge.itemTradeLedgerByRoomIds?.get(key);
}

export function setBridgeItemTradeLedgerRequest(key: string, rows: Array<Record<string, unknown>>): void {
  getTradeMetaRequestScope()?.bridge.itemTradeLedgerByRoomIds?.set(key, rows);
}

export function peekBridgeChatRoomsFallbackRequest(key: string): Array<Record<string, unknown>> | undefined {
  return getTradeMetaRequestScope()?.bridge.chatRoomsFallbackByRoomIds?.get(key);
}

export function setBridgeChatRoomsFallbackRequest(key: string, rows: Array<Record<string, unknown>>): void {
  getTradeMetaRequestScope()?.bridge.chatRoomsFallbackByRoomIds?.set(key, rows);
}
