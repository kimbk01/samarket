import Link from "next/link";
import { AdminCommunityEngineMeetingsClient } from "@/components/admin/community/AdminCommunityEngineMeetingsClient";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { HistoryBackTextLink } from "@/components/navigation/HistoryBackTextLink";

export default function AdminCommunityMeetingsEnginePage() {
  return (
    <AdminGuard>
      <div className="space-y-6 p-4">
        <AdminPageHeader title="커뮤니티 — 모임" description="모임 상태·정원·그룹채팅 연결 확인" />
        <div className="flex flex-wrap gap-4 sam-text-body">
          <HistoryBackTextLink fallbackHref="/admin/philife" className="text-sky-700 underline">
            ← 글 관리
          </HistoryBackTextLink>
          <Link href="/admin/philife/meeting-events" className="text-sky-700 underline">
            모임 운영 로그
          </Link>
        </div>
        <AdminCommunityEngineMeetingsClient />
      </div>
    </AdminGuard>
  );
}
