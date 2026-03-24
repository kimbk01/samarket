/**
 * 16단계: 관리자 리뷰 필터·검색·정렬
 */

import {
  BUYER_TO_SELLER_NEGATIVE,
  BUYER_TO_SELLER_POSITIVE,
  SELLER_TO_BUYER_NEGATIVE,
  SELLER_TO_BUYER_POSITIVE,
} from "@/lib/trade/trade-review-tags";
import type { AdminReview } from "@/lib/types/admin-review";
import type { ReviewStatus } from "@/lib/types/review";
import type { ReviewRole } from "@/lib/types/review";

export const REVIEW_STATUS_OPTIONS: { value: ReviewStatus | ""; label: string }[] = [
  { value: "", label: "전체" },
  { value: "visible", label: "표시" },
  { value: "hidden", label: "숨김" },
  { value: "reported", label: "신고됨" },
];

export const RATING_OPTIONS = [1, 2, 3, 4, 5].map((n) => ({
  value: n as number | "",
  label: `${n}점`,
}));
export const RATING_FILTER_OPTIONS: { value: number | ""; label: string }[] = [
  { value: "", label: "전체" },
  ...RATING_OPTIONS,
];

export const ROLE_OPTIONS: { value: ReviewRole | ""; label: string }[] = [
  { value: "", label: "전체" },
  { value: "buyer_to_seller", label: "구매자→판매자" },
  { value: "seller_to_buyer", label: "판매자→구매자" },
];

export interface AdminReviewFilters {
  reviewStatus: ReviewStatus | "";
  rating: number | "";
  role: ReviewRole | "";
  sortKey: "createdAt";
}

function tagLabelMapForRole(roleType: string): Map<string, string> {
  const role = roleType === "seller_to_buyer" ? "seller_to_buyer" : "buyer_to_seller";
  const pairs =
    role === "seller_to_buyer"
      ? [...SELLER_TO_BUYER_POSITIVE, ...SELLER_TO_BUYER_NEGATIVE]
      : [...BUYER_TO_SELLER_POSITIVE, ...BUYER_TO_SELLER_NEGATIVE];
  return new Map(pairs.map((x) => [x.key, x.label]));
}

/** 거래 후기 태그 키 → 한글 라벨 (역할별) */
export function formatAdminReviewTagKeys(roleType: string, keys: string[] | null | undefined): string {
  if (!keys?.length) return "—";
  const m = tagLabelMapForRole(roleType);
  return keys.map((k) => m.get(k) ?? k).join(", ");
}

/** AdminReview 한 행용: 긍정·부정 라벨 요약 */
export function formatAdminReviewSelectedTags(r: AdminReview): string {
  const role = r.role;
  const pos = formatAdminReviewTagKeys(role, r.positiveTagKeys);
  const neg = formatAdminReviewTagKeys(role, r.negativeTagKeys);
  const legacy = (r.privateTags ?? []).length ? r.privateTags!.join(", ") : "";
  const parts: string[] = [];
  if (pos !== "—") parts.push(`긍정: ${pos}`);
  if (neg !== "—") parts.push(`부정: ${neg}`);
  if (legacy) parts.push(`기타: ${legacy}`);
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
