/**
 * 채팅방 1건 조회 (서비스 롤)
 * GET /api/chat/room/[roomId] (세션)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chatProductSummaryFromPostRow } from "@/lib/chats/chat-product-from-post";
import {
  enrichPostWithAuthorNickname,
  fetchNicknamesForUserIds,
  postAuthorUserId,
} from "@/lib/chats/resolve-author-nickname";
import { normalizeSellerListingState } from "@/lib/products/seller-listing-state";
import { applyProductChatTimeTransitions } from "@/lib/trade/apply-product-chat-time-transitions";
import { applyBuyerAutoConfirmForRoom } from "@/lib/trade/apply-buyer-auto-confirm";
import { fetchBuyerReviewSubmitted } from "@/lib/mypage/buyer-review-flag";
import { generalChatKindFromRoomRow } from "@/lib/chat/general-room-mapping";
import {
  getNeighborhoodDevSampleChatRoom,
  getNeighborhoodDevSamplePost,
} from "@/lib/neighborhood/dev-sample-data";
import type { GeneralChatMeta } from "@/lib/types/chat";
import { reservedBuyerIdFromPost } from "@/lib/trade/reserved-item-chat";
import { fetchPostRowForChat } from "@/lib/chats/post-select-compat";
import {
  fetchItemTradeAdminSuspended,
  resolveAdminChatSuspension,
} from "@/lib/chat/chat-room-admin-suspend";
import { buildPhilifeDetailRoom } from "@/lib/chats/philife/room-mappers";
import {
  getPhilifeMeetingAccessState,
  resolvePhilifeMeetingAccessMeetingId,
} from "@/lib/chats/philife/room-access";
import type { ChatRoomActiveNotice } from "@/lib/types/chat";
import { BUYER_ORDER_STATUS_LABEL } from "@/lib/stores/store-order-process-criteria";
import { resolveProfileTrustScore } from "@/lib/trust/profile-trust-display";
import { ensureStoreOrderChatRoomAccessForUser } from "@/lib/chat/store-order-chat-db";

type PartnerDisplayFields = {
  partnerNickname: string;
  partnerAvatar: string;
  partnerTrustScore: number;
};

async function fetchPartnerDisplayFields(
  sbAny: SupabaseClient<any>,
  partnerId: string,
  nicknameFallback: string
): Promise<PartnerDisplayFields> {
  const fb = nicknameFallback.trim() || partnerId.slice(0, 8) || "?";
  if (!partnerId) {
    return {
      partnerNickname: fb,
      partnerAvatar: "",
      partnerTrustScore: resolveProfileTrustScore(null),
    };
  }
  const { data: profileRow } = await sbAny
    .from("profiles")
    .select("nickname, username, avatar_url, trust_score, manner_score, manner_temperature")
    .eq("id", partnerId)
    .maybeSingle();
  if (profileRow) {
    const p = profileRow as Record<string, unknown>;
    const nick = ((p.nickname ?? p.username ?? fb) as string).trim() || fb;
    const av = p.avatar_url;
    const avatar = typeof av === "string" && av.trim() ? av.trim() : "";
    return {
      partnerNickname: nick,
      partnerAvatar: avatar,
      partnerTrustScore: resolveProfileTrustScore(p),
    };
  }
  const { data: testRow } = await sbAny
    .from("test_users")
    .select("display_name, username")
    .eq("id", partnerId)
    .maybeSingle();
  if (testRow) {
    const t = testRow as Record<string, unknown>;
    const nick = ((t.display_name ?? t.username ?? fb) as string).trim() || fb;
    return {
      partnerNickname: nick,
      partnerAvatar: "",
      partnerTrustScore: resolveProfileTrustScore(null),
    };
  }
  return {
    partnerNickname: fb,
    partnerAvatar: "",
    partnerTrustScore: resolveProfileTrustScore(null),
  };
}

async function chatProductFromPostEnriched(
  sbAny: SupabaseClient<any>,
  post: Record<string, unknown> | null | undefined,
  postId: string
) {
  const aid = postAuthorUserId(post ?? undefined);
  const map = await fetchNicknamesForUserIds(sbAny, aid ? [aid] : []);
  return chatProductSummaryFromPostRow(enrichPostWithAuthorNickname(post ?? undefined, map), postId);
}

function tradeFieldsFromRows(
  productChatRow: Record<string, unknown> | null | undefined,
  post: Record<string, unknown> | null | undefined
) {
  const id = productChatRow?.id != null ? String(productChatRow.id) : "";
  return {
    productChatRoomId: id || null,
    tradeFlowStatus: (productChatRow?.trade_flow_status as string) ?? "chatting",
    chatMode: (productChatRow?.chat_mode as string) ?? "open",
    soldBuyerId: (post?.sold_buyer_id as string) ?? null,
    reservedBuyerId: reservedBuyerIdFromPost(post ?? undefined),
    buyerConfirmSource: (productChatRow?.buyer_confirm_source as string) ?? null,
  };
}

async function tradeFieldsAfterTimeTransitions(
  sbAny: SupabaseClient<any>,
  productChatId: string,
  basePcRow: Record<string, unknown>,
  post: Record<string, unknown> | null | undefined
) {
  await applyBuyerAutoConfirmForRoom(sbAny, productChatId);
  await applyProductChatTimeTransitions(sbAny, productChatId);
  const { data: fresh } = await sbAny
    .from("product_chats")
    .select("id, trade_flow_status, chat_mode, buyer_confirm_source")
    .eq("id", productChatId)
    .maybeSingle();
  const merged = { ...basePcRow, ...(fresh ?? {}) } as Record<string, unknown>;
  return tradeFieldsFromRows(merged, post);
}

export const dynamic = "force-dynamic";

function getDevSampleChatRoomPayload(roomId: string, userId: string) {
  const meetingRoom = getNeighborhoodDevSampleChatRoom(roomId, userId);
  if (meetingRoom) {
    return {
      ...meetingRoom,
      product: meetingRoom.product
        ? {
            ...meetingRoom.product,
            detailHref: `/philife/${meetingRoom.product.id}`,
          }
        : meetingRoom.product,
      tradeStatus: meetingRoom.tradeStatus ?? "inquiry",
      chatDomain: "philife" as const,
      roomTitle: meetingRoom.roomTitle ?? meetingRoom.partnerNickname,
      roomSubtitle: meetingRoom.roomSubtitle ?? "커뮤니티 모임 채팅",
    };
  }
  getNeighborhoodDevSamplePost("20000000-0000-4000-8000-000000000001");
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
  const inquiry = state?.inquiryRooms?.find(
    (room) => room.id === roomId && (room.initiator_id === userId || room.peer_id === userId)
  );
  if (inquiry) {
    const post = getNeighborhoodDevSamplePost(inquiry.post_id);
    const partnerId = inquiry.initiator_id === userId ? inquiry.peer_id : inquiry.initiator_id;
    const latest = state?.chatMessages?.get(roomId)?.at(-1);
    return {
      id: roomId,
      productId: inquiry.post_id,
      buyerId: inquiry.initiator_id,
      sellerId: inquiry.peer_id,
      partnerNickname: partnerId === post?.author_id ? post.author_name : partnerId.slice(0, 8),
      partnerAvatar: "",
      lastMessage: latest?.message ?? "게시글 문의 채팅이 시작되었습니다.",
      lastMessageAt: latest?.createdAt ?? inquiry.created_at,
      unreadCount: 0,
      tradeStatus: "inquiry",
      product: {
        id: inquiry.post_id,
        title: post?.title ?? "커뮤니티 문의",
        detailHref: `/philife/${inquiry.post_id}`,
        thumbnail: "",
        price: 0,
        status: "active",
        regionLabel: post?.location_label ?? "",
        updatedAt: latest?.createdAt ?? inquiry.created_at,
      },
      source: "chat_room",
      buyerReviewSubmitted: false,
      productChatRoomId: null,
      tradeFlowStatus: "chatting",
      chatMode: "open",
      soldBuyerId: null,
      reservedBuyerId: null,
      buyerConfirmSource: null,
      chatDomain: "philife" as const,
      roomTitle: post?.title ?? "커뮤니티 문의",
      roomSubtitle: "커뮤니티 1:1 채팅",
      generalChat: {
        kind: "community" as const,
        relatedPostId: inquiry.post_id,
        relatedCommentId: inquiry.related_comment_id,
        relatedGroupId: null,
        relatedBusinessId: null,
        contextType: inquiry.context_type,
      },
    };
  }
  return null;
}

type OpenChatActiveNoticeRow = {
  id: string;
  title: string;
  body: string;
  visibility: "members" | "public";
  created_at: string;
};

async function fetchOpenChatActiveNotice(
  sbAny: SupabaseClient<any>,
  openChatRoomId: string,
  allowMembersOnlyNotice: boolean
): Promise<ChatRoomActiveNotice | null> {
  let query = sbAny
    .from("open_chat_notices")
    .select("id, title, body, visibility, created_at")
    .eq("room_id", openChatRoomId)
    .eq("is_active", true)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  if (!allowMembersOnlyNotice) {
    query = query.eq("visibility", "public");
  }

  const { data } = await query.maybeSingle();
  const notice = data as OpenChatActiveNoticeRow | null;
  if (!notice) return null;

  return {
    id: notice.id,
    title: notice.title,
    body: notice.body,
    visibility: notice.visibility,
    createdAt: notice.created_at,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "서버 설정 필요" }, { status: 500 });
  }

  const { roomId } = await params;
  if (!roomId) {
    return NextResponse.json({ error: "roomId 필요" }, { status: 400 });
  }

  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;

  const { data: dbRoomProbeDetail } = await sbAny.from("chat_rooms").select("id").eq("id", roomId).maybeSingle();
  const hasDbChatRoomDetail = !!dbRoomProbeDetail?.id;

  if (!hasDbChatRoomDetail && process.env.NODE_ENV !== "production") {
    const sampleRoom = getDevSampleChatRoomPayload(roomId, userId);
    if (sampleRoom) {
      return NextResponse.json(sampleRoom, {
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
      });
    }
  }

  const { data: r, error } = await sbAny
    .from("product_chats")
    .select("*")
    .eq("id", roomId)
    .maybeSingle();

  if (!error && r && (r.seller_id === userId || r.buyer_id === userId)) {
    // 같은 대화에 chat_rooms(item_trade)가 있으면 그걸 반환 — 구매자도 tradeStatus 갱신 보이도록
    const { data: crSameRows } = await sbAny
      .from("chat_rooms")
      .select(
        "id, item_id, seller_id, buyer_id, last_message_at, last_message_preview, created_at, trade_status, updated_at, is_blocked, blocked_by, is_locked, initiator_id, peer_id"
      )
      .eq("room_type", "item_trade")
      .eq("item_id", r.post_id)
      .eq("seller_id", r.seller_id)
      .eq("buyer_id", r.buyer_id)
      .order("updated_at", { ascending: false })
      .limit(1);
    const crSame = crSameRows?.[0] ?? null;
    if (crSame) {
      const roomIdCr = (crSame as { id: string }).id;
      const crRow = crSame as { seller_id: string | null; buyer_id: string | null };
      const crIds = [crRow.seller_id, crRow.buyer_id].filter(Boolean) as string[];
      if (crIds.includes(userId)) {
        const { data: partRow } = await sbAny
          .from("chat_room_participants")
          .select("unread_count")
          .eq("room_id", roomIdCr)
          .eq("user_id", userId)
          .maybeSingle();
        const unreadCount = (partRow as { unread_count?: number } | null)?.unread_count ?? 0;
        const itemId = (crSame as { item_id: string | null }).item_id ?? "";
        const post2 = await fetchPostRowForChat(sbAny, itemId);
        const amISeller2 = crRow.seller_id === userId;
        const partnerId2 = amISeller2 ? crRow.buyer_id : crRow.seller_id;
        const partnerDisp2 = await fetchPartnerDisplayFields(
          sbAny,
          partnerId2 ?? "",
          (partnerId2 ?? "").slice(0, 8)
        );
        const partnerNickname2 = partnerDisp2.partnerNickname;
        const listing = normalizeSellerListingState(post2?.seller_listing_state, post2?.status as string);
        const rowPc = r as Record<string, unknown>;
        const tradeExtras = await tradeFieldsAfterTimeTransitions(
          sbAny,
          r.id as string,
          rowPc,
          post2 ?? undefined
        );
        const buyerReviewSubmitted = await fetchBuyerReviewSubmitted(
          sbAny,
          (tradeExtras.productChatRoomId as string | null) ?? (r.id as string),
          userId,
          r.buyer_id as string
        );
        const adminChatSuspended = resolveAdminChatSuspension(
          crSame as Parameters<typeof resolveAdminChatSuspension>[0]
        ).suspended;
        return NextResponse.json(
          {
            id: roomIdCr,
            productId: itemId,
            buyerId: crRow.buyer_id ?? "",
            sellerId: crRow.seller_id ?? "",
            partnerNickname: partnerNickname2.trim() || (partnerId2 ?? "").slice(0, 8),
            partnerAvatar: partnerDisp2.partnerAvatar,
            partnerTrustScore: partnerDisp2.partnerTrustScore,
            lastMessage: (crSame as { last_message_preview: string | null }).last_message_preview ?? "",
            lastMessageAt: (crSame as { last_message_at: string | null }).last_message_at ?? (crSame as { created_at: string }).created_at,
            unreadCount,
            tradeStatus: listing,
            product: await chatProductFromPostEnriched(sbAny, post2 ?? undefined, itemId),
            source: "chat_room",
            chatDomain: "trade",
            roomTitle: partnerNickname2.trim() || (partnerId2 ?? "").slice(0, 8),
            roomSubtitle: amISeller2 ? "상대방 · 구매자" : "상대방 · 판매자",
            buyerReviewSubmitted,
            adminChatSuspended,
            ...tradeExtras,
          },
          { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
        );
      }
    }

    const post = await fetchPostRowForChat(sbAny, r.post_id as string);
    const amISeller = r.seller_id === userId;
    const row = r as Record<string, unknown>;
    const unreadCount = amISeller ? (row.unread_count_seller ?? 0) : (row.unread_count_buyer ?? 0);
    const partnerId = amISeller ? r.buyer_id : r.seller_id;
    const partnerDispPc = await fetchPartnerDisplayFields(sbAny, partnerId, partnerId.slice(0, 8));
    const partnerNickname = partnerDispPc.partnerNickname;
    // crSame(판매자 ID 정확 일치)가 없어도 posts.user_id와 맞는 chat_rooms가 있으면 거래 상태 동기화
    const postSellerCandidates = new Set(
      [
        r.seller_id,
        typeof post?.user_id === "string" ? (post.user_id as string) : "",
      ].filter((x) => typeof x === "string" && x.length > 0)
    );
    let linkedChatRoomId: string | undefined;
    const { data: crRowsLegacy } = await sbAny
      .from("chat_rooms")
      .select("id, seller_id, buyer_id, updated_at")
      .eq("room_type", "item_trade")
      .eq("item_id", r.post_id)
      .eq("buyer_id", r.buyer_id)
      .order("updated_at", { ascending: false });
    const crLinked =
      (crRowsLegacy ?? []).find((row: { seller_id: string }) => postSellerCandidates.has(row.seller_id)) ?? null;
    if (crLinked) {
      linkedChatRoomId = (crLinked as { id: string }).id;
    }
    const listing = normalizeSellerListingState(post?.seller_listing_state, post?.status as string);
    const tradeExtrasPc = await tradeFieldsAfterTimeTransitions(
      sbAny,
      r.id as string,
      row,
      post ?? undefined
    );
    const buyerReviewSubmittedPc = await fetchBuyerReviewSubmitted(
      sbAny,
      (tradeExtrasPc.productChatRoomId as string | null) ?? (r.id as string),
      userId,
      r.buyer_id as string
    );
    const adminChatSuspendedPc = await fetchItemTradeAdminSuspended(
      sbAny,
      String(r.post_id),
      String(r.seller_id),
      String(r.buyer_id)
    );
    return NextResponse.json({
      id: r.id,
      productId: r.post_id,
      buyerId: r.buyer_id,
      sellerId: r.seller_id,
      partnerNickname: partnerNickname.trim() || partnerId.slice(0, 8),
      partnerAvatar: partnerDispPc.partnerAvatar,
      partnerTrustScore: partnerDispPc.partnerTrustScore,
      lastMessage: (row.last_message_preview as string) ?? "",
      lastMessageAt: (row.last_message_at as string) ?? r.created_at,
      unreadCount: Number(unreadCount),
      product: await chatProductFromPostEnriched(sbAny, post ?? undefined, r.post_id),
      source: "product_chat",
      chatDomain: "trade",
      roomTitle: partnerNickname.trim() || partnerId.slice(0, 8),
      roomSubtitle: amISeller ? "상대방 · 구매자" : "상대방 · 판매자",
      tradeStatus: listing,
      buyerReviewSubmitted: buyerReviewSubmittedPc,
      adminChatSuspended: adminChatSuspendedPc,
      ...(linkedChatRoomId ? { chatRoomId: linkedChatRoomId } : {}),
      ...tradeExtrasPc,
    });
  }

  // 당근형: chat_rooms (item_trade | 일반 community/group/business/general_chat)
  const { data: cr, error: crErr } = await sbAny
    .from("chat_rooms")
    .select(
      "id, room_type, item_id, seller_id, buyer_id, initiator_id, peer_id, meeting_id, last_message_at, last_message_preview, created_at, trade_status, related_post_id, related_comment_id, related_group_id, related_business_id, context_type, store_order_id, is_blocked, blocked_by, is_locked"
    )
    .eq("id", roomId)
    .maybeSingle();
  if (crErr || !cr) {
    return NextResponse.json({ error: "채팅방을 찾을 수 없습니다." }, { status: 404 });
  }

  const crAny = cr as {
    id: string;
    room_type: string;
    item_id: string | null;
    seller_id: string | null;
    buyer_id: string | null;
    initiator_id: string | null;
    peer_id: string | null;
    last_message_preview: string | null;
    last_message_at: string | null;
    created_at: string;
    trade_status?: string;
    related_post_id?: string | null;
    related_comment_id?: string | null;
    related_group_id?: string | null;
    related_business_id?: string | null;
    meeting_id?: string | null;
    context_type?: string | null;
    is_blocked?: boolean | null;
    blocked_by?: string | null;
    is_locked?: boolean | null;
  };

  const roomType = crAny.room_type ?? "";

  const { data: openChatMeta } = await sbAny
    .from("open_chat_rooms")
    .select("id, title, description, owner_user_id, status, joined_count, linked_chat_room_id")
    .eq("linked_chat_room_id", roomId)
    .maybeSingle();
  const openChat = openChatMeta as {
    id?: string;
    title?: string | null;
    description?: string | null;
    owner_user_id?: string | null;
    status?: string | null;
    joined_count?: number | null;
    linked_chat_room_id?: string | null;
  } | null;

  if (openChat?.id) {
    const { data: partRowOpenChat } = await sbAny
      .from("chat_room_participants")
      .select("unread_count, hidden, left_at, is_active")
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .maybeSingle();
    const participant = partRowOpenChat as {
      unread_count?: number;
      hidden?: boolean;
      left_at?: string | null;
      is_active?: boolean | null;
    } | null;
    if (!participant || participant.hidden || participant.left_at || participant.is_active === false) {
      return NextResponse.json({ error: "참여자가 아닙니다." }, { status: 403 });
    }

    const { data: memberRowOpenChat } = await sbAny
      .from("open_chat_members")
      .select("id, nickname, role, status")
      .eq("room_id", String(openChat.id))
      .eq("user_id", userId)
      .maybeSingle();
    const member = memberRowOpenChat as {
      id?: string;
      nickname?: string | null;
      role?: string | null;
      status?: string | null;
    } | null;
    if (!member?.id || member.status !== "joined") {
      return NextResponse.json({ error: "참여자가 아닙니다." }, { status: 403 });
    }

    const canSend = String(openChat.status ?? "active") === "active";
    const canManage = member.role === "owner" || member.role === "moderator";
    const activeNotice = await fetchOpenChatActiveNotice(
      sbAny,
      String(openChat.id),
      true
    );
    return NextResponse.json(
      {
        ...buildPhilifeDetailRoom({
          id: crAny.id,
          roomKind: "open_chat",
          title: String(openChat.title ?? "오픈채팅"),
          subtitle: canSend
            ? `오픈채팅 멤버 ${Number(openChat.joined_count ?? 0)}명`
            : "읽기 전용 오픈채팅",
          lastMessage: crAny.last_message_preview ?? "",
          lastMessageAt: crAny.last_message_at ?? crAny.created_at,
          unreadCount: participant.unread_count ?? 0,
          relatedPostId: null,
          relatedCommentId: null,
          relatedGroupId: String(openChat.id),
          contextType: "open_chat",
          postRow: null,
          memberCount: Number(openChat.joined_count ?? 0),
          joined: true,
          canSend,
          canManage,
          hostUserId: String(openChat.owner_user_id ?? ""),
          partnerIdFallback: String(openChat.owner_user_id ?? ""),
          buyerId: userId,
          sellerId: String(openChat.owner_user_id ?? ""),
        }),
        activeNotice,
      },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  }

  if (roomType === "store_order") {
    const crSo = cr as {
      id: string;
      seller_id: string | null;
      buyer_id: string | null;
      store_order_id: string | null;
      last_message_preview: string | null;
      last_message_at: string | null;
      created_at: string;
    };
    const accessSo = await ensureStoreOrderChatRoomAccessForUser(sbAny, roomId, userId);
    if (!accessSo.ok) {
      return NextResponse.json({ error: "참여자가 아닙니다." }, { status: 403 });
    }
    const sRow = accessSo.sellerId;
    const bRow = accessSo.buyerId;
    const prSo = { unread_count: accessSo.unreadCount };
    const amISellerSo = sRow === userId;
    const partnerIdSo = amISellerSo ? bRow : sRow;
    const partnerDispSo = await fetchPartnerDisplayFields(sbAny, partnerIdSo, partnerIdSo.slice(0, 8));
    const partnerNickSo = partnerDispSo.partnerNickname;
    const oid = crSo.store_order_id ?? "";
    let titleSo = "배달 주문";
    let storeIdForRoom: string | null = null;
    if (oid) {
      const { data: ordRow } = await sbAny
        .from("store_orders")
        .select("order_no, store_id, order_status")
        .eq("id", oid)
        .maybeSingle();
      if (ordRow) {
        storeIdForRoom = (ordRow as { store_id: string }).store_id;
        const { data: stRow } = await sbAny
          .from("stores")
          .select("store_name")
          .eq("id", (ordRow as { store_id: string }).store_id)
          .maybeSingle();
        const sn = (stRow as { store_name?: string } | null)?.store_name ?? "";
        titleSo = sn
          ? `${sn} · 주문 ${(ordRow as { order_no: string }).order_no}`
          : `주문 ${(ordRow as { order_no: string }).order_no}`;
      }
      const statusLabel =
        ordRow && typeof (ordRow as { order_status?: string }).order_status === "string"
          ? BUYER_ORDER_STATUS_LABEL[(ordRow as { order_status: string }).order_status] ??
            (ordRow as { order_status: string }).order_status
          : "";
      return NextResponse.json(
        {
          id: crSo.id,
          productId: oid || crSo.id,
          buyerId: bRow,
          sellerId: sRow,
          partnerNickname: partnerNickSo.trim() || partnerIdSo.slice(0, 8),
          partnerAvatar: partnerDispSo.partnerAvatar,
          partnerTrustScore: partnerDispSo.partnerTrustScore,
          lastMessage: crSo.last_message_preview ?? "",
          lastMessageAt: crSo.last_message_at ?? crSo.created_at,
          unreadCount: prSo.unread_count ?? 0,
          tradeStatus: "inquiry",
          product: await chatProductFromPostEnriched(
            sbAny,
            { title: titleSo, status: "active" } as Record<string, unknown>,
            oid || crSo.id
          ),
          source: "chat_room",
          chatDomain: "store",
          roomTitle: titleSo,
          roomSubtitle: statusLabel ? `주문 상태 · ${statusLabel}` : "배달채팅",
          buyerReviewSubmitted: false,
          productChatRoomId: null,
          tradeFlowStatus: "chatting",
          chatMode: "open",
          soldBuyerId: null,
          reservedBuyerId: null,
          buyerConfirmSource: null,
          generalChat: {
            kind: "store_order",
            storeOrderId: oid || null,
            storeId: storeIdForRoom,
            relatedPostId: null,
            relatedCommentId: null,
            relatedGroupId: null,
            relatedBusinessId: null,
            contextType: null,
          } satisfies GeneralChatMeta,
        },
        { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
      );
    }
    return NextResponse.json(
      {
        id: crSo.id,
        productId: oid || crSo.id,
        buyerId: bRow,
        sellerId: sRow,
        partnerNickname: partnerNickSo.trim() || partnerIdSo.slice(0, 8),
        partnerAvatar: partnerDispSo.partnerAvatar,
        partnerTrustScore: partnerDispSo.partnerTrustScore,
        lastMessage: crSo.last_message_preview ?? "",
        lastMessageAt: crSo.last_message_at ?? crSo.created_at,
        unreadCount: prSo.unread_count ?? 0,
        tradeStatus: "inquiry",
        product: await chatProductFromPostEnriched(
          sbAny,
          { title: titleSo, status: "active" } as Record<string, unknown>,
          oid || crSo.id
        ),
        source: "chat_room",
        chatDomain: "store",
        roomTitle: titleSo,
        roomSubtitle: "배달채팅",
        buyerReviewSubmitted: false,
        productChatRoomId: null,
        tradeFlowStatus: "chatting",
        chatMode: "open",
        soldBuyerId: null,
        reservedBuyerId: null,
        buyerConfirmSource: null,
        generalChat: {
          kind: "store_order",
          storeOrderId: oid || null,
          storeId: storeIdForRoom,
          relatedPostId: null,
          relatedCommentId: null,
          relatedGroupId: null,
          relatedBusinessId: null,
          contextType: null,
        } satisfies GeneralChatMeta,
      },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  }

  /** 커뮤니티 모임 전용 — `group_meeting` 이 아니어도 meetings.chat_room_id 연결이면 동일 검증 */
  const philifeMeetingId = await resolvePhilifeMeetingAccessMeetingId(sbAny, roomId, crAny);
  if (philifeMeetingId) {
    const access = await getPhilifeMeetingAccessState(sbAny, roomId, userId, {
      meeting_id: philifeMeetingId,
      related_group_id: philifeMeetingId,
    });
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.statusCode });
    }

    const ini = crAny.initiator_id ?? "";
    const peer = crAny.peer_id ?? "";
    const partnerId2 = userId === ini ? peer : ini;
    const postIdG = crAny.related_post_id ?? "";
    const postG = postIdG ? await fetchPostRowForChat(sbAny, postIdG) : null;
    const enrichedPost = postG ? enrichPostWithAuthorNickname(postG, await fetchNicknamesForUserIds(sbAny, [postAuthorUserId(postG) ?? ""].filter(Boolean))) : null;
    const roomTitle =
      (postG && typeof postG.title === "string" ? String(postG.title).trim() : "") ||
      access.title ||
      "모임 채팅";
    return NextResponse.json(
      buildPhilifeDetailRoom({
        id: crAny.id,
        roomKind: "meeting",
        title: roomTitle,
        subtitle: access.canSend ? `참여 멤버 ${access.memberCount}명` : "종료된 모임 채팅",
        lastMessage: crAny.last_message_preview ?? "",
        lastMessageAt: crAny.last_message_at ?? crAny.created_at,
        unreadCount: access.unreadCount,
        relatedPostId: crAny.related_post_id ?? null,
        relatedCommentId: crAny.related_comment_id ?? null,
        relatedGroupId: access.meetingId,
        contextType: "meeting",
        postRow: enrichedPost,
        memberCount: access.memberCount,
        joined: access.joined,
        canSend: access.canSend,
        hostUserId: ini,
        partnerIdFallback: partnerId2,
        buyerId: peer || ini,
        sellerId: ini,
      }),
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  }

  const isGeneralChatRoom =
    roomType === "general_chat" || roomType === "community" || roomType === "group" || roomType === "business";

  if (isGeneralChatRoom) {
    const { data: partRowG } = await sbAny
      .from("chat_room_participants")
      .select("unread_count, hidden, left_at, is_active")
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .maybeSingle();
    const pr = partRowG as {
      unread_count?: number;
      hidden?: boolean;
      left_at?: string | null;
      is_active?: boolean | null;
    } | null;
    if (!pr || pr.hidden || pr.left_at || pr.is_active === false) {
      return NextResponse.json({ error: "참여자가 아닙니다." }, { status: 403 });
    }
    const unreadCount = pr.unread_count ?? 0;
    const ini = crAny.initiator_id ?? "";
    const peer = crAny.peer_id ?? "";
    const partnerId2 = userId === ini ? peer : ini;
    let partnerNickname2 = partnerId2.slice(0, 8);
    if (partnerId2) {
      const { data: profileRow2 } = await sbAny.from("profiles").select("nickname, username").eq("id", partnerId2).maybeSingle();
      if (profileRow2) {
        const p = profileRow2 as Record<string, unknown>;
        partnerNickname2 = (p.nickname ?? p.username ?? partnerNickname2) as string;
      } else {
        const { data: testRow2 } = await sbAny.from("test_users").select("display_name, username").eq("id", partnerId2).maybeSingle();
        if (testRow2) {
          const t = testRow2 as Record<string, unknown>;
          partnerNickname2 = (t.display_name ?? t.username ?? partnerNickname2) as string;
        }
      }
    }
    const postIdG = crAny.related_post_id ?? "";
    const postG = postIdG ? await fetchPostRowForChat(sbAny, postIdG) : null;
    const kind = generalChatKindFromRoomRow(roomType, crAny.context_type ?? null);
    const titleFallback =
      kind === "business"
        ? "비즈 채팅"
        : kind === "community"
          ? "커뮤니티 문의"
          : "일반 채팅";
    const enrichedPost = postG ? enrichPostWithAuthorNickname(postG, await fetchNicknamesForUserIds(sbAny, [postAuthorUserId(postG) ?? ""].filter(Boolean))) : null;
    return NextResponse.json(
      buildPhilifeDetailRoom({
        id: crAny.id,
        roomKind: "direct",
        title: partnerNickname2.trim() || partnerId2.slice(0, 8) || titleFallback,
        subtitle:
          kind === "business"
            ? "비즈 문의 채팅"
            : kind === "community"
              ? "커뮤니티 1:1 채팅"
              : "일반 채팅",
        lastMessage: crAny.last_message_preview ?? "",
        lastMessageAt: crAny.last_message_at ?? crAny.created_at,
        unreadCount,
        relatedPostId: crAny.related_post_id ?? null,
        relatedCommentId: crAny.related_comment_id ?? null,
        relatedGroupId: crAny.related_group_id ?? null,
        contextType: crAny.context_type ?? null,
        postRow: enrichedPost,
        joined: true,
        canSend: true,
        hostUserId: ini,
        partnerIdFallback: partnerId2,
        buyerId: peer || ini,
        sellerId: ini,
      }),
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  }

  // item_trade
  const crRow = cr as { seller_id: string | null; buyer_id: string | null };
  const crIds = [crRow.seller_id, crRow.buyer_id].filter(Boolean) as string[];
  if (!crIds.includes(userId)) {
    return NextResponse.json({ error: "참여자가 아닙니다." }, { status: 403 });
  }
  const { data: partRow } = await sbAny
    .from("chat_room_participants")
    .select("unread_count")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  const unreadCount = (partRow as { unread_count?: number } | null)?.unread_count ?? 0;
  const itemId = (cr as { item_id: string | null }).item_id ?? "";
  const post2 = await fetchPostRowForChat(sbAny, itemId);
  const amISeller2 = crRow.seller_id === userId;
  const partnerId2 = amISeller2 ? crRow.buyer_id : crRow.seller_id;
  const partnerDispTrade = await fetchPartnerDisplayFields(
    sbAny,
    partnerId2 ?? "",
    (partnerId2 ?? "").slice(0, 8)
  );
  const partnerNickname2 = partnerDispTrade.partnerNickname;
  const listing = normalizeSellerListingState(post2?.seller_listing_state, post2?.status as string);
  const { data: pcFallback } = await sbAny
    .from("product_chats")
    .select("*")
    .eq("post_id", itemId)
    .eq("seller_id", crRow.seller_id ?? "")
    .eq("buyer_id", crRow.buyer_id ?? "")
    .maybeSingle();
  const pcFb = pcFallback as Record<string, unknown> | null;
  const tradeExtrasFb =
    pcFb?.id != null
      ? await tradeFieldsAfterTimeTransitions(sbAny, String(pcFb.id), pcFb, post2 ?? undefined)
      : tradeFieldsFromRows(pcFb, post2);
  const pcIdForReview = (tradeExtrasFb.productChatRoomId as string | null) ?? (pcFb?.id != null ? String(pcFb.id) : null);
  const buyerReviewSubmittedFb = await fetchBuyerReviewSubmitted(
    sbAny,
    pcIdForReview,
    userId,
    (crRow.buyer_id ?? "") as string
  );
  const adminChatSuspendedTrade = resolveAdminChatSuspension({
    is_blocked: crAny.is_blocked,
    is_locked: crAny.is_locked,
    blocked_by: crAny.blocked_by,
    seller_id: crRow.seller_id,
    buyer_id: crRow.buyer_id,
    initiator_id: crAny.initiator_id,
    peer_id: crAny.peer_id,
  }).suspended;
  return NextResponse.json(
    {
      id: cr.id,
      productId: itemId,
      buyerId: crRow.buyer_id ?? "",
      sellerId: crRow.seller_id ?? "",
      partnerNickname: partnerNickname2.trim() || (partnerId2 ?? "").slice(0, 8),
      partnerAvatar: partnerDispTrade.partnerAvatar,
      partnerTrustScore: partnerDispTrade.partnerTrustScore,
      lastMessage: (cr as { last_message_preview: string | null }).last_message_preview ?? "",
      lastMessageAt: (cr as { last_message_at: string | null }).last_message_at ?? (cr as { created_at: string }).created_at,
      unreadCount,
      tradeStatus: listing,
      product: await chatProductFromPostEnriched(sbAny, post2 ?? undefined, itemId),
      source: "chat_room",
      chatDomain: "trade",
      roomTitle: partnerNickname2.trim() || (partnerId2 ?? "").slice(0, 8),
      roomSubtitle: amISeller2 ? "상대방 · 구매자" : "상대방 · 판매자",
      buyerReviewSubmitted: buyerReviewSubmittedFb,
      adminChatSuspended: adminChatSuspendedTrade,
      ...tradeExtrasFb,
    },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
  );
}
