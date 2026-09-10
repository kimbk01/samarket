/**
 * Admin ops DTO enrichment for crawl items (PHASE D).
 * Thumbnail authority: durable COVER media only — never hotlink source_cover_candidate_url.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommunityCrawlItemRow } from "@/lib/community-crawler/crawl-ssot";
import { resolveCanonicalThumbImageUrl } from "@/lib/media/canonical-image-resolver";

export type CommunityCrawlItemOpsDto = CommunityCrawlItemRow & {
  source_name: string | null;
  topic_name: string | null;
  /** Canonical thumb from durable COVER media; null → Admin fallback (no broken img). */
  thumb_url: string | null;
  media_status: "DURABLE_COVER" | "NO_MEDIA" | "CANDIDATE_ONLY";
  published: boolean;
};

export async function enrichCommunityCrawlItemsForAdmin(
  sb: SupabaseClient,
  items: CommunityCrawlItemRow[]
): Promise<CommunityCrawlItemOpsDto[]> {
  if (!items.length) return [];

  const sourceIds = [...new Set(items.map((i) => i.source_id))];
  const topicIds = [...new Set(items.map((i) => i.target_topic_id))];
  const itemIds = items.map((i) => i.id);

  const [{ data: sources }, { data: topics }, mediaRes] = await Promise.all([
    sb.from("community_crawl_sources").select("id,name").in("id", sourceIds),
    sb.from("community_topics").select("id,name").in("id", topicIds),
    sb
      .from("community_crawl_item_media")
      .select("crawl_item_id,public_url,storage_path,is_current,role")
      .in("crawl_item_id", itemIds)
      .eq("role", "COVER")
      .eq("is_current", true),
  ]);

  const sourceName = new Map<string, string>();
  for (const r of sources ?? []) {
    sourceName.set(String((r as { id: string }).id), String((r as { name: string }).name ?? ""));
  }
  const topicName = new Map<string, string>();
  for (const r of topics ?? []) {
    topicName.set(String((r as { id: string }).id), String((r as { name: string }).name ?? ""));
  }

  const coverByItem = new Map<string, string>();
  // media table may be missing on older envs — treat as empty
  if (!mediaRes.error) {
    for (const r of mediaRes.data ?? []) {
      const row = r as { crawl_item_id: string; public_url: string | null; storage_path: string };
      const raw = row.public_url?.trim() || null;
      if (raw) coverByItem.set(String(row.crawl_item_id), raw);
    }
  }

  return items.map((it) => {
    const durable = coverByItem.get(it.id) ?? null;
    const thumb = durable ? resolveCanonicalThumbImageUrl(durable) : null;
    const hasCandidate = Boolean(it.source_cover_candidate_url?.trim());
    let media_status: CommunityCrawlItemOpsDto["media_status"] = "NO_MEDIA";
    if (thumb) media_status = "DURABLE_COVER";
    else if (hasCandidate) media_status = "CANDIDATE_ONLY";

    return {
      ...it,
      source_name: sourceName.get(it.source_id) ?? null,
      topic_name: topicName.get(it.target_topic_id) ?? null,
      thumb_url: thumb,
      media_status,
      published: it.status === "PUBLISHED" || Boolean(it.published_post_id),
    };
  });
}
