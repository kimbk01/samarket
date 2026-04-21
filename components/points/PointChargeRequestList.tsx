"use client";

import type { PointChargeRequest } from "@/lib/types/point";
import {
  POINT_CHARGE_STATUS_LABELS,
  POINT_PAYMENT_METHOD_LABELS,
} from "@/lib/points/point-utils";

interface PointChargeRequestListProps {
  requests: PointChargeRequest[];
  onCancel?: () => void;
}

const STATUS_CLASS: Record<PointChargeRequest["requestStatus"], string> = {
  pending: "bg-sam-surface-muted text-sam-fg",
  waiting_confirm: "bg-amber-100 text-amber-800",
  on_hold: "bg-sam-border-soft text-sam-muted",
  approved: "bg-emerald-50 text-emerald-800",
  rejected: "bg-red-50 text-red-700",
  cancelled: "bg-sam-border-soft text-sam-muted",
};

export function PointChargeRequestList({
  requests,
  onCancel,
}: PointChargeRequestListProps) {
  const handleCancel = (_id: string) => {
    onCancel?.();
  };

  if (requests.length === 0) {
    return (
      <div className="rounded-ui-rect bg-sam-surface p-8 text-center sam-text-body text-sam-muted">
        충전 신청 내역이 없습니다.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {requests.map((r) => (
        <li
          key={r.id}
          className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
        >
          <p className="font-medium text-sam-fg">{r.planName}</p>
          <p className="mt-0.5 sam-text-body-secondary text-sam-muted">
            ₩{r.paymentAmount.toLocaleString()} → {r.pointAmount.toLocaleString()}P
          </p>
          <p className="mt-0.5 sam-text-body-secondary text-sam-muted">
            {POINT_PAYMENT_METHOD_LABELS[r.paymentMethod]}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${STATUS_CLASS[r.requestStatus]}`}
            >
              {POINT_CHARGE_STATUS_LABELS[r.requestStatus]}
            </span>
          </div>
          <p className="mt-1 sam-text-helper text-sam-meta">
            {new Date(r.requestedAt).toLocaleString("ko-KR")}
          </p>
          {onCancel && ["pending", "waiting_confirm"].includes(r.requestStatus) && (
            <button
              type="button"
              onClick={() => handleCancel(r.id)}
              className="mt-2 sam-text-body-secondary text-red-600 hover:underline"
            >
              신청 취소
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
