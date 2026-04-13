import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostWithMeta } from "@/lib/posts/schema";
import type { DetailSectionItem, ListingDetailInput } from "./types";
import { postToDetailItem } from "./detail-item-map";
import { devLogDetailSection } from "./dev-log";
import { mapTradeRow } from "./queries/active-trade-posts";
import { POST_TRADE_LIST_SELECT } from "@/lib/posts/trade-posts-range-query";
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import type { ServiceSegment } from "./types";

const AD_LIMIT = 6;

type AdCandRow = {
  trade_ad_id: string;
  post_id: string;
  priority: number;
  ad_product_id: string | null;
};

function adMatchScore(
  anchor: PostWithMeta,
  post: PostWithMeta,
  segment: ServiceSegment,
  placementOk: boolean
): number {
  if (!placementOk) return -1;
  let s = Number(anchor.category_id === post.category_id ? 5000 : 0);
  s += Number(anchor.region && post.region && anchor.region === post.region ? 2000 : 0);
  if (segment !== "used") {
    s += 100;
  }
  return s;
}

/**
 * 광고 전용 슬롯 — trade_post_ads + 활성 기간 + (선택) ad_products.placement=detail_bottom
 */
export async function buildAdSection(
  sb: SupabaseClient,
  input: ListingDetailInput
): Promise<DetailSectionItem[]> {
  const anchor = input.post;

  try {
    const { data: cands, error } = await sb
      .from("v_trade_detail_ad_candidates")
      .select("trade_ad_id, post_id, priority, ad_product_id")
      .order("priority", { ascending: false })
      .limit(48);

    if (error) {
      devLogDetailSection("ad_items", "view_or_query_error", { message: error.message });
      return [];
    }
    if (!Array.isArray(cands) || cands.length === 0) {
      devLogDetailSection("ad_items", "no_candidates");
      return [];
    }

    const productIds = [
      ...new Set(
        (cands as AdCandRow[])
          .map((c) => c.ad_product_id)
          .filter((x): x is string => typeof x === "string" && x.length > 0)
      ),
    ];

    const placementByProduct = new Map<string, string | null>();
    if (productIds.length > 0) {
      const { data: prods } = await sb.from("ad_products").select("id, placement").in("id", productIds);
      if (Array.isArray(prods)) {
        for (const p of prods as { id?: string; placement?: string | null }[]) {
          if (p?.id) placementByProduct.set(p.id, p.placement ?? null);
        }
      }
    }

    const postIds = (cands as AdCandRow[])
      .map((c) => c.post_id)
      .filter((id) => id && id !== anchor.id);

    if (postIds.length === 0) {
      devLogDetailSection("ad_items", "only_self_or_empty");
      return [];
    }

    const { data: postRows, error: pe } = await sb
      .from(POSTS_TABLE_READ)
      .select(POST_TRADE_LIST_SELECT)
      .in("id", [...new Set(postIds)]);

    if (pe || !Array.isArray(postRows)) {
      devLogDetailSection("ad_items", "posts_load_error", { message: pe?.message });
      return [];
    }

    const postsById = new Map<string, PostWithMeta>();
    for (const r of postRows as Record<string, unknown>[]) {
      const p = mapTradeRow(r);
      postsById.set(p.id, p);
    }

    const seg = input.segment;
    const scored: { item: DetailSectionItem; score: number; pr: number }[] = [];

    for (const c of cands as AdCandRow[]) {
      if (c.post_id === anchor.id) continue;
      const p = postsById.get(c.post_id);
      if (!p) continue;
      if (p.status === "hidden" || p.status === "sold") continue;

      const pl = c.ad_product_id ? placementByProduct.get(c.ad_product_id) : null;
      const placementOk = pl == null || pl === "detail_bottom";

      const score = adMatchScore(anchor, p, seg, placementOk);
      if (score < 0) continue;

      scored.push({
        item: postToDetailItem(p, { isAd: true }),
        score: score + c.priority,
        pr: c.priority,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    const out = scored.slice(0, AD_LIMIT).map((x) => x.item);
    if (out.length === 0) devLogDetailSection("ad_items", "filtered_to_empty");
    return out;
  } catch (e) {
    devLogDetailSection("ad_items", "exception", { message: String(e) });
    return [];
  }
}
