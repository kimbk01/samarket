/**
 * neighborhood-feed GET — 동일 `cacheKey`(viewer + 정규화 URL)에 대해
 * in-flight 단일 비행(`runSingleFlight`) + 완료 후 짧은 TTL(기본 1200ms) 응답 재사용.
 * SQL/RPC·피드 결과·정렬·권한 로직은 `execute` 내부에만 둔다.
 */

import { getSingleFlightPromise, runSingleFlight } from "@/lib/http/run-single-flight";

export type NeighborhoodFeedShortTtlSource = "completed_ttl" | "inflight_wait" | "network";

export type NeighborhoodFeedExecuteResult = {
  body: Record<string, unknown>;
  headers: Headers;
};

export type NeighborhoodFeedShortTtlOutcome = NeighborhoodFeedExecuteResult & {
  source: NeighborhoodFeedShortTtlSource;
};

const DEFAULT_TTL_MS = 1200;

const flightKeyPrefix = "neighborhoodFeedShortTtl:" as const;

type CompletedEntry = { outcome: NeighborhoodFeedShortTtlOutcome; expiresAt: number };
const completed = new Map<string, CompletedEntry>();

/** 개발 진단 — 프로세스 단위 누적 */
const metrics = {
  completed_ttl_hits: 0,
  inflight_wait_hits: 0,
  network_executions: 0,
  total_requests: 0,
};

function cloneHeaders(src: Headers): Headers {
  const h = new Headers();
  src.forEach((v, k) => {
    h.append(k, v);
  });
  return h;
}

function cloneOutcome(o: NeighborhoodFeedShortTtlOutcome): NeighborhoodFeedShortTtlOutcome {
  const bodyClone = JSON.parse(JSON.stringify(o.body)) as Record<string, unknown>;
  return {
    source: o.source,
    body: bodyClone,
    headers: cloneHeaders(o.headers),
  };
}

function pruneCompleted(now: number): void {
  for (const [k, v] of completed) {
    if (v.expiresAt <= now) completed.delete(k);
  }
}

export function peekNeighborhoodFeedShortTtlMetrics(): Readonly<typeof metrics> {
  return { ...metrics };
}

export function resetNeighborhoodFeedShortTtlMetricsForTests(): void {
  metrics.completed_ttl_hits = 0;
  metrics.inflight_wait_hits = 0;
  metrics.network_executions = 0;
  metrics.total_requests = 0;
  completed.clear();
}

/**
 * @param cacheKey viewer(또는 anon) + 정규화 URL
 */
export async function runNeighborhoodFeedWithShortTtl(options: {
  cacheKey: string;
  ttlMs?: number;
  execute: () => Promise<NeighborhoodFeedExecuteResult>;
}): Promise<NeighborhoodFeedShortTtlOutcome> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const now = performance.now();
  metrics.total_requests += 1;
  pruneCompleted(now);

  const cached = completed.get(options.cacheKey);
  if (cached && cached.expiresAt > now) {
    metrics.completed_ttl_hits += 1;
    return cloneOutcome({ ...cached.outcome, source: "completed_ttl" });
  }

  const fk = `${flightKeyPrefix}${options.cacheKey}`;
  const hadInflightBefore = getSingleFlightPromise<NeighborhoodFeedShortTtlOutcome>(fk) != null;

  const raw = await runSingleFlight(fk, async (): Promise<NeighborhoodFeedShortTtlOutcome> => {
    const again = completed.get(options.cacheKey);
    if (again && again.expiresAt > performance.now()) {
      return cloneOutcome({ ...again.outcome, source: "completed_ttl" });
    }
    metrics.network_executions += 1;
    const fresh = await options.execute();
    const stamped: NeighborhoodFeedShortTtlOutcome = { ...fresh, source: "network" };
    completed.set(options.cacheKey, {
      outcome: cloneOutcome(stamped),
      expiresAt: performance.now() + ttlMs,
    });
    return stamped;
  });

  if (hadInflightBefore) {
    metrics.inflight_wait_hits += 1;
  }
  const source: NeighborhoodFeedShortTtlSource = hadInflightBefore ? "inflight_wait" : raw.source;
  return cloneOutcome({ ...raw, source });
}
