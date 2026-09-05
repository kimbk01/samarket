"use client";

import Link from "next/link";
import { AlertCircle, RefreshCw, Siren } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { OwnerStoreOpsSnapshot } from "@/lib/stores/owner-store-ops-snapshot";
import { buildOwnerOrdersEntryHref } from "@/lib/business/owner-orders-entry-policy";
import type { StoreOrderTabId } from "@/lib/business/store-orders-tab";
import {
  peekOwnerHubLatestPendingOrderId,
  subscribeOwnerHubLatestPendingOrderId,
} from "@/lib/business/owner-hub-pending-order-bridge";
import {
  formatOwnerDashUpdatedAt,
  ownerDashTypography,
  ownerDashUrgentCardClass,
} from "./owner-dashboard-ui";

type UrgentCell = {
  id: string;
  title: string;
  count: number;
  sub?: string;
  danger?: boolean;
  href: string;
};

export function OwnerUrgentOrdersCard({
  storeId,
  snapshot,
  pulseNew,
  updatedAt,
  onRefresh,
  refreshing,
}: {
  storeId: string;
  snapshot: OwnerStoreOpsSnapshot;
  pulseNew?: boolean;
  updatedAt: Date | null;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const { t } = useI18n();
  const pendingOrderId = useSyncExternalStore(
    subscribeOwnerHubLatestPendingOrderId,
    () => peekOwnerHubLatestPendingOrderId(storeId),
    () => null
  );
  const entryHref = (tab: StoreOrderTabId, withPendingOrder?: boolean) =>
    buildOwnerOrdersEntryHref({
      storeId,
      tab,
      orderId: withPendingOrder ? (pendingOrderId ?? undefined) : undefined,
      freshList: true,
    });
  const newOrdersHref = entryHref("new", true);
  const unconfirmed = Math.max(snapshot.pending_over_3m_count, 0);
  const cells: UrgentCell[] = [
    {
      id: "new",
      title: t("store_owner_dash_new_orders"),
      count: snapshot.pending_accept_count,
      sub:
        unconfirmed > 0
          ? t("store_owner_dash_wait_over_3m", { count: unconfirmed })
          : snapshot.pending_accept_count > 0
            ? t("store_owner_dash_waiting_accept")
            : undefined,
      danger: unconfirmed > 0 || snapshot.pending_accept_count > 0,
      href: newOrdersHref,
    },
    {
      id: "cooking",
      title: t("store_owner_dash_cooking_delay"),
      count: snapshot.cooking_delay_count,
      sub:
        snapshot.cooking_delay_count > 0
          ? t("store_owner_dash_over_eta")
          : t("store_owner_dash_status_normal"),
      danger: snapshot.cooking_delay_count > 0,
      href: entryHref("preparing"),
    },
    {
      id: "delivery",
      title: t("store_owner_dash_delivery_delay"),
      count: snapshot.delivery_delay_count,
      sub:
        snapshot.rider_unassigned_count > 0
          ? t("store_owner_dash_rider_unassigned")
          : snapshot.delivery_delay_count > 0
            ? t("store_owner_dash_delivery_delayed_occurred")
            : t("store_owner_dash_status_normal"),
      danger: snapshot.delivery_delay_count > 0 || snapshot.rider_unassigned_count > 0,
      href: entryHref("shipping"),
    },
    {
      id: "unconfirmed",
      title: t("store_owner_dash_unconfirmed_orders"),
      count: unconfirmed,
      sub:
        unconfirmed > 0
          ? t("store_owner_dash_unconfirmed_over_3m")
          : t("store_owner_dash_confirm_done"),
      danger: unconfirmed > 0,
      href: newOrdersHref,
    },
  ];

  const hasUrgent =
    snapshot.pending_accept_count > 0 ||
    snapshot.cooking_delay_count > 0 ||
    snapshot.delivery_delay_count > 0 ||
    unconfirmed > 0;

  const timeLabel = updatedAt ? formatOwnerDashUpdatedAt(updatedAt) : "--:--:--";

  return (
    <section className={ownerDashUrgentCardClass("space-y-3")} aria-labelledby="owner-urgent-title">
      <div className="flex items-center justify-between gap-2 border-b border-[#FEE2E2] pb-2">
        <div className="flex items-center gap-1.5">
          <Siren className="h-4 w-4 text-[#DC2626]" aria-hidden />
          <h2 id="owner-urgent-title" className={ownerDashTypography.sectionTitle}>
            {t("store_owner_dash_urgent_title")}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => onRefresh?.()}
          disabled={refreshing}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-gray-800 disabled:opacity-50"
          aria-label={t("store_owner_dash_refresh_ops")}
        >
          <span>{t("store_owner_dash_updated_at", { time: timeLabel })}</span>
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
        </button>
      </div>

      {!hasUrgent ? (
        <p className={ownerDashTypography.helper}>{t("store_owner_dash_no_urgent")}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {cells.map((c) => (
              <Link
                key={c.id}
                href={c.href}
                prefetch={false}
                className="min-h-[76px] rounded-[4px] border border-[var(--biz-card-border)] bg-[var(--biz-tan-soft)] p-2.5 transition active:bg-[var(--biz-primary-soft)]"
              >
                <p className={ownerDashTypography.cellTitle}>{c.title}</p>
                <p className={`mt-1 ${c.danger ? ownerDashTypography.metricUrgent : ownerDashTypography.metric}`}>
                  {t("store_owner_dash_count_orders", { count: c.count })}
                </p>
                {c.sub ? (
                  <p
                    className={`mt-1 flex items-start gap-0.5 ${ownerDashTypography.helper} ${
                      c.danger ? "font-medium text-[#DC2626]" : ""
                    }`}
                  >
                    {c.danger ? <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> : null}
                    <span>{c.sub}</span>
                  </p>
                ) : null}
              </Link>
            ))}
          </div>
          {snapshot.pending_accept_count > 0 && snapshot.today_order_count === 0 ? (
            <p className={`${ownerDashTypography.helper} text-gray-500`} data-owner-dash-stale-queue-hint="1">
              {t("store_owner_dash_today_order_hint")}
            </p>
          ) : null}
        </>
      )}

      <Link
        href={newOrdersHref}
        prefetch={false}
        className={`flex min-h-11 w-full items-center justify-center whitespace-nowrap rounded-ui-rect text-[14px] font-bold text-white ${
          hasUrgent ? "bg-[#DC2626] active:bg-red-700" : "pointer-events-none bg-gray-300 text-gray-600"
        } ${pulseNew && hasUrgent ? "animate-pulse" : ""}`}
        aria-disabled={!hasUrgent}
        data-owner-cta="danger"
      >
        {t("store_owner_dash_review_orders_btn")}
      </Link>
    </section>
  );
}
