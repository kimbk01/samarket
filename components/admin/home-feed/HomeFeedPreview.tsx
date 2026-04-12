"use client";

import { useMemo } from "react";
import { getHomeFeedPolicies } from "@/lib/home-feed/mock-home-feed-policies";
import { getFeedCandidates } from "@/lib/home-feed/mock-feed-candidates";
import { buildHomeFeed } from "@/lib/home-feed/home-feed-utils";
import { SECTION_LABELS } from "@/lib/home-feed/mock-home-feed-policies";
import type { UserRegionContext } from "@/lib/exposure/exposure-score-utils";

const MOCK_PREVIEW_REGION: UserRegionContext = {
  region: "마닐라",
  city: "Malate",
  barangay: "Barangay 1",
};
const MOCK_PREVIEW_REGION_LABEL = "마닐라 · Malate · Barangay 1";

interface HomeFeedPreviewProps {
  refreshKey?: number;
}

export function HomeFeedPreview({ refreshKey = 0 }: HomeFeedPreviewProps) {
  const policies = useMemo(() => getHomeFeedPolicies(), [refreshKey]);
  const candidates = useMemo(
    () => getFeedCandidates(MOCK_PREVIEW_REGION_LABEL, MOCK_PREVIEW_REGION),
    [refreshKey]
  );
  const sections = useMemo(
    () =>
      buildHomeFeed(policies, candidates, {
        userRegion: MOCK_PREVIEW_REGION,
        userRegionLabel: MOCK_PREVIEW_REGION_LABEL,
        writeLog: false,
      }),
    [policies, candidates, refreshKey]
  );

  const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);
  if (totalItems === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-[14px] text-sam-muted">
        미리보기 결과가 없습니다. 정책을 활성화하거나 후보 데이터를 확인하세요.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[14px] text-sam-muted">
        지역: {MOCK_PREVIEW_REGION_LABEL} · 총 {totalItems}건
      </p>
      <div className="space-y-4 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        {sections.map((sec) => (
          <div key={sec.sectionKey} className="border-b border-sam-border-soft pb-4 last:border-0">
            <h3 className="mb-2 text-[14px] font-semibold text-sam-fg">
              {SECTION_LABELS[sec.sectionKey]} ({sec.items.length}건)
            </h3>
            <ul className="space-y-1 text-[13px] text-sam-fg">
              {sec.items.slice(0, 5).map((item) => (
                <li key={item.id}>
                  {item.title} · {item.reasonLabel} (점수: {item.score})
                </li>
              ))}
              {sec.items.length > 5 && (
                <li className="text-sam-muted">… 외 {sec.items.length - 5}건</li>
              )}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
