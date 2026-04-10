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
import type { GeneralChatMeta } from "@/lib/types/chat";
import { reservedBuyerIdFromPost } from "@/lib/trade/reserved-item-chat";
import {
  fetchPostRowForChat,
  fetchPostRowForChatFirstResolved,
} from "@/lib/chats/post-select-compat";
import {
  fetchItemTradeAdminSuspended,
  resolveAdminChatSuspension,
} from "@/lib/chat/chat-room-admin-suspend";
import { BUYER_ORDER_STATUS_LABEL } from "@/lib/stores/store-order-process-criteria";
import {
  fetchPartnerDisplayFieldsMap,
  nicknameMapFromPartnerDisplayMap,
  partnerDisplayFromMap,
} from "@/lib/chats/fetch-partner-display";
import { ensureStoreOrderChatRoomAccessForUser } from "@/lib/chat/store-order-chat-db";

type RoomDetailCacheEntry = { at: number; payload: unknown };
const ROOM_DETAIL_CACHE_TTL_MS = 2500;
const roomDetailCache = new Map<string, RoomDetailCacheEntry>();

async function chatProductFromPostEnriched(
  sbAny: SupabaseClient<any>,
  post: Record<string, unknown> | null | undefined,
  postId: string,
  preloadedNicknameByUserId?: Map<string, string>
) {
  const aid = postAuthorUserId(post ?? undefined);
  let map = preloadedNicknameByUserId;
  if (!map) {
    map = await fetchNicknamesForUserIds(sbAny, aid ? [aid] : []);
  } else if (aid && !map.has(aid)) {
    const extra = await fetchNicknamesForUserIds(sbAny, [aid]);
    map = new Map([...map, ...extra]);
  }
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

const tradeTransitionCooldownByProductChatId = new Map<string, number>();
const TRADE_TRANSITION_COOLDOWN_MS = 15000;

/**
 * GET 응답 지연을 줄이기 위해 시간 기반 전환·자동 확인은 백그라운드에서만 실행합니다.
 * 다음 요청·폴링·Realtime 에서 갱신된 trade_flow/chat_mode 를 반영합니다.
 */
function scheduleProductChatTransitionsIfCooldownAllows(
  sbAny: SupabaseClient<any>,
  productChatId: string
) {
  const now = Date.now();
  const lastAt = tradeTransitionCooldownByProductChatId.get(productChatId) ?? 0;
  if (now - lastAt < TRADE_TRANSITION_COOLDOWN_MS) return;
  tradeTransitionCooldownByProductChatId.set(productChatId, now);
  void (async () => {
    try {
      await applyBuyerAutoConfirmForRoom(sbAny, productChatId);
      await applyProductChatTimeTransitions(sbAny, productChatId);
    } catch {
      /* ignore */
    }
  })();
}

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const startedAt = Date.now();
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
  const cacheKey = `${userId}:${roomId}`;
  const cached = roomDetailCache.get(cacheKey);
  if (cached && Date.now() - cached.at < ROOM_DETAIL_CACHE_TTL_MS) {
    return NextResponse.json(cached.payload, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Chat-Room-Cache": "HIT",
      },
    });
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
        "id, item_id, related_post_id, seller_id, buyer_id, last_message_at, last_message_preview, created_at, trade_status, updated_at, is_blocked, blocked_by, is_locked, initiator_id, peer_id"
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
        const itemIdRaw = String((crSame as { item_id: string | null }).item_id ?? "").trim();
        const relatedSame = String((crSame as { related_post_id?: string | null }).related_post_id ?? "").trim();
        const postIdForCard = itemIdRaw || relatedSame || String(r.post_id ?? "").trim();
        const amISeller2 = crRow.seller_id === userId;
        const partnerId2 = amISeller2 ? crRow.buyer_id : crRow.seller_id;
        const [{ data: partRow }, post2] = await Promise.all([
          sbAny
            .from("chat_room_participants")
            .select("unread_count")
            .eq("room_id", roomIdCr)
            .eq("user_id", userId)
            .maybeSingle(),
          fetchPostRowForChatFirstResolved(sbAny, [itemIdRaw, relatedSame, String(r.post_id ?? "").trim()]),
        ]);
        const unreadCount = (partRow as { unread_count?: number } | null)?.unread_count ?? 0;
        const batchIdsCr = [
          ...new Set([partnerId2, postAuthorUserId(post2 ?? undefined) ?? ""].filter(Boolean)),
        ] as string[];
        const partnerMapCr = await fetchPartnerDisplayFieldsMap(sbAny, batchIdsCr);
        const partnerDisp2 = partnerDisplayFromMap(
          partnerMapCr,
          partnerId2 ?? "",
          (partnerId2 ?? "").slice(0, 8)
        );
        const partnerNickname2 = partnerDisp2.partnerNickname;
        const listing = normalizeSellerListingState(post2?.seller_listing_state, post2?.status as string);
        const rowPc = r as Record<string, unknown>;
        scheduleProductChatTransitionsIfCooldownAllows(sbAny, r.id as string);
        const tradeExtras = tradeFieldsFromRows(rowPc, post2 ?? undefined);
        const buyerReviewSubmitted = await fetchBuyerReviewSubmitted(
          sbAny,
          (tradeExtras.productChatRoomId as string | null) ?? (r.id as string),
          userId,
          r.buyer_id as string
        );
        const adminChatSuspended = resolveAdminChatSuspension(
          crSame as Parameters<typeof resolveAdminChatSuspension>[0]
        ).suspended;
        const payload = {
            id: roomIdCr,
            productId: postIdForCard,
            buyerId: crRow.buyer_id ?? "",
            sellerId: crRow.seller_id ?? "",
            partnerNickname: partnerNickname2.trim() || (partnerId2 ?? "").slice(0, 8),
            partnerAvatar: partnerDisp2.partnerAvatar,
            partnerTrustScore: partnerDisp2.partnerTrustScore,
            lastMessage: (crSame as { last_message_preview: string | null }).last_message_preview ?? "",
            lastMessageAt: (crSame as { last_message_at: string | null }).last_message_at ?? (crSame as { created_at: string }).created_at,
            unreadCount,
            tradeStatus: listing,
            product: chatProductSummaryFromPostRow(
              enrichPostWithAuthorNickname(post2 ?? undefined, nicknameMapFromPartnerDisplayMap(partnerMapCr)),
              String((post2 as { id?: string } | null)?.id ?? postIdForCard)
            ),
            source: "chat_room",
            chatDomain: "trade",
            roomTitle: partnerNickname2.trim() || (partnerId2 ?? "").slice(0, 8),
            roomSubtitle: amISeller2 ? "상대방 · 구매자" : "상대방 · 판매자",
            buyerReviewSubmitted,
            adminChatSuspended,
            ...tradeExtras,
          };
        roomDetailCache.set(cacheKey, { at: Date.now(), payload });
        if (process.env.CHAT_PERF_LOG === "1") {
          console.info("[chat.room.detail]", { roomId, userId, branch: "trade-crsame", elapsedMs: Date.now() - startedAt });
        }
        return NextResponse.json(
          payload,
          { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
        );
      }
    }

    const amISeller = r.seller_id === userId;
    const row = r as Record<string, unknown>;
    const unreadCount = amISeller ? (row.unread_count_seller ?? 0) : (row.unread_count_buyer ?? 0);
    const partnerId = amISeller ? r.buyer_id : r.seller_id;
    const [postFirst, crRowsLegacyRes] = await Promise.all([
      fetchPostRowForChat(sbAny, r.post_id as string),
      sbAny
        .from("chat_rooms")
        .select("id, seller_id, buyer_id, updated_at, related_post_id, item_id")
        .eq("room_type", "item_trade")
        .eq("item_id", r.post_id)
        .eq("buyer_id", r.buyer_id)
        .order("updated_at", { ascending: false }),
    ]);
    // crSame(판매자 ID 정확 일치)가 없어도 posts.user_id와 맞는 chat_rooms가 있으면 거래 상태 동기화
    const postSellerCandidates = new Set(
      [
        r.seller_id,
        typeof postFirst?.user_id === "string" ? (postFirst.user_id as string) : "",
      ].filter((x) => typeof x === "string" && x.length > 0)
    );
    let linkedChatRoomId: string | undefined;
    const crRowsLegacy = crRowsLegacyRes.data;
    const crLinked =
      (crRowsLegacy ?? []).find((row: { seller_id: string }) => postSellerCandidates.has(row.seller_id)) ?? null;
    if (crLinked) {
      linkedChatRoomId = (crLinked as { id: string }).id;
    }
    let post = postFirst;
    if (!post && crLinked) {
      const rp = (crLinked as { related_post_id?: string | null }).related_post_id;
      const altItem = (crLinked as { item_id?: string | null }).item_id;
      post = await fetchPostRowForChatFirstResolved(sbAny, [
        typeof rp === "string" ? rp : "",
        typeof altItem === "string" ? altItem : "",
      ]);
    }
    const batchIdsPc = [
      ...new Set([partnerId, postAuthorUserId(post ?? undefined) ?? ""].filter(Boolean)),
    ] as string[];
    const partnerMapPc = await fetchPartnerDisplayFieldsMap(sbAny, batchIdsPc);
    const partnerDispPc = partnerDisplayFromMap(partnerMapPc, partnerId, partnerId.slice(0, 8));
    const partnerNickname = partnerDispPc.partnerNickname;
    const listing = normalizeSellerListingState(post?.seller_listing_state, post?.status as string);
    scheduleProductChatTransitionsIfCooldownAllows(sbAny, r.id as string);
    const tradeExtrasPc = tradeFieldsFromRows(row, post ?? undefined);
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
    const resolvedProductId = String((post as { id?: string } | null)?.id ?? r.post_id ?? "").trim() || String(r.post_id);
    const payload = {
      id: r.id,
      productId: resolvedProductId,
      buyerId: r.buyer_id,
      sellerId: r.seller_id,
      partnerNickname: partnerNickname.trim() || partnerId.slice(0, 8),
      partnerAvatar: partnerDispPc.partnerAvatar,
      partnerTrustScore: partnerDispPc.partnerTrustScore,
      lastMessage: (row.last_message_preview as string) ?? "",
      lastMessageAt: (row.last_message_at as string) ?? r.created_at,
      unreadCount: Number(unreadCount),
      product: chatProductSummaryFromPostRow(
        enrichPostWithAuthorNickname(post ?? undefined, nicknameMapFromPartnerDisplayMap(partnerMapPc)),
        resolvedProductId
      ),
      source: "product_chat",
      chatDomain: "trade",
      roomTitle: partnerNickname.trim() || partnerId.slice(0, 8),
      roomSubtitle: amISeller ? "상대방 · 구매자" : "상대방 · 판매자",
      tradeStatus: listing,
      buyerReviewSubmitted: buyerReviewSubmittedPc,
      adminChatSuspended: adminChatSuspendedPc,
      ...(linkedChatRoomId ? { chatRoomId: linkedChatRoomId } : {}),
      ...tradeExtrasPc,
    };
    roomDetailCache.set(cacheKey, { at: Date.now(), payload });
    if (process.env.CHAT_PERF_LOG === "1") {
      console.info("[chat.room.detail]", { roomId, userId, branch: "trade-legacy", elapsedMs: Date.now() - startedAt });
    }
    return NextResponse.json(payload);
  }

  // chat_rooms: item_trade · store_order 만 앱 채팅에서 지원
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
    const partnerPromise = fetchPartnerDisplayFieldsMap(sbAny, [partnerIdSo]);
    const oid = crSo.store_order_id ?? "";
    let titleSo = "배달 주문";
    let storeIdForRoom: string | null = null;
    let partnerDispSo: ReturnType<typeof partnerDisplayFromMap> | null = null;
    let partnerNickSo = partnerIdSo.slice(0, 8);
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
      partnerDispSo = partnerDisplayFromMap(await partnerPromise, partnerIdSo, partnerIdSo.slice(0, 8));
      partnerNickSo = partnerDispSo.partnerNickname;
      const payload = {
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
        };
      roomDetailCache.set(cacheKey, { at: Date.now(), payload });
      return NextResponse.json(
        payload,
        { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
      );
    }
    partnerDispSo = partnerDisplayFromMap(await partnerPromise, partnerIdSo, partnerIdSo.slice(0, 8));
    partnerNickSo = partnerDispSo.partnerNickname;
    const payload = {
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
      };
    roomDetailCache.set(cacheKey, { at: Date.now(), payload });
    return NextResponse.json(
      payload,
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  }

  if (roomType !== "item_trade") {
    return NextResponse.json({ error: "지원하지 않는 채팅 유형입니다." }, { status: 404 });
  }

  // item_trade
  const crRow = cr as { seller_id: string | null; buyer_id: string | null };
  const crIds = [crRow.seller_id, crRow.buyer_id].filter(Boolean) as string[];
  if (!crIds.includes(userId)) {
    return NextResponse.json({ error: "참여자가 아닙니다." }, { status: 403 });
  }
  const itemIdRaw = String((cr as { item_id: string | null }).item_id ?? "").trim();
  const relatedPostId = String(crAny.related_post_id ?? "").trim();
  const postIdForTradeCard = itemIdRaw || relatedPostId;
  const [{ data: partRow }, post2] = await Promise.all([
    sbAny
      .from("chat_room_participants")
      .select("unread_count")
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .maybeSingle(),
    fetchPostRowForChatFirstResolved(sbAny, [itemIdRaw, relatedPostId].filter(Boolean)),
  ]);
  const unreadCount = (partRow as { unread_count?: number } | null)?.unread_count ?? 0;
  const amISeller2 = crRow.seller_id === userId;
  const partnerId2 = amISeller2 ? crRow.buyer_id : crRow.seller_id;
  const batchIdsTrade = [
    ...new Set([partnerId2, postAuthorUserId(post2 ?? undefined) ?? ""].filter(Boolean)),
  ] as string[];
  const partnerMapTrade = await fetchPartnerDisplayFieldsMap(sbAny, batchIdsTrade);
  const partnerDispTrade = partnerDisplayFromMap(
    partnerMapTrade,
    partnerId2 ?? "",
    (partnerId2 ?? "").slice(0, 8)
  );
  const partnerNickname2 = partnerDispTrade.partnerNickname;
  const listing = normalizeSellerListingState(post2?.seller_listing_state, post2?.status as string);
  const resolvedTradePostId = String((post2 as { id?: string } | null)?.id ?? postIdForTradeCard);
  const { data: pcFallback } = await sbAny
    .from("product_chats")
    .select("*")
    .eq("post_id", resolvedTradePostId)
    .eq("seller_id", crRow.seller_id ?? "")
    .eq("buyer_id", crRow.buyer_id ?? "")
    .maybeSingle();
  const pcFb = pcFallback as Record<string, unknown> | null;
  if (pcFb?.id != null) {
    scheduleProductChatTransitionsIfCooldownAllows(sbAny, String(pcFb.id));
  }
  const tradeExtrasFb = tradeFieldsFromRows(pcFb, post2 ?? undefined);
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
  const payload = {
      id: cr.id,
      productId: resolvedTradePostId,
      buyerId: crRow.buyer_id ?? "",
      sellerId: crRow.seller_id ?? "",
      partnerNickname: partnerNickname2.trim() || (partnerId2 ?? "").slice(0, 8),
      partnerAvatar: partnerDispTrade.partnerAvatar,
      partnerTrustScore: partnerDispTrade.partnerTrustScore,
      lastMessage: (cr as { last_message_preview: string | null }).last_message_preview ?? "",
      lastMessageAt: (cr as { last_message_at: string | null }).last_message_at ?? (cr as { created_at: string }).created_at,
      unreadCount,
      tradeStatus: listing,
      product: chatProductSummaryFromPostRow(
        enrichPostWithAuthorNickname(post2 ?? undefined, nicknameMapFromPartnerDisplayMap(partnerMapTrade)),
        resolvedTradePostId
      ),
      source: "chat_room",
      chatDomain: "trade",
      roomTitle: partnerNickname2.trim() || (partnerId2 ?? "").slice(0, 8),
      roomSubtitle: amISeller2 ? "상대방 · 구매자" : "상대방 · 판매자",
      buyerReviewSubmitted: buyerReviewSubmittedFb,
      adminChatSuspended: adminChatSuspendedTrade,
      ...tradeExtrasFb,
    };
  roomDetailCache.set(cacheKey, { at: Date.now(), payload });
  if (process.env.CHAT_PERF_LOG === "1") {
    console.info("[chat.room.detail]", { roomId, userId, branch: "trade-item", elapsedMs: Date.now() - startedAt });
  }
  return NextResponse.json(
    payload,
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
  );
}
