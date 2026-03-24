/**
 * 44단계: 개선 로드맵 항목 mock (43 패턴/38 액션 연계)
 */

import type {
  OpsImprovementRoadmapItem,
  OpsRoadmapStatus,
  OpsRoadmapDomain,
} from "@/lib/types/ops-maturity";

const ITEMS: OpsImprovementRoadmapItem[] = [
  {
    id: "oir-1",
    title: "빈 피드 알림 임계치 조정",
    description: "반복 이슈 패턴 oip-1 기반. 알림 임계치 상향으로 조기 대응",
    sourceType: "learning_pattern",
    sourceId: "oip-1",
    domain: "monitoring",
    status: "in_progress",
    priority: "high",
    ownerAdminId: "admin1",
    ownerAdminNickname: "관리자",
    targetScore: 80,
    dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    milestone: "Q1 모니터링 강화",
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
    note: "",
  },
  {
    id: "oir-2",
    title: "Fallback 자동 복구 런북 문서화",
    description: "document_gap 학습 기반. 신규 런북 작성",
    sourceType: "learning_pattern",
    sourceId: "oip-3",
    domain: "documentation",
    status: "planned",
    priority: "medium",
    ownerAdminId: null,
    ownerAdminNickname: null,
    targetScore: null,
    dueDate: null,
    milestone: "Q1 문서화",
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    completedAt: null,
    note: "",
  },
  {
    id: "oir-3",
    title: "롤백 시나리오 실행률 개선",
    description: "액션아이템 oai-1 연동. 롤백 성공률 95% 목표",
    sourceType: "action_item",
    sourceId: "oai-1",
    domain: "response",
    status: "approved",
    priority: "high",
    ownerAdminId: "admin1",
    ownerAdminNickname: "관리자",
    targetScore: 85,
    dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    milestone: "Q1 대응 속도",
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
    note: "",
  },
  {
    id: "oir-4",
    title: "일간 체크리스트 자동 생성",
    description: "매일 오전 9시 템플릿 기반 체크리스트 자동 생성",
    sourceType: "manual",
    sourceId: null,
    domain: "automation",
    status: "completed",
    priority: "medium",
    ownerAdminId: "admin1",
    ownerAdminNickname: "관리자",
    targetScore: 75,
    dueDate: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
    milestone: "Q1 자동화",
    createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    completedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    note: "적용 완료",
  },
];

export function getOpsImprovementRoadmapItems(filters?: {
  status?: OpsRoadmapStatus;
  domain?: OpsRoadmapDomain;
  limit?: number;
}): OpsImprovementRoadmapItem[] {
  let list = [...ITEMS].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  if (filters?.status) list = list.filter((i) => i.status === filters.status);
  if (filters?.domain) list = list.filter((i) => i.domain === filters.domain);
  const limit = filters?.limit ?? 50;
  return list.slice(0, limit);
}

export function getOpsImprovementRoadmapItemById(
  id: string
): OpsImprovementRoadmapItem | undefined {
  return ITEMS.find((i) => i.id === id);
}
