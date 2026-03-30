"use client";

import { useState } from "react";
import type { PointPlan, PointPaymentMethod } from "@/lib/types/point";

interface PointChargeFormProps {
  plans: PointPlan[];
  onSuccess: () => void;
  onClose: () => void;
}

const METHOD_LABELS: Record<string, string> = {
  manual_confirm: "계좌 입금 후 확인",
  bank_transfer: "자동 이체",
};

export function PointChargeForm({ plans, onSuccess, onClose }: PointChargeFormProps) {
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

  const submit = async () => {
    if (!selectedPlanId || submitting) return;
    if (paymentMethod === "manual_confirm" && !depositorName.trim()) {
      setErr("입금자명을 입력해 주세요.");
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
        setErr(j.error ?? "신청 실패");
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
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-t-3xl bg-white px-5 pb-10 pt-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-bold text-gray-900">포인트 충전 신청</h2>
          <button type="button" onClick={onClose} className="text-[13px] text-gray-500">닫기</button>
        </div>

        {/* 플랜 선택 */}
        <p className="mb-2 text-[13px] font-semibold text-gray-700">충전 플랜 선택</p>
        <div className="mb-4 space-y-2">
          {plans.map((plan) => {
            const total = plan.pointAmount + (plan.bonusPointAmount ?? 0);
            const isSelected = selectedPlanId === plan.id;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlanId(plan.id)}
                className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                  isSelected ? "border-sky-400 bg-sky-50" : "border-gray-200 bg-white hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[14px] font-semibold text-gray-900">{plan.name}</p>
                    {plan.description ? (
                      <p className="mt-0.5 text-[12px] text-gray-500">{plan.description}</p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <p className="text-[15px] font-bold text-sky-700">{total.toLocaleString()}P</p>
                    <p className="text-[12px] text-gray-500">₱{plan.paymentAmount.toLocaleString()}</p>
                    {(plan.bonusPointAmount ?? 0) > 0 && (
                      <p className="text-[11px] text-emerald-600">+{plan.bonusPointAmount}P 보너스</p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* 결제 방식 */}
        <p className="mb-2 text-[13px] font-semibold text-gray-700">결제 방식</p>
        <div className="mb-4 flex gap-2">
          {(["manual_confirm", "bank_transfer"] as PointPaymentMethod[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setPaymentMethod(m)}
              className={`flex-1 rounded-xl border py-2.5 text-[13px] font-medium transition-colors ${
                paymentMethod === m
                  ? "border-sky-400 bg-sky-50 text-sky-800"
                  : "border-gray-200 bg-white text-gray-700"
              }`}
            >
              {METHOD_LABELS[m] ?? m}
            </button>
          ))}
        </div>

        {/* 입금자명 (manual_confirm일 때) */}
        {paymentMethod === "manual_confirm" && (
          <div className="mb-4 space-y-2">
            <div className="rounded-xl bg-amber-50 px-3 py-2.5 text-[12px] text-amber-800">
              <p className="font-semibold">계좌 입금 안내</p>
              <p>입금 후 관리자 확인 시 포인트가 지급됩니다.</p>
              <p className="mt-1 font-mono">BDO 0123-4567-8901 · SAMarket Philippines</p>
            </div>
            <input
              type="text"
              value={depositorName}
              onChange={(e) => setDepositorName(e.target.value)}
              placeholder="입금자명 (필수)"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[14px] outline-none focus:border-sky-300"
            />
            <input
              type="text"
              value={userMemo}
              onChange={(e) => setUserMemo(e.target.value)}
              placeholder="메모 (선택)"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[14px] outline-none focus:border-sky-300"
            />
          </div>
        )}

        {selectedPlan && (
          <div className="mb-4 flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2.5 text-[13px]">
            <span className="text-gray-700">충전 포인트</span>
            <span className="text-[16px] font-bold text-sky-700">{totalPoint.toLocaleString()}P</span>
          </div>
        )}

        {err ? <p className="mb-3 text-[12px] text-red-600">{err}</p> : null}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={submitting || !selectedPlanId}
          className="w-full rounded-2xl bg-sky-600 py-3.5 text-[15px] font-bold text-white shadow-md disabled:opacity-40"
        >
          {submitting ? "처리 중…" : "충전 신청하기"}
        </button>
      </div>
    </div>
  );
}
