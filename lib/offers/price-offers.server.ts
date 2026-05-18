import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchNicknamesForUserIds, postOwnedByUserId, postTradeListingOwnerUserId } from "@/lib/chats/resolve-author-nickname";
import { tradeChatNotificationHref } from "@/lib/chats/trade-chat-notification-href";
import {
  fetchPostRowForTradeChatById,
  uuidLookupCandidates,
} from "@/lib/posts/fetch-post-row-for-trade-chat";
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { OPEN_RECEIVED_OFFERS_SEARCH_PARAM } from "@/lib/notifications/resolve-notification-inbox-href";
import { ensureMessengerRoomIdForItemTrade } from "@/lib/trade/ensure-messenger-room-for-trade-chat";
import { ensureProductChatRowForItemTrade } from "@/lib/trade/ensure-product-chat-for-item-trade";
import {
  touchProductChatAfterItemTradeMessage,
  type ItemTradeRoomRowForSync,
} from "@/lib/trade/touch-product-chat-from-item-trade-room";
import { getAppSettings } from "@/lib/app-settings";
import type { ChatRoomSource } from "@/lib/types/chat";
import { formatPrice } from "@/lib/utils/format";
import type { PriceOfferListItem, PriceOfferRow, PriceOfferTransitionResult } from "@/lib/offers/types";
import { enrichPriceOffersToListItems, mapPriceOfferRow } from "@/lib/offers/offers-map";
import { normalizeOfferProductId } from "@/lib/offers/normalize-offer-product-id";
import { isPostgresUniqueViolation } from "@/lib/postgres/unique-violation";
import { offerServerT } from "@/lib/offers/offer-server-i18n";

/** 읽기·쓰기 반환 공통 — `amount` 레거시 컬럼 미존재 DB 에서 select 실패 방지 */
const PRICE_OFFER_SELECT_READ =
  "id, product_id, buyer_id, seller_id, original_price, offered_price, message, status, created_at, updated_at";

/**
 * 상품별 제안 행 로드 — `.or()` URL 파싱 이슈 회피 + `product_id` 표기 불일치 시 판매자 기준 폴백.
 */
async function fetchPriceOfferRowsForSellerProduct(
  sb: SupabaseClient,
  pid: string,
  inferredSellerId: string
): Promise<Record<string, unknown>[]> {
  const wantPid = normalizeOfferProductId(pid);
  const byId = new Map<string, Record<string, unknown>>();
  const candidates = uuidLookupCandidates(pid);

  if (candidates.length > 0) {
    const results = await Promise.all(
      candidates.map((cand) =>
        sb
          .from("price_offers")
          .select(PRICE_OFFER_SELECT_READ)
          .eq("product_id", cand)
          .order("created_at", { ascending: false })
          .limit(100)
      )
    );
    for (const { data, error } of results) {
      if (error) continue;
      for (const raw of data ?? []) {
        const rid = trimString((raw as Record<string, unknown>).id);
        if (rid) byId.set(rid, raw as Record<string, unknown>);
      }
    }
  }

  if (byId.size === 0 && inferredSellerId) {
    const sid = trimString(inferredSellerId);
    const { data, error } = await sb
      .from("price_offers")
      .select(PRICE_OFFER_SELECT_READ)
      .eq("seller_id", sid)
      .order("created_at", { ascending: false })
      .limit(400);
    if (!error && data?.length) {
      for (const raw of data) {
        const row = raw as Record<string, unknown>;
        const rp = normalizeOfferProductId(row.product_id) || trimString(row.product_id);
        if (!rp || rp !== wantPid) continue;
        const rid = trimString(row.id);
        if (rid) byId.set(rid, row);
      }
    }
  }

  return [...byId.values()].sort((a, b) => {
    const tb = Date.parse(String(b.created_at ?? ""));
    const ta = Date.parse(String(a.created_at ?? ""));
    const nb = Number.isFinite(tb) ? tb : 0;
    const na = Number.isFinite(ta) ? ta : 0;
    return nb - na;
  });
}

type PriceOfferServiceError = {
  status: number;
  error: string;
  code: string;
};

type Ok<T> = { ok: true; value: T };
type Err = { ok: false; error: PriceOfferServiceError };

type CreatePriceOfferInput = {
  buyerUserId: string;
  productId: string;
  offeredPrice: number;
  message?: string | null;
};

type TransitionPriceOfferInput = {
  actorUserId: string;
  offerId: string;
};

type ListPriceOffersInput = {
  userId: string;
  role: "buyer" | "seller";
  productId?: string | null;
  limit?: number;
};

type PostOfferContext = {
  productId: string;
  sellerId: string;
  title: string;
  thumbnailUrl: string | null;
  status: string | null;
  isPriceOfferEnabled: boolean;
  isDeleted: boolean;
  isHidden: boolean;
  price: number;
  reservedBuyerId: string | null;
};

type EnsureTradeChatRoomResult = {
  roomId: string;
  roomSource: ChatRoomSource;
  messengerRoomId: string | null;
};

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toNullableTrimmedString(value: unknown): string | null {
  const trimmed = trimString(value);
  return trimmed || null;
}

function toNumber(value: unknown): number {
  const raw = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(raw) ? raw : NaN;
}

/** PostgREST/런타임에 따라 `timestamptz`가 ISO 문자열·Date·숫자로 올 수 있음 */
function tsToIsoString(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
  return "";
}

function formatOfferAmount(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const currency = getAppSettings().defaultCurrency || "PHP";
  return formatPrice(safe, currency);
}

function serviceError(status: number, error: string, code: string): Err {
  return {
    ok: false,
    error: { status, error, code },
  };
}

/**
 * 가격 제안 API 소유권·게이트 전용 — `POST_TRADE_DETAIL_SELECT` 단계 로드가 컬럼/환경 때문에 실패해도
 * `id` + `user_id` (+ `author_id`) 만으로 글 소유자 판별이 가능해야 한다.
 */
async function loadPostRowMinimalForOfferGate(
  sb: SupabaseClient,
  productId: string
): Promise<Record<string, unknown> | null> {
  const id = trimString(productId);
  if (!id) return null;

  const candidates = uuidLookupCandidates(id);

  /**
   * 1) `posts` 원본을 **한 번의 `.in` 으로** 조회 → 왕복 횟수·체감 지연 감소.
   * 2) 실패 시에만 읽기 뷰(`posts_masked` 등)를 순차 시도 — 마스킹이 소유 컬럼을 비우면 건너뛴다.
   */
  const { data: postRows, error: postsErr } = await sb
    .from("posts")
    .select("id, user_id, author_id")
    .in("id", candidates);

  if (!postsErr && Array.isArray(postRows) && postRows.length > 0) {
    const rows = postRows as Record<string, unknown>[];
    const preferred = rows.find((row) => Boolean(trimString(row.user_id) || trimString(row.author_id)));
    return preferred ?? rows[0] ?? null;
  }

  const tables = [...new Set([POSTS_TABLE_READ, "posts_masked"])].filter((t) => t !== "posts");
  for (const idKey of candidates) {
    for (const table of tables) {
      const { data, error } = await sb.from(table).select("id, user_id, author_id").eq("id", idKey).maybeSingle();
      if (!error && data && typeof data === "object") {
        const row = data as Record<string, unknown>;
        if (Boolean(trimString(row.user_id) || trimString(row.author_id))) {
          return row;
        }
      }
    }
  }
  return null;
}

/** 수락/거절 — 미니 게이트만으로는 `id` 형태가 빠지는 경우가 있어 상세 로드와 동일 폴백 */
async function loadPostRowForSellerOfferAction(
  sb: SupabaseClient,
  productId: string
): Promise<Record<string, unknown> | null> {
  return (
    (await loadPostRowMinimalForOfferGate(sb, productId)) ?? (await fetchPostRowForTradeChatById(sb, productId))
  );
}

/**
 * 수락/거절 권한: 세션 사용자가 해당 글 소유자이고, `offer.product_id`와 글 id 가 충돌하지 않을 때.
 * `postRow.id` 가 비어 있거나 비정상일 때도 **소유자면 진행** — 불일치 검사는 양쪽 id 가 모두 있을 때만 수행.
 */
function sellerActorCanManageOffer(offer: PriceOfferRow, actorUserId: string, postRow: Record<string, unknown>): boolean {
  if (!postOwnedByUserId(postRow, actorUserId)) return false;
  const offerPid = normalizeOfferProductId(offer.product_id);
  if (!offerPid) return false;
  const rowPid = normalizeOfferProductId(postRow.id);
  if (rowPid && rowPid !== offerPid) return false;
  return true;
}

async function loadPostOfferContext(
  sb: SupabaseClient,
  productId: string
): Promise<PostOfferContext | null> {
  const row = await fetchPostRowForTradeChatById(sb, productId);
  if (!row) return null;
  const sellerId = postTradeListingOwnerUserId(row) ?? "";
  const price = toNumber(row.price);
  if (!sellerId || !Number.isFinite(price)) return null;
  const title = trimString(row.title) || offerServerT("offer_fallback_product");
  const thumbnailUrl = toNullableTrimmedString(row.thumbnail_url);
  const status = toNullableTrimmedString(row.status);
  const statusNorm = String(status ?? "").toLowerCase();
  const reservedBuyerId = toNullableTrimmedString(row.reserved_buyer_id);
  return {
    productId,
    sellerId,
    title,
    thumbnailUrl,
    status,
    isPriceOfferEnabled: row.is_price_offer === true,
    isDeleted: row.is_deleted === true || statusNorm === "deleted",
    isHidden:
      statusNorm === "hidden" ||
      statusNorm === "blinded" ||
      trimString(row.visibility).toLowerCase() === "hidden",
    price,
    reservedBuyerId,
  };
}

async function loadOfferRowById(
  sb: SupabaseClient,
  offerId: string
): Promise<PriceOfferRow | null> {
  const { data, error } = await sb
    .from("price_offers")
    .select(PRICE_OFFER_SELECT_READ)
    .eq("id", offerId)
    .maybeSingle();
  if (error || !data) return null;
  return mapPriceOfferRow(data as Record<string, unknown>);
}

async function ensureTradeChatRoomForOffer(
  sb: SupabaseClient,
  args: { productId: string; sellerId: string; buyerId: string },
  /** insert unique 충돌 시 1회만 재진입(기존 방 SELECT) */
  afterInsertRace = false
): Promise<EnsureTradeChatRoomResult> {
  const existingRes = await sb
    .from("chat_rooms")
    .select("id, community_messenger_room_id")
    .eq("room_type", "item_trade")
    .eq("item_id", args.productId)
    .eq("seller_id", args.sellerId)
    .eq("buyer_id", args.buyerId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const existing = existingRes.data as { id?: string; community_messenger_room_id?: string | null } | null;
  if (existing?.id) {
    const now = new Date().toISOString();
    const { data: participants } = await sb
      .from("chat_room_participants")
      .select("id, hidden, left_at, is_active, reopen_count")
      .eq("room_id", existing.id);

    const hiddenOrLeftParticipants = (participants ?? []).filter((participant) => {
      const row = participant as {
        hidden?: boolean;
        left_at?: string | null;
        is_active?: boolean | null;
      };
      return row.hidden || Boolean(row.left_at) || row.is_active === false;
    }) as { id: string; reopen_count?: number }[];

    if (hiddenOrLeftParticipants.length > 0) {
      await Promise.all(
        hiddenOrLeftParticipants.map((participant) =>
          sb
            .from("chat_room_participants")
            .update({
              hidden: false,
              left_at: null,
              is_active: true,
              reopen_count: (participant.reopen_count ?? 0) + 1,
              updated_at: now,
            })
            .eq("id", participant.id)
        )
      );
    }

    await sb.from("chat_rooms").update({ reopened_at: now, updated_at: now }).eq("id", existing.id);
    const messengerRoomId =
      toNullableTrimmedString(existing.community_messenger_room_id) ??
      (await ensureMessengerRoomIdForItemTrade(sb, args.buyerId, args.productId, args.sellerId, existing.id)) ??
      null;
    return {
      roomId: existing.id,
      roomSource: "chat_room",
      messengerRoomId,
    };
  }

  const insertedRoomRes = await sb
    .from("chat_rooms")
    .insert({
      room_type: "item_trade",
      item_id: args.productId,
      seller_id: args.sellerId,
      buyer_id: args.buyerId,
      initiator_id: args.buyerId,
      peer_id: args.sellerId,
      request_status: "none",
      trade_status: "inquiry",
    })
    .select("id")
    .single();

  if (insertedRoomRes.error || !insertedRoomRes.data?.id) {
    if (
      !afterInsertRace &&
      insertedRoomRes.error &&
      isPostgresUniqueViolation(insertedRoomRes.error)
    ) {
      return ensureTradeChatRoomForOffer(sb, args, true);
    }
    throw new Error(insertedRoomRes.error?.message ?? offerServerT("offer_err_chat_room_create"));
  }

  const roomId = trimString(insertedRoomRes.data.id);
  if (!roomId) {
    throw new Error(offerServerT("offer_err_chat_room_create"));
  }

  const participantsRes = await sb.from("chat_room_participants").insert([
    { room_id: roomId, user_id: args.sellerId, role_in_room: "seller", is_active: true, hidden: false },
    { room_id: roomId, user_id: args.buyerId, role_in_room: "buyer", is_active: true, hidden: false },
  ]);
  if (participantsRes.error) {
    throw new Error(participantsRes.error.message ?? offerServerT("offer_err_participants"));
  }

  const [messengerRoomId] = await Promise.all([
    ensureMessengerRoomIdForItemTrade(sb, args.buyerId, args.productId, args.sellerId, roomId),
    (async () => {
      try {
        await sb.from("chat_event_logs").insert({
          room_id: roomId,
          event_type: "room_created",
          actor_user_id: args.sellerId,
          metadata: { item_id: args.productId, source: "price_offer_accept" },
        });
      } catch {
        /* ignore */
      }
    })(),
  ]);

  return {
    roomId,
    roomSource: "chat_room",
    messengerRoomId: messengerRoomId ?? null,
  };
}

async function insertAcceptedOfferSystemMessage(
  sb: SupabaseClient,
  args: {
    offerId: string;
    productId: string;
    sellerId: string;
    buyerId: string;
    roomId: string;
    messengerRoomId: string | null;
    offeredPrice: number;
  }
): Promise<void> {
  const now = new Date().toISOString();
  const body = offerServerT("offer_msg_accepted", { amount: formatOfferAmount(args.offeredPrice) });
  const metadata = {
    kind: "price_offer_accepted",
    offer_id: args.offerId,
    offered_price: args.offeredPrice,
  };

  const insertedChatMessage = await sb
    .from("chat_messages")
    .insert({
      room_id: args.roomId,
      sender_id: null,
      message_type: "system",
      body,
      metadata,
      created_at: now,
    })
    .select("id")
    .maybeSingle();

  if (insertedChatMessage.error) {
    throw new Error(insertedChatMessage.error.message ?? offerServerT("offer_err_system_message"));
  }

  await sb
    .from("chat_rooms")
    .update({
      last_message_id: insertedChatMessage.data?.id ?? null,
      last_message_at: now,
      last_message_preview: body,
      updated_at: now,
    })
    .eq("id", args.roomId);

  const syncRow: ItemTradeRoomRowForSync = {
    item_id: args.productId,
    seller_id: args.sellerId,
    buyer_id: args.buyerId,
    last_message_at: now,
    last_message_preview: body,
  };
  await touchProductChatAfterItemTradeMessage(sb, syncRow, args.sellerId);

  const productChat = await ensureProductChatRowForItemTrade(sb, args.productId, args.sellerId, args.buyerId);
  if (productChat?.id) {
    await sb.from("product_chat_messages").insert({
      product_chat_id: productChat.id,
      sender_id: args.sellerId,
      message_type: "system",
      content: body,
      image_url: null,
      created_at: now,
    });
  }

  if (args.messengerRoomId) {
    await sb.from("community_messenger_messages").insert({
      room_id: args.messengerRoomId,
      sender_id: null,
      message_type: "system",
      content: body,
      metadata,
      created_at: now,
    });
    await sb
      .from("community_messenger_rooms")
      .update({
        last_message: body,
        last_message_at: now,
        last_message_type: "system",
        updated_at: now,
      })
      .eq("id", args.messengerRoomId);
  }
}

async function notifyOfferCreated(
  sb: SupabaseClient,
  args: {
    offer: PriceOfferRow;
    post: PostOfferContext;
    buyerNickname: string | null;
  }
): Promise<void> {
  const titleSnippet = args.post.title?.trim() ? args.post.title.trim().slice(0, 40) : offerServerT("offer_fallback_product");
  await appendUserNotification(sb, {
    user_id: args.offer.seller_id,
    notification_type: "status",
    title: offerServerT("offer_notif_received_title"),
    body: `${titleSnippet} · ${formatOfferAmount(args.offer.original_price)} → ${formatOfferAmount(args.offer.offered_price)}`,
    /** 판매자 알림 탭 시 상세 진입과 함께 받은 제안 모달 자동 오픈 (`PostDetailView`) */
    link_url: `/post/${encodeURIComponent(args.offer.product_id)}?${OPEN_RECEIVED_OFFERS_SEARCH_PARAM}=1`,
    ref_id: args.offer.id,
    meta: {
      kind: "trade_offer",
      event: "offer_created",
      notification_type: "offer_created",
      /** 제품 스펙 `notifications.type` 대응(운영 테이블은 `notification_type` + meta) */
      spec_type: "offer_created",
      status: args.offer.status,
      offer_id: args.offer.id,
      product_id: args.offer.product_id,
      offered_price: args.offer.offered_price,
      original_price: args.offer.original_price,
      buyer_id: args.offer.buyer_id,
      seller_id: args.offer.seller_id,
      buyer_label: args.buyerNickname,
      product_title: args.post.title,
    },
  });
}

async function notifyOfferAccepted(
  sb: SupabaseClient,
  args: {
    offer: PriceOfferRow;
    chatRoomId: string;
    chatRoomSource: ChatRoomSource;
  }
): Promise<void> {
  await appendUserNotification(sb, {
    user_id: args.offer.buyer_id,
    notification_type: "status",
    title: offerServerT("offer_notif_accepted_title"),
    body: offerServerT("offer_notif_accepted_body", { amount: formatOfferAmount(args.offer.offered_price) }),
    link_url: tradeChatNotificationHref(args.chatRoomId, args.chatRoomSource),
    ref_id: args.offer.id,
    meta: {
      kind: "trade_offer",
      event: "offer_accepted",
      notification_type: "offer_accepted",
      spec_type: "offer_accepted",
      status: "accepted",
      offer_id: args.offer.id,
      product_id: args.offer.product_id,
      buyer_id: args.offer.buyer_id,
      seller_id: args.offer.seller_id,
      original_price: args.offer.original_price,
      room_id: args.chatRoomId,
      chat_room_id: args.chatRoomId,
      room_source: args.chatRoomSource,
      offered_price: args.offer.offered_price,
    },
  });
}

async function notifyOfferRejected(
  sb: SupabaseClient,
  args: { offer: PriceOfferRow }
): Promise<void> {
  await appendUserNotification(sb, {
    user_id: args.offer.buyer_id,
    notification_type: "status",
    title: offerServerT("offer_notif_rejected_title"),
    body: offerServerT("offer_notif_rejected_body", { amount: formatOfferAmount(args.offer.offered_price) }),
    link_url: `/post/${encodeURIComponent(args.offer.product_id)}`,
    ref_id: args.offer.id,
    meta: {
      kind: "trade_offer",
      event: "offer_rejected",
      notification_type: "offer_rejected",
      spec_type: "offer_rejected",
      status: "rejected",
      offer_id: args.offer.id,
      product_id: args.offer.product_id,
      buyer_id: args.offer.buyer_id,
      seller_id: args.offer.seller_id,
      original_price: args.offer.original_price,
      offered_price: args.offer.offered_price,
    },
  });
}

export async function createPriceOffer(
  sb: SupabaseClient,
  input: CreatePriceOfferInput
): Promise<Ok<PriceOfferListItem> | Err> {
  const buyerUserId = trimString(input.buyerUserId);
  const productId = normalizeOfferProductId(input.productId);
  const offeredPrice = Math.floor(input.offeredPrice);
  const message = toNullableTrimmedString(input.message)?.slice(0, 500) ?? null;
  if (!buyerUserId || !productId) {
    return serviceError(400, offerServerT("offer_err_invalid_target"), "invalid_offer_target");
  }
  if (!Number.isFinite(offeredPrice) || offeredPrice <= 0) {
    return serviceError(400, offerServerT("offer_err_invalid_price"), "invalid_offer_price");
  }

  const post = await loadPostOfferContext(sb, productId);
  if (!post) {
    return serviceError(404, offerServerT("offer_err_product_not_found"), "offer_product_not_found");
  }
  if (post.sellerId === buyerUserId) {
    return serviceError(400, offerServerT("offer_err_own_product"), "offer_own_product");
  }
  if (!post.isPriceOfferEnabled) {
    return serviceError(403, offerServerT("offer_err_disabled"), "offer_disabled");
  }
  if (post.isDeleted || post.isHidden || post.status === "sold") {
    return serviceError(403, offerServerT("offer_err_product_closed"), "offer_product_closed");
  }
  if (post.price <= 0) {
    return serviceError(400, offerServerT("offer_err_requires_price"), "offer_requires_price");
  }
  const minAllowed = Math.ceil(post.price * 0.5);
  if (offeredPrice < minAllowed) {
    return serviceError(
      400,
      offerServerT("offer_err_price_too_low", { min: formatOfferAmount(minAllowed) }),
      "offer_price_too_low"
    );
  }

  const [existingPendingRes, existingAcceptedRes, dailyCountRes, buyerNickMap] = await Promise.all([
    sb
      .from("price_offers")
      .select("id")
      .eq("product_id", productId)
      .eq("buyer_id", buyerUserId)
      .eq("status", "pending")
      .limit(1),
    sb
      .from("price_offers")
      .select("id")
      .eq("product_id", productId)
      .eq("buyer_id", buyerUserId)
      .eq("status", "accepted")
      .limit(1),
    sb
      .from("price_offers")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId)
      .eq("buyer_id", buyerUserId)
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    fetchNicknamesForUserIds(sb, [buyerUserId]),
  ]);

  if ((existingAcceptedRes.data?.length ?? 0) > 0) {
    return serviceError(
      409,
      offerServerT("offer_err_already_accepted"),
      "offer_accepted_exists"
    );
  }

  if ((existingPendingRes.data?.length ?? 0) > 0) {
    return serviceError(409, offerServerT("offer_err_pending_exists"), "offer_pending_exists");
  }
  if ((dailyCountRes.count ?? 0) >= 3) {
    return serviceError(429, offerServerT("offer_err_daily_limit"), "offer_daily_limit");
  }

  const insertRes = await sb
    .from("price_offers")
    .insert({
      product_id: productId,
      buyer_id: buyerUserId,
      seller_id: post.sellerId,
      original_price: post.price,
      offered_price: offeredPrice,
      message,
      status: "pending",
    })
    .select(PRICE_OFFER_SELECT_READ)
    .single();

  if (insertRes.error || !insertRes.data) {
    if (String(insertRes.error?.message ?? "").includes("price_offers_pending_unique_idx")) {
      return serviceError(409, offerServerT("offer_err_pending_exists"), "offer_pending_exists");
    }
    return serviceError(500, insertRes.error?.message ?? offerServerT("offer_err_create_failed"), "offer_create_failed");
  }

  const offer = mapPriceOfferRow(insertRes.data as Record<string, unknown>);
  if (!offer) {
    return serviceError(500, offerServerT("offer_err_create_invalid"), "offer_create_invalid");
  }

  await notifyOfferCreated(sb, {
    offer,
    post,
    buyerNickname: buyerNickMap.get(buyerUserId) ?? null,
  });

  const [item] = await enrichPriceOffersToListItems(sb, [offer]);
  return { ok: true, value: item };
}

/**
 * 상품 상세 판매자 전용 — `posts` 소유 확인 후 `product_id` 단건 조회 + [offers-map](lib/offers/offers-map.ts) 매핑.
 */
export async function listSellerPriceOffersForProduct(
  sb: SupabaseClient,
  userId: string,
  productId: string
): Promise<Ok<PriceOfferListItem[]> | Err> {
  const uid = trimString(userId);
  const pid = normalizeOfferProductId(productId);
  if (!uid || !pid) {
    return serviceError(400, offerServerT("offer_err_list_invalid_params"), "offer_list_invalid_params");
  }

  const postRow =
    (await loadPostRowMinimalForOfferGate(sb, pid)) ?? (await fetchPostRowForTradeChatById(sb, pid));
  if (!postRow) {
    return serviceError(404, offerServerT("offer_err_post_not_found"), "offer_post_not_found");
  }
  if (!postOwnedByUserId(postRow, uid)) {
    return serviceError(403, offerServerT("offer_err_list_not_owner"), "offer_list_not_owner");
  }

  const inferredSellerId = postTradeListingOwnerUserId(postRow) ?? "";

  const rows = await fetchPriceOfferRowsForSellerProduct(sb, pid, inferredSellerId);

  const offers = rows
    .map((raw) => {
      const row = { ...raw };
      const sid = trimString(row.seller_id);
      if (!sid && inferredSellerId) {
        row.seller_id = inferredSellerId;
      }
      return mapPriceOfferRow(row);
    })
    .filter((row): row is PriceOfferRow => Boolean(row));
  const items = await enrichPriceOffersToListItems(sb, offers);
  return { ok: true, value: items };
}

export async function listPriceOffers(
  sb: SupabaseClient,
  input: ListPriceOffersInput
): Promise<Ok<PriceOfferListItem[]> | Err> {
  const userId = trimString(input.userId);
  if (!userId) {
    return serviceError(401, offerServerT("offer_err_list_unauthorized"), "offer_list_unauthorized");
  }
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 100);
  const rawProductId = trimString(input.productId ?? "");
  const productId = normalizeOfferProductId(rawProductId);

  if (input.role === "seller" && productId) {
    return listSellerPriceOffersForProduct(sb, userId, productId);
  }

  if (input.role === "buyer" && productId) {
    const wantPid = normalizeOfferProductId(productId);
    const byOfferId = new Map<string, Record<string, unknown>>();

    const postRowForSeller =
      (await loadPostRowMinimalForOfferGate(sb, wantPid)) ?? (await fetchPostRowForTradeChatById(sb, wantPid));
    const inferredSellerId = postRowForSeller ? postTradeListingOwnerUserId(postRowForSeller) ?? "" : "";

    const pidCandidates = [
      ...new Set(
        [wantPid, rawProductId, ...uuidLookupCandidates(rawProductId || productId)].filter(
          (x) => typeof x === "string" && trimString(x) !== ""
        )
      ),
    ];

    const { data: inRows, error: inErr } = await sb
      .from("price_offers")
      .select(PRICE_OFFER_SELECT_READ)
      .eq("buyer_id", userId)
      .in("product_id", pidCandidates.length > 0 ? pidCandidates : [wantPid])
      .order("created_at", { ascending: false })
      .limit(limit);

    if (inErr) {
      return serviceError(500, inErr.message ?? offerServerT("offer_err_list_failed"), "offer_list_failed");
    }
    for (const raw of inRows ?? []) {
      const rid = trimString((raw as Record<string, unknown>).id);
      if (rid) byOfferId.set(rid, raw as Record<string, unknown>);
    }

    if (byOfferId.size === 0 && wantPid) {
      const scanLimit = 800;
      const { data: scanRows, error: scanErr } = await sb
        .from("price_offers")
        .select(PRICE_OFFER_SELECT_READ)
        .eq("buyer_id", userId)
        .order("created_at", { ascending: false })
        .limit(scanLimit);
      if (scanErr) {
        return serviceError(500, scanErr.message ?? offerServerT("offer_err_list_failed"), "offer_list_failed");
      }
      for (const raw of scanRows ?? []) {
        const row = raw as Record<string, unknown>;
        const rp = normalizeOfferProductId(row.product_id) || trimString(row.product_id);
        if (rp !== wantPid) continue;
        const rid = trimString(row.id);
        if (rid) byOfferId.set(rid, row);
      }
    }

    const rows = [...byOfferId.values()].sort((a, b) => {
      const tb = Date.parse(String((b as Record<string, unknown>).created_at ?? ""));
      const ta = Date.parse(String((a as Record<string, unknown>).created_at ?? ""));
      return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
    });
    const offers = rows
      .map((row) => {
        const r = { ...(row as Record<string, unknown>) };
        if (!trimString(r.seller_id) && inferredSellerId) {
          r.seller_id = inferredSellerId;
        }
        return mapPriceOfferRow(r);
      })
      .filter((row): row is PriceOfferRow => Boolean(row));
    const items = await enrichPriceOffersToListItems(sb, offers);
    return { ok: true, value: items };
  }

  let query = sb
    .from("price_offers")
    .select(PRICE_OFFER_SELECT_READ)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (input.role === "buyer") {
    query = query.eq("buyer_id", userId);
  } else {
    query = query.eq("seller_id", userId);
  }

  const { data, error } = await query;
  if (error) {
    return serviceError(500, error.message ?? offerServerT("offer_err_list_failed"), "offer_list_failed");
  }

  const offers = (data ?? [])
    .map((row) => mapPriceOfferRow(row as Record<string, unknown>))
    .filter((row): row is PriceOfferRow => Boolean(row));
  const items = await enrichPriceOffersToListItems(sb, offers);
  return { ok: true, value: items };
}

export async function acceptPriceOffer(
  sb: SupabaseClient,
  input: TransitionPriceOfferInput
): Promise<Ok<PriceOfferTransitionResult> | Err> {
  const actorUserId = trimString(input.actorUserId);
  const offerId = trimString(input.offerId);
  if (!actorUserId || !offerId) {
    return serviceError(400, offerServerT("offer_err_accept_invalid"), "offer_accept_invalid");
  }

  const offer = await loadOfferRowById(sb, offerId);
  if (!offer) {
    return serviceError(404, offerServerT("offer_err_not_found"), "offer_not_found");
  }
  if (offer.status !== "pending") {
    return serviceError(409, offerServerT("offer_err_accept_invalid_state"), "offer_accept_invalid_state");
  }

  const postRow = await loadPostRowForSellerOfferAction(sb, offer.product_id);
  if (!postRow || !sellerActorCanManageOffer(offer, actorUserId, postRow)) {
    return serviceError(403, offerServerT("offer_err_accept_forbidden"), "offer_accept_forbidden");
  }

  const post = await loadPostOfferContext(sb, offer.product_id);
  if (!post) {
    return serviceError(404, offerServerT("offer_err_accept_post_missing"), "offer_accept_post_missing");
  }
  if (post.isDeleted || post.isHidden || post.status === "sold") {
    return serviceError(409, offerServerT("offer_err_accept_product_closed"), "offer_accept_product_closed");
  }
  if (post.reservedBuyerId && post.reservedBuyerId !== offer.buyer_id) {
    return serviceError(409, offerServerT("offer_err_accept_reserved_other"), "offer_accept_reserved_other");
  }

  const updateRes = await sb
    .from("price_offers")
    .update({ status: "accepted" })
    .eq("id", offer.id)
    .eq("status", "pending")
    .select(PRICE_OFFER_SELECT_READ)
    .maybeSingle();

  const updatedOffer = updateRes.data ? mapPriceOfferRow(updateRes.data as Record<string, unknown>) : null;
  if (updateRes.error || !updatedOffer) {
    return serviceError(409, offerServerT("offer_err_accept_race_lost"), "offer_accept_race_lost");
  }

  let ensuredRoom: EnsureTradeChatRoomResult;
  try {
    ensuredRoom = await ensureTradeChatRoomForOffer(sb, {
      productId: offer.product_id,
      sellerId: post.sellerId,
      buyerId: offer.buyer_id,
    });
  } catch (error) {
    const revertRes = await sb
      .from("price_offers")
      .update({ status: "pending" })
      .eq("id", updatedOffer.id)
      .eq("status", "accepted");
    if (revertRes.error) {
      console.error("[price_offers] accept revert to pending failed after chat error", revertRes.error);
    }
    const message = error instanceof Error ? error.message : offerServerT("offer_err_chat_connect_failed");
    return serviceError(500, message, "offer_accept_chat_failed");
  }

  try {
    await Promise.all([
      insertAcceptedOfferSystemMessage(sb, {
        offerId: updatedOffer.id,
        productId: updatedOffer.product_id,
        sellerId: updatedOffer.seller_id,
        buyerId: updatedOffer.buyer_id,
        roomId: ensuredRoom.roomId,
        messengerRoomId: ensuredRoom.messengerRoomId,
        offeredPrice: updatedOffer.offered_price,
      }),
      notifyOfferAccepted(sb, {
        offer: updatedOffer,
        chatRoomId: ensuredRoom.roomId,
        chatRoomSource: ensuredRoom.roomSource,
      }),
    ]);
  } catch (e) {
    console.error("[price_offers] accept post-commit notify/message failed (offer already accepted, room ready)", e);
  }

  const [item] = await enrichPriceOffersToListItems(sb, [updatedOffer]);
  return {
    ok: true,
    value: {
      offer: item,
      chatRoomId: ensuredRoom.roomId,
      chatRoomSource: ensuredRoom.roomSource,
      messengerRoomId: ensuredRoom.messengerRoomId,
    },
  };
}

export async function rejectPriceOffer(
  sb: SupabaseClient,
  input: TransitionPriceOfferInput
): Promise<Ok<PriceOfferListItem> | Err> {
  const actorUserId = trimString(input.actorUserId);
  const offerId = trimString(input.offerId);
  if (!actorUserId || !offerId) {
    return serviceError(400, offerServerT("offer_err_reject_invalid"), "offer_reject_invalid");
  }

  const offer = await loadOfferRowById(sb, offerId);
  if (!offer) {
    return serviceError(404, offerServerT("offer_err_not_found"), "offer_not_found");
  }
  if (offer.status !== "pending") {
    return serviceError(409, offerServerT("offer_err_reject_invalid_state"), "offer_reject_invalid_state");
  }

  const postRowReject = await loadPostRowForSellerOfferAction(sb, offer.product_id);
  if (!postRowReject || !sellerActorCanManageOffer(offer, actorUserId, postRowReject)) {
    return serviceError(403, offerServerT("offer_err_reject_forbidden"), "offer_reject_forbidden");
  }

  const updateRes = await sb
    .from("price_offers")
    .update({ status: "rejected" })
    .eq("id", offer.id)
    .eq("status", "pending")
    .select(PRICE_OFFER_SELECT_READ)
    .maybeSingle();

  const updatedOffer = updateRes.data ? mapPriceOfferRow(updateRes.data as Record<string, unknown>) : null;
  if (updateRes.error || !updatedOffer) {
    return serviceError(409, offerServerT("offer_err_reject_race_lost"), "offer_reject_race_lost");
  }

  await notifyOfferRejected(sb, { offer: updatedOffer });
  const [item] = await enrichPriceOffersToListItems(sb, [updatedOffer]);
  return { ok: true, value: item };
}
