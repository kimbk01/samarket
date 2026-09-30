import Link from "next/link";
import { AdminDeletionRequestsQueue } from "@/components/admin/users/AdminDeletionRequestsQueue";
import { AdminManagementSurfaceRoot } from "@/components/admin/management";
import { MEMBER_ADMIN_COPY } from "@/lib/admin-users/member-admin-copy-ssot";
import { MEMBER_LIST_DELETION_REQUESTS_KO } from "@/lib/admin-users/member-list-presentation";
import { ADMIN_USERS_LITE_PAGE_BG } from "@/lib/ui/admin-users-lite-styles";

export default function AdminMemberDeletionRequestsPage() {
  return (
    <AdminManagementSurfaceRoot proofSurface="users" wave="w2" className={`${ADMIN_USERS_LITE_PAGE_BG} space-y-4 pb-6`}>
      <nav className="text-xs font-medium text-[#667085]" aria-label="Breadcrumb">
        <Link href="/admin/users" className="hover:underline">
          {MEMBER_ADMIN_COPY.member_management}
        </Link>
        <span className="mx-1.5 text-[#98a2b3]">›</span>
        <span className="text-[#344054]">{MEMBER_LIST_DELETION_REQUESTS_KO}</span>
      </nav>
      <h1 className="text-xl font-bold text-[#101828]">{MEMBER_LIST_DELETION_REQUESTS_KO}</h1>
      <p className="text-[13px] text-[#667085]">
        대기 중인 삭제 요청을 확인합니다. 파괴적 처리는 회원 상세에서 진행합니다.
      </p>
      <div data-admin-member-deletion-request-queue="1">
        <AdminDeletionRequestsQueue />
      </div>
    </AdminManagementSurfaceRoot>
  );
}
