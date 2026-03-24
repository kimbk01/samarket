"use client";

import { useMemo } from "react";
import { getReleaseNoteById } from "@/lib/dev-sprints/mock-release-notes";
import { getReleaseNoteItems } from "@/lib/dev-sprints/mock-release-note-items";
import { getReleaseNoteStatusLabel } from "@/lib/dev-sprints/dev-sprint-utils";
import { getReleaseNoteItemTypeLabel } from "@/lib/dev-sprints/dev-sprint-utils";
import Link from "next/link";

interface ReleaseNoteDetailCardProps {
  releaseNoteId: string;
}

export function ReleaseNoteDetailCard({ releaseNoteId }: ReleaseNoteDetailCardProps) {
  const note = useMemo(
    () => getReleaseNoteById(releaseNoteId),
    [releaseNoteId]
  );
  const items = useMemo(
    () => getReleaseNoteItems(releaseNoteId),
    [releaseNoteId]
  );

  if (!note) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 py-12 text-center text-[14px] text-gray-500">
        릴리즈 노트를 찾을 수 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-gray-500">
          <span>{note.releaseVersion}</span>
          <span>{note.buildTag}</span>
          <span
            className={`rounded px-1.5 py-0.5 ${
              note.status === "published"
                ? "bg-emerald-50 text-emerald-700"
                : note.status === "draft"
                  ? "bg-amber-50 text-amber-700"
                  : "bg-gray-100 text-gray-600"
            }`}
          >
            {getReleaseNoteStatusLabel(note.status)}
          </span>
        </div>
        <h2 className="mt-2 text-[18px] font-semibold text-gray-900">
          {note.title}
        </h2>
        <p className="mt-2 text-[14px] text-gray-700">{note.summary}</p>
        <p className="mt-2 text-[12px] text-gray-500">
          릴리즈일 {note.releaseDate ?? "-"} · {note.createdByAdminNickname}
        </p>
        {note.includedSprintId && (
          <p className="mt-1 text-[12px] text-gray-500">
            스프린트: {note.includedSprintId}
            <Link href="/admin/dev-sprints" className="ml-1 text-signature hover:underline">
              스프린트 보드
            </Link>
          </p>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
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
                  {getReleaseNoteItemTypeLabel(i.itemType)}
                </span>
                <span className="font-medium text-gray-900">{i.title}</span>
                <span className="text-[13px] text-gray-600">{i.description}</span>
                <span className="flex gap-1 text-[12px]">
                  {i.linkedBacklogItemId && (
                    <Link href="/admin/product-backlog" className="text-signature hover:underline">
                      백로그
                    </Link>
                  )}
                  {i.linkedQaIssueId && (
                    <Link href="/admin/qa-board" className="text-signature hover:underline">
                      QA
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
