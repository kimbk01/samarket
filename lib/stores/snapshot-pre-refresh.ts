/**
 * Store menus route memory — pre-refresh before hard stale (관측 전용).
 */
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";

export type SnapshotPreRefreshSource = "soft_stale_request" | "proactive_timer";

export type SnapshotPreRefreshLog = {
  slug: string;
  pre_refresh_started: boolean;
  pre_refresh_finished: boolean;
  pre_refresh_ms: number | null;
  pre_refresh_extended_ttl: number | null;
  hard_stale_avoided: boolean;
  stale_age_before_refresh: number | null;
  stale_age_after_refresh: number | null;
  refresh_source: SnapshotPreRefreshSource | null;
  refresh_inflight_join: boolean;
  refresh_error: boolean;
};

export function snapshotPreRefreshTraceEnabled(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return (
    process.env.STORE_MENUS_SNAPSHOT_PRE_REFRESH_TRACE === "1" ||
    process.env.STORE_MENUS_SNAPSHOT_SWR_TRACE === "1" ||
    process.env.NEXT_PUBLIC_DIBAY_DELIVERY_PERF_TRACE === "1" ||
    process.env.NEXT_PUBLIC_SAMARKET_PROD_PERF_MEASURE === "1"
  );
}

export function logSnapshotPreRefresh(partial: Partial<SnapshotPreRefreshLog> & { slug: string }): void {
  if (!snapshotPreRefreshTraceEnabled()) return;
  const entry: SnapshotPreRefreshLog = {
    slug: partial.slug.trim().toLowerCase(),
    pre_refresh_started: partial.pre_refresh_started === true,
    pre_refresh_finished: partial.pre_refresh_finished === true,
    pre_refresh_ms: partial.pre_refresh_ms ?? null,
    pre_refresh_extended_ttl: partial.pre_refresh_extended_ttl ?? null,
    hard_stale_avoided: partial.hard_stale_avoided === true,
    stale_age_before_refresh: partial.stale_age_before_refresh ?? null,
    stale_age_after_refresh: partial.stale_age_after_refresh ?? null,
    refresh_source: partial.refresh_source ?? null,
    refresh_inflight_join: partial.refresh_inflight_join === true,
    refresh_error: partial.refresh_error === true,
  };
  // eslint-disable-next-line no-console -- snapshot pre-refresh analysis
  console.info("[snapshot-pre-refresh]", entry);
}

export function snapshotPreRefreshTimer(): { finish: (slug: string, extra: Partial<SnapshotPreRefreshLog>) => void } {
  const t0 = devPerfNow();
  return {
    finish(slug: string, extra: Partial<SnapshotPreRefreshLog>) {
      logSnapshotPreRefresh({
        slug,
        pre_refresh_finished: true,
        pre_refresh_ms: Math.round(devPerfNow() - t0),
        ...extra,
      });
    },
  };
}
