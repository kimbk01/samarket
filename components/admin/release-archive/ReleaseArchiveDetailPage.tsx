"use client";

import { useMemo } from "react";
import { getReleaseArchiveById } from "@/lib/release-archive/mock-release-archives";
import { getReleaseArchiveItems } from "@/lib/release-archive/mock-release-archive-items";
import { getReleaseRegressionIssues } from "@/lib/release-archive/mock-release-regression-issues";
import { getReleaseLearningNotes } from "@/lib/release-archive/mock-release-learning-notes";
import { getReleaseStatusLabel } from "@/lib/release-archive/release-archive-utils";
import { getChangeTypeLabel } from "@/lib/release-archive/release-archive-utils";
import { RegressionIssueCard } from "./RegressionIssueCard";
import Link from "next/link";

interface ReleaseArchiveDetailPageProps {
  releaseArchiveId: string;
}

export function ReleaseArchiveDetailPage({
  releaseArchiveId,
}: ReleaseArchiveDetailPageProps) {
  const archive = useMemo(
    () => getReleaseArchiveById(releaseArchiveId),
    [releaseArchiveId]
  );
  const items = useMemo(
    () => getReleaseArchiveItems(releaseArchiveId),
    [releaseArchiveId]
  );
  const issues = useMemo(
    () => getReleaseRegressionIssues({ releaseArchiveId }),
    [releaseArchiveId]
  );
  const learningNotes = useMemo(
    () => getReleaseLearningNotes({ releaseArchiveId }),
    [releaseArchiveId]
  );

  const repeatingCategories = useMemo(() => {
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

  if (!archive) {
    return (
      <div className="rounded-ui-rect border border-dashed border-gray-300 bg-gray-50/50 py-12 text-center text-[14px] text-gray-500">
        릴리즈 아카이브를 찾을 수 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-gray-500">
          <span>{archive.releaseVersion}</span>
          <span>{archive.buildTag}</span>
          <span
            className={`rounded px-1.5 py-0.5 ${
              archive.releaseStatus === "rolled_back"
                ? "bg-red-100 text-red-800"
                : archive.releaseStatus === "active"
                  ? "bg-blue-50 text-blue-700"
                  : archive.releaseStatus === "stable"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-gray-100 text-gray-600"
            }`}
          >
            {getReleaseStatusLabel(archive.releaseStatus)}
          </span>
        </div>
        <h2 className="mt-2 text-[18px] font-semibold text-gray-900">
          {archive.releaseTitle}
        </h2>
        <p className="mt-2 text-[14px] text-gray-700">{archive.summary}</p>
        <p className="mt-2 text-[12px] text-gray-500">
          릴리즈일 {archive.releaseDate}
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
          {archive.linkedReleaseNoteId && (
            <Link href="/admin/release-notes" className="text-signature hover:underline">
              릴리즈 노트
            </Link>
          )}
          {archive.linkedSprintId && (
            <Link href="/admin/dev-sprints" className="text-signature hover:underline">
              스프린트
            </Link>
          )}
        </div>
      </div>

      <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
        <h3 className="text-[15px] font-medium text-gray-900">변경 항목</h3>
        {items.length === 0 ? (
          <p className="mt-2 text-[13px] text-gray-500">항목 없음</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {items.map((i) => (
              <li
                key={i.id}
                className="flex flex-wrap items-start gap-2 border-b border-gray-100 pb-2 last:border-0 last:pb-0"
              >
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[12px] text-gray-600">
                  {getChangeTypeLabel(i.changeType)}
                </span>
                <span className="font-medium text-gray-900">{i.title}</span>
                <span className="text-[13px] text-gray-600">{i.description}</span>
                <span className="flex gap-1 text-[12px]">
                  {i.linkedQaIssueId && (
                    <Link href="/admin/qa-board" className="text-signature hover:underline">
                      QA
                    </Link>
                  )}
                  {i.linkedBacklogItemId && (
                    <Link href="/admin/product-backlog" className="text-signature hover:underline">
                      백로그
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
        <h3 className="text-[15px] font-medium text-gray-900">
          회귀 이슈 (detected → fix → verify 흐름)
        </h3>
        {issues.length === 0 ? (
          <p className="mt-2 text-[13px] text-gray-500">회귀 이슈 없음</p>
        ) : (
          <div className="mt-2 space-y-2">
            {issues.map((issue) => (
              <RegressionIssueCard
                key={issue.id}
                issue={issue}
                isRepeatingPattern={repeatingCategories.has(issue.regressionCategory)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
        <h3 className="text-[15px] font-medium text-gray-900">릴리즈 학습 메모</h3>
        {learningNotes.length === 0 ? (
          <p className="mt-2 text-[13px] text-gray-500">학습 메모 없음</p>
        ) : (
          <div className="mt-2 space-y-4">
            {learningNotes.map((n) => (
              <div key={n.id} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                <p className="text-[12px] text-gray-500">
                  {n.createdByAdminNickname} ·{" "}
                  {new Date(n.createdAt).toLocaleString()}
                </p>
                <p className="mt-2 text-[13px] font-medium text-gray-800">잘 된 점</p>
                <p className="mt-1 text-[13px] text-gray-600">{n.whatWentWell}</p>
                <p className="mt-2 text-[13px] font-medium text-gray-800">깨진 점</p>
                <p className="mt-1 text-[13px] text-gray-600">{n.whatBroke}</p>
                <p className="mt-2 text-[13px] font-medium text-gray-800">회귀 요약</p>
                <p className="mt-1 text-[13px] text-gray-600">{n.regressionSummary}</p>
                <p className="mt-2 text-[13px] font-medium text-gray-800">다음 체크리스트</p>
                <p className="mt-1 text-[13px] text-gray-600">{n.nextReleaseChecklist}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
