import Link from "next/link";
import { AdminPhilifeMeetingEventsClient } from "@/components/admin/community/AdminPhilifeMeetingEventsClient";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { HistoryBackTextLink } from "@/components/navigation/HistoryBackTextLink";

export default function AdminPhilifeMeetingEventsPage() {
  return (
    <AdminGuard>
      <div className="space-y-6 p-4">
        <AdminPageHeader
          title="커뮤니티 — 모임 운영 로그"
          description="전체 모임의 가입·승인·차단·공지 등 감사 로그를 조회합니다. CSV로 내려받을 수 있습니다."
        />
        <div className="flex flex-wrap gap-3 text-[14px]">
          <HistoryBackTextLink
            fallbackHref="/admin/philife/meetings"
            className="text-sky-700 underline"
          >
            ← 모임 관리
          </HistoryBackTextLink>
          <HistoryBackTextLink fallbackHref="/admin/philife" className="text-sky-700 underline">
            ← 커뮤니티
          </HistoryBackTextLink>
        </div>
        <AdminPhilifeMeetingEventsClient />
      </div>
    </AdminGuard>
  );
}
