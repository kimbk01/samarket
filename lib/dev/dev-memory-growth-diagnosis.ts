/**
 * Dev-only: in-process cache·store footprint + heap delta + aggressive prune.
 * `[dev-memory-growth-diagnosis]` — 측정 환경 오염(compile 전 heap 3GB) 분리용.
 */
import { getCommunityMessengerServiceCacheFootprintFromRegistry } from "@/lib/community-messenger/dev/cm-service-cache-footprint-registry";
import {
  getMessengerMonitoringStoreFootprint,
  pruneMessengerMonitoringStoreDev,
} from "@/lib/community-messenger/monitoring/server-store-root";
import {
  getSingleFlightInflightCount,
  pruneSingleFlightDev,
} from "@/lib/http/run-single-flight";

const g = globalThis as typeof globalThis & {
  __samarketDevMemoryGrowthLast?: {
    at: number;
    heapUsed: number;
    rss: number;
  };
};

export type DevCacheFootprintRow = {
  name: string;
  entry_count: number;
  estimated_mb: number;
};

function mib(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes < 0) return 0;
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

function estimateMapEntryMb(count: number, bytesPerEntry: number): number {
  return mib(count * bytesPerEntry);
}

/** 통일 포맷 — cache name / entries / est MB */
export function collectDevCacheFootprintRows(): DevCacheFootprintRow[] {
  const rows: DevCacheFootprintRow[] = [];

  const monitoring = getMessengerMonitoringStoreFootprint();
  rows.push({
    name: "messenger_monitoring_store",
    entry_count:
      monitoring.monitoring_store_events_len +
      monitoring.monitoring_store_subscription_log_len +
      monitoring.monitoring_store_alerts_len,
    estimated_mb: monitoring.monitoring_store_memory_estimate_mb,
  });
  rows.push({
    name: "messenger_monitoring_aggregates",
    entry_count:
      monitoring.aggregatesSize +
      monitoring.apiByRouteSize +
      monitoring.clientAggregatesSize +
      monitoring.outcomesSize,
    estimated_mb: estimateMapEntryMb(
      monitoring.aggregatesSize +
        monitoring.apiByRouteSize +
        monitoring.clientAggregatesSize +
        monitoring.outcomesSize,
      120
    ),
  });

  const cm = getCommunityMessengerServiceCacheFootprintFromRegistry();
  if (cm) {
    for (const [key, count] of Object.entries(cm)) {
      if (typeof count !== "number" || !Number.isFinite(count)) continue;
      rows.push({
        name: key,
        entry_count: count,
        estimated_mb: estimateMapEntryMb(count, 2048),
      });
    }
  }

  const sfCount = getSingleFlightInflightCount();
  rows.push({
    name: "http_singleflight_inflight",
    entry_count: sfCount,
    estimated_mb: estimateMapEntryMb(sfCount, 512),
  });

  rows.sort((a, b) => b.estimated_mb - a.estimated_mb || b.entry_count - a.entry_count);
  return rows;
}

export type DevMemoryPruneResult = {
  monitoring_events_removed: number;
  monitoring_subscription_log_removed: number;
  monitoring_alerts_removed: number;
  singleflight_keys_removed: number;
};

/** NODE_ENV=development — 오래된 in-process 버퍼 강제 trim */
export function pruneDevMemoryCaches(): DevMemoryPruneResult {
  if (process.env.NODE_ENV !== "development") {
    return {
      monitoring_events_removed: 0,
      monitoring_subscription_log_removed: 0,
      monitoring_alerts_removed: 0,
      singleflight_keys_removed: 0,
    };
  }
  const mon = pruneMessengerMonitoringStoreDev();
  const singleflight_keys_removed = pruneSingleFlightDev();
  return {
    monitoring_events_removed: mon.eventsRemoved,
    monitoring_subscription_log_removed: mon.subscriptionLogRemoved,
    monitoring_alerts_removed: mon.alertsRemoved,
    singleflight_keys_removed,
  };
}

const HEAP_WARN_MB = 4096;
const HEAP_CRITICAL_MB = 5120;
const HEAP_HMR_DOMINANCE_MB = 2048;
const INPROCESS_CACHE_PRIMARY_MAX_MB = 10;

export type DevMemoryGuardLevel = "ok" | "warn" | "critical";

export function evaluateDevMemoryGuard(input: {
  heap_mb: number;
  inprocess_cache_estimated_mb: number;
}): {
  memory_guard_level: DevMemoryGuardLevel;
  likely_next_hmr_graph_dominates: boolean;
  cache_not_primary_reason: string | null;
} {
  const { heap_mb, inprocess_cache_estimated_mb } = input;
  let memory_guard_level: DevMemoryGuardLevel = "ok";
  if (heap_mb >= HEAP_CRITICAL_MB) memory_guard_level = "critical";
  else if (heap_mb >= HEAP_WARN_MB) memory_guard_level = "warn";

  const likely_next_hmr_graph_dominates =
    inprocess_cache_estimated_mb < INPROCESS_CACHE_PRIMARY_MAX_MB && heap_mb >= HEAP_HMR_DOMINANCE_MB;

  const cache_not_primary_reason = likely_next_hmr_graph_dominates
    ? "Next dev compile/HMR graph likely dominates"
    : inprocess_cache_estimated_mb >= INPROCESS_CACHE_PRIMARY_MAX_MB
      ? "in-process cache footprint may contribute — see cache_rows"
      : null;

  return { memory_guard_level, likely_next_hmr_graph_dominates, cache_not_primary_reason };
}

function sumInprocessCacheEstimatedMb(rows: DevCacheFootprintRow[]): number {
  return Math.round(rows.reduce((s, r) => s + r.estimated_mb, 0) * 1000) / 1000;
}

export function logDevMemoryGrowthDiagnosis(phase: string): void {
  if (process.env.NODE_ENV !== "development") return;
  if (typeof process.memoryUsage !== "function") return;

  const prune =
    phase === "interval" || phase === "startup-delayed" || phase === "startup"
      ? pruneDevMemoryCaches()
      : null;

  const m = process.memoryUsage();
  const heapUsed = m.heapUsed;
  const rss = m.rss;
  const prev = g.__samarketDevMemoryGrowthLast;
  const heapDeltaMb = prev ? mib(heapUsed - prev.heapUsed) : 0;
  const rssDeltaMb = prev ? mib(rss - prev.rss) : 0;
  const elapsedMs = prev ? Date.now() - prev.at : 0;
  g.__samarketDevMemoryGrowthLast = { at: Date.now(), heapUsed, rss };

  const cache_rows = collectDevCacheFootprintRows();
  const top = cache_rows[0] ?? null;
  const heap_mb = mib(heapUsed);
  const rss_mb = mib(rss);
  const inprocess_cache_estimated_mb = sumInprocessCacheEstimatedMb(cache_rows);
  const intervalBand =
    elapsedMs >= 20_000 && elapsedMs <= 45_000;
  const heap_delta_30s_mb = intervalBand ? heapDeltaMb : null;
  const rss_delta_30s_mb = intervalBand ? rssDeltaMb : null;

  const guard = evaluateDevMemoryGuard({ heap_mb, inprocess_cache_estimated_mb });

  const payload = {
    phase,
    heap_mb,
    rss_mb,
    heapUsed_mb: heap_mb,
    heapTotal_mb: mib(m.heapTotal),
    external_mb: mib(m.external),
    heap_delta_30s_mb,
    rss_delta_30s_mb,
    heap_delta_mb_since_last: heapDeltaMb,
    rss_delta_mb_since_last: rssDeltaMb,
    sample_elapsed_ms: elapsedMs,
    inprocess_cache_estimated_mb,
    likely_next_hmr_graph_dominates: guard.likely_next_hmr_graph_dominates,
    cache_not_primary_reason: guard.cache_not_primary_reason,
    memory_guard_level: guard.memory_guard_level,
    memory_top_cache_name: top?.name ?? "none",
    memory_top_cache_entry_count: top?.entry_count ?? 0,
    memory_top_cache_estimated_mb: top?.estimated_mb ?? 0,
    cache_rows,
    dev_prune_applied: prune != null,
    dev_measure_mode: process.env.SAMARKET_DEV_MEASURE_MODE === "1",
    ...(prune ?? {}),
    diagnosis_hint: guard.cache_not_primary_reason
      ? `${guard.cache_not_primary_reason} — judge API from [perf-real-api-cost].actual_handler_ms not wall_ms`
      : heapDeltaMb > 80 && elapsedMs > 0 && elapsedMs < 120_000
        ? "heap grew >80MiB between samples — check cache_rows + Next dev compile"
        : "within dev watch band or post-prune",
    api_judgment_field: "actual_handler_ms",
    targets_heapUsed_mb: 1.2,
    targets_rss_mb: 2,
    memory_guard_warn_heap_mb: HEAP_WARN_MB,
    memory_guard_critical_heap_mb: HEAP_CRITICAL_MB,
  };

  const logFn =
    guard.memory_guard_level === "critical"
      ? console.error
      : guard.memory_guard_level === "warn"
        ? console.warn
        : console.warn;

  // eslint-disable-next-line no-console -- dev memory growth diagnosis (required)
  logFn("[dev-memory-growth-diagnosis]", payload);

  if (
    guard.memory_guard_level === "critical" &&
    process.env.SAMARKET_DEV_MEMORY_EXIT_ON_CRITICAL?.trim() === "1"
  ) {
    // eslint-disable-next-line no-console -- measurement guard exit
    console.error("[dev-memory-growth-diagnosis] exiting — SAMARKET_DEV_MEMORY_EXIT_ON_CRITICAL=1", {
      heap_mb,
      memory_guard_level: guard.memory_guard_level,
    });
    process.exit(99);
  }
}
