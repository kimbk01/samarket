"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { BrowseTaxonomyLoaded } from "@/lib/stores/browse-taxonomy-resolvers";
import {
  ensureBrowseTaxonomySnapshot,
  getBrowseTaxonomySnapshot,
  getBrowseTaxonomySnapshotServerSnapshot,
  subscribeBrowseTaxonomySnapshot,
} from "@/lib/stores/browse-taxonomy-snapshot";

/** browse 헤더·목록 — taxonomy 단일 스냅샷 구독 */
export function useBrowseTaxonomySnapshot(): BrowseTaxonomyLoaded | null {
  const snap = useSyncExternalStore(
    subscribeBrowseTaxonomySnapshot,
    getBrowseTaxonomySnapshot,
    getBrowseTaxonomySnapshotServerSnapshot,
  );
  useEffect(() => {
    ensureBrowseTaxonomySnapshot();
  }, []);
  return snap;
}
