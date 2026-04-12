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
      <p className="text-[14px] text-sam-muted">
        등록된 이벤트 포인트 정책이 없습니다.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[560px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              제목
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              기간
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              글/댓글 배율
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              대상 게시판
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
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {p.title}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-sam-muted">
                {new Date(p.startAt).toLocaleDateString("ko-KR")} ~{" "}
                {new Date(p.endAt).toLocaleDateString("ko-KR")}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {p.writeMultiplier}x / {p.commentMultiplier}x
              </td>
              <td className="px-3 py-2.5 text-[13px] text-sam-muted">
                {p.targetBoards.join(", ") || "-"}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-[12px] font-medium ${
                    p.isActive
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-sam-border-soft text-sam-muted"
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
                      className="text-[13px] text-sam-muted hover:underline"
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
