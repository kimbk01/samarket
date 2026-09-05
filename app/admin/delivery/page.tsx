import { AdminDomainDashboardShell } from "@/components/admin/domain-dashboard/AdminDomainDashboardShell";
import { loadDeliveryDomainDashboard } from "@/lib/admin/domain-dashboard/load-delivery-domain-dashboard";

export const dynamic = "force-dynamic";

export default async function AdminDeliveryDomainDashboardPage() {
  const model = await loadDeliveryDomainDashboard();
  return <AdminDomainDashboardShell model={model} />;
}
