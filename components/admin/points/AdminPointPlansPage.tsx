"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { resolveAdminApiErrorMessage } from "@/lib/admin/admin-api-error-i18n";
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
  const { t, safeT } = useI18n();
  const [plans, setPlans] = useState<PointPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PlanForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/point-plans", { credentials: "include" });
      const json = (await res.json()) as { ok?: boolean; error?: string; plans?: PointPlan[] };
      if (!res.ok || json.ok === false) {
        setErr(resolveAdminApiErrorMessage(json.error, t, "admin_points_err_action_failed"));
        setPlans([]);
        return;
      }
      setPlans(json.plans ?? []);
    } catch {
      setErr(t("common_network_error"));
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

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
    if (busy) return;
    setBusy(true);
    setErr("");
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
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) {
        setErr(resolveAdminApiErrorMessage(json.error, t, "admin_points_err_action_failed"));
        return;
      }
      cancelForm();
      await load();
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async (plan: PointPlan) => {
    if (busy || !plan.isActive) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/admin/point-plans/${plan.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) {
        setErr(resolveAdminApiErrorMessage(json.error, t, "admin_points_err_action_failed"));
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const title = safeT("admin_points_plans_title", {
    fallbackKo: "포인트 충전 플랜",
    fallbackEn: "Point charge plans",
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <AdminPageHeader title={title} />
        <button
          type="button"
          onClick={startCreate}
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-body text-sam-fg hover:bg-sam-app"
        >
          {safeT("admin_points_plans_create", {
            fallbackKo: "플랜 추가",
            fallbackEn: "Add plan",
          })}
        </button>
      </div>
      {err ? <p className="sam-text-body text-red-600">{err}</p> : null}
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
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="rounded-ui-rect bg-sam-brand px-3 py-1.5 sam-text-body text-white disabled:opacity-50"
            >
              {safeT("admin_points_plans_save", {
                fallbackKo: "저장",
                fallbackEn: "Save",
              })}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={cancelForm}
              className="rounded-ui-rect border border-sam-border px-3 py-1.5 sam-text-body"
            >
              {t("common_cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="sam-text-body text-sam-muted">{t("common_loading")}</p>
      ) : plans.length === 0 ? (
        <p className="sam-text-body text-sam-muted">
          {safeT("admin_points_plans_empty", {
            fallbackKo: "플랜이 없습니다.",
            fallbackEn: "No plans.",
          })}
        </p>
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
                  <td className="px-3 py-2 text-right">
                    {plan.paymentAmount} {plan.currency ?? "PHP"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {plan.pointAmount}
                    {plan.bonusPointAmount > 0 ? `+${plan.bonusPointAmount}` : ""}
                  </td>
                  <td className="px-3 py-2 text-right">{plan.rateVersion}</td>
                  <td className="px-3 py-2">
                    {plan.isActive
                      ? safeT("admin_points_status_active", {
                          fallbackKo: "활성",
                          fallbackEn: "Active",
                        })
                      : safeT("admin_points_status_inactive", {
                          fallbackKo: "비활성",
                          fallbackEn: "Inactive",
                        })}
                  </td>
                  <td className="px-3 py-2 text-right space-x-2">
                    <button
                      type="button"
                      className="underline"
                      onClick={() => startEdit(plan)}
                    >
                      {t("common_edit")}
                    </button>
                    {plan.isActive ? (
                      <button
                        type="button"
                        className="underline text-red-600"
                        disabled={busy}
                        onClick={() => void deactivate(plan)}
                      >
                        {safeT("admin_points_plans_deactivate", {
                          fallbackKo: "비활성",
                          fallbackEn: "Deactivate",
                        })}
                      </button>
                    ) : null}
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
