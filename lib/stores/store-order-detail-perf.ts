/**
 * GET buyer store order detail — read-only snapshot perf (no ensure/summary writes).
 * @see docs/store-order-detail-perf-lock.md
 */

export type StoreOrderDetailPerfLog = {
  auth_ms: number;
  order_fetch_ms: number;
  items_fetch_ms: number;
  review_meta_ms: number;
  delivery_snapshot_ms: number;
  ensure_room_ms: number;
  append_summary_ms: number;
  participant_upsert_ms: number;
  room_update_ms: number;
  unread_sync_ms: number;
  total_ms: number;
  payload_kb: number;
  room_id_exists: 0 | 1;
  ensure_skipped: 0 | 1;
  summary_skipped: 0 | 1;
  route?: "buyer_get" | "buyer_ensure_chat" | "owner_get" | "owner_ensure_chat";
  snapshot_via?: "rpc_snapshot" | "legacy_parallel";
  db_round_trips?: number;
  rpc_wall_ms?: number;
  ownership_ms?: number;
};

const WARN = {
  buyer_get_total_ms_local: 500,
  buyer_get_total_ms_warm_local: 150,
} as const;

export function perfNowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export function jsonPayloadKb(body: unknown): number {
  try {
    return Math.round((Buffer.byteLength(JSON.stringify(body), "utf8") / 1024) * 1000) / 1000;
  } catch {
    return 0;
  }
}

export function logStoreOrderDetailPerf(input: StoreOrderDetailPerfLog): void {
  if (process.env.NODE_ENV !== "development") return;
  // eslint-disable-next-line no-console -- dev read-path breakdown
  console.info("[store-order-detail-perf]", JSON.stringify(input));

  if (input.route === "buyer_get" || !input.route) {
    if (input.ensure_skipped !== 1 || input.ensure_room_ms > 0) {
      // eslint-disable-next-line no-console
      console.warn("[store-order-detail-perf-lock]", JSON.stringify({
        pass: false,
        code: "ensure_still_running_on_get",
        ensure_skipped: input.ensure_skipped,
        ensure_room_ms: input.ensure_room_ms,
      }));
    }
    if (input.total_ms > WARN.buyer_get_total_ms_local && input.ensure_skipped === 1) {
      // eslint-disable-next-line no-console
      console.warn("[store-order-detail-perf-lock]", JSON.stringify({
        pass: false,
        code: "get_slow_local_linked",
        total_ms: input.total_ms,
        threshold_ms: WARN.buyer_get_total_ms_local,
        hint: "check compile noise or payload_kb; ensure path should be skipped",
      }));
    }
  }
}
