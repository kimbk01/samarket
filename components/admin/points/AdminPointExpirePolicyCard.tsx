"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { pointExpireCycleLabel, pointLedgerTypeLabel } from "@/components/admin/points/admin-points-notifications-i18n";
import type { PointExpirePolicy, PointExpireRunCycle } from "@/lib/types/point-expire";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminResultBanner } from "@/components/admin/ui/AdminStateViews";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";

interface AdminPointExpirePolicyCardProps {
  policy: PointExpirePolicy;
  onSaved?: () => void;
  /** 접근표 쓰기 권한 — false 면 수정·저장 비활성 (서버 가드는 그대로). */
  actionAllowed?: boolean;
}

export function AdminPointExpirePolicyCard({
  policy,
  onSaved,
  actionAllowed = true,
}: AdminPointExpirePolicyCardProps) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: true; message: string } | { ok: false; code: string } | null>(null);
  const [form, setForm] = useState({
    expireAfterDays: policy.expireAfterDays,
    autoExpireEnabled: policy.autoExpireEnabled,
    runCycle: policy.runCycle,
    adminMemo: policy.adminMemo ?? "",
  });

  const save = async () => {
    if (busy || !actionAllowed) return;
    const c = await confirmAdminAction({
      level: "L1",
      ko,
      title: ko ? "소멸 정책 저장" : "Save expiry policy",
      description: ko
        ? `「${policy.policyName}」 소멸 정책을 저장합니다. 이후 소멸 실행에 바로 적용됩니다.`
        : `Save the "${policy.policyName}" expiry policy. It applies to later expiry runs.`,
      confirmLabel: adminCta("save", ko),
    });
    if (!c.ok) return;
    setBusy(true);
    setResult(null);
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
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setResult({ ok: false, code: j.error ?? "save_failed" });
        return;
      }
      setResult({ ok: true, message: ko ? "저장했습니다." : "Saved." });
      setEditing(false);
      onSaved?.();
    } catch {
      setResult({ ok: false, code: "network_error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="sam-text-body font-medium text-sam-fg">{policy.policyName}</h3>
        <AdminActionButton
          variant="secondary"
          size="sm"
          disabled={!editing && !actionAllowed}
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? adminCta("cancel", ko) : adminCta("edit", ko)}
        </AdminActionButton>
      </div>
      {result ? (
        <div className="mt-2">
          <AdminResultBanner ko={ko} result={result} onClose={() => setResult(null)} />
        </div>
      ) : null}
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
          <div className="flex justify-end">
            <AdminActionButton variant="primary" disabled={busy || !actionAllowed} onClick={() => void save()}>
              {adminCta("save", ko)}
            </AdminActionButton>
          </div>
        </div>
      ) : (
        <dl className="mt-2 grid grid-cols-2 gap-2 sam-text-body sm:grid-cols-3">
          <div>
            <dt className="text-sam-muted">{t("admin_points_expire_label_days")}</dt>
            <dd>{t("admin_points_unit_days", { count: policy.expireAfterDays })}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_points_expire_label_exclude_types")}</dt>
            <dd>
              {policy.excludeEntryTypes
                .map((type) =>
                  type === "bonus" ? (ko ? "보너스" : "Bonus") : pointLedgerTypeLabel(t, type)
                )
                .join(", ") || "-"}
            </dd>
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
