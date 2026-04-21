"use client";

import { useState } from "react";
import type { PersonalizedFeedPolicy } from "@/lib/types/personalized-feed";
import { PERSONALIZED_SECTION_LABELS } from "@/lib/personalized-feed/mock-personalized-feed-policies";

interface PersonalizedPolicyFormProps {
  initial: PersonalizedFeedPolicy;
  onSubmit: (values: Partial<PersonalizedFeedPolicy>) => void;
  onCancel?: () => void;
}

const WEIGHT_KEYS = [
  "categoryAffinityWeight",
  "recentViewWeight",
  "recentFavoriteWeight",
  "recentChatWeight",
  "premiumBoostWeight",
  "businessBoostWeight",
  "nearbyWeight",
  "recencyWeight",
] as const;

const WEIGHT_LABELS: Record<(typeof WEIGHT_KEYS)[number], string> = {
  categoryAffinityWeight: "카테고리 친화도",
  recentViewWeight: "최근 본",
  recentFavoriteWeight: "찜",
  recentChatWeight: "채팅",
  premiumBoostWeight: "프리미엄 부스트",
  businessBoostWeight: "상점 부스트",
  nearbyWeight: "가까운순",
  recencyWeight: "최신성",
};

export function PersonalizedPolicyForm({
  initial,
  onSubmit,
  onCancel,
}: PersonalizedPolicyFormProps) {
  const [sectionLabel, setSectionLabel] = useState(initial.sectionLabel);
  const [isActive, setIsActive] = useState(initial.isActive);
  const [maxItems, setMaxItems] = useState(initial.maxItems);
  const [dedupeEnabled, setDedupeEnabled] = useState(initial.dedupeEnabled);
  const [weights, setWeights] = useState({
    categoryAffinityWeight: initial.categoryAffinityWeight,
    recentViewWeight: initial.recentViewWeight,
    recentFavoriteWeight: initial.recentFavoriteWeight,
    recentChatWeight: initial.recentChatWeight,
    premiumBoostWeight: initial.premiumBoostWeight,
    businessBoostWeight: initial.businessBoostWeight,
    nearbyWeight: initial.nearbyWeight,
    recencyWeight: initial.recencyWeight,
  });
  const [adminMemo, setAdminMemo] = useState(initial.adminMemo ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      id: initial.id,
      sectionKey: initial.sectionKey,
      sectionLabel,
      isActive,
      maxItems,
      dedupeEnabled,
      ...weights,
      adminMemo: adminMemo || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="sam-text-body-secondary text-sam-muted">
        섹션: {PERSONALIZED_SECTION_LABELS[initial.sectionKey]}
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
          id="pfpActive"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="rounded border-sam-border"
        />
        <label htmlFor="pfpActive" className="sam-text-body text-sam-fg">
          활성
        </label>
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          최대 노출 수
        </label>
        <input
          type="number"
          min={1}
          max={20}
          value={maxItems}
          onChange={(e) => setMaxItems(Number(e.target.value) || 1)}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="pfpDedupe"
          checked={dedupeEnabled}
          onChange={(e) => setDedupeEnabled(e.target.checked)}
          className="rounded border-sam-border"
        />
        <label htmlFor="pfpDedupe" className="sam-text-body text-sam-fg">
          중복 제거
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {WEIGHT_KEYS.map((key) => (
          <div key={key}>
            <label className="mb-0.5 block sam-text-helper text-sam-muted">
              {WEIGHT_LABELS[key]}
            </label>
            <input
              type="number"
              step={0.1}
              min={0}
              value={weights[key]}
              onChange={(e) =>
                setWeights((w) => ({ ...w, [key]: parseFloat(e.target.value) || 0 }))
              }
              className="w-full rounded border border-sam-border px-2 py-1.5 sam-text-body"
            />
          </div>
        ))}
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
