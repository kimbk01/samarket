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
      id: "chat",
      label: t("store_owner_dash_unanswered_chat"),
      count: orderChatUnread,
      sub: orderChatUnread > 0 ? t("store_owner_dash_reply_needed") : t("store_owner_dash_no_new_10m"),
      danger: orderChatUnread > 0,
      href: inquiriesHref,
    },
    {
      id: "reviews",
      label: t("store_owner_dash_review_reply"),
      count: snapshot.reviews_need_reply_count,
      sub:
        snapshot.reviews_need_reply_count > 0
          ? t("store_owner_dash_response_needed")
          : t("store_owner_dash_done"),
      danger: snapshot.reviews_need_reply_count > 0,
      href: OwnerRoutes.reviews(storeId),
    },
    {
      id: "refund",
      label: t("store_owner_dash_refund_requests"),
      count: snapshot.refund_requested_count,
      sub:
        snapshot.refund_requested_count > 0
          ? t("store_owner_dash_action_needed")
          : t("store_owner_dash_none"),
      danger: snapshot.refund_requested_count > 0,
      href: buildStoreOrdersHref({ storeId, tab: "refund" }),
    },
    {
      id: "claims",
      label: t("store_owner_dash_claims"),
      count: snapshot.active_dispute_count,
      sub:
        snapshot.active_dispute_count > 0
          ? t("store_owner_dash_action_needed")
          : t("store_owner_dash_no_new_claims"),
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
            key={c.id}
            href={c.href}
            prefetch={false}
            className="min-h-[72px] rounded-[4px] border border-[var(--biz-card-border)] bg-[var(--biz-tan-soft)] p-2 active:bg-[var(--biz-primary-soft)]"
          >
            <p className={ownerDashTypography.cellTitle}>{c.label}</p>
            <p
              className={`mt-1 ${ownerDashTypography.metric} ${c.danger ? "text-[#DC2626]" : ""}`}
            >
              {t("store_owner_dash_count_orders", { count: c.count })}
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
          className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[4px] border border-[var(--biz-primary)] bg-[var(--biz-primary-soft)] text-[13px] font-semibold text-[var(--biz-primary)]"
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          {t("store_owner_dash_chat_shortcut")}
        </Link>
      ) : null}
    </section>
  );
}
