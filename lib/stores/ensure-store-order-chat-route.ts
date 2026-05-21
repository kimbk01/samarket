import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ensureStoreOrderMessengerRoom,
  type StoreOrderMessengerEnsureResult,
} from "@/lib/community-messenger/store-order-chat-service";
import { logStoreOrderDetailPerf, perfNowMs, type StoreOrderDetailPerfLog } from "@/lib/stores/store-order-detail-perf";

export type EnsureStoreOrderChatRouteResult =
  | { ok: true; roomId: string; order_chat_ready: true }
  | { ok: false; error: string; status: number };

/**
 * Mutation path — room ensure + summary idempotent write (not for read-only GET).
 */
export async function runEnsureStoreOrderChatForRoute(params: {
  sb: SupabaseClient<any>;
  orderId: string;
  userId: string;
  route: StoreOrderDetailPerfLog["route"];
}): Promise<EnsureStoreOrderChatRouteResult> {
  const t0 = perfNowMs();
  let result: StoreOrderMessengerEnsureResult;
  try {
    result = await ensureStoreOrderMessengerRoom(params.sb, {
      orderId: params.orderId,
      userId: params.userId,
    });
  } catch {
    return { ok: false, error: "ensure_exception", status: 500 };
  }
  const ensure_room_ms = Math.round(perfNowMs() - t0);

  logStoreOrderDetailPerf({
    route: params.route,
    auth_ms: 0,
    order_fetch_ms: 0,
    items_fetch_ms: 0,
    review_meta_ms: 0,
    delivery_snapshot_ms: 0,
    ensure_room_ms,
    append_summary_ms: 0,
    participant_upsert_ms: 0,
    room_update_ms: 0,
    unread_sync_ms: 0,
    total_ms: ensure_room_ms,
    payload_kb: 0,
    room_id_exists: result.ok ? 1 : 0,
    ensure_skipped: 0,
    summary_skipped: 0,
  });

  if (!result.ok) {
    const status = result.status === 403 ? 403 : result.status === 404 ? 404 : 400;
    return { ok: false, error: result.error, status };
  }
  return { ok: true, roomId: result.roomId, order_chat_ready: true };
}
