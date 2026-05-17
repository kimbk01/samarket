/**
 * R2-D1 KPI/meta stale measurement — TEMP trace only.
 * dev/test default on · production: NEXT_PUBLIC_DIBAY_R2_D1_TRACE=1 · sessionStorage dibay:r2d1:kpi=1
 */

const PREFIX = "[dibay-r2d1-kpi]";

export type R2D1KpiTraceKind =
  | "summary_counts_update"
  | "meta_counts_update"
  | "chip_render"
  | "tab_badge_render"
  | "poll_meta_refresh"
  | "orders_row_patch"
  | "stale_window_detected"
  | "kpi_derive_update"
  | "summary_render"
  | "stale_window_closed";

export type R2D1KpiTracePayload = {
  kind: R2D1KpiTraceKind;
  timestamp: number;
  orderId?: string;
  pendingSummary?: number;
  pendingMeta?: number;
  pendingMetaDerived?: number;
  preparingSummary?: number;
  pendingDeliveryMeta?: number;
  refundMeta?: number;
  source: string;
  renderDelayMs?: number;
  staleDurationMs?: number;
  detail?: string;
  fetchReason?: string;
};

function enabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem("dibay:r2d1:kpi") === "1") return true;
    if (sessionStorage.getItem("dibay:r2d1:trace") === "1") return true;
  } catch {
    /* ignore */
  }
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.NEXT_PUBLIC_DIBAY_R2_D1_TRACE === "1";
}

let lastSummaryAt = 0;
let lastMetaAt = 0;
let lastPendingSummary = -1;
let lastPendingMeta = -1;
let staleSince: number | null = null;

export function r2d1KpiMetaTrace(payload: Omit<R2D1KpiTracePayload, "timestamp">): void {
  if (!enabled()) return;
  const now = Date.now();
  const row: R2D1KpiTracePayload = { ...payload, timestamp: now };

  if (row.kind === "summary_counts_update") {
    lastSummaryAt = now;
    if (typeof row.pendingSummary === "number") lastPendingSummary = row.pendingSummary;
  }
  if (
    row.kind === "meta_counts_update" ||
    row.kind === "poll_meta_refresh" ||
    row.kind === "kpi_derive_update"
  ) {
    lastMetaAt = now;
    const metaN =
      typeof row.pendingMetaDerived === "number"
        ? row.pendingMetaDerived
        : row.pendingMeta;
    if (typeof metaN === "number") lastPendingMeta = metaN;
  }

  if (
    lastPendingSummary >= 0 &&
    lastPendingMeta >= 0 &&
    lastPendingSummary !== lastPendingMeta
  ) {
    if (staleSince == null) staleSince = now;
    const staleDurationMs = now - staleSince;
    const renderDelayMs =
      lastSummaryAt > 0 && lastMetaAt > 0
        ? Math.abs(lastSummaryAt - lastMetaAt)
        : undefined;
    console.info(PREFIX, "stale_window_detected", {
      kind: "stale_window_detected",
      timestamp: now,
      orderId: row.orderId,
      pendingSummary: lastPendingSummary,
      pendingMeta: lastPendingMeta,
      source: row.source,
      renderDelayMs,
      staleDurationMs,
      detail: row.detail ?? "summary_meta_mismatch",
    } satisfies R2D1KpiTracePayload);
  } else if (staleSince != null && row.kind === "stale_window_closed") {
    staleSince = null;
  } else if (staleSince == null) {
    /* aligned */
  } else {
    staleSince = null;
  }

  console.info(PREFIX, row.kind, row);
}

export function r2d1KpiMetaTraceInstallCollector(): void {
  if (!enabled() || typeof window === "undefined") return;
  const w = window as Window & {
    __R2D1_KPI_META__?: {
      counts: Record<string, number>;
      events: R2D1KpiTracePayload[];
      snapshots: Array<{
        at: number;
        pendingSummary: number;
        pendingMeta: number;
        chipAcceptVisible: boolean;
        chipDeliveryVisible: boolean;
      }>;
    };
  };
  if (w.__R2D1_KPI_META__) return;
  const counts: Record<string, number> = {};
  const events: R2D1KpiTracePayload[] = [];
  const snapshots: Array<{
    at: number;
    pendingSummary: number;
    pendingMeta: number;
    chipAcceptVisible: boolean;
    chipDeliveryVisible: boolean;
  }> = [];
  const orig = console.info.bind(console);
  console.info = (...args: unknown[]) => {
    if (args[0] === PREFIX && typeof args[1] === "string") {
      const kind = args[1];
      counts[kind] = (counts[kind] ?? 0) + 1;
      const row = args[2];
      if (row && typeof row === "object") events.push(row as R2D1KpiTracePayload);
    }
    orig(...args);
  };
  w.__R2D1_KPI_META__ = {
    counts,
    events,
    get snapshots() {
      return snapshots;
    },
    pushSnapshot(s: (typeof snapshots)[number]) {
      snapshots.push(s);
    },
  } as typeof w.__R2D1_KPI_META__;
}

export function r2d1KpiMetaResetStaleClock(): void {
  staleSince = null;
  lastPendingSummary = -1;
  lastPendingMeta = -1;
  lastSummaryAt = 0;
  lastMetaAt = 0;
}
