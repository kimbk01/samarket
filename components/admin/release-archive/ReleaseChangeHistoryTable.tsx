"use client";

import { useMemo, useState } from "react";
import { getAllReleaseArchiveItems } from "@/lib/release-archive/mock-release-archive-items";
import { getReleaseArchives, getReleaseArchiveById } from "@/lib/release-archive/mock-release-archives";
import { AdminTable } from "@/components/admin/AdminTable";
import { getChangeTypeLabel } from "@/lib/release-archive/release-archive-utils";
import type {
  ReleaseArchiveChangeType,
} from "@/lib/types/release-archive";
import Link from "next/link";

export function ReleaseChangeHistoryTable() {
  const [versionFilter, setVersionFilter] = useState<string>("");
  const [changeTypeFilter, setChangeTypeFilter] = useState<ReleaseArchiveChangeType | "">("");

  const archives = useMemo(() => getReleaseArchives(), []);
  const items = useMemo(
    () =>
      getAllReleaseArchiveItems({
        ...(versionFilter ? { releaseArchiveId: versionFilter } : {}),
        ...(changeTypeFilter ? { changeType: changeTypeFilter } : {}),
      }),
    [versionFilter, changeTypeFilter]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-sam-muted">릴리즈</span>
        <select
          value={versionFilter}
          onChange={(e) => setVersionFilter(e.target.value)}
          className="rounded border border-sam-border px-3 py-1.5 text-[13px] text-sam-fg"
        >
          <option value="">전체</option>
          {archives.map((a) => (
            <option key={a.id} value={a.id}>
              {a.releaseVersion} - {a.releaseTitle}
            </option>
          ))}
        </select>
        <span className="text-[13px] text-sam-muted">변경 유형</span>
        <select
          value={changeTypeFilter}
          onChange={(e) =>
            setChangeTypeFilter((e.target.value || "") as ReleaseArchiveChangeType | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 text-[13px] text-sam-fg"
        >
          <option value="">전체</option>
          <option value="feature">기능</option>
          <option value="improvement">개선</option>
          <option value="bugfix">버그수정</option>
          <option value="hotfix">핫픽스</option>
          <option value="ops_change">운영변경</option>
          <option value="config_change">설정변경</option>
        </select>
      </div>

      {items.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center text-[14px] text-sam-muted">
          해당 조건의 변경 이력이 없습니다.
        </div>
      ) : (
        <AdminTable
          headers={["릴리즈", "유형", "제목", "설명", "연결"]}
        >
          {items.map((i) => {
            const archive = getReleaseArchiveById(i.releaseArchiveId);
            return (
              <tr key={i.id} className="border-b border-sam-border-soft">
                <td className="px-3 py-2.5 font-medium text-sam-fg">
                  {archive?.releaseVersion ?? i.releaseArchiveId}
                </td>
                <td className="px-3 py-2.5">
                  <span className="rounded bg-sam-surface-muted px-1.5 py-0.5 text-[12px] text-sam-fg">
                    {getChangeTypeLabel(i.changeType)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-[13px] text-sam-fg">
                  {i.title}
                </td>
                <td className="max-w-[200px] px-3 py-2.5 text-[13px] text-sam-muted line-clamp-2">
                  {i.description}
                </td>
                <td className="px-3 py-2.5 text-[13px]">
                  {i.linkedQaIssueId && (
                    <Link href="/admin/qa-board" className="text-signature hover:underline">
                      QA
                    </Link>
                  )}
                  {i.linkedBacklogItemId && (
                    <>
                      {" "}
                      <Link href="/admin/product-backlog" className="text-signature hover:underline">
                        백로그
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
                  {!i.linkedQaIssueId && !i.linkedBacklogItemId && !i.linkedDeploymentId && "-"}
                </td>
              </tr>
            );
          })}
        </AdminTable>
      )}
    </div>
  );
}
