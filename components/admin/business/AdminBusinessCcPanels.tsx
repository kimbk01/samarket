"use client";

import Link from "next/link";
import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminStoreReviewRow } from "@/components/admin/stores/admin-store-review-model";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { adminStatusLabel } from "@/lib/admin/status-labels/delivery-status-labels";
import { processStatusLabel } from "@/lib/stores/store-order-process-model";
import type {
  BusinessCcDeliverySnapshot,
  BusinessCcFeeSnapshot,
  BusinessCcKpiSummary,
  BusinessCcOwner,
  BusinessCcSalesPermission,
  BusinessCcStats,
} from "@/lib/admin-business/load-business-control-center-detail";
import {
  businessCcAdvertisingHref,
  businessCcAuditHref,
  businessCcCancellationsHref,
  businessCcCashChargesHref,
  businessCcCashTransactionsHref,
  businessCcFinancialStatementHref,
  businessCcInquiriesHref,
  businessCcDeliveryDistanceHref,
  businessCcEntryReviewHref,
  businessCcFeePoliciesHref,
  businessCcOrdersByStoreHref,
  businessCcOwnerMemberHref,
  businessCcPointsHref,
  businessCcProductsHref,
  businessCcPublicStoreHref,
  businessCcRefundsHref,
  businessCcReportsHref,
  businessCcReviewsHref,
  businessCcSettlementsHref,
  businessCcStoreOrdersHref,
  businessCcTaxonomyHref,
} from "@/lib/admin-business/business-control-center-links";
import { formatMoneyPhp } from "@/lib/utils/format";
import {
  buildStoreStatusControl,
  type StoreStatusAxisRow,
} from "@/lib/admin-business/build-store-status-control";

function CopyId({ value, labelKey }: { value: string; labelKey: MessageKey }) {
  const { t } = useI18n();
  if (!value) return <span className="text-sam-muted">—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <code className="break-all font-mono text-[12px] text-sam-fg">{value}</code>
      <button
        type="button"
        className="rounded border border-sam-border px-1.5 py-0.5 sam-text-helper font-medium text-signature"
        onClick={() => {
          void navigator.clipboard.writeText(value).catch(() => {});
        }}
      >
        {t(labelKey)}
      </button>
    </span>
  );
}

function yn(t: (k: MessageKey) => string, v: boolean | null | undefined): string {
  if (v == null) return "—";
  return v ? t("admin_biz_yn_yes") : t("admin_biz_yn_no");
}

const AXIS_TITLE_KEYS: Record<StoreStatusAxisRow["id"], MessageKey> = {
  approval: "admin_biz_status_axis_approval",
  visibility: "admin_biz_status_axis_visibility",
  sales: "admin_biz_status_axis_sales",
  front_open: "admin_biz_status_axis_front_open",
  hours: "admin_biz_status_axis_hours",
  delivery_channel: "admin_biz_status_axis_delivery",
  pickup_channel: "admin_biz_status_axis_pickup",
  distance_policy: "admin_biz_status_axis_distance",
  sanction: "admin_biz_status_axis_sanction",
};

export function AdminBusinessCcStatusPanel({
  store,
  sales,
  delivery,
}: {
  store: AdminStoreReviewRow;
  sales: BusinessCcSalesPermission;
  delivery: BusinessCcDeliverySnapshot;
}) {
  const { t } = useI18n();
  const rows = buildStoreStatusControl({
    approvalStatus: store.approval_status,
    isVisible: store.is_visible,
    sales,
    delivery,
    commerce: {
      isOpenForCommerce: delivery.frontOpenForCommerce,
      inBreak: delivery.inBreak,
      breakConfigured: Boolean(delivery.breakRangeLabel),
      breakRangeLabel: delivery.breakRangeLabel ?? "",
    },
    hoursLabel: delivery.hoursLabel,
    suspendedReason: store.suspended_reason ?? null,
  });

  return (
    <div className="space-y-3">
      <p className="sam-text-helper text-sam-muted">{t("admin_biz_status_panel_hint")}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="border-b border-sam-border-soft sam-text-helper text-sam-muted">
              <th className="py-2 pr-2 font-medium">{t("admin_biz_status_col_axis")}</th>
              <th className="py-2 pr-2 font-medium">{t("admin_biz_status_col_value")}</th>
              <th className="py-2 pr-2 font-medium">{t("admin_biz_status_col_meaning")}</th>
              <th className="py-2 pr-2 font-medium">{t("admin_biz_status_col_writer")}</th>
              <th className="py-2 pr-2 font-medium">{t("admin_biz_status_col_customer")}</th>
              <th className="py-2 font-medium">{t("admin_biz_status_col_order")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-sam-border-soft align-top">
                <td className="py-2 pr-2 sam-text-helper font-medium text-sam-fg">
                  {t(AXIS_TITLE_KEYS[row.id])}
                </td>
                <td className="py-2 pr-2 font-mono text-[12px] text-sam-fg">{row.value}</td>
                <td className="py-2 pr-2 sam-text-helper text-sam-muted">{t(row.meaningKey)}</td>
                <td className="py-2 pr-2 sam-text-helper text-sam-muted">{t(row.writerKey)}</td>
                <td className="py-2 pr-2 sam-text-helper text-sam-muted">
                  {t(row.customerEffectKey)}
                </td>
                <td className="py-2 sam-text-helper text-sam-muted">{t(row.orderEffectKey)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminBusinessCcSummary({
  store,
  owner,
  sales,
  stats,
  fee,
  delivery,
}: {
  store: AdminStoreReviewRow;
  owner: BusinessCcOwner;
  sales: BusinessCcSalesPermission;
  stats: BusinessCcStats;
  fee: BusinessCcFeeSnapshot;
  delivery: BusinessCcDeliverySnapshot;
}) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const approval = adminStatusLabel("store_approval", store.approval_status, ko);
  const salesRaw = sales?.sales_status?.trim() || (sales?.allowed_to_sell ? "approved" : "");
  const salesLabel = adminStatusLabel("store_sales", salesRaw, ko);

  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <h2 className="sam-text-section-title text-sam-fg">
            {(store.store_name ?? "").trim() || t("admin_stores_no_store_name")}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <AdminToneBadge tone={approval.tone}>{approval.label}</AdminToneBadge>
            <span className="sam-text-helper text-sam-muted">
              {t("admin_biz_label_visible")}: {yn(t, store.is_visible)}
            </span>
            <span className="sam-text-helper text-sam-muted">
              {t("admin_biz_label_sales")}: {salesLabel.label}
            </span>
          </div>
          <p className="sam-text-body text-sam-fg">
            {t("admin_biz_label_owner")}: {owner.displayLabel}
            {owner.handle ? ` (${owner.handle})` : ""}
          </p>
          <p className="sam-text-helper text-sam-muted">
            {t("admin_biz_label_stats")}: {stats.productCount} / {stats.reviewCount}
            {" · "}
            {t("admin_biz_label_fee_scope")}: {fee.missing ? t("admin_biz_fee_missing") : feeScopeLabel(fee.scope, ko)}
            {" · "}
            {t("admin_biz_label_front_open")}: {yn(t, delivery.frontOpenForCommerce)}
            {" · "}
            {t("admin_biz_label_delivery_flag")}: {yn(t, delivery.deliveryAvailable)}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 border-t border-sam-border-soft pt-4 sm:grid-cols-2">
        <div>
          <dt className="sam-text-helper text-sam-muted">{t("admin_biz_label_store_id")}</dt>
          <dd>
            <CopyId value={store.id} labelKey="admin_biz_cta_copy" />
          </dd>
        </div>
        <div>
          <dt className="sam-text-helper text-sam-muted">{t("admin_biz_label_owner_id")}</dt>
          <dd>
            <CopyId value={owner.ownerUserId} labelKey="admin_biz_cta_copy" />
          </dd>
        </div>
        <div>
          <dt className="sam-text-helper text-sam-muted">{t("admin_biz_label_slug")}</dt>
          <dd className="font-mono text-[12px]">{store.slug || "—"}</dd>
        </div>
        <div>
          <dt className="sam-text-helper text-sam-muted">{t("admin_biz_label_category_id")}</dt>
          <dd>
            <CopyId
              value={String(store.store_category_id ?? "").trim()}
              labelKey="admin_biz_cta_copy"
            />
          </dd>
        </div>
        <div>
          <dt className="sam-text-helper text-sam-muted">{t("admin_biz_label_topic_id")}</dt>
          <dd>
            <CopyId
              value={String(store.store_topic_id ?? "").trim()}
              labelKey="admin_biz_cta_copy"
            />
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function AdminBusinessCcDeliveryCard({
  delivery,
}: {
  delivery: BusinessCcDeliverySnapshot;
}) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const coords =
    delivery.lat != null && delivery.lng != null
      ? `${delivery.lat}, ${delivery.lng}`
      : "—";
  const overrideLabel = delivery.storeOverrideMode
    ? `${overrideModeLabel(delivery.storeOverrideMode, ko)}${
        delivery.storeOverrideMaxKm != null ? ` / ${delivery.storeOverrideMaxKm}km` : ""
      }`
    : "—";

  return (
    <div className="space-y-4">
      <dl className="grid gap-2 sam-text-body sm:grid-cols-2">
        <div>
          <dt className="text-sam-muted">{t("admin_biz_label_delivery_flag")}</dt>
          <dd>{yn(t, delivery.deliveryAvailable)}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("admin_biz_label_pickup_flag")}</dt>
          <dd>{yn(t, delivery.pickupAvailable)}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("admin_biz_label_is_open")}</dt>
          <dd>
            {yn(t, delivery.isOpen)}{" "}
            <span className="sam-text-helper text-sam-muted">
              {ko ? "(영업 스위치)" : "(open switch)"}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("admin_biz_label_front_open")}</dt>
          <dd>
            {yn(t, delivery.frontOpenForCommerce)}
            {delivery.inBreak ? ` · ${t("admin_biz_label_in_break")}` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("admin_biz_label_hours")}</dt>
          <dd>{delivery.hoursLabel ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("admin_biz_label_weekdays")}</dt>
          <dd>{delivery.weekdaysLabel ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("admin_biz_label_auto_hours")}</dt>
          <dd>
            {yn(t, delivery.autoHoursEnabled)}
            {delivery.scheduleEnforced != null
              ? ` · ${ko ? "영업시간 강제" : "Schedule enforced"}: ${delivery.scheduleEnforced ? t("admin_biz_yn_yes") : t("admin_biz_yn_no")}`
              : ""}
          </dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("admin_biz_label_prep_time")}</dt>
          <dd>
            {delivery.prepTimeMinutes == null
              ? "—"
              : t("admin_biz_prep_minutes", { minutes: String(delivery.prepTimeMinutes) })}
          </dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("admin_biz_label_break")}</dt>
          <dd>{delivery.breakRangeLabel ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("admin_biz_label_coords")}</dt>
          <dd className="font-mono text-[12px]">{coords}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("admin_biz_label_distance_policy")}</dt>
          <dd>{yn(t, delivery.distancePolicyEnabled)}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("admin_biz_label_distance_applies")}</dt>
          <dd>{yn(t, delivery.applies)}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("business_store_delivery_radius_label")}</dt>
          <dd>{delivery.maxKm == null ? "—" : `${delivery.maxKm} km`}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("admin_biz_label_policy_source")}</dt>
          <dd>{policySourceLabel(delivery.policySource, ko)}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("admin_delivery_distance_th_updated")}</dt>
          <dd className="sam-text-helper">
            {delivery.updatedAt
              ? new Date(delivery.updatedAt).toLocaleString()
              : "—"}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-sam-muted">{t("admin_biz_label_store_override")}</dt>
          <dd>{overrideLabel}</dd>
        </div>
      </dl>

      <div className="rounded-ui-rect border border-sam-border-soft bg-sam-app p-3">
        <p className="sam-text-helper font-medium text-sam-fg">
          {t("admin_biz_customer_delivery_fee_title")}
        </p>
        <p className="mt-1 sam-text-helper text-sam-muted">
          {t("admin_biz_customer_delivery_fee_hint")}
        </p>
        <dl className="mt-2 grid gap-2 sam-text-body sm:grid-cols-2">
          <div>
            <dt className="text-sam-muted">{t("admin_biz_label_customer_fee_mode")}</dt>
            <dd>{delivery.customerDeliveryFeeMode ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_biz_label_customer_fee_php")}</dt>
            <dd>
              {delivery.customerDeliveryFeePhp == null
                ? "—"
                : delivery.customerDeliveryFeePhp}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_biz_label_min_order")}</dt>
            <dd>
              {delivery.customerMinOrderPhp == null ? "—" : delivery.customerMinOrderPhp}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_biz_label_free_delivery_over")}</dt>
            <dd>
              {delivery.customerFreeDeliveryOverPhp == null
                ? "—"
                : delivery.customerFreeDeliveryOverPhp}
            </dd>
          </div>
        </dl>
      </div>

      <p className="sam-text-helper text-sam-muted">{t("admin_biz_hours_admin_write")}</p>
      <p className="sam-text-helper text-sam-muted">{t("admin_biz_hours_owner_ssot_hint")}</p>
      <Link href={businessCcDeliveryDistanceHref()} className="text-signature hover:underline">
        {t("admin_biz_cta_delivery_distance")}
      </Link>
    </div>
  );
}

export function AdminBusinessCcFeeCard({ fee }: { fee: BusinessCcFeeSnapshot }) {
  const { t } = useI18n();
  if (fee.missing) {
    return (
      <div className="space-y-2">
        <p className="sam-text-body text-amber-800">{t("admin_biz_fee_missing")}</p>
        <Link href={businessCcFeePoliciesHref()} className="text-signature hover:underline">
          {t("admin_biz_cta_fee")}
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="sam-text-helper text-sam-muted">{t("admin_biz_platform_fee_hint")}</p>
      <dl className="grid gap-2 sam-text-body sm:grid-cols-2">
        <div className="sm:col-span-2 sam-text-helper text-sam-muted">
          {t("admin_biz_fee_precedence", { scope: fee.scope })}
        </div>
        <div>
          <dt className="text-sam-muted">{t("admin_biz_label_fee_scope")}</dt>
          <dd className="font-medium">{fee.scope}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("admin_biz_label_fee_inheritance")}</dt>
          <dd>
            {fee.scope === "store"
              ? t("admin_biz_fee_source_store")
              : fee.scope === "topic"
                ? t("admin_biz_fee_source_topic")
                : fee.scope === "category"
                  ? t("admin_biz_fee_source_category")
                  : fee.scope === "default"
                    ? t("admin_biz_fee_source_default")
                    : fee.scope}
          </dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("admin_biz_label_fee_policy")}</dt>
          <dd>{fee.policyName}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("admin_biz_label_fee_percent")}</dt>
          <dd>{fee.feePercent}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("admin_biz_label_fee_fixed")}</dt>
          <dd>{fee.fixedFee}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("admin_biz_label_fee_delivery")}</dt>
          <dd>
            {fee.deliveryFeeMode}
            {fee.deliveryFeeMode === "percent" ? ` (${fee.deliveryFeePercent}%)` : ""}
            <span className="ml-1 sam-text-helper text-sam-muted">
              ({t("admin_biz_label_platform_delivery_take")})
            </span>
          </dd>
        </div>
        {fee.policyId ? (
          <div>
            <dt className="text-sam-muted">{t("admin_biz_label_policy_id")}</dt>
            <dd>
              <CopyId value={fee.policyId} labelKey="admin_biz_cta_copy" />
            </dd>
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <dt className="text-sam-muted">{t("admin_biz_label_store_override")}</dt>
          <dd>
            {fee.storeOverridePolicyId
              ? `${fee.storeOverrideFeePercent ?? "—"}% (${fee.storeOverridePolicyId.slice(0, 8)}…)`
              : t("admin_biz_yn_no")}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <Link href={businessCcFeePoliciesHref()} className="text-signature hover:underline">
            {t("admin_biz_cta_fee")}
          </Link>
        </div>
      </dl>
    </div>
  );
}

export function AdminBusinessCcKpiPanel({
  storeId,
  kpi,
}: {
  storeId: string;
  kpi: BusinessCcKpiSummary;
}) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const oc = kpi.orderStatusCounts;
  const sc = kpi.commissionCounts;

  return (
    <div className="space-y-4">
      <p className="sam-text-helper text-sam-muted">{t("admin_biz_kpi_hint")}</p>

      <dl className="grid gap-2 sam-text-body sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="text-sam-muted">{t("admin_biz_kpi_orders_in_progress")}</dt>
          <dd className="font-medium">{kpi.inProgressOrderCount}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("admin_biz_kpi_order_status")}</dt>
          <dd className="sam-text-helper">
            {ko
              ? `접수 대기 ${oc.pending} · 진행 중 ${oc.inProgress} · 완료 ${oc.completed} · 취소 ${oc.cancelled} · 환불 요청 ${oc.refundRequested}`
              : `Pending ${oc.pending} · In progress ${oc.inProgress} · Completed ${oc.completed} · Cancelled ${oc.cancelled} · Refund requested ${oc.refundRequested}`}
          </dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("admin_biz_kpi_sold_out")}</dt>
          <dd className="font-medium">
            {kpi.soldOutProductCount}
            <span className="ml-1 sam-text-helper font-normal text-sam-muted">
              / {kpi.productCount}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("admin_biz_kpi_settlement_status")}</dt>
          <dd className="sam-text-helper">
            {t("admin_biz_ops_settle_counts", {
              c: String(sc.charged),
              o: String(sc.outstanding),
              r: String(sc.reviewRequired),
            })}
          </dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("admin_biz_kpi_reports")}</dt>
          <dd className="font-medium">{kpi.openReportCount}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("admin_biz_kpi_reviews")}</dt>
          <dd className="font-medium">
            {kpi.reviewCount}
            <span className="ml-1 sam-text-helper font-normal text-sam-muted">
              ({t("admin_biz_kpi_reviews_hidden")}: {kpi.hiddenReviewCount})
            </span>
          </dd>
        </div>
      </dl>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-ui-rect border border-sam-border-soft bg-sam-app p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="sam-text-helper font-medium text-sam-fg">
              {t("admin_biz_kpi_recent_orders")}
            </p>
            <Link href={businessCcOrdersByStoreHref(storeId)} className="text-signature hover:underline sam-text-helper">
              {t("admin_biz_cta_orders_by_store")}
            </Link>
          </div>
          {kpi.recentOrders.length === 0 ? (
            <p className="sam-text-helper text-sam-muted">{t("admin_biz_kpi_empty")}</p>
          ) : (
            <ul className="space-y-1.5">
              {kpi.recentOrders.map((o) => (
                <li key={o.id} className="flex flex-wrap justify-between gap-2 sam-text-helper">
                  <span className="font-mono text-sam-fg">{o.orderNo || o.id.slice(0, 8)}</span>
                  <span className="text-sam-muted">
                    {processStatusLabel(o.orderStatus, "delivery", "owner_badge", language)}
                  </span>
                  <span className="text-sam-fg">{formatMoneyPhp(o.paymentAmount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-ui-rect border border-sam-border-soft bg-sam-app p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="sam-text-helper font-medium text-sam-fg">
              {t("admin_biz_kpi_recent_settlements")}
            </p>
            <Link href={businessCcSettlementsHref(storeId)} className="text-signature hover:underline sam-text-helper">
              {t("admin_biz_cta_settlements")}
            </Link>
          </div>
          {kpi.recentCommissions.length === 0 ? (
            <p className="sam-text-helper text-sam-muted">{t("admin_biz_kpi_empty")}</p>
          ) : (
            <ul className="space-y-1.5">
              {kpi.recentCommissions.map((s) => (
                <li key={s.id} className="flex flex-wrap justify-between gap-2 sam-text-helper">
                  <span className="font-mono text-sam-fg">{s.orderId.slice(0, 8)}</span>
                  <span className="text-sam-muted">{s.adjustmentStatus === "review_required" ? t("admin_biz_ops_settle_needs_check") : s.feeOutstandingMinor > 0 ? t("admin_biz_ops_settle_held") : t("admin_biz_ops_settle_ok")}</span>
                  <span className="text-sam-fg">{formatMoneyPhp(s.feeDueMinor / 100)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={businessCcProductsHref(storeId)} className={linkBtnClass}>
          {t("admin_biz_cta_products")}
        </Link>
        <Link href={businessCcReportsHref(storeId)} className={linkBtnClass}>
          {t("admin_biz_cta_reports")}
        </Link>
        <Link href={businessCcReviewsHref(storeId)} className={linkBtnClass}>
          {t("admin_biz_cta_reviews")}
        </Link>
      </div>
    </div>
  );
}

const linkBtnClass =
  "inline-flex rounded border border-sam-border bg-sam-app px-3 py-2 sam-text-helper font-medium text-sam-fg hover:bg-sam-surface-muted";

export type AdminBusinessCcLinkSection =
  | "products"
  | "orders"
  | "points"
  | "settlement"
  | "reviews"
  | "all";

/** DEF-56 — 탭마다 그 탭에 맞는 링크만 (READY/PARTIAL 같은 내부 표기 없음). */
export function AdminBusinessCcLinks({
  storeId,
  ownerUserId,
  storeName,
  slug,
  stats,
  section = "all",
}: {
  storeId: string;
  ownerUserId: string;
  storeName: string;
  slug: string;
  stats: { productCount: number; reviewCount: number };
  section?: AdminBusinessCcLinkSection;
}) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  type L = { href: string; label: string; note?: string };
  const products: L[] = [
    {
      href: businessCcProductsHref(storeId),
      label: t("admin_biz_cta_products"),
      note: ko ? `${stats.productCount}개` : `${stats.productCount}`,
    },
    { href: businessCcTaxonomyHref(), label: t("admin_biz_cta_taxonomy") },
  ];
  const orders: L[] = [
    { href: businessCcOrdersByStoreHref(storeId), label: t("admin_biz_cta_orders_by_store") },
    { href: businessCcStoreOrdersHref(storeId), label: t("admin_biz_cta_orders_all") },
    { href: businessCcCancellationsHref(storeId), label: t("admin_biz_cta_cancellations") },
    { href: businessCcRefundsHref(storeId), label: t("admin_biz_cta_refunds") },
    { href: businessCcInquiriesHref(storeId), label: ko ? "매장 문의" : "Store inquiries" },
  ];
  const points: L[] = [
    { href: businessCcPointsHref(storeId), label: ko ? "코인 거래" : "Coin transactions" },
    { href: businessCcCashTransactionsHref(storeId), label: ko ? "캐시 거래" : "Cash transactions" },
    { href: businessCcCashChargesHref(), label: ko ? "캐시 충전 요청" : "Cash top-up requests" },
    { href: businessCcAdvertisingHref(storeId), label: ko ? "매장 광고" : "Store ads" },
  ];
  const settlement: L[] = [
    { href: businessCcSettlementsHref(storeId), label: t("admin_biz_cta_settlements") },
    { href: businessCcFinancialStatementHref(storeId), label: ko ? "매장 재무" : "Store finance" },
    { href: businessCcFeePoliciesHref(), label: t("admin_biz_cta_fee") },
  ];
  const reviews: L[] = [
    {
      href: businessCcReviewsHref(storeId),
      label: t("admin_biz_cta_reviews"),
      note: ko ? `${stats.reviewCount}건` : `${stats.reviewCount}`,
    },
    { href: businessCcReportsHref(storeId), label: t("admin_biz_cta_reports") },
  ];
  const common: L[] = [
    { href: businessCcAuditHref(storeId), label: t("admin_biz_cta_audit") },
    { href: businessCcOwnerMemberHref(ownerUserId), label: t("admin_biz_cta_owner") },
    { href: businessCcDeliveryDistanceHref(), label: t("admin_biz_cta_delivery_distance") },
    { href: businessCcEntryReviewHref(storeName || slug), label: t("admin_biz_cta_entry_review") },
  ];
  if (slug.trim()) {
    common.push({ href: businessCcPublicStoreHref(slug), label: t("admin_biz_cta_public") });
  }
  const links: L[] =
    section === "products"
      ? products
      : section === "orders"
        ? orders
        : section === "points"
          ? points
          : section === "settlement"
            ? settlement
            : section === "reviews"
              ? reviews
              : [...orders, ...settlement, ...products, ...reviews, ...points, ...common];

  return (
    <div className="space-y-3">
      <p className="sam-text-helper text-sam-muted">
        {ko
          ? "이 매장으로 필터된 담당 화면으로 이동합니다. 처리는 각 화면에서 합니다."
          : "Opens the owning screen filtered to this store. Actions happen there."}
      </p>
      <div className="flex flex-wrap gap-2">
        {links.map((l) => (
          <Link key={`${l.href}:${l.label}`} href={l.href} className={linkBtnClass}>
            {l.label}
            {l.note ? (
              <span className="ml-1 text-[11px] font-normal text-sam-muted">{l.note}</span>
            ) : null}
          </Link>
        ))}
      </div>
    </div>
  );
}

function feeScopeLabel(scope: string, ko: boolean): string {
  const map: Record<string, [string, string]> = {
    store: ["매장 개별", "Store"],
    topic: ["세부 업종", "Topic"],
    category: ["업종", "Category"],
    default: ["플랫폼 기본", "Platform default"],
    missing_policy: ["정책 없음", "No policy"],
  };
  const hit = map[scope];
  return hit ? (ko ? hit[0] : hit[1]) : scope;
}

export function overrideModeLabel(mode: string, ko: boolean): string {
  if (mode === "inherit") return ko ? "전역 정책 따름" : "Follow global policy";
  if (mode === "enabled") return ko ? "허용" : "Allowed";
  if (mode === "disabled") return ko ? "차단" : "Blocked";
  return mode;
}

function policySourceLabel(source: string, ko: boolean): string {
  const map: Record<string, [string, string]> = {
    off: ["사용 안 함", "Off"],
    global: ["전역 정책", "Global policy"],
    store: ["매장 개별 설정", "Store override"],
    store_disabled: ["매장 개별 차단", "Blocked for store"],
  };
  const hit = map[source];
  return hit ? (ko ? hit[0] : hit[1]) : source;
}
