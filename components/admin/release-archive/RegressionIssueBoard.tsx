"use client";

import { useMemo, useState } from "react";
import { getReleaseRegressionIssues } from "@/lib/release-archive/mock-release-regression-issues";
import { getReleaseArchives } from "@/lib/release-archive/mock-release-archives";
import { RegressionIssueCard } from "./RegressionIssueCard";
import { getRegressionStatusLabel } from "@/lib/release-archive/release-archive-utils";
import type {
  RegressionIssueStatus,
  RegressionCategory,
} from "@/lib/types/release-archive";

const STATUS_COLUMNS: RegressionIssueStatus[] = [
  "detected",
  "investigating",
  "confirmed",
  "fixed",
  "verified",
  "archived",
];

export function RegressionIssueBoard() {
  const [releaseFilter, setReleaseFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<RegressionCategory | "">("");
  const [statusFilter, setStatusFilter] = useState<RegressionIssueStatus | "">("");

  const archives = useMemo(() => getReleaseArchives(), []);
  const issues = useMemo(
    () =>
      getReleaseRegressionIssues({
        ...(releaseFilter ? { releaseArchiveId: releaseFilter } : {}),
        ...(categoryFilter ? { regressionCategory: categoryFilter } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
      }),
    [releaseFilter, categoryFilter, statusFilter]
  );

  const byStatus = useMemo(() => {
    const map: Record<RegressionIssueStatus, typeof issues> = {
      detected: [],
      investigating: [],
      confirmed: [],
      fixed: [],
      verified: [],
      archived: [],
    };
    issues.forEach((i) => map[i.status].push(i));
    return map;
  }, [issues]);

  const repeatingCategory = useMemo(() => {
    const count: Record<string, number> = {};
    issues.forEach((i) => {
      count[i.regressionCategory] = (count[i.regressionCategory] ?? 0) + 1;
    });
    return new Set(
      Object.entries(count)
        .filter(([, n]) => n >= 2)
        .map(([c]) => c)
    );
  }, [issues]);

  const columnsToShow = statusFilter ? [statusFilter] : STATUS_COLUMNS;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="sam-text-body-secondary text-sam-muted">릴리즈</span>
        <select
          value={releaseFilter}
          onChange={(e) => setReleaseFilter(e.target.value)}
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">전체</option>
          {archives.map((a) => (
            <option key={a.id} value={a.id}>
              {a.releaseVersion}
            </option>
          ))}
        </select>
        <span className="sam-text-body-secondary text-sam-muted">카테고리</span>
        <select
          value={categoryFilter}
          onChange={(e) =>
            setCategoryFilter((e.target.value || "") as RegressionCategory | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">전체</option>
          <option value="auth">인증</option>
          <option value="product">상품</option>
          <option value="feed">피드</option>
          <option value="chat">채팅</option>
          <option value="moderation">신고/제재</option>
          <option value="points">포인트</option>
          <option value="ads">광고</option>
          <option value="admin">관리자</option>
          <option value="ops">운영</option>
        </select>
        <span className="sam-text-body-secondary text-sam-muted">상태</span>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter((e.target.value || "") as RegressionIssueStatus | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">전체 칸반</option>
          <option value="detected">감지됨</option>
          <option value="investigating">조사중</option>
          <option value="confirmed">확인됨</option>
          <option value="fixed">수정됨</option>
          <option value="verified">검증됨</option>
          <option value="archived">보관</option>
        </select>
      </div>

      {issues.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">
          해당 조건의 회귀 이슈가 없습니다.
        </div>
      ) : (
        <div className="grid gap-4 overflow-x-auto sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {columnsToShow.map((status) => (
            <div
              key={status}
              className="min-w-[200px] rounded-ui-rect border border-sam-border bg-sam-app/50 p-3"
            >
              <h3 className="mb-2 sam-text-body-secondary font-medium text-sam-fg">
                {getRegressionStatusLabel(status)}
                <span className="ml-1 text-sam-muted">
                  ({(byStatus[status] ?? []).length})
                </span>
              </h3>
              <div className="space-y-2">
                {(byStatus[status] ?? []).map((issue) => (
                  <RegressionIssueCard
                    key={issue.id}
                    issue={issue}
                    isRepeatingPattern={repeatingCategory.has(issue.regressionCategory)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
