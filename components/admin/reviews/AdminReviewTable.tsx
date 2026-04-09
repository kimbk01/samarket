"use client";

import Link from "next/link";
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
    <div className="overflow-x-auto rounded-ui-rect border border-gray-200 bg-white">
      <table className="w-full min-w-[720px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">상품명</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">판매자</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">구매자</th>
            <th className="px-3 py-2.5 text-center font-medium text-gray-700">후기 작성</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">공개 후기</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">선택 태그</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">한줄 코멘트</th>
            <th className="px-3 py-2.5 text-center font-medium text-gray-700">익명 부정</th>
            <th className="px-3 py-2.5 text-center font-medium text-gray-700">채팅</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">작성 시각</th>
          </tr>
        </thead>
        <tbody>
          {reviews.map((r) => (
            <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="max-w-[140px] truncate px-3 py-2.5 text-gray-800">
                <Link href={`/admin/reviews/${r.id}`} className="font-medium text-signature hover:underline">
                  {r.productTitle}
                </Link>
              </td>
              <td className="max-w-[80px] truncate px-3 py-2.5 text-gray-700">
                {r.sellerNickname ?? (r.role === "seller_to_buyer" ? r.reviewerNickname : r.targetNickname)}
              </td>
              <td className="max-w-[80px] truncate px-3 py-2.5 text-gray-700">
                {r.buyerNickname ?? (r.role === "buyer_to_seller" ? r.reviewerNickname : r.targetNickname)}
              </td>
              <td className="px-3 py-2.5 text-center text-gray-600">Y</td>
              <td className="px-3 py-2.5 text-gray-600">
                {PUBLIC_LABELS[r.publicReviewType ?? "normal"] ?? r.publicReviewType ?? "—"}
              </td>
              <td className="max-w-[200px] truncate px-3 py-2.5 text-[13px] text-gray-600" title={formatAdminReviewSelectedTags(r)}>
                {formatAdminReviewSelectedTags(r)}
              </td>
              <td className="max-w-[160px] truncate px-3 py-2.5 text-[13px] text-gray-600" title={r.comment || ""}>
                {r.comment?.trim() ? r.comment : "—"}
              </td>
              <td className="px-3 py-2.5 text-center text-[13px]">
                {r.isAnonymousNegative ? "Y" : "N"}
              </td>
              <td className="px-3 py-2.5 text-center text-[13px]">
                {r.transactionId ? (
                  <Link href={`/chats/${r.transactionId}`} className="text-signature hover:underline" target="_blank">
                    열기
                  </Link>
                ) : (
                  "—"
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-gray-500">
                {new Date(r.createdAt).toLocaleString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
