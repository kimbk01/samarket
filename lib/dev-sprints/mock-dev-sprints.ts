/**
 * 52단계: 개발 스프린트 mock
 */

import type { DevSprint, DevSprintStatus } from "@/lib/types/dev-sprints";

const now = new Date().toISOString();
const thisMonth = new Date().toISOString().slice(0, 7);
const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 7);

const SPRINTS: DevSprint[] = [
  {
    id: "ds-1",
    sprintName: "Sprint 24-03",
    sprintGoal: "피드 깜빡임·채팅 알림 개선",
    startDate: thisMonth + "-01",
    endDate: thisMonth + "-14",
    status: "active" as DevSprintStatus,
    ownerAdminId: "admin1",
    ownerAdminNickname: "관리자",
    createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    updatedAt: now,
    note: "sprint handoff note placeholder",
  },
  {
    id: "ds-2",
    sprintName: "Sprint 24-02",
    sprintGoal: "신고 알림·포인트 필터",
    startDate: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    endDate: new Date(Date.now() - 16 * 86400000).toISOString().slice(0, 10),
    status: "completed" as DevSprintStatus,
    ownerAdminId: "admin1",
    ownerAdminNickname: "관리자",
    createdAt: new Date(Date.now() - 45 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 15 * 86400000).toISOString(),
    note: "",
  },
  {
    id: "ds-3",
    sprintName: "Sprint 24-04",
    sprintGoal: "다음 스프린트 placeholder",
    startDate: nextMonth + "-01",
    endDate: nextMonth + "-14",
    status: "planned" as DevSprintStatus,
    ownerAdminId: null,
    ownerAdminNickname: null,
    createdAt: now,
    updatedAt: now,
    note: "",
  },
];

export function getDevSprints(filters?: {
  status?: DevSprintStatus;
}): DevSprint[] {
  let list = [...SPRINTS].sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
  );
  if (filters?.status) list = list.filter((s) => s.status === filters.status);
  return list;
}

export function getDevSprintById(id: string): DevSprint | undefined {
  return SPRINTS.find((s) => s.id === id);
}
