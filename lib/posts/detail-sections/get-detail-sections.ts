import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostWithMeta } from "@/lib/posts/schema";
import type { CategoryLite, DetailSectionDTO } from "./types";
import { toListingDetailInput } from "./map-to-listing-input";
import { buildSellerSection } from "./build-seller-section";
import { buildRelatedSection } from "./build-related-section";
import { buildAdSection } from "./build-ad-section";
import { devLogDetailSection } from "./dev-log";

export type GetDetailSectionsResult = {
  sections: DetailSectionDTO[];
};

/**
 * 상품 상세 하단 3섹션 — 각각 독립 try, 실패 시 해당 섹션만 생략.
 */
export async function getDetailSections(
  sb: SupabaseClient,
  post: PostWithMeta,
  category: CategoryLite | null
): Promise<GetDetailSectionsResult> {
  if (post.type === "community") {
    devLogDetailSection("detail_sections", "skip_community_post");
    return { sections: [] };
  }

  const input = toListingDetailInput(post, category);
  const sections: DetailSectionDTO[] = [];

  try {
    const items = await buildSellerSection(sb, input);
    if (items.length > 0) {
      sections.push({ key: "seller_items", title: "판매자의 다른 물품", items });
    } else {
      devLogDetailSection("seller_items", "omitted_empty");
    }
  } catch (e) {
    devLogDetailSection("seller_items", "failed", { message: String(e) });
  }

  try {
    const items = await buildRelatedSection(sb, input);
    if (items.length > 0) {
      sections.push({ key: "related_items", title: "이런 상품은 어때요?", items });
    } else {
      devLogDetailSection("related_items", "omitted_empty");
    }
  } catch (e) {
    devLogDetailSection("related_items", "failed", { message: String(e) });
  }

  try {
    const items = await buildAdSection(sb, input);
    if (items.length > 0) {
      sections.push({ key: "ad_items", title: "추천 광고", items });
    } else {
      devLogDetailSection("ad_items", "omitted_empty");
    }
  } catch (e) {
    devLogDetailSection("ad_items", "failed", { message: String(e) });
  }

  return { sections };
}
