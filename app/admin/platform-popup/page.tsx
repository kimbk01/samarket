import { AdminPlatformPopupListPage } from "@/components/admin/platform-popup/AdminPlatformPopupListPage";
import { AdminPlatformPopupRequestQueue } from "@/components/admin/platform-popup/AdminPlatformPopupRequestQueue";

export default function AdminPlatformPopupPage() {
  return (
    <div className="space-y-6">
      <AdminPlatformPopupRequestQueue />
      <AdminPlatformPopupListPage />
    </div>
  );
}
