"use client";

import { useState } from "react";
import type {
  HomeFeedPolicy,
  HomeFeedSectionKey,
  HomeFeedSortMode,
  HomeFeedRegionScope,
} from "@/lib/types/home-feed";
import {
  SECTION_LABELS,
  SORT_MODE_LABELS,
  REGION_SCOPE_LABELS,
} from "@/lib/home-feed/mock-home-feed-policies";

interface HomeFeedPolicyFormProps {
  initial: HomeFeedPolicy;
  onSubmit: (values: Partial<HomeFeedPolicy>) => void;
  onCancel?: () => void;
}

const SORT_OPTIONS: HomeFeedSortMode[] = [
  "featured",
  "latest",
  "nearby",
  "popular",
  "mixed",
];
const REGION_OPTIONS: HomeFeedRegionScope[] = ["barangay", "city", "region"];

export function HomeFeedPolicyForm({
  initial,
  onSubmit,
  onCancel,
}: HomeFeedPolicyFormProps) {
  const [sectionLabel, setSectionLabel] = useState(initial.sectionLabel);
  const [isActive, setIsActive] = useState(initial.isActive);
  const [sortMode, setSortMode] = useState(initial.sortMode);
  const [maxItems, setMaxItems] = useState(initial.maxItems);
  const [allowSponsoredMix, setAllowSponsoredMix] = useState(
    initial.allowSponsoredMix
  );
  const [allowPremiumBoost, setAllowPremiumBoost] = useState(
    initial.allowPremiumBoost
  );
  const [allowBusinessBoost, setAllowBusinessBoost] = useState(
    initial.allowBusinessBoost
  );
  const [allowPointPromotionBoost, setAllowPointPromotionBoost] = useState(
    initial.allowPointPromotionBoost
  );
  const [dedupeEnabled, setDedupeEnabled] = useState(initial.dedupeEnabled);
  const [regionScope, setRegionScope] = useState(initial.regionScope);
  const [priorityOrder, setPriorityOrder] = useState(initial.priorityOrder);
  const [adminMemo, setAdminMemo] = useState(initial.adminMemo ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      id: initial.id,
      sectionKey: initial.sectionKey,
      sectionLabel,
      isActive,
      sortMode,
      maxItems,
      allowSponsoredMix,
      allowPremiumBoost,
      allowBusinessBoost,
      allowPointPromotionBoost,
      dedupeEnabled,
      regionScope,
      priorityOrder,
      adminMemo: adminMemo || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="sam-text-body-secondary text-sam-muted">
        섹션: {SECTION_LABELS[initial.sectionKey]}
      </p>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          섹션 라벨
        </label>
        <input
          type="text"
          value={sectionLabel}
          onChange={(e) => setSectionLabel(e.target.value)}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="hfpActive"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="rounded border-sam-border"
        />
        <label htmlFor="hfpActive" className="sam-text-body text-sam-fg">
          활성
        </label>
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          정렬
        </label>
        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as HomeFeedSortMode)}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          {SORT_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {SORT_MODE_LABELS[m]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          최대 노출 수
        </label>
        <input
          type="number"
          min={1}
          max={50}
          value={maxItems}
          onChange={(e) => setMaxItems(Number(e.target.value) || 1)}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          지역 범위
        </label>
        <select
          value={regionScope}
          onChange={(e) =>
            setRegionScope(e.target.value as HomeFeedRegionScope)
          }
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          {REGION_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {REGION_SCOPE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          순서
        </label>
        <input
          type="number"
          min={0}
          value={priorityOrder}
          onChange={(e) => setPriorityOrder(Number(e.target.value) || 0)}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 sam-text-body text-sam-fg">
          <input
            type="checkbox"
            checked={allowSponsoredMix}
            onChange={(e) => setAllowSponsoredMix(e.target.checked)}
            className="rounded border-sam-border"
          />
          광고 혼합
        </label>
        <label className="flex items-center gap-2 sam-text-body text-sam-fg">
          <input
            type="checkbox"
            checked={allowPremiumBoost}
            onChange={(e) => setAllowPremiumBoost(e.target.checked)}
            className="rounded border-sam-border"
          />
          프리미엄 부스트
        </label>
        <label className="flex items-center gap-2 sam-text-body text-sam-fg">
          <input
            type="checkbox"
            checked={allowBusinessBoost}
            onChange={(e) => setAllowBusinessBoost(e.target.checked)}
            className="rounded border-sam-border"
          />
          상점 부스트
        </label>
        <label className="flex items-center gap-2 sam-text-body text-sam-fg">
          <input
            type="checkbox"
            checked={allowPointPromotionBoost}
            onChange={(e) => setAllowPointPromotionBoost(e.target.checked)}
            className="rounded border-sam-border"
          />
          포인트 프로모션
        </label>
        <label className="flex items-center gap-2 sam-text-body text-sam-fg">
          <input
            type="checkbox"
            checked={dedupeEnabled}
            onChange={(e) => setDedupeEnabled(e.target.checked)}
            className="rounded border-sam-border"
          />
          중복 제거
        </label>
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          관리자 메모
        </label>
        <textarea
          value={adminMemo}
          onChange={(e) => setAdminMemo(e.target.value)}
          rows={2}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded border border-signature bg-signature px-4 py-2 sam-text-body font-medium text-white"
        >
          저장
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-sam-border bg-sam-surface px-4 py-2 sam-text-body text-sam-fg"
          >
            취소
          </button>
        )}
      </div>
    </form>
  );
}
