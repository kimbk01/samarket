/**
 * Node-only: Edge 번들에서 `process.memoryUsage` 를 정적으로 끌어오지 않도록 분리.
 * `instrumentation.ts` 에서 development 일 때만 dynamic import.
 *
 * - 기동 직후 동기 측정은 `Ready` 전·힙 미성장 상태라 오해를 부르기 쉬움 → **첫 샘플만 지연**.
 * - `register()` 가 이중 호출되어도 **타이머 1세트**만 유지.
 */
const g = globalThis as typeof globalThis & {
  __samarketDevMemoryWatchStarted?: boolean;
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

  const intervalMs = parseIntervalMs();
  const startupDelayMs = parseStartupDelayMs();

  const tick = (phase: string) => {
    try {
      const m = process.memoryUsage();
      console.log(
        `[dev-memory-watch] phase=${phase} rss=${m.rss}(${mib(m.rss)}) heapUsed=${m.heapUsed}(${mib(
          m.heapUsed
        )}) heapTotal=${m.heapTotal}(${mib(m.heapTotal)}) external=${m.external}(${mib(m.external)})`
      );
    } catch {
      /* ignore */
    }
  };

  const startPeriodic = () => {
    tick(startupDelayMs === 0 ? "startup" : "startup-delayed");
    setInterval(() => tick("interval"), intervalMs);
  };

  if (startupDelayMs === 0) {
    queueMicrotask(startPeriodic);
  } else {
    setTimeout(startPeriodic, startupDelayMs);
  }
}
