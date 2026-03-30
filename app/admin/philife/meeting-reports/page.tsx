import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminMeetingReportsPage } from "@/components/admin/philife/AdminMeetingReportsPage";
import { listMeetingReportsForAdmin } from "@/lib/neighborhood/admin-meeting-reports";

export const dynamic = "force-dynamic";

export default async function AdminPhilifeMeetingReportsRoute() {
  const rows = await listMeetingReportsForAdmin(200);

  return (
    <AdminGuard>
      <div className="space-y-6 p-4">
        <AdminPageHeader
          title="모임 신고 관리"
          description="meeting_reports 테이블 — 피드·앨범·채팅·멤버 신고 검토 및 조치"
        />
        <AdminMeetingReportsPage initialRows={rows} />
      </div>
    </AdminGuard>
  );
}
