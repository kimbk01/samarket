import { withTimeout } from "@/lib/async/with-timeout";
import type { PostWithMeta } from "@/lib/posts/schema";
import { resolvePostsReadClientsForServerComponent } from "@/lib/supabase/resolve-posts-read-clients";
import { getTradeDetailRelatedData } from "@/services/trade/trade-detail.service";
import { PostDetailRelatedSections } from "@/components/post/PostDetailRelatedSections";

const RELATED_SLOT_BUDGET_MS = 25_000;

/**
 * 거래 상세 related 전용 RSC 슬롯 — `getItemDetailPageData` 첫 블록과 분리해 스트리밍.
 * 계약: `getTradeDetailRelatedData` 경유만( trade-post-detail-chat-hot-path.mdc ).
 */
export async function PostDetailRelatedDeferredLoader({
  viewerUserId,
  preloadedItem,
}: {
  viewerUserId: string | null;
  preloadedItem: PostWithMeta;
}) {
  const clients = await resolvePostsReadClientsForServerComponent();
  if (!clients) return null;

  const itemId = preloadedItem.id?.trim() ?? "";
  if (!itemId) return null;

  let pack: { sellerItems: PostWithMeta[]; similarItems: PostWithMeta[]; ads: PostWithMeta[] };
  try {
    const raw = await withTimeout(
      getTradeDetailRelatedData(clients, {
        itemId,
        viewerUserId: viewerUserId?.trim() || null,
        preloadedItem,
      }),
      RELATED_SLOT_BUDGET_MS,
      "trade_detail_related_slot_timeout"
    );
    if (!raw) return null;
    pack = raw;
  } catch (err) {
    console.error("[PostDetailRelatedDeferredLoader]", err);
    return null;
  }

  return (
    <PostDetailRelatedSections
      sellerItems={pack.sellerItems}
      similarItems={pack.similarItems}
      ads={pack.ads}
    />
  );
}
