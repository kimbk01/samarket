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
 * 표시값: `max(cmParticipantUnread, legacyTradeUnread)` — 이중 카운트보다 누락이 치명적이지 않게.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import { tradeListUnreadHintFromCursor } from "@/lib/chats/server/trade-list-unread-hint";

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

  const { data: itemTradeRows, error: itErr } = await sbAny
    .from("chat_rooms")
    .select("id, last_message_id, community_messenger_room_id")
    .eq("room_type", "item_trade")
    .in("community_messenger_room_id", cmRoomIds);

  if (itErr) return;

  type ItemLink = { itemTradeRoomId: string; lastMessageId: string | null };
  const itemTradeByCmRoomId = new Map<string, ItemLink>();
  for (const row of (itemTradeRows ?? []) as Array<{
    id?: unknown;
    last_message_id?: unknown;
    community_messenger_room_id?: unknown;
  }>) {
    const cmId = t(row.community_messenger_room_id);
    const id = t(row.id);
    if (!cmId || !id || itemTradeByCmRoomId.has(cmId)) continue;
    const lm = t(row.last_message_id) || null;
    itemTradeByCmRoomId.set(cmId, { itemTradeRoomId: id, lastMessageId: lm });
  }

  const itemTradeRoomIds = dedupeStrings([...itemTradeByCmRoomId.values()].map((v) => v.itemTradeRoomId));

  const productChatIds = dedupeStrings(
    tradeSummaries.map((s) => t(s.contextMeta?.productChatId)).filter(Boolean)
  );

  const [{ data: partRows }, { data: pcRows }] = await Promise.all([
    itemTradeRoomIds.length
      ? sbAny
          .from("chat_room_participants")
          .select("room_id, last_read_message_id, hidden, left_at, is_active")
          .eq("user_id", uid)
          .in("room_id", itemTradeRoomIds)
      : Promise.resolve({ data: [] as unknown[] }),
    productChatIds.length
      ? sbAny
          .from("product_chats")
          .select("id, seller_id, buyer_id, unread_count_seller, unread_count_buyer")
          .in("id", productChatIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const partByItemTradeRoom = new Map<string, { last_read_message_id: string | null }>();
  for (const row of (partRows ?? []) as Array<{
    room_id?: unknown;
    last_read_message_id?: unknown | null;
    hidden?: boolean;
    left_at?: string | null;
    is_active?: boolean | null;
  }>) {
    if (row.hidden) continue;
    if (t(row.left_at)) continue;
    if (row.is_active === false) continue;
    const rid = t(row.room_id);
    if (!rid) continue;
    partByItemTradeRoom.set(rid, { last_read_message_id: t(row.last_read_message_id) || null });
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

  const lastMsgIds = dedupeStrings(
    [...itemTradeByCmRoomId.values()].map((v) => v.lastMessageId).filter((x): x is string => Boolean(x))
  );

  const senderByMessageId = new Map<string, string>();
  if (lastMsgIds.length) {
    const { data: msgRows } = await sbAny.from("chat_messages").select("id, sender_id").in("id", lastMsgIds);
    for (const row of (msgRows ?? []) as Array<{ id?: unknown; sender_id?: unknown }>) {
      const id = t(row.id);
      const sid = t(row.sender_id);
      if (id) senderByMessageId.set(id, sid);
    }
  }

  for (const s of tradeSummaries) {
    const cmU = Math.max(0, Math.floor(Number(s.unreadCount) || 0));
    let legacy = 0;

    const link = itemTradeByCmRoomId.get(s.id);
    if (link) {
      const part = partByItemTradeRoom.get(link.itemTradeRoomId);
      const lastMid = link.lastMessageId;
      const lastSender = lastMid ? senderByMessageId.get(lastMid) ?? null : null;
      const resolvable = !lastMid || senderByMessageId.has(lastMid);
      legacy = Math.max(
        legacy,
        tradeListUnreadHintFromCursor({
          viewerUserId: uid,
          lastMessageId: lastMid,
          lastMessageSenderId: lastSender,
          lastReadMessageId: part?.last_read_message_id ?? null,
          lastMessageRowResolvable: resolvable,
        })
      );
    } else {
      const pcid = t(s.contextMeta?.productChatId);
      const pc = pcid ? pcById.get(pcid) : undefined;
      if (pc) {
        const amSeller = pc.seller_id === uid;
        legacy = Math.max(0, amSeller ? pc.unreadSeller : pc.unreadBuyer);
      }
    }

    const merged = Math.max(cmU, legacy);
    if (merged !== s.unreadCount) {
      s.unreadCount = merged;
    }
  }
}
