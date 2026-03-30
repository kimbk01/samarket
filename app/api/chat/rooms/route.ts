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
  postAuthorUserId,
} from "@/lib/chats/resolve-author-nickname";
import { generalChatKindFromRoomRow } from "@/lib/chat/general-room-mapping";
import type { ChatRoom, GeneralChatMeta } from "@/lib/types/chat";
import { fetchPostRowsForChatIn } from "@/lib/chats/post-select-compat";
import { CHAT_ROOM_ID_IN_CHUNK_SIZE, CHAT_ROOM_LIST_PRODUCT_CHATS_LIMIT, chunkIds } from "@/lib/chats/chat-list-limits";
import { buildPhilifeListRoom } from "@/lib/chats/philife/room-mappers";
import { BUYER_ORDER_STATUS_LABEL } from "@/lib/stores/store-order-process-criteria";
import { participantRowActive } from "@/lib/chat/user-chat-unread-parts";

type ChatRoomListRow = ChatRoom;

/** 비-production: 인메모리 `__samarketNeighborhoodDevSampleState` 문의방만 (스텁 샘플 데이터는 제거됨) */
function getDevSampleCommunityRooms(userId: string): ChatRoomListRow[] {
  const state = (globalThis as {
    __samarketNeighborhoodDevSampleState?: {
      inquiryRooms?: Array<{
        id: string;
        post_id: string;
        initiator_id: string;
        peer_id: string;
        context_type: string;
        related_comment_id: string | null;
        created_at: string;
      }>;
      chatMessages?: Map<string, Array<{ message: string; createdAt: string }>>;
    };
  }).__samarketNeighborhoodDevSampleState;
  const inquiryRooms = (state?.inquiryRooms ?? [])
    .filter((room) => room.initiator_id === userId || room.peer_id === userId)
    .map((room) => {
      const latest = state?.chatMessages?.get(room.id)?.at(-1);
      const partnerId = room.initiator_id === userId ? room.peer_id : room.initiator_id;
      return {
        id: room.id,
        productId: room.post_id,
        buyerId: room.initiator_id,
        sellerId: room.peer_id,
        partnerNickname: partnerId.slice(0, 8),
        partnerAvatar: "",
        lastMessage: latest?.message ?? "게시글 문의 채팅이 시작되었습니다.",
        lastMessageAt: latest?.createdAt ?? room.created_at,
        unreadCount: 0,
        product: chatProductSummaryFromPostRow(
          {
            title: "커뮤니티 문의",
            status: "active",
            region_label: "",
          } as Record<string, unknown>,
          room.post_id
        ),
        source: "chat_room" as const,
        chatDomain: "philife" as const,
        roomTitle: "커뮤니티 문의",
        roomSubtitle: "커뮤니티 1:1 채팅",
        generalChat: {
          kind: "community" as const,
          relatedPostId: room.post_id,
          relatedCommentId: room.related_comment_id,
          relatedGroupId: null,
          relatedBusinessId: null,
          contextType: room.context_type,
        },
      };
    });
  return inquiryRooms;
}

function isStoreOrderRoomRow(r: ChatRoomListRow): boolean {
  return r.generalChat?.kind === "store_order";
}

function isPhilifeRoomRow(r: ChatRoomListRow): boolean {
  return r.generalChat != null && !isStoreOrderRoomRow(r);
}

function filterRoomsByListSegment(rows: ChatRoomListRow[], segment: string | null): ChatRoomListRow[] {
  if (segment === "order") {
    return rows.filter(isStoreOrderRoomRow);
  }
  if (segment === "trade") {
    return rows.filter((r) => r.generalChat == null);
  }
  if (segment === "philife") {
    return rows.filter(isPhilifeRoomRow);
  }
  if (segment === "philife_open") {
    return rows.filter((r) => isPhilifeRoomRow(r) && r.generalChat?.kind === "open_chat");
  }
  if (segment === "philife_inbox") {
    return rows.filter((r) => isPhilifeRoomRow(r) && r.generalChat?.kind !== "open_chat");
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
  "id, room_type, item_id, seller_id, buyer_id, last_message_at, last_message_preview, created_at, trade_status, initiator_id, peer_id, related_post_id, related_comment_id, related_group_id, related_business_id, context_type, store_order_id";

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
      if (segment === "trade") q = q.eq("room_type", "item_trade");
      else if (
        segment === "philife" ||
        segment === "philife_open" ||
        segment === "philife_inbox"
      )
        q = q.in("room_type", ["general_chat", "community", "group", "business", "group_meeting"]);
      else if (segment === "order") q = q.eq("room_type", "store_order");
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
        : rawSeg === "philife_open"
          ? "philife_open"
          : rawSeg === "philife_inbox"
            ? "philife_inbox"
            : rawSeg === "order"
              ? "order"
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

  const genRows = allCrRows.filter((r) =>
    ["general_chat", "community", "group", "business", "group_meeting"].includes(String(r.room_type))
  ) as {
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
  const relPostIds = [...new Set(genRows.map((r) => r.related_post_id).filter(Boolean))] as string[];
  const allPostIds = [...new Set([...postIdsFromPc, ...itemIds, ...relPostIds])];
  const posts = allPostIds.length ? await fetchPostRowsForChatIn(sbAny, allPostIds) : [];
  const postMap = new Map((posts ?? []).map((p: Record<string, unknown>) => [p.id as string, p]));

  const partnerIdsFromPc = [...new Set(pcRows.map((r) => (r.seller_id === userId ? r.buyer_id : r.seller_id)))];
  const crPartnerIds = [
    ...new Set(crTradeRows.flatMap((r) => [r.seller_id, r.buyer_id]).filter((id) => id !== userId)),
  ];
  const genPartnerIds = genRows
    .map((r) => {
      const ini = r.initiator_id;
      const peer = r.peer_id;
      if (userId === ini) return peer;
      if (userId === peer) return ini;
      return peer ?? ini;
    })
    .filter((id): id is string => !!id);
  const partnerIdsSo =
    soRoomRows.length > 0
      ? [
          ...new Set(
            soRoomRows.flatMap((r) => [r.seller_id, r.buyer_id]).filter((id) => id && id !== userId) as string[]
          ),
        ]
      : [];

  const authorIdsFromPosts = [...new Set(
    (posts ?? [])
      .map((p: Record<string, unknown>) => postAuthorUserId(p))
      .filter((id): id is string => !!id)
  )];
  const nicknameByUserId = await fetchNicknamesForUserIds(sbAny, [
    ...new Set([...partnerIdsFromPc, ...crPartnerIds, ...genPartnerIds, ...partnerIdsSo, ...authorIdsFromPosts]),
  ]);

  const meetingIds = [
    ...new Set(
      genRows
        .filter((row) => row.room_type === "group_meeting")
        .map((row) => row.related_group_id)
        .filter((id): id is string => !!id)
    ),
  ];
  const { data: meetingRows } = meetingIds.length
    ? await sbAny
        .from("meetings")
        .select("id, title, host_user_id")
        .in("id", meetingIds)
    : { data: [] as { id: string; title?: string | null; host_user_id?: string | null }[] };
  const { data: meetingMemberRows } = meetingIds.length
    ? await sbAny
        .from("meeting_members")
        .select("meeting_id, user_id, status")
        .in("meeting_id", meetingIds)
        .eq("status", "joined")
    : { data: [] as { meeting_id: string; user_id: string; status: string }[] };
  const meetingMetaById = new Map(
    (meetingRows ?? []).map((row) => [
      row.id,
      {
        title: row.title ?? null,
        hostUserId: row.host_user_id ?? null,
      },
    ])
  );
  const meetingMemberCountById = new Map<string, number>();
  for (const row of (meetingMemberRows ?? []) as { meeting_id?: string | null }[]) {
    const meetingId = String(row.meeting_id ?? "").trim();
    if (!meetingId) continue;
    meetingMemberCountById.set(meetingId, (meetingMemberCountById.get(meetingId) ?? 0) + 1);
  }

  const openChatLinkedRoomIds = [
    ...new Set(
      genRows
        .map((row) => String(row.id ?? "").trim())
        .filter(Boolean)
    ),
  ];
  const { data: openChatRoomRows } = openChatLinkedRoomIds.length
    ? await sbAny
        .from("open_chat_rooms")
        .select("id, title, owner_user_id, linked_chat_room_id, joined_count, status")
        .in("linked_chat_room_id", openChatLinkedRoomIds)
    : { data: [] as { id: string; title?: string | null; owner_user_id?: string | null; linked_chat_room_id: string; joined_count?: number | null; status?: string | null }[] };
  const openChatByLinkedRoomId = new Map(
    (openChatRoomRows ?? []).map((row) => [
      row.linked_chat_room_id,
      {
        id: row.id,
        title: row.title ?? null,
        ownerUserId: row.owner_user_id ?? null,
        joinedCount: Number(row.joined_count ?? 0),
        status: row.status ?? "active",
      },
    ])
  );

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

  const listFromGeneralChatRooms: ChatRoomListRow[] = genRows.map((r) => {
    const ini = r.initiator_id;
    const peer = r.peer_id ?? "";
    const partnerId = userId === ini ? peer : ini;
    const part = partByRoomEarly.get(r.id) as { unread_count?: number } | undefined;
    const unreadCount = part?.unread_count ?? 0;
    const kind = generalChatKindFromRoomRow(r.room_type, r.context_type);
    const postIdForCard = r.related_post_id ?? "";
    const postRow = postIdForCard ? postMap.get(postIdForCard) : undefined;
    const titleFallback =
      kind === "group"
        ? "모임 채팅"
        : kind === "business"
          ? "비즈 채팅"
          : kind === "community"
            ? "커뮤니티 문의"
            : "일반 채팅";

    const openChatMeta = openChatByLinkedRoomId.get(r.id);
    if (openChatMeta) {
      const openChatTitle = String(openChatMeta.title ?? "").trim() || "오픈채팅";
      return buildPhilifeListRoom({
        id: r.id,
        roomKind: "open_chat",
        title: openChatTitle,
        subtitle:
          openChatMeta.status === "active"
            ? `오픈채팅 인원 ${openChatMeta.joinedCount}명`
            : "읽기 전용 오픈채팅",
        lastMessage: r.last_message_preview ?? "",
        lastMessageAt: r.last_message_at ?? r.created_at,
        unreadCount,
        relatedPostId: null,
        relatedCommentId: null,
        relatedGroupId: openChatMeta.id,
        contextType: "open_chat",
        postRow: null,
        memberCount: openChatMeta.joinedCount,
        joined: true,
        canSend: openChatMeta.status === "active",
        hostUserId: openChatMeta.ownerUserId ?? ini,
        partnerIdFallback: partnerId,
      });
    }

    if (r.room_type === "group_meeting") {
      const meetingId = String(r.related_group_id ?? "").trim();
      const meetingMeta = meetingMetaById.get(meetingId);
      const meetingTitle =
        (postRow && typeof (postRow as Record<string, unknown>).title === "string"
          ? String((postRow as Record<string, unknown>).title)
          : "") ||
        String(meetingMeta?.title ?? "").trim() ||
        titleFallback;
      return buildPhilifeListRoom({
        id: r.id,
        roomKind: "meeting",
        title: meetingTitle,
        subtitle: `참여 멤버 ${meetingMemberCountById.get(meetingId) ?? 0}명`,
        lastMessage: r.last_message_preview ?? "",
        lastMessageAt: r.last_message_at ?? r.created_at,
        unreadCount,
        relatedPostId: r.related_post_id,
        relatedCommentId: r.related_comment_id,
        relatedGroupId: meetingId || null,
        contextType: "meeting",
        postRow: postRow ? enrichPostWithAuthorNickname(postRow as Record<string, unknown>, nicknameByUserId) : null,
        memberCount: meetingMemberCountById.get(meetingId) ?? 0,
        joined: true,
        canSend: true,
        hostUserId: meetingMeta?.hostUserId ?? ini,
        partnerIdFallback: partnerId,
      });
    }

    const title = nicknameByUserId.get(partnerId)?.trim() || partnerId.slice(0, 8) || titleFallback;
    const subtitle =
      kind === "business"
        ? "비즈 문의 채팅"
        : kind === "community"
          ? "커뮤니티 1:1 채팅"
          : "일반 채팅";
    return buildPhilifeListRoom({
      id: r.id,
      roomKind: "direct",
      title,
      subtitle,
      lastMessage: r.last_message_preview ?? "",
      lastMessageAt: r.last_message_at ?? r.created_at,
      unreadCount,
      relatedPostId: r.related_post_id,
      relatedCommentId: r.related_comment_id,
      relatedGroupId: r.related_group_id,
      contextType: r.context_type,
      postRow: postRow ? enrichPostWithAuthorNickname(postRow as Record<string, unknown>, nicknameByUserId) : null,
      joined: true,
      canSend: true,
      hostUserId: ini,
      partnerIdFallback: partnerId,
    });
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
        chatDomain: "store" as const,
        roomTitle: title,
        roomSubtitle: statusLabel ? `주문 상태 · ${statusLabel}` : "배달채팅",
      };
    });
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
  let filteredRooms = filterRoomsByListSegment(merged, segment);
  if (
    process.env.NODE_ENV !== "production" &&
    (segment === "philife" || segment === "philife_inbox")
  ) {
    const sampleRooms = getDevSampleCommunityRooms(userId);
    const byId = new Map(filteredRooms.map((room) => [room.id, room]));
    for (const room of sampleRooms) {
      byId.set(room.id, room);
    }
    filteredRooms = [...byId.values()].sort(
      (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    );
    filteredRooms = filterRoomsByListSegment(filteredRooms, segment);
  }
  return NextResponse.json({ rooms: filteredRooms });
}
