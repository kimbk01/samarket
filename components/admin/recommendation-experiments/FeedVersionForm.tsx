"use client";

import { useState } from "react";
import type { FeedVersion, FeedVersionSurface } from "@/lib/types/recommendation-experiment";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";

interface FeedVersionFormProps {
  initial: FeedVersion;
  onSubmit: (values: Partial<FeedVersion>) => void;
  onCancel?: () => void;
}

const SURFACES: FeedVersionSurface[] = ["home", "search", "shop"];

export function FeedVersionForm({
  initial,
  onSubmit,
  onCancel,
}: FeedVersionFormProps) {
  const [versionName, setVersionName] = useState(initial.versionName);
  const [versionKey, setVersionKey] = useState(initial.versionKey);
  const [surface, setSurface] = useState(initial.surface);
  const [isActive, setIsActive] = useState(initial.isActive);
  const [dedupeStrategy, setDedupeStrategy] = useState(initial.dedupeStrategy);
  const [notes, setNotes] = useState(initial.notes);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      id: initial.id,
      versionKey,
      versionName,
      surface,
      isActive,
      sectionConfig: initial.sectionConfig,
      scoringOverrides: initial.scoringOverrides,
      dedupeStrategy,
      notes,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-[14px] font-medium text-gray-700">
          버전 키
        </label>
        <input
          type="text"
          value={versionKey}
          onChange={(e) => setVersionKey(e.target.value)}
          className="w-full rounded border border-gray-200 px-3 py-2 text-[14px]"
        />
      </div>
      <div>
        <label className="mb-1 block text-[14px] font-medium text-gray-700">
          버전명
        </label>
        <input
          type="text"
          value={versionName}
          onChange={(e) => setVersionName(e.target.value)}
          className="w-full rounded border border-gray-200 px-3 py-2 text-[14px]"
        />
      </div>
      <div>
        <label className="mb-1 block text-[14px] font-medium text-gray-700">
          surface
        </label>
        <select
          value={surface}
          onChange={(e) => setSurface(e.target.value as FeedVersionSurface)}
          className="w-full rounded border border-gray-200 px-3 py-2 text-[14px]"
        >
          {SURFACES.map((s) => (
            <option key={s} value={s}>
              {SURFACE_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="fvActive"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="rounded border-gray-300"
        />
        <label htmlFor="fvActive" className="text-[14px] text-gray-700">
          활성
        </label>
      </div>
      <div>
        <label className="mb-1 block text-[14px] font-medium text-gray-700">
          중복 제거 전략
        </label>
        <select
          value={dedupeStrategy}
          onChange={(e) =>
            setDedupeStrategy(e.target.value as "global" | "per_section")
          }
          className="w-full rounded border border-gray-200 px-3 py-2 text-[14px]"
        >
          <option value="global">전체 공통</option>
          <option value="per_section">섹션별</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[14px] font-medium text-gray-700">
          비고
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded border border-gray-200 px-3 py-2 text-[14px]"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded border border-signature bg-signature px-4 py-2 text-[14px] font-medium text-white"
        >
          저장
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-gray-200 bg-white px-4 py-2 text-[14px] text-gray-700"
          >
            취소
          </button>
        )}
      </div>
    </form>
  );
}
