"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminCard } from "@/components/admin/AdminCard";
import type { CouponCampaignOpsView } from "@/lib/stores/load-coupon-campaign-ops-bundle";
import { couponControlActionsForLifecycle, type CouponControlCampaignView } from "@/lib/stores/admin-coupon-control-realized";
import { buildAdminPromotionCreateHref } from "@/lib/stores/coupon-offer-promotion-deeplink";
import {
  adminCouponAuditActionMessageKey,
  adminCouponFundingMessageKey,
  adminCouponLifecycleMessageKey,
  adminCouponSettlementMessageKey,
  adminCouponTargetMessageKey,
  formatAdminCouponDay,
  humanAdminOrderNo,
  humanAdminStoreName,
  looksLikeRawOperatorToken,
} from "@/lib/stores/admin-coupon-control-view";
import { processStatusLabel } from "@/lib/stores/store-order-process-model";
import { formatMoneyPhp } from "@/lib/utils/format";

const CTA_PRIMARY =
  "min-h-[44px] rounded-ui-rect bg-signature px-4 text-sm font-medium text-white disabled:opacity-50";
const CTA_OUTLINE =
  "min-h-[44px] rounded-ui-rect border border-sam-border bg-sam-surface px-4 text-sm font-medium text-sam-fg disabled:opacity-50";

function benefitText(row: CouponControlCampaignView): string {
  if (row.discount_type === "percent") return `${row.discount_value}%`;
  return formatMoneyPhp(row.discount_value);
}

export function AdminStoreCouponControlDetail({
  campaign,
  onAct,
  actError,
}: {
  campaign: (CouponControlCampaignView & Partial<CouponCampaignOpsView>) | null;
  onAct: (id: string, action: string, revokeReason?: string) => Promise<void>;
  actError: string | null;
}) {
  const { t, language, safeT } = useI18n();
  const [revokeReason, setRevokeReason] = useState("");

  if (!campaign) {
    return (
      <AdminCard titleKey="store_coupon_admin_role_detail">
        <p className="text-sm text-sam-muted" data-admin-coupon-pane="detail">
          {t("store_coupon_admin_pane_detail_pending")}
        </p>
      </AdminCard>
    );
  }

  const storeLabel =
    humanAdminStoreName(campaign.store_name) ??
    safeT("store_coupon_wallet_store_fallback", { fallbackKo: "매장", fallbackEn: "Store" });
  const titleRaw = String(campaign.title ?? "").trim();
  const title =
    titleRaw && !looksLikeRawOperatorToken(titleRaw) ? titleRaw : t("store_coupon_field_title");
  const period = [formatAdminCouponDay(campaign.start_at), formatAdminCouponDay(campaign.end_at)]
    .filter(Boolean)
    .join(" – ");
  const targetKey = adminCouponTargetMessageKey(campaign.first_order_scope);
  const issued = campaign.issued_count;
  const remaining =
    campaign.issue_limit != null ? Math.max(0, campaign.issue_limit - campaign.issued_count) : null;
  const usageRate =
    campaign.issued_count > 0
      ? `${Math.round((campaign.redeemed_count / campaign.issued_count) * 100)}%`
      : "—";
  const actions = couponControlActionsForLifecycle(campaign.lifecycle_state);

  return (
    <div className="flex min-w-0 flex-col gap-3" data-admin-coupon-pane="detail" data-admin-coupon-detail="1">
      <AdminCard titleKey="store_coupon_admin_section_basic">
        <p className="min-w-0 break-words text-base font-semibold text-sam-fg">{title}</p>
        <p className="mt-1 min-w-0 break-words text-sm text-sam-fg">{storeLabel}</p>
        <p className="mt-2 text-sm text-sam-fg">
          {benefitText(campaign)}
          {campaign.min_order_amount != null
            ? ` · ${t("store_coupon_min_order")} ${formatMoneyPhp(campaign.min_order_amount)}`
            : ""}
        </p>
        <p className="mt-1 text-sm text-sam-muted">
          {t(adminCouponFundingMessageKey(campaign.funding_mode))}
          {" · "}
          {t(adminCouponLifecycleMessageKey(campaign.lifecycle_state, campaign.start_at, campaign.end_at))}
        </p>
        {period ? (
          <p className="mt-1 text-sm text-sam-muted">
            {t("store_coupon_issue_window")} {period}
            {campaign.usage_end_at
              ? ` · ${t("store_coupon_usage_window")} ${formatAdminCouponDay(campaign.usage_end_at)}`
              : ""}
          </p>
        ) : null}
        {targetKey ? <p className="mt-1 text-sm text-sam-muted">{t(targetKey)}</p> : null}
        {"issuer" in campaign && campaign.issuer ? (
          <p className="mt-1 text-sm text-sam-muted">{t(campaign.issuer.roleKey)}</p>
        ) : null}
        {"purpose" in campaign && campaign.purpose ? (
          <p className="mt-1 text-sm text-sam-muted">{t(campaign.purpose.purposeKey)}</p>
        ) : null}
      </AdminCard>

      <AdminCard titleKey="store_coupon_admin_section_issue_use">
        <p className="text-sm text-sam-fg">
          {t("store_coupon_owner_issued", { count: issued })}
          {campaign.issue_limit != null ? ` / ${campaign.issue_limit}` : ""}
          {remaining != null ? ` · ${remaining}` : ""}
        </p>
        <p className="mt-1 text-sm text-sam-muted">
          {t("store_coupon_owner_used", { count: campaign.redeemed_count })} ·{" "}
          {t("store_coupon_owner_usage_rate", { rate: usageRate })}
        </p>
        {"active_held_count" in campaign && campaign.active_held_count != null ? (
          <p className="mt-1 text-sm text-sam-muted">
            {t("store_coupon_owner_held_active")}: {campaign.active_held_count}
          </p>
        ) : null}
        {"issued_reconciliation" in campaign && campaign.issued_reconciliation && !campaign.issued_reconciliation.consistent ? (
          <p className="mt-1 text-sm text-sam-danger">{t("store_coupon_data_inconsistency")}</p>
        ) : null}
      </AdminCard>

      <AdminCard titleKey="store_coupon_admin_section_cost">
        {campaign.funding_mode === "SHARED_FUNDED" && campaign.policy_store_share != null ? (
          <p className="text-sm text-sam-muted">
            {t("store_coupon_admin_policy_share", { amount: formatMoneyPhp(campaign.policy_store_share) })}
          </p>
        ) : null}
        <p className="text-sm text-sam-muted">
          {t("store_coupon_admin_budget_label")}{" "}
          {campaign.spend_budget_php != null ? formatMoneyPhp(campaign.spend_budget_php) : "—"}
          {" · "}
          {t("store_coupon_admin_reserved_label")} {formatMoneyPhp(campaign.reserved_spend_php)}
        </p>
        <p className="mt-2 text-sm text-sam-fg">
          {t("store_coupon_admin_realized_discount", {
            amount: formatMoneyPhp(campaign.realized.customer_discount),
          })}
        </p>
        <p className="text-sm text-sam-fg">
          {t("store_coupon_admin_realized_store", {
            amount: formatMoneyPhp(campaign.realized.store_funded),
          })}
        </p>
        <p className="text-sm text-sam-fg">
          {t("store_coupon_admin_realized_platform", {
            amount: formatMoneyPhp(campaign.realized.platform_funded),
          })}
        </p>
      </AdminCard>

      {"instances" in campaign && campaign.instances && campaign.instances.length > 0 ? (
        <AdminCard titleKey="store_coupon_admin_section_instances">
          <ul className="space-y-2">
            {campaign.instances.slice(0, 30).map((inst) => (
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
        </AdminCard>
      ) : null}

      <AdminCard titleKey="store_coupon_admin_section_orders">
        {campaign.orders.length === 0 ? (
          <p className="text-sm text-sam-muted">{t("store_coupon_admin_no_orders")}</p>
        ) : (
          <ul className="space-y-2">
            {campaign.orders.map((o) => {
              const orderLabel =
                humanAdminOrderNo(o.order_no, o.order_id) ??
                safeT("store_coupon_admin_unnamed_order", {
                  fallbackKo: "주문",
                  fallbackEn: "Order",
                });
              const statusRaw = o.order_status
                ? processStatusLabel(
                    o.order_status,
                    o.fulfillment_type || "local_delivery",
                    "owner_badge",
                    language
                  )
                : "";
              const statusLabel = statusRaw && !looksLikeRawOperatorToken(statusRaw) ? statusRaw : "";
              const settleKey = adminCouponSettlementMessageKey(o.settlement_status);
              return (
                <li key={o.order_id} className="rounded-ui-rect bg-sam-app px-3 py-2">
                  <p className="min-w-0 break-words font-medium text-sam-fg">{orderLabel}</p>
                  <p className="mt-1 text-sm text-sam-muted">
                    {statusLabel ? `${statusLabel} · ` : ""}
                    {formatMoneyPhp(o.discount_amount)} · {t("store_coupon_funding_store")}{" "}
                    {formatMoneyPhp(o.store_funded_amount)} · {t("store_coupon_funding_platform")}{" "}
                    {formatMoneyPhp(o.platform_funded_amount)}
                    {o.net_settlement_amount != null
                      ? ` · ${t("store_coupon_admin_settlement", {
                          amount: formatMoneyPhp(o.net_settlement_amount),
                        })}`
                      : ""}
                    {settleKey ? ` · ${t(settleKey)}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </AdminCard>

      <AdminCard titleKey="store_coupon_admin_section_audit">
        {campaign.audits.length === 0 ? (
          <p className="text-sm text-sam-muted">—</p>
        ) : (
          <ul className="space-y-2 text-sm text-sam-muted">
            {campaign.audits.map((a, i) => {
              const actor =
                humanAdminStoreName(a.actor_label) ??
                safeT("store_coupon_admin_actor_fallback", {
                  fallbackKo: "운영",
                  fallbackEn: "Ops",
                });
              return (
                <li key={`${a.created_at}-${i}`} className="min-w-0 break-words">
                  {formatAdminCouponDay(a.created_at)} · {actor} · {t(adminCouponAuditActionMessageKey(a.action))}
                  {a.reason && !looksLikeRawOperatorToken(a.reason) ? ` · ${a.reason}` : ""}
                </li>
              );
            })}
          </ul>
        )}
      </AdminCard>

      <AdminCard titleKey="store_coupon_admin_section_ops">
        {actError ? <p className="mb-2 text-sm text-sam-danger">{actError}</p> : null}
        {actions.pause ? <p className="mb-2 text-sm text-sam-muted">{t("store_coupon_admin_pause_hint")}</p> : null}
        <div className="flex min-w-0 flex-wrap gap-2">
          {actions.approve ? (
            <button type="button" className={CTA_PRIMARY} onClick={() => void onAct(campaign.id, "approve")}>
              {t("store_coupon_admin_approve")}
            </button>
          ) : null}
          {actions.reject ? (
            <button type="button" className={CTA_OUTLINE} onClick={() => void onAct(campaign.id, "reject")}>
              {t("store_coupon_admin_reject")}
            </button>
          ) : null}
          {actions.pause ? (
            <button type="button" className={CTA_OUTLINE} onClick={() => void onAct(campaign.id, "pause")}>
              {t("store_coupon_owner_pause")}
            </button>
          ) : null}
          {actions.resume ? (
            <button type="button" className={CTA_OUTLINE} onClick={() => void onAct(campaign.id, "resume")}>
              {t("store_coupon_owner_resume")}
            </button>
          ) : null}
          <Link
            className={`${CTA_OUTLINE} inline-flex items-center justify-center`}
            href={buildAdminPromotionCreateHref({
              storeId: campaign.store_id,
              offerId: campaign.id,
              offerTitle: title,
            })}
            data-admin-coupon-promo-cta="1"
          >
            {t("store_coupon_admin_promo_cta")}
          </Link>
        </div>
        <p className="mt-2 text-xs text-sam-muted">{t("store_coupon_admin_promo_hint")}</p>
        {actions.revoke ? (
          <div className="mt-3 space-y-2 rounded-ui-rect border border-sam-border-soft p-3">
            <label className="block text-sm text-sam-muted">
              {t("store_coupon_revoke_reason")}
              <input
                className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-sm text-sam-fg"
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
              />
            </label>
            <button
              type="button"
              className={`${CTA_OUTLINE} text-sam-danger`}
              onClick={() => void onAct(campaign.id, "revoke", revokeReason)}
            >
              {t("store_coupon_admin_revoke")}
            </button>
          </div>
        ) : null}
      </AdminCard>
    </div>
  );
}
