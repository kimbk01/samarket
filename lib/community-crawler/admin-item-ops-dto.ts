/**
 * Admin ops DTO enrichment for crawl items (PHASE D / V2-3 media status).
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
  media_status: "DURABLE_COVER" | "NO_MEDIA" | "CANDIDATE_ONLY" | "NO_VALID_IMAGE";
  /** Current BODY media count (durable). */
  body_media_count: number;
  published: boolean;
  /** Source content policy — publish CTA honesty (≠ media_policy). */
  source_policy_status: string | null;
  source_media_policy: string | null;
  /** True only when content policy ALLOWED and item not terminal. Writer unchanged. */
  publish_cta_eligible: boolean;
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
    sb
      .from("community_crawl_sources")
      .select("id,name,policy_status,media_policy")
      .in("id", sourceIds),
    sb.from("community_topics").select("id,name").in("id", topicIds),
    sb
      .from("community_crawl_item_media")
      .select("crawl_item_id,public_url,storage_path,is_current,role")
      .in("crawl_item_id", itemIds)
      .eq("is_current", true),
  ]);

  const sourceName = new Map<string, string>();
  const sourcePolicy = new Map<string, { policy_status: string; media_policy: string }>();
  for (const r of sources ?? []) {
    const row = r as {
      id: string;
      name: string;
      policy_status?: string;
      media_policy?: string;
    };
    sourceName.set(String(row.id), String(row.name ?? ""));
    sourcePolicy.set(String(row.id), {
      policy_status: String(row.policy_status ?? ""),
      media_policy: String(row.media_policy ?? ""),
    });
  }
  const topicName = new Map<string, string>();
  for (const r of topics ?? []) {
    topicName.set(String((r as { id: string }).id), String((r as { name: string }).name ?? ""));
  }

  const coverByItem = new Map<string, string>();
  const bodyCountByItem = new Map<string, number>();
  if (!mediaRes.error) {
    for (const r of mediaRes.data ?? []) {
      const row = r as {
        crawl_item_id: string;
        public_url: string | null;
        storage_path: string;
        role: string;
      };
      const id = String(row.crawl_item_id);
      if (row.role === "COVER") {
        const raw = row.public_url?.trim() || null;
        if (raw) coverByItem.set(id, raw);
      } else if (row.role === "BODY") {
        bodyCountByItem.set(id, (bodyCountByItem.get(id) ?? 0) + 1);
      }
    }
  }

  return items.map((it) => {
    const durable = coverByItem.get(it.id) ?? null;
    const thumb = durable ? resolveCanonicalThumbImageUrl(durable) : null;
    const hasCandidate = Boolean(it.source_cover_candidate_url?.trim());
    let media_status: CommunityCrawlItemOpsDto["media_status"] = "NO_MEDIA";
    if (thumb) media_status = "DURABLE_COVER";
    else if (hasCandidate && !it.source_cover_url) media_status = "NO_VALID_IMAGE";
    else if (hasCandidate) media_status = "CANDIDATE_ONLY";

    const pol = sourcePolicy.get(it.source_id);
    const source_policy_status = pol?.policy_status || null;
    const source_media_policy = pol?.media_policy || null;
    const published = it.status === "PUBLISHED" || Boolean(it.published_post_id);
    const publish_cta_eligible =
      source_policy_status === "ALLOWED" &&
      !published &&
      it.status !== "SKIPPED" &&
      it.status !== "FAILED";

    return {
      ...it,
      source_name: sourceName.get(it.source_id) ?? null,
      topic_name: topicName.get(it.target_topic_id) ?? null,
      thumb_url: thumb,
      media_status,
      body_media_count: bodyCountByItem.get(it.id) ?? 0,
      published,
      source_policy_status,
      source_media_policy,
      publish_cta_eligible,
    };
  });
}
