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
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <h3 className="text-[15px] font-medium text-sam-fg">
        {policy.policyName}
      </h3>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-[14px] sm:grid-cols-3">
        <div>
          <dt className="text-sam-muted">만료 일수</dt>
          <dd>{policy.expireAfterDays}일</dd>
        </div>
        <div>
          <dt className="text-sam-muted">제외 유형</dt>
          <dd>{policy.excludeEntryTypes.join(", ") || "-"}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">실행 주기</dt>
          <dd>{POINT_EXPIRE_RUN_CYCLE_LABELS[policy.runCycle]}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">자동 실행</dt>
          <dd>{policy.autoExpireEnabled ? "활성" : "비활성"}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">사용자 조회</dt>
          <dd>{policy.allowUserView ? "허용" : "비허용"}</dd>
        </div>
      </dl>
      {policy.adminMemo && (
        <p className="mt-2 text-[13px] text-sam-muted">{policy.adminMemo}</p>
      )}
    </div>
  );
}
