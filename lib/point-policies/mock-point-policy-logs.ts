/**
 * 24단계: 포인트 정책 변경 이력 mock
 */

import type {
  PointPolicyLog,
  PointPolicyLogPolicyType,
  PointPolicyLogActionType,
} from "@/lib/types/point-policy";

const LOGS: PointPolicyLog[] = [
  {
    id: "ppl-1",
    policyType: "board_policy",
    relatedId: "bpp-1",
    actionType: "create",
    adminId: "admin-1",
    adminNickname: "관리자",
    note: "게시판 정책 생성",
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
];

const MOCK_ADMIN = { id: "admin-1", nickname: "관리자" };

function nextId(): string {
  const nums = LOGS.map((l) =>
    parseInt(l.id.replace("ppl-", ""), 10)
  ).filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `ppl-${max + 1}`;
}

export function addPointPolicyLog(
  policyType: PointPolicyLogPolicyType,
  relatedId: string,
  actionType: PointPolicyLogActionType,
  note: string
): void {
  LOGS.push({
    id: nextId(),
    policyType,
    relatedId,
    actionType,
    adminId: MOCK_ADMIN.id,
    adminNickname: MOCK_ADMIN.nickname,
    note,
    createdAt: new Date().toISOString(),
  });
}

export function getPointPolicyLogs(): PointPolicyLog[] {
  return [...LOGS].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
