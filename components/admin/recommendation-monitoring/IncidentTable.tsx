"use client";

import { useMemo, useState } from "react";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import type { IncidentStatus } from "@/lib/types/recommendation-monitoring";
import {
  getRecommendationIncidents,
  acknowledgeIncident,
  resolveIncident,
} from "@/lib/recommendation-monitoring/mock-recommendation-incidents";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";

const SEVERITY_LABELS: Record<string, string> = {
  low: "낮음",
  medium: "중간",
  high: "높음",
  critical: "긴급",
};

const TYPE_LABELS: Record<string, string> = {
  empty_feed_spike: "빈피드 급증",
  ctr_drop: "CTR 하락",
  conversion_drop: "전환율 하락",
  fallback_activated: "Fallback 활성화",
  kill_switch_enabled: "킬스위치 활성화",
  deployment_failure: "배포 실패",
  section_disabled: "섹션 비활성화",
};

const STATUS_LABELS: Record<IncidentStatus, string> = {
  open: "미해결",
  acknowledged: "확인됨",
  resolved: "해결됨",
};

const ADMIN_ID = "admin1";
const ADMIN_NICK = "관리자";

export function IncidentTable() {
  const [refresh, setRefresh] = useState(0);
  const [statusFilter, setStatusFilter] = useState<IncidentStatus | "">("");
  const [surfaceFilter, setSurfaceFilter] = useState<RecommendationSurface | "">("");

  const incidents = useMemo(
    () =>
      getRecommendationIncidents({
        status: statusFilter || undefined,
        surface: surfaceFilter || undefined,
      }),
    [refresh, statusFilter, surfaceFilter]
  );

  const handleAck = (id: string) => {
    acknowledgeIncident(id, ADMIN_ID, ADMIN_NICK);
    setRefresh((r) => r + 1);
  };

  const handleResolve = (id: string) => {
    resolveIncident(id);
    setRefresh((r) => r + 1);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(
              e.target.value === "" ? "" : (e.target.value as IncidentStatus)
            )
          }
          className="rounded border border-gray-200 px-3 py-2 text-[14px]"
        >
          <option value="">전체 상태</option>
          <option value="open">미해결</option>
          <option value="acknowledged">확인됨</option>
          <option value="resolved">해결됨</option>
        </select>
        <select
          value={surfaceFilter}
          onChange={(e) =>
            setSurfaceFilter(
              e.target.value === "" ? "" : (e.target.value as RecommendationSurface)
            )
          }
          className="rounded border border-gray-200 px-3 py-2 text-[14px]"
        >
          <option value="">전체 surface</option>
          <option value="home">홈</option>
          <option value="search">검색</option>
          <option value="shop">상점</option>
        </select>
      </div>
      {incidents.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
          운영 이슈가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full min-w-[640px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  제목
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  surface
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  유형 / 심각도
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  상태
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  발생
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  조치
                </th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((i) => (
                <tr
                  key={i.id}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-3 py-2.5 font-medium text-gray-900">
                    {i.title}
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">
                    {SURFACE_LABELS[i.surface]}
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">
                    {TYPE_LABELS[i.incidentType] ?? i.incidentType} /{" "}
                    {SEVERITY_LABELS[i.severity]}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-[12px] ${
                        i.status === "resolved"
                          ? "bg-emerald-50 text-emerald-800"
                          : i.status === "acknowledged"
                            ? "bg-amber-50 text-amber-800"
                            : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {STATUS_LABELS[i.status]}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-gray-500">
                    {new Date(i.startedAt).toLocaleString("ko-KR")}
                  </td>
                  <td className="px-3 py-2.5">
                    {i.status === "open" && (
                      <button
                        type="button"
                        onClick={() => handleAck(i.id)}
                        className="mr-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[13px] text-amber-800"
                      >
                        확인
                      </button>
                    )}
                    {(i.status === "open" || i.status === "acknowledged") && (
                      <button
                        type="button"
                        onClick={() => handleResolve(i.id)}
                        className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[13px] text-emerald-800"
                      >
                        해결
                      </button>
                    )}
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
