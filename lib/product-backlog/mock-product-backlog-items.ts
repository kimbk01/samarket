/**
 * 51단계: 제품 백로그 mock (feedback → backlog, 38/37/48 연계)
 */

import type {
  ProductBacklogItem,
  ProductBacklogStatus,
  ProductFeedbackCategory,
} from "@/lib/types/product-backlog";

const now = new Date().toISOString();

const ITEMS: ProductBacklogItem[] = [
  {
    id: "pbi-1",
    title: "피드 무한스크롤 깜빡임 개선",
    description: "스크롤 시 리스트 깜빡임 제거",
    category: "feed_quality",
    status: "in_progress",
    priority: "high",
    impactScore: 8,
    effortScore: 3,
    ownerType: "dev",
    ownerAdminId: null,
    ownerAdminNickname: null,
    sourceFeedbackId: "pfi-3",
    linkedRoadmapItemId: null,
    linkedActionItemId: null,
    linkedQaIssueId: "qai-1",
    linkedReportId: null,
    releaseVersion: null,
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    updatedAt: now,
    releasedAt: null,
    handoffNote: "QA 이슈와 연동. 재현 확실함.",
  },
  {
    id: "pbi-2",
    title: "상품 사진 업로드 성능 개선",
    description: "이미지 업로드 대기 시간 단축",
    category: "product_posting",
    status: "planned",
    priority: "high",
    impactScore: 7,
    effortScore: 5,
    ownerType: "dev",
    ownerAdminId: null,
    ownerAdminNickname: null,
    sourceFeedbackId: "pfi-1",
    linkedRoadmapItemId: null,
    linkedActionItemId: null,
    linkedQaIssueId: null,
    linkedReportId: null,
    releaseVersion: null,
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    updatedAt: now,
    releasedAt: null,
    handoffNote: "사용자 피드백 다수. impact 높음.",
  },
  {
    id: "pbi-3",
    title: "채팅 알림 수신 안정화",
    description: "알림 설정 반영 및 FCM 검증",
    category: "chat",
    status: "inbox",
    priority: "critical",
    impactScore: 9,
    effortScore: 4,
    ownerType: "shared",
    ownerAdminId: null,
    ownerAdminNickname: null,
    sourceFeedbackId: "pfi-2",
    linkedRoadmapItemId: null,
    linkedActionItemId: null,
    linkedQaIssueId: null,
    linkedReportId: null,
    releaseVersion: null,
    createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    updatedAt: now,
    releasedAt: null,
    handoffNote: "CS 문의 다수. 긴급 검토 필요.",
  },
  {
    id: "pbi-4",
    title: "포인트 내역 필터 추가",
    description: "기간/유형 필터 UI",
    category: "points_payment",
    status: "triaged",
    priority: "medium",
    impactScore: 5,
    effortScore: 2,
    ownerType: "dev",
    ownerAdminId: null,
    ownerAdminNickname: null,
    sourceFeedbackId: "pfi-4",
    linkedRoadmapItemId: null,
    linkedActionItemId: null,
    linkedQaIssueId: null,
    linkedReportId: null,
    releaseVersion: null,
    createdAt: now,
    updatedAt: now,
    releasedAt: null,
    handoffNote: "운영 메모 기반. effort 낮음.",
  },
  {
    id: "pbi-5",
    title: "신고 처리 결과 알림",
    description: "신고 접수/처리 결과 푸시 알림",
    category: "moderation",
    status: "released",
    priority: "high",
    impactScore: 7,
    effortScore: 4,
    ownerType: "dev",
    ownerAdminId: null,
    ownerAdminNickname: null,
    sourceFeedbackId: null,
    linkedRoadmapItemId: null,
    linkedActionItemId: "act-1",
    linkedQaIssueId: null,
    linkedReportId: null,
    releaseVersion: "1.2.0",
    createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    releasedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    handoffNote: "",
  },
];

export function getProductBacklogItems(filters?: {
  status?: ProductBacklogStatus;
  category?: ProductFeedbackCategory;
  ownerType?: ProductBacklogItem["ownerType"];
  limit?: number;
}): ProductBacklogItem[] {
  let list = [...ITEMS].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  if (filters?.status) list = list.filter((i) => i.status === filters.status);
  if (filters?.category) list = list.filter((i) => i.category === filters.category);
  if (filters?.ownerType) list = list.filter((i) => i.ownerType === filters.ownerType);
  if (filters?.limit) list = list.slice(0, filters.limit);
  return list;
}

export function getProductBacklogItemById(
  id: string
): ProductBacklogItem | undefined {
  return ITEMS.find((i) => i.id === id);
}
