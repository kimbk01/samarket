import { AdminDashboardPage } from "@/components/admin/dashboard/AdminDashboardPage";
import { getCachedAdminDashboardPayloadForDevSafe } from "@/lib/admin-dashboard/build-admin-dashboard-payload-dev-cache";
import { getOptionalAdminUserId } from "@/lib/admin/require-admin-api";

export default async function AdminPage() {
  let initialDashboardPayload = null;
  const adminId = await getOptionalAdminUserId();
  if (adminId) {
    try {
      initialDashboardPayload = await getCachedAdminDashboardPayloadForDevSafe(adminId);
    } catch {
      initialDashboardPayload = null;
    }
  }

  return <AdminDashboardPage initialDashboardPayload={initialDashboardPayload} />;
}
