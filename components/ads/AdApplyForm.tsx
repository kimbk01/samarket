"use client";

import { useState, useMemo } from "react";
import type { AdTargetType, AdPlacement, AdPaymentMethod } from "@/lib/types/ad-application";
import { getAdPlansByTargetAndPlacement } from "@/lib/ads/mock-ad-plans";
import { AD_TARGET_LABELS, AD_PLACEMENT_LABELS, AD_PAYMENT_METHOD_LABELS } from "@/lib/ads/ad-utils";
import type { AdPlan } from "@/lib/types/ad-application";

export interface AdApplyFormValues {
  targetType: AdTargetType;
  targetId: string;
  targetTitle: string;
  placement: AdPlacement;
  planId: string;
  paymentMethod: AdPaymentMethod;
  applicantMemo: string;
}

interface AdApplyFormProps {
  productOptions: { id: string; title: string }[];
  shopOptions: { id: string; shopName: string }[];
  onSubmit: (values: AdApplyFormValues) => void;
  submitLabel?: string;
}

const PLACEMENTS: AdPlacement[] = [
  "home_top",
  "home_middle",
  "search_top",
  "product_detail",
  "shop_featured",
];

export function AdApplyForm({
  productOptions,
  shopOptions,
  onSubmit,
  submitLabel = "신청하기",
}: AdApplyFormProps) {
  const [targetType, setTargetType] = useState<AdTargetType>("product");
  const [targetId, setTargetId] = useState("");
  const [placement, setPlacement] = useState<AdPlacement>("home_top");
  const [planId, setPlanId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<AdPaymentMethod>("manual_confirm");
  const [applicantMemo, setApplicantMemo] = useState("");

  const plans = useMemo(
    () => getAdPlansByTargetAndPlacement(targetType, placement),
    [targetType, placement]
  );

  const selectedPlan: AdPlan | undefined = useMemo(
    () => plans.find((p) => p.id === planId) ?? plans[0],
    [plans, planId]
  );

  const targetTitle =
    targetType === "product"
      ? productOptions.find((p) => p.id === targetId)?.title ?? ""
      : targetType === "shop"
        ? shopOptions.find((s) => s.id === targetId)?.shopName ?? ""
        : "";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const plan = selectedPlan ?? plans[0];
    if (!plan) return;
    const resolvedId =
      targetId ||
      (targetType === "product" ? productOptions[0]?.id : shopOptions[0]?.id) ||
      "";
    const resolvedTitle =
      targetTitle ||
      (targetType === "product"
        ? productOptions[0]?.title
        : shopOptions[0]?.shopName) ||
      "";
    onSubmit({
      targetType,
      targetId: resolvedId,
      targetTitle: resolvedTitle,
      placement,
      planId: plan.id,
      paymentMethod,
      applicantMemo,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          광고 대상
        </label>
        <select
          value={targetType}
          onChange={(e) => {
            setTargetType(e.target.value as AdTargetType);
            setTargetId("");
            setPlanId("");
          }}
          className="w-full rounded-ui-rect border border-sam-border px-3 py-2.5 sam-text-body text-sam-fg"
        >
          <option value="product">{AD_TARGET_LABELS.product}</option>
          <option value="shop">{AD_TARGET_LABELS.shop}</option>
          <option value="banner">{AD_TARGET_LABELS.banner} (placeholder)</option>
        </select>
      </div>

      {targetType === "product" && (
        <div>
          <label className="mb-1 block sam-text-body font-medium text-sam-fg">
            상품 선택
          </label>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="w-full rounded-ui-rect border border-sam-border px-3 py-2.5 sam-text-body text-sam-fg"
          >
            <option value="">선택</option>
            {productOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {targetType === "shop" && (
        <div>
          <label className="mb-1 block sam-text-body font-medium text-sam-fg">
            상점 선택
          </label>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="w-full rounded-ui-rect border border-sam-border px-3 py-2.5 sam-text-body text-sam-fg"
          >
            <option value="">선택</option>
            {shopOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.shopName}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          노출 위치
        </label>
        <select
          value={placement}
          onChange={(e) => {
            setPlacement(e.target.value as AdPlacement);
            setPlanId("");
          }}
          className="w-full rounded-ui-rect border border-sam-border px-3 py-2.5 sam-text-body text-sam-fg"
        >
          {PLACEMENTS.map((p) => (
            <option key={p} value={p}>
              {AD_PLACEMENT_LABELS[p]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          플랜 선택
        </label>
        <select
          value={planId || (plans[0]?.id ?? "")}
          onChange={(e) => setPlanId(e.target.value)}
          className="w-full rounded-ui-rect border border-sam-border px-3 py-2.5 sam-text-body text-sam-fg"
        >
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.durationDays}일 · ₩{p.price.toLocaleString()}
            </option>
          ))}
        </select>
      </div>

      {selectedPlan && (
        <div className="rounded-ui-rect border border-sam-border bg-sam-app p-4">
          <p className="sam-text-body-secondary text-sam-muted">예상 금액</p>
          <p className="mt-1 sam-text-page-title font-semibold text-sam-fg">
            ₩{selectedPlan.price.toLocaleString()}
          </p>
          <p className="mt-0.5 sam-text-helper text-sam-muted">
            {selectedPlan.durationDays}일 노출
          </p>
        </div>
      )}

      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          결제 방식 (placeholder)
        </label>
        <select
          value={paymentMethod}
          onChange={(e) =>
            setPaymentMethod(e.target.value as AdPaymentMethod)
          }
          className="w-full rounded-ui-rect border border-sam-border px-3 py-2.5 sam-text-body text-sam-fg"
        >
          <option value="bank_transfer">
            {AD_PAYMENT_METHOD_LABELS.bank_transfer}
          </option>
          <option value="gcash">{AD_PAYMENT_METHOD_LABELS.gcash}</option>
          <option value="manual_confirm">
            {AD_PAYMENT_METHOD_LABELS.manual_confirm}
          </option>
        </select>
      </div>

      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          메모 (선택)
        </label>
        <textarea
          value={applicantMemo}
          onChange={(e) => setApplicantMemo(e.target.value)}
          rows={2}
          className="w-full rounded-ui-rect border border-sam-border px-3 py-2.5 sam-text-body text-sam-fg"
          placeholder="입금 참고용 메모"
        />
      </div>

      <button
        type="submit"
        className="w-full rounded-ui-rect bg-signature py-3 sam-text-body font-medium text-white"
      >
        {submitLabel}
      </button>
    </form>
  );
}
