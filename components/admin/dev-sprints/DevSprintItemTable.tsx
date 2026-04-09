"use client";

import { useMemo, useState } from "react";
import { getDevSprintItems } from "@/lib/dev-sprints/mock-dev-sprint-items";
import { getDevSprints, getDevSprintById } from "@/lib/dev-sprints/mock-dev-sprints";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  getSprintItemStatusLabel,
  getSprintItemPriorityLabel,
  getSprintItemOwnerTypeLabel,
} from "@/lib/dev-sprints/dev-sprint-utils";
import type { DevSprintItemStatus } from "@/lib/types/dev-sprints";
import Link from "next/link";

export function DevSprintItemTable() {
  const [sprintId, setSprintId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<DevSprintItemStatus | "">("");

  const sprints = useMemo(() => getDevSprints(), []);
  const items = useMemo(
    () =>
      getDevSprintItems({
        ...(sprintId ? { sprintId } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
      }),
    [sprintId, statusFilter]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-gray-600">스프린트</span>
        <select
          value={sprintId}
          onChange={(e) => setSprintId(e.target.value)}
          className="rounded border border-gray-200 px-3 py-1.5 text-[13px] text-gray-700"
        >
          <option value="">전체</option>
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.sprintName}
            </option>
          ))}
        </select>
        <span className="text-[13px] text-gray-600">상태</span>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter((e.target.value || "") as DevSprintItemStatus | "")
          }
          className="rounded border border-gray-200 px-3 py-1.5 text-[13px] text-gray-700"
        >
          <option value="">전체</option>
          <option value="todo">할 일</option>
          <option value="in_progress">진행중</option>
          <option value="review">리뷰</option>
          <option value="qa_ready">QA 대기</option>
          <option value="done">완료</option>
          <option value="blocked">블로킹</option>
        </select>
      </div>

      {items.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-gray-300 bg-gray-50/50 py-12 text-center text-[14px] text-gray-500">
          해당 조건의 스프린트 작업이 없습니다.
        </div>
      ) : (
        <AdminTable
          headers={[
            "제목",
            "스프린트",
            "상태",
            "우선순위",
            "담당",
            "블로커",
            "연결",
          ]}
        >
          {items.map((i) => {
            const sprint = getDevSprintById(i.sprintId);
            return (
              <tr
                key={i.id}
                className={`border-b border-gray-100 ${
                  i.status === "blocked" ? "bg-red-50/30" : ""
                }`}
              >
                <td className="px-3 py-2.5 font-medium text-gray-900">
                  {i.title}
                </td>
                <td className="px-3 py-2.5 text-[13px] text-gray-600">
                  {sprint?.sprintName ?? i.sprintId}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[12px] ${
                      i.status === "blocked"
                        ? "bg-red-100 text-red-800"
                        : i.status === "done"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {getSprintItemStatusLabel(i.status)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-[13px] text-gray-600">
                  {getSprintItemPriorityLabel(i.priority)}
                </td>
                <td className="px-3 py-2.5 text-[13px] text-gray-500">
                  {getSprintItemOwnerTypeLabel(i.ownerType)} {i.ownerName}
                </td>
                <td className="px-3 py-2.5 text-[13px] text-red-600">
                  {i.blockerReason ?? "-"}
                </td>
                <td className="px-3 py-2.5 text-[13px]">
                  {i.linkedQaIssueId && (
                    <Link href="/admin/qa-board" className="text-signature hover:underline">
                      QA
                    </Link>
                  )}
                  {i.linkedActionItemId && (
                    <>
                      {" "}
                      <Link href="/admin/ops-board" className="text-signature hover:underline">
                        액션
                      </Link>
                    </>
                  )}
                  {i.linkedDeploymentId && (
                    <>
                      {" "}
                      <Link href="/admin/recommendation-deployments" className="text-signature hover:underline">
                        배포
                      </Link>
                    </>
                  )}
                  {!i.linkedQaIssueId && !i.linkedActionItemId && !i.linkedDeploymentId && "-"}
                </td>
              </tr>
            );
          })}
        </AdminTable>
      )}
    </div>
  );
}
