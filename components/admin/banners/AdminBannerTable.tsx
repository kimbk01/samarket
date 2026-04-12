"use client";

import Link from "next/link";
import type { AdminBanner } from "@/lib/types/admin-banner";
import { AdminBannerStatusBadge } from "./AdminBannerStatusBadge";
import { getBannerPlacementByKey } from "@/lib/admin-banners/mock-banner-placements";

interface AdminBannerTableProps {
  banners: AdminBanner[];
}

export function AdminBannerTable({ banners }: AdminBannerTableProps) {
  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">제목</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">위치</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">상태</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">우선순위</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">노출 기간</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">클릭/노출</th>
          </tr>
        </thead>
        <tbody>
          {banners.map((b) => {
            const placementLabel = getBannerPlacementByKey(b.placement)?.label ?? b.placement;
            const period =
              b.startAt && b.endAt
                ? `${new Date(b.startAt).toLocaleDateString("ko-KR")} ~ ${new Date(b.endAt).toLocaleDateString("ko-KR")}`
                : "-";
            return (
              <tr
                key={b.id}
                className="border-b border-sam-border-soft hover:bg-sam-app"
              >
                <td className="px-3 py-2.5">
                  <Link
                    href={`/admin/banners/${b.id}`}
                    className="font-medium text-signature hover:underline"
                  >
                    {b.title || "(제목 없음)"}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-sam-fg">{placementLabel}</td>
                <td className="px-3 py-2.5">
                  <AdminBannerStatusBadge status={b.status} />
                </td>
                <td className="px-3 py-2.5 text-sam-fg">{b.priority}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-sam-muted">
                  {period}
                </td>
                <td className="px-3 py-2.5 text-[13px] text-sam-muted">
                  {b.clickCount} / {b.impressionCount}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
