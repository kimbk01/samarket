import { AdminDomainDashboardShell } from "@/components/admin/domain-dashboard/AdminDomainDashboardShell";
import { loadMessengerDomainDashboard } from "@/lib/admin/domain-dashboard/load-messenger-domain-dashboard";

export const dynamic = "force-dynamic";

export default async function AdminMessengerDomainDashboardPage() {
  const model = await loadMessengerDomainDashboard();
  return <AdminDomainDashboardShell model={model} />;
}
