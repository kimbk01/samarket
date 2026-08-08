"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { PointPromotionOrder, PointPromotionOrderStatus, PointPromotionPlacement } from "@/lib/types/point";

const STATUS_KEYS: Record<PointPromotionOrderStatus, MessageKey> = {
  pending: "point_status_pending",
  pending_review: "point_status_pending_review",
  active: "point_status_active",
  expired: "point_status_expired",
  ended: "point_status_ended",
  rejected: "revenue_hub_status_rejected",
  cancelled: "point_status_cancelled",
};

const PLACEMENT_KEYS: Record<PointPromotionPlacement, MessageKey> = {
  home_top: "point_placement_home_top",
  home_middle: "point_placement_home_middle",
  search_top: "point_placement_search_top",
  shop_featured: "point_placement_shop_featured",
  feed_boost: "point_placement_feed_boost",
  community_top_pin: "point_placement_community_top_pin",
};

interface PointPromotionOrderListProps {
  orders: PointPromotionOrder[];
}

const STATUS_CLASS: Record<PointPromotionOrder["orderStatus"], string> = {
  pending: "bg-sam-surface-muted text-sam-fg",
  pending_review: "bg-sam-surface-muted text-sam-fg",
  active: "bg-signature/10 text-signature",
  expired: "bg-sam-border-soft text-sam-muted",
  ended: "bg-sam-border-soft text-sam-muted",
  rejected: "bg-sam-border-soft text-sam-muted",
  cancelled: "bg-sam-border-soft text-sam-muted",
};

export function PointPromotionOrderList({ orders }: PointPromotionOrderListProps) {
  const { t } = useI18n();

  if (orders.length === 0) {
    return (
      <div className="rounded-ui-rect bg-sam-surface p-8 text-center sam-text-body text-sam-muted">
        {t("points_ui_promo_empty")}
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {orders.map((o) => (
        <li
          key={o.id}
          className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
        >
          <p className="font-medium text-sam-fg">{o.targetTitle}</p>
          <p className="mt-0.5 sam-text-body-secondary text-sam-muted">
            {t(PLACEMENT_KEYS[o.placement])} · {t("points_ui_days", { days: o.durationDays })}
          </p>
          <p className="mt-0.5 sam-text-body-secondary text-sam-muted">
            {t("points_ui_promo_cost", { cost: o.pointCost.toLocaleString() })}
          </p>
          <span
            className={`mt-2 inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${STATUS_CLASS[o.orderStatus]}`}
          >
            {t(STATUS_KEYS[o.orderStatus])}
          </span>
          <p className="mt-1 sam-text-helper text-sam-meta">
            {new Date(o.createdAt).toLocaleDateString("ko-KR")}
          </p>
        </li>
      ))}
    </ul>
  );
}
