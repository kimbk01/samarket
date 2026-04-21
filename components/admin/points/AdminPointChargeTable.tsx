"use client";

import Link from "next/link";
import type { PointChargeRequest } from "@/lib/types/point";
import {
  POINT_CHARGE_STATUS_LABELS,
  POINT_PAYMENT_METHOD_LABELS,
} from "@/lib/points/point-utils";

const STATUS_CLASS: Record<PointChargeRequest["requestStatus"], string> = {
  pending: "bg-sam-surface-muted text-sam-fg",
  waiting_confirm: "bg-amber-100 text-amber-800",
  on_hold: "bg-sam-border-soft text-sam-muted",
  approved: "bg-emerald-50 text-emerald-800",
  rejected: "bg-red-50 text-red-700",
  cancelled: "bg-sam-border-soft text-sam-muted",
};

interface AdminPointChargeTableProps {
  requests: PointChargeRequest[];
}

export function AdminPointChargeTable({
  requests,
}: AdminPointChargeTableProps) {
  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              신청자
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              상품/금액
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              결제방식
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              상태
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              신청일
            </th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr
              key={r.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5">
                <Link
                  href={`/admin/point-charges/${r.id}`}
                  className="font-medium text-signature hover:underline"
                >
                  {r.userNickname}
                </Link>
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {r.planName} / ₩{r.paymentAmount.toLocaleString()} →{" "}
                {r.pointAmount}P
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {POINT_PAYMENT_METHOD_LABELS[r.paymentMethod]}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${STATUS_CLASS[r.requestStatus]}`}
                >
                  {POINT_CHARGE_STATUS_LABELS[r.requestStatus]}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {new Date(r.requestedAt).toLocaleDateString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
