"use client";

import Link from "next/link";
import { tradeChatNotificationHref } from "@/lib/chats/trade-chat-notification-href";
import type { AdminReview } from "@/lib/types/admin-review";
import { formatAdminReviewSelectedTags } from "@/lib/admin-reviews/admin-review-utils";

const PUBLIC_LABELS: Record<string, string> = {
  good: "좋아요",
  normal: "보통",
  bad: "별로",
};

interface AdminReviewTableProps {
  reviews: AdminReview[];
}

export function AdminReviewTable({ reviews }: AdminReviewTableProps) {
  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[720px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">상품명</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">판매자</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">구매자</th>
            <th className="px-3 py-2.5 text-center font-medium text-sam-fg">후기 작성</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">공개 후기</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">선택 태그</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">한줄 코멘트</th>
            <th className="px-3 py-2.5 text-center font-medium text-sam-fg">익명 부정</th>
            <th className="px-3 py-2.5 text-center font-medium text-sam-fg">채팅</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">작성 시각</th>
          </tr>
        </thead>
        <tbody>
          {reviews.map((r) => (
            <tr key={r.id} className="border-b border-sam-border-soft hover:bg-sam-app">
              <td className="max-w-[140px] truncate px-3 py-2.5 text-sam-fg">
                <Link href={`/admin/reviews/${r.id}`} className="font-medium text-signature hover:underline">
                  {r.productTitle}
                </Link>
              </td>
              <td className="max-w-[80px] truncate px-3 py-2.5 text-sam-fg">
                {r.sellerNickname ?? (r.role === "seller_to_buyer" ? r.reviewerNickname : r.targetNickname)}
              </td>
              <td className="max-w-[80px] truncate px-3 py-2.5 text-sam-fg">
                {r.buyerNickname ?? (r.role === "buyer_to_seller" ? r.reviewerNickname : r.targetNickname)}
              </td>
              <td className="px-3 py-2.5 text-center text-sam-muted">Y</td>
              <td className="px-3 py-2.5 text-sam-muted">
                {PUBLIC_LABELS[r.publicReviewType ?? "normal"] ?? r.publicReviewType ?? "—"}
              </td>
              <td className="max-w-[200px] truncate px-3 py-2.5 text-[13px] text-sam-muted" title={formatAdminReviewSelectedTags(r)}>
                {formatAdminReviewSelectedTags(r)}
              </td>
              <td className="max-w-[160px] truncate px-3 py-2.5 text-[13px] text-sam-muted" title={r.comment || ""}>
                {r.comment?.trim() ? r.comment : "—"}
              </td>
              <td className="px-3 py-2.5 text-center text-[13px]">
                {r.isAnonymousNegative ? "Y" : "N"}
              </td>
              <td className="px-3 py-2.5 text-center text-[13px]">
                {r.transactionId ? (
                  <Link href={tradeChatNotificationHref(r.transactionId, "product_chat")} className="text-signature hover:underline" target="_blank">
                    열기
                  </Link>
                ) : (
                  "—"
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-sam-muted">
                {new Date(r.createdAt).toLocaleString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
