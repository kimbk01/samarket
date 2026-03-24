"use client";

import type { PointExpirePolicy } from "@/lib/types/point-expire";
import { POINT_EXPIRE_RUN_CYCLE_LABELS } from "@/lib/points/point-expire-utils";

interface AdminPointExpirePolicyCardProps {
  policy: PointExpirePolicy;
}

export function AdminPointExpirePolicyCard({
  policy,
}: AdminPointExpirePolicyCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-[15px] font-medium text-gray-900">
        {policy.policyName}
      </h3>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-[14px] sm:grid-cols-3">
        <div>
          <dt className="text-gray-500">만료 일수</dt>
          <dd>{policy.expireAfterDays}일</dd>
        </div>
        <div>
          <dt className="text-gray-500">제외 유형</dt>
          <dd>{policy.excludeEntryTypes.join(", ") || "-"}</dd>
        </div>
        <div>
          <dt className="text-gray-500">실행 주기</dt>
          <dd>{POINT_EXPIRE_RUN_CYCLE_LABELS[policy.runCycle]}</dd>
        </div>
        <div>
          <dt className="text-gray-500">자동 실행</dt>
          <dd>{policy.autoExpireEnabled ? "활성" : "비활성"}</dd>
        </div>
        <div>
          <dt className="text-gray-500">사용자 조회</dt>
          <dd>{policy.allowUserView ? "허용" : "비허용"}</dd>
        </div>
      </dl>
      {policy.adminMemo && (
        <p className="mt-2 text-[13px] text-gray-500">{policy.adminMemo}</p>
      )}
    </div>
  );
}
