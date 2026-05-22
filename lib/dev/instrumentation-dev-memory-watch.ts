/**
 * Node-only: Edge 번들에서 `process.memoryUsage` 를 정적으로 끌어오지 않도록 분리.
 * `instrumentation.ts` 에서 development 일 때만 dynamic import.
 *
 * - 기동 직후 동기 측정은 `Ready` 전·힙 미성장 상태라 오해를 부르기 쉬움 → **첫 샘플만 지연**.
 * - `register()` 가 이중 호출되어도 **타이머 1세트**만 유지.
 */
import { getCommunityMessengerServiceCacheFootprintFromRegistry } from "@/lib/community-messenger/dev/cm-service-cache-footprint-registry";
import { getMessengerMonitoringStoreFootprint } from "@/lib/community-messenger/monitoring/server-store-root";
import { logDevMemoryGrowthDiagnosis } from "@/lib/dev/dev-memory-growth-diagnosis";

const g = globalThis as typeof globalThis & {
  __samarketDevMemoryWatchStarted?: boolean;
  __samarketDevSigtermHooked?: boolean;
};

function mib(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "?";
  return `${(n / (1024 * 1024)).toFixed(1)}MiB`;
}

function parseIntervalMs(): number {
  const raw = process.env.SAMARKET_DEV_MEMORY_WATCH_MS?.trim();
  if (!raw) return 30_000;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 5000) return 30_000;
  return Math.min(600_000, Math.floor(n));
}

/** 첫 로그 지연(ms). 0 이면 다음 마이크로태스크에서 즉시 1회. */
function parseStartupDelayMs(): number {
  const raw = process.env.SAMARKET_DEV_MEMORY_WATCH_STARTUP_DELAY_MS?.trim();
  if (!raw) return 2500;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 2500;
  return Math.min(120_000, Math.floor(n));
}

export function registerDevMemoryWatch(): void {
  if (typeof process.memoryUsage !== "function") return;
  if (g.__samarketDevMemoryWatchStarted) return;
  g.__samarketDevMemoryWatchStarted = true;

  if (!g.__samarketDevSigtermHooked) {
    g.__samarketDevSigtermHooked = true;
    try {
      process.on("SIGTERM", () => {
        try {
          // eslint-disable-next-line no-console -- dev-only Next memory threshold / worker recycle probe
          console.warn("[dev-memory-restart-detected]", {
            dev_memory_restart_detected: true,
            signal: "SIGTERM",
            rss_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
            heapUsed_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          });
        } catch {
          /* ignore */
        }
      });
    } catch {
      /* ignore */
    }
  }

  const intervalMs = parseIntervalMs();
  const startupDelayMs = parseStartupDelayMs();

  const measureMode = process.env.SAMARKET_DEV_MEASURE_MODE?.trim() === "1";

  const tick = (phase: string) => {
    try {
      if (!measureMode) {
        const m = process.memoryUsage();
        const rssMb = Math.round(m.rss / 1024 / 1024);
        const heapMb = Math.round(m.heapUsed / 1024 / 1024);
        let storeFoot: ReturnType<typeof getMessengerMonitoringStoreFootprint> | null = null;
        try {
          storeFoot = getMessengerMonitoringStoreFootprint();
        } catch {
          storeFoot = null;
        }
        const cmServiceCacheFootprint = getCommunityMessengerServiceCacheFootprintFromRegistry();
        let memory_cm_cache_total_entries = 0;
        if (cmServiceCacheFootprint) {
          for (const v of Object.values(cmServiceCacheFootprint)) {
            if (typeof v === "number" && Number.isFinite(v)) memory_cm_cache_total_entries += v;
          }
        }
        const memory_module_cache_suspicion_flag =
          rssMb >= 3500 && memory_cm_cache_total_entries >= 80 ? 1 : 0;
        const entries = storeFoot
          ? Object.entries(storeFoot).filter(([k]) => k.endsWith("Size") || k.endsWith("Len"))
          : [];
        let memory_top_cache_name = "none";
        let memory_top_cache_size = 0;
        for (const [k, v] of entries) {
          const n = typeof v === "number" ? v : 0;
          if (n > memory_top_cache_size) {
            memory_top_cache_size = n;
            memory_top_cache_name = k;
          }
        }
        console.log(
          `[dev-memory-watch] phase=${phase} rss=${m.rss}(${mib(m.rss)}) heapUsed=${m.heapUsed}(${mib(
            m.heapUsed
          )}) heapTotal=${m.heapTotal}(${mib(m.heapTotal)}) external=${m.external}(${mib(m.external)})`,
          {
            memory_rss_mb: rssMb,
            memory_heapUsed_mb: heapMb,
            memory_before_compile_rss_mb: rssMb,
            memory_before_compile_heap_mb: heapMb,
            memory_top_global_store: "messenger_monitoring_store",
            memory_top_cache_name,
            memory_top_cache_size,
            memory_cm_cache_total_entries,
            memory_module_cache_suspicion_flag,
            cm_service_cache_footprint: cmServiceCacheFootprint,
            monitoring_store_events_len: storeFoot?.monitoring_store_events_len,
            monitoring_store_alerts_len: storeFoot?.monitoring_store_alerts_len,
            monitoring_store_subscription_log_len: storeFoot?.monitoring_store_subscription_log_len,
            monitoring_store_trimmed_count: storeFoot?.monitoring_store_trimmed_count,
            monitoring_store_duplicate_event_count: storeFoot?.monitoring_store_duplicate_event_count,
            monitoring_store_memory_estimate_mb: storeFoot?.monitoring_store_memory_estimate_mb,
            monitoring_store_oldest_event_age_ms: storeFoot?.monitoring_store_oldest_event_age_ms,
            monitoring_store_prune_triggered: storeFoot?.monitoring_store_prune_triggered,
            monitoring_store_event_payload_avg_bytes: storeFoot?.monitoring_store_event_payload_avg_bytes,
            monitoring_store_last_event_payload_bytes: storeFoot?.monitoring_store_last_event_payload_bytes,
            messenger_store_footprint: storeFoot,
          }
        );
      }
      logDevMemoryGrowthDiagnosis(phase);
    } catch {
      /* ignore */
    }
  };

  const startPeriodic = () => {
    if (!measureMode) {
      void import("./dev-module-graph-probe").then(({ logDevModuleGraphProbe }) => {
        logDevModuleGraphProbe("dev-memory-watch-startup");
      });
    }
    tick(startupDelayMs === 0 ? "startup" : "startup-delayed");
    setInterval(() => tick("interval"), intervalMs);
  };

  if (startupDelayMs === 0) {
    queueMicrotask(startPeriodic);
  } else {
    setTimeout(startPeriodic, startupDelayMs);
  }
}
