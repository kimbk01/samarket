import { AdminAccessDeniedPanel } from "@/components/admin/AdminAccessDeniedPanel";
import { requireAdminPageAccess } from "@/lib/admin/access/require-admin-page-access";
import { AdminCommunitySectionsPage } from "@/components/admin/community/AdminCommunitySectionsPage";
import { getPhilifeNeighborhoodSectionSlugServer } from "@/lib/community-feed/philife-neighborhood-section";
import { loadAllCommunitySectionsForAdmin } from "@/lib/community-feed/queries";

export default async function AdminCommunitySectionsRoute() {
  // P1-11 · AD-01: 서버 렌더 데이터 조회 전 페이지 자체 권한 가드 (레이아웃 게이트에만 의존하지 않음)
  const access = await requireAdminPageAccess("/admin/community/sections");
  if (!access.ok) return <AdminAccessDeniedPanel backHref="/admin" />;
  const [sectionsRes, philifeNeighborhoodSectionSlug] = await Promise.all([
    loadAllCommunitySectionsForAdmin(),
    getPhilifeNeighborhoodSectionSlugServer(),
  ]);
  return (
    <AdminCommunitySectionsPage
      sections={sectionsRes.rows}
      loadError={sectionsRes.error}
      philifeNeighborhoodSectionSlug={philifeNeighborhoodSectionSlug}
    />
  );
}
