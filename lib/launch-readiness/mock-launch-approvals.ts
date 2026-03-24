/**
 * 46단계: 런칭 승인 mock (승인자 placeholder)
 */

import type {
  LaunchApproval,
  LaunchReadinessPhase,
  LaunchApproverRole,
  LaunchApprovalDecision,
} from "@/lib/types/launch-readiness";

const APPROVALS: LaunchApproval[] = [
  {
    id: "la-1",
    phase: "pre_launch",
    approverRole: "product_owner",
    approverAdminId: "admin1",
    approverAdminNickname: "관리자",
    decision: "conditional",
    note: "must_have 전부 완료 후 최종 승인 예정",
    createdAt: new Date().toISOString(),
  },
  {
    id: "la-2",
    phase: "pre_launch",
    approverRole: "ops_owner",
    approverAdminId: null,
    approverAdminNickname: null,
    decision: "conditional",
    note: "승인자 placeholder",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "la-3",
    phase: "pre_launch",
    approverRole: "tech_owner",
    approverAdminId: null,
    approverAdminNickname: null,
    decision: "approved",
    note: "",
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: "la-4",
    phase: "launch_day",
    approverRole: "admin",
    approverAdminId: null,
    approverAdminNickname: null,
    decision: "conditional",
    note: "런칭 당일 체크리스트 완료 후 승인",
    createdAt: new Date().toISOString(),
  },
];

export function getLaunchApprovals(filters?: {
  phase?: LaunchReadinessPhase;
}): LaunchApproval[] {
  let list = [...APPROVALS].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (filters?.phase) list = list.filter((a) => a.phase === filters.phase);
  return list;
}

export function getLaunchApprovalById(id: string): LaunchApproval | undefined {
  return APPROVALS.find((a) => a.id === id);
}
