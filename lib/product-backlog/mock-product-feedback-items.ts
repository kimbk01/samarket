/**
 * 51단계: 사용자 피드백 mock (38 action, 37 report, 48 qa 연계)
 */

import type {
  ProductFeedbackItem,
  ProductFeedbackCategory,
  ProductFeedbackSourceType,
} from "@/lib/types/product-backlog";

const now = new Date().toISOString();

const ITEMS: ProductFeedbackItem[] = [
  {
    id: "pfi-1",
    sourceType: "user_feedback" as ProductFeedbackSourceType,
    title: "상품 등록 시 사진 업로드 느림",
    description: "이미지 5장 올리면 10초 이상 걸림",
    category: "product_posting" as ProductFeedbackCategory,
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
    sourceType: "cs_inquiry" as ProductFeedbackSourceType,
    title: "채팅 알림 안 옴",
    description: "알림 설정 켜져 있는데 채팅 알림 수신 안 됨",
    category: "chat" as ProductFeedbackCategory,
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
    sourceType: "qa_issue" as ProductFeedbackSourceType,
    title: "피드 무한스크롤 시 깜빡임",
    description: "스크롤 시 리스트가 잠깐 비었다가 다시 채워짐",
    category: "feed_quality" as ProductFeedbackCategory,
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
    sourceType: "ops_note" as ProductFeedbackSourceType,
    title: "포인트 사용 내역 필터 부족",
    description: "운영 메모: 사용자 문의 다수. 기간/유형 필터 요청",
    category: "points_payment" as ProductFeedbackCategory,
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
    sourceType: "report" as ProductFeedbackSourceType,
    title: "신고 처리 후 사용자 알림 없음",
    description: "신고 접수/처리 결과 알림 요청 다수",
    category: "moderation" as ProductFeedbackCategory,
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
    sourceType: "analytics_signal" as ProductFeedbackSourceType,
    title: "온보딩 이탈률 상승",
    description: "최근 2주 이탈률 +15%",
    category: "onboarding" as ProductFeedbackCategory,
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

export function getProductFeedbackItems(filters?: {
  category?: ProductFeedbackCategory;
  sourceType?: ProductFeedbackSourceType;
  feedbackStatus?: ProductFeedbackItem["feedbackStatus"];
  limit?: number;
}): ProductFeedbackItem[] {
  let list = [...ITEMS].sort(
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
  return ITEMS.find((i) => i.id === id);
}
