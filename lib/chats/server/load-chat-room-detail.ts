import type { SupabaseClient } from "@supabase/supabase-js";
import { chatProductSummaryFromPostRow } from "@/lib/chats/chat-product-from-post";
import {
  enrichPostWithAuthorNickname,
  fetchNicknamesForUserIds,
  postAuthorUserId,
} from "@/lib/chats/resolve-author-nickname";
import {
  fetchPartnerDisplayFieldsMap,
  nicknameMapFromPartnerDisplayMap,
  partnerDisplayFromMap,
} from "@/lib/chats/fetch-partner-display";
import {
  fetchPostRowForChat,
  fetchPostRowForChatFirstResolved,
  fetchPostRowForChatViaProductChatsPair,
  type FetchPostRowForChatDiagnostics,
} from "@/lib/chats/post-select-compat";
import { ensureStoreOrderChatRoomAccessForUser } from "@/lib/chat/store-order-chat-db";
import {
  fetchItemTradeAdminSuspended,
  resolveAdminChatSuspension,
} from "@/lib/chat/chat-room-admin-suspend";
import { fetchBuyerReviewSubmitted } from "@/lib/mypage/buyer-review-flag";
import { normalizeSellerListingState } from "@/lib/products/seller-listing-state";
import { BUYER_ORDER_STATUS_LABEL } from "@/lib/stores/store-order-process-criteria";
import { applyBuyerAutoConfirmForRoom } from "@/lib/trade/apply-buyer-auto-confirm";
import { applyProductChatTimeTransitions } from "@/lib/trade/apply-product-chat-time-transitions";
import { reservedBuyerIdFromPost } from "@/lib/trade/reserved-item-chat";
import {
  inferMessengerDomainFromChatRoom,
  type MessengerDomain,
  MESSENGER_MONITORING_LABEL_DOMAIN,
} from "@/lib/chat-domain/messenger-domains";
import type { ChatRoom, GeneralChatMeta } from "@/lib/types/chat";
import { getChatServiceRoleSupabase } from "./service-role-supabase";
import { parseRoomId } from "@/lib/validate-params";
import { computeItemTradeUnreadCount } from "@/lib/chats/server/compute-item-trade-unread";

type RoomDetailCacheEntry = { at: number; payload: ChatRoom };
const ROOM_DETAIL_CACHE_TTL_MS = 2500;
const roomDetailCache = new Map<string, RoomDetailCacheEntry>();

type LoadChatRoomDetailSuccess = {
  ok: true;
  room: ChatRoom;
  cacheHit?: boolean;
};

type LoadChatRoomDetailError = {
  ok: false;
  status: number;
  error: string;
};

export type LoadChatRoomDetailResult =
  | LoadChatRoomDetailSuccess
  | LoadChatRoomDetailError;

export type ChatRoomDetailScope = "full" | "entry";

/** `loadChatRoomDetailForUser` 내부 계측 — `detailEntryMs` 는 항상 0, 나머지는 진입 시각 대비 누적 ms */
export type LoadChatRoomDetailDiagnostics = {
  detailEntryMs?: number;
  detailQueryADoneMs?: number;
  detailQueryBDoneMs?: number;
  detailComputeStartMs?: number;
  detailComputeDoneMs?: number;
  detailPreReturnMs?: number;
  detailGapEntryToQueryADoneMs?: number;
  detailGapQueryADoneToQueryBDoneMs?: number;
  detailGapQueryBDoneToComputeStartMs?: number;
  detailGapComputeStartToComputeDoneMs?: number;
  detailGapComputeDoneToReturnMs?: number;
  /** 레거시 product_chat 분기 — `detailQueryADoneMs` 이후 `detailQueryBDoneMs` 직전 */
  detailQueryBLegacyEntryMs?: number;
  detailQueryBLegacyPostFetchDoneMs?: number;
  detailQueryBLegacyChatRoomsDoneMs?: number;
  detailQueryBLegacyFirstResolvedDoneMs?: number;
  detailQueryBLegacyPairDoneMs?: number;
  detailGapQueryBLegacyEntryToPostMs?: number;
  detailGapPostFetchToChatRoomsMs?: number;
  detailGapChatRoomsToFirstResolvedMs?: number;
  detailGapFirstResolvedToPairMs?: number;
  detailGapPairToQueryBDoneMs?: number;
  /** crSame 분기 `fetchPostRowForChat(r.post_id)` — `MESSENGER_PERF_TRACE_ROOM_SNAPSHOT` + diagnostics 전달 시 */
  fetchPostRowForChatSellerMatch?: FetchPostRowForChatDiagnostics;
};

function fillSkippedQueryBLegacyMilestones(d: LoadChatRoomDetailDiagnostics): void {
  const postT = d.detailQueryBLegacyPostFetchDoneMs;
  const crT = d.detailQueryBLegacyChatRoomsDoneMs;
  if (postT == null || crT == null) return;
  if (d.detailQueryBLegacyFirstResolvedDoneMs == null) {
    d.detailQueryBLegacyFirstResolvedDoneMs = Math.max(postT, crT);
  }
  if (d.detailQueryBLegacyPairDoneMs == null) {
    d.detailQueryBLegacyPairDoneMs = d.detailQueryBLegacyFirstResolvedDoneMs;
  }
}

function copyPairFromFirstIfMissing(d: LoadChatRoomDetailDiagnostics): void {
  if (d.detailQueryBLegacyPairDoneMs == null && d.detailQueryBLegacyFirstResolvedDoneMs != null) {
    d.detailQueryBLegacyPairDoneMs = d.detailQueryBLegacyFirstResolvedDoneMs;
  }
}

function finalizeQueryBLegacyGapFields(d: LoadChatRoomDetailDiagnostics): void {
  const ent = d.detailQueryBLegacyEntryMs;
  if (ent == null) return;
  fillSkippedQueryBLegacyMilestones(d);
  const post = d.detailQueryBLegacyPostFetchDoneMs;
  const cr = d.detailQueryBLegacyChatRoomsDoneMs;
  const fr = d.detailQueryBLegacyFirstResolvedDoneMs;
  const pr = d.detailQueryBLegacyPairDoneMs;
  const qbd = d.detailQueryBDoneMs;
  if (post != null) d.detailGapQueryBLegacyEntryToPostMs = Math.round(post - ent);
  if (post != null && cr != null) d.detailGapPostFetchToChatRoomsMs = Math.round(cr - post);
  if (cr != null && fr != null) d.detailGapChatRoomsToFirstResolvedMs = Math.round(fr - cr);
  if (fr != null && pr != null) d.detailGapFirstResolvedToPairMs = Math.round(pr - fr);
  if (pr != null && qbd != null) d.detailGapPairToQueryBDoneMs = Math.round(qbd - pr);
}

export function finalizeChatRoomDetailLoadDiagnostics(d: LoadChatRoomDetailDiagnostics): void {
  const e = d.detailEntryMs ?? 0;
  const qa = d.detailQueryADoneMs;
  const qb = d.detailQueryBDoneMs;
  const cs = d.detailComputeStartMs;
  const cd = d.detailComputeDoneMs;
  const pr = d.detailPreReturnMs;
  if (qa != null) d.detailGapEntryToQueryADoneMs = Math.round(qa - e);
  if (qa != null && qb != null) d.detailGapQueryADoneToQueryBDoneMs = Math.round(qb - qa);
  if (qb != null && cs != null) d.detailGapQueryBDoneToComputeStartMs = Math.round(cs - qb);
  if (cs != null && cd != null) d.detailGapComputeStartToComputeDoneMs = Math.round(cd - cs);
  if (cd != null && pr != null) d.detailGapComputeDoneToReturnMs = Math.round(pr - cd);
  finalizeQueryBLegacyGapFields(d);
}

function ok(room: ChatRoom, cacheHit = false): LoadChatRoomDetailSuccess {
  return { ok: true, room, cacheHit };
}

function fail(status: number, error: string): LoadChatRoomDetailError {
  return { ok: false, status, error };
}

function logChatRoomDetailPerf(args: {
  roomId: string;
  userId: string;
  branch: string;
  domain: MessengerDomain | "unknown";
  detailScope: ChatRoomDetailScope;
  elapsedMs: number;
  cacheHit?: boolean;
  ok?: boolean;
  status?: number;
}): void {
  if (process.env.CHAT_PERF_LOG !== "1") return;
  console.info("[chat.room.detail]", args);
}

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

function trimMessengerRoomId(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : null;
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
    communityMessengerRoomId: trimMessengerRoomId(productChatRow?.community_messenger_room_id),
  };
}

const tradeTransitionCooldownByProductChatId = new Map<string, number>();
const TRADE_TRANSITION_COOLDOWN_MS = 15000;

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

export async function loadChatRoomDetailForUser(input: {
  roomId: string;
  userId: string;
  /**
   * `entry`: RSC 첫 페인트용 — `buyerReviewSubmitted` 조회(transaction_reviews) 생략·false.
   * `full`: 기본 — API·재검증과 동일한 메타(캐시 대상).
   */
  detailScope?: ChatRoomDetailScope;
  /** 스냅샷·perf 용 — 호출자가 객체 ref 를 넘기면 단계별 ms 기록 */
  diagnostics?: LoadChatRoomDetailDiagnostics;
}): Promise<LoadChatRoomDetailResult> {
  const startedAt = Date.now();
  const detailScope: ChatRoomDetailScope = input.detailScope ?? "full";
  const roomId = parseRoomId(input.roomId);
  if (!roomId) {
    logChatRoomDetailPerf({
      roomId: String(input.roomId ?? "").slice(0, 64),
      userId: input.userId,
      branch: "bad-room-id",
      domain: "unknown",
      detailScope,
      ok: false,
      status: 400,
      elapsedMs: Date.now() - startedAt,
    });
    return fail(400, "roomId 형식이 올바르지 않습니다.");
  }

  const cacheKey = `${input.userId}:${roomId}`;
  if (detailScope === "full") {
    const cached = roomDetailCache.get(cacheKey);
    if (cached && Date.now() - cached.at < ROOM_DETAIL_CACHE_TTL_MS) {
      logChatRoomDetailPerf({
        roomId,
        userId: input.userId,
        branch: "cache-hit",
        domain: inferMessengerDomainFromChatRoom(cached.payload),
        detailScope,
        cacheHit: true,
        elapsedMs: Date.now() - startedAt,
      });
      return ok(cached.payload, true);
    }
  }

  const sb = getChatServiceRoleSupabase();
  if (!sb) {
    logChatRoomDetailPerf({
      roomId,
      userId: input.userId,
      branch: "no-supabase",
      domain: "unknown",
      detailScope,
      ok: false,
      status: 500,
      elapsedMs: Date.now() - startedAt,
    });
    return fail(500, "서버 설정 필요");
  }
  const sbAny = sb as SupabaseClient<any>;
  const detailDiag = input.diagnostics;
  const detailT0 = detailDiag ? performance.now() : 0;
  const stampDetail = (field: keyof LoadChatRoomDetailDiagnostics) => {
    if (detailDiag) {
      (detailDiag as Record<string, number>)[field as string] = Math.round(performance.now() - detailT0);
    }
  };
  if (detailDiag) {
    detailDiag.detailEntryMs = 0;
  }

  const { data: r, error } = await sbAny
    .from("product_chats")
    .select(
      "id, post_id, seller_id, buyer_id, created_at, last_message_at, last_message_preview, unread_count_seller, unread_count_buyer, trade_flow_status, chat_mode, buyer_confirm_source, community_messenger_room_id"
    )
    .eq("id", roomId)
    .maybeSingle();
  stampDetail("detailQueryADoneMs");

  if (!error && r && (r.seller_id === input.userId || r.buyer_id === input.userId)) {
    /**
     * 통합 거래방(chat_rooms)은 item/start 가 게시글 작성자(post.user_id)를 seller 로 쓸 수 있고,
     * product_chats.seller_id 와 문자열이 다를 수 있다. 정확 일치만 조회하면 crSame 이 비어
     * 레거시(product_chat) 분기로 떨어져 chat_messages 를 안 보는 문제가 생긴다.
     * → 동일 상품·동일 구매자 방 중 게시글 판매자 후보와 맞는 행을 고른다.
     */
    stampDetail("detailQueryBLegacyEntryMs");
    if (detailDiag) detailDiag.fetchPostRowForChatSellerMatch = {};
    const postForSellerMatch = await fetchPostRowForChat(
      sbAny,
      r.post_id as string,
      detailDiag?.fetchPostRowForChatSellerMatch
    );
    stampDetail("detailQueryBLegacyPostFetchDoneMs");
    const sellerCandidatesForCr = new Set(
      [r.seller_id, typeof postForSellerMatch?.user_id === "string" ? postForSellerMatch.user_id : ""].filter(
        (x): x is string => typeof x === "string" && x.length > 0
      )
    );
    const { data: crSameRows } = await sbAny
      .from("chat_rooms")
      .select(
        "id, item_id, related_post_id, seller_id, buyer_id, last_message_id, last_message_at, last_message_preview, created_at, trade_status, updated_at, is_blocked, blocked_by, is_locked, initiator_id, peer_id, community_messenger_room_id"
      )
      .eq("room_type", "item_trade")
      .eq("item_id", r.post_id)
      .eq("buyer_id", r.buyer_id)
      .order("updated_at", { ascending: false });
    stampDetail("detailQueryBLegacyChatRoomsDoneMs");
    const crSame =
      (crSameRows ?? []).find((row: { seller_id: string }) => sellerCandidatesForCr.has(row.seller_id)) ??
      null;
    if (crSame) {
      const roomIdCr = (crSame as { id: string }).id;
      const crRow = crSame as { seller_id: string | null; buyer_id: string | null };
      const crIds = [crRow.seller_id, crRow.buyer_id].filter(Boolean) as string[];
      if (crIds.includes(input.userId)) {
        const itemIdRaw = String((crSame as { item_id: string | null }).item_id ?? "").trim();
        const relatedSame = String(
          (crSame as { related_post_id?: string | null }).related_post_id ?? ""
        ).trim();
        const postIdForCard = itemIdRaw || relatedSame || String(r.post_id ?? "").trim();
        const amISeller2 = crRow.seller_id === input.userId;
        const partnerId2 = amISeller2 ? crRow.buyer_id : crRow.seller_id;
        const [{ data: partRow }, post2] = await Promise.all([
          sbAny
            .from("chat_room_participants")
            .select("unread_count, last_read_message_id")
            .eq("room_id", roomIdCr)
            .eq("user_id", input.userId)
            .maybeSingle(),
          fetchPostRowForChatFirstResolved(sbAny, [
            itemIdRaw,
            relatedSame,
            String(r.post_id ?? "").trim(),
          ]),
        ]);
        stampDetail("detailQueryBLegacyFirstResolvedDoneMs");
        let post2Resolved = post2;
        if (!post2Resolved) {
          post2Resolved = await fetchPostRowForChatViaProductChatsPair(
            sbAny,
            crRow.seller_id,
            crRow.buyer_id,
            [itemIdRaw, relatedSame, String(r.post_id ?? "").trim()]
          );
          stampDetail("detailQueryBLegacyPairDoneMs");
        }
        if (detailDiag) copyPairFromFirstIfMissing(detailDiag);
        const unreadCount = await computeItemTradeUnreadCount(sbAny, {
          roomId: roomIdCr,
          viewerUserId: input.userId,
          lastMessageId: (crSame as { last_message_id?: string | null }).last_message_id,
          lastReadMessageId: (partRow as { last_read_message_id?: string | null } | null)?.last_read_message_id ?? null,
        });
        stampDetail("detailQueryBDoneMs");
        const batchIdsCr = [
          ...new Set([partnerId2, postAuthorUserId(post2Resolved ?? undefined) ?? ""].filter(Boolean)),
        ] as string[];
        const rowPc = r as Record<string, unknown>;
        scheduleProductChatTransitionsIfCooldownAllows(sbAny, r.id as string);
        const tradeExtras = tradeFieldsFromRows(rowPc, post2Resolved ?? undefined);
        const cmFromCrSame = trimMessengerRoomId(
          (crSame as { community_messenger_room_id?: unknown }).community_messenger_room_id
        );
        const buyerReviewPromiseCr =
          detailScope === "entry"
            ? Promise.resolve(false)
            : fetchBuyerReviewSubmitted(
                sbAny,
                (tradeExtras.productChatRoomId as string | null) ?? (r.id as string),
                input.userId,
                r.buyer_id as string
              );
        stampDetail("detailComputeStartMs");
        const [partnerMapCr, buyerReviewSubmitted] = await Promise.all([
          fetchPartnerDisplayFieldsMap(sbAny, batchIdsCr),
          buyerReviewPromiseCr,
        ]);
        const partnerDisp2 = partnerDisplayFromMap(
          partnerMapCr,
          partnerId2 ?? "",
          (partnerId2 ?? "").slice(0, 8)
        );
        const partnerNickname2 = partnerDisp2.partnerNickname;
        const listing = normalizeSellerListingState(
          post2Resolved?.seller_listing_state,
          post2Resolved?.status as string
        );
        const adminChatSuspended = resolveAdminChatSuspension(
          crSame as Parameters<typeof resolveAdminChatSuspension>[0]
        ).suspended;
        const payload = {
          id: roomIdCr,
          productId: String((post2Resolved as { id?: string } | null)?.id ?? postIdForCard),
          buyerId: crRow.buyer_id ?? "",
          sellerId: crRow.seller_id ?? "",
          partnerNickname: partnerNickname2.trim() || (partnerId2 ?? "").slice(0, 8),
          partnerAvatar: partnerDisp2.partnerAvatar,
          partnerTrustScore: partnerDisp2.partnerTrustScore,
          lastMessage:
            (crSame as { last_message_preview: string | null }).last_message_preview ?? "",
          lastMessageAt:
            (crSame as { last_message_at: string | null }).last_message_at ??
            (crSame as { created_at: string }).created_at,
          unreadCount,
          tradeStatus: listing,
          product: chatProductSummaryFromPostRow(
            enrichPostWithAuthorNickname(
              post2Resolved ?? undefined,
              nicknameMapFromPartnerDisplayMap(partnerMapCr)
            ),
            String((post2Resolved as { id?: string } | null)?.id ?? postIdForCard)
          ),
          source: "chat_room",
          chatDomain: "trade",
          roomTitle: partnerNickname2.trim() || (partnerId2 ?? "").slice(0, 8),
          roomSubtitle: amISeller2 ? "상대방 · 구매자" : "상대방 · 판매자",
          buyerReviewSubmitted,
          adminChatSuspended,
          ...tradeExtras,
          communityMessengerRoomId: cmFromCrSame ?? tradeExtras.communityMessengerRoomId ?? null,
        } satisfies ChatRoom;
        stampDetail("detailComputeDoneMs");
        if (detailScope === "full") {
          roomDetailCache.set(cacheKey, { at: Date.now(), payload });
        }
        logChatRoomDetailPerf({
          roomId,
          userId: input.userId,
          branch: "trade-crsame",
          domain: inferMessengerDomainFromChatRoom(payload),
          detailScope,
          elapsedMs: Date.now() - startedAt,
        });
        stampDetail("detailPreReturnMs");
        return ok(payload);
      }
    }

    const amISeller = r.seller_id === input.userId;
    const row = r as Record<string, unknown>;
    const unreadCount = amISeller ? (row.unread_count_seller ?? 0) : (row.unread_count_buyer ?? 0);
    const partnerId = amISeller ? r.buyer_id : r.seller_id;
    stampDetail("detailQueryBLegacyEntryMs");
    const pPostLegacy = fetchPostRowForChat(sbAny, r.post_id as string).then((v) => {
      stampDetail("detailQueryBLegacyPostFetchDoneMs");
      return v;
    });
    const pCrLegacy = sbAny
      .from("chat_rooms")
      .select("id, seller_id, buyer_id, updated_at, related_post_id, item_id, community_messenger_room_id")
      .eq("room_type", "item_trade")
      .eq("item_id", r.post_id)
      .eq("buyer_id", r.buyer_id)
      .order("updated_at", { ascending: false })
      .then((res) => {
        stampDetail("detailQueryBLegacyChatRoomsDoneMs");
        return res;
      });
    const [postFirst, crRowsLegacyRes] = await Promise.all([pPostLegacy, pCrLegacy]);
    const postSellerCandidates = new Set(
      [r.seller_id, typeof postFirst?.user_id === "string" ? (postFirst.user_id as string) : ""].filter(
        (x) => typeof x === "string" && x.length > 0
      )
    );
    let linkedChatRoomId: string | undefined;
    const crRowsLegacy = crRowsLegacyRes.data;
    const crLinked =
      (crRowsLegacy ?? []).find((legacyRow: { seller_id: string }) =>
        postSellerCandidates.has(legacyRow.seller_id)
      ) ?? null;
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
      stampDetail("detailQueryBLegacyFirstResolvedDoneMs");
    }
    if (!post) {
      post = await fetchPostRowForChatViaProductChatsPair(sbAny, r.seller_id, r.buyer_id, [
        String(r.post_id ?? "").trim(),
      ]);
      stampDetail("detailQueryBLegacyPairDoneMs");
    }
    if (detailDiag) fillSkippedQueryBLegacyMilestones(detailDiag);
    stampDetail("detailQueryBDoneMs");
    const batchIdsPc = [
      ...new Set([partnerId, postAuthorUserId(post ?? undefined) ?? ""].filter(Boolean)),
    ] as string[];
    scheduleProductChatTransitionsIfCooldownAllows(sbAny, r.id as string);
    const tradeExtrasPc = tradeFieldsFromRows(row, post ?? undefined);
    const cmFromLinkedCr = trimMessengerRoomId(
      (crLinked as { community_messenger_room_id?: unknown } | null)?.community_messenger_room_id
    );
    const buyerReviewPromisePc =
      detailScope === "entry"
        ? Promise.resolve(false)
        : fetchBuyerReviewSubmitted(
            sbAny,
            (tradeExtrasPc.productChatRoomId as string | null) ?? (r.id as string),
            input.userId,
            r.buyer_id as string
          );
    stampDetail("detailComputeStartMs");
    const [partnerMapPc, buyerReviewSubmittedPc, adminChatSuspendedPc] = await Promise.all([
      fetchPartnerDisplayFieldsMap(sbAny, batchIdsPc),
      buyerReviewPromisePc,
      fetchItemTradeAdminSuspended(sbAny, String(r.post_id), String(r.seller_id), String(r.buyer_id)),
    ]);
    const partnerDispPc = partnerDisplayFromMap(partnerMapPc, partnerId, partnerId.slice(0, 8));
    const partnerNickname = partnerDispPc.partnerNickname;
    const listing = normalizeSellerListingState(post?.seller_listing_state, post?.status as string);
    const resolvedProductId =
      String((post as { id?: string } | null)?.id ?? r.post_id ?? "").trim() || String(r.post_id);
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
      communityMessengerRoomId: cmFromLinkedCr ?? tradeExtrasPc.communityMessengerRoomId ?? null,
    } satisfies ChatRoom;
    stampDetail("detailComputeDoneMs");
    if (detailScope === "full") {
      roomDetailCache.set(cacheKey, { at: Date.now(), payload });
    }
    logChatRoomDetailPerf({
      roomId,
      userId: input.userId,
      branch: "trade-legacy",
      domain: inferMessengerDomainFromChatRoom(payload),
      detailScope,
      elapsedMs: Date.now() - startedAt,
    });
    stampDetail("detailPreReturnMs");
    return ok(payload);
  }

  const { data: cr, error: crErr } = await sbAny
    .from("chat_rooms")
    .select(
      "id, room_type, item_id, seller_id, buyer_id, initiator_id, peer_id, meeting_id, last_message_id, last_message_at, last_message_preview, created_at, trade_status, related_post_id, related_comment_id, related_group_id, related_business_id, context_type, store_order_id, is_blocked, blocked_by, is_locked, community_messenger_room_id"
    )
    .eq("id", roomId)
    .maybeSingle();
  stampDetail("detailQueryBDoneMs");
  if (crErr || !cr) {
    logChatRoomDetailPerf({
      roomId,
      userId: input.userId,
      branch: "chat_room-not-found",
      domain: "unknown",
      detailScope,
      ok: false,
      status: 404,
      elapsedMs: Date.now() - startedAt,
    });
    return fail(404, "채팅방을 찾을 수 없습니다.");
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
    last_message_id?: string | null;
    created_at: string;
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
    const accessSo = await ensureStoreOrderChatRoomAccessForUser(sbAny, roomId, input.userId);
    if (!accessSo.ok) {
      logChatRoomDetailPerf({
        roomId,
        userId: input.userId,
        branch: "store_order-forbidden",
        domain: MESSENGER_MONITORING_LABEL_DOMAIN.store_order,
        detailScope,
        ok: false,
        status: 403,
        elapsedMs: Date.now() - startedAt,
      });
      return fail(403, "참여자가 아닙니다.");
    }
    const sRow = accessSo.sellerId;
    const bRow = accessSo.buyerId;
    const prSo = { unread_count: accessSo.unreadCount };
    const amISellerSo = sRow === input.userId;
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
        chatDomain: "store_order",
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
      } satisfies ChatRoom;
      if (detailScope === "full") {
        roomDetailCache.set(cacheKey, { at: Date.now(), payload });
      }
      logChatRoomDetailPerf({
        roomId,
        userId: input.userId,
        branch: "store-order",
        domain: inferMessengerDomainFromChatRoom(payload),
        detailScope,
        elapsedMs: Date.now() - startedAt,
      });
      return ok(payload);
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
      chatDomain: "store_order",
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
    } satisfies ChatRoom;
    if (detailScope === "full") {
      roomDetailCache.set(cacheKey, { at: Date.now(), payload });
    }
    logChatRoomDetailPerf({
      roomId,
      userId: input.userId,
      branch: "store-order-fallback",
      domain: inferMessengerDomainFromChatRoom(payload),
      detailScope,
      elapsedMs: Date.now() - startedAt,
    });
    return ok(payload);
  }

  if (roomType !== "item_trade") {
    logChatRoomDetailPerf({
      roomId,
      userId: input.userId,
      branch: `unsupported-room-type:${roomType || "empty"}`,
      domain: "unknown",
      detailScope,
      ok: false,
      status: 404,
      elapsedMs: Date.now() - startedAt,
    });
    return fail(404, "지원하지 않는 채팅 유형입니다.");
  }

  const crRow = cr as { seller_id: string | null; buyer_id: string | null };
  const crIds = [crRow.seller_id, crRow.buyer_id].filter(Boolean) as string[];
  if (!crIds.includes(input.userId)) {
    logChatRoomDetailPerf({
      roomId,
      userId: input.userId,
      branch: "item_trade-forbidden",
      domain: MESSENGER_MONITORING_LABEL_DOMAIN.trade,
      detailScope,
      ok: false,
      status: 403,
      elapsedMs: Date.now() - startedAt,
    });
    return fail(403, "참여자가 아닙니다.");
  }
  const itemIdRaw = String((cr as { item_id: string | null }).item_id ?? "").trim();
  const relatedPostId = String(crAny.related_post_id ?? "").trim();
  const postIdForTradeCard = itemIdRaw || relatedPostId;
  const [{ data: partRow }, post2First] = await Promise.all([
    sbAny
      .from("chat_room_participants")
      .select("unread_count, last_read_message_id")
      .eq("room_id", roomId)
      .eq("user_id", input.userId)
      .maybeSingle(),
    fetchPostRowForChatFirstResolved(sbAny, [itemIdRaw, relatedPostId].filter(Boolean)),
  ]);
  let post2 = post2First;
  if (!post2) {
    post2 = await fetchPostRowForChatViaProductChatsPair(sbAny, crRow.seller_id, crRow.buyer_id, [
      itemIdRaw,
      relatedPostId,
    ]);
  }
  const unreadCount = await computeItemTradeUnreadCount(sbAny, {
    roomId,
    viewerUserId: input.userId,
    lastMessageId: (cr as { last_message_id?: string | null }).last_message_id,
    lastReadMessageId: (partRow as { last_read_message_id?: string | null } | null)?.last_read_message_id ?? null,
  });
  stampDetail("detailQueryBDoneMs");
  const amISeller2 = crRow.seller_id === input.userId;
  const partnerId2 = amISeller2 ? crRow.buyer_id : crRow.seller_id;
  const resolvedTradePostId = String((post2 as { id?: string } | null)?.id ?? postIdForTradeCard).trim();
  const batchIdsTrade = [
    ...new Set([partnerId2, postAuthorUserId(post2 ?? undefined) ?? ""].filter(Boolean)),
  ] as string[];
  stampDetail("detailComputeStartMs");
  const [partnerMapTrade, pcFallbackRes] = await Promise.all([
    fetchPartnerDisplayFieldsMap(sbAny, batchIdsTrade),
    sbAny
      .from("product_chats")
      .select("id, trade_flow_status, chat_mode, buyer_confirm_source, community_messenger_room_id")
      .eq("post_id", resolvedTradePostId)
      .eq("seller_id", crRow.seller_id ?? "")
      .eq("buyer_id", crRow.buyer_id ?? "")
      .maybeSingle(),
  ]);
  const partnerDispTrade = partnerDisplayFromMap(
    partnerMapTrade,
    partnerId2 ?? "",
    (partnerId2 ?? "").slice(0, 8)
  );
  const partnerNickname2 = partnerDispTrade.partnerNickname;
  const listing = normalizeSellerListingState(post2?.seller_listing_state, post2?.status as string);
  const pcFallback = pcFallbackRes.data;
  const pcFb = pcFallback as Record<string, unknown> | null;
  if (pcFb?.id != null) {
    scheduleProductChatTransitionsIfCooldownAllows(sbAny, String(pcFb.id));
  }
  const tradeExtrasFb = tradeFieldsFromRows(pcFb, post2 ?? undefined);
  const pcIdForReview =
    (tradeExtrasFb.productChatRoomId as string | null) ??
    (pcFb?.id != null ? String(pcFb.id) : null);
  const buyerReviewSubmittedFb =
    detailScope === "entry"
      ? false
      : await fetchBuyerReviewSubmitted(
          sbAny,
          pcIdForReview,
          input.userId,
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
  const cmFromItemTradeRoom = trimMessengerRoomId(
    (cr as { community_messenger_room_id?: unknown }).community_messenger_room_id
  );
  const payload = {
    id: cr.id,
    productId: resolvedTradePostId,
    buyerId: crRow.buyer_id ?? "",
    sellerId: crRow.seller_id ?? "",
    partnerNickname: partnerNickname2.trim() || (partnerId2 ?? "").slice(0, 8),
    partnerAvatar: partnerDispTrade.partnerAvatar,
    partnerTrustScore: partnerDispTrade.partnerTrustScore,
    lastMessage: (cr as { last_message_preview: string | null }).last_message_preview ?? "",
    lastMessageAt:
      (cr as { last_message_at: string | null }).last_message_at ??
      (cr as { created_at: string }).created_at,
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
    communityMessengerRoomId: cmFromItemTradeRoom ?? tradeExtrasFb.communityMessengerRoomId ?? null,
  } satisfies ChatRoom;
  stampDetail("detailComputeDoneMs");
  if (detailScope === "full") {
    roomDetailCache.set(cacheKey, { at: Date.now(), payload });
  }
  logChatRoomDetailPerf({
    roomId,
    userId: input.userId,
    branch: "trade-item",
    domain: inferMessengerDomainFromChatRoom(payload),
    detailScope,
    elapsedMs: Date.now() - startedAt,
  });
  stampDetail("detailPreReturnMs");
  return ok(payload);
}
