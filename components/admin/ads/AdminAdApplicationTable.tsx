"use client";

import Link from "next/link";
import type { AdApplication } from "@/lib/types/ad-application";
import {
  AD_APPLICATION_STATUS_LABELS,
  AD_PAYMENT_STATUS_LABELS,
} from "@/lib/ads/ad-utils";

const STATUS_CLASS: Record<AdApplication["applicationStatus"], string> = {
  pending: "bg-sam-surface-muted text-sam-fg",
  waiting_payment: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-50 text-emerald-800",
  rejected: "bg-red-50 text-red-700",
  active: "bg-signature/10 text-signature",
  expired: "bg-sam-border-soft text-sam-muted",
  cancelled: "bg-sam-border-soft text-sam-muted",
};

interface AdminAdApplicationTableProps {
  applications: AdApplication[];
}

export function AdminAdApplicationTable({
  applications,
}: AdminAdApplicationTableProps) {
  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              대상
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              신청자
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              플랜/금액
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              신청상태
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              결제상태
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              신청일
            </th>
          </tr>
        </thead>
        <tbody>
          {applications.map((a) => (
            <tr
              key={a.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5">
                <Link
                  href={`/admin/ad-applications/${a.id}`}
                  className="font-medium text-signature hover:underline"
                >
                  {a.targetTitle}
                </Link>
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {a.applicantNickname}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {a.planName} / ₩{a.totalPrice.toLocaleString()}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${STATUS_CLASS[a.applicationStatus]}`}
                >
                  {AD_APPLICATION_STATUS_LABELS[a.applicationStatus]}
                </span>
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {AD_PAYMENT_STATUS_LABELS[a.paymentStatus]}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {new Date(a.createdAt).toLocaleDateString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
