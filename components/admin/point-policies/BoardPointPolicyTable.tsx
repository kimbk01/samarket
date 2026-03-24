"use client";

import type { BoardPointPolicy } from "@/lib/types/point-policy";
import { REWARD_TYPE_LABELS } from "@/lib/point-policies/point-policy-utils";

interface BoardPointPolicyTableProps {
  policies: BoardPointPolicy[];
  onEdit?: (policy: BoardPointPolicy) => void;
  onToggleActive?: (id: string, isActive: boolean) => void;
}

export function BoardPointPolicyTable({
  policies,
  onEdit,
  onToggleActive,
}: BoardPointPolicyTableProps) {
  if (policies.length === 0) {
    return (
      <p className="text-[14px] text-gray-500">
        등록된 게시판 포인트 정책이 없습니다.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[640px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              게시판
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              글쓰기
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              댓글
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              쿨다운
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              무상한도
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
              <td className="px-3 py-2.5">
                <span className="font-medium text-gray-900">{p.boardName}</span>
                <span className="ml-1 text-[12px] text-gray-500">
                  ({p.boardKey})
                </span>
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {REWARD_TYPE_LABELS[p.writeRewardType]}
                {p.writeRewardType === "fixed"
                  ? ` ${p.writeFixedPoint}P`
                  : ` ${p.writeRandomMin}~${p.writeRandomMax}P`}
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {REWARD_TYPE_LABELS[p.commentRewardType]}
                {p.commentRewardType === "fixed"
                  ? ` ${p.commentFixedPoint}P`
                  : ` ${p.commentRandomMin}~${p.commentRandomMax}P`}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-600">
                글 {p.writeCooldownSeconds}초 / 댓글 {p.commentCooldownSeconds}초
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {p.maxFreeUserPointCap}P
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-[12px] font-medium ${
                    p.isActive ? "bg-emerald-50 text-emerald-800" : "bg-gray-200 text-gray-600"
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
