"use client";

import { useMemo, useState } from "react";
import { getRecommendationDeployments } from "@/lib/recommendation-deployments/mock-recommendation-deployments";
import { getFeedVersionById } from "@/lib/recommendation-experiments/mock-feed-versions";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";
import type { DeploymentStatus } from "@/lib/types/recommendation-deployment";

const STATUS_LABELS: Record<DeploymentStatus, string> = {
  scheduled: "예약됨",
  deploying: "배포중",
  success: "성공",
  rolled_back: "롤백됨",
  failed: "실패",
};

export function DeploymentHistoryTable() {
  const [surfaceFilter, setSurfaceFilter] = useState<string>("");

  const deployments = useMemo(
    () =>
      getRecommendationDeployments(
        surfaceFilter
          ? { surface: surfaceFilter as "home" | "search" | "shop" }
          : undefined
      ),
    [surfaceFilter]
  );

  if (deployments.length === 0) {
    return (
      <div className="space-y-2">
        <div className="flex gap-2">
          <select
            value={surfaceFilter}
            onChange={(e) => setSurfaceFilter(e.target.value)}
            className="rounded border border-gray-200 px-3 py-2 text-[14px]"
          >
            <option value="">전체 surface</option>
            <option value="home">홈</option>
            <option value="search">검색</option>
            <option value="shop">상점</option>
          </select>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
          배포 이력이 없습니다.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select
          value={surfaceFilter}
          onChange={(e) => setSurfaceFilter(e.target.value)}
          className="rounded border border-gray-200 px-3 py-2 text-[14px]"
        >
          <option value="">전체 surface</option>
          <option value="home">홈</option>
          <option value="search">검색</option>
          <option value="shop">상점</option>
        </select>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full min-w-[640px] border-collapse text-[14px]">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                배포명
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                surface
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                배포 버전
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                상태
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                배포 시각
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                담당
              </th>
            </tr>
          </thead>
          <tbody>
            {deployments.map((d) => {
              const version = getFeedVersionById(d.deployedVersionId);
              return (
                <tr
                  key={d.id}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-3 py-2.5 font-medium text-gray-900">
                    {d.deploymentName}
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">
                    {SURFACE_LABELS[d.surface]}
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">
                    {version?.versionName ?? d.deployedVersionId}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-[12px] font-medium ${
                        d.deploymentStatus === "success"
                          ? "bg-emerald-50 text-emerald-800"
                          : d.deploymentStatus === "rolled_back"
                            ? "bg-amber-50 text-amber-800"
                            : "bg-gray-200 text-gray-600"
                      }`}
                    >
                      {STATUS_LABELS[d.deploymentStatus]}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-gray-500">
                    {new Date(d.deployedAt).toLocaleString("ko-KR")}
                  </td>
                  <td className="px-3 py-2.5 text-[13px] text-gray-600">
                    {d.createdByAdminNickname}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
