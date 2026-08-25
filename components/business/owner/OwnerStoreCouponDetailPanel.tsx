"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import {
  OWNER_ADMIN_LIST_CARD_CLASS,
  OWNER_ADMIN_OUTLINE_BTN_CLASS,
  OWNER_ADMIN_PRIMARY_BTN_CLASS,
} from "@/lib/business/owner-admin-list-ui";
import { looksLikeRawOperatorToken } from "@/lib/stores/admin-coupon-control-view";
import type { CouponCampaignOpsView } from "@/lib/stores/load-coupon-campaign-ops-bundle";
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
  ops,
  loading = false,
  onAct,
  onBack,
}: {
  row: OwnerCouponDashRow | null;
  ops?: CouponCampaignOpsView | null;
  loading?: boolean;
  onAct: (action: OwnerCouponDetailAction) => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const detail = ops ?? null;

  if (loading && !row && !detail) {
    return (
      <OwnerStoreAdminDashSection title={t("store_coupon_owner_role_detail")}>
        <p className="text-sm text-sam-muted" data-owner-coupon-detail="loading">
          {t("store_coupon_owner_role_detail")}
        </p>
      </OwnerStoreAdminDashSection>
    );
  }

  const source = detail ?? row;
  if (!source) {
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
  const status = ownerCouponListStatus(source as OwnerCouponDashRow, nowMs);
  const actions = ownerCouponDetailActions(status);
  const issued = Number(detail?.issued_count ?? row?.issued_count ?? 0);
  const used = Number(detail?.redeemed_count ?? row?.redeemed_count ?? 0);
  const rate = issued > 0 ? `${Math.round((used / issued) * 100)}%` : "—";
  const titleRaw = String(source.title ?? "").trim();
  const title = titleRaw && !looksLikeRawOperatorToken(titleRaw) ? titleRaw : t("store_coupon_field_title");
  const reserved = formatMoneyPhp(Number(detail?.reserved_spend_php ?? row?.reserved_spend_php ?? 0));
  const budget =
    detail?.spend_budget_php != null || row?.spend_budget_php != null
      ? formatMoneyPhp(Number(detail?.spend_budget_php ?? row?.spend_budget_php ?? 0))
      : "—";
  const fundingMode = String(detail?.funding_mode ?? row?.funding_mode ?? "STORE_FUNDED");

  return (
    <div className="flex min-w-0 flex-col gap-3" data-owner-coupon-detail="1">
      <button type="button" className={OWNER_ADMIN_OUTLINE_BTN_CLASS} onClick={onBack} data-owner-coupon-detail-back="1">
        {t("store_coupon_owner_back_list")}
      </button>
      <OwnerStoreAdminDashSection title={t("store_coupon_admin_section_basic")}>
        <div className={OWNER_ADMIN_LIST_CARD_CLASS}>
          <div className="flex items-start justify-between gap-2">
            <p className="text-lg font-bold text-sam-fg">{benefitLabel(source as OwnerCouponDashRow)}</p>
            <span className="shrink-0 rounded-ui-rect bg-sam-app px-2 py-1 text-xs font-medium text-sam-fg" data-owner-coupon-detail-status="1">
              {t(ownerCouponListStatusMessageKey(status))}
            </span>
          </div>
          <p className="mt-1 min-w-0 break-words text-sm text-sam-fg">{title}</p>
          {detail ? (
            <>
              <p className="mt-1 text-xs text-sam-muted">{t(detail.issuer.roleKey)}</p>
              <p className="mt-1 text-xs text-sam-muted">{t(detail.purpose.purposeKey)}</p>
            </>
          ) : null}
          <p className="mt-1 text-xs text-sam-muted">
            {t("store_coupon_issue_window")} {dayLabel(source.start_at)} – {dayLabel(source.end_at)}
          </p>
          {(detail?.usage_end_at ?? row?.usage_end_at) ? (
            <p className="mt-1 text-xs text-sam-muted">
              {t("store_coupon_usage_window")} {dayLabel(detail?.usage_end_at ?? row?.usage_end_at)}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-sam-muted">{t(fundingLabelKey(fundingMode))}</p>
        </div>
      </OwnerStoreAdminDashSection>
      <OwnerStoreAdminDashSection title={t("store_coupon_admin_section_issue_use")}>
        <p className="text-sm text-sam-fg" data-owner-coupon-detail-perf="1">
          {t("store_coupon_owner_issued_limit")}: {issued}
          {(detail?.issue_limit ?? row?.issue_limit) != null ? `/${detail?.issue_limit ?? row?.issue_limit}` : ""}
          {" · "}
          {t("store_coupon_owner_issued_actual")}: {issued}
          {" · "}
          {t("store_coupon_owner_used", { count: used })}
          {" · "}
          {t("store_coupon_owner_usage_rate", { rate })}
        </p>
        {detail ? (
          <p className="mt-1 text-sm text-sam-fg">
            {t("store_coupon_owner_held_active")}: {detail.active_held_count}
            {" · "}
            {t("store_coupon_owner_remaining_claims")}:{" "}
            {detail.remaining_claim_slots == null ? "—" : detail.remaining_claim_slots}
          </p>
        ) : null}
        {detail && !detail.issued_reconciliation.consistent ? (
          <p className="mt-1 text-sm text-sam-danger">{t("store_coupon_data_inconsistency")}</p>
        ) : null}
        {(detail?.min_order_amount ?? row?.min_order_amount) != null ? (
          <p className="mt-1 text-xs text-sam-muted">
            {t("store_coupon_min_order")}{" "}
            {formatMoneyPhp(Number(detail?.min_order_amount ?? row?.min_order_amount ?? 0))}
            {(row?.max_discount ?? null) != null
              ? ` · ${t("store_coupon_max_discount")} ${formatMoneyPhp(Number(row?.max_discount ?? 0))}`
              : ""}
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
        {detail ? (
          <>
            <p className="mt-2 text-sm text-sam-fg">
              {t("store_coupon_owner_realized_gmv")}: {formatMoneyPhp(detail.order_sales_php)}
            </p>
            <p className="text-sm text-sam-fg">
              {t("store_coupon_owner_realized_discount")}: {formatMoneyPhp(detail.realized.customer_discount)}
            </p>
            <p className="text-sm text-sam-fg">
              {t("store_coupon_owner_realized_store_cost")}: {formatMoneyPhp(detail.realized.store_funded)}
            </p>
            <p className="text-sm text-sam-fg">
              {t("store_coupon_owner_realized_platform")}: {formatMoneyPhp(detail.realized.platform_funded)}
            </p>
          </>
        ) : null}
      </OwnerStoreAdminDashSection>
      {detail && detail.instances.length > 0 ? (
        <OwnerStoreAdminDashSection title={t("store_coupon_admin_section_instances")}>
          <ul className="space-y-2">
            {detail.instances.slice(0, 20).map((inst) => (
              <li key={inst.entitlement_id} className="rounded-ui-rect bg-sam-app px-3 py-2 text-sm">
                <p className="font-medium text-sam-fg">
                  {t("store_coupon_number_label")}: {inst.coupon_number ?? t("store_coupon_number_legacy")}
                </p>
                <p className="mt-1 text-xs text-sam-muted">
                  {t("store_coupon_instance_status")}: {inst.status}
                  {inst.buyer_label ? ` · ${t("store_coupon_instance_buyer")}: ${inst.buyer_label}` : ""}
                  {inst.order_no ? ` · ${inst.order_no}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </OwnerStoreAdminDashSection>
      ) : null}
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
