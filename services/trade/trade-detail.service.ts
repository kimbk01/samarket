import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostWithMeta } from "@/lib/posts/schema";
import type { PostsReadClients } from "@/lib/supabase/resolve-posts-read-clients";
import type { ChatRoomSource } from "@/lib/types/chat";
import { loadPostDetailShared } from "@/lib/posts/load-post-detail-shared";
import { loadTradeDetailRelatedBundle } from "./trade-related.service";
import { postAuthorUserId, postOwnedByUserId } from "@/lib/chats/resolve-author-nickname";
import { listPriceOffers } from "@/lib/offers/offers.service";
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

/**
 * 거래 상세 RSC 계약 — 재발 방지
 *
 * - 첫 응답(`getItemDetailPageData`): 본문·판매자 프로필·(조건부) 구매자 제안까지 **직렬+병렬 1차 블록**에서 완료.
 * - **related**(판매자 다른 글·유사·광고)는 **동일 페이지의 RSC `Suspense` 슬롯**에서 `getTradeDetailRelatedData` 로만 채운다(첫 바이트에서 related DB를 기다리지 않음). 클라 `/api/.../related` 단독 첫 페인트 금지 원칙은 동일.
 * - 거래방 시드·판매자 제안 RSC 선로드는 이 타입에 포함하지 않는다(핫패스 계약).
 * - related 슬롯은 본문과 **동일** `PostWithMeta` 를 `preloadedItem` 으로 넘겨 `loadPostDetailShared` 중복을 피한다.
 * - `GET /api/posts/[postId]/related` 는 보조 — 상세 related 데이터는 RSC(스트림 슬롯 또는 번들)를 신뢰한다.
 *
 * 상세 규칙: `.cursor/rules/trade-post-detail-chat-hot-path.mdc`
 */
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
    /** `getItemDetailPageData` 등에서 이미 로드한 본문 — 중복 조회 제거·related 스냅샷 일치 */
    preloadedItem?: PostWithMeta | null;
  }
): Promise<{ sellerItems: PostWithMeta[]; similarItems: PostWithMeta[]; ads: PostWithMeta[] } | null> {
  const itemId = input.itemId.trim();
  if (!itemId) return null;
  const opsPromise = loadTradeOpsSettings(clients);
  const itemPromise =
    input.preloadedItem?.id?.trim() === itemId
      ? Promise.resolve(input.preloadedItem)
      : loadPostDetailShared(clients, itemId, input.viewerUserId);
  const [item, ops] = await Promise.all([itemPromise, opsPromise]);
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
  // related 는 `loadTradeDetailRelatedBundle` 직접 호출 금지 — `getTradeDetailRelatedData` 로만 묶는다.
  // 첫 응답: 본문+판매자+구매자 제안만 await — related 는 `app/(main)/post/[id]/page.tsx` 의 RSC Suspense 슬롯에서
  // `getTradeDetailRelatedData` 로 스트리밍(클라 related 단독 의존 금지 계약 유지).

  const itemId = input.itemId.trim();
  if (!itemId) return null;

  const item = await loadPostDetailShared(clients, itemId, input.viewerUserId);
  if (!item) {
    return null;
  }

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
  const sbOffers = (clients.serviceSb ?? clients.readSb) as SupabaseClient;
  const seedBuyerOffers =
    Boolean(viewerId) &&
    item.is_price_offer === true &&
    typeof item.price === "number" &&
    Number.isFinite(item.price) &&
    item.price > 0 &&
    !postOwnedByUserId(item as unknown as Record<string, unknown>, viewerId);

  type BuyerOffersResult = Awaited<ReturnType<typeof listPriceOffers>>;
  const buyerOffersPromise: Promise<BuyerOffersResult | null> = seedBuyerOffers
    ? listPriceOffers(sbOffers, {
        userId: viewerId,
        role: "buyer",
        productId: item.id,
        limit: 50,
      })
    : Promise.resolve(null);

  const [sellerProfile, buyerOffersResult] = await Promise.all([
    loadSellerPublicProfile(clients, sellerId),
    buyerOffersPromise,
  ]);

  const rel = {
    sellerItems: [] as PostWithMeta[],
    similarItems: [] as PostWithMeta[],
    ads: [] as PostWithMeta[],
  };

  const initialViewerBuyerOffers =
    buyerOffersResult && buyerOffersResult.ok ? buyerOffersResult.value : undefined;

  return {
    item,
    sellerProfile,
    sellerItems: rel.sellerItems,
    similarItems: rel.similarItems,
    ads: rel.ads,
    viewerUserId: viewerId || null,
    initialViewerBuyerOffers,
  };
}
