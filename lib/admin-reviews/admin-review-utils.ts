/**
 * 16단계: 관리자 리뷰 필터·검색·정렬 (i18n)
 */

import {
  BUYER_TO_SELLER_NEGATIVE,
  BUYER_TO_SELLER_POSITIVE,
  SELLER_TO_BUYER_NEGATIVE,
  SELLER_TO_BUYER_POSITIVE,
  tradeReviewTagLabel,
} from "@/lib/trade/trade-review-tags";
import type { MessageKey } from "@/lib/i18n/messages";
import type { AdminReview } from "@/lib/types/admin-review";
import type { ReviewStatus } from "@/lib/types/review";
import type { ReviewRole } from "@/lib/types/review";
import {
  REVIEW_STATUS_KEYS,
} from "@/components/admin/i18n/admin-review-label-keys";

export type AdminReviewTranslate = (
  key: MessageKey,
  params?: Record<string, string | number>
) => string;

export const REVIEW_STATUS_FILTER_OPTIONS: { value: ReviewStatus | ""; labelKey: MessageKey }[] = [
  { value: "", labelKey: "common_all" },
  { value: "visible", labelKey: REVIEW_STATUS_KEYS.visible },
  { value: "hidden", labelKey: REVIEW_STATUS_KEYS.hidden },
  { value: "reported", labelKey: REVIEW_STATUS_KEYS.reported },
];

export const RATING_FILTER_OPTIONS: { value: number | ""; labelKey: MessageKey }[] = [
  { value: "", labelKey: "common_all" },
  ...([1, 2, 3, 4, 5] as const).map((n) => ({
    value: n as number | "",
    labelKey: `admin_review_rating_${n}` as MessageKey,
  })),
];

export const ROLE_FILTER_OPTIONS: { value: ReviewRole | ""; labelKey: MessageKey }[] = [
  { value: "", labelKey: "common_all" },
  { value: "buyer_to_seller", labelKey: "admin_review_role_buyer_to_seller" },
  { value: "seller_to_buyer", labelKey: "admin_review_role_seller_to_buyer" },
];

export interface AdminReviewFilters {
  reviewStatus: ReviewStatus | "";
  rating: number | "";
  role: ReviewRole | "";
  sortKey: "createdAt";
}

/** 거래 후기 태그 키 → 라벨 (역할별, 태그 정의는 trade-review-tags) */
export function formatAdminReviewTagKeys(
  t: AdminReviewTranslate,
  roleType: string,
  keys: string[] | null | undefined
): string {
  if (!keys?.length) return "—";
  const role = roleType === "seller_to_buyer" ? "seller_to_buyer" : "buyer_to_seller";
  return keys.map((k) => tradeReviewTagLabel(t, role, k)).join(", ");
}

/** AdminReview 한 행용: 긍정·부정 라벨 요약 */
export function formatAdminReviewSelectedTags(
  t: AdminReviewTranslate,
  r: AdminReview
): string {
  const role = r.role;
  const pos = formatAdminReviewTagKeys(t, role, r.positiveTagKeys);
  const neg = formatAdminReviewTagKeys(t, role, r.negativeTagKeys);
  const legacy = (r.privateTags ?? []).length ? r.privateTags!.join(", ") : "";
  const parts: string[] = [];
  if (pos !== "—") parts.push(`${t("admin_review_positive_tags")}: ${pos}`);
  if (neg !== "—") parts.push(`${t("admin_review_negative_tags")}: ${neg}`);
  if (legacy) parts.push(`${t("admin_review_legacy_tags")}: ${legacy}`);
  return parts.length ? parts.join(" · ") : "—";
}

export function filterAndSortReviews(
  reviews: AdminReview[],
  filters: AdminReviewFilters,
  searchQuery: string
): AdminReview[] {
  let list = [...reviews];

  if (filters.reviewStatus) {
    list = list.filter((r) => r.reviewStatus === filters.reviewStatus);
  }
  if (filters.rating !== "") {
    list = list.filter((r) => r.rating === filters.rating);
  }
  if (filters.role) {
    list = list.filter((r) => r.role === filters.role);
  }

  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    list = list.filter((r) => {
      const matchProduct = r.productTitle.toLowerCase().includes(q);
      const matchReviewer = r.reviewerNickname.toLowerCase().includes(q);
      const matchTarget = r.targetNickname.toLowerCase().includes(q);
      const matchTx = r.transactionId.toLowerCase().includes(q);
      const matchComment = (r.comment ?? "").toLowerCase().includes(q);
      return matchProduct || matchReviewer || matchTarget || matchTx || matchComment;
    });
  }

  list.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return list;
}
