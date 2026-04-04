/**
 * 채팅 목록 조회 (서비스 롤) — 판매자/구매자 모두 본인 참여 방만
 * GET /api/chat/rooms (세션)
 *
 * 성능: 세그먼트별로 불필요한 product_chats / chat_rooms 행 조회 생략,
 * chat_rooms는 청크 단일 select 후 메모리에서 room_type 분기, 닉네임·posts 일괄 조회.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { createClient } from "@supabase/supabase-js";
import { chatProductSummaryFromPostRow } from "@/lib/chats/chat-product-from-post";
import {
  enrichPostWithAuthorNickname,
  fetchNicknamesForUserIds,
} from "@/lib/chats/resolve-author-nickname";
import type { ChatRoom } from "@/lib/types/chat";
import { fetchPostRowsForChatIn } from "@/lib/chats/post-select-compat";
import { CHAT_ROOM_ID_IN_CHUNK_SIZE, CHAT_ROOM_LIST_PRODUCT_CHATS_LIMIT, chunkIds } from "@/lib/chats/chat-list-limits";
import { participantRowActive } from "@/lib/chat/user-chat-unread-parts";

type ChatRoomListRow = ChatRoom;

function isStoreOrderRoomRow(r: ChatRoomListRow): boolean {
  return false;
}

function filterRoomsByListSegment(rows: ChatRoomListRow[], segment: string | null): ChatRoomListRow[] {
  if (segment === "order" || segment === "philife" || segment === "philife_inbox") {
    return [];
  }
  return rows.filter((r) => r.generalChat == null);
}

function dedupeTradeChatRoomRows(rows: ChatRoomListRow[]): ChatRoomListRow[] {
  const general = rows.filter((r) => r.generalChat != null);
  const trade = rows.filter((r) => r.generalChat == null);
  const loose: ChatRoomListRow[] = [];
  const byKey = new Map<string, ChatRoomListRow>();

  for (const r of trade) {
    const pid = (r.productId ?? "").trim();
    const bid = (r.buyerId ?? "").trim();
    const sid = (r.sellerId ?? "").trim();
    if (!pid || !bid || !sid) {
      loose.push(r);
      continue;
    }
    const key = `${pid}:${bid}:${sid}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, r);
      continue;
    }
    const pickCanonical = (a: ChatRoomListRow, b: ChatRoomListRow) =>
      a.source === "chat_room" ? a : b.source === "chat_room" ? b : a;
    const canonical = pickCanonical(existing, r);
    const other = canonical === existing ? r : existing;
    const tCanon = new Date(canonical.lastMessageAt).getTime();
    const tOther = new Date(other.lastMessageAt).getTime();
    const newer = tOther > tCanon ? other : canonical;
    byKey.set(key, {
      ...canonical,
      lastMessageAt: newer.lastMessageAt,
      lastMessage: newer.lastMessage,
      unreadCount: Math.max(canonical.unreadCount ?? 0, other.unreadCount ?? 0),
      tradeStatus: newer.tradeStatus ?? canonical.tradeStatus ?? other.tradeStatus,
    });
  }

  return [...general, ...loose, ...byKey.values()];
}

const CHAT_ROOMS_LIST_SELECT =
  "id, room_type, item_id, seller_id, buyer_id, meeting_id, last_message_at, last_message_preview, created_at, trade_status, initiator_id, peer_id, related_post_id, related_comment_id, related_group_id, related_business_id, context_type, store_order_id";

async function fetchParticipantChatRoomsChunked(
  sbAny: import("@supabase/supabase-js").SupabaseClient<any>,
  roomIds: string[],
  segment: string | null
): Promise<Record<string, unknown>[]> {
  if (roomIds.length === 0) return [];
  const chunks = chunkIds(roomIds, CHAT_ROOM_ID_IN_CHUNK_SIZE);
  const parts = await Promise.all(
    chunks.map(async (ids) => {
      let q = sbAny.from("chat_rooms").select(CHAT_ROOMS_LIST_SELECT).in("id", ids);
      q = q.eq("room_type", "item_trade");
      const { data } = await q;
      return (data ?? []) as Record<string, unknown>[];
    })
  );
  return parts.flat();
}

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const rawSeg = req.nextUrl.searchParams.get("segment")?.trim().toLowerCase() ?? null;
  const segment =
    rawSeg === "trade"
      ? "trade"
      : rawSeg === "philife" || rawSeg === "community"
        ? "philife"
        : rawSeg === "philife_inbox"
            ? "philife_inbox"
            : null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "서버 설정 필요" }, { status: 500 });
  }

  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;

  const needProductChats = segment == null || segment === "trade";

  const [pcRes, partRes] = await Promise.all([
    needProductChats
      ? sbAny
          .from("product_chats")
          .select(`
      id,
      post_id,
      seller_id,
      buyer_id,
      last_message_at,
      last_message_preview,
      unread_count_seller,
      unread_count_buyer,
      created_at
    `)
          .or(`seller_id.eq.${userId},buyer_id.eq.${userId}`)
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .limit(CHAT_ROOM_LIST_PRODUCT_CHATS_LIMIT)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    sbAny
      .from("chat_room_participants")
      .select("room_id, unread_count, left_at, is_active")
      .eq("user_id", userId)
      .eq("hidden", false),
  ]);

  const { data: productChatRows, error } = pcRes;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (partRes.error) {
    return NextResponse.json({ error: partRes.error.message }, { status: 500 });
  }

  const partRowsEarlyRaw = partRes.data ?? [];
  const partRowsEarly = (
    partRowsEarlyRaw as { room_id: string; unread_count?: number; left_at?: string | null; is_active?: boolean | null }[]
  ).filter((p) => participantRowActive(p));
  const roomIdsEarly = partRowsEarly.map((p) => p.room_id);
  const partByRoomEarly = new Map(partRowsEarly.map((p) => [p.room_id, p]));

  const pcRows = (productChatRows ?? []) as {
    id: string;
    post_id: string;
    seller_id: string;
    buyer_id: string;
    last_message_at: string | null;
    last_message_preview: string | null;
    unread_count_seller: number;
    unread_count_buyer: number;
    created_at: string;
  }[];

  let allCrRows: Record<string, unknown>[] = [];
  try {
    allCrRows = await fetchParticipantChatRoomsChunked(sbAny, roomIdsEarly, segment);
  } catch {
    allCrRows = [];
  }

  const crTradeRows = allCrRows.filter((r) => String(r.room_type) === "item_trade") as {
    id: string;
    item_id: string | null;
    seller_id: string;
    buyer_id: string;
    last_message_at: string | null;
    last_message_preview: string | null;
    created_at: string;
    trade_status?: string;
  }[];

  const genRows: Array<Record<string, never>> = [];

  const postIdsFromPc = [...new Set(pcRows.map((r) => r.post_id))];
  const itemIds = [...new Set(crTradeRows.map((r) => r.item_id).filter(Boolean))] as string[];
  const allPostIds = [...new Set([...postIdsFromPc, ...itemIds])];
  const posts = allPostIds.length ? await fetchPostRowsForChatIn(sbAny, allPostIds) : [];
  const postMap = new Map((posts ?? []).map((p: Record<string, unknown>) => [p.id as string, p]));

  const partnerIdsFromPc = [...new Set(pcRows.map((r) => (r.seller_id === userId ? r.buyer_id : r.seller_id)))];
  const crPartnerIds = [
    ...new Set(crTradeRows.flatMap((r) => [r.seller_id, r.buyer_id]).filter((id) => id !== userId)),
  ];
  const nicknameByUserId = await fetchNicknamesForUserIds(sbAny, [
    ...new Set([...partnerIdsFromPc, ...crPartnerIds]),
  ]);

  const listFromProductChats: ChatRoomListRow[] = pcRows.map((r) => {
    const post = postMap.get(r.post_id) as Record<string, unknown> | undefined;
    const amISeller = r.seller_id === userId;
    const unreadCount = amISeller ? (r.unread_count_seller ?? 0) : (r.unread_count_buyer ?? 0);
    const partnerId = amISeller ? r.buyer_id : r.seller_id;
    const partnerNickname = nicknameByUserId.get(partnerId)?.trim() || partnerId.slice(0, 8);
    return {
      id: r.id,
      productId: r.post_id,
      buyerId: r.buyer_id,
      sellerId: r.seller_id,
      partnerNickname,
      partnerAvatar: "",
      lastMessage: r.last_message_preview ?? "",
      lastMessageAt: r.last_message_at ?? r.created_at,
      unreadCount,
      product: chatProductSummaryFromPostRow(
        enrichPostWithAuthorNickname(post, nicknameByUserId),
        r.post_id
      ),
      source: "product_chat",
      chatDomain: "trade",
      roomTitle: partnerNickname,
      roomSubtitle: amISeller ? "상대방 · 구매자" : "상대방 · 판매자",
    };
  });

  const listFromChatRooms: ChatRoomListRow[] = crTradeRows.map((r) => {
    const post = r.item_id ? (postMap.get(r.item_id) as Record<string, unknown> | undefined) : undefined;
    const amISeller = r.seller_id === userId;
    const partnerId = amISeller ? r.buyer_id : r.seller_id;
    const part = partByRoomEarly.get(r.id) as { unread_count?: number } | undefined;
    const unreadCount = part?.unread_count ?? 0;
    return {
      id: r.id,
      productId: r.item_id ?? "",
      buyerId: r.buyer_id,
      sellerId: r.seller_id,
      partnerNickname: nicknameByUserId.get(partnerId)?.trim() || partnerId.slice(0, 8),
      partnerAvatar: "",
      lastMessage: r.last_message_preview ?? "",
      lastMessageAt: r.last_message_at ?? r.created_at,
      unreadCount,
      tradeStatus: r.trade_status ?? "inquiry",
      product: chatProductSummaryFromPostRow(
        enrichPostWithAuthorNickname(post, nicknameByUserId),
        r.item_id ?? ""
      ),
      source: "chat_room" as const,
      chatDomain: "trade",
      roomTitle: nicknameByUserId.get(partnerId)?.trim() || partnerId.slice(0, 8),
      roomSubtitle: amISeller ? "상대방 · 구매자" : "상대방 · 판매자",
    };
  });

  const mergedRaw = [
    ...listFromProductChats,
    ...listFromChatRooms,
  ];
  const merged = dedupeTradeChatRoomRows(mergedRaw).sort((a, b) => {
    const ta = new Date(a.lastMessageAt).getTime();
    const tb = new Date(b.lastMessageAt).getTime();
    return tb - ta;
  });
  const filteredRooms = filterRoomsByListSegment(merged, segment);
  return NextResponse.json({ rooms: filteredRooms });
}
