"use client";

import { useMemo } from "react";
import { listBrowseSubIndustriesForPrimary } from "@/lib/stores/browse-taxonomy-resolvers";
import type { BrowseSubIndustry } from "@/lib/stores/browse-taxonomy-ui-types";
import { useBrowseTaxonomySnapshot } from "@/lib/stores/use-browse-taxonomy-snapshot";

/** browse 4단 2차 칩 — 공유 taxonomy 스냅샷 (「전체」 칩 없음) */
export function useBrowseSubIndustries(primarySlug: string): BrowseSubIndustry[] {
  const taxonomy = useBrowseTaxonomySnapshot();
  return useMemo(
    () => listBrowseSubIndustriesForPrimary(taxonomy, primarySlug),
    [taxonomy, primarySlug],
  );
}
