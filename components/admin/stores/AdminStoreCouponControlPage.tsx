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
import { formatMoneyPhp } from "@/lib/utils/format";

function day(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "—";
}

export function AdminStoreCouponControlPage() {
  const { t } = useI18n();
  const [campaigns, setCampaigns] = useState<CouponControlCampaignView[]>([]);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState<Record<string, string>>({});
  const [actError, setActError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/store-coupons", { credentials: "include", cache: "no-store" });
    const json = (await res.json()) as { ok?: boolean; campaigns?: CouponControlCampaignView[] };
    setCampaigns(json.ok ? json.campaigns ?? [] : []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return campaigns;
    return campaigns.filter((c) =>
      `${c.store_name} ${c.title} ${c.lifecycle_state} ${c.funding_mode}`.toLowerCase().includes(q)
    );
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
      setActError(json.error === "revoke_reason_required" ? t("store_coupon_admin_revoke_fail") : json.error ?? "error");
      return;
    }
    await load();
  };

  return (
    <AdminDeliveryCmsChrome>
      <AdminCard titleKey="store_coupon_admin_control_title">
        <p className="mb-3 text-[13px] text-sam-muted">{t("store_coupon_admin_control_desc")}</p>
        <input
          className="mb-3 w-full rounded-ui-rect border border-sam-border px-2 py-2 text-[13px]"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("store_coupon_admin_filter")}
          aria-label={t("store_coupon_admin_filter")}
        />
        {actError ? <p className="mb-2 text-[13px] text-sam-danger">{actError}</p> : null}
        <ul className="space-y-2">
          {filtered.map((c) => {
            const open = openId === c.id;
            const actions = couponControlActionsForLifecycle(c.lifecycle_state);
            const usageRate =
              c.issued_count > 0 ? `${Math.round((c.redeemed_count / c.issued_count) * 100)}%` : "—";
            return (
              <li key={c.id} className="rounded-ui-rect border border-sam-border p-3">
                <p className="font-medium text-sam-fg">{c.store_name}</p>
                <p className="text-[15px] font-semibold text-sam-fg">{c.title}</p>
                <p className="mt-1 text-xs text-sam-muted">
                  {c.lifecycle_state} · {c.funding_mode}
                </p>
                <p className="text-xs text-sam-fg">
                  {c.discount_type === "percent" ? `${c.discount_value}%` : formatMoneyPhp(c.discount_value)}
                  {c.min_order_amount != null ? ` · ${t("store_coupon_min_order")} ${c.min_order_amount}` : ""}
                </p>
                <p className="text-xs text-sam-muted">
                  {t("store_coupon_owner_issued", { count: c.issued_count })}
                  {c.issue_limit != null ? `/${c.issue_limit}` : ""}
                  {" · "}
                  {t("store_coupon_owner_used", { count: c.redeemed_count })}
                  {" · "}
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
                        {t("store_coupon_issue_window")} {day(c.start_at)}–{day(c.end_at)}
                        {c.usage_end_at ? ` · ${t("store_coupon_usage_window")} ${day(c.usage_end_at)}` : ""}
                        {c.first_order_scope ? ` · ${c.first_order_scope}` : ""}
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
                          {c.orders.map((o) => (
                            <li key={o.order_id} className="rounded-ui-rect bg-sam-app/50 px-2 py-1.5">
                              <p className="font-medium">{o.order_no || o.order_id.slice(0, 8)}</p>
                              <p className="text-xs text-sam-muted">
                                {o.order_status ?? "—"} · {formatMoneyPhp(o.discount_amount)} ·{" "}
                                {t("store_coupon_funding_store")} {formatMoneyPhp(o.store_funded_amount)} ·{" "}
                                {t("store_coupon_funding_platform")} {formatMoneyPhp(o.platform_funded_amount)}
                                {o.net_settlement_amount != null
                                  ? ` · ${t("store_coupon_admin_settlement", {
                                      amount: formatMoneyPhp(o.net_settlement_amount),
                                    })}`
                                  : ""}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                    <section>
                      <p className="font-medium">{t("store_coupon_admin_section_audit")}</p>
                      {c.audits.length === 0 ? (
                        <p className="text-sam-muted">—</p>
                      ) : (
                        <ul className="mt-1 space-y-1 text-xs text-sam-muted">
                          {c.audits.map((a, i) => (
                            <li key={`${a.created_at}-${i}`}>
                              {day(a.created_at)} · {a.actor_label ?? "—"} · {a.action}
                              {a.reason ? ` · ${a.reason}` : ""}
                            </li>
                          ))}
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
