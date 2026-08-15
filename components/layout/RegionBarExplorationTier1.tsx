"use client";

import { RegionBarMainHubTier1 } from "@/components/layout/RegionBarMainHubTier1";

/** @deprecated Prefer `RegionBarMainHubTier1` — kept as thin alias for Community/Trade call sites. */
export function RegionBarExplorationTier1({ pathNoQuery }: { pathNoQuery: string }) {
  return <RegionBarMainHubTier1 pathNoQuery={pathNoQuery} />;
}
