import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostWithMeta } from "@/lib/posts/schema";
import type { DetailSectionItem, ListingDetailInput, ServiceSegment } from "./types";
import { postToDetailItem } from "./detail-item-map";
import { devLogDetailSection } from "./dev-log";
import { mapTradeRow, sellerListBaseQuery } from "./queries/active-trade-posts";
import { postAuthorUserId } from "@/lib/chats/resolve-author-nickname";

const SELLER_LIMIT = 9;
const FETCH_MAX = 48;

function sellerPriorityScore(anchor: PostWithMeta, p: PostWithMeta, segment: ServiceSegment): number {
  let s = 0;
  const aid = anchor.category_id ?? (anchor as unknown as { trade_category_id?: string }).trade_category_id;
  const pid = p.category_id ?? (p as unknown as { trade_category_id?: string }).trade_category_id;
  if (aid && pid && String(aid) === String(pid)) s += 1_000_000;
  const at = anchor.type ?? "trade";
  const pt = p.type ?? "trade";
  if (at === pt) s += 100_000;

  const am = (anchor.meta ?? {}) as Record<string, unknown>;
  const pm = (p.meta ?? {}) as Record<string, unknown>;

  switch (segment) {
    case "car":
      if (am.car_model && pm.car_model && String(am.car_model) === String(pm.car_model)) s += 50_000;
      break;
    case "real_estate":
      if (am.deal_type && pm.deal_type && String(am.deal_type) === String(pm.deal_type)) s += 40_000;
      if (am.estate_type && pm.estate_type && String(am.estate_type) === String(pm.estate_type)) s += 20_000;
      break;
    case "exchange":
      if (
        am.from_currency &&
        pm.from_currency &&
        am.to_currency &&
        pm.to_currency &&
        String(am.from_currency) === String(pm.from_currency) &&
        String(am.to_currency) === String(pm.to_currency)
      ) {
        s += 60_000;
      }
      break;
    case "job":
      if (am.work_category && pm.work_category && String(am.work_category) === String(pm.work_category)) s += 45_000;
      break;
    default:
      break;
  }

  const t = new Date(p.created_at).getTime();
  return s + t / 1e15;
}

/**
 * 판매자의 다른 물품 — same seller, 현재 글 제외, 세그먼트별 가중 정렬.
 */
export async function buildSellerSection(
  sb: SupabaseClient,
  input: ListingDetailInput
): Promise<DetailSectionItem[]> {
  const anchor = input.post;
  const sellerId = postAuthorUserId(anchor as unknown as Record<string, unknown>)?.trim();
  if (!sellerId) {
    devLogDetailSection("seller_items", "no_seller_id");
    return [];
  }

  try {
    const { data, error } = await sellerListBaseQuery(sb, sellerId, anchor.id)
      .order("created_at", { ascending: false })
      .limit(FETCH_MAX);

    if (error || !Array.isArray(data)) {
      devLogDetailSection("seller_items", "query_error", { message: error?.message });
      return [];
    }

    const rows = data as Record<string, unknown>[];
    const posts = rows.map(mapTradeRow).filter((p) => p.id !== anchor.id);

    if (posts.length === 0) {
      devLogDetailSection("seller_items", "empty_after_exclude");
      return [];
    }

    const seg = input.segment;
    const sorted = [...posts].sort(
      (a, b) => sellerPriorityScore(anchor, b, seg) - sellerPriorityScore(anchor, a, seg)
    );

    return sorted.slice(0, SELLER_LIMIT).map((p) => postToDetailItem(p));
  } catch (e) {
    devLogDetailSection("seller_items", "exception", { message: String(e) });
    return [];
  }
}
