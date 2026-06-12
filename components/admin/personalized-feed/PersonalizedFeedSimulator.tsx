"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildPersonalizedFeedSections } from "@/lib/personalized-feed/personalized-feed-utils";
import { createEmptyBehaviorProfile } from "@/lib/personalized-feed/empty-behavior-profile";
import { getPersonalizedCandidatesFromFeedCandidates } from "@/lib/personalized-feed/personalized-candidates-from-feed";
import { PERSONALIZED_SECTION_LABELS } from "@/lib/personalized-feed/personalized-section-labels";
import type { FeedCandidate } from "@/lib/types/home-feed";
import type { PersonalizedFeedPolicy } from "@/lib/types/personalized-feed";

const MOCK_REGION = "마닐라 · Malate · Barangay 1";

interface PersonalizedFeedSimulatorProps {
  policies: PersonalizedFeedPolicy[];
}

export function PersonalizedFeedSimulator({ policies }: PersonalizedFeedSimulatorProps) {
  const { t } = useI18n();
  const [userId] = useState("preview");
  const [feedCandidates, setFeedCandidates] = useState<FeedCandidate[]>([]);

  useEffect(() => {
    void fetch("/api/admin/home-feed-policies/candidates", {
      cache: "no-store",
      credentials: "include",
    })
      .then((r) => r.json())
      .then((j: { ok?: boolean; candidates?: FeedCandidate[] }) => {
        setFeedCandidates(j.ok && Array.isArray(j.candidates) ? j.candidates : []);
      })
      .catch(() => setFeedCandidates([]));
  }, []);

  const profile = useMemo(() => createEmptyBehaviorProfile(userId, MOCK_REGION), [userId]);
  const candidates = useMemo(
    () => getPersonalizedCandidatesFromFeedCandidates(feedCandidates),
    [feedCandidates]
  );
  const results = useMemo(
    () => buildPersonalizedFeedSections(policies, candidates, profile, { userId, writeLog: false }),
    [policies, candidates, profile, userId]
  );

  const totalItems = results.reduce((sum, r) => sum + r.items.length, 0);

  return (
    <div className="space-y-4">
      <p className="sam-text-body text-sam-muted">
        지역: {MOCK_REGION} · 총 {totalItems}건
      </p>
      {totalItems === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("common_content_unavailable")}
        </div>
      ) : (
        <div className="space-y-6">
          {results.map((section) => (
            <div key={section.sectionKey} className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
              <h3 className="mb-3 sam-text-body font-semibold text-sam-fg">
                {PERSONALIZED_SECTION_LABELS[section.sectionKey]} ({section.items.length})
              </h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {section.items.map((item) => (
                  <li key={item.id} className="rounded border border-sam-border-soft p-2 sam-text-body-secondary">
                    <p className="truncate font-medium text-sam-fg">{item.title}</p>
                    <p className="text-sam-muted">
                      ₱{item.price.toLocaleString()} · {item.reasonLabel}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
