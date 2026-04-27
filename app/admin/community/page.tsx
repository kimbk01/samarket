import { AdminCommunityEnginePageClient } from "@/components/admin/community/AdminCommunityEnginePageClient";
import { AdminGuard } from "@/components/admin/AdminGuard";

export default function AdminCommunityEnginePage() {
  return (
    <AdminGuard>
      <AdminCommunityEnginePageClient />
    </AdminGuard>
  );
}
