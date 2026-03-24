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
import type { GeneralChatMeta } from "@/lib/types/chat";
import { reservedBuyerIdFromPost } from "@/lib/trade/reserved-item-chat";
import { fetchPostRowForChat } from "@/lib/chats/post-select-compat";
import {
  fetchItemTradeAdminSuspended,
  resolveAdminChatSuspension,
} from "@/lib/chat/chat-room-admin-suspend";

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
        let partnerNickname2 = (partnerId2 ?? "").slice(0, 8);
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
            partnerAvatar: "",
            lastMessage: (crSame as { last_message_preview: string | null }).last_message_preview ?? "",
            lastMessageAt: (crSame as { last_message_at: string | null }).last_message_at ?? (crSame as { created_at: string }).created_at,
            unreadCount,
            tradeStatus: listing,
            product: await chatProductFromPostEnriched(sbAny, post2 ?? undefined, itemId),
            source: "chat_room",
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
    let partnerNickname = partnerId.slice(0, 8);
    const { data: profileRow } = await sbAny.from("profiles").select("nickname, username").eq("id", partnerId).maybeSingle();
    if (profileRow) {
      const p = profileRow as Record<string, unknown>;
      partnerNickname = (p.nickname ?? p.username ?? partnerNickname) as string;
    } else {
      const { data: testRow } = await sbAny.from("test_users").select("display_name, username").eq("id", partnerId).maybeSingle();
      if (testRow) {
        const t = testRow as Record<string, unknown>;
        partnerNickname = (t.display_name ?? t.username ?? partnerNickname) as string;
      }
    }
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
      partnerAvatar: "",
      lastMessage: (row.last_message_preview as string) ?? "",
      lastMessageAt: (row.last_message_at as string) ?? r.created_at,
      unreadCount: Number(unreadCount),
      product: await chatProductFromPostEnriched(sbAny, post ?? undefined, r.post_id),
      source: "product_chat",
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
      "id, room_type, item_id, seller_id, buyer_id, initiator_id, peer_id, last_message_at, last_message_preview, created_at, trade_status, related_post_id, related_comment_id, related_group_id, related_business_id, context_type, store_order_id, is_blocked, blocked_by, is_locked"
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
    context_type?: string | null;
    is_blocked?: boolean | null;
    blocked_by?: string | null;
    is_locked?: boolean | null;
  };

  const roomType = crAny.room_type ?? "";

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
    const { data: partSo } = await sbAny
      .from("chat_room_participants")
      .select("unread_count, hidden, left_at")
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .maybeSingle();
    const prSo = partSo as { unread_count?: number; hidden?: boolean; left_at?: string | null } | null;
    if (!prSo || prSo.hidden || prSo.left_at) {
      return NextResponse.json({ error: "참여자가 아닙니다." }, { status: 403 });
    }
    const sRow = crSo.seller_id;
    const bRow = crSo.buyer_id;
    if (!sRow || !bRow || (userId !== sRow && userId !== bRow)) {
      return NextResponse.json({ error: "참여자가 아닙니다." }, { status: 403 });
    }
    const amISellerSo = sRow === userId;
    const partnerIdSo = amISellerSo ? bRow : sRow;
    let partnerNickSo = partnerIdSo.slice(0, 8);
    const { data: profileSo } = await sbAny
      .from("profiles")
      .select("nickname, username")
      .eq("id", partnerIdSo)
      .maybeSingle();
    if (profileSo) {
      const p = profileSo as Record<string, unknown>;
      partnerNickSo = (p.nickname ?? p.username ?? partnerNickSo) as string;
    } else {
      const { data: testSo } = await sbAny
        .from("test_users")
        .select("display_name, username")
        .eq("id", partnerIdSo)
        .maybeSingle();
      if (testSo) {
        const t = testSo as Record<string, unknown>;
        partnerNickSo = (t.display_name ?? t.username ?? partnerNickSo) as string;
      }
    }
    const oid = crSo.store_order_id ?? "";
    let titleSo = "매장 주문";
    let storeIdForRoom: string | null = null;
    if (oid) {
      const { data: ordRow } = await sbAny
        .from("store_orders")
        .select("order_no, store_id")
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
    }
    const generalChatSo: GeneralChatMeta = {
      kind: "store_order",
      storeOrderId: oid || null,
      storeId: storeIdForRoom,
      relatedPostId: null,
      relatedCommentId: null,
      relatedGroupId: null,
      relatedBusinessId: null,
      contextType: null,
    };
    return NextResponse.json(
      {
        id: crSo.id,
        productId: oid || crSo.id,
        buyerId: bRow,
        sellerId: sRow,
        partnerNickname: partnerNickSo.trim() || partnerIdSo.slice(0, 8),
        partnerAvatar: "",
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
        buyerReviewSubmitted: false,
        productChatRoomId: null,
        tradeFlowStatus: "chatting",
        chatMode: "open",
        soldBuyerId: null,
        reservedBuyerId: null,
        buyerConfirmSource: null,
        generalChat: generalChatSo,
      },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  }

  const isGeneralChatRoom =
    roomType === "general_chat" || roomType === "community" || roomType === "group" || roomType === "business";

  if (isGeneralChatRoom) {
    const { data: partRowG } = await sbAny
      .from("chat_room_participants")
      .select("unread_count, hidden, left_at")
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .maybeSingle();
    const pr = partRowG as { unread_count?: number; hidden?: boolean; left_at?: string | null } | null;
    if (!pr || pr.hidden || pr.left_at) {
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
      kind === "group"
        ? "모임 채팅"
        : kind === "business"
          ? "상점 문의"
          : kind === "community"
            ? "커뮤니티 문의"
            : "일반 채팅";
    const generalChat: GeneralChatMeta = {
      kind,
      relatedPostId: crAny.related_post_id ?? null,
      relatedCommentId: crAny.related_comment_id ?? null,
      relatedGroupId: crAny.related_group_id ?? null,
      relatedBusinessId: crAny.related_business_id ?? null,
      contextType: crAny.context_type ?? null,
    };
    const productPayload = postG
      ? await chatProductFromPostEnriched(sbAny, postG, postIdG)
      : await chatProductFromPostEnriched(
          sbAny,
          { title: titleFallback, status: "active" } as Record<string, unknown>,
          postIdG || roomId
        );
    return NextResponse.json(
      {
        id: crAny.id,
        productId: postIdG || crAny.id,
        buyerId: peer || ini,
        sellerId: ini,
        partnerNickname: partnerNickname2.trim() || partnerId2.slice(0, 8),
        partnerAvatar: "",
        lastMessage: crAny.last_message_preview ?? "",
        lastMessageAt: crAny.last_message_at ?? crAny.created_at,
        unreadCount,
        tradeStatus: "inquiry",
        product: productPayload,
        source: "chat_room",
        buyerReviewSubmitted: false,
        productChatRoomId: null,
        tradeFlowStatus: "chatting",
        chatMode: "open",
        soldBuyerId: null,
        reservedBuyerId: null,
        buyerConfirmSource: null,
        generalChat,
      },
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
  let partnerNickname2 = (partnerId2 ?? "").slice(0, 8);
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
      partnerAvatar: "",
      lastMessage: (cr as { last_message_preview: string | null }).last_message_preview ?? "",
      lastMessageAt: (cr as { last_message_at: string | null }).last_message_at ?? (cr as { created_at: string }).created_at,
      unreadCount,
      tradeStatus: listing,
      product: await chatProductFromPostEnriched(sbAny, post2 ?? undefined, itemId),
      source: "chat_room",
      buyerReviewSubmitted: buyerReviewSubmittedFb,
      adminChatSuspended: adminChatSuspendedTrade,
      ...tradeExtrasFb,
    },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
  );
}
