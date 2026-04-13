/**
 * 구매/판매 내역 API 공통 — 행 목록까지 로드 (썸네일·닉네임 제외)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { CHAT_ROOM_ID_IN_CHUNK_SIZE, chunkIds } from "@/lib/chats/chat-list-limits";
import { postOwnedByUserId } from "@/lib/chats/resolve-author-nickname";
import {
  includeProductChatInPurchaseHistory,
  isSellingPostForSalesHistory,
  type ItemTradeRoomPair,
} from "@/lib/mypage/sales-history-scope";
import {
  runItemTradeReconcileBuyerIfStale,
  runItemTradeReconcileSellerIfStale,
} from "@/lib/trade/run-item-trade-reconcile-if-stale";
import { POST_TRADE_RELATION_SELECT } from "@/lib/posts/post-query-select";

const PC_SEL =
  "id, post_id, seller_id, buyer_id, created_at, last_message_at, last_message_preview, trade_flow_status, chat_mode, seller_completed_at, buyer_confirmed_at, buyer_confirm_source";

/** 건수 전용 — 네트워크·파싱 부하 감소 */
const PC_COUNT_SEL = "id, post_id, seller_id, buyer_id";

const PURCHASE_SEL =
  "id, post_id, seller_id, buyer_id, created_at, last_message_at, last_message_preview, trade_flow_status, chat_mode, seller_completed_at, buyer_confirmed_at, review_deadline_at, buyer_confirm_source";

const PURCHASE_COUNT_SEL = "id, post_id, seller_id, buyer_id";

/**
 * 스키마 차이(author_id·board_id 등)로 42703 나도 건수 API는 살리기.
 * posts.type 컬럼은 레거시 DB에 없을 수 있어 SELECT 에 넣지 않음 — 판별은 trade_category_id·board_id·메타.
 */
const POSTS_SALES_COUNT_SELECT_TIERS = [
  "id, user_id, author_id, title, meta, board_id, trade_category_id, category_id",
  "id, user_id, title, meta, board_id, trade_category_id, category_id",
  "id, user_id, author_id, title, meta, board_id, trade_category_id",
  "id, user_id, title, meta, board_id, trade_category_id",
  "id, user_id, title, meta, trade_category_id, category_id",
  "id, user_id, title, meta, trade_category_id",
  "id, user_id, title, meta, category_id",
  "id, user_id, title, meta",
] as const;

function isMissingColumnSupabaseError(msg: string): boolean {
  return /42703|column|does not exist|unknown column/i.test(msg);
}

async function loadOwnedPostsForSalesScope(
  sbAny: SupabaseClient<any>,
  userId: string,
  forCount: boolean
): Promise<{ rows: Record<string, unknown>[]; error: Error | null }> {
  if (!forCount) {
    const { data, error } = await sbAny
      .from("posts")
      .select(POST_TRADE_RELATION_SELECT)
      .eq("user_id", userId);
    if (error) {
      return { rows: [], error: new Error(error.message) };
    }
    return { rows: ((data ?? []) as unknown as Record<string, unknown>[]), error: null };
  }

  let lastMsg = "";
  for (const sel of POSTS_SALES_COUNT_SELECT_TIERS) {
    const { data, error } = await sbAny.from("posts").select(sel).eq("user_id", userId);
    if (!error) {
      return { rows: ((data ?? []) as unknown as Record<string, unknown>[]), error: null };
    }
    lastMsg = error.message ?? String(error);
    if (!isMissingColumnSupabaseError(lastMsg)) {
      return { rows: [], error: new Error(lastMsg) };
    }
  }
  return { rows: [], error: new Error(lastMsg || "posts load failed") };
}

export type TradeHistoryLoadOpts = { forCount?: boolean };

export async function loadPurchaseHistoryRows(
  sbAny: SupabaseClient<any>,
  userId: string,
  opts?: TradeHistoryLoadOpts
): Promise<{ rows: Record<string, unknown>[]; roomsAsBuyer: ItemTradeRoomPair[] }> {
  const forCount = !!opts?.forCount;
  const { data: crBuyRows } = await sbAny
    .from("chat_rooms")
    .select("item_id, seller_id, buyer_id")
    .eq("room_type", "item_trade")
    .eq("buyer_id", userId);

  const roomsAsBuyer = (crBuyRows ?? []).map((r: Record<string, unknown>) => ({
    item_id: String(r.item_id ?? ""),
    seller_id: String(r.seller_id ?? ""),
    buyer_id: String(r.buyer_id ?? ""),
  })) as ItemTradeRoomPair[];

  const postIdsFromRooms = [...new Set(roomsAsBuyer.map((r) => r.item_id).filter(Boolean))];

  await runItemTradeReconcileBuyerIfStale(sbAny, userId, postIdsFromRooms);

  const pcSel = forCount ? PURCHASE_COUNT_SEL : PURCHASE_SEL;
  const { data: byBuyerId, error: e1 } = await sbAny
    .from("product_chats")
    .select(pcSel)
    .eq("buyer_id", userId);

  if (e1) {
    throw new Error(e1.message);
  }

  const byPost: Record<string, unknown>[] = [];
  if (postIdsFromRooms.length > 0) {
    for (const idChunk of chunkIds(postIdsFromRooms, CHAT_ROOM_ID_IN_CHUNK_SIZE)) {
      const { data: bp, error: e2 } = await sbAny
        .from("product_chats")
        .select(pcSel)
        .in("post_id", idChunk);
      if (e2) {
        throw new Error(e2.message);
      }
      byPost.push(...((bp ?? []) as unknown as Record<string, unknown>[]));
    }
  }

  const byId = new Map<string, Record<string, unknown>>();
  for (const r of [
    ...((byBuyerId ?? []) as unknown as Record<string, unknown>[]),
    ...byPost,
  ]) {
    byId.set(String(r.id ?? ""), r);
  }

  const rows = [...byId.values()].filter((r) =>
    includeProductChatInPurchaseHistory(
      userId,
      {
        post_id: String(r.post_id ?? ""),
        seller_id: String(r.seller_id ?? ""),
        buyer_id: String(r.buyer_id ?? ""),
      },
      roomsAsBuyer
    )
  );

  if (!forCount) {
    rows.sort((a, b) => {
      const ta = new Date(String(a.last_message_at ?? a.created_at ?? 0)).getTime();
      const tb = new Date(String(b.last_message_at ?? b.created_at ?? 0)).getTime();
      return tb - ta;
    });
  }

  return { rows, roomsAsBuyer };
}

export type SalesHistoryLoadResult = {
  rows: Record<string, unknown>[];
  sellingPostIds: string[];
  postMap: Map<string, Record<string, unknown>>;
};

export async function loadSalesHistoryRows(
  sbAny: SupabaseClient<any>,
  userId: string,
  opts?: TradeHistoryLoadOpts
): Promise<SalesHistoryLoadResult> {
  const forCount = !!opts?.forCount;
  const pcSel = forCount ? PC_COUNT_SEL : PC_SEL;

  const { rows: ownedPosts, error: postErr } = await loadOwnedPostsForSalesScope(
    sbAny,
    userId,
    forCount
  );

  if (postErr) {
    throw postErr;
  }

  const sellingMine = (ownedPosts as Record<string, unknown>[])
    .filter((p) => postOwnedByUserId(p, userId))
    .filter((p) => isSellingPostForSalesHistory(p));

  const sellingPostIds = [...new Set(sellingMine.map((p) => String(p.id)))];

  if (sellingPostIds.length === 0) {
    return { rows: [], sellingPostIds: [], postMap: new Map() };
  }

  const postMap = new Map(sellingMine.map((post) => [String(post.id), post]));

  await runItemTradeReconcileSellerIfStale(sbAny, userId, sellingPostIds);

  const byPostFlat: Record<string, unknown>[] = [];
  for (const idChunk of chunkIds(sellingPostIds, CHAT_ROOM_ID_IN_CHUNK_SIZE)) {
    const { data: byPost, error: e1 } = await sbAny
      .from("product_chats")
      .select(pcSel)
      .in("post_id", idChunk);
    if (e1) {
      throw new Error(e1.message);
    }
    byPostFlat.push(...((byPost ?? []) as unknown as Record<string, unknown>[]));
  }
  const { data: bySeller, error: e2 } = await sbAny
    .from("product_chats")
    .select(pcSel)
    .eq("seller_id", userId);
  if (e2) {
    throw new Error(e2.message);
  }

  const byId = new Map<string, Record<string, unknown>>();
  for (const r of [
    ...byPostFlat,
    ...((bySeller ?? []) as unknown as Record<string, unknown>[]),
  ]) {
    byId.set(String(r.id ?? ""), r);
  }

  const rows = [...byId.values()].filter((r) => {
    const post = postMap.get(String(r.post_id ?? ""));
    return (
      postOwnedByUserId(post, userId) &&
      isSellingPostForSalesHistory(post) &&
      sellingPostIds.includes(String(r.post_id ?? ""))
    );
  });

  if (!forCount) {
    rows.sort((a, b) => {
      const ta = new Date(String(a.last_message_at ?? a.created_at ?? 0)).getTime();
      const tb = new Date(String(b.last_message_at ?? b.created_at ?? 0)).getTime();
      return tb - ta;
    });
  }

  return { rows, sellingPostIds, postMap };
}

export function countSalesHistoryItems(
  rows: Record<string, unknown>[],
  sellingPostIds: string[]
): number {
  const postsWithChat = new Set(rows.map((r) => String(r.post_id ?? "")));
  const noChatExtra = sellingPostIds.filter((pid) => !postsWithChat.has(pid)).length;
  return rows.length + noChatExtra;
}
