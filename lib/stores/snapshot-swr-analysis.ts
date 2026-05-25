/**
 * Store menus route memory — stale-while-revalidate 관측 (response shape 불변).
 */
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";

export type SnapshotSwrRefreshReason =
  | "soft_stale_expired"
  | "hard_stale_miss"
  | "mutation_invalidation"
  | "cache_bypass";

export type SnapshotSwrAnalysisLog = {
  slug: string;
  memory_hit: boolean;
  memory_soft_stale_hit: boolean;
  memory_hard_stale: boolean;
  background_refresh_started: boolean;
  background_refresh_finished: boolean;
  background_refresh_ms: number | null;
  snapshot_lookup_skipped: boolean;
  snapshot_lookup_ms: number | null;
  stale_age_ms: number | null;
  served_stale: boolean;
  response_returned_before_refresh: boolean;
  refresh_reason: SnapshotSwrRefreshReason | null;
};

export function snapshotSwrAnalysisEnabled(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return (
    process.env.STORE_MENUS_SNAPSHOT_SWR_TRACE === "1" ||
    process.env.NEXT_PUBLIC_DIBAY_DELIVERY_PERF_TRACE === "1" ||
    process.env.NEXT_PUBLIC_SAMARKET_PROD_PERF_MEASURE === "1"
  );
}

export function logSnapshotSwrAnalysis(partial: Partial<SnapshotSwrAnalysisLog> & { slug: string }): void {
  if (!snapshotSwrAnalysisEnabled()) return;
  const entry: SnapshotSwrAnalysisLog = {
    slug: partial.slug.trim().toLowerCase(),
    memory_hit: partial.memory_hit === true,
    memory_soft_stale_hit: partial.memory_soft_stale_hit === true,
    memory_hard_stale: partial.memory_hard_stale === true,
    background_refresh_started: partial.background_refresh_started === true,
    background_refresh_finished: partial.background_refresh_finished === true,
    background_refresh_ms: partial.background_refresh_ms ?? null,
    snapshot_lookup_skipped: partial.snapshot_lookup_skipped === true,
    snapshot_lookup_ms: partial.snapshot_lookup_ms ?? null,
    stale_age_ms: partial.stale_age_ms ?? null,
    served_stale: partial.served_stale === true,
    response_returned_before_refresh: partial.response_returned_before_refresh === true,
    refresh_reason: partial.refresh_reason ?? null,
  };
  // eslint-disable-next-line no-console -- snapshot SWR analysis
  console.info("[snapshot-swr-analysis]", entry);
}

export function snapshotSwrBackgroundRefreshTimer(): { finish: (slug: string) => void } {
  const t0 = devPerfNow();
  return {
    finish(slug: string) {
      logSnapshotSwrAnalysis({
        slug,
        background_refresh_finished: true,
        background_refresh_ms: Math.round(devPerfNow() - t0),
      });
    },
  };
}
