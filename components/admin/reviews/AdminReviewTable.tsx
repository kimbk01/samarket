"use client";


import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import Link from "next/link";
import { tradeChatNotificationHref } from "@/lib/chats/trade-chat-notification-href";
import type { AdminReview } from "@/lib/types/admin-review";
import { formatAdminReviewSelectedTags } from "@/lib/admin-reviews/admin-review-utils";
import { REVIEW_PUBLIC_TYPE_KEYS } from "@/components/admin/i18n/admin-review-label-keys";
import { formatAtUsername } from "@/lib/users/user-label";

interface AdminReviewTableProps {
  reviews: AdminReview[];
}

export function AdminReviewTable({ reviews }: AdminReviewTableProps) {
  const { t } = useI18n();
  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[720px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_review_kdb37a783")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_review_k5a019310")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_review_k6358c2ad")}</th>
            <th className="px-3 py-2.5 text-center font-medium text-sam-fg">{t("admin_review_k39970e71")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_review_ke75661de")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_review_select")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_review_k2b87b891")}</th>
            <th className="px-3 py-2.5 text-center font-medium text-sam-fg">{t("admin_review_k21860e32")}</th>
            <th className="px-3 py-2.5 text-center font-medium text-sam-fg">{t("admin_review_chat_2")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_review_k405bf88d")}</th>
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
                <span className="block truncate">
                  {r.sellerNickname ?? (r.role === "seller_to_buyer" ? r.reviewerNickname : r.targetNickname)}
                </span>
                {r.sellerUsername ? (
                  <span className="mt-0.5 block truncate font-mono sam-text-xxs text-sam-muted tabular-nums">
                    {formatAtUsername(r.sellerUsername)}
                  </span>
                ) : null}
              </td>
              <td className="max-w-[80px] truncate px-3 py-2.5 text-sam-fg">
                <span className="block truncate">
                  {r.buyerNickname ?? (r.role === "buyer_to_seller" ? r.reviewerNickname : r.targetNickname)}
                </span>
                {r.buyerUsername ? (
                  <span className="mt-0.5 block truncate font-mono sam-text-xxs text-sam-muted tabular-nums">
                    {formatAtUsername(r.buyerUsername)}
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-2.5 text-center text-sam-muted">Y</td>
              <td className="px-3 py-2.5 text-sam-muted">
                {t(REVIEW_PUBLIC_TYPE_KEYS[r.publicReviewType ?? "normal"] ?? "admin_review_public_normal")}
              </td>
              <td className="max-w-[200px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted" title={formatAdminReviewSelectedTags(t, r)}>
                {formatAdminReviewSelectedTags(t, r)}
              </td>
              <td className="max-w-[160px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted" title={r.comment || ""}>
                {r.comment?.trim() ? r.comment : "—"}
              </td>
              <td className="px-3 py-2.5 text-center sam-text-body-secondary">
                {r.isAnonymousNegative ? "Y" : "N"}
              </td>
              <td className="px-3 py-2.5 text-center sam-text-body-secondary">
                {r.transactionId ? (
                  <Link href={tradeChatNotificationHref(r.transactionId, "product_chat")} className="text-signature hover:underline" target="_blank">
                    열기
                  </Link>
                ) : (
                  "—"
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {new Date(r.createdAt).toLocaleString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
