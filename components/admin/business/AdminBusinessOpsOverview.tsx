"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminStoreReviewRow } from "@/components/admin/stores/admin-store-review-model";
import type {
  BusinessCcDeliverySnapshot,
  BusinessCcKpiSummary,
  BusinessCcOpsOverview,
  BusinessCcOwner,
  BusinessCcSalesPermission,
} from "@/lib/admin-business/load-business-control-center-detail";
import {
  businessOpsOpenLabelKey,
  businessOpsSettlementLabelKey,
} from "@/lib/admin-business/business-ops-presentation";
import {
  businessCcCashChargesHref,
  businessCcDeliveryAdsHref,
  businessCcFinanceHref,
  businessCcFinancialStatementHref,
  businessCcOrdersByStoreHref,
  businessCcOwnerMemberHref,
  businessCcPartnerHref,
  businessCcPointsHref,
  businessCcProductsHref,
  businessCcPublicStoreHref,
  businessCcReportsHref,
  businessCcReviewsHref,
  businessCcSettlementsHref,
  businessCcSupportHref,
} from "@/lib/admin-business/business-control-center-links";
import { formatMoneyPhp } from "@/lib/utils/format";

const cardClass = "rounded-ui-rect border border-sam-border bg-white p-4 shadow-sm";
const linkClass =
  "inline-flex rounded-ui-rect border border-sam-border bg-sam-app px-3 py-1.5 text-[12px] font-semibold text-sam-fg hover:bg-sam-surface-muted";
const actionClass =
  "inline-flex flex-col items-center justify-center gap-1 rounded-ui-rect border border-sam-border bg-sam-app px-2 py-3 text-center text-[11px] font-medium text-sam-fg hover:bg-sam-surface-muted disabled:opacity-50 min-w-[88px]";

function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "ok" | "warn" | "bad" | "neutral";
}) {
  const cls =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : tone === "bad"
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-sam-border bg-sam-app text-sam-muted";
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}>
      {children}
    </span>
  );
}

function TrendChart({
  trend,
}: {
  trend: Array<{ day: string; orderCount: number; salesAmount: number }>;
}) {
  const { t } = useI18n();
  const w = 280;
  const h = 120;
  const pad = 8;
  const maxOrders = Math.max(1, ...trend.map((d) => d.orderCount));
  const maxSales = Math.max(1, ...trend.map((d) => d.salesAmount));
  const xs = trend.map((_, i) => pad + (i * (w - pad * 2)) / Math.max(1, trend.length - 1));
  const orderPts = trend
    .map((d, i) => {
      const y = h - pad - (d.orderCount / maxOrders) * (h - pad * 2);
      return `${xs[i]},${y}`;
    })
    .join(" ");
  const salesPts = trend
    .map((d, i) => {
      const y = h - pad - (d.salesAmount / maxSales) * (h - pad * 2);
      return `${xs[i]},${y}`;
    })
    .join(" ");

  return (
    <div className={cardClass}>
      <h3 className="text-[13px] font-semibold text-sam-fg">{t("admin_biz_ops_trend_title")}</h3>
      <p className="mt-0.5 text-[11px] text-sam-muted">{t("admin_biz_ops_trend_hint")}</p>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 h-32 w-full" role="img">
        <polyline fill="none" stroke="#6366f1" strokeWidth="2" points={orderPts} />
        <polyline fill="none" stroke="#10b981" strokeWidth="2" points={salesPts} />
      </svg>
      <div className="mt-1 flex gap-3 text-[11px] text-sam-muted">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-indigo-500" />
          {t("admin_biz_ops_trend_orders")}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          {t("admin_biz_ops_trend_sales")}
        </span>
      </div>
    </div>
  );
}

export function AdminBusinessOpsIdentityHeader({
  store,
  owner,
  ops,
  sales,
  delivery,
}: {
  store: AdminStoreReviewRow;
  owner: BusinessCcOwner;
  ops: BusinessCcOpsOverview;
  sales: BusinessCcSalesPermission;
  delivery: BusinessCcDeliverySnapshot;
}) {
  const { t } = useI18n();
  const approved = store.approval_status === "approved";
  const orderable = ops.openKind === "open";
  const deliveryOk = delivery.deliveryAvailable === true;
  const settleOk = ops.settlementKind === "ok";
  const meta = [ops.categoryName, ops.regionLine].filter(Boolean).join(" · ");

  return (
    <div className="rounded-ui-rect border border-sam-border bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-start gap-4">
          {store.profile_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={store.profile_image_url}
              alt=""
              className="h-16 w-16 rounded-ui-rect object-cover border border-sam-border"
            />
          ) : (
            <div className="h-16 w-16 rounded-ui-rect border border-sam-border bg-sam-surface-muted" />
          )}
          <div className="min-w-0 space-y-2">
            <h2 className="text-xl font-bold tracking-tight text-sam-fg">
              {(store.store_name ?? "").trim() || t("admin_stores_no_store_name")}
            </h2>
            {meta ? (
              <p className="sam-text-body break-words text-sam-muted">{meta}</p>
            ) : null}
            <p className="sam-text-body text-sam-fg">
              {owner.identityOk !== false && owner.displayLabel ? (
                <Link
                  href={businessCcOwnerMemberHref(owner.ownerUserId)}
                  className="font-medium hover:text-signature hover:underline"
                >
                  {owner.displayLabel}
                </Link>
              ) : (
                <span className="text-amber-800">{t("admin_biz_ops_owner_missing")}</span>
              )}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone={approved ? "ok" : "warn"}>
                {approved ? t("admin_biz_ops_badge_approved") : t("admin_biz_ops_badge_not_approved")}
              </Badge>
              <Badge
                tone={
                  ops.openKind === "open" ? "ok" : ops.openKind === "break" ? "warn" : "neutral"
                }
              >
                {t(businessOpsOpenLabelKey(ops.openKind))}
              </Badge>
              <Badge tone={orderable ? "ok" : "warn"}>
                {orderable
                  ? t("admin_biz_ops_badge_orderable")
                  : t("admin_biz_ops_badge_not_orderable")}
              </Badge>
              <Badge tone={deliveryOk ? "ok" : "warn"}>
                {deliveryOk
                  ? t("admin_biz_ops_badge_delivery")
                  : t("admin_biz_ops_badge_no_delivery")}
              </Badge>
              <Badge tone={settleOk ? "ok" : "warn"}>
                {settleOk
                  ? t("admin_biz_ops_badge_settle_ok")
                  : t("admin_biz_ops_badge_settle_issue")}
              </Badge>
              {sales && !sales.allowed_to_sell ? (
                <Badge tone="bad">{t("admin_biz_ops_risk_sales")}</Badge>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {store.slug ? (
            <Link href={businessCcPublicStoreHref(store.slug)} className={linkClass}>
              {t("admin_biz_cta_public")}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function AdminBusinessOpsRiskPanel({
  store,
  ops,
  sales,
  delivery,
  kpi,
}: {
  store: AdminStoreReviewRow;
  ops: BusinessCcOpsOverview;
  sales: BusinessCcSalesPermission;
  delivery: BusinessCcDeliverySnapshot;
  kpi: BusinessCcKpiSummary;
}) {
  const { t } = useI18n();
  const risks: { key: string; labelKey: MessageKey; vars?: Record<string, string> }[] = [];
  if (kpi.openReportCount > 0) {
    risks.push({
      key: "reports",
      labelKey: "admin_biz_ops_risk_reports",
      vars: { n: String(kpi.openReportCount) },
    });
  }
  if (sales && !sales.allowed_to_sell) {
    risks.push({ key: "sales", labelKey: "admin_biz_ops_risk_sales" });
  }
  if (store.approval_status === "suspended") {
    risks.push({ key: "suspended", labelKey: "admin_biz_ops_risk_suspended" });
  }
  if (ops.openKind !== "open") {
    risks.push({ key: "orderable", labelKey: "admin_biz_ops_risk_not_orderable" });
  }
  if (delivery.deliveryAvailable === false) {
    risks.push({ key: "delivery", labelKey: "admin_biz_ops_risk_no_delivery" });
  }
  if (ops.settlementKind !== "ok") {
    risks.push({ key: "settle", labelKey: "admin_biz_ops_risk_settlement" });
  }
  if (ops.pointCommerceBlocked) {
    risks.push({ key: "points", labelKey: "admin_biz_ops_risk_point_blocked" });
  }

  return (
    <div className={`${cardClass} ${risks.length ? "border-amber-300 bg-amber-50/50" : "bg-emerald-50/40 border-emerald-200"}`}>
      <h3 className="text-[13px] font-semibold text-sam-fg">{t("admin_biz_ops_risk_title")}</h3>
      {risks.length === 0 ? (
        <p className="mt-2 sam-text-body text-emerald-900">{t("admin_biz_ops_risk_none")}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {risks.map((r) => (
            <li key={r.key} className="sam-text-body text-amber-950">
              · {t(r.labelKey, r.vars)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatCard({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className={cardClass}>
      <h3 className="text-[13px] font-semibold text-sam-fg">{title}</h3>
      <div className="mt-2 space-y-1 text-[13px] text-sam-fg">{children}</div>
      {footer ? <div className="mt-3">{footer}</div> : null}
    </div>
  );
}

export function AdminBusinessOpsOverviewGrid({
  storeId,
  storeName,
  ops,
  delivery,
  kpi,
  onGoTab,
}: {
  storeId: string;
  storeName: string;
  ops: BusinessCcOpsOverview;
  delivery: BusinessCcDeliverySnapshot;
  kpi: BusinessCcKpiSummary;
  onGoTab: (tab: string) => void;
}) {
  const { t, safeT } = useI18n();
  const oc = kpi.orderStatusCounts;
  const sc = kpi.settlementStatusCounts;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <StatCard title={t("admin_biz_ops_card_ops")}>
        <div className="font-semibold">{t(businessOpsOpenLabelKey(ops.openKind))}</div>
        <div className="text-sam-muted">
          {t("admin_biz_ops_hours_today")}: {delivery.hoursLabel ?? "—"}
        </div>
        <div className="text-sam-muted">
          {t("admin_biz_ops_hours_break")}: {delivery.breakRangeLabel ?? "—"}
        </div>
        <div>
          {ops.openKind === "open"
            ? t("admin_biz_ops_orderable_yes")
            : t("admin_biz_ops_orderable_no")}
          {" · "}
          {delivery.deliveryAvailable === true
            ? t("admin_biz_ops_delivery_yes")
            : delivery.deliveryAvailable === false
              ? t("admin_biz_ops_delivery_no")
              : "—"}
        </div>
      </StatCard>

      <StatCard
        title={t("admin_biz_ops_card_orders")}
        footer={
          <Link href={businessCcOrdersByStoreHref(storeId)} className={linkClass}>
            {t("admin_biz_cta_orders_by_store")}
          </Link>
        }
      >
        <div>
          {t("admin_biz_ops_orders_today", { n: String(ops.todayOrderCount) })}
          {ops.todaySalesAmount > 0 ? (
            <span className="text-sam-muted"> · {formatMoneyPhp(ops.todaySalesAmount)}</span>
          ) : null}
        </div>
        <div>{t("admin_biz_ops_orders_in_progress", { n: String(kpi.inProgressOrderCount) })}</div>
        <div>{t("admin_biz_ops_orders_completed", { n: String(oc.completed) })}</div>
        <div>
          {t("admin_biz_ops_orders_cancel_refund", {
            c: String(oc.cancelled),
            r: String(oc.refundRequested),
          })}
        </div>
      </StatCard>

      <StatCard
        title={t("admin_biz_ops_card_settlement")}
        footer={
          <Link href={businessCcSettlementsHref(storeId)} className={linkClass}>
            {t("admin_biz_cta_settlements")}
          </Link>
        }
      >
        <div className="font-semibold">{t(businessOpsSettlementLabelKey(ops.settlementKind))}</div>
        <div className="text-sam-muted">
          {t("admin_biz_ops_settle_counts", {
            p: String(sc.pending),
            g: String(sc.processing),
            h: String(sc.held),
            d: String(sc.paid),
          })}
        </div>
      </StatCard>

      <StatCard
        title={t("admin_biz_ops_card_credit")}
        footer={
          <Link href={businessCcPointsHref(storeName)} className={linkClass}>
            {t("admin_biz_cta_points")}
          </Link>
        }
      >
        <div className="text-lg font-bold tabular-nums">
          {ops.pointBalance == null
            ? "—"
            : t("admin_biz_ops_credit_balance", { n: ops.pointBalance.toLocaleString() })}
        </div>
        {ops.recentPointCredit != null ? (
          <div className="text-emerald-700">
            {t("admin_biz_ops_credit_recent_plus", { n: String(ops.recentPointCredit) })}
          </div>
        ) : null}
        {ops.recentPointDebit != null ? (
          <div className="text-sam-muted">
            {t("admin_biz_ops_credit_recent_minus", { n: String(ops.recentPointDebit) })}
          </div>
        ) : null}
      </StatCard>

      <StatCard
        title={t("admin_biz_ops_card_products")}
        footer={
          <Link href={businessCcProductsHref(storeId)} className={linkClass}>
            {t("admin_biz_cta_products")}
          </Link>
        }
      >
        <div>{t("admin_biz_ops_products_total", { n: String(kpi.productCount) })}</div>
        <div>{t("admin_biz_ops_products_active", { n: String(ops.productActiveCount) })}</div>
        <div>{t("admin_biz_ops_products_sold_out", { n: String(ops.productSoldOutCount) })}</div>
        <div>{t("admin_biz_ops_products_inactive", { n: String(ops.productInactiveCount) })}</div>
      </StatCard>

      <StatCard
        title={t("admin_biz_ops_card_reviews")}
        footer={
          <Link href={businessCcReviewsHref(storeId)} className={linkClass}>
            {t("admin_biz_cta_reviews")}
          </Link>
        }
      >
        <div className="text-lg font-bold">
          {ops.ratingAvg == null
            ? "—"
            : t("admin_biz_ops_rating_avg", { rating: ops.ratingAvg.toFixed(1) })}
        </div>
        <div>{t("admin_biz_ops_reviews_n", { n: String(ops.reviewCountFromStore) })}</div>
        <div>{t("admin_biz_ops_reviews_hidden", { n: String(kpi.hiddenReviewCount) })}</div>
      </StatCard>

      <StatCard
        title={t("admin_biz_ops_card_reports")}
        footer={
          <div className="flex flex-wrap gap-2">
            <Link href={businessCcReportsHref(storeId)} className={linkClass}>
              {t("admin_biz_cta_reports")}
            </Link>
            <button type="button" className={linkClass} onClick={() => onGoTab("reports")}>
              {t("admin_biz_ops_nav_reports")}
            </button>
          </div>
        }
      >
        <div className={kpi.openReportCount > 0 ? "font-semibold text-red-700" : ""}>
          {t("admin_biz_ops_reports_open", { n: String(kpi.openReportCount) })}
        </div>
        <div>{t("admin_biz_ops_reports_total", { n: String(ops.reportTotalCount) })}</div>
      </StatCard>

      <StatCard
        title={safeT("admin_biz_ops_card_operation_links", {
          fallbackKo: "운영 바로가기",
          fallbackEn: "Operation links",
        })}
        footer={
          <div className="flex flex-wrap gap-2" data-admin-store-ops-hub-links="1">
            <Link
              href={businessCcFinancialStatementHref(storeId)}
              className={linkClass}
              data-store-hub-financial-statement="1"
            >
              {safeT("admin_biz_ops_link_financial_statement", {
                fallbackKo: "재무 명세서",
                fallbackEn: "Financial statement",
              })}
            </Link>
            <Link href={businessCcFinanceHref(storeId)} className={linkClass} data-store-hub-finance="1">
              Coin/Cash
            </Link>
            <Link href={businessCcCashChargesHref()} className={linkClass} data-store-hub-cash="1">
              Cash
            </Link>
            <Link
              href={businessCcDeliveryAdsHref(storeId)}
              className={linkClass}
              data-store-hub-ads="1"
            >
              Ads
            </Link>
            <Link href={businessCcPartnerHref()} className={linkClass} data-store-hub-partner="1">
              Partner
            </Link>
            <Link
              href={businessCcSupportHref(storeId)}
              className={linkClass}
              data-store-hub-support="1"
            >
              Support
            </Link>
          </div>
        }
      >
        <p className="text-[12px] text-sam-muted">
          {safeT("admin_biz_ops_operation_links_note", {
            fallbackKo:
              "Coin / Cash / 광고 / Partner / 문의는 각 canonical 화면에서 처리합니다. 이 카드는 바로가기만 제공합니다.",
            fallbackEn:
              "Coin / Cash / Ads / Partner / Support are handled on their canonical screens. This card is deep-links only.",
          })}
        </p>
      </StatCard>

      <StatCard
        title={t("admin_biz_ops_card_delivery")}
        footer={
          <button type="button" className={linkClass} onClick={() => onGoTab("delivery")}>
            {t("admin_biz_ops_nav_delivery")}
          </button>
        }
      >
        <div>
          {delivery.deliveryAvailable === true
            ? t("admin_biz_ops_delivery_yes")
            : delivery.deliveryAvailable === false
              ? t("admin_biz_ops_delivery_no")
              : "—"}
        </div>
        <div>
          {delivery.maxKm == null
            ? "—"
            : t("admin_biz_ops_delivery_max_km", { n: String(delivery.maxKm) })}
        </div>
        <div>
          {delivery.customerDeliveryFeePhp == null
            ? t("admin_biz_ops_delivery_fee_na")
            : t("admin_biz_ops_delivery_fee", {
                n: formatMoneyPhp(delivery.customerDeliveryFeePhp),
              })}
        </div>
      </StatCard>
    </div>
  );
}

export function AdminBusinessOpsQuickActions({
  busy,
  isOpen,
  onTempClose,
  onResumeOpen,
  onSalesLimit,
  onGoHours,
  pointsHref,
  trend,
}: {
  busy: boolean;
  isOpen: boolean | null;
  onTempClose: () => void;
  onResumeOpen: () => void;
  onSalesLimit: () => void;
  onGoHours: () => void;
  pointsHref: string;
  trend: BusinessCcOpsOverview["trend7d"];
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      <TrendChart trend={trend} />
      <div className={cardClass}>
        <h3 className="text-[13px] font-semibold text-sam-fg">{t("admin_biz_ops_card_actions")}</h3>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" className={actionClass} disabled={busy} onClick={onGoHours}>
            {t("admin_biz_ops_action_hours")}
          </button>
          {isOpen === false ? (
            <button type="button" className={actionClass} disabled={busy} onClick={onResumeOpen}>
              {t("admin_biz_ops_action_resume_open")}
            </button>
          ) : (
            <button type="button" className={actionClass} disabled={busy} onClick={onTempClose}>
              {t("admin_biz_ops_action_temp_close")}
            </button>
          )}
          <button type="button" className={actionClass} disabled={busy} onClick={onSalesLimit}>
            {t("admin_biz_ops_action_sales_limit")}
          </button>
          <Link href={pointsHref} className={actionClass}>
            {t("admin_biz_ops_action_points")}
          </Link>
        </div>
      </div>
    </div>
  );
}
