"use client";

import Link from "next/link";
import type { ExposureScorePolicy } from "@/lib/types/exposure";
import { SURFACE_LABELS } from "@/lib/exposure/exposure-score-utils";

interface ExposurePolicyTableProps {
  policies: ExposureScorePolicy[];
  onEdit?: (policy: ExposureScorePolicy) => void;
}

export function ExposurePolicyTable({
  policies,
  onEdit,
}: ExposurePolicyTableProps) {
  if (policies.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
        등록된 노출 점수 정책이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[720px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              surface
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              정책명
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              가중치 요약
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              상태
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              수정일
            </th>
            {onEdit && (
              <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                작업
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {policies.map((p) => (
            <tr
              key={p.id}
              className="border-b border-gray-100 hover:bg-gray-50"
            >
              <td className="px-3 py-2.5 text-gray-700">
                {SURFACE_LABELS[p.surface]}
              </td>
              <td className="px-3 py-2.5">
                <span className="font-medium text-gray-900">{p.policyName}</span>
              </td>
              <td className="max-w-[280px] truncate px-3 py-2.5 text-[13px] text-gray-600">
                latest {p.latestWeight} / popular {p.popularWeight} / premium +{p.premiumBoostWeight} / ad +{p.adBoostWeight}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-[12px] font-medium ${
                    p.isActive
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {p.isActive ? "활성" : "비활성"}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-gray-500">
                {new Date(p.updatedAt).toLocaleString("ko-KR")}
              </td>
              {onEdit && (
                <td className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => onEdit(p)}
                    className="text-[13px] text-signature hover:underline"
                  >
                    편집
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
