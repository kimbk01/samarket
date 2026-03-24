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
  pending: "bg-gray-100 text-gray-700",
  waiting_payment: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-50 text-emerald-800",
  rejected: "bg-red-50 text-red-700",
  active: "bg-signature/10 text-signature",
  expired: "bg-gray-200 text-gray-600",
  cancelled: "bg-gray-200 text-gray-500",
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
      <div className="rounded-lg bg-white p-8 text-center text-[14px] text-gray-500">
        광고 신청 내역이 없습니다.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {applications.map((a) => (
        <li
          key={a.id}
          className="rounded-lg border border-gray-200 bg-white p-4"
        >
          <p className="font-medium text-gray-900">{a.targetTitle}</p>
          <p className="mt-0.5 text-[13px] text-gray-600">
            {a.planName} · ₩{a.totalPrice.toLocaleString()}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`inline-block rounded px-2 py-0.5 text-[12px] font-medium ${STATUS_CLASS[a.applicationStatus]}`}
            >
              {AD_APPLICATION_STATUS_LABELS[a.applicationStatus]}
            </span>
            <span className="text-[12px] text-gray-500">
              결제: {AD_PAYMENT_STATUS_LABELS[a.paymentStatus]}
            </span>
          </div>
          <p className="mt-1 text-[12px] text-gray-400">
            신청일 {new Date(a.createdAt).toLocaleDateString("ko-KR")}
          </p>
          {["pending", "waiting_payment"].includes(a.applicationStatus) && (
            <button
              type="button"
              onClick={() => handleCancel(a.id)}
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
