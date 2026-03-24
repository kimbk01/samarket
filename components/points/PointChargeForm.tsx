"use client";

import { useState } from "react";
import type { PointPaymentMethod } from "@/lib/types/point";
import { getPointPlans } from "@/lib/points/mock-point-plans";
import { POINT_PAYMENT_METHOD_LABELS } from "@/lib/points/point-utils";

export interface PointChargeFormValues {
  planId: string;
  paymentMethod: PointPaymentMethod;
  depositorName: string;
  userMemo: string;
}

interface PointChargeFormProps {
  onSubmit: (values: PointChargeFormValues) => void;
  submitLabel?: string;
}

export function PointChargeForm({
  onSubmit,
  submitLabel = "충전 신청",
}: PointChargeFormProps) {
  const plans = getPointPlans();
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [paymentMethod, setPaymentMethod] = useState<PointPaymentMethod>("manual_confirm");
  const [depositorName, setDepositorName] = useState("");
  const [userMemo, setUserMemo] = useState("");

  const selectedPlan = plans.find((p) => p.id === planId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      planId,
      paymentMethod,
      depositorName,
      userMemo,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-[14px] font-medium text-gray-700">
          포인트 상품 선택
        </label>
        <select
          value={planId}
          onChange={(e) => setPlanId(e.target.value)}
          className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-[14px] text-gray-900"
        >
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · ₩{p.paymentAmount.toLocaleString()} →{" "}
              {(p.pointAmount + (p.bonusPointAmount ?? 0)).toLocaleString()}P
            </option>
          ))}
        </select>
      </div>

      {selectedPlan && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-[13px] text-gray-600">충전 요약</p>
          <p className="mt-1 text-[18px] font-semibold text-gray-900">
            ₩{selectedPlan.paymentAmount.toLocaleString()} →{" "}
            {(
              selectedPlan.pointAmount +
              (selectedPlan.bonusPointAmount ?? 0)
            ).toLocaleString()}
            P
          </p>
          {selectedPlan.bonusPointAmount > 0 && (
            <p className="mt-0.5 text-[12px] text-signature">
              보너스 +{selectedPlan.bonusPointAmount}P
            </p>
          )}
        </div>
      )}

      <div>
        <label className="mb-1 block text-[14px] font-medium text-gray-700">
          결제 방식 (placeholder)
        </label>
        <select
          value={paymentMethod}
          onChange={(e) =>
            setPaymentMethod(e.target.value as PointPaymentMethod)
          }
          className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-[14px] text-gray-900"
        >
          <option value="bank_transfer">
            {POINT_PAYMENT_METHOD_LABELS.bank_transfer}
          </option>
          <option value="gcash">
            {POINT_PAYMENT_METHOD_LABELS.gcash}
          </option>
          <option value="manual_confirm">
            {POINT_PAYMENT_METHOD_LABELS.manual_confirm}
          </option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-[14px] font-medium text-gray-700">
          입금자명 (선택)
        </label>
        <input
          type="text"
          value={depositorName}
          onChange={(e) => setDepositorName(e.target.value)}
          className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-[14px] text-gray-900"
          placeholder="계좌이체 시 입금자명"
        />
      </div>

      <div>
        <label className="mb-1 block text-[14px] font-medium text-gray-700">
          메모 (선택)
        </label>
        <textarea
          value={userMemo}
          onChange={(e) => setUserMemo(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-[14px] text-gray-900"
          placeholder="입금 참고용"
        />
      </div>

      <button
        type="submit"
        className="w-full rounded-lg bg-signature py-3 text-[15px] font-medium text-white"
      >
        {submitLabel}
      </button>
    </form>
  );
}
