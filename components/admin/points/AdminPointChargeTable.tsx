"use client";

import Link from "next/link";
import type { PointChargeRequest } from "@/lib/types/point";
import {
  POINT_CHARGE_STATUS_LABELS,
  POINT_PAYMENT_METHOD_LABELS,
} from "@/lib/points/point-utils";

const STATUS_CLASS: Record<PointChargeRequest["requestStatus"], string> = {
  pending: "bg-gray-100 text-gray-700",
  waiting_confirm: "bg-amber-100 text-amber-800",
  on_hold: "bg-gray-200 text-gray-600",
  approved: "bg-emerald-50 text-emerald-800",
  rejected: "bg-red-50 text-red-700",
  cancelled: "bg-gray-200 text-gray-500",
};

interface AdminPointChargeTableProps {
  requests: PointChargeRequest[];
}

export function AdminPointChargeTable({
  requests,
}: AdminPointChargeTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[640px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              신청자
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              상품/금액
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              결제방식
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              상태
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              신청일
            </th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr
              key={r.id}
              className="border-b border-gray-100 hover:bg-gray-50"
            >
              <td className="px-3 py-2.5">
                <Link
                  href={`/admin/point-charges/${r.id}`}
                  className="font-medium text-signature hover:underline"
                >
                  {r.userNickname}
                </Link>
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {r.planName} / ₩{r.paymentAmount.toLocaleString()} →{" "}
                {r.pointAmount}P
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-600">
                {POINT_PAYMENT_METHOD_LABELS[r.paymentMethod]}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-[12px] font-medium ${STATUS_CLASS[r.requestStatus]}`}
                >
                  {POINT_CHARGE_STATUS_LABELS[r.requestStatus]}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-gray-500">
                {new Date(r.requestedAt).toLocaleDateString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
