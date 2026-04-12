"use client";

import type { MemberBenefitLog } from "@/lib/types/member-benefit";
import {
  MEMBER_TYPE_LABELS,
  MEMBER_BENEFIT_LOG_ACTION_LABELS,
} from "@/lib/member-benefits/member-benefit-utils";

interface AdminMemberBenefitLogListProps {
  logs: MemberBenefitLog[];
}

export function AdminMemberBenefitLogList({
  logs,
}: AdminMemberBenefitLogListProps) {
  if (logs.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-[14px] text-sam-muted">
        혜택 적용 로그가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[560px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              사용자
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              구분
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              액션
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              비고
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              일시
            </th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr
              key={l.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5 text-sam-fg">
                {l.userNickname} ({l.userId})
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {MEMBER_TYPE_LABELS[l.memberType]}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {MEMBER_BENEFIT_LOG_ACTION_LABELS[l.actionType]}
              </td>
              <td className="max-w-[200px] truncate px-3 py-2.5 text-sam-muted">
                {l.note}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-sam-muted">
                {new Date(l.createdAt).toLocaleString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
