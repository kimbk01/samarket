/**
 * Collect all community_posts.id for a topic_slug without silent truncation.
 * Pages of 1000 — no hard 500 cut.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const PAGE = 1000;
const MAX_PAGES = 50; // safety ceiling (50k ids)

export async function collectCommunityPostIdsForTopicSlug(
  sb: SupabaseClient,
  topicSlug: string
): Promise<{ ids: string[]; truncated: boolean }> {
  const slug = topicSlug.trim().toLowerCase();
  if (!slug) return { ids: [], truncated: false };

  const ids: string[] = [];
  let truncated = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE;
    const to = from + PAGE - 1;
    const { data, error } = await sb
      .from("community_posts")
      .select("id")
      .eq("topic_slug", slug)
      .range(from, to);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{ id?: string }>;
    for (const r of rows) {
      const id = String(r.id ?? "").trim();
      if (id) ids.push(id);
    }
    if (rows.length < PAGE) break;
    if (page === MAX_PAGES - 1 && rows.length === PAGE) truncated = true;
  }
  return { ids, truncated };
}
