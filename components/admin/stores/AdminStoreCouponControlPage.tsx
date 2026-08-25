"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminDeliveryCmsChrome } from "@/components/admin/shell/AdminDeliveryCmsChrome";
import { AdminCard } from "@/components/admin/AdminCard";
import { OWNER_ADMIN_OUTLINE_BTN_CLASS, OWNER_ADMIN_PRIMARY_BTN_CLASS } from "@/lib/business/owner-admin-list-ui";

type Campaign = {
  id: string;
  title: string;
  store_id?: string;
  lifecycle_state?: string;
  funding_mode?: string;
  is_active: boolean;
  issue_limit?: number | null;
  issued_count?: number;
  spend_budget_php?: number | null;
  reserved_spend_php?: number | null;
  store_funded_amount?: number | null;
  claimed_count?: number;
  redeemed_count?: number;
  budget_remaining?: number | null;
  last_audit?: { action: string; payload: unknown } | null;
};

export function AdminStoreCouponControlPage() {
  const { t } = useI18n();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [revokeReason, setRevokeReason] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/store-coupons", { credentials: "include", cache: "no-store" });
    const json = (await res.json()) as { ok?: boolean; campaigns?: Campaign[] };
    setCampaigns(json.ok ? json.campaigns ?? [] : []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = (id: string, action: string) => {
    void fetch("/api/admin/store-coupons", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        action,
        ...(action === "revoke" ? { reason: revokeReason } : {}),
      }),
    }).then(() => load());
  };

  return (
    <AdminDeliveryCmsChrome>
      <AdminCard titleKey="store_coupon_admin_control_title">
        <p className="mb-3 text-[13px] text-sam-muted">{t("store_coupon_admin_control_desc")}</p>
        <label className="mb-3 block text-[13px] text-sam-muted">
          {t("store_coupon_revoke_reason")}
          <input
            className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
            value={revokeReason}
            onChange={(e) => setRevokeReason(e.target.value)}
          />
        </label>
        <ul className="space-y-2">
          {campaigns.map((c) => (
            <li key={c.id} className="rounded-ui-rect border border-sam-border p-3">
              <p className="font-medium">{c.title}</p>
              <p className="text-xs text-sam-muted">
                {c.store_id} · {c.lifecycle_state ?? (c.is_active ? "active" : "inactive")} ·{" "}
                {c.funding_mode ?? "STORE_FUNDED"} · claim {c.claimed_count ?? 0} · redeem {c.redeemed_count ?? 0}
                {c.spend_budget_php != null
                  ? ` · budget ${c.reserved_spend_php ?? 0}/${c.spend_budget_php} (${t("store_coupon_budget_remaining")} ${c.budget_remaining ?? 0})`
                  : ""}
                {c.store_funded_amount != null ? ` · store ${c.store_funded_amount}` : ""}
              </p>
              {c.last_audit ? (
                <p className="text-xs text-sam-muted">
                  {c.last_audit.action}
                  {typeof c.last_audit.payload === "object" &&
                  c.last_audit.payload &&
                  "reason" in (c.last_audit.payload as Record<string, unknown>)
                    ? ` · ${String((c.last_audit.payload as { reason?: unknown }).reason ?? "")}`
                    : ""}
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className={OWNER_ADMIN_PRIMARY_BTN_CLASS} onClick={() => act(c.id, "approve")}>
                  {t("store_coupon_admin_approve")}
                </button>
                <button type="button" className={OWNER_ADMIN_OUTLINE_BTN_CLASS} onClick={() => act(c.id, "pause")}>
                  {t("store_coupon_owner_pause")}
                </button>
                <button type="button" className={OWNER_ADMIN_OUTLINE_BTN_CLASS} onClick={() => act(c.id, "resume")}>
                  {t("store_coupon_owner_resume")}
                </button>
                <button type="button" className={OWNER_ADMIN_OUTLINE_BTN_CLASS} onClick={() => act(c.id, "revoke")}>
                  {t("store_coupon_admin_revoke")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </AdminCard>
    </AdminDeliveryCmsChrome>
  );
}
