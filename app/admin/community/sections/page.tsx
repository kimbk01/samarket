import { AdminCommunitySectionsPage } from "@/components/admin/community/AdminCommunitySectionsPage";
import { getPhilifeNeighborhoodSectionSlugServer } from "@/lib/community-feed/philife-neighborhood-section";
import { loadAllCommunitySectionsForAdmin } from "@/lib/community-feed/queries";

export default async function AdminCommunitySectionsRoute() {
  const [sectionsRes, philifeNeighborhoodSectionSlug] = await Promise.all([
    loadAllCommunitySectionsForAdmin(),
    getPhilifeNeighborhoodSectionSlugServer(),
  ]);
  return (
    <AdminCommunitySectionsPage
      sections={sectionsRes.rows}
      loadError={sectionsRes.ok ? null : sectionsRes.error}
      philifeNeighborhoodSectionSlug={philifeNeighborhoodSectionSlug}
    />
  );
}
