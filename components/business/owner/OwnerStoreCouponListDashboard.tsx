"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import {
  OWNER_ADMIN_LIST_CARD_CLASS,
  OWNER_ADMIN_OUTLINE_BTN_CLASS,
  OWNER_ADMIN_PRIMARY_BTN_CLASS,
} from "@/lib/business/owner-admin-list-ui";
import {
  ownerCouponListStatus,
  ownerCouponListStatusMessageKey,
  ownerCouponListTab,
  type OwnerCouponListTab,
} from "@/lib/stores/owner-coupon-list-bucket";
import { looksLikeRawOperatorToken } from "@/lib/stores/admin-coupon-control-view";
import { formatMoneyPhp } from "@/lib/utils/format";

export type OwnerCouponDashRow = {
  id: string;
  title: string;
  discount_type: string;
  discount_value: number;
  min_order_amount: number | null;
  lifecycle_state: string;
  funding_mode: string;
  issued_count?: number;
  issue_limit?: number | null;
  spend_budget_php?: number | null;
  reserved_spend_php?: number | null;
  redeemed_count?: number;
  start_at?: string;
  end_at?: string;
  usage_end_at?: string | null;
  max_discount?: number | null;
};

const TABS: Array<{
  id: OwnerCouponListTab;
  labelKey: "store_coupon_owner_tab_active" | "store_coupon_owner_tab_upcoming" | "store_coupon_owner_tab_ended";
}> = [
  { id: "active", labelKey: "store_coupon_owner_tab_active" },
  { id: "upcoming", labelKey: "store_coupon_owner_tab_upcoming" },
  { id: "ended", labelKey: "store_coupon_owner_tab_ended" },
];

function dayLabel(iso?: string | null): string {
  const s = String(iso ?? "").slice(0, 10);
  return s ? s.replaceAll("-", ".") : "—";
}

function benefitLabel(row: OwnerCouponDashRow): string {
  if (row.discount_type === "percent") return `${row.discount_value}%`;
  return formatMoneyPhp(row.discount_value);
}

function fundingLabelKey(mode: string): "store_coupon_funding_store" | "store_coupon_funding_platform" | "store_coupon_funding_shared" {
  if (mode === "PLATFORM_FUNDED") return "store_coupon_funding_platform";
  if (mode === "SHARED_FUNDED") return "store_coupon_funding_shared";
  return "store_coupon_funding_store";
}

function statusPillClass(status: ReturnType<typeof ownerCouponListStatus>): string {
  if (status === "active") return "bg-signature text-white";
  if (status === "upcoming" || status === "requested") return "bg-signature/15 text-signature";
  return "bg-sam-app text-sam-muted";
}

export function OwnerStoreCouponListDashboard({
  rows,
  tab,
  onTab,
  canCreate,
  onCreate,
  openId,
  onToggleOpen,
  onPause,
  onResume,
  onEnd,
  onReissue,
}: {
  rows: OwnerCouponDashRow[];
  tab: OwnerCouponListTab;
  onTab: (tab: OwnerCouponListTab) => void;
  canCreate: boolean;
  onCreate: () => void;
  openId: string | null;
  onToggleOpen: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onEnd: (id: string) => void;
  onReissue: (id: string) => void;
}) {
  const { t } = useI18n();
  const nowMs = Date.now();
  const counts = { active: 0, upcoming: 0, ended: 0 };
  for (const row of rows) counts[ownerCouponListTab(row, nowMs)] += 1;
  const visible = rows.filter((row) => ownerCouponListTab(row, nowMs) === tab);
  const kpis = [
    ["store_coupon_admin_kpi_total", rows.length],
    ["store_coupon_owner_tab_active", counts.active],
    ["store_coupon_owner_tab_upcoming", counts.upcoming],
    ["store_coupon_owner_tab_ended", counts.ended],
  ] as const;

  return (
    <OwnerStoreAdminDashSection title={t("store_coupon_owner_title")}>
      <div className="flex min-w-0 flex-col gap-3" data-owner-coupon-dash="1">
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4" data-owner-coupon-kpi="1">
          {kpis.map(([key, value]) => (
            <div key={key} className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
              <p className="text-sm text-sam-muted">{t(key)}</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-sam-fg">{value}</p>
            </div>
          ))}
        </div>
        <div className="grid min-w-0 grid-cols-3 gap-2" data-owner-coupon-tabs="1">
          {TABS.map((def) => {
            const selected = tab === def.id;
            const count = counts[def.id];
            return (
              <button
                key={def.id}
                type="button"
                data-owner-coupon-tab={def.id}
                className={`flex min-h-[48px] min-w-0 items-center justify-center gap-1 rounded-ui-rect px-2 text-sm font-medium ${
                  selected ? "bg-signature text-white" : "border border-sam-border bg-sam-surface text-sam-fg"
                }`}
                onClick={() => onTab(def.id)}
              >
                <span className="truncate">{t(def.labelKey)}</span>
                {count > 0 ? <span className="tabular-nums">{count}</span> : null}
              </button>
            );
          })}
        </div>
        {visible.length === 0 ? (
          <p className="text-sm text-sam-muted">{t("store_coupon_owner_empty")}</p>
        ) : (
          <ul className="space-y-2" data-owner-coupon-list="1">
            {visible.map((row) => {
              const status = ownerCouponListStatus(row, nowMs);
              const issued = Number(row.issued_count ?? 0);
              const used = Number(row.redeemed_count ?? 0);
              const rate = issued > 0 ? `${Math.round((used / issued) * 100)}%` : "—";
              const open = openId === row.id;
              const titleRaw = String(row.title ?? "").trim();
              const title = titleRaw && !looksLikeRawOperatorToken(titleRaw) ? titleRaw : t("store_coupon_field_title");
              return (
                <li key={row.id} className={OWNER_ADMIN_LIST_CARD_CLASS} data-owner-coupon-card="1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-lg font-bold text-sam-fg">{benefitLabel(row)}</p>
                    <span className={`shrink-0 rounded-ui-rect px-2 py-1 text-xs font-medium ${statusPillClass(status)}`}>
                      {t(ownerCouponListStatusMessageKey(status))}
                    </span>
                  </div>
                  <p className="mt-1 min-w-0 break-words text-sm text-sam-fg">{title}</p>
                  <p className="mt-1 text-xs text-sam-muted">
                    {dayLabel(row.start_at)} – {dayLabel(row.end_at)}
                  </p>
                  <p className="mt-1 text-xs text-sam-muted">
                    {t("store_coupon_owner_issued", { count: issued })}
                    {row.issue_limit != null ? `/${row.issue_limit}` : ""}
                    {" · "}
                    {t("store_coupon_owner_used", { count: used })}
                    {" · "}
                    {t("store_coupon_owner_usage_rate", { rate })}
                  </p>
                  <p className="mt-1 text-xs text-sam-muted">{t(fundingLabelKey(row.funding_mode))}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={OWNER_ADMIN_OUTLINE_BTN_CLASS}
                      onClick={() => onToggleOpen(row.id)}
                    >
                      {open ? t("store_coupon_admin_close") : t("store_coupon_admin_open")}
                    </button>
                    {row.funding_mode === "STORE_FUNDED" && status === "paused" ? (
                      <button type="button" className={OWNER_ADMIN_OUTLINE_BTN_CLASS} onClick={() => onResume(row.id)}>
                        {t("store_coupon_owner_resume")}
                      </button>
                    ) : row.funding_mode === "STORE_FUNDED" &&
                      status !== "ended" &&
                      status !== "requested" ? (
                      <button type="button" className={OWNER_ADMIN_OUTLINE_BTN_CLASS} onClick={() => onPause(row.id)}>
                        {t("store_coupon_owner_pause")}
                      </button>
                    ) : null}
                    {row.funding_mode === "STORE_FUNDED" && status !== "ended" ? (
                      <button
                        type="button"
                        className={`${OWNER_ADMIN_OUTLINE_BTN_CLASS} text-sam-danger`}
                        onClick={() => onEnd(row.id)}
                      >
                        {t("store_coupon_owner_end")}
                      </button>
                    ) : null}
                  </div>
                  {open ? (
                    <div className="mt-2 border-t border-sam-border-soft pt-2">
                      <p className="text-xs text-sam-muted">
                        {t("store_coupon_min_order")}{" "}
                        {row.min_order_amount != null ? formatMoneyPhp(row.min_order_amount) : "—"}
                        {row.max_discount != null ? ` · ${t("store_coupon_max_discount")} ${formatMoneyPhp(row.max_discount)}` : ""}
                      </p>
                      {row.funding_mode === "STORE_FUNDED" ? (
                        <button
                          type="button"
                          className={`${OWNER_ADMIN_OUTLINE_BTN_CLASS} mt-2`}
                          onClick={() => onReissue(row.id)}
                        >
                          {t("store_coupon_owner_reissue")}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <button
          type="button"
          disabled={!canCreate}
          className={`${OWNER_ADMIN_PRIMARY_BTN_CLASS} min-h-[44px] w-full`}
          data-owner-coupon-create="1"
          onClick={onCreate}
        >
          {t("store_coupon_owner_create")}
        </button>
      </div>
    </OwnerStoreAdminDashSection>
  );
}
