/**
 * 제품 백로그 — 피드백·백로그·handoff 단일 저장소.
 * 영속화: `product-backlog-db` + `/api/admin/product-backlog`
 */
import type {
  ProductBacklogItem,
  ProductBacklogStatus,
  ProductFeedbackCategory,
  ProductFeedbackItem,
  ProductFeedbackSourceType,
  OpsDevHandoffItem,
  OpsDevHandoffStatus,
} from "@/lib/types/product-backlog";

function isoNow() {
  return new Date().toISOString();
}

function defaultBacklogItems(): ProductBacklogItem[] {
  const now = isoNow();
  return [
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
}

function defaultFeedbackItems(): ProductFeedbackItem[] {
  const now = isoNow();
  return [
    {
      id: "pfi-1",
      sourceType: "user_feedback",
      title: "상품 등록 시 사진 업로드 느림",
      description: "이미지 5장 올리면 10초 이상 걸림",
      category: "product_posting",
      severity: "medium",
      feedbackStatus: "reviewed",
      sourceUserId: "u1",
      sourceUserNickname: "사용자1",
      linkedType: null,
      linkedId: null,
      createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      updatedAt: now,
      note: "",
    },
    {
      id: "pfi-2",
      sourceType: "cs_inquiry",
      title: "채팅 알림 안 옴",
      description: "알림 설정 켜져 있는데 채팅 알림 수신 안 됨",
      category: "chat",
      severity: "high",
      feedbackStatus: "new",
      sourceUserId: null,
      sourceUserNickname: null,
      linkedType: "inquiry",
      linkedId: "inq-1",
      createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      updatedAt: now,
      note: "",
    },
    {
      id: "pfi-3",
      sourceType: "qa_issue",
      title: "피드 무한스크롤 시 깜빡임",
      description: "스크롤 시 리스트가 잠깐 비었다가 다시 채워짐",
      category: "feed_quality",
      severity: "high",
      feedbackStatus: "converted",
      sourceUserId: null,
      sourceUserNickname: null,
      linkedType: "qa_issue",
      linkedId: "qai-1",
      createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      updatedAt: now,
      note: "백로그 pbi-1로 전환됨",
    },
    {
      id: "pfi-4",
      sourceType: "ops_note",
      title: "포인트 사용 내역 필터 부족",
      description: "운영 메모: 사용자 문의 다수. 기간/유형 필터 요청",
      category: "points_payment",
      severity: "medium",
      feedbackStatus: "new",
      sourceUserId: null,
      sourceUserNickname: null,
      linkedType: null,
      linkedId: null,
      createdAt: now,
      updatedAt: now,
      note: "",
    },
    {
      id: "pfi-5",
      sourceType: "report",
      title: "신고 처리 후 사용자 알림 없음",
      description: "신고 접수/처리 결과 알림 요청 다수",
      category: "moderation",
      severity: "medium",
      feedbackStatus: "reviewed",
      sourceUserId: null,
      sourceUserNickname: null,
      linkedType: "report",
      linkedId: null,
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      updatedAt: now,
      note: "",
    },
    {
      id: "pfi-6",
      sourceType: "analytics_signal",
      title: "온보딩 이탈률 상승",
      description: "최근 2주 이탈률 +15%",
      category: "onboarding",
      severity: "high",
      feedbackStatus: "new",
      sourceUserId: null,
      sourceUserNickname: null,
      linkedType: "analytics",
      linkedId: null,
      createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
      updatedAt: now,
      note: "",
    },
  ];
}

function defaultHandoffItems(): OpsDevHandoffItem[] {
  const now = isoNow();
  return [
    {
      id: "odh-1",
      backlogItemId: "pbi-1",
      handoffStatus: "in_progress",
      opsSummary: "피드 깜빡임 QA 이슈와 동일. 재현 확실. 우선 처리 요청.",
      devNote: "가상화 리스트 키 이슈로 추정. 수정 중.",
      acceptanceCriteria: "스크롤 시 리스트가 비었다가 채워지는 현상 없음",
      requestedByAdminId: "admin1",
      requestedByAdminNickname: "관리자",
      assignedDevName: "개발팀 placeholder",
      createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      updatedAt: now,
    },
    {
      id: "odh-2",
      backlogItemId: "pbi-3",
      handoffStatus: "pending",
      opsSummary: "CS 문의 다수. 채팅 알림 미수신. FCM/권한 점검 요청.",
      devNote: "",
      acceptanceCriteria: "알림 설정 ON 시 채팅 메시지 도착 시 푸시 수신",
      requestedByAdminId: "admin1",
      requestedByAdminNickname: "관리자",
      assignedDevName: "",
      createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      updatedAt: now,
    },
  ];
}

const BACKLOG_ITEMS: ProductBacklogItem[] = defaultBacklogItems();
const FEEDBACK_ITEMS: ProductFeedbackItem[] = defaultFeedbackItems();
const HANDOFF_ITEMS: OpsDevHandoffItem[] = defaultHandoffItems();

export type ProductBacklogBundleV1 = {
  version: 1;
  feedbackItems: ProductFeedbackItem[];
  backlogItems: ProductBacklogItem[];
  handoffItems: OpsDevHandoffItem[];
};

function replaceArray<T>(target: T[], next: T[]) {
  target.length = 0;
  target.push(...next);
}

export function createDefaultProductBacklogBundle(): ProductBacklogBundleV1 {
  return {
    version: 1,
    feedbackItems: defaultFeedbackItems().map((i) => ({ ...i })),
    backlogItems: defaultBacklogItems().map((i) => ({ ...i })),
    handoffItems: defaultHandoffItems().map((i) => ({ ...i })),
  };
}

export function importProductBacklogBundle(bundle: ProductBacklogBundleV1): void {
  if (bundle.version !== 1) return;
  replaceArray(
    FEEDBACK_ITEMS,
    (bundle.feedbackItems ?? []).map((i) => ({ ...i }))
  );
  replaceArray(
    BACKLOG_ITEMS,
    (bundle.backlogItems ?? []).map((i) => ({ ...i }))
  );
  replaceArray(
    HANDOFF_ITEMS,
    (bundle.handoffItems ?? []).map((i) => ({ ...i }))
  );
  if (!FEEDBACK_ITEMS.length)
    replaceArray(FEEDBACK_ITEMS, defaultFeedbackItems());
  if (!BACKLOG_ITEMS.length)
    replaceArray(BACKLOG_ITEMS, defaultBacklogItems());
  if (!HANDOFF_ITEMS.length)
    replaceArray(HANDOFF_ITEMS, defaultHandoffItems());
}

export function exportProductBacklogBundle(): ProductBacklogBundleV1 {
  return {
    version: 1,
    feedbackItems: FEEDBACK_ITEMS.map((i) => ({ ...i })),
    backlogItems: BACKLOG_ITEMS.map((i) => ({ ...i })),
    handoffItems: HANDOFF_ITEMS.map((i) => ({ ...i })),
  };
}

/* ─── backlog items ─────────────────────────────────────────── */

export function getProductBacklogItems(filters?: {
  status?: ProductBacklogStatus;
  category?: ProductFeedbackCategory;
  ownerType?: ProductBacklogItem["ownerType"];
  limit?: number;
}): ProductBacklogItem[] {
  let list = [...BACKLOG_ITEMS].sort(
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
  return BACKLOG_ITEMS.find((i) => i.id === id);
}

/* ─── feedback items ────────────────────────────────────────── */

export function getProductFeedbackItems(filters?: {
  category?: ProductFeedbackCategory;
  sourceType?: ProductFeedbackSourceType;
  feedbackStatus?: ProductFeedbackItem["feedbackStatus"];
  limit?: number;
}): ProductFeedbackItem[] {
  let list = [...FEEDBACK_ITEMS].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (filters?.category) list = list.filter((i) => i.category === filters.category);
  if (filters?.sourceType) list = list.filter((i) => i.sourceType === filters.sourceType);
  if (filters?.feedbackStatus)
    list = list.filter((i) => i.feedbackStatus === filters.feedbackStatus);
  if (filters?.limit) list = list.slice(0, filters.limit);
  return list;
}

export function getProductFeedbackItemById(
  id: string
): ProductFeedbackItem | undefined {
  return FEEDBACK_ITEMS.find((i) => i.id === id);
}

/* ─── handoff items ─────────────────────────────────────────── */

export function getOpsDevHandoffItems(filters?: {
  handoffStatus?: OpsDevHandoffStatus;
  backlogItemId?: string;
}): OpsDevHandoffItem[] {
  let list = [...HANDOFF_ITEMS].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (filters?.handoffStatus)
    list = list.filter((h) => h.handoffStatus === filters.handoffStatus);
  if (filters?.backlogItemId)
    list = list.filter((h) => h.backlogItemId === filters.backlogItemId);
  return list;
}

export function getOpsDevHandoffByBacklogId(
  backlogItemId: string
): OpsDevHandoffItem | undefined {
  return HANDOFF_ITEMS.find((h) => h.backlogItemId === backlogItemId);
}
