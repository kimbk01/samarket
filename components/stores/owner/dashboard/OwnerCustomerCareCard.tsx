"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { OwnerStoreOpsSnapshot } from "@/lib/stores/owner-store-ops-snapshot";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { OwnerDashSectionHeader } from "./OwnerDashSectionHeader";
import { ownerDashCardClass, ownerDashTypography } from "./owner-dashboard-ui";

export function OwnerCustomerCareCard({
  storeId,
  snapshot,
  orderChatUnread,
}: {
  storeId: string;
  snapshot: OwnerStoreOpsSnapshot;
  orderChatUnread: number;
}) {
  const { t } = useI18n();
  const inquiriesHref = OwnerRoutes.inquiries(storeId);
  const cells = [
    {
      label: "미응답 채팅",
      count: orderChatUnread,
      sub: orderChatUnread > 0 ? "답변이 필요합니다" : "10분 내 신규 없음",
      danger: orderChatUnread > 0,
      href: inquiriesHref,
    },
    {
      label: "리뷰 응답",
      count: snapshot.reviews_need_reply_count,
      sub: snapshot.reviews_need_reply_count > 0 ? "응답 필요" : "완료",
      danger: snapshot.reviews_need_reply_count > 0,
      href: OwnerRoutes.reviews(storeId),
    },
    {
      label: "환불 요청",
      count: snapshot.refund_requested_count,
      sub: snapshot.refund_requested_count > 0 ? "확인 필요" : "없음",
      danger: snapshot.refund_requested_count > 0,
      href: buildStoreOrdersHref({ storeId, tab: "refund" }),
    },
    {
      label: "클레임",
      count: snapshot.active_dispute_count,
      sub: snapshot.active_dispute_count > 0 ? "처리 필요" : "신규 없음",
      danger: snapshot.active_dispute_count > 0,
      href: buildStoreOrdersHref({ storeId, tab: "progress" }),
    },
  ];

  return (
    <section className={ownerDashCardClass("space-y-3")} aria-labelledby="owner-care-title">
      <OwnerDashSectionHeader id="owner-care-title" title={t("store_owner_dash_customer_care")} href={inquiriesHref} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cells.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            prefetch={false}
            className="min-h-[72px] rounded-[4px] border border-[#E5E7EB] bg-[#FAFAFA] p-2 active:bg-gray-100"
          >
            <p className={ownerDashTypography.cellTitle}>{c.label}</p>
            <p
              className={`mt-1 ${ownerDashTypography.metric} ${c.danger ? "text-[#DC2626]" : ""}`}
            >
              {c.count}건
            </p>
            <p
              className={`mt-0.5 ${ownerDashTypography.helper} ${c.danger ? "font-medium text-[#DC2626]" : ""}`}
            >
              {c.sub}
            </p>
          </Link>
        ))}
      </div>
      {orderChatUnread > 0 ? (
        <Link
          href={inquiriesHref}
          prefetch={false}
          className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[4px] border border-[#1C8DB8] bg-[#1C8DB8]/10 text-[13px] font-semibold text-[#1C8DB8]"
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          채팅 바로가기
        </Link>
      ) : null}
    </section>
  );
}
