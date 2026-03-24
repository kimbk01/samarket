/**
 * 채팅 목록 조회 (서비스 롤) — 판매자/구매자 모두 본인 참여 방만
 * GET /api/chat/rooms (세션)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { createClient } from "@supabase/supabase-js";
import { chatProductSummaryFromPostRow } from "@/lib/chats/chat-product-from-post";
import {
  enrichPostWithAuthorNickname,
  fetchNicknamesForUserIds,
  postAuthorUserId,
} from "@/lib/chats/resolve-author-nickname";
import { generalChatKindFromRoomRow } from "@/lib/chat/general-room-mapping";
import type { GeneralChatMeta } from "@/lib/types/chat";
import { fetchPostRowsForChatIn } from "@/lib/chats/post-select-compat";

type ChatRoomListRow = {
  id: string;
  productId: string;
  buyerId: string;
  sellerId: string;
  partnerNickname: string;
  partnerAvatar: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  product: ReturnType<typeof chatProductSummaryFromPostRow>;
  source: "product_chat" | "chat_room";
  tradeStatus?: string;
  generalChat?: GeneralChatMeta;
};

function isStoreOrderRoomRow(r: ChatRoomListRow): boolean {
  return r.generalChat?.kind === "store_order";
}

/** segment=trade: 매장 주문 제외. segment=order: 매장 주문만. 그 외: 전체(호환). */
function filterRoomsByListSegment(
  rows: ChatRoomListRow[],
  segment: string | null
): ChatRoomListRow[] {
  if (segment === "order") {
    return rows.filter(isStoreOrderRoomRow);
  }
  if (segment === "trade") {
    return rows.filter((r) => !isStoreOrderRoomRow(r));
  }
  return rows;
}

/** 동일 (글·판매자·구매자)에 product_chats + chat_rooms 가 같이 있으면 한 줄로 합침. id는 chat_rooms 우선(구매자 채팅 URL과 동일 스레드). */
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

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const segment = req.nextUrl.searchParams.get("segment")?.trim().toLowerCase() ?? null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "서버 설정 필요" }, { status: 500 });
  }

  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;

  const [pcRes, partRes] = await Promise.all([
    sbAny
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
      .order("last_message_at", { ascending: false, nullsFirst: false }),
    sbAny
      .from("chat_room_participants")
      .select("room_id, unread_count")
      .eq("user_id", userId)
      .eq("hidden", false),
  ]);

  const { data: productChatRows, error } = pcRes;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const partRowsEarly = partRes.data ?? [];
  const roomIdsEarly = partRowsEarly.map((p: { room_id: string }) => p.room_id);
  const partByRoomEarly = new Map(
    partRowsEarly.map((p: { room_id: string; unread_count?: number }) => [p.room_id, p])
  );

  const pcRows = productChatRows ?? [];
  const postIds = [...new Set(pcRows.map((r: { post_id: string }) => r.post_id))];
  const posts = postIds.length ? await fetchPostRowsForChatIn(sbAny, postIds) : [];
  const postMap = new Map((posts ?? []).map((p: Record<string, unknown>) => [p.id as string, p]));

  const partnerIds = [...new Set(pcRows.map((r: { seller_id: string; buyer_id: string }) => (r.seller_id === userId ? r.buyer_id : r.seller_id)))];
  const authorIdsFromPosts = [...new Set(
    (posts ?? [])
      .map((p: Record<string, unknown>) => postAuthorUserId(p))
      .filter((id): id is string => !!id)
  )];
  const nicknameByUserId = await fetchNicknamesForUserIds(sbAny, [
    ...new Set([...partnerIds, ...authorIdsFromPosts]),
  ]);

  const listFromProductChats: ChatRoomListRow[] = pcRows.map((r: {
    id: string;
    post_id: string;
    seller_id: string;
    buyer_id: string;
    last_message_at: string | null;
    last_message_preview: string | null;
    unread_count_seller: number;
    unread_count_buyer: number;
    created_at: string;
  }) => {
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
    };
  });

  // 당근형: chat_rooms(item_trade) + 일반(community/group/business/general_chat) + 매장주문(store_order) 병합
  let listFromChatRooms: ChatRoomListRow[] = [];
  let listFromGeneralChatRooms: ChatRoomListRow[] = [];
  let listFromStoreOrderRooms: ChatRoomListRow[] = [];
  try {
    const roomIds = roomIdsEarly;
    const partByRoom = partByRoomEarly;

    if (roomIds.length > 0) {
      const { data: crRooms } = await sbAny
        .from("chat_rooms")
        .select("id, item_id, seller_id, buyer_id, last_message_at, last_message_preview, created_at, trade_status")
        .eq("room_type", "item_trade")
        .in("id", roomIds);
      if (crRooms?.length) {
        const itemIds = [...new Set((crRooms as { item_id: string | null }[]).map((r) => r.item_id).filter(Boolean))] as string[];
        const crPosts = await fetchPostRowsForChatIn(sbAny, itemIds);
        const crPostMap = new Map(crPosts.map((p: Record<string, unknown>) => [p.id as string, p]));
        const crPartnerIds = [...new Set((crRooms as { seller_id: string; buyer_id: string }[]).flatMap((r) => [r.seller_id, r.buyer_id]).filter((id) => id !== userId))];
        const crAuthorIds = [...new Set(
          (crPosts ?? [])
            .map((p: Record<string, unknown>) => postAuthorUserId(p))
            .filter((id): id is string => !!id)
        )];
        const crNicknameByUserId = await fetchNicknamesForUserIds(sbAny, [
          ...new Set([...crPartnerIds, ...crAuthorIds]),
        ]);

        listFromChatRooms = (crRooms as {
          id: string;
          item_id: string | null;
          seller_id: string;
          buyer_id: string;
          last_message_at: string | null;
          last_message_preview: string | null;
          created_at: string;
          trade_status?: string;
        }[]).map((r) => {
          const post = r.item_id ? crPostMap.get(r.item_id) as Record<string, unknown> | undefined : undefined;
          const amISeller = r.seller_id === userId;
          const partnerId = amISeller ? r.buyer_id : r.seller_id;
          const part = partByRoom.get(r.id) as { unread_count?: number } | undefined;
          const unreadCount = part?.unread_count ?? 0;
          return {
            id: r.id,
            productId: r.item_id ?? "",
            buyerId: r.buyer_id,
            sellerId: r.seller_id,
            partnerNickname: crNicknameByUserId.get(partnerId)?.trim() || partnerId.slice(0, 8),
            partnerAvatar: "",
            lastMessage: r.last_message_preview ?? "",
            lastMessageAt: r.last_message_at ?? r.created_at,
            unreadCount,
            tradeStatus: r.trade_status ?? "inquiry",
            product: chatProductSummaryFromPostRow(
              enrichPostWithAuthorNickname(post, crNicknameByUserId),
              r.item_id ?? ""
            ),
            source: "chat_room" as const,
          };
        });
      }

      const { data: genRooms } = await sbAny
        .from("chat_rooms")
        .select(
          "id, room_type, initiator_id, peer_id, last_message_at, last_message_preview, created_at, related_post_id, related_comment_id, related_group_id, related_business_id, context_type"
        )
        .in("room_type", ["general_chat", "community", "group", "business"])
        .in("id", roomIds);
      if (genRooms?.length) {
        const gr = genRooms as {
          id: string;
          room_type: string;
          initiator_id: string;
          peer_id: string | null;
          last_message_at: string | null;
          last_message_preview: string | null;
          created_at: string;
          related_post_id: string | null;
          related_comment_id: string | null;
          related_group_id: string | null;
          related_business_id: string | null;
          context_type: string | null;
        }[];
        const relPostIds = [...new Set(gr.map((r) => r.related_post_id).filter(Boolean))] as string[];
        const relPosts = relPostIds.length ? await fetchPostRowsForChatIn(sbAny, relPostIds) : [];
        const relPostMap = new Map((relPosts ?? []).map((p: Record<string, unknown>) => [p.id as string, p]));
        const genPartnerIds = gr
          .map((r) => {
            const ini = r.initiator_id;
            const peer = r.peer_id;
            if (userId === ini) return peer;
            if (userId === peer) return ini;
            return peer ?? ini;
          })
          .filter((id): id is string => !!id);
        const genAuthorIds = [...new Set(
          (relPosts ?? [])
            .map((p: Record<string, unknown>) => postAuthorUserId(p))
            .filter((id): id is string => !!id)
        )];
        const genNick = await fetchNicknamesForUserIds(sbAny, [...new Set([...genPartnerIds, ...genAuthorIds])]);

        listFromGeneralChatRooms = gr.map((r) => {
          const ini = r.initiator_id;
          const peer = r.peer_id ?? "";
          const partnerId = userId === ini ? peer : ini;
          const part = partByRoom.get(r.id) as { unread_count?: number } | undefined;
          const unreadCount = part?.unread_count ?? 0;
          const kind = generalChatKindFromRoomRow(r.room_type, r.context_type);
          const postIdForCard = r.related_post_id ?? "";
          const postRow = postIdForCard ? relPostMap.get(postIdForCard) : undefined;
          const generalChat: GeneralChatMeta = {
            kind,
            relatedPostId: r.related_post_id,
            relatedCommentId: r.related_comment_id,
            relatedGroupId: r.related_group_id,
            relatedBusinessId: r.related_business_id,
            contextType: r.context_type,
          };
          const titleFallback =
            kind === "group"
              ? "모임 채팅"
              : kind === "business"
                ? "상점 문의"
                : kind === "community"
                  ? "커뮤니티 문의"
                  : "일반 채팅";
          return {
            id: r.id,
            productId: postIdForCard,
            buyerId: peer || ini,
            sellerId: ini,
            partnerNickname: genNick.get(partnerId)?.trim() || partnerId.slice(0, 8),
            partnerAvatar: "",
            lastMessage: r.last_message_preview ?? "",
            lastMessageAt: r.last_message_at ?? r.created_at,
            unreadCount,
            product: postRow
              ? chatProductSummaryFromPostRow(
                  enrichPostWithAuthorNickname(postRow, genNick),
                  postIdForCard
                )
              : chatProductSummaryFromPostRow(
                  { title: titleFallback, status: "active" } as Record<string, unknown>,
                  postIdForCard || r.id
                ),
            source: "chat_room" as const,
            generalChat,
          };
        });
      }

      const { data: soRooms } = await sbAny
        .from("chat_rooms")
        .select(
          "id, seller_id, buyer_id, store_order_id, last_message_at, last_message_preview, created_at"
        )
        .eq("room_type", "store_order")
        .in("id", roomIds);
      if (soRooms?.length) {
        const sor = soRooms as {
          id: string;
          seller_id: string;
          buyer_id: string;
          store_order_id: string | null;
          last_message_at: string | null;
          last_message_preview: string | null;
          created_at: string;
        }[];
        const oids = [...new Set(sor.map((x) => x.store_order_id).filter(Boolean))] as string[];
        const { data: orows } = oids.length
          ? await sbAny.from("store_orders").select("id, order_no, store_id").in("id", oids)
          : { data: [] as { id: string; order_no: string; store_id: string }[] };
        const stids = [...new Set((orows ?? []).map((o) => o.store_id))];
        const { data: sts } = stids.length
          ? await sbAny.from("stores").select("id, store_name").in("id", stids)
          : { data: [] as { id: string; store_name: string }[] };
        const orderMap = new Map((orows ?? []).map((o) => [o.id, o]));
        const storeMap = new Map((sts ?? []).map((s) => [s.id, s]));
        const partnerIdsSo = [
          ...new Set(sor.flatMap((r) => [r.seller_id, r.buyer_id]).filter((id) => id && id !== userId) as string[]),
        ];
        const soNick = await fetchNicknamesForUserIds(sbAny, partnerIdsSo);

        listFromStoreOrderRooms = sor.map((r) => {
          const amISeller = r.seller_id === userId;
          const partnerId = amISeller ? r.buyer_id : r.seller_id;
          const part = partByRoom.get(r.id) as { unread_count?: number } | undefined;
          const unreadCount = part?.unread_count ?? 0;
          const oid = r.store_order_id ?? "";
          const ord = oid ? orderMap.get(oid) : undefined;
          const st = ord ? storeMap.get(ord.store_id) : undefined;
          const title =
            ord && st
              ? `${(st as { store_name: string }).store_name} · 주문 ${ord.order_no}`
              : "매장 주문";
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
            partnerNickname: soNick.get(partnerId)?.trim() || partnerId.slice(0, 8),
            partnerAvatar: "",
            lastMessage: r.last_message_preview ?? "",
            lastMessageAt: r.last_message_at ?? r.created_at,
            unreadCount,
            product: chatProductSummaryFromPostRow(
              { title, status: "active" } as Record<string, unknown>,
              oid || r.id
            ),
            source: "chat_room" as const,
            generalChat,
          };
        });
      }
    }
  } catch {
    /* chat_rooms 테이블 없으면 무시 */
  }

  const mergedRaw = [
    ...listFromProductChats,
    ...listFromChatRooms,
    ...listFromGeneralChatRooms,
    ...listFromStoreOrderRooms,
  ];
  const merged = dedupeTradeChatRoomRows(mergedRaw).sort((a, b) => {
    const ta = new Date(a.lastMessageAt).getTime();
    const tb = new Date(b.lastMessageAt).getTime();
    return tb - ta;
  });
  const filteredRooms = filterRoomsByListSegment(merged, segment);
  return NextResponse.json({ rooms: filteredRooms });
}
