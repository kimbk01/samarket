import type { SupabaseClient } from "@supabase/supabase-js";
import { getPhilifeNeighborhoodSectionSlugServer } from "@/lib/community-feed/philife-neighborhood-section";

/**
 * 동네 일반 글 — `community_topics` 와 동기(어드민 피드 주제).
 * 모임 전용 주제(`allow_meetup`)·정렬 전용(`is_feed_sort`) 행은 제외.
 */
export async function resolveTopicForNeighborhoodCategory(
  sb: SupabaseClient<any>,
  categorySlug: string,
  opts?: { sectionId?: string }
): Promise<{ topicId: string; topicSlug: string } | null> {
  const slug = String(categorySlug ?? "")
    .trim()
    .toLowerCase();
  if (!slug || slug === "meetup") return null;

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
    .select("id, slug")
    .eq("section_id", sid)
    .eq("slug", slug)
    .eq("is_active", true)
    .eq("is_visible", true)
    .eq("allow_meetup", false)
    .eq("is_feed_sort", false)
    .maybeSingle();
  const t = topic as { id?: string; slug?: string } | null;
  if (!t?.id) return null;
  return { topicId: String(t.id), topicSlug: String(t.slug ?? slug) };
}
