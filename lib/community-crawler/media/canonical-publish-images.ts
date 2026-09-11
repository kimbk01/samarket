/**
 * Map current community_crawl_item_media → canonical publish image payload.
 * COVER first (sort 0), then BODY in article order.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { listCurrentCrawlItemMedia } from "@/lib/community-crawler/media/item-media-store";
import type { CanonicalPublishImage } from "@/lib/community-crawler/publish-full-content";

export async function loadCanonicalPublishImagesFromItemMedia(
  sb: SupabaseClient,
  crawlItemId: string
): Promise<CanonicalPublishImage[]> {
  const rows = await listCurrentCrawlItemMedia(sb, crawlItemId);
  const cover = rows.find((r) => r.role === "COVER" && r.public_url);
  const bodies = rows
    .filter((r) => r.role === "BODY" && r.public_url)
    .sort((a, b) => a.sort_order - b.sort_order);

  const out: CanonicalPublishImage[] = [];
  if (cover?.public_url) {
    out.push({
      imageUrl: cover.public_url,
      storagePath: cover.storage_path,
      sortOrder: 0,
    });
  }
  let sort = cover ? 1 : 0;
  for (const body of bodies) {
    if (!body.public_url) continue;
    if (cover?.public_url && body.public_url === cover.public_url) continue;
    out.push({
      imageUrl: body.public_url,
      storagePath: body.storage_path,
      sortOrder: sort++,
    });
  }
  return out;
}
