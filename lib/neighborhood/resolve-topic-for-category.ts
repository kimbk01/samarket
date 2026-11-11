import type { SupabaseClient } from "@supabase/supabase-js";
import { getPhilifeNeighborhoodSectionSlugServer } from "@/lib/community-feed/philife-neighborhood-section";
import { isPhilifeNeighborhoodWriteEligibleRow } from "@/lib/neighborhood/philife-topic-slug-rules";

/**
 * 동네 일반 글 — `community_topics` SSOT + `buildPhilifeWriteTopicOptionsFromTopics`.
 * Requires is_active + is_visible; excludes sort-slot rows only.
 */
export async function resolveTopicForNeighborhoodCategory(
  sb: SupabaseClient<any>,
  categorySlug: string,
  opts?: { sectionId?: string }
): Promise<{ topicId: string; topicSlug: string } | null> {
  const slug = String(categorySlug ?? "")
    .trim()
    .toLowerCase();
  if (!slug) return null;

  let sid = opts?.sectionId?.trim();
  if (!sid) {
    const sectionSlug = await getPhilifeNeighborhoodSectionSlugServer(sb);
    const { data: sec } = await sb
      .from("community_sections")
      .select("id")
      .eq("slug", sectionSlug)
      .eq("is_active", true)
      .maybeSingle();
    sid = (sec as { id?: string } | null)?.id;
  }
  if (!sid) return null;

  const { data: topic } = await sb
    .from("community_topics")
    .select("id, slug, is_feed_sort")
    .eq("section_id", sid)
    .eq("slug", slug)
    .eq("is_active", true)
    .eq("is_visible", true)
    .maybeSingle();
  const t = topic as {
    id?: string;
    slug?: string;
    is_feed_sort?: boolean;
  } | null;
  if (!t?.id) return null;
  const fs = Boolean(t.is_feed_sort);
  if (!isPhilifeNeighborhoodWriteEligibleRow(fs, t.slug ?? slug)) return null;
  return { topicId: String(t.id), topicSlug: String(t.slug ?? slug) };
}
