import Link from "next/link";
import { AdminManagementSurfaceRoot } from "@/components/admin/management";
import { MEMBER_ADMIN_COPY } from "@/lib/admin-users/member-admin-copy-ssot";
import { MEMBER_LIST_OPS_HISTORY_KO } from "@/lib/admin-users/member-list-presentation";
import { ADMIN_USERS_LITE_CARD, ADMIN_USERS_LITE_PAGE_BG } from "@/lib/ui/admin-users-lite-styles";

/** P2 secondary entry — global ops rebuild is later phase; entry must not dominate member list. */
export default function AdminMemberOpsHistoryEntryPage() {
  return (
    <AdminManagementSurfaceRoot proofSurface="users" wave="w2" className={`${ADMIN_USERS_LITE_PAGE_BG} space-y-4 pb-6`}>
      <nav className="text-xs font-medium text-[#667085]" aria-label="Breadcrumb">
        <Link href="/admin/users" className="hover:underline">
          {MEMBER_ADMIN_COPY.member_management}
        </Link>
        <span className="mx-1.5 text-[#98a2b3]">›</span>
        <span className="text-[#344054]">{MEMBER_LIST_OPS_HISTORY_KO}</span>
      </nav>
      <h1 className="text-xl font-bold text-[#101828]">{MEMBER_LIST_OPS_HISTORY_KO}</h1>
      <div className={`${ADMIN_USERS_LITE_CARD} space-y-3 p-4 text-[13px] text-[#475467]`}>
        <p>회원별 운영 이력은 회원 상세에서 확인합니다.</p>
        <p>
          <Link href="/admin/users" className="font-semibold text-[#2563eb] hover:underline">
            회원 목록으로 돌아가기
          </Link>
        </p>
      </div>
    </AdminManagementSurfaceRoot>
  );
}
