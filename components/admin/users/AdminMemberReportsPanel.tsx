"use client";

import {
  MEMBER_ADMIN_COPY,
} from "@/lib/admin-users/member-admin-copy-ssot";
import {
  memberDetailAccountStateLabelKo,
} from "@/lib/admin-users/member-detail-presentation";
import type { AdminUserDetailPayload } from "@/components/admin/users/AdminTestUserDetail";
import { ADMIN_USERS_LITE_CARD } from "@/lib/ui/admin-users-lite-styles";

/**
 * P3 신고·제재 tab — current account state + history navigation.
 * P7 owns suspend/block/withdraw/purge workflows. No destructive CTAs here.
 */
export function AdminMemberReportsPanel({
  user,
  onOpenOps,
}: {
  user: AdminUserDetailPayload;
  onOpenOps: () => void;
}) {
  const accountState = memberDetailAccountStateLabelKo(user.moderation_status, user.status);

  return (
    <div className="space-y-3" data-member-detail-reports="1">
      <section className={`${ADMIN_USERS_LITE_CARD} space-y-2 p-4`}>
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-[#667085]">
          {MEMBER_ADMIN_COPY.moderation}
        </h3>
        <dl className="space-y-2 text-[13px]">
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <dt className="text-[#667085]">계정 상태</dt>
            <dd className="font-semibold text-[#101828]" data-reports-account-state="1">
              {accountState}
            </dd>
          </div>
        </dl>
        <p className="text-[12px] text-[#667085]">
          이용 정지·이용 차단·탈퇴·영구 삭제는 하단 「위험 작업」에서 표시되며, 최종 실행 워크플로는 별도 단계에서 닫습니다.
        </p>
        <button
          type="button"
          className="text-[13px] font-semibold text-[#2563eb]"
          onClick={onOpenOps}
          data-reports-open-ops="1"
        >
          {MEMBER_ADMIN_COPY.ops_history} 보기
        </button>
      </section>
    </div>
  );
}
