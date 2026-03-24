"use client";

import type { PointChargeRequest } from "@/lib/types/point";
import {
  POINT_CHARGE_STATUS_LABELS,
  POINT_PAYMENT_METHOD_LABELS,
} from "@/lib/points/point-utils";
import { cancelPointChargeRequest } from "@/lib/points/mock-point-charge-requests";

interface PointChargeRequestListProps {
  requests: PointChargeRequest[];
  onCancel?: () => void;
}

const STATUS_CLASS: Record<PointChargeRequest["requestStatus"], string> = {
  pending: "bg-gray-100 text-gray-700",
  waiting_confirm: "bg-amber-100 text-amber-800",
  on_hold: "bg-gray-200 text-gray-600",
  approved: "bg-emerald-50 text-emerald-800",
  rejected: "bg-red-50 text-red-700",
  cancelled: "bg-gray-200 text-gray-500",
};

export function PointChargeRequestList({
  requests,
  onCancel,
}: PointChargeRequestListProps) {
  const handleCancel = (id: string) => {
    cancelPointChargeRequest(id);
    onCancel?.();
  };

  if (requests.length === 0) {
    return (
      <div className="rounded-lg bg-white p-8 text-center text-[14px] text-gray-500">
        충전 신청 내역이 없습니다.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {requests.map((r) => (
        <li
          key={r.id}
          className="rounded-lg border border-gray-200 bg-white p-4"
        >
          <p className="font-medium text-gray-900">{r.planName}</p>
          <p className="mt-0.5 text-[13px] text-gray-600">
            ₩{r.paymentAmount.toLocaleString()} → {r.pointAmount.toLocaleString()}P
          </p>
          <p className="mt-0.5 text-[13px] text-gray-500">
            {POINT_PAYMENT_METHOD_LABELS[r.paymentMethod]}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`inline-block rounded px-2 py-0.5 text-[12px] font-medium ${STATUS_CLASS[r.requestStatus]}`}
            >
              {POINT_CHARGE_STATUS_LABELS[r.requestStatus]}
            </span>
          </div>
          <p className="mt-1 text-[12px] text-gray-400">
            {new Date(r.requestedAt).toLocaleString("ko-KR")}
          </p>
          {["pending", "waiting_confirm"].includes(r.requestStatus) && (
            <button
              type="button"
              onClick={() => handleCancel(r.id)}
              className="mt-2 text-[13px] text-red-600 hover:underline"
            >
              신청 취소
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
