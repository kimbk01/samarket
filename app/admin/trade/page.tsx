import { AdminDomainDashboardShell } from "@/components/admin/domain-dashboard/AdminDomainDashboardShell";
import { loadTradeDomainDashboard } from "@/lib/admin/domain-dashboard/load-trade-domain-dashboard";

export const dynamic = "force-dynamic";

/** Trade Domain Dashboard — separate from /admin/posts-management list. */
export default async function AdminTradeHubPage() {
  const model = await loadTradeDomainDashboard();
  return <AdminDomainDashboardShell model={model} />;
}
