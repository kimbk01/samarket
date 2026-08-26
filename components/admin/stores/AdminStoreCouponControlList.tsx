"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminCard } from "@/components/admin/AdminCard";
import {
  ADMIN_COUPON_LIST_PAGE_SIZE,
  adminCouponListPageCount,
  filterAdminCouponListRows,
  paginateAdminCouponListRows,
  type AdminCouponListFundingFilter,
  type AdminCouponListStatusFilter,
} from "@/lib/stores/admin-coupon-control-list";
import type { CouponCampaignOpsView } from "@/lib/stores/load-coupon-campaign-ops-bundle";
import type { CouponControlCampaignView } from "@/lib/stores/admin-coupon-control-realized";
import {
  adminCouponFundingMessageKey,
  adminCouponLifecycleMessageKey,
  formatAdminCouponDay,
  humanAdminStoreName,
  looksLikeRawOperatorToken,
} from "@/lib/stores/admin-coupon-control-view";
import { formatMoneyPhp } from "@/lib/utils/format";

const FILTER_SELECT_CLASS =
  "min-h-[44px] min-w-0 rounded-ui-rect border border-sam-border bg-sam-surface px-2 text-sm text-sam-fg";

type AdminListRow = CouponControlCampaignView & Partial<CouponCampaignOpsView>;

function benefitText(row: CouponControlCampaignView): string {
  if (row.discount_type === "percent") return `${row.discount_value}%`;
  return formatMoneyPhp(row.discount_value);
}

export function AdminStoreCouponControlList({
  campaigns,
  onOpenDetail,
}: {
  campaigns: AdminListRow[];
  onOpenDetail: (campaignId: string) => void;
}) {
  const { t, safeT } = useI18n();
  const [status, setStatus] = useState<AdminCouponListStatusFilter>("all");
  const [funding, setFunding] = useState<AdminCouponListFundingFilter>("all");
  const [storeId, setStoreId] = useState("");
  const [page, setPage] = useState(1);

  const storeOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; name: string }[] = [];
    for (const row of campaigns) {
      const id = String(row.store_id ?? "").trim();
      if (!id || seen.has(id)) continue;
      const name = humanAdminStoreName(row.store_name);
      if (!name) continue;
      seen.add(id);
      out.push({ id, name });
    }
    return out;
  }, [campaigns]);

  const filtered = useMemo(() => {
    return filterAdminCouponListRows(campaigns, { status, funding, storeId });
  }, [campaigns, status, funding, storeId]);

  const pages = adminCouponListPageCount(filtered.length);
  const safePage = Math.min(page, pages);
  const visible = useMemo(
    () => paginateAdminCouponListRows(filtered, safePage, ADMIN_COUPON_LIST_PAGE_SIZE),
    [filtered, safePage]
  );

  const setStatusFilter = (next: AdminCouponListStatusFilter) => {
    setStatus(next);
    setPage(1);
  };
  const setFundingFilter = (next: AdminCouponListFundingFilter) => {
    setFunding(next);
    setPage(1);
  };
  const setStoreFilter = (next: string) => {
    setStoreId(next);
    setPage(1);
  };

  return (
    <AdminCard titleKey="store_coupon_admin_role_list">
      <div className="flex min-w-0 flex-col gap-3" data-admin-coupon-pane="list">
        <div
          className="flex min-w-0 flex-wrap items-center gap-2"
          data-admin-coupon-list-filters="1"
        >
          <label className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 sm:flex-none">
            <span className="shrink-0 text-sm text-sam-muted">{t("store_coupon_admin_filter_status")}</span>
            <select
              className={FILTER_SELECT_CLASS}
              value={status}
              aria-label={t("store_coupon_admin_filter_status")}
              onChange={(e) => setStatusFilter(e.target.value as AdminCouponListStatusFilter)}
            >
              <option value="all">{t("store_coupon_admin_filter_all")}</option>
              <option value="active">{t("store_coupon_admin_kpi_active")}</option>
              <option value="waiting">{t("store_coupon_admin_kpi_waiting")}</option>
              <option value="ended">{t("store_coupon_admin_kpi_ended")}</option>
            </select>
          </label>
          <label className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 sm:flex-none">
            <span className="shrink-0 text-sm text-sam-muted">{t("store_coupon_admin_pick_store")}</span>
            <select
              className={FILTER_SELECT_CLASS}
              value={storeId}
              aria-label={t("store_coupon_admin_pick_store")}
              onChange={(e) => setStoreFilter(e.target.value)}
            >
              <option value="">{t("store_coupon_admin_filter_all")}</option>
              {storeOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 sm:flex-none">
            <span className="shrink-0 text-sm text-sam-muted">{t("store_coupon_funding")}</span>
            <select
              className={FILTER_SELECT_CLASS}
              value={funding}
              aria-label={t("store_coupon_funding")}
              onChange={(e) => setFundingFilter(e.target.value as AdminCouponListFundingFilter)}
            >
              <option value="all">{t("store_coupon_admin_filter_all")}</option>
              <option value="STORE_FUNDED">{t("store_coupon_funding_store")}</option>
              <option value="PLATFORM_FUNDED">{t("store_coupon_funding_platform")}</option>
              <option value="SHARED_FUNDED">{t("store_coupon_funding_shared")}</option>
            </select>
          </label>
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-sam-muted">{t("store_coupon_admin_list_empty")}</p>
        ) : (
          <>
            <ul className="flex min-w-0 flex-col gap-2" data-admin-coupon-list-scroll="1">
              {visible.map((row) => {
                const storeLabel =
                  humanAdminStoreName(row.store_name) ??
                  safeT("store_coupon_wallet_store_fallback", { fallbackKo: "매장", fallbackEn: "Store" });
                const titleRaw = String(row.title ?? "").trim();
                const title =
                  titleRaw && !looksLikeRawOperatorToken(titleRaw)
                    ? titleRaw
                    : t("store_coupon_field_title");
                const issued = row.issued_count;
                const remaining =
                  row.remaining_claim_slots != null
                    ? row.remaining_claim_slots
                    : row.issue_limit != null
                      ? Math.max(0, row.issue_limit - row.issued_count)
                      : null;
                const held = row.active_held_count ?? Math.max(0, row.claimed_count - row.redeemed_count);
                const issuerLabel = row.issuer ? t(row.issuer.roleKey) : "—";
                const meta: Array<[string, string]> = [
                  [t("store_coupon_ops_issued_at"), formatAdminCouponDay(row.created_at) || "—"],
                  [t("store_coupon_owner_issued_limit"), row.issue_limit == null ? "—" : String(row.issue_limit)],
                  [t("store_coupon_owner_issued_actual"), String(issued)],
                  [t("store_coupon_owner_held_active"), String(held)],
                  [t("store_coupon_owner_used", { count: row.redeemed_count }), String(row.redeemed_count)],
                  [t("store_coupon_ops_remaining"), remaining == null ? "—" : String(remaining)],
                  [t("store_coupon_ops_gmv"), formatMoneyPhp(Number(row.order_sales_php ?? 0))],
                  [t("store_coupon_ops_discount_total"), formatMoneyPhp(row.realized.customer_discount)],
                  [t("store_coupon_ops_store_burden"), formatMoneyPhp(row.realized.store_funded)],
                  [t("store_coupon_ops_platform_burden"), formatMoneyPhp(row.realized.platform_funded)],
                ];
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      className="w-full min-w-0 rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-left"
                      data-admin-coupon-list-row="1"
                      onClick={() => onOpenDetail(row.id)}
                    >
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-sam-fg">{title}</p>
                          <p className="mt-0.5 text-xs text-sam-muted">
                            {storeLabel} · {issuerLabel} · {t(adminCouponFundingMessageKey(row.funding_mode))}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs font-medium text-sam-fg">
                          {t(adminCouponLifecycleMessageKey(row.lifecycle_state, row.start_at, row.end_at))}
                        </span>
                      </div>
                      <p className="mt-1 text-base font-bold tabular-nums text-signature">{benefitText(row)}</p>
                      <dl className="mt-2 grid min-w-0 grid-cols-2 gap-x-2 gap-y-1" data-admin-coupon-ops-grid="1">
                        {meta.map(([label, value]) => (
                          <div key={label} className="min-w-0">
                            <dt className="truncate text-[11px] text-sam-muted">{label}</dt>
                            <dd className="truncate text-xs tabular-nums text-sam-fg">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="flex min-h-[44px] items-center justify-between gap-2">
              <button
                type="button"
                className="min-h-[44px] rounded-ui-rect border border-sam-border px-3 text-sm disabled:opacity-40"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t("store_coupon_admin_list_prev")}
              </button>
              <p className="text-sm text-sam-muted">
                {t("store_coupon_admin_list_page", { page: String(safePage), pages: String(pages) })}
              </p>
              <button
                type="button"
                className="min-h-[44px] rounded-ui-rect border border-sam-border px-3 text-sm disabled:opacity-40"
                disabled={safePage >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t("store_coupon_admin_list_next")}
              </button>
            </div>
          </>
        )}
      </div>
    </AdminCard>
  );
}
