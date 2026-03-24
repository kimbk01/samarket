import { AdminCommunitySectionsPage } from "@/components/admin/community/AdminCommunitySectionsPage";
import { listAllCommunitySectionsForAdmin } from "@/lib/community-feed/queries";

export default async function AdminCommunitySectionsRoute() {
  const sections = await listAllCommunitySectionsForAdmin();
  return <AdminCommunitySectionsPage sections={sections} />;
}
