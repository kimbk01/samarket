import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminPhilifeMeetingReportsHeader } from "@/components/admin/philife/AdminPhilifeMeetingReportsHeader";
import { AdminMeetingReportsPage } from "@/components/admin/philife/AdminMeetingReportsPage";
import { listMeetingReportsForAdmin } from "@/lib/neighborhood/admin-meeting-reports";

export default async function AdminPhilifeMeetingReportsRoute() {
  const rows = await listMeetingReportsForAdmin(200);

  return (
    <AdminGuard>
      <div className="space-y-6 p-4">
        <AdminPhilifeMeetingReportsHeader />
        <AdminMeetingReportsPage initialRows={rows} />
      </div>
    </AdminGuard>
  );
}
