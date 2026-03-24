"use client";

import { useMemo } from "react";
import { getPromotedItems } from "@/lib/ads/mock-promoted-items";
import { AD_PLACEMENT_LABELS } from "@/lib/ads/ad-utils";
import type { PromotedItem } from "@/lib/types/ad-application";

const STATUS_LABELS: Record<PromotedItem["status"], string> = {
  scheduled: "예정",
  active: "노출중",
  expired: "만료",
  paused: "일시중지",
};

export function AdminPromotedItemListPage() {
  const items = useMemo(() => getPromotedItems(), []);

  return (
    <div className="space-y-4">
      <h1 className="text-[18px] font-semibold text-gray-900">
        유료 노출 상품
      </h1>
      {items.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
          유료 노출 중인 항목이 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full min-w-[600px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  대상
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  위치
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  상태
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  노출 기간
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-3 py-2.5 font-medium text-gray-900">
                    {p.targetTitle}
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">
                    {AD_PLACEMENT_LABELS[p.placement]}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-[12px] font-medium ${
                        p.status === "active"
                          ? "bg-signature/10 text-signature"
                          : p.status === "expired"
                            ? "bg-gray-200 text-gray-600"
                            : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {STATUS_LABELS[p.status]}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-gray-500">
                    {new Date(p.startAt).toLocaleDateString("ko-KR")} ~{" "}
                    {new Date(p.endAt).toLocaleDateString("ko-KR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
