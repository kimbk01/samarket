"use client";

import { useMemo } from "react";
import { mergeBrowsePrimaryIndustries } from "@/lib/stores/browse-taxonomy-resolvers";
import type { BrowsePrimaryIndustryWithImage } from "@/lib/stores/browse-primary-industry-display";
import { useBrowseIndustryDatasetVersion } from "@/lib/stores/browse-mock/use-browse-industry-dataset-version";
import { useBrowseTaxonomySnapshot } from "@/lib/stores/use-browse-taxonomy-snapshot";

/** browse 헤더·▼ 패널 — 8개 1차 업종 (공유 taxonomy 스냅샷) */
export function useBrowsePrimaryIndustries(): BrowsePrimaryIndustryWithImage[] {
  const taxonomy = useBrowseTaxonomySnapshot();
  const industryVersion = useBrowseIndustryDatasetVersion();

  return useMemo(
    () => mergeBrowsePrimaryIndustries(taxonomy),
    [taxonomy, industryVersion],
  );
}
