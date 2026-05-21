/**
 * Dev-only route compile / memory hint — [dev-module-graph] (observation only).
 */

let loggedOnce = false;

export function logDevModuleGraphProbe(route: string): void {
  if (process.env.NODE_ENV !== "development") return;
  if (loggedOnce && !process.env.SAMARKET_DEV_MODULE_GRAPH_ALWAYS) return;
  loggedOnce = true;
  const mem = process.memoryUsage();
  // eslint-disable-next-line no-console
  console.info(
    "[dev-module-graph]",
    JSON.stringify({
      route,
      rss_mb: Math.round(mem.rss / 1024 / 1024),
      heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
      hot_path_import_depth: null,
      route_module_count: null,
      giant_module_detected: null,
      memory_rss_mb: Math.round(mem.rss / 1024 / 1024),
      memory_heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
    })
  );
}
