/**
 * 메신저 목록 `unreadCount` 는 기본적으로 CM 참가자 행만 쓰는데,
 * `GET /api/me/store-owner-hub-badge` 의 `chatUnread`(거래 레거시)는
 * `item_trade` 커서 힌트 + (통합방 없을 때) `product_chats` 미읽음을 합산한다.
 * 그 차이로 **탭에만 1이 있고 목록 줄에는 뱃지가 없는** 불일치가 난다.
 *
 * 거래 맥락(`contextMeta.kind === "trade"`) 방에 대해 동일 소스를 반영:
 * - `chat_rooms` (`room_type=item_trade`, `community_messenger_room_id` = CM 방 id) 커서 힌트
 * - 위가 없으면 `product_chats.id = contextMeta.productChatId` 의 seller/buyer unread 컬럼
 *
 * `item_trade` 행이 해당 CM 방에 연결된 경우: **CM participant unread 만** 목록에 쓴다.
 * (레거시 미러·PC 카운트와 `max` 하면 읽음 후에도 유령 뱃지가 남는다.)
 * 연결 레코드가 없을 때만 PC 컬럼 등 레거시 힌트를 쓴다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logHomeSyncBreakdown } from "@/lib/community-messenger/home-sync-breakdown-log";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

function t(value: unknown): string {
  return String(value ?? "").trim();
}

function dedupeStrings(values: Iterable<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const v = t(raw);
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export async function enrichMessengerTradeUnreadWithLegacyTrade(
  sbAny: SupabaseClient<any>,
  viewerUserId: string,
  summaries: CommunityMessengerRoomSummary[]
): Promise<void> {
  const uid = t(viewerUserId);
  if (!uid || !summaries.length) return;

  const tradeSummaries = summaries.filter((s) => s.contextMeta?.kind === "trade");
  if (!tradeSummaries.length) return;

  const cmRoomIds = dedupeStrings(tradeSummaries.map((s) => s.id));
  if (!cmRoomIds.length) return;

  const tChatRooms = performance.now();
  const { data: itemTradeRows, error: itErr } = await sbAny
    .from("chat_rooms")
    .select("id, community_messenger_room_id")
    .eq("room_type", "item_trade")
    .in("community_messenger_room_id", cmRoomIds);
  logHomeSyncBreakdown("legacy_trade_query_chat_rooms", performance.now() - tChatRooms, {
    table: "chat_rooms",
    roomIdInCount: cmRoomIds.length,
    err: itErr ? String((itErr as { message?: unknown }).message ?? itErr) : null,
  });

  if (itErr) return;

  const itemTradeByCmRoomId = new Map<string, true>();
  for (const row of (itemTradeRows ?? []) as Array<{
    id?: unknown;
    community_messenger_room_id?: unknown;
  }>) {
    const cmId = t(row.community_messenger_room_id);
    const id = t(row.id);
    if (!cmId || !id || itemTradeByCmRoomId.has(cmId)) continue;
    itemTradeByCmRoomId.set(cmId, true);
  }

  const productChatIds = dedupeStrings(
    tradeSummaries.map((s) => t(s.contextMeta?.productChatId)).filter(Boolean)
  );

  const tProductChats = performance.now();
  const { data: pcRows } = productChatIds.length
    ? await sbAny
        .from("product_chats")
        .select("id, seller_id, buyer_id, unread_count_seller, unread_count_buyer")
        .in("id", productChatIds)
    : { data: [] as unknown[] };
  if (productChatIds.length) {
    logHomeSyncBreakdown("legacy_trade_query_product_chats", performance.now() - tProductChats, {
      table: "product_chats",
      idInCount: productChatIds.length,
    });
  }

  const pcById = new Map<
    string,
    { seller_id: string; buyer_id: string; unreadSeller: number; unreadBuyer: number }
  >();
  for (const row of (pcRows ?? []) as Array<{
    id?: unknown;
    seller_id?: unknown;
    buyer_id?: unknown;
    unread_count_seller?: unknown;
    unread_count_buyer?: unknown;
  }>) {
    const id = t(row.id);
    if (!id) continue;
    pcById.set(id, {
      seller_id: t(row.seller_id),
      buyer_id: t(row.buyer_id),
      unreadSeller: Math.max(0, Math.floor(Number(row.unread_count_seller ?? 0) || 0)),
      unreadBuyer: Math.max(0, Math.floor(Number(row.unread_count_buyer ?? 0) || 0)),
    });
  }

  for (const s of tradeSummaries) {
    const cmU = Math.max(0, Math.floor(Number(s.unreadCount) || 0));
    const link = itemTradeByCmRoomId.get(s.id);
    if (link) {
      if (cmU !== s.unreadCount) {
        s.unreadCount = cmU;
      }
      continue;
    }

    let legacy = 0;
    const pcid = t(s.contextMeta?.productChatId);
    const pc = pcid ? pcById.get(pcid) : undefined;
    if (pc) {
      const amSeller = pc.seller_id === uid;
      legacy = Math.max(0, amSeller ? pc.unreadSeller : pc.unreadBuyer);
    }

    const merged = Math.max(cmU, legacy);
    if (merged !== s.unreadCount) {
      s.unreadCount = merged;
    }
  }
}
