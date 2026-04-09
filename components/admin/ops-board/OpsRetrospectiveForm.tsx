"use client";

import { useState } from "react";
import { addOpsRetrospective } from "@/lib/ops-board/mock-ops-retrospectives";
import type { OpsSurface } from "@/lib/types/ops-board";

const SURFACE_OPTIONS: { value: OpsSurface; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "home", label: "홈" },
  { value: "search", label: "검색" },
  { value: "shop", label: "상점" },
];

export function OpsRetrospectiveForm({
  onSaved,
}: {
  onSaved?: () => void;
}) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [wins, setWins] = useState("");
  const [issues, setIssues] = useState("");
  const [learnings, setLearnings] = useState("");
  const [nextActions, setNextActions] = useState("");
  const [relatedSurface, setRelatedSurface] = useState<OpsSurface>("all");
  const [relatedReportId, setRelatedReportId] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const date = new Date().toISOString().slice(0, 10);
    addOpsRetrospective({
      retrospectiveDate: date,
      title: title || "운영 회고",
      summary,
      wins,
      issues,
      learnings,
      nextActions,
      relatedSurface,
      relatedReportId: relatedReportId.trim() || null,
      createdAt: new Date().toISOString(),
      createdByAdminId: "admin1",
      createdByAdminNickname: "관리자",
    });
    setTitle("");
    setSummary("");
    setWins("");
    setIssues("");
    setLearnings("");
    setNextActions("");
    setRelatedReportId("");
    onSaved?.();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-ui-rect border border-gray-200 bg-white p-4">
      <h3 className="text-[14px] font-medium text-gray-900">새 운영 회고</h3>
      <div>
        <label className="mb-1 block text-[12px] text-gray-500">제목</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="회고 제목"
          className="w-full rounded border border-gray-200 px-3 py-2 text-[14px]"
        />
      </div>
      <div>
        <label className="mb-1 block text-[12px] text-gray-500">요약</label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={2}
          className="w-full rounded border border-gray-200 px-3 py-2 text-[14px]"
        />
      </div>
      <div>
        <label className="mb-1 block text-[12px] text-gray-500">잘된 점</label>
        <textarea
          value={wins}
          onChange={(e) => setWins(e.target.value)}
          rows={2}
          className="w-full rounded border border-gray-200 px-3 py-2 text-[14px]"
        />
      </div>
      <div>
        <label className="mb-1 block text-[12px] text-gray-500">이슈</label>
        <textarea
          value={issues}
          onChange={(e) => setIssues(e.target.value)}
          rows={2}
          className="w-full rounded border border-gray-200 px-3 py-2 text-[14px]"
        />
      </div>
      <div>
        <label className="mb-1 block text-[12px] text-gray-500">다음 액션 (액션아이템 생성 placeholder)</label>
        <textarea
          value={nextActions}
          onChange={(e) => setNextActions(e.target.value)}
          rows={2}
          className="w-full rounded border border-gray-200 px-3 py-2 text-[14px]"
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="mb-1 block text-[12px] text-gray-500">관련 surface</label>
          <select
            value={relatedSurface}
            onChange={(e) => setRelatedSurface(e.target.value as OpsSurface)}
            className="rounded border border-gray-200 px-3 py-2 text-[14px]"
          >
            {SURFACE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[12px] text-gray-500">관련 보고서 ID</label>
          <input
            type="text"
            value={relatedReportId}
            onChange={(e) => setRelatedReportId(e.target.value)}
            placeholder="rr-1"
            className="w-24 rounded border border-gray-200 px-3 py-2 text-[14px]"
          />
        </div>
      </div>
      <button
        type="submit"
        className="rounded border border-signature bg-signature px-4 py-2 text-[14px] font-medium text-white"
      >
        회고 저장
      </button>
    </form>
  );
}
