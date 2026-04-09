"use client";

import { useMemo } from "react";
import { getOpsRetrospectives } from "@/lib/ops-board/mock-ops-retrospectives";

const SURFACE_LABELS: Record<string, string> = {
  all: "전체",
  home: "홈",
  search: "검색",
  shop: "상점",
};

export function OpsRetrospectiveList({ refreshKey = 0 }: { refreshKey?: number }) {
  const retros = useMemo(
    () => getOpsRetrospectives({ limit: 20 }),
    [refreshKey]
  );

  if (retros.length === 0) {
    return (
      <div className="rounded-ui-rect border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
        운영 회고가 없습니다. 새 회고를 작성해 주세요.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {retros.map((r) => (
        <div
          key={r.id}
          className="rounded-ui-rect border border-gray-200 bg-white p-4"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-medium text-gray-900">{r.title}</h3>
              <p className="mt-1 text-[13px] text-gray-600">
                {r.retrospectiveDate} · {SURFACE_LABELS[r.relatedSurface]}
                {r.relatedReportId && ` · 보고서 ${r.relatedReportId}`}
              </p>
              <p className="mt-2 text-[13px] text-gray-700 line-clamp-2">
                {r.summary}
              </p>
            </div>
            <span className="text-[12px] text-gray-500">
              {r.createdByAdminNickname}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
