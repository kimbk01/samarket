"use client";

import type { PointEventPolicy } from "@/lib/types/point-policy";

interface PointEventPolicyTableProps {
  policies: PointEventPolicy[];
  onEdit?: (policy: PointEventPolicy) => void;
  onToggleActive?: (id: string, isActive: boolean) => void;
}

export function PointEventPolicyTable({
  policies,
  onEdit,
  onToggleActive,
}: PointEventPolicyTableProps) {
  if (policies.length === 0) {
    return (
      <p className="text-[14px] text-gray-500">
        등록된 이벤트 포인트 정책이 없습니다.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[560px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              제목
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              기간
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              글/댓글 배율
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              대상 게시판
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              상태
            </th>
            {(onEdit || onToggleActive) && (
              <th className="px-3 py-2.5 text-right font-medium text-gray-700">
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
              <td className="px-3 py-2.5 font-medium text-gray-900">
                {p.title}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-gray-600">
                {new Date(p.startAt).toLocaleDateString("ko-KR")} ~{" "}
                {new Date(p.endAt).toLocaleDateString("ko-KR")}
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {p.writeMultiplier}x / {p.commentMultiplier}x
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-600">
                {p.targetBoards.join(", ") || "-"}
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
              {(onEdit || onToggleActive) && (
                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                  {onEdit && (
                    <button
                      type="button"
                      onClick={() => onEdit(p)}
                      className="mr-1 text-[13px] text-signature hover:underline"
                    >
                      편집
                    </button>
                  )}
                  {onToggleActive && (
                    <button
                      type="button"
                      onClick={() => onToggleActive(p.id, !p.isActive)}
                      className="text-[13px] text-gray-600 hover:underline"
                    >
                      {p.isActive ? "비활성" : "활성"}
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
