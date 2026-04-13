import { AdminDashboardPage } from "@/components/admin/dashboard/AdminDashboardPage";
import { buildAdminDashboardPayload } from "@/lib/admin-dashboard/build-admin-dashboard-payload";
import { getOptionalAdminUserId } from "@/lib/admin/require-admin-api";

export default async function AdminPage() {
  let initialDashboardPayload = null;
  const adminId = await getOptionalAdminUserId();
  if (adminId) {
    try {
      initialDashboardPayload = await buildAdminDashboardPayload();
    } catch {
      initialDashboardPayload = null;
    }
  }

  return <AdminDashboardPage initialDashboardPayload={initialDashboardPayload} />;
}
