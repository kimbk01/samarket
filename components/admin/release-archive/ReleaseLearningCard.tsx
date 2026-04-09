"use client";

import { useMemo, useState } from "react";
import { getReleaseLearningNotes } from "@/lib/release-archive/mock-release-learning-notes";
import { getReleaseArchives, getReleaseArchiveById } from "@/lib/release-archive/mock-release-archives";

interface ReleaseLearningCardProps {
  releaseArchiveId?: string;
}

export function ReleaseLearningCard({ releaseArchiveId }: ReleaseLearningCardProps) {
  const [versionFilter, setVersionFilter] = useState<string>(releaseArchiveId ?? "");

  const archives = useMemo(() => getReleaseArchives(), []);
  const notes = useMemo(
    () =>
      getReleaseLearningNotes(
        versionFilter ? { releaseArchiveId: versionFilter } : undefined
      ),
    [versionFilter]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-gray-600">릴리즈</span>
        <select
          value={versionFilter}
          onChange={(e) => setVersionFilter(e.target.value)}
          className="rounded border border-gray-200 px-3 py-1.5 text-[13px] text-gray-700"
        >
          <option value="">전체</option>
          {archives.map((a) => (
            <option key={a.id} value={a.id}>
              {a.releaseVersion} - {a.releaseTitle}
            </option>
          ))}
        </select>
      </div>

      {notes.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-gray-300 bg-gray-50/50 py-12 text-center text-[14px] text-gray-500">
          해당 릴리즈의 학습 메모가 없습니다.
        </div>
      ) : (
        <div className="space-y-4">
          {notes.map((n) => {
            const archive = getReleaseArchiveById(n.releaseArchiveId);
            return (
              <div
                key={n.id}
                className="rounded-ui-rect border border-gray-200 bg-white p-4"
              >
                <div className="text-[12px] text-gray-500">
                  {archive?.releaseVersion ?? n.releaseArchiveId} ·{" "}
                  {n.createdByAdminNickname} ·{" "}
                  {new Date(n.createdAt).toLocaleString()}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[13px] font-medium text-gray-800">
                      잘 된 점
                    </p>
                    <p className="mt-1 text-[13px] text-gray-600">
                      {n.whatWentWell}
                    </p>
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-gray-800">
                      깨진 점
                    </p>
                    <p className="mt-1 text-[13px] text-gray-600">
                      {n.whatBroke}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-[13px] font-medium text-gray-800">
                  회귀 요약
                </p>
                <p className="mt-1 text-[13px] text-gray-600">
                  {n.regressionSummary}
                </p>
                <p className="mt-3 text-[13px] font-medium text-gray-800">
                  완화 조치
                </p>
                <p className="mt-1 text-[13px] text-gray-600">
                  {n.mitigationSummary}
                </p>
                <p className="mt-3 text-[13px] font-medium text-gray-800">
                  다음 릴리즈 체크리스트
                </p>
                <p className="mt-1 text-[13px] text-gray-600">
                  {n.nextReleaseChecklist}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
