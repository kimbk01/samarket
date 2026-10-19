import { Suspense } from "react";
import { AdminCommunityRestrictionsPage } from "@/components/admin/community/restrictions/AdminCommunityRestrictionsPage";

/** 활동 제한 회원 (설계 §C-11) — 커뮤니티 경고·활동 제한 원장 조회·해제·추가 */
export default function AdminCommunityRestrictionsRoute() {
  return (
    <Suspense fallback={null}>
      <AdminCommunityRestrictionsPage />
    </Suspense>
  );
}
