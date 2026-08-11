import { AdminCommunityHomePage } from "@/components/admin/community/AdminCommunityHomePage";
import { loadAdminCommunityHomeSummary } from "@/lib/admin-community/home-summary";

export default async function AdminCommunityRoute() {
  const summary = await loadAdminCommunityHomeSummary();
  return <AdminCommunityHomePage summary={summary} />;
}
