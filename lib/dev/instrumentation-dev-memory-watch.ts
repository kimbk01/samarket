/**
 * Node-only: Edge 번들에서 `process.memoryUsage` 를 정적으로 끌어오지 않도록 분리.
 * `instrumentation.ts` 에서 development 일 때만 dynamic import.
 */
export function registerDevMemoryWatch(): void {
  if (typeof process.memoryUsage !== "function") return;

  const intervalMs = 30_000;
  const tick = () => {
    try {
      const m = process.memoryUsage();
      console.log(
        `[dev-memory-watch] rss=${m.rss} heapUsed=${m.heapUsed} heapTotal=${m.heapTotal} external=${m.external}`
      );
    } catch {
      /* ignore */
    }
  };

  tick();
  setInterval(tick, intervalMs);
}
