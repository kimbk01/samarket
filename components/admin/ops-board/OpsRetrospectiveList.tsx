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
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-[14px] text-sam-muted">
        운영 회고가 없습니다. 새 회고를 작성해 주세요.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {retros.map((r) => (
        <div
          key={r.id}
          className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-medium text-sam-fg">{r.title}</h3>
              <p className="mt-1 text-[13px] text-sam-muted">
                {r.retrospectiveDate} · {SURFACE_LABELS[r.relatedSurface]}
                {r.relatedReportId && ` · 보고서 ${r.relatedReportId}`}
              </p>
              <p className="mt-2 text-[13px] text-sam-fg line-clamp-2">
                {r.summary}
              </p>
            </div>
            <span className="text-[12px] text-sam-muted">
              {r.createdByAdminNickname}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
