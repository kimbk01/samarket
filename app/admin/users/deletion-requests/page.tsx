import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminDeletionRequestsQueue } from "@/components/admin/users/AdminDeletionRequestsQueue";
import { AdminManagementSurfaceRoot } from "@/components/admin/management";
import { MEMBER_ADMIN_COPY } from "@/lib/admin-users/member-admin-copy-ssot";
import { MEMBER_LIST_DELETION_REQUESTS_KO } from "@/lib/admin-users/member-list-presentation";
import { ADMIN_USERS_LITE_PAGE_BG } from "@/lib/ui/admin-users-lite-styles";

export default function AdminMemberDeletionRequestsPage() {
  return (
    <AdminManagementSurfaceRoot proofSurface="users" wave="w2" className={`${ADMIN_USERS_LITE_PAGE_BG} space-y-4 pb-6`}>
      <nav className="text-xs font-medium text-sam-muted" aria-label="Breadcrumb">
        <Link href="/admin/users" className="hover:underline">
          {MEMBER_ADMIN_COPY.member_management}
        </Link>
        <span className="mx-1.5 text-sam-meta">›</span>
        <span className="text-sam-fg">{MEMBER_LIST_DELETION_REQUESTS_KO}</span>
      </nav>
      <AdminPageHeader
        titleKey="admin_menu_users_deletion_requests"
        description="대기 중인 삭제 요청을 확인합니다. 파괴적 처리는 회원 상세에서 진행합니다."
        titleClassName="text-xl font-bold text-sam-fg"
        descriptionClassName="text-[13px] text-sam-muted"
      />
      <div data-admin-member-deletion-request-queue="1">
        <AdminDeletionRequestsQueue />
      </div>
    </AdminManagementSurfaceRoot>
  );
}
