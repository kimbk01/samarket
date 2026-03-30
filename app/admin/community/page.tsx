import Link from "next/link";
import { AdminCommunityEnginePostsClient } from "@/components/admin/community/AdminCommunityEnginePostsClient";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminGuard } from "@/components/admin/AdminGuard";

export default function AdminCommunityEnginePage() {
  return (
    <AdminGuard>
      <div className="space-y-6 p-4">
        <AdminPageHeader
          title="커뮤니티 엔진 — 글"
          description="커뮤니티 피드 글 상태·신고 플래그 관리"
        />
        <nav className="flex flex-wrap gap-3 text-[14px] text-sky-700">
          <Link href="/admin/philife/reports" className="underline">
            피드 신고 (기존)
          </Link>
          <Link href="/admin/philife/meeting-reports" className="underline">
            모임 신고 관리
          </Link>
          <Link href="/admin/philife/meetings" className="underline">
            모임 관리
          </Link>
          <Link href="/admin/philife/sections" className="underline">
            섹션 설정
          </Link>
          <Link href="/admin/philife/topics" className="underline">
            피드 주제 (모임 카테고리)
          </Link>
        </nav>
        <AdminCommunityEnginePostsClient />
      </div>
    </AdminGuard>
  );
}
