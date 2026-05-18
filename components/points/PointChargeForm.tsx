"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { PointPlan, PointPaymentMethod } from "@/lib/types/point";

interface PointChargeFormProps {
  plans: PointPlan[];
  onSuccess: () => void;
  onClose: () => void;
}

export function PointChargeForm({ plans, onSuccess, onClose }: PointChargeFormProps) {
  const { t } = useI18n();
  const [selectedPlanId, setSelectedPlanId] = useState<string>(plans[0]?.id ?? "");
  const [paymentMethod, setPaymentMethod] = useState<PointPaymentMethod>("manual_confirm");
  const [depositorName, setDepositorName] = useState("");
  const [userMemo, setUserMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const totalPoint = selectedPlan
    ? selectedPlan.pointAmount + (selectedPlan.bonusPointAmount ?? 0)
    : 0;

  const methodLabel = (m: PointPaymentMethod) =>
    m === "manual_confirm" ? t("points_ui_method_manual") : t("points_ui_method_bank");

  const submit = async () => {
    if (!selectedPlanId || submitting) return;
    if (paymentMethod === "manual_confirm" && !depositorName.trim()) {
      setErr(t("points_ui_depositor_required_err"));
      return;
    }
    setSubmitting(true);
    setErr("");
    try {
      const res = await fetch("/api/me/points/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: selectedPlanId, paymentMethod, depositorName, userMemo }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? t("points_ui_request_failed"));
        return;
      }
      onSuccess();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-t-[length:var(--ui-radius-rect)] bg-sam-surface px-5 pb-10 pt-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="sam-text-section-title font-bold text-sam-fg">
            {t("points_ui_charge_modal_title")}
          </h2>
          <button type="button" onClick={onClose} className="sam-text-body-secondary text-sam-muted">
            {t("common_close")}
          </button>
        </div>

        <p className="mb-2 sam-text-body-secondary font-semibold text-sam-fg">{t("points_ui_select_plan")}</p>
        <div className="mb-4 space-y-2">
          {plans.map((plan) => {
            const total = plan.pointAmount + (plan.bonusPointAmount ?? 0);
            const isSelected = selectedPlanId === plan.id;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlanId(plan.id)}
                className={`w-full rounded-ui-rect border px-4 py-3 text-left transition-colors ${
                  isSelected ? "border-sky-400 bg-sky-50" : "border-sam-border bg-sam-surface hover:bg-sam-app"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="sam-text-body font-semibold text-sam-fg">{plan.name}</p>
                    {plan.description ? (
                      <p className="mt-0.5 sam-text-helper text-sam-muted">{plan.description}</p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <p className="sam-text-body font-bold text-sky-700">{total.toLocaleString()}P</p>
                    <p className="sam-text-helper text-sam-muted">₱{plan.paymentAmount.toLocaleString()}</p>
                    {(plan.bonusPointAmount ?? 0) > 0 && (
                      <p className="sam-text-xxs text-emerald-600">
                        {t("points_ui_bonus", { bonus: plan.bonusPointAmount ?? 0 })}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <p className="mb-2 sam-text-body-secondary font-semibold text-sam-fg">{t("points_ui_payment_method")}</p>
        <div className="mb-4 flex gap-2">
          {(["manual_confirm", "bank_transfer"] as PointPaymentMethod[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setPaymentMethod(m)}
              className={`flex-1 rounded-ui-rect border py-2.5 sam-text-body-secondary font-medium transition-colors ${
                paymentMethod === m
                  ? "border-sky-400 bg-sky-50 text-sky-800"
                  : "border-sam-border bg-sam-surface text-sam-fg"
              }`}
            >
              {methodLabel(m)}
            </button>
          ))}
        </div>

        {paymentMethod === "manual_confirm" && (
          <div className="mb-4 space-y-2">
            <div className="rounded-ui-rect bg-amber-50 px-3 py-2.5 sam-text-helper text-amber-800">
              <p className="font-semibold">{t("points_ui_deposit_guide_title")}</p>
              <p>{t("points_ui_deposit_guide_body")}</p>
              <p className="mt-1 font-mono">{t("points_ui_deposit_account")}</p>
            </div>
            <input
              type="text"
              value={depositorName}
              onChange={(e) => setDepositorName(e.target.value)}
              placeholder={t("points_ui_depositor_required")}
              className="w-full rounded-ui-rect border border-sam-border px-3 py-2.5 sam-text-body outline-none focus:border-sky-300"
            />
            <input
              type="text"
              value={userMemo}
              onChange={(e) => setUserMemo(e.target.value)}
              placeholder={t("points_ui_memo_optional")}
              className="w-full rounded-ui-rect border border-sam-border px-3 py-2.5 sam-text-body outline-none focus:border-sky-300"
            />
          </div>
        )}

        {selectedPlan && (
          <div className="mb-4 flex items-center justify-between rounded-ui-rect bg-sam-app px-3 py-2.5 sam-text-body-secondary">
            <span className="text-sam-fg">{t("points_ui_charge_points_label")}</span>
            <span className="sam-text-body-lg font-bold text-sky-700">{totalPoint.toLocaleString()}P</span>
          </div>
        )}

        {err ? <p className="mb-3 sam-text-helper text-red-600">{err}</p> : null}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={submitting || !selectedPlanId}
          className="w-full rounded-ui-rect bg-sky-600 py-3.5 sam-text-body font-bold text-white shadow-md disabled:opacity-40"
        >
          {submitting ? t("common_processing") : t("points_ui_submit_charge")}
        </button>
      </div>
    </div>
  );
}
