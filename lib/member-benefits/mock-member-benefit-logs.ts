/**
 * 27단계: 회원 혜택 적용 로그 mock
 */

import type { MemberBenefitLog } from "@/lib/types/member-benefit";

const LOGS: MemberBenefitLog[] = [
  {
    id: "mbl-1",
    userId: "me",
    userNickname: "KASAMA",
    memberType: "premium",
    policyId: "mbp-2",
    actionType: "assign",
    note: "특별회원 부여",
    actorType: "admin",
    actorId: "admin-1",
    actorNickname: "관리자",
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
];

function nextId(): string {
  const nums = LOGS.map((l) =>
    parseInt(l.id.replace("mbl-", ""), 10)
  ).filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `mbl-${max + 1}`;
}

export function getMemberBenefitLogs(): MemberBenefitLog[] {
  return [...LOGS].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getMemberBenefitLogsByPolicyId(
  policyId: string
): MemberBenefitLog[] {
  return LOGS.filter((l) => l.policyId === policyId)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .map((l) => ({ ...l }));
}

export function addMemberBenefitLog(
  log: Omit<MemberBenefitLog, "id">
): MemberBenefitLog {
  const withId: MemberBenefitLog = { ...log, id: nextId() };
  LOGS.push(withId);
  return { ...withId };
}
