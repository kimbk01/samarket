"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import {
  OWNER_ADMIN_LIST_CARD_CLASS,
  OWNER_ADMIN_OUTLINE_BTN_CLASS,
  OWNER_ADMIN_PRIMARY_BTN_CLASS,
} from "@/lib/business/owner-admin-list-ui";
import { looksLikeRawOperatorToken } from "@/lib/stores/admin-coupon-control-view";
import {
  ownerCouponDetailActions,
  ownerCouponListStatus,
  ownerCouponListStatusMessageKey,
  type OwnerCouponDetailAction,
} from "@/lib/stores/owner-coupon-list-bucket";
import { formatMoneyPhp } from "@/lib/utils/format";
import type { OwnerCouponDashRow } from "@/components/business/owner/OwnerStoreCouponListDashboard";

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

export function OwnerStoreCouponDetailPanel({
  row,
  loading = false,
  onAct,
  onBack,
}: {
  row: OwnerCouponDashRow | null;
  loading?: boolean;
  onAct: (action: OwnerCouponDetailAction) => void;
  onBack: () => void;
}) {
  const { t } = useI18n();

  if (loading && !row) {
    return (
      <OwnerStoreAdminDashSection title={t("store_coupon_owner_role_detail")}>
        <p className="text-sm text-sam-muted" data-owner-coupon-detail="loading">
          {t("store_coupon_owner_role_detail")}
        </p>
      </OwnerStoreAdminDashSection>
    );
  }

  if (!row) {
    return (
      <OwnerStoreAdminDashSection title={t("store_coupon_owner_role_detail")}>
        <p className="text-sm text-sam-muted" data-owner-coupon-detail="missing">
          {t("store_coupon_owner_missing_campaign")}
        </p>
        <button type="button" className={`${OWNER_ADMIN_OUTLINE_BTN_CLASS} mt-3`} onClick={onBack}>
          {t("store_coupon_owner_back_list")}
        </button>
      </OwnerStoreAdminDashSection>
    );
  }

  const nowMs = Date.now();
  const status = ownerCouponListStatus(row, nowMs);
  const actions = ownerCouponDetailActions(status);
  const issued = Number(row.issued_count ?? 0);
  const used = Number(row.redeemed_count ?? 0);
  const rate = issued > 0 ? `${Math.round((used / issued) * 100)}%` : "—";
  const titleRaw = String(row.title ?? "").trim();
  const title = titleRaw && !looksLikeRawOperatorToken(titleRaw) ? titleRaw : t("store_coupon_field_title");
  const reserved = row.reserved_spend_php != null ? formatMoneyPhp(row.reserved_spend_php) : "—";
  const budget = row.spend_budget_php != null ? formatMoneyPhp(row.spend_budget_php) : "—";

  return (
    <div className="flex min-w-0 flex-col gap-3" data-owner-coupon-detail="1">
      <button type="button" className={OWNER_ADMIN_OUTLINE_BTN_CLASS} onClick={onBack} data-owner-coupon-detail-back="1">
        {t("store_coupon_owner_back_list")}
      </button>
      <OwnerStoreAdminDashSection title={t("store_coupon_admin_section_basic")}>
        <div className={OWNER_ADMIN_LIST_CARD_CLASS}>
          <div className="flex items-start justify-between gap-2">
            <p className="text-lg font-bold text-sam-fg">{benefitLabel(row)}</p>
            <span className="shrink-0 rounded-ui-rect bg-sam-app px-2 py-1 text-xs font-medium text-sam-fg" data-owner-coupon-detail-status="1">
              {t(ownerCouponListStatusMessageKey(status))}
            </span>
          </div>
          <p className="mt-1 min-w-0 break-words text-sm text-sam-fg">{title}</p>
          <p className="mt-1 text-xs text-sam-muted">
            {t("store_coupon_issue_window")} {dayLabel(row.start_at)} – {dayLabel(row.end_at)}
          </p>
          {row.usage_end_at ? (
            <p className="mt-1 text-xs text-sam-muted">
              {t("store_coupon_usage_window")} {dayLabel(row.usage_end_at)}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-sam-muted">{t(fundingLabelKey(row.funding_mode))}</p>
        </div>
      </OwnerStoreAdminDashSection>
      <OwnerStoreAdminDashSection title={t("store_coupon_admin_section_issue_use")}>
        <p className="text-sm text-sam-fg" data-owner-coupon-detail-perf="1">
          {t("store_coupon_owner_issued", { count: issued })}
          {row.issue_limit != null ? `/${row.issue_limit}` : ""}
          {" · "}
          {t("store_coupon_owner_used", { count: used })}
          {" · "}
          {t("store_coupon_owner_usage_rate", { rate })}
        </p>
        {row.min_order_amount != null ? (
          <p className="mt-1 text-xs text-sam-muted">
            {t("store_coupon_min_order")} {formatMoneyPhp(row.min_order_amount)}
            {row.max_discount != null ? ` · ${t("store_coupon_max_discount")} ${formatMoneyPhp(row.max_discount)}` : ""}
          </p>
        ) : null}
      </OwnerStoreAdminDashSection>
      <OwnerStoreAdminDashSection title={t("store_coupon_admin_section_cost")}>
        <p className="text-sm text-sam-fg" data-owner-coupon-detail-cost="1">
          {t("store_coupon_owner_create_lock")}
        </p>
        <p className="mt-1 text-xs text-sam-muted">
          {t("store_coupon_admin_budget_label")} {budget}
          {" · "}
          {t("store_coupon_admin_reserved_label")} {reserved}
        </p>
      </OwnerStoreAdminDashSection>
      <OwnerStoreAdminDashSection title={t("store_coupon_admin_section_ops")}>
        <p className="mb-2 text-xs text-sam-muted">{t("store_coupon_admin_pause_hint")}</p>
        <div className="flex min-w-0 flex-col gap-2" data-owner-coupon-detail-actions="1">
          {actions.includes("pause") ? (
            <button
              type="button"
              className={OWNER_ADMIN_OUTLINE_BTN_CLASS}
              data-owner-coupon-detail-pause="1"
              onClick={() => onAct("pause")}
            >
              {t("store_coupon_owner_pause")}
            </button>
          ) : null}
          {actions.includes("resume") ? (
            <button
              type="button"
              className={OWNER_ADMIN_PRIMARY_BTN_CLASS}
              data-owner-coupon-detail-resume="1"
              onClick={() => onAct("resume")}
            >
              {t("store_coupon_owner_resume")}
            </button>
          ) : null}
          {actions.includes("reissue") ? (
            <button
              type="button"
              className={OWNER_ADMIN_OUTLINE_BTN_CLASS}
              data-owner-coupon-detail-reissue="1"
              onClick={() => onAct("reissue")}
            >
              {t("store_coupon_owner_reissue")}
            </button>
          ) : null}
          {actions.includes("end") ? (
            <button
              type="button"
              className={`${OWNER_ADMIN_OUTLINE_BTN_CLASS} text-sam-danger`}
              data-owner-coupon-detail-end="1"
              onClick={() => onAct("end")}
            >
              {t("store_coupon_owner_end")}
            </button>
          ) : null}
        </div>
      </OwnerStoreAdminDashSection>
    </div>
  );
}
