"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildHomeFeed } from "@/lib/home-feed/home-feed-utils";
import { SECTION_LABELS } from "@/lib/home-feed/home-feed-labels";
import type { FeedCandidate, HomeFeedPolicy } from "@/lib/types/home-feed";
import type { UserRegionContext } from "@/lib/exposure/exposure-score-utils";

const MOCK_PREVIEW_REGION: UserRegionContext = {
  region: "마닐라",
  city: "Malate",
  barangay: "Barangay 1",
};
const MOCK_PREVIEW_REGION_LABEL = "마닐라 · Malate · Barangay 1";

interface HomeFeedPreviewProps {
  policies: HomeFeedPolicy[];
}

export function HomeFeedPreview({ policies }: HomeFeedPreviewProps) {
  const { t } = useI18n();
  const [candidates, setCandidates] = useState<FeedCandidate[]>([]);

  useEffect(() => {
    void fetch("/api/admin/home-feed-policies/candidates", {
      cache: "no-store",
      credentials: "include",
    })
      .then((r) => r.json())
      .then((j: { ok?: boolean; candidates?: FeedCandidate[] }) => {
        setCandidates(j.ok && Array.isArray(j.candidates) ? j.candidates : []);
      })
      .catch(() => setCandidates([]));
  }, []);

  const sections = useMemo(
    () =>
      buildHomeFeed(policies, candidates, {
        userRegion: MOCK_PREVIEW_REGION,
        userRegionLabel: MOCK_PREVIEW_REGION_LABEL,
        writeLog: false,
      }),
    [policies, candidates]
  );

  const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);
  if (totalItems === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        미리보기 결과가 없습니다. 정책을 활성화하거나 후보 데이터를 확인하세요.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <div key={section.sectionKey} className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h3 className="mb-3 sam-text-body font-semibold text-sam-fg">
            {SECTION_LABELS[section.sectionKey]} ({section.items.length})
          </h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {section.items.map((item) => (
              <li
                key={item.id}
                className="flex gap-3 rounded border border-sam-border-soft p-2 sam-text-body-secondary"
              >
                {item.thumbnail ? (
                  <img src={item.thumbnail} alt="" className="h-12 w-12 rounded object-cover" />
                ) : (
                  <div className="h-12 w-12 rounded bg-sam-surface-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sam-fg">{item.title}</p>
                  <p className="text-sam-muted">
                    ₱{item.price.toLocaleString()} · {item.reasonLabel}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
