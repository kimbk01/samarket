"use client";

import { useEffect } from "react";
import type { HomeFeedSectionResult, HomeFeedItem } from "@/lib/types/home-feed";
import { SECTION_LABELS } from "@/lib/home-feed/mock-home-feed-policies";
import { getProductById } from "@/lib/mock-products";
import { getCurrentUserId } from "@/lib/regions/mock-user-regions";
import { recordImpression } from "@/lib/recommendation/mock-recommendation-impressions";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import { HomeFeedCard } from "./HomeFeedCard";

export interface HomeFeedSectionProps {
  section: HomeFeedSectionResult | { sectionKey: string; items: HomeFeedItem[]; generatedAt: string; sectionLabel?: string };
  surface?: RecommendationSurface;
  onRecommendationClick?: (sectionKey: string, candidateId: string) => void;
}

export function HomeFeedSection({ section, surface = "home", onRecommendationClick }: HomeFeedSectionProps) {
  const { sectionKey, items } = section;
  const label =
    "sectionLabel" in section && section.sectionLabel
      ? section.sectionLabel
      : SECTION_LABELS[sectionKey as keyof typeof SECTION_LABELS] ?? sectionKey;

  const userId = getCurrentUserId();
  useEffect(() => {
    if (surface !== "home" || items.length === 0) return;
    for (const item of items) {
      recordImpression({
        userId,
        surface: "home",
        sectionKey,
        candidateId: item.targetId,
        candidateType: item.itemType === "sponsored" ? "sponsored" : item.itemType === "shop" ? "shop" : "product",
        reasonLabel: item.reasonLabel,
        score: item.score,
      });
    }
  }, [surface, sectionKey, items, userId]);

  if (items.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-[15px] font-semibold text-sam-fg">{label}</h2>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            onClick={() => onRecommendationClick?.(sectionKey, item.targetId)}
            role="presentation"
          >
            <HomeFeedCard
              item={item}
              product={getProductById(item.targetId)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
