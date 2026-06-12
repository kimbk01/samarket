"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { pointExpireCycleLabel } from "@/components/admin/points/admin-points-notifications-i18n";
import type { PointExpirePolicy, PointExpireRunCycle } from "@/lib/types/point-expire";
import { adminFetch } from "@/lib/admin/admin-fetch-client";

interface AdminPointExpirePolicyCardProps {
  policy: PointExpirePolicy;
  onSaved?: () => void;
}

export function AdminPointExpirePolicyCard({
  policy,
  onSaved,
}: AdminPointExpirePolicyCardProps) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({
    expireAfterDays: policy.expireAfterDays,
    autoExpireEnabled: policy.autoExpireEnabled,
    runCycle: policy.runCycle,
    adminMemo: policy.adminMemo ?? "",
  });

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await adminFetch(`/api/admin/point-expire/policy/${policy.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expireAfterDays: form.expireAfterDays,
          autoExpireEnabled: form.autoExpireEnabled,
          runCycle: form.runCycle,
          adminMemo: form.adminMemo,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? t("points_ui_request_failed"));
        return;
      }
      setEditing(false);
      onSaved?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="sam-text-body font-medium text-sam-fg">{policy.policyName}</h3>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="rounded border border-sam-border px-2 py-1 sam-text-helper text-sam-fg hover:bg-sam-app"
        >
          {editing ? t("common_cancel") : t("common_edit")}
        </button>
      </div>
      {err ? <p className="mt-2 sam-text-body text-red-600">{err}</p> : null}
      {editing ? (
        <div className="mt-3 space-y-3 sam-text-body">
          <label className="block">
            <span className="text-sam-muted">{t("admin_points_expire_label_days")}</span>
            <input
              type="number"
              min={1}
              value={form.expireAfterDays}
              onChange={(e) => setForm((f) => ({ ...f, expireAfterDays: Number(e.target.value) || 1 }))}
              className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.autoExpireEnabled}
              onChange={(e) => setForm((f) => ({ ...f, autoExpireEnabled: e.target.checked }))}
            />
            <span>{t("admin_points_expire_label_auto_run")}</span>
          </label>
          <label className="block">
            <span className="text-sam-muted">{t("admin_points_expire_label_run_cycle")}</span>
            <select
              value={form.runCycle}
              onChange={(e) => setForm((f) => ({ ...f, runCycle: e.target.value as PointExpireRunCycle }))}
              className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
            >
              <option value="daily">{pointExpireCycleLabel(t, "daily")}</option>
              <option value="weekly">{pointExpireCycleLabel(t, "weekly")}</option>
              <option value="monthly">{pointExpireCycleLabel(t, "monthly")}</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sam-muted">{t("admin_points_policy_label_admin_memo")}</span>
            <input
              type="text"
              value={form.adminMemo}
              onChange={(e) => setForm((f) => ({ ...f, adminMemo: e.target.value }))}
              className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="rounded border border-signature bg-signature px-3 py-1.5 sam-text-body-secondary text-white disabled:opacity-50"
          >
            {t("common_save")}
          </button>
        </div>
      ) : (
        <dl className="mt-2 grid grid-cols-2 gap-2 sam-text-body sm:grid-cols-3">
          <div>
            <dt className="text-sam-muted">{t("admin_points_expire_label_days")}</dt>
            <dd>{t("admin_points_unit_days", { count: policy.expireAfterDays })}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_points_expire_label_exclude_types")}</dt>
            <dd>{policy.excludeEntryTypes.join(", ") || "-"}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_points_expire_label_run_cycle")}</dt>
            <dd>{pointExpireCycleLabel(t, policy.runCycle)}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_points_expire_label_auto_run")}</dt>
            <dd>{policy.autoExpireEnabled ? t("admin_points_status_active") : t("admin_points_status_inactive")}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_points_expire_label_user_view")}</dt>
            <dd>{policy.allowUserView ? t("admin_points_allowed") : t("admin_points_denied")}</dd>
          </div>
        </dl>
      )}
      {!editing && policy.adminMemo ? (
        <p className="mt-2 sam-text-body-secondary text-sam-muted">{policy.adminMemo}</p>
      ) : null}
    </div>
  );
}
