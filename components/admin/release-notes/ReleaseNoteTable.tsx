"use client";

import { useMemo, useState } from "react";
import { getReleaseNotes } from "@/lib/dev-sprints/mock-release-notes";
import { AdminTable } from "@/components/admin/AdminTable";
import { getReleaseNoteStatusLabel } from "@/lib/dev-sprints/dev-sprint-utils";
import type { ReleaseNoteStatus } from "@/lib/types/dev-sprints";
import Link from "next/link";

export function ReleaseNoteTable() {
  const [statusFilter, setStatusFilter] = useState<ReleaseNoteStatus | "">("");
  const notes = useMemo(
    () =>
      getReleaseNotes(statusFilter ? { status: statusFilter } : undefined),
    [statusFilter]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-sam-muted">상태</span>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter((e.target.value || "") as ReleaseNoteStatus | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 text-[13px] text-sam-fg"
        >
          <option value="">전체</option>
          <option value="draft">초안</option>
          <option value="published">배포됨</option>
          <option value="archived">보관</option>
        </select>
      </div>

      {notes.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center text-[14px] text-sam-muted">
          릴리즈 노트가 없습니다.
        </div>
      ) : (
        <AdminTable
          headers={[
            "버전",
            "빌드",
            "제목",
            "상태",
            "릴리즈일",
            "작성자",
            "",
          ]}
        >
          {notes.map((n) => (
            <tr key={n.id} className="border-b border-sam-border-soft">
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {n.releaseVersion}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-sam-muted">
                {n.buildTag}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-sam-fg">
                {n.title}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 text-[12px] ${
                    n.status === "published"
                      ? "bg-emerald-50 text-emerald-700"
                      : n.status === "draft"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-sam-surface-muted text-sam-muted"
                  }`}
                >
                  {getReleaseNoteStatusLabel(n.status)}
                </span>
              </td>
              <td className="px-3 py-2.5 text-[13px] text-sam-muted">
                {n.releaseDate ?? "-"}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-sam-muted">
                {n.createdByAdminNickname}
              </td>
              <td className="px-3 py-2.5">
                <Link
                  href={`/admin/release-notes/${n.id}`}
                  className="text-signature hover:underline"
                >
                  상세
                </Link>
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
