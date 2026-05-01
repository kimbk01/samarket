import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostWithMeta } from "@/lib/posts/schema";
import type { PostsReadClients } from "@/lib/supabase/resolve-posts-read-clients";
import type { ChatRoomSource } from "@/lib/types/chat";
import { loadPostDetailShared } from "@/lib/posts/load-post-detail-shared";
import { resolveViewerItemTradeRoom } from "@/lib/chats/resolve-viewer-item-trade-room";
import { loadTradeDetailRelatedBundle } from "./trade-related.service";
import { postAuthorUserId, postOwnedByUserId } from "@/lib/chats/resolve-author-nickname";
import { listPriceOffers, listSellerPriceOffersForProduct } from "@/lib/offers/offers.service";
import type { PriceOfferListItem } from "@/lib/offers/types";
import {
  mapProfileRowToPublicSeller,
  mapTestUserRowToPublicSeller,
  type PublicSellerProfileDTO,
} from "@/lib/users/map-profile-to-public-seller";
import {
  TRADE_SETTINGS_KEY,
  mergeTradeDetailOpsSettings,
} from "./trade-settings.service";

export type TradeItemDetailPageData = {
  item: PostWithMeta;
  sellerProfile?: PublicSellerProfileDTO | null;
  sellerItems: PostWithMeta[];
  similarItems: PostWithMeta[];
  ads: PostWithMeta[];
  /** RSC 쿠키 세션 — 클라 `getCurrentUserIdForDb` 보다 앞서 소유자 UI 시드 */
  viewerUserId: string | null;
  /** 본인 글·가격 제안 상품일 때만 서버에서 선로드(첫 페인트 즉시 표시) */
  initialSellerPriceOffers?: PriceOfferListItem[];
  /**
   * 로그인 뷰어 기준 거래방 시드 — 클라에서 `GET /api/chat/item/room-id` 1회 생략.
   * 비로그인이면 생략(undefined).
   */
  viewerTradeRoomBootstrap?: {
    viewerUserId: string;
    /** 부트스트랩·프리웜용 `chat_rooms.id` 또는 `product_chats.id` */
    roomId: string | null;
    source: ChatRoomSource | null;
    /** 있으면 메신저 방 URL은 이 UUID 우선 */
    messengerRoomId?: string | null;
  };
  /** 타인 글·가격제안 허용 시 구매자 본인 제안 목록 시드(판매자 프로필과 병렬 — 첫 페인트 CTA 즉시) */
  initialViewerBuyerOffers?: PriceOfferListItem[];
};

const SELLER_LIMIT_DEFAULT = 8;
const SIMILAR_LIMIT_DEFAULT = 8;
const ADS_LIMIT_DEFAULT = 8;

async function loadSellerPublicProfile(
  clients: PostsReadClients,
  userId: string
): Promise<PublicSellerProfileDTO | null> {
  const sellerId = userId.trim();
  if (!sellerId) return null;
  const profileSelect =
    "id, nickname, username, avatar_url, trust_score, manner_score, manner_temperature";
  const fallbacks = [clients.serviceSb, clients.readSb].filter(Boolean);
  for (const sb of fallbacks) {
    const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;
    let { data: prof, error: profErr } = await sbAny
      .from("profiles")
      .select(profileSelect)
      .eq("id", sellerId)
      .maybeSingle();

    if (
      profErr &&
      /column|does not exist|schema cache|Could not find/i.test(String(profErr.message ?? ""))
    ) {
      const retry = await sbAny
        .from("profiles")
        .select("id, nickname, username, avatar_url")
        .eq("id", sellerId)
        .maybeSingle();
      prof = retry.data as typeof prof;
      profErr = retry.error;
    }

    if (!profErr && prof && typeof (prof as { id?: string }).id === "string") {
      const profile = mapProfileRowToPublicSeller(prof as Record<string, unknown>);
      if (!profile.id) break;
      return profile;
    }

    const { data: testRow } = await sbAny
      .from("test_users")
      .select("id, display_name, username")
      .eq("id", sellerId)
      .maybeSingle();
    if (testRow && typeof (testRow as { id?: string }).id === "string") {
      return mapTestUserRowToPublicSeller(testRow as Record<string, unknown>);
    }
  }
  return null;
}

async function loadTradeOpsSettings(clients: PostsReadClients) {
  const sb = clients.serviceSb ?? clients.readSb;
  const { data } = await sb
    .from("admin_settings")
    .select("value_json")
    .eq("key", TRADE_SETTINGS_KEY)
    .maybeSingle();
  const raw = (data as { value_json?: Record<string, unknown> } | null)?.value_json;
  return mergeTradeDetailOpsSettings(raw ?? {});
}

export async function getTradeDetailRelatedData(
  clients: PostsReadClients,
  input: {
    itemId: string;
    viewerUserId: string | null;
    sellerLimit?: number;
    similarLimit?: number;
    adsLimit?: number;
  }
): Promise<{ sellerItems: PostWithMeta[]; similarItems: PostWithMeta[]; ads: PostWithMeta[] } | null> {
  const itemId = input.itemId.trim();
  if (!itemId) return null;
  const [item, ops] = await Promise.all([
    loadPostDetailShared(clients, itemId, input.viewerUserId),
    loadTradeOpsSettings(clients),
  ]);
  if (!item || item.type === "community") {
    return { sellerItems: [], similarItems: [], ads: [] };
  }
  const sellerId =
    (typeof item.user_id === "string" && item.user_id.trim() ? item.user_id.trim() : "") ||
    postAuthorUserId(item as unknown as Record<string, unknown>) ||
    "";
  const sellerNickname = typeof item.author_nickname === "string" ? item.author_nickname.trim() : "";
  const categoryId = item.category_id?.trim() ?? item.trade_category_id?.trim() ?? "";
  const regionId = item.region?.trim() ?? "";
  const sellerLimit = input.sellerLimit ?? ops.fallbackCount ?? SELLER_LIMIT_DEFAULT;
  const similarLimit = input.similarLimit ?? ops.similarCount ?? SIMILAR_LIMIT_DEFAULT;
  const adsLimit = input.adsLimit ?? ops.adsCount ?? ADS_LIMIT_DEFAULT;
  return loadTradeDetailRelatedBundle(clients.readSb, {
    itemId,
    sellerId,
    sellerNickname,
    categoryId,
    regionId,
    sellerLimit,
    similarLimit,
    adsLimit,
    regionEnabled: ops.regionEnabled,
    regionRequired: ops.regionRequired,
    regionGroups: ops.regionGroups,
    completedVisibleDays: ops.completedVisibleDays,
  });
}

export async function getItemDetailPageData(
  clients: PostsReadClients,
  input: {
    itemId: string;
    viewerUserId: string | null;
    sellerLimit?: number;
    similarLimit?: number;
    adsLimit?: number;
  }
): Promise<TradeItemDetailPageData | null> {
  const itemId = input.itemId.trim();
  if (!itemId) return null;

  const item = await loadPostDetailShared(clients, itemId, input.viewerUserId);
  if (!item) return null;

  const viewerId = input.viewerUserId?.trim() ?? "";

  if (item.type === "community") {
    return {
      item,
      sellerItems: [],
      similarItems: [],
      ads: [],
      viewerUserId: viewerId || null,
    };
  }

  const sellerId =
    (typeof item.user_id === "string" && item.user_id.trim() ? item.user_id.trim() : "") ||
    postAuthorUserId(item as unknown as Record<string, unknown>) ||
    "";
  const sellerNickname = typeof item.author_nickname === "string" ? item.author_nickname.trim() : "";
  const categoryId = item.category_id?.trim() ?? item.trade_category_id?.trim() ?? "";
  const regionId = item.region?.trim() ?? "";
  const sbOffers = (clients.serviceSb ?? clients.readSb) as SupabaseClient;
  const seedBuyerOffers =
    Boolean(viewerId) &&
    item.is_price_offer === true &&
    typeof item.price === "number" &&
    Number.isFinite(item.price) &&
    item.price > 0 &&
    !postOwnedByUserId(item as unknown as Record<string, unknown>, viewerId);

  const seedSellerOffers =
    Boolean(viewerId) &&
    item.is_price_offer === true &&
    typeof item.price === "number" &&
    Number.isFinite(item.price) &&
    item.price > 0 &&
    postOwnedByUserId(item as unknown as Record<string, unknown>, viewerId);

  type BuyerOffersResult = Awaited<ReturnType<typeof listPriceOffers>>;
  const buyerOffersPromise: Promise<BuyerOffersResult | null> = seedBuyerOffers
    ? listPriceOffers(sbOffers, {
        userId: viewerId,
        role: "buyer",
        productId: item.id,
        limit: 50,
      })
    : Promise.resolve(null);

  type SellerOffersResult = Awaited<ReturnType<typeof listSellerPriceOffersForProduct>>;
  const sellerOffersPromise: Promise<SellerOffersResult | null> = seedSellerOffers
    ? listSellerPriceOffersForProduct(sbOffers, viewerId, item.id)
    : Promise.resolve(null);

  const opsPromise = loadTradeOpsSettings(clients);
  const relatedPromise = opsPromise
    .then((ops) =>
      loadTradeDetailRelatedBundle(clients.readSb, {
        itemId: item.id,
        sellerId,
        sellerNickname,
        categoryId,
        regionId,
        sellerLimit: ops.fallbackCount ?? SELLER_LIMIT_DEFAULT,
        similarLimit: ops.similarCount ?? SIMILAR_LIMIT_DEFAULT,
        adsLimit: ops.adsCount ?? ADS_LIMIT_DEFAULT,
        regionEnabled: ops.regionEnabled,
        regionRequired: ops.regionRequired,
        regionGroups: ops.regionGroups,
        completedVisibleDays: ops.completedVisibleDays,
      })
    )
    .catch((err) => {
      console.error("[getItemDetailPageData] loadTradeDetailRelatedBundle", err);
      return { sellerItems: [] as PostWithMeta[], similarItems: [] as PostWithMeta[], ads: [] as PostWithMeta[] };
    });

  const sbChat = clients.serviceSb ?? clients.readSb;
  const viewerTradeRoomBootstrapPromise: Promise<
    TradeItemDetailPageData["viewerTradeRoomBootstrap"]
  > =
    Boolean(viewerId) && Boolean(sellerId) && viewerId !== sellerId && sbChat
      ? resolveViewerItemTradeRoom(sbChat as SupabaseClient, {
          itemId: item.id,
          viewerUserId: viewerId,
          sellerId,
        })
          .then((resolved) => ({
            viewerUserId: viewerId,
            roomId: resolved.roomId,
            source: resolved.source,
            messengerRoomId: resolved.messengerRoomId ?? undefined,
          }))
          .catch((err) => {
            console.error("[getItemDetailPageData] resolveViewerItemTradeRoom", err);
            return undefined;
          })
      : Promise.resolve(undefined);

  const [sellerProfile, buyerOffersResult, sellerOffersResult, related, viewerTradeRoomBootstrap] =
    await Promise.all([
      loadSellerPublicProfile(clients, sellerId),
      buyerOffersPromise,
      sellerOffersPromise,
      relatedPromise,
      viewerTradeRoomBootstrapPromise,
    ]);

  const initialViewerBuyerOffers =
    buyerOffersResult && buyerOffersResult.ok ? buyerOffersResult.value : undefined;

  const initialSellerPriceOffers =
    sellerOffersResult && sellerOffersResult.ok ? sellerOffersResult.value : undefined;

  return {
    item,
    sellerProfile,
    sellerItems: related.sellerItems,
    similarItems: related.similarItems,
    ads: related.ads,
    viewerUserId: viewerId || null,
    viewerTradeRoomBootstrap,
    initialSellerPriceOffers,
    initialViewerBuyerOffers,
  };
}
