"use client";

import { useCallback, useEffect, useState } from "react";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { isAdminUser } from "@/lib/auth/get-current-user";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function OpsTradePolicyPanel() {
  const { t } = useI18n();
  const [autoDays, setAutoDays] = useState(7);
  const [reviewDays, setReviewDays] = useState(14);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const me = getCurrentUser();
    const u = me?.id?.trim();
    if (!u || !isAdminUser(me)) {
      setLoading((prev) => (prev ? false : prev));
      return;
    }
    setLoading((prev) => (prev ? prev : true));
    setMsg((prev) => (prev === null ? prev : null));
    try {
      const res = await fetch("/api/admin/ops-trade-policy");
      const data = await res.json().catch(() => ({}));
      if (res.ok && typeof data.buyerAutoConfirmDays === "number") {
        setAutoDays(data.buyerAutoConfirmDays);
        setReviewDays(data.buyerReviewDeadlineDays ?? 14);
      }
    } catch {
      setMsg(t("admin_settings_trade_load_failed"));
    } finally {
      setLoading((prev) => (prev ? false : prev));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    const u = getCurrentUser()?.id?.trim();
    if (!u) return;
    setSaving((prev) => (prev ? prev : true));
    setMsg((prev) => (prev === null ? prev : null));
    try {
      const res = await fetch("/api/admin/ops-trade-policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerAutoConfirmDays: autoDays,
          buyerReviewDeadlineDays: reviewDays,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setMsg((data as { error?: string }).error ?? t("admin_settings_notif_save_failed"));
        return;
      }
      setMsg(t("admin_settings_trade_saved"));
    } catch {
      setMsg(t("common_network_error_generic"));
    } finally {
      setSaving((prev) => (prev ? false : prev));
    }
  };

  if (loading) {
    return <p className="sam-text-body-secondary text-sam-muted">{t("admin_settings_trade_loading")}</p>;
  }

  return (
    <div className="mt-8 border-t border-sam-border pt-6">
      <h3 className="sam-text-body font-semibold text-sam-fg">{t("admin_settings_trade_title")}</h3>
      <p className="mt-1 sam-text-helper text-sam-muted">{t("admin_settings_trade_desc")}</p>
      <div className="mt-4 grid max-w-md gap-4 sm:grid-cols-2">
        <div>
          <label className="block sam-text-body-secondary font-medium text-sam-fg">
            {t("admin_settings_trade_auto_confirm_days")}
          </label>
          <input
            type="number"
            min={1}
            max={365}
            value={autoDays}
            onChange={(e) => setAutoDays(Number(e.target.value))}
            className="mt-1 w-full rounded border border-sam-border px-3 py-2 sam-text-body"
          />
        </div>
        <div>
          <label className="block sam-text-body-secondary font-medium text-sam-fg">
            {t("admin_settings_trade_review_deadline_days")}
          </label>
          <input
            type="number"
            min={1}
            max={365}
            value={reviewDays}
            onChange={(e) => setReviewDays(Number(e.target.value))}
            className="mt-1 w-full rounded border border-sam-border px-3 py-2 sam-text-body"
          />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded bg-signature px-4 py-2 sam-text-body font-medium text-white disabled:opacity-50"
        >
          {saving ? t("common_saving") : t("admin_settings_trade_save")}
        </button>
        {msg ? <span className="sam-text-body-secondary text-sam-muted">{msg}</span> : null}
      </div>
    </div>
  );
}
