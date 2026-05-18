"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

type Overridden = {
  store_auto_complete_days: boolean;
  store_settlement_fee_bp: boolean;
  store_settlement_delay_days: boolean;
};

export function AdminCommerceSettingsPage() {
  const { t } = useI18n();
  const [autoDays, setAutoDays] = useState("");
  const [feeBp, setFeeBp] = useState("");
  const [delayDays, setDelayDays] = useState("");
  const [overridden, setOverridden] = useState<Overridden | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/commerce-settings", { credentials: "include" });
      const json = await res.json();
      if (res.status === 403) {
        setError("forbidden");
        return;
      }
      if (!json?.ok) {
        setError(json?.error === "table_missing" ? "table_missing" : json?.error);
        return;
      }
      const e = json.effective;
      setAutoDays(String(e.store_auto_complete_days ?? ""));
      setFeeBp(String(e.store_settlement_fee_bp ?? ""));
      setDelayDays(String(e.store_settlement_delay_days ?? ""));
      setOverridden(json.overridden_in_db as Overridden);
    } catch {
      setError("network_error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(partial: Record<string, number | null>) {
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/commerce-settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
      const json = await res.json();
      if (!json?.ok) {
        setError(json?.error ?? "save_failed");
        return;
      }
      setMsg("saved");
      const e = json.effective;
      setAutoDays(String(e.store_auto_complete_days ?? ""));
      setFeeBp(String(e.store_settlement_fee_bp ?? ""));
      setDelayDays(String(e.store_settlement_delay_days ?? ""));
      setOverridden(json.overridden_in_db as Overridden);
    } catch {
      setError("network_error");
    } finally {
      setSaving(false);
    }
  }

  const errorText =
    error === "forbidden"
      ? t("admin_audit_err_no_permission")
      : error === "table_missing"
        ? t("admin_stores_commerce_err_table_missing")
        : error;

  return (
    <div className="max-w-lg space-y-6">
      <AdminPageHeader titleKey="admin_stores_commerce_settings_title" />
      <p className="sam-text-body-secondary text-sam-muted">
        {t("admin_stores_commerce_settings_desc_prefix")}{" "}
        <Link href="/admin/stores/application-settings" className="text-signature underline">
          {t("admin_stores_commerce_settings_link")}
        </Link>
        {t("admin_stores_commerce_settings_desc_suffix")}
      </p>
      {errorText ? <p className="text-sm text-red-700">{errorText}</p> : null}
      {msg === "saved" ? <p className="text-sm text-green-800">{t("admin_stores_saved")}</p> : null}
      {loading ? (
        <p className="text-sm text-sam-muted">{t("common_loading")}</p>
      ) : (
        <form
          className="space-y-5 rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void save({
              store_auto_complete_days: Math.round(Number(autoDays)),
              store_settlement_fee_bp: Math.round(Number(feeBp)),
              store_settlement_delay_days: Math.round(Number(delayDays)),
            });
          }}
        >
          <label className="block">
            <span className="text-xs font-medium text-sam-fg">
              {t("admin_stores_commerce_auto_complete_days")}{" "}
              {overridden?.store_auto_complete_days ? (
                <span className="text-signature">DB</span>
              ) : (
                <span className="text-sam-meta">env</span>
              )}
            </span>
            <input
              type="number"
              min={1}
              max={90}
              required
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
              value={autoDays}
              onChange={(e) => setAutoDays(e.target.value)}
            />
            <span className="mt-0.5 block sam-text-xxs text-sam-meta">1~90</span>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-sam-fg">
              {t("admin_stores_commerce_settlement_fee_bp")}{" "}
              {overridden?.store_settlement_fee_bp ? (
                <span className="text-signature">DB</span>
              ) : (
                <span className="text-sam-meta">env</span>
              )}
            </span>
            <input
              type="number"
              min={0}
              max={10000}
              required
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
              value={feeBp}
              onChange={(e) => setFeeBp(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-sam-fg">
              {t("admin_stores_commerce_settlement_delay_days")}{" "}
              {overridden?.store_settlement_delay_days ? (
                <span className="text-signature">DB</span>
              ) : (
                <span className="text-sam-meta">env</span>
              )}
            </span>
            <input
              type="number"
              min={0}
              max={365}
              required
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
              value={delayDays}
              onChange={(e) => setDelayDays(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-ui-rect bg-sam-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? t("admin_stores_saving") : t("admin_stores_commerce_save_all")}
            </button>
          </div>
        </form>
      )}
      {!loading ? (
        <div className="flex flex-wrap gap-2 border-t border-sam-border-soft pt-4">
          <button
            type="button"
            disabled={saving}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 text-xs text-sam-fg disabled:opacity-50"
            onClick={() =>
              void save({
                store_auto_complete_days: null,
                store_settlement_fee_bp: null,
                store_settlement_delay_days: null,
              })
            }
          >
            {t("admin_stores_commerce_clear_db")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
