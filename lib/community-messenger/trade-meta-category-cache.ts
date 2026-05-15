/**
 * trade meta category — 모듈 TTL(10분) + 요청 스코프 Map(동일 HTTP 요청 내 재조회 금지).
 */
import type { TradeChatCategoryMetaLike } from "@/lib/community-messenger/trade-chat-list/category-menu-label";
import { getTradeMetaRequestScope } from "@/lib/community-messenger/trade-meta-request-scope";

const MODULE_TTL_MS = 10 * 60_000;
const moduleCache = new Map<string, { expiresAt: number; meta: TradeChatCategoryMetaLike }>();

function moduleKey(table: "categories" | "trade_categories", id: string): string {
  return `${table}:${id.trim()}`;
}

export function peekTradeMetaCategoryModule(
  table: "categories" | "trade_categories",
  id: string
): TradeChatCategoryMetaLike | undefined {
  const k = moduleKey(table, id);
  const row = moduleCache.get(k);
  if (!row || row.expiresAt <= Date.now()) {
    if (row) moduleCache.delete(k);
    return undefined;
  }
  return row.meta;
}

export function setTradeMetaCategoryModule(
  table: "categories" | "trade_categories",
  id: string,
  meta: TradeChatCategoryMetaLike
): void {
  const k = moduleKey(table, id);
  moduleCache.set(k, { expiresAt: Date.now() + MODULE_TTL_MS, meta });
  const scope = getTradeMetaRequestScope();
  if (scope) scope.categoryById.set(k, meta);
}

export function peekTradeMetaCategoryRequest(id: string): TradeChatCategoryMetaLike | undefined {
  const scope = getTradeMetaRequestScope();
  if (!scope) return undefined;
  return scope.categoryById.get(id.trim()) ?? scope.categoryById.get(`categories:${id.trim()}`) ?? scope.categoryById.get(`trade_categories:${id.trim()}`);
}

export function noteTradeMetaCategoryRequestHits(hits: number, misses: number): void {
  if (misses > 0) {
    console.log("[trade-meta-category-cache-miss]", { misses, hits });
  } else if (hits > 0) {
    console.log("[trade-meta-category-cache-hit]", { hits });
  }
}
