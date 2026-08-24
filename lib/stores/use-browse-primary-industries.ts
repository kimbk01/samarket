"use client";

import { useMemo } from "react";
import { mergeBrowsePrimaryIndustries } from "@/lib/stores/browse-taxonomy-resolvers";
import type { BrowsePrimaryIndustryWithImage } from "@/lib/stores/browse-primary-industry-display";
import { useBrowseTaxonomySnapshot } from "@/lib/stores/use-browse-taxonomy-snapshot";

/** browse 헤더·▼ 패널 — active taxonomy primaries (sort_order SSOT) */
export function useBrowsePrimaryIndustries(): BrowsePrimaryIndustryWithImage[] {
  const taxonomy = useBrowseTaxonomySnapshot();
  return useMemo(
    () => mergeBrowsePrimaryIndustries(taxonomy),
    [taxonomy],
  );
}
