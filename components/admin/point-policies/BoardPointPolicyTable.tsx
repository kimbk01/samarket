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
      <p className="sam-text-body text-sam-muted">
        등록된 게시판 포인트 정책이 없습니다.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              게시판
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              글쓰기
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              댓글
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              쿨다운
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              무상한도
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              상태
            </th>
            {(onEdit || onToggleActive) && (
              <th className="px-3 py-2.5 text-right font-medium text-sam-fg">
                작업
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {policies.map((p) => (
            <tr
              key={p.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5">
                <span className="font-medium text-sam-fg">{p.boardName}</span>
                <span className="ml-1 sam-text-helper text-sam-muted">
                  ({p.boardKey})
                </span>
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {REWARD_TYPE_LABELS[p.writeRewardType]}
                {p.writeRewardType === "fixed"
                  ? ` ${p.writeFixedPoint}P`
                  : ` ${p.writeRandomMin}~${p.writeRandomMax}P`}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {REWARD_TYPE_LABELS[p.commentRewardType]}
                {p.commentRewardType === "fixed"
                  ? ` ${p.commentFixedPoint}P`
                  : ` ${p.commentRandomMin}~${p.commentRandomMax}P`}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                글 {p.writeCooldownSeconds}초 / 댓글 {p.commentCooldownSeconds}초
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {p.maxFreeUserPointCap}P
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${
                    p.isActive ? "bg-emerald-50 text-emerald-800" : "bg-sam-border-soft text-sam-muted"
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
                      className="mr-1 sam-text-body-secondary text-signature hover:underline"
                    >
                      편집
                    </button>
                  )}
                  {onToggleActive && (
                    <button
                      type="button"
                      onClick={() => onToggleActive(p.id, !p.isActive)}
                      className="sam-text-body-secondary text-sam-muted hover:underline"
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
