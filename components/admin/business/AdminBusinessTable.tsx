"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  businessOpsOpenLabelKey,
  businessOpsSettlementLabelKey,
  type BusinessOpsOpenKind,
  type BusinessOpsSettlementKind,
} from "@/lib/admin-business/business-ops-presentation";
import type { AdminBusinessListOpsRow } from "@/lib/admin-business/load-admin-business-list";
import { businessCcOwnerMemberHref } from "@/lib/admin-business/business-control-center-links";
import { formatMoneyPhp } from "@/lib/utils/format";

function openBadgeClass(kind: BusinessOpsOpenKind): string {
  switch (kind) {
    case "open":
      return "bg-emerald-500 text-white border-emerald-500";
    case "break":
      return "bg-amber-500 text-white border-amber-500";
    case "temp_closed":
      return "bg-orange-500 text-white border-orange-500";
    default:
      return "bg-slate-400 text-white border-slate-400";
  }
}

function settleBadgeClass(kind: BusinessOpsSettlementKind): string {
  switch (kind) {
    case "held":
      return "bg-red-50 text-red-800 border-red-200";
    case "needs_check":
      return "bg-amber-50 text-amber-900 border-amber-200";
    default:
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
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
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface-muted text-[11px] text-sam-muted">
      —
    </div>
  );
}

function StoreCell({ r }: { r: AdminBusinessListOpsRow }) {
  const { t } = useI18n();
  const detailHref = `/admin/business/${encodeURIComponent(r.id)}`;
  const meta = [r.categoryName, r.regionLine].filter(Boolean).join(" · ");
  return (
    <div className="flex items-center gap-2.5">
      <StoreThumb url={r.profileImageUrl} />
      <div className="min-w-0">
        <Link href={detailHref} className="font-semibold text-sam-fg hover:text-signature">
          {r.storeName.trim() || t("admin_stores_no_store_name")}
        </Link>
        {meta ? <div className="sam-text-helper text-sam-muted truncate">{meta}</div> : null}
      </div>
    </div>
  );
}

export function AdminBusinessTable({
  rows,
  viewMode,
}: {
  rows: AdminBusinessListOpsRow[];
  viewMode: "list" | "grid";
}) {
  const { t, language } = useI18n();

  if (viewMode === "grid") {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => {
          const detailHref = `/admin/business/${encodeURIComponent(r.id)}`;
          return (
            <div
              key={r.id}
              className="rounded-ui-rect border border-sam-border bg-white p-4 shadow-sm"
            >
              <StoreCell r={r} />
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${openBadgeClass(
                    r.openKind
                  )}`}
                >
                  {t(businessOpsOpenLabelKey(r.openKind))}
                </span>
                {r.hoursLabel ? (
                  <span className="rounded-full border border-sam-border px-2 py-0.5 text-[11px] text-sam-muted">
                    {r.hoursLabel}
                  </span>
                ) : null}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sam-text-helper">
                <div>
                  <div className="text-sam-muted">{t("admin_biz_ops_th_today")}</div>
                  <div className="font-medium tabular-nums">
                    {t("admin_biz_ops_today_n", { n: String(r.todayOrderCount) })}
                    {r.todaySalesAmount > 0 ? (
                      <span className="text-sam-muted"> · {formatMoneyPhp(r.todaySalesAmount)}</span>
                    ) : null}
                  </div>
                </div>
                <div>
                  <div className="text-sam-muted">{t("admin_biz_ops_th_credit")}</div>
                  <div className="font-medium tabular-nums">
                    {r.pointBalance == null
                      ? "—"
                      : t("admin_biz_ops_credit_n", { n: r.pointBalance.toLocaleString() })}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <Link
                  href={detailHref}
                  className="rounded-ui-rect border border-signature bg-signature px-3 py-1.5 text-[12px] font-semibold text-white"
                >
                  {t("admin_biz_ops_cta_detail")}
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-white shadow-sm">
      <table className="w-full min-w-[1280px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-slate-50">
            {[
              "admin_biz_ops_th_store",
              "admin_biz_ops_th_owner",
              "admin_biz_ops_th_open",
              "admin_biz_ops_th_order_delivery",
              "admin_biz_ops_th_today",
              "admin_biz_ops_th_credit",
              "admin_biz_ops_th_settle",
              "admin_biz_ops_th_rating",
              "admin_biz_ops_th_reports",
              "admin_biz_ops_th_last_order",
              "admin_biz_ops_th_manage",
            ].map((k) => (
              <th
                key={k}
                className="px-3 py-3 text-left text-[12px] font-semibold uppercase tracking-wide text-sam-muted"
              >
                {t(k as "admin_biz_ops_th_store")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const detailHref = `/admin/business/${encodeURIComponent(r.id)}`;
            return (
              <tr key={r.id} className="border-b border-sam-border-soft hover:bg-slate-50/80">
                <td className="px-3 py-3">
                  <StoreCell r={r} />
                </td>
                <td className="px-3 py-3">
                  {r.owner.ok ? (
                    <Link
                      href={businessCcOwnerMemberHref(r.owner.ownerUserId)}
                      className="font-medium text-sam-fg hover:text-signature"
                    >
                      {r.owner.label}
                    </Link>
                  ) : (
                    <span className="text-amber-800">{t("admin_biz_ops_owner_missing")}</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <div className="space-y-1">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${openBadgeClass(
                        r.openKind
                      )}`}
                    >
                      {t(businessOpsOpenLabelKey(r.openKind))}
                    </span>
                    {r.hoursLabel ? (
                      <div className="text-[11px] tabular-nums text-sam-muted">{r.hoursLabel}</div>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-3 text-[12px] leading-5">
                  <div className="font-medium text-sky-700">
                    {t("admin_biz_ops_in_progress_n", { n: String(r.inProgressOrderCount) })}
                    {" / "}
                    <span className="text-emerald-700">
                      {t("admin_biz_ops_delivering_n", { n: String(r.deliveringOrderCount) })}
                    </span>
                  </div>
                  <div className={r.orderable ? "text-emerald-700" : "text-red-600"}>
                    {r.orderable
                      ? t("admin_biz_ops_orderable_yes")
                      : t("admin_biz_ops_orderable_no")}
                  </div>
                  <div
                    className={
                      r.deliveryAvailable === true
                        ? "text-emerald-700"
                        : r.deliveryAvailable === false
                          ? "text-red-600"
                          : "text-sam-muted"
                    }
                  >
                    {r.deliveryAvailable === true
                      ? t("admin_biz_ops_delivery_yes")
                      : r.deliveryAvailable === false
                        ? t("admin_biz_ops_delivery_no")
                        : "—"}
                  </div>
                </td>
                <td className="px-3 py-3 tabular-nums">
                  <div className="font-semibold">
                    {t("admin_biz_ops_today_n", { n: String(r.todayOrderCount) })}
                  </div>
                  <div className="text-[12px] text-sam-muted">
                    {r.todaySalesAmount > 0 ? formatMoneyPhp(r.todaySalesAmount) : "—"}
                  </div>
                </td>
                <td className="px-3 py-3 font-semibold tabular-nums">
                  {r.pointBalance == null
                    ? "—"
                    : t("admin_biz_ops_credit_n", { n: r.pointBalance.toLocaleString() })}
                </td>
                <td className="px-3 py-3">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${settleBadgeClass(
                      r.settlementKind
                    )}`}
                  >
                    {t(businessOpsSettlementLabelKey(r.settlementKind))}
                  </span>
                </td>
                <td className="px-3 py-3 tabular-nums">
                  {r.ratingAvg == null
                    ? "—"
                    : `★ ${r.ratingAvg.toFixed(1)} (${r.reviewCount})`}
                </td>
                <td
                  className={`px-3 py-3 tabular-nums font-semibold ${
                    r.openReportCount > 0 ? "text-red-600" : "text-sam-muted"
                  }`}
                >
                  {r.openReportCount}
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-[12px] text-sam-muted">
                  {formatRelative(r.lastOrderAt, language)}
                </td>
                <td className="px-3 py-3">
                  <Link
                    href={detailHref}
                    className="inline-flex rounded-ui-rect border border-signature bg-signature px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90"
                  >
                    {t("admin_biz_ops_cta_detail")}
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
