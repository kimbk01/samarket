import { AdminCommunityTopicsPage } from "@/components/admin/community/AdminCommunityTopicsPage";
import { getPhilifeNeighborhoodSectionSlugServer } from "@/lib/community-feed/philife-neighborhood-section";
import { listAllCommunitySectionsForAdmin } from "@/lib/community-feed/queries";
import { listAllCommunityTopicsForAdmin } from "@/lib/community-topics/server";
import { loadCommunityTopicContentStatsBySlug } from "@/lib/community-topics/admin-topic-content-stats";

export default async function AdminCommunityTopicsRoute() {
  const [sections, topics, philifeNeighborhoodSectionSlug] = await Promise.all([
    listAllCommunitySectionsForAdmin(),
    listAllCommunityTopicsForAdmin(),
    getPhilifeNeighborhoodSectionSlugServer(),
  ]);
  const topicStatsBySlug = await loadCommunityTopicContentStatsBySlug(
    topics.map((t) => t.slug).filter(Boolean)
  );
  return (
    <AdminCommunityTopicsPage
      sections={sections}
      topics={topics}
      philifeNeighborhoodSectionSlug={philifeNeighborhoodSectionSlug}
      topicStatsBySlug={topicStatsBySlug}
    />
  );
}
