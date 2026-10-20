import { AdminCommunityTopicsPage } from "@/components/admin/community/AdminCommunityTopicsPage";
import { getPhilifeNeighborhoodSectionSlugServer } from "@/lib/community-feed/philife-neighborhood-section";
import { loadAllCommunitySectionsForAdmin } from "@/lib/community-feed/queries";
import { loadAllCommunityTopicsForAdmin } from "@/lib/community-topics/server";
import { loadCommunityTopicContentStatsBySlug } from "@/lib/community-topics/admin-topic-content-stats";

export default async function AdminCommunityTopicsRoute() {
  const [sectionsRes, topicsRes, philifeNeighborhoodSectionSlug] = await Promise.all([
    loadAllCommunitySectionsForAdmin(),
    loadAllCommunityTopicsForAdmin(),
    getPhilifeNeighborhoodSectionSlugServer(),
  ]);
  const sections = sectionsRes.rows;
  const topics = topicsRes.rows;
  const loadError = !topicsRes.ok ? topicsRes.error : !sectionsRes.ok ? sectionsRes.error : null;
  const topicStatsBySlug = await loadCommunityTopicContentStatsBySlug(
    topics.map((t) => t.slug).filter(Boolean)
  );
  return (
    <AdminCommunityTopicsPage
      sections={sections}
      topics={topics}
      philifeNeighborhoodSectionSlug={philifeNeighborhoodSectionSlug}
      topicStatsBySlug={topicStatsBySlug}
      loadError={loadError}
    />
  );
}
