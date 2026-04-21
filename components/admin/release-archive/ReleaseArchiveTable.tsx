"use client";

import { useMemo, useState } from "react";
import { getReleaseArchives } from "@/lib/release-archive/mock-release-archives";
import { AdminTable } from "@/components/admin/AdminTable";
import { getReleaseStatusLabel } from "@/lib/release-archive/release-archive-utils";
import type { ReleaseArchiveStatus } from "@/lib/types/release-archive";
import Link from "next/link";

export function ReleaseArchiveTable() {
  const [statusFilter, setStatusFilter] = useState<ReleaseArchiveStatus | "">("");
  const archives = useMemo(
    () =>
      getReleaseArchives(
        statusFilter ? { releaseStatus: statusFilter } : undefined
      ),
    [statusFilter]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="sam-text-body-secondary text-sam-muted">버전 상태</span>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter((e.target.value || "") as ReleaseArchiveStatus | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">전체</option>
          <option value="active">활성</option>
          <option value="stable">안정</option>
          <option value="deprecated">폐예정</option>
          <option value="rolled_back">롤백</option>
          <option value="hotfix">핫픽스</option>
        </select>
      </div>

      {archives.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">
          해당 조건의 릴리즈 아카이브가 없습니다.
        </div>
      ) : (
        <AdminTable
          headers={[
            "버전",
            "빌드",
            "제목",
            "상태",
            "릴리즈일",
            "요약",
            "",
          ]}
        >
          {archives.map((a) => (
            <tr
              key={a.id}
              className={`border-b border-sam-border-soft ${
                a.releaseStatus === "rolled_back" ? "bg-red-50/30" : ""
              }`}
            >
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {a.releaseVersion}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {a.buildTag}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {a.releaseTitle}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 sam-text-helper ${
                    a.releaseStatus === "rolled_back"
                      ? "bg-red-100 text-red-800"
                      : a.releaseStatus === "active"
                        ? "bg-blue-50 text-blue-700"
                        : a.releaseStatus === "stable"
                          ? "bg-emerald-50 text-emerald-700"
                          : a.releaseStatus === "hotfix"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-sam-surface-muted text-sam-muted"
                  }`}
                >
                  {getReleaseStatusLabel(a.releaseStatus)}
                </span>
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {a.releaseDate}
              </td>
              <td className="max-w-[200px] px-3 py-2.5 sam-text-body-secondary text-sam-muted line-clamp-2">
                {a.summary}
              </td>
              <td className="px-3 py-2.5">
                <Link
                  href={`/admin/release-archive/${a.id}`}
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
