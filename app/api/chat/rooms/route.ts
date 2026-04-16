/**
 * 채팅 목록 조회 (서비스 롤) — 판매자/구매자 모두 본인 참여 방만
 * GET /api/chat/rooms (세션)
 *
 * 지원: `segment=trade`(거래·상품), `segment=order`(매장 배달 주문), 세그먼트 없음=둘 다.
 * 커뮤니티/필라이프/모임/오픈채팅 방은 앱 채팅 목록에서 제외(별도 메신저·제거된 기능).
 *
 * 성능: 세그먼트별로 불필요한 product_chats / chat_rooms 행 조회 생략,
 * chat_rooms는 청크 단일 select 후 메모리에서 room_type 분기,
 * 상대·작성자 닉네임은 `fetchNicknamesForUserIds` + posts 일괄 조회.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { inferMessengerDomainFromChatRoom } from "@/lib/chat-domain/messenger-domains";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { chatProductSummaryFromPostRow } from "@/lib/chats/chat-product-from-post";
import {
  enrichPostWithAuthorNickname,
  fetchNicknamesForUserIds,
  postAuthorUserId,
} from "@/lib/chats/resolve-author-nickname";
import type { ChatRoom, GeneralChatMeta } from "@/lib/types/chat";
import { fetchPostRowsForChatIn } from "@/lib/chats/post-select-compat";
import { CHAT_ROOM_ID_IN_CHUNK_SIZE, CHAT_ROOM_LIST_PRODUCT_CHATS_LIMIT, chunkIds } from "@/lib/chats/chat-list-limits";
import { BUYER_ORDER_STATUS_LABEL } from "@/lib/stores/store-order-process-criteria";
import { participantRowActive } from "@/lib/chat/user-chat-unread-parts";
import { tradeListUnreadHintFromCursor } from "@/lib/chats/server/trade-list-unread-hint";

type ChatRoomsListCacheEntry = { at: number; payload: unknown };
/** 짧은 TTL — 미읽음 배지와 균형. 너무 짧으면 탭 전환·시트 재오픈 시 동일 요청이 반복되어 체감 지연 */
const CHAT_ROOMS_LIST_CACHE_TTL_MS = 5000;
const chatRoomsListCache = new Map<string, ChatRoomsListCacheEntry>();

type ChatRoomListRow = ChatRoom;

/** 레거시: 필라이프·커뮤니티 채팅 목록 — 앱에서는 더 이상 사용하지 않음 */
const DEPRECATED_CHAT_LIST_SEGMENTS = new Set([
  "philife",
  "philife_open",
  "philife_inbox",
  "community",
]);

function isStoreOrderRoomRow(r: ChatRoomListRow): boolean {
  return r.generalChat?.kind === "store_order";
}

type EffectiveListSegment = "trade" | "order" | "all";

function filterRoomsByListSegment(rows: ChatRoomListRow[], segment: EffectiveListSegment): ChatRoomListRow[] {
  if (segment === "order") {
    return rows.filter(isStoreOrderRoomRow);
  }
  if (segment === "trade") {
    return rows.filter((r) => r.generalChat == null);
  }
  return rows;
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
    /** 통합 `chat_room` 행이 있으면 미읽음은 커서 힌트(0/1)만 쓴다 — 레거시 `product_chats` 카운터와 max 하면 배지가 부풀어 오름 */
    const mergedUnread =
      canonical.source === "chat_room"
        ? (canonical.unreadCount ?? 0)
        : Math.max(canonical.unreadCount ?? 0, other.unreadCount ?? 0);
    byKey.set(key, {
      ...canonical,
      lastMessageAt: newer.lastMessageAt,
      lastMessage: newer.lastMessage,
      unreadCount: mergedUnread,
      tradeStatus: newer.tradeStatus ?? canonical.tradeStatus ?? other.tradeStatus,
    });
  }

  return [...general, ...loose, ...byKey.values()];
}

const CHAT_ROOMS_LIST_SELECT =
  "id, room_type, item_id, seller_id, buyer_id, meeting_id, last_message_id, last_message_at, last_message_preview, created_at, trade_status, initiator_id, peer_id, related_post_id, related_comment_id, related_group_id, related_business_id, context_type, store_order_id";

async function fetchParticipantChatRoomsChunked(
  sbAny: import("@supabase/supabase-js").SupabaseClient<any>,
  roomIds: string[],
  segment: EffectiveListSegment
): Promise<Record<string, unknown>[]> {
  if (roomIds.length === 0) return [];
  const chunks = chunkIds(roomIds, CHAT_ROOM_ID_IN_CHUNK_SIZE);
  const parts = await Promise.all(
    chunks.map(async (ids) => {
      let q = sbAny.from("chat_rooms").select(CHAT_ROOMS_LIST_SELECT).in("id", ids);
      if (segment === "trade") q = q.eq("room_type", "item_trade");
      else if (segment === "order") q = q.eq("room_type", "store_order");
      else q = q.in("room_type", ["item_trade", "store_order"]);
      const { data } = await q;
      return (data ?? []) as Record<string, unknown>[];
    })
  );
  return parts.flat();
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const rawSeg = req.nextUrl.searchParams.get("segment")?.trim().toLowerCase() ?? null;
  if (rawSeg && DEPRECATED_CHAT_LIST_SEGMENTS.has(rawSeg)) {
    return NextResponse.json(
      { rooms: [] },
      { headers: { "Cache-Control": "no-store", "X-Chat-Rooms-Segment": "deprecated" } }
    );
  }
  const segment: EffectiveListSegment =
    rawSeg === "trade" ? "trade" : rawSeg === "order" ? "order" : "all";
  const cacheKey = `${userId}:${segment}`;
  const cached = chatRoomsListCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CHAT_ROOMS_LIST_CACHE_TTL_MS) {
    return NextResponse.json(cached.payload, {
      headers: {
        "X-Chat-Rooms-Cache": "HIT",
      },
    });
  }
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ error: "서버 설정 필요" }, { status: 500 });
  }
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;

  const needProductChats = segment === "all" || segment === "trade";

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
      .select("room_id, unread_count, last_read_message_id, left_at, is_active")
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
    partRowsEarlyRaw as {
      room_id: string;
      unread_count?: number;
      last_read_message_id?: string | null;
      left_at?: string | null;
      is_active?: boolean | null;
    }[]
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
    last_message_id?: string | null;
    last_message_at: string | null;
    last_message_preview: string | null;
    created_at: string;
    trade_status?: string;
  }[];

  const soRoomRows = allCrRows.filter((r) => String(r.room_type) === "store_order") as {
    id: string;
    seller_id: string;
    buyer_id: string;
    store_order_id: string | null;
    last_message_at: string | null;
    last_message_preview: string | null;
    created_at: string;
  }[];

  const postIdsFromPc = [...new Set(pcRows.map((r) => r.post_id))];
  const itemIds = [...new Set(crTradeRows.map((r) => r.item_id).filter(Boolean))] as string[];
  const allPostIds = [...new Set([...postIdsFromPc, ...itemIds])];

  const tradeLastMsgIds = [
    ...new Set(
      crTradeRows
        .map((r) => r.last_message_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];
  const tradeLastSenderByMsgId = new Map<string, string>();
  if (tradeLastMsgIds.length > 0) {
    const { data: lastMsgRows } = await sbAny.from("chat_messages").select("id, sender_id").in("id", tradeLastMsgIds);
    for (const row of lastMsgRows ?? []) {
      const id = (row as { id?: string }).id;
      const sid = (row as { sender_id?: string }).sender_id;
      if (typeof id === "string" && typeof sid === "string") tradeLastSenderByMsgId.set(id, sid);
    }
  }

  const partnerIdsFromPc = [...new Set(pcRows.map((r) => (r.seller_id === userId ? r.buyer_id : r.seller_id)))];
  const crPartnerIds = [
    ...new Set(crTradeRows.flatMap((r) => [r.seller_id, r.buyer_id]).filter((id) => id !== userId)),
  ];
  const partnerIdsSo =
    soRoomRows.length > 0
      ? [
          ...new Set(
            soRoomRows.flatMap((r) => [r.seller_id, r.buyer_id]).filter((id) => id && id !== userId) as string[]
          ),
        ]
      : [];
  const partnerIdsEarly = [...new Set([...partnerIdsFromPc, ...crPartnerIds, ...partnerIdsSo])];

  const [posts, nicknameByUserId] = await Promise.all([
    allPostIds.length ? fetchPostRowsForChatIn(sbAny, allPostIds) : Promise.resolve([]),
    partnerIdsEarly.length ? fetchNicknamesForUserIds(sbAny, partnerIdsEarly) : Promise.resolve(new Map<string, string>()),
  ]);

  const postMap = new Map((posts ?? []).map((p: Record<string, unknown>) => [p.id as string, p]));

  const authorIdsFromPosts = [
    ...new Set(
      (posts ?? [])
        .map((p: Record<string, unknown>) => postAuthorUserId(p))
        .filter((id): id is string => !!id)
    ),
  ];
  const authorNickMissing = authorIdsFromPosts.filter((id) => !nicknameByUserId.has(id));
  if (authorNickMissing.length > 0) {
    const more = await fetchNicknamesForUserIds(sbAny, authorNickMissing);
    for (const [k, v] of more) nicknameByUserId.set(k, v);
  }

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
    const part = partByRoomEarly.get(r.id) as
      | { unread_count?: number; last_read_message_id?: string | null }
      | undefined;
    const lastMid = r.last_message_id ?? null;
    const lastSender = lastMid ? tradeLastSenderByMsgId.get(lastMid) ?? null : null;
    const unreadCount = tradeListUnreadHintFromCursor({
      viewerUserId: userId,
      lastMessageId: lastMid,
      lastMessageSenderId: lastSender,
      lastReadMessageId: part?.last_read_message_id ?? null,
    });
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

  let listFromStoreOrderRooms: ChatRoomListRow[] = [];
  if (soRoomRows.length > 0) {
    const oids = [...new Set(soRoomRows.map((x) => x.store_order_id).filter(Boolean))] as string[];
    const { data: orows } = oids.length
      ? await sbAny.from("store_orders").select("id, order_no, store_id, order_status").in("id", oids)
      : { data: [] as { id: string; order_no: string; store_id: string; order_status?: string }[] };
    const stids = [...new Set((orows ?? []).map((o) => o.store_id))];
    const { data: sts } = stids.length
      ? await sbAny.from("stores").select("id, store_name").in("id", stids)
      : { data: [] as { id: string; store_name: string }[] };
    const orderMap = new Map((orows ?? []).map((o) => [o.id, o]));
    const storeMap = new Map((sts ?? []).map((s) => [s.id, s]));

    listFromStoreOrderRooms = soRoomRows.map((r) => {
      const amISeller = r.seller_id === userId;
      const partnerId = amISeller ? r.buyer_id : r.seller_id;
      const part = partByRoomEarly.get(r.id) as { unread_count?: number } | undefined;
      const unreadCount = part?.unread_count ?? 0;
      const oid = r.store_order_id ?? "";
      const ord = oid ? orderMap.get(oid) : undefined;
      const st = ord ? storeMap.get(ord.store_id) : undefined;
      const statusLabel =
        ord && typeof ord.order_status === "string"
          ? BUYER_ORDER_STATUS_LABEL[ord.order_status] ?? ord.order_status
          : "";
      const title =
        ord && st ? `${(st as { store_name: string }).store_name} · 주문 ${ord.order_no}` : "배달 주문";
      const generalChat: GeneralChatMeta = {
        kind: "store_order",
        storeOrderId: r.store_order_id,
        relatedPostId: null,
        relatedCommentId: null,
        relatedGroupId: null,
        relatedBusinessId: null,
        contextType: null,
      };
      return {
        id: r.id,
        productId: oid || r.id,
        buyerId: r.buyer_id,
        sellerId: r.seller_id,
        partnerNickname: nicknameByUserId.get(partnerId)?.trim() || partnerId.slice(0, 8),
        partnerAvatar: "",
        lastMessage: r.last_message_preview ?? "",
        lastMessageAt: r.last_message_at ?? r.created_at,
        unreadCount,
        product: chatProductSummaryFromPostRow({ title, status: "active" } as Record<string, unknown>, oid || r.id),
        source: "chat_room" as const,
        generalChat,
        chatDomain: "store_order" as const,
        roomTitle: title,
        roomSubtitle: statusLabel ? `주문 상태 · ${statusLabel}` : "배달채팅",
      };
    });
  }

  const mergedRaw = [...listFromProductChats, ...listFromChatRooms, ...listFromStoreOrderRooms];
  const merged = dedupeTradeChatRoomRows(mergedRaw).sort((a, b) => {
    const ta = new Date(a.lastMessageAt).getTime();
    const tb = new Date(b.lastMessageAt).getTime();
    return tb - ta;
  });
  const filteredRooms = filterRoomsByListSegment(merged, segment);
  const payload = { rooms: filteredRooms };
  chatRoomsListCache.set(cacheKey, { at: Date.now(), payload });
  if (process.env.CHAT_PERF_LOG === "1") {
    const domainCounts: Record<string, number> = {};
    for (const row of filteredRooms) {
      const d = inferMessengerDomainFromChatRoom(row);
      domainCounts[d] = (domainCounts[d] ?? 0) + 1;
    }
    console.info("[chat.rooms.list]", {
      userId,
      segment,
      roomCount: filteredRooms.length,
      domainCounts,
      elapsedMs: Date.now() - startedAt,
    });
  }
  return NextResponse.json(payload);
}
