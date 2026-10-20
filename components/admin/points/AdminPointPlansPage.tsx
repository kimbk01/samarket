"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminStatusLabel } from "@/components/admin/ui/AdminStatusLabel";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
} from "@/components/admin/ui/AdminStateViews";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { formatAdminDecimal, formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import { FINANCE_ACTIVE_STATE_NS } from "@/lib/admin/status-labels/finance-status-labels";
import type { PointPlan } from "@/lib/types/point";

type PlanForm = {
  nameKo: string;
  nameEn: string;
  descriptionKo: string;
  descriptionEn: string;
  paymentAmount: number;
  pointAmount: number;
  bonusAmount: number;
  currency: string;
  sortOrder: number;
  isActive: boolean;
};

const EMPTY_FORM: PlanForm = {
  nameKo: "",
  nameEn: "",
  descriptionKo: "",
  descriptionEn: "",
  paymentAmount: 1000,
  pointAmount: 1000,
  bonusAmount: 0,
  currency: "PHP",
  sortOrder: 0,
  isActive: true,
};

export function AdminPointPlansPage() {
  const { safeT, language } = useI18n();
  const ko = language !== "en";
  const action = useAdminRouteAction("/admin/point-plans");
  const [plans, setPlans] = useState<PointPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ code: string; httpStatus?: number } | null>(null);
  const [result, setResult] = useState<{ ok: true; message: string } | { ok: false; code: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PlanForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/point-plans", { credentials: "include" });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; plans?: PointPlan[] };
      if (!res.ok || json.ok === false) {
        setLoadError({ code: json.error ?? "load_failed", httpStatus: res.status });
        setPlans([]);
        return;
      }
      setPlans(json.plans ?? []);
    } catch {
      setLoadError({ code: "network_error" });
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startCreate = () => {
    setCreating(true);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const startEdit = (plan: PointPlan) => {
    setCreating(false);
    setEditingId(plan.id);
    setForm({
      nameKo: plan.nameKo ?? plan.name,
      nameEn: plan.nameEn ?? plan.name,
      descriptionKo: plan.descriptionKo ?? plan.description,
      descriptionEn: plan.descriptionEn ?? plan.description,
      paymentAmount: plan.paymentAmount,
      pointAmount: plan.pointAmount,
      bonusAmount: plan.bonusPointAmount,
      currency: plan.currency ?? "PHP",
      sortOrder: plan.sortOrder ?? 0,
      isActive: plan.isActive,
    });
  };

  const cancelForm = () => {
    setCreating(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const save = async () => {
    if (busy || !action.allowed) return;
    const c = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko,
      title: creating ? (ko ? "포인트 플랜 등록" : "Create point plan") : ko ? "포인트 플랜 저장" : "Save point plan",
      description: ko
        ? `「${form.nameKo || form.nameEn}」 플랜을 저장합니다. 충전 화면에 바로 반영됩니다.`
        : `Save the "${form.nameEn || form.nameKo}" plan. It applies to the charge screen right away.`,
      confirmLabel: creating ? adminCta("create", ko) : adminCta("save", ko),
    });
    if (!c.ok) return;
    setBusy(true);
    setResult(null);
    try {
      const body = {
        nameKo: form.nameKo,
        nameEn: form.nameEn || form.nameKo,
        descriptionKo: form.descriptionKo,
        descriptionEn: form.descriptionEn,
        paymentAmount: form.paymentAmount,
        pointAmount: form.pointAmount,
        bonusAmount: form.bonusAmount,
        currency: form.currency,
        sortOrder: form.sortOrder,
        isActive: form.isActive,
      };
      const res = creating
        ? await fetch("/api/admin/point-plans", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch(`/api/admin/point-plans/${editingId}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) {
        setResult({ ok: false, code: json.error ?? "save_failed" });
        return;
      }
      cancelForm();
      setResult({ ok: true, message: ko ? "저장했습니다." : "Saved." });
      await load();
    } catch {
      setResult({ ok: false, code: "network_error" });
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async (plan: PointPlan) => {
    if (busy || !plan.isActive || !action.allowed) return;
    const c = await confirmAdminAction({
      level: adminActionLevel("disable"),
      ko,
      title: ko ? "포인트 플랜 비활성" : "Deactivate point plan",
      description: ko
        ? `「${plan.name}」 플랜을 비활성으로 바꿉니다. 충전 화면에서 더 이상 보이지 않습니다.`
        : `Deactivate the "${plan.name}" plan. It will no longer appear on the charge screen.`,
      confirmLabel: ko ? "비활성" : "Deactivate",
    });
    if (!c.ok) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/point-plans/${plan.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) {
        setResult({ ok: false, code: json.error ?? "update_failed" });
        return;
      }
      setResult({ ok: true, message: ko ? "비활성으로 바꿨습니다." : "Deactivated." });
      await load();
    } catch {
      setResult({ ok: false, code: "network_error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <AdminPageHeader titleKey="admin_menu_points_plans" />
        <AdminActionButton variant="primary" disabled={!action.allowed} onClick={startCreate}>
          {ko ? "플랜 등록" : "Create plan"}
        </AdminActionButton>
      </div>
      {!action.allowed && action.reason ? (
        <p className="sam-text-helper text-sam-muted" data-admin-action-denied="1">
          {ko ? `등록·수정 버튼 비활성: ${action.reason}` : `Actions disabled: ${action.reason}`}
        </p>
      ) : null}
      {result ? <AdminResultBanner ko={ko} result={result} onClose={() => setResult(null)} /> : null}
      {creating || editingId ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 space-y-3">
          <h3 className="sam-text-body font-medium text-sam-fg">
            {creating
              ? safeT("admin_points_plans_create", {
                  fallbackKo: "플랜 추가",
                  fallbackEn: "Add plan",
                })
              : safeT("admin_points_plans_edit", {
                  fallbackKo: "플랜 수정",
                  fallbackEn: "Edit plan",
                })}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sam-text-helper">
              <span className="text-sam-muted">
                {safeT("admin_points_plans_label_name_ko", {
                  fallbackKo: "이름 (KO)",
                  fallbackEn: "Name (KO)",
                })}
              </span>
              <input
                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
                value={form.nameKo}
                onChange={(e) => setForm((f) => ({ ...f, nameKo: e.target.value }))}
              />
            </label>
            <label className="block sam-text-helper">
              <span className="text-sam-muted">
                {safeT("admin_points_plans_label_name_en", {
                  fallbackKo: "이름 (EN)",
                  fallbackEn: "Name (EN)",
                })}
              </span>
              <input
                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
                value={form.nameEn}
                onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))}
              />
            </label>
            <label className="block sam-text-helper">
              <span className="text-sam-muted">
                {safeT("admin_points_plans_label_payment", {
                  fallbackKo: "결제 금액",
                  fallbackEn: "Payment amount",
                })}
              </span>
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
                value={form.paymentAmount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, paymentAmount: Number(e.target.value) || 0 }))
                }
              />
            </label>
            <label className="block sam-text-helper">
              <span className="text-sam-muted">
                {safeT("admin_points_plans_label_points", {
                  fallbackKo: "포인트",
                  fallbackEn: "Points",
                })}
              </span>
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
                value={form.pointAmount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, pointAmount: Number(e.target.value) || 0 }))
                }
              />
            </label>
            <label className="block sam-text-helper">
              <span className="text-sam-muted">
                {safeT("admin_points_plans_label_bonus", {
                  fallbackKo: "보너스",
                  fallbackEn: "Bonus",
                })}
              </span>
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
                value={form.bonusAmount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, bonusAmount: Number(e.target.value) || 0 }))
                }
              />
            </label>
            <label className="block sam-text-helper">
              <span className="text-sam-muted">
                {safeT("admin_points_plans_label_currency", {
                  fallbackKo: "통화",
                  fallbackEn: "Currency",
                })}
              </span>
              <select
                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
              >
                <option value="PHP">PHP</option>
                <option value="KRW">KRW</option>
                <option value="USD">USD</option>
              </select>
            </label>
            <label className="block sam-text-helper">
              <span className="text-sam-muted">
                {safeT("admin_points_plans_label_sort", {
                  fallbackKo: "정렬",
                  fallbackEn: "Sort order",
                })}
              </span>
              <input
                type="number"
                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
                value={form.sortOrder}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sortOrder: Number(e.target.value) || 0 }))
                }
              />
            </label>
            <label className="flex items-center gap-2 sam-text-helper pt-6">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              />
              {safeT("admin_points_status_active", {
                fallbackKo: "활성",
                fallbackEn: "Active",
              })}
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <AdminActionButton variant="secondary" disabled={busy} onClick={cancelForm}>
              {adminCta("cancel", ko)}
            </AdminActionButton>
            <AdminActionButton variant="primary" disabled={busy || !action.allowed} onClick={() => void save()}>
              {creating ? adminCta("create", ko) : adminCta("save", ko)}
            </AdminActionButton>
          </div>
        </div>
      ) : null}

      {loading ? (
        <AdminLoadingState ko={ko} />
      ) : loadError ? (
        <AdminErrorState
          ko={ko}
          code={loadError.code}
          httpStatus={loadError.httpStatus}
          onRetry={() => void load()}
        />
      ) : plans.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={safeT("admin_points_plans_empty", {
            fallbackKo: "플랜이 없습니다.",
            fallbackEn: "No plans.",
          })}
        />
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
          <table className="min-w-full sam-text-helper">
            <thead className="bg-sam-app text-sam-muted">
              <tr>
                <th className="px-3 py-2 text-left">
                  {safeT("admin_points_plans_th_name", {
                    fallbackKo: "이름",
                    fallbackEn: "Name",
                  })}
                </th>
                <th className="px-3 py-2 text-right">
                  {safeT("admin_points_plans_th_payment", {
                    fallbackKo: "결제",
                    fallbackEn: "Payment",
                  })}
                </th>
                <th className="px-3 py-2 text-right">
                  {safeT("admin_points_plans_th_points", {
                    fallbackKo: "포인트",
                    fallbackEn: "Points",
                  })}
                </th>
                <th className="px-3 py-2 text-right">
                  {safeT("admin_points_plans_th_version", {
                    fallbackKo: "버전",
                    fallbackEn: "Version",
                  })}
                </th>
                <th className="px-3 py-2 text-left">
                  {safeT("admin_points_th_status", {
                    fallbackKo: "상태",
                    fallbackEn: "Status",
                  })}
                </th>
                <th className="px-3 py-2 text-right">
                  {safeT("admin_points_th_work", {
                    fallbackKo: "작업",
                    fallbackEn: "Actions",
                  })}
                </th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.id} className="border-t border-sam-border">
                  <td className="px-3 py-2 text-sam-fg">{plan.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatAdminDecimal(plan.paymentAmount)} {plan.currency ?? "PHP"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatAdminNumber(plan.pointAmount)}
                    {plan.bonusPointAmount > 0 ? `+${formatAdminNumber(plan.bonusPointAmount)}` : ""}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{plan.rateVersion}</td>
                  <td className="px-3 py-2">
                    <AdminStatusLabel
                      namespace={FINANCE_ACTIVE_STATE_NS}
                      code={plan.isActive ? "active" : "inactive"}
                      ko={ko}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-1">
                      <AdminActionButton
                        variant="ghost"
                        size="sm"
                        disabled={busy || !action.allowed}
                        onClick={() => startEdit(plan)}
                      >
                        {adminCta("edit", ko)}
                      </AdminActionButton>
                      {plan.isActive ? (
                        <AdminActionButton
                          variant="ghost"
                          size="sm"
                          disabled={busy || !action.allowed}
                          onClick={() => void deactivate(plan)}
                        >
                          {ko ? "비활성" : "Deactivate"}
                        </AdminActionButton>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
