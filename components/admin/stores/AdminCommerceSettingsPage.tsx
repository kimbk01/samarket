"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";

type Overridden = {
  store_auto_complete_days: boolean;
  store_settlement_fee_bp: boolean;
  store_settlement_delay_days: boolean;
};

export function AdminCommerceSettingsPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
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
      const json = await res.json().catch(() => null);
      if (res.status === 403) {
        setError(json?.error === "forbidden_permission" ? "forbidden_permission" : "forbidden");
        return;
      }
      if (!json?.ok) {
        setError(typeof json?.error === "string" ? json.error : "update_failed");
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
        : error
          ? adminOperatorErrorMessage(/^[a-z][a-z0-9_]*$/i.test(error) ? error : "update_failed", ko)
          : null;
  const sourceBadge = (inDb: boolean | undefined) =>
    inDb ? (
      <span className="text-signature">{ko ? "직접 설정값" : "Custom"}</span>
    ) : (
      <span className="text-sam-meta">{ko ? "기본값" : "Default"}</span>
    );

  return (
    <div className="max-w-lg space-y-6">
      <AdminPageHeader title={ko ? "커머스 기본값" : "Commerce defaults"} />
      <p className="sam-text-body-secondary text-sam-muted">
        {t("admin_stores_commerce_settings_desc_prefix")}{" "}
        <Link href="/admin/stores/application-settings" className="text-signature underline">
          {t("admin_stores_commerce_settings_link")}
        </Link>
        {t("admin_stores_commerce_settings_desc_suffix")}
      </p>
      {errorText ? (
        <p role="alert" className="text-sm text-red-700">
          {errorText}
        </p>
      ) : null}
      {msg === "saved" ? <p className="text-sm text-green-800">{t("admin_stores_saved")}</p> : null}
      {loading ? (
        <p className="text-sm text-sam-muted">{t("common_loading")}</p>
      ) : (
        <form
          className="space-y-5 rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            // 수수료(만분율)는 적용되지 않는 값이라 이 화면에서 저장하지 않는다 (DUP-4).
            void save({
              store_auto_complete_days: Math.round(Number(autoDays)),
              store_settlement_delay_days: Math.round(Number(delayDays)),
            });
          }}
        >
          <label className="block">
            <span className="text-xs font-medium text-sam-fg">
              {t("admin_stores_commerce_auto_complete_days")} {sourceBadge(overridden?.store_auto_complete_days)}
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
              {t("admin_stores_commerce_settlement_fee_bp")} {sourceBadge(overridden?.store_settlement_fee_bp)}
            </span>
            <input
              type="number"
              readOnly
              aria-readonly="true"
              className="mt-1 w-full cursor-not-allowed rounded-ui-rect border border-sam-border bg-sam-surface-muted px-3 py-2 text-sm text-sam-muted"
              value={feeBp}
            />
            <span className="mt-0.5 block sam-text-xxs text-sam-meta">
              {ko
                ? "실제 수수료는 '수수료 정책'에서 관리합니다 (이 값은 적용되지 않음)."
                : "Actual fees are managed in 'Fee policies' (this value is not applied)."}{" "}
              <Link href="/admin/store-fee-policies" className="text-signature underline">
                {ko ? "수수료 정책으로 이동" : "Go to fee policies"}
              </Link>
            </span>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-sam-fg">
              {t("admin_stores_commerce_settlement_delay_days")} {sourceBadge(overridden?.store_settlement_delay_days)}
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
        <div className="space-y-2 border-t border-sam-border-soft pt-4">
          <p className="sam-text-xxs text-sam-muted">
            {ko
              ? "자동 완료 일수·정산 수수료(만분율)·정산 지연 일수 세 값을 모두 직접 설정값에서 지우고 서버 기본값으로 되돌립니다."
              : "Clears all three values (auto-complete days, settlement fee bp, settlement delay days) and reverts to server defaults."}
          </p>
          <button
            type="button"
            disabled={saving}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 text-xs text-sam-fg disabled:opacity-50"
            onClick={async () => {
              if (saving) return;
              const c = await confirmAdminAction({
                level: "L2",
                ko,
                title: ko ? "세 값을 모두 기본값으로 되돌릴까요?" : "Reset all three values to defaults?",
                description: ko
                  ? "자동 완료 일수·정산 수수료(만분율)·정산 지연 일수가 모두 서버 기본값으로 바뀝니다."
                  : "Auto-complete days, settlement fee bp and settlement delay days all revert to server defaults.",
                confirmLabel: ko ? "모두 초기화" : "Reset all",
                destructive: true,
              });
              if (!c.ok) return;
              void save({
                store_auto_complete_days: null,
                store_settlement_fee_bp: null,
                store_settlement_delay_days: null,
              });
            }}
          >
            {ko ? "세 값 모두 기본값으로 초기화" : t("admin_stores_commerce_clear_db")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
