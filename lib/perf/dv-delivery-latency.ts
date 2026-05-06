export const DV_DELIVERY_LATENCY_PREFIX = "[dv-delivery-latency]";

type DvNow = {
  /** `Date.now()` epoch ms */
  epochMs: number;
  /** `performance.now()` (browser) or null (server fallback) */
  perfMs: number | null;
};

export type DvDeliveryLatencyEvent = {
  name: string;
  epoch_ms: number;
  perf_ms: number | null;
  value_ms?: number;
  meta?: Record<string, unknown>;
};

function isEnabled(): boolean {
  // Client: NEXT_PUBLIC_*
  if (typeof window !== "undefined") {
    const v = (process.env.NEXT_PUBLIC_DV_DELIVERY_LATENCY ?? "").trim();
    return v === "1" || v.toLowerCase() === "true";
  }
  // Server: allow either NEXT_PUBLIC_* (build-time) or server-only var
  const v = (process.env.DV_DELIVERY_LATENCY ?? process.env.NEXT_PUBLIC_DV_DELIVERY_LATENCY ?? "").trim();
  return v === "1" || v.toLowerCase() === "true";
}

export function dvNow(): DvNow {
  const epochMs = Date.now();
  const perfMs =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : null;
  return { epochMs, perfMs };
}

function ensureClientBuffer(): DvDeliveryLatencyEvent[] | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  if (!Array.isArray(w.__dv_delivery_latency_events)) w.__dv_delivery_latency_events = [];
  return w.__dv_delivery_latency_events as DvDeliveryLatencyEvent[];
}

export function dvDeliveryLatencyLog(name: string, meta?: Record<string, unknown>) {
  if (!isEnabled()) return;
  const t = dvNow();
  const ev: DvDeliveryLatencyEvent = {
    name,
    epoch_ms: t.epochMs,
    perf_ms: t.perfMs,
    meta: meta && Object.keys(meta).length ? meta : undefined,
  };
  if (typeof window !== "undefined") {
    ensureClientBuffer()?.push(ev);
  }
  // eslint-disable-next-line no-console
  console.log(DV_DELIVERY_LATENCY_PREFIX, name, ev);
}

export function dvDeliveryLatencyValue(name: string, valueMs: number, meta?: Record<string, unknown>) {
  if (!isEnabled()) return;
  const t = dvNow();
  const safe = Number.isFinite(valueMs) ? Math.round(valueMs) : null;
  const ev: DvDeliveryLatencyEvent = {
    name,
    epoch_ms: t.epochMs,
    perf_ms: t.perfMs,
    value_ms: safe ?? undefined,
    meta: meta && Object.keys(meta).length ? meta : undefined,
  };
  if (typeof window !== "undefined") {
    ensureClientBuffer()?.push(ev);
  }
  // eslint-disable-next-line no-console
  console.log(DV_DELIVERY_LATENCY_PREFIX, name, safe, ev);
}

export function dvDeliveryLatencyMeasure(
  name: string,
  start: DvNow,
  end?: DvNow,
  meta?: Record<string, unknown>
) {
  if (!isEnabled()) return;
  const e = end ?? dvNow();
  const ms =
    start.perfMs != null && e.perfMs != null
      ? e.perfMs - start.perfMs
      : e.epochMs - start.epochMs;
  dvDeliveryLatencyValue(name, ms, meta);
}

export function dvDeliveryLatencyClassify(ms: number): "very_good" | "good" | "ok" | "danger" {
  if (ms < 500) return "very_good";
  if (ms < 900) return "good";
  if (ms < 1500) return "ok";
  return "danger";
}

export function dvDeliveryLatencyP95(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const idx = Math.min(v.length - 1, Math.max(0, Math.ceil(0.95 * v.length) - 1));
  return v[idx] ?? null;
}

export function dvDeliveryLatencyStats(values: number[]) {
  const v = values.filter((x) => Number.isFinite(x));
  if (!v.length) {
    return { count: 0, avg_ms: null as number | null, max_ms: null as number | null, p95_ms: null as number | null };
  }
  const sum = v.reduce((a, b) => a + b, 0);
  const avg = sum / v.length;
  const max = v.reduce((m, x) => (x > m ? x : m), -Infinity);
  const p95 = dvDeliveryLatencyP95(v);
  return {
    count: v.length,
    avg_ms: Math.round(avg),
    max_ms: Math.round(max),
    p95_ms: p95 == null ? null : Math.round(p95),
  };
}

export function dvDeliveryLatencyGetClientEvents(): DvDeliveryLatencyEvent[] {
  return ensureClientBuffer() ?? [];
}

export function dvDeliveryLatencySummarizeClientValues(namePrefix?: string) {
  const evs = dvDeliveryLatencyGetClientEvents();
  const values: Record<string, number[]> = {};
  for (const e of evs) {
    if (e.value_ms == null) continue;
    if (namePrefix && !e.name.startsWith(namePrefix)) continue;
    if (!values[e.name]) values[e.name] = [];
    values[e.name].push(e.value_ms);
  }
  const out = Object.fromEntries(
    Object.entries(values).map(([k, arr]) => {
      const s = dvDeliveryLatencyStats(arr);
      return [
        k,
        {
          ...s,
          grade: s.p95_ms == null ? null : dvDeliveryLatencyClassify(s.p95_ms),
        },
      ];
    })
  );
  if (typeof window !== "undefined") {
    (window as any).__dv_delivery_latency_summary = out;
  }
  return out;
}

// Convenience: expose summarizer in browser console
if (typeof window !== "undefined") {
  (window as any).dvDeliveryLatencySummarizeClientValues = dvDeliveryLatencySummarizeClientValues;
}

declare global {
  interface Window {
    __dv_delivery_latency_events?: DvDeliveryLatencyEvent[];
    __dv_delivery_latency_summary?: unknown;
    __dv_last_order_click?: DvNow;
    __dv_last_order_id?: string | null;
    dvDeliveryLatencySummarizeClientValues?: typeof dvDeliveryLatencySummarizeClientValues;
  }
}

