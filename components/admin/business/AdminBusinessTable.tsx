"use client";

import Link from "next/link";
import type { BusinessProfile } from "@/lib/types/business";
import { BUSINESS_STATUS_LABELS } from "@/lib/business/business-utils";

const STATUS_CLASS: Record<BusinessProfile["status"], string> = {
  pending: "bg-amber-100 text-amber-800",
  active: "bg-emerald-50 text-emerald-800",
  paused: "bg-sam-border-soft text-sam-fg",
  rejected: "bg-red-50 text-red-700",
};

interface AdminBusinessTableProps {
  profiles: BusinessProfile[];
}

export function AdminBusinessTable({ profiles }: AdminBusinessTableProps) {
  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              상점명
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              소유자
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              상태
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              상품/후기
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              신청일
            </th>
          </tr>
        </thead>
        <tbody>
          {profiles.map((p) => (
            <tr
              key={p.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5">
                <Link
                  href={`/admin/business/${p.id}`}
                  className="font-medium text-signature hover:underline"
                >
                  {p.shopName}
                </Link>
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {p.ownerNickname} ({p.ownerUserId})
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-[12px] font-medium ${STATUS_CLASS[p.status]}`}
                >
                  {BUSINESS_STATUS_LABELS[p.status]}
                </span>
              </td>
              <td className="px-3 py-2.5 text-sam-muted">
                {p.productCount} / {p.reviewCount}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-sam-muted">
                {new Date(p.createdAt).toLocaleDateString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
