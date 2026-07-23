/**
 * trade CachePort — chat.trade.* read-only / in-memory. persistent writer 금지.
 */
import { TRADE_DOMAIN, type TradeListItem } from "@/lib/messenger/trade/types";

const NS = "chat.trade";

export function buildTradeCacheKey(input: { viewerUserId: string; generation: string }): string {
  const viewer = input.viewerUserId.trim();
  const generation = input.generation.trim() || "0";
  if (!viewer) throw new Error("dibay_trade_cache_viewer_required");
  const key = `${NS}.snapshot.v1:${viewer}:${TRADE_DOMAIN}:${generation}`;
  assertTradeNamespace(key);
  return key;
}

function assertTradeNamespace(key: string): void {
  if (!key.startsWith(`${NS}.`)) throw new Error(`dibay_trade_cache_namespace_forbidden:${key}`);
  if (
    key.startsWith("chat.general.") ||
    key.startsWith("chat.group.") ||
    key.startsWith("chat.store_order.")
  ) {
    throw new Error("dibay_trade_foreign_cache_forbidden");
  }
}

export class TradeReadonlyMemoryCache {
  readonly domain = TRADE_DOMAIN;
  readonly namespacePrefix = NS;
  readonly readOnlyUntilCutover = true as const;
  private store = new Map<string, ReadonlyArray<TradeListItem>>();

  seedForTest(key: string, rows: ReadonlyArray<TradeListItem>): void {
    assertTradeNamespace(key);
    this.store.set(key, rows);
  }

  read(key: string): ReadonlyArray<TradeListItem> | null {
    assertTradeNamespace(key);
    return this.store.get(key) ?? null;
  }

  writeForbidden(): never {
    throw new Error("dibay_trade_cache_write_forbidden_until_phase6");
  }

  clearForTest(): void {
    this.store.clear();
  }
}

export const tradeMemoryCache = new TradeReadonlyMemoryCache();
