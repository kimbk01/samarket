/**
 * R2-D1 — owner orders realtime / reload / poll 계측.
 * dev/test 기본 on · production은 NEXT_PUBLIC_DIBAY_R2_D1_TRACE=1 · sessionStorage dibay:r2d1:trace=1
 */

const PREFIX = "[dibay-r2d1]";

export type R2D1TraceKind =
  | "realtime_event"
  | "row_patch"
  | "row_patch_insert"
  | "row_patch_update"
  | "row_patch_remove"
  | "full_reload"
  | "full_reload_blocked"
  | "poll_fetch"
  | "pageshow_fetch"
  | "delivery_reload"
  | "delivery_realtime_event"
  | "delivery_row_patch_insert"
  | "delivery_row_patch_update"
  | "delivery_row_patch_delete"
  | "delivery_row_patch_miss"
  | "delivery_full_reload_blocked"
  | "duplicate_fetch"
  | "duplicate_fetch_candidate"
  | "listener_attach"
  | "listener_detach";

export type R2D1TracePayload = {
  kind: R2D1TraceKind;
  timestamp: number;
  orderId?: string;
  deliveryId?: string;
  source: string;
  owner: string;
  fetchReason?: string;
  storeId?: string;
  eventType?: string;
  silent?: boolean;
  detail?: string;
  beforeCount?: number;
  afterCount?: number;
  beforeDeliveryStatus?: string;
  afterDeliveryStatus?: string;
};

function enabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem("dibay:r2d1:trace") === "1") return true;
  } catch {
    /* ignore */
  }
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.NEXT_PUBLIC_DIBAY_R2_D1_TRACE === "1";
}

const recentFetchKeys = new Map<string, number>();
const FETCH_DUP_WINDOW_MS = 2_500;

function isFetchKind(kind: R2D1TraceKind): boolean {
  return (
    kind === "poll_fetch" ||
    kind === "pageshow_fetch" ||
    kind === "full_reload" ||
    kind === "delivery_reload"
  );
}

export function r2d1OwnerOrdersTrace(payload: Omit<R2D1TracePayload, "timestamp">): void {
  if (!enabled()) return;
  const row: R2D1TracePayload = { ...payload, timestamp: Date.now() };
  console.info(PREFIX, row.kind, row);

  if (isFetchKind(row.kind)) {
    const key = `${row.owner}|${row.fetchReason ?? row.source}|${row.storeId ?? ""}`;
    const prev = recentFetchKeys.get(key);
    const now = row.timestamp;
    if (prev != null && now - prev < FETCH_DUP_WINDOW_MS) {
      console.info(PREFIX, "duplicate_fetch_candidate", {
        kind: "duplicate_fetch_candidate",
        timestamp: now,
        orderId: row.orderId,
        deliveryId: row.deliveryId,
        source: row.source,
        owner: row.owner,
        fetchReason: row.fetchReason,
        storeId: row.storeId,
        detail: `gap_ms=${now - prev}`,
      });
      console.info(PREFIX, "duplicate_fetch", {
        kind: "duplicate_fetch",
        timestamp: now,
        orderId: row.orderId,
        deliveryId: row.deliveryId,
        source: row.source,
        owner: row.owner,
        fetchReason: row.fetchReason,
        storeId: row.storeId,
        detail: `gap_ms=${now - prev}`,
      });
    }
    recentFetchKeys.set(key, now);
  }
}

/** Playwright 집계용 — window.__R2D1_OWNER_ORDERS__ */
export function r2d1OwnerOrdersTraceInstallCollector(): void {
  if (!enabled() || typeof window === "undefined") return;
  const w = window as Window & {
    __R2D1_OWNER_ORDERS__?: {
      counts: Record<string, number>;
      events: R2D1TracePayload[];
    };
  };
  if (w.__R2D1_OWNER_ORDERS__) return;
  const counts: Record<string, number> = {};
  const events: R2D1TracePayload[] = [];
  const orig = console.info.bind(console);
  console.info = (...args: unknown[]) => {
    if (args[0] === PREFIX && typeof args[1] === "string") {
      const kind = args[1];
      counts[kind] = (counts[kind] ?? 0) + 1;
      const row = args[2];
      if (row && typeof row === "object") events.push(row as R2D1TracePayload);
    }
    orig(...args);
  };
  w.__R2D1_OWNER_ORDERS__ = { counts, events };
}
