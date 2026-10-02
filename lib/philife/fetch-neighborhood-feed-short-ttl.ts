"use client";

/**
 * `/api/philife/neighborhood-feed` 전용 — 동일 URL(+cache 분기)에 대해
 * `runSingleFlight` in-flight + 완료 후 짧은 TTL 동안 네트워크 fetch 재사용.
 *
 * COMM-03 — consumer AbortSignal must not cancel the shared network flight.
 * Callers may still pass `signal` so *their* waiter rejects on abort (28s / unmount),
 * while other waiters / warm / adjacent consumers keep the in-flight result.
 */

import {
  forgetSingleFlightsWhere,
  getSingleFlightPromise,
  runSingleFlight,
} from "@/lib/http/run-single-flight";
import { samarketFeedTraceLogEnabled } from "@/lib/debug/samarket-server-trace-flags";

const CLIENT_TTL_MS = 1200;

type Boxed = {
  status: number;
  bodyText: string;
  headersSerialized: [string, string][];
};

const completed = new Map<string, { boxed: Boxed; expiresAt: number }>();

const clientMetrics = {
  completed_ttl_hits: 0,
  inflight_wait_hits: 0,
  network_fetches: 0,
  total: 0,
};

const flightPrefix = "philifeNeighborhoodFeedShortTtl:" as const;

function clientKey(url: string, init?: RequestInit): string {
  const cacheMode = init?.cache === "no-store" ? "ns" : "df";
  return `${url}\u0000${cacheMode}`;
}

function headersFromPairs(pairs: [string, string][]): Headers {
  const h = new Headers();
  for (const [k, v] of pairs) h.append(k, v);
  return h;
}

function serializeResponseHeaders(res: Response): [string, string][] {
  const out: [string, string][] = [];
  res.headers.forEach((v, k) => out.push([k, v]));
  return out;
}

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

/** Strip consumer signal — shared flight must not inherit one waiter's abort. */
function initWithoutConsumerSignal(init?: RequestInit): RequestInit | undefined {
  if (!init) return undefined;
  const { signal: _signal, ...rest } = init;
  void _signal;
  return rest;
}

function responseFromBoxed(boxed: Boxed): Response {
  return new Response(boxed.bodyText, {
    status: boxed.status,
    headers: headersFromPairs(boxed.headersSerialized),
  });
}

/**
 * Await shared boxed result; if `signal` aborts, reject *this* waiter only.
 */
function awaitBoxedForConsumer(
  boxedPromise: Promise<Boxed>,
  signal: AbortSignal | null | undefined
): Promise<Response> {
  if (!signal) {
    return boxedPromise.then(responseFromBoxed);
  }
  if (signal.aborted) {
    return Promise.reject(abortError());
  }
  return new Promise<Response>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort);
    boxedPromise.then(
      (boxed) => {
        signal.removeEventListener("abort", onAbort);
        if (signal.aborted) {
          reject(abortError());
          return;
        }
        resolve(responseFromBoxed(boxed));
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      }
    );
  });
}

export function peekNeighborhoodFeedClientShortTtlMetrics(): Readonly<typeof clientMetrics> {
  return { ...clientMetrics };
}

export function resetNeighborhoodFeedClientShortTtlMetricsForTests(): void {
  clientMetrics.completed_ttl_hits = 0;
  clientMetrics.inflight_wait_hits = 0;
  clientMetrics.network_fetches = 0;
  clientMetrics.total = 0;
  completed.clear();
}

/**
 * `neighborhood-feed` GET 만 래핑한다. 그 외 URL은 그대로 `fetch` 위임.
 */
export async function fetchNeighborhoodFeedShortTtl(url: string, init?: RequestInit): Promise<Response> {
  if (!url.includes("/neighborhood-feed")) {
    clientMetrics.network_fetches += 1;
    return fetch(url, init);
  }

  const key = clientKey(url, init);
  const fk = `${flightPrefix}${key}`;
  const consumerSignal = init?.signal;
  const sharedInit = initWithoutConsumerSignal(init);
  clientMetrics.total += 1;

  if (consumerSignal?.aborted) {
    throw abortError();
  }

  for (const [k, v] of completed) {
    if (v.expiresAt <= performance.now()) completed.delete(k);
  }

  const hit = completed.get(key);
  if (hit && hit.expiresAt > performance.now()) {
    clientMetrics.completed_ttl_hits += 1;
    if (samarketFeedTraceLogEnabled()) {
      // eslint-disable-next-line no-console
      console.info("[philife-feed-short-ttl]", {
        philife_feed_short_ttl_hit: true,
        philife_feed_short_ttl_miss: false,
        philife_feed_reused_response: true,
        philife_feed_network_fetch: false,
        url,
      });
    }
    if (consumerSignal?.aborted) {
      throw abortError();
    }
    return responseFromBoxed(hit.boxed);
  }

  const hadInflight = getSingleFlightPromise<Boxed>(fk) != null;
  if (hadInflight) {
    clientMetrics.inflight_wait_hits += 1;
    if (samarketFeedTraceLogEnabled()) {
      // eslint-disable-next-line no-console
      console.info("[philife-feed-short-ttl]", {
        philife_feed_short_ttl_hit: true,
        philife_feed_short_ttl_miss: false,
        philife_feed_reused_response: true,
        philife_feed_network_fetch: false,
        url,
        waited_inflight: true,
      });
    }
  } else if (samarketFeedTraceLogEnabled()) {
    // eslint-disable-next-line no-console
    console.info("[philife-feed-short-ttl]", {
      philife_feed_short_ttl_hit: false,
      philife_feed_short_ttl_miss: true,
      philife_feed_reused_response: false,
      philife_feed_network_fetch: true,
      url,
    });
  }

  const boxedPromise = runSingleFlight(fk, async (): Promise<Boxed> => {
    const again = completed.get(key);
    if (again && again.expiresAt > performance.now()) {
      return again.boxed;
    }
    clientMetrics.network_fetches += 1;
    const res = await fetch(url, sharedInit);
    const bodyText = await res.text();
    const b: Boxed = {
      status: res.status,
      bodyText,
      headersSerialized: serializeResponseHeaders(res),
    };
    completed.set(key, { boxed: b, expiresAt: performance.now() + CLIENT_TTL_MS });
    return b;
  });

  return awaitBoxedForConsumer(boxedPromise, consumerSignal);
}

/** PTR·강제 새로고침 — 완료 TTL·진행 중 single-flight 제거(다음 fetch는 네트워크) */
export function invalidateNeighborhoodFeedClientShortTtl(): void {
  completed.clear();
  forgetSingleFlightsWhere((k) => typeof k === "string" && k.startsWith(flightPrefix));
}
