import { AdminDashboardPage } from "@/components/admin/dashboard/AdminDashboardPage";
import { getCachedAdminDashboardPayloadForDevSafe } from "@/lib/admin-dashboard/build-admin-dashboard-payload-dev-cache";
import { getOptionalAdminUserIdCached } from "@/lib/admin/get-optional-admin-user-id-cached";

export default async function AdminPage() {
  let initialDashboardPayload = null;
  const adminId = await getOptionalAdminUserIdCached();
  if (adminId) {
    try {
      initialDashboardPayload = await getCachedAdminDashboardPayloadForDevSafe(adminId);
    } catch {
      initialDashboardPayload = null;
    }
  }

  return <AdminDashboardPage initialDashboardPayload={initialDashboardPayload} />;
}
