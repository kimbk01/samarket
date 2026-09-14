import { getPhilifeNeighborhoodSectionSlugServer } from "@/lib/community-feed/philife-neighborhood-section";
import { listAllCommunityTopicsForAdmin } from "@/lib/community-topics/server";
import { topicBelongsToPhilifeNeighborhoodSection } from "@/lib/neighborhood/meetup-feed-topics";

export type OperatorImportTopicOption = {
  id: string;
  slug: string;
  name: string;
  sectionSlug: string;
};

/** Real Community content topics only — no feed-sort, no meetup, no default. */
export async function listOperatorImportTopicOptions(): Promise<OperatorImportTopicOption[]> {
  const [topics, philifeNeighborhoodSectionSlug] = await Promise.all([
    listAllCommunityTopicsForAdmin(),
    getPhilifeNeighborhoodSectionSlugServer(),
  ]);
  return topics
    .filter((t) => {
      if (!topicBelongsToPhilifeNeighborhoodSection(t.section_slug, philifeNeighborhoodSectionSlug)) return false;
      if (t.is_feed_sort) return false;
      if (t.allow_meetup) return false;
      if (!t.is_active) return false;
      return true;
    })
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      sectionSlug: t.section_slug || "",
    }));
}
