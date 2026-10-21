import { AdminAccessDeniedPanel } from "@/components/admin/AdminAccessDeniedPanel";
import { requireAdminPageAccess } from "@/lib/admin/access/require-admin-page-access";
import { AdminCommunityTopicsPage } from "@/components/admin/community/AdminCommunityTopicsPage";
import { getPhilifeNeighborhoodSectionSlugServer } from "@/lib/community-feed/philife-neighborhood-section";
import { loadAllCommunitySectionsForAdmin } from "@/lib/community-feed/queries";
import { loadAllCommunityTopicsForAdmin } from "@/lib/community-topics/server";
import { loadCommunityTopicContentStatsBySlug } from "@/lib/community-topics/admin-topic-content-stats";

export default async function AdminCommunityTopicsRoute() {
  // P1-11 · AD-01: 서버 렌더 데이터 조회 전 페이지 자체 권한 가드 (레이아웃 게이트에만 의존하지 않음)
  const access = await requireAdminPageAccess("/admin/community/topics");
  if (!access.ok) return <AdminAccessDeniedPanel backHref="/admin" />;
  const [sectionsRes, topicsRes, philifeNeighborhoodSectionSlug] = await Promise.all([
    loadAllCommunitySectionsForAdmin(),
    loadAllCommunityTopicsForAdmin(),
    getPhilifeNeighborhoodSectionSlugServer(),
  ]);
  const sections = sectionsRes.rows;
  const topics = topicsRes.rows;
  const topicStatsBySlug = await loadCommunityTopicContentStatsBySlug(
    topics.map((t) => t.slug).filter(Boolean)
  );
  return (
    <AdminCommunityTopicsPage
      sections={sections}
      topics={topics}
      loadError={topicsRes.error ?? sectionsRes.error}
      philifeNeighborhoodSectionSlug={philifeNeighborhoodSectionSlug}
      topicStatsBySlug={topicStatsBySlug}
    />
  );
}
