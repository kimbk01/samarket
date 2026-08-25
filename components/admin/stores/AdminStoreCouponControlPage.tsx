"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminDeliveryCmsChrome } from "@/components/admin/shell/AdminDeliveryCmsChrome";
import { AdminCard } from "@/components/admin/AdminCard";
import {
  OWNER_ADMIN_OUTLINE_BTN_CLASS,
  OWNER_ADMIN_PRIMARY_BTN_CLASS,
} from "@/lib/business/owner-admin-list-ui";
import {
  couponControlActionsForLifecycle,
  type CouponControlCampaignView,
} from "@/lib/stores/admin-coupon-control-realized";
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
import { AdminStoreCouponAdminCreatePanel } from "@/components/admin/stores/AdminStoreCouponAdminCreatePanel";
import { formatMoneyPhp } from "@/lib/utils/format";

export function AdminStoreCouponControlPage() {
  const { t, language, safeT } = useI18n();
  const [campaigns, setCampaigns] = useState<CouponControlCampaignView[]>([]);
  const [storeOptions, setStoreOptions] = useState<{ id: string; name: string }[]>([]);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState<Record<string, string>>({});
  const [actError, setActError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/store-coupons", { credentials: "include", cache: "no-store" });
    const json = (await res.json()) as { ok?: boolean; campaigns?: CouponControlCampaignView[] };
    setCampaigns(json.ok ? json.campaigns ?? [] : []);
    try {
      const storesRes = await fetch("/api/admin/stores?status=approved", { credentials: "include", cache: "no-store" });
      const storesJson = (await storesRes.json()) as {
        ok?: boolean;
        stores?: { id?: string; store_name?: string; slug?: string }[];
      };
      if (storesJson.ok) {
        const seen = new Set<string>();
        const out: { id: string; name: string }[] = [];
        for (const s of storesJson.stores ?? []) {
          const id = String(s.id ?? "").trim();
          if (!id || seen.has(id)) continue;
          const name = humanAdminStoreName(s.store_name) ?? humanAdminStoreName(s.slug);
          if (!name) continue;
          seen.add(id);
          out.push({ id, name });
        }
        setStoreOptions(out);
      }
    } catch {
      /* keep campaign list */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return campaigns;
    return campaigns.filter((c) => `${c.store_name} ${c.title}`.toLowerCase().includes(q));
  }, [campaigns, query]);

  const act = async (id: string, action: string) => {
    setActError(null);
    const body: Record<string, unknown> = { id, action };
    if (action === "revoke") {
      const reason = (revokeReason[id] ?? "").trim();
      if (reason.length < 2) {
        setActError(t("store_coupon_admin_revoke_fail"));
        return;
      }
      body.reason = reason;
    }
    const res = await fetch("/api/admin/store-coupons", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) {
      setActError(
        json.error === "revoke_reason_required"
          ? t("store_coupon_admin_revoke_fail")
          : safeT("store_coupon_admin_act_fail", {
              fallbackKo: "처리할 수 없습니다.",
              fallbackEn: "Could not complete that action.",
            })
      );
      return;
    }
    await load();
  };

  return (
    <AdminDeliveryCmsChrome>
      <AdminCard titleKey="store_coupon_admin_control_title">
        <p className="mb-3 text-[13px] text-sam-muted">{t("store_coupon_admin_control_desc")}</p>
        <AdminStoreCouponAdminCreatePanel stores={storeOptions} onCreated={() => void load()} />
        <input
          className="mb-3 w-full rounded-ui-rect border border-sam-border px-2 py-2 text-[13px]"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("store_coupon_admin_filter")}
          aria-label={t("store_coupon_admin_filter")}
        />
        {actError ? <p className="mb-2 text-[13px] text-sam-danger">{actError}</p> : null}
        <ul className="space-y-2" data-admin-coupon-control="1">
          {filtered.map((c) => {
            const open = openId === c.id;
            const actions = couponControlActionsForLifecycle(c.lifecycle_state);
            const usageRate =
              c.issued_count > 0 ? `${Math.round((c.redeemed_count / c.issued_count) * 100)}%` : "—";
            const storeLabel =
              humanAdminStoreName(c.store_name) ??
              safeT("store_coupon_wallet_store_fallback", { fallbackKo: "매장", fallbackEn: "Store" });
            const period = [formatAdminCouponDay(c.start_at), formatAdminCouponDay(c.end_at)]
              .filter(Boolean)
              .join(" – ");
            const targetKey = adminCouponTargetMessageKey(c.first_order_scope);
            return (
              <li key={c.id} className="min-w-0 rounded-ui-rect border border-sam-border p-3" data-admin-coupon-card="1">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <p className="min-w-0 break-words font-medium text-sam-fg">{storeLabel}</p>
                  <span className="shrink-0 text-xs text-sam-muted">
                    {t(adminCouponLifecycleMessageKey(c.lifecycle_state, c.start_at, c.end_at))}
                  </span>
                </div>
                <p className="min-w-0 break-words text-[15px] font-semibold text-sam-fg">{c.title}</p>
                <p className="mt-1 text-xs text-sam-fg">
                  {c.discount_type === "percent" ? `${c.discount_value}%` : formatMoneyPhp(c.discount_value)}
                  {c.min_order_amount != null ? ` · ${t("store_coupon_min_order")} ${formatMoneyPhp(c.min_order_amount)}` : ""}
                  {" · "}
                  {t(adminCouponFundingMessageKey(c.funding_mode))}
                </p>
                {period ? (
                  <p className="mt-1 text-xs text-sam-muted">
                    {t("store_coupon_issue_window")} {period}
                    {c.usage_end_at ? ` · ${t("store_coupon_usage_window")} ${formatAdminCouponDay(c.usage_end_at)}` : ""}
                  </p>
                ) : null}
                <p className="text-xs text-sam-muted">
                  {t("store_coupon_owner_issued", { count: c.issued_count })}
                  {c.issue_limit != null ? `/${c.issue_limit}` : ""}
                  {" · "}
                  {t("store_coupon_owner_used", { count: c.redeemed_count })}
                </p>
                <p className="text-xs text-sam-muted">
                  {t("store_coupon_admin_budget_label")}{" "}
                  {c.spend_budget_php != null ? formatMoneyPhp(c.spend_budget_php) : "—"}
                  {" · "}
                  {t("store_coupon_admin_reserved_label")} {formatMoneyPhp(c.reserved_spend_php)}
                </p>
                <p className="text-xs text-sam-fg">
                  {t("store_coupon_admin_realized_store", {
                    amount: formatMoneyPhp(c.realized.store_funded),
                  })}
                </p>
                <button
                  type="button"
                  className={`${OWNER_ADMIN_OUTLINE_BTN_CLASS} mt-2`}
                  onClick={() => setOpenId(open ? null : c.id)}
                >
                  {open ? t("store_coupon_admin_close") : t("store_coupon_admin_open")}
                </button>
                {open ? (
                  <div className="mt-3 space-y-3 border-t border-sam-border-soft pt-3 text-[13px]">
                    <section>
                      <p className="font-medium">{t("store_coupon_admin_section_overview")}</p>
                      <p className="text-sam-muted">
                        {t("store_coupon_issue_window")} {formatAdminCouponDay(c.start_at) || "—"}–{formatAdminCouponDay(c.end_at) || "—"}
                        {c.usage_end_at ? ` · ${t("store_coupon_usage_window")} ${formatAdminCouponDay(c.usage_end_at)}` : ""}
                        {targetKey ? ` · ${t(targetKey)}` : ""}
                      </p>
                    </section>
                    <section>
                      <p className="font-medium">{t("store_coupon_admin_section_issuance")}</p>
                      <p className="text-sam-muted">
                        {c.issued_count}
                        {c.issue_limit != null ? ` / ${c.issue_limit}` : ""}
                        {c.issue_limit != null
                          ? ` · ${Math.max(0, c.issue_limit - c.issued_count)}`
                          : ""}
                      </p>
                    </section>
                    <section>
                      <p className="font-medium">{t("store_coupon_admin_section_usage")}</p>
                      <p className="text-sam-muted">
                        {t("store_coupon_owner_used", { count: c.redeemed_count })} ·{" "}
                        {t("store_coupon_owner_usage_rate", { rate: usageRate })}
                      </p>
                    </section>
                    <section>
                      <p className="font-medium">{t("store_coupon_admin_section_budget")}</p>
                      <p className="text-sam-muted">
                        {t("store_coupon_admin_budget_label")}{" "}
                        {c.spend_budget_php != null ? formatMoneyPhp(c.spend_budget_php) : "—"}
                        {" · "}
                        {t("store_coupon_admin_reserved_label")} {formatMoneyPhp(c.reserved_spend_php)}
                      </p>
                    </section>
                    <section>
                      <p className="font-medium">{t("store_coupon_admin_section_realized")}</p>
                      {c.funding_mode === "SHARED_FUNDED" && c.policy_store_share != null ? (
                        <p className="text-sam-muted">
                          {t("store_coupon_admin_policy_share", {
                            amount: formatMoneyPhp(c.policy_store_share),
                          })}
                        </p>
                      ) : null}
                      <p>
                        {t("store_coupon_admin_realized_discount", {
                          amount: formatMoneyPhp(c.realized.customer_discount),
                        })}
                      </p>
                      <p>
                        {t("store_coupon_admin_realized_store", {
                          amount: formatMoneyPhp(c.realized.store_funded),
                        })}
                      </p>
                      <p>
                        {t("store_coupon_admin_realized_platform", {
                          amount: formatMoneyPhp(c.realized.platform_funded),
                        })}
                      </p>
                    </section>
                    <section>
                      <p className="font-medium">{t("store_coupon_admin_section_orders")}</p>
                      {c.orders.length === 0 ? (
                        <p className="text-sam-muted">{t("store_coupon_admin_no_orders")}</p>
                      ) : (
                        <ul className="mt-1 space-y-1">
                          {c.orders.map((o) => {
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
                            const statusLabel =
                              statusRaw && !looksLikeRawOperatorToken(statusRaw) ? statusRaw : "";
                            const settleKey = adminCouponSettlementMessageKey(o.settlement_status);
                            return (
                            <li key={o.order_id} className="rounded-ui-rect bg-sam-app/50 px-2 py-1.5">
                              <p className="min-w-0 break-words font-medium">{orderLabel}</p>
                              <p className="text-xs text-sam-muted">
                                {statusLabel ? `${statusLabel} · ` : ""}
                                {formatMoneyPhp(o.discount_amount)} ·{" "}
                                {t("store_coupon_funding_store")} {formatMoneyPhp(o.store_funded_amount)} ·{" "}
                                {t("store_coupon_funding_platform")} {formatMoneyPhp(o.platform_funded_amount)}
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
                    </section>
                    <section>
                      <p className="font-medium">{t("store_coupon_admin_section_audit")}</p>
                      {c.audits.length === 0 ? (
                        <p className="text-sam-muted">—</p>
                      ) : (
                        <ul className="mt-1 space-y-1 text-xs text-sam-muted">
                          {c.audits.map((a, i) => {
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
                    </section>
                    {actions.pause ? (
                      <p className="text-xs text-sam-muted">{t("store_coupon_admin_pause_hint")}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {actions.approve ? (
                        <button
                          type="button"
                          className={OWNER_ADMIN_PRIMARY_BTN_CLASS}
                          onClick={() => void act(c.id, "approve")}
                        >
                          {t("store_coupon_admin_approve")}
                        </button>
                      ) : null}
                      {actions.reject ? (
                        <button
                          type="button"
                          className={OWNER_ADMIN_OUTLINE_BTN_CLASS}
                          onClick={() => void act(c.id, "reject")}
                        >
                          {t("store_coupon_admin_reject")}
                        </button>
                      ) : null}
                      {actions.pause ? (
                        <button
                          type="button"
                          className={OWNER_ADMIN_OUTLINE_BTN_CLASS}
                          onClick={() => void act(c.id, "pause")}
                        >
                          {t("store_coupon_owner_pause")}
                        </button>
                      ) : null}
                      {actions.resume ? (
                        <button
                          type="button"
                          className={OWNER_ADMIN_OUTLINE_BTN_CLASS}
                          onClick={() => void act(c.id, "resume")}
                        >
                          {t("store_coupon_owner_resume")}
                        </button>
                      ) : null}
                    </div>
                    {actions.revoke ? (
                      <div className="mt-2 space-y-2 rounded-ui-rect border border-sam-border-soft p-2">
                        <label className="block text-xs text-sam-muted">
                          {t("store_coupon_revoke_reason")}
                          <input
                            className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
                            value={revokeReason[c.id] ?? ""}
                            onChange={(e) =>
                              setRevokeReason((prev) => ({ ...prev, [c.id]: e.target.value }))
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className={`${OWNER_ADMIN_OUTLINE_BTN_CLASS} text-sam-danger`}
                          onClick={() => void act(c.id, "revoke")}
                        >
                          {t("store_coupon_admin_revoke")}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </AdminCard>
    </AdminDeliveryCmsChrome>
  );
}
