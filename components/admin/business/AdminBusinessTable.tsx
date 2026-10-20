"use client";

import Link from "next/link";
import { forwardRef } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAdminNumber, formatAdminPhp } from "@/lib/admin/ui-standard/admin-format";
import {
  businessOpsOpenLabelKey,
  businessOpsSettlementLabelKey,
  type BusinessOpsOpenKind,
  type BusinessOpsSettlementKind,
} from "@/lib/admin-business/business-ops-presentation";
import type { AdminBusinessListOpsRow } from "@/lib/admin-business/load-admin-business-list";
import { businessCcOwnerMemberHref } from "@/lib/admin-business/business-control-center-links";
import { withAdminReturnTo } from "@/lib/admin/admin-operation-return-context";

function openBadgeClass(kind: BusinessOpsOpenKind): string {
  switch (kind) {
    case "open":
      return "bg-sam-success text-white border-sam-success";
    case "break":
      return "bg-sam-warning text-white border-sam-warning";
    case "temp_closed":
      return "bg-sam-warning text-white border-sam-warning";
    default:
      return "bg-sam-muted text-white border-sam-border";
  }
}

function settleBadgeClass(kind: BusinessOpsSettlementKind): string {
  switch (kind) {
    case "held":
      return "bg-sam-danger-soft text-sam-danger border-sam-danger";
    case "needs_check":
      return "bg-sam-warning-soft text-sam-warning border-sam-warning";
    default:
      return "bg-sam-success-soft text-sam-success border-sam-success";
  }
}

function formatRelative(iso: string | null, language: string): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return language === "en" ? "just now" : "방금";
  if (mins < 60) return language === "en" ? `${mins}m ago` : `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return language === "en" ? `${hours}h ago` : `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return language === "en" ? `${days}d ago` : `${days}일 전`;
}

function StoreThumb({ url }: { url: string | null }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="h-11 w-11 shrink-0 rounded-ui-rect object-cover border border-sam-border"
      />
    );
  }
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface-muted text-[12px] text-sam-muted">
      —
    </div>
  );
}

/** 목록 필터를 잃지 않도록 상세 링크에 returnTo(현재 목록 URL)를 붙인다. */
function businessDetailHref(storeId: string, returnTo?: string): string {
  return withAdminReturnTo(`/admin/business/${encodeURIComponent(storeId)}`, returnTo);
}

function StoreCell({ r, returnTo }: { r: AdminBusinessListOpsRow; returnTo?: string }) {
  const { t } = useI18n();
  const detailHref = businessDetailHref(r.id, returnTo);
  const meta = [r.categoryName, r.regionLine].filter(Boolean).join(" · ");
  return (
    <div className="flex w-[240px] max-w-[240px] items-center gap-2.5">
      <StoreThumb url={r.profileImageUrl} />
      <div className="min-w-0 flex-1">
        <Link
          href={detailHref}
          className="block truncate font-semibold text-sam-fg hover:text-signature"
        >
          {r.storeName.trim() || t("admin_stores_no_store_name")}
        </Link>
        {meta ? (
          <div className="sam-text-helper truncate text-sam-muted">{meta}</div>
        ) : null}
      </div>
    </div>
  );
}

const TH =
  "whitespace-nowrap px-3 py-3 text-left text-[12px] font-semibold uppercase tracking-wide text-sam-muted";
const TD = "align-top whitespace-nowrap px-3 py-3";

export const AdminBusinessTable = forwardRef<
  HTMLDivElement,
  {
    rows: AdminBusinessListOpsRow[];
    viewMode: "list" | "grid";
    onHorizontalScroll?: () => void;
    /** 현재 목록 URL (필터 포함) — 상세 페이지 뒤로가기에 사용 */
    returnTo?: string;
  }
>(function AdminBusinessTable({ rows, viewMode, onHorizontalScroll, returnTo }, ref) {
  const { t, language } = useI18n();
  const ko = language !== "en";

  if (viewMode === "grid") {
    return (
      <div className="grid w-full min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => {
          const detailHref = businessDetailHref(r.id, returnTo);
          return (
            <div
              key={r.id}
              className="min-w-0 rounded-ui-rect border border-sam-border bg-white p-4 shadow-sm"
            >
              <StoreCell r={r} returnTo={returnTo} />
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[12px] font-semibold ${openBadgeClass(
                    r.openKind
                  )}`}
                >
                  {t(businessOpsOpenLabelKey(r.openKind))}
                </span>
                {r.hoursLabel ? (
                  <span className="rounded-full border border-sam-border px-2 py-0.5 text-[12px] text-sam-muted">
                    {r.hoursLabel}
                  </span>
                ) : null}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sam-text-helper">
                <div className="min-w-0">
                  <div className="text-sam-muted">{t("admin_biz_ops_th_today")}</div>
                  <div className="truncate font-medium tabular-nums">
                    {t("admin_biz_ops_today_n", { n: String(r.todayOrderCount) })}
                    {r.todaySalesAmount > 0 ? (
                      <span className="text-sam-muted"> · {formatAdminPhp(r.todaySalesAmount)}</span>
                    ) : null}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-sam-muted">{t("admin_biz_ops_th_credit")}</div>
                  <div className="truncate font-medium tabular-nums">
                    {r.pointBalance == null
                      ? "—"
                      : t("admin_biz_ops_credit_n", { n: formatAdminNumber(r.pointBalance) })}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <Link
                  href={detailHref}
                  className="rounded-ui-rect border border-signature bg-signature px-3 py-1.5 text-[12px] font-semibold text-white"
                >
                  {ko ? "상세 보기" : "View detail"}
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      onScroll={onHorizontalScroll}
      className="w-full min-w-0 max-w-full overflow-x-auto overflow-y-visible overscroll-x-contain rounded-ui-rect border border-sam-border bg-white shadow-sm [-webkit-overflow-scrolling:touch] [scrollbar-width:thin] touch-pan-x"
    >
      {/* w-max: never compress columns on resize — parent scrolls horizontally instead */}
      <table className="w-max min-w-[1320px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-surface-muted">
            <th className={TH}>{t("admin_biz_ops_th_store")}</th>
            <th className={TH}>{t("admin_biz_ops_th_owner")}</th>
            <th className={TH}>{t("admin_biz_ops_th_open")}</th>
            <th className={TH}>{t("admin_biz_ops_th_order_delivery")}</th>
            <th className={TH}>{t("admin_biz_ops_th_today")}</th>
            <th className={TH}>{t("admin_biz_ops_th_credit")}</th>
            <th className={TH}>{t("admin_biz_ops_th_settle")}</th>
            <th className={TH}>{t("admin_biz_ops_th_rating")}</th>
            <th className={TH}>{t("admin_biz_ops_th_reports")}</th>
            <th className={TH}>{t("admin_biz_ops_th_last_order")}</th>
            <th className={TH}>{t("admin_biz_ops_th_manage")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const detailHref = businessDetailHref(r.id, returnTo);
            return (
              <tr key={r.id} className="border-b border-sam-border-soft hover:bg-sam-surface-muted/80">
                <td className={TD}>
                  <StoreCell r={r} returnTo={returnTo} />
                </td>
                <td className={TD}>
                  {r.owner.ok ? (
                    <Link
                      href={businessCcOwnerMemberHref(r.owner.ownerUserId)}
                      className="inline-block max-w-[180px] truncate font-medium text-sam-fg hover:text-signature"
                    >
                      {r.owner.label}
                    </Link>
                  ) : (
                    <span className="text-sam-warning">{t("admin_biz_ops_owner_missing")}</span>
                  )}
                </td>
                <td className={TD}>
                  <div className="space-y-1">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${openBadgeClass(
                        r.openKind
                      )}`}
                    >
                      {t(businessOpsOpenLabelKey(r.openKind))}
                    </span>
                    {r.hoursLabel ? (
                      <div className="text-[12px] tabular-nums text-sam-muted">{r.hoursLabel}</div>
                    ) : null}
                  </div>
                </td>
                <td className={TD}>
                  <div className="text-[12px] leading-5">
                    <div className="font-medium text-sam-info">
                      {t("admin_biz_ops_in_progress_n", { n: String(r.inProgressOrderCount) })}
                      {" / "}
                      <span className="text-sam-success">
                        {t("admin_biz_ops_delivering_n", { n: String(r.deliveringOrderCount) })}
                      </span>
                    </div>
                    <div className={r.orderable ? "text-sam-success" : "text-sam-danger"}>
                      {r.orderable
                        ? t("admin_biz_ops_orderable_yes")
                        : t("admin_biz_ops_orderable_no")}
                    </div>
                    <div
                      className={
                        r.deliveryAvailable === true
                          ? "text-sam-success"
                          : r.deliveryAvailable === false
                            ? "text-sam-danger"
                            : "text-sam-muted"
                      }
                    >
                      {r.deliveryAvailable === true
                        ? t("admin_biz_ops_delivery_yes")
                        : r.deliveryAvailable === false
                          ? t("admin_biz_ops_delivery_no")
                          : "—"}
                    </div>
                  </div>
                </td>
                <td className={`${TD} tabular-nums`}>
                  <div className="font-semibold">
                    {t("admin_biz_ops_today_n", { n: String(r.todayOrderCount) })}
                  </div>
                  <div className="text-[12px] text-sam-muted">
                    {r.todaySalesAmount > 0 ? formatAdminPhp(r.todaySalesAmount) : "—"}
                  </div>
                </td>
                <td className={`${TD} font-semibold tabular-nums`}>
                  {r.pointBalance == null
                    ? "—"
                    : t("admin_biz_ops_credit_n", { n: formatAdminNumber(r.pointBalance) })}
                </td>
                <td className={TD}>
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${settleBadgeClass(
                      r.settlementKind
                    )}`}
                  >
                    {t(businessOpsSettlementLabelKey(r.settlementKind))}
                  </span>
                </td>
                <td className={`${TD} tabular-nums`}>
                  {r.ratingAvg == null
                    ? "—"
                    : `★ ${r.ratingAvg.toFixed(1)} (${r.reviewCount})`}
                </td>
                <td
                  className={`${TD} tabular-nums font-semibold ${
                    r.openReportCount > 0 ? "text-sam-danger" : "text-sam-muted"
                  }`}
                >
                  {r.openReportCount}
                </td>
                <td className={`${TD} text-[12px] text-sam-muted`}>
                  {formatRelative(r.lastOrderAt, language)}
                </td>
                <td className={TD}>
                  <Link
                    href={detailHref}
                    className="inline-flex rounded-ui-rect border border-signature bg-signature px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90"
                  >
                    {ko ? "상세 보기" : "View detail"}
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});
