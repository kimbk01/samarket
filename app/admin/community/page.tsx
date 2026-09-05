import { AdminDomainDashboardShell } from "@/components/admin/domain-dashboard/AdminDomainDashboardShell";
import { loadCommunityDomainDashboard } from "@/lib/admin/domain-dashboard/load-community-domain-dashboard";

export const dynamic = "force-dynamic";

export default async function AdminCommunityRoute() {
  const model = await loadCommunityDomainDashboard();
  return <AdminDomainDashboardShell model={model} />;
}
