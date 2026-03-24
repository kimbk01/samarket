"use client";

import Link from "next/link";
import type { AdApplication } from "@/lib/types/ad-application";
import {
  AD_APPLICATION_STATUS_LABELS,
  AD_PAYMENT_STATUS_LABELS,
} from "@/lib/ads/ad-utils";

const STATUS_CLASS: Record<AdApplication["applicationStatus"], string> = {
  pending: "bg-gray-100 text-gray-700",
  waiting_payment: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-50 text-emerald-800",
  rejected: "bg-red-50 text-red-700",
  active: "bg-signature/10 text-signature",
  expired: "bg-gray-200 text-gray-600",
  cancelled: "bg-gray-200 text-gray-500",
};

interface AdminAdApplicationTableProps {
  applications: AdApplication[];
}

export function AdminAdApplicationTable({
  applications,
}: AdminAdApplicationTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[640px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              대상
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              신청자
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              플랜/금액
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              신청상태
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              결제상태
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              신청일
            </th>
          </tr>
        </thead>
        <tbody>
          {applications.map((a) => (
            <tr
              key={a.id}
              className="border-b border-gray-100 hover:bg-gray-50"
            >
              <td className="px-3 py-2.5">
                <Link
                  href={`/admin/ad-applications/${a.id}`}
                  className="font-medium text-signature hover:underline"
                >
                  {a.targetTitle}
                </Link>
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {a.applicantNickname}
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {a.planName} / ₩{a.totalPrice.toLocaleString()}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-[12px] font-medium ${STATUS_CLASS[a.applicationStatus]}`}
                >
                  {AD_APPLICATION_STATUS_LABELS[a.applicationStatus]}
                </span>
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-600">
                {AD_PAYMENT_STATUS_LABELS[a.paymentStatus]}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-gray-500">
                {new Date(a.createdAt).toLocaleDateString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
