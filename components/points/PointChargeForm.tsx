"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { PointPlan, PointPaymentMethod } from "@/lib/types/point";
import { CUSTOMER_CENTER_FORM_COLUMN_CLASS } from "@/lib/mypage/customer-center-layout";
import { DibayBottomSheet, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { CurrencyAmount } from "@/components/currency";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

interface PointChargeFormProps {
  plans: PointPlan[];
  onSuccess: () => void;
  onClose?: () => void;
  /** page = full-screen form (CS Slice 2); sheet = legacy bottom sheet overlay */
  layout?: "page" | "sheet";
}

export function PointChargeForm({
  plans,
  onSuccess,
  onClose,
  layout = "sheet",
}: PointChargeFormProps) {
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

  const body = (
    <div className={layout === "page" ? `${CUSTOMER_CENTER_FORM_COLUMN_CLASS} pb-10 pt-2` : undefined}>
      {plans.length === 0 ? (
        <p className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-6 text-center sam-text-body text-sam-muted">
          {t("common_content_unavailable")}
        </p>
      ) : (
        <>
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
                  className={`min-h-11 w-full rounded-ui-rect border px-4 py-3 text-left transition-colors ${
                    isSelected ? "border-sky-400 bg-sky-50" : "border-sam-border bg-sam-surface hover:bg-sam-app"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="sam-text-body font-semibold text-sam-fg">{plan.name}</p>
                      {plan.description ? (
                        <p className="mt-0.5 break-words sam-text-helper text-sam-muted">{plan.description}</p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <CurrencyAmount
                        currency="point"
                        amount={total}
                        compactPoint
                        className="sam-text-body"
                      />
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
          <div className="mb-4 flex flex-wrap gap-2">
            {(["manual_confirm", "bank_transfer"] as PointPaymentMethod[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPaymentMethod(m)}
                className={`min-h-11 min-w-[8rem] flex-1 rounded-ui-rect border py-2.5 sam-text-body-secondary font-medium transition-colors ${
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
                <p className="mt-1 break-all font-mono">{t("points_ui_deposit_account")}</p>
              </div>
              <input
                type="text"
                value={depositorName}
                onChange={(e) => setDepositorName(e.target.value)}
                placeholder={t("points_ui_depositor_required")}
                className={`min-h-11 w-full ${OverlayUi.input}`}
              />
              <input
                type="text"
                value={userMemo}
                onChange={(e) => setUserMemo(e.target.value)}
                placeholder={t("points_ui_memo_optional")}
                className={`min-h-11 w-full ${OverlayUi.input}`}
              />
            </div>
          )}

          {selectedPlan && (
            <div className="mb-4 flex items-center justify-between rounded-[length:var(--overlay-radius-md)] bg-[color:var(--overlay-secondary)] px-3 py-2.5">
              <span className="text-[color:var(--overlay-text-primary)]">{t("points_ui_charge_points_label")}</span>
              <CurrencyAmount
                currency="point"
                amount={totalPoint}
                compactPoint
                className="font-bold"
              />
            </div>
          )}

          {err ? <p className={`mb-3 ${OverlayUi.caption} text-[color:var(--overlay-danger)]`}>{err}</p> : null}

          <DibayOverlayButton
            roleTone="primary"
            type="button"
            onClick={() => void submit()}
            disabled={submitting || !selectedPlanId}
            loading={submitting}
            className="w-full"
          >
            {submitting ? t("common_processing") : t("points_ui_submit_charge")}
          </DibayOverlayButton>
        </>
      )}
    </div>
  );

  if (layout === "page") {
    return body;
  }

  return (
    <DibayBottomSheet
      open
      onClose={() => onClose?.()}
      title={t("points_ui_charge_modal_title")}
      anchor="above-bottom-nav"
    >
      {body}
    </DibayBottomSheet>
  );
}
