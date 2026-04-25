import type { SupabaseClient } from "@supabase/supabase-js";
import {
  reconcileProductChatsFromItemTradeByPostIds,
  reconcileProductChatsFromItemTradeRoomsForUser,
} from "@/lib/trade/touch-product-chat-from-item-trade-room";

/** 짧은 시간에 구매/판매·count API가 겹쳐도 item_trade 동기화를 매번 돌리지 않음 */
const GAP_MS = 15_000;
const RECONCILE_LAST_RUN_STALE_MS = 86_400_000;
const RECONCILE_LAST_RUN_MAX_KEYS = 5_000;
const lastRun = new Map<string, number>();

function pruneReconcileLastRunMap(now: number): void {
  for (const [k, t] of lastRun) {
    if (now - t > RECONCILE_LAST_RUN_STALE_MS) lastRun.delete(k);
  }
  while (lastRun.size > RECONCILE_LAST_RUN_MAX_KEYS) {
    const k = lastRun.keys().next().value;
    if (k === undefined) break;
    lastRun.delete(k);
  }
}

function shouldSkip(key: string): boolean {
  const t = lastRun.get(key) ?? 0;
  return Date.now() - t < GAP_MS;
}

function mark(key: string) {
  lastRun.set(key, Date.now());
}

export async function runItemTradeReconcileBuyerIfStale(
  sb: SupabaseClient<any>,
  userId: string,
  postIdsFromRooms: string[]
): Promise<void> {
  const key = `item-trade:buyer:${userId}`;
  pruneReconcileLastRunMap(Date.now());
  if (shouldSkip(key)) return;
  try {
    await reconcileProductChatsFromItemTradeByPostIds(sb, postIdsFromRooms);
    await reconcileProductChatsFromItemTradeRoomsForUser(sb, userId, "buyer");
    mark(key);
  } catch {
    /* 동기화 실패 시에도 조회·건수는 진행 */
  }
}

export async function runItemTradeReconcileSellerIfStale(
  sb: SupabaseClient<any>,
  userId: string,
  sellingPostIds: string[]
): Promise<void> {
  const key = `item-trade:seller:${userId}`;
  pruneReconcileLastRunMap(Date.now());
  if (shouldSkip(key)) return;
  try {
    await reconcileProductChatsFromItemTradeByPostIds(sb, sellingPostIds);
    await reconcileProductChatsFromItemTradeRoomsForUser(sb, userId, "seller");
    mark(key);
  } catch {
    /* 동기화 실패 시에도 조회·건수는 진행 */
  }
}
