import { chatProductSummaryFromPostRow } from "@/lib/chats/chat-product-from-post";
import type { AdminReview } from "@/lib/types/admin-review";

export interface TransactionReviewDbRow {
  id: string;
  product_id: string;
  room_id: string | null;
  reviewer_id: string;
  reviewee_id: string;
  role_type: string;
  public_review_type: string;
  private_manner_score?: number | null;
  private_tags?: unknown;
  is_anonymous_negative?: boolean | null;
  created_at: string;
  positive_tag_keys?: unknown;
  negative_tag_keys?: unknown;
  review_comment?: string | null;
}

const PUBLIC_TYPES = new Set(["good", "normal", "bad"]);

export function mapTransactionReviewRowToAdminReview(
  r: TransactionReviewDbRow,
  postRow: Record<string, unknown> | undefined,
  nicknameById: Record<string, string>
): AdminReview {
  const role = (r.role_type === "seller_to_buyer" || r.role_type === "buyer_to_seller"
    ? r.role_type
    : "buyer_to_seller") as AdminReview["role"];
  const sellerId = role === "seller_to_buyer" ? r.reviewer_id : r.reviewee_id;
  const buyerId = role === "buyer_to_seller" ? r.reviewer_id : r.reviewee_id;

  const privateTags = Array.isArray(r.private_tags) ? (r.private_tags as string[]) : [];
  const posKeys = Array.isArray(r.positive_tag_keys) ? (r.positive_tag_keys as string[]) : [];
  const negKeys = Array.isArray(r.negative_tag_keys) ? (r.negative_tag_keys as string[]) : [];

  const rawPublic = typeof r.public_review_type === "string" ? r.public_review_type : "normal";
  const publicReviewType = PUBLIC_TYPES.has(rawPublic) ? (rawPublic as AdminReview["publicReviewType"]) : "normal";
  const rating = publicReviewType === "good" ? 5 : publicReviewType === "bad" ? 1 : 3;

  const summary = chatProductSummaryFromPostRow(postRow, r.product_id);
  const comment = typeof r.review_comment === "string" ? r.review_comment : "";

  return {
    id: r.id,
    transactionId: r.room_id ?? "",
    productId: r.product_id,
    productTitle: summary.title,
    reviewerId: r.reviewer_id,
    reviewerNickname: nicknameById[r.reviewer_id] ?? r.reviewer_id,
    targetUserId: r.reviewee_id,
    targetNickname: nicknameById[r.reviewee_id] ?? r.reviewee_id,
    role,
    rating,
    tags: [...privateTags, ...posKeys.map((k) => `+${k}`), ...negKeys.map((k) => `-${k}`)],
    comment,
    createdAt: r.created_at,
    reviewStatus: "visible",
    reportCount: 0,
    publicReviewType,
    privateTags: privateTags.length ? privateTags : undefined,
    positiveTagKeys: posKeys.length ? posKeys : undefined,
    negativeTagKeys: negKeys.length ? negKeys : undefined,
    isAnonymousNegative: Boolean(r.is_anonymous_negative),
    sellerNickname: nicknameById[sellerId],
    buyerNickname: nicknameById[buyerId],
  };
}
