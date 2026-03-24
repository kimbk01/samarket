/**
 * 51단계: 백로그 요약 mock (topCategory placeholder 집계)
 */

import type {
  ProductBacklogSummary,
  ProductFeedbackCategory,
} from "@/lib/types/product-backlog";
import { getProductFeedbackItems } from "./mock-product-feedback-items";
import { getProductBacklogItems } from "./mock-product-backlog-items";

export function getProductBacklogSummary(): ProductBacklogSummary {
  const feedback = getProductFeedbackItems();
  const backlog = getProductBacklogItems();

  const inboxCount = backlog.filter((i) => i.status === "inbox").length;
  const plannedCount = backlog.filter((i) => i.status === "planned").length;
  const inProgressCount = backlog.filter((i) => i.status === "in_progress").length;
  const releasedCount = backlog.filter((i) => i.status === "released").length;

  const categoryCount: Record<string, number> = {};
  [...feedback, ...backlog].forEach((item) => {
    const c = item.category as ProductFeedbackCategory;
    categoryCount[c] = (categoryCount[c] ?? 0) + 1;
  });
  const topCategory = (Object.entries(categoryCount).sort(
    (a, b) => b[1] - a[1]
  )[0]?.[0] ?? null) as ProductFeedbackCategory | null;

  const allUpdated = [
    ...feedback.map((f) => f.updatedAt),
    ...backlog.map((b) => b.updatedAt),
  ];
  const latestUpdatedAt =
    allUpdated.length > 0
      ? allUpdated.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
      : new Date().toISOString();

  return {
    totalFeedbackItems: feedback.length,
    totalBacklogItems: backlog.length,
    inboxCount,
    plannedCount,
    inProgressCount,
    releasedCount,
    topCategory,
    latestUpdatedAt,
  };
}
