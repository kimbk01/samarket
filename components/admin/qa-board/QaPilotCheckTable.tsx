"use client";

import { useMemo, useState } from "react";
import { getQaPilotChecks } from "@/lib/qa-board/mock-qa-pilot-checks";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  getPilotCategoryLabel,
  getPilotStatusLabel,
} from "@/lib/qa-board/qa-board-utils";
import type {
  QaPilotCategory,
  QaPilotCheckStatus,
} from "@/lib/types/qa-board";

export function QaPilotCheckTable() {
  const [category, setCategory] = useState<QaPilotCategory | "">("");
  const checks = useMemo(
    () =>
      getQaPilotChecks(
        category ? { category: category as QaPilotCategory } : undefined
      ),
    [category]
  );

  const categories = [
    { value: "" as const, label: "전체" },
    { value: "onboarding" as const, label: "온보딩" },
    { value: "browsing" as const, label: "둘러보기" },
    { value: "posting" as const, label: "등록" },
    { value: "chat" as const, label: "채팅" },
    { value: "reporting" as const, label: "신고" },
    { value: "points" as const, label: "포인트" },
    { value: "admin_response" as const, label: "관리자 응답" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="sam-text-body-secondary text-sam-muted">분류</span>
        <select
          value={category}
          onChange={(e) =>
            setCategory((e.target.value || "") as QaPilotCategory | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          {categories.map((c) => (
            <option key={c.value || "all"} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <p className="sam-text-helper text-sam-muted">
        파일럿 사용자 피드백 목록은 별도 placeholder로 확장 가능합니다.
      </p>

      {checks.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">
          파일럿 체크 항목이 없습니다.
        </div>
      ) : (
        <AdminTable
          headers={["제목", "분류", "상태", "담당", "비고"]}
        >
          {checks.map((c) => (
            <tr
              key={c.id}
              className={`border-b border-sam-border-soft ${
                c.status === "blocked" ? "bg-red-50/30" : ""
              }`}
            >
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {c.title}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {getPilotCategoryLabel(c.category)}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 sam-text-helper ${
                    c.status === "done"
                      ? "bg-emerald-100 text-emerald-800"
                      : c.status === "blocked"
                        ? "bg-red-100 text-red-800"
                        : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {getPilotStatusLabel(c.status)}
                </span>
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {c.assignedAdminNickname ?? "-"}
              </td>
              <td className="max-w-[200px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {c.note || "-"}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
