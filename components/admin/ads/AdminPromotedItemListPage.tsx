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
      <h1 className="text-[18px] font-semibold text-sam-fg">
        유료 노출 상품
      </h1>
      {items.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-[14px] text-sam-muted">
          유료 노출 중인 항목이 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[600px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  대상
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  위치
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  상태
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  노출 기간
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-sam-border-soft hover:bg-sam-app"
                >
                  <td className="px-3 py-2.5 font-medium text-sam-fg">
                    {p.targetTitle}
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {AD_PLACEMENT_LABELS[p.placement]}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-[12px] font-medium ${
                        p.status === "active"
                          ? "bg-signature/10 text-signature"
                          : p.status === "expired"
                            ? "bg-sam-border-soft text-sam-muted"
                            : "bg-sam-surface-muted text-sam-fg"
                      }`}
                    >
                      {STATUS_LABELS[p.status]}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-sam-muted">
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
