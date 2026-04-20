import type { PostWithMeta } from "@/lib/posts/schema";
import type { PostsReadClients } from "@/lib/supabase/resolve-posts-read-clients";
import type { ChatRoomSource } from "@/lib/types/chat";
import { getUserAddressDefaults } from "@/lib/addresses/user-address-service";
import { buildTradeLocationPreviewForPublic } from "@/lib/addresses/user-address-format";
import { loadPostDetailShared } from "@/lib/posts/load-post-detail-shared";
import { loadTradeDetailRelatedBundle } from "./trade-related.service";
import { postAuthorUserId } from "@/lib/chats/resolve-author-nickname";
import { resolveViewerItemTradeRoom } from "@/lib/chats/resolve-viewer-item-trade-room";
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
      let tradeLocationLine: string | null = null;
      try {
        const defaults = await getUserAddressDefaults(sbAny, sellerId);
        tradeLocationLine = buildTradeLocationPreviewForPublic(defaults.trade);
      } catch {
        /* ignore optional address fallback */
      }
      return { ...profile, tradeLocationLine };
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

  const [item, ops] = await Promise.all([
    loadPostDetailShared(clients, itemId, input.viewerUserId),
    loadTradeOpsSettings(clients),
  ]);
  if (!item) return null;
  if (item.type === "community") {
    return {
      item,
      sellerItems: [],
      similarItems: [],
      ads: [],
    };
  }

  const sellerId =
    (typeof item.user_id === "string" && item.user_id.trim() ? item.user_id.trim() : "") ||
    postAuthorUserId(item as unknown as Record<string, unknown>) ||
    "";
  const sellerNickname = typeof item.author_nickname === "string" ? item.author_nickname.trim() : "";
  const categoryId = item.category_id?.trim() ?? item.trade_category_id?.trim() ?? "";
  const regionId = item.region?.trim() ?? "";
  const viewerId = input.viewerUserId?.trim() ?? "";
  const sb = clients.readSb ?? clients.serviceSb;
  const viewerRoomPromise =
    viewerId && sellerId && viewerId !== sellerId && sb
      ? resolveViewerItemTradeRoom(sb, {
          itemId,
          viewerUserId: viewerId,
          sellerId,
        })
      : Promise.resolve({ roomId: null, source: null, messengerRoomId: null });

  const sellerLimit = input.sellerLimit ?? ops.fallbackCount ?? SELLER_LIMIT_DEFAULT;
  const similarLimit = input.similarLimit ?? ops.similarCount ?? SIMILAR_LIMIT_DEFAULT;
  const adsLimit = input.adsLimit ?? ops.adsCount ?? ADS_LIMIT_DEFAULT;

  const relatedPromise = loadTradeDetailRelatedBundle(clients.readSb, {
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

  const [viewerRoomRow, related, sellerProfile] = await Promise.all([
    viewerRoomPromise,
    relatedPromise,
    loadSellerPublicProfile(clients, sellerId),
  ]);

  const viewerTradeRoomBootstrap: TradeItemDetailPageData["viewerTradeRoomBootstrap"] =
    viewerId && sellerId && viewerId !== sellerId
      ? {
          viewerUserId: viewerId,
          roomId: viewerRoomRow.roomId,
          source: viewerRoomRow.source,
          ...(viewerRoomRow.messengerRoomId
            ? { messengerRoomId: viewerRoomRow.messengerRoomId }
            : {}),
        }
      : undefined;

  return {
    item,
    sellerProfile,
    sellerItems: related.sellerItems,
    similarItems: related.similarItems,
    ads: related.ads,
    viewerTradeRoomBootstrap,
  };
}
