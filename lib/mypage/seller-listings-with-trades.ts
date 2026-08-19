import type { SalesHistoryRow } from "@/components/mypage/sales/SalesHistoryCard";

function rowHasBuyerChat(row: SalesHistoryRow): boolean {
  return Boolean(row.chatId?.trim()) && !row.noActiveChat;
}

function tradeRowRecencyMs(row: SalesHistoryRow): number {
  const raw = row.lastMessageAt ?? row.createdAt ?? row.postUpdatedAt ?? row.updatedAt ?? "";
  const ms = Date.parse(String(raw));
  return Number.isFinite(ms) ? ms : 0;
}

/** Group `/api/my/sales` rows by listing id — chat rows only, newest message first. */
export function groupSalesRowsByPostId(rows: SalesHistoryRow[]): Map<string, SalesHistoryRow[]> {
  const map = new Map<string, SalesHistoryRow[]>();
  for (const row of rows) {
    if (!rowHasBuyerChat(row)) continue;
    const postId = String(row.postId ?? "").trim();
    if (!postId) continue;
    const bucket = map.get(postId) ?? [];
    bucket.push(row);
    map.set(postId, bucket);
  }
  for (const [postId, bucket] of map) {
    bucket.sort((a, b) => tradeRowRecencyMs(b) - tradeRowRecencyMs(a));
    map.set(postId, bucket);
  }
  return map;
}

/** Overview: active listing count from raw posts status (client-side). */
export function countActiveListingProducts(
  products: { status?: string | null; sellerListingState?: string | null }[]
): number {
  let n = 0;
  for (const p of products) {
    const st = String(p.status ?? "").toLowerCase();
    if (st === "hidden" || st === "blinded" || st === "deleted") continue;
    if (st === "sold") continue;
    n += 1;
  }
  return n;
}

/** Overview: buyer chat rows in chatting-like flow (for hub chip). */
export function countOpenSellerChatRows(rows: SalesHistoryRow[]): number {
  let n = 0;
  for (const row of rows) {
    if (!rowHasBuyerChat(row)) continue;
    const flow = String(row.tradeFlowStatus ?? "chatting");
    if (flow === "archived" || flow === "cancelled") continue;
    if (flow === "review_completed") continue;
    if (String(row.status ?? "").toLowerCase() === "sold" && flow === "buyer_confirmed") continue;
    n += 1;
  }
  return n;
}
