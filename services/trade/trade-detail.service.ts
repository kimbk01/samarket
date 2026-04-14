import type { PostWithMeta } from "@/lib/posts/schema";
import type { PostsReadClients } from "@/lib/supabase/resolve-posts-read-clients";
import { loadPostDetailShared } from "@/lib/posts/load-post-detail-shared";
import { loadTradeDetailRelatedBundle } from "./trade-related.service";
import { postAuthorUserId } from "@/lib/chats/resolve-author-nickname";
import {
  TRADE_SETTINGS_KEY,
  mergeTradeDetailOpsSettings,
} from "./trade-settings.service";

export type TradeItemDetailPageData = {
  item: PostWithMeta;
  sellerItems: PostWithMeta[];
  similarItems: PostWithMeta[];
  ads: PostWithMeta[];
};

const SELLER_LIMIT_DEFAULT = 8;
const SIMILAR_LIMIT_DEFAULT = 8;
const ADS_LIMIT_DEFAULT = 8;

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

  const item = await loadPostDetailShared(clients, itemId, input.viewerUserId);
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
  const ops = await loadTradeOpsSettings(clients);
  const sellerLimit = input.sellerLimit ?? ops.fallbackCount ?? SELLER_LIMIT_DEFAULT;
  const similarLimit = input.similarLimit ?? ops.similarCount ?? SIMILAR_LIMIT_DEFAULT;
  const adsLimit = input.adsLimit ?? ops.adsCount ?? ADS_LIMIT_DEFAULT;

  const related = await loadTradeDetailRelatedBundle(clients.readSb, {
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
  if (process.env.NODE_ENV !== "production") {
    // 로컬 문제 재현 시 원인 추적: seller/similar/ads가 왜 비는지 확인
    console.info("[trade-detail-related]", {
      itemId,
      sellerId,
      sellerNickname,
      counts: {
        seller: related.sellerItems.length,
        similar: related.similarItems.length,
        ads: related.ads.length,
      },
    });
  }

  return {
    item,
    sellerItems: related.sellerItems,
    similarItems: related.similarItems,
    ads: related.ads,
  };
}
