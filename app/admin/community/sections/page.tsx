import { AdminCommunitySectionsPage } from "@/components/admin/community/AdminCommunitySectionsPage";
import { getPhilifeNeighborhoodSectionSlugServer } from "@/lib/community-feed/philife-neighborhood-section";
import { listAllCommunitySectionsForAdmin } from "@/lib/community-feed/queries";

export default async function AdminCommunitySectionsRoute() {
  const [sections, philifeNeighborhoodSectionSlug] = await Promise.all([
    listAllCommunitySectionsForAdmin(),
    getPhilifeNeighborhoodSectionSlugServer(),
  ]);
  return (
    <AdminCommunitySectionsPage
      sections={sections}
      philifeNeighborhoodSectionSlug={philifeNeighborhoodSectionSlug}
    />
  );
}
