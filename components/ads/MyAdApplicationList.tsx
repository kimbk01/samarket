"use client";

import Link from "next/link";
import type { AdApplication } from "@/lib/types/ad-application";
import {
  AD_APPLICATION_STATUS_LABELS,
  AD_PAYMENT_STATUS_LABELS,
} from "@/lib/ads/ad-utils";
import { cancelAdApplication } from "@/lib/ads/mock-ad-applications";

interface MyAdApplicationListProps {
  applications: AdApplication[];
  onCancel?: () => void;
}

const STATUS_CLASS: Record<AdApplication["applicationStatus"], string> = {
  pending: "bg-sam-surface-muted text-sam-fg",
  waiting_payment: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-50 text-emerald-800",
  rejected: "bg-red-50 text-red-700",
  active: "bg-signature/10 text-signature",
  expired: "bg-sam-border-soft text-sam-muted",
  cancelled: "bg-sam-border-soft text-sam-muted",
};

export function MyAdApplicationList({
  applications,
  onCancel,
}: MyAdApplicationListProps) {
  const handleCancel = (id: string) => {
    cancelAdApplication(id);
    onCancel?.();
  };

  if (applications.length === 0) {
    return (
      <div className="rounded-ui-rect bg-sam-surface p-8 text-center sam-text-body text-sam-muted">
        광고 신청 내역이 없습니다.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {applications.map((a) => (
        <li
          key={a.id}
          className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
        >
          <p className="font-medium text-sam-fg">{a.targetTitle}</p>
          <p className="mt-0.5 sam-text-body-secondary text-sam-muted">
            {a.planName} · ₩{a.totalPrice.toLocaleString()}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${STATUS_CLASS[a.applicationStatus]}`}
            >
              {AD_APPLICATION_STATUS_LABELS[a.applicationStatus]}
            </span>
            <span className="sam-text-helper text-sam-muted">
              결제: {AD_PAYMENT_STATUS_LABELS[a.paymentStatus]}
            </span>
          </div>
          <p className="mt-1 sam-text-helper text-sam-meta">
            신청일 {new Date(a.createdAt).toLocaleDateString("ko-KR")}
          </p>
          {["pending", "waiting_payment"].includes(a.applicationStatus) && (
            <button
              type="button"
              onClick={() => handleCancel(a.id)}
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
