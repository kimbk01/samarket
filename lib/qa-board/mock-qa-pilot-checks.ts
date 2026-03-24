/**
 * 48단계: 실사용자 시범운영 체크리스트 mock
 */

import type {
  QaPilotCheck,
  QaPilotCategory,
  QaPilotCheckStatus,
} from "@/lib/types/qa-board";

const now = new Date().toISOString();

const CHECKS: QaPilotCheck[] = [
  {
    id: "qpc-1",
    title: "파일럿 사용자 온보딩 완료",
    category: "onboarding",
    status: "done",
    assignedAdminId: "admin1",
    assignedAdminNickname: "관리자",
    note: "",
    updatedAt: now,
  },
  {
    id: "qpc-2",
    title: "홈/검색 체험 피드백 수집",
    category: "browsing",
    status: "in_progress",
    assignedAdminId: null,
    assignedAdminNickname: null,
    note: "파일럿 5명 대상",
    updatedAt: now,
  },
  {
    id: "qpc-3",
    title: "상품 등록 체험 피드백",
    category: "posting",
    status: "todo",
    assignedAdminId: null,
    assignedAdminNickname: null,
    note: "",
    updatedAt: now,
  },
  {
    id: "qpc-4",
    title: "채팅 체험 피드백",
    category: "chat",
    status: "blocked",
    assignedAdminId: null,
    assignedAdminNickname: null,
    note: "채팅 연동 후 진행",
    updatedAt: now,
  },
  {
    id: "qpc-5",
    title: "신고 플로우 피드백",
    category: "reporting",
    status: "todo",
    assignedAdminId: null,
    assignedAdminNickname: null,
    note: "",
    updatedAt: now,
  },
  {
    id: "qpc-6",
    title: "포인트 사용 피드백",
    category: "points",
    status: "todo",
    assignedAdminId: null,
    assignedAdminNickname: null,
    note: "",
    updatedAt: now,
  },
  {
    id: "qpc-7",
    title: "관리자 응답 만족도 placeholder",
    category: "admin_response",
    status: "todo",
    assignedAdminId: null,
    assignedAdminNickname: null,
    note: "파일럿 피드백 목록 placeholder",
    updatedAt: now,
  },
];

export function getQaPilotChecks(filters?: {
  category?: QaPilotCategory;
  status?: QaPilotCheckStatus;
}): QaPilotCheck[] {
  let list = [...CHECKS];
  if (filters?.category)
    list = list.filter((c) => c.category === filters.category);
  if (filters?.status) list = list.filter((c) => c.status === filters.status);
  return list;
}
